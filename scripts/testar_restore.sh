#!/usr/bin/env bash
# Nexus - Teste mensal de restauração do backup do PostgreSQL (rodar no ZimaOS).
#
# O que faz:
#   1. Acha o backup .dump mais recente (formato pg_dump custom, gerado pelo Nexus
#      em <Saves>/pg-backups/{hourly,daily,weekly,monthly}/natumhub_<faixa>_<data>.dump).
#   2. Sobe um Postgres 17 temporário e isolado (sem porta exposta) e restaura o backup
#      no banco natumhub_restore_teste.
#   3. Compara a contagem de linhas das tabelas principais com a produção
#      (só SELECT count(*), via docker exec no container de produção).
#   4. Derruba o container temporário no fim, mesmo em erro.
#
# Nunca escreve na produção nem na pasta de backups.
#
# Uso:
#   sudo bash scripts/testar_restore.sh [pasta_ou_arquivo_de_backup]
#   (padrão: /DATA/AppData/nexus/saves-prod/pg-backups, ou $NEXUS_BACKUP_DIR)
#
# Só para teste local, sem Docker (restaura e compara em um Postgres já rodando;
# o "banco de produção" passa a ser o banco $PROD_DB, padrão natumhub, no mesmo servidor):
#   PGPASSWORD=... [PG_USER=postgres] [PROD_DB=natumhub] \
#     bash scripts/testar_restore.sh --sem-docker HOST PORTA [pasta_ou_arquivo]
#
# Saída: 0 = restaurou e as contagens batem razoavelmente; 1 = restauração falhou
#        ou o backup não tem as tabelas principais; 2 = restaurou, mas ATENÇÃO
#        (diferença grande ou backup velho).

set -euo pipefail

CONTAINER_TESTE="nexus-restore-teste"
CONTAINER_PROD="${CONTAINER_PROD:-nexus-postgres-prod}"
PG_IMAGEM="postgres:17"
PG_USER="${PG_USER:-postgres}"
DB_PROD="${PROD_DB:-natumhub}"
DB_TESTE="natumhub_restore_teste"
PASTA_PADRAO="${NEXUS_BACKUP_DIR:-/DATA/AppData/nexus/saves-prod/pg-backups}"
IDADE_MAX_HORAS=26          # backup mais velho que isso => ATENÇÃO
LIMITE_PCT=10               # diferença relativa que dispara ATENÇÃO...
LIMITE_ABS=20               # ...se também for maior que este número de linhas

# Tabelas principais (nomes conferidos em Backend/supabase/*.sql). Tabela que não
# existir nos dois lados é ignorada (módulos descontinuados).
TABELAS=(
  items products produtos stock_snapshots stock_movements invoices formulations
  lotes_baixas sales_orders sales_order_items purchase_orders purchase_order_items
  producao_planejamento_semanal producao_auditoria hub_operators hub_audit_events
  hub_sessions suppliers estoque_atual
)

MODO="docker"
HOST_SD=""; PORTA_SD=""
if [ "${1:-}" = "--sem-docker" ]; then
  [ $# -ge 3 ] || { echo "Uso: $0 --sem-docker HOST PORTA [pasta_ou_arquivo]"; exit 1; }
  MODO="sem-docker"; HOST_SD="$2"; PORTA_SD="$3"; shift 3
fi
ALVO="${1:-$PASTA_PADRAO}"

SENHA_TESTE="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"
[ -n "$SENHA_TESTE" ] || SENHA_TESTE="t$(date +%s%N)"

LOG_RESTORE="$(mktemp)"
iniciou_container=0

limpar() {
  if [ "$MODO" = "docker" ] && [ "$iniciou_container" = 1 ]; then
    docker rm -f "$CONTAINER_TESTE" >/dev/null 2>&1 || true
  fi
  if [ "$MODO" = "sem-docker" ]; then
    PGPASSWORD="${PGPASSWORD:-}" psql -h "$HOST_SD" -p "$PORTA_SD" -U "$PG_USER" -d postgres \
      -qc "DROP DATABASE IF EXISTS $DB_TESTE" >/dev/null 2>&1 || true
  fi
  rm -f "$LOG_RESTORE"
}
trap limpar EXIT

# ---- execução de SQL no banco de teste / produção (somente leitura na produção) ----
sql_teste() {  # $1 = SQL ; devolve texto sem cabeçalho
  if [ "$MODO" = "docker" ]; then
    docker exec -e PGPASSWORD="$SENHA_TESTE" "$CONTAINER_TESTE" \
      psql -U "$PG_USER" -d "$DB_TESTE" -tAq -c "$1"
  else
    PGPASSWORD="${PGPASSWORD:-}" psql -h "$HOST_SD" -p "$PORTA_SD" -U "$PG_USER" -d "$DB_TESTE" -tAq -c "$1"
  fi
}
sql_prod() {
  if [ "$MODO" = "docker" ]; then
    docker exec "$CONTAINER_PROD" psql -U "$PG_USER" -d "$DB_PROD" -tAq \
      -c "SET default_transaction_read_only = on; $1" | grep -v '^SET$' || true
  else
    PGPASSWORD="${PGPASSWORD:-}" psql -h "$HOST_SD" -p "$PORTA_SD" -U "$PG_USER" -d "$DB_PROD" -tAq \
      -c "SET default_transaction_read_only = on; $1" | grep -v '^SET$' || true
  fi
}

# Conta linhas de uma tabela; "-" se a tabela não existe.
contar() {  # $1 = função (sql_teste|sql_prod) ; $2 = tabela
  "$1" "SELECT CASE WHEN to_regclass('public.$2') IS NULL THEN '-' ELSE
        (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.$2', false, true, '')))[1]::text END"
}

falha() { echo; echo "FALHA: $*"; exit 1; }

echo "============================================================"
echo "  Nexus - Teste de restauração do backup do PostgreSQL"
echo "============================================================"

# ---- 1. achar o backup ----
if [ -f "$ALVO" ]; then
  BACKUP="$ALVO"
elif [ -d "$ALVO" ]; then
  BACKUP="$(find "$ALVO" -type f -name '*.dump' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)"
  [ -n "$BACKUP" ] || falha "nenhum arquivo .dump encontrado em '$ALVO'."
else
  falha "'$ALVO' não existe (passe a pasta ou o arquivo de backup como argumento)."
fi

TAM="$(du -h "$BACKUP" | cut -f1)"
IDADE_S=$(( $(date +%s) - $(stat -c %Y "$BACKUP") ))
IDADE_H=$(( IDADE_S / 3600 ))
echo "Backup:  $BACKUP"
echo "Tamanho: $TAM   Idade: ${IDADE_H}h  (gerado em $(date -d "@$(stat -c %Y "$BACKUP")" '+%d/%m/%Y %H:%M'))"

# ---- 2. subir Postgres temporário e restaurar ----
if [ "$MODO" = "docker" ]; then
  command -v docker >/dev/null || falha "docker não encontrado (rode com sudo no ZimaOS)."
  docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_PROD}$" \
    || falha "container de produção '$CONTAINER_PROD' não está em execução."
  docker rm -f "$CONTAINER_TESTE" >/dev/null 2>&1 || true

  echo; echo "[1/3] Subindo $PG_IMAGEM temporário ($CONTAINER_TESTE, sem porta exposta)..."
  docker run --rm -d --name "$CONTAINER_TESTE" -e POSTGRES_PASSWORD="$SENHA_TESTE" "$PG_IMAGEM" >/dev/null \
    || falha "não consegui subir o container temporário."
  iniciou_container=1

  for i in $(seq 1 60); do
    if docker exec "$CONTAINER_TESTE" pg_isready -U "$PG_USER" >/dev/null 2>&1 \
       && docker exec -e PGPASSWORD="$SENHA_TESTE" "$CONTAINER_TESTE" psql -U "$PG_USER" -d postgres -tAqc 'select 1' >/dev/null 2>&1; then
      break
    fi
    sleep 1
    [ "$i" = 60 ] && falha "o Postgres temporário não ficou pronto em 60s."
  done
  # a imagem reinicia o servidor uma vez durante o initdb; confirma que segue de pé
  sleep 2
  docker exec -e PGPASSWORD="$SENHA_TESTE" "$CONTAINER_TESTE" psql -U "$PG_USER" -d postgres -tAqc 'select 1' >/dev/null \
    || falha "o Postgres temporário caiu durante a inicialização."

  echo "[2/3] Restaurando o backup no banco $DB_TESTE..."
  docker exec -e PGPASSWORD="$SENHA_TESTE" "$CONTAINER_TESTE" psql -U "$PG_USER" -d postgres -qc "CREATE DATABASE $DB_TESTE" \
    || falha "não consegui criar o banco $DB_TESTE."
  docker cp "$BACKUP" "$CONTAINER_TESTE:/tmp/restore.dump" >/dev/null \
    || falha "não consegui copiar o backup para o container temporário."
  docker exec -e PGPASSWORD="$SENHA_TESTE" "$CONTAINER_TESTE" \
    pg_restore -U "$PG_USER" -d "$DB_TESTE" --no-owner --no-acl /tmp/restore.dump >"$LOG_RESTORE" 2>&1 \
    && RESTORE_RC=0 || RESTORE_RC=$?
else
  echo; echo "[1/3] Modo --sem-docker: usando $HOST_SD:$PORTA_SD (produção simulada = banco $DB_PROD)."
  PGPASSWORD="${PGPASSWORD:-}" psql -h "$HOST_SD" -p "$PORTA_SD" -U "$PG_USER" -d postgres \
    -qc "DROP DATABASE IF EXISTS $DB_TESTE" -c "CREATE DATABASE $DB_TESTE" \
    || falha "não consegui criar o banco $DB_TESTE."
  echo "[2/3] Restaurando o backup no banco $DB_TESTE..."
  PGPASSWORD="${PGPASSWORD:-}" pg_restore -h "$HOST_SD" -p "$PORTA_SD" -U "$PG_USER" -d "$DB_TESTE" \
    --no-owner --no-acl "$BACKUP" >"$LOG_RESTORE" 2>&1 && RESTORE_RC=0 || RESTORE_RC=$?
fi

N_TABELAS="$(sql_teste "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'" || echo 0)"
if [ "$RESTORE_RC" != 0 ]; then
  echo "  aviso: pg_restore terminou com código $RESTORE_RC (avisos são comuns; últimas linhas abaixo)."
  tail -n 8 "$LOG_RESTORE" | sed 's/^/    /'
fi
[ "${N_TABELAS:-0}" -gt 0 ] || { tail -n 20 "$LOG_RESTORE"; falha "a restauração não criou nenhuma tabela."; }
echo "  restaurou $N_TABELAS tabelas."

# ---- 3. comparar contagens ----
echo; echo "[3/3] Comparando contagem de linhas (produção x backup)..."
echo
printf '%-34s %12s %12s %12s\n' "tabela" "produção" "backup" "diferença"
printf '%-34s %12s %12s %12s\n' "----------------------------------" "------------" "------------" "------------"

ATENCAO=0; FALTANDO=0; COMPARADAS=0
for t in "${TABELAS[@]}"; do
  p="$(contar sql_prod "$t")"; b="$(contar sql_teste "$t")"
  if [ "$p" = "-" ] && [ "$b" = "-" ]; then continue; fi
  COMPARADAS=$((COMPARADAS + 1))
  if [ "$p" = "-" ]; then
    printf '%-34s %12s %12s %12s\n' "$t" "(não existe)" "$b" "só no backup"; continue
  fi
  if [ "$b" = "-" ]; then
    printf '%-34s %12s %12s %12s  <<< ausente no backup\n' "$t" "$p" "(ausente)" "-"
    FALTANDO=$((FALTANDO + 1)); continue
  fi
  d=$((p - b)); ad=${d#-}
  marca=""
  if [ "$ad" -gt "$LIMITE_ABS" ] && [ $((ad * 100)) -gt $((LIMITE_PCT * (p > 0 ? p : 1))) ]; then
    marca="  <<< diferença grande"; ATENCAO=1
  fi
  printf '%-34s %12s %12s %+12d%s\n' "$t" "$p" "$b" "$d" "$marca"
done

echo
[ "$IDADE_H" -gt "$IDADE_MAX_HORAS" ] && { echo "Backup com ${IDADE_H}h de idade (limite ${IDADE_MAX_HORAS}h)."; ATENCAO=1; }
[ "$COMPARADAS" -gt 0 ] || falha "nenhuma das tabelas principais foi encontrada para comparar."

if [ "$FALTANDO" -gt 0 ]; then
  echo "RESULTADO: FALHA - $FALTANDO tabela(s) da produção ausente(s) no backup (backup incompleto)."
  exit 1
elif [ "$ATENCAO" = 1 ]; then
  echo "RESULTADO: ATENÇÃO - restaurou, mas há diferença grande ou o backup está velho."
  echo "           Veja o procedimento no ai-memory (teste de restauração do backup)."
  exit 2
else
  echo "RESULTADO: OK - o backup restaura e as contagens batem (diferenças pequenas são normais pelo tempo desde o backup)."
  exit 0
fi

#!/usr/bin/env bash
# Mescla no Nexus do ZimaOS os dados digitados no PC Qualidade (ver scripts/mesclar_pc_qualidade.sql).
#
# Uso, no ZimaOS:
#   scripts/mesclar_pc_qualidade.sh /caminho/natumhub_daily_AAAAMMDD_HHMMSS.dump              # prévia: mostra o que entra, não grava
#   scripts/mesclar_pc_qualidade.sh /caminho/natumhub_daily_AAAAMMDD_HHMMSS.dump --confirmar  # faz backup e grava
#
# Nada é apagado. O dump do PC é restaurado num banco à parte (natumhub_pcq_<data>) e só as tabelas da mesclagem são copiadas
# para um esquema à parte dentro do natumhub (mescla_pcq_<data>). No fim o script mostra como remover essas cópias, se quiser.
#
# Para testar fora do ZimaOS: PG_EXEC="" PGHOST=127.0.0.1 PGPORT=5433 DB=natumhub_prod_copia scripts/mesclar_pc_qualidade.sh dump
set -euo pipefail

DUMP="${1:-}"
CONFIRMAR=0
[ "${2:-}" = "--confirmar" ] && CONFIRMAR=1
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
    echo "Informe o arquivo .dump do PC Qualidade. Ex.: $0 /DATA/natumhub_daily_20261103_111618.dump [--confirmar]"
    exit 1
fi

PG_EXEC="${PG_EXEC-sudo docker exec -i nexus-postgres-prod}"
PGUSER="${PGUSER:-postgres}"
DB="${DB:-natumhub}"
BACKUP_DIR="${BACKUP_DIR:-/DATA/AppData/nexus/backups-mesclagem}"
CARIMBO="$(date +%Y%m%d_%H%M%S)"
STAGING="natumhub_pcq_${CARIMBO}"
ESQ="mescla_pcq_${CARIMBO}"
SQL="$(dirname "$0")/mesclar_pc_qualidade.sql"

TABELAS=(
    lote_custom_status lote_status_history producao_planejamento_semanal programacao_envase programacao_rotulagem
    kit_assembly_orders fisco_quimica_analyses recebimento_mp_laudos qualidade_devolucoes qualidade_devolucao_itens
    qualidade_devolucao_controles qualidade_devolucao_controle_itens reports purchase_request_batches purchase_request_items
    similar_items item_similar_links manual_stock_orders manual_stock_order_items terceirizados_solicitacoes
    hub_notifications hub_notification_reads hub_audit_events hub_audit_log
)

pg() { $PG_EXEC "$@"; }
psql_db() { local db="$1"; shift; pg psql -U "$PGUSER" -d "$db" -v ON_ERROR_STOP=1 -q "$@"; }

echo "1/4 Restaurando o dump do PC em $STAGING (banco à parte)..."
pg createdb -U "$PGUSER" "$STAGING"
# Avisos de "transaction_timeout" são esperados quando o servidor é o 16; o resto tem que passar.
pg pg_restore -U "$PGUSER" -d "$STAGING" --no-owner --no-acl < "$DUMP" 2> >(grep -v transaction_timeout >&2) || true
psql_db "$STAGING" -c "ALTER SCHEMA public RENAME TO $ESQ; CREATE SCHEMA public;"

echo "2/4 Copiando as tabelas da mesclagem para o esquema $ESQ do $DB..."
psql_db "$DB" -c "CREATE SCHEMA $ESQ;"
ARGS=()
for t in "${TABELAS[@]}"; do
    if [ "$(psql_db "$STAGING" -At -c "SELECT to_regclass('$ESQ.$t') IS NOT NULL")" = "t" ]; then
        ARGS+=(-t "$ESQ.$t")
    fi
done
# Só a estrutura e os dados (sem chaves estrangeiras nem índices: as tabelas citadas por elas não vêm junto).
pg pg_dump -U "$PGUSER" -d "$STAGING" --no-owner --no-acl --section=pre-data --section=data "${ARGS[@]}" | grep -v '^SET transaction_timeout' | psql_db "$DB" >/dev/null

if [ "$CONFIRMAR" = "1" ]; then
    echo "3/4 Backup do $DB antes de gravar..."
    mkdir -p "$BACKUP_DIR"
    pg pg_dump -U "$PGUSER" -d "$DB" -Fc > "$BACKUP_DIR/${DB}_antes_mesclagem_${CARIMBO}.dump"
    echo "    $BACKUP_DIR/${DB}_antes_mesclagem_${CARIMBO}.dump"
else
    echo "3/4 Prévia: sem backup (nada será gravado)."
fi

echo "4/4 Mesclando..."
psql_db "$DB" -v esq="$ESQ" -v confirmar="$CONFIRMAR" < "$SQL"

echo
echo "Cópias de trabalho (podem ser removidas quando quiser):"
echo "  banco $STAGING   e   esquema $ESQ dentro do $DB"

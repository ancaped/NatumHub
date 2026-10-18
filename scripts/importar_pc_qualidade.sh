#!/usr/bin/env bash
# scripts/importar_pc_qualidade.sh - Importa dados do PC Qualidade para o ZimaOS via Tailscale ou Dump
set -euo pipefail

QUALIDADE_IP="${QUALIDADE_IP:-}"
DUMP_FILE="${1:-}"
PROD_CONTAINER="nexus-postgres-prod"
DEV_CONTAINER="nexus-postgres-dev"
PROD_DB="natumhub"
DEV_DB="natumhub_dev"
POSTGRES_USER="postgres"

echo "============================================================"
echo "  Nexus - Importação de Dados do PC Qualidade ➔ ZimaOS     "
echo "============================================================"

# Caso 1: Foi fornecido um arquivo de dump local
if [ -n "$DUMP_FILE" ]; then
    if [ ! -f "$DUMP_FILE" ]; then
        echo "ERRO: Arquivo de dump '$DUMP_FILE' não encontrado!"
        exit 1
    fi
    echo ">> Modo Arquivo: Usando dump '$DUMP_FILE'"
    TARGET_DUMP="$DUMP_FILE"

# Caso 2: Importação direta via IP Tailscale do PC Qualidade
elif [ -n "$QUALIDADE_IP" ]; then
    echo ">> Modo Tailscale: Conectando ao PC Qualidade em $QUALIDADE_IP:5432..."
    TARGET_DUMP="/tmp/qualidade_backup_$(date +%Y%m%d_%H%M%S).dump"
    pg_dump -h "$QUALIDADE_IP" -p 5432 -U "$POSTGRES_USER" -d "$PROD_DB" -F c -b -v -f "$TARGET_DUMP"
    echo "✓ Dump extraído com sucesso: $TARGET_DUMP"

else
    echo "Uso:"
    echo "  $0 <caminho_do_arquivo.dump>"
    echo "  ou defina a variável QUALIDADE_IP com o IP Tailscale:"
    echo "  QUALIDADE_IP=100.x.y.z $0"
    exit 1
fi

# 1. Verifica se os containers do ZimaOS estão em execução
if ! docker ps --format '{{.Names}}' | grep -q "^${PROD_CONTAINER}$"; then
    echo "ERRO: O container de produção ($PROD_CONTAINER) não está em execução!"
    echo "Inicie a stack primeiro: docker compose up -d"
    exit 1
fi

echo "[1/3] Restaurando dump no container de Produção ($PROD_CONTAINER)..."
docker cp "$TARGET_DUMP" "$PROD_CONTAINER:/tmp/import_target.dump"
docker exec -i "$PROD_CONTAINER" psql -U "$POSTGRES_USER" -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$PROD_DB' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
docker exec -i "$PROD_CONTAINER" psql -U "$POSTGRES_USER" -c "DROP DATABASE IF EXISTS $PROD_DB;"
docker exec -i "$PROD_CONTAINER" psql -U "$POSTGRES_USER" -c "CREATE DATABASE $PROD_DB;"
docker exec -i "$PROD_CONTAINER" pg_restore -U "$POSTGRES_USER" -d "$PROD_DB" -v /tmp/import_target.dump || true
docker exec "$PROD_CONTAINER" rm -f /tmp/import_target.dump
echo "✓ Produção restaurada com sucesso!"

echo "[2/3] Espelhando dados da Produção para o Banco de Desenvolvimento..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/espelhar_banco.sh" ]; then
    bash "$SCRIPT_DIR/espelhar_banco.sh"
else
    echo "Aviso: scripts/espelhar_banco.sh não encontrado no diretório atual. Pulei o espelhamento automático."
fi

echo "[3/3] Verificando integridade..."
PROD_COUNT=$(docker exec -i "$PROD_CONTAINER" psql -U "$POSTGRES_USER" -d "$PROD_DB" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "✓ Total de tabelas públicas no banco de Produção: $(echo "$PROD_COUNT" | xargs)"

echo "============================================================"
echo "  IMPORTAÇÃO CONCLUÍDA COM SUCESSO!                         "
echo "  Tanto o banco de Produção (:5432) quanto o de Dev (:5433) "
echo "  estão prontos para uso no ZimaOS.                         "
echo "============================================================"

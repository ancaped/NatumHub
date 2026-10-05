#!/usr/bin/env bash
# scripts/espelhar_banco.sh - Clona o banco de Produção para o de Desenvolvimento no CasaOS
set -euo pipefail

PROD_CONTAINER="nexus-postgres-prod"
DEV_CONTAINER="nexus-postgres-dev"
PROD_DB="natumhub"
DEV_DB="natumhub_dev"
POSTGRES_USER="postgres"

echo "============================================================"
echo "  Nexus - Sincronização do Banco de Desenvolvimento (Dev)   "
echo "============================================================"
echo "Origem:  Container $PROD_CONTAINER (Banco: $PROD_DB)"
echo "Destino: Container $DEV_CONTAINER (Banco: $DEV_DB)"
echo "------------------------------------------------------------"

# 1. Verifica se os containers estão rodando
if ! docker ps --format '{{.Names}}' | grep -q "^${PROD_CONTAINER}$"; then
    echo "ERRO: O container de produção ($PROD_CONTAINER) não está em execução!"
    exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${DEV_CONTAINER}$"; then
    echo "ERRO: O container de desenvolvimento ($DEV_CONTAINER) não está em execução!"
    exit 1
fi

echo "[1/3] Finalizando conexões ativas no banco de Dev..."
docker exec -i "$DEV_CONTAINER" psql -U "$POSTGRES_USER" -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DEV_DB' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true

echo "[2/3] Recriando banco limpo no container de Dev..."
docker exec -i "$DEV_CONTAINER" psql -U "$POSTGRES_USER" -c "DROP DATABASE IF EXISTS $DEV_DB;"
docker exec -i "$DEV_CONTAINER" psql -U "$POSTGRES_USER" -c "CREATE DATABASE $DEV_DB;"

echo "[3/3] Copiando estrutura e dados da Produção para o Dev em tempo real..."
docker exec -i "$PROD_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$PROD_DB" -F c | \
  docker exec -i "$DEV_CONTAINER" pg_restore -U "$POSTGRES_USER" -d "$DEV_DB" --clean --if-exists -v || true

echo "------------------------------------------------------------"
echo " SUCESSO: Banco de Desenvolvimento ($DEV_DB) sincronizado!"
echo " Agora o ambiente de testes possui os mesmos dados da Produção."
echo "============================================================"

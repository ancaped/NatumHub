#!/usr/bin/env bash
# Nexus Industrial Hub - Script de Restauração de Banco no Linux / CasaOS
#
# Uso:
#   ./scripts/restore_postgres.sh [arquivo.dump]
#   ou se o PostgreSQL estiver rodando via container Docker (nexus-postgres):
#   docker cp backup.dump nexus-postgres:/tmp/
#   docker exec -it nexus-postgres pg_restore -U postgres -d natumhub -v /tmp/backup.dump

set -e

DUMP_FILE="${1}"
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-postgres}"
PG_DB="${PG_DB:-natumhub}"

if [ -z "$DUMP_FILE" ]; then
    echo "Uso: $0 <caminho_do_arquivo.dump>"
    exit 1
fi

if [ ! -f "$DUMP_FILE" ]; then
    echo "Erro: Arquivo '$DUMP_FILE' não encontrado."
    exit 1
fi

echo "========================================================"
echo "    NEXUS - RESTAURANDO POSTGRESQL (LINUX / CASAOS)"
echo "========================================================"
echo "Destino: $PG_HOST:$PG_PORT / Banco: $PG_DB"
echo "Arquivo: $DUMP_FILE"
echo ""

# Se estiver usando container Docker nexus-postgres local
if docker ps --format '{{.Names}}' | grep -q "^nexus-postgres$"; then
    echo ">> Detectado container Docker 'nexus-postgres' em execução."
    echo ">> Copiando dump para o container..."
    docker cp "$DUMP_FILE" nexus-postgres:/tmp/restore_target.dump
    echo ">> Executando pg_restore dentro do container..."
    docker exec -it nexus-postgres pg_restore -U "$PG_USER" -d "$PG_DB" -v /tmp/restore_target.dump || true
    docker exec nexus-postgres rm -f /tmp/restore_target.dump
    echo ">> Concluído via Docker!"
else
    echo ">> Executando pg_restore direto via cliente local..."
    pg_restore -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -v "$DUMP_FILE" || true
    echo ">> Concluído!"
fi

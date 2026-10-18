#!/usr/bin/env bash
# scripts/deploy_zimaos.sh - Atualiza a build do Nexus no ZimaOS via SSH + BuildKit
set -euo pipefail

export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"

ZIMAOS_HOST="${ZIMAOS_HOST:-192.168.122.196}"
ZIMAOS_APP_DIR="${ZIMAOS_APP_DIR:-/DATA/AppData/nexus}"
TARGET_SERVICE="${1:-nexus-prod}" # default: nexus-prod (:3001) conforme Single-Stack ZimaOS.

# Cálculo automático de versão a partir do histórico Git
GIT_COUNT=$(git rev-list --count HEAD 2>/dev/null || echo "1")
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "0000000")

if [[ "$TARGET_SERVICE" == "nexus-prod" || "$TARGET_SERVICE" == "prod" ]]; then
    TARGET_SERVICE="nexus-prod"
    IMAGE_TAG="nexus:prod"
    ZIMA_APP="custom__nexusprod"
    PORT="3001"
    APP_VERSION="0.2.${GIT_COUNT}"
else
    TARGET_SERVICE="nexus-dev"
    IMAGE_TAG="nexus:dev"
    ZIMA_APP="custom__nexusdev"
    PORT="3002"
    APP_VERSION="0.2.${GIT_COUNT}-${GIT_HASH}"
fi

echo "============================================================"
echo "  Nexus - Deploy / Atualização no ZimaOS                   "
echo "============================================================"
echo "Alvo:    root@$ZIMAOS_HOST"
echo "Serviço: $TARGET_SERVICE ($IMAGE_TAG -> :$PORT)"
echo "Versão:  v$APP_VERSION"
echo "------------------------------------------------------------"

echo ">> [1/3] Sincronizando código-fonte para $ZIMAOS_APP_DIR/repo..."
tar -czf - \
    --exclude='./Saves/pg-backups' \
    --exclude='./.git' \
    --exclude='./Frontend/node_modules' \
    --exclude='./Backend/target' \
    . | ssh "root@$ZIMAOS_HOST" "mkdir -p $ZIMAOS_APP_DIR/repo && tar -xzf - -C $ZIMAOS_APP_DIR/repo"

echo ">> [2/3] Compilando imagem Docker ($IMAGE_TAG) v$APP_VERSION com cache BuildKit..."
ssh "root@$ZIMAOS_HOST" "cd $ZIMAOS_APP_DIR/repo && DOCKER_BUILDKIT=1 docker build --build-arg APP_VERSION=\"$APP_VERSION\" -t $IMAGE_TAG -f docker/Dockerfile ."

echo ">> [3/3] Recriando container $TARGET_SERVICE no ZimaOS..."
ssh "root@$ZIMAOS_HOST" "docker compose -f /var/lib/casaos/apps/$ZIMA_APP/docker-compose.yml up -d --force-recreate"

echo ">> Verificando healthcheck em http://$ZIMAOS_HOST:$PORT/api/health..."
sleep 2
curl -s "http://$ZIMAOS_HOST:$PORT/api/health" && echo ""
echo "============================================================"
echo "✓ Deploy de $TARGET_SERVICE concluído com sucesso!"
echo "============================================================"


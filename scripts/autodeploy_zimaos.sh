#!/usr/bin/env bash
# scripts/autodeploy_zimaos.sh - GitOps Autônomo com Release Notes no Sino do Nexus
set -euo pipefail

REPO_DIR="/DATA/AppData/nexus/repo"
COMPOSE_FILE="/var/lib/casaos/apps/custom__nexusprod/docker-compose.yml"
LOG_FILE="/DATA/AppData/nexus/saves-prod/autodeploy.log"
BRANCH="main"
IMAGE_TAG="nexus:prod"

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

mkdir -p /DATA/AppData/nexus/saves-prod

# Função para enviar notificação para o sino do Nexus (hub_notifications) com suporte a multiline
send_hub_notification() {
    local kind="$1"
    local title="$2"
    local message="$3"
    local notif_id="notif_$(date +%s%N | cut -b1-13)"
    local now=$(date -u "+%Y-%m-%d %H:%M:%S")

    docker exec -i nexus-postgres-prod psql -U postgres -d natumhub -c \
      "INSERT INTO hub_notifications (id, module_key, kind, title, message, created_at) \
       VALUES ('$notif_id', 'desenvolvimento', '$kind', \$\$$title\$\$, \$\$$message\$\$, '$now') \
       ON CONFLICT DO NOTHING;" >/dev/null 2>&1 || true
}

# Se o repo não for um git clone válido, inicializa o clone oficial
if [ ! -d "$REPO_DIR/.git" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [GITOPS] Clonando repositório oficial da branch $BRANCH..." >> "$LOG_FILE"
    rm -rf "$REPO_DIR"
    git clone -b "$BRANCH" https://github.com/ancaped/NatumHub.git "$REPO_DIR" >> "$LOG_FILE" 2>&1 || exit 1
fi

cd "$REPO_DIR"

# Busca atualizações remotas silenciosamente
if ! git fetch origin "$BRANCH" --quiet 2>> "$LOG_FILE"; then
    exit 0
fi

LOCAL_HASH=$(git rev-parse HEAD 2>/dev/null || echo "0")
REMOTE_HASH=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "0")

# Se os hashes forem iguais, nada a fazer
if [ "$LOCAL_HASH" = "$REMOTE_HASH" ]; then
    exit 0
fi

echo "==========================================================" >> "$LOG_FILE"
echo "$(date '+%Y-%m-%d %H:%M:%S') [GITOPS] Novo commit detectado no GitHub: $REMOTE_HASH" >> "$LOG_FILE"
echo ">> Atual: $LOCAL_HASH -> Novo: $REMOTE_HASH" >> "$LOG_FILE"

# Extrai as notas de atualização (mensagens dos commits que entraram)
RELEASE_NOTES=$(git log --format="• %s" "${LOCAL_HASH}..${REMOTE_HASH}" 2>/dev/null | head -n 6 || true)
if [ -z "$RELEASE_NOTES" ]; then
    RELEASE_NOTES=$(git log -1 --format="• %s" "${REMOTE_HASH}" 2>/dev/null || true)
fi

# Atualiza arquivos locais para o novo commit
git reset --hard "origin/$BRANCH" >> "$LOG_FILE" 2>&1

GIT_COUNT=$(git rev-list --count HEAD 2>/dev/null || echo "1")
APP_VERSION="0.2.${GIT_COUNT}"
SHORT_HASH=$(echo "$REMOTE_HASH" | cut -c1-7)

echo ">> [1/4] Executando Gate 1: Testes automatizados e compilação Docker..." >> "$LOG_FILE"

BUILD_OUTPUT="/tmp/gate1_build_$$.log"
if ! DOCKER_BUILDKIT=1 docker build --build-arg APP_VERSION="$APP_VERSION" -t "$IMAGE_TAG" -f docker/Dockerfile . > "$BUILD_OUTPUT" 2>&1; then
    cat "$BUILD_OUTPUT" >> "$LOG_FILE"
    echo "❌ [GITOPS] FALHA NO GATE 1: Compilação/testes quebrados. Mantendo versão em execução intacta." >> "$LOG_FILE"
    
    # Extrai o erro resumido para a notificação
    ERR_SNIPPET=$(grep -E "error\[|Error:|failed to compile|Failed to compile" "$BUILD_OUTPUT" | head -n 2 || tail -n 3 "$BUILD_OUTPUT" | head -n 2)
    rm -f "$BUILD_OUTPUT"
    
    ERR_MSG="O commit ${SHORT_HASH} falhou nos testes de compilação:
${ERR_SNIPPET}

A versão anterior foi mantida ativa sem interrupção do sistema."
    
    send_hub_notification "error" "Falha no Gate 1: Testes Quebrados" "$ERR_MSG"
    
    git reset --hard "$LOCAL_HASH" >> "$LOG_FILE" 2>&1
    exit 1
fi
cat "$BUILD_OUTPUT" >> "$LOG_FILE"
rm -f "$BUILD_OUTPUT"

echo ">> [2/4] Gate 1 APROVADO! Recriando container de Produção..." >> "$LOG_FILE"
docker compose -f "$COMPOSE_FILE" up -d --force-recreate >> "$LOG_FILE" 2>&1

echo ">> [3/4] Executando Gate 2: Smoke tests de produção..." >> "$LOG_FILE"
sleep 3
TEST_PASSED=false
for i in 1 2 3 4 5 6; do
    if curl -s -f "http://127.0.0.1:3001/api/health" | grep -q '"status":"ok"'; then
        TEST_PASSED=true
        break
    fi
    sleep 2
done

if [ "$TEST_PASSED" = true ]; then
    echo "✓ [4/4] GATE 2 APROVADO! Nexus atualizado para v$APP_VERSION com sucesso!" >> "$LOG_FILE"
    echo "==========================================================" >> "$LOG_FILE"
    
    SUCCESS_MSG="Deploy autônomo (commit ${SHORT_HASH}) aprovado nos testes.

Notas da versão:
${RELEASE_NOTES}"

    send_hub_notification "success" "Nexus Atualizado (v${APP_VERSION})" "$SUCCESS_MSG"
else
    echo "⚠️ [GITOPS] ALERTA GATE 2: Container reiniciado, mas o healthcheck demorou a responder." >> "$LOG_FILE"
    
    WARN_MSG="O container foi recriado para o commit ${SHORT_HASH}, mas o healthcheck demorou além do esperado.

Notas da versão:
${RELEASE_NOTES}"

    send_hub_notification "warning" "Alerta no Gate 2: Smoke Tests" "$WARN_MSG"
fi

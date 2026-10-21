#!/usr/bin/env bash
# scripts/autodeploy_zimaos.sh - GitOps autônomo do Nexus no ZimaOS (roda a cada 2 min pelo systemd).
#
# O servidor NUNCA compila. O GitHub Actions (.github/workflows/build-image.yml) testa, compila e publica
# a imagem em ghcr.io/ancaped/nexus:sha-<7 do commit>; este script só puxa a imagem pronta, troca o
# container, roda o smoke test e notifica no sino do Nexus. Compilar aqui derrubou a produção em 20/10/2026
# (3,7 GB de RAM compartilhados com Postgres e ai-memory).
#
# Garantias:
#  - O estado é um arquivo (last_deployed), nunca o HEAD do clone: só avança depois do Gate 2 aprovado.
#  - Imagem ainda não publicada (CI rodando ou falhou): espera em silêncio e avisa uma vez após 60 min.
#  - Falhas do mesmo commit têm espera e limite de tentativas.
#  - Gate 2 reprovado restaura a imagem anterior (nexus:prod-prev).
#  - Se o script for morto (systemd, stop manual), registra e notifica em vez de ficar mudo.
#
# Instalação: sudo install -m 755 scripts/autodeploy_zimaos.sh /DATA/AppData/nexus/scripts/autodeploy.sh
# Retentar um commit que esgotou as tentativas: sudo rm /DATA/AppData/nexus/saves-prod/.autodeploy/failed
set -uo pipefail

# Permite injetar binários falsos nos testes (EXTRA_PATH); em produção fica vazio.
export PATH="${EXTRA_PATH:+$EXTRA_PATH:}/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

REPO_DIR="${REPO_DIR:-/DATA/AppData/nexus/repo}"
COMPOSE_FILE="${COMPOSE_FILE:-/var/lib/casaos/apps/custom__nexusprod/docker-compose.yml}"
DATA_DIR="${DATA_DIR:-/DATA/AppData/nexus/saves-prod}"
STATE_DIR="${STATE_DIR:-$DATA_DIR/.autodeploy}"
LOG_FILE="${LOG_FILE:-$DATA_DIR/autodeploy.log}"
LOCK_FILE="${LOCK_FILE:-/run/nexus-autodeploy.lock}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/api/health}"
REPO_URL="${REPO_URL:-https://github.com/ancaped/NatumHub.git}"
BRANCH="${BRANCH:-main}"
IMAGE_REPO="${IMAGE_REPO:-ghcr.io/ancaped/nexus}"
IMAGE_TAG="nexus:prod"                    # tag local usada pelo docker-compose (pull_policy: never)
ACTIONS_URL="https://github.com/ancaped/NatumHub/actions"

PULL_TIMEOUT="${PULL_TIMEOUT:-900}"       # segundos para baixar a imagem
RETRY_WAIT="${RETRY_WAIT:-1800}"          # espera entre tentativas do mesmo commit
MAX_ATTEMPTS="${MAX_ATTEMPTS:-3}"         # tentativas por commit antes de desistir
CI_WAIT_NOTIFY="${CI_WAIT_NOTIFY:-3600}"  # sem imagem após isso: avisa (uma vez) que o CI não publicou
CI_LOG_EVERY="${CI_LOG_EVERY:-1800}"      # no máximo uma linha de log "aguardando CI" por esse intervalo

DEPLOYED_FILE="$STATE_DIR/last_deployed"
FAILED_FILE="$STATE_DIR/failed"
CI_NOTIFIED_FILE="$STATE_DIR/ci_wait_notified"
CI_LOGGED_FILE="$STATE_DIR/ci_wait_logged"

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE"; }

mkdir -p "$DATA_DIR" "$STATE_DIR"

# --- Notificação no sino do Nexus (hub_notifications; módulo Configurações) ---
sql_quote() { printf "%s" "$1" | sed "s/'/''/g"; }

send_hub_notification() {
    local kind="$1" title="$2" message="$3"
    local notif_id now sql_file
    notif_id="notif_$(date +%s%N | cut -b1-13)"
    now=$(date -u "+%Y-%m-%dT%H:%M:%SZ")
    sql_file=$(mktemp)
    printf "INSERT INTO hub_notifications (id, module_key, kind, title, message, created_at) VALUES ('%s', 'hub_settings', '%s', '%s', '%s', '%s');\n" \
        "$(sql_quote "$notif_id")" "$(sql_quote "$kind")" "$(sql_quote "$title")" "$(sql_quote "$message")" "$(sql_quote "$now")" > "$sql_file"
    if ! docker exec -i nexus-postgres-prod psql -U postgres -d natumhub -v ON_ERROR_STOP=1 < "$sql_file" >> "$LOG_FILE" 2>&1; then
        log "[GITOPS] Falha ao gravar notificação no sino."
    fi
    rm -f "$sql_file"
}

# --- Estado de falhas: "<hash> <epoch> <tentativas>" ---
FAIL_ATTEMPTS=0
record_failure() {
    local hash="$1" attempts=1 prev_hash prev_at prev_n
    if [ -f "$FAILED_FILE" ] && read -r prev_hash prev_at prev_n < "$FAILED_FILE" && [ "$prev_hash" = "$hash" ]; then
        attempts=$(( ${prev_n:-0} + 1 ))
    fi
    echo "$hash $(date +%s) $attempts" > "$FAILED_FILE"
    FAIL_ATTEMPTS="$attempts"
}

health_ok() { curl -s -m 5 -f "$HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; }

# Estado inicial: descobre qual commit está no ar a partir da versão do /api/health (0.2.N = N commits).
init_deployed_from_health() {
    local n h
    n=$(curl -s -m 5 "$HEALTH_URL" 2>/dev/null | sed -n 's/.*"version":"0\.2\.\([0-9][0-9]*\).*/\1/p' | head -n1)
    [ -n "$n" ] || return 0
    for h in $(git rev-list "origin/$BRANCH"); do
        if [ "$(git rev-list --count "$h")" = "$n" ]; then
            echo "$h"
            return 0
        fi
    done
}

# --- Execução única ---
exec 9>"$LOCK_FILE" || exit 1
flock -n 9 || exit 0

if [ ! -d "$REPO_DIR/.git" ]; then
    log "[GITOPS] Clonando repositório oficial da branch $BRANCH..."
    rm -rf "$REPO_DIR"
    git clone -b "$BRANCH" "$REPO_URL" "$REPO_DIR" >> "$LOG_FILE" 2>&1 || exit 1
fi
cd "$REPO_DIR" || exit 1

# Sem rede ou GitHub fora: tenta de novo no próximo ciclo.
git fetch origin "$BRANCH" --quiet 2>> "$LOG_FILE" || exit 0

REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null) || exit 0
DEPLOYED=$(cat "$DEPLOYED_FILE" 2>/dev/null || true)
if [ -z "$DEPLOYED" ]; then
    DEPLOYED=$(init_deployed_from_health)
    if [ -n "$DEPLOYED" ]; then
        echo "$DEPLOYED" > "$DEPLOYED_FILE"
        log "[GITOPS] Estado inicial: commit em produção identificado como ${DEPLOYED:0:7}."
    fi
fi
[ "$REMOTE" = "$DEPLOYED" ] && exit 0

SHORT_HASH="${REMOTE:0:7}"
IMAGE_REF="$IMAGE_REPO:sha-$SHORT_HASH"

# Espera e limite de tentativas para o mesmo commit (falhas reais, não "CI ainda não terminou").
if [ -f "$FAILED_FILE" ] && read -r F_HASH F_AT F_N < "$FAILED_FILE" && [ "$F_HASH" = "$REMOTE" ]; then
    if [ "${F_N:-0}" -ge "$MAX_ATTEMPTS" ]; then exit 0; fi
    if [ $(( $(date +%s) - ${F_AT:-0} )) -lt "$RETRY_WAIT" ]; then exit 0; fi
fi

PHASE="pull"
on_exit() {
    local rc=$?
    trap - EXIT
    if [ "$PHASE" = "pull" ] || [ "$PHASE" = "gate2" ]; then
        log "❌ [GITOPS] Execução INTERROMPIDA na fase '$PHASE' (commit $SHORT_HASH)."
        record_failure "$REMOTE"
        send_hub_notification "error" "Deploy interrompido" \
"O deploy do commit ${SHORT_HASH} foi interrompido na fase '${PHASE}' (tentativa ${FAIL_ATTEMPTS}/${MAX_ATTEMPTS}).
Confira se a versão em execução está correta no Nexus."
    fi
    exit "$rc"
}
trap on_exit EXIT
trap 'exit 143' TERM INT

# --- Gate 1: puxar a imagem que o CI publicou ---
PULL_LOG="$STATE_DIR/pull_${SHORT_HASH}.log"
timeout --kill-after=30 "$PULL_TIMEOUT" docker pull "$IMAGE_REF" > "$PULL_LOG" 2>&1
PULL_RC=$?

if [ "$PULL_RC" -ne 0 ]; then
    PHASE="espera"
    if grep -qiE "manifest unknown|not found|name unknown" "$PULL_LOG"; then
        # O CI ainda está compilando (ou falhou): não é falha do deploy.
        NOW=$(date +%s)
        COMMIT_TS=$(git log -1 --format=%ct "$REMOTE" 2>/dev/null || echo "$NOW")
        AGE=$(( NOW - COMMIT_TS ))
        LAST_LOG=$(cat "$CI_LOGGED_FILE" 2>/dev/null || echo 0)
        if [ $(( NOW - LAST_LOG )) -ge "$CI_LOG_EVERY" ]; then
            log "[GITOPS] Aguardando o CI publicar a imagem de $SHORT_HASH ($(( AGE / 60 )) min desde o commit)."
            echo "$NOW" > "$CI_LOGGED_FILE"
        fi
        if [ "$AGE" -ge "$CI_WAIT_NOTIFY" ] && [ "$(cat "$CI_NOTIFIED_FILE" 2>/dev/null)" != "$REMOTE" ]; then
            echo "$REMOTE" > "$CI_NOTIFIED_FILE"
            send_hub_notification "warning" "Imagem não publicada pelo CI" \
"Passaram $(( AGE / 60 )) min desde o commit ${SHORT_HASH} e o GitHub Actions ainda não publicou a imagem.
Veja o resultado em ${ACTIONS_URL}. A versão anterior continua no ar."
        fi
        rm -f "$PULL_LOG"
        exit 0
    fi
    PHASE="falha"
    record_failure "$REMOTE"
    tail -n 20 "$PULL_LOG" >> "$LOG_FILE"
    if grep -qiE "denied|unauthorized" "$PULL_LOG"; then
        REASON="o GHCR negou acesso (pacote privado). Torne o pacote público em Package settings ou faça docker login ghcr.io no servidor"
    elif [ "$PULL_RC" -eq 124 ] || [ "$PULL_RC" -eq 137 ]; then
        REASON="tempo esgotado ao baixar a imagem (mais de ${PULL_TIMEOUT}s)"
    else
        REASON="não foi possível baixar a imagem (código $PULL_RC)"
    fi
    log "❌ [GITOPS] FALHA AO PUXAR A IMAGEM: $REASON. Produção mantida."
    if [ "$FAIL_ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
        NEXT="Desisti deste commit após ${FAIL_ATTEMPTS} tentativas; só tento de novo com um commit novo."
    else
        NEXT="Nova tentativa automática em $(( RETRY_WAIT / 60 )) min (tentativa ${FAIL_ATTEMPTS}/${MAX_ATTEMPTS})."
    fi
    send_hub_notification "error" "Falha ao puxar a imagem" \
"Commit ${SHORT_HASH}: ${REASON}.

A versão anterior foi mantida ativa. ${NEXT}"
    rm -f "$PULL_LOG"
    exit 1
fi
rm -f "$PULL_LOG"

APP_VERSION=$(docker image inspect "$IMAGE_REF" --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' 2>/dev/null || true)
case "$APP_VERSION" in ""|"<no value>") APP_VERSION="0.2.$(git rev-list --count "$REMOTE")" ;; esac

RELEASE_NOTES=""
if [ -n "$DEPLOYED" ] && git cat-file -e "${DEPLOYED}^{commit}" 2>/dev/null; then
    RELEASE_NOTES=$(git log --format="• %s" "${DEPLOYED}..${REMOTE}" 2>/dev/null | head -n 6 || true)
fi
[ -n "$RELEASE_NOTES" ] || RELEASE_NOTES=$(git log -1 --format="• %s" "$REMOTE" 2>/dev/null || true)

log "=========================================================="
log "[GITOPS] Imagem $IMAGE_REF baixada (versão $APP_VERSION)."
log ">> Em produção: ${DEPLOYED:-desconhecido} -> Novo: $REMOTE"

# --- Troca segura: guarda a imagem atual, publica a nova, valida ---
PHASE="gate2"
log ">> [1/3] Recriando container de Produção..."
PREV_ID=$(docker image inspect "$IMAGE_TAG" --format '{{.Id}}' 2>/dev/null || true)
[ -n "$PREV_ID" ] && docker tag "$PREV_ID" "${IMAGE_TAG}-prev" >> "$LOG_FILE" 2>&1
docker tag "$IMAGE_REF" "$IMAGE_TAG" >> "$LOG_FILE" 2>&1
docker compose -f "$COMPOSE_FILE" up -d --force-recreate >> "$LOG_FILE" 2>&1

log ">> [2/3] Gate 2: smoke tests de produção..."
sleep "${GATE2_START_DELAY:-3}"
TEST_PASSED=false
for _ in $(seq 1 "${GATE2_TRIES:-30}"); do
    if health_ok; then TEST_PASSED=true; break; fi
    sleep "${GATE2_INTERVAL:-2}"
done

if [ "$TEST_PASSED" = true ]; then
    PHASE="done"
    echo "$REMOTE" > "$DEPLOYED_FILE"
    rm -f "$FAILED_FILE" "$CI_NOTIFIED_FILE" "$CI_LOGGED_FILE"
    git reset --hard "$REMOTE" >> "$LOG_FILE" 2>&1 || true
    docker image prune -f >> "$LOG_FILE" 2>&1 || true
    log "✓ [3/3] GATE 2 APROVADO! Nexus atualizado para v$APP_VERSION com sucesso!"
    log "=========================================================="
    send_hub_notification "success" "Nexus Atualizado (v${APP_VERSION})" \
"Deploy autônomo (commit ${SHORT_HASH}) aprovado nos testes.

Notas da versão:
${RELEASE_NOTES}"
    exit 0
fi

# Gate 2 reprovado: volta a imagem anterior.
PHASE="falha"
record_failure "$REMOTE"
ROLLBACK_MSG="Não havia imagem anterior para restaurar."
if [ -n "$PREV_ID" ]; then
    docker tag "${IMAGE_TAG}-prev" "$IMAGE_TAG" >> "$LOG_FILE" 2>&1
    docker compose -f "$COMPOSE_FILE" up -d --force-recreate >> "$LOG_FILE" 2>&1
    ROLLBACK_MSG="A versão anterior foi restaurada."
fi
log "❌ [GITOPS] FALHA NO GATE 2: o health não respondeu. $ROLLBACK_MSG"
send_hub_notification "error" "Falha no Gate 2: Smoke Tests" \
"O container do commit ${SHORT_HASH} (v${APP_VERSION}) não respondeu ao health. ${ROLLBACK_MSG}

Notas da versão:
${RELEASE_NOTES}"
exit 1

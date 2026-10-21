#!/usr/bin/env bash
# scripts/autodeploy_zimaos.sh - GitOps autônomo do Nexus no ZimaOS (roda a cada 2 min pelo systemd).
#
# Garantias:
#  - O estado é um arquivo (last_deployed), nunca o HEAD do clone: um build morto no meio é refeito.
#  - O build usa uma cópia do commit (git archive); o clone só avança depois do Gate 2 aprovado.
#  - Gate 1 tem tempo máximo próprio, menor que o do systemd, e deixa log e notificação ao falhar.
#  - Falhas repetidas do mesmo commit têm espera e limite de tentativas.
#  - Gate 2 reprovado volta a imagem anterior (nexus:prod-prev).
#  - O build roda num cgroup próprio (docker build --cgroup-parent nexus-build.slice) com CPUWeight/IOWeight
#    baixos e memory.high, para não sufocar Postgres, ai-memory e nexus-prod. Os passos do build NÃO
#    ficam sob docker.service (testado), então limitar o docker.service não adiantaria.
#
# Instalação: sudo install -m 755 scripts/autodeploy_zimaos.sh /DATA/AppData/nexus/scripts/autodeploy.sh
# Retentar um commit que esgotou as tentativas: sudo rm /DATA/AppData/nexus/saves-prod/.autodeploy/failed
set -uo pipefail

# Permite injetar binários falsos nos testes (EXTRA_PATH); em produção fica vazio.
export PATH="${EXTRA_PATH:+$EXTRA_PATH:}/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

REPO_DIR="${REPO_DIR:-/DATA/AppData/nexus/repo}"
BUILD_DIR="${BUILD_DIR:-/DATA/AppData/nexus/build-src}"
COMPOSE_FILE="${COMPOSE_FILE:-/var/lib/casaos/apps/custom__nexusprod/docker-compose.yml}"
DATA_DIR="${DATA_DIR:-/DATA/AppData/nexus/saves-prod}"
STATE_DIR="${STATE_DIR:-$DATA_DIR/.autodeploy}"
LOG_FILE="${LOG_FILE:-$DATA_DIR/autodeploy.log}"
LOCK_FILE="${LOCK_FILE:-/run/nexus-autodeploy.lock}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/api/health}"
REPO_URL="${REPO_URL:-https://github.com/ancaped/NatumHub.git}"
BRANCH="${BRANCH:-main}"
IMAGE_TAG="nexus:prod"

GATE1_TIMEOUT="${GATE1_TIMEOUT:-3600}"   # segundos; precisa ser menor que TimeoutStartSec da unidade
RETRY_WAIT="${RETRY_WAIT:-1800}"         # espera entre tentativas do mesmo commit
MAX_ATTEMPTS="${MAX_ATTEMPTS:-3}"        # tentativas por commit antes de desistir
BUILD_CGROUP_PARENT="${BUILD_CGROUP_PARENT:-nexus-build.slice}"     # vazio desliga o limite
BUILD_CGROUP_DIR="${BUILD_CGROUP_DIR:-/sys/fs/cgroup/$BUILD_CGROUP_PARENT}"
BUILD_CPU_WEIGHT="${BUILD_CPU_WEIGHT:-20}"      # padrão do sistema é 100
BUILD_IO_WEIGHT="${BUILD_IO_WEIGHT:-20}"
BUILD_MEMORY_HIGH="${BUILD_MEMORY_HIGH:-2200M}" # acima disso o kernel reclama/swapa só o build (não mata)

DEPLOYED_FILE="$STATE_DIR/last_deployed"
FAILED_FILE="$STATE_DIR/failed"

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

# --- Limites de recurso do build: escreve direto nos arquivos do cgroup v2 ---
BUILD_CGROUP_ARG=""
set_build_limits() {
    [ -n "$BUILD_CGROUP_PARENT" ] || return 0
    if mkdir -p "$BUILD_CGROUP_DIR" 2>/dev/null \
        && echo "$BUILD_CPU_WEIGHT" > "$BUILD_CGROUP_DIR/cpu.weight" 2>/dev/null \
        && echo "$BUILD_MEMORY_HIGH" > "$BUILD_CGROUP_DIR/memory.high" 2>/dev/null; then
        echo "default $BUILD_IO_WEIGHT" > "$BUILD_CGROUP_DIR/io.weight" 2>/dev/null || true
        BUILD_CGROUP_ARG="$BUILD_CGROUP_PARENT"
        log "[GITOPS] Limites do build aplicados (cpu.weight=$BUILD_CPU_WEIGHT io.weight=$BUILD_IO_WEIGHT memory.high=$BUILD_MEMORY_HIGH)."
    else
        BUILD_CGROUP_ARG=""
        log "[GITOPS] Aviso: não consegui preparar o cgroup de limites; o build seguirá sem eles."
    fi
}

# --- Estado de falhas: "<hash> <epoch> <tentativas>" ---
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

# Espera e limite de tentativas para o mesmo commit.
FAIL_ATTEMPTS=0
if [ -f "$FAILED_FILE" ] && read -r F_HASH F_AT F_N < "$FAILED_FILE" && [ "$F_HASH" = "$REMOTE" ]; then
    if [ "${F_N:-0}" -ge "$MAX_ATTEMPTS" ]; then exit 0; fi
    if [ $(( $(date +%s) - ${F_AT:-0} )) -lt "$RETRY_WAIT" ]; then exit 0; fi
fi

APP_VERSION="0.2.$(git rev-list --count "$REMOTE")"
RELEASE_NOTES=""
if [ -n "$DEPLOYED" ] && git cat-file -e "${DEPLOYED}^{commit}" 2>/dev/null; then
    RELEASE_NOTES=$(git log --format="• %s" "${DEPLOYED}..${REMOTE}" 2>/dev/null | head -n 6 || true)
fi
[ -n "$RELEASE_NOTES" ] || RELEASE_NOTES=$(git log -1 --format="• %s" "$REMOTE" 2>/dev/null || true)

log "=========================================================="
log "[GITOPS] Novo commit detectado: $REMOTE (versão $APP_VERSION)"
log ">> Em produção: ${DEPLOYED:-desconhecido} -> Novo: $REMOTE"

PHASE="gate1"
BUILD_PID=""
BUILD_LOG="$STATE_DIR/gate1_${SHORT_HASH}.log"

# Se o script for morto (systemd, stop manual), registra e libera os limites.
on_exit() {
    local rc=$?
    trap - EXIT
    if [ -n "$BUILD_PID" ] && kill -0 "$BUILD_PID" 2>/dev/null; then
        kill -TERM "$BUILD_PID" 2>/dev/null || true
        wait "$BUILD_PID" 2>/dev/null || true
    fi
    if [ "$PHASE" = "gate1" ]; then
        log "❌ [GITOPS] Gate 1 INTERROMPIDO antes de terminar (commit $SHORT_HASH). Produção mantida."
        record_failure "$REMOTE"
        send_hub_notification "error" "Deploy interrompido (Gate 1)" \
"O build do commit ${SHORT_HASH} foi interrompido antes de terminar (tentativa ${FAIL_ATTEMPTS}/${MAX_ATTEMPTS}).
A versão anterior continua no ar."
    fi
    exit "$rc"
}
trap on_exit EXIT
trap 'exit 143' TERM INT

# --- Gate 1: cópia limpa do commit + docker build com tempo máximo ---
rm -rf "$BUILD_DIR" && mkdir -p "$BUILD_DIR"
if ! git archive "$REMOTE" | tar -x -C "$BUILD_DIR"; then
    PHASE="falha"
    log "❌ [GITOPS] Não consegui extrair o commit $SHORT_HASH para o build."
    record_failure "$REMOTE"
    send_hub_notification "error" "Deploy não iniciado" "Não foi possível extrair o commit ${SHORT_HASH} para o build."
    exit 1
fi

log ">> [1/4] Gate 1: compilação Docker (limite de ${GATE1_TIMEOUT}s)..."
set_build_limits
( cd "$BUILD_DIR" && exec timeout --kill-after=60 "$GATE1_TIMEOUT" \
    env DOCKER_BUILDKIT=1 docker build ${BUILD_CGROUP_ARG:+--cgroup-parent "$BUILD_CGROUP_ARG"} \
    --build-arg APP_VERSION="$APP_VERSION" -t "${IMAGE_TAG}-next" -f docker/Dockerfile . ) \
    > "$BUILD_LOG" 2>&1 &
BUILD_PID=$!
wait "$BUILD_PID"
BUILD_RC=$?
BUILD_PID=""

if [ "$BUILD_RC" -ne 0 ]; then
    PHASE="falha"
    tail -n 120 "$BUILD_LOG" >> "$LOG_FILE"
    record_failure "$REMOTE"
    if [ "$BUILD_RC" -eq 124 ] || [ "$BUILD_RC" -eq 137 ]; then
        REASON="TEMPO ESGOTADO (mais de ${GATE1_TIMEOUT}s)"
        log "❌ [GITOPS] FALHA NO GATE 1: $REASON. Produção mantida."
    else
        REASON="Compilação/testes quebrados (código $BUILD_RC)"
        log "❌ [GITOPS] FALHA NO GATE 1: $REASON. Produção mantida."
    fi
    ERR_SNIPPET=$(grep -E "error(\[|:)|Error:|failed to compile|Failed to compile" "$BUILD_LOG" | head -n 2 || true)
    [ -n "$ERR_SNIPPET" ] || ERR_SNIPPET=$(tail -n 2 "$BUILD_LOG")
    if [ "$FAIL_ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
        NEXT="Desisti deste commit após ${FAIL_ATTEMPTS} tentativas; só tento de novo com um commit novo."
    else
        NEXT="Nova tentativa automática em $(( RETRY_WAIT / 60 )) min (tentativa ${FAIL_ATTEMPTS}/${MAX_ATTEMPTS})."
    fi
    send_hub_notification "error" "Falha no Gate 1: $REASON" \
"Commit ${SHORT_HASH}: ${REASON}.
${ERR_SNIPPET}

A versão anterior foi mantida ativa. ${NEXT}"
    exit 1
fi
tail -n 5 "$BUILD_LOG" >> "$LOG_FILE"
rm -f "$BUILD_LOG"

# --- Troca segura: guarda a imagem atual, publica a nova, valida ---
PHASE="gate2"
log ">> [2/4] Gate 1 APROVADO! Recriando container de Produção..."
PREV_ID=$(docker image inspect "$IMAGE_TAG" --format '{{.Id}}' 2>/dev/null || true)
[ -n "$PREV_ID" ] && docker tag "$PREV_ID" "${IMAGE_TAG}-prev" >> "$LOG_FILE" 2>&1
docker tag "${IMAGE_TAG}-next" "$IMAGE_TAG" >> "$LOG_FILE" 2>&1
docker compose -f "$COMPOSE_FILE" up -d --force-recreate >> "$LOG_FILE" 2>&1

log ">> [3/4] Gate 2: smoke tests de produção..."
sleep "${GATE2_START_DELAY:-3}"
TEST_PASSED=false
for _ in $(seq 1 "${GATE2_TRIES:-30}"); do
    if health_ok; then TEST_PASSED=true; break; fi
    sleep "${GATE2_INTERVAL:-2}"
done

if [ "$TEST_PASSED" = true ]; then
    PHASE="done"
    echo "$REMOTE" > "$DEPLOYED_FILE"
    rm -f "$FAILED_FILE"
    git reset --hard "$REMOTE" >> "$LOG_FILE" 2>&1 || true
    docker rmi "${IMAGE_TAG}-next" >> "$LOG_FILE" 2>&1 || true
    docker image prune -f >> "$LOG_FILE" 2>&1 || true
    log "✓ [4/4] GATE 2 APROVADO! Nexus atualizado para v$APP_VERSION com sucesso!"
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
"O container do commit ${SHORT_HASH} não respondeu ao health. ${ROLLBACK_MSG}

Notas da versão:
${RELEASE_NOTES}"
exit 1

#!/usr/bin/env bash
# scripts/deploy_zimaos.sh - Troca MANUAL da versão do Nexus no ZimaOS.
#
# O servidor NUNCA compila: este script só puxa uma imagem que o GitHub Actions já publicou no GHCR
# (.github/workflows/build-image.yml), troca o container, roda o smoke test e volta a imagem anterior
# se o health não responder.
#
# Uso:
#   scripts/deploy_zimaos.sh              # última imagem da main (sha do HEAD remoto)
#   scripts/deploy_zimaos.sh 0.2.91       # versão específica (serve como rollback)
#   scripts/deploy_zimaos.sh sha-0b81c32  # commit específico
#
# Atenção: o timer nexus-autodeploy volta para a última versão da main em até 2 min. Para segurar um
# rollback, pare o timer antes: ssh edson@<host> 'sudo systemctl stop nexus-autodeploy.timer'
set -euo pipefail

ZIMAOS_HOST="${ZIMAOS_HOST:-192.168.1.105}"
ZIMAOS_USER="${ZIMAOS_USER:-edson}"
IMAGE_REPO="${IMAGE_REPO:-ghcr.io/ancaped/nexus}"
COMPOSE_FILE="${COMPOSE_FILE:-/var/lib/casaos/apps/custom__nexusprod/docker-compose.yml}"

REF="${1:-}"
if [ -z "$REF" ]; then
    HEAD_HASH=$(git ls-remote origin refs/heads/main | cut -c1-7)
    [ -n "$HEAD_HASH" ] || { echo "Não consegui ler o HEAD da main no GitHub." >&2; exit 1; }
    REF="sha-$HEAD_HASH"
fi
IMAGE="$IMAGE_REPO:$REF"

echo "============================================================"
echo "  Nexus - Troca de versão no ZimaOS (sem compilar)"
echo "============================================================"
echo "Alvo:   $ZIMAOS_USER@$ZIMAOS_HOST"
echo "Imagem: $IMAGE"
echo "------------------------------------------------------------"

ssh "$ZIMAOS_USER@$ZIMAOS_HOST" "IMAGE='$IMAGE' COMPOSE_FILE='$COMPOSE_FILE' bash -s" <<'REMOTE'
set -euo pipefail
echo ">> [1/3] Baixando a imagem..."
sudo docker pull "$IMAGE"
VERSION=$(sudo docker image inspect "$IMAGE" --format '{{ index .Config.Labels "org.opencontainers.image.version" }}')

echo ">> [2/3] Recriando o container (versão $VERSION)..."
PREV=$(sudo docker image inspect nexus:prod --format '{{.Id}}' 2>/dev/null || true)
[ -n "$PREV" ] && sudo docker tag "$PREV" nexus:prod-prev
sudo docker tag "$IMAGE" nexus:prod
sudo docker compose -f "$COMPOSE_FILE" up -d --force-recreate

echo ">> [3/3] Smoke test (/api/health)..."
sleep 3
OK=false
for _ in $(seq 1 30); do
    if curl -sf http://127.0.0.1:3001/api/health | grep -q '"status":"ok"'; then OK=true; break; fi
    sleep 2
done

if [ "$OK" = true ]; then
    NOTIF_ID="notif_$(date +%s%N | cut -b1-13)"
    sudo docker exec -i nexus-postgres-prod psql -U postgres -d natumhub -c \
      "INSERT INTO hub_notifications (id, module_key, kind, title, message, created_at)
       VALUES ('$NOTIF_ID', 'hub_settings', 'success', 'Nexus atualizado manualmente (v$VERSION)',
               'Troca manual de versão para $VERSION concluída e validada.', '$(date -u +%Y-%m-%dT%H:%M:%SZ)')
       ON CONFLICT DO NOTHING;" >/dev/null 2>&1 || true
    echo "✓ Nexus v$VERSION no ar."
else
    if [ -n "$PREV" ]; then
        echo "✗ Health não respondeu: voltando a imagem anterior..."
        sudo docker tag nexus:prod-prev nexus:prod
        sudo docker compose -f "$COMPOSE_FILE" up -d --force-recreate
    fi
    echo "✗ Falhou: a versão anterior foi restaurada." >&2
    exit 1
fi
REMOTE

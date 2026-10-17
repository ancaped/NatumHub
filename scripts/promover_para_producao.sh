#!/usr/bin/env bash
# scripts/promover_para_producao.sh - Promove versão validada em Dev para Produção no CasaOS
set -euo pipefail

echo "============================================================"
echo "  Nexus - Publicação de Versão Estável para Produção        "
echo "============================================================"
echo "Este script recompila/atualiza o container de Produção (3001)"
echo "com as últimas melhorias validadas em Desenvolvimento."
echo "------------------------------------------------------------"

cd "$(dirname "$0")/.."

echo "[1/2] Recompilando imagem de produção..."
docker compose build nexus-prod

echo "[2/2] Reiniciando container estável na porta 3001..."
docker compose up -d --no-deps nexus-prod

echo "------------------------------------------------------------"
echo " SUCESSO: Versão de produção atualizada e no ar em :3001!"
echo " A fábrica já está acessando a nova versão estável."
echo "============================================================"

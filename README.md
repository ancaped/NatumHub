# Nexus Industrial Hub

Plataforma Operacional e de Gestão Industrial — Nátum Cosméticos.

Stack: **Rust Axum (Servidor Headless :3001) + React SPA (Vite / Tailwind) + PostgreSQL 17 + ZimaOS + Tailscale + ai-memory**.

---

## 1. Arquitetura do Sistema

- **Backend Headless (`nexus-server`):** Desenvolvido em Rust com Axum e Tokio. Atende às rotas REST (`/api/...`) e serve diretamente os arquivos estáticos compilados do frontend (`Frontend/dist`).
- **Frontend SPA:** Desenvolvido em React + TypeScript + Vite + Tailwind CSS.
- **Acesso Operacional:** 100% via navegador web (`http://nexus.local:3001` ou IP do servidor / Tailscale). Não requer instalação local nos terminais clientes.
- **Servidor Dedicado (ZimaOS):** Arquitetura com 5 containers independentes:
  - `nexus-prod` (`:3001`): Produção oficial da fábrica
  - `nexus-dev` (`:3002`): Homologação para testes de agentes e novos módulos
  - `postgres-prod` (`:5432`): Banco `natumhub`
  - `postgres-dev` (`:5433`): Banco `natumhub_dev`
  - `ai-memory` (`:49374`): Servidor de memória persistente e MCP para agentes de IA

---

## 2. Estrutura do Repositório

```text
├── Backend/        # Código Rust do servidor HTTP Axum, módulos de negócio e rotas REST
├── Frontend/       # Código React + Vite + Tailwind da interface do usuário
├── docker/         # Dockerfiles e composições ZimaOS
├── erp-import/     # Scripts SQL para extração e espelhamento do ERP legado
├── scripts/        # Utilitários de deploy (deploy_zimaos.sh), backups e sincronização
├── Saves/          # Configurações locais sensíveis (postgres.env, client_config.json)
├── AGENTS.md       # Diretrizes canônicas para agentes de IA e índice do ai-memory
└── CLAUDE.md       # Roteamento padrão (@AGENTS.md)
```

---

## 3. Comandos de Validação e Deploy

```bash
# Validar compilação do Backend (0 erros):
cd Backend
cargo check --bin nexus-server --no-default-features

# Build de produção do Frontend:
cd ../Frontend
npm run build

# Deploy automatizado no ZimaOS via SSH + BuildKit:
./scripts/deploy_zimaos.sh dev    # Atualiza o container nexus-dev (:3002)
./scripts/deploy_zimaos.sh prod   # Atualiza o container nexus-prod (:3001)
```

---

## 4. Memória de Longo Prazo e Regras para Agentes

Toda a documentação técnica, regras de cálculo (MRP/Estoque), decisões arquiteturais (ADRs), padrões visuais e fluxos de negócio residem no **`ai-memory`** (`http://<IP_ZIMAOS>:49374`).

Consulte o arquivo [`AGENTS.md`](AGENTS.md) para o catálogo completo de tópicos e páginas.


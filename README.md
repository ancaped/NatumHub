# Nexus Industrial Hub

Sistema de Gestão e Operação Industrial — Arquitetura **Rust Axum (Headless Server :3001) + React SPA (Vite) + PostgreSQL + Tailscale**.

---

## 1. Visão Geral da Arquitetura

O **Nexus** opera como uma aplicação web industrial moderna:
- **Backend Headless (`nexus-server`):** Desenvolvido em Rust com Axum e Tokio. Atende rotas REST (`/api/...`) e serve diretamente os arquivos estáticos do frontend (`Frontend/dist`).
- **Frontend SPA:** Desenvolvido em React + TypeScript + Vite + Tailwind CSS.
- **Acesso Operacional:** Totalmente via navegador web (`http://nexus.local:3001` ou IP do servidor / Tailscale). Não requer WebView ou executáveis nas pontas clientes.
- **Banco de Dados:** PostgreSQL 17 (local em desenvolvimento ou hospedado em servidor Linux / CasaOS via Docker).

---

## 2. Execução do Servidor no Windows

| Arquivo | Função |
|---|---|
| **[`Nexus-Server.bat`](Nexus-Server.bat)** | **Executa o Servidor Headless Axum:** Escuta requisições na porta `3001` e serve a API e o SPA para a rede. Não abre navegadores e não cria janelas locais. |

*(Para configurar computadores clientes ou terminais na rede, utilize o assistente em [`scripts/cliente/Nexus-Setup-Cliente.bat`](scripts/cliente/Nexus-Setup-Cliente.bat)).*

---

## 3. Infraestrutura & Servidor Linux / CasaOS

Para rodar o banco de dados e/ou o servidor Nexus 24/7 em uma máquina Linux dedicada:
- **Docker Compose:** [`docker/docker-compose.yml`](docker/docker-compose.yml) (PostgreSQL 17 + pgAdmin 4).
- **Backup do Banco:** [`scripts/backup_postgres.bat`](scripts/backup_postgres.bat) (exporta dump comprimido com data/hora).
- **Restauração do Banco:** [`scripts/restore_postgres.bat`](scripts/restore_postgres.bat) e [`scripts/restore_postgres.sh`](scripts/restore_postgres.sh).
- **Guia de Migração Detalhado:** Consulte [`ContextoIA/devops/migracao_casaos_linux.md`](ContextoIA/devops/migracao_casaos_linux.md).

---

## 4. Estrutura de Pastas

| Pasta | Descrição |
|---|---|
| `Backend/` | Código Rust do servidor HTTP Axum, módulos de negócio e rotas REST. |
| `Frontend/` | Código React + Vite + Tailwind da interface do usuário. |
| `docker/` | Arquivos de orquestração de containers (CasaOS / Linux). |
| `scripts/` | Utilitários de backup, restore, sync ERP e diagnóstico de rede. |
| `ContextoIA/` | Documentação técnica arquitetural, diagramas e guias para agentes de IA. |
| `Saves/` | Configurações locais sensíveis (`postgres.env`, `client_config.json`, backups). |
| `erp-import/` | Rotinas de sincronização SQL Server ERP → PostgreSQL. |

---

## 5. Desenvolvimento Diário

```powershell
# Verificar compilação do Backend (0 warnings, 0 errors):
cd Backend
cargo check --bin nexus-server --no-default-features

# Build de produção do Frontend:
cd ..\Frontend
npm run build
```

---

## 6. Documentação para Agentes de IA

Consulte [`AGENTS.md`](AGENTS.md) e o índice geral em [`ContextoIA/INDEX.md`](ContextoIA/INDEX.md).

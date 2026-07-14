# NatumHub — Manifesto (compacto)

ERP desktop Tauri · React + Rust Axum · **PostgreSQL** (PC Principal) + sync SQL Server ERP NATUM.

**Doc IA:** [`ContextoIA/INDEX.md`](ContextoIA/INDEX.md) · **Skills:** [`AGENTS.md`](AGENTS.md) · **Instalação:** [`devops/`](../devops/README.md)

## Stack

| Camada | Tecnologia |
|--------|------------|
| UI | React + Vite (Tauri) |
| API | Axum `:3001` no master |
| Dados | PostgreSQL (`Saves/postgres.env`) |
| ERP | SQL Server → sync só no master |

**Terminais** não precisam de Postgres nem SQL Server — só rede até a API do master.

## Módulos

Geral (auth, config, notificações) · Produção · Compras · Estoque · Vendas · Financeiro

## Marcos recentes

| Data | Marco |
|------|-------|
| 2026-07 | Modularização FE/BE espelhada |
| 2026-07 | Master/cliente + auth operador + permissões |
| 2026-07 | PostgreSQL no lugar do SQLite local |
| 2026-07 | Sync ERP documentado em `erp-import/` |

## Releases

GitHub Releases + Tauri updater · Instalador NSIS Windows

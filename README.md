# NatumHub

Tauri 2 + React + Axum + **PostgreSQL**.

## Agentes

[AGENTS.md](AGENTS.md) → [ContextoIA/INDEX.md](ContextoIA/INDEX.md)

## Runtime (não confundir)

| Máquina | Precisa |
|---------|---------|
| **PC Principal** | PostgreSQL + `Saves/postgres.env` + app (API `:3001`) |
| **Terminais** | Só o app → API do master |
| ERP | SQL Server (credenciais no painel; sync só no master) |

**Não** usa SQLite (`data.db`) no dia a dia. Postgres no master **não** é só para o updater — é o banco operacional.

Instalação: [ContextoIA/devops/](ContextoIA/devops/README.md) · **sem instalador .exe:** [instalacao_via_repositorio.md](ContextoIA/devops/instalacao_via_repositorio.md).

## Estrutura

| Pasta | Função |
|-------|--------|
| `Frontend/` | UI |
| `Backend/` | Desktop Tauri + API Axum |
| `Backend/supabase/` | Schema SQL |
| `erp-import/` | Sync SQL Server → Postgres |
| `ContextoIA/` | Docs IA |
| `Feedbacks/` | Fila de bugs |
| `Saves/` | `postgres.env`, `client_config.json` (secrets fora do git) |
| `scripts/` | Release / updater |

## Dev

```powershell
cd Backend; cargo check --lib
cd Frontend; npm run build
```

Popular dados: sync ERP (`cargo run --bin run_sync`) + supervisor no setup do app.

# NatumHub

Tauri 2 + React + Axum + **PostgreSQL (Supabase)**.

## Agentes

[AGENTS.md](AGENTS.md) → [ContextoIA/INDEX.md](ContextoIA/INDEX.md)

## Estrutura

| Pasta | Função |
|-------|--------|
| `Frontend/` | UI |
| `Backend/` | Desktop Tauri + API Axum |
| `Backend/supabase/` | Schema SQL |
| `erp-import/` | Sync SQL Server |
| `ContextoIA/` | Docs IA |
| `Feedbacks/` | Fila de bugs |
| `Saves/` | Config local (gitignore secrets) |
| `scripts/` | Release / updater |

## Dev

```powershell
cd Backend; cargo check
cd Frontend; npm run build
```

Popular dados: sync ERP (`cargo run --bin run_sync`) + seed supervisor no app.

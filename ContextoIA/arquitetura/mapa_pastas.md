# Mapa de pastas

Use com [`../INDEX.md`](../INDEX.md).

| Caminho | Conteúdo |
|---------|----------|
| `Frontend/` | UI React + Vite |
| `Backend/` | Tauri + Axum `:3001` → PostgreSQL |
| `Backend/supabase/` | DDL |
| `ContextoIA/` | Docs para agentes |
| `erp-import/` | Queries SQL Server + PASSOS |
| `Feedbacks/feedback.md` | Playbook de bugs (dados no Postgres) |
| `Saves/` | `postgres.env`, `client_config.json` (não versionar secrets) |
| `scripts/` | Release / updater |
| `AGENTS.md` | Skills |
| `.cursor/skills/` | Skills NatumHub |

```
Frontend/src/modules/<area>/<sub>/   ↔   Backend/src/modules/<area>/<sub>/
Backend/src/bin/run_sync.rs
```

Backup = Postgres local (`pg_backup`). Sem nuvem.

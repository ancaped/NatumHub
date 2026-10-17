# Mapa de pastas

Use com [`../INDEX.md`](../INDEX.md).

| Caminho | Conteúdo |
|---------|----------|
| `Frontend/` | UI React + Vite |
| `Backend/` | `nexus-server` Axum `:3001` → PostgreSQL |
| `Backend/supabase/` | DDL |
| `ContextoIA/` | Docs para agentes · [mapa-app.html](mapa-app.html) hub de arquitetura |
| `erp-import/` | Queries SQL Server + PASSOS |
| `Feedbacks/feedback.md` | Playbook de bugs (dados no Postgres) |
| `Saves/` | `postgres.env`, `client_config.json` (não versionar secrets) |
| `scripts/` | Backup, restore, setup de cliente, gerador do mapa |
| `AGENTS.md` | Skills |
| `.cursor/skills/` | Skills do Nexus (`natumhub-*` é o id interno da skill) |

```
Frontend/src/modules/<area>/<sub>/   ↔   Backend/src/modules/<area>/<sub>/
```

Backup = Postgres (`pg_backup`). Sem nuvem.

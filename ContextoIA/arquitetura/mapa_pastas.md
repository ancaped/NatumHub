# Mapa de pastas

Use com [`../INDEX.md`](../INDEX.md).

## Raiz (mínimo)

| Caminho | Conteúdo |
|---------|----------|
| `Frontend/` | UI React + Vite |
| `Backend/` | Tauri + Axum (:3001) → PostgreSQL |
| `Backend/supabase/` | DDL schema |
| `ContextoIA/` | Docs para agentes |
| `erp-import/` | Queries SQL Server + PASSOS |
| `Feedbacks/` | `feedback.md` = playbook IA; `feedback_index.md` = espelho opcional do DB |
| `Saves/` | `postgres.env` (ou legado `supabase.env`), `client_config.json` (não versionar secrets) |
| `scripts/` | Updater / release helpers |
| `AGENTS.md` | Roteamento de skills |
| `.cursor/skills/` | Skills NatumHub |

## Frontend

```
Frontend/src/
├── App.tsx
└── modules/          # espelha Backend
    ├── geral/        # auth, config, http, layout
    ├── producao/
    ├── compras/
    ├── estoque/
    ├── vendas/
    └── financeiro/
```

## Backend

```
Backend/src/
├── lib.rs / main.rs
├── handlers/         # rotas Axum (produção, import, etc.)
├── core/
│   ├── pg_db.rs      # pool PostgreSQL
│   ├── db.rs         # acesso dados
│   ├── legacy_db.rs  # sync ERP
│   └── app_config.rs
├── modules/          # domínio (espelha FE)
└── bin/
    ├── run_sync.rs
    └── regen_feedback_md.rs
```

Banco operacional = **Supabase/PostgreSQL**, não SQLite local.

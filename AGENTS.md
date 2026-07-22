# NatumHub — instruções para agentes de IA

Leia **`ContextoIA/INDEX.md`** antes de explorar o código.

Idioma: **pt-BR**. Escopo mínimo; `cargo check --lib` + `npm run build`. Melhor parte = nenhuma parte.

## Skills (`.cursor/skills/`)

| Skill | Quando |
|-------|--------|
| `natumhub-feedbacks` | Triagem / widget / API feedbacks |
| `natumhub-resolve-bugs` | Corrigir fila Postgres → `awaiting_review` |
| `natumhub-modulos` | Novo módulo / `module_key` / view |
| `natumhub-tasks` | Fila mapa (`/api/mapa/tasks` ou `task.md`) |
| `natumhub-erp-sql` | Sync ERP / `erp-import` / `legacy_db` |
| `natumhub-api` | Rota REST / `apiJson` / auth |

```
Feedbacks admin     → natumhub-feedbacks
Fila de bugs        → Feedbacks/feedback.md + natumhub-resolve-bugs
Fila do mapa        → /api/mapa/tasks (+ task.md) + natumhub-tasks
Módulo novo         → natumhub-modulos
Sync ERP            → natumhub-erp-sql
Rota HTTP           → natumhub-api
Genérico            → ContextoIA/inicio/gemini.md
```

## Docs

| Tema | Onde |
|------|------|
| Índice | `ContextoIA/INDEX.md` |
| Fila de mudanças (mapa) | `/api/mapa/tasks` · export `task.md` |
| Mapa arquitetura | `ContextoIA/arquitetura/mapa-app.html` |
| Auth / rede | `ContextoIA/arquitetura/multi_usuario.md` |
| API | `ContextoIA/api/routes.md` |
| ERP | `erp-import/` |
| Schema | `ContextoIA/banco-dados/database_blueprint.md` + `Backend/supabase/` |
| Bugs | `Feedbacks/feedback.md` |
| Instalação | `ContextoIA/devops/` · `.github/RELEASE.md` |

## Stack

Tauri 2 (PC Principal) + React + Axum `:3001` (API + SPA) + **PostgreSQL** (`Saves/postgres.env`). Clientes: navegador em `http://natumhub.local:3001`. Produção = branch `main`. **Não** SQLite/`data.db`.

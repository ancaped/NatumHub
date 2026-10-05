# Nexus — Instruções para Agentes de IA

O produto se chama **Nexus**. Skills internas ainda usam o prefixo `natumhub-*` (id da pasta). O database PostgreSQL continua `natumhub`. O repositório GitHub continua `ancaped/NatumHub`.

Leia **`ContextoIA/INDEX.md`** antes de explorar o código.

Idioma: **pt-BR**. Escopo mínimo; `cargo check --bin nexus-server --no-default-features` + `npm run build`. Melhor parte = nenhuma parte.

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

## Documentação Principal

| Tema | Onde |
|------|------|
| Índice Geral | `ContextoIA/INDEX.md` |
| Migração CasaOS / Linux | `ContextoIA/devops/migracao_casaos_linux.md` |
| Servidor Headless Axum | `ContextoIA/devops/instalacao_servidor.md` |
| Conectividade Tailscale | `ContextoIA/devops/tailscale.md` |
| Mapa de Arquitetura | `ContextoIA/arquitetura/mapa-app.html` |
| Rotas da API | `ContextoIA/api/routes.md` |
| Esquema do Banco | `ContextoIA/banco-dados/database_blueprint.md` + `Backend/supabase/` |
| Impressão de etiquetas | `ContextoIA/modulos/etiquetas.md` — `PrintModal` é a tela padrão |
| Sync ERP | `erp-import/` |

## Stack Atual

- **Servidor:** Rust Axum `:3001` (API REST + Servidor de arquivos SPA `Frontend/dist`).
- **Frontend:** React + TypeScript + Vite + Tailwind CSS.
- **Acesso:** 100% Web no Navegador via `http://nexus.local:3001` ou IP Tailscale.
- **Banco de Dados:** **PostgreSQL 17** (`Saves/postgres.env`). O database se chama `natumhub`.

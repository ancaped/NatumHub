# ContextoIA — mapa para agentes

**Leia isto primeiro.**

| Prioridade | Arquivo |
|------------|---------|
| 1 | [inicio/gemini.md](inicio/gemini.md) |
| 2 | [../AGENTS.md](../AGENTS.md) |
| 3 | Doc da tarefa abaixo |

## Por tarefa

| Tarefa | Ler |
|--------|-----|
| Auth / dispositivos | [arquitetura/multi_usuario.md](arquitetura/multi_usuario.md) |
| Visão / pastas | [arquitetura/visao_geral.md](arquitetura/visao_geral.md) · [mapa_pastas.md](arquitetura/mapa_pastas.md) |
| Rotas REST | Skill `natumhub-api` + [api/routes.md](api/routes.md) |
| Sync ERP | Skill `natumhub-erp-sql` + [../erp-import/README.md](../erp-import/README.md) |
| Novo módulo | Skill `natumhub-modulos` + [modulos/criacao.md](modulos/criacao.md) |
| Almoxarifado | [modulos/almoxarifado.md](modulos/almoxarifado.md) · mobile [api/mobile_roadmap.md](api/mobile_roadmap.md) |
| Schema DB | [banco-dados/database_blueprint.md](banco-dados/database_blueprint.md) + `Backend/supabase/` |
| Migração Postgres | [banco-dados/migracao_postgres.md](banco-dados/migracao_postgres.md) |
| Bugs | Mencionar [`../Feedbacks/feedback.md`](../Feedbacks/feedback.md) (playbook) + skill `natumhub-resolve-bugs` |
| Feedbacks | Skill `natumhub-feedbacks` + [feedbacks/README.md](feedbacks/README.md) |
| UI | [ui/style_and_ux_guide.md](ui/style_and_ux_guide.md) |
| Releases / instalador | [../.github/RELEASE.md](../.github/RELEASE.md) · [devops/](devops/README.md) |

## Código-chave

```
Frontend/src/App.tsx
Frontend/src/modules/geral/lib/http.ts
Backend/src/lib.rs
Backend/src/core/pg_db.rs
Backend/src/core/legacy_db.rs   # não ler inteiro
Saves/postgres.env
```

## Regras

1. Escopo mínimo; pt-BR nas respostas.
2. Após edits: `cargo check` + `npm run build`.
3. Dados = PostgreSQL; sync ERP via `run_sync` / `POST /api/import/sync`.
4. Não recriar docs por módulo — só ContextoIA / erp-import se contrato mudar.

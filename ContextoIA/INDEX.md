# ContextoIA — mapa para agentes

**Leia isto primeiro.**

| Prioridade | Arquivo |
|------------|---------|
| 1 | [inicio/gemini.md](inicio/gemini.md) |
| 2 | [../AGENTS.md](../AGENTS.md) |
| 3 | [**../task.md**](../task.md) — fila (preferir `/api/mapa/tasks`; skill `natumhub-tasks`) |
| 4 | [**arquitetura/mapa-app.html**](arquitetura/mapa-app.html) + [mapa-app.json](arquitetura/mapa-app.json) · Hub `mapa_arquitetura` |
| 5 | Doc da tarefa abaixo |

## Por tarefa

| Tarefa | Ler |
|--------|-----|
| Fila de mudanças do mapa | `/api/mapa/tasks` · [**../task.md**](../task.md) · skill `natumhub-tasks` |
| Arquitetura / módulos / rotas | Hub **Mapa operacional** · [**mapa-app.html**](arquitetura/mapa-app.html) · JSON · [mapa-curated.json](arquitetura/mapa-curated.json) |
| Novo módulo (SPEC) | Mapa → **Propor** → task.md ou skill `natumhub-modulos` + [modulos/criacao.md](modulos/criacao.md) |
| Auth / dispositivos / browser | [arquitetura/multi_usuario.md](arquitetura/multi_usuario.md) · clientes: `http://natumhub.local:3001` |
| Visão / pastas | [arquitetura/mapa_pastas.md](arquitetura/mapa_pastas.md) · [visao_geral.md](arquitetura/visao_geral.md) |
| Rotas REST | Skill `natumhub-api` + [api/routes.md](api/routes.md) · aba Rotas no mapa |
| Sync ERP | Skill `natumhub-erp-sql` + [../erp-import/README.md](../erp-import/README.md) |
| Almoxarifado | [modulos/almoxarifado.md](modulos/almoxarifado.md) |
| Linha / bases | [modulos/linha_produtos_bases.md](modulos/linha_produtos_bases.md) |
| Schema DB | [banco-dados/database_blueprint.md](banco-dados/database_blueprint.md) + `Backend/supabase/` |
| Bugs | [`../Feedbacks/feedback.md`](../Feedbacks/feedback.md) + skill `natumhub-resolve-bugs` |
| Feedbacks (UI/API) | Skill `natumhub-feedbacks` |
| UI | [ui/style_and_ux_guide.md](ui/style_and_ux_guide.md) |
| Instalação / release | [devops/](devops/) · [devops/instalacao_servidor.md](devops/instalacao_servidor.md) (headless) · [../.github/RELEASE.md](../.github/RELEASE.md) |

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
2. Após edits: `cargo check --lib` + `npm run build`.
3. Dados = **PostgreSQL** (`Saves/postgres.env`). Sync ERP: `run_sync` / `POST /api/import/sync`.
4. **Não** SQLite/`data.db`. **Não** recriar `docs/` por módulo.
5. Melhor parte = nenhuma parte: não adicionar arquivo se um existente cobre.

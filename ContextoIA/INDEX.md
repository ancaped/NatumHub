# ContextoIA — Mapa para Agentes de IA

**Leia isto primeiro.**

| Prioridade | Arquivo |
|------------|---------|
| 1 | [inicio/gemini.md](inicio/gemini.md) |
| 2 | [../AGENTS.md](../AGENTS.md) |
| 3 | [devops/migracao_casaos_linux.md](devops/migracao_casaos_linux.md) |
| 4 | [**arquitetura/mapa-app.html**](arquitetura/mapa-app.html) + [mapa-app.json](arquitetura/mapa-app.json) |
| 5 | Doc da tarefa abaixo |

## Por Tarefa

| Tarefa | Ler |
|--------|-----|
| Servidor / CasaOS / Linux | [devops/migracao_casaos_linux.md](devops/migracao_casaos_linux.md) · [devops/instalacao_servidor.md](devops/instalacao_servidor.md) |
| Rede / Tailscale | [devops/tailscale.md](devops/tailscale.md) · [arquitetura/multi_usuario.md](arquitetura/multi_usuario.md) · `http://nexus.local:3001` |
| Arquitetura / módulos / rotas | Hub **Mapa operacional** · [**mapa-app.html**](arquitetura/mapa-app.html) · [api/routes.md](api/routes.md) |
| Novo módulo (SPEC) | Mapa → **Propor** → task.md ou skill `natumhub-modulos` + [modulos/criacao.md](modulos/criacao.md) |
| Sync ERP | Skill `natumhub-erp-sql` + [../erp-import/README.md](../erp-import/README.md) |
| Almoxarifado | [modulos/almoxarifado.md](modulos/almoxarifado.md) |
| Linha / bases | [modulos/linha_produtos_bases.md](modulos/linha_produtos_bases.md) |
| Schema DB | [banco-dados/database_blueprint.md](banco-dados/database_blueprint.md) + `Backend/supabase/` |
| Bugs / Feedbacks | [`../Feedbacks/feedback.md`](../Feedbacks/feedback.md) + skill `natumhub-resolve-bugs` |
| UI & UX | [ui/style_and_ux_guide.md](ui/style_and_ux_guide.md) |

## Código-chave

```
Frontend/src/App.tsx
Frontend/src/modules/geral/lib/http.ts
Backend/src/server.rs
Backend/src/main.rs
Backend/src/core/app_config.rs
Saves/postgres.env
```

## Regras Canônicas

1. Escopo mínimo; pt-BR nas respostas.
2. Após edits: `cargo check --bin nexus-server --no-default-features` + `npm run build`.
3. Dados = **PostgreSQL 17** (`Saves/postgres.env`).
4. Clientes acessam pelo navegador (`http://nexus.local:3001`). Servidor: `nexus-server`.
5. Dados em PostgreSQL 17 (`Saves/postgres.env`). O database se chama `natumhub`.
6. Nome do produto nos textos: **Nexus**.
7. Melhor parte = nenhuma parte: não adicionar arquivo se um existente cobre.

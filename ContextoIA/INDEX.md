# ContextoIA — Índice (leia primeiro)

Documentação **compacta** para IAs. Não leia o repositório inteiro — use este mapa.

## Estrutura de pastas

| Pasta | Conteúdo |
|-------|----------|
| [`inicio/`](inicio/README.md) | Playbook, manifesto, regras gerais |
| [`arquitetura/`](arquitetura/README.md) | Visão do sistema, multi-usuário, mapa de pastas |
| [`api/`](api/README.md) | Rotas REST, comandos Tauri legados |
| [`banco-dados/`](banco-dados/README.md) | Schema SQLite (`data.db`) |
| [`erp-import/`](erp-import/README.md) | Sync ERP SQL Server → SQLite |
| [`modulos/`](modulos/README.md) | Criação e extensão de módulos |
| [`ui/`](ui/README.md) | Tailwind, UX, null-safety |
| [`devops/`](devops/README.md) | Git, GitHub, releases |
| [`feedbacks/`](feedbacks/README.md) | Triagem de bugs e fila para agentes |

## Skills (agentes Cursor)

Especialidades em [`.cursor/skills/`](../.cursor/skills/) — roteamento em [`AGENTS.md`](../AGENTS.md).

| Skill | Tarefa |
|-------|--------|
| `natumhub-feedbacks` | Triagem admin, widget, API feedbacks |
| `natumhub-resolve-bugs` | Executar fila, corrigir bugs, `resolucao.md` |
| `natumhub-modulos` | Criar submódulo FE + BE |
| `natumhub-erp-sql` | Sync ERP, queries SQL |
| `natumhub-api` | Rotas REST, `apiJson`/`hubJson` |

## Ordem de leitura por tarefa

| Tarefa | Ler (nesta ordem) |
|--------|-------------------|
| **Qualquer alteração** | [`inicio/gemini.md`](inicio/gemini.md) |
| **Auth, rede, PC principal, notificações** | [`arquitetura/multi_usuario.md`](arquitetura/multi_usuario.md) |
| **Arquitetura / visão geral** | [`arquitetura/visao_geral.md`](arquitetura/visao_geral.md) |
| **Bugs pendentes** | Skill `natumhub-resolve-bugs` + [`../Feedbacks/feedback.md`](../Feedbacks/feedback.md) |
| **Triagem feedbacks** | Skill `natumhub-feedbacks` + [`feedbacks/README.md`](feedbacks/README.md) |
| **Nova rota / API REST** | Skill `natumhub-api` + [`api/routes.md`](api/routes.md) |
| **Sync ERP SQL→SQLite** | Skill `natumhub-erp-sql` + [`erp-import/README.md`](erp-import/README.md) |
| **Criar ou estender módulo** | Skill `natumhub-modulos` + [`modulos/criacao.md`](modulos/criacao.md) |
| **Schema SQLite** | [`banco-dados/database_blueprint.md`](banco-dados/database_blueprint.md) §8 hub + doc do módulo |
| **UI / Tailwind** | [`ui/style_and_ux_guide.md`](ui/style_and_ux_guide.md) |
| **Invoke Tauri legado** | [`api/tauri_commands.md`](api/tauri_commands.md) — preferir REST |

## Arquivos-chave (código)

```
Frontend/src/App.tsx                          # Hub, rotas, ErrorBoundary
Frontend/src/modules/geral/lib/http.ts        # apiFetch, apiJson, Bearer
Frontend/src/modules/geral/lib/auth.ts        # Operadores, sessão
Frontend/src/modules/geral/lib/connectionConfig.ts  # master/client, deviceId
Frontend/src/modules/geral/lib/modules/registry.ts    # Chaves de módulo (FE)
Backend/src/lib.rs                            # Axum router, Tauri setup
Backend/src/modules/geral/auth/               # Middleware, operadores
Backend/src/modules/geral/auth/modules_registry.rs  # Chaves de módulo (BE)
Backend/src/core/legacy_db.rs                 # Sync ERP (impl)
Saves/data.db                                 # SQLite master
Saves/client_config.json                      # appMode, apiOrigin, deviceId
```

## Regras de custo (tokens)

1. **Não** reler `legacy_db.rs` inteiro — use `erp-import/sql/` e `PASSOS.md`.
2. **Não** listar todas as rotas no chat — apontar para `api/routes.md`.
3. Docs por módulo: `Frontend|Backend/src/modules/<area>/<sub>/docs/README.md` — só o módulo afetado.
4. Respostas ao usuário em **pt-BR**; código/identificadores em inglês (Rust/TS).
5. Após edits: `cargo check` (Backend) + `npm run build` (Frontend).

## Versão

`0.0.11` — master único, clientes finos, auth operador, notificações por módulo. Uma versão Estável na rede.

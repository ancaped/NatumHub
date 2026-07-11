# NatumHub — instruções para agentes de IA

Leia **`ContextoIA/INDEX.md`** antes de explorar o código.

Idioma das respostas: **pt-BR**. Escopo mínimo; validar com `cargo check` e `npm run build`.

---

## Skills do projeto (especialidades)

Skills em **`.cursor/skills/`** — **leia o `SKILL.md` correspondente imediatamente** quando a tarefa combinar com os gatilhos abaixo.

| Skill | Arquivo | Use quando o usuário ou a tarefa envolver… |
|-------|---------|---------------------------------------------|
| **natumhub-feedbacks** | [`.cursor/skills/natumhub-feedbacks/SKILL.md`](.cursor/skills/natumhub-feedbacks/SKILL.md) | Triagem admin, widget de feedback, prioridade, status, gestão de reports, `FeedbacksAdminPanel` |
| **natumhub-resolve-bugs** | [`.cursor/skills/natumhub-resolve-bugs/SKILL.md`](.cursor/skills/natumhub-resolve-bugs/SKILL.md) | Resolver bug, executar fila, corrigir feedback, analisar `Feedbacks/feedback.md`, preencher `resolucao.md` |
| **natumhub-modulos** | [`.cursor/skills/natumhub-modulos/SKILL.md`](.cursor/skills/natumhub-modulos/SKILL.md) | Novo módulo/submódulo, `module_key`, permissões, view no hub, registry FE/BE |
| **natumhub-erp-sql** | [`.cursor/skills/natumhub-erp-sql/SKILL.md`](.cursor/skills/natumhub-erp-sql/SKILL.md) | Sync ERP, SQL Server, `legacy_db`, `erp-import/sql`, passos A–N, agenda de sync |
| **natumhub-api** | [`.cursor/skills/natumhub-api/SKILL.md`](.cursor/skills/natumhub-api/SKILL.md) | Nova rota REST, endpoint Axum, `apiJson`/`hubJson`, auth 401/403 |

### Roteamento rápido

```
Feedback / triagem admin     → natumhub-feedbacks
Corrigir bug da fila         → natumhub-resolve-bugs  (+ ler Feedbacks/feedback.md)
Criar tela ou módulo novo    → natumhub-modulos
Importação ou query ERP      → natumhub-erp-sql
Rota HTTP ou cliente API     → natumhub-api
Tarefa genérica / dúvida     → ContextoIA/inicio/gemini.md
```

Múltiplas skills podem aplicar (ex.: bug no sync ERP → `natumhub-resolve-bugs` + `natumhub-erp-sql`).

---

## Mapa de documentação

| Tema | Caminho |
|------|---------|
| Índice IA | `ContextoIA/INDEX.md` |
| Playbook | `ContextoIA/inicio/gemini.md` |
| Arquitetura | `ContextoIA/arquitetura/` |
| Auth / rede / notificações | `ContextoIA/arquitetura/multi_usuario.md` |
| API REST (referência) | `ContextoIA/api/routes.md` |
| Sync ERP (referência) | `ContextoIA/erp-import/README.md` → `erp-import/` |
| Schema SQLite | `ContextoIA/banco-dados/database_blueprint.md` |
| Criar módulo (referência) | `ContextoIA/modulos/criacao.md` |
| Feedbacks (referência) | `ContextoIA/feedbacks/README.md` |
| Bugs pendentes (fila viva) | `Feedbacks/feedback.md` |

---

## Stack (lembrete)

Tauri 2 + React + Rust Axum (:3001) + SQLite `Saves/data.db` · PC Principal (`master`) + Secundários (`client`) · Auth operador local com Bearer token.

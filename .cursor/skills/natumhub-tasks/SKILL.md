---
name: natumhub-tasks
description: >-
  Executa a fila canônica do Nexus: preferir GET /api/mapa/tasks?status=open
  (Postgres); senão task.md. Aplica mudanças nos targets (version_bump,
  module_curated, module_spec, generic), marca done via PATCH + activity e
  exporta task.md se pedido. Use quando o usuário mencionar task.md, @task.md,
  "executa as tasks", "fila do mapa" ou colar conteúdo da task queue.
---

# Nexus — Skill: Task queue (API + `task.md`)

## Quando usar

- Usuário menciona `task.md`, `@task.md`, “faz a fila”, “executa Open”
- Conteúdo colado com heading `# Nexus — Task queue`
- Tasks criadas no Hub **Mapa operacional** / `POST /api/mapa/modules`

## Fonte da verdade

1. **API / Banco de Dados (Master `:3001` ou `:3002`):**
   - `GET /api/mapa/tasks?status=open`
   - Ao concluir: `PATCH /api/mapa/tasks/:id` com `{ "status": "done", "notes": "…" }` (grava activity `ai_implemented`)
2. **Conceito no ai-memory:** `concepts/fila-tarefas-mapa.md`

UI: Hub view `mapa_arquitetura`.

## Protocolo

1. Listar Open (API ou `## Open` no md).
2. Executar **na ordem**.
3. Respeitar **Type**, **Payload**, **Targets**, **Acceptance** — sem inventar escopo.
4. Ao concluir:
   - API: `PATCH` done (+ nota curta)
   - md: `Status: done`, Done at, mover bloco para **Done**
5. Se acceptance pedir `npm run map:arch`, rodar.
6. Resumir em pt-BR.

## Types

| Type | Ação |
|------|------|
| `version_bump` | Alinhar versão `payload.to` nos `Targets` |
| `module_curated` | Atualizar `mapa-curated.json` + `npm run map:arch` |
| `module_spec` | Checklist `natumhub-modulos` (SPEC no payload) |
| `generic` | Title + Notes + Targets |

## Regras

- Nunca apagar histórico Done (md)
- Não criar commits a menos que o usuário peça
- Idioma pt-BR; escopo mínimo

---
name: natumhub-feedbacks
description: >-
  Gerencia o sistema de feedbacks do Nexus: triagem admin, prioridades,
  status, widget de envio, API /api/hub/feedbacks e tabelas PostgreSQL
  feedbacks/feedback_notes. Use quando o usuário pedir feedback, triagem,
  gestão de reports, prioridade ou alterações no FeedbackWidget/FeedbacksAdminView.
---

# Nexus — Skill: Feedbacks

## Quando usar

Triagem admin, alterar fluxo de envio, API de feedbacks, ou schema das tabelas de feedback.  
**Para corrigir bugs da fila**, use a skill `natumhub-resolve-bugs`.

## Ler primeiro

1. Playbook no ai-memory: `concepts/fluxo-feedbacks-playbook.md` (`memory_read_page`)
2. Código: `Backend/src/modules/geral/feedbacks/`, `Frontend/src/modules/geral/components/FeedbackWidget.tsx`, `Frontend/src/modules/geral/feedbacks/FeedbacksAdminView.tsx`

## Fluxo do sistema

| Papel | Ação |
|-------|------|
| Operador | Widget flutuante → envia bug/sugestão (precisa estar logado) |
| Backend | Grava **só PostgreSQL** (`feedbacks`) e audita (`producao_auditoria`, ação `feedback_*`) |
| Supervisor | Perfil → **Desenvolvimento** → Fila de Demandas |
| Agente | `fila` → `detalhar` → corrige → `resolver` (2 passos) → `awaiting_review` |
| Supervisor | Aba **Em aberto** → Finalizar (`resolved`) ou `devolver` com nota |

**Não** criar pastas `Feedbacks/feedback_<id>/` nem espelho `.md`: a fila vive no banco.

## Triagem: a conversa do Feedback reparte o trabalho

1. Supervisor aprova a triagem na central Desenvolvimento (`pending` → `queued`).
2. A conversa do Feedback chama `GET /api/hub/feedbacks/triagem` (uma chamada): vem agrupado por conversa especialista (mapa `conversa_do_modulo` em `feedbacks/acoes.rs`, que segue a tabela "uma conversa por módulo" do `AGENTS.md`), com `briefing` pronto.
3. Com o ok do Edson, manda cada `briefing` à conversa dona (SendMessage) ou entrega o texto para ele colar. Relato sem dono fica com a conversa do Feedback.
4. A conversa dona lê o relato (`GET /:id?print=false`), corrige, entrega com `resolver` (2 passos); o supervisor aprova.

Se a tabela de módulos do `AGENTS.md` mudar, atualize `conversa_do_modulo` e o teste dele.

## Status e prioridade

| Status | Aba |
|--------|-----|
| `pending` | Triagem |
| `queued` / `in_progress` / `planned` | Fila |
| `awaiting_review` | Em aberto (conferência) |
| `wont_fix` | Reprovados |
| `resolved` | Finalizados |

Prioridade: **menor número = mais urgente**.

## API

Todas exigem sessão (a rota é pública no middleware, a checagem é em `feedbacks/handlers.rs`).

| Método | Rota | Quem |
|--------|------|------|
| POST | `/api/hub/feedbacks` | Qualquer sessão válida (enviar) |
| GET | `/api/hub/feedbacks/manage` | Ler: supervisor ou quem tem `hub_settings` |
| GET | `/api/hub/feedbacks/fila` | Ler (JSON enxuto; `status`, `modulo`, `limite`) |
| GET | `/api/hub/feedbacks/:id` | Ler (`?print=false` omite a imagem) |
| PUT | `/api/hub/feedbacks/:id` | Supervisor |
| POST | `/api/hub/feedbacks/:id/notes` | Editar (`hub_settings` em editar) |
| GET | `/api/hub/feedbacks/triagem` | Ler; fila pronta (`queued`,`in_progress`) agrupada por conversa dona, com `briefing` pronto |
| POST | `/api/hub/feedbacks/:id/resolver` | Editar; 2 passos (`confirmar=true`), nota obrigatória |
| POST | `/api/hub/feedbacks/:id/devolver` | Supervisor; 2 passos, nota obrigatória |
| POST | `/api/hub/feedbacks/reorder` | Supervisor |

Serviços reutilizáveis em `feedbacks/acoes.rs` (catálogo de ações para agentes: `listar_fila_feedbacks`, `detalhar_feedback`, `resolver_feedback`, `devolver_feedback`).

Frontend: `api.submitFeedback`, `getFeedbacksManage`, `getFeedbackDetail`, `updateFeedback`, `addFeedbackNote`, `reorderFeedbacks` em `geral/lib/api.ts`.

## Regras

- Fonte de verdade = Postgres (`feedbacks` / `feedback_notes`). Playbook no ai-memory: `concepts/fluxo-feedbacks-playbook.md`.
- Solicitante vem de `AuthContext.display_name` no submit.
- Mudar status/prioridade e reordenar: **supervisor**. Agente só entrega para conferência (`resolver`).
- `awaiting_review` exige nota em `feedback_notes`.
- Após mudanças: `cargo check` + `npm run build`.
- Escopo mínimo; respostas em **pt-BR**.

## Checklist de entrega

- [ ] Status/prioridade refletem no Postgres (e no painel admin)
- [ ] Gestão só pela central Desenvolvimento
- [ ] Widget só envia (sem lista/resolver)
- [ ] Contrato API: consultar e atualizar `concepts/api-routes.md` no ai-memory se mudou

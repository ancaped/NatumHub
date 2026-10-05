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

1. Playbook: `Feedbacks/feedback.md`
2. Código: `Backend/src/modules/geral/feedbacks/`, `Frontend/src/modules/geral/components/FeedbackWidget.tsx`, `Frontend/src/modules/geral/feedbacks/FeedbacksAdminView.tsx`

## Fluxo do sistema

| Papel | Ação |
|-------|------|
| Operador | Widget flutuante → envia bug/sugestão |
| Backend | Grava **só PostgreSQL** (`feedbacks`) |
| Admin | Perfil → **Gestão de Feedbacks** |
| Agente | SQL na fila → nota de resolução → `awaiting_review` |
| Supervisor | Aba **Em aberto** → Finalizar (`resolved`) ou devolver |

**Não** criar pastas `Feedbacks/feedback_<id>/`.

## Status e prioridade

| Status | Aba |
|--------|-----|
| `pending` | Triagem |
| `queued` / `in_progress` | Fila |
| `awaiting_review` | Em aberto (conferência) |
| `wont_fix` | Reprovados |
| `resolved` | Finalizados |

Prioridade: **menor número = mais urgente**.

## API

| Método | Rota | Quem |
|--------|------|------|
| POST | `/api/hub/feedbacks` | Autenticado (submit) |
| GET | `/api/hub/feedbacks/manage` | Admin |
| GET | `/api/hub/feedbacks/:id` | Admin |
| PUT | `/api/hub/feedbacks/:id` | Admin |
| POST | `/api/hub/feedbacks/:id/notes` | Admin |
| POST | `/api/hub/feedbacks/reorder` | Admin |

Frontend: `api.submitFeedback`, `getFeedbacksManage`, `getFeedbackDetail`, `updateFeedback`, `addFeedbackNote`, `reorderFeedbacks` em `geral/lib/api.ts`.

## Regras

- Fonte de verdade = Postgres (`feedbacks` / `feedback_notes`). Playbook: `Feedbacks/feedback.md`.
- Solicitante vem de `AuthContext.display_name` no submit.
- Gestão admin: **somente** `role === 'admin'`.
- `awaiting_review` exige nota em `feedback_notes`.
- Após mudanças: `cargo check` + `npm run build`.
- Escopo mínimo; respostas em **pt-BR**.

## Checklist de entrega

- [ ] Status/prioridade refletem no Postgres (e no painel admin)
- [ ] Admin panel só no dropdown do perfil
- [ ] Widget sem lista/resolver (só envio)
- [ ] Contrato API: atualizar `ContextoIA/api/routes.md` se mudou

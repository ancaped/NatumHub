---
name: natumhub-feedbacks
description: >-
  Gerencia o sistema de feedbacks do NatumHub: triagem admin, prioridades,
  status, widget de envio, API /api/hub/feedbacks e arquivos em Feedbacks/.
  Use quando o usuário pedir feedback, triagem, gestão de reports, prioridade
  ou alterações no FeedbackWidget/FeedbacksAdminView.
---

# NatumHub — Skill: Feedbacks

## Quando usar

Triagem admin, alterar fluxo de envio, API de feedbacks, ou estrutura de arquivos `Feedbacks/`.  
**Para corrigir bugs da fila**, use a skill `natumhub-resolve-bugs`.

## Ler primeiro

1. `ContextoIA/feedbacks/README.md`
2. `Feedbacks/feedback.md` (índice vivo)
3. Código: `Backend/src/modules/geral/feedbacks/`, `Frontend/src/modules/geral/components/FeedbackWidget.tsx`, `Frontend/src/modules/geral/feedbacks/FeedbacksAdminView.tsx`

## Fluxo do sistema

| Papel | Ação |
|-------|------|
| Operador | Widget flutuante → envia bug/sugestão |
| Backend | Grava SQLite + pasta `Feedbacks/feedback_<id>/` |
| Admin | Perfil → **Gestão de Feedbacks** → aba `hub_feedbacks` |
| Agente | Lê `feedback.md` + pastas (skill resolve-bugs) |

## Status e prioridade

| Status | Uso |
|--------|-----|
| `pending` | Aguardando triagem |
| `queued` / `in_progress` | Fila de execução |
| `wont_fix` | Não resolver |
| `resolved` | Concluído |

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

## Arquivos gerados por feedback

```
Feedbacks/feedback_<id>/
├── feedback.json
├── triagem.md
├── notas_historico.md
├── logs.txt
├── screenshot.png
└── resolucao.md   # ao resolver
```

`sync_feedback_md` regenera `Feedbacks/feedback.md` — não editar manualmente o índice.

## Regras

- Solicitante vem de `AuthContext.display_name` no submit — não pedir ao operador.
- Gestão admin: **somente** `role === 'admin'`.
- Após mudanças: `cargo check` + `npm run build`.
- Escopo mínimo; respostas em **pt-BR**.

## Checklist de entrega

- [ ] Status/prioridade refletem em `feedback.md` e pasta do ID
- [ ] Admin panel só no dropdown do perfil
- [ ] Widget sem lista/resolver (só envio)
- [ ] Doc atualizada se contrato API mudou (`ContextoIA/feedbacks/`)

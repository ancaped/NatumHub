# Resolução — Feedback d031d931

**Status:** Finalizado  
**Data:** 2026-07-11

## Descrição da resolução

Redesign do fluxo de status na Gestão de Feedbacks:

| Antes | Depois |
| --- | --- |
| Triagem (novos) | **Triagem** — novos do usuário; supervisor aprova ou reprova |
| Fila de execução | **Fila** — aprovados ou devolvidos de Em aberto |
| Em aberto (confuso) | **Em aberto** (`awaiting_review`) — correção do agente aguardando conferência |
| Não resolver | **Reprovados** |
| Resolvidos | **Finalizados** |

### Backend
- Novo status `awaiting_review` na ordenação e em `sync_feedback_md`
- Validação: devolver de Em aberto → Fila exige pelo menos uma nota do supervisor
- Instruções atualizadas em `triagem.md`

### Frontend (`FeedbacksAdminView.tsx`)
- Abas renomeadas: Triagem, Fila, Em aberto, Reprovados, Finalizados
- Filtro por tipo: Todos / Bugs / Sugestões
- Ações rápidas: Aprovar para fila, Enviar para conferência, Finalizar, Devolver à fila

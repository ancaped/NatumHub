# Feedbacks — triagem e execução por IAs

## Fluxo

1. **Operador** envia pelo widget flutuante (canto inferior direito).
2. Backend grava SQLite + pasta `Feedbacks/feedback_<id>/`.
3. **Admin** triagem em **Perfil → Gestão de Feedbacks** (aba dedicada `hub_feedbacks`, não modal).
4. **Agente IA** lê [`../../Feedbacks/feedback.md`](../../Feedbacks/feedback.md) e executa pela fila.

## Status

| Status | Significado |
|--------|-------------|
| `pending` | Aguardando triagem admin |
| `queued` / `in_progress` | Será resolvido — fila prioritária |
| `wont_fix` | Não será resolvido |
| `resolved` | Concluído |

Prioridade: **menor número = mais urgente**.

## Arquivos gerados

```
Feedbacks/
├── feedback.md              # Índice auto-gerado (Fila, Triagem, Não resolver, Resolvidos)
└── feedback_<id>/
    ├── feedback.json        # Metadados (solicitante, data/hora, status, prio)
    ├── triagem.md           # Notas admin + instrução para agente
    ├── notas_historico.md   # Histórico de notas admin (append-only)
    ├── logs.txt             # Console capturado
    ├── screenshot.png       # (se houver)
    └── resolucao.md         # Preencher ao concluir
```

## API

| Método | Rota | Quem |
|--------|------|------|
| POST | `/api/hub/feedbacks` | Qualquer autenticado |
| GET | `/api/hub/feedbacks/manage` | Admin |
| GET | `/api/hub/feedbacks/:id` | Admin — detalhe + notas |
| PUT | `/api/hub/feedbacks/:id` | Admin — status/prioridade |
| POST | `/api/hub/feedbacks/:id/notes` | Admin — adicionar nota |
| POST | `/api/hub/feedbacks/reorder` | Admin |

Código: `Backend/src/modules/geral/feedbacks/`

## Para agentes

1. Abrir `Feedbacks/feedback.md` — seção **Fila de execução**.
2. Entrar na pasta do ID (menor `Prio` primeiro).
3. Ler `triagem.md`, `logs.txt`, `screenshot.png`.
4. Corrigir código; preencher `resolucao.md`.
5. Admin marca `resolved` no painel (ou agente documenta no PR).

Playbook geral: [`../inicio/gemini.md`](../inicio/gemini.md) § Feedbacks

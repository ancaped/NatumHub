# Feedbacks — triagem e execução (PostgreSQL)

Fonte de verdade: tabelas `feedbacks` e `feedback_notes` no Postgres.  
**Não** usar pastas `Feedbacks/feedback_<id>/`.  

**Playbook da IA:** [`../../Feedbacks/feedback.md`](../../Feedbacks/feedback.md)  

**Conexão:**
- Dev (repo): `C:\api\Saves\postgres.env`
- App Estável instalado: `%LOCALAPPDATA%\NatumHub\Saves\postgres.env`
- App Dev instalado: `%LOCALAPPDATA%\NatumHub Dev\Saves\postgres.env`

Espelho opcional da fila: `Feedbacks/feedback_index.md` (não é o contrato do agente).

## Fluxo

1. **Operador** envia pelo widget flutuante.
2. Backend grava só no PostgreSQL (`status = pending`).
3. **Admin** triagem em **Perfil → Gestão de Feedbacks** → aprova para **Fila** (`queued`).
4. **Agente IA** consulta a fila no banco, corrige o código, grava nota de resolução e move para **Em aberto** (`awaiting_review`).
5. **Supervisor** na aba Em aberto confere e **Finaliza** (`resolved`) ou devolve à fila (com nota).

## Status

| Status | Aba UI | Significado |
|--------|--------|-------------|
| `pending` | Triagem | Aguarda aprovação admin |
| `queued` / `in_progress` | Fila | Agente deve executar |
| `awaiting_review` | Em aberto | Agente concluiu; supervisor confere |
| `wont_fix` | Reprovados | Não será feito |
| `resolved` | Finalizados | Supervisor fechou |

Prioridade: **menor número = mais urgente**.

## Tabelas

```sql
-- Fila para agentes
SELECT id, priority, type, description, page, logs, screenshot, admin_notes, requested_by, "createdAt"
FROM feedbacks
WHERE status IN ('queued', 'in_progress')
ORDER BY priority ASC, "createdAt" ASC;

-- Detalhe + notas
SELECT * FROM feedbacks WHERE id = $<id>;
SELECT id, author, body, created_at FROM feedback_notes
WHERE feedback_id = $<id> ORDER BY created_at ASC;

-- Após corrigir: nota de resolução + Em aberto
INSERT INTO feedback_notes (id, feedback_id, author, body)
VALUES (gen_random_uuid()::text, $<id>, 'IA', $resolucao);

UPDATE feedbacks
SET status = 'awaiting_review',
    admin_notes = COALESCE(admin_notes || E'\n\n', '') || $resolucao
WHERE id = $<id> AND status IN ('queued', 'in_progress');
```

Screenshot/logs vêm das colunas `screenshot` (data URL/base64) e `logs` em `feedbacks`.

## Painel admin (app)

Em **Gestão de Feedbacks → Detalhe** o supervisor vê:

- Descrição e metadados
- Card **Resolução da IA** (últimanota com author `IA` / agente)
- Screenshot (ampliável) e logs do console
- Histórico completo de notas (IA vs supervisor)

A listagem mostra ícones de screenshot/logs e a contagem de notas (sem carregar base64 pesado).

## API (admin / app)

| Método | Rota | Quem |
|--------|------|------|
| POST | `/api/hub/feedbacks` | Autenticado (submit) |
| GET | `/api/hub/feedbacks/manage` | Admin |
| GET | `/api/hub/feedbacks/:id` | Admin — detalhe + notas |
| PUT | `/api/hub/feedbacks/:id` | Admin — status/prioridade |
| POST | `/api/hub/feedbacks/:id/notes` | Admin — adicionar nota |
| POST | `/api/hub/feedbacks/reorder` | Admin |

Mover para `awaiting_review` **exige** pelo menos uma nota em `feedback_notes`.

Código: `Backend/src/modules/geral/feedbacks/`

## Para agentes (obrigatório)

1. Listar fila no Postgres (`queued` / `in_progress`, menor `priority`).
2. Ler `description`, `page`, `logs`, `screenshot`, `admin_notes` e notas.
3. Corrigir código; `cargo check` + `npm run build`.
4. Inserir comentário de resolução em `feedback_notes`.
5. Atualizar status para `awaiting_review` (**não** `resolved` — isso é do supervisor).
6. Informar o usuário que o item ficou em **Em aberto** para conferência.

Skill: `natumhub-resolve-bugs` · playbook: [`../inicio/gemini.md`](../inicio/gemini.md)

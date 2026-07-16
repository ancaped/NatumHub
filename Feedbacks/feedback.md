# NatumHub — Playbook de Feedbacks (agentes IA)

> **Gatilho:** `@Feedbacks/feedback.md` ou “resolver a fila”.  
> Fonte de dados = **PostgreSQL** (tabelas abaixo). **Não** use pastas `Feedbacks/feedback_<id>/`.

Skill: `natumhub-resolve-bugs`

---

## Onde estão os feedbacks (caminho certo)

| O quê | Onde |
|-------|------|
| Tabelas | `public.feedbacks` e `public.feedback_notes` |
| Conexão (dev neste PC) | Arquivo **`C:\api\Saves\postgres.env`** → linha `DATABASE_URL=...` |
| Conexão (app instalado / PC Principal) | **`%LOCALAPPDATA%\NatumHub\Saves\postgres.env`** (Estável) ou **`%LOCALAPPDATA%\NatumHub Dev\Saves\postgres.env`** (Dev) |

### Como o agente acessa (obrigatório)

1. Ler `DATABASE_URL` de `C:\api\Saves\postgres.env` (neste workspace).
2. Consultar/alterar via **psql**, script, ou MCP Supabase `execute_sql` **se** o projeto remoto for o mesmo banco. Neste repo a produção atual é **Postgres local** (`127.0.0.1:5432/natumhub`).
3. Exemplo PowerShell:

```powershell
# Lê a URL e lista a fila
$u = (Get-Content C:\api\Saves\postgres.env | Where-Object { $_ -match '^DATABASE_URL=' }) -replace '^DATABASE_URL=',''
# psql $u -c "SELECT id, priority, status, LEFT(description,80) FROM feedbacks WHERE status IN ('queued','in_progress') ORDER BY priority;"
```

**IDs:** use o UUID completo da coluna `feedbacks.id` (a UI mostra só 8 caracteres).

---

## Objetivo

Itens em **Fila** (`queued` / `in_progress`) → corrigir código → **nota** em `feedback_notes` (author=`IA`) → status **`awaiting_review`** (aba Em aberto).  
Supervisor finaliza com `resolved`. **Agente nunca marca `resolved`.**

## Fluxo

```
1. SELECT fila (SQL abaixo)
2. Um item (menor priority) — ou o ID pedido
3. Ler description, page, logs, screenshot, admin_notes + notes
4. Fix mínimo no código
5. cargo check --lib  +  npm run build (Frontend)
6. INSERT feedback_notes + UPDATE awaiting_review
7. Responder em pt-BR
```

---

## SQL

```sql
-- Fila
SELECT id, priority, type, description, page, logs,
       CASE WHEN length(screenshot) > 0 THEN true ELSE false END AS has_screenshot,
       admin_notes, requested_by, status, "createdAt"
FROM feedbacks
WHERE status IN ('queued', 'in_progress')
ORDER BY priority ASC, "createdAt" ASC
LIMIT 20;

-- Detalhe
SELECT id, type, description, page, logs, screenshot, status, priority,
       admin_notes, requested_by, "createdAt"
FROM feedbacks WHERE id = $<uuid>;

SELECT id, author, body, created_at
FROM feedback_notes WHERE feedback_id = $<uuid>
ORDER BY created_at ASC;

-- Fechar trabalho do agente
INSERT INTO feedback_notes (id, feedback_id, author, body)
VALUES (gen_random_uuid()::text, $<uuid>, 'IA', $<texto>);

UPDATE feedbacks
SET status = 'awaiting_review'
WHERE id = $<uuid> AND status IN ('queued', 'in_progress');
```

### Template da nota

```text
Resolução — YYYY-MM-DD HH:MM
Causa: …
Correção: …
Arquivos: …
Validação: cargo check ✓ · npm run build ✓
```

---

## Status

| Status | Aba | Quem |
|--------|-----|------|
| `pending` | Triagem | Supervisor |
| `queued` / `in_progress` | Fila | **IA** |
| `awaiting_review` | Em aberto | Supervisor |
| `resolved` | Finalizados | Supervisor |
| `wont_fix` | Reprovados | Supervisor |

Menor `priority` = mais urgente.

---

## Regras

- Sem pastas `feedback_<id>/` nem `resolucao.md`.
- FE HTTP: `apiFetch` / `apiJson` / `hubJson`.
- pt-BR, escopo mínimo.

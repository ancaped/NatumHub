---
name: natumhub-resolve-bugs
description: >-
  Resolve bugs do Nexus a partir da fila no PostgreSQL (feedbacks com status
  queued/in_progress): lê logs/screenshot no banco, corrige código FE/BE, grava
  nota de resolução e marca awaiting_review (Em aberto). Use quando o usuário
  pedir resolver bug, corrigir feedback, executar fila ou analisar report pendente.
---

# Nexus — Skill: Resolver Bugs

## Quando usar

Executar correções a partir da **fila de feedbacks no banco** (ou ID pedido pelo usuário).

## Workflow (obrigatório)

```
- [ ] 1. Consultar Postgres: status IN ('queued','in_progress') ORDER BY priority ASC
- [ ] 2. Escolher menor priority (ou ID pedido)
- [ ] 3. Ler description, page, logs, screenshot, admin_notes + feedback_notes
- [ ] 4. Reproduzir mentalmente: página, logs, descrição
- [ ] 5. Localizar código (mapa no ai-memory: `concepts/arquitetura-geral.md`)
- [ ] 6. Fix mínimo — seguir convenções do módulo vizinho
- [ ] 7. cargo check + npm run build
- [ ] 8. INSERT em feedback_notes com o texto de resolução (author = 'IA')
- [ ] 9. UPDATE feedbacks SET status = 'awaiting_review' (vai para Em aberto)
- [ ] 10. Informar o usuário: item em Em aberto para conferencia/finalização
```

**Não** marcar `resolved` — isso é do supervisor na aba Em aberto.  
**Não** usar pastas `Feedbacks/feedback_<id>/` nem `resolucao.md`.

## SQL de referência

```sql
-- Fila
SELECT id, priority, type AS feedback_type, description, page, logs,
       LEFT(screenshot, 80) AS screenshot_preview, admin_notes, requested_by
FROM feedbacks
WHERE status IN ('queued', 'in_progress')
ORDER BY priority ASC, "createdAt" ASC
LIMIT 20;

-- Fechar trabalho do agente (após INSERT da nota)
UPDATE feedbacks
SET status = 'awaiting_review'
WHERE id = $1 AND status IN ('queued', 'in_progress');
```

Acesso obrigatório ao banco:
1. Ler `DATABASE_URL` em `Saves/postgres.env` (workspace)
2. Tabelas `feedbacks` / `feedback_notes`
3. Playbook no ai-memory: `concepts/fluxo-feedbacks-playbook.md`

Instalado: `%LOCALAPPDATA%\Nexus\Saves\postgres.env` ou `/DATA/AppData/nexus/`

## Leitura dirigida (economia de tokens via ai-memory)

| Precisa de | Consultar no ai-memory (`memory_read_page`) |
|------------|---------------------------------------------|
| Contexto geral | `concepts/arquitetura-geral.md` |
| HTTP sem token | `Frontend/src/modules/geral/lib/http.ts` — usar `apiFetch`/`apiJson` |
| Permissões | `concepts/multi-usuario-auth.md` |
| Schema DB | `concepts/database-blueprint.md` (só tabelas afetadas) |
| Null Safety / Robustez | `gotchas/frontend-null-safety.md` |
| Módulo específico | código em `Frontend|Backend/src/modules/<area>/<sub>/` (sem docs/ por módulo) |

**Não** ler `legacy_db.rs` inteiro salvo se o bug for sync ERP.

## Diagnóstico comum

| Sintoma | Causa provável | Onde olhar |
|---------|----------------|------------|
| "Erro ao buscar da API" | `fetch` sem Bearer | Migrar para `apiJson`/`hubJson` |
| Tela branca | null em string/array | `(x \|\| '')`, `?.`, ErrorBoundary |
| 403 admin | Rota admin-only | `multi_usuario.md`, handlers |
| Secundário sem dados | Client mode | `connectionConfig.ts`, API remota |
| Sync falhou | SQL/ERP | skill `natumhub-erp-sql` |

## Template da nota de resolução (`feedback_notes.body`)

```text
Resolução — <data>
Causa: …
Correção: …
Arquivos: …
Validação: cargo check ✓ · npm run build ✓
```

## Regras

- Um bug por vez quando possível — diff focado.
- Após o fix: nota + `awaiting_review` (Em aberto). Nunca `resolved` pelo agente.
- Se `wont_fix`: documentar motivo em nota e parar (só admin deve setar esse status).
- Respostas ao usuário em **pt-BR**.

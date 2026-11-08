---
name: natumhub-resolve-bugs
description: >-
  Resolve bugs do Nexus a partir da fila no PostgreSQL (feedbacks com status
  queued/in_progress): lê logs/print pela API, corrige código FE/BE, grava
  nota de resolução e marca awaiting_review (Em aberto). Use quando o usuário
  pedir resolver bug, corrigir feedback, executar fila ou analisar report pendente.
---

# Nexus — Skill: Resolver Bugs

## Quando usar

Executar correções a partir da **fila de feedbacks no banco** (ou ID pedido pelo usuário).

## Workflow (obrigatório)

Pela API do Nexus com o token do agente (nada de SQL direto). O agente precisa do módulo Configurações (`hub_settings`) em **editar**. As rotas aparecem no catálogo: `GET /api/agentes/acoes`.

```
- [ ] 1. GET /api/hub/feedbacks/fila?status=queued,in_progress   (já vem por prioridade, menor = mais urgente)
- [ ] 2. Escolher o de menor prioridade (ou o ID pedido)
- [ ] 3. GET /api/hub/feedbacks/:id?print=false   (descrição inteira, logs, notas; tire print=false só se precisar da imagem)
- [ ] 4. Reproduzir mentalmente: página, logs, descrição
- [ ] 5. Localizar código (mapa no ai-memory: `concepts/arquitetura-geral.md`)
- [ ] 6. Fix mínimo — seguir convenções do módulo vizinho
- [ ] 7. cargo check + npm run build
- [ ] 8. POST /api/hub/feedbacks/:id/resolver   corpo {"nota": "..."}   → prévia (de → para)
- [ ] 9. Repetir com ?confirmar=true: grava a nota e passa para awaiting_review (Em aberto), auditado
- [ ] 10. Informar o usuário: item em Em aberto para conferência/finalização
```

**Não** marcar `resolved` — isso é do supervisor na aba Em aberto. A rota `resolver` só aceita itens da fila (`queued`, `in_progress`, `planned`); o que está em triagem (`pending`) o supervisor aprova antes.
**Não** usar pastas `Feedbacks/feedback_<id>/` nem `resolucao.md`.

## Rotas de referência

| Ação | Rota |
|------|------|
| Fila enxuta | `GET /api/hub/feedbacks/fila?status=abertos\|todos\|lista&modulo=&limite=` |
| Detalhe | `GET /api/hub/feedbacks/:id?print=false` |
| Entregar para conferência | `POST /api/hub/feedbacks/:id/resolver` `{nota}` + `confirmar=true` |
| Devolver à fila (só supervisor) | `POST /api/hub/feedbacks/:id/devolver` `{nota}` + `confirmar=true` |

Acesso direto ao banco só em último caso (API fora do ar): `DATABASE_URL` em `Saves/postgres.env`, tabelas `feedbacks` / `feedback_notes`.

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
- Após o fix: `resolver` com a nota (vai para `awaiting_review`). Nunca `resolved` pelo agente.
- Se `wont_fix`: documentar motivo em nota e parar (só admin deve setar esse status).
- Respostas ao usuário em **pt-BR**.

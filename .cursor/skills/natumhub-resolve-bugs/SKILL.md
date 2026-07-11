---
name: natumhub-resolve-bugs
description: >-
  Resolve bugs do NatumHub a partir da fila em Feedbacks/feedback.md: lê logs,
  screenshot, triagem.md, corrige código FE/BE e preenche resolucao.md.
  Use quando o usuário pedir resolver bug, corrigir feedback, executar fila,
  trabalhar em item da fila de execução ou analisar report pendente.
---

# NatumHub — Skill: Resolver Bugs

## Quando usar

Executar correções a partir da **fila de feedbacks** ou de um report específico.

## Workflow (obrigatório)

```
- [ ] 1. Ler Feedbacks/feedback.md → seção "Fila de execução"
- [ ] 2. Escolher item de menor Prio (ou ID pedido pelo usuário)
- [ ] 3. Abrir Feedbacks/feedback_<id>/ — feedback.json, triagem.md, logs.txt, screenshot.png
- [ ] 4. Reproduzir mentalmente: página, logs, descrição
- [ ] 5. Localizar código (mapa: ContextoIA/arquitetura/mapa_pastas.md)
- [ ] 6. Fix mínimo — seguir convenções do módulo vizinho
- [ ] 7. cargo check + npm run build
- [ ] 8. Preencher Feedbacks/feedback_<id>/resolucao.md
- [ ] 9. Informar admin para marcar resolved (ou documentar no PR)
```

## Leitura dirigida (economia de tokens)

| Precisa de | Ler |
|------------|-----|
| Contexto geral | `ContextoIA/inicio/gemini.md` |
| HTTP sem token | `Frontend/src/modules/geral/lib/http.ts` — usar `apiFetch`/`apiJson` |
| Permissões | `ContextoIA/arquitetura/multi_usuario.md` |
| Schema DB | `ContextoIA/banco-dados/database_blueprint.md` (só tabelas afetadas) |
| Módulo específico | `Frontend|Backend/src/modules/<area>/<sub>/docs/README.md` |

**Não** ler `legacy_db.rs` inteiro salvo se o bug for sync ERP.

## Diagnóstico comum

| Sintoma | Causa provável | Onde olhar |
|---------|----------------|------------|
| "Erro ao buscar da API" | `fetch` sem Bearer | Migrar para `apiJson`/`hubJson` |
| Tela branca | null em string/array | `(x \|\| '')`, `?.`, ErrorBoundary |
| 403 admin | Rota admin-only | `multi_usuario.md`, handlers |
| Secundário sem dados | Client mode | `connectionConfig.ts`, API remota |
| Sync falhou | SQL/ERP | skill `natumhub-erp-sql` |

## Template resolucao.md

```markdown
# Resolução — Feedback <id>

**Data:** YYYY-MM-DD HH:MM
**Causa:** [1–2 frases]
**Correção:** [o que mudou]
**Arquivos:** [lista]
**Validação:** cargo check ✓ · npm run build ✓
```

## Regras

- Um bug por vez quando possível — diff focado.
- Não marcar `resolved` no DB via hack — admin usa painel ou API PUT.
- Se `wont_fix`: documentar motivo em `resolucao.md` e parar.
- Respostas ao usuário em **pt-BR**.

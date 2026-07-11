# Resolução — Feedback 20280bbb

**Status:** Finalizado  
**Data:** 2026-07-11

## Descrição da resolução

Melhoria na detecção de módulo, submódulo e página nos lançamentos de feedback.

### `viewLabels.ts`
- Mapa centralizado de views → títulos legíveis (espelha o Header)
- `buildFeedbackPagePath(currentView)` monta o caminho completo (módulo + aba via `__current_page__`)
- `splitFeedbackPagePath(path)` separa módulo e subpágina para o formulário

### Integrações
- **Header.tsx** — importa `getModuleTitle` de `viewLabels.ts` (remove duplicação)
- **FeedbackWidget.tsx** — usa `buildFeedbackPagePath` ao abrir e ao enviar, cobrindo estoque, vendas, financeiro, hubs de compras/produção, etc.

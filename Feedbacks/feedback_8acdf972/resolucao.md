# Resolução — Feedback 8acdf972

**Status:** Em aberto (conferência)  
**Data:** 2026-07-11

## Problema

Reports de feedback registravam caminhos incorretos (ex.: `Geral > Coloração`) quando o usuário saía de um módulo e abria o widget no hub — `__current_page__` ficava obsoleta.

## Correção

### `viewLabels.ts`
- `syncCurrentPageForView(view, tab?)` — sincroniza contexto ao trocar de view
- `COMPRAS_MODE_VIEW` — mapeia mode do ComprasView para view id
- `buildFeedbackPagePath` — prioriza caminho completo quando tab já inclui módulo

### `App.tsx`
- Limpa/atualiza `__current_page__` ao mudar de view

### `ComprasView.tsx`
- Define caminho completo: `Compras > Coloração > Lista` (etc.)

### `FeedbackWidget.tsx`
- Submit usa campos do formulário (módulo + aba) preenchidos automaticamente
- Opções de módulo: Estoque, Vendas, Financeiro

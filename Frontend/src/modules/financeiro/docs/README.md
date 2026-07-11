# Frontend — Financeiro

## Tela

`FinanceiroView.tsx` — abas:

1. **Dashboard** — posição líquida, vencimentos 7/30d, movimento do mês, projeção 8 semanas, aging, top clientes/fornecedores, fluxo mensal
2. **Contas a Receber / Pagar** — filtros (texto, situação, datas), paginação server-side, totais de valor/saldo
3. **Configurações** — token Tiny + período de sync

## API client

Usa `apiJson` de `modules/geral/lib/http.ts`. Tipos em `modules/geral/lib/types.ts` (prefixo `Financial*`, `FlowSummary`, `AccountsPage`).

# Resolução — Feedback d8db210d

**Data:** 2026-07-12
**Causa:** UI misturava status de ciclo de vida com roteamento (badge “Bases” como status); copy de configs pouco clara.
**Correção:** Badge separa ciclo de vida × categoria Base; aba Status renomeada/explicada (não é categoria); PRODUCT_LINE_STATUSES já sem `bases`.
**Arquivos:** `ActiveProductsView.tsx`
**Validação:** npm build (lote final)

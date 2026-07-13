# Resolução — Feedback 6dec73ff

**Data:** 2026-07-12
**Causa:** Criar cotação só existia em Matéria-Prima/Embalagens (`DemandTable` / lista de impressão); Coloração e Material de Apoio (`ProdutosCompraTab`) não tinham seleção nem chamada a `createQuotation`. Empty state de Cotações também não orientava o fluxo.
**Correção:** Em `ProdutosCompraTab`, checkbox por linha/página, botão **Cotar (N)** que chama `api.createQuotation` com códigos e sugestões; empty state em `QuotationManager` aponta criação a partir dos quatro módulos. Tipagem por categoria (`cat_coloracao` / `cat_apoio` → abas Coloração/Apoio) e decode INT8 de `item_count` (`pg_i32`) já estavam no backend.
**Arquivos:** `Frontend/src/modules/compras/planejamento/components/ProdutosCompraTab.tsx`, `Frontend/src/modules/compras/planejamento/components/QuotationManager.tsx`
**Validação:** cargo check ✓ · npm run build ✓

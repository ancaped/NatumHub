# Resolução — Feedback 17dec008

**Data:** 2026-07-12
**Causa:** Em `get_demands`, “última NF” e “último pedido” vinham de `supplier_name` / `c_nome_f` (nome do fornecedor), não do número da NF (`invoice_number`) nem do pedido (`n_pedido`).
**Correção:** Queries passam a retornar `invoice_number` e `CAST(n_pedido AS TEXT)`. Labels na Lista: “Últ. NF” / “Últ. Pedido”. Vale para todos os módulos que usam `getDemands` (MP, Emb, Coloração, Apoio, Lista).
**Arquivos:** `Backend/src/modules/compras/planejamento/commands/demands.rs`, `Frontend/.../PrintListTab.tsx`
**Validação:** cargo check ✓ · npm run build ✓

# Resolução — Feedback d3e05156

**Data:** 2026-07-11 13:50
**Causa:** Estoque de produtos (Coloração/Apoio) importado com `CAST(... AS INT)`, truncando decimais; snapshots de insumos acumulavam linhas antigas; reserva em Compras não usava `nqtdeReserva` do ERP; valores desatualizados quando o sync ERP não rodava (ex.: insumo 9.15.062 mostrava -159 kg com ERP em ~62 kg).
**Correção:** Passo A grava FLOAT/REAL; sync D1/D2 substitui `stock_snapshots`; Compras exibe reserva ERP; documentação em `erp-import/ESTOQUE.md`; faixa informativa “último sync ERP” em Matéria-Prima/Embalagens (`DemandTable`) e Coloração/Apoio (`ProdutosCompraTab`).
**Arquivos:**
- `Backend/src/core/legacy_db.rs`, `db.rs`, `schema.sql`
- `Backend/src/modules/compras/planejamento/commands/demands.rs`
- `Backend/src/handlers/producao.rs`, `vendas.rs`
- `Frontend/.../DemandTable.tsx`, `ProdutosCompraTab.tsx`
- `erp-import/ESTOQUE.md`, `sql/A-produtos.sql`
**Validação:** cargo check ✓ · npm run build ✓
**Pós-deploy:** rodar Sync ERP no PC Principal. Coluna **Estoque** = físico ERP (`nQtdeEstoque`); **Prev. Futura** é cálculo interno — não comparar com ERP.

# Resolução — Feedback 0c8c10dc

**Data:** 2026-07-12
**Causa:** Gestão de Bases pedia `/products?status=base`, mas o filtro BE só tratava coloracao/apoio e comparava status de estoque (`base` ≠ `bases` / `cat_base`).
**Correção:** FE usa `categoria=cat_base`; BE filtra por `cat_base` (e legado `bases`) em `list_products`.
**Arquivos:** `BasesTab.tsx`, `Backend/src/handlers/producao.rs`
**Validação:** cargo check / npm build (lote final)

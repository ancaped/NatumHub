# Resolução — Feedback 0a1b4d5f

**Data:** 2026-07-12
**Causa:** Status de urgência usava faixa fixa `disparo + 30 dias`, embora meta/disparo já variem por item (hierarquia geral &lt; subcategoria &lt; item).
**Correção:** Cores mantidas. Critério alinhado à meta do item: crítico = cobertura &lt; disparo; atenção = disparo ≤ cobertura &lt; meta; OK = cobertura ≥ meta. Filtros atualizados (&lt; disparo / disparo–meta / ≥ meta) em Demandas e Coloração/Apoio.
**Arquivos:** `Backend/src/modules/compras/planejamento/commands/demands.rs`, `Frontend/.../ProdutosCompraTab.tsx`, `Frontend/.../DemandTable.tsx`
**Validação:** cargo check ✓ · npm run build ✓

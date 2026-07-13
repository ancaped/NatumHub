# Resolução — Feedback f6fb0462

**Data:** 2026-07-12
**Causa:** Colunas Disparo/Objetivo na Lista ocupavam muito espaço (“Disparo (dias)” / “X dias”).
**Correção:** Headers compactos `Disp.` / `Obj.`; células na tela e no print em formato `Nd` (ex.: `45d`). Print HTML já usava `Nd`; Demandas/Coloração/Apoio no print já estavam compactos.
**Arquivos:** `Frontend/src/modules/compras/planejamento/components/PrintListTab.tsx`
**Validação:** cargo check ✓ · npm run build ✓

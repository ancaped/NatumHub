# Resolução — Feedback 245c8e35

**Data:** 2026-07-12 03:30
**Causa:** Linha de Produtos tinha sidebar/active states fracos, coluna de status apertada, toolbar/tabela inconsistentes e abas de configuração verbosas.
**Correção:** Polish visual: sidebar ativa `bg-zinc-900`, stats compactos, `toolbar-section`/`table-card`, badges de status mais legíveis (Base em zinc), filtros sem emoji, sub-tabs de config em pill e textos enxutos. Sem mudança de comportamento.
**Arquivos:** `Frontend/src/modules/administrativo/linha_produtos/ActiveProductsView.tsx`
**Validação:** npm run build ✓

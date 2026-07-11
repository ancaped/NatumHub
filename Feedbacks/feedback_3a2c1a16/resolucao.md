# Resolução — Feedback 3a2c1a16

**Data:** 2026-07-10 23:30
**Solicitante:** EdsonFerrari
**Página:** Geral > Coloração

## Causa

A quantidade recomendada só era calculada quando o estoque projetado era **menor ou igual ao ponto de disparo** (`futureStock <= triggerPoint`). Com disparo 90 dias e objetivo 180 dias, um produto com 147 dias de cobertura ficava acima do disparo e recebia sugestão **zero**, mesmo estando abaixo da meta de 180 dias.

## Correção

- **Backend** (`demands.rs`): sugerir compra quando `cobertura < dias objetivo`, quantidade = `estoque meta − estoque projetado`. Disparo continua definindo apenas a **urgência** (critical/warning/ok).
- **Frontend** (`ProdutosCompraTab.tsx`): mesma regra para Coloração e Material de Apoio (cálculo client-side).

## Arquivos alterados

- `Backend/src/modules/compras/planejamento/commands/demands.rs`
- `Frontend/src/modules/compras/planejamento/components/ProdutosCompraTab.tsx`

## Validação

- `cargo check` ✓
- `npm run build` ✓

## Comportamento esperado após fix

Disparo 90 + objetivo 180: produto com 147 dias de cobertura passa a exibir quantidade recomendada proporcional a `(180 − 147) × média diária`, arredondada.

## Descrição da resolução

Ajustada a regra de sugestão de compras em todos os módulos que usam demandas (matéria-prima, embalagens via API) e produtos de coloração/apoio (via ProdutosCompraTab).

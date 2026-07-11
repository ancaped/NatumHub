# Resolução — Feedback 8e2410d9

**Data:** 2026-07-11 00:15
**Solicitante:** EdsonFerrari
**Página:** Geral > Coloração

## Problema

1. **Tempo de Cálculo da Média** (`periodoMedia`) salvo na config do item não alterava a coluna Média Mês — ex.: item 1.34.001 de 12 para 3 meses.
2. Coloração/Apoio usavam `media_vendas` do endpoint `/products` (levantamento fixo), ignorando `compras_config_personalizado`.
3. Relatórios (Lista e abas MP/Emb/Coloração) exibiam meta global de estoque e não mostravam disparo/objetivo por item de forma compacta.

## Correção

### Backend (`demands.rs`)

- Carrega `periodo_media` nas configs personalizadas.
- Saídas de **produto** incluídas no cálculo de média (além de insumo).
- Resolve período por item → subcategoria → config do módulo (`compras_coloracao`, `compras_apoio`, `compras_main`).
- Fallback via `historico_faturamento` quando não há movimentação no período.

### Frontend

- **ProdutosCompraTab:** integra `getDemands()` — Média Mês e sugestões usam `overallAvg` recalculado; recarrega após salvar config.
- **PrintListTab:** remove "Meta de Estoque" do cabeçalho; nota metodológica atualizada.
- **DemandTable / ProdutosCompraTab (impressão):** colunas compactas Disparo/Objetivo por item (`90d`); título por aba/módulo; sem meta global.

## Arquivos alterados

- `Backend/src/modules/compras/planejamento/commands/demands.rs`
- `Frontend/src/modules/compras/planejamento/components/ProdutosCompraTab.tsx`
- `Frontend/src/modules/compras/planejamento/components/DemandTable.tsx`
- `Frontend/src/modules/compras/planejamento/components/PrintListTab.tsx`

## Validação

- `cargo check` ✓
- `npm run build` ✓

## Comportamento esperado

- Alterar período de média no drawer do item reflete na coluna Média Mês (Coloração, Apoio, MP, Embalagens, Lista).
- Relatórios impressos mostram disparo/objetivo por item, sem meta global única.

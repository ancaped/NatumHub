# Resolução — Feedback daed4a63

**Status:** Em aberto (conferência)  
**Data:** 2026-07-11

## Problema

Média Mês na lista (Coloração) não correspondia ao painel de detalhes/vendas:
1. SQL de movimentações usava janela fixa com fallback `compras_main`, enquanto o divisor usava `periodo_media` por módulo/item
2. Detalhe do produto exibia `salesYoy[0].monthlyAvg` (total anual ÷ 12), ignorando período configurado

## Correção

### Backend (`demands.rs`)
- Agrega saídas por mês (últimos 12 meses)
- Soma os últimos N meses conforme `resolve_periodo_media` por item (item → subcat → módulo)
- Elimina divergência entre janela de dados e divisor

### Frontend (`ProdutosCompraTab.tsx`)
- Drawer "Visão geral": Média Mensal alinhada com coluna da lista (`media_vendas` / `overallAvg`)
- Aba Consumo/Vendas: nota explicando diferença vs média anual histórica

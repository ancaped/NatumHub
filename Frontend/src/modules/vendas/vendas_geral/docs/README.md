# Vendas — Pedidos e estatísticas

## Fonte de dados

| Dado | Origem | Passo sync ERP |
|------|--------|----------------|
| Histórico de vendas por produto | `stock_movements` (saída produto) | **J** — VENDAS2 (histórico completo) |
| Pedidos de venda abertos | `sales_orders`, `sales_order_items` | **M**, **N** — Pedidos1/2 |
| Médias mensais no cadastro | `produtos.media_m1…m12` | **A** — agregado do ano corrente |

Documentação completa da importação: [`../../../../../erp-import/PASSOS.md`](../../../../../erp-import/PASSOS.md)

## Módulo

- Frontend: `vendas_geral/VendasView`
- Backend: handlers em `handlers/vendas.rs`, rotas `/api/vendas/*`

## Permissão

Chave de módulo: `vendas` — configurável por operador em Gestão de Operadores.

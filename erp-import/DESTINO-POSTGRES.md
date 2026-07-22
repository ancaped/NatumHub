# Mapeamento ERP → PostgreSQL

Banco centralizado no **PostgreSQL** do PC Principal (`Saves/postgres.env`). Schema: `Backend/supabase/001_natumhub_schema.sql`.

## Cadastro e estoque

| Postgres | Colunas principais | Origem |
|--------|-------------------|--------|
| `produtos` | codigo, descricao, linha_prefix, base, media_levantamento, **codigo_barras** (`Produtos.cCodBarras`) | Passo A |
| `estoque_atual` | codigo, estoque, producao, pedidos_aberto, fase | Passo A |
| `items` | code, description, unit, category, is_ignored | Passos C, D |
| `suppliers` | id, name, contact, email | Passo B |
| `stock_snapshots` | item_code, stock_qty, reserved_qty, in_production, in_orders | D1, D2 — ver [`ESTOQUE.md`](ESTOQUE.md) |

## Compras

| Postgres | Origem |
|--------|--------|
| `invoices` | Passo E (COMPRAS1/2) |
| `consumption_stats` | Passo F |
| `purchase_orders` | Passo K |
| `purchase_order_items` | Passo L |

## Produção

| Postgres | Origem |
|--------|--------|
| `formulacoes` | Passo G |
| `lotes_baixas` | Passo I |
| `stock_movements` | Passos H, I, J (entradas/saídas) |

## Vendas

| Postgres | Origem |
|--------|--------|
| `sales_orders` | Passo M (`Pedidos1`) |
| `sales_order_items` | Passo N (`Pedidos2`) |
| `stock_movements` (saída produto) | Passo J (`VENDAS2`) — usado em estatísticas e YoY |

O módulo **Vendas** lê principalmente `stock_movements` filtrados por saídas de produto e tabelas agregadas derivadas do histórico importado no passo J.

## Histórico

| Postgres | Conteúdo |
|--------|----------|
| `historico_importacoes` | Log de cada sync (tipo `sync`, contagem, status) |

## Configuração de rede / operadores (não vêm do ERP)

| Postgres | Conteúdo |
|--------|----------|
| `settings` | sql_*, erp_*, etc. |
| `hub_operators` | Operadores locais |
| `hub_operator_modules` | Permissões por módulo |
| `hub_sessions` | Sessões Bearer |


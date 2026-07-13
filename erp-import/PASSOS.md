# Passos da importação ERP (A → N)

Cada passo corresponde a um bloco em `legacy_db.rs::sync_from_sql_server`.  
Query SQL: pasta [`sql/`](sql/).

| Passo | Arquivo SQL | Origem ERP | Destino Postgres | Módulos que usam |
|-------|-------------|------------|----------------|------------------|
| **A** | `A-produtos.sql` | `Produtos` + vendas M1–M12 | `produtos`, `estoque_atual` | Produção, Estoque, Compras |
| **B** | `B-fornecedores.sql` | `Fornecedores` | `suppliers` | Compras, Financeiro |
| **C** | `C-insumos.sql` | `Insumos` | `items` (tipo insumo) | Compras, Estoque |
| **D** | `D-materiais.sql` | `Materiais` | `items` (tipo material) | Compras, Estoque |
| **D1** | `D1-estoque-insumos.sql` | `Insumos` (qty) | `item_stock_snapshots` | Compras, Estoque |
| **D2** | `D2-estoque-materiais.sql` | `Materiais` (qty) | `item_stock_snapshots` | Compras, Estoque |
| **E** | `E-notas-compra.sql` | `COMPRAS1` + `COMPRAS2` | `invoices` | Compras (NF, médias) |
| **F** | `F-consumo.sql` | `Lotes_Baixas` (agregado) | `consumption_stats` | Compras (planejamento) |
| **G** | `G-formulacoes.sql` | `Composicao` | `formulacoes` | Produção, Estoque |
| **H** | `H-lotes-producao.sql` | `Lotes` | `stock_movements` (entrada produto) | Produção |
| **I** | `I-lotes-baixas.sql` | `Lotes_Baixas` | `lotes_baixas`, `stock_movements` (saída insumo) | Produção, Estoque |
| **J** | `J-vendas.sql` | `VENDAS1` + `VENDAS2` | `stock_movements` (saída produto) | **Vendas**, Produção |
| **K** | `K-pedidos-compra-cab.sql` | `PedidoCpa1` | `purchase_orders` | Compras (pedidos) |
| **L** | `L-pedidos-compra-itens.sql` | `PedidoCpa2` | `purchase_order_items` | Compras (pedidos) |
| **M** | `M-pedidos-venda-cab.sql` | `Pedidos1` | `sales_orders` | Vendas |
| **N** | `N-pedidos-venda-itens.sql` | `Pedidos2` | `sales_order_items` | Vendas |

## Filtros embutidos nas queries (não configuráveis na UI)

Alguns passos limitam volume por janela de tempo **fixa no SQL** (performance):

| Passo | Filtro |
|-------|--------|
| E | NF compra últimos 48 meses |
| F | Consumo anos 2024–2026 |
| H | Lotes desde 2024-01-01 |
| I | Baixas desde 2024-01-01 |
| K, L | Pedidos compra: últimos 12 meses ou status aberto |
| M, N | Pedidos venda: últimos 6 meses ou status aberto |
| **J** | `dVenda >= 2024-01-01` no full; incremental usa watermark − 2 dias |

Para alterar janelas, edite a query em `legacy_db.rs` **e** o `.sql` correspondente aqui.

## Sync incremental

- Setting `erp_sync_watermark` (JSON): `cursor`, `last_full_at`, `last_incremental_at`.
- Sem cursor → primeiro sync é **full**.
- `POST /api/import/sync` (default) = incremental; `?mode=full` = completo.
- Cadastros/estoque (A–D, F, G) sempre full; E/H/I/J/K–N em delta.
- Scheduler automático usa incremental.

## Dump completo (opcional)

`create_database_dump` copia tabelas espelho (`vendas1`, `vendas2`, etc.) para análise offline — ver final de `legacy_db.rs`.

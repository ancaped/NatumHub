# Esquema NatumHub (PostgreSQL)

> **Canônico:** `Backend/supabase/001_natumhub_schema.sql`  
> Conexão: `Saves/postgres.env` (`DATABASE_URL`; legado `supabase.env`)  
> Migração Supabase → local: [migracao_postgres.md](migracao_postgres.md)

Tabelas principais (referência rápida):

| Grupo | Tabelas |
|-------|---------|
| Hub | `hub_operators`, `hub_sessions`, `hub_devices`, `hub_notifications`, `settings`, `sync_status` |
| Produção | `config_linhas`, `produtos`, `estoque_atual`, `overrides_produtos`, `historico_producao`, `stock_movements` |
| Compras | `categories`, `items`, `suppliers`, `consumption`, `invoices`, `quotations`, `stock_snapshots` |
| Almoxarifado (local) | `almox_item_config` (+ `section`/`source`/`erp_description`/`description`/`unit`), `almox_balances`, `almox_movements` (+ `variant_label`/`pack_*`/`total_paid`), demandas, `estoque_peca_meta`, `estoque_equipamentos`, `estoque_equipamento_pecas`, `estoque_manutencoes` — `002`–`004` · [`../modulos/almoxarifado.md`](../modulos/almoxarifado.md) |
| Pedidos ERP | `purchase_orders`, `sales_orders`, `*_items` |
| Qualidade | `products`, `reports`, `fisco_quimica_*` |
| Financeiro | `tiny_contas_pagar`, `tiny_contas_receber` |

Mapeamento ERP → Postgres: `erp-import/PASSOS.md` e `erp-import/DESTINO-POSTGRES.md`.

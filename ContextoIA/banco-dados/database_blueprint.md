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
| Pedidos ERP | `purchase_orders`, `sales_orders`, `*_items` |
| Qualidade | `products`, `reports`, `fisco_quimica_*` |
| Financeiro | `tiny_contas_pagar`, `tiny_contas_receber` |

Mapeamento ERP → Postgres: `erp-import/PASSOS.md` e `erp-import/DESTINO-POSTGRES.md`.

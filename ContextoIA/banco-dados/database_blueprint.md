# Esquema Nexus (PostgreSQL)

O produto se chama **Nexus**. O database PostgreSQL continua `natumhub`.

> **Canônico:** `Backend/supabase/001_natumhub_schema.sql`  
> Conexão: `Saves/postgres.env` (`DATABASE_URL`)

Tabelas principais (referência rápida):

| Grupo | Tabelas |
|-------|---------|
| Hub | `hub_operators`, `hub_sessions`, `hub_devices`, `hub_notifications`, `hub_audit_log`, `hub_audit_events` (`017`), `hub_operator_profiles` (`019`), `settings`, `sync_status` |
| Mapa | `mapa_groups`, `mapa_modules`, `mapa_edges`, `mapa_routes`, `mapa_tasks`, `mapa_activity` (`018`) |
| Produção | `config_linhas`, `produtos`, `estoque_atual`, `overrides_produtos`, `historico_producao`, `stock_movements` |
| Compras | `categories`, `items`, `suppliers`, `consumption`, `invoices`, `quotations`, `stock_snapshots` |
| Ordens Manuais (Estoque) | `manual_stock_orders`, `manual_stock_order_items` (`021`), `manual_stock_record_types` + `record_type` (`022`) — entrada/saída OPEN ajusta Prev. Futura; não altera `stock_snapshots` |
| Almoxarifado (local) | `almox_item_config` (+ `section`/`source`/`erp_description`/`description`/`unit`), `almox_balances`, `almox_movements` (+ `variant_label`/`pack_*`/`total_paid`), demandas, `estoque_peca_meta`, `estoque_equipamentos` (+ marca/modelo/ano/série), `estoque_equipamento_pecas`, `estoque_manutencoes` (+ `scheduled_at`), `estoque_manutencao_pecas` — `002`–`004` · `038` · [`../modulos/almoxarifado.md`](../modulos/almoxarifado.md) |
| Pedidos ERP | `purchase_orders`, `sales_orders`, `*_items` |
| Qualidade | `products`, `reports`, `fisco_quimica_*`, `doc_families`, `doc_types`, `documents`, `document_files` (`016`), `pop_sectors`, `pop_documents`, `pop_versions` (`023`) |
| Financeiro | `tiny_contas_pagar`, `tiny_contas_receber` |
| Ferramentas | `hub_label_templates` (`029`) |

Mapeamento ERP → Postgres: `erp-import/PASSOS.md` e `erp-import/DESTINO-POSTGRES.md`.

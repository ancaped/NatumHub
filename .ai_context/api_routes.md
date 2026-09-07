# Rotas da API REST Axum (porta 3001)

Servidor HTTP em `Backend/NatumHub/src/lib.rs` (`start_axum_server`). Mapa extraído do `Router::new()` atual.

## Bind / Auth / CORS (P0)

O bind **não** é só `127.0.0.1`. Padrão Tailscale: **`0.0.0.0:3001`**. Override: `NATUM_BIND` (host ou `host:porta`).

| Modo | Bind | Auth |
|------|------|------|
| A (local) | `NATUM_BIND=127.0.0.1` | Bearer **opcional** |
| B (padrão / Tailscale) | `0.0.0.0:3001` | Bearer **obrigatório** em `/api/*` |

- Token: `Authorization: Bearer <hub_token>` (`NATUM_HUB_TOKEN` ou arquivo gitignored `Backend/.natum_hub_token`).
- Exceção Bearer: `GET /api/google/callback`.
- CORS allowlist (não `Any`): `http://localhost:5175`, `http://127.0.0.1:5175`, `tauri://localhost`, `https://tauri.localhost`. Extras: `NATUM_CORS_ORIGINS`.
- `NATUM_AUTH=required|optional` força o modo de auth.

Detalhes e settings mascarados: [security.md](security.md).

O frontend HTTP usa `API_BASE` + `apiFetch` em `Frontend/src/lib/utils.ts` (Bearer automático). Não assuma que as views hardcodedam `127.0.0.1`.

---

## 1. Produtos e kits

| Método | Rota | Handler |
|--------|------|---------|
| GET | `/api/products` | `handlers::list_products` |
| GET | `/api/kits` | `handlers::list_kits` |
| GET | `/api/kits/composicao` | `handlers::list_kit_composicao` |
| POST | `/api/kits/composicao` | `handlers::add_kit_composicao_handler` — `{ kit_codigo, componente_codigo }` |
| POST | `/api/kits/composicao/upload` | `handlers::upload_kit_composicao` (multipart Excel) |
| DELETE | `/api/kits/composicao/:kit/:comp` | `handlers::delete_kit_composicao_handler` |
| GET | `/api/kits/orders` | `handlers::list_kit_orders` |
| POST | `/api/kits/orders` | `handlers::create_kit_order` |
| PUT | `/api/kits/orders/:id` | `handlers::update_kit_order` |
| DELETE | `/api/kits/orders/:id` | `handlers::delete_kit_order` |
| GET | `/api/kits/next-order-number` | `handlers::get_next_kit_order_number` |

## 2. Viras (turnovers)

| Método | Rota | Handler |
|--------|------|---------|
| GET | `/api/turnovers/composicao` | `handlers::list_vira_composicao` |
| POST | `/api/turnovers/composicao` | `handlers::add_vira_composicao` |
| DELETE | `/api/turnovers/composicao/:de/:para` | `handlers::delete_vira_composicao` |
| GET | `/api/turnovers/orders` | `handlers::list_vira_orders` |
| POST | `/api/turnovers/orders` | `handlers::create_vira_order` |
| PUT | `/api/turnovers/orders/:id` | `handlers::update_vira_order` |
| DELETE | `/api/turnovers/orders/:id` | `handlers::delete_vira_order` |
| GET | `/api/turnovers/next-order-number` | `handlers::get_next_vira_order_number` |

## 3. Configurações de linha e overrides

| Método | Rota | Handler |
|--------|------|---------|
| GET | `/api/configs` | `handlers::get_configs` |
| PUT | `/api/configs` | `handlers::update_config` |
| DELETE | `/api/configs/:prefix` | `handlers::delete_config` |
| GET | `/api/overrides` | `handlers::get_overrides` |
| POST | `/api/overrides` | `handlers::save_override` |
| POST | `/api/overrides/bulk` | `handlers::save_override_bulk` |
| GET | `/api/lancamento/graduation-check` | `handlers::get_graduation_candidates_handler` |

## 4. Importação, sync e watcher

| Método | Rota | Handler |
|--------|------|---------|
| POST | `/api/import/faturamento` | `handlers::import_faturamento` (multipart) |
| POST | `/api/import/levantamento` | `handlers::import_levantamento` (multipart) |
| POST | `/api/import/kits` | `handlers::import_kits` (multipart) |
| POST | `/api/import/sync` | `handlers::trigger_db_sync` |
| POST | `/api/import/dump` | `handlers::trigger_db_dump` |
| GET | `/api/import/history` | `handlers::get_import_history` |
| GET | `/api/import/status` | `handlers::get_import_status` |
| GET | `/api/import/watch-config` | `handlers::get_watch_config_handler` |
| POST | `/api/import/watch-config` | `handlers::save_watch_config_handler` |

## 5. Settings

| Método | Rota | Handler |
|--------|------|---------|
| GET | `/api/settings/:key` | `handlers::get_setting_handler` |
| POST | `/api/settings/:key` | `handlers::save_setting_handler` |

GET de chaves sensíveis (`sql_password`, `firebase_config`, `google_client_secret`, tokens Google, `hub_token`) devolve `{ value: null, is_set, masked: true }`. Placeholder vazio/`********` no POST não sobrescreve. `hub_token` não é lido nem gravado por esta rota.

## 6. Estoque, formulação e detalhes de produto

| Método | Rota | Handler |
|--------|------|---------|
| GET | `/api/estoque/movimentacoes/:code` | `handlers::get_stock_movements` |
| GET | `/api/estoque/item-info/:code` | `handlers::get_item_extra_info` |
| GET | `/api/produtos/formulacao/:code` | `handlers::get_product_formulation` |
| GET | `/api/produtos/semelhantes/:code` | `handlers::get_similar_products` |
| GET | `/api/produtos/:code/detalhes` | `handlers::get_product_detalhes` |
| GET | `/api/produtos/:code/pedidos-pendentes` | `handlers::get_product_pending_orders` |

## 7. Produção (lotes, histórico, recálculo)

| Método | Rota | Handler |
|--------|------|---------|
| GET | `/api/producao/lotes` | `handlers::get_production_lotes` |
| GET | `/api/producao/lotes/:number/detalhes` | `handlers::get_lote_detalhes` |
| POST | `/api/producao/lotes/:number/resolver` | `handlers::save_lote_resolution` |
| DELETE | `/api/producao/lotes/:number/resolver` | `handlers::delete_lote_resolution` |
| GET | `/api/producao/recalcular/preview` | `handlers::preview_recalculation` |
| POST | `/api/producao/recalcular/ajustar` | `handlers::apply_recalculation_adjustment` |
| GET | `/api/historico` | `handlers::list_producao` |
| POST | `/api/historico` | `handlers::add_producao` |
| DELETE | `/api/historico/:id` | `handlers::delete_producao` |
| PUT | `/api/historico/:id/lote` | `handlers::update_producao_lote` |

## 8. Administrativo / Acompanhamento

| Método | Rota | Handler |
|--------|------|---------|
| GET | `/api/administrativo/acompanhamento-producao` | `handlers::get_acompanhamento_producao` |
| POST | `/api/administrativo/lote-status` | `handlers::save_lote_custom_status` |
| DELETE | `/api/administrativo/lote-status/:number` | `handlers::delete_lote_custom_status` |

## 9. Compras HTTP (insumos, pedidos, NFs, lojas)

| Método | Rota | Handler |
|--------|------|---------|
| GET | `/api/compras/insumos/:code/detalhes` | `handlers::get_insumo_detalhes` |
| GET | `/api/compras/pedidos` | `handlers::list_purchase_orders` |
| GET | `/api/compras/pedidos/:id` | `handlers::get_purchase_order_detail` |
| GET | `/api/compras/notas` | `handlers::list_invoices` |
| GET | `/api/compras/notas/:number` | `handlers::get_invoice_detail` |
| GET | `/api/compras/lojas` | `handlers::list_online_stores` |
| POST | `/api/compras/lojas` | `handlers::save_online_store_handler` |
| DELETE | `/api/compras/lojas/:id` | `handlers::delete_online_store_handler` |

CRUD principal de cotações/demandas continua em Tauri invoke ([tauri_commands.md](tauri_commands.md)).

## 10. Vendas

| Método | Rota | Handler |
|--------|------|---------|
| GET | `/api/vendas/pedidos` | `handlers::list_sales_orders` |
| GET | `/api/vendas/faltas` | `handlers::list_sales_faltas` |

## 11. Google Drive

| Método | Rota | Handler |
|--------|------|---------|
| GET | `/api/google/status` | `google_drive::get_google_status` — sem `client_id`; flags `configured` / `client_id_configured` / `authenticated` |
| POST | `/api/google/config` | `google_drive::save_google_config` |
| GET | `/api/google/auth-url` | `google_drive::google_auth_url` |
| GET | `/api/google/callback` | `google_drive::google_callback` — **isento de Bearer** |
| POST | `/api/google/sync` | `google_drive::trigger_sync` |

# Comandos Tauri (`generate_handler!`)

Fonte: `tauri::generate_handler!` em `Backend/NatumHub/src/lib.rs`. Wrappers JS em `Frontend/src/lib/api.ts`.

Este canal é **IPC desktop** (não HTTP). Views HTTP (Estoque, Vendas, Pedidos, NFs, Kits, Acompanhamento, Produção) usam Axum — ver [api_routes.md](api_routes.md).

Lista completa abaixo (não omitir `get_hub_token`, online, spending, backup compactado, `reset_db`, itens semelhantes).

---

## 1. Config, token, backup e feedback

### `get_hub_token`
- **JS**: `api.getHubToken()`
- **Rust**: `fn get_hub_token() -> Result<String, String>`
- Lê `NATUM_HUB_TOKEN` ou o arquivo gitignored `Backend/.natum_hub_token`. **Não gera** token novo (evita tokens divergentes no PC cliente). Ver [security.md](security.md).

### `get_compras_config` / `save_compras_config`
- **JS**: `api.getComprasConfig(key?)` / `api.saveComprasConfig(config, key?)`
- **Rust**: `fn get_compras_config(state, key: Option<String>)` / `fn save_compras_config(state, config, key: Option<String>)`

### `get_microbio_config` / `save_config_microbio`
- **JS**: `api.getMicrobioConfig()` / `api.saveMicrobioConfig(config)`
- **Rust**: `fn get_microbio_config(state)` / `fn save_config_microbio(state, config)`

### `get_backup` / `restore_backup`
- **JS**: `api.getBackup()` / `api.restoreBackup(data)`
- Lê/grava `Backend/data.db` em bytes crus.

### `get_compressed_backup` / `restore_compressed_backup`
- **JS**: `api.getCompressedBackup()` / `api.restoreCompressedBackup(data)`
- Backup gzip de `data.db`.

### `get_feedbacks` / `save_feedback` / `resolve_feedback`
- **JS**: `api.getFeedbacks()` / `api.saveFeedback(feedback)` / `api.resolveFeedback(id)`
- `save_feedback` / `resolve_feedback` também reescrevem `feedback.md`.

### `reset_db`
- **JS**: `api.resetDb()`
- **Rust**: `fn reset_db(state) -> Result<(), String>`
- Recria o schema via `initialize_hub_db` (destrutivo).

---

## 2. Compras — categorias, itens, semelhantes

### `get_categories` / `save_category` / `delete_category`
- **JS**: `api.getCategories()` / `api.saveCategory(category)` / `api.deleteCategory(id)`

### `get_items`
- **JS**: `api.getItems(categoryId)`
- **Rust**: `fn get_items(state, category_id: Option<String>)`

### `update_item_details`
- **JS**: `api.updateItemDetails(code, notes, isIgnored)`
- **Rust**: `fn update_item_details(state, code, notes: Option<String>, is_ignored: bool)`

### `import_item_observations`
- **JS**: `api.importItemObservations(observations)`
- **Rust**: `fn import_item_observations(state, observations)`

### `update_items_category`
- **JS**: `api.updateItemsCategory(codes, categoryId)`
- **Rust**: `fn update_items_category(state, codes, category_id: Option<String>)`

### `get_similar_items` / `add_similar_item` / `remove_similar_item`
- **JS**: `api.getSimilarItems(code)` / `api.addSimilarItem(codeA, codeB)` / `api.removeSimilarItem(codeA, codeB)`
- Tabela `similar_items`.

---

## 3. Compras — demandas e importação CSV

### `get_demands`
- **JS**: `api.getDemands(categoryId, targetDays)`
- **Rust**: `fn get_demands(state, category_id: Option<String>, target_days: i32)`

### `import_stock` / `import_consumption` / `import_invoices`
- **JS**: `api.importStock(rows, filename)` / `api.importConsumption(rows, year, filename)` / `api.importInvoices(rows, filename)`

### `get_import_history` / `get_nf_import_control`
- **JS**: `api.getImportHistory()` / `api.getNfImportControl()`
- Histórico de importações **de Compras** (tabela `stock_imports`), distinto de `GET /api/import/history` (planilhas de produção).

---

## 4. Compras — cotações

### `create_quotation`
- **JS**: `api.createQuotation(title, itemCodes, recommendedQtys)`

### `get_quotations` / `get_quotation_detail`
- **JS**: `api.getQuotations(status)` / `api.getQuotationDetail(id)`
- Detail: `{ quotation, items }` com preços aninhados.

### `update_quotation_status` / `add_quotation_price` / `select_supplier` / `delete_quotation`
- **JS**: `api.updateQuotationStatus` / `api.addQuotationPrice` / `api.selectSupplier` / `api.deleteQuotation`

### `update_quotation_item_qty`
- **JS**: `api.updateQuotationItemQty(id, field, qty)` — `field`: `'approved' | 'final'`

---

## 5. Compras — fornecedores e relatórios (spending)

### `get_suppliers` / `save_supplier` / `get_supplier_history`
- **JS**: `api.getSuppliers(mode?)` / `api.saveSupplier(supplier)` / `api.getSupplierHistory(id)`
- `get_suppliers` aceita `parent_category_id` opcional.

### `get_price_evolution`
- **JS**: `api.getPriceEvolution(itemCode)`

### `get_spending_by_supplier` / `get_spending_by_category`
- **JS**: `api.getSpendingBySupplier(start, end, mode?)` / `api.getSpendingByCategory(start, end, mode?)`
- Relatórios de gasto por período (NFs), filtráveis por categoria pai.

---

## 6. Compras online — pedidos e lojas

### `get_online_orders` / `save_online_order` / `delete_online_order`
- **JS**: `api.getOnlineOrders()` / `api.saveOnlineOrder(order)` / `api.deleteOnlineOrder(id)`

### `get_online_stores` / `save_online_store` / `delete_online_store`
- **JS**: `api.getOnlineStores()` / `api.saveOnlineStore(store)` / `api.deleteOnlineStore(id)`

### `upload_order_receipt` / `open_receipt_file`
- **JS**: `api.uploadOrderReceipt(id, filename, data)` / `api.openReceiptFile(path)`
- Comprovante em `Backend/receipts/`. `open_receipt_file` abre no programa padrão do SO.

---

## 7. Microbiologia

### `get_products` / `save_product` / `delete_product` / `delete_all_products`
- Cadastro laboratorial (`products`), distinto de `GET /api/products` (estoque).

### `get_reports` / `save_reports` / `delete_report`
- Laudos em `reports`.

---

## 8. Físico-Química

### Padrões
`get_fisco_quimica_patterns` / `save_fisco_quimica_pattern` / `delete_fisco_quimica_pattern`

### Agentes
`get_fisco_quimica_agents` / `save_fisco_quimica_agent` / `delete_fisco_quimica_agent`

### Análises
`get_fisco_quimica_analyses` / `save_fisco_quimica_analysis` / `delete_fisco_quimica_analysis`

---

## Índice `generate_handler!` (ordem do código)

```
get_hub_token,
get_compras_config, save_compras_config,
get_microbio_config, save_config_microbio,
get_backup, restore_backup, get_compressed_backup, restore_compressed_backup,
get_feedbacks, save_feedback, resolve_feedback,
reset_db,
get_online_orders, save_online_order, delete_online_order,
get_online_stores, save_online_store, delete_online_store,
upload_order_receipt, open_receipt_file,
get_categories, save_category, delete_category,
get_items, update_item_details, import_item_observations, update_items_category,
get_similar_items, add_similar_item, remove_similar_item,
get_demands,
import_stock, import_consumption, import_invoices,
get_import_history, get_nf_import_control,
create_quotation, get_quotations, get_quotation_detail,
update_quotation_status, add_quotation_price, select_supplier,
delete_quotation, update_quotation_item_qty,
get_suppliers, save_supplier, get_supplier_history,
get_price_evolution, get_spending_by_supplier, get_spending_by_category,
get_products, save_product, delete_product, delete_all_products,
get_reports, save_reports, delete_report,
get_fisco_quimica_patterns, save_fisco_quimica_pattern, delete_fisco_quimica_pattern,
get_fisco_quimica_agents, save_fisco_quimica_agent, delete_fisco_quimica_agent,
get_fisco_quimica_analyses, save_fisco_quimica_analysis, delete_fisco_quimica_analysis
```

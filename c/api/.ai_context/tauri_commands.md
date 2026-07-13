# Assinaturas e Mapeamento de Comandos Tauri

Este documento detalha o mapeamento entre as funções de invoke executadas pelo frontend React em **[`src/lib/api.ts`](file:///c:/Users/Edson/antigravity/Natum/Frontend/src/lib/api.ts)** e as funções nativas registradas no backend Rust em **[`src/lib.rs`](file:///c:/Users/Edson/antigravity/Natum/Backend/NatumHub/src/lib.rs)**.

---

## 1. Compras - Configurações e Common

### `get_compras_config`
- **JS**: `api.getComprasConfig()`
- **Rust**: `fn get_compras_config(state: State<DbState>) -> Result<Option<ComprasAppConfig>, String>`

### `save_compras_config`
- **JS**: `api.saveComprasConfig(config)`
- **Rust**: `fn save_compras_config(state: State<DbState>, config: ComprasAppConfig) -> Result<(), String>`

---

## 2. Compras - Itens e Categorias

### `get_items`
- **JS**: `api.getItems(categoryId)`
- **Rust**: `fn get_items(state: State<DbState>, categoryId: Option<String>) -> Result<Vec<Item>, String>`

### `update_item_details`
- **JS**: `api.updateItemDetails(code, notes, isIgnored)`
- **Rust**: `fn update_item_details(state: State<DbState>, code: String, notes: Option<String>, isIgnored: bool) -> Result<(), String>`

### `get_categories`
- **JS**: `api.getCategories()`
- **Rust**: `fn get_categories(state: State<DbState>) -> Result<Vec<Category>, String>`

### `save_category`
- **JS**: `api.saveCategory(category)`
- **Rust**: `fn save_category(state: State<DbState>, category: Category) -> Result<(), String>`

### `delete_category`
- **JS**: `api.deleteCategory(id)`
- **Rust**: `fn delete_category(state: State<DbState>, id: String) -> Result<(), String>`

---

## 3. Compras - Fluxo de Demanda e Cotações

### `get_demands`
- **JS**: `api.getDemands(categoryId, targetDays)`
- **Rust**: `fn get_demands(state: State<DbState>, categoryId: Option<String>, targetDays: i32) -> Result<Vec<DemandResult>, String>`

### `create_quotation`
- **JS**: `api.createQuotation(title, itemCodes, recommendedQtys)`
- **Rust**: `fn create_quotation(state: State<DbState>, title: String, itemCodes: Vec<String>, recommendedQtys: Vec<f64>) -> Result<String, String>`

### `get_quotations`
- **JS**: `api.getQuotations(status)`
- **Rust**: `fn get_quotations(state: State<DbState>, status: Option<String>) -> Result<Vec<Quotation>, String>`

### `get_quotation_detail`
- **JS**: `api.getQuotationDetail(id)`
- **Rust**: `fn get_quotation_detail(state: State<DbState>, id: String) -> Result<serde_json::Value, String>` (Retorna `{ quotation: Quotation, items: Vec<QuotationItemDetail> }`)

### `update_quotation_status`
- **JS**: `api.updateQuotationStatus(id, status, notes)`
- **Rust**: `fn update_quotation_status(state: State<DbState>, id: String, status: String, notes: Option<String>) -> Result<(), String>`

### `add_quotation_price`
- **JS**: `api.addQuotationPrice(price)`
- **Rust**: `fn add_quotation_price(state: State<DbState>, price: QuotationPriceInput) -> Result<(), String>`

### `select_supplier`
- **JS**: `api.selectSupplier(quotationItemId, priceId)`
- **Rust**: `fn select_supplier(state: State<DbState>, quotationItemId: String, priceId: String) -> Result<(), String>`

### `delete_quotation`
- **JS**: `api.deleteQuotation(id)`
- **Rust**: `fn delete_quotation(state: State<DbState>, id: String) -> Result<(), String>`

---

## 4. Compras - Fornecedores e Notas Fiscais

### `get_suppliers`
- **JS**: `api.getSuppliers()`
- **Rust**: `fn get_suppliers(state: State<DbState>) -> Result<Vec<Supplier>, String>`

### `save_supplier`
- **JS**: `api.saveSupplier(supplier)`
- **Rust**: `fn save_supplier(state: State<DbState>, supplier: Supplier) -> Result<(), String>`

### `get_supplier_history`
- **JS**: `api.getSupplierHistory(id)`
- **Rust**: `fn get_supplier_history(state: State<DbState>, id: String) -> Result<serde_json::Value, String>` (Retorna `{ invoices: Vec<Invoice>, pricePoints: Vec<PricePoint> }`)

---

## 5. Microbiologia - Controle Laboratorial

### `get_products`
- **JS**: `api.getProducts()`
- **Rust**: `fn get_products(state: State<DbState>) -> Result<Vec<Product>, String>`

### `save_product`
- **JS**: `api.saveProduct(product)`
- **Rust**: `fn save_product(state: State<DbState>, product: Product) -> Result<(), String>`

### `delete_product`
- **JS**: `api.deleteProduct(code)`
- **Rust**: `fn delete_product(state: State<DbState>, code: String) -> Result<(), String>`

### `get_reports`
- **JS**: `api.getReports()`
- **Rust**: `fn get_reports(state: State<DbState>) -> Result<Vec<Report>, String>`

### `save_reports`
- **JS**: `api.saveReports(reports)`
- **Rust**: `fn save_reports(state: State<DbState>, reports: Vec<Report>) -> Result<(), String>`

### `delete_report`
- **JS**: `api.deleteReport(id)`
- **Rust**: `fn delete_report(state: State<DbState>, id: String) -> Result<(), String>`

---

## 6. Diagnóstico e Backup

### `save_feedback`
- **JS**: `api.saveFeedback(feedback)`
- **Rust**: `fn save_feedback(state: State<DbState>, feedback: Feedback) -> Result<(), String>` (Salva na base e escreve em `feedback.md`)

### `resolve_feedback`
- **JS**: `api.resolveFeedback(id)`
- **Rust**: `fn resolve_feedback(state: State<DbState>, id: String) -> Result<(), String>` (Marca como resolvido e atualiza `feedback.md`)

### `get_backup`
- **JS**: `api.getBackup()`
- **Rust**: `fn get_backup() -> Result<Vec<u8>, String>`

### `restore_backup`
- **JS**: `api.restoreBackup(data)`
- **Rust**: `fn restore_backup(data: Vec<u8>) -> Result<(), String>`

---

## 7. Físico-Química - Padrões, Agentes e Análises

### `get_fisco_quimica_patterns`
- **JS**: `api.getFiscoQuimicaPatterns()`
- **Rust**: `fn get_fisco_quimica_patterns(state: State<DbState>) -> Result<Vec<FiscoQuimicaPattern>, String>`

### `save_fisco_quimica_pattern`
- **JS**: `api.saveFiscoQuimicaPattern(pattern)`
- **Rust**: `fn save_fisco_quimica_pattern(state: State<DbState>, pattern: FiscoQuimicaPattern) -> Result<(), String>`

### `delete_fisco_quimica_pattern`
- **JS**: `api.deleteFiscoQuimicaPattern(productCode)`
- **Rust**: `fn delete_fisco_quimica_pattern(state: State<DbState>, productCode: String) -> Result<(), String>`

### `get_fisco_quimica_agents`
- **JS**: `api.getFiscoQuimicaAgents()`
- **Rust**: `fn get_fisco_quimica_agents(state: State<DbState>) -> Result<Vec<FiscoQuimicaAgent>, String>`

### `save_fisco_quimica_agent`
- **JS**: `api.saveFiscoQuimicaAgent(agent)`
- **Rust**: `fn save_fisco_quimica_agent(state: State<DbState>, agent: FiscoQuimicaAgent) -> Result<(), String>`

### `delete_fisco_quimica_agent`
- **JS**: `api.deleteFiscoQuimicaAgent(id)`
- **Rust**: `fn delete_fisco_quimica_agent(state: State<DbState>, id: String) -> Result<(), String>`

### `get_fisco_quimica_analyses`
- **JS**: `api.getFiscoQuimicaAnalyses()`
- **Rust**: `fn get_fisco_quimica_analyses(state: State<DbState>) -> Result<Vec<FiscoQuimicaAnalysis>, String>`

### `save_fisco_quimica_analysis`
- **JS**: `api.saveFiscoQuimicaAnalysis(analysis)`
- **Rust**: `fn save_fisco_quimica_analysis(state: State<DbState>, analysis: FiscoQuimicaAnalysis) -> Result<(), String>`

### `delete_fisco_quimica_analysis`
- **JS**: `api.deleteFiscoQuimicaAnalysis(id)`
- **Rust**: `fn delete_fisco_quimica_analysis(state: State<DbState>, id: String) -> Result<(), String>`

---

## 8. Compras Online - Pedidos

### `get_online_orders`
- **JS**: `api.getOnlineOrders()`
- **Rust**: `fn get_online_orders(state: State<DbState>) -> Result<Vec<OnlineOrder>, String>`

### `save_online_order`
- **JS**: `api.saveOnlineOrder(order)`
- **Rust**: `fn save_online_order(state: State<DbState>, order: OnlineOrder) -> Result<(), String>`

### `delete_online_order`
- **JS**: `api.deleteOnlineOrder(id)`
- **Rust**: `fn delete_online_order(state: State<DbState>, id: String) -> Result<(), String>`

### `upload_order_receipt`
- **JS**: `api.uploadOrderReceipt(orderId, fileData)`
- **Rust**: `fn upload_order_receipt(state: State<DbState>, orderId: String, fileData: Vec<u8>) -> Result<String, String>` (Salva o comprovante e retorna o caminho)

### `open_receipt_file`
- **JS**: `api.openReceiptFile(path)`
- **Rust**: `fn open_receipt_file(path: String) -> Result<(), String>` (Abre o arquivo com o programa padrão do SO)

---

## 9. Utilitários

### `reset_db`
- **JS**: `api.resetDb()`
- **Rust**: `fn reset_db(state: State<DbState>) -> Result<(), String>` (Limpa e recria todas as tabelas)

### `delete_all_products`
- **JS**: `api.deleteAllProducts()`
- **Rust**: `fn delete_all_products(state: State<DbState>) -> Result<(), String>` (Exclui todos os produtos do cadastro de Microbiologia)


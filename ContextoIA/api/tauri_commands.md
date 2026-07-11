# Comandos Tauri (invoke) — legado

> **Preferir REST** via `geral/lib/http.ts`. Clientes finos **não** têm SQLite local — invoke só funciona no **PC Principal**.

Lista canônica: `Backend/src/lib.rs` → `generate_handler![...]`.

## Rede / shell

| Comando | Uso |
|---------|-----|
| `hub_get_client_config` | Lê `Saves/client_config.json` |
| `hub_save_client_config` | Salva config rede |
| `hub_check_server_health` | Teste `/api/health` |
| `open_external_browser` | OAuth Google / login externo |

## Ainda via invoke (master local)

- **Backup:** `get_backup`, `restore_backup`, `get_compressed_backup`, `restore_compressed_backup`
- **Feedbacks:** `get_feedbacks`, `save_feedback`, `resolve_feedback`
- **Compras:** categories, items, demands, quotations, suppliers, imports, reports
- **Compras online:** orders, stores, receipts
- **Microbiologia / Físico-química:** CRUD produtos, laudos, patterns, agents, analyses
- **Dev:** `reset_db`

Mapeamento JS detalhado (se necessário): seções abaixo neste arquivo — **não ler** se a tarefa for só REST.

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

---

*(demais seções mantidas para referência pontual — ver arquivo histórico ou grep em `lib.rs`)*

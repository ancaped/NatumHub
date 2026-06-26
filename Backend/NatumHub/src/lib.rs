use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

// Exposed modules from Producao backend
pub mod calculations;
pub mod db;
pub mod google_drive;
pub mod handlers;
pub mod legacy_db;
pub mod models;
pub mod parser;
pub mod watcher;

// === TYPE DEFINITIONS ===

#[derive(Debug, Serialize, Deserialize)]
pub struct ObsInput {
    pub code: String,
    pub notes: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Supplier {
    pub id: String,
    pub name: String,
    pub contact: Option<String>,
    pub email: Option<String>,
    pub notes: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub code: String,
    pub description: String,
    pub unit: String,
    pub category_id: Option<String>,
    pub line: Option<String>,
    pub type_code: Option<String>,
    pub notes: Option<String>,
    pub is_ignored: bool,
    pub is_auto_ignored: Option<bool>,
    pub ignored_reason: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StockSnapshot {
    pub item_code: String,
    pub stock_qty: f64,
    pub reserved_qty: f64,
    pub in_production: f64,
    pub in_orders: f64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Consumption {
    pub item_code: String,
    pub year: i32,
    pub total_qty: f64,
    pub monthly_avg: f64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Invoice {
    pub id: String,
    pub invoice_number: String,
    pub item_code: String,
    pub description: Option<String>,
    pub unit: Option<String>,
    pub quantity: f64,
    pub unit_price: f64,
    pub total_value: f64,
    pub supplier_name: Option<String>,
    pub supplier_id: Option<String>,
    pub invoice_date: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DemandResult {
    pub item_code: String,
    pub description: String,
    pub unit: String,
    pub category_id: Option<String>,
    pub category_name: String,
    pub current_stock: f64,
    pub reserved_qty: f64,
    pub in_production: f64,
    pub in_orders: f64,
    pub avg2024: f64,
    pub avg2025: f64,
    pub avg2026: f64,
    pub overall_avg: f64,
    pub future_stock_forecast: f64,
    pub estimated_duration_days: f64,
    pub recommended_qty: f64,
    pub urgency: String,
    pub notes: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Quotation {
    pub id: String,
    pub title: String,
    pub status: String,
    pub target_days: i32,
    pub notes: Option<String>,
    pub director_demand_notes: Option<String>,
    pub director_final_notes: Option<String>,
    pub created_at: Option<String>,
    pub demand_approved_at: Option<String>,
    pub final_approved_at: Option<String>,
    pub ordered_at: Option<String>,
    pub item_count: Option<i32>,
    pub total_value: Option<f64>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct QuotationItem {
    pub id: String,
    pub quotation_id: String,
    pub item_code: String,
    pub description: Option<String>,
    pub unit: Option<String>,
    pub recommended_qty: f64,
    pub approved_qty: Option<f64>,
    pub final_qty: Option<f64>,
    pub notes: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct QuotationPrice {
    pub id: String,
    pub quotation_item_id: String,
    pub supplier_id: String,
    pub supplier_name: Option<String>,
    pub unit_price: f64,
    pub delivery_days: Option<i32>,
    pub min_qty: Option<f64>,
    pub payment_terms: Option<String>,
    pub notes: Option<String>,
    pub is_selected: bool,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct QuotationPriceInput {
    pub quotation_item_id: String,
    pub supplier_id: String,
    pub unit_price: f64,
    pub delivery_days: Option<i32>,
    pub min_qty: Option<f64>,
    pub payment_terms: Option<String>,
    pub notes: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct QuotationItemDetail {
    pub id: String,
    pub quotation_id: String,
    pub item_code: String,
    pub description: Option<String>,
    pub unit: Option<String>,
    pub recommended_qty: f64,
    pub approved_qty: Option<f64>,
    pub final_qty: Option<f64>,
    pub notes: Option<String>,
    pub prices: Vec<QuotationPrice>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub total_rows: i32,
    pub new_items: i32,
    pub updated_items: i32,
    pub skipped_duplicates: i32,
    pub errors: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StockImport {
    pub id: String,
    pub filename: String,
    pub source: String,
    pub imported_at: String,
    pub item_count: i32,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PricePoint {
    pub date: String,
    pub unit_price: f64,
    pub supplier_name: String,
    pub invoice_number: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SupplierSpend {
    pub supplier_id: String,
    pub supplier_name: String,
    pub total_value: f64,
    pub invoice_count: i32,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CategorySpend {
    pub category_id: String,
    pub category_name: String,
    pub total_value: f64,
    pub item_count: i32,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Feedback {
    pub id: String,
    pub feedback_type: String,
    pub description: String,
    pub page: String,
    pub logs: String,
    pub screenshot: String,
    pub status: String,
    pub created_at: Option<String>,
    pub resolved_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub code: String,
    pub name: String,
    pub packaging: String,
    pub validity: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub id: String,
    pub report_id: String,
    pub report_raw_num: i32,
    pub product_code: String,
    pub product_name: String,
    pub batch: String,
    pub collection_date: String,
    pub technician: String,
    pub created_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OnlineOrder {
    pub id: String,
    pub description: String,
    pub item_code: Option<String>,
    pub store_name: Option<String>,
    pub purchase_url: Option<String>,
    pub purchase_date: String,
    pub unit_price: Option<f64>,
    pub quantity: Option<i32>,
    pub shipping_cost: Option<f64>,
    pub total_price: Option<f64>,
    pub payment_method: Option<String>,
    pub tracking_code: Option<String>,
    pub tracking_url: Option<String>,
    pub status: String,
    pub estimated_delivery: Option<String>,
    pub receipt_path: Option<String>,
    pub notes: Option<String>,
    pub created_at: Option<String>,
    pub is_return: Option<bool>,
    pub return_deadline: Option<String>,
    pub return_status: Option<String>,
    pub return_notes: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OnlineStore {
    pub id: String,
    pub name: String,
    pub url: Option<String>,
    pub notes: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FiscoQuimicaPattern {
    pub product_code: String,
    pub ph_min: f64,
    pub ph_max: f64,
    pub viscosity_min: f64,
    pub viscosity_max: f64,
    pub density_target: f64,
    pub density_tolerance: f64,
    pub package_volume: f64,
    pub package_unit: String,
    pub allowed_agents: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FiscoQuimicaAgent {
    pub id: String,
    pub name: String,
    pub created_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FiscoQuimicaAnalysis {
    pub id: String,
    pub product_code: String,
    pub product_name: String,
    pub batch: String,
    pub analysis_date: String,
    pub technician: String,
    pub ph_measured: f64,
    pub viscosity_measured: f64,
    pub density_measured: f64,
    pub fraction_weight: f64,
    pub envase_target_weight: f64,
    pub envase_target_unit: String,
    pub has_adjustment: bool,
    pub corrective_agent_id: Option<String>,
    pub initial_viscosity: Option<f64>,
    pub trial_agent_qty: Option<f64>,
    pub trial_viscosity: Option<f64>,
    pub agent_qty_per_liter: Option<f64>,
    pub batch_size: Option<f64>,
    pub total_agent_required: Option<f64>,
    pub notes: Option<String>,
    pub created_at: Option<String>,
}

// === STATE ===
pub struct DbState(pub Mutex<Connection>);

// === DATABASE INITIALIZATION ===
fn initialize_hub_db(conn: &Connection) -> Result<(), rusqlite::Error> {
    // Compras Tables
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS categories (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            parent_id   TEXT,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parent_id) REFERENCES categories(id)
        );
        INSERT OR IGNORE INTO categories (id, name, parent_id) VALUES ('cat_mp', 'Matéria Prima', NULL);
        INSERT OR IGNORE INTO categories (id, name, parent_id) VALUES ('cat_emb', 'Embalagem', NULL);
        INSERT OR IGNORE INTO categories (id, name, parent_id) VALUES ('cat_mat', 'Materiais', NULL);
        INSERT OR IGNORE INTO categories (id, name, parent_id) VALUES ('cat_coloracao', 'Coloração', NULL);
        INSERT OR IGNORE INTO categories (id, name, parent_id) VALUES ('cat_apoio', 'Material de Apoio', NULL);

        CREATE TABLE IF NOT EXISTS suppliers (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL UNIQUE,
            contact     TEXT,
            email       TEXT,
            notes       TEXT,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS items (
            code        TEXT PRIMARY KEY,
            description TEXT NOT NULL,
            unit        TEXT NOT NULL,
            category_id TEXT,
            line        TEXT,
            type        TEXT,
            notes       TEXT,
            is_ignored  INTEGER DEFAULT 0,
            manual_category INTEGER DEFAULT 0,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        );

        CREATE TABLE IF NOT EXISTS stock_imports (
            id          TEXT PRIMARY KEY,
            filename    TEXT,
            source      TEXT DEFAULT 'ERP',
            imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
            item_count  INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS stock_snapshots (
            id              TEXT PRIMARY KEY,
            import_id       TEXT NOT NULL,
            item_code       TEXT NOT NULL,
            stock_qty       REAL DEFAULT 0,
            reserved_qty    REAL DEFAULT 0,
            in_production   REAL DEFAULT 0,
            in_orders       REAL DEFAULT 0,
            snapshot_date   TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (import_id) REFERENCES stock_imports(id),
            FOREIGN KEY (item_code) REFERENCES items(code)
        );

        CREATE TABLE IF NOT EXISTS consumption (
            id              TEXT PRIMARY KEY,
            item_code       TEXT NOT NULL,
            year            INTEGER NOT NULL,
            total_qty       REAL DEFAULT 0,
            monthly_avg     REAL DEFAULT 0,
            imported_at     TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (item_code) REFERENCES items(code),
            UNIQUE(item_code, year)
        );

        CREATE TABLE IF NOT EXISTS invoices (
            id              TEXT PRIMARY KEY,
            invoice_number  TEXT NOT NULL,
            item_code       TEXT NOT NULL,
            description     TEXT,
            unit            TEXT,
            quantity        REAL DEFAULT 0,
            unit_price      REAL DEFAULT 0,
            total_value     REAL DEFAULT 0,
            supplier_name   TEXT,
            supplier_id     TEXT,
            invoice_date    TEXT,
            imported_at     TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (item_code) REFERENCES items(code),
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        );

        CREATE TABLE IF NOT EXISTS nf_import_control (
            id              TEXT PRIMARY KEY,
            last_period_end TEXT NOT NULL,
            imported_at     TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS quotations (
            id                      TEXT PRIMARY KEY,
            title                   TEXT NOT NULL,
            status                  TEXT DEFAULT 'draft',
            target_days             INTEGER DEFAULT 90,
            notes                   TEXT,
            director_demand_notes   TEXT,
            director_final_notes    TEXT,
            created_at              TEXT DEFAULT CURRENT_TIMESTAMP,
            demand_approved_at      TEXT,
            final_approved_at       TEXT,
            ordered_at              TEXT
        );

        CREATE TABLE IF NOT EXISTS quotation_items (
            id              TEXT PRIMARY KEY,
            quotation_id    TEXT NOT NULL,
            item_code       TEXT NOT NULL,
            recommended_qty REAL DEFAULT 0,
            approved_qty    REAL,
            final_qty       REAL,
            notes           TEXT,
            FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
            FOREIGN KEY (item_code) REFERENCES items(code)
        );

        CREATE TABLE IF NOT EXISTS quotation_prices (
            id                  TEXT PRIMARY KEY,
            quotation_item_id   TEXT NOT NULL,
            supplier_id         TEXT NOT NULL,
            unit_price          REAL,
            delivery_days       INTEGER,
            min_qty             REAL,
            payment_terms       TEXT,
            notes               TEXT,
            is_selected         INTEGER DEFAULT 0,
            quoted_at           TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (quotation_item_id) REFERENCES quotation_items(id) ON DELETE CASCADE,
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        );

        CREATE TABLE IF NOT EXISTS config (
            key   TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT
        );

        INSERT OR IGNORE INTO settings (key, value) VALUES ('sql_host', '192.168.101.249');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('sql_port', '1433');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('sql_user', 'sa');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('sql_password', 'byteonDS2015');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('sql_database', 'NATUM');

        CREATE TABLE IF NOT EXISTS feedbacks (
            id          TEXT PRIMARY KEY,
            type        TEXT,
            description TEXT,
            page        TEXT,
            logs        TEXT,
            screenshot  TEXT,
            status      TEXT DEFAULT 'open',
            createdAt   TEXT DEFAULT CURRENT_TIMESTAMP,
            resolvedAt  TEXT
        );

        CREATE TABLE IF NOT EXISTS online_orders (
            id                  TEXT PRIMARY KEY,
            description         TEXT NOT NULL,
            item_code           TEXT,
            store_name          TEXT,
            purchase_url        TEXT,
            purchase_date       TEXT NOT NULL,
            unit_price          REAL DEFAULT 0,
            quantity            INTEGER DEFAULT 1,
            shipping_cost       REAL DEFAULT 0,
            total_price         REAL DEFAULT 0,
            payment_method      TEXT,
            tracking_code       TEXT,
            tracking_url        TEXT,
            status              TEXT DEFAULT 'preparing',
            estimated_delivery  TEXT,
            receipt_path        TEXT,
            notes               TEXT,
            created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
            is_return           INTEGER DEFAULT 0,
            return_deadline     TEXT,
            return_status       TEXT,
            return_notes        TEXT,
            FOREIGN KEY (item_code) REFERENCES items(code)
        );

        CREATE INDEX IF NOT EXISTS idx_stock_item ON stock_snapshots(item_code);
        CREATE INDEX IF NOT EXISTS idx_stock_item_date ON stock_snapshots(item_code, snapshot_date DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_consumption_item ON consumption(item_code);
        CREATE INDEX IF NOT EXISTS idx_invoices_item ON invoices(item_code);
        CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
        CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_name);
        CREATE INDEX IF NOT EXISTS idx_qi_quotation ON quotation_items(quotation_id);
        CREATE INDEX IF NOT EXISTS idx_qp_item ON quotation_prices(quotation_item_id);
    ")?;

    // Safety migrations for online_orders table columns (if schema was created in a previous version)
    let _ = conn.execute("ALTER TABLE items ADD COLUMN manual_category INTEGER DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE online_orders ADD COLUMN item_code TEXT", []);
    let _ = conn.execute("ALTER TABLE online_orders ADD COLUMN payment_method TEXT", []);
    let _ = conn.execute("ALTER TABLE online_orders ADD COLUMN receipt_path TEXT", []);
    let _ = conn.execute("ALTER TABLE online_orders ADD COLUMN is_return INTEGER DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE online_orders ADD COLUMN return_deadline TEXT", []);
    let _ = conn.execute("ALTER TABLE online_orders ADD COLUMN return_status TEXT", []);
    let _ = conn.execute("ALTER TABLE online_orders ADD COLUMN return_notes TEXT", []);

    // Create online_stores table and prepopulate
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS online_stores (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL UNIQUE,
            url         TEXT,
            notes       TEXT,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP
        );
    ")?;
    let _ = conn.execute("INSERT OR IGNORE INTO online_stores (id, name, url, notes) VALUES ('store_ml', 'Mercado Livre', 'https://www.mercadolivre.com.br', 'Mercado Livre Brasil')", []);
    let _ = conn.execute("INSERT OR IGNORE INTO online_stores (id, name, url, notes) VALUES ('store_shopee', 'Shopee', 'https://shopee.com.br', 'Shopee Brasil')", []);
    let _ = conn.execute("INSERT OR IGNORE INTO online_stores (id, name, url, notes) VALUES ('store_amazon', 'Amazon', 'https://www.amazon.com.br', 'Amazon Brasil')", []);

    // Microbiologia Tables
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS products (
            code TEXT PRIMARY KEY,
            name TEXT,
            packaging TEXT,
            validity TEXT
        );
        CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY,
            reportId TEXT,
            reportRawNum INTEGER,
            productCode TEXT,
            productName TEXT,
            batch TEXT,
            collectionDate TEXT,
            technician TEXT,
            createdAt TEXT
        );
    ")?;

    // Físico-Química Tables
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS fisco_quimica_patterns (
            product_code       TEXT PRIMARY KEY,
            ph_min             REAL NOT NULL,
            ph_max             REAL NOT NULL,
            viscosity_min      REAL NOT NULL,
            viscosity_max      REAL NOT NULL,
            density_target     REAL NOT NULL,
            density_tolerance  REAL DEFAULT 0.02,
            package_volume     REAL DEFAULT 1000,
            package_unit       TEXT DEFAULT 'mL'
        );

        CREATE TABLE IF NOT EXISTS fisco_quimica_corrective_agents (
            id                 TEXT PRIMARY KEY,
            name               TEXT UNIQUE NOT NULL,
            created_at         TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS fisco_quimica_analyses (
            id                    TEXT PRIMARY KEY,
            product_code          TEXT NOT NULL,
            product_name          TEXT NOT NULL,
            batch                 TEXT NOT NULL,
            analysis_date         TEXT NOT NULL,
            technician            TEXT NOT NULL,
            ph_measured           REAL NOT NULL,
            viscosity_measured    REAL NOT NULL,
            density_measured      REAL NOT NULL,
            fraction_weight       REAL NOT NULL,
            envase_target_weight  REAL NOT NULL,
            envase_target_unit    TEXT DEFAULT 'g',
            has_adjustment        INTEGER DEFAULT 0,
            corrective_agent_id   TEXT,
            initial_viscosity     REAL,
            trial_agent_qty       REAL,
            trial_viscosity       REAL,
            agent_qty_per_liter   REAL,
            batch_size            REAL,
            total_agent_required  REAL,
            notes                 TEXT,
            created_at            TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (corrective_agent_id) REFERENCES fisco_quimica_corrective_agents(id)
        );

        CREATE TABLE IF NOT EXISTS fisco_quimica_product_agents (
            product_code       TEXT NOT NULL,
            agent_id           TEXT NOT NULL,
            PRIMARY KEY (product_code, agent_id),
            FOREIGN KEY (product_code) REFERENCES fisco_quimica_patterns(product_code) ON DELETE CASCADE,
            FOREIGN KEY (agent_id) REFERENCES fisco_quimica_corrective_agents(id) ON DELETE CASCADE
        );

        -- Formulações de Produtos Acabados
        CREATE TABLE IF NOT EXISTS formulations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_code TEXT NOT NULL,
            ingredient_code TEXT NOT NULL,
            description TEXT,
            quantity REAL NOT NULL,
            percentage REAL,
            FOREIGN KEY (product_code) REFERENCES produtos(codigo) ON DELETE CASCADE,
            FOREIGN KEY (ingredient_code) REFERENCES items(code) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_formulations_product ON formulations(product_code);
        CREATE INDEX IF NOT EXISTS idx_formulations_ingredient ON formulations(ingredient_code);

        -- Movimentações de Estoque (Entradas/Saídas)
        CREATE TABLE IF NOT EXISTS stock_movements (
            id TEXT PRIMARY KEY,
            item_code TEXT NOT NULL,
            item_type TEXT NOT NULL,         -- 'insumo' | 'produto' | 'material'
            movement_type TEXT NOT NULL,     -- 'entrada' | 'saida'
            quantity REAL NOT NULL,
            date TEXT NOT NULL,              -- YYYY-MM-DD HH:MM:SS
            document_number TEXT,            -- Número da Nota ou do Lote
            details TEXT,                    -- Detalhes (ex: Fornecedor, Cliente, justificativa, etc.)
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_movements_item ON stock_movements(item_code);
        CREATE INDEX IF NOT EXISTS idx_movements_date ON stock_movements(date);
        CREATE INDEX IF NOT EXISTS idx_movements_saida_insumo_date ON stock_movements(movement_type, item_type, date, item_code, quantity);

        -- Pedidos de Compra (Header e Itens)
        CREATE TABLE IF NOT EXISTS purchase_orders (
            n_registro      INTEGER PRIMARY KEY, -- Unique identity from ERP
            n_pedido        INTEGER NOT NULL,    -- Order number (not unique)
            d_pedido        TEXT,
            n_cod_fornec    INTEGER,
            c_nome_f        TEXT,
            c_usuario       TEXT,
            c_status        TEXT,
            c_prazo_pgto    TEXT,
            c_prev_entrega  TEXT,
            n_valor         REAL,
            d_previsao      TEXT,
            c_email         TEXT,
            m_observac      TEXT
        );

        CREATE TABLE IF NOT EXISTS purchase_order_items (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            n_pedido_registro INTEGER,           -- References purchase_orders.n_registro
            n_pedido        INTEGER,             -- Order number
            c_referencia    TEXT,
            n_qtde          REAL,
            n_preco         REAL,
            n_chegou        REAL,
            c_descricao     TEXT,
            c_unidade       TEXT,
            n_valor_total   REAL,
            n_registro      INTEGER,
            c_chegada       TEXT,
            FOREIGN KEY (n_pedido_registro) REFERENCES purchase_orders(n_registro) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_poi_pedido_reg ON purchase_order_items(n_pedido_registro);
        CREATE INDEX IF NOT EXISTS idx_poi_pedido ON purchase_order_items(n_pedido);
        CREATE INDEX IF NOT EXISTS idx_poi_ref ON purchase_order_items(c_referencia);

        CREATE TABLE IF NOT EXISTS similar_items (
            item_code_a TEXT NOT NULL,
            item_code_b TEXT NOT NULL,
            PRIMARY KEY (item_code_a, item_code_b),
            FOREIGN KEY (item_code_a) REFERENCES items(code) ON DELETE CASCADE,
            FOREIGN KEY (item_code_b) REFERENCES items(code) ON DELETE CASCADE
        );
    ")?;

    Ok(())
}

// === OLD DATA MIGRATION ===
fn run_migration_if_needed() {
    let db_path = "../data.db";
    let is_new = !std::path::Path::new(db_path).exists();
    if is_new {
        println!("New database. Initializing tables and migrating data...");
        
        // Initialize Producao tables using db.rs init
        let prod_db = db::Db::new(db_path);
        prod_db.init().expect("failed to initialize Producao tables");

        // Open connection and initialize other tables
        let conn = Connection::open(db_path).expect("failed to open new database");
        initialize_hub_db(&conn).expect("failed to initialize Compras/Microbiologia tables");

        // 1. Migrate Compras Data
        let old_compras_db = "../Compras/data.db";
        if std::path::Path::new(old_compras_db).exists() {
            println!("Migrating Compras data from: {}", old_compras_db);
            let res = conn.execute_batch(&format!("
                ATTACH DATABASE '{}' AS db_compras;
                INSERT OR IGNORE INTO categories SELECT * FROM db_compras.categories;
                INSERT OR IGNORE INTO suppliers SELECT * FROM db_compras.suppliers;
                INSERT OR IGNORE INTO items SELECT * FROM db_compras.items;
                INSERT OR IGNORE INTO stock_imports SELECT * FROM db_compras.stock_imports;
                INSERT OR IGNORE INTO stock_snapshots SELECT * FROM db_compras.stock_snapshots;
                INSERT OR IGNORE INTO consumption SELECT * FROM db_compras.consumption;
                INSERT OR IGNORE INTO invoices SELECT * FROM db_compras.invoices;
                INSERT OR IGNORE INTO nf_import_control SELECT * FROM db_compras.nf_import_control;
                INSERT OR IGNORE INTO quotations SELECT * FROM db_compras.quotations;
                INSERT OR IGNORE INTO quotation_items SELECT * FROM db_compras.quotation_items;
                INSERT OR IGNORE INTO quotation_prices SELECT * FROM db_compras.quotation_prices;
                INSERT OR REPLACE INTO config (key, value) SELECT 'compras_main', value FROM db_compras.config WHERE key = 'main';
                INSERT OR IGNORE INTO feedbacks SELECT * FROM db_compras.feedbacks;
                DETACH DATABASE db_compras;
            ", old_compras_db));
            if let Err(e) = res {
                eprintln!("Warning: Compras migration failed: {}", e);
            } else {
                println!("Compras migration successful!");
            }
        }

        // 2. Migrate Microbiologia Data
        let old_microbio_db = "../AnaliseMicrobiologica/data.db";
        if std::path::Path::new(old_microbio_db).exists() {
            println!("Migrating Microbiologia data from: {}", old_microbio_db);
            let res = conn.execute_batch(&format!("
                ATTACH DATABASE '{}' AS db_microbio;
                INSERT OR IGNORE INTO products SELECT * FROM db_microbio.products;
                INSERT OR IGNORE INTO reports SELECT * FROM db_microbio.reports;
                INSERT OR REPLACE INTO config (key, value) SELECT 'microbio_main', value FROM db_microbio.config WHERE key = 'main';
                INSERT OR IGNORE INTO feedbacks SELECT * FROM db_microbio.feedbacks;
                DETACH DATABASE db_microbio;
            ", old_microbio_db));
            if let Err(e) = res {
                eprintln!("Warning: Microbiologia migration failed: {}", e);
            } else {
                println!("Microbiologia migration successful!");
            }
        }

        // 3. Migrate Producao Data
        let old_producao_db = "../../Producao/backend/natum_producao.db";
        if std::path::Path::new(old_producao_db).exists() {
            println!("Migrating Producao data from: {}", old_producao_db);
            let res = conn.execute_batch(&format!("
                ATTACH DATABASE '{}' AS db_producao;
                INSERT OR REPLACE INTO config_linhas SELECT * FROM db_producao.config_linhas;
                INSERT OR REPLACE INTO produtos SELECT * FROM db_producao.produtos;
                INSERT OR REPLACE INTO estoque_atual SELECT * FROM db_producao.estoque_atual;
                INSERT OR REPLACE INTO historico_faturamento SELECT * FROM db_producao.historico_faturamento;
                INSERT OR REPLACE INTO overrides_produtos SELECT * FROM db_producao.overrides_produtos;
                INSERT OR REPLACE INTO settings SELECT * FROM db_producao.settings;
                INSERT OR REPLACE INTO kit_composicao SELECT * FROM db_producao.kit_composicao;
                INSERT OR REPLACE INTO historico_producao SELECT * FROM db_producao.historico_producao;
                INSERT OR REPLACE INTO historico_importacoes SELECT * FROM db_producao.historico_importacoes;
                DETACH DATABASE db_producao;
            ", old_producao_db));
            if let Err(e) = res {
                eprintln!("Warning: Producao migration failed: {}", e);
            } else {
                println!("Producao migration successful!");
            }
        }
    } else {
        // Just run safety migrations on existing database
        let prod_db = db::Db::new(db_path);
        let _ = prod_db.init();
        let conn = Connection::open(db_path).expect("failed to open database");
        let _ = initialize_hub_db(&conn);
    }
}

// === TAURI COMMAND HANDLERS ===

// --- COMMON & FEEDBACK & CONFIG ---

#[tauri::command]
fn get_compras_config(state: State<DbState>, key: Option<String>) -> Result<Option<serde_json::Value>, String> {
    let conn = state.0.lock().unwrap();
    let config_key = key.unwrap_or_else(|| "compras_main".to_string());
    let mut stmt = conn.prepare("SELECT value FROM config WHERE key = ?1").map_err(|e| e.to_string())?;
    let res = stmt.query_row(params![config_key], |row| {
        let val: String = row.get(0)?;
        Ok(val)
    });

    match res {
        Ok(val) => {
            let config: serde_json::Value = serde_json::from_str(&val).map_err(|e| e.to_string())?;
            Ok(Some(config))
        },
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string())
    }
}

#[tauri::command]
fn save_compras_config(state: State<DbState>, config: serde_json::Value, key: Option<String>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    let config_key = key.unwrap_or_else(|| "compras_main".to_string());
    let val = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO config (key, value) VALUES (?1, ?2)",
        params![config_key, val],
    ).map_err(|e| e.to_string())?;

    if config_key == "compras_main" {
        // Reset non-manual items to their default master category
        let _ = conn.execute(
            "UPDATE items 
             SET category_id = CASE 
                 WHEN code LIKE '9.15.%' THEN 'cat_mp' 
                 WHEN code LIKE '08.%' THEN 'cat_mat'
                 ELSE 'cat_emb' 
             END 
             WHERE (manual_category IS NULL OR manual_category = 0)",
            [],
        );
    } else if config_key == "compras_coloracao" {
        // Reset only raw materials
        let _ = conn.execute(
            "UPDATE items 
             SET category_id = 'cat_mp'
             WHERE code LIKE '9.15.%' AND (manual_category IS NULL OR manual_category = 0)",
            [],
        );
    } else if config_key == "compras_apoio" {
        // Reset only support materials
        let _ = conn.execute(
            "UPDATE items 
             SET category_id = 'cat_mat'
             WHERE code LIKE '08.%' AND (manual_category IS NULL OR manual_category = 0)",
            [],
        );
    }

    if config_key == "compras_main" || config_key == "compras_coloracao" || config_key == "compras_apoio" {
        // Apply automatic subcategory rules if configured
        if let Some(rules) = config.get("autoSubcategories").and_then(|r| r.as_array()) {
            for rule in rules {
                if let (Some(sub_id), Some(prefix)) = (
                    rule.get("subcategoryId").and_then(|s| s.as_str()),
                    rule.get("prefix").and_then(|p| p.as_str())
                ) {
                    // Find parent_id of the target subcategory to restrict scope
                    let parent_id: Option<String> = conn.query_row(
                        "SELECT parent_id FROM categories WHERE id = ?1",
                        params![sub_id],
                        |row| row.get(0)
                    ).ok();

                    if let Some(parent) = parent_id {
                        if parent == "cat_coloracao" || parent == "cat_apoio" {
                            let query = if parent == "cat_coloracao" {
                                "
                                INSERT INTO overrides_produtos (codigo, categoria_produto)
                                SELECT p.codigo, ?1 FROM produtos p
                                LEFT JOIN overrides_produtos op ON p.codigo = op.codigo
                                WHERE (p.descricao LIKE ?2 OR p.codigo LIKE ?2)
                                  AND (op.categoria_produto IS NULL OR op.categoria_produto = 'cat_coloracao' OR op.categoria_produto = 'cat_apoio')
                                  AND p.codigo LIKE '1.34.%'
                                ON CONFLICT(codigo) DO UPDATE SET categoria_produto = excluded.categoria_produto"
                            } else {
                                "
                                INSERT INTO overrides_produtos (codigo, categoria_produto)
                                SELECT p.codigo, ?1 FROM produtos p
                                LEFT JOIN overrides_produtos op ON p.codigo = op.codigo
                                WHERE (p.descricao LIKE ?2 OR p.codigo LIKE ?2)
                                  AND (op.categoria_produto IS NULL OR op.categoria_produto = 'cat_coloracao' OR op.categoria_produto = 'cat_apoio')
                                  AND p.codigo LIKE '1.30.%'
                                ON CONFLICT(codigo) DO UPDATE SET categoria_produto = excluded.categoria_produto"
                            };
                            let like_pattern = format!("{}%", prefix);
                            let _ = conn.execute(query, params![sub_id, like_pattern]);
                        } else {
                            let query = "UPDATE items SET category_id = ?1 
                                         WHERE description LIKE ?2 
                                           AND category_id = ?3 
                                           AND (manual_category IS NULL OR manual_category = 0)";
                            let like_pattern = format!("{}%", prefix);
                            let _ = conn.execute(query, params![sub_id, like_pattern, parent]);
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn get_microbio_config(state: State<DbState>) -> Result<Option<serde_json::Value>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn.prepare("SELECT value FROM config WHERE key = 'microbio_main'").map_err(|e| e.to_string())?;
    let res = stmt.query_row([], |row| {
        let val: String = row.get(0)?;
        Ok(val)
    });

    match res {
        Ok(val) => {
            let config: serde_json::Value = serde_json::from_str(&val).map_err(|e| e.to_string())?;
            Ok(Some(config))
        },
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string())
    }
}

#[tauri::command]
fn save_config_microbio(state: State<DbState>, config: serde_json::Value) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    let val = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO config (key, value) VALUES ('microbio_main', ?1)",
        params![val],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_backup() -> Result<Vec<u8>, String> {
    std::fs::read("../data.db").map_err(|e| e.to_string())
}

#[tauri::command]
fn restore_backup(data: Vec<u8>) -> Result<(), String> {
    std::fs::write("../data.db", data).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_feedbacks(state: State<DbState>) -> Result<Vec<Feedback>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, type, description, page, logs, screenshot, status, createdAt, resolvedAt FROM feedbacks ORDER BY createdAt DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Feedback {
            id: row.get(0)?,
            feedback_type: row.get(1)?,
            description: row.get(2)?,
            page: row.get(3)?,
            logs: row.get(4)?,
            screenshot: row.get(5)?,
            status: row.get(6)?,
            created_at: row.get(7)?,
            resolved_at: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut feedbacks = Vec::new();
    for row in rows {
        feedbacks.push(row.map_err(|e| e.to_string())?);
    }
    Ok(feedbacks)
}

fn get_root_feedback_md_path() -> std::path::PathBuf {
    if let Ok(mut path) = std::env::current_exe() {
        while path.pop() {
            if path.join("Backend").is_dir() && path.join("Frontend").is_dir() {
                return path.join("feedback.md");
            }
        }
    }
    std::path::PathBuf::from("../../feedback.md")
}

fn sync_feedback_md(conn: &Connection) -> std::result::Result<(), String> {
    let mut stmt = conn.prepare(
        "SELECT id, type, description, page, logs, status, createdAt, resolvedAt FROM feedbacks ORDER BY createdAt DESC"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, Option<String>>(7)?,
        ))
    }).map_err(|e| e.to_string())?;

    let mut bugs_pending = Vec::new();
    let mut feed_pending = Vec::new();
    let mut resolved = Vec::new();
    let mut logs_section = String::new();

    for r in rows {
        let (id, fb_type, desc, page, logs, status, created, resolved_at) = r.map_err(|e| e.to_string())?;
        
        let desc_clean = desc.replace('\n', " ").replace('|', "\\|");
        let page_clean = page.replace('\n', " ").replace('|', "\\|");
        let date_clean = created.split('T').next().unwrap_or("-").split(' ').next().unwrap_or("-").to_string();
        let short_id = id.get(0..8).unwrap_or(&id);

        if status == "resolved" {
            let res_date = resolved_at.as_deref().unwrap_or("-").split('T').next().unwrap_or("-").split(' ').next().unwrap_or("-").to_string();
            resolved.push(format!(
                "| `{}` | {} | {} | `{}` | {} | {} |",
                short_id,
                date_clean,
                if fb_type == "bug" { "🔴 Bug" } else { "🔵 Sugestão" },
                page_clean,
                desc_clean,
                res_date
            ));
        } else if fb_type == "bug" {
            let log_ref = if !logs.trim().is_empty() {
                format!("[Ver Logs](#bug-log-{})", short_id)
            } else {
                "-".to_string()
            };
            bugs_pending.push(format!(
                "| `{}` | {} | `{}` | {} | {} |",
                short_id,
                date_clean,
                page_clean,
                desc_clean,
                log_ref
            ));
            
            if !logs.trim().is_empty() {
                logs_section.push_str(&format!(
                    "### bug-log-{}\n\n**Página:** `{}`  \n**Descrição:** {}  \n\n```json\n{}\n```\n\n",
                    short_id, page_clean, desc_clean, logs
                ));
            }
        } else {
            feed_pending.push(format!(
                "| `{}` | {} | `{}` | {} |",
                short_id,
                date_clean,
                page_clean,
                desc_clean
            ));
        }
    }

    let mut md = String::new();
    md.push_str("# Feedback e Relatórios de Bugs - NatumHub\n\n");
    md.push_str("Este arquivo é gerado automaticamente pelo aplicativo NatumHub a partir dos feedbacks enviados pelo painel flutuante. Ele serve para que desenvolvedores e IAs possam analisar e corrigir problemas rapidamente.\n\n");

    md.push_str("## 🔴 Bugs Pendentes\n\n");
    if bugs_pending.is_empty() {
        md.push_str("Nenhum bug pendente! 🎉\n\n");
    } else {
        md.push_str("| ID | Data | Página | Descrição | Logs |\n");
        md.push_str("| --- | --- | --- | --- | --- |\n");
        for b in bugs_pending {
            md.push_str(&b);
            md.push_str("\n");
        }
        md.push_str("\n");
    }

    md.push_str("## 🔵 Sugestões / Feedbacks Pendentes\n\n");
    if feed_pending.is_empty() {
        md.push_str("Nenhuma sugestão pendente.\n\n");
    } else {
        md.push_str("| ID | Data | Página | Descrição |\n");
        md.push_str("| --- | --- | --- | --- |\n");
        for f in feed_pending {
            md.push_str(&f);
            md.push_str("\n");
        }
        md.push_str("\n");
    }

    md.push_str("## 🟢 Resolvidos\n\n");
    if resolved.is_empty() {
        md.push_str("Nenhum item resolvido ainda.\n\n");
    } else {
        md.push_str("| ID | Data | Tipo | Página | Descrição | Resolvido Em |\n");
        md.push_str("| --- | --- | --- | --- | --- | --- |\n");
        for r in resolved {
            md.push_str(&r);
            md.push_str("\n");
        }
        md.push_str("\n");
    }

    if !logs_section.is_empty() {
        md.push_str("## 📋 Logs de Erros\n\n");
        md.push_str(&logs_section);
    }

    // Write to root folder (absolute resolution)
    let path = get_root_feedback_md_path();
    let _ = std::fs::write(&path, &md);

    Ok(())
}

#[tauri::command]
fn save_feedback(state: State<DbState>, feedback: Feedback) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO feedbacks (id, type, description, page, logs, screenshot, status, createdAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)",
        params![feedback.id, feedback.feedback_type, feedback.description, feedback.page, feedback.logs, feedback.screenshot, feedback.status],
    ).map_err(|e| e.to_string())?;
    
    // Sync to feedback.md file
    let _ = sync_feedback_md(&conn);
    Ok(())
}

#[tauri::command]
fn resolve_feedback(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "UPDATE feedbacks SET status = 'resolved', resolvedAt = CURRENT_TIMESTAMP WHERE id = ?1",
        params![id],
    ).map_err(|e| e.to_string())?;
    
    // Sync to feedback.md file
    let _ = sync_feedback_md(&conn);
    Ok(())
}

#[tauri::command]
fn get_online_orders(state: State<DbState>) -> Result<Vec<OnlineOrder>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, description, item_code, store_name, purchase_url, purchase_date, unit_price, quantity, shipping_cost, total_price, payment_method, tracking_code, tracking_url, status, estimated_delivery, receipt_path, notes, created_at, is_return, return_deadline, return_status, return_notes FROM online_orders ORDER BY purchase_date DESC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(OnlineOrder {
            id: row.get(0)?,
            description: row.get(1)?,
            item_code: row.get(2)?,
            store_name: row.get(3)?,
            purchase_url: row.get(4)?,
            purchase_date: row.get(5)?,
            unit_price: row.get(6)?,
            quantity: row.get(7)?,
            shipping_cost: row.get(8)?,
            total_price: row.get(9)?,
            payment_method: row.get(10)?,
            tracking_code: row.get(11)?,
            tracking_url: row.get(12)?,
            status: row.get(13)?,
            estimated_delivery: row.get(14)?,
            receipt_path: row.get(15)?,
            notes: row.get(16)?,
            created_at: row.get(17)?,
            is_return: Some(row.get::<_, Option<i32>>(18)?.unwrap_or(0) != 0),
            return_deadline: row.get(19)?,
            return_status: row.get(20)?,
            return_notes: row.get(21)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut orders = Vec::new();
    for row in rows {
        orders.push(row.map_err(|e| e.to_string())?);
    }
    Ok(orders)
}

#[tauri::command]
fn save_online_order(state: State<DbState>, order: OnlineOrder) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO online_orders (id, description, item_code, store_name, purchase_url, purchase_date, unit_price, quantity, shipping_cost, total_price, payment_method, tracking_code, tracking_url, status, estimated_delivery, receipt_path, notes, is_return, return_deadline, return_status, return_notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
        params![
            order.id,
            order.description,
            order.item_code,
            order.store_name,
            order.purchase_url,
            order.purchase_date,
            order.unit_price,
            order.quantity,
            order.shipping_cost,
            order.total_price,
            order.payment_method,
            order.tracking_code,
            order.tracking_url,
            order.status,
            order.estimated_delivery,
            order.receipt_path,
            order.notes,
            order.is_return.unwrap_or(false) as i32,
            order.return_deadline,
            order.return_status,
            order.return_notes,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_online_order(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM online_orders WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_online_stores(state: State<DbState>) -> Result<Vec<OnlineStore>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, name, url, notes, created_at FROM online_stores ORDER BY name ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(OnlineStore {
            id: row.get(0)?,
            name: row.get(1)?,
            url: row.get(2)?,
            notes: row.get(3)?,
            created_at: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut stores = Vec::new();
    for row in rows {
        stores.push(row.map_err(|e| e.to_string())?);
    }
    Ok(stores)
}

#[tauri::command]
fn save_online_store(state: State<DbState>, store: OnlineStore) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO online_stores (id, name, url, notes) VALUES (?1, ?2, ?3, ?4)",
        params![
            store.id,
            store.name,
            store.url,
            store.notes,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_online_store(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM online_stores WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn upload_order_receipt(id: String, filename: String, data: Vec<u8>) -> Result<String, String> {
    let receipts_dir = std::path::Path::new("../receipts");
    if !receipts_dir.exists() {
        std::fs::create_dir_all(receipts_dir).map_err(|e| e.to_string())?;
    }
    let clean_filename = filename.replace(|c: char| !c.is_alphanumeric() && c != '.' && c != '-' && c != '_', "");
    let file_path = receipts_dir.join(format!("{}_{}", id, clean_filename));
    std::fs::write(&file_path, data).map_err(|e| e.to_string())?;
    let abs_path = std::fs::canonicalize(&file_path).map_err(|e| e.to_string())?;
    Ok(abs_path.to_string_lossy().to_string())
}

#[tauri::command]
fn open_receipt_file(path: String) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(&["/C", "start", "", &path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn reset_db(state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute_batch("
        DROP TABLE IF EXISTS fisco_quimica_analyses;
        DROP TABLE IF EXISTS fisco_quimica_corrective_agents;
        DROP TABLE IF EXISTS fisco_quimica_patterns;
        DROP TABLE IF EXISTS quotation_prices;
        DROP TABLE IF EXISTS quotation_items;
        DROP TABLE IF EXISTS quotations;
        DROP TABLE IF EXISTS invoices;
        DROP TABLE IF EXISTS consumption;
        DROP TABLE IF EXISTS stock_snapshots;
        DROP TABLE IF EXISTS stock_imports;
        DROP TABLE IF EXISTS items;
        DROP TABLE IF EXISTS suppliers;
        DROP TABLE IF EXISTS categories;
        DROP TABLE IF EXISTS products;
        DROP TABLE IF EXISTS reports;
        DROP TABLE IF EXISTS feedbacks;
        DROP TABLE IF EXISTS config;
        DROP TABLE IF EXISTS online_orders;
    ").map_err(|e| e.to_string())?;
    
    initialize_hub_db(&conn).map_err(|e| e.to_string())?;
    Ok(())
}

// --- COMPRAS MODULE ---

#[tauri::command]
fn import_stock(state: State<DbState>, rows: Vec<serde_json::Value>, filename: String) -> Result<ImportResult, String> {
    let mut conn = state.0.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    let import_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO stock_imports (id, filename, item_count) VALUES (?1, ?2, ?3)",
        params![import_id, filename, rows.len() as i32],
    ).map_err(|e| e.to_string())?;

    let mut new_items = 0;
    let mut updated_items = 0;
    let skipped_duplicates = 0;
    let mut errors = Vec::new();

    for row in &rows {
        let code = row["itemCode"].as_str().unwrap_or("");
        let desc = row["description"].as_str().unwrap_or("");
        if code.is_empty() { continue; }

        let unit = row["unit"].as_str().unwrap_or("UN");
        let line = row["line"].as_str();
        let type_code = row["typeCode"].as_str();
        let stock_qty = row["stockQty"].as_f64().unwrap_or(0.0);
        let reserved_qty = row["reservedQty"].as_f64().unwrap_or(0.0);
        let in_prod = row["inProduction"].as_f64().unwrap_or(0.0);
        let in_orders = row["inOrders"].as_f64().unwrap_or(0.0);

        let cat_id = if code.starts_with("9.15.") { "cat_mp" } else { "cat_emb" };

        let item_exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM items WHERE code = ?1)", 
            params![code], 
            |r| r.get(0)
        ).unwrap_or(false);

        if item_exists {
            let _ = tx.execute(
                "UPDATE items SET description = ?1, unit = ?2, line = ?3, type = ?4, updated_at = CURRENT_TIMESTAMP WHERE code = ?5",
                params![desc, unit, line, type_code, code]
            );
            updated_items += 1;
        } else {
            let _ = tx.execute(
                "INSERT INTO items (code, description, unit, category_id, line, type) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![code, desc, unit, cat_id, line, type_code]
            );
            new_items += 1;
        }

        let snapshot_id = Uuid::new_v4().to_string();
        let res = tx.execute(
            "INSERT INTO stock_snapshots (id, import_id, item_code, stock_qty, reserved_qty, in_production, in_orders) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![snapshot_id, import_id, code, stock_qty, reserved_qty, in_prod, in_orders]
        );
        if let Err(e) = res {
            errors.push(format!("Error on snapshot for {}: {}", code, e));
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(ImportResult {
        total_rows: rows.len() as i32,
        new_items,
        updated_items,
        skipped_duplicates,
        errors,
    })
}

#[tauri::command]
fn import_consumption(state: State<DbState>, rows: Vec<serde_json::Value>, year: i32, _filename: String) -> Result<ImportResult, String> {
    let mut conn = state.0.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut new_items = 0;
    let mut updated_items = 0;
    let skipped_duplicates = 0;
    let mut errors = Vec::new();

    use std::collections::HashMap;
    let mut aggregated: HashMap<String, (String, f64, f64)> = HashMap::new();

    for row in &rows {
        let code = row["itemCode"].as_str().unwrap_or("").trim().to_string();
        let desc = row["description"].as_str().unwrap_or("").trim().to_string();
        if code.is_empty() { continue; }
        let total_qty = row["totalQty"].as_f64().unwrap_or(0.0);
        let monthly_avg = row["monthlyAvg"].as_f64().unwrap_or(0.0);

        let entry = aggregated.entry(code).or_insert((desc, 0.0, 0.0));
        entry.1 += total_qty;
        entry.2 += monthly_avg;
    }

    for (code, (desc, total_qty, monthly_avg)) in aggregated {
        let cat_id = if code.starts_with("9.15.") { "cat_mp" } else { "cat_emb" };

        let item_exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM items WHERE code = ?1)", 
            params![code], 
            |r| r.get(0)
        ).unwrap_or(false);

        if !item_exists {
            let _ = tx.execute(
                "INSERT INTO items (code, description, unit, category_id) VALUES (?1, ?2, 'UN', ?3)",
                params![code, desc, cat_id]
            );
            new_items += 1;
        }

        let consumption_id = Uuid::new_v4().to_string();
        let res = tx.execute(
            "INSERT INTO consumption (id, item_code, year, total_qty, monthly_avg) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(item_code, year) DO UPDATE SET 
                total_qty = ?4, 
                monthly_avg = ?5, 
                imported_at = CURRENT_TIMESTAMP",
            params![consumption_id, code, year, total_qty, monthly_avg]
        );
        
        match res {
            Ok(_) => { updated_items += 1; },
            Err(e) => { errors.push(format!("Erro em {}: {}", code, e)); }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(ImportResult {
        total_rows: rows.len() as i32,
        new_items,
        updated_items,
        skipped_duplicates,
        errors,
    })
}

#[tauri::command]
fn import_invoices(state: State<DbState>, rows: Vec<serde_json::Value>, _filename: String) -> Result<ImportResult, String> {
    let mut conn = state.0.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut new_items = 0;
    let mut updated_items = 0;
    let mut skipped_duplicates = 0;
    let mut errors = Vec::new();

    for row in &rows {
        let code = row["itemCode"].as_str().unwrap_or("");
        let inv_number = row["invoiceNumber"].as_str().unwrap_or("");
        if code.is_empty() || inv_number.is_empty() { continue; }

        let desc = row["description"].as_str().unwrap_or("");
        let unit = row["unit"].as_str().unwrap_or("");
        let inv_date = row["invoiceDate"].as_str().unwrap_or("");
        let qty = row["quantity"].as_f64().unwrap_or(0.0);
        let unit_price = row["unitPrice"].as_f64().unwrap_or(0.0);
        let total_val = row["totalValue"].as_f64().unwrap_or(0.0);
        let supplier_name = row["supplierName"].as_str().unwrap_or("");

        let item_exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM items WHERE code = ?1)", 
            params![code], 
            |r| r.get(0)
        ).unwrap_or(false);

        if !item_exists {
            let cat_id = if code.starts_with("9.15.") { "cat_mp" } else { "cat_emb" };
            let _ = tx.execute(
                "INSERT INTO items (code, description, unit, category_id) VALUES (?1, ?2, ?3, ?4)",
                params![code, desc, if unit.is_empty() { "UN" } else { unit }, cat_id]
            );
            new_items += 1;
        }

        let mut supplier_id = String::new();
        if !supplier_name.is_empty() {
            let sid: Result<String, _> = tx.query_row(
                "SELECT id FROM suppliers WHERE name = ?1", 
                params![supplier_name], 
                |r| r.get(0)
            );
            match sid {
                Ok(id) => supplier_id = id,
                Err(_) => {
                    supplier_id = Uuid::new_v4().to_string();
                    let _ = tx.execute(
                        "INSERT INTO suppliers (id, name) VALUES (?1, ?2)",
                        params![supplier_id, supplier_name]
                    );
                    new_items += 1;
                }
            }
        }

        let inv_id = Uuid::new_v4().to_string();
        let res = tx.execute(
            "INSERT INTO invoices (id, invoice_number, item_code, description, unit, quantity, unit_price, total_value, supplier_name, supplier_id, invoice_date) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![inv_id, inv_number, code, desc, unit, qty, unit_price, total_val, supplier_name, if supplier_id.is_empty() { None } else { Some(supplier_id) }, inv_date]
        );
        match res {
            Ok(_) => updated_items += 1,
            Err(rusqlite::Error::SqliteFailure(e, _)) if e.code == rusqlite::ffi::ErrorCode::ConstraintViolation => {
                skipped_duplicates += 1;
            },
            Err(e) => errors.push(format!("Error on invoice {} for {}: {}", inv_number, code, e)),
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(ImportResult {
        total_rows: rows.len() as i32,
        new_items,
        updated_items,
        skipped_duplicates,
        errors,
    })
}

#[tauri::command]
fn get_import_history(state: State<DbState>) -> Result<Vec<StockImport>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, IFNULL(filename,''), IFNULL(source,'ERP'), IFNULL(imported_at,''), IFNULL(item_count,0)
         FROM stock_imports ORDER BY imported_at DESC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(StockImport {
            id: row.get(0)?,
            filename: row.get(1)?,
            source: row.get(2)?,
            imported_at: row.get(3)?,
            item_count: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut imports = Vec::new();
    for row in rows {
        imports.push(row.map_err(|e| e.to_string())?);
    }
    Ok(imports)
}

#[tauri::command]
fn get_nf_import_control(state: State<DbState>) -> Result<Option<serde_json::Value>, String> {
    let conn = state.0.lock().unwrap();
    let res = conn.query_row(
        "SELECT last_period_end FROM nf_import_control ORDER BY imported_at DESC LIMIT 1",
        [],
        |row| {
            let end: String = row.get(0)?;
            Ok(end)
        }
    );
    match res {
        Ok(last_period_end) => Ok(Some(serde_json::json!({ "lastPeriodEnd": last_period_end }))),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn get_ignored_product_statuses(conn: &Connection) -> Vec<String> {
    let query = "SELECT value FROM settings WHERE key = 'ignored_product_statuses'";
    let res = conn.query_row(query, [], |row| {
        let val: String = row.get(0)?;
        Ok(val)
    });
    match res {
        Ok(val) => {
            serde_json::from_str(&val).unwrap_or_else(|_| vec!["descontinuado".to_string(), "terceirizado".to_string()])
        }
        Err(_) => vec!["descontinuado".to_string(), "terceirizado".to_string()]
    }
}

fn get_auto_ignored_ingredients(conn: &Connection) -> std::collections::HashMap<String, String> {
    let ignored_statuses = get_ignored_product_statuses(conn);
    if ignored_statuses.is_empty() {
        return std::collections::HashMap::new();
    }

    let mut item_products_map: std::collections::HashMap<String, Vec<(String, String, String)>> = std::collections::HashMap::new();
    let query = "
        SELECT f.ingredient_code, f.product_code, p.descricao, IFNULL(op.status_produto, 'ativo')
        FROM formulations f
        JOIN produtos p ON f.product_code = p.codigo
        LEFT JOIN overrides_produtos op ON p.codigo = op.codigo
    ";
    if let Ok(mut stmt) = conn.prepare(query) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        }) {
            for r in rows {
                if let Ok((ing_code, prod_code, prod_desc, prod_status)) = r {
                    item_products_map.entry(ing_code).or_default().push((prod_code, prod_desc, prod_status));
                }
            }
        }
    }

    let mut auto_ignored_map = std::collections::HashMap::new();
    for (ing_code, products_info) in item_products_map {
        if products_info.is_empty() {
            continue;
        }

        let all_ignored = products_info.iter().all(|(_, _, status)| ignored_statuses.contains(status));
        if all_ignored {
            let mut list_parts = Vec::new();
            for (_code, desc, status) in &products_info {
                let status_label = match status.as_str() {
                    "descontinuado" => "Sair de Linha",
                    "terceirizado" => "Terceirizado",
                    "coloracao" => "Coloração",
                    "apoio" => "Material de Apoio",
                    "bases" => "Bases",
                    s => s,
                };
                list_parts.push(format!("{} ({})", desc, status_label));
            }
            let reason = format!(
                "Suspenso por Linha/Produto ({})",
                list_parts.join(", ")
            );
            auto_ignored_map.insert(ing_code, reason);
        }
    }

    auto_ignored_map
}

#[tauri::command]
fn get_items(state: State<DbState>, category_id: Option<String>) -> Result<Vec<Item>, String> {
    let conn = state.0.lock().unwrap();
    let auto_ignored = get_auto_ignored_ingredients(&conn);

    let mut sql = String::from(
        "SELECT code, description, unit, category_id, line, type, notes, is_ignored FROM items WHERE 1=1"
    );
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    if let Some(ref cat_id) = category_id {
        sql.push_str(" AND category_id = ?1");
        params_vec.push(Box::new(cat_id.clone()));
    }
    sql.push_str(" ORDER BY description");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| &**p).collect();
    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        let code: String = row.get(0)?;
        let desc: String = row.get(1)?;
        let unit: String = row.get(2)?;
        let cat_id: Option<String> = row.get(3)?;
        let line: Option<String> = row.get(4)?;
        let type_code: Option<String> = row.get(5)?;
        let notes: Option<String> = row.get(6)?;
        let is_manually_ignored = row.get::<_, i32>(7)? == 1;

        let is_auto_ignored = auto_ignored.contains_key(&code);
        let ignored_reason = auto_ignored.get(&code).cloned();
        let is_ignored = is_manually_ignored || is_auto_ignored;

        Ok(Item {
            code,
            description: desc,
            unit,
            category_id: cat_id,
            line,
            type_code,
            notes,
            is_ignored,
            is_auto_ignored: Some(is_auto_ignored),
            ignored_reason,
        })
    }).map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| e.to_string())?);
    }
    Ok(items)
}

#[tauri::command]
fn get_similar_items(state: State<DbState>, code: String) -> Result<Vec<Item>, String> {
    let conn = state.0.lock().unwrap();
    let auto_ignored = get_auto_ignored_ingredients(&conn);

    let mut stmt = conn.prepare(
        "SELECT code, description, unit, category_id, line, type, notes, is_ignored 
         FROM items 
         WHERE code IN (
             SELECT item_code_b FROM similar_items WHERE item_code_a = ?1
             UNION
             SELECT item_code_a FROM similar_items WHERE item_code_b = ?1
         )
         ORDER BY description"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map(params![code], |row| {
        let code: String = row.get(0)?;
        let desc: String = row.get(1)?;
        let unit: String = row.get(2)?;
        let cat_id: Option<String> = row.get(3)?;
        let line: Option<String> = row.get(4)?;
        let type_code: Option<String> = row.get(5)?;
        let notes: Option<String> = row.get(6)?;
        let is_manually_ignored = row.get::<_, i32>(7)? == 1;

        let is_auto_ignored = auto_ignored.contains_key(&code);
        let ignored_reason = auto_ignored.get(&code).cloned();
        let is_ignored = is_manually_ignored || is_auto_ignored;

        Ok(Item {
            code,
            description: desc,
            unit,
            category_id: cat_id,
            line,
            type_code,
            notes,
            is_ignored,
            is_auto_ignored: Some(is_auto_ignored),
            ignored_reason,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| e.to_string())?);
    }
    Ok(items)
}

#[tauri::command]
fn add_similar_item(state: State<DbState>, code_a: String, code_b: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    let (first, second) = if code_a < code_b { (&code_a, &code_b) } else { (&code_b, &code_a) };
    conn.execute(
        "INSERT OR IGNORE INTO similar_items (item_code_a, item_code_b) VALUES (?1, ?2)",
        params![first, second],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn remove_similar_item(state: State<DbState>, code_a: String, code_b: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    let (first, second) = if code_a < code_b { (&code_a, &code_b) } else { (&code_b, &code_a) };
    conn.execute(
        "DELETE FROM similar_items WHERE item_code_a = ?1 AND item_code_b = ?2",
        params![first, second],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_item_details(state: State<DbState>, code: String, notes: Option<String>, is_ignored: bool) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    let is_product: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM produtos WHERE codigo = ?1)",
        params![code],
        |r| r.get(0)
    ).unwrap_or(false);

    if is_product {
        conn.execute(
            "INSERT INTO overrides_produtos (codigo, observacao, visivel)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(codigo) DO UPDATE SET 
                observacao = excluded.observacao,
                visivel = excluded.visivel",
            params![code, notes, if is_ignored { 0 } else { 1 }],
        ).map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE items SET notes = ?2, is_ignored = ?3, updated_at = CURRENT_TIMESTAMP WHERE code = ?1",
            params![code, notes, if is_ignored { 1 } else { 0 }],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn update_items_category(state: State<DbState>, codes: Vec<String>, category_id: Option<String>) -> Result<(), String> {
    let mut conn = state.0.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for code in codes {
        let is_product: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM produtos WHERE codigo = ?1)",
            params![code],
            |r| r.get(0)
        ).unwrap_or(false);

        if is_product {
            tx.execute(
                "INSERT INTO overrides_produtos (codigo, categoria_produto)
                 VALUES (?1, ?2)
                 ON CONFLICT(codigo) DO UPDATE SET categoria_produto = excluded.categoria_produto",
                params![code, category_id],
            ).map_err(|e| e.to_string())?;
        } else {
            let target_cat = match &category_id {
                Some(cat) => Some(cat.clone()),
                None => {
                    let default_cat = if code.starts_with("9.15.") {
                        "cat_mp"
                    } else if code.starts_with("08.") {
                        "cat_mat"
                    } else {
                        "cat_emb"
                    };
                    Some(default_cat.to_string())
                }
            };
            tx.execute(
                "UPDATE items SET category_id = ?2, manual_category = 1, updated_at = CURRENT_TIMESTAMP WHERE code = ?1",
                params![code, target_cat],
            ).map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn import_item_observations(state: State<DbState>, observations: Vec<ObsInput>) -> Result<(), String> {
    let mut conn = state.0.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for obs in observations {
        tx.execute(
            "UPDATE items SET notes = ?2, is_ignored = 1, updated_at = CURRENT_TIMESTAMP WHERE code = ?1",
            params![obs.code, obs.notes],
        ).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_demands(state: State<DbState>, category_id: Option<String>, target_days: i32) -> Result<Vec<DemandResult>, String> {
    let conn = state.0.lock().unwrap();

    // A. Query all open production lotes (entradas of products)
    let mut open_lotes = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT document_number, item_code, quantity, details 
         FROM stock_movements 
         WHERE item_type = 'produto' AND movement_type = 'entrada'"
    ) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, Option<String>>(3)?.unwrap_or_default(),
            ))
        }) {
            for r in rows {
                if let Ok((doc_num, item_code, qty, details)) = r {
                    if !doc_num.is_empty() {
                        let mut status = String::new();
                        let mut d_pesado = String::new();
                        for part in details.split('|') {
                            let part = part.trim();
                            if part.starts_with("Status:") {
                                status = part.trim_start_matches("Status:").trim().to_string();
                            } else if part.starts_with("dPesado:") {
                                d_pesado = part.trim_start_matches("dPesado:").trim().to_string();
                            }
                        }
                        let is_closed = status == "EA" || status == "CF" || status == "FP" || status == "CA" || status == "FI";
                        if !is_closed {
                            open_lotes.push((doc_num, item_code, qty, d_pesado));
                        }
                    }
                }
            }
        }
    }

    // B. Query all formulations
    struct FormEntry {
        ingredient_code: String,
        quantity: f64,
        percentage: f64,
    }
    let mut formulations_map: std::collections::HashMap<String, Vec<FormEntry>> = std::collections::HashMap::new();
    let mut formulation_sums: std::collections::HashMap<String, f64> = std::collections::HashMap::new();

    if let Ok(mut stmt) = conn.prepare("SELECT product_code, ingredient_code, quantity, IFNULL(percentage, 0.0) FROM formulations") {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, f64>(3)?,
            ))
        }) {
            for r in rows {
                if let Ok((prod_code, ing_code, qty, pct)) = r {
                    let norm_prod = prod_code.strip_prefix('0').unwrap_or(&prod_code).to_string();
                    formulations_map.entry(norm_prod.clone()).or_default().push(FormEntry {
                        ingredient_code: ing_code,
                        quantity: qty,
                        percentage: pct,
                    });
                    *formulation_sums.entry(norm_prod).or_insert(0.0) += qty;
                }
            }
        }
    }

    // C. Query all exits (weighed quantities) for these open lotes
    let mut exits_map: std::collections::HashMap<(String, String), f64> = std::collections::HashMap::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT document_number, item_code, SUM(quantity) 
         FROM stock_movements 
         WHERE item_type = 'insumo' AND movement_type = 'saida'
         GROUP BY document_number, item_code"
    ) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?
            ))
        }) {
            for r in rows {
                if let Ok((doc_num, item_code, qty)) = r {
                    exits_map.insert((doc_num, item_code), qty);
                }
            }
        }
    }

    // D. Compute dynamic reserved quantity per insumo
    let mut lotes_baixas_map: std::collections::HashMap<(i64, String), Vec<f64>> = std::collections::HashMap::new();
    
    // Extract valid integer lote numbers for the IN clause
    let lote_ids: Vec<i64> = open_lotes.iter()
        .filter_map(|(doc_num, _, _, _)| doc_num.parse::<i64>().ok())
        .collect();

    if !lote_ids.is_empty() {
        let ids_str = lote_ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",");
        let query = format!(
            "SELECT nLote, cReferencia, nQtdeRef FROM lotes_baixas WHERE nLote IN ({}) ORDER BY Registro ASC",
            ids_str
        );
        if let Ok(mut stmt) = conn.prepare(&query) {
            if let Ok(rows) = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, f64>(2)?
                ))
            }) {
                for r in rows {
                    if let Ok((n_lote, c_ref, n_qtde_ref)) = r {
                        lotes_baixas_map.entry((n_lote, c_ref)).or_default().push(n_qtde_ref);
                    }
                }
            }
        }
    }

    let mut dynamic_reserved_map: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    for (lote_number, product_code, quantity, d_pesado) in open_lotes {
        let norm_prod = product_code.strip_prefix('0').unwrap_or(&product_code).to_string();
        if let Some(ingredients) = formulations_map.get(&norm_prod) {
            let sum_qty = formulation_sums.get(&norm_prod).copied().unwrap_or(0.0);
            let lote_int = lote_number.parse::<i64>().unwrap_or(-1);

            for ing in ingredients {
                let factor = if ing.percentage > 0.0 {
                    ing.percentage / 100.0
                } else if sum_qty > 0.0 {
                    ing.quantity / sum_qty
                } else {
                    0.0
                };
                let fallback_expected = quantity * factor;

                let mut expected = fallback_expected;
                if lote_int != -1 {
                    if let Some(queue) = lotes_baixas_map.get_mut(&(lote_int, ing.ingredient_code.clone())) {
                        if !queue.is_empty() {
                            expected = queue.remove(0);
                        }
                    }
                }

                let remaining = if !d_pesado.is_empty() {
                    0.0
                } else {
                    expected
                };

                if remaining > 0.0 {
                    *dynamic_reserved_map.entry(ing.ingredient_code.clone()).or_insert(0.0) += remaining;
                }
            }
        }
    }

    let mut sql = String::from(
        "SELECT 
            i.code, i.description, i.unit, i.category_id, IFNULL(c.name, 'Sem Categoria') as category_name,
            IFNULL(s.stock_qty, 0), IFNULL(s.reserved_qty, 0), IFNULL(s.in_production, 0), IFNULL(s.in_orders, 0),
            IFNULL(c2024.monthly_avg, 0), IFNULL(c2025.monthly_avg, 0), IFNULL(c2026.monthly_avg, 0),
            i.notes
        FROM items i
        LEFT JOIN categories c ON i.category_id = c.id
        LEFT JOIN (
            SELECT item_code, stock_qty, reserved_qty, in_production, in_orders
            FROM stock_snapshots ss
            WHERE ss.id = (
                SELECT id FROM stock_snapshots ss2 
                WHERE ss2.item_code = ss.item_code 
                ORDER BY ss2.snapshot_date DESC, ss2.id DESC LIMIT 1
            )
        ) s ON i.code = s.item_code
        LEFT JOIN consumption c2024 ON i.code = c2024.item_code AND c2024.year = 2024
        LEFT JOIN consumption c2025 ON i.code = c2025.item_code AND c2025.year = 2025
        LEFT JOIN consumption c2026 ON i.code = c2026.item_code AND c2026.year = 2026
        WHERE i.is_ignored = 0 AND i.code NOT IN (SELECT codigo FROM produtos) AND (i.code LIKE '9.%' OR i.code LIKE '08.%')"
    );

    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    if let Some(ref cat_id) = category_id {
        sql.push_str(" AND i.category_id = ?1");
        params_vec.push(Box::new(cat_id.clone()));
    }
    sql.push_str(" ORDER BY i.description");

    let mut movements_map: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    if let Ok(mut mv_stmt) = conn.prepare(
        "SELECT item_code, SUM(quantity) 
         FROM stock_movements 
         WHERE movement_type = 'saida' 
           AND item_type = 'insumo' 
           AND date >= date('now', '-12 months', 'localtime')
         GROUP BY item_code"
    ) {
        let mv_rows = mv_stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        });
        if let Ok(iter) = mv_rows {
            for r in iter {
                if let Ok((code, qty)) = r {
                    let clean = code.replace(".", "");
                    *movements_map.entry(clean).or_insert(0.0) += qty;
                }
            }
        }
    }

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| &**p).collect();

    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        let code: String = row.get(0)?;
        let desc: String = row.get(1)?;
        let unit: String = row.get(2)?;
        let cat_id: Option<String> = row.get(3)?;
        let cat_name: String = row.get(4)?;
        let current_stock: f64 = row.get(5)?;
        let _reserved_qty_imported: f64 = row.get(6)?;
        let in_production: f64 = row.get(7)?;
        let in_orders: f64 = row.get(8)?;
        let avg24: f64 = row.get(9)?;
        let avg25: f64 = row.get(10)?;
        let avg26: f64 = row.get(11)?;
        let notes: Option<String> = row.get(12)?;

        let reserved_qty = dynamic_reserved_map.get(&code).copied().unwrap_or(0.0);

        use chrono::Datelike;
        let now = chrono::Local::now();
        let current_year = now.year();
        let day_of_year = (now.ordinal() as f64).max(1.0);
        let elapsed_months = day_of_year / 30.0;

        let avg24_corrected = if current_year == 2024 {
            if avg24 > 0.0 { (avg24 * 12.0) / elapsed_months } else { 0.0 }
        } else {
            avg24
        };

        let avg25_corrected = if current_year == 2025 {
            if avg25 > 0.0 { (avg25 * 12.0) / elapsed_months } else { 0.0 }
        } else {
            avg25
        };

        let avg26_corrected = if current_year == 2026 {
            if avg26 > 0.0 { (avg26 * 12.0) / elapsed_months } else { 0.0 }
        } else {
            avg26
        };

        let mut avgs = Vec::new();
        if avg24_corrected > 0.1 { avgs.push(avg24_corrected); }
        if avg25_corrected > 0.1 { avgs.push(avg25_corrected); }
        if avg26_corrected > 0.1 { avgs.push(avg26_corrected); }
        
        let median_monthly = if avgs.is_empty() {
            0.0
        } else {
            avgs.sort_by(|a, b| a.partial_cmp(b).unwrap());
            let len = avgs.len();
            if len == 1 { 
                avgs[0] 
            } else if len == 2 { 
                (avgs[0] + avgs[1]) / 2.0 
            } else { 
                avgs[1] 
            }
        };
        
        let clean_code = code.replace(".", "");
        let sum_12_months = movements_map.get(&clean_code).copied().unwrap_or(0.0);

        let overall_avg = if sum_12_months > 0.0 {
            sum_12_months / 12.0
        } else {
            median_monthly
        };
        let daily_avg = overall_avg / 30.0;

        let future_stock_forecast = current_stock - reserved_qty + in_orders + in_production;
        let max_forecast = if future_stock_forecast > 0.0 { future_stock_forecast } else { 0.0 };

        let estimated_duration_days = if daily_avg > 0.0 {
            (max_forecast / daily_avg).round()
        } else {
            9999.0
        };

        let target_stock = (target_days as f64) * daily_avg;
        let raw_rec = target_stock - max_forecast;
        let recommended_qty = if raw_rec > 0.0 { raw_rec.round() } else { 0.0 };

        let urgency = if estimated_duration_days < 30.0 {
            "critical".to_string()
        } else if estimated_duration_days < 60.0 {
            "warning".to_string()
        } else {
            "ok".to_string()
        };

        Ok(DemandResult {
            item_code: code,
            description: desc,
            unit,
            category_id: cat_id,
            category_name: cat_name,
            current_stock,
            reserved_qty,
            in_production,
            in_orders,
            avg2024: avg24_corrected,
            avg2025: avg25_corrected,
            avg2026: avg26_corrected,
            overall_avg,
            future_stock_forecast,
            estimated_duration_days,
            recommended_qty,
            urgency,
            notes,
        })
    }).map_err(|e| e.to_string())?;

    let auto_ignored = get_auto_ignored_ingredients(&conn);

    let mut results = Vec::new();
    for row in rows {
        let item = row.map_err(|e| e.to_string())?;
        if !auto_ignored.contains_key(&item.item_code) {
            results.push(item);
        }
    }
    Ok(results)
}

#[tauri::command]
fn create_quotation(state: State<DbState>, title: String, item_codes: Vec<String>, recommended_qtys: Vec<f64>) -> Result<String, String> {
    let mut conn = state.0.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let quotation_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO quotations (id, title) VALUES (?1, ?2)",
        params![quotation_id, title],
    ).map_err(|e| e.to_string())?;

    for i in 0..item_codes.len() {
        let q_item_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO quotation_items (id, quotation_id, item_code, recommended_qty) VALUES (?1, ?2, ?3, ?4)",
            params![q_item_id, quotation_id, item_codes[i], recommended_qtys[i]],
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(quotation_id)
}

#[tauri::command]
fn get_quotations(state: State<DbState>, status: Option<String>) -> Result<Vec<Quotation>, String> {
    let conn = state.0.lock().unwrap();
    let mut sql = String::from("
        SELECT 
            q.id, q.title, q.status, q.target_days, q.notes, 
            q.director_demand_notes, q.director_final_notes, 
            q.created_at, q.demand_approved_at, q.final_approved_at, q.ordered_at,
            (SELECT COUNT(*) FROM quotation_items WHERE quotation_id = q.id) as item_count,
            (
                SELECT SUM(qp.unit_price * IFNULL(qi.final_qty, IFNULL(qi.approved_qty, qi.recommended_qty)))
                FROM quotation_items qi
                JOIN quotation_prices qp ON qp.quotation_item_id = qi.id AND qp.is_selected = 1
                WHERE qi.quotation_id = q.id
            ) as total_value
        FROM quotations q
        WHERE 1=1
    ");

    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    if let Some(ref st) = status {
        sql.push_str(" AND q.status = ?1");
        params_vec.push(Box::new(st.clone()));
    }
    sql.push_str(" ORDER BY q.created_at DESC");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| &**p).collect();
    
    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(Quotation {
            id: row.get(0)?,
            title: row.get(1)?,
            status: row.get(2)?,
            target_days: row.get(3)?,
            notes: row.get(4)?,
            director_demand_notes: row.get(5)?,
            director_final_notes: row.get(6)?,
            created_at: row.get(7)?,
            demand_approved_at: row.get(8)?,
            final_approved_at: row.get(9)?,
            ordered_at: row.get(10)?,
            item_count: row.get(11)?,
            total_value: row.get(12)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

#[tauri::command]
fn get_quotation_detail(state: State<DbState>, id: String) -> Result<serde_json::Value, String> {
    let conn = state.0.lock().unwrap();
    
    let q: Quotation = conn.query_row(
        "SELECT id, title, status, target_days, notes, director_demand_notes, director_final_notes, 
         created_at, demand_approved_at, final_approved_at, ordered_at 
         FROM quotations WHERE id = ?1",
        params![id],
        |row| {
            Ok(Quotation {
                id: row.get(0)?,
                title: row.get(1)?,
                status: row.get(2)?,
                target_days: row.get(3)?,
                notes: row.get(4)?,
                director_demand_notes: row.get(5)?,
                director_final_notes: row.get(6)?,
                created_at: row.get(7)?,
                demand_approved_at: row.get(8)?,
                final_approved_at: row.get(9)?,
                ordered_at: row.get(10)?,
                item_count: None,
                total_value: None,
            })
        }
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("
        SELECT qi.id, qi.quotation_id, qi.item_code, i.description, i.unit, 
               qi.recommended_qty, qi.approved_qty, qi.final_qty, qi.notes
        FROM quotation_items qi
        JOIN items i ON i.code = qi.item_code
        WHERE qi.quotation_id = ?1
    ").map_err(|e| e.to_string())?;

    let item_rows = stmt.query_map(params![id], |row| {
        Ok(QuotationItemDetail {
            id: row.get(0)?,
            quotation_id: row.get(1)?,
            item_code: row.get(2)?,
            description: row.get(3)?,
            unit: row.get(4)?,
            recommended_qty: row.get(5)?,
            approved_qty: row.get(6)?,
            final_qty: row.get(7)?,
            notes: row.get(8)?,
            prices: Vec::new(),
        })
    }).map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for row in item_rows {
        let mut item = row.map_err(|e| e.to_string())?;
        
        let mut price_stmt = conn.prepare("
            SELECT qp.id, qp.quotation_item_id, qp.supplier_id, s.name, 
                   qp.unit_price, qp.delivery_days, qp.min_qty, qp.payment_terms, qp.notes, qp.is_selected
            FROM quotation_prices qp
            JOIN suppliers s ON s.id = qp.supplier_id
            WHERE qp.quotation_item_id = ?1
        ").map_err(|e| e.to_string())?;

        let price_rows = price_stmt.query_map(params![item.id], |p_row| {
            Ok(QuotationPrice {
                id: p_row.get(0)?,
                quotation_item_id: p_row.get(1)?,
                supplier_id: p_row.get(2)?,
                supplier_name: p_row.get(3)?,
                unit_price: p_row.get(4)?,
                delivery_days: p_row.get(5)?,
                min_qty: p_row.get(6)?,
                payment_terms: p_row.get(7)?,
                notes: p_row.get(8)?,
                is_selected: p_row.get::<_, i32>(9)? == 1,
            })
        }).map_err(|e| e.to_string())?;

        for p in price_rows {
            item.prices.push(p.map_err(|e| e.to_string())?);
        }
        
        items.push(item);
    }

    Ok(serde_json::json!({
        "quotation": q,
        "items": items
    }))
}

#[tauri::command]
fn update_quotation_status(state: State<DbState>, id: String, status: String, notes: Option<String>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();

    match status.as_str() {
        "quoting" => {
            if let Some(n) = notes {
                conn.execute(
                    "UPDATE quotations SET status = ?2, director_demand_notes = ?3, demand_approved_at = CURRENT_TIMESTAMP WHERE id = ?1",
                    params![id, status, n],
                ).map_err(|e| e.to_string())?;
            } else {
                conn.execute(
                    "UPDATE quotations SET status = ?2, demand_approved_at = CURRENT_TIMESTAMP WHERE id = ?1",
                    params![id, status],
                ).map_err(|e| e.to_string())?;
            }
        },
        "approved" => {
            if let Some(n) = notes {
                conn.execute(
                    "UPDATE quotations SET status = ?2, director_final_notes = ?3, final_approved_at = CURRENT_TIMESTAMP WHERE id = ?1",
                    params![id, status, n],
                ).map_err(|e| e.to_string())?;
            } else {
                conn.execute(
                    "UPDATE quotations SET status = ?2, final_approved_at = CURRENT_TIMESTAMP WHERE id = ?1",
                    params![id, status],
                ).map_err(|e| e.to_string())?;
            }
        },
        "renegotiate" => {
            if let Some(n) = notes {
                conn.execute(
                    "UPDATE quotations SET status = 'quoting', director_final_notes = ?2 WHERE id = ?1",
                    params![id, n],
                ).map_err(|e| e.to_string())?;
            } else {
                conn.execute(
                    "UPDATE quotations SET status = 'quoting' WHERE id = ?1",
                    params![id],
                ).map_err(|e| e.to_string())?;
            }
        },
        "ordered" => {
            conn.execute(
                "UPDATE quotations SET status = ?2, ordered_at = CURRENT_TIMESTAMP WHERE id = ?1",
                params![id, status],
            ).map_err(|e| e.to_string())?;
        },
        _ => {
            conn.execute(
                "UPDATE quotations SET status = ?2 WHERE id = ?1",
                params![id, status],
            ).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
fn add_quotation_price(state: State<DbState>, price: QuotationPriceInput) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    let price_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO quotation_prices (id, quotation_item_id, supplier_id, unit_price, delivery_days, min_qty, payment_terms, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![price_id, price.quotation_item_id, price.supplier_id, price.unit_price, price.delivery_days, price.min_qty, price.payment_terms, price.notes],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn select_supplier(state: State<DbState>, quotation_item_id: String, price_id: String) -> Result<(), String> {
    let mut conn = state.0.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    tx.execute(
        "UPDATE quotation_prices SET is_selected = 0 WHERE quotation_item_id = ?1",
        params![quotation_item_id],
    ).map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE quotation_prices SET is_selected = 1 WHERE id = ?1",
        params![price_id],
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_quotation(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM quotations WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_quotation_item_qty(state: State<DbState>, id: String, field: String, qty: f64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    let query = match field.as_str() {
        "approved" => "UPDATE quotation_items SET approved_qty = ?2 WHERE id = ?1",
        "final" => "UPDATE quotation_items SET final_qty = ?2 WHERE id = ?1",
        _ => return Err("Invalid field".to_string()),
    };
    conn.execute(query, params![id, qty]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_suppliers(state: State<DbState>, parent_category_id: Option<String>) -> Result<Vec<Supplier>, String> {
    let conn = state.0.lock().unwrap();
    let sql = if let Some(ref parent_cat) = parent_category_id {
        if parent_cat == "coloracao" || parent_cat == "apoio" {
            let prefix_cond = if parent_cat == "coloracao" {
                "inv.item_code LIKE '1.34.%'"
            } else {
                "inv.item_code LIKE '1.30.%'"
            };
            let parent_id = if parent_cat == "coloracao" { "cat_coloracao" } else { "cat_apoio" };
            format!(
                "SELECT DISTINCT s.id, s.name, s.contact, s.email, s.notes 
                 FROM suppliers s
                 WHERE s.id IN (
                     SELECT DISTINCT inv.supplier_id FROM invoices inv
                     LEFT JOIN overrides_produtos op ON op.codigo = inv.item_code
                     WHERE (
                         op.categoria_produto = '{parent_id}'
                         OR op.categoria_produto IN (SELECT id FROM categories WHERE parent_id = '{parent_id}')
                         OR (op.categoria_produto IS NULL AND {prefix_cond})
                     )
                 ) ORDER BY s.name",
                parent_id = parent_id,
                prefix_cond = prefix_cond
            )
        } else {
            format!(
                "SELECT DISTINCT s.id, s.name, s.contact, s.email, s.notes 
                 FROM suppliers s
                 WHERE s.id IN (
                     SELECT DISTINCT inv.supplier_id FROM invoices inv
                     INNER JOIN items i ON inv.item_code = i.code OR replace(inv.item_code, '.', '') = replace(i.code, '.', '')
                     INNER JOIN categories c ON i.category_id = c.id
                     WHERE c.parent_id = '{parent}' OR c.id = '{parent}'
                 ) OR s.id IN (
                     SELECT DISTINCT qp.supplier_id FROM quotation_prices qp
                     INNER JOIN quotation_items qi ON qp.quotation_item_id = qi.id
                     INNER JOIN items i ON qi.item_code = i.code
                     INNER JOIN categories c ON i.category_id = c.id
                     WHERE c.parent_id = '{parent}' OR c.id = '{parent}'
                 ) ORDER BY s.name",
                parent = parent_cat
            )
        }
    } else {
        "SELECT id, name, contact, email, notes FROM suppliers ORDER BY name".to_string()
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Supplier {
            id: row.get(0)?,
            name: row.get(1)?,
            contact: row.get(2)?,
            email: row.get(3)?,
            notes: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

#[tauri::command]
fn save_supplier(state: State<DbState>, supplier: Supplier) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO suppliers (id, name, contact, email, notes) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET name = ?2, contact = ?3, email = ?4, notes = ?5",
        params![supplier.id, supplier.name, supplier.contact, supplier.email, supplier.notes],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_supplier_history(state: State<DbState>, id: String) -> Result<serde_json::Value, String> {
    let conn = state.0.lock().unwrap();

    let mut inv_stmt = conn.prepare(
        "SELECT id, invoice_number, item_code, description, unit, quantity, unit_price, total_value, supplier_name, supplier_id, invoice_date
         FROM invoices WHERE supplier_id = ?1 ORDER BY invoice_date DESC"
    ).map_err(|e| e.to_string())?;
    let inv_rows = inv_stmt.query_map(params![id], |row| {
        Ok(Invoice {
            id: row.get(0)?,
            invoice_number: row.get(1)?,
            item_code: row.get(2)?,
            description: row.get(3)?,
            unit: row.get(4)?,
            quantity: row.get(5)?,
            unit_price: row.get(6)?,
            total_value: row.get(7)?,
            supplier_name: row.get(8)?,
            supplier_id: row.get(9)?,
            invoice_date: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut invoices = Vec::new();
    for row in inv_rows {
        invoices.push(row.map_err(|e| e.to_string())?);
    }

    let mut pp_stmt = conn.prepare(
        "SELECT invoice_date, unit_price, supplier_name, invoice_number
         FROM invoices WHERE supplier_id = ?1 AND unit_price > 0 ORDER BY invoice_date"
    ).map_err(|e| e.to_string())?;
    let pp_rows = pp_stmt.query_map(params![id], |row| {
        Ok(PricePoint {
            date: row.get(0)?,
            unit_price: row.get(1)?,
            supplier_name: row.get(2)?,
            invoice_number: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut price_points = Vec::new();
    for row in pp_rows {
        price_points.push(row.map_err(|e| e.to_string())?);
    }

    Ok(serde_json::json!({
        "invoices": invoices,
        "pricePoints": price_points
    }))
}

#[tauri::command]
fn get_price_evolution(state: State<DbState>, item_code: String) -> Result<Vec<PricePoint>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT invoice_date, unit_price, IFNULL(supplier_name,''), invoice_number
         FROM invoices WHERE item_code = ?1 AND unit_price > 0
         ORDER BY invoice_date"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![item_code], |row| {
        Ok(PricePoint {
            date: row.get(0)?,
            unit_price: row.get(1)?,
            supplier_name: row.get(2)?,
            invoice_number: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut points = Vec::new();
    for row in rows {
        points.push(row.map_err(|e| e.to_string())?);
    }
    Ok(points)
}

#[tauri::command]
fn get_spending_by_supplier(
    state: State<DbState>,
    start: String,
    end: String,
    parent_category_id: Option<String>,
) -> Result<Vec<SupplierSpend>, String> {
    let conn = state.0.lock().unwrap();
    let sql = if let Some(ref parent_cat) = parent_category_id {
        if parent_cat == "coloracao" || parent_cat == "apoio" {
            let prefix_cond = if parent_cat == "coloracao" {
                "inv.item_code LIKE '1.34.%'"
            } else {
                "inv.item_code LIKE '1.30.%'"
            };
            let parent_id = if parent_cat == "coloracao" { "cat_coloracao" } else { "cat_apoio" };
            format!(
                "SELECT IFNULL(inv.supplier_id,'unknown'), IFNULL(inv.supplier_name,'Desconhecido'),
                        SUM(inv.total_value), COUNT(DISTINCT inv.invoice_number)
                 FROM invoices inv
                 LEFT JOIN overrides_produtos op ON op.codigo = inv.item_code
                 WHERE inv.invoice_date >= ?1 AND inv.invoice_date <= ?2 
                   AND (
                       op.categoria_produto = '{parent_id}'
                       OR op.categoria_produto IN (SELECT id FROM categories WHERE parent_id = '{parent_id}')
                       OR (op.categoria_produto IS NULL AND {prefix_cond})
                   )
                 GROUP BY inv.supplier_id, inv.supplier_name
                 ORDER BY SUM(inv.total_value) DESC",
                parent_id = parent_id,
                prefix_cond = prefix_cond
            )
        } else {
            format!(
                "SELECT IFNULL(inv.supplier_id,'unknown'), IFNULL(inv.supplier_name,'Desconhecido'),
                        SUM(inv.total_value), COUNT(DISTINCT inv.invoice_number)
                 FROM invoices inv
                 JOIN items i ON i.code = inv.item_code
                 LEFT JOIN categories c ON c.id = i.category_id
                 WHERE inv.invoice_date >= ?1 AND inv.invoice_date <= ?2 
                   AND IFNULL(i.is_ignored, 0) = 0
                   AND (c.parent_id = '{parent}' OR c.id = '{parent}')
                 GROUP BY inv.supplier_id, inv.supplier_name
                 ORDER BY SUM(inv.total_value) DESC",
                parent = parent_cat
            )
        }
    } else {
        "SELECT IFNULL(inv.supplier_id,'unknown'), IFNULL(inv.supplier_name,'Desconhecido'),
                SUM(inv.total_value), COUNT(DISTINCT inv.invoice_number)
         FROM invoices inv
         JOIN items i ON i.code = inv.item_code
         WHERE inv.invoice_date >= ?1 AND inv.invoice_date <= ?2 AND IFNULL(i.is_ignored, 0) = 0
         GROUP BY inv.supplier_id, inv.supplier_name
         ORDER BY SUM(inv.total_value) DESC".to_string()
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![start, end], |row| {
        Ok(SupplierSpend {
            supplier_id: row.get(0)?,
            supplier_name: row.get(1)?,
            total_value: row.get(2)?,
            invoice_count: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

#[tauri::command]
fn get_spending_by_category(
    state: State<DbState>,
    start: String,
    end: String,
    parent_category_id: Option<String>,
) -> Result<Vec<CategorySpend>, String> {
    let conn = state.0.lock().unwrap();
    let sql = if let Some(ref parent_cat) = parent_category_id {
        if parent_cat == "coloracao" || parent_cat == "apoio" {
            let prefix_cond = if parent_cat == "coloracao" {
                "p.codigo LIKE '1.34.%'"
            } else {
                "p.codigo LIKE '1.30.%'"
            };
            let parent_id = if parent_cat == "coloracao" { "cat_coloracao" } else { "cat_apoio" };
            format!(
                "SELECT IFNULL(p.linha_prefix,'unknown'), IFNULL(cl.nome_linha,'Sem Linha'),
                        SUM(inv.total_value), COUNT(DISTINCT inv.item_code)
                 FROM invoices inv
                 JOIN produtos p ON inv.item_code = p.codigo
                 LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
                 LEFT JOIN overrides_produtos op ON op.codigo = p.codigo
                 WHERE inv.invoice_date >= ?1 AND inv.invoice_date <= ?2 
                   AND (
                       op.categoria_produto = '{parent_id}'
                       OR op.categoria_produto IN (SELECT id FROM categories WHERE parent_id = '{parent_id}')
                       OR (op.categoria_produto IS NULL AND {prefix_cond})
                   )
                 GROUP BY p.linha_prefix, cl.nome_linha
                 ORDER BY SUM(inv.total_value) DESC",
                parent_id = parent_id,
                prefix_cond = prefix_cond
            )
        } else {
            format!(
                "SELECT IFNULL(i.category_id,'uncategorized'), IFNULL(c.name,'Sem Categoria'),
                        SUM(inv.total_value), COUNT(DISTINCT inv.item_code)
                 FROM invoices inv
                 JOIN items i ON i.code = inv.item_code
                 LEFT JOIN categories c ON c.id = i.category_id
                 WHERE inv.invoice_date >= ?1 AND inv.invoice_date <= ?2 
                   AND IFNULL(i.is_ignored, 0) = 0
                   AND (c.parent_id = '{parent}' OR c.id = '{parent}')
                 GROUP BY i.category_id, c.name
                 ORDER BY SUM(inv.total_value) DESC",
                parent = parent_cat
            )
        }
    } else {
        "SELECT IFNULL(i.category_id,'uncategorized'), IFNULL(c.name,'Sem Categoria'),
                SUM(inv.total_value), COUNT(DISTINCT inv.item_code)
         FROM invoices inv
         JOIN items i ON i.code = inv.item_code
         LEFT JOIN categories c ON c.id = i.category_id
         WHERE inv.invoice_date >= ?1 AND inv.invoice_date <= ?2 AND IFNULL(i.is_ignored, 0) = 0
         GROUP BY i.category_id, c.name
         ORDER BY SUM(inv.total_value) DESC".to_string()
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![start, end], |row| {
        Ok(CategorySpend {
            category_id: row.get(0)?,
            category_name: row.get(1)?,
            total_value: row.get(2)?,
            item_count: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

#[tauri::command]
fn get_categories(state: State<DbState>) -> Result<Vec<Category>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, name, parent_id FROM categories ORDER BY name").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Category {
            id: row.get(0)?,
            name: row.get(1)?,
            parent_id: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut categories = Vec::new();
    for row in rows {
        categories.push(row.map_err(|e| e.to_string())?);
    }
    Ok(categories)
}

#[tauri::command]
fn save_category(state: State<DbState>, category: Category) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO categories (id, name, parent_id) VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET name = ?2, parent_id = ?3",
        params![category.id, category.name, category.parent_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_category(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "UPDATE items 
         SET category_id = CASE 
             WHEN code LIKE '9.15.%' THEN 'cat_mp' 
             WHEN code LIKE '08.%' THEN 'cat_mat'
             ELSE 'cat_emb' 
         END,
         manual_category = 0
         WHERE category_id = ?1",
        params![id]
    ).map_err(|e| e.to_string())?;
    
    conn.execute(
        "UPDATE overrides_produtos 
         SET categoria_produto = NULL
         WHERE categoria_produto = ?1",
        params![id]
    ).map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM categories WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// --- MICROBIOLOGIA MODULE ---

#[tauri::command]
fn get_products(state: State<DbState>) -> Result<Vec<Product>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn.prepare("SELECT code, name, packaging, validity FROM products").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Product {
            code: row.get(0)?,
            name: row.get(1)?,
            packaging: row.get(2)?,
            validity: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut products = Vec::new();
    for row in rows {
        products.push(row.map_err(|e| e.to_string())?);
    }
    Ok(products)
}

#[tauri::command]
fn save_product(state: State<DbState>, product: Product) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO products (code, name, packaging, validity) VALUES (?1, ?2, ?3, ?4)",
        params![product.code, product.name, product.packaging, product.validity],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_product(state: State<DbState>, code: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM products WHERE code = ?1", params![code]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_reports(state: State<DbState>) -> Result<Vec<Report>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, reportId, reportRawNum, productCode, productName, batch, collectionDate, technician, createdAt FROM reports ORDER BY reportRawNum DESC LIMIT 1000").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Report {
            id: row.get(0)?,
            report_id: row.get(1)?,
            report_raw_num: row.get(2)?,
            product_code: row.get(3)?,
            product_name: row.get(4)?,
            batch: row.get(5)?,
            collection_date: row.get(6)?,
            technician: row.get(7)?,
            created_at: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut reports = Vec::new();
    for row in rows {
        reports.push(row.map_err(|e| e.to_string())?);
    }
    Ok(reports)
}

#[tauri::command]
fn save_reports(state: State<DbState>, reports: Vec<Report>) -> Result<(), String> {
    let mut conn = state.0.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        let mut stmt = tx.prepare("INSERT OR REPLACE INTO reports (id, reportId, reportRawNum, productCode, productName, batch, collectionDate, technician, createdAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CURRENT_TIMESTAMP)").map_err(|e| e.to_string())?;
        for report in reports {
            stmt.execute(params![
                report.id, report.report_id, report.report_raw_num,
                report.product_code, report.product_name, report.batch,
                report.collection_date, report.technician
            ]).map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_report(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM reports WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_all_products(state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM products", []).map_err(|e| e.to_string())?;
    Ok(())
}

// --- FISCO-QUIMICA MODULE ---

#[tauri::command]
fn get_fisco_quimica_patterns(state: State<DbState>) -> Result<Vec<FiscoQuimicaPattern>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn.prepare("SELECT product_code, ph_min, ph_max, viscosity_min, viscosity_max, density_target, density_tolerance, package_volume, package_unit FROM fisco_quimica_patterns").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        let p_code: String = row.get(0)?;
        Ok(FiscoQuimicaPattern {
            product_code: p_code,
            ph_min: row.get(1)?,
            ph_max: row.get(2)?,
            viscosity_min: row.get(3)?,
            viscosity_max: row.get(4)?,
            density_target: row.get(5)?,
            density_tolerance: row.get(6)?,
            package_volume: row.get(7)?,
            package_unit: row.get(8)?,
            allowed_agents: None,
        })
    }).map_err(|e| e.to_string())?;

    let mut patterns = Vec::new();
    for row in rows {
        let mut pat = row.map_err(|e| e.to_string())?;
        
        // Fetch allowed agents
        let mut agent_stmt = conn.prepare("SELECT agent_id FROM fisco_quimica_product_agents WHERE product_code = ?1").map_err(|e| e.to_string())?;
        let agent_rows = agent_stmt.query_map(params![pat.product_code], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        
        let mut allowed_agents = Vec::new();
        for agent_row in agent_rows {
            allowed_agents.push(agent_row.map_err(|e| e.to_string())?);
        }
        
        pat.allowed_agents = Some(allowed_agents);
        patterns.push(pat);
    }
    Ok(patterns)
}

#[tauri::command]
fn save_fisco_quimica_pattern(state: State<DbState>, pattern: FiscoQuimicaPattern) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO fisco_quimica_patterns (product_code, ph_min, ph_max, viscosity_min, viscosity_max, density_target, density_tolerance, package_volume, package_unit) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            pattern.product_code,
            pattern.ph_min,
            pattern.ph_max,
            pattern.viscosity_min,
            pattern.viscosity_max,
            pattern.density_target,
            pattern.density_tolerance,
            pattern.package_volume,
            pattern.package_unit
        ],
    ).map_err(|e| e.to_string())?;

    if let Some(ref agents) = pattern.allowed_agents {
        conn.execute("DELETE FROM fisco_quimica_product_agents WHERE product_code = ?1", params![pattern.product_code]).map_err(|e| e.to_string())?;
        for agent_id in agents {
            conn.execute("INSERT OR IGNORE INTO fisco_quimica_product_agents (product_code, agent_id) VALUES (?1, ?2)", params![pattern.product_code, agent_id]).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn delete_fisco_quimica_pattern(state: State<DbState>, code: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM fisco_quimica_product_agents WHERE product_code = ?1", params![code]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM fisco_quimica_patterns WHERE product_code = ?1", params![code]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_fisco_quimica_agents(state: State<DbState>) -> Result<Vec<FiscoQuimicaAgent>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, name, created_at FROM fisco_quimica_corrective_agents ORDER BY name").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(FiscoQuimicaAgent {
            id: row.get(0)?,
            name: row.get(1)?,
            created_at: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut agents = Vec::new();
    for row in rows {
        agents.push(row.map_err(|e| e.to_string())?);
    }
    Ok(agents)
}

#[tauri::command]
fn save_fisco_quimica_agent(state: State<DbState>, agent: FiscoQuimicaAgent) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO fisco_quimica_corrective_agents (id, name) VALUES (?1, ?2)",
        params![agent.id, agent.name],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_fisco_quimica_agent(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM fisco_quimica_corrective_agents WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_fisco_quimica_analyses(state: State<DbState>) -> Result<Vec<FiscoQuimicaAnalysis>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, product_code, product_name, batch, analysis_date, technician, ph_measured, viscosity_measured, density_measured, fraction_weight, envase_target_weight, envase_target_unit, has_adjustment, corrective_agent_id, initial_viscosity, trial_agent_qty, trial_viscosity, agent_qty_per_liter, batch_size, total_agent_required, notes, created_at FROM fisco_quimica_analyses ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        let has_adj_int: i32 = row.get(12)?;
        Ok(FiscoQuimicaAnalysis {
            id: row.get(0)?,
            product_code: row.get(1)?,
            product_name: row.get(2)?,
            batch: row.get(3)?,
            analysis_date: row.get(4)?,
            technician: row.get(5)?,
            ph_measured: row.get(6)?,
            viscosity_measured: row.get(7)?,
            density_measured: row.get(8)?,
            fraction_weight: row.get(9)?,
            envase_target_weight: row.get(10)?,
            envase_target_unit: row.get(11)?,
            has_adjustment: has_adj_int == 1,
            corrective_agent_id: row.get(13)?,
            initial_viscosity: row.get(14)?,
            trial_agent_qty: row.get(15)?,
            trial_viscosity: row.get(16)?,
            agent_qty_per_liter: row.get(17)?,
            batch_size: row.get(18)?,
            total_agent_required: row.get(19)?,
            notes: row.get(20)?,
            created_at: row.get(21)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut analyses = Vec::new();
    for row in rows {
        analyses.push(row.map_err(|e| e.to_string())?);
    }
    Ok(analyses)
}

#[tauri::command]
fn save_fisco_quimica_analysis(state: State<DbState>, analysis: FiscoQuimicaAnalysis) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO fisco_quimica_analyses (id, product_code, product_name, batch, analysis_date, technician, ph_measured, viscosity_measured, density_measured, fraction_weight, envase_target_weight, envase_target_unit, has_adjustment, corrective_agent_id, initial_viscosity, trial_agent_qty, trial_viscosity, agent_qty_per_liter, batch_size, total_agent_required, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
        params![
            analysis.id,
            analysis.product_code,
            analysis.product_name,
            analysis.batch,
            analysis.analysis_date,
            analysis.technician,
            analysis.ph_measured,
            analysis.viscosity_measured,
            analysis.density_measured,
            analysis.fraction_weight,
            analysis.envase_target_weight,
            analysis.envase_target_unit,
            if analysis.has_adjustment { 1 } else { 0 },
            analysis.corrective_agent_id,
            analysis.initial_viscosity,
            analysis.trial_agent_qty,
            analysis.trial_viscosity,
            analysis.agent_qty_per_liter,
            analysis.batch_size,
            analysis.total_agent_required,
            analysis.notes
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_fisco_quimica_analysis(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM fisco_quimica_analyses WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// === AXUM SERVER RUNNER (PRODUCAO BACKEND) ===
fn start_axum_server() {
    tauri::async_runtime::spawn(async {
        let db_path = "../data.db";
        let db = db::Db::new(db_path);
        
        let state = std::sync::Arc::new(handlers::AppState { db });

        // Spreadsheet folder watcher disabled as spreadsheet imports are removed
        // let watcher_state = state.clone();
        // tauri::async_runtime::spawn(async move {
        //     watcher::start_folder_watcher(watcher_state).await;
        // });

        // CORS Setup
        use tower_http::cors::{Any, CorsLayer};
        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);

        use axum::{routing::{get, post, delete}, Router};
        
        let app = Router::new()
            .route("/api/products", get(handlers::list_products))
            .route("/api/kits", get(handlers::list_kits))
            .route("/api/kits/composicao", get(handlers::list_kit_composicao).post(handlers::add_kit_composicao_handler))
            .route("/api/kits/composicao/upload", post(handlers::upload_kit_composicao))
            .route("/api/kits/composicao/:kit/:comp", delete(handlers::delete_kit_composicao_handler))
            .route("/api/configs", get(handlers::get_configs).put(handlers::update_config))
            .route("/api/configs/:prefix", delete(handlers::delete_config))
            .route("/api/overrides", get(handlers::get_overrides).post(handlers::save_override))
            .route("/api/overrides/bulk", post(handlers::save_override_bulk))
            .route("/api/import/faturamento", post(handlers::import_faturamento))
            .route("/api/import/levantamento", post(handlers::import_levantamento))
            .route("/api/import/kits", post(handlers::import_kits))
            .route("/api/import/sync", post(handlers::trigger_db_sync))
            .route("/api/import/dump", post(handlers::trigger_db_dump))
            .route("/api/settings/:key", get(handlers::get_setting_handler).post(handlers::save_setting_handler))
            .route("/api/import/history", get(handlers::get_import_history))
            .route("/api/import/status", get(handlers::get_import_status))
            .route("/api/import/watch-config", get(handlers::get_watch_config_handler).post(handlers::save_watch_config_handler))
            .route("/api/estoque/movimentacoes/:code", get(handlers::get_stock_movements))
            .route("/api/produtos/formulacao/:code", get(handlers::get_product_formulation))
            .route("/api/produtos/semelhantes/:code", get(handlers::get_similar_products))
            .route("/api/produtos/:code/detalhes", get(handlers::get_product_detalhes))
            .route("/api/producao/lotes", get(handlers::get_production_lotes))
            .route("/api/producao/lotes/:number/detalhes", get(handlers::get_lote_detalhes))
            .route("/api/producao/recalcular/preview", get(handlers::preview_recalculation))
            .route("/api/producao/recalcular/ajustar", post(handlers::apply_recalculation_adjustment))
            .route("/api/estoque/item-info/:code", get(handlers::get_item_extra_info))
            .route("/api/compras/insumos/:code/detalhes", get(handlers::get_insumo_detalhes))
            .route("/api/compras/pedidos", get(handlers::list_purchase_orders))
            .route("/api/compras/pedidos/:id", get(handlers::get_purchase_order_detail))
            .route("/api/compras/notas", get(handlers::list_invoices))
            .route("/api/compras/notas/:number", get(handlers::get_invoice_detail))
            .route("/api/compras/lojas", get(handlers::list_online_stores).post(handlers::save_online_store_handler))
            .route("/api/compras/lojas/:id", delete(handlers::delete_online_store_handler))
            .route("/api/historico", get(handlers::list_producao).post(handlers::add_producao))
            .route("/api/historico/:id", delete(handlers::delete_producao))
            .route("/api/vendas/pedidos", get(handlers::list_sales_orders))
            .route("/api/vendas/faltas", get(handlers::list_sales_faltas))
            .route("/api/produtos/:code/pedidos-pendentes", get(handlers::get_product_pending_orders))
            .route("/api/google/status", get(google_drive::get_google_status))
            .route("/api/google/config", post(google_drive::save_google_config))
            .route("/api/google/auth-url", get(google_drive::google_auth_url))
            .route("/api/google/callback", get(google_drive::google_callback))
            .route("/api/google/sync", post(google_drive::trigger_sync))
            .layer(tower_http::trace::TraceLayer::new_for_http())
            .layer(cors)
            .with_state(state);

        let addr = "127.0.0.1:3001";
        if let Ok(listener) = tokio::net::TcpListener::bind(addr).await {
            println!("Axum REST server running on: http://{}", addr);
            let _ = axum::serve(listener, app).await;
        } else {
            eprintln!("Failed to bind Axum REST server to port 3001 (already in use?)");
        }
    });
}

// === RUN TAURI APP ===
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Run migration/database copy logic
    run_migration_if_needed();

    // Open connection for Tauri state
    let conn = Connection::open("../data.db").expect("failed to open database");

    // Sync feedbacks to feedback.md file on startup
    let _ = sync_feedback_md(&conn);

    tauri::Builder::default()
        .manage(DbState(Mutex::new(conn)))
        .setup(|_app| {
            // Start background Axum REST server (runs in Tauri's Tokio context)
            start_axum_server();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Config & Common
            get_compras_config, save_compras_config,
            get_microbio_config, save_config_microbio,
            get_backup, restore_backup,
            get_feedbacks, save_feedback, resolve_feedback,
            reset_db,
            get_online_orders, save_online_order, delete_online_order,
            get_online_stores, save_online_store, delete_online_store,
            upload_order_receipt, open_receipt_file,
            // Compras - Categories
            get_categories, save_category, delete_category,
            // Compras - Items
            get_items, update_item_details, import_item_observations, update_items_category,
            get_similar_items, add_similar_item, remove_similar_item,
            // Compras - Demands
            get_demands,
            // Compras - Import
            import_stock, import_consumption, import_invoices,
            get_import_history, get_nf_import_control,
            // Compras - Quotations
            create_quotation, get_quotations, get_quotation_detail,
            update_quotation_status, add_quotation_price, select_supplier,
            delete_quotation, update_quotation_item_qty,
            // Compras - Suppliers
            get_suppliers, save_supplier, get_supplier_history,
            // Compras - Reports
            get_price_evolution, get_spending_by_supplier, get_spending_by_category,
            // Microbiologia - Products
            get_products, save_product, delete_product, delete_all_products,
            // Microbiologia - Reports
            get_reports, save_reports, delete_report,
            // Físico-Química
            get_fisco_quimica_patterns, save_fisco_quimica_pattern, delete_fisco_quimica_pattern,
            get_fisco_quimica_agents, save_fisco_quimica_agent, delete_fisco_quimica_agent,
            get_fisco_quimica_analyses, save_fisco_quimica_analysis, delete_fisco_quimica_analysis
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[tokio::test]
    async fn test_sync_execution() {
        let db_path = "../data.db";
        let conn = Connection::open(db_path).unwrap();
        super::initialize_hub_db(&conn).unwrap();
        println!("Starting sync from SQL Server...");
        match crate::legacy_db::sync_from_sql_server(db_path).await {
            Ok(res) => {
                println!("Sync succeeded!");
                println!("  Products: {}", res.products);
                println!("  Suppliers: {}", res.suppliers);
                println!("  Items: {}", res.items);
                println!("  Snapshots: {}", res.snapshots);
                println!("  Invoices: {}", res.invoices);
                println!("  Consumption: {}", res.consumption);
                println!("  Purchase Orders: {}", res.purchase_orders);
                println!("  Sales Orders: {}", res.sales_orders);
            }
            Err(e) => {
                println!("Sync failed with error: {:?}", e);
            }
        }
    }

    #[tokio::test]
    async fn test_dump_execution() {
        let dump_path = "../legacy_dump.db";
        // Remove old file if exists
        let _ = std::fs::remove_file(dump_path);
        println!("Starting SQL Server table dump to local SQLite...");
        match crate::legacy_db::create_database_dump(dump_path).await {
            Ok(res) => {
                println!("Dump succeeded!");
                println!("  Filename: {}", res.filename);
                println!("  Size: {} bytes", res.size_bytes);
                println!("  Tables copied: {:?}", res.tables_copied);
                println!("  Elapsed time: {} ms", res.elapsed_ms);
                assert!(std::path::Path::new(dump_path).exists());
            }
            Err(e) => {
                println!("Dump failed with error: {:?}", e);
                panic!("Dump execution failed");
            }
        }
    }

    #[tokio::test]
    async fn test_inspect_lote_11931() {
        let conn = Connection::open("../data.db").unwrap();
        println!("--- FORMULATION FOR PRODUCT 70.12.010 ---");
        let mut stmt = conn.prepare("SELECT ingredient_code, description, quantity, percentage FROM formulations WHERE product_code = '70.12.010'").unwrap();
        let mut rows = stmt.query([]).unwrap();
        while let Some(row) = rows.next().unwrap() {
            let ing_code: String = row.get(0).unwrap();
            let desc: Option<String> = row.get(1).unwrap();
            let qty: f64 = row.get(2).unwrap();
            let percentage: Option<f64> = row.get(3).unwrap();
            println!("Ing: {}, Desc: {:?}, Qty: {}, Pct: {:?}", ing_code, desc, qty, percentage);
        }
    }
}




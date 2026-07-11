use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{State, Manager};
use uuid::Uuid;

// Exposed modules from Producao backend
pub mod core {
    pub mod db;
    pub mod legacy_db;
    pub mod app_config;
    pub mod db_backup;
}

pub mod modules {
    pub mod geral;
    pub mod producao {
        pub mod gerenciamento {
            pub mod calculations;
            pub mod watcher;
        }
    }
    pub mod compras;
    pub mod financeiro;
    pub mod hub_api;
}

pub mod handlers;
pub mod models;
pub mod tauri_commands;

use crate::tauri_commands::*;


// === TYPE DEFINITIONS ===

pub use crate::modules::compras::planejamento::models::{
    ObsInput, Category, Supplier, Item, StockSnapshot, Consumption, Invoice, DemandResult,
    Quotation, QuotationItem, QuotationPrice, QuotationPriceInput, QuotationItemDetail,
    ImportResult, StockImport, PricePoint, SupplierSpend, CategorySpend,
};

pub use crate::modules::geral::feedbacks::models::Feedback;

use crate::modules::compras::planejamento::commands::{
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
    get_custom_purchase_configs, save_custom_purchase_config, delete_custom_purchase_config,
};

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

pub use crate::modules::compras::compras_online::models::{OnlineOrder, OnlineStore};

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
pub fn initialize_hub_db(conn: &Connection) -> Result<(), rusqlite::Error> {
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
            FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
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

        CREATE TABLE IF NOT EXISTS compras_config_personalizado (
            level           TEXT NOT NULL,
            target_id       TEXT NOT NULL,
            dias_start      INTEGER,
            dias_target     INTEGER,
            use_lead_time   INTEGER DEFAULT 0,
            safety_days     INTEGER DEFAULT 0,
            objetivo_tipo   TEXT DEFAULT 'padrao',
            objetivo_valor  REAL DEFAULT 0.0,
            periodo_media   INTEGER,
            PRIMARY KEY (level, target_id)
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS tiny_contas_pagar (
            id                INTEGER PRIMARY KEY,
            nome_cliente      TEXT NOT NULL,
            historico         TEXT,
            numero_doc        TEXT,
            data_emissao      TEXT,
            data_vencimento   TEXT,
            valor             REAL NOT NULL,
            saldo             REAL NOT NULL,
            situacao          TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tiny_contas_receber (
            id                INTEGER PRIMARY KEY,
            nome_cliente      TEXT NOT NULL,
            historico         TEXT,
            numero_doc        TEXT,
            data_emissao      TEXT,
            data_vencimento   TEXT,
            valor             REAL NOT NULL,
            saldo             REAL NOT NULL,
            situacao          TEXT NOT NULL
        );

        -- Defaults de conexão SQL: sem senha em código-fonte.
        -- Host/porta/usuário/DB são placeholders neutros; senha deve ser configurada na UI.
        INSERT OR IGNORE INTO settings (key, value) VALUES ('sql_host', '127.0.0.1');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('sql_port', '1433');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('sql_user', '');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('sql_password', '');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('sql_database', '');

        CREATE TABLE IF NOT EXISTS feedbacks (
            id          TEXT PRIMARY KEY,
            type        TEXT,
            description TEXT,
            page        TEXT,
            logs        TEXT,
            screenshot  TEXT,
            status      TEXT DEFAULT 'pending',
            createdAt   TEXT DEFAULT CURRENT_TIMESTAMP,
            resolvedAt  TEXT,
            requested_by TEXT,
            priority    INTEGER NOT NULL DEFAULT 100,
            admin_notes TEXT
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

        CREATE TABLE IF NOT EXISTS lote_error_resolutions (
            lote_number  TEXT PRIMARY KEY,
            is_resolved  INTEGER DEFAULT 0,
            resolved_by  TEXT,
            resolved_at  TEXT,
            observations TEXT
        );

        CREATE TABLE IF NOT EXISTS kit_assembly_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_number TEXT UNIQUE NOT NULL,
            kit_product_code TEXT NOT NULL,
            kit_product_description TEXT NOT NULL,
            quantity REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING',
            created_at TEXT NOT NULL,
            completed_at TEXT,
            assembled_by TEXT,
            checked_by TEXT,
            observations TEXT,
            erp_launched INTEGER DEFAULT 0,
            components_lotes TEXT,
            quantity_assembled REAL
        );
    ")?;
    // Migration: Remove foreign key from quotation_items to items(code)
    if conn.query_row("SELECT 1 FROM settings WHERE key = 'migration_remove_quotation_items_fk_v1'", [], |_| Ok(())).is_err() {
        let _ = conn.execute("PRAGMA foreign_keys = OFF", []);
        let _ = conn.execute("ALTER TABLE quotation_items RENAME TO quotation_items_old", []);
        
        let _ = conn.execute("
            CREATE TABLE IF NOT EXISTS quotation_items (
                id              TEXT PRIMARY KEY,
                quotation_id    TEXT NOT NULL,
                item_code       TEXT NOT NULL,
                recommended_qty REAL DEFAULT 0,
                approved_qty    REAL,
                final_qty       REAL,
                notes           TEXT,
                FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
            )
        ", []);
        
        let _ = conn.execute("
            INSERT OR IGNORE INTO quotation_items (id, quotation_id, item_code, recommended_qty, approved_qty, final_qty, notes)
            SELECT id, quotation_id, item_code, recommended_qty, approved_qty, final_qty, notes
            FROM quotation_items_old
        ", []);
        
        let _ = conn.execute("DROP TABLE IF EXISTS quotation_items_old", []);
        let _ = conn.execute("PRAGMA foreign_keys = ON", []);
        
        let _ = conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('migration_remove_quotation_items_fk_v1', 'done')", []);
    }

    Ok(())
}

// === OLD DATA MIGRATION ===
fn run_migration_if_needed() {
    let db_path = "../Saves/data.db";
    let is_new = !std::path::Path::new(db_path).exists();
    if is_new {
        println!("New database. Initializing tables and migrating data...");
        
        // Initialize Producao tables using db.rs init
        let prod_db = core::db::Db::new(db_path);
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
        let prod_db = core::db::Db::new(db_path);
        let _ = prod_db.init();
        let conn = Connection::open(db_path).expect("failed to open database");
        let _ = initialize_hub_db(&conn);
    }
}

// === TAURI COMMAND HANDLERS EXTRACTED TO tauri_commands.rs ===
pub use crate::modules::compras::planejamento::commands::{
    get_ignored_product_statuses,
    get_auto_ignored_ingredients,
};

// === AXUM SERVER RUNNER (PRODUCAO BACKEND) ===
fn start_axum_server() {
    tauri::async_runtime::spawn(async {
        let cfg = core::app_config::load_client_config();
        if cfg.app_mode == core::app_config::AppMode::Client {
            println!("Modo cliente: servidor Axum local não iniciado.");
            return;
        }

        let db_path = "../Saves/data.db";
        let db = core::db::Db::new(db_path);

        if let Ok(conn) = db.connect() {
            let _ = modules::geral::auth::store::init_auth_tables(&conn);
            modules::geral::hub::updater_manifest::seed_manifests_from_repo_root();
        }
        
        let state = std::sync::Arc::new(handlers::AppState { db });

        let scheduler_state = state.clone();
        tauri::async_runtime::spawn(async move {
            modules::geral::configuracoes::erp_sync_scheduler::start_erp_sync_scheduler(scheduler_state).await;
        });

        use tower_http::cors::{Any, CorsLayer};
        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);

        use axum::{middleware, routing::{get, post, delete, put}, Router};
        
        let app = Router::new()
            .route("/api/products", get(handlers::list_products))
            .route("/api/kits", get(handlers::list_kits))
            .route("/api/kits/composicao", get(handlers::list_kit_composicao).post(handlers::add_kit_composicao_handler))
            .route("/api/kits/composicao/upload", post(handlers::upload_kit_composicao))
            .route("/api/kits/composicao/:kit/:comp", delete(handlers::delete_kit_composicao_handler))
            .route("/api/kits/orders", get(handlers::list_kit_orders).post(handlers::create_kit_order))
            .route("/api/kits/orders/:id", put(handlers::update_kit_order).delete(handlers::delete_kit_order))
            .route("/api/kits/next-order-number", get(handlers::get_next_kit_order_number))
            .route("/api/turnovers/composicao", get(handlers::list_vira_composicao).post(handlers::add_vira_composicao))
            .route("/api/turnovers/composicao/:de/:para", delete(handlers::delete_vira_composicao))
            .route("/api/turnovers/orders", get(handlers::list_vira_orders).post(handlers::create_vira_order))
            .route("/api/turnovers/orders/:id", put(handlers::update_vira_order).delete(handlers::delete_vira_order))
            .route("/api/turnovers/next-order-number", get(handlers::get_next_vira_order_number))
            .route("/api/configs", get(handlers::get_configs).put(handlers::update_config))
            .route("/api/configs/:prefix", delete(handlers::delete_config))
            .route("/api/overrides", get(handlers::get_overrides).post(handlers::save_override))
            .route("/api/overrides/bulk", post(handlers::save_override_bulk))
            .route("/api/lancamento/graduation-check", get(handlers::get_graduation_candidates_handler))
            .route("/api/import/faturamento", post(handlers::import_faturamento))
            .route("/api/import/levantamento", post(handlers::import_levantamento))
            .route("/api/import/kits", post(handlers::import_kits))
            .route("/api/import/sync", post(handlers::trigger_db_sync))
            .route("/api/import/dump", post(handlers::trigger_db_dump))
            .route("/api/import/history", get(handlers::get_import_history))
            .route("/api/import/status", get(handlers::get_import_status))
            .route("/api/estoque/movimentacoes/:code", get(handlers::get_stock_movements))
            .route("/api/produtos/formulacao/:code", get(handlers::get_product_formulation))
            .route("/api/produtos/semelhantes/:code", get(handlers::get_similar_products))
            .route("/api/produtos/:code/detalhes", get(handlers::get_product_detalhes))
            .route("/api/producao/lotes", get(handlers::get_production_lotes))
            .route("/api/producao/lotes/:number/detalhes", get(handlers::get_lote_detalhes))
            .route("/api/producao/lotes/:number/resolver", post(handlers::save_lote_resolution).delete(handlers::delete_lote_resolution))
            .route("/api/producao/recalcular/preview", get(handlers::preview_recalculation))
            .route("/api/producao/recalcular/ajustar", post(handlers::apply_recalculation_adjustment))
            .merge(modules::compras::router())
            .merge(modules::financeiro::router())
            .route("/api/historico", get(handlers::list_producao).post(handlers::add_producao))
            .route("/api/historico/:id", delete(handlers::delete_producao))
            .route("/api/historico/:id/lote", put(handlers::update_producao_lote))
            .route("/api/vendas/pedidos", get(handlers::list_sales_orders))
            .route("/api/vendas/faltas", get(handlers::list_sales_faltas))
            .route("/api/produtos/:code/pedidos-pendentes", get(handlers::get_product_pending_orders))
            .merge(modules::geral::router())
            .merge(modules::hub_api::router())
            .layer(middleware::from_fn_with_state(
                state.clone(),
                modules::geral::auth::auth_middleware,
            ))
            .layer(tower_http::trace::TraceLayer::new_for_http())
            .layer(cors)
            .with_state(state);

        let addr = core::app_config::bind_address(&cfg);
        if let Ok(listener) = tokio::net::TcpListener::bind(&addr).await {
            println!("Axum REST server running on: http://{}", addr);
            let _ = axum::serve(listener, app).await;
        } else {
            eprintln!("Failed to bind Axum REST server to {} (already in use?)", addr);
        }
    });
}


// === RUN TAURI APP ===
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cfg = core::app_config::load_client_config();
    let install_id = core::app_config::read_tauri_identifier();
    let can_host_server = core::app_config::can_be_principal_server(&install_id);
    let is_client = core::app_config::effective_is_client_mode(&cfg);

    if cfg.app_mode == core::app_config::AppMode::Master && !can_host_server && !cfg!(debug_assertions) {
        eprintln!(
            "Aviso: build \"{}\" não pode ser servidor — Axum/SQLite local desativados. Configure como Cliente.",
            install_id
        );
    }

    if !is_client {
        run_migration_if_needed();
    }

    let db_state = if is_client {
        None
    } else {
        let conn = Connection::open("../Saves/data.db").expect("failed to open database");
        let _ = modules::geral::feedbacks::commands::sync_feedback_md(&conn);
        Some(DbState(Mutex::new(conn)))
    };

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(move |_app| {
            if !is_client {
                start_axum_server();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hub_get_client_config,
            hub_save_client_config,
            hub_check_server_health,
            open_external_browser,
            modules::geral::updater::commands::get_build_info,
            modules::geral::updater::commands::check_channel_update,
            modules::geral::updater::commands::install_channel_update,
            // Config & Common
            get_microbio_config, save_config_microbio,
            modules::geral::backup::commands::get_backup,
            modules::geral::backup::commands::restore_backup,
            modules::geral::backup::commands::get_compressed_backup,
            modules::geral::backup::commands::restore_compressed_backup,
            modules::geral::feedbacks::commands::get_feedbacks,
            modules::geral::feedbacks::commands::save_feedback,
            modules::geral::feedbacks::commands::resolve_feedback,
            modules::geral::configuracoes::commands::reset_db,
            modules::compras::compras_online::commands::get_online_orders,
            modules::compras::compras_online::commands::save_online_order,
            modules::compras::compras_online::commands::delete_online_order,
            modules::compras::compras_online::commands::get_online_stores,
            modules::compras::compras_online::commands::save_online_store,
            modules::compras::compras_online::commands::delete_online_store,
            modules::compras::compras_online::commands::upload_order_receipt,
            modules::compras::compras_online::commands::open_receipt_file,
            // Compras - Categories
            get_categories, save_category, delete_category,
            // Compras - Items
            get_items, update_item_details, import_item_observations, update_items_category,
            get_similar_items, add_similar_item, remove_similar_item,
            // Compras - Demands
            get_demands,
            get_custom_purchase_configs, save_custom_purchase_config, delete_custom_purchase_config,

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
        ]);

    if let Some(state) = db_state {
        builder = builder.manage(state);
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn hub_get_client_config() -> Result<core::app_config::ClientConfig, String> {
    Ok(core::app_config::load_client_config())
}

#[tauri::command]
fn hub_save_client_config(config: core::app_config::ClientConfig) -> Result<(), String> {
    core::app_config::save_client_config(&config)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerHealthCheck {
    ok: bool,
    api_origin: String,
    status: Option<String>,
    error: Option<String>,
}

#[tauri::command]
async fn hub_check_server_health(api_origin: String) -> Result<ServerHealthCheck, String> {
    let base = api_origin.trim_end_matches('/');
    let url = format!("{}/api/health", base);
    match reqwest::get(&url).await {
        Ok(res) if res.status().is_success() => {
            let status: Option<String> = res.json::<serde_json::Value>().await.ok()
                .and_then(|v| v.get("status").and_then(|s| s.as_str()).map(|s| s.to_string()));
            Ok(ServerHealthCheck {
                ok: true,
                api_origin: base.to_string(),
                status,
                error: None,
            })
        }
        Ok(res) => Ok(ServerHealthCheck {
            ok: false,
            api_origin: base.to_string(),
            status: None,
            error: Some(format!("HTTP {}", res.status())),
        }),
        Err(e) => Ok(ServerHealthCheck {
            ok: false,
            api_origin: base.to_string(),
            status: None,
            error: Some(e.to_string()),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[tokio::test]
    async fn test_sync_execution() {
        let db_path = "../Saves/data.db";
        let conn = Connection::open(db_path).unwrap();
        super::initialize_hub_db(&conn).unwrap();
        println!("Starting sync from SQL Server...");
        match crate::core::legacy_db::sync_from_sql_server(db_path).await {
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
        let dump_path = "../Saves/legacy_dump.db";
        // Remove old file if exists
        let _ = std::fs::remove_file(dump_path);
        println!("Starting SQL Server table dump to local SQLite...");
        match crate::core::legacy_db::create_database_dump(dump_path).await {
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
}


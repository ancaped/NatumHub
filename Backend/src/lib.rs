use serde::{Deserialize, Serialize};

// Exposed modules from Producao backend
pub mod core {
    pub mod db;
    pub mod legacy_db;
    pub mod app_config;
    pub mod pg_db;
    pub mod hub_db;
    pub mod pg_row;
    pub mod sales_open;
    pub mod production_reserve;
    pub mod mdns;
}

pub mod modules {
    pub mod geral;
    pub mod producao {
        pub mod gerenciamento {
            pub mod calculations;
            pub mod watcher;
        }
        pub mod proc;
    }
    pub mod compras;
    pub mod estoque;
    pub mod financeiro;
    pub mod hub_api;
    pub mod expedicao;
    pub mod qualidade;
    pub mod administrativo;
    pub mod ferramentas;
}

pub mod handlers;
pub mod models;
pub mod server;
pub mod server_manager;
pub mod lab_queries;

// === TYPE DEFINITIONS ===

pub use crate::modules::compras::planejamento::models::{
    ObsInput, Category, Supplier, Item, StockSnapshot, Consumption, Invoice, DemandResult,
    Quotation, QuotationItem, QuotationPrice, QuotationPriceInput, QuotationItemDetail,
    ImportResult, StockImport, PricePoint, SupplierSpend, CategorySpend,
};

pub use crate::modules::geral::feedbacks::models::Feedback;

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
    pub manufacturing_date: Option<String>,
    pub printed: Option<bool>,
    pub printed_at: Option<String>,
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
    pub aspect: Option<String>,
    pub color: Option<String>,
    pub odor: Option<String>,
    pub image_url: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FiscoQuimicaAgent {
    pub id: String,
    pub name: String,
    pub category: Option<String>,
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
    pub fabricated_by: Option<String>,
    pub authorized_by: Option<String>,
    pub synced_to_erp: Option<bool>,
    pub erp_synced_at: Option<String>,
    pub created_at: Option<String>,
    pub status: Option<String>,
    pub media_url: Option<String>,
    pub aspect_ok: Option<bool>,
    pub aspect_result: Option<String>,
    pub color_ok: Option<bool>,
    pub color_result: Option<String>,
    pub odor_ok: Option<bool>,
    pub odor_result: Option<String>,
}

// === STATE ===
/// Legado Tauri — comandos de DB removidos; dados via REST + PostgreSQL.
pub struct DbState;

pub struct PgPoolState(pub sqlx::PgPool);

// === TAURI COMMAND HANDLERS EXTRACTED TO tauri_commands.rs ===
pub use crate::modules::compras::planejamento::commands::{
    get_ignored_product_statuses_query,
    get_auto_ignored_ingredients_query,
};



#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Row;

    #[tokio::test]
    async fn test_sync_execution() {
        let pool = match core::pg_db::create_pool().await {
            Ok(p) => p,
            Err(e) => {
                println!("Skipping sync test — PostgreSQL unavailable: {}", e);
                return;
            }
        };
        println!("Starting sync from SQL Server...");
        match crate::core::legacy_db::sync_from_sql_server(
            &pool,
            crate::core::legacy_db::SyncMode::Incremental,
        )
        .await {
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
        let pool = match core::pg_db::create_pool().await {
            Ok(p) => p,
            Err(e) => {
                println!("Skipping dump test — PostgreSQL unavailable: {}", e);
                return;
            }
        };
        println!("Starting SQL Server row count summary...");
        match crate::core::legacy_db::create_database_dump(&pool).await {
            Ok(res) => {
                println!("Dump succeeded!");
                println!("  Filename: {}", res.filename);
                println!("  Total rows: {}", res.size_bytes);
                println!("  Tables: {:?}", res.tables_copied);
                println!("  Row counts: {:?}", res.table_row_counts);
                println!("  Elapsed time: {} ms", res.elapsed_ms);
                assert!(!res.tables_copied.is_empty());
            }
            Err(e) => {
                println!("Dump failed with error: {:?}", e);
                panic!("Dump execution failed");
            }
        }
    }
}


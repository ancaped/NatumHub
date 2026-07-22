use serde::{Deserialize, Serialize};

// Exposed modules from Producao backend
pub mod core {
    pub mod db;
    pub mod legacy_db;
    pub mod app_config;
    pub mod pg_db;
    pub mod hub_db;
    pub mod pg_row;
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
    pub mod estoque;
    pub mod financeiro;
    pub mod hub_api;
    pub mod expedicao;
    pub mod qualidade;
    pub mod administrativo;
}

pub mod handlers;
pub mod models;
pub mod server;
pub mod tauri_commands;

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
/// Legado Tauri — comandos de DB removidos; dados via REST + PostgreSQL.
pub struct DbState;

pub struct PgPoolState(pub sqlx::PgPool);

// === TAURI COMMAND HANDLERS EXTRACTED TO tauri_commands.rs ===
pub use crate::modules::compras::planejamento::commands::{
    get_ignored_product_statuses_query,
    get_auto_ignored_ingredients_query,
};

#[cfg(feature = "desktop")]
fn start_axum_server() {
    tauri::async_runtime::spawn(async move {
        let _ = server::run_hub_server(server::HubServerOptions::default()).await;
    });
}

// === RUN TAURI APP ===
#[cfg(feature = "desktop")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cfg = core::app_config::load_client_config();
    let _install_id = core::app_config::read_tauri_identifier();
    let is_client = cfg.app_mode == core::app_config::AppMode::Client;

    let builder = tauri::Builder::default()
        .setup(move |app| {
            use tauri::Manager;
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_size(tauri::LogicalSize::new(1280.0, 850.0));
                let _ = win.set_min_size(Some(tauri::LogicalSize::new(900.0, 600.0)));
                let _ = win.center();
                let _ = win.show();
                let _ = win.set_focus();
            }
            start_axum_server();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hub_get_client_config,
            hub_save_client_config,
            hub_check_server_health,
            crate::tauri_commands::open_external_browser,
            modules::geral::build_info::get_build_info,
            modules::compras::compras_online::commands::upload_order_receipt,
            modules::compras::compras_online::commands::open_receipt_file,
            modules::geral::postgres_bootstrap::commands::hub_bootstrap_local_postgres,
        ]);

    if is_client {
        println!("Modo terminal: sem pool Postgres local; API remota em {}", cfg.api_origin);
        builder
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
        return;
    }

    // PC Principal: tenta subir Postgres embutido (Dev) e conectar sem derrubar a UI.
    let _ = modules::geral::postgres_bootstrap::ensure_embedded_running();
    match tauri::async_runtime::block_on(core::pg_db::create_pool()) {
        Ok(pg_pool) => {
            let _ = tauri::async_runtime::block_on(
                modules::geral::feedbacks::commands::sync_feedback_md(pg_pool.clone()),
            );
            builder
                .manage(PgPoolState(pg_pool))
                .run(tauri::generate_context!())
                .expect("error while running tauri application");
        }
        Err(e) => {
            eprintln!(
                "PostgreSQL indisponível ao iniciar: {e}\n\
                 Crie {} e reinicie (ver ContextoIA/devops/instalacao_postgres_master.md).",
                core::pg_db::postgres_env_path().display()
            );
            // Ainda abre a UI (wizard / reconfigurar). Axum só sobe se o pool existir no spawn.
            builder
                .run(tauri::generate_context!())
                .expect("error while running tauri application");
        }
    }
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn hub_get_client_config() -> Result<core::app_config::ClientConfig, String> {
    Ok(core::app_config::load_client_config())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn hub_save_client_config(config: core::app_config::ClientConfig) -> Result<(), String> {
    core::app_config::save_client_config(&config)
}

#[cfg(feature = "desktop")]
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerHealthCheck {
    ok: bool,
    api_origin: String,
    status: Option<String>,
    error: Option<String>,
}

#[cfg(feature = "desktop")]
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

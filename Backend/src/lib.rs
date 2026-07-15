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
}

pub mod handlers;
pub mod models;
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


// === AXUM SERVER RUNNER (PRODUCAO BACKEND) ===

async fn repair_corrupted_data_if_needed(pool: &sqlx::PgPool) {
    println!("[Startup] Checking for corrupted invoice/purchase order data...");
    
    // Verifica se a tabela invoices existe para evitar erros na primeira inicialização antes do schema
    let table_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'invoices'
        )"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(false);

    if !table_exists {
        return;
    }

    // Verifica se existem dados corrompidos (onde o número da NF é igual a um nome de fornecedor)
    let is_corrupted: bool = sqlx::query_scalar(
        "SELECT EXISTS (
            SELECT 1 FROM invoices 
            WHERE invoice_number IN (SELECT name FROM suppliers)
            LIMIT 1
        )"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(false);

    if is_corrupted {
        println!("[Startup] WARNING: Corrupted data detected (supplier name in invoice_number). Resetting local tables to force full ERP sync...");
        
        let mut tx = match pool.begin().await {
            Ok(t) => t,
            Err(e) => {
                eprintln!("[Startup] Failed to start transaction for data repair: {}", e);
                return;
            }
        };

        // Limpa as tabelas de cache para forçar a sincronização limpa
        let _ = sqlx::query("TRUNCATE TABLE invoices").execute(&mut *tx).await;
        let _ = sqlx::query("TRUNCATE TABLE purchase_orders CASCADE").execute(&mut *tx).await;
        let _ = sqlx::query("TRUNCATE TABLE purchase_order_items").execute(&mut *tx).await;
        let _ = sqlx::query("DELETE FROM nf_import_control").execute(&mut *tx).await;

        if let Err(e) = tx.commit().await {
            eprintln!("[Startup] Failed to commit data repair transaction: {}", e);
        } else {
            println!("[Startup] Reset successful. Local caches will be repopulated correctly on the next ERP sync.");
        }
    } else {
        println!("[Startup] Invoice and purchase order data checks passed.");
    }
}

fn start_axum_server() {
    tauri::async_runtime::spawn(async move {
        let cfg = core::app_config::load_client_config();
        if cfg.app_mode == core::app_config::AppMode::Client {
            println!("Modo cliente: servidor Axum local não iniciado.");
            return;
        }

        let pool = match core::pg_db::create_pool().await {
            Ok(p) => p,
            Err(e) => {
                // Tenta subir Postgres portável Dev antes de desistir
                let _ = modules::geral::postgres_bootstrap::ensure_embedded_running();
                match core::pg_db::create_pool().await {
                    Ok(p) => p,
                    Err(e2) => {
                        eprintln!(
                            "Axum não iniciado — PostgreSQL indisponível: {e} / {e2}\n\
                             No NatumHub Dev use o botão «Instalar PostgreSQL» no wizard, ou coloque DATABASE_URL em {}.",
                            core::pg_db::postgres_env_path().display()
                        );
                        return;
                    }
                }
            }
        };
        let db = core::db::Db::new(pool.clone());

        // Chamada da rotina de auto-reparação em background
        let pool_clone = pool.clone();
        tauri::async_runtime::spawn(async move {
            repair_corrupted_data_if_needed(&pool_clone).await;
        });

        let _ = modules::geral::auth::store::init_auth_tables(&pool).await;
        modules::geral::hub::updater_manifest::seed_manifests_from_repo_root();

        let state = std::sync::Arc::new(handlers::AppState { db });

        let scheduler_state = state.clone();
        tauri::async_runtime::spawn(async move {
            modules::geral::configuracoes::erp_sync_scheduler::start_erp_sync_scheduler(scheduler_state).await;
        });

        let backup_state = state.clone();
        tauri::async_runtime::spawn(async move {
            modules::geral::configuracoes::pg_backup::start_pg_backup_scheduler(backup_state).await;
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
            .route("/api/kits/component-candidates", get(handlers::search_kit_component_candidates))
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
            .route("/api/import/sync-lock", get(handlers::get_sync_lock_status))
            .route("/api/import/sync-lock/release", post(handlers::release_sync_lock))
            .route("/api/import/dump", post(handlers::trigger_db_dump))
            .route("/api/import/history", get(handlers::get_import_history))
            .route("/api/import/status", get(handlers::get_import_status))
            .route("/api/estoque/movimentacoes/:code", get(handlers::get_stock_movements))
            .route("/api/produtos/formulacao/:code", get(handlers::get_product_formulation))
            .route("/api/produtos/semelhantes/:code", get(handlers::get_similar_products))
            .route("/api/produtos/:code/detalhes", get(handlers::get_product_detalhes))
            .route("/api/producao/lotes", get(handlers::get_production_lotes))
            .route("/api/producao/lotes/:number/detalhes", get(handlers::get_lote_detalhes))
            .route("/api/producao/lotes/:number", get(handlers::get_lote_lookup))
            .route("/api/producao/lotes/:number/resolver", post(handlers::save_lote_resolution).delete(handlers::delete_lote_resolution))
            .route("/api/producao/recalcular/preview", get(handlers::preview_recalculation))
            .route("/api/producao/recalcular/ajustar", post(handlers::apply_recalculation_adjustment))
            .merge(modules::compras::router())
            .merge(modules::estoque::router())
            .merge(modules::financeiro::router())
            .merge(modules::expedicao::router())
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
    let _install_id = core::app_config::read_tauri_identifier();
    let is_client = cfg.app_mode == core::app_config::AppMode::Client;

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(move |_app| {
            start_axum_server();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hub_get_client_config,
            hub_save_client_config,
            hub_check_server_health,
            crate::tauri_commands::open_external_browser,
            modules::geral::updater::commands::get_build_info,
            modules::geral::updater::commands::check_channel_update,
            modules::geral::updater::commands::install_channel_update,
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


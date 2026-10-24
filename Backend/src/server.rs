//! Bootstrap HTTP do Hub (Axum) — compartilhado entre Tauri desktop e `natumhub-server`.

use std::sync::Arc;

use axum::{
    middleware,
    routing::{delete, get, post, put},
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};

use crate::core;
use crate::handlers;
use crate::modules;

/// Opções de subida do servidor HTTP.
#[derive(Debug, Clone, Copy)]
pub struct HubServerOptions {
    /// Se true, encerra o processo com erro quando Postgres não conecta.
    pub require_postgres: bool,
    /// Tenta subir Postgres embutido (Dev) antes de falhar.
    pub try_embedded_postgres: bool,
}

impl Default for HubServerOptions {
    fn default() -> Self {
        Self {
            require_postgres: false,
            try_embedded_postgres: true,
        }
    }
}

async fn repair_corrupted_data_if_needed(pool: &sqlx::PgPool) {
    println!("[Startup] Checking for corrupted invoice/purchase order data...");

    let table_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'invoices'
        )",
    )
    .fetch_one(pool)
    .await
    .unwrap_or(false);

    if !table_exists {
        return;
    }

    let is_corrupted: bool = sqlx::query_scalar(
        "SELECT EXISTS (
            SELECT 1 FROM invoices
            WHERE invoice_number IN (SELECT name FROM suppliers)
            LIMIT 1
        )",
    )
    .fetch_one(pool)
    .await
    .unwrap_or(false);

    if is_corrupted {
        println!(
            "[Startup] WARNING: Corrupted data detected (supplier name in invoice_number). Resetting local tables to force full ERP sync..."
        );

        let mut tx = match pool.begin().await {
            Ok(t) => t,
            Err(e) => {
                eprintln!("[Startup] Failed to start transaction for data repair: {}", e);
                return;
            }
        };

        let _ = sqlx::query("TRUNCATE TABLE invoices")
            .execute(&mut *tx)
            .await;
        let _ = sqlx::query("TRUNCATE TABLE purchase_orders CASCADE")
            .execute(&mut *tx)
            .await;
        let _ = sqlx::query("TRUNCATE TABLE purchase_order_items")
            .execute(&mut *tx)
            .await;
        let _ = sqlx::query("DELETE FROM nf_import_control")
            .execute(&mut *tx)
            .await;

        if let Err(e) = tx.commit().await {
            eprintln!("[Startup] Failed to commit data repair transaction: {}", e);
        } else {
            println!(
                "[Startup] Reset successful. Local caches will be repopulated correctly on the next ERP sync."
            );
        }
    } else {
        println!("[Startup] Invoice and purchase order data checks passed.");
    }
}

fn build_router(state: Arc<handlers::AppState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api = Router::new()
        .route(
            "/api/kits/component-candidates",
            get(handlers::search_kit_component_candidates),
        )
        .route(
            "/api/kits/composicao",
            get(handlers::list_kit_composicao).post(handlers::add_kit_composicao_handler),
        )
        .route(
            "/api/kits/composicao/upload",
            post(handlers::upload_kit_composicao),
        )
        .route(
            "/api/kits/composicao/:kit/:comp",
            delete(handlers::delete_kit_composicao_handler),
        )
        .route(
            "/api/kits/orders",
            get(handlers::list_kit_orders).post(handlers::create_kit_order),
        )
        .route(
            "/api/kits/orders/:id",
            put(handlers::update_kit_order).delete(handlers::delete_kit_order),
        )
        .route(
            "/api/kits/next-order-number",
            get(handlers::get_next_kit_order_number),
        )
        .route(
            "/api/turnovers/composicao",
            get(handlers::list_vira_composicao).post(handlers::add_vira_composicao),
        )
        .route(
            "/api/turnovers/composicao/:de/:para",
            delete(handlers::delete_vira_composicao),
        )
        .route(
            "/api/turnovers/orders",
            get(handlers::list_vira_orders).post(handlers::create_vira_order),
        )
        .route(
            "/api/turnovers/orders/:id",
            put(handlers::update_vira_order).delete(handlers::delete_vira_order),
        )
        .route(
            "/api/turnovers/next-order-number",
            get(handlers::get_next_vira_order_number),
        )
        .route(
            "/api/turnovers/packaging-preview",
            get(handlers::preview_vira_packaging),
        )
        .route(
            "/api/configs",
            get(handlers::get_configs).put(handlers::update_config),
        )
        .route("/api/configs/:prefix", delete(handlers::delete_config))
        .route(
            "/api/overrides",
            get(handlers::get_overrides).post(handlers::save_override),
        )
        .route("/api/overrides/bulk", post(handlers::save_override_bulk))
        .route(
            "/api/lancamento/graduation-check",
            get(handlers::get_graduation_candidates_handler),
        )
        .route("/api/import/faturamento", post(handlers::import_faturamento))
        .route(
            "/api/import/levantamento",
            post(handlers::import_levantamento),
        )
        .route("/api/import/kits", post(handlers::import_kits))
        .route("/api/import/sync", post(handlers::trigger_db_sync))
        .route("/api/import/sync-lock", get(handlers::get_sync_lock_status))
        .route(
            "/api/import/sync-lock/release",
            post(handlers::release_sync_lock),
        )
        .route("/api/import/dump", post(handlers::trigger_db_dump))
        .route("/api/import/history", get(handlers::get_import_history))
        .route("/api/import/status", get(handlers::get_import_status))
        .route(
            "/api/estoque/movimentacoes/:code",
            get(handlers::get_stock_movements),
        )
        .route(
            "/api/produtos/formulacao/:code",
            get(handlers::get_product_formulation),
        )
        .route(
            "/api/produtos/semelhantes/:code",
            get(handlers::get_similar_products),
        )
        .route(
            "/api/produtos/:code/detalhes",
            get(handlers::get_product_detalhes),
        )
        .merge(modules::producao::proc::router())
        .merge(modules::producao::cobertura::router())
        .merge(modules::producao::decisoes::router())
        .merge(modules::producao::fila::router())
        .merge(modules::producao::planejamento::router())
        .merge(modules::producao::reatores::router())
        .merge(modules::producao::bases::router())
        .merge(modules::producao::kits::router())
        .merge(modules::producao::calculo::router())
        .merge(modules::producao::lotes::router())
        .merge(modules::producao::historico::router())
        .merge(modules::producao::trocas::router())
        .merge(modules::producao::auditoria::router())
        .merge(modules::producao::insumos_classificacao::router())
        .merge(modules::compras::router())
        .merge(modules::estoque::router())
        .merge(modules::financeiro::router())
        .merge(modules::expedicao::router())
        .merge(modules::qualidade::router())
        .merge(modules::administrativo::router())
        .merge(modules::ferramentas::router())
        .route("/api/vendas/pedidos", get(handlers::list_sales_orders))
        .route(
            "/api/vendas/pedidos/detalhe",
            get(handlers::get_sales_order_detail),
        )
        .route("/api/vendas/faltas", get(handlers::list_sales_faltas))
        .route("/api/vendas/clientes", get(handlers::list_sales_clientes))
        .route(
            "/api/vendas/clientes/:codigo/pedidos",
            get(handlers::list_cliente_sales_orders),
        )
        .route(
            "/api/produtos/:code/pedidos-pendentes",
            get(handlers::get_product_pending_orders),
        )
        .route("/server-control", get(handlers::server_control_html))
        .route("/api/server-manager/status", get(handlers::get_server_status))
        .route("/api/server-manager/restart", post(handlers::restart_server_handler))
        .route("/api/server-manager/stop", post(handlers::stop_server_handler))
        .route("/api/server-manager/start", post(handlers::start_server_handler))
        .route("/api/server-manager/links", get(handlers::get_server_links))
        .route("/api/server-manager/devices", get(handlers::get_server_devices))
        .route("/api/server-manager/logs", get(handlers::get_server_logs))
        .route("/api/server-manager/clear-logs", post(handlers::clear_server_logs))
        .route("/api/server-manager/autostart", post(handlers::toggle_autostart))
        .route("/api/server-manager/open-browser", post(handlers::open_browser_handler))
        .route("/api/server-manager/open-saves", post(handlers::open_saves_handler))
        .merge(modules::geral::router())
        .merge(modules::hub_api::router())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            modules::geral::auth::auth_middleware,
        ))
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state);

    if let Some(dist) = core::app_config::frontend_dist_dir() {
        println!("Servindo SPA do Hub em: {}", dist.display());
        let index = dist.join("index.html");
        api.fallback_service(ServeDir::new(dist).not_found_service(ServeFile::new(index)))
    } else {
        eprintln!(
            "Frontend/dist não encontrado — rode `npm run build` em Frontend/ ou defina NATUMHUB_FRONTEND_DIST."
        );
        api
    }
}

/// Sobe Axum + schedulers e bloqueia até o servidor encerrar.
pub async fn run_hub_server(opts: HubServerOptions) -> Result<(), String> {
    run_hub_server_with_shutdown(opts, std::future::pending()).await
}

/// Sobe Axum + schedulers com suporte a sinal de encerramento gracioso.
pub async fn run_hub_server_with_shutdown<F>(
    opts: HubServerOptions,
    shutdown_signal: F,
) -> Result<(), String>
where
    F: std::future::Future<Output = ()> + Send + 'static,
{
    let cfg = core::app_config::load_client_config();
    if cfg.app_mode == core::app_config::AppMode::Client {
        println!("Modo cliente: servidor Axum local não iniciado.");
        return Ok(());
    }

    let pool = match core::pg_db::create_pool().await {
        Ok(p) => p,
        Err(e) => {
            if opts.try_embedded_postgres {
                let _ = modules::geral::postgres_bootstrap::ensure_embedded_running();
                match core::pg_db::create_pool().await {
                    Ok(p) => p,
                    Err(e2) => {
                        let msg = format!(
                            "PostgreSQL indisponível: {e} / {e2}\n\
                             Coloque DATABASE_URL em {} ou use o wizard Dev.",
                            core::pg_db::postgres_env_path().display()
                        );
                        if opts.require_postgres {
                            return Err(msg);
                        }
                        eprintln!("Axum não iniciado — {msg}");
                        return Ok(());
                    }
                }
            } else {
                let msg = format!(
                    "PostgreSQL indisponível: {e}\n\
                     Coloque DATABASE_URL em {}.",
                    core::pg_db::postgres_env_path().display()
                );
                if opts.require_postgres {
                    return Err(msg);
                }
                eprintln!("Axum não iniciado — {msg}");
                return Ok(());
            }
        }
    };

    let db = core::db::Db::new(pool.clone());

    let _ = crate::core::sales_open::ensure_faltas_days_setting(&db).await;

    let pool_clone = pool.clone();
    tokio::spawn(async move {
        repair_corrupted_data_if_needed(&pool_clone).await;
    });

    // Sync interrompido por deploy/reinício deixa o lock `em_andamento`: no boot ele é sempre órfão.
    match core::pg_db::reclaim_orphan_sync_locks(&pool).await {
        Ok(n) if n > 0 => println!("[Sync] {n} lock(s) órfão(s) de sync interrompido liberado(s) no boot."),
        Ok(_) => {}
        Err(e) => eprintln!("[Sync] {e}"),
    }
    // Migrações SQL (Backend/supabase, SCHEMA_FILES) em todo boot: idempotentes e com lock entre processos.
    // Antes só rodavam no início de um sync do ERP, e colunas novas ficavam faltando até o próximo sync.
    if let Err(e) = modules::geral::postgres_bootstrap::commands::run_schema_migrations(&pool).await {
        eprintln!("[Database Migration] {e}");
        modules::geral::alertas::alertar(&pool, "migracao", "Falha ao aplicar migração do banco", &e).await;
    }
    let _ = modules::geral::auth::store::init_auth_tables(&pool).await;
    let _ = modules::geral::audit::store::ensure_tables(&pool).await;
    let _ = modules::geral::mapa::store::ensure_schema(&pool).await;
    let _ = modules::administrativo::funcionarios::store::ensure_schema(&pool).await;
    let _ = modules::administrativo::acompanhamento_producao::store::ensure_schema(&pool).await;
    let _ = modules::producao::fila::ensure_fila_demandas_table(&pool).await;

    let state = Arc::new(handlers::AppState { db });

    let pool_alertas = state.db.pool().clone();
    tokio::spawn(async move {
        modules::geral::alertas::vigiar_sync_erp(pool_alertas).await;
    });

    let scheduler_state = state.clone();
    tokio::spawn(async move {
        modules::geral::configuracoes::erp_sync_scheduler::start_erp_sync_scheduler(scheduler_state)
            .await;
    });

    let stock_audit_state = state.clone();
    tokio::spawn(async move {
        modules::geral::configuracoes::erp_sync_scheduler::start_stock_auto_audit_scheduler(stock_audit_state)
            .await;
    });

    let backup_state = state.clone();
    tokio::spawn(async move {
        modules::geral::configuracoes::pg_backup::start_pg_backup_scheduler(backup_state).await;
    });

    let app = build_router(state);
    let addr = core::app_config::bind_address(&cfg);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|e| format!("Failed to bind Axum REST server to {addr}: {e}"))?;

    println!("Axum REST server running on: http://{addr}");
    println!(
        "Acesso clientes (navegador): http://natumhub.local:{}",
        cfg.api_port
    );
    println!(
        "Painel do Servidor: http://localhost:{}/server-control",
        cfg.api_port
    );

    crate::server_manager::log_server(
        "INFO",
        &format!("Servidor HTTP Axum ativo em http://{} (Painel em /server-control)", addr),
    )
    .await;

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal)
        .await
        .map_err(|e| format!("Axum server error: {e}"))
}

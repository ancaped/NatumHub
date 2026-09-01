//! Binário headless: API Axum + SPA, sem janela Tauri.
//!
//! ```text
//! cargo run --release --bin nexus-server --no-default-features
//! ```

use app_lib::server::{run_hub_server, HubServerOptions};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let cfg = app_lib::core::app_config::load_client_config();
    if cfg.app_mode == app_lib::core::app_config::AppMode::Client {
        eprintln!(
            "nexus-server exige modo master (PC Principal). \
             Ajuste Saves/client_config.json → appMode: \"master\"."
        );
        std::process::exit(1);
    }

    println!(
        "Nexus server (headless) — data dir: {}",
        app_lib::core::app_config::saves_dir().display()
    );

    if let Err(e) = run_hub_server(HubServerOptions {
        require_postgres: true,
        try_embedded_postgres: false,
    })
    .await
    {
        eprintln!("Falha ao iniciar servidor: {e}");
        std::process::exit(1);
    }
}

use std::path::Path;
use std::sync::Arc;
use tokio::time::{interval, Duration};

use crate::handlers::AppState;

/// Starts a background task that polls the configured folder every 60 seconds
/// and automatically imports any new spreadsheet files found.
pub async fn start_folder_watcher(state: Arc<AppState>) {
    let mut ticker = interval(Duration::from_secs(60));
    // Skip the first immediate tick
    ticker.tick().await;

    loop {
        ticker.tick().await;

        // Read current watch config
        let cfg = match state.db.get_watch_config() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[Watcher] Erro ao ler configurações de monitoramento: {}", e);
                continue;
            }
        };

        if !cfg.ativo {
            continue;
        }

        let pasta = cfg.pasta.clone();
        let pasta_path = Path::new(&pasta);

        // Resolve relative paths relative to the binary working directory
        let entries = match std::fs::read_dir(pasta_path) {
            Ok(e) => e,
            Err(e) => {
                eprintln!("[Watcher] Pasta '{}' não acessível: {}", pasta, e);
                continue;
            }
        };

        // Get already imported file names for each type
        let imported_lev = state.db.get_already_imported_files("levantamento").unwrap_or_default();
        let imported_fat = state.db.get_already_imported_files("faturamento").unwrap_or_default();

        for entry in entries.flatten() {
            let file_name = entry.file_name();
            let name = file_name.to_string_lossy().to_string();

            if !name.ends_with(".xlsx") {
                continue;
            }

            let full_path = entry.path();

            // Detect type by filename prefix
            if name.starts_with("Levantamento_Producao_") {
                if imported_lev.contains(&name) {
                    continue; // Already imported
                }
                println!("[Watcher] Novo arquivo detectado (Levantamento): {}", name);
                let mut conn = match state.db.connect() {
                    Ok(c) => c,
                    Err(e) => { eprintln!("[Watcher] Erro de conexão: {}", e); continue; }
                };
                match crate::parser::parse_levantamento_excel(&full_path, &mut conn) {
                    Ok(count) => {
                        println!("[Watcher] Levantamento importado com sucesso: {} produtos", count);
                        let _ = state.db.record_import("levantamento", &name, count as i64, "success",
                            Some(&format!("{} produtos atualizados", count)));
                    }
                    Err(e) => {
                        eprintln!("[Watcher] Erro ao importar {}: {}", name, e);
                        let _ = state.db.record_import("levantamento", &name, 0, "error", Some(&e.to_string()));
                    }
                }
            } else if name.starts_with("Faturamento_Anual_") {
                if imported_fat.contains(&name) {
                    continue; // Already imported
                }
                println!("[Watcher] Novo arquivo detectado (Faturamento): {}", name);
                let mut conn = match state.db.connect() {
                    Ok(c) => c,
                    Err(e) => { eprintln!("[Watcher] Erro de conexão: {}", e); continue; }
                };
                match crate::parser::parse_faturamento_excel(&full_path, &mut conn) {
                    Ok(count) => {
                        println!("[Watcher] Faturamento importado com sucesso: {} produtos", count);
                        let _ = state.db.record_import("faturamento", &name, count as i64, "success",
                            Some(&format!("{} produtos atualizados", count)));
                    }
                    Err(e) => {
                        eprintln!("[Watcher] Erro ao importar {}: {}", name, e);
                        let _ = state.db.record_import("faturamento", &name, 0, "error", Some(&e.to_string()));
                    }
                }
            }
        }
    }
}

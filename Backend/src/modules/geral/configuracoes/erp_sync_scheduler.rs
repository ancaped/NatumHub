use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use chrono::{Local, NaiveTime, Timelike};
use tokio::time::{interval, Duration};

use crate::handlers::imports::execute_erp_sync;
use crate::handlers::AppState;

static SYNC_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

/// Normaliza "H:MM" ou "HH:MM" para "HH:MM".
pub fn normalize_time(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    let parts: Vec<&str> = trimmed.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let hour: u32 = parts[0].parse().ok()?;
    let minute: u32 = parts[1].parse().ok()?;
    if hour > 23 || minute > 59 {
        return None;
    }
    Some(format!("{:02}:{:02}", hour, minute))
}

pub fn normalize_schedule_times(times: &[String]) -> Vec<String> {
    let mut normalized: Vec<String> = times
        .iter()
        .filter_map(|t| normalize_time(t))
        .collect();
    normalized.sort();
    normalized.dedup();
    normalized
}

pub fn compute_next_run(horarios: &[String]) -> Option<String> {
    if horarios.is_empty() {
        return None;
    }
    let now = Local::now();
    let today = now.date_naive();
    let mut best: Option<chrono::NaiveDateTime> = None;

    for slot in horarios {
        let time = NaiveTime::parse_from_str(slot, "%H:%M").ok()?;
        let candidate = today.and_time(time);
        if candidate > now.naive_local() {
            if best.map(|b| candidate < b).unwrap_or(true) {
                best = Some(candidate);
            }
        }
    }

    if best.is_none() {
        let tomorrow = today.succ_opt()?;
        for slot in horarios {
            let time = NaiveTime::parse_from_str(slot, "%H:%M").ok()?;
            let candidate = tomorrow.and_time(time);
            if best.map(|b| candidate < b).unwrap_or(true) {
                best = Some(candidate);
            }
        }
    }

    best.map(|dt| dt.format("%d/%m/%Y %H:%M").to_string())
}

/// Task em background: dispara sync ERP nos horários configurados (somente master).
pub async fn start_erp_sync_scheduler(state: Arc<AppState>) {
    let mut ticker = interval(Duration::from_secs(30));
    ticker.tick().await;

    loop {
        ticker.tick().await;

        let cfg = match state.db.get_erp_sync_schedule().await {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[ERP Sync Scheduler] Erro ao ler configuração: {}", e);
                continue;
            }
        };

        if !cfg.ativo || cfg.horarios.is_empty() {
            continue;
        }

        let now = Local::now();
        let current_slot = format!("{:02}:{:02}", now.hour(), now.minute());
        let slot_key = format!("{} {}", now.format("%Y-%m-%d"), current_slot);

        let matches = cfg.horarios.iter().any(|h| h == &current_slot);
        if !matches {
            continue;
        }

        if state
            .db
            .get_erp_sync_last_slot()
            .await
            .ok()
            .flatten()
            .as_deref()
            == Some(slot_key.as_str())
        {
            continue;
        }

        if SYNC_IN_PROGRESS
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            eprintln!(
                "[ERP Sync Scheduler] Sync já em andamento — pulando slot {}",
                slot_key
            );
            continue;
        }

        println!(
            "[ERP Sync Scheduler] Iniciando sync automático ERP (slot {})",
            slot_key
        );

        let result = execute_erp_sync(
            state.clone(),
            "Banco SQL Server NATUM (automático)",
            crate::core::legacy_db::SyncMode::Incremental,
        )
        .await;
        SYNC_IN_PROGRESS.store(false, Ordering::SeqCst);

        match result {
            Ok(_) => {
                let stamp = Local::now().format("%d/%m/%Y %H:%M:%S").to_string();
                let _ = state.db.set_erp_sync_last_slot(&slot_key).await;
                let _ = state.db.set_erp_sync_last_auto_run(&stamp).await;
                println!(
                    "[ERP Sync Scheduler] Sync automático concluído ({})",
                    stamp
                );
            }
            Err(e) if e == crate::core::pg_db::SYNC_ALREADY_RUNNING => {}
            Err(e) => {
                eprintln!("[ERP Sync Scheduler] Falha no sync automático: {}", e);
            }
        }
    }
}

/// Task em background: auto-auditoria periódica leve de estoque (Insumos + Materiais + Produtos).
/// Executa a cada N minutos (padrão 15 min) e alinha o Hub com nQtdeEstoque da tela do ERP.
pub async fn start_stock_auto_audit_scheduler(state: Arc<AppState>) {
    // Aguarda 45s após o boot para dar tempo do servidor e outros serviços iniciarem
    tokio::time::sleep(Duration::from_secs(45)).await;

    let mut ticker = interval(Duration::from_secs(60));
    ticker.tick().await;

    let mut last_run = std::time::Instant::now();
    // Executa a primeira verificação logo no início
    let mut is_first_run = true;

    loop {
        ticker.tick().await;

        let interval_mins: u64 = state
            .db
            .get_setting("stock_auto_audit_interval_minutes")
            .await
            .ok()
            .flatten()
            .and_then(|v| v.parse().ok())
            .unwrap_or(15);

        if interval_mins == 0 {
            // 0 = desativado pelo administrador
            continue;
        }

        let elapsed = last_run.elapsed();
        if !is_first_run && elapsed < Duration::from_secs(interval_mins * 60) {
            continue;
        }

        is_first_run = false;
        last_run = std::time::Instant::now();

        if SYNC_IN_PROGRESS.load(Ordering::SeqCst) {
            eprintln!("[Stock Auto-Audit] Sync ERP geral em andamento — pulando ciclo leve de estoque.");
            continue;
        }

        let pool = state.db.pool();
        match crate::core::legacy_db::verify_and_repair_all_stocks(pool, None).await {
            Ok(res) => {
                if res.repaired > 0 {
                    println!(
                        "[Stock Auto-Audit] {} item(ns) corrigidos para bater com o ERP (I={} M={} P={}) de {} verificados.",
                        res.repaired,
                        res.by_source.insumos,
                        res.by_source.materiais,
                        res.by_source.produtos,
                        res.checked
                    );
                    let body = format!(
                        "{} item(ns) de estoque foram atualizados automaticamente com o ERP.",
                        res.repaired
                    );
                    crate::modules::geral::notifications::notify_config(
                        &state,
                        "info",
                        "Estoque sincronizado (Auto-Auditor)",
                        &body,
                        None,
                    );
                    crate::modules::geral::notifications::notify(
                        &state,
                        crate::modules::geral::auth::modules_registry::MODULE_COMPRAS_MP,
                        "info",
                        "Estoque sincronizado (Auto-Auditor)",
                        &body,
                        None,
                    );
                } else {
                    println!(
                        "[Stock Auto-Audit] Verificação de estoque OK: {} itens conferidos sem divergências.",
                        res.checked
                    );
                }
            }
            Err(e) => {
                eprintln!("[Stock Auto-Audit] Verificação leve de estoque ignorada (ERP inacessível ou erro): {}", e);
            }
        }
    }
}


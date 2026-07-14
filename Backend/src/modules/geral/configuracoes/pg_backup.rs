//! Backup agendado do PostgreSQL (pg_dump) em pasta local.
//! Retenção por faixa: horário, diário, semanal, mensal.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use chrono::{Datelike, Local, Timelike};
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tokio::time::{interval, Duration};

use crate::core::app_config::saves_dir;
use crate::core::pg_db;
use crate::handlers::AppState;

const SETTING_KEY: &str = "pg_backup_config";
const LAST_SLOT_PREFIX: &str = "pg_backup_last_";

static BACKUP_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PgBackupConfig {
    /// Agenda automática ligada.
    pub ativo: bool,
    /// Pasta raiz local (vazia = Saves/pg-backups).
    pub pasta: String,
    /// Quantidade de dumps horário a manter (0 = desliga faixa).
    pub keep_hourly: u32,
    pub keep_daily: u32,
    pub keep_weekly: u32,
    pub keep_monthly: u32,
    /// Horário do backup diário/semanal/mensal (HH:MM). Horário roda a cada :00.
    #[serde(default = "default_daily_time")]
    pub daily_time: String,
}

fn default_daily_time() -> String {
    "02:00".into()
}

impl Default for PgBackupConfig {
    fn default() -> Self {
        Self {
            ativo: false,
            pasta: String::new(),
            keep_hourly: 24,
            keep_daily: 7,
            keep_weekly: 4,
            keep_monthly: 6,
            daily_time: default_daily_time(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BackupTier {
    Hourly,
    Daily,
    Weekly,
    Monthly,
}

impl BackupTier {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Hourly => "hourly",
            Self::Daily => "daily",
            Self::Weekly => "weekly",
            Self::Monthly => "monthly",
        }
    }

    fn keep(self, cfg: &PgBackupConfig) -> u32 {
        match self {
            Self::Hourly => cfg.keep_hourly,
            Self::Daily => cfg.keep_daily,
            Self::Weekly => cfg.keep_weekly,
            Self::Monthly => cfg.keep_monthly,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PgBackupStatus {
    pub config: PgBackupConfig,
    pub pasta_efetiva: String,
    pub ultima_execucao: Option<String>,
    pub ultimo_erro: Option<String>,
    pub contagens: PgBackupCounts,
    pub pg_dump_encontrado: bool,
    pub pg_dump_path: Option<String>,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PgBackupCounts {
    pub hourly: usize,
    pub daily: usize,
    pub weekly: usize,
    pub monthly: usize,
}

pub fn resolve_backup_root(cfg: &PgBackupConfig) -> PathBuf {
    let raw = cfg.pasta.trim();
    if raw.is_empty() {
        return saves_dir().join("pg-backups");
    }
    let p = PathBuf::from(raw);
    if p.is_absolute() {
        p
    } else {
        saves_dir().join(p)
    }
}

pub fn normalize_config(mut cfg: PgBackupConfig) -> PgBackupConfig {
    if let Some(t) = crate::modules::geral::configuracoes::erp_sync_scheduler::normalize_time(
        &cfg.daily_time,
    ) {
        cfg.daily_time = t;
    } else {
        cfg.daily_time = default_daily_time();
    }
    cfg.keep_hourly = cfg.keep_hourly.min(168);
    cfg.keep_daily = cfg.keep_daily.min(90);
    cfg.keep_weekly = cfg.keep_weekly.min(52);
    cfg.keep_monthly = cfg.keep_monthly.min(36);
    cfg
}

pub async fn load_config(state: &AppState) -> Result<PgBackupConfig, String> {
    let raw = state
        .db
        .get_setting(SETTING_KEY)
        .await?
        .unwrap_or_default();
    if raw.trim().is_empty() {
        return Ok(PgBackupConfig::default());
    }
    let cfg: PgBackupConfig =
        serde_json::from_str(&raw).map_err(|e| format!("Config de backup inválida: {e}"))?;
    Ok(normalize_config(cfg))
}

pub async fn save_config(state: &AppState, cfg: PgBackupConfig) -> Result<PgBackupConfig, String> {
    let cfg = normalize_config(cfg);
    let json = serde_json::to_string(&cfg).map_err(|e| e.to_string())?;
    state.db.save_setting(SETTING_KEY, &json).await?;
    let root = resolve_backup_root(&cfg);
    fs::create_dir_all(&root).map_err(|e| format!("Não foi possível criar pasta de backup: {e}"))?;
    for tier in [
        BackupTier::Hourly,
        BackupTier::Daily,
        BackupTier::Weekly,
        BackupTier::Monthly,
    ] {
        fs::create_dir_all(root.join(tier.as_str())).map_err(|e| e.to_string())?;
    }
    Ok(cfg)
}

pub fn find_pg_dump() -> Option<PathBuf> {
    // PATH (Windows / Unix)
    if let Ok(path_env) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_env) {
            let candidate = if cfg!(windows) {
                dir.join("pg_dump.exe")
            } else {
                dir.join("pg_dump")
            };
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    #[cfg(windows)]
    {
        for ver in ["18", "17", "16", "15"] {
            let candidate = PathBuf::from(format!(
                r"C:\Program Files\PostgreSQL\{ver}\bin\pg_dump.exe"
            ));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    #[cfg(not(windows))]
    {
        for candidate in [
            "/usr/bin/pg_dump",
            "/usr/local/bin/pg_dump",
            "/opt/homebrew/bin/pg_dump",
        ] {
            let p = PathBuf::from(candidate);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

fn count_dumps(dir: &Path) -> usize {
    let Ok(rd) = fs::read_dir(dir) else {
        return 0;
    };
    rd.filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| x.eq_ignore_ascii_case("dump") || x.eq_ignore_ascii_case("sql"))
                .unwrap_or(false)
        })
        .count()
}

pub fn backup_counts(cfg: &PgBackupConfig) -> PgBackupCounts {
    let root = resolve_backup_root(cfg);
    PgBackupCounts {
        hourly: count_dumps(&root.join("hourly")),
        daily: count_dumps(&root.join("daily")),
        weekly: count_dumps(&root.join("weekly")),
        monthly: count_dumps(&root.join("monthly")),
    }
}

fn prune_tier(dir: &Path, keep: u32) -> Result<(), String> {
    if keep == 0 {
        return Ok(());
    }
    let Ok(rd) = fs::read_dir(dir) else {
        return Ok(());
    };
    let mut files: Vec<_> = rd
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| x.eq_ignore_ascii_case("dump"))
                .unwrap_or(false)
        })
        .collect();
    files.sort_by_key(|e| {
        std::cmp::Reverse(
            e.metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH),
        )
    });
    for extra in files.into_iter().skip(keep as usize) {
        let _ = fs::remove_file(extra.path());
    }
    Ok(())
}

/// Executa `pg_dump -Fc` para a faixa indicada e aplica retenção.
pub async fn run_backup_tier(state: &AppState, tier: BackupTier) -> Result<PathBuf, String> {
    let cfg = load_config(state).await?;
    let keep = tier.keep(&cfg);
    if keep == 0 && !matches!(tier, BackupTier::Hourly) {
        // Manual pode forçar mesmo com keep=0? Scheduler skips keep=0.
        // Allow manual dump into the folder anyway if keep==0 for "one-shot" - still prune to 0 = delete all after? Better require keep>0 for auto; manual always creates and prune with max(keep,1) if keep==0 keep all for that run without prune.
    }

    let pg_dump = find_pg_dump().ok_or_else(|| {
        "pg_dump não encontrado. Instale o PostgreSQL client tools ou adicione ao PATH."
            .to_string()
    })?;

    let url = pg_db::database_url()?;
    let root = resolve_backup_root(&cfg);
    let tier_dir = root.join(tier.as_str());
    fs::create_dir_all(&tier_dir).map_err(|e| e.to_string())?;

    let stamp = Local::now().format("%Y%m%d_%H%M%S");
    let out = tier_dir.join(format!("natumhub_{}_{}.dump", tier.as_str(), stamp));

    let mut cmd = Command::new(&pg_dump);
    cmd.arg("--format=custom")
        .arg("--no-owner")
        .arg("--no-acl")
        .arg("--file")
        .arg(&out)
        .arg(&url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Falha ao executar pg_dump: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let _ = fs::remove_file(&out);
        return Err(format!("pg_dump falhou: {}", stderr.trim()));
    }

    let prune_keep = if keep == 0 { 1 } else { keep };
    prune_tier(&tier_dir, prune_keep)?;

    let stamp_human = Local::now().format("%d/%m/%Y %H:%M:%S").to_string();
    let _ = state
        .db
        .save_setting("pg_backup_last_run", &stamp_human)
        .await;
    let _ = state.db.save_setting("pg_backup_last_error", "").await;

    Ok(out)
}

async fn mark_slot(state: &AppState, tier: BackupTier, slot: &str) {
    let key = format!("{}{}", LAST_SLOT_PREFIX, tier.as_str());
    let _ = state.db.save_setting(&key, slot).await;
}

async fn last_slot(state: &AppState, tier: BackupTier) -> Option<String> {
    let key = format!("{}{}", LAST_SLOT_PREFIX, tier.as_str());
    state.db.get_setting(&key).await.ok().flatten()
}

fn should_run_now(cfg: &PgBackupConfig, tier: BackupTier, now: chrono::DateTime<Local>) -> Option<String> {
    if tier.keep(cfg) == 0 {
        return None;
    }
    let daily = chrono::NaiveTime::parse_from_str(&cfg.daily_time, "%H:%M").ok()?;
    match tier {
        BackupTier::Hourly => {
            if now.minute() == 0 {
                Some(format!("{}-{:02}", now.format("%Y-%m-%d"), now.hour()))
            } else {
                None
            }
        }
        BackupTier::Daily => {
            if now.time().hour() == daily.hour() && now.time().minute() == daily.minute() {
                Some(now.format("%Y-%m-%d").to_string())
            } else {
                None
            }
        }
        BackupTier::Weekly => {
            // Domingo = weekday 7 in chrono Monday=1..Sun=7 with .weekday().number_from_monday()
            if now.weekday().number_from_monday() == 7
                && now.time().hour() == daily.hour()
                && now.time().minute() == daily.minute()
            {
                Some(format!("{}-W{:02}", now.format("%Y"), now.iso_week().week()))
            } else {
                None
            }
        }
        BackupTier::Monthly => {
            if now.day() == 1
                && now.time().hour() == daily.hour()
                && now.time().minute() == daily.minute()
            {
                Some(now.format("%Y-%m").to_string())
            } else {
                None
            }
        }
    }
}

pub async fn build_status(state: &AppState) -> Result<PgBackupStatus, String> {
    let config = load_config(state).await?;
    let pasta_efetiva = resolve_backup_root(&config).display().to_string();
    let ultima_execucao = state.db.get_setting("pg_backup_last_run").await?.filter(|s| !s.is_empty());
    let ultimo_erro = state
        .db
        .get_setting("pg_backup_last_error")
        .await?
        .filter(|s| !s.is_empty());
    let dump = find_pg_dump();
    Ok(PgBackupStatus {
        config: config.clone(),
        pasta_efetiva,
        ultima_execucao,
        ultimo_erro,
        contagens: backup_counts(&config),
        pg_dump_encontrado: dump.is_some(),
        pg_dump_path: dump.map(|p| p.display().to_string()),
    })
}

pub async fn start_pg_backup_scheduler(state: Arc<AppState>) {
    let mut ticker = interval(Duration::from_secs(30));
    ticker.tick().await;

    loop {
        ticker.tick().await;

        let cfg = match load_config(&state).await {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[PG Backup] Erro ao ler config: {e}");
                continue;
            }
        };
        if !cfg.ativo {
            continue;
        }

        let now = Local::now();
        for tier in [
            BackupTier::Hourly,
            BackupTier::Daily,
            BackupTier::Weekly,
            BackupTier::Monthly,
        ] {
            let Some(slot) = should_run_now(&cfg, tier, now) else {
                continue;
            };
            if last_slot(&state, tier).await.as_deref() == Some(slot.as_str()) {
                continue;
            }
            if BACKUP_IN_PROGRESS
                .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                .is_err()
            {
                eprintln!("[PG Backup] Já em andamento — pulando {}", tier.as_str());
                continue;
            }

            println!("[PG Backup] Iniciando backup {} (slot {slot})", tier.as_str());
            let result = run_backup_tier(&state, tier).await;
            BACKUP_IN_PROGRESS.store(false, Ordering::SeqCst);

            match result {
                Ok(path) => {
                    mark_slot(&state, tier, &slot).await;
                    println!(
                        "[PG Backup] OK {} → {}",
                        tier.as_str(),
                        path.display()
                    );
                }
                Err(e) => {
                    eprintln!("[PG Backup] Falha {}: {e}", tier.as_str());
                    let _ = state.db.save_setting("pg_backup_last_error", &e).await;
                }
            }
        }
    }
}

pub async fn run_manual(state: &AppState, tier: BackupTier) -> Result<PathBuf, String> {
    if BACKUP_IN_PROGRESS
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Já existe um backup em andamento.".into());
    }
    let result = run_backup_tier(state, tier).await;
    BACKUP_IN_PROGRESS.store(false, Ordering::SeqCst);
    match &result {
        Ok(_) => {}
        Err(e) => {
            let _ = state.db.save_setting("pg_backup_last_error", e).await;
        }
    }
    result
}

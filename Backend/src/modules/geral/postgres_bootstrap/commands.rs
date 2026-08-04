//! Bootstrap de PostgreSQL portável para builds Dev (sem instalador EDB/UI).

use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use crate::core::app_config::{is_developer_identifier, read_tauri_identifier, saves_dir};

/// Porta dedicada do Postgres embutido (evita conflito com serviço 5432 do sistema).
pub const EMBEDDED_PG_PORT: u16 = 5433;

/// Zip EDB Windows x64 (binários sem wizard). ~316 MB.
const PG_BINARIES_URL: &str =
    "https://get.enterprisedb.com/postgresql/postgresql-17.4-1-windows-x64-binaries.zip";

const SCHEMA_FILES: &[(&str, &str)] = &[
    (
        "001_natumhub_schema.sql",
        include_str!("../../../../supabase/001_natumhub_schema.sql"),
    ),
    (
        "002_almoxarifado.sql",
        include_str!("../../../../supabase/002_almoxarifado.sql"),
    ),
    (
        "003_estoque_ops.sql",
        include_str!("../../../../supabase/003_estoque_ops.sql"),
    ),
    (
        "004_almox_erp_super.sql",
        include_str!("../../../../supabase/004_almox_erp_super.sql"),
    ),
    (
        "005_kit_composicao.sql",
        include_str!("../../../../supabase/005_kit_composicao.sql"),
    ),
    (
        "006_kit_composicao_item_fk.sql",
        include_str!("../../../../supabase/006_kit_composicao_item_fk.sql"),
    ),
    (
        "007_extend_invoices.sql",
        include_str!("../../../../supabase/007_extend_invoices.sql"),
    ),
    (
        "008_add_freight_details.sql",
        include_str!("../../../../supabase/008_add_freight_details.sql"),
    ),
    (
        "009_insumo_stock_divergencias.sql",
        include_str!("../../../../supabase/009_insumo_stock_divergencias.sql"),
    ),
    (
        "010_produto_stock_contagens.sql",
        include_str!("../../../../supabase/010_produto_stock_contagens.sql"),
    ),
    (
        "011_ecommerce_orders.sql",
        include_str!("../../../../supabase/011_ecommerce_orders.sql"),
    ),
    (
        "012_extend_fte_details.sql",
        include_str!("../../../../supabase/012_extend_fte_details.sql"),
    ),
    (
        "013_almox_movement_sector.sql",
        include_str!("../../../../supabase/013_almox_movement_sector.sql"),
    ),
    (
        "014_ecommerce_lookups.sql",
        include_str!("../../../../supabase/014_ecommerce_lookups.sql"),
    ),
    (
        "015_reembalagem_packaging.sql",
        include_str!("../../../../supabase/015_reembalagem_packaging.sql"),
    ),
    (
        "016_qualidade_documentacao.sql",
        include_str!("../../../../supabase/016_qualidade_documentacao.sql"),
    ),
    (
        "017_hub_audit_events.sql",
        include_str!("../../../../supabase/017_hub_audit_events.sql"),
    ),
    (
        "018_mapa_hub.sql",
        include_str!("../../../../supabase/018_mapa_hub.sql"),
    ),
    (
        "019_hub_operator_profiles.sql",
        include_str!("../../../../supabase/019_hub_operator_profiles.sql"),
    ),
    (
        "020_produtos_codigo_barras.sql",
        include_str!("../../../../supabase/020_produtos_codigo_barras.sql"),
    ),
    (
        "021_manual_stock_orders.sql",
        include_str!("../../../../supabase/021_manual_stock_orders.sql"),
    ),
    (
        "022_manual_stock_record_types.sql",
        include_str!("../../../../supabase/022_manual_stock_record_types.sql"),
    ),
    (
        "023_qualidade_pops.sql",
        include_str!("../../../../supabase/023_qualidade_pops.sql"),
    ),
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPostgresResult {
    pub ok: bool,
    pub message: String,
    pub database_url: Option<String>,
    pub postgres_env_path: String,
    pub pg_home: String,
    pub port: u16,
    pub steps: Vec<String>,
}

fn app_data_root() -> PathBuf {
    saves_dir()
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(saves_dir)
}

pub fn pgsql_home() -> PathBuf {
    app_data_root().join("pgsql")
}

pub fn pgsql_data() -> PathBuf {
    app_data_root().join("pgsql-data")
}

fn ensure_dev_build() -> Result<(), String> {
    let id = read_tauri_identifier();
    if id.contains(".dev") || is_developer_identifier(&id) || cfg!(debug_assertions) {
        return Ok(());
    }
    Err(
        "Instalar Postgres embutido só está disponível no NatumHub Dev (ou tauri dev)."
            .into(),
    )
}

fn url_encode_password(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len() * 3);
    for b in raw.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn generate_password() -> String {
    format!(
        "Nh{}{}",
        chrono::Local::now().format("%Y%m%d"),
        &uuid::Uuid::new_v4().to_string().replace('-', "")[..12]
    )
}

fn find_bin(home: &Path, name: &str) -> Result<PathBuf, String> {
    let candidates = [
        home.join("bin").join(name),
        home.join("pgsql").join("bin").join(name),
    ];
    for p in &candidates {
        if p.exists() {
            return Ok(p.clone());
        }
    }
    if let Ok(rd) = fs::read_dir(home) {
        for entry in rd.flatten() {
            let p = entry.path().join("bin").join(name);
            if p.exists() {
                return Ok(p);
            }
        }
    }
    Err(format!(
        "Não encontrado {name} em {}. Extração incompleta?",
        home.display()
    ))
}

fn run_cmd(bin: &Path, args: &[&str], env: &[(&str, &str)]) -> Result<String, String> {
    let mut cmd = Command::new(bin);
    cmd.args(args);
    for (k, v) in env {
        cmd.env(k, v);
    }
    let out = cmd
        .output()
        .map_err(|e| format!("Falha ao executar {}: {e}", bin.display()))?;
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    if !out.status.success() {
        return Err(format!(
            "{} {:?}\nstdout: {stdout}\nstderr: {stderr}",
            bin.display(),
            args
        ));
    }
    Ok(if stdout.trim().is_empty() {
        stderr
    } else {
        stdout
    })
}

fn write_postgres_env(url: &str) -> Result<PathBuf, String> {
    let path = crate::core::pg_db::postgres_env_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let body = format!("# Gerado pelo NatumHub Dev — bootstrap local\nDATABASE_URL={url}\n");
    fs::write(&path, body).map_err(|e| e.to_string())?;
    Ok(path)
}

fn download_binaries(zip_path: &Path, steps: &mut Vec<String>) -> Result<(), String> {
    if zip_path.exists() && zip_path.metadata().map(|m| m.len() > 1_000_000).unwrap_or(false) {
        steps.push("Zip já presente — reutilizando download.".into());
        return Ok(());
    }
    steps.push(format!("Baixando PostgreSQL 17 (binários ~316 MB)…"));
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(900))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(PG_BINARIES_URL)
        .send()
        .map_err(|e| format!("Download falhou: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {} no download do Postgres", resp.status()));
    }
    if let Some(parent) = zip_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = resp
        .bytes()
        .map_err(|e| format!("Erro lendo download: {e}"))?;
    let mut file = fs::File::create(zip_path).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    steps.push(format!(
        "Download ok ({:.0} MB).",
        bytes.len() as f64 / 1_000_000.0
    ));
    Ok(())
}

fn extract_zip(zip_path: &Path, dest: &Path, steps: &mut Vec<String>) -> Result<(), String> {
    if find_bin(dest, "initdb.exe").is_ok() {
        steps.push("Binários já extraídos.".into());
        return Ok(());
    }
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    steps.push("Extraindo zip (pode demorar)…".into());

    let dest_s = dest.display().to_string().replace('\'', "''");
    let zip_s = zip_path.display().to_string().replace('\'', "''");
    let ps = format!("Expand-Archive -LiteralPath '{zip_s}' -DestinationPath '{dest_s}' -Force");
    let out = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps])
        .output()
        .map_err(|e| format!("Expand-Archive: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "Extração falhou: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    find_bin(dest, "initdb.exe").map(|_| ())?;
    steps.push("Extração concluída.".into());
    Ok(())
}

fn pg_ctl_status(pg_ctl: &Path, data: &Path) -> bool {
    run_cmd(
        pg_ctl,
        &["status", "-D", &data.display().to_string()],
        &[],
    )
    .is_ok()
}

fn ensure_cluster(
    home: &Path,
    data: &Path,
    super_pass: &str,
    steps: &mut Vec<String>,
) -> Result<(), String> {
    let initdb = find_bin(home, "initdb.exe")?;
    if data.join("PG_VERSION").exists() {
        steps.push("Cluster já inicializado.".into());
        return Ok(());
    }
    fs::create_dir_all(data).map_err(|e| e.to_string())?;
    let pwfile = app_data_root().join("pg_super_pw.txt");
    fs::write(&pwfile, super_pass).map_err(|e| e.to_string())?;
    steps.push("initdb…".into());
    let r = run_cmd(
        &initdb,
        &[
            "-D",
            &data.display().to_string(),
            "-U",
            "postgres",
            "-A",
            "scram-sha-256",
            "--pwfile",
            &pwfile.display().to_string(),
            "-E",
            "UTF8",
            "--locale=C",
        ],
        &[],
    );
    let _ = fs::remove_file(&pwfile);
    r?;

    let conf = data.join("postgresql.conf");
    if conf.exists() {
        let mut t = fs::read_to_string(&conf).unwrap_or_default();
        t.push_str(&format!(
            "\nlisten_addresses = '127.0.0.1'\nport = {EMBEDDED_PG_PORT}\n"
        ));
        let _ = fs::write(&conf, t);
    }
    let hba = data.join("pg_hba.conf");
    if hba.exists() {
        let t = "\
# NatumHub Dev — só local
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
";
        let _ = fs::write(&hba, t);
    }
    steps.push("Cluster criado.".into());
    Ok(())
}

fn start_server(home: &Path, data: &Path, steps: &mut Vec<String>) -> Result<(), String> {
    let pg_ctl = find_bin(home, "pg_ctl.exe")?;
    if pg_ctl_status(&pg_ctl, data) {
        steps.push("Postgres já em execução.".into());
        return Ok(());
    }
    steps.push(format!("Iniciando Postgres na porta {EMBEDDED_PG_PORT}…"));
    let log = app_data_root().join("pgsql.log");
    run_cmd(
        &pg_ctl,
        &[
            "start",
            "-D",
            &data.display().to_string(),
            "-l",
            &log.display().to_string(),
            "-o",
            &format!("-p {EMBEDDED_PG_PORT}"),
            "-w",
        ],
        &[],
    )?;
    std::thread::sleep(Duration::from_secs(2));
    if !pg_ctl_status(&pg_ctl, data) {
        let log_txt = fs::read_to_string(&log).unwrap_or_default();
        let tail: String = log_txt.chars().rev().take(2500).collect::<String>().chars().rev().collect();
        return Err(format!("Postgres não subiu. Log {}:\n{tail}", log.display()));
    }
    steps.push("Postgres no ar.".into());
    Ok(())
}

fn create_app_db(
    home: &Path,
    super_pass: &str,
    app_pass: &str,
    steps: &mut Vec<String>,
) -> Result<(), String> {
    let psql = find_bin(home, "psql.exe")?;
    let port = EMBEDDED_PG_PORT.to_string();
    let env = [("PGPASSWORD", super_pass)];
    steps.push("Criando role natum + database natumhub…".into());

    // Escape single quotes in password for SQL literal
    let pass_sql = app_pass.replace('\'', "''");
    run_cmd(
        &psql,
        &[
            "-h", "127.0.0.1", "-p", &port, "-U", "postgres", "-d", "postgres",
            "-v", "ON_ERROR_STOP=1",
            "-c",
            &format!(
                "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'natum') THEN CREATE ROLE natum LOGIN PASSWORD '{pass_sql}'; ELSE ALTER ROLE natum WITH LOGIN PASSWORD '{pass_sql}'; END IF; END $$;"
            ),
        ],
        &env,
    )?;

    let exists = run_cmd(
        &psql,
        &[
            "-h", "127.0.0.1", "-p", &port, "-U", "postgres", "-d", "postgres",
            "-tAc", "SELECT 1 FROM pg_database WHERE datname = 'natumhub'",
        ],
        &env,
    )?;
    if exists.trim() != "1" {
        run_cmd(
            &psql,
            &[
                "-h", "127.0.0.1", "-p", &port, "-U", "postgres", "-d", "postgres",
                "-v", "ON_ERROR_STOP=1",
                "-c", "CREATE DATABASE natumhub OWNER natum;",
            ],
            &env,
        )?;
    }
    run_cmd(
        &psql,
        &[
            "-h", "127.0.0.1", "-p", &port, "-U", "postgres", "-d", "natumhub",
            "-v", "ON_ERROR_STOP=1",
            "-c",
            "GRANT ALL ON SCHEMA public TO natum; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO natum; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO natum;",
        ],
        &env,
    )?;
    steps.push("Banco natumhub pronto.".into());
    Ok(())
}

fn apply_schema(home: &Path, app_pass: &str, steps: &mut Vec<String>) -> Result<(), String> {
    let psql = find_bin(home, "psql.exe")?;
    let port = EMBEDDED_PG_PORT.to_string();
    let env = [("PGPASSWORD", app_pass)];
    let sql_dir = app_data_root().join("schema");
    fs::create_dir_all(&sql_dir).map_err(|e| e.to_string())?;
    for (name, body) in SCHEMA_FILES {
        let path = sql_dir.join(name);
        fs::write(&path, body).map_err(|e| e.to_string())?;
        steps.push(format!("Aplicando {name}…"));
        match run_cmd(
            &psql,
            &[
                "-h", "127.0.0.1", "-p", &port, "-U", "natum", "-d", "natumhub",
                "-v", "ON_ERROR_STOP=1",
                "-f", &path.display().to_string(),
            ],
            &env,
        ) {
            Ok(_) => {}
            Err(e) if e.to_lowercase().contains("already exists") => {
                steps.push(format!("{name}: já aplicado (ok)."));
            }
            Err(e) => return Err(e),
        }
    }
    steps.push("Schema NatumHub aplicado.".into());
    Ok(())
}

/// Garante que o servidor portável está up (boot do master Dev).
pub fn ensure_embedded_running() -> Result<(), String> {
    let data = pgsql_data();
    if !data.join("PG_VERSION").exists() {
        return Ok(());
    }
    let home = pgsql_home();
    let pg_ctl = find_bin(&home, "pg_ctl.exe")?;
    if pg_ctl_status(&pg_ctl, &data) {
        return Ok(());
    }
    let log = app_data_root().join("pgsql.log");
    run_cmd(
        &pg_ctl,
        &[
            "start",
            "-D", &data.display().to_string(),
            "-l", &log.display().to_string(),
            "-o", &format!("-p {EMBEDDED_PG_PORT}"),
            "-w",
        ],
        &[],
    )?;
    Ok(())
}

fn load_or_create_secrets() -> (String, String) {
    let secrets = app_data_root().join("pgsql-secrets.json");
    if secrets.exists() {
        if let Ok(raw) = fs::read_to_string(&secrets) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
                let super_p = v
                    .get("super")
                    .and_then(|x| x.as_str())
                    .map(str::to_string)
                    .unwrap_or_else(generate_password);
                let natum_p = v
                    .get("natum")
                    .and_then(|x| x.as_str())
                    .map(str::to_string)
                    .unwrap_or_else(generate_password);
                return (super_p, natum_p);
            }
        }
    }
    let super_p = generate_password();
    let natum_p = generate_password();
    let _ = fs::write(
        &secrets,
        serde_json::json!({ "super": super_p, "natum": natum_p }).to_string(),
    );
    (super_p, natum_p)
}

/// Instala/configura Postgres local completo para Dev.
pub fn bootstrap_local_postgres() -> Result<BootstrapPostgresResult, String> {
    ensure_dev_build()?;
    if !cfg!(windows) {
        return Err("Disponível apenas no Windows.".into());
    }

    let mut steps = Vec::new();
    let home = pgsql_home();
    let data = pgsql_data();
    let _ = fs::create_dir_all(app_data_root());

    let zip = app_data_root().join("postgresql-binaries.zip");
    download_binaries(&zip, &mut steps)?;
    extract_zip(&zip, &home, &mut steps)?;

    let (super_pass, app_pass) = load_or_create_secrets();
    ensure_cluster(&home, &data, &super_pass, &mut steps)?;
    start_server(&home, &data, &mut steps)?;
    create_app_db(&home, &super_pass, &app_pass, &mut steps)?;
    apply_schema(&home, &app_pass, &mut steps)?;

    let url = format!(
        "postgresql://natum:{}@127.0.0.1:{EMBEDDED_PG_PORT}/natumhub",
        url_encode_password(&app_pass)
    );
    let env_path = write_postgres_env(&url)?;
    steps.push(format!("Gravado {}", env_path.display()));

    Ok(BootstrapPostgresResult {
        ok: true,
        message:
            "PostgreSQL local pronto. Reinicie o NatumHub Dev se a API ainda estiver offline."
                .into(),
        database_url: Some(url),
        postgres_env_path: env_path.display().to_string(),
        pg_home: home.display().to_string(),
        port: EMBEDDED_PG_PORT,
        steps,
    })
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub fn hub_bootstrap_local_postgres() -> Result<BootstrapPostgresResult, String> {
    std::thread::Builder::new()
        .name("pg-bootstrap".into())
        .spawn(bootstrap_local_postgres)
        .map_err(|e| e.to_string())?
        .join()
        .map_err(|_| "Thread de bootstrap panicou.".to_string())?
}

/// Executa os arquivos SQL de migração definidos em SCHEMA_FILES no banco de dados ativo.
/// Lock de sessão para serializar migrações (startup Axum + sync ERP em paralelo).
const SCHEMA_MIGRATION_LOCK_KEY: i64 = 0x4E41_7475_6D48; // "NAtumH"

fn is_benign_migration_error(err_msg: &str) -> bool {
    let m = err_msg.to_lowercase();
    m.contains("already exists")
        || m.contains("duplicate column")
        || m.contains("already member of")
        // Corrida CREATE TABLE IF NOT EXISTS: colisão no tipo composto da tabela
        || m.contains("pg_type_typname_nsp_index")
        || m.contains("pg_class_relname_nsp_index")
}

pub async fn run_schema_migrations(pool: &sqlx::PgPool) -> Result<(), String> {
    use sqlx::Executor;

    sqlx::query("SELECT pg_advisory_lock($1)")
        .bind(SCHEMA_MIGRATION_LOCK_KEY)
        .execute(pool)
        .await
        .map_err(|e| format!("Erro ao obter lock de migração: {e}"))?;

    let result = async {
        for (name, body) in SCHEMA_FILES {
            match pool.execute(*body).await {
                Ok(_) => {
                    println!("[Database Migration] Aplicado {} com sucesso.", name);
                }
                Err(e) => {
                    let err_msg = e.to_string();
                    if is_benign_migration_error(&err_msg) {
                        // Objeto já existe / corrida inócua entre processos
                    } else {
                        eprintln!("[Database Migration] Erro ao aplicar {}: {}", name, e);
                        return Err(format!("Erro ao aplicar migração {}: {}", name, e));
                    }
                }
            }
        }
        Ok(())
    }
    .await;

    let _ = sqlx::query("SELECT pg_advisory_unlock($1)")
        .bind(SCHEMA_MIGRATION_LOCK_KEY)
        .execute(pool)
        .await;

    result
}

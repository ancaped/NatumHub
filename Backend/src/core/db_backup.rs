use chrono::Local;
use std::fs;
use std::path::{Path, PathBuf};

/// Cria cópia de segurança do SQLite antes de operações destrutivas (sync ERP).
pub fn backup_database(db_path: &str) -> Result<PathBuf, String> {
    let source = Path::new(db_path);
    if !source.exists() {
        return Err(format!("Banco não encontrado: {}", db_path));
    }

    let backup_dir = source
        .parent()
        .map(|p| p.join("backups"))
        .unwrap_or_else(|| PathBuf::from("backups"));

    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    let stamp = Local::now().format("%Y%m%d_%H%M%S");
    let backup_path = backup_dir.join(format!("data_{}.db", stamp));

    fs::copy(source, &backup_path).map_err(|e| e.to_string())?;

    prune_old_backups(&backup_dir, 10)?;

    Ok(backup_path)
}

fn prune_old_backups(dir: &Path, keep: usize) -> Result<(), String> {
    let mut entries: Vec<_> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext == "db")
                .unwrap_or(false)
        })
        .collect();

    entries.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());

    if entries.len() <= keep {
        return Ok(());
    }

    let remove_count = entries.len() - keep;
    for entry in entries.into_iter().take(remove_count) {
        let _ = fs::remove_file(entry.path());
    }

    Ok(())
}

/// Restaura backup mais recente se existir.
pub fn restore_latest_backup(db_path: &str) -> Result<PathBuf, String> {
    let source = Path::new(db_path);
    let backup_dir = source
        .parent()
        .map(|p| p.join("backups"))
        .ok_or_else(|| "Diretório de backups não encontrado".to_string())?;

    let mut entries: Vec<_> = fs::read_dir(&backup_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext == "db")
                .unwrap_or(false)
        })
        .collect();

    entries.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());

    let latest = entries
        .pop()
        .ok_or_else(|| "Nenhum backup disponível".to_string())?;

    fs::copy(latest.path(), source).map_err(|e| e.to_string())?;
    Ok(latest.path())
}

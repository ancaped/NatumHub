use chrono::Utc;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use super::models::{
    CreatePrintJobRequest, CreatePrinterRequest, HubPrintJob, HubPrinter, SystemPrinterInfo,
    UpdatePrinterRequest,
};

pub async fn ensure_tables(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::raw_sql(
        r#"
        CREATE TABLE IF NOT EXISTS hub_printers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            system_printer_name TEXT,
            printer_type TEXT NOT NULL DEFAULT 'thermal_label',
            connection_type TEXT NOT NULL DEFAULT 'local_spooler',
            ip_address TEXT,
            default_width_mm FLOAT8 NOT NULL DEFAULT 100.0,
            default_height_mm FLOAT8 NOT NULL DEFAULT 50.0,
            default_orientation TEXT NOT NULL DEFAULT 'landscape',
            dpi INT NOT NULL DEFAULT 203,
            location TEXT,
            status TEXT NOT NULL DEFAULT 'online',
            is_default BOOLEAN NOT NULL DEFAULT false,
            raw_protocol TEXT NOT NULL DEFAULT 'spooler_native',
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS hub_print_jobs (
            id TEXT PRIMARY KEY,
            printer_id TEXT NOT NULL,
            printer_name TEXT NOT NULL,
            operator_id TEXT,
            operator_name TEXT,
            title TEXT NOT NULL,
            template_id TEXT,
            payload_type TEXT NOT NULL DEFAULT 'label_canvas_json',
            payload_data TEXT NOT NULL,
            copies INT NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'pending',
            error_message TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            completed_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS idx_hub_print_jobs_created_at ON hub_print_jobs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_hub_print_jobs_status ON hub_print_jobs(status);
        "#,
    )
    .execute(pool)
    .await?;

    // Seed default thermal printer if table is completely empty
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM hub_printers")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    if count == 0 {
        let id = "printer_default_termica";
        let now = Utc::now();
        let _ = sqlx::query(
            r#"
            INSERT INTO hub_printers (
                id, name, system_printer_name, printer_type, connection_type,
                default_width_mm, default_height_mm, default_orientation, dpi,
                location, status, is_default, raw_protocol, notes, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15
            )
            "#,
        )
        .bind(id)
        .bind("Impressora Térmica Padrão (100x50mm)")
        .bind("Zebra / Elgin / Padrão")
        .bind("thermal_label")
        .bind("local_spooler")
        .bind(100.0)
        .bind(50.0)
        .bind("landscape")
        .bind(203)
        .bind("Almoxarifado & Estoque")
        .bind("online")
        .bind(true)
        .bind("spooler_native")
        .bind("Impressora padrão do Hub para etiquetas adesivas de matérias-primas e insumos.")
        .bind(now)
        .execute(pool)
        .await;
    }

    Ok(())
}

pub async fn list_printers(pool: &PgPool) -> Result<Vec<HubPrinter>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT
            id, name, system_printer_name, printer_type, connection_type, ip_address,
            default_width_mm, default_height_mm, default_orientation, dpi, location,
            status, is_default, raw_protocol, notes,
            created_at::TEXT, updated_at::TEXT
        FROM hub_printers
        ORDER BY is_default DESC, name ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut printers = Vec::new();
    for r in rows {
        printers.push(HubPrinter {
            id: r.get("id"),
            name: r.get("name"),
            system_printer_name: r.get("system_printer_name"),
            printer_type: r.get("printer_type"),
            connection_type: r.get("connection_type"),
            ip_address: r.get("ip_address"),
            default_width_mm: r.get("default_width_mm"),
            default_height_mm: r.get("default_height_mm"),
            default_orientation: r.get("default_orientation"),
            dpi: r.get("dpi"),
            location: r.get("location"),
            status: r.get("status"),
            is_default: r.get("is_default"),
            raw_protocol: r.get("raw_protocol"),
            notes: r.get("notes"),
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
        });
    }

    Ok(printers)
}

pub async fn get_printer(pool: &PgPool, id: &str) -> Result<Option<HubPrinter>, sqlx::Error> {
    let r = sqlx::query(
        r#"
        SELECT
            id, name, system_printer_name, printer_type, connection_type, ip_address,
            default_width_mm, default_height_mm, default_orientation, dpi, location,
            status, is_default, raw_protocol, notes,
            created_at::TEXT, updated_at::TEXT
        FROM hub_printers
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(r.map(|row| HubPrinter {
        id: row.get("id"),
        name: row.get("name"),
        system_printer_name: row.get("system_printer_name"),
        printer_type: row.get("printer_type"),
        connection_type: row.get("connection_type"),
        ip_address: row.get("ip_address"),
        default_width_mm: row.get("default_width_mm"),
        default_height_mm: row.get("default_height_mm"),
        default_orientation: row.get("default_orientation"),
        dpi: row.get("dpi"),
        location: row.get("location"),
        status: row.get("status"),
        is_default: row.get("is_default"),
        raw_protocol: row.get("raw_protocol"),
        notes: row.get("notes"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }))
}

pub async fn create_printer(
    pool: &PgPool,
    req: CreatePrinterRequest,
) -> Result<HubPrinter, sqlx::Error> {
    let id = format!("printer_{}", Uuid::new_v4().simple());
    let now = Utc::now();

    if req.is_default.unwrap_or(false) {
        let _ = sqlx::query("UPDATE hub_printers SET is_default = false").execute(pool).await;
    }

    sqlx::query(
        r#"
        INSERT INTO hub_printers (
            id, name, system_printer_name, printer_type, connection_type, ip_address,
            default_width_mm, default_height_mm, default_orientation, dpi, location,
            status, is_default, raw_protocol, notes, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16
        )
        "#,
    )
    .bind(&id)
    .bind(&req.name)
    .bind(req.system_printer_name.as_deref())
    .bind(req.printer_type.as_deref().unwrap_or("thermal_label"))
    .bind(req.connection_type.as_deref().unwrap_or("local_spooler"))
    .bind(req.ip_address.as_deref())
    .bind(req.default_width_mm.unwrap_or(100.0))
    .bind(req.default_height_mm.unwrap_or(50.0))
    .bind(req.default_orientation.as_deref().unwrap_or("landscape"))
    .bind(req.dpi.unwrap_or(203))
    .bind(req.location.as_deref())
    .bind("online")
    .bind(req.is_default.unwrap_or(false))
    .bind(req.raw_protocol.as_deref().unwrap_or("spooler_native"))
    .bind(req.notes.as_deref())
    .bind(now)
    .execute(pool)
    .await?;

    get_printer(pool, &id).await.and_then(|p| {
        p.ok_or_else(|| sqlx::Error::RowNotFound)
    })
}

pub async fn update_printer(
    pool: &PgPool,
    id: &str,
    req: UpdatePrinterRequest,
) -> Result<HubPrinter, sqlx::Error> {
    let now = Utc::now();

    if let Some(true) = req.is_default {
        let _ = sqlx::query("UPDATE hub_printers SET is_default = false WHERE id != $1")
            .bind(id)
            .execute(pool)
            .await;
    }

    let existing = get_printer(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;

    sqlx::query(
        r#"
        UPDATE hub_printers SET
            name = $2,
            system_printer_name = $3,
            printer_type = $4,
            connection_type = $5,
            ip_address = $6,
            default_width_mm = $7,
            default_height_mm = $8,
            default_orientation = $9,
            dpi = $10,
            location = $11,
            status = $12,
            is_default = $13,
            raw_protocol = $14,
            notes = $15,
            updated_at = $16
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(req.name.unwrap_or(existing.name))
    .bind(req.system_printer_name.or(existing.system_printer_name))
    .bind(req.printer_type.unwrap_or(existing.printer_type))
    .bind(req.connection_type.unwrap_or(existing.connection_type))
    .bind(req.ip_address.or(existing.ip_address))
    .bind(req.default_width_mm.unwrap_or(existing.default_width_mm))
    .bind(req.default_height_mm.unwrap_or(existing.default_height_mm))
    .bind(req.default_orientation.unwrap_or(existing.default_orientation))
    .bind(req.dpi.unwrap_or(existing.dpi))
    .bind(req.location.or(existing.location))
    .bind(req.status.unwrap_or(existing.status))
    .bind(req.is_default.unwrap_or(existing.is_default))
    .bind(req.raw_protocol.unwrap_or(existing.raw_protocol))
    .bind(req.notes.or(existing.notes))
    .bind(now)
    .execute(pool)
    .await?;

    get_printer(pool, id).await.and_then(|p| {
        p.ok_or_else(|| sqlx::Error::RowNotFound)
    })
}

pub async fn delete_printer(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let res = sqlx::query("DELETE FROM hub_printers WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(res.rows_affected() > 0)
}

/// Scan Windows spooler / WMI to find physically installed printers
pub fn scan_system_printers() -> Vec<SystemPrinterInfo> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        let ps_cmd = r#"
            Get-Printer | Select-Object Name, DriverName, PortName, @{Name='IsDefault'; Expression={$_.Default}}, @{Name='IsNetwork'; Expression={$_.Type -eq 'Connection' -or $_.PortName -match '\d+\.\d+\.\d+\.\d+'}}, @{Name='PrinterStatus'; Expression={$_.PrinterStatus}} | ConvertTo-Json -Compress
        "#;

        if let Ok(output) = Command::new("powershell")
            .args(["-NoProfile", "-Command", ps_cmd])
            .output()
        {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    // It can be a single JSON object or array of objects
                    if let Ok(list) = serde_json::from_str::<Vec<serde_json::Value>>(trimmed) {
                        return list
                            .into_iter()
                            .filter_map(|val| {
                                let name = val.get("Name")?.as_str()?.to_string();
                                Some(SystemPrinterInfo {
                                    name,
                                    driver_name: val.get("DriverName").and_then(|v| v.as_str()).map(|s| s.to_string()),
                                    port_name: val.get("PortName").and_then(|v| v.as_str()).map(|s| s.to_string()),
                                    is_default: val.get("IsDefault").and_then(|v| v.as_bool()).unwrap_or(false),
                                    is_network: val.get("IsNetwork").and_then(|v| v.as_bool()).unwrap_or(false),
                                    status: "online".to_string(),
                                })
                            })
                            .collect();
                    } else if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                        if let Some(name) = val.get("Name").and_then(|v| v.as_str()) {
                            return vec![SystemPrinterInfo {
                                name: name.to_string(),
                                driver_name: val.get("DriverName").and_then(|v| v.as_str()).map(|s| s.to_string()),
                                port_name: val.get("PortName").and_then(|v| v.as_str()).map(|s| s.to_string()),
                                is_default: val.get("IsDefault").and_then(|v| v.as_bool()).unwrap_or(false),
                                is_network: val.get("IsNetwork").and_then(|v| v.as_bool()).unwrap_or(false),
                                status: "online".to_string(),
                            }];
                        }
                    }
                }
            }
        }
    }

    // Fallback if PowerShell not available or non-windows:
    vec![
        SystemPrinterInfo {
            name: "Zebra ZD220 / ZD230 (ZPL)".to_string(),
            driver_name: Some("ZDesigner ZD220-203dpi ZPL".to_string()),
            port_name: Some("USB001".to_string()),
            is_default: false,
            is_network: false,
            status: "online".to_string(),
        },
        SystemPrinterInfo {
            name: "Elgin L42 Pro / L42PRO".to_string(),
            driver_name: Some("Elgin L42PRO".to_string()),
            port_name: Some("USB002".to_string()),
            is_default: false,
            is_network: false,
            status: "online".to_string(),
        },
        SystemPrinterInfo {
            name: "Argox OS-214 Plus (PPLA/PPLB)".to_string(),
            driver_name: Some("Argox OS-214 Plus series PPLB".to_string()),
            port_name: Some("USB003".to_string()),
            is_default: false,
            is_network: false,
            status: "online".to_string(),
        },
    ]
}

pub async fn list_print_jobs(pool: &PgPool, limit: i64) -> Result<Vec<HubPrintJob>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT
            id, printer_id, printer_name, operator_id, operator_name,
            title, template_id, payload_type, payload_data, copies,
            status, error_message, created_at::TEXT, completed_at::TEXT
        FROM hub_print_jobs
        ORDER BY created_at DESC
        LIMIT $1
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;

    let mut jobs = Vec::new();
    for r in rows {
        jobs.push(HubPrintJob {
            id: r.get("id"),
            printer_id: r.get("printer_id"),
            printer_name: r.get("printer_name"),
            operator_id: r.get("operator_id"),
            operator_name: r.get("operator_name"),
            title: r.get("title"),
            template_id: r.get("template_id"),
            payload_type: r.get("payload_type"),
            payload_data: r.get("payload_data"),
            copies: r.get("copies"),
            status: r.get("status"),
            error_message: r.get("error_message"),
            created_at: r.get("created_at"),
            completed_at: r.get("completed_at"),
        });
    }

    Ok(jobs)
}

pub async fn create_print_job(
    pool: &PgPool,
    operator_id: Option<String>,
    operator_name: Option<String>,
    req: CreatePrintJobRequest,
) -> Result<HubPrintJob, sqlx::Error> {
    let id = format!("job_{}", Uuid::new_v4().simple());
    let now = Utc::now();

    let printer_name = get_printer(pool, &req.printer_id)
        .await?
        .map(|p| p.name)
        .unwrap_or_else(|| "Impressora".to_string());

    sqlx::query(
        r#"
        INSERT INTO hub_print_jobs (
            id, printer_id, printer_name, operator_id, operator_name,
            title, template_id, payload_type, payload_data, copies,
            status, created_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11
        )
        "#,
    )
    .bind(&id)
    .bind(&req.printer_id)
    .bind(&printer_name)
    .bind(operator_id.as_deref())
    .bind(operator_name.as_deref())
    .bind(&req.title)
    .bind(req.template_id.as_deref())
    .bind(req.payload_type.as_deref().unwrap_or("label_canvas_json"))
    .bind(&req.payload_data)
    .bind(req.copies.unwrap_or(1))
    .bind(now)
    .execute(pool)
    .await?;

    let r = sqlx::query(
        r#"
        SELECT
            id, printer_id, printer_name, operator_id, operator_name,
            title, template_id, payload_type, payload_data, copies,
            status, error_message, created_at::TEXT, completed_at::TEXT
        FROM hub_print_jobs
        WHERE id = $1
        "#,
    )
    .bind(&id)
    .fetch_one(pool)
    .await?;

    Ok(HubPrintJob {
        id: r.get("id"),
        printer_id: r.get("printer_id"),
        printer_name: r.get("printer_name"),
        operator_id: r.get("operator_id"),
        operator_name: r.get("operator_name"),
        title: r.get("title"),
        template_id: r.get("template_id"),
        payload_type: r.get("payload_type"),
        payload_data: r.get("payload_data"),
        copies: r.get("copies"),
        status: r.get("status"),
        error_message: r.get("error_message"),
        created_at: r.get("created_at"),
        completed_at: r.get("completed_at"),
    })
}

pub async fn cancel_print_job(pool: &PgPool, job_id: &str) -> Result<bool, sqlx::Error> {
    let now = Utc::now();
    let res = sqlx::query(
        r#"
        UPDATE hub_print_jobs
        SET status = 'cancelled', completed_at = $2
        WHERE id = $1 AND status = 'pending'
        "#,
    )
    .bind(job_id)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(res.rows_affected() > 0)
}

use chrono::{Duration, Utc};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use super::models::*;

static ENSURED: tokio::sync::OnceCell<()> = tokio::sync::OnceCell::const_new();

/// Verifica tabelas almox_* + ops. DDL: `002_almoxarifado.sql` e `003_estoque_ops.sql`.
pub async fn ensure_tables(pool: &PgPool) -> Result<(), String> {
    ENSURED
        .get_or_try_init(|| async { ensure_tables_internal(pool).await })
        .await
        .map(|_| ())
}

async fn ensure_tables_internal(pool: &PgPool) -> Result<(), String> {
    let exists: bool = sqlx::query_scalar(
        r#"
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'almox_item_config'
        )
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    if !exists {
        return Err(
            "Tabelas do Almoxarifado ausentes. Execute Backend/supabase/002_almoxarifado.sql \
             e 003_estoque_ops.sql no Postgres (owner / SQL Editor) e reinicie a API."
                .into(),
        );
    }

    let ops: bool = sqlx::query_scalar(
        r#"
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'estoque_equipamentos'
        )
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    if !ops {
        return Err(
            "Tabelas de operações de estoque ausentes. Execute Backend/supabase/003_estoque_ops.sql \
             no Postgres (owner / SQL Editor) e reinicie a API."
                .into(),
        );
    }

    let erp_col: bool = sqlx::query_scalar(
        r#"
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'almox_item_config' AND column_name = 'erp_description'
        )
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    if !erp_col {
        return Err(
            "Colunas ERP/supermercado ausentes. Execute Backend/supabase/004_almox_erp_super.sql \
             no Postgres (owner / SQL Editor) e reinicie a API."
                .into(),
        );
    }

    // 013 — sector + sequência de código local (idempotente)
    let _ = sqlx::query("ALTER TABLE almox_movements ADD COLUMN IF NOT EXISTS sector TEXT")
        .execute(pool)
        .await;
    let _ = sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS almox_local_code_seq (
          id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          next_val INT NOT NULL DEFAULT 1
        )
        "#,
    )
    .execute(pool)
    .await;
    let _ = sqlx::query(
        "INSERT INTO almox_local_code_seq (id, next_val) VALUES (1, 1) ON CONFLICT (id) DO NOTHING",
    )
    .execute(pool)
    .await;

    let _ = sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS estoque_fotos (
          id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          photo_data TEXT NOT NULL,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
        )
        "#,
    )
    .execute(pool)
    .await;

    let _ = sqlx::query("ALTER TABLE estoque_manutencoes ADD COLUMN IF NOT EXISTS routine TEXT")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE estoque_equipamentos ADD COLUMN IF NOT EXISTS brand TEXT")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE estoque_equipamentos ADD COLUMN IF NOT EXISTS model TEXT")
        .execute(pool)
        .await;
    let _ = sqlx::query(
        "ALTER TABLE estoque_equipamentos ADD COLUMN IF NOT EXISTS manufacture_year INTEGER",
    )
    .execute(pool)
    .await;
    let _ = sqlx::query("ALTER TABLE estoque_equipamentos ADD COLUMN IF NOT EXISTS serial_number TEXT")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE estoque_manutencoes ADD COLUMN IF NOT EXISTS scheduled_at TEXT")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE estoque_equipamento_pecas ADD COLUMN IF NOT EXISTS installed_at TEXT")
        .execute(pool)
        .await;
    let _ = sqlx::query(
        "ALTER TABLE estoque_equipamento_pecas ADD COLUMN IF NOT EXISTS expected_lifespan_days INTEGER",
    )
    .execute(pool)
    .await;
    let _ = sqlx::query("ALTER TABLE estoque_equipamento_pecas ADD COLUMN IF NOT EXISTS notes TEXT")
        .execute(pool)
        .await;
    for stmt in [
        "ALTER TABLE almox_purchase_demands ADD COLUMN IF NOT EXISTS store_name TEXT",
        "ALTER TABLE almox_purchase_demands ADD COLUMN IF NOT EXISTS purchased_at TEXT",
        "ALTER TABLE almox_purchase_demands ADD COLUMN IF NOT EXISTS receipt_name TEXT",
        "ALTER TABLE almox_purchase_demands ADD COLUMN IF NOT EXISTS receipt_data TEXT",
        "ALTER TABLE almox_purchase_demands ADD COLUMN IF NOT EXISTS origin TEXT",
        "ALTER TABLE almox_purchase_demands ADD COLUMN IF NOT EXISTS qty DOUBLE PRECISION",
        "ALTER TABLE almox_purchase_demands ADD COLUMN IF NOT EXISTS requested_by TEXT",
        "ALTER TABLE almox_purchase_demands ADD COLUMN IF NOT EXISTS quoted_value DOUBLE PRECISION",
        "ALTER TABLE almox_purchase_demands ADD COLUMN IF NOT EXISTS purchase_value DOUBLE PRECISION",
        "ALTER TABLE almox_purchase_demand_items ADD COLUMN IF NOT EXISTS description TEXT",
        "ALTER TABLE almox_purchase_demand_items ALTER COLUMN item_code DROP NOT NULL",
        "ALTER TABLE estoque_equipamentos ADD COLUMN IF NOT EXISTS equip_type TEXT",
        "ALTER TABLE estoque_equipamentos ADD COLUMN IF NOT EXISTS location TEXT",
        "ALTER TABLE estoque_equipamentos ADD COLUMN IF NOT EXISTS supplier TEXT",
        "ALTER TABLE estoque_equipamentos ADD COLUMN IF NOT EXISTS acquired_at TEXT",
        "ALTER TABLE estoque_equipamentos ADD COLUMN IF NOT EXISTS purchase_value DOUBLE PRECISION",
        "ALTER TABLE estoque_manutencoes ADD COLUMN IF NOT EXISTS recurrence_days INTEGER",
        "ALTER TABLE almox_item_config ADD COLUMN IF NOT EXISTS default_pack_qty DOUBLE PRECISION",
        "ALTER TABLE almox_item_config ADD COLUMN IF NOT EXISTS default_pack_name TEXT",
        "ALTER TABLE almox_item_config ADD COLUMN IF NOT EXISTS last_pack_qty DOUBLE PRECISION",
        "ALTER TABLE almox_item_config ADD COLUMN IF NOT EXISTS last_pack_name TEXT",
        "ALTER TABLE almox_item_config ADD COLUMN IF NOT EXISTS photo_data TEXT",
        "ALTER TABLE almox_item_config ADD COLUMN IF NOT EXISTS photo_date TEXT",
        "ALTER TABLE almox_purchase_demands ADD COLUMN IF NOT EXISTS tracking_code TEXT",
        "ALTER TABLE almox_purchase_demands ADD COLUMN IF NOT EXISTS equipment_id TEXT",
        "ALTER TABLE almox_purchase_demands ADD COLUMN IF NOT EXISTS equipment_name TEXT",
        "ALTER TABLE almox_purchase_demands ADD COLUMN IF NOT EXISTS sector TEXT",
        "ALTER TABLE almox_purchase_demands ADD COLUMN IF NOT EXISTS quotes_json TEXT",
        "ALTER TABLE almox_purchase_demands ADD COLUMN IF NOT EXISTS maint_category TEXT",
        "ALTER TABLE almox_purchase_demands ADD COLUMN IF NOT EXISTS receipts_json TEXT",
        "ALTER TABLE estoque_manutencoes ALTER COLUMN equipment_id DROP NOT NULL",
        "ALTER TABLE estoque_manutencoes ADD COLUMN IF NOT EXISTS avulsa_tipo TEXT",
        "ALTER TABLE estoque_manutencoes ADD COLUMN IF NOT EXISTS store_name TEXT",
        "ALTER TABLE estoque_manutencoes ADD COLUMN IF NOT EXISTS demand_id TEXT",
        "CREATE INDEX IF NOT EXISTS idx_almox_purchase_demands_tracking ON almox_purchase_demands(tracking_code)",
        "CREATE INDEX IF NOT EXISTS idx_almox_purchase_demands_equipment ON almox_purchase_demands(equipment_id)",
        "ALTER TABLE almox_purchase_demands DROP CONSTRAINT IF EXISTS almox_purchase_demands_status_check",
    ] {
        let _ = sqlx::query(stmt).execute(pool).await;
    }
    let _ = sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS almox_stock_counts (
          id TEXT PRIMARY KEY,
          counted_at TEXT NOT NULL,
          created_by TEXT,
          saidas INTEGER NOT NULL DEFAULT 0,
          entradas INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await;

    let _ = sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS almox_familias (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          icon TEXT,
          color TEXT,
          sort_order INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
        )
        "#,
    )
    .execute(pool)
    .await;

    for (fid, flabel, ficon, fcolor, forder) in [
        ("supermercado", "Supermercado", "Store", "emerald", 1),
        ("escritorio", "Escritório", "Briefcase", "blue", 2),
        ("limpeza", "Limpeza", "Sparkles", "cyan", 3),
        ("pecas", "Peças & Manutenção", "Wrench", "amber", 4),
        ("outros", "Outros Consumíveis", "Layers", "zinc", 5),
    ] {
        let _ = sqlx::query(
            "INSERT INTO almox_familias (id, label, icon, color, sort_order) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING"
        )
        .bind(fid)
        .bind(flabel)
        .bind(ficon)
        .bind(fcolor)
        .bind(forder)
        .execute(pool)
        .await;
    }
    sqlx::query(
        r#"
        DO $$
        DECLARE r record;
        BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'estoque_manutencoes_kind_check'
              AND conrelid = 'estoque_manutencoes'::regclass
              AND pg_get_constraintdef(oid) ILIKE '%avulsa%'
          ) THEN
            RETURN;
          END IF;

          FOR r IN
            SELECT con.conname
            FROM pg_constraint con
            WHERE con.conrelid = 'estoque_manutencoes'::regclass
              AND con.contype = 'c'
              AND pg_get_constraintdef(con.oid) ILIKE '%kind%'
          LOOP
            EXECUTE format(
              'ALTER TABLE estoque_manutencoes DROP CONSTRAINT IF EXISTS %I',
              r.conname
            );
          END LOOP;

          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'estoque_manutencoes_kind_check'
              AND conrelid = 'estoque_manutencoes'::regclass
          ) THEN
            BEGIN
              ALTER TABLE estoque_manutencoes
                ADD CONSTRAINT estoque_manutencoes_kind_check
                CHECK (kind IN ('preventiva', 'corretiva', 'preditiva', 'inspecao', 'avulsa'));
            EXCEPTION
              WHEN duplicate_object THEN
                NULL;
            END;
          END IF;
        END $$
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS estoque_manutencao_pecas (
          id TEXT PRIMARY KEY,
          maintenance_id TEXT NOT NULL REFERENCES estoque_manutencoes(id) ON DELETE CASCADE,
          item_code TEXT NOT NULL REFERENCES items(code),
          quantity DOUBLE PRECISION NOT NULL DEFAULT 1,
          replaced BOOLEAN NOT NULL DEFAULT TRUE,
          unit_cost DOUBLE PRECISION,
          notes TEXT
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn normalize_section(s: &str) -> Result<String, String> {
    let v = s.trim().to_lowercase();
    if v.is_empty() {
        return Err("A família/seção do produto não pode ser vazia.".into());
    }
    Ok(v)
}

fn exchange_status(next: Option<&str>, expires: Option<&str>) -> Option<String> {
    let today = Utc::now().date_naive();
    let parse = |s: &str| {
        let t = s.trim();
        if t.len() >= 10 {
            chrono::NaiveDate::parse_from_str(&t[..10], "%Y-%m-%d").ok()
        } else {
            None
        }
    };
    let mut due: Option<chrono::NaiveDate> = None;
    if let Some(n) = next.and_then(parse) {
        due = Some(n);
    }
    if let Some(e) = expires.and_then(parse) {
        due = Some(match due {
            Some(d) if d < e => d,
            _ => e,
        });
    }
    let Some(d) = due else {
        return Some("none".into());
    };
    if d < today {
        Some("overdue".into())
    } else if d <= today + Duration::days(30) {
        Some("due_soon".into())
    } else {
        Some("ok".into())
    }
}

fn map_item_row(r: &sqlx::postgres::PgRow) -> AlmoxItemRow {
    let min_qty: f64 = r.try_get("min_qty").unwrap_or(0.0);
    let qty_on_hand: f64 = r.try_get("qty_on_hand").unwrap_or(0.0);
    let active: i32 = r.try_get("active").unwrap_or(0);
    let next_ex: Option<String> = r.try_get("next_exchange_at").ok();
    let expires: Option<String> = r.try_get("expires_at").ok();
    let erp_desc: Option<String> = r.try_get("erp_description").ok();
    let hub_desc: Option<String> = r.try_get("hub_description").ok();
    let items_desc: String = r.try_get("items_description").unwrap_or_default();
    let cfg_unit: Option<String> = r.try_get("cfg_unit").ok();
    let items_unit: String = r.try_get("items_unit").unwrap_or_default();
    let description = hub_desc
        .filter(|s| !s.trim().is_empty())
        .or_else(|| erp_desc.clone().filter(|s| !s.trim().is_empty()))
        .unwrap_or(items_desc);
    let unit = cfg_unit
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(items_unit);
    AlmoxItemRow {
        code: r.try_get("code").unwrap_or_default(),
        description,
        unit,
        category_id: r.try_get("category_id").ok(),
        active: active != 0,
        min_qty,
        ideal_qty: r.try_get("ideal_qty").unwrap_or(0.0),
        location: r.try_get("location").ok(),
        notes: r.try_get("notes").ok(),
        qty_on_hand,
        avg_unit_cost: r.try_get("avg_unit_cost").unwrap_or(0.0),
        erp_qty: r.try_get("erp_qty").ok(),
        below_min: active != 0 && min_qty > 0.0 && qty_on_hand < min_qty,
        section: r
            .try_get::<String, _>("section")
            .unwrap_or_else(|_| "almoxarifado".into()),
        source: r
            .try_get::<String, _>("source")
            .unwrap_or_else(|_| "erp".into()),
        erp_description: erp_desc,
        lifespan_days: r.try_get("lifespan_days").ok(),
        installed_at: r.try_get("installed_at").ok(),
        expires_at: expires.clone(),
        next_exchange_at: next_ex.clone(),
        exchange_status: exchange_status(next_ex.as_deref(), expires.as_deref()),
        default_pack_qty: r.try_get("default_pack_qty").ok(),
        default_pack_name: r.try_get("default_pack_name").ok(),
        last_pack_qty: r.try_get("last_pack_qty").ok(),
        last_pack_name: r.try_get("last_pack_name").ok(),
        photo_data: r.try_get("photo_data").ok(),
        photo_date: r.try_get("photo_date").ok(),
    }
}

const ITEM_SELECT: &str = r#"
        SELECT i.code, i.description AS items_description, i.unit AS items_unit, i.category_id,
               COALESCE(c.active, 0) AS active,
               COALESCE(c.min_qty, 0) AS min_qty,
               COALESCE(c.ideal_qty, 0) AS ideal_qty,
               c.location, c.notes,
               COALESCE(c.section, 'almoxarifado') AS section,
               COALESCE(c.source, 'erp') AS source,
               c.erp_description,
               c.description AS hub_description,
               c.unit AS cfg_unit,
               c.default_pack_qty,
               c.default_pack_name,
               c.last_pack_qty,
               c.last_pack_name,
               c.photo_data,
               c.photo_date,
               COALESCE(b.qty_on_hand, 0) AS qty_on_hand,
               COALESCE(b.avg_unit_cost, 0) AS avg_unit_cost,
               (
                 SELECT s.stock_qty FROM stock_snapshots s
                 WHERE s.item_code = i.code
                 ORDER BY s.snapshot_date DESC NULLS LAST, s.id DESC
                 LIMIT 1
               ) AS erp_qty,
               p.lifespan_days, p.installed_at, p.expires_at, p.next_exchange_at
        FROM items i
        INNER JOIN almox_item_config c ON c.item_code = i.code
        LEFT JOIN almox_balances b ON b.item_code = i.code
        LEFT JOIN estoque_peca_meta p ON p.item_code = i.code
"#;

/// Lista itens monitorados (com config). `section` filtra submódulo; `None` = catálogo unificado.
pub async fn list_items(
    pool: &PgPool,
    only_active: bool,
    section: Option<&str>,
) -> Result<Vec<AlmoxItemRow>, String> {
    ensure_tables(pool).await?;
    let section = match section {
        Some(s) if !s.is_empty() => Some(normalize_section(s)?),
        _ => None,
    };

    let mut sql = String::from(ITEM_SELECT);
    sql.push_str(" WHERE COALESCE(i.is_ignored, 0) = 0 ");
    if only_active {
        sql.push_str(" AND COALESCE(c.active, 0) = 1 ");
    }
    let outros = section.as_deref() == Some("outros");
    if outros {
        sql.push_str(" AND c.section IN ('outros', 'almoxarifado') ");
    } else if section.is_some() {
        sql.push_str(" AND c.section = $1 ");
    }
    sql.push_str(" ORDER BY i.description ");

    let rows = if outros || section.is_none() {
        sqlx::query(&sql)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
    } else if let Some(sec) = section.as_deref() {
        sqlx::query(&sql)
            .bind(sec)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
    } else {
        sqlx::query(&sql)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
    };

    Ok(rows.iter().map(map_item_row).collect())
}

pub async fn get_item(pool: &PgPool, code: &str) -> Result<Option<AlmoxItemRow>, String> {
    ensure_tables(pool).await?;
    let sql = format!("{ITEM_SELECT} WHERE i.code = $1");
    let row = sqlx::query(&sql)
        .bind(code)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.as_ref().map(map_item_row))
}

pub async fn search_erp_catalog(
    pool: &PgPool,
    q: &str,
    limit: i64,
) -> Result<Vec<CatalogSearchHit>, String> {
    ensure_tables(pool).await?;
    let term = format!("%{}%", q.trim());
    let rows = sqlx::query(
        r#"
        SELECT i.code, i.description, i.unit, i.category_id,
               (c.item_code IS NOT NULL) AS already_linked
        FROM items i
        LEFT JOIN almox_item_config c ON c.item_code = i.code
        WHERE COALESCE(i.is_ignored, 0) = 0
          AND (
            i.code ILIKE $1 OR i.description ILIKE $1
          )
        ORDER BY
          CASE WHEN i.code ILIKE $1 THEN 0 ELSE 1 END,
          i.description
        LIMIT $2
        "#,
    )
    .bind(&term)
    .bind(limit.clamp(1, 100))
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|r| CatalogSearchHit {
            code: r.try_get("code").unwrap_or_default(),
            description: r.try_get("description").unwrap_or_default(),
            unit: r.try_get("unit").unwrap_or_default(),
            category_id: r.try_get("category_id").ok(),
            already_linked: r.try_get::<bool, _>("already_linked").unwrap_or(false),
        })
        .collect())
}

async fn upsert_peca_meta(
    pool: &PgPool,
    code: &str,
    lifespan_days: Option<i32>,
    installed_at: Option<&str>,
    expires_at: Option<&str>,
    next_exchange_at: Option<&str>,
    notes: Option<&str>,
) -> Result<(), String> {
    let now = now_iso();
    sqlx::query(
        r#"
        INSERT INTO estoque_peca_meta
          (item_code, lifespan_days, installed_at, expires_at, next_exchange_at, notes, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (item_code) DO UPDATE SET
          lifespan_days = COALESCE($2, estoque_peca_meta.lifespan_days),
          installed_at = COALESCE($3, estoque_peca_meta.installed_at),
          expires_at = COALESCE($4, estoque_peca_meta.expires_at),
          next_exchange_at = COALESCE($5, estoque_peca_meta.next_exchange_at),
          notes = COALESCE($6, estoque_peca_meta.notes),
          updated_at = $7
        "#,
    )
    .bind(code)
    .bind(lifespan_days)
    .bind(installed_at)
    .bind(expires_at)
    .bind(next_exchange_at)
    .bind(notes)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn upsert_item_config(
    pool: &PgPool,
    code: &str,
    req: &UpsertItemConfigRequest,
) -> Result<AlmoxItemRow, String> {
    ensure_tables(pool).await?;
    let exists: Option<String> = sqlx::query_scalar("SELECT code FROM items WHERE code = $1")
        .bind(code)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    if exists.is_none() {
        return Err(format!("Item {code} não encontrado no cadastro (items)."));
    }

    let now = now_iso();
    let active = req.active.map(|a| if a { 1 } else { 0 });
    let section = match &req.section {
        Some(s) => Some(normalize_section(s)?),
        None => None,
    };
    sqlx::query(
        r#"
        INSERT INTO almox_item_config
          (item_code, active, min_qty, ideal_qty, location, notes, section, source,
           description, unit, default_pack_qty, default_pack_name, photo_data, photo_date, created_at, updated_at)
        VALUES ($1, COALESCE($2, 1), COALESCE($3, 0), COALESCE($4, 0), $5, $6,
                COALESCE($7, 'almoxarifado'), 'erp', $8, $9, $11, $12, $13, $14, $10, $10)
        ON CONFLICT (item_code) DO UPDATE SET
          active = COALESCE($2, almox_item_config.active),
          min_qty = COALESCE($3, almox_item_config.min_qty),
          ideal_qty = COALESCE($4, almox_item_config.ideal_qty),
          location = COALESCE($5, almox_item_config.location),
          notes = COALESCE($6, almox_item_config.notes),
          section = COALESCE($7, almox_item_config.section),
          description = COALESCE($8, almox_item_config.description),
          unit = COALESCE($9, almox_item_config.unit),
          default_pack_qty = COALESCE($11, almox_item_config.default_pack_qty),
          default_pack_name = COALESCE($12, almox_item_config.default_pack_name),
          photo_data = COALESCE($13, almox_item_config.photo_data),
          photo_date = COALESCE($14, almox_item_config.photo_date),
          updated_at = $10
        "#,
    )
    .bind(code)
    .bind(active)
    .bind(req.min_qty)
    .bind(req.ideal_qty)
    .bind(req.location.as_deref())
    .bind(req.notes.as_deref())
    .bind(section.as_deref())
    .bind(req.description.as_deref())
    .bind(req.unit.as_deref())
    .bind(&now)
    .bind(req.default_pack_qty)
    .bind(req.default_pack_name.as_deref())
    .bind(req.photo_data.as_deref())
    .bind(req.photo_date.as_deref())
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(d) = req.description.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let _ = sqlx::query("UPDATE items SET description = $1 WHERE code = $2")
            .bind(d)
            .bind(code)
            .execute(pool)
            .await;
    }
    if let Some(u) = req.unit.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let _ = sqlx::query("UPDATE items SET unit = $1 WHERE code = $2")
            .bind(u)
            .bind(code)
            .execute(pool)
            .await;
    }

    sqlx::query(
        r#"
        INSERT INTO almox_balances (item_code, qty_on_hand, avg_unit_cost, updated_at)
        VALUES ($1, 0, 0, $2)
        ON CONFLICT (item_code) DO NOTHING
        "#,
    )
    .bind(code)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let sec = section.unwrap_or_else(|| "almoxarifado".into());
    if sec == "pecas"
        || req.lifespan_days.is_some()
        || req.next_exchange_at.is_some()
        || req.expires_at.is_some()
    {
        upsert_peca_meta(
            pool,
            code,
            req.lifespan_days,
            req.installed_at.as_deref(),
            req.expires_at.as_deref(),
            req.next_exchange_at.as_deref(),
            req.notes.as_deref(),
        )
        .await?;
    }

    get_item(pool, code)
        .await?
        .ok_or_else(|| "Item atualizado, mas não encontrado na lista.".to_string())
}

pub async fn link_erp_item(
    pool: &PgPool,
    req: &LinkErpItemRequest,
) -> Result<AlmoxItemRow, String> {
    ensure_tables(pool).await?;
    let code = req.item_code.trim();
    let section = normalize_section(&req.section)?;
    if section == "supermercado" {
        return Err("Supermercado usa famílias locais, não vínculo ERP.".into());
    }

    let row = sqlx::query("SELECT description, unit FROM items WHERE code = $1")
        .bind(code)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Item {code} não encontrado no ERP (items)."))?;
    let erp_desc: String = row.try_get("description").unwrap_or_default();
    let erp_unit: String = row.try_get("unit").unwrap_or_else(|_| "UN".into());
    let now = now_iso();
    let active = if req.active.unwrap_or(true) { 1 } else { 0 };

    sqlx::query(
        r#"
        INSERT INTO almox_item_config
          (item_code, active, min_qty, ideal_qty, location, notes, section, source,
           erp_description, description, unit, created_at, updated_at)
        VALUES ($1, $2, COALESCE($3, 0), COALESCE($4, 0), $5, $6, $7, 'erp',
                $8, $8, $9, $10, $10)
        ON CONFLICT (item_code) DO UPDATE SET
          active = EXCLUDED.active,
          min_qty = COALESCE($3, almox_item_config.min_qty),
          ideal_qty = COALESCE($4, almox_item_config.ideal_qty),
          location = COALESCE($5, almox_item_config.location),
          notes = COALESCE($6, almox_item_config.notes),
          section = EXCLUDED.section,
          source = 'erp',
          erp_description = EXCLUDED.erp_description,
          description = COALESCE(almox_item_config.description, EXCLUDED.description),
          unit = COALESCE(almox_item_config.unit, EXCLUDED.unit),
          updated_at = $10
        "#,
    )
    .bind(code)
    .bind(active)
    .bind(req.min_qty)
    .bind(req.ideal_qty)
    .bind(req.location.as_deref())
    .bind(req.notes.as_deref())
    .bind(&section)
    .bind(&erp_desc)
    .bind(&erp_unit)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        INSERT INTO almox_balances (item_code, qty_on_hand, avg_unit_cost, updated_at)
        VALUES ($1, 0, 0, $2)
        ON CONFLICT (item_code) DO NOTHING
        "#,
    )
    .bind(code)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    if section == "pecas" {
        upsert_peca_meta(pool, code, None, None, None, None, req.notes.as_deref()).await?;
    }

    get_item(pool, code)
        .await?
        .ok_or_else(|| "Item vinculado, mas não listado.".to_string())
}

pub async fn create_local_item(
    pool: &PgPool,
    req: &CreateLocalItemRequest,
) -> Result<AlmoxItemRow, String> {
    ensure_tables(pool).await?;
    let section = normalize_section(&req.section)?;
    let desc = req.description.trim();
    if desc.is_empty() {
        return Err("Descrição obrigatória.".into());
    }
    let unit = if req.unit.trim().is_empty() {
        "UN".to_string()
    } else {
        req.unit.trim().to_string()
    };

    // Código do item: usa o informado pelo usuário (ex: código do ERP / ref interna)
    // ou gera sequencial APP_#### se deixado em branco
    let code = match req.code.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(custom) => {
            let custom_upper = custom.to_uppercase();
            let exists: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM items WHERE UPPER(code) = UPPER($1))",
            )
            .bind(&custom_upper)
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;
            if exists {
                return Err(format!("O código '{}' já está cadastrado no estoque.", custom_upper));
            }
            custom_upper
        }
        None => {
            let next: i32 = sqlx::query_scalar(
                r#"
                UPDATE almox_local_code_seq
                SET next_val = next_val + 1
                WHERE id = 1
                RETURNING next_val - 1
                "#,
            )
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;
            format!("APP_{:04}", next)
        }
    };
    let now = now_iso();

    sqlx::query(
        r#"
        INSERT INTO items (code, description, unit, category_id, "type", notes, is_ignored, created_at, updated_at)
        VALUES ($1, $2, $3, NULL, 'local', $4, 0, $5, $5)
        "#,
    )
    .bind(&code)
    .bind(desc)
    .bind(&unit)
    .bind(req.notes.as_deref())
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        INSERT INTO almox_item_config
          (item_code, active, min_qty, ideal_qty, location, notes, section, source,
           description, unit, created_at, updated_at)
        VALUES ($1, 1, COALESCE($2, 0), COALESCE($3, 0), $4, $5, $6, 'local',
                $7, $8, $9, $9)
        "#,
    )
    .bind(&code)
    .bind(req.min_qty)
    .bind(req.ideal_qty)
    .bind(req.location.as_deref())
    .bind(req.notes.as_deref())
    .bind(&section)
    .bind(desc)
    .bind(&unit)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        INSERT INTO almox_balances (item_code, qty_on_hand, avg_unit_cost, updated_at)
        VALUES ($1, 0, 0, $2)
        "#,
    )
    .bind(&code)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    if section == "pecas" {
        upsert_peca_meta(
            pool,
            &code,
            req.lifespan_days,
            None,
            req.expires_at.as_deref(),
            req.next_exchange_at.as_deref(),
            req.notes.as_deref(),
        )
        .await?;
    }

    get_item(pool, &code)
        .await?
        .ok_or_else(|| "Item local criado, mas não listado.".to_string())
}

pub async fn create_movement(
    pool: &PgPool,
    operator_id: Option<&str>,
    req: &CreateMovementRequest,
    allow_negative: bool,
    demand_id: Option<&str>,
) -> Result<AlmoxMovementRow, String> {
    ensure_tables(pool).await?;
    let mt = req.movement_type.trim().to_lowercase();
    if !matches!(mt.as_str(), "entrada" | "saida" | "ajuste") {
        return Err("movement_type inválido. Use entrada, saida ou ajuste.".into());
    }

    let pack_count = req.pack_count.filter(|v| *v > 0.0);
    let content_per_pack = req.content_per_pack.filter(|v| *v > 0.0);
    let (qty_std, unit_cost, total_paid) = if mt == "entrada" && (pack_count.is_some() || content_per_pack.is_some() || req.total_paid.is_some()) {
        let pc = pack_count.unwrap_or(1.0);
        let cpp = content_per_pack.unwrap_or_else(|| {
            if req.quantity > 0.0 {
                req.quantity / pc
            } else {
                0.0
            }
        });
        let q = if cpp > 0.0 {
            pc * cpp
        } else {
            req.quantity
        };
        if q <= 0.0 {
            return Err("Informe packCount×contentPerPack ou quantity > 0.".into());
        }
        let total = req.total_paid.filter(|t| *t > 0.0);
        let uc = if let Some(t) = total {
            Some(t / q)
        } else {
            req.unit_cost
        };
        (q, uc, total.or_else(|| uc.map(|u| u * q)))
    } else {
        if req.quantity <= 0.0 && mt != "ajuste" {
            return Err("Quantidade deve ser maior que zero.".into());
        }
        if req.quantity == 0.0 {
            return Err("Quantidade não pode ser zero.".into());
        }
        (req.quantity, req.unit_cost, req.total_paid.or_else(|| req.unit_cost.map(|u| u * req.quantity.abs())))
    };

    // Use qty_std as working quantity for balance math
    let req_qty = qty_std;

    let code = req.item_code.trim();
    let exists: Option<String> = sqlx::query_scalar("SELECT code FROM items WHERE code = $1")
        .bind(code)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    if exists.is_none() {
        return Err(format!("Item {code} não encontrado."));
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        INSERT INTO almox_balances (item_code, qty_on_hand, avg_unit_cost, updated_at)
        VALUES ($1, 0, 0, $2)
        ON CONFLICT (item_code) DO NOTHING
        "#,
    )
    .bind(code)
    .bind(now_iso())
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let row = sqlx::query("SELECT qty_on_hand, avg_unit_cost FROM almox_balances WHERE item_code = $1 FOR UPDATE")
        .bind(code)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    let mut qty: f64 = row.try_get("qty_on_hand").unwrap_or(0.0);
    let mut avg: f64 = row.try_get("avg_unit_cost").unwrap_or(0.0);

    let delta = match mt.as_str() {
        "entrada" => req_qty,
        "saida" => -req_qty.abs(),
        "ajuste" => {
            let new_qty = req_qty;
            if new_qty < 0.0 && !allow_negative {
                return Err("Ajuste não pode resultar em saldo negativo.".into());
            }
            new_qty - qty
        }
        _ => unreachable!(),
    };

    let new_qty = qty + delta;
    if new_qty < -1e-9 && !allow_negative {
        return Err(format!(
            "Saldo insuficiente. Disponível: {qty:.3}, tentou sair: {:.3}.",
            req_qty.abs()
        ));
    }

    if mt == "entrada" {
        let cost = unit_cost.unwrap_or(avg);
        if qty <= 0.0 {
            avg = cost;
        } else if cost > 0.0 {
            avg = ((qty * avg) + (req_qty * cost)) / (qty + req_qty);
        }
    }

    qty = new_qty;
    let now = now_iso();
    let occurred = req
        .occurred_at
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(&now);
    let id = Uuid::new_v4().to_string();

    let lead_qty = if mt == "ajuste" {
        delta
    } else {
        req_qty.abs()
    };

    sqlx::query(
        r#"
        INSERT INTO almox_movements
          (id, item_code, movement_type, quantity, unit_cost, reason, document_ref, operator_id,
           occurred_at, created_at, demand_id,
           variant_label, pack_label, pack_count, content_per_pack, total_paid, sector)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        "#,
    )
    .bind(&id)
    .bind(code)
    .bind(&mt)
    .bind(lead_qty.abs())
    .bind(unit_cost)
    .bind(req.reason.as_deref())
    .bind(req.document_ref.as_deref())
    .bind(operator_id)
    .bind(occurred)
    .bind(&now)
    .bind(demand_id)
    .bind(req.variant_label.as_deref())
    .bind(req.pack_label.as_deref())
    .bind(pack_count)
    .bind(content_per_pack)
    .bind(total_paid)
    .bind(req.sector.as_deref())
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE almox_balances SET qty_on_hand = $2, avg_unit_cost = $3, updated_at = $4 WHERE item_code = $1",
    )
    .bind(code)
    .bind(qty)
    .bind(avg)
    .bind(&now)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Ativa config se inexistente
    sqlx::query(
        r#"
        INSERT INTO almox_item_config (item_code, active, min_qty, ideal_qty, created_at, updated_at)
        VALUES ($1, 1, 0, 0, $2, $2)
        ON CONFLICT (item_code) DO UPDATE SET active = 1, updated_at = $2
        "#,
    )
    .bind(code)
    .bind(&now)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    let desc: Option<String> =
        sqlx::query_scalar("SELECT COALESCE(c.description, c.erp_description, i.description) FROM items i LEFT JOIN almox_item_config c ON c.item_code = i.code WHERE i.code = $1")
            .bind(code)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

    Ok(AlmoxMovementRow {
        id,
        item_code: code.to_string(),
        item_description: desc,
        movement_type: mt,
        quantity: lead_qty.abs(),
        unit_cost,
        reason: req.reason.clone(),
        document_ref: req.document_ref.clone(),
        operator_id: operator_id.map(|s| s.to_string()),
        occurred_at: occurred.to_string(),
        created_at: now,
        demand_id: demand_id.map(|s| s.to_string()),
        variant_label: req.variant_label.clone(),
        pack_label: req.pack_label.clone(),
        pack_count,
        content_per_pack,
        total_paid,
        sector: req.sector.clone(),
    })
}

pub async fn list_movements(
    pool: &PgPool,
    item_code: Option<&str>,
    from: Option<&str>,
    to: Option<&str>,
    limit: i64,
) -> Result<Vec<AlmoxMovementRow>, String> {
    ensure_tables(pool).await?;
    let lim = limit.clamp(1, 500);
    let rows = sqlx::query(
        r#"
        SELECT m.id, m.item_code,
               COALESCE(c.description, c.erp_description, i.description) AS item_description,
               m.movement_type,
               m.quantity, m.unit_cost, m.reason, m.document_ref, m.operator_id,
               m.occurred_at, m.created_at, m.demand_id,
               m.variant_label, m.pack_label, m.pack_count, m.content_per_pack, m.total_paid,
               m.sector
        FROM almox_movements m
        LEFT JOIN items i ON i.code = m.item_code
        LEFT JOIN almox_item_config c ON c.item_code = m.item_code
        WHERE ($1::text IS NULL OR m.item_code = $1)
          AND ($2::text IS NULL OR m.occurred_at >= $2)
          AND ($3::text IS NULL OR m.occurred_at <= $3)
        ORDER BY m.occurred_at DESC, m.created_at DESC
        LIMIT $4
        "#,
    )
    .bind(item_code)
    .bind(from)
    .bind(to)
    .bind(lim)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|r| AlmoxMovementRow {
            id: r.try_get("id").unwrap_or_default(),
            item_code: r.try_get("item_code").unwrap_or_default(),
            item_description: r.try_get("item_description").ok(),
            movement_type: r.try_get("movement_type").unwrap_or_default(),
            quantity: r.try_get("quantity").unwrap_or(0.0),
            unit_cost: r.try_get("unit_cost").ok(),
            reason: r.try_get("reason").ok(),
            document_ref: r.try_get("document_ref").ok(),
            operator_id: r.try_get("operator_id").ok(),
            occurred_at: r.try_get("occurred_at").unwrap_or_default(),
            created_at: r.try_get("created_at").unwrap_or_default(),
            demand_id: r.try_get("demand_id").ok(),
            variant_label: r.try_get("variant_label").ok(),
            pack_label: r.try_get("pack_label").ok(),
            pack_count: r.try_get("pack_count").ok(),
            content_per_pack: r.try_get("content_per_pack").ok(),
            total_paid: r.try_get("total_paid").ok(),
            sector: r.try_get("sector").ok(),
        })
        .collect())
}

pub async fn item_stats(pool: &PgPool, code: &str) -> Result<ItemStats, String> {
    ensure_tables(pool).await?;
    let items = list_items(pool, false, None).await?;
    let item = items
        .into_iter()
        .find(|i| i.code == code)
        .ok_or_else(|| format!("Item {code} não encontrado."))?;

    let out_30: f64 = sqlx::query_scalar(
        r#"
        SELECT COALESCE(SUM(quantity), 0) FROM almox_movements
        WHERE item_code = $1 AND movement_type = 'saida'
          AND occurred_at >= (CURRENT_TIMESTAMP - INTERVAL '30 days')::TEXT
        "#,
    )
    .bind(code)
    .fetch_one(pool)
    .await
    .unwrap_or(0.0);

    let out_90: f64 = sqlx::query_scalar(
        r#"
        SELECT COALESCE(SUM(quantity), 0) FROM almox_movements
        WHERE item_code = $1 AND movement_type = 'saida'
          AND occurred_at >= (CURRENT_TIMESTAMP - INTERVAL '90 days')::TEXT
        "#,
    )
    .bind(code)
    .fetch_one(pool)
    .await
    .unwrap_or(0.0);

    let avg_daily_out_30 = out_30 / 30.0;
    let avg_daily_out_90 = out_90 / 90.0;
    let target = if item.ideal_qty > 0.0 {
        item.ideal_qty
    } else {
        item.min_qty
    };
    let suggested = (target - item.qty_on_hand).max(0.0);

    let avg_cost_row = sqlx::query(
        r#"
        SELECT COALESCE(SUM(quantity * COALESCE(unit_cost, 0)), 0) AS cost_sum,
               COALESCE(SUM(CASE WHEN unit_cost IS NOT NULL THEN quantity ELSE 0 END), 0) AS qty_sum
        FROM almox_movements
        WHERE item_code = $1 AND movement_type = 'entrada'
          AND occurred_at >= (CURRENT_TIMESTAMP - INTERVAL '30 days')::TEXT
        "#,
    )
    .bind(code)
    .fetch_one(pool)
    .await
    .ok();
    let avg_unit_cost_30 = avg_cost_row.and_then(|r| {
        let cost_sum: f64 = r.try_get("cost_sum").unwrap_or(0.0);
        let qty_sum: f64 = r.try_get("qty_sum").unwrap_or(0.0);
        if qty_sum > 0.0 {
            Some(cost_sum / qty_sum)
        } else {
            None
        }
    });

    Ok(ItemStats {
        item_code: code.to_string(),
        qty_on_hand: item.qty_on_hand,
        min_qty: item.min_qty,
        ideal_qty: item.ideal_qty,
        avg_daily_out_30,
        avg_daily_out_90,
        suggested_buy_qty: suggested,
        below_min: item.below_min,
        erp_qty: item.erp_qty,
        avg_unit_cost_30,
    })
}

pub async fn seed_from_erp(pool: &PgPool, code: &str, operator_id: Option<&str>) -> Result<AlmoxMovementRow, String> {
    ensure_tables(pool).await?;
    let erp: Option<f64> = sqlx::query_scalar(
        r#"
        SELECT stock_qty FROM stock_snapshots
        WHERE item_code = $1
        ORDER BY snapshot_date DESC NULLS LAST, id DESC
        LIMIT 1
        "#,
    )
    .bind(code)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let erp_qty = erp.ok_or_else(|| "Sem snapshot ERP para este item.".to_string())?;
    let req = CreateMovementRequest {
        item_code: code.to_string(),
        movement_type: "ajuste".into(),
        quantity: erp_qty,
        unit_cost: None,
        reason: Some("Carga inicial a partir do saldo ERP (stock_snapshots)".into()),
        document_ref: Some("seed-erp".into()),
        occurred_at: None,
        allow_negative: Some(false),
        sector: None,
        variant_label: None,
        pack_label: None,
        pack_count: None,
        content_per_pack: None,
        total_paid: None,
    };
    create_movement(pool, operator_id, &req, false, None).await
}

pub async fn list_replenishment(pool: &PgPool) -> Result<Vec<ItemStats>, String> {
    let items = list_items(pool, true, None).await?;
    let mut out = Vec::new();
    for it in items.into_iter().filter(|i| i.active && i.below_min) {
        if let Ok(s) = item_stats(pool, &it.code).await {
            out.push(s);
        }
    }
    out.sort_by(|a, b| {
        b.suggested_buy_qty
            .partial_cmp(&a.suggested_buy_qty)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(out)
}

// --- Demandas de compra ---

async fn load_demand(pool: &PgPool, id: &str) -> Result<PurchaseDemandRow, String> {
    let r = sqlx::query(
        r#"
        SELECT id, status, title, notes, created_by, created_at, updated_at, received_at,
               store_name, purchased_at, receipt_name,
               (COALESCE(receipt_data, '') <> '' OR COALESCE(receipts_json, '') <> '') AS has_receipt,
               origin, qty, requested_by, quoted_value, purchase_value,
               tracking_code, equipment_id, equipment_name, sector, urgency, quotes_json, receipts_json
        FROM almox_purchase_demands WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Demanda não encontrada.".to_string())?;

    let items = sqlx::query(
        r#"
        SELECT d.id, d.demand_id, d.item_code, i.description AS item_description,
               d.description, d.qty_requested, d.qty_received, d.unit_cost, d.notes
        FROM almox_purchase_demand_items d
        LEFT JOIN items i ON i.code = d.item_code
        WHERE d.demand_id = $1
        ORDER BY i.description
        "#,
    )
    .bind(id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(PurchaseDemandRow {
        id: r.try_get("id").unwrap_or_default(),
        status: r.try_get("status").unwrap_or_default(),
        title: r.try_get("title").ok(),
        notes: r.try_get("notes").ok(),
        created_by: r.try_get("created_by").ok(),
        created_at: r.try_get("created_at").unwrap_or_default(),
        updated_at: r.try_get("updated_at").unwrap_or_default(),
        received_at: r.try_get("received_at").ok(),
        store_name: r.try_get("store_name").ok(),
        purchased_at: r.try_get("purchased_at").ok(),
        receipt_name: r.try_get("receipt_name").ok(),
        has_receipt: r.try_get("has_receipt").unwrap_or(false),
        origin: r.try_get("origin").ok(),
        qty: r.try_get("qty").ok(),
        requested_by: r.try_get("requested_by").ok(),
        quoted_value: r.try_get("quoted_value").ok(),
        purchase_value: r.try_get("purchase_value").ok(),
        tracking_code: r.try_get("tracking_code").ok(),
        equipment_id: r.try_get("equipment_id").ok(),
        equipment_name: r.try_get("equipment_name").ok(),
        sector: r.try_get("sector").ok(),
        urgency: r.try_get("urgency").ok(),
        quotes_json: r.try_get("quotes_json").ok(),
        receipts_json: r.try_get("receipts_json").ok(),
        items: items
            .into_iter()
            .map(|x| PurchaseDemandItemRow {
                id: x.try_get("id").unwrap_or_default(),
                demand_id: x.try_get("demand_id").unwrap_or_default(),
                item_code: x.try_get("item_code").unwrap_or_default(),
                item_description: x.try_get("item_description").ok(),
                description: x.try_get("description").ok(),
                qty_requested: x.try_get("qty_requested").unwrap_or(0.0),
                qty_received: x.try_get("qty_received").unwrap_or(0.0),
                unit_cost: x.try_get("unit_cost").ok(),
                notes: x.try_get("notes").ok(),
            })
            .collect(),
    })
}

pub async fn list_demands(pool: &PgPool, status: Option<&str>) -> Result<Vec<PurchaseDemandRow>, String> {
    ensure_tables(pool).await?;
    let ids: Vec<String> = sqlx::query_scalar(
        r#"
        SELECT id FROM almox_purchase_demands
        WHERE ($1::text IS NULL OR status = $1)
        ORDER BY created_at DESC
        LIMIT 300
        "#,
    )
    .bind(status)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for id in ids {
        out.push(load_demand(pool, &id).await?);
    }
    Ok(out)
}

pub async fn create_demand(
    pool: &PgPool,
    created_by: Option<&str>,
    req: &CreateDemandRequest,
) -> Result<PurchaseDemandRow, String> {
    ensure_tables(pool).await?;
    let title_ok = req.title.as_ref().map(|t| !t.trim().is_empty()).unwrap_or(false);
    if req.items.is_empty() && !title_ok {
        return Err("Informe o que precisa comprar.".into());
    }
    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    let origin = req
        .origin
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("manual");

    let tracking_code = match req.tracking_code.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(custom) => {
            if let Some(pos) = custom.rfind('-') {
                if let Ok(num) = custom[pos + 1..].parse::<i64>() {
                    let _ = set_print_sequence(pool, num).await;
                }
            }

            let existing = sqlx::query("SELECT id, status FROM almox_purchase_demands WHERE tracking_code = $1 LIMIT 1")
                .bind(custom)
                .fetch_optional(pool)
                .await
                .ok()
                .flatten();

            if let Some(row) = existing {
                let existing_id: String = row.try_get("id").unwrap_or_default();
                let existing_status: String = row.try_get("status").unwrap_or_default();
                if existing_status == "impresso" {
                    let final_status = req.status.as_deref().filter(|s| !s.trim().is_empty()).unwrap_or("aberta");
                    sqlx::query(
                        r#"
                        UPDATE almox_purchase_demands
                        SET status = $2,
                            title = $3,
                            notes = $4,
                            created_by = COALESCE($5, created_by),
                            updated_at = $6,
                            origin = 'talao',
                            qty = $7,
                            requested_by = $8,
                            equipment_id = $9,
                            equipment_name = $10,
                            sector = $11,
                            urgency = $12
                        WHERE id = $1
                        "#
                    )
                    .bind(&existing_id)
                    .bind(final_status)
                    .bind(req.title.as_deref())
                    .bind(req.notes.as_deref())
                    .bind(created_by)
                    .bind(&now)
                    .bind(req.qty)
                    .bind(req.requested_by.as_deref().map(str::trim).filter(|s| !s.is_empty()))
                    .bind(req.equipment_id.as_deref().map(str::trim).filter(|s| !s.is_empty()))
                    .bind(req.equipment_name.as_deref().map(str::trim).filter(|s| !s.is_empty()))
                    .bind(req.sector.as_deref().map(str::trim).filter(|s| !s.is_empty()))
                    .bind(req.urgency.as_deref().map(str::trim).filter(|s| !s.is_empty()))
                    .execute(pool)
                    .await
                    .map_err(|e| e.to_string())?;

                    let _ = sqlx::query("DELETE FROM almox_purchase_demand_items WHERE demand_id = $1")
                        .bind(&existing_id)
                        .execute(pool)
                        .await;

                    for it in &req.items {
                        if it.qty_requested <= 0.0 {
                            continue;
                        }
                        let code = it.item_code.trim();
                        let catalog_code: Option<String> = if code.is_empty() {
                            None
                        } else {
                            Some(code.to_string())
                        };
                        let description = it.description.as_deref().map(str::trim).filter(|s| !s.is_empty());
                        let iid = Uuid::new_v4().to_string();
                        let _ = sqlx::query(
                            r#"
                            INSERT INTO almox_purchase_demand_items
                              (id, demand_id, item_code, description, qty_requested, unit_cost, notes)
                            VALUES ($1, $2, $3, $4, $5, $6, $7)
                            "#,
                        )
                        .bind(&iid)
                        .bind(&existing_id)
                        .bind(catalog_code.as_deref())
                        .bind(description.as_deref())
                        .bind(it.qty_requested)
                        .bind(it.unit_cost)
                        .bind(it.notes.as_deref())
                        .execute(pool)
                        .await;
                    }

                    return load_demand(pool, &existing_id).await;
                }
            }

            custom.to_string()
        }
        None => {
            let next_seq = get_print_sequence(pool).await.unwrap_or(0) + 1;
            let _ = set_print_sequence(pool, next_seq).await;
            let year = Utc::now().format("%Y");
            format!("SOL-{}-{:04}", year, next_seq)
        }
    };

    let status = req.status.as_deref().filter(|s| !s.trim().is_empty()).unwrap_or("aberta");
    sqlx::query(
        r#"
        INSERT INTO almox_purchase_demands
          (id, status, title, notes, created_by, created_at, updated_at, origin, qty, requested_by, quoted_value, tracking_code, equipment_id, equipment_name, sector, urgency, quotes_json, store_name, purchase_value, purchased_at, receipt_name, receipt_data, receipts_json)
        VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        "#,
    )
    .bind(&id)
    .bind(status)
    .bind(req.title.as_deref())
    .bind(req.notes.as_deref())
    .bind(created_by)
    .bind(&now)
    .bind(origin)
    .bind(req.qty)
    .bind(req.requested_by.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.quoted_value.filter(|v| *v >= 0.0))
    .bind(&tracking_code)
    .bind(req.equipment_id.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.equipment_name.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.sector.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.urgency.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.quotes_json.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.store_name.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.purchase_value.filter(|v| *v >= 0.0))
    .bind(req.purchased_at.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.receipt_name.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.receipt_data.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.receipts_json.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    for it in &req.items {
        if it.qty_requested <= 0.0 {
            continue;
        }
        let code = it.item_code.trim();
        // Texto livre (talão) não é código de catálogo. Sem isso a FK de items(code) rejeita a linha.
        let catalog_code: Option<String> = if code.is_empty() {
            None
        } else {
            sqlx::query_scalar(
                "SELECT code FROM items WHERE code = $1 OR TRIM(code) = $1 LIMIT 1",
            )
            .bind(code)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?
        };
        let description = it
            .description
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .or_else(|| {
                if catalog_code.is_none() && !code.is_empty() {
                    Some(code.to_string())
                } else {
                    None
                }
            });
        let iid = Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO almox_purchase_demand_items
              (id, demand_id, item_code, description, qty_requested, qty_received, unit_cost, notes)
            VALUES ($1,$2,$3,$4,$5,0,$6,$7)
            "#,
        )
        .bind(&iid)
        .bind(&id)
        .bind(catalog_code.as_deref())
        .bind(description.as_deref())
        .bind(it.qty_requested)
        .bind(it.unit_cost)
        .bind(it.notes.as_deref())
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    if origin == "manutencao_avulsa" {
        let mid = Uuid::new_v4().to_string();
        let _ = sqlx::query(
            r#"
            INSERT INTO estoque_manutencoes
              (id, equipment_id, kind, status, quantity, technician, cost, notes, occurred_at, created_by, created_at, updated_at, avulsa_tipo, store_name, demand_id)
            VALUES ($1, $2, 'avulsa', 'concluida', $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, $12)
            "#,
        )
        .bind(&mid)
        .bind(req.equipment_id.as_deref().map(str::trim).filter(|s| !s.is_empty()))
        .bind(req.qty.unwrap_or(1.0))
        .bind(req.requested_by.as_deref().map(str::trim).filter(|s| !s.is_empty()))
        .bind(req.purchase_value)
        .bind(req.notes.as_deref().map(str::trim).filter(|s| !s.is_empty()))
        .bind(req.purchased_at.as_deref().unwrap_or(&now))
        .bind(created_by)
        .bind(&now)
        .bind(req.equipment_name.as_deref().unwrap_or("Manutenção Avulsa"))
        .bind(req.store_name.as_deref().map(str::trim).filter(|s| !s.is_empty()))
        .bind(&id)
        .execute(pool)
        .await;

        for it in &req.items {
            let desc = it.description.as_deref().unwrap_or("Material/Peça");
            let pid = Uuid::new_v4().to_string();
            let _ = sqlx::query(
                r#"
                INSERT INTO estoque_manutencao_pecas
                  (id, maintenance_id, item_code, quantity, replaced, unit_cost, notes)
                VALUES ($1, $2, $3, $4, true, $5, $6)
                "#,
            )
            .bind(&pid)
            .bind(&mid)
            .bind(if it.item_code.trim().is_empty() { desc } else { &it.item_code })
            .bind(it.qty_requested)
            .bind(it.unit_cost)
            .bind(desc)
            .execute(pool)
            .await;
        }
    }

    load_demand(pool, &id).await
}

pub async fn update_demand_status(
    pool: &PgPool,
    id: &str,
    status: &str,
) -> Result<PurchaseDemandRow, String> {
    ensure_tables(pool).await?;
    let st = status.trim().to_lowercase();
    if !matches!(st.as_str(), "impresso" | "aberta" | "pedida" | "recebida" | "cancelada") {
        return Err("Status inválido.".into());
    }
    sqlx::query(
        "UPDATE almox_purchase_demands SET status = $2, updated_at = $3 WHERE id = $1",
    )
    .bind(id)
    .bind(&st)
    .bind(now_iso())
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    load_demand(pool, id).await
}

pub async fn update_demand(
    pool: &PgPool,
    id: &str,
    req: &UpdateDemandRequest,
) -> Result<PurchaseDemandRow, String> {
    ensure_tables(pool).await?;
    let current = load_demand(pool, id).await?;
    if current.status == "cancelada" {
        return Err("Solicitação cancelada não pode ser editada.".into());
    }
    let title = req
        .title
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .or(current.title.as_deref());
    if title.is_none() {
        return Err("Informe o que precisa comprar.".into());
    }
    let notes = req.notes.as_deref().map(str::trim);
    let requested = req
        .requested_by
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let qty = req.qty.filter(|v| *v >= 0.0).or(current.qty);
    let now = now_iso();
    sqlx::query(
        r#"
        UPDATE almox_purchase_demands
        SET title = $2,
            notes = $3,
            qty = $4,
            requested_by = $5,
            quoted_value = $6,
            purchase_value = $7,
            store_name = COALESCE($8, store_name),
            purchased_at = COALESCE($9, purchased_at),
            tracking_code = COALESCE($10, tracking_code),
            equipment_id = COALESCE($11, equipment_id),
            equipment_name = COALESCE($12, equipment_name),
            sector = COALESCE($13, sector),
            urgency = COALESCE($14, urgency),
            quotes_json = COALESCE($15, quotes_json),
            receipt_name = COALESCE($16, receipt_name),
            receipt_data = COALESCE($17, receipt_data),
            receipts_json = COALESCE($18, receipts_json),
            updated_at = $19
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(title)
    .bind(notes.filter(|s| !s.is_empty()))
    .bind(qty)
    .bind(requested)
    .bind(req.quoted_value.filter(|v| *v >= 0.0))
    .bind(req.purchase_value.filter(|v| *v >= 0.0))
    .bind(req.store_name.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.purchased_at.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.tracking_code.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.equipment_id.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.equipment_name.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.sector.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.urgency.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.quotes_json.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.receipt_name.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.receipt_data.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.receipts_json.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(items) = &req.items {
        if !items.is_empty() {
            let _ = sqlx::query("DELETE FROM almox_purchase_demand_items WHERE demand_id = $1")
                .bind(id)
                .execute(pool)
                .await;
            for it in items {
                if it.qty_requested <= 0.0 {
                    continue;
                }
                let code = it.item_code.trim();
                let catalog_code: Option<String> = if code.is_empty() {
                    None
                } else {
                    sqlx::query_scalar("SELECT code FROM items WHERE code = $1 OR TRIM(code) = $1 LIMIT 1")
                        .bind(code)
                        .fetch_optional(pool)
                        .await
                        .ok()
                        .flatten()
                };
                let desc = it.description.as_deref().map(str::trim).filter(|s| !s.is_empty());
                let iid = Uuid::new_v4().to_string();
                let _ = sqlx::query(
                    r#"
                    INSERT INTO almox_purchase_demand_items
                      (id, demand_id, item_code, description, qty_requested, qty_received, unit_cost, notes)
                    VALUES ($1,$2,$3,$4,$5,0,$6,$7)
                    "#,
                )
                .bind(&iid)
                .bind(id)
                .bind(catalog_code.as_deref())
                .bind(desc)
                .bind(it.qty_requested)
                .bind(it.unit_cost)
                .bind(it.notes.as_deref())
                .execute(pool)
                .await;
            }
        }
    } else if let Some(q) = qty {
        if current.items.len() == 1 {
            if let Some(item) = current.items.first() {
                sqlx::query(
                    "UPDATE almox_purchase_demand_items SET qty_requested = $2 WHERE id = $1",
                )
                .bind(&item.id)
                .bind(q)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
            }
        }
    }

    load_demand(pool, id).await
}

pub async fn get_item_purchase_history(
    pool: &PgPool,
    item_code: Option<&str>,
    query: Option<&str>,
) -> Result<Vec<ItemPurchaseHistoryRow>, String> {
    ensure_tables(pool).await?;
    let term = query.unwrap_or("").trim().to_lowercase();
    let code = item_code.unwrap_or("").trim().to_lowercase();

    let rows = sqlx::query(
        r#"
        SELECT d.id, d.tracking_code,
               COALESCE(NULLIF(TRIM(i.description), ''), d.title) AS title,
               i.item_code,
               d.store_name, d.purchased_at,
               COALESCE(i.unit_cost * i.qty_requested, d.purchase_value) AS purchase_value,
               i.unit_cost,
               COALESCE(i.qty_requested, d.qty) AS qty,
               d.quoted_value, d.quotes_json, d.created_at
        FROM almox_purchase_demands d
        LEFT JOIN almox_purchase_demand_items i ON i.demand_id = d.id
        WHERE d.status != 'cancelada'
          AND (
            ($1 != '' AND LOWER(COALESCE(i.item_code, '')) = $1)
            OR ($2 != '' AND (LOWER(COALESCE(d.title, '')) LIKE '%' || $2 || '%' OR LOWER(COALESCE(i.description, '')) LIKE '%' || $2 || '%'))
          )
        ORDER BY COALESCE(d.purchased_at, d.created_at) DESC
        LIMIT 20
        "#,
    )
    .bind(&code)
    .bind(&term)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for r in rows {
        out.push(ItemPurchaseHistoryRow {
            demand_id: r.try_get("id").unwrap_or_default(),
            tracking_code: r.try_get("tracking_code").ok(),
            title: r.try_get("title").ok(),
            item_code: r.try_get("item_code").ok(),
            store_name: r.try_get("store_name").ok(),
            purchased_at: r.try_get("purchased_at").ok(),
            purchase_value: r.try_get("purchase_value").ok(),
            quoted_value: r.try_get("quoted_value").ok(),
            unit_cost: r.try_get("unit_cost").ok(),
            qty: r.try_get("qty").ok(),
            quotes_json: r.try_get("quotes_json").ok(),
            created_at: r.try_get("created_at").unwrap_or_default(),
        });
    }
    Ok(out)
}

fn next_count_date(last: &str) -> String {
    let day = last.get(..10).unwrap_or(last);
    parse_iso_date(day)
        .map(|d| (d + Duration::days(7)).format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string())
}

pub async fn latest_stock_count(pool: &PgPool) -> Result<StockCountStatus, String> {
    ensure_tables(pool).await?;
    let last: Option<String> = sqlx::query_scalar(
        "SELECT counted_at FROM almox_stock_counts ORDER BY counted_at DESC LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let today = Utc::now().format("%Y-%m-%d").to_string();
    let next = last
        .as_deref()
        .map(next_count_date)
        .unwrap_or_else(|| today.clone());
    let due = next.as_str() <= today.as_str();
    Ok(StockCountStatus {
        last_counted_at: last,
        next_counted_at: next,
        due,
    })
}

pub async fn apply_stock_count(
    pool: &PgPool,
    operator_id: Option<&str>,
    req: &StockCountRequest,
) -> Result<StockCountResult, String> {
    ensure_tables(pool).await?;
    if req.lines.is_empty() {
        return Err("Informe a quantidade contada dos itens.".into());
    }
    let now = now_iso();
    let counted_at = req
        .counted_at
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&now)
        .to_string();
    let count_id = Uuid::new_v4().to_string();
    let mut saidas = 0i32;
    let mut entradas = 0i32;

    for line in &req.lines {
        if line.counted_qty < 0.0 {
            return Err(format!(
                "A quantidade de {} não pode ser negativa.",
                line.item_code.trim()
            ));
        }
        let code = line.item_code.trim();
        if code.is_empty() {
            continue;
        }
        if let Some(pq) = line.pack_qty {
            if pq > 0.0 {
                let _ = sqlx::query(
                    "UPDATE almox_item_config SET last_pack_qty = $1, last_pack_name = $2 WHERE item_code = $3",
                )
                .bind(pq)
                .bind(line.pack_name.as_deref())
                .bind(code)
                .execute(pool)
                .await;
            }
        }
        let on_hand: f64 = sqlx::query_scalar(
            "SELECT COALESCE(qty_on_hand, 0) FROM almox_balances WHERE item_code = $1",
        )
        .bind(code)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or(0.0);
        let diff = line.counted_qty - on_hand;
        if diff.abs() < 0.0001 {
            continue;
        }
        let (movement_type, quantity) = if diff < 0.0 {
            saidas += 1;
            ("saida", diff.abs())
        } else {
            entradas += 1;
            ("entrada", diff)
        };
        create_movement(
            pool,
            operator_id,
            &CreateMovementRequest {
                item_code: code.to_string(),
                movement_type: movement_type.into(),
                quantity,
                unit_cost: None,
                reason: Some("Contagem semanal".into()),
                document_ref: Some(count_id.clone()),
                occurred_at: Some(counted_at.clone()),
                allow_negative: Some(false),
                sector: None,
                variant_label: None,
                pack_label: None,
                pack_count: None,
                content_per_pack: None,
                total_paid: None,
            },
            false,
            None,
        )
        .await?;
    }

    sqlx::query(
        r#"
        INSERT INTO almox_stock_counts (id, counted_at, created_by, saidas, entradas, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(&count_id)
    .bind(&counted_at)
    .bind(operator_id)
    .bind(saidas)
    .bind(entradas)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let next = next_count_date(&counted_at);
    Ok(StockCountResult {
        id: count_id,
        counted_at,
        saidas,
        entradas,
        next_counted_at: next,
    })
}

pub async fn receive_demand(
    pool: &PgPool,
    id: &str,
    operator_id: Option<&str>,
    req: &ReceiveDemandRequest,
) -> Result<PurchaseDemandRow, String> {
    ensure_tables(pool).await?;
    let demand = load_demand(pool, id).await?;
    if demand.status == "cancelada" || demand.status == "recebida" {
        return Err(format!("Demanda já está '{}'.", demand.status));
    }

    for it in &req.items {
        if it.qty_received <= 0.0 {
            continue;
        }
        sqlx::query(
            r#"
            UPDATE almox_purchase_demand_items
            SET qty_received = qty_received + $3,
                unit_cost = COALESCE($4, unit_cost)
            WHERE demand_id = $1 AND item_code = $2
            "#,
        )
        .bind(id)
        .bind(it.item_code.trim())
        .bind(it.qty_received)
        .bind(it.unit_cost)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

        let mv = CreateMovementRequest {
            item_code: it.item_code.clone(),
            movement_type: "entrada".into(),
            quantity: it.qty_received,
            unit_cost: it.unit_cost,
            reason: Some(format!("Recebimento demanda {id}")),
            document_ref: Some(id.to_string()),
            occurred_at: None,
            allow_negative: Some(false),
            sector: None,
            variant_label: None,
            pack_label: None,
            pack_count: None,
            content_per_pack: None,
            total_paid: None,
        };
        create_movement(pool, operator_id, &mv, false, Some(id)).await?;
    }

    let now = now_iso();
    sqlx::query(
        r#"
        UPDATE almox_purchase_demands
        SET status = 'recebida', received_at = $2, updated_at = $2
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    load_demand(pool, id).await
}

pub async fn mark_purchased(
    pool: &PgPool,
    id: &str,
    operator_id: Option<&str>,
    req: &MarkPurchasedRequest,
) -> Result<PurchaseDemandRow, String> {
    ensure_tables(pool).await?;
    let store = req.store_name.trim();
    if store.is_empty() {
        return Err("Informe a loja.".into());
    }
    let when = req.purchased_at.trim();
    if when.is_empty() {
        return Err("Informe a data da compra.".into());
    }
    if let Some(data) = req.receipt_data.as_deref() {
        if data.len() > 2_000_000 {
            return Err("Comprovante maior que 1,5 MB.".into());
        }
    }
    let demand = load_demand(pool, id).await?;
    if demand.status == "cancelada" {
        return Err("Demanda cancelada.".into());
    }
    if demand.status == "recebida" {
        return Err("Esta compra já foi registrada.".into());
    }
    let now = now_iso();
    sqlx::query(
        r#"
        UPDATE almox_purchase_demands
        SET store_name = $2,
            purchased_at = $3,
            receipt_name = $4,
            receipt_data = COALESCE($5, receipt_data),
            purchase_value = COALESCE($6, purchase_value),
            receipts_json = COALESCE($7, receipts_json),
            updated_at = $8
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(store)
    .bind(when)
    .bind(req.receipt_name.as_deref())
    .bind(req.receipt_data.as_deref())
    .bind(req.purchase_value.filter(|v| *v >= 0.0))
    .bind(req.receipts_json.as_deref())
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let pending: Vec<ReceiveDemandItemRequest> = demand
        .items
        .iter()
        .filter(|it| !it.item_code.trim().is_empty())
        .map(|it| {
            let qty = (it.qty_requested - it.qty_received).max(0.0);
            ReceiveDemandItemRequest {
                item_code: it.item_code.clone(),
                qty_received: if qty > 0.0 { qty } else { it.qty_requested },
                unit_cost: it.unit_cost,
            }
        })
        .filter(|it| it.qty_received > 0.0)
        .collect();

    if pending.is_empty() {
        sqlx::query(
            r#"
            UPDATE almox_purchase_demands
            SET status = 'recebida', received_at = $2, updated_at = $2
            WHERE id = $1
            "#,
        )
        .bind(id)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        return load_demand(pool, id).await;
    }

    receive_demand(
        pool,
        id,
        operator_id,
        &ReceiveDemandRequest { items: pending },
    )
    .await
}

pub async fn demand_receipt(
    pool: &PgPool,
    id: &str,
) -> Result<(Option<String>, Option<String>, Option<String>), String> {
    ensure_tables(pool).await?;
    let row = sqlx::query(
        "SELECT receipt_name, receipt_data, receipts_json FROM almox_purchase_demands WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Demanda não encontrada.".to_string())?;
    Ok((
        row.try_get("receipt_name").ok(),
        row.try_get("receipt_data").ok(),
        row.try_get("receipts_json").ok(),
    ))
}

pub async fn create_demands_from_replenishment(
    pool: &PgPool,
    created_by: Option<&str>,
) -> Result<PurchaseDemandRow, String> {
    let stats = list_replenishment(pool).await?;
    if stats.is_empty() {
        return Err("Nenhum item abaixo do mínimo.".into());
    }
    let mut created: Option<PurchaseDemandRow> = None;
    for s in stats.into_iter().filter(|s| s.suggested_buy_qty > 0.0) {
        created = Some(
            create_demand(
                pool,
                created_by,
                &CreateDemandRequest {
                    title: Some(s.item_code.clone()),
                    notes: Some(format!("Abaixo do mínimo. Média 30d={:.3}/dia", s.avg_daily_out_30)),
                    origin: Some("minimo".into()),
                    qty: Some(s.suggested_buy_qty),
                    requested_by: None,
                    quoted_value: None,
                    tracking_code: None,
                    equipment_id: None,
                    equipment_name: None,
                    sector: None,
                    urgency: None,
                    quotes_json: None,
                    purchase_value: None,
                    store_name: None,
                    purchased_at: None,
                    status: None,
                    receipt_name: None,
                    receipt_data: None,
                    receipts_json: None,
                    items: vec![CreateDemandItemRequest {
                        item_code: s.item_code.clone(),
                        description: None,
                        qty_requested: s.suggested_buy_qty,
                        unit_cost: None,
                        notes: None,
                    }],
                },
            )
            .await?,
        );
    }
    created.ok_or_else(|| "Nenhum item abaixo do mínimo.".into())
}

// --- Equipamentos ---

fn normalize_eq_status(raw: &str) -> Result<String, String> {
    let s = raw.trim().to_lowercase();
    Ok(match s.as_str() {
        "em_operacao" | "ativo" | "ativa" => "em_operacao".into(),
        "em_manutencao" | "manutencao" => "em_manutencao".into(),
        "parado" | "inativo" | "inativa" | "baixado" => "parado".into(),
        _ => return Err("status inválido. Use em_operacao, em_manutencao ou parado.".into()),
    })
}

fn parse_iso_date(s: &str) -> Option<chrono::NaiveDate> {
    let t = s.trim();
    if t.len() >= 10 {
        chrono::NaiveDate::parse_from_str(&t[..10], "%Y-%m-%d").ok()
    } else {
        None
    }
}

fn avg_interval_days(dates: &[chrono::NaiveDate]) -> Option<f64> {
    if dates.len() < 2 {
        return None;
    }
    let mut gaps: Vec<i64> = Vec::new();
    for w in dates.windows(2) {
        let d = (w[1] - w[0]).num_days();
        if d > 0 {
            gaps.push(d);
        }
    }
    if gaps.is_empty() {
        return None;
    }
    Some(gaps.iter().sum::<i64>() as f64 / gaps.len() as f64)
}

async fn equipment_cover_photo(pool: &PgPool, id: &str) -> Result<Option<String>, String> {
    sqlx::query_scalar(
        r#"
        SELECT photo_data FROM estoque_fotos
        WHERE entity_type = 'equipment' AND entity_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())
}

async fn equipment_totals(pool: &PgPool, id: &str) -> Result<(f64, i64), String> {
    let spent: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(cost), 0)::float8 FROM estoque_manutencoes WHERE equipment_id = $1",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .unwrap_or(0.0);
    let open: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM estoque_manutencoes
        WHERE equipment_id = $1 AND status IN ('pendente', 'em_andamento')
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .unwrap_or(0);
    Ok((spent, open))
}

async fn load_equipment_peca_stats(
    pool: &PgPool,
    equipment_id: &str,
) -> Result<Vec<EquipmentPecaStat>, String> {
    let rows = sqlx::query(
        r#"
        SELECT ep.item_code,
               COALESCE(c.description, i.description) AS description,
               COALESCE(b.qty_on_hand, 0) AS qty_on_hand,
               p.lifespan_days,
               ep.expected_lifespan_days,
               ep.installed_at,
               p.next_exchange_at,
               p.expires_at
        FROM estoque_equipamento_pecas ep
        LEFT JOIN items i ON i.code = ep.item_code
        LEFT JOIN almox_item_config c ON c.item_code = ep.item_code
        LEFT JOIN almox_balances b ON b.item_code = ep.item_code
        LEFT JOIN estoque_peca_meta p ON p.item_code = ep.item_code
        WHERE ep.equipment_id = $1
        ORDER BY COALESCE(c.description, i.description, ep.item_code)
        "#,
    )
    .bind(equipment_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let hist = sqlx::query(
        r#"
        SELECT COALESCE(mp.item_code, m.item_code) AS item_code,
               COALESCE(m.completed_at, m.occurred_at) AS at
        FROM estoque_manutencoes m
        LEFT JOIN estoque_manutencao_pecas mp ON mp.maintenance_id = m.id
        WHERE m.equipment_id = $1
          AND m.status = 'concluida'
          AND (
            (mp.replaced IS TRUE)
            OR (mp.id IS NULL AND m.item_code IS NOT NULL)
          )
        ORDER BY 2
        "#,
    )
    .bind(equipment_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut by_item: std::collections::HashMap<String, Vec<chrono::NaiveDate>> =
        std::collections::HashMap::new();
    for h in hist {
        let code: String = h.try_get("item_code").unwrap_or_default();
        if code.is_empty() {
            continue;
        }
        if let Some(d) = h
            .try_get::<String, _>("at")
            .ok()
            .as_deref()
            .and_then(parse_iso_date)
        {
            by_item.entry(code).or_default().push(d);
        }
    }
    for v in by_item.values_mut() {
        v.sort();
        v.dedup();
    }

    let mut out = Vec::new();
    for r in rows {
        let item_code: String = r.try_get("item_code").unwrap_or_default();
        let dates = by_item.get(&item_code).cloned().unwrap_or_default();
        let last_replaced_at = dates.last().map(|d| d.to_string());
        let next_ex: Option<String> = r.try_get("next_exchange_at").ok();
        let expires: Option<String> = r.try_get("expires_at").ok();
        out.push(EquipmentPecaStat {
            item_code,
            description: r.try_get("description").ok(),
            qty_on_hand: r.try_get("qty_on_hand").unwrap_or(0.0),
            lifespan_days: r.try_get("lifespan_days").ok(),
            expected_lifespan_days: r.try_get("expected_lifespan_days").ok(),
            installed_at: r.try_get("installed_at").ok(),
            last_replaced_at,
            times_replaced: dates.len() as i64,
            avg_usage_days: avg_interval_days(&dates),
            next_exchange_at: next_ex.clone(),
            exchange_status: exchange_status(next_ex.as_deref(), expires.as_deref()),
        });
    }
    Ok(out)
}

fn map_equipment_row(
    r: &sqlx::postgres::PgRow,
    peca_codes: Vec<String>,
    cover_photo: Option<String>,
    total_spent: f64,
    open_maintenances: i64,
    pecas: Vec<EquipmentPecaStat>,
) -> EquipmentRow {
    EquipmentRow {
        id: r.try_get("id").unwrap_or_default(),
        code: r.try_get("code").unwrap_or_default(),
        name: r.try_get("name").unwrap_or_default(),
        sector: r.try_get("sector").ok(),
        status: r.try_get("status").unwrap_or_else(|_| "em_operacao".into()),
        brand: r.try_get("brand").ok(),
        model: r.try_get("model").ok(),
        manufacture_year: r.try_get("manufacture_year").ok(),
        serial_number: r.try_get("serial_number").ok(),
        equip_type: r.try_get("equip_type").ok(),
        location: r.try_get("location").ok(),
        supplier: r.try_get("supplier").ok(),
        acquired_at: r.try_get("acquired_at").ok(),
        purchase_value: r.try_get("purchase_value").ok(),
        maintenance_interval_days: r.try_get("maintenance_interval_days").ok(),
        last_maintenance_at: r.try_get("last_maintenance_at").ok(),
        next_maintenance_at: r.try_get("next_maintenance_at").ok(),
        notes: r.try_get("notes").ok(),
        peca_codes,
        cover_photo,
        total_spent,
        open_maintenances,
        pecas,
    }
}

pub async fn list_equipments(pool: &PgPool) -> Result<Vec<EquipmentRow>, String> {
    ensure_tables(pool).await?;
    let rows = sqlx::query(
        r#"
        SELECT id, code, name, sector, status, brand, model, manufacture_year, serial_number,
               equip_type, location, supplier, acquired_at, purchase_value,
               maintenance_interval_days, last_maintenance_at, next_maintenance_at, notes
        FROM estoque_equipamentos
        ORDER BY name
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for r in rows {
        let id: String = r.try_get("id").unwrap_or_default();
        let pecas: Vec<String> = sqlx::query_scalar(
            "SELECT item_code FROM estoque_equipamento_pecas WHERE equipment_id = $1 ORDER BY item_code",
        )
        .bind(&id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
        let cover = equipment_cover_photo(pool, &id).await?;
        let (spent, open) = equipment_totals(pool, &id).await?;
        out.push(map_equipment_row(&r, pecas, cover, spent, open, vec![]));
    }
    Ok(out)
}

pub async fn get_equipment(pool: &PgPool, id: &str) -> Result<EquipmentRow, String> {
    ensure_tables(pool).await?;
    let r = sqlx::query(
        r#"
        SELECT id, code, name, sector, status, brand, model, manufacture_year, serial_number,
               equip_type, location, supplier, acquired_at, purchase_value,
               maintenance_interval_days, last_maintenance_at, next_maintenance_at, notes
        FROM estoque_equipamentos
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Equipamento não encontrado.".to_string())?;

    let peca_stats = load_equipment_peca_stats(pool, id).await?;
    let peca_codes: Vec<String> = peca_stats.iter().map(|p| p.item_code.clone()).collect();
    let cover = equipment_cover_photo(pool, id).await?;
    let (spent, open) = equipment_totals(pool, id).await?;
    Ok(map_equipment_row(
        &r,
        peca_codes,
        cover,
        spent,
        open,
        peca_stats,
    ))
}

async fn replace_equipment_pecas(
    pool: &PgPool,
    eid: &str,
    pecas: Option<&Vec<EquipmentPecaInput>>,
    peca_codes: Option<&Vec<String>>,
) -> Result<(), String> {
    if pecas.is_none() && peca_codes.is_none() {
        return Ok(());
    }
    sqlx::query("DELETE FROM estoque_equipamento_pecas WHERE equipment_id = $1")
        .bind(eid)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(list) = pecas {
        for p in list {
            let code = p.item_code.trim();
            if code.is_empty() {
                continue;
            }
            sqlx::query(
                r#"
                INSERT INTO estoque_equipamento_pecas
                  (equipment_id, item_code, installed_at, expected_lifespan_days, notes)
                VALUES ($1,$2,$3,$4,$5)
                ON CONFLICT (equipment_id, item_code) DO UPDATE SET
                  installed_at = COALESCE(EXCLUDED.installed_at, estoque_equipamento_pecas.installed_at),
                  expected_lifespan_days = COALESCE(EXCLUDED.expected_lifespan_days, estoque_equipamento_pecas.expected_lifespan_days),
                  notes = COALESCE(EXCLUDED.notes, estoque_equipamento_pecas.notes)
                "#,
            )
            .bind(eid)
            .bind(code)
            .bind(p.installed_at.as_deref())
            .bind(p.expected_lifespan_days)
            .bind(p.notes.as_deref())
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    if let Some(codes) = peca_codes {
        for c in codes {
            let code = c.trim();
            if code.is_empty() {
                continue;
            }
            sqlx::query(
                "INSERT INTO estoque_equipamento_pecas (equipment_id, item_code) VALUES ($1,$2) ON CONFLICT DO NOTHING",
            )
            .bind(eid)
            .bind(code)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub async fn upsert_equipment(
    pool: &PgPool,
    id: Option<&str>,
    req: &UpsertEquipmentRequest,
) -> Result<EquipmentRow, String> {
    ensure_tables(pool).await?;
    if req.code.trim().is_empty() || req.name.trim().is_empty() {
        return Err("Código e nome são obrigatórios.".into());
    }
    let status = normalize_eq_status(req.status.as_deref().unwrap_or("em_operacao"))?;
    let now = now_iso();
    let eid = id
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    if id.is_some() {
        sqlx::query(
            r#"
            UPDATE estoque_equipamentos SET
              code = $2, name = $3, sector = $4, status = $5,
              brand = $6, model = $7, manufacture_year = $8, serial_number = $9,
              equip_type = $10, location = $11, supplier = $12, acquired_at = $13, purchase_value = $14,
              maintenance_interval_days = $15, next_maintenance_at = $16, notes = $17, updated_at = $18
            WHERE id = $1
            "#,
        )
        .bind(&eid)
        .bind(req.code.trim())
        .bind(req.name.trim())
        .bind(req.sector.as_deref())
        .bind(&status)
        .bind(req.brand.as_deref())
        .bind(req.model.as_deref())
        .bind(req.manufacture_year)
        .bind(req.serial_number.as_deref())
        .bind(req.equip_type.as_deref())
        .bind(req.location.as_deref())
        .bind(req.supplier.as_deref())
        .bind(req.acquired_at.as_deref())
        .bind(req.purchase_value)
        .bind(req.maintenance_interval_days)
        .bind(req.next_maintenance_at.as_deref())
        .bind(req.notes.as_deref())
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO estoque_equipamentos
              (id, code, name, sector, status, brand, model, manufacture_year, serial_number,
               equip_type, location, supplier, acquired_at, purchase_value,
               maintenance_interval_days, next_maintenance_at, notes, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18)
            "#,
        )
        .bind(&eid)
        .bind(req.code.trim())
        .bind(req.name.trim())
        .bind(req.sector.as_deref())
        .bind(&status)
        .bind(req.brand.as_deref())
        .bind(req.model.as_deref())
        .bind(req.manufacture_year)
        .bind(req.serial_number.as_deref())
        .bind(req.equip_type.as_deref())
        .bind(req.location.as_deref())
        .bind(req.supplier.as_deref())
        .bind(req.acquired_at.as_deref())
        .bind(req.purchase_value)
        .bind(req.maintenance_interval_days)
        .bind(req.next_maintenance_at.as_deref())
        .bind(req.notes.as_deref())
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    replace_equipment_pecas(pool, &eid, req.pecas.as_ref(), req.peca_codes.as_ref()).await?;
    get_equipment(pool, &eid).await
}

async fn load_maintenance_parts(
    pool: &PgPool,
    maintenance_id: &str,
) -> Result<Vec<MaintenancePartRow>, String> {
    let rows = sqlx::query(
        r#"
        SELECT mp.item_code,
               COALESCE(c.description, i.description) AS description,
               mp.quantity, mp.replaced, mp.unit_cost, mp.notes
        FROM estoque_manutencao_pecas mp
        LEFT JOIN items i ON i.code = mp.item_code
        LEFT JOIN almox_item_config c ON c.item_code = mp.item_code
        WHERE mp.maintenance_id = $1
        ORDER BY mp.item_code
        "#,
    )
    .bind(maintenance_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|r| MaintenancePartRow {
            item_code: r.try_get("item_code").unwrap_or_default(),
            description: r.try_get("description").ok(),
            quantity: r.try_get("quantity").unwrap_or(1.0),
            replaced: r.try_get("replaced").unwrap_or(true),
            unit_cost: r.try_get("unit_cost").ok(),
            notes: r.try_get("notes").ok(),
        })
        .collect())
}

fn map_maintenance_row(r: &sqlx::postgres::PgRow, parts: Vec<MaintenancePartRow>) -> MaintenanceRow {
    let item_code: Option<String> = r.try_get("item_code").ok();
    let mut parts = parts;
    if parts.is_empty() {
        if let Some(code) = item_code.clone().filter(|c| !c.is_empty()) {
            parts.push(MaintenancePartRow {
                item_code: code,
                description: r.try_get("item_description").ok(),
                quantity: r.try_get("quantity").unwrap_or(0.0),
                replaced: true,
                unit_cost: None,
                notes: None,
            });
        }
    }
    MaintenanceRow {
        id: r.try_get("id").unwrap_or_default(),
        equipment_id: r.try_get("equipment_id").unwrap_or_default(),
        equipment_code: r.try_get("equipment_code").ok(),
        equipment_name: r.try_get("equipment_name").ok(),
        kind: r.try_get("kind").unwrap_or_default(),
        status: r.try_get("status").unwrap_or_default(),
        routine: r.try_get("routine").ok(),
        item_code,
        item_description: r.try_get("item_description").ok(),
        quantity: r.try_get("quantity").unwrap_or(0.0),
        technician: r.try_get("technician").ok(),
        cost: r.try_get("cost").ok(),
        notes: r.try_get("notes").ok(),
        occurred_at: r.try_get("occurred_at").unwrap_or_default(),
        scheduled_at: r.try_get("scheduled_at").ok(),
        completed_at: r.try_get("completed_at").ok(),
        recurrence_days: r.try_get("recurrence_days").ok(),
        created_by: r.try_get("created_by").ok(),
        created_at: r.try_get("created_at").unwrap_or_default(),
        avulsa_tipo: r.try_get("avulsa_tipo").ok(),
        store_name: r.try_get("store_name").ok(),
        parts,
    }
}

pub async fn list_maintenances(
    pool: &PgPool,
    equipment_id: Option<&str>,
) -> Result<Vec<MaintenanceRow>, String> {
    ensure_tables(pool).await?;
    let sql = r#"
        SELECT m.*, e.code AS equipment_code,
               COALESCE(e.name, m.avulsa_tipo, 'Manutenção Avulsa') AS equipment_name,
               i.description AS item_description
        FROM estoque_manutencoes m
        LEFT JOIN estoque_equipamentos e ON e.id = m.equipment_id
        LEFT JOIN items i ON i.code = m.item_code
        WHERE ($1::text IS NULL OR m.equipment_id = $1)
        ORDER BY COALESCE(m.scheduled_at, m.occurred_at) DESC
    "#;
    let rows = sqlx::query(sql)
        .bind(equipment_id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for r in rows {
        let id: String = r.try_get("id").unwrap_or_default();
        let parts = load_maintenance_parts(pool, &id).await?;
        out.push(map_maintenance_row(&r, parts));
    }
    Ok(out)
}

async fn insert_maintenance_parts(
    pool: &PgPool,
    maintenance_id: &str,
    parts: &[MaintenancePartInput],
) -> Result<(), String> {
    for p in parts {
        let code = p.item_code.trim();
        if code.is_empty() {
            continue;
        }
        let pid = Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO estoque_manutencao_pecas
              (id, maintenance_id, item_code, quantity, replaced, unit_cost, notes)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            "#,
        )
        .bind(&pid)
        .bind(maintenance_id)
        .bind(code)
        .bind(p.quantity.unwrap_or(1.0))
        .bind(p.replaced.unwrap_or(true))
        .bind(p.unit_cost)
        .bind(p.notes.as_deref())
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn normalize_maint_kind(raw: &str) -> Result<String, String> {
    let k = raw.trim().to_lowercase();
    match k.as_str() {
        "preventiva" | "corretiva" | "preditiva" | "inspecao" | "inspeção" | "avulsa" => {
            if k == "inspeção" {
                Ok("inspecao".into())
            } else {
                Ok(k)
            }
        }
        "troca_peca" => Ok("corretiva".into()),
        _ => Err("kind inválido. Use preventiva, corretiva, preditiva, inspecao ou avulsa.".into()),
    }
}

fn normalize_maint_status(raw: &str) -> String {
    match raw.trim().to_lowercase().as_str() {
        "aberta" | "agendada" | "programada" => "pendente".into(),
        "em_andamento" => "em_andamento".into(),
        "concluida" | "concluída" => "concluida".into(),
        other => other.to_string(),
    }
}

pub async fn create_maintenance(
    pool: &PgPool,
    created_by: Option<&str>,
    req: &CreateMaintenanceRequest,
) -> Result<MaintenanceRow, String> {
    ensure_tables(pool).await?;
    let kind = normalize_maint_kind(&req.kind)?;
    let status = normalize_maint_status(req.status.as_deref().unwrap_or("pendente"));
    if !matches!(status.as_str(), "pendente" | "em_andamento" | "concluida") {
        return Err("status inválido.".into());
    }
    let now = now_iso();
    let occurred = req
        .occurred_at
        .as_deref()
        .filter(|s| !s.is_empty())
        .or(req.scheduled_at.as_deref().filter(|s| !s.is_empty()))
        .unwrap_or(&now);
    let id = Uuid::new_v4().to_string();
    let parts = req.parts.clone().unwrap_or_default();
    let first_code = parts
        .first()
        .map(|p| p.item_code.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| req.item_code.clone().filter(|s| !s.trim().is_empty()));
    let qty = parts
        .first()
        .and_then(|p| p.quantity)
        .or(req.quantity)
        .unwrap_or(0.0);

    sqlx::query(
        r#"
        INSERT INTO estoque_manutencoes
          (id, equipment_id, kind, status, routine, item_code, quantity, technician, cost, notes,
           occurred_at, scheduled_at, recurrence_days, created_by, created_at, updated_at, avulsa_tipo, store_name)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,$16,$17)
        "#,
    )
    .bind(&id)
    .bind(req.equipment_id.as_deref().filter(|s| !s.trim().is_empty()))
    .bind(&kind)
    .bind(&status)
    .bind(req.routine.as_deref())
    .bind(first_code.as_deref())
    .bind(qty)
    .bind(req.technician.as_deref())
    .bind(req.cost)
    .bind(req.notes.as_deref())
    .bind(occurred)
    .bind(req.scheduled_at.as_deref())
    .bind(req.recurrence_days)
    .bind(created_by)
    .bind(&now)
    .bind(req.avulsa_tipo.as_deref().filter(|s| !s.trim().is_empty()))
    .bind(req.store_name.as_deref().filter(|s| !s.trim().is_empty()))
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    if !parts.is_empty() {
        insert_maintenance_parts(pool, &id, &parts).await?;
    } else if let Some(code) = first_code.as_deref() {
        insert_maintenance_parts(
            pool,
            &id,
            &[MaintenancePartInput {
                item_code: code.into(),
                quantity: Some(qty),
                replaced: Some(true),
                unit_cost: None,
                notes: None,
            }],
        )
        .await?;
    }

    if req.consume_stock.unwrap_or(false) {
        let to_consume: Vec<(String, f64)> = if !parts.is_empty() {
            parts
                .iter()
                .filter(|p| p.replaced.unwrap_or(true))
                .map(|p| (p.item_code.trim().to_string(), p.quantity.unwrap_or(1.0)))
                .filter(|(c, q)| !c.is_empty() && *q > 0.0)
                .collect()
        } else if let Some(code) = first_code.as_deref() {
            if qty > 0.0 {
                vec![(code.to_string(), qty)]
            } else {
                vec![]
            }
        } else {
            vec![]
        };
        for (code, q) in to_consume {
            let on_hand: f64 = sqlx::query_scalar(
                "SELECT COALESCE(qty_on_hand, 0) FROM almox_balances WHERE item_code = $1",
            )
            .bind(&code)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?
            .unwrap_or(0.0);
            let missing = (q - on_hand).max(0.0);
            if on_hand > 0.0 {
                create_movement(
                    pool,
                    created_by,
                    &CreateMovementRequest {
                        item_code: code.clone(),
                        movement_type: "saida".into(),
                        quantity: on_hand.min(q),
                        unit_cost: None,
                        reason: Some(format!("Manutenção {id}")),
                        document_ref: Some(id.clone()),
                        occurred_at: Some(occurred.to_string()),
                        allow_negative: None,
                        sector: None,
                        variant_label: None,
                        pack_label: None,
                        pack_count: None,
                        content_per_pack: None,
                        total_paid: None,
                    },
                    false,
                    None,
                )
                .await?;
            }
            if missing > 0.0 {
                let _ = create_demand(
                    pool,
                    created_by,
                    &CreateDemandRequest {
                        title: Some(format!("Peça {code}")),
                        notes: Some(format!("Faltou na manutenção {id}")),
                        origin: Some("manutencao".into()),
                        qty: Some(missing),
                        requested_by: None,
                        quoted_value: None,
                        tracking_code: None,
                        equipment_id: req.equipment_id.clone(),
                        equipment_name: None,
                        sector: None,
                        urgency: Some("urgente".into()),
                        quotes_json: None,
                        purchase_value: None,
                        store_name: None,
                        purchased_at: None,
                        status: None,
                        receipt_name: None,
                        receipt_data: None,
                        receipts_json: None,
                        items: vec![CreateDemandItemRequest {
                            item_code: code.clone(),
                            description: None,
                            qty_requested: missing,
                            unit_cost: None,
                            notes: Some(format!("Equipamento {}", req.equipment_id.as_deref().unwrap_or("Avulso"))),
                        }],
                    },
                )
                .await;
            }
        }
    }

    if let Some(eq_id) = req.equipment_id.as_deref().filter(|s| !s.trim().is_empty()) {
        if status == "concluida" {
            sqlx::query(
                "UPDATE estoque_equipamentos SET last_maintenance_at = $2, updated_at = $2 WHERE id = $1",
            )
            .bind(eq_id)
            .bind(&now)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
            spawn_next_maintenance(pool, &id).await?;
        } else if status == "em_andamento" {
            sqlx::query(
                "UPDATE estoque_equipamentos SET status = 'em_manutencao', updated_at = $2 WHERE id = $1",
            )
            .bind(eq_id)
            .bind(&now)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    list_maintenances(pool, req.equipment_id.as_deref().filter(|s| !s.trim().is_empty()))
        .await?
        .into_iter()
        .find(|m| m.id == id)
        .ok_or_else(|| "Manutenção criada, mas não listada.".into())
}

async fn spawn_next_maintenance(pool: &PgPool, id: &str) -> Result<(), String> {
    let row = sqlx::query(
        r#"
        SELECT equipment_id, kind, recurrence_days, scheduled_at, occurred_at, routine, technician
        FROM estoque_manutencoes WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Manutenção não encontrada.".to_string())?;
    let days: Option<i32> = row.try_get("recurrence_days").ok();
    let Some(days) = days.filter(|d| *d > 0) else {
        return Ok(());
    };
    let base = row
        .try_get::<Option<String>, _>("scheduled_at")
        .ok()
        .flatten()
        .or_else(|| row.try_get("occurred_at").ok());
    let Some(base) = base.as_deref().and_then(parse_iso_date) else {
        return Ok(());
    };
    let next = (base + Duration::days(days as i64)).format("%Y-%m-%d").to_string();
    let now = now_iso();
    let new_id = Uuid::new_v4().to_string();
    let eq: String = row.try_get("equipment_id").unwrap_or_default();
    let kind: String = row.try_get("kind").unwrap_or_else(|_| "preventiva".into());
    sqlx::query(
        r#"
        INSERT INTO estoque_manutencoes
          (id, equipment_id, kind, status, routine, quantity, technician, notes,
           occurred_at, scheduled_at, recurrence_days, created_at, updated_at)
        VALUES ($1,$2,$3,'pendente',$4,0,$5,$6,$7,$7,$8,$9,$9)
        "#,
    )
    .bind(&new_id)
    .bind(&eq)
    .bind(&kind)
    .bind(row.try_get::<Option<String>, _>("routine").ok().flatten())
    .bind(row.try_get::<Option<String>, _>("technician").ok().flatten())
    .bind(Some(format!("Próxima data gerada a partir da manutenção anterior.")))
    .bind(&next)
    .bind(days)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn update_maintenance(
    pool: &PgPool,
    id: &str,
    req: &UpdateMaintenanceRequest,
) -> Result<MaintenanceRow, String> {
    ensure_tables(pool).await?;
    let now = now_iso();
    let status = req.status.as_deref().map(normalize_maint_status);
    if let Some(ref s) = status {
        if !matches!(s.as_str(), "pendente" | "em_andamento" | "concluida") {
            return Err("status inválido.".into());
        }
    }
    let completed = if status.as_deref() == Some("concluida") {
        Some(
            req.completed_at
                .clone()
                .unwrap_or_else(|| now.clone()),
        )
    } else {
        req.completed_at.clone()
    };

    sqlx::query(
        r#"
        UPDATE estoque_manutencoes SET
          status = COALESCE($2, status),
          routine = COALESCE($3, routine),
          technician = COALESCE($4, technician),
          cost = COALESCE($5, cost),
          notes = COALESCE($6, notes),
          completed_at = COALESCE($7, completed_at),
          scheduled_at = COALESCE($8, scheduled_at),
          updated_at = $9
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(status.as_deref())
    .bind(req.routine.as_deref())
    .bind(req.technician.as_deref())
    .bind(req.cost)
    .bind(req.notes.as_deref())
    .bind(completed.as_deref())
    .bind(req.scheduled_at.as_deref())
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let eq_id: Option<String> =
        sqlx::query_scalar("SELECT equipment_id FROM estoque_manutencoes WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

    if let Some(eq) = &eq_id {
        if status.as_deref() == Some("concluida") {
            sqlx::query(
                "UPDATE estoque_equipamentos SET last_maintenance_at = $2, status = 'em_operacao', updated_at = $2 WHERE id = $1",
            )
            .bind(eq)
            .bind(&now)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
            spawn_next_maintenance(pool, id).await?;
        } else if status.as_deref() == Some("em_andamento") {
            sqlx::query(
                "UPDATE estoque_equipamentos SET status = 'em_manutencao', updated_at = $2 WHERE id = $1",
            )
            .bind(eq)
            .bind(&now)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    list_maintenances(pool, eq_id.as_deref())
        .await?
        .into_iter()
        .find(|m| m.id == id)
        .ok_or_else(|| "Manutenção não encontrada.".into())
}

pub async fn list_fotos(
    pool: &PgPool,
    entity_type: &str,
    entity_id: &str,
) -> Result<Vec<EstoqueFotoRow>, String> {
    ensure_tables(pool).await?;
    let rows = sqlx::query(
        r#"
        SELECT id, entity_type, entity_id, photo_data, notes, created_at
        FROM estoque_fotos
        WHERE entity_type = $1 AND entity_id = $2
        ORDER BY created_at DESC
        "#,
    )
    .bind(entity_type)
    .bind(entity_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let out = rows
        .into_iter()
        .map(|r| EstoqueFotoRow {
            id: r.try_get("id").unwrap_or_default(),
            entity_type: r.try_get("entity_type").unwrap_or_default(),
            entity_id: r.try_get("entity_id").unwrap_or_default(),
            photo_data: r.try_get("photo_data").unwrap_or_default(),
            notes: r.try_get("notes").ok(),
            created_at: r.try_get("created_at").unwrap_or_default(),
        })
        .collect();

    Ok(out)
}

pub async fn add_foto(
    pool: &PgPool,
    entity_type: &str,
    entity_id: &str,
    photo_data: &str,
    notes: Option<&str>,
) -> Result<EstoqueFotoRow, String> {
    ensure_tables(pool).await?;
    let id = Uuid::new_v4().to_string();
    let now = now_iso();

    sqlx::query(
        r#"
        INSERT INTO estoque_fotos (id, entity_type, entity_id, photo_data, notes, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(&id)
    .bind(entity_type)
    .bind(entity_id)
    .bind(photo_data)
    .bind(notes)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(EstoqueFotoRow {
        id,
        entity_type: entity_type.to_string(),
        entity_id: entity_id.to_string(),
        photo_data: photo_data.to_string(),
        notes: notes.map(|s| s.to_string()),
        created_at: now,
    })
}

pub async fn delete_foto(pool: &PgPool, id: &str) -> Result<(), String> {
    ensure_tables(pool).await?;
    sqlx::query("DELETE FROM estoque_fotos WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_item_consumption(
    pool: &PgPool,
    code: &str,
) -> Result<AlmoxConsumptionData, String> {
    ensure_tables(pool).await?;

    let local_yoy = sqlx::query(
        r#"
        SELECT COALESCE(SUBSTRING(occurred_at, 1, 4)::int, 0) AS year,
               SUM(quantity) AS quantity
        FROM almox_movements
        WHERE item_code = $1 AND movement_type = 'saida'
        GROUP BY year
        ORDER BY year DESC
        "#,
    )
    .bind(code)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let local_monthly = sqlx::query(
        r#"
        SELECT SUBSTRING(occurred_at, 1, 7) AS month,
               SUM(quantity) AS quantity
        FROM almox_movements
        WHERE item_code = $1 AND movement_type = 'saida'
        GROUP BY month
        ORDER BY month DESC
        LIMIT 24
        "#,
    )
    .bind(code)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut yoy_map: std::collections::HashMap<i32, f64> = local_yoy
        .into_iter()
        .map(|r| (r.try_get::<i32, _>("year").unwrap_or(0), r.try_get::<f64, _>("quantity").unwrap_or(0.0)))
        .collect();

    let mut monthly_map: std::collections::HashMap<String, f64> = local_monthly
        .into_iter()
        .map(|r| (r.try_get::<String, _>("month").unwrap_or_default(), r.try_get::<f64, _>("quantity").unwrap_or(0.0)))
        .collect();

    if !code.starts_with("APP_") {
        let erp_yoy = sqlx::query(
            r#"
            SELECT year, COALESCE(SUM(quantity), 0.0) AS quantity
            FROM consumption
            WHERE item_code = $1
            GROUP BY year
            "#,
        )
        .bind(code)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        for r in erp_yoy {
            let yr: i32 = r.try_get("year").unwrap_or(0);
            let qty: f64 = r.try_get("quantity").unwrap_or(0.0);
            *yoy_map.entry(yr).or_insert(0.0) += qty;
        }

        let erp_monthly = sqlx::query(
            r#"
            SELECT year, month, COALESCE(SUM(quantity), 0.0) AS quantity
            FROM consumption
            WHERE item_code = $1
            GROUP BY year, month
            "#,
        )
        .bind(code)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        for r in erp_monthly {
            let yr: i32 = r.try_get("year").unwrap_or(0);
            let mth: i32 = r.try_get("month").unwrap_or(0);
            let qty: f64 = r.try_get("quantity").unwrap_or(0.0);
            let month_str = format!("{:04}-{:02}", yr, mth);
            *monthly_map.entry(month_str).or_insert(0.0) += qty;
        }
    }

    let mut consumption_yoy: Vec<ConsumptionYoYItem> = yoy_map
        .into_iter()
        .map(|(year, quantity)| ConsumptionYoYItem { year, quantity })
        .collect();
    consumption_yoy.sort_by(|a, b| b.year.cmp(&a.year));

    let mut monthly_consumption: Vec<MonthlyConsumptionItem> = monthly_map
        .into_iter()
        .map(|(month, quantity)| MonthlyConsumptionItem { month, quantity })
        .collect();
    monthly_consumption.sort_by(|a, b| b.month.cmp(&a.month));

    Ok(AlmoxConsumptionData {
        consumption_yoy,
        monthly_consumption,
    })
}

pub async fn get_dashboard_stats(pool: &PgPool) -> Result<AlmoxDashboardStats, String> {
    ensure_tables(pool).await?;

    let item_counts = sqlx::query(
        r#"
        SELECT 
            COUNT(*)::bigint AS total,
            COUNT(*) FILTER (WHERE c.section = 'almoxarifado')::bigint AS total_almox,
            COUNT(*) FILTER (WHERE c.section = 'supermercado')::bigint AS total_supermercado,
            COUNT(*) FILTER (WHERE c.section = 'pecas')::bigint AS total_pecas,
            COUNT(*) FILTER (WHERE c.section = 'almoxarifado' AND COALESCE(b.qty_on_hand, 0) < COALESCE(c.min_qty, 0) AND COALESCE(c.min_qty, 0) > 0.0)::bigint AS below_almox,
            COUNT(*) FILTER (WHERE c.section = 'supermercado' AND COALESCE(b.qty_on_hand, 0) < COALESCE(c.min_qty, 0) AND COALESCE(c.min_qty, 0) > 0.0)::bigint AS below_super,
            COUNT(*) FILTER (WHERE c.section = 'pecas' AND COALESCE(b.qty_on_hand, 0) < COALESCE(c.min_qty, 0) AND COALESCE(c.min_qty, 0) > 0.0)::bigint AS below_pecas
        FROM almox_item_config c
        INNER JOIN items i ON c.item_code = i.code
        LEFT JOIN almox_balances b ON b.item_code = i.code
        WHERE COALESCE(i.is_ignored, 0) = 0 AND COALESCE(c.active, 0) = 1
        "#
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let total_items: i64 = item_counts.get("total");
    let total_almox_items: i64 = item_counts.get("total_almox");
    let total_supermercado_items: i64 = item_counts.get("total_supermercado");
    let total_pecas_items: i64 = item_counts.get("total_pecas");
    let almox_below_min: i64 = item_counts.get("below_almox");
    let supermercado_below_min: i64 = item_counts.get("below_super");
    let pecas_below_min: i64 = item_counts.get("below_pecas");

    let equip_counts = sqlx::query(
        r#"
        SELECT
            COUNT(*)::bigint AS total,
            COUNT(*) FILTER (WHERE status = 'em_operacao' OR status = 'ativo')::bigint AS in_op,
            COUNT(*) FILTER (WHERE status = 'em_manutencao')::bigint AS in_maint,
            COUNT(*) FILTER (WHERE status = 'parado')::bigint AS stopped
        FROM estoque_equipamentos
        "#
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let total_equipments: i64 = equip_counts.get("total");
    let equipments_in_operation: i64 = equip_counts.get("in_op");
    let equipments_in_maintenance: i64 = equip_counts.get("in_maint");
    let equipments_stopped: i64 = equip_counts.get("stopped");

    let open_maintenances: i64 = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM estoque_manutencoes WHERE status IN ('pendente', 'em_andamento')"
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let pieces = sqlx::query(
        r#"
        SELECT p.next_exchange_at, p.expires_at 
        FROM estoque_peca_meta p
        INNER JOIN almox_item_config c ON c.item_code = p.item_code
        INNER JOIN items i ON c.item_code = i.code
        WHERE COALESCE(i.is_ignored, 0) = 0 AND COALESCE(c.active, 0) = 1
        "#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut pecas_overdue = 0;
    let mut pecas_due_soon = 0;

    for row in pieces {
        let next_ex: Option<String> = row.get(0);
        let expires: Option<String> = row.get(1);
        if let Some(status) = exchange_status(next_ex.as_deref(), expires.as_deref()) {
            if status == "overdue" {
                pecas_overdue += 1;
            } else if status == "due_soon" {
                pecas_due_soon += 1;
            }
        }
    }

    Ok(AlmoxDashboardStats {
        total_items,
        total_almox_items,
        total_supermercado_items,
        total_pecas_items,
        almox_below_min,
        supermercado_below_min,
        pecas_below_min,
        pecas_overdue,
        pecas_due_soon,
        total_equipments,
        equipments_in_operation,
        equipments_in_maintenance,
        equipments_stopped,
        open_maintenances,
    })
}

pub async fn list_familias(pool: &PgPool) -> Result<Vec<AlmoxFamilia>, String> {
    ensure_tables(pool).await?;
    let rows = sqlx::query(
        "SELECT id, label, icon, color, sort_order FROM almox_familias ORDER BY sort_order ASC, label ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|r| AlmoxFamilia {
            id: r.try_get("id").unwrap_or_default(),
            label: r.try_get("label").unwrap_or_default(),
            icon: r.try_get("icon").ok(),
            color: r.try_get("color").ok(),
            sort_order: r.try_get("sort_order").ok(),
        })
        .collect())
}

pub async fn upsert_familia(pool: &PgPool, fam: &AlmoxFamilia) -> Result<AlmoxFamilia, String> {
    ensure_tables(pool).await?;
    let id = fam.id.trim().to_lowercase();
    if id.is_empty() {
        return Err("Identificador da família não pode ser vazio.".into());
    }
    let label = fam.label.trim();
    if label.is_empty() {
        return Err("Nome da família não pode ser vazio.".into());
    }

    sqlx::query(
        r#"
        INSERT INTO almox_familias (id, label, icon, color, sort_order)
        VALUES ($1, $2, $3, $4, COALESCE($5, 0))
        ON CONFLICT (id) DO UPDATE SET
          label = $2,
          icon = COALESCE($3, almox_familias.icon),
          color = COALESCE($4, almox_familias.color),
          sort_order = COALESCE($5, almox_familias.sort_order)
        "#,
    )
    .bind(&id)
    .bind(label)
    .bind(fam.icon.as_deref())
    .bind(fam.color.as_deref())
    .bind(fam.sort_order)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(AlmoxFamilia {
        id,
        label: label.to_string(),
        icon: fam.icon.clone(),
        color: fam.color.clone(),
        sort_order: fam.sort_order,
    })
}

pub async fn delete_familia(pool: &PgPool, id: &str) -> Result<(), String> {
    ensure_tables(pool).await?;
    let id = id.trim().to_lowercase();
    // Move os itens dessa família para 'outros'
    let _ = sqlx::query("UPDATE almox_item_config SET section = 'outros' WHERE section = $1")
        .bind(&id)
        .execute(pool)
        .await;

    sqlx::query("DELETE FROM almox_familias WHERE id = $1")
        .bind(&id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn delete_item(pool: &PgPool, code: &str) -> Result<(), String> {
    ensure_tables(pool).await?;
    let code = code.trim();
    if code.is_empty() {
        return Err("Código do item não pode ser vazio.".into());
    }

    // 1. Remove fotos associadas
    let _ = sqlx::query("DELETE FROM estoque_fotos WHERE entity_type = 'item' AND entity_id = $1")
        .bind(code)
        .execute(pool)
        .await;

    // 2. Remove meta de peças
    let _ = sqlx::query("DELETE FROM estoque_peca_meta WHERE item_code = $1")
        .bind(code)
        .execute(pool)
        .await;

    // 3. Remove vínculos com manutenções de peças
    let _ = sqlx::query("DELETE FROM estoque_manutencao_pecas WHERE item_code = $1")
        .bind(code)
        .execute(pool)
        .await;

    // 4. Remove lançamentos de contagem e movimentações operacionais
    let _ = sqlx::query("DELETE FROM almox_count_entries WHERE item_code = $1")
        .bind(code)
        .execute(pool)
        .await;

    let _ = sqlx::query("DELETE FROM almox_movements WHERE item_code = $1")
        .bind(code)
        .execute(pool)
        .await;

    let _ = sqlx::query("DELETE FROM almox_balances WHERE item_code = $1")
        .bind(code)
        .execute(pool)
        .await;

    let _ = sqlx::query("DELETE FROM almox_purchase_demand_items WHERE item_code = $1")
        .bind(code)
        .execute(pool)
        .await;

    // 5. Remove configuração do almoxarifado
    sqlx::query("DELETE FROM almox_item_config WHERE item_code = $1")
        .bind(code)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    // 6. Tenta excluir do cadastro geral (items). Se falhar por FK histórica, ignora o item.
    if let Err(_) = sqlx::query("DELETE FROM items WHERE code = $1").bind(code).execute(pool).await {
        let _ = sqlx::query("UPDATE items SET is_ignored = 1 WHERE code = $1").bind(code).execute(pool).await;
    }

    Ok(())
}

pub async fn get_print_sequence(pool: &PgPool) -> Result<i64, String> {
    ensure_tables(pool).await?;
    let _ = sqlx::query("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
        .execute(pool)
        .await;

    let setting: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'almox_last_printed_slip_seq'")
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

    let from_settings: i64 = setting
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);

    let rows: Vec<Option<String>> = sqlx::query_scalar(
        "SELECT tracking_code FROM almox_purchase_demands WHERE tracking_code IS NOT NULL"
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let mut max_demand: i64 = 0;
    for tc in rows.into_iter().flatten() {
        if let Some(pos) = tc.rfind('-') {
            if let Ok(num) = tc[pos + 1..].parse::<i64>() {
                if num > max_demand {
                    max_demand = num;
                }
            }
        }
    }

    Ok(from_settings.max(max_demand))
}

pub async fn set_print_sequence(pool: &PgPool, last_seq: i64) -> Result<(), String> {
    ensure_tables(pool).await?;
    let _ = sqlx::query("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
        .execute(pool)
        .await;

    sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('almox_last_printed_slip_seq', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
    )
    .bind(last_seq.to_string())
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn register_printed_slips(
    pool: &PgPool,
    start_seq: i64,
    count: i64,
    year: i32,
    created_by: Option<&str>,
) -> Result<Vec<PurchaseDemandRow>, String> {
    ensure_tables(pool).await?;
    let _ = sqlx::query("ALTER TABLE almox_purchase_demands DROP CONSTRAINT IF EXISTS almox_purchase_demands_status_check")
        .execute(pool)
        .await;

    let now = now_iso();
    let mut result = Vec::new();
    let last_num = start_seq + count - 1;

    for num in start_seq..=last_num {
        let tracking_code = format!("SOL-{}-{:04}", year, num);

        let existing: Option<String> = sqlx::query_scalar(
            "SELECT id FROM almox_purchase_demands WHERE tracking_code = $1 LIMIT 1"
        )
        .bind(&tracking_code)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

        if let Some(eid) = existing {
            if let Ok(d) = load_demand(pool, &eid).await {
                result.push(d);
            }
            continue;
        }

        let id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO almox_purchase_demands
              (id, status, title, notes, created_by, created_at, updated_at, origin, qty, tracking_code, urgency)
            VALUES ($1, 'impresso', $2, $3, $4, $5, $5, 'talao', 1.0, $6, 'normal')
            "#
        )
        .bind(&id)
        .bind("Talão Físico Emitido")
        .bind("Talão impresso para uso no chão de fábrica. Aguardando lançamento de requisição física.")
        .bind(created_by)
        .bind(&now)
        .bind(&tracking_code)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

        let iid = Uuid::new_v4().to_string();
        let _ = sqlx::query(
            r#"
            INSERT INTO almox_purchase_demand_items
              (id, demand_id, description, qty_requested)
            VALUES ($1, $2, 'Aguardando preenchimento no chão de fábrica', 1.0)
            "#
        )
        .bind(&iid)
        .bind(&id)
        .execute(pool)
        .await;

        if let Ok(d) = load_demand(pool, &id).await {
            result.push(d);
        }
    }

    let _ = set_print_sequence(pool, last_num).await;
    Ok(result)
}


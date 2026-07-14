use chrono::{Duration, Utc};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use super::models::*;

/// Verifica tabelas almox_* + ops. DDL: `002_almoxarifado.sql` e `003_estoque_ops.sql`.
pub async fn ensure_tables(pool: &PgPool) -> Result<(), String> {
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

    Ok(())
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn normalize_section(s: &str) -> Result<String, String> {
    let v = s.trim().to_lowercase();
    match v.as_str() {
        "almoxarifado" | "supermercado" | "pecas" => Ok(v),
        _ => Err("section inválida. Use almoxarifado, supermercado ou pecas.".into()),
    }
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
    if section.is_some() {
        sql.push_str(" AND c.section = $1 ");
    }
    sql.push_str(" ORDER BY i.description ");

    let rows = if let Some(sec) = section.as_deref() {
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
           description, unit, created_at, updated_at)
        VALUES ($1, COALESCE($2, 1), COALESCE($3, 0), COALESCE($4, 0), $5, $6,
                COALESCE($7, 'almoxarifado'), 'erp', $8, $9, $10, $10)
        ON CONFLICT (item_code) DO UPDATE SET
          active = COALESCE($2, almox_item_config.active),
          min_qty = COALESCE($3, almox_item_config.min_qty),
          ideal_qty = COALESCE($4, almox_item_config.ideal_qty),
          location = COALESCE($5, almox_item_config.location),
          notes = COALESCE($6, almox_item_config.notes),
          section = COALESCE($7, almox_item_config.section),
          description = COALESCE($8, almox_item_config.description),
          unit = COALESCE($9, almox_item_config.unit),
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
    if section != "supermercado" {
        return Err(
            "Cadastro local (APP_*) permitido apenas no Supermercado. \
             Demais seções vinculam itens do ERP."
                .into(),
        );
    }
    let desc = req.description.trim();
    if desc.is_empty() {
        return Err("Descrição obrigatória.".into());
    }
    let unit = if req.unit.trim().is_empty() {
        "UN".to_string()
    } else {
        req.unit.trim().to_string()
    };
    let code = format!("APP_{}", &Uuid::new_v4().to_string().replace('-', "")[..10].to_uppercase());
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
           variant_label, pack_label, pack_count, content_per_pack, total_paid)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
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
               m.variant_label, m.pack_label, m.pack_count, m.content_per_pack, m.total_paid
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
        SELECT id, status, title, notes, created_by, created_at, updated_at, received_at
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
               d.qty_requested, d.qty_received, d.unit_cost, d.notes
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
        items: items
            .into_iter()
            .map(|x| PurchaseDemandItemRow {
                id: x.try_get("id").unwrap_or_default(),
                demand_id: x.try_get("demand_id").unwrap_or_default(),
                item_code: x.try_get("item_code").unwrap_or_default(),
                item_description: x.try_get("item_description").ok(),
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
        LIMIT 100
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
    if req.items.is_empty() {
        return Err("Informe ao menos um item na demanda.".into());
    }
    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    sqlx::query(
        r#"
        INSERT INTO almox_purchase_demands (id, status, title, notes, created_by, created_at, updated_at)
        VALUES ($1, 'aberta', $2, $3, $4, $5, $5)
        "#,
    )
    .bind(&id)
    .bind(req.title.as_deref())
    .bind(req.notes.as_deref())
    .bind(created_by)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    for it in &req.items {
        if it.qty_requested <= 0.0 {
            continue;
        }
        let iid = Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO almox_purchase_demand_items
              (id, demand_id, item_code, qty_requested, qty_received, unit_cost, notes)
            VALUES ($1,$2,$3,$4,0,$5,$6)
            "#,
        )
        .bind(&iid)
        .bind(&id)
        .bind(it.item_code.trim())
        .bind(it.qty_requested)
        .bind(it.unit_cost)
        .bind(it.notes.as_deref())
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
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
    if !matches!(st.as_str(), "aberta" | "pedida" | "recebida" | "cancelada") {
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

pub async fn create_demands_from_replenishment(
    pool: &PgPool,
    created_by: Option<&str>,
) -> Result<PurchaseDemandRow, String> {
    let stats = list_replenishment(pool).await?;
    if stats.is_empty() {
        return Err("Nenhum item abaixo do mínimo.".into());
    }
    let items: Vec<CreateDemandItemRequest> = stats
        .into_iter()
        .filter(|s| s.suggested_buy_qty > 0.0)
        .map(|s| CreateDemandItemRequest {
            item_code: s.item_code,
            qty_requested: s.suggested_buy_qty,
            unit_cost: None,
            notes: Some(format!("Auto: média 30d={:.3}/dia", s.avg_daily_out_30)),
        })
        .collect();
    create_demand(
        pool,
        created_by,
        &CreateDemandRequest {
            title: Some("Reposição automática (abaixo do mínimo)".into()),
            notes: None,
            items,
        },
    )
    .await
}

// --- Equipamentos ---

pub async fn list_equipments(pool: &PgPool) -> Result<Vec<EquipmentRow>, String> {
    ensure_tables(pool).await?;
    let rows = sqlx::query(
        r#"
        SELECT id, code, name, sector, status, maintenance_interval_days,
               last_maintenance_at, next_maintenance_at, notes
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
        out.push(EquipmentRow {
            id,
            code: r.try_get("code").unwrap_or_default(),
            name: r.try_get("name").unwrap_or_default(),
            sector: r.try_get("sector").ok(),
            status: r.try_get("status").unwrap_or_else(|_| "em_operacao".into()),
            maintenance_interval_days: r.try_get("maintenance_interval_days").ok(),
            last_maintenance_at: r.try_get("last_maintenance_at").ok(),
            next_maintenance_at: r.try_get("next_maintenance_at").ok(),
            notes: r.try_get("notes").ok(),
            peca_codes: pecas,
        });
    }
    Ok(out)
}

pub async fn upsert_equipment(
    pool: &PgPool,
    id: Option<&str>,
    req: &UpsertEquipmentRequest,
) -> Result<EquipmentRow, String> {
    ensure_tables(pool).await?;
    let status = req
        .status
        .as_deref()
        .unwrap_or("em_operacao")
        .trim()
        .to_lowercase();
    if !matches!(status.as_str(), "em_operacao" | "em_manutencao" | "parado") {
        return Err("status inválido.".into());
    }
    let now = now_iso();
    let eid = id
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    if id.is_some() {
        sqlx::query(
            r#"
            UPDATE estoque_equipamentos SET
              code = $2, name = $3, sector = $4, status = $5,
              maintenance_interval_days = $6, next_maintenance_at = $7, notes = $8, updated_at = $9
            WHERE id = $1
            "#,
        )
        .bind(&eid)
        .bind(req.code.trim())
        .bind(req.name.trim())
        .bind(req.sector.as_deref())
        .bind(&status)
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
              (id, code, name, sector, status, maintenance_interval_days, next_maintenance_at, notes, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
            "#,
        )
        .bind(&eid)
        .bind(req.code.trim())
        .bind(req.name.trim())
        .bind(req.sector.as_deref())
        .bind(&status)
        .bind(req.maintenance_interval_days)
        .bind(req.next_maintenance_at.as_deref())
        .bind(req.notes.as_deref())
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    if let Some(codes) = &req.peca_codes {
        sqlx::query("DELETE FROM estoque_equipamento_pecas WHERE equipment_id = $1")
            .bind(&eid)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        for c in codes {
            let code = c.trim();
            if code.is_empty() {
                continue;
            }
            sqlx::query(
                "INSERT INTO estoque_equipamento_pecas (equipment_id, item_code) VALUES ($1,$2) ON CONFLICT DO NOTHING",
            )
            .bind(&eid)
            .bind(code)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    list_equipments(pool)
        .await?
        .into_iter()
        .find(|e| e.id == eid)
        .ok_or_else(|| "Equipamento salvo, mas não listado.".into())
}

pub async fn list_maintenances(
    pool: &PgPool,
    equipment_id: Option<&str>,
) -> Result<Vec<MaintenanceRow>, String> {
    ensure_tables(pool).await?;
    let sql = r#"
        SELECT m.*, e.code AS equipment_code, e.name AS equipment_name,
               i.description AS item_description
        FROM estoque_manutencoes m
        JOIN estoque_equipamentos e ON e.id = m.equipment_id
        LEFT JOIN items i ON i.code = m.item_code
        WHERE ($1::text IS NULL OR m.equipment_id = $1)
        ORDER BY m.occurred_at DESC
    "#;
    let rows = sqlx::query(sql)
        .bind(equipment_id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|r| MaintenanceRow {
            id: r.try_get("id").unwrap_or_default(),
            equipment_id: r.try_get("equipment_id").unwrap_or_default(),
            equipment_code: r.try_get("equipment_code").ok(),
            equipment_name: r.try_get("equipment_name").ok(),
            kind: r.try_get("kind").unwrap_or_default(),
            status: r.try_get("status").unwrap_or_default(),
            item_code: r.try_get("item_code").ok(),
            item_description: r.try_get("item_description").ok(),
            quantity: r.try_get("quantity").unwrap_or(0.0),
            technician: r.try_get("technician").ok(),
            cost: r.try_get("cost").ok(),
            notes: r.try_get("notes").ok(),
            occurred_at: r.try_get("occurred_at").unwrap_or_default(),
            completed_at: r.try_get("completed_at").ok(),
            created_by: r.try_get("created_by").ok(),
            created_at: r.try_get("created_at").unwrap_or_default(),
        })
        .collect())
}

pub async fn create_maintenance(
    pool: &PgPool,
    created_by: Option<&str>,
    req: &CreateMaintenanceRequest,
) -> Result<MaintenanceRow, String> {
    ensure_tables(pool).await?;
    let kind = req.kind.trim().to_lowercase();
    if !matches!(kind.as_str(), "preventiva" | "corretiva" | "preditiva") {
        return Err("kind inválido.".into());
    }
    let status = req
        .status
        .as_deref()
        .unwrap_or("pendente")
        .trim()
        .to_lowercase();
    let now = now_iso();
    let occurred = req
        .occurred_at
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or(&now);
    let id = Uuid::new_v4().to_string();
    let qty = req.quantity.unwrap_or(0.0);

    sqlx::query(
        r#"
        INSERT INTO estoque_manutencoes
          (id, equipment_id, kind, status, item_code, quantity, technician, cost, notes,
           occurred_at, created_by, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
        "#,
    )
    .bind(&id)
    .bind(&req.equipment_id)
    .bind(&kind)
    .bind(&status)
    .bind(req.item_code.as_deref())
    .bind(qty)
    .bind(req.technician.as_deref())
    .bind(req.cost)
    .bind(req.notes.as_deref())
    .bind(occurred)
    .bind(created_by)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    if req.consume_stock.unwrap_or(false) {
        if let Some(code) = req.item_code.as_deref().filter(|c| !c.is_empty()) {
            if qty > 0.0 {
                create_movement(
                    pool,
                    created_by,
                    &CreateMovementRequest {
                        item_code: code.into(),
                        movement_type: "saida".into(),
                        quantity: qty,
                        unit_cost: None,
                        reason: Some(format!("Manutenção {id}")),
                        document_ref: Some(id.clone()),
                        occurred_at: Some(occurred.to_string()),
                        allow_negative: None,
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
        }
    }

    list_maintenances(pool, None)
        .await?
        .into_iter()
        .find(|m| m.id == id)
        .ok_or_else(|| "Manutenção criada, mas não listada.".into())
}

pub async fn update_maintenance(
    pool: &PgPool,
    id: &str,
    req: &UpdateMaintenanceRequest,
) -> Result<MaintenanceRow, String> {
    ensure_tables(pool).await?;
    let now = now_iso();
    let status = req.status.as_deref().map(|s| s.trim().to_lowercase());
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
          technician = COALESCE($3, technician),
          cost = COALESCE($4, cost),
          notes = COALESCE($5, notes),
          completed_at = COALESCE($6, completed_at),
          updated_at = $7
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(status.as_deref())
    .bind(req.technician.as_deref())
    .bind(req.cost)
    .bind(req.notes.as_deref())
    .bind(completed.as_deref())
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    if status.as_deref() == Some("concluida") {
        let eq_id: Option<String> =
            sqlx::query_scalar("SELECT equipment_id FROM estoque_manutencoes WHERE id = $1")
                .bind(id)
                .fetch_optional(pool)
                .await
                .map_err(|e| e.to_string())?;
        if let Some(eq) = eq_id {
            sqlx::query(
                "UPDATE estoque_equipamentos SET last_maintenance_at = $2, updated_at = $2 WHERE id = $1",
            )
            .bind(&eq)
            .bind(&now)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    list_maintenances(pool, None)
        .await?
        .into_iter()
        .find(|m| m.id == id)
        .ok_or_else(|| "Manutenção não encontrada.".into())
}

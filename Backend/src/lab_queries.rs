use sqlx::{PgPool, Row};
use crate::{
    Product, Report, FiscoQuimicaPattern, FiscoQuimicaAgent, FiscoQuimicaAnalysis,
};

pub async fn get_microbio_config_query(pool: PgPool) -> Result<Option<serde_json::Value>, String> {
    let res: Result<String, sqlx::Error> =
        sqlx::query_scalar("SELECT value FROM config WHERE key = 'microbio_main'")
            .fetch_one(&pool)
            .await;

    match res {
        Ok(val) => {
            let config: serde_json::Value = serde_json::from_str(&val).map_err(|e| e.to_string())?;
            Ok(Some(config))
        }
        Err(sqlx::Error::RowNotFound) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn save_config_microbio_query(pool: PgPool, config: &serde_json::Value) -> Result<(), String> {
    let val = serde_json::to_string(config).map_err(|e| e.to_string())?;
    sqlx::query(
        "INSERT INTO config (key, value) VALUES ('microbio_main', $1)
         ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
    )
    .bind(val)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_fisco_config_query(pool: PgPool) -> Result<Option<serde_json::Value>, String> {
    let res: Result<String, sqlx::Error> =
        sqlx::query_scalar("SELECT value FROM config WHERE key = 'fisco_main'")
            .fetch_one(&pool)
            .await;

    match res {
        Ok(val) => {
            let config: serde_json::Value = serde_json::from_str(&val).map_err(|e| e.to_string())?;
            Ok(Some(config))
        }
        Err(sqlx::Error::RowNotFound) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn save_config_fisco_query(pool: PgPool, config: &serde_json::Value) -> Result<(), String> {
    let val = serde_json::to_string(config).map_err(|e| e.to_string())?;
    sqlx::query(
        "INSERT INTO config (key, value) VALUES ('fisco_main', $1)
         ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
    )
    .bind(val)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_products_query(pool: PgPool) -> Result<Vec<Product>, String> {
    let rows = sqlx::query("SELECT code, name, packaging, validity FROM products")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| Product {
            code: row.get(0),
            name: row.get(1),
            packaging: row.get(2),
            validity: row.get(3),
        })
        .collect())
}

pub async fn save_product_query(pool: PgPool, product: &Product) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO products (code, name, packaging, validity) VALUES ($1, $2, $3, $4)
         ON CONFLICT(code) DO UPDATE SET name = EXCLUDED.name, packaging = EXCLUDED.packaging, validity = EXCLUDED.validity",
    )
    .bind(&product.code)
    .bind(&product.name)
    .bind(&product.packaging)
    .bind(&product.validity)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn delete_product_query(pool: PgPool, code: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM products WHERE code = $1")
        .bind(code)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_reports_query(pool: PgPool) -> Result<Vec<Report>, String> {
    let _ = sqlx::query(r#"ALTER TABLE reports ADD COLUMN IF NOT EXISTS "manufacturingDate" TEXT"#)
        .execute(&pool)
        .await;

    let _ = sqlx::query(r#"ALTER TABLE reports ADD COLUMN IF NOT EXISTS "manufacturingDate" TEXT, ADD COLUMN IF NOT EXISTS printed BOOLEAN DEFAULT FALSE, ADD COLUMN IF NOT EXISTS "printedAt" TEXT"#)
        .execute(&pool)
        .await;

    let rows = sqlx::query(
        r#"SELECT id, "reportId", "reportRawNum", "productCode", "productName", batch, "collectionDate", technician, "createdAt", "manufacturingDate", printed, "printedAt"
           FROM reports ORDER BY "reportRawNum" DESC LIMIT 5000"#,
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| Report {
            id: row.get(0),
            report_id: row.get(1),
            report_raw_num: crate::core::pg_row::pg_i32(&row, 2),
            product_code: row.get(3),
            product_name: row.get(4),
            batch: row.get(5),
            collection_date: row.get(6),
            technician: row.get(7),
            created_at: row.get(8),
            manufacturing_date: row.try_get(9).ok(),
            printed: row.try_get(10).ok(),
            printed_at: row.try_get(11).ok(),
        })
        .collect())
}

pub async fn save_reports_query(pool: PgPool, reports: &[Report]) -> Result<(), String> {
    let _ = sqlx::query(r#"ALTER TABLE reports ADD COLUMN IF NOT EXISTS "manufacturingDate" TEXT, ADD COLUMN IF NOT EXISTS printed BOOLEAN DEFAULT FALSE, ADD COLUMN IF NOT EXISTS "printedAt" TEXT"#)
        .execute(&pool)
        .await;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for report in reports {
        let is_printed = report.printed.unwrap_or(false);
        let batch_trimmed = report.batch.trim();
        
        // Verifica se o lote + produto já foi registrado em outro relatório anteriormente
        if !batch_trimmed.is_empty() {
            let product_code_trimmed = report.product_code.trim();
            let existing: Option<(String, String)> = if !product_code_trimmed.is_empty() {
                sqlx::query_as(
                    r#"SELECT id, "reportId" FROM reports WHERE LOWER(TRIM(batch)) = LOWER($1) AND LOWER(TRIM("productCode")) = LOWER($2) AND id != $3 LIMIT 1"#
                )
                .bind(batch_trimmed)
                .bind(product_code_trimmed)
                .bind(&report.id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?
            } else {
                sqlx::query_as(
                    r#"SELECT id, "reportId" FROM reports WHERE LOWER(TRIM(batch)) = LOWER($1) AND id != $2 LIMIT 1"#
                )
                .bind(batch_trimmed)
                .bind(&report.id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?
            };

            if let Some((_exist_id, exist_rep_id)) = existing {
                let p_name = if !report.product_name.trim().is_empty() {
                    format!(" ({})", report.product_name.trim())
                } else if !product_code_trimmed.is_empty() {
                    format!(" [{}]", product_code_trimmed)
                } else {
                    "".to_string()
                };
                return Err(format!("Lote '{}'{} já foi cadastrado anteriormente no laudo {}. Não é permitido registrar laudos duplicados para o mesmo produto.", batch_trimmed, p_name, exist_rep_id));
            }
        }

        sqlx::query(
            r#"INSERT INTO reports (id, "reportId", "reportRawNum", "productCode", "productName", batch, "collectionDate", technician, "createdAt", "manufacturingDate", printed, "printedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP::TEXT, $9, $10, $11)
             ON CONFLICT(id) DO UPDATE SET
                "reportId" = EXCLUDED."reportId",
                "reportRawNum" = EXCLUDED."reportRawNum",
                "productCode" = EXCLUDED."productCode",
                "productName" = EXCLUDED."productName",
                batch = EXCLUDED.batch,
                "collectionDate" = EXCLUDED."collectionDate",
                technician = EXCLUDED.technician,
                "createdAt" = CURRENT_TIMESTAMP::TEXT,
                "manufacturingDate" = EXCLUDED."manufacturingDate",
                printed = EXCLUDED.printed,
                "printedAt" = EXCLUDED."printedAt""#,
        )
        .bind(&report.id)
        .bind(&report.report_id)
        .bind(report.report_raw_num)
        .bind(&report.product_code)
        .bind(&report.product_name)
        .bind(&report.batch)
        .bind(&report.collection_date)
        .bind(&report.technician)
        .bind(&report.manufacturing_date)
        .bind(is_printed)
        .bind(&report.printed_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn update_reports_printed_query(
    pool: PgPool,
    report_ids: &[String],
    printed: bool,
) -> Result<(), String> {
    let now = chrono::Local::now().to_rfc3339();
    let printed_at = if printed { Some(now) } else { None };

    sqlx::query(
        r#"UPDATE reports 
           SET printed = $1, "printedAt" = $2 
           WHERE id = ANY($3)"#,
    )
    .bind(printed)
    .bind(printed_at)
    .bind(report_ids)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn delete_report_query(pool: PgPool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM reports WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn delete_all_products_query(pool: PgPool) -> Result<(), String> {
    sqlx::query("DELETE FROM products")
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_fisco_quimica_patterns_query(pool: PgPool) -> Result<Vec<FiscoQuimicaPattern>, String> {
    let _ = sqlx::query("ALTER TABLE fisco_quimica_patterns ADD COLUMN IF NOT EXISTS aspect TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE fisco_quimica_patterns ADD COLUMN IF NOT EXISTS color TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE fisco_quimica_patterns ADD COLUMN IF NOT EXISTS odor TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE fisco_quimica_patterns ADD COLUMN IF NOT EXISTS image_url TEXT").execute(&pool).await;

    let rows = sqlx::query(
        "SELECT product_code, ph_min, ph_max, viscosity_min, viscosity_max, density_target, density_tolerance, package_volume, package_unit, aspect, color, odor, image_url FROM fisco_quimica_patterns",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut patterns = Vec::new();
    for row in rows {
        let p_code: String = row.get(0);
        let agent_rows = sqlx::query(
            "SELECT agent_id FROM fisco_quimica_product_agents WHERE product_code = $1",
        )
        .bind(&p_code)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        let allowed_agents: Vec<String> = agent_rows.into_iter().map(|r| r.get(0)).collect();

        patterns.push(FiscoQuimicaPattern {
            product_code: p_code,
            ph_min: row.get(1),
            ph_max: row.get(2),
            viscosity_min: row.get(3),
            viscosity_max: row.get(4),
            density_target: row.get(5),
            density_tolerance: row.get(6),
            package_volume: row.get(7),
            package_unit: row.get(8),
            allowed_agents: Some(allowed_agents),
            aspect: row.try_get(9).ok(),
            color: row.try_get(10).ok(),
            odor: row.try_get(11).ok(),
            image_url: row.try_get(12).ok(),
        });
    }
    Ok(patterns)
}

pub async fn save_fisco_quimica_pattern_query(pool: PgPool, pattern: &FiscoQuimicaPattern) -> Result<(), String> {
    let _ = sqlx::query("ALTER TABLE fisco_quimica_patterns ADD COLUMN IF NOT EXISTS aspect TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE fisco_quimica_patterns ADD COLUMN IF NOT EXISTS color TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE fisco_quimica_patterns ADD COLUMN IF NOT EXISTS odor TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE fisco_quimica_patterns ADD COLUMN IF NOT EXISTS image_url TEXT").execute(&pool).await;

    sqlx::query(
        "INSERT INTO fisco_quimica_patterns (product_code, ph_min, ph_max, viscosity_min, viscosity_max, density_target, density_tolerance, package_volume, package_unit, aspect, color, odor, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT(product_code) DO UPDATE SET
            ph_min = EXCLUDED.ph_min,
            ph_max = EXCLUDED.ph_max,
            viscosity_min = EXCLUDED.viscosity_min,
            viscosity_max = EXCLUDED.viscosity_max,
            density_target = EXCLUDED.density_target,
            density_tolerance = EXCLUDED.density_tolerance,
            package_volume = EXCLUDED.package_volume,
            package_unit = EXCLUDED.package_unit,
            aspect = EXCLUDED.aspect,
            color = EXCLUDED.color,
            odor = EXCLUDED.odor,
            image_url = EXCLUDED.image_url",
    )
    .bind(&pattern.product_code)
    .bind(pattern.ph_min)
    .bind(pattern.ph_max)
    .bind(pattern.viscosity_min)
    .bind(pattern.viscosity_max)
    .bind(pattern.density_target)
    .bind(pattern.density_tolerance)
    .bind(pattern.package_volume)
    .bind(&pattern.package_unit)
    .bind(&pattern.aspect)
    .bind(&pattern.color)
    .bind(&pattern.odor)
    .bind(&pattern.image_url)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(ref agents) = pattern.allowed_agents {
        sqlx::query("DELETE FROM fisco_quimica_product_agents WHERE product_code = $1")
            .bind(&pattern.product_code)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
        for agent_id in agents {
            sqlx::query(
                "INSERT INTO fisco_quimica_product_agents (product_code, agent_id) VALUES ($1, $2)
                 ON CONFLICT DO NOTHING",
            )
            .bind(&pattern.product_code)
            .bind(agent_id)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub async fn delete_fisco_quimica_pattern_query(pool: PgPool, code: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM fisco_quimica_product_agents WHERE product_code = $1")
        .bind(code)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM fisco_quimica_patterns WHERE product_code = $1")
        .bind(code)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_fisco_quimica_agents_query(pool: PgPool) -> Result<Vec<FiscoQuimicaAgent>, String> {
    let _ = sqlx::query("ALTER TABLE fisco_quimica_corrective_agents ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'VISCOSIDADE'")
        .execute(&pool)
        .await;

    let rows = sqlx::query(
        "SELECT id, name, category, created_at FROM fisco_quimica_corrective_agents ORDER BY name",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| FiscoQuimicaAgent {
            id: row.get(0),
            name: row.get(1),
            category: row.get(2),
            created_at: row.get(3),
        })
        .collect())
}

pub async fn save_fisco_quimica_agent_query(pool: PgPool, agent: &FiscoQuimicaAgent) -> Result<(), String> {
    let _ = sqlx::query("ALTER TABLE fisco_quimica_corrective_agents ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'VISCOSIDADE'")
        .execute(&pool)
        .await;

    let cat = agent.category.as_deref().unwrap_or("VISCOSIDADE");

    sqlx::query(
        "INSERT INTO fisco_quimica_corrective_agents (id, name, category) VALUES ($1, $2, $3)
         ON CONFLICT(id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category",
    )
    .bind(&agent.id)
    .bind(&agent.name)
    .bind(cat)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn delete_fisco_quimica_agent_query(pool: PgPool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM fisco_quimica_corrective_agents WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Colunas que o Físico-Químico foi ganhando ao longo do tempo (as quatro primeiras só existiam
/// em produção). Roda uma vez por processo: antes isso era refeito a cada GET/POST.
async fn garantir_colunas_analises(pool: &PgPool) {
    use std::sync::atomic::{AtomicBool, Ordering};
    static FEITO: AtomicBool = AtomicBool::new(false);
    if FEITO.load(Ordering::Relaxed) {
        return;
    }
    for ddl in [
        "ALTER TABLE fisco_quimica_analyses ADD COLUMN IF NOT EXISTS fabricated_by TEXT",
        "ALTER TABLE fisco_quimica_analyses ADD COLUMN IF NOT EXISTS authorized_by TEXT",
        "ALTER TABLE fisco_quimica_analyses ADD COLUMN IF NOT EXISTS synced_to_erp BOOLEAN DEFAULT FALSE",
        "ALTER TABLE fisco_quimica_analyses ADD COLUMN IF NOT EXISTS erp_synced_at TIMESTAMP",
        "ALTER TABLE fisco_quimica_analyses ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'CONFORME'",
        "ALTER TABLE fisco_quimica_analyses ADD COLUMN IF NOT EXISTS media_url TEXT",
        "ALTER TABLE fisco_quimica_analyses ADD COLUMN IF NOT EXISTS aspect_ok BOOLEAN DEFAULT TRUE",
        "ALTER TABLE fisco_quimica_analyses ADD COLUMN IF NOT EXISTS aspect_result TEXT DEFAULT 'CONFORME'",
        "ALTER TABLE fisco_quimica_analyses ADD COLUMN IF NOT EXISTS color_ok BOOLEAN DEFAULT TRUE",
        "ALTER TABLE fisco_quimica_analyses ADD COLUMN IF NOT EXISTS color_result TEXT DEFAULT 'CONFORME'",
        "ALTER TABLE fisco_quimica_analyses ADD COLUMN IF NOT EXISTS odor_ok BOOLEAN DEFAULT TRUE",
        "ALTER TABLE fisco_quimica_analyses ADD COLUMN IF NOT EXISTS odor_result TEXT DEFAULT 'CARACTERÍSTICO'",
        "ALTER TABLE fisco_quimica_analyses ADD COLUMN IF NOT EXISTS viscometer_model TEXT",
        "ALTER TABLE fisco_quimica_analyses ADD COLUMN IF NOT EXISTS viscometer_spindle TEXT",
        "ALTER TABLE fisco_quimica_analyses ADD COLUMN IF NOT EXISTS viscometer_rpm DOUBLE PRECISION",
        "ALTER TABLE fisco_quimica_analyses ADD COLUMN IF NOT EXISTS viscometer_seconds INTEGER",
        "UPDATE fisco_quimica_analyses SET status = 'EM_CORRECAO' WHERE (notes LIKE '%[STATUS: EM CORREÇÃO]%' OR notes LIKE '%[EM CORREÇÃO]%') AND (status IS NULL OR status = 'CONFORME')",
    ] {
        let _ = sqlx::query(ddl).execute(pool).await;
    }
    FEITO.store(true, Ordering::Relaxed);
}

/// Filtros opcionais da lista de análises. Sem nenhum filtro devolve todas (compatível com quem já chamava).
#[derive(Debug, Default, Clone, serde::Deserialize)]
pub struct FiltroAnalisesFisco {
    /// AAAA-MM-DD, sobre `analysis_date`.
    pub desde: Option<String>,
    pub ate: Option<String>,
    /// Lote, código ou nome do produto (parcial, sem diferenciar maiúsculas).
    pub busca: Option<String>,
    /// Lote exato.
    pub lote: Option<String>,
    pub id: Option<String>,
    /// Padrão 500 quando há algum filtro; máximo 5000.
    pub limite: Option<i64>,
}

const LIMITE_MAXIMO_ANALISES: i64 = 5000;
const LIMITE_PADRAO_COM_FILTRO: i64 = 500;

/// `analysis_date` como texto AAAA-MM-DD (aceita DD/MM/AAAA); vazio quando não dá para entender.
/// Só texto: datas inválidas (ex.: "2302-08-03") ou vazias nunca quebram a consulta.
const DATA_ANALISE_ISO: &str = "(CASE \
    WHEN left(analysis_date, 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN left(analysis_date, 10) \
    WHEN left(analysis_date, 10) ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN substr(analysis_date, 7, 4) || '-' || substr(analysis_date, 4, 2) || '-' || substr(analysis_date, 1, 2) \
    ELSE '' END)";

fn texto_opcional(v: &Option<String>) -> Option<String> {
    v.as_deref().map(str::trim).filter(|t| !t.is_empty()).map(String::from)
}

fn data_iso_opcional(nome: &str, v: &Option<String>) -> Result<Option<String>, String> {
    match texto_opcional(v) {
        None => Ok(None),
        Some(t) => chrono::NaiveDate::parse_from_str(&t, "%Y-%m-%d")
            .map(|d| Some(d.format("%Y-%m-%d").to_string()))
            .map_err(|_| format!("`{nome}` deve estar no formato AAAA-MM-DD")),
    }
}

fn escapar_like(s: &str) -> String {
    s.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

const COLUNAS_ANALISE: &str = "id, product_code, product_name, batch, analysis_date, technician, ph_measured, viscosity_measured, density_measured, fraction_weight, envase_target_weight, envase_target_unit, has_adjustment, corrective_agent_id, initial_viscosity, trial_agent_qty, trial_viscosity, agent_qty_per_liter, batch_size, total_agent_required, notes, created_at, fabricated_by, authorized_by, synced_to_erp, to_char(erp_synced_at, 'YYYY-MM-DD HH24:MI:SS'), COALESCE(status, 'CONFORME'), media_url, aspect_ok, aspect_result, color_ok, color_result, odor_ok, odor_result, viscometer_model, viscometer_spindle, viscometer_rpm, viscometer_seconds";

fn analise_da_linha(row: &sqlx::postgres::PgRow) -> FiscoQuimicaAnalysis {
    let has_adj: bool = match row.try_get::<i32, _>(12) {
        Ok(v) => v == 1,
        Err(_) => row.try_get::<bool, _>(12).unwrap_or(false),
    };
    FiscoQuimicaAnalysis {
        id: row.get(0),
        product_code: row.get(1),
        product_name: row.get(2),
        batch: row.get(3),
        analysis_date: row.get(4),
        technician: row.get(5),
        ph_measured: row.get(6),
        viscosity_measured: row.get(7),
        density_measured: row.get(8),
        fraction_weight: row.get(9),
        envase_target_weight: row.get(10),
        envase_target_unit: row.get(11),
        has_adjustment: has_adj,
        corrective_agent_id: row.get(13),
        initial_viscosity: row.get(14),
        trial_agent_qty: row.get(15),
        trial_viscosity: row.get(16),
        agent_qty_per_liter: row.get(17),
        batch_size: row.get(18),
        total_agent_required: row.get(19),
        notes: row.get(20),
        created_at: row.get(21),
        fabricated_by: row.get(22),
        authorized_by: row.get(23),
        synced_to_erp: row.try_get(24).ok(),
        erp_synced_at: row.try_get(25).ok(),
        status: row.try_get(26).ok(),
        media_url: row.try_get(27).ok(),
        aspect_ok: row.try_get(28).ok(),
        aspect_result: row.try_get(29).ok(),
        color_ok: row.try_get(30).ok(),
        color_result: row.try_get(31).ok(),
        odor_ok: row.try_get(32).ok(),
        odor_result: row.try_get(33).ok(),
        viscometer_model: row.try_get(34).ok(),
        viscometer_spindle: row.try_get(35).ok(),
        viscometer_rpm: row.try_get(36).ok(),
        viscometer_seconds: row.try_get(37).ok(),
    }
}

pub async fn get_fisco_quimica_analyses_query(
    pool: PgPool,
    filtro: &FiltroAnalisesFisco,
) -> Result<Vec<FiscoQuimicaAnalysis>, String> {
    garantir_colunas_analises(&pool).await;

    let desde = data_iso_opcional("desde", &filtro.desde)?;
    let ate = data_iso_opcional("ate", &filtro.ate)?;
    let busca = texto_opcional(&filtro.busca);
    let lote = texto_opcional(&filtro.lote);
    let id = texto_opcional(&filtro.id);
    let tem_filtro = desde.is_some() || ate.is_some() || busca.is_some() || lote.is_some() || id.is_some();
    let limite = match filtro.limite {
        Some(l) => Some(l.clamp(1, LIMITE_MAXIMO_ANALISES)),
        None if tem_filtro => Some(LIMITE_PADRAO_COM_FILTRO),
        None => None,
    };
    let busca_like = busca.as_deref().map(escapar_like);
    let busca_sem_pontos = busca
        .as_deref()
        .map(|b| b.replace('.', ""))
        .filter(|b| !b.is_empty())
        .map(|b| escapar_like(&b));

    let sql = format!(
        "SELECT {COLUNAS_ANALISE} FROM fisco_quimica_analyses \
         WHERE ($1::text IS NULL OR {d} >= $1) \
           AND ($2::text IS NULL OR {d} <= $2) \
           AND (($1::text IS NULL AND $2::text IS NULL) OR {d} <> '') \
           AND ($3::text IS NULL OR batch ILIKE '%' || $3 || '%' OR product_name ILIKE '%' || $3 || '%' \
                OR product_code ILIKE '%' || $3 || '%' \
                OR ($4::text IS NOT NULL AND replace(product_code, '.', '') ILIKE '%' || $4 || '%')) \
           AND ($5::text IS NULL OR batch = $5) \
           AND ($6::text IS NULL OR id = $6) \
         ORDER BY created_at DESC NULLS LAST, id DESC \
         LIMIT $7",
        d = DATA_ANALISE_ISO
    );
    let rows = sqlx::query(&sql)
        .bind(desde)
        .bind(ate)
        .bind(busca_like)
        .bind(busca_sem_pontos)
        .bind(lote)
        .bind(id)
        .bind(limite)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(analise_da_linha).collect())
}

#[derive(Debug)]
pub enum ErroGravarAnalise {
    Invalida(String),
    /// Criar com um id que já existe: nada é alterado.
    Conflito(String),
    /// Editar um id que não existe.
    NaoEncontrada(String),
    Banco(String),
}

/// Grava uma análise. `editar = false` só cria (id repetido vira `Conflito`, o laudo existente
/// não é tocado); `editar = true` só atualiza um laudo que já existe. Devolve a linha gravada.
pub async fn save_fisco_quimica_analysis_query(
    pool: PgPool,
    analysis: &FiscoQuimicaAnalysis,
    editar: bool,
) -> Result<FiscoQuimicaAnalysis, ErroGravarAnalise> {
    garantir_colunas_analises(&pool).await;

    if analysis.id.trim().is_empty() || analysis.batch.trim().is_empty() {
        return Err(ErroGravarAnalise::Invalida("Laudo sem identificador ou sem lote.".into()));
    }
    let banco = |e: sqlx::Error| ErroGravarAnalise::Banco(e.to_string());

    if editar {
        let existe: Option<String> = sqlx::query_scalar("SELECT id FROM fisco_quimica_analyses WHERE id = $1")
            .bind(&analysis.id)
            .fetch_optional(&pool)
            .await
            .map_err(banco)?;
        if existe.is_none() {
            return Err(ErroGravarAnalise::NaoEncontrada(
                "Laudo não encontrado para editar; ele pode ter sido excluído.".into(),
            ));
        }
    }

    let status_val = if analysis.status.as_deref() == Some("EM_CORRECAO")
        || analysis.notes.as_deref().unwrap_or("").contains("[STATUS: EM CORREÇÃO]")
        || analysis.notes.as_deref().unwrap_or("").contains("[EM CORREÇÃO]")
    {
        "EM_CORRECAO"
    } else {
        analysis.status.as_deref().unwrap_or("CONFORME")
    };

    let conflito = if editar {
        "ON CONFLICT(id) DO UPDATE SET
            product_code = EXCLUDED.product_code,
            product_name = EXCLUDED.product_name,
            batch = EXCLUDED.batch,
            analysis_date = EXCLUDED.analysis_date,
            technician = EXCLUDED.technician,
            ph_measured = EXCLUDED.ph_measured,
            viscosity_measured = EXCLUDED.viscosity_measured,
            density_measured = EXCLUDED.density_measured,
            fraction_weight = EXCLUDED.fraction_weight,
            envase_target_weight = EXCLUDED.envase_target_weight,
            envase_target_unit = EXCLUDED.envase_target_unit,
            has_adjustment = EXCLUDED.has_adjustment,
            corrective_agent_id = EXCLUDED.corrective_agent_id,
            initial_viscosity = EXCLUDED.initial_viscosity,
            trial_agent_qty = EXCLUDED.trial_agent_qty,
            trial_viscosity = EXCLUDED.trial_viscosity,
            agent_qty_per_liter = EXCLUDED.agent_qty_per_liter,
            batch_size = EXCLUDED.batch_size,
            total_agent_required = EXCLUDED.total_agent_required,
            notes = EXCLUDED.notes,
            fabricated_by = EXCLUDED.fabricated_by,
            authorized_by = EXCLUDED.authorized_by,
            synced_to_erp = EXCLUDED.synced_to_erp,
            status = EXCLUDED.status,
            media_url = EXCLUDED.media_url,
            aspect_ok = EXCLUDED.aspect_ok,
            aspect_result = EXCLUDED.aspect_result,
            color_ok = EXCLUDED.color_ok,
            color_result = EXCLUDED.color_result,
            odor_ok = EXCLUDED.odor_ok,
            odor_result = EXCLUDED.odor_result,
            viscometer_model = EXCLUDED.viscometer_model,
            viscometer_spindle = EXCLUDED.viscometer_spindle,
            viscometer_rpm = EXCLUDED.viscometer_rpm,
            viscometer_seconds = EXCLUDED.viscometer_seconds"
    } else {
        "ON CONFLICT(id) DO NOTHING"
    };

    let sql = format!(
        "INSERT INTO fisco_quimica_analyses (id, product_code, product_name, batch, analysis_date, technician, ph_measured, viscosity_measured, density_measured, fraction_weight, envase_target_weight, envase_target_unit, has_adjustment, corrective_agent_id, initial_viscosity, trial_agent_qty, trial_viscosity, agent_qty_per_liter, batch_size, total_agent_required, notes, fabricated_by, authorized_by, synced_to_erp, status, media_url, aspect_ok, aspect_result, color_ok, color_result, odor_ok, odor_result, viscometer_model, viscometer_spindle, viscometer_rpm, viscometer_seconds)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36)
         {conflito}"
    );
    let res = sqlx::query(&sql)
        .bind(&analysis.id)
        .bind(&analysis.product_code)
        .bind(&analysis.product_name)
        .bind(&analysis.batch)
        .bind(&analysis.analysis_date)
        .bind(&analysis.technician)
        .bind(analysis.ph_measured)
        .bind(analysis.viscosity_measured)
        .bind(analysis.density_measured)
        .bind(analysis.fraction_weight)
        .bind(analysis.envase_target_weight)
        .bind(&analysis.envase_target_unit)
        .bind(if analysis.has_adjustment { 1 } else { 0 })
        .bind(&analysis.corrective_agent_id)
        .bind(analysis.initial_viscosity)
        .bind(analysis.trial_agent_qty)
        .bind(analysis.trial_viscosity)
        .bind(analysis.agent_qty_per_liter)
        .bind(analysis.batch_size)
        .bind(analysis.total_agent_required)
        .bind(&analysis.notes)
        .bind(&analysis.fabricated_by)
        .bind(&analysis.authorized_by)
        .bind(analysis.synced_to_erp.unwrap_or(false))
        .bind(status_val)
        .bind(&analysis.media_url)
        .bind(analysis.aspect_ok.unwrap_or(true))
        .bind(analysis.aspect_result.as_deref().unwrap_or("CONFORME"))
        .bind(analysis.color_ok.unwrap_or(true))
        .bind(analysis.color_result.as_deref().unwrap_or("CONFORME"))
        .bind(analysis.odor_ok.unwrap_or(true))
        .bind(analysis.odor_result.as_deref().unwrap_or("CARACTERÍSTICO"))
        .bind(&analysis.viscometer_model)
        .bind(&analysis.viscometer_spindle)
        .bind(analysis.viscometer_rpm)
        .bind(analysis.viscometer_seconds)
        .execute(&pool)
        .await
        .map_err(banco)?;

    if !editar && res.rows_affected() == 0 {
        return Err(ErroGravarAnalise::Conflito(
            "Já existe um laudo com este identificador; o laudo existente não foi alterado. Recarregue a tela e tente de novo.".into(),
        ));
    }

    let filtro = FiltroAnalisesFisco { id: Some(analysis.id.clone()), limite: Some(1), ..Default::default() };
    get_fisco_quimica_analyses_query(pool, &filtro)
        .await
        .map_err(ErroGravarAnalise::Banco)?
        .into_iter()
        .next()
        .ok_or_else(|| ErroGravarAnalise::Banco("Laudo gravado mas não encontrado ao reler.".into()))
}

pub async fn delete_fisco_quimica_analysis_query(pool: PgPool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM fisco_quimica_analyses WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}


#[cfg(test)]
mod testes_fisco_analises {
    use super::*;

    fn analise(id: &str, lote: &str, codigo: &str, nome: &str, data: &str) -> FiscoQuimicaAnalysis {
        serde_json::from_value(serde_json::json!({
            "id": id, "productCode": codigo, "productName": nome, "batch": lote,
            "analysisDate": data, "technician": "teste", "phMeasured": 6.0,
            "viscosityMeasured": 9000.0, "densityMeasured": 1.0, "fractionWeight": 51.0,
            "envaseTargetWeight": 100.0, "envaseTargetUnit": "g", "hasAdjustment": false,
            "notes": "original"
        }))
        .unwrap()
    }

    async fn limpar(pool: &PgPool) {
        sqlx::query("DELETE FROM fisco_quimica_analyses WHERE id LIKE 'zzt-%'").execute(pool).await.unwrap();
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn criar_nao_sobrescreve_editar_atualiza_e_filtros() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        limpar(&pool).await;

        // criar devolve a linha gravada
        let a = analise("zzt-1", "ZZL100", "ZZ.001", "Shampoo Teste", "2026-10-01");
        let gravada = save_fisco_quimica_analysis_query(pool.clone(), &a, false).await.unwrap();
        assert_eq!(gravada.id, "zzt-1");
        assert_eq!(gravada.notes.as_deref(), Some("original"));

        // criar de novo com o mesmo id: conflito e o laudo existente fica intacto
        let mut b = analise("zzt-1", "ZZL999", "ZZ.002", "Outro", "2026-10-02");
        b.notes = Some("sobrescrito".into());
        let e = save_fisco_quimica_analysis_query(pool.clone(), &b, false).await.unwrap_err();
        assert!(matches!(e, ErroGravarAnalise::Conflito(_)));
        let f = FiltroAnalisesFisco { id: Some("zzt-1".into()), ..Default::default() };
        let lido = get_fisco_quimica_analyses_query(pool.clone(), &f).await.unwrap();
        assert_eq!(lido.len(), 1);
        assert_eq!(lido[0].batch, "ZZL100");
        assert_eq!(lido[0].notes.as_deref(), Some("original"));

        // editar atualiza pelo id; editar id inexistente é "não encontrado"
        let atualizada = save_fisco_quimica_analysis_query(pool.clone(), &b, true).await.unwrap();
        assert_eq!(atualizada.batch, "ZZL999");
        assert_eq!(atualizada.notes.as_deref(), Some("sobrescrito"));
        let nova = analise("zzt-naoexiste", "ZZL1", "ZZ.003", "X", "2026-10-01");
        let e = save_fisco_quimica_analysis_query(pool.clone(), &nova, true).await.unwrap_err();
        assert!(matches!(e, ErroGravarAnalise::NaoEncontrada(_)));

        // filtros: datas (inclusive inválida e vazia), busca, lote, id e limite
        for (id, lote, cod, nome, data) in [
            ("zzt-2", "ZZL200", "ZZ.010", "Condicionador Coco", "2026-09-15"),
            ("zzt-3", "ZZL300", "ZZ.011", "Creme Aveia", "2302-08-03"),
            ("zzt-4", "ZZL400", "ZZ.012", "Gel", ""),
            ("zzt-5", "ZZL500", "ZZ.013", "Sabonete 100%", "20/09/2026"),
        ] {
            save_fisco_quimica_analysis_query(pool.clone(), &analise(id, lote, cod, nome, data), false).await.unwrap();
        }
        let ids = |v: Vec<FiscoQuimicaAnalysis>| {
            let mut ids: Vec<String> = v.into_iter().map(|a| a.id).filter(|i| i.starts_with("zzt-")).collect();
            ids.sort();
            ids
        };
        let consulta = |f: FiltroAnalisesFisco| {
            let pool = pool.clone();
            async move { get_fisco_quimica_analyses_query(pool, &f).await.unwrap() }
        };

        let r = consulta(FiltroAnalisesFisco { desde: Some("2026-09-01".into()), ate: Some("2026-10-01".into()), ..Default::default() }).await;
        assert_eq!(ids(r), vec!["zzt-2", "zzt-5"]);
        let r = consulta(FiltroAnalisesFisco { desde: Some("2026-09-20".into()), ..Default::default() }).await;
        assert_eq!(ids(r), vec!["zzt-1", "zzt-3", "zzt-5"]);
        let r = consulta(FiltroAnalisesFisco { busca: Some("condicionador".into()), ..Default::default() }).await;
        assert_eq!(ids(r), vec!["zzt-2"]);
        let r = consulta(FiltroAnalisesFisco { busca: Some("zz011".into()), ..Default::default() }).await;
        assert_eq!(ids(r), vec!["zzt-3"]);
        let r = consulta(FiltroAnalisesFisco { busca: Some("zzl4".into()), ..Default::default() }).await;
        assert_eq!(ids(r), vec!["zzt-4"]);
        let r = consulta(FiltroAnalisesFisco { busca: Some("100%".into()), ..Default::default() }).await;
        assert_eq!(ids(r), vec!["zzt-5"]);
        let r = consulta(FiltroAnalisesFisco { busca: Some("%".into()), ..Default::default() }).await;
        assert_eq!(ids(r), vec!["zzt-5"]);
        let r = consulta(FiltroAnalisesFisco { lote: Some("ZZL200".into()), ..Default::default() }).await;
        assert_eq!(ids(r), vec!["zzt-2"]);
        let r = consulta(FiltroAnalisesFisco { lote: Some("ZZL2".into()), ..Default::default() }).await;
        assert!(ids(r).is_empty());
        let r = consulta(FiltroAnalisesFisco { busca: Some("zz".into()), limite: Some(2), ..Default::default() }).await;
        assert_eq!(r.len(), 2);
        // sem parâmetros devolve tudo (inclusive data vazia/inválida)
        let r = consulta(FiltroAnalisesFisco::default()).await;
        assert_eq!(ids(r), vec!["zzt-1", "zzt-2", "zzt-3", "zzt-4", "zzt-5"]);
        // data mal formada é erro claro
        let e = get_fisco_quimica_analyses_query(pool.clone(), &FiltroAnalisesFisco { desde: Some("ontem".into()), ..Default::default() }).await.unwrap_err();
        assert!(e.contains("AAAA-MM-DD"));

        limpar(&pool).await;
    }
}

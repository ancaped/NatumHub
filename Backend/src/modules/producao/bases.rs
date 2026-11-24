//! Bases de produção: resumo por base (demanda, estoque, lotes) e produtos com a mesma formulação.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use crate::core::regras_produto::e_base;
use serde_json::json;
use sqlx::Row;
use std::collections::HashMap;
use std::sync::Arc;

use crate::handlers::imports::clean_product_code;
use crate::core::catalogo::{param, Acao};
use crate::modules::producao::lotes::parse_unit_weight_from_desc;
use crate::handlers::AppState;
use crate::modules::producao::calculo::{fetch_calculation_data, post_process_kit_only_production};
use crate::modules::producao::gerenciamento::calculations::calculate_products;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/producao/produtos-mesma-formulacao/:code", get(get_produtos_mesma_formulacao))
        .route("/api/producao/bases-resumo", get(get_bases_resumo))
}

/// Ações de bases e formulações descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<Acao> {
    const M: &str = "producao_bases";
    vec![
        Acao::leitura(
            "listar_produtos_mesma_formulacao",
            M,
            "Produtos que usam a mesma fórmula do produto informado (úteis para produzir juntos na mesma batelada), com o cálculo de estoque de cada um. Use ao montar uma batelada que aproveite a base.",
            "/api/producao/produtos-mesma-formulacao/:code",
            vec![param("code", "caminho", "texto", true, "Código do produto.")],
        ),
        Acao::leitura(
            "resumir_bases",
            M,
            "Resumo das bases: estoque, o que está na fila e nas ordens planejadas, e a necessidade de cada uma.",
            "/api/producao/bases-resumo",
            vec![],
        ),
    ]
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct ProdutoMesmaFormulacao {
    pub codigo: String,
    pub descricao: String,
    pub base: Option<String>,
    #[serde(default)]
    pub base_codigo: Option<String>,
    #[serde(default)]
    pub unidade: String,
    #[serde(default)]
    pub estoque: i64,
    #[serde(default)]
    pub pedidos_aberto: i64,
    #[serde(default)]
    pub estoque_futuro: i64,
    #[serde(default)]
    pub media_vendas: f64,
    #[serde(default)]
    pub producao_recomendada: i64,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub status_label: String,
    #[serde(default)]
    pub status_produto: Option<String>,
    #[serde(default)]
    pub na_fila: bool,
    #[serde(default)]
    pub planejado_semana: bool,
}

fn rotulo_status_fallback(status_produto: Option<&str>) -> (&'static str, &'static str) {
    match status_produto.unwrap_or("ativo") {
        "descontinuado" => ("descontinuado", "Descontinuado"),
        "terceirizado" => ("terceirizado", "Terceirizado"),
        _ => ("saudavel", "Saudável"),
    }
}

/// Tolerância máxima em pontos percentuais por insumo para considerar que duas fórmulas
/// geram a mesma massa de reator (absorve arredondamentos do ERP como 51,00% vs 51,01%).
const TOLERANCIA_PCT_MESMA_FORMULA: f64 = 0.15;

/// Consulta as linhas brutas de produtos com a mesma massa química de `code`: soma linhas
/// repetidas do mesmo insumo (ex.: água dividida em etapas), ignora embalagem/rótulo (`UN`),
/// usa proporção da quantidade quando `percentage` vier nulo/zerado e aplica pequena tolerância.
async fn buscar_linhas_mesma_formulacao_em(
    conn: &mut sqlx::PgConnection,
    code: &str,
) -> Result<Vec<sqlx::postgres::PgRow>, sqlx::Error> {
    let clean_code = code.trim();
    if clean_code.is_empty() {
        return Ok(Vec::new());
    }

    let query = r#"
      WITH raw_lines AS (
        SELECT
          TRIM(f.product_code) AS product_code,
          TRIM(f.ingredient_code) AS ingredient_code,
          COALESCE(f.percentage, 0)::float8 AS pct,
          COALESCE(f.quantity, 0)::float8 AS qty
        FROM formulations f
        LEFT JOIN items i ON TRIM(i.code) = TRIM(f.ingredient_code)
        WHERE COALESCE(UPPER(TRIM(i.unit)), '') <> 'UN'
          AND (COALESCE(f.percentage, 0) > 0 OR COALESCE(f.quantity, 0) > 0)
      ),
      product_totals AS (
        SELECT product_code, SUM(pct) AS sum_pct, SUM(qty) AS sum_qty
        FROM raw_lines
        GROUP BY product_code
      ),
      normalized AS (
        SELECT
          r.product_code,
          r.ingredient_code,
          SUM(
            CASE
              WHEN pt.sum_pct > 0 THEN r.pct
              WHEN pt.sum_qty > 0 THEN (r.qty / pt.sum_qty) * 100.0
              ELSE 0.0
            END
          ) AS pct
        FROM raw_lines r
        JOIN product_totals pt ON pt.product_code = r.product_code
        WHERE (pt.sum_pct > 0 AND r.pct > 0) OR (pt.sum_pct <= 0 AND r.qty > 0)
        GROUP BY r.product_code, r.ingredient_code
      ),
      target_formula AS (
        SELECT ingredient_code, pct
        FROM normalized
        WHERE product_code = $1
      ),
      target_count AS (
        SELECT COUNT(*)::bigint AS total FROM target_formula
      ),
      other_counts AS (
        SELECT product_code, COUNT(*)::bigint AS ing_count
        FROM normalized
        WHERE product_code <> $1
        GROUP BY product_code
        HAVING COUNT(*)::bigint = (SELECT total FROM target_count)
      ),
      matched_products AS (
        SELECT oc.product_code
        FROM other_counts oc
        JOIN normalized n ON n.product_code = oc.product_code
        JOIN target_formula tf ON tf.ingredient_code = n.ingredient_code
          AND ABS(n.pct - tf.pct) <= $2
        GROUP BY oc.product_code
        HAVING COUNT(*)::bigint = (SELECT total FROM target_count)
      )
      SELECT p.codigo, p.descricao, p.base, p.base_codigo,
             COALESCE(e.estoque, 0.0)::float8,
             COALESCE(i.unit, 'UN'),
             op.status_produto
      FROM matched_products mp
      JOIN produtos p ON TRIM(p.codigo) = mp.product_code
      LEFT JOIN estoque_atual e ON e.codigo = p.codigo
      LEFT JOIN items i ON i.code = p.codigo
      LEFT JOIN overrides_produtos op ON op.codigo = p.codigo
      WHERE (SELECT total FROM target_count) > 0
      ORDER BY p.descricao;
    "#;

    sqlx::query(query)
        .bind(clean_code)
        .bind(TOLERANCIA_PCT_MESMA_FORMULA)
        .fetch_all(&mut *conn)
        .await
}

/// Serviço: busca produtos com a mesma formulação química de `code`, enriquecidos com o cálculo de estoque/demanda.
pub async fn buscar_produtos_mesma_formulacao(
    db: &crate::core::db::Db,
    code: &str,
) -> Result<Vec<ProdutoMesmaFormulacao>, String> {
    let mut conn = db
        .pool()
        .acquire()
        .await
        .map_err(|e| format!("Erro ao abrir conexão: {}", e))?;

    let rows = buscar_linhas_mesma_formulacao_em(&mut conn, code)
        .await
        .map_err(|e| format!("Erro ao buscar produtos com mesma formulação: {}", e))?;

    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let mut calc_map: HashMap<String, crate::models::ProductCalculationResult> = HashMap::new();
    let params = crate::models::QueryParams {
        include_all_regimes: Some(true),
        include_bases: Some(true),
        show_hidden: Some(true),
        page: Some(1),
        limit: Some(99_999),
        ..Default::default()
    };
    if let Ok(corpo) = crate::modules::producao::calculo::listar_produtos(db, &params).await {
        if let Some(items_val) = corpo.get("items") {
            if let Ok(items) =
                serde_json::from_value::<Vec<crate::models::ProductCalculationResult>>(items_val.clone())
            {
                for item in items {
                    calc_map.insert(clean_product_code(&item.codigo), item.clone());
                    calc_map.insert(item.codigo.trim().to_string(), item);
                }
            }
        }
    }

    let mut list: Vec<ProdutoMesmaFormulacao> = rows
        .into_iter()
        .map(|r| {
            let codigo: String = r.get(0);
            let descricao: String = r.get::<Option<String>, _>(1).unwrap_or_default();
            let base: Option<String> = r.get(2);
            let base_codigo: Option<String> = r.get(3);
            let estoque_sql: f64 = crate::core::pg_row::pg_f64(&r, 4);
            let unidade: String = r.get::<Option<String>, _>(5).unwrap_or_else(|| "UN".to_string());
            let status_prod_sql: Option<String> = r.get(6);

            let calc = calc_map
                .get(codigo.trim())
                .or_else(|| calc_map.get(&clean_product_code(&codigo)));

            if let Some(c) = calc {
                ProdutoMesmaFormulacao {
                    codigo,
                    descricao,
                    base: c.base.clone().or(base),
                    base_codigo: c.base_codigo.clone().or(base_codigo),
                    unidade,
                    estoque: c.estoque,
                    pedidos_aberto: c.pedidos_aberto,
                    estoque_futuro: c.estoque_futuro_com_producao,
                    media_vendas: c.media_vendas,
                    producao_recomendada: c.producao_recomendada,
                    status: c.status.clone(),
                    status_label: c.status_label.clone(),
                    status_produto: c.status_produto.clone().or(status_prod_sql),
                    na_fila: c.na_fila.unwrap_or(false),
                    planejado_semana: c.planejado_semana.unwrap_or(false),
                }
            } else {
                let est = estoque_sql.round() as i64;
                let (st, lbl) = rotulo_status_fallback(status_prod_sql.as_deref());
                ProdutoMesmaFormulacao {
                    codigo,
                    descricao,
                    base,
                    base_codigo,
                    unidade,
                    estoque: est,
                    pedidos_aberto: 0,
                    estoque_futuro: est,
                    media_vendas: 0.0,
                    producao_recomendada: 0,
                    status: st.to_string(),
                    status_label: lbl.to_string(),
                    status_produto: status_prod_sql,
                    na_fila: false,
                    planejado_semana: false,
                }
            }
        })
        .collect();

    list.sort_by(|a, b| {
        let a_inativo = matches!(a.status_produto.as_deref(), Some("descontinuado" | "terceirizado"));
        let b_inativo = matches!(b.status_produto.as_deref(), Some("descontinuado" | "terceirizado"));
        a_inativo
            .cmp(&b_inativo)
            .then_with(|| b.producao_recomendada.cmp(&a.producao_recomendada))
            .then_with(|| a.estoque_futuro.cmp(&b.estoque_futuro))
            .then_with(|| a.descricao.cmp(&b.descricao))
    });

    Ok(list)
}

/// GET /api/producao/produtos-mesma-formulacao/:code
/// Retorna EXCLUSIVAMENTE os produtos que possuem a exata mesma formulação química (mesmas matérias-primas e proporções)
pub async fn get_produtos_mesma_formulacao(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    match buscar_produtos_mesma_formulacao(&state.db, &code).await {
        Ok(list) => (axum::http::StatusCode::OK, Json(list)).into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

fn normalize_base_key(raw: &str) -> String {
    let mut s = raw
        .to_uppercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    s = s.replace("BASE LEAVE - IN", "BASE LEAVE-IN");
    s = s.replace("BASE LEAVE IN", "BASE LEAVE-IN");
    s = s.replace("BASE SH PEROL ", "BASE SHAMPOO PEROLADO ");
    s = s.replace("BASE SH ", "BASE SHAMPOO ");
    s = s.replace("BASE CONDICIONADOR ", "BASE COND ");
    s = s.replace("BASE CONDIC ", "BASE COND ");
    if s == "BASE BOTTOX POTE NH 16" {
        s = "BASE BOTTOX POTE H 16".to_string();
    } else if s == "BASE COND NATUM" {
        s = "BASE COND NATUM 5L/1L".to_string();
    } else if s == "BASE TIOGLICOLATO" {
        s = "BASE TIOGLICOLATO 250 G NATUM".to_string();
    } else if s.starts_with("BASE LUMINI SPA") {
        s = "BASE LUMINI SPA 200ML NATUM".to_string();
    } else if s == "BASE SHAMPOO GALÃO" || s == "BASE SHAMPOO GALAO" {
        s = "BASE LAURIL 27% (LAURIL DPV) SH GALAO 5L".to_string();
    }
    s
}

/// GET /api/producao/bases-resumo
/// Retorna todas as bases granel com:
/// - produtos acabados vinculados e suas demandas em kg
/// - demanda projetada da fila PCP + sugestões de estoque (kg)
/// - saldo interno de lotes de base produzidos e último lote
/// - fórmula da base com estoque atual de matérias-primas
pub async fn get_bases_resumo(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let (products, stocks, fat_map, configs, overrides, _sales_faltas_map) =
        match fetch_calculation_data(&state.db).await {
            Ok(data) => data,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": format!("Erro ao calcular dados de bases: {}", e) })),
                )
                    .into_response()
            }
        };

    let mut computed = calculate_products(&products, &stocks, &fat_map, &configs, &overrides);
    let kit_composition = state.db.get_kit_composition().await.unwrap_or_default();
    post_process_kit_only_production(&mut computed, &kit_composition);

    let pool = state.db.pool();

    // Map of items in fila_demandas: code -> (id, qty, qty_kg)
    let mut fila_map: HashMap<String, (String, f64, f64)> = HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT id, codigo_produto, quantidade::float8, COALESCE(quantidade_kg::float8, 0.0) FROM producao_fila_demandas",
    )
    .fetch_all(pool)
    .await
    {
        for r in rows {
            let id: String = r.get(0);
            let code: String = r.get(1);
            let qty: f64 = r.get(2);
            let kg: f64 = r.get(3);
            fila_map.insert(code.trim().to_string(), (id.clone(), qty, kg));
            fila_map.insert(clean_product_code(&code), (id, qty, kg));
        }
    }

    let mut planejado_map: HashMap<String, f64> = HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT codigo_produto, SUM(quantidade_planejada::float8) FROM producao_planejamento_semanal pp WHERE pp.ordem_status IN ('planejado', 'aprovado') AND NOT EXISTS (SELECT 1 FROM lote_custom_status c WHERE c.lote_number = COALESCE(NULLIF(TRIM(pp.lote_erp), ''), pp.id) AND c.custom_status IN ('Finalizada', 'Ordem Finalizada')) AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE pp.lote_erp IS NOT NULL AND TRIM(pp.lote_erp) <> '' AND sm.document_number = TRIM(pp.lote_erp) AND sm.item_type = 'produto' AND sm.movement_type = 'entrada') GROUP BY codigo_produto",
    )
    .fetch_all(pool)
    .await
    {
        for r in rows {
            let code: String = r.get(0);
            let qty: f64 = r.get(1);
            planejado_map.insert(code.trim().to_string(), qty);
            planejado_map.insert(clean_product_code(&code), qty);
        }
    }

    // Load formulations for all products/bases
    let mut formulations_by_prod: HashMap<String, Vec<serde_json::Value>> = HashMap::new();
    let mut insumo_stock_map: HashMap<String, f64> = HashMap::new();
    if let Ok(rows) = sqlx::query("SELECT codigo, COALESCE(estoque, 0.0)::float8 FROM insumos")
        .fetch_all(pool)
        .await
    {
        for r in rows {
            let c: String = r.get(0);
            let est: f64 = r.get(1);
            insumo_stock_map.insert(c.trim().to_string(), est);
            insumo_stock_map.insert(clean_product_code(&c), est);
        }
    }

    if let Ok(rows) = sqlx::query(
        "SELECT product_code, ingredient_code, description, COALESCE(quantity, 0.0)::float8, COALESCE(percentage, 0.0)::float8 FROM formulations ORDER BY quantity DESC",
    )
    .fetch_all(pool)
    .await
    {
        for r in rows {
            let p_code: String = r.get(0);
            let i_code: String = r.get(1);
            let desc: String = r.get::<Option<String>, _>(2).unwrap_or_default();
            let qty: f64 = r.get(3);
            let pct: f64 = r.get(4);
            let cur_stock = insumo_stock_map
                .get(i_code.trim())
                .or_else(|| insumo_stock_map.get(&clean_product_code(&i_code)))
                .copied()
                .unwrap_or(0.0);
            formulations_by_prod
                .entry(p_code.trim().to_string())
                .or_default()
                .push(json!({
                    "ingredient_code": i_code,
                    "description": desc,
                    "quantity": qty,
                    "percentage": pct,
                    "current_stock": cur_stock,
                }));
        }
    }

    // Recent base production in stock_movements or historico_producao
    let mut base_lote_info: HashMap<String, (f64, Option<String>, Option<String>)> = HashMap::new();
    if let Ok(rows) = sqlx::query(
        r#"
        SELECT item_code, COALESCE(quantity, 0.0)::float8, date::text, document_number
        FROM stock_movements
        WHERE item_type = 'produto' AND movement_type = 'entrada'
        ORDER BY date DESC
        "#,
    )
    .fetch_all(pool)
    .await
    {
        for r in rows {
            let c: String = r.get(0);
            let qty: f64 = r.get(1);
            let dt: Option<String> = r.get(2);
            let doc: Option<String> = r.get(3);
            base_lote_info.entry(c.trim().to_string()).or_insert((qty, dt, doc));
        }
    }

    // Separate catalog bases and finished products
    let mut base_items = Vec::new();
    let mut finished_items = Vec::new();

    for p in computed {
        let is_base = e_base(
            &p.codigo,
            p.categoria_produto.as_deref().unwrap_or(""),
            p.status_produto.as_deref().unwrap_or(""),
        );
        if is_base {
            base_items.push(p);
        } else if p.visivel != Some(0) {
            let st = p.status_produto.as_deref().unwrap_or("ativo");
            if st != "descontinuado" && st != "suspenso" && st != "ignorado" {
                finished_items.push(p);
            }
        }
    }

    // Map base key -> index in base_items
    let mut key_to_base_idx: HashMap<String, usize> = HashMap::new();
    let mut code_to_base_idx: HashMap<String, usize> = HashMap::new();
    for (idx, b) in base_items.iter().enumerate() {
        key_to_base_idx.insert(normalize_base_key(&b.descricao), idx);
        code_to_base_idx.insert(b.codigo.trim().to_string(), idx);
        code_to_base_idx.insert(clean_product_code(&b.codigo), idx);
    }

    let mut deps_by_base: Vec<Vec<serde_json::Value>> = vec![Vec::new(); base_items.len()];

    for fp in &finished_items {
        let mut matched_idx = None;
        if let Some(ref bc) = fp.base_codigo {
            if !bc.trim().is_empty() {
                matched_idx = code_to_base_idx
                    .get(bc.trim())
                    .or_else(|| code_to_base_idx.get(&clean_product_code(bc)))
                    .copied();
            }
        }
        if matched_idx.is_none() {
            if let Some(ref b_name) = fp.base {
                if !b_name.trim().is_empty() {
                    let norm = normalize_base_key(b_name);
                    matched_idx = key_to_base_idx.get(&norm).copied();
                }
            }
        }

        if let Some(b_idx) = matched_idx {
            let unit_w = parse_unit_weight_from_desc(&fp.descricao);
            let rec_units = fp.producao_recomendada.max(0) as f64;
            let rec_kg = (rec_units * unit_w * 10.0).round() / 10.0;

            let fila_entry = fila_map
                .get(fp.codigo.trim())
                .or_else(|| fila_map.get(&clean_product_code(&fp.codigo)));
            let in_fila = fila_entry.is_some();
            let fila_units = fila_entry.map(|(_, q, _)| *q).unwrap_or(0.0);
            let fila_kg = fila_entry
                .map(|(_, q, kg)| if *kg > 0.0 { *kg } else { (*q * unit_w * 10.0).round() / 10.0 })
                .unwrap_or(0.0);

            let plan_units = planejado_map
                .get(fp.codigo.trim())
                .or_else(|| planejado_map.get(&clean_product_code(&fp.codigo)))
                .copied()
                .unwrap_or(0.0);
            let in_plan = plan_units > 0.0;

            deps_by_base[b_idx].push(json!({
                "codigo": fp.codigo,
                "descricao": fp.descricao,
                "nome_linha": fp.nome_linha,
                "estoque": fp.estoque,
                "producao": fp.producao,
                "pedidos_aberto": fp.pedidos_aberto,
                "efp": fp.estoque_futuro_com_producao,
                "status": fp.status,
                "status_label": fp.status_label,
                "unit_weight_kg": unit_w,
                "producao_recomendada": fp.producao_recomendada,
                "demanda_sugerida_kg": rec_kg,
                "na_fila": in_fila,
                "fila_unidades": fila_units,
                "fila_kg": fila_kg,
                "planejado_semana": in_plan,
                "planejado_unidades": plan_units,
            }));
        }
    }

    let mut result_bases = Vec::with_capacity(base_items.len());
    for (idx, b) in base_items.into_iter().enumerate() {
        let mut deps = std::mem::take(&mut deps_by_base[idx]);
        deps.sort_by(|a, b_val| {
            let a_rec = a.get("demanda_sugerida_kg").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let b_rec = b_val.get("demanda_sugerida_kg").and_then(|v| v.as_f64()).unwrap_or(0.0);
            b_rec.partial_cmp(&a_rec).unwrap_or(std::cmp::Ordering::Equal)
        });

        let mut demanda_fila_kg = 0.0;
        let mut demanda_sugerida_kg = 0.0;
        let mut demanda_total_kg = 0.0;
        let mut produtos_com_demanda = 0;

        for d in &deps {
            let f_kg = d.get("fila_kg").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let s_kg = d.get("demanda_sugerida_kg").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let in_f = d.get("na_fila").and_then(|v| v.as_bool()).unwrap_or(false);
            if in_f {
                demanda_fila_kg += f_kg;
            }
            if s_kg > 0.0 {
                demanda_sugerida_kg += s_kg;
            }
            let effective_kg = if in_f { f_kg.max(s_kg) } else { s_kg };
            if effective_kg > 0.0 {
                demanda_total_kg += effective_kg;
                produtos_com_demanda += 1;
            }
        }

        demanda_fila_kg = (demanda_fila_kg * 10.0).round() / 10.0;
        demanda_sugerida_kg = (demanda_sugerida_kg * 10.0).round() / 10.0;
        demanda_total_kg = (demanda_total_kg * 10.0).round() / 10.0;

        // Saldo interno de base: se o usuário configurou estoque_ideal_manual como saldo/lote padrão ou se há lote recente
        let (ult_qtd, ult_data, ult_doc) = base_lote_info
            .get(b.codigo.trim())
            .cloned()
            .unwrap_or((0.0, None, None));

        // Base in fila_demandas
        let base_fila = fila_map
            .get(b.codigo.trim())
            .or_else(|| fila_map.get(&clean_product_code(&b.codigo)));
        let na_fila = base_fila.is_some();
        let fila_id = base_fila.map(|(id, _, _)| id.clone());
        let fila_qtd_kg = base_fila
            .map(|(_, q, kg)| if *kg > 0.0 { *kg } else { *q })
            .unwrap_or(0.0);

        let planejado_kg = planejado_map
            .get(b.codigo.trim())
            .or_else(|| planejado_map.get(&clean_product_code(&b.codigo)))
            .copied()
            .unwrap_or(0.0);

        let lote_padrao_kg = (b.estoque_ideal_manual.unwrap_or(200) as f64).max(50.0);
        let sugestao_base_kg = if demanda_total_kg > 0.0 {
            demanda_total_kg
        } else {
            0.0
        };

        let form = formulations_by_prod
            .remove(b.codigo.trim())
            .unwrap_or_default();

        result_bases.push(json!({
            "codigo": b.codigo,
            "descricao": b.descricao,
            "linha_prefix": b.linha_prefix,
            "nome_linha": b.nome_linha,
            "observacao": b.observacao,
            "estoque_ideal_manual": b.estoque_ideal_manual,
            "lote_padrao_kg": lote_padrao_kg,
            "dependent_products_count": deps.len(),
            "produtos_com_demanda_count": produtos_com_demanda,
            "dependent_products": deps,
            "demanda_fila_kg": demanda_fila_kg,
            "demanda_sugerida_kg": demanda_sugerida_kg,
            "demanda_total_kg": demanda_total_kg,
            "sugestao_base_kg": sugestao_base_kg,
            "ultimo_lote_kg": ult_qtd,
            "ultimo_lote_data": ult_data,
            "ultimo_lote_numero": ult_doc,
            "na_fila": na_fila,
            "fila_id": fila_id,
            "fila_qtd_kg": fila_qtd_kg,
            "planejado_semana": planejado_kg > 0.0,
            "planejado_kg": planejado_kg,
            "formulation": form,
        }));
    }

    // Sort bases: first those with highest demanda_total_kg, then by dependent_products_count desc, then by codigo
    result_bases.sort_by(|a, b| {
        let da = a.get("demanda_total_kg").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let db = b.get("demanda_total_kg").and_then(|v| v.as_f64()).unwrap_or(0.0);
        if (da - db).abs() > 0.01 {
            return db.partial_cmp(&da).unwrap_or(std::cmp::Ordering::Equal);
        }
        let ca = a.get("dependent_products_count").and_then(|v| v.as_u64()).unwrap_or(0);
        let cb = b.get("dependent_products_count").and_then(|v| v.as_u64()).unwrap_or(0);
        if ca != cb {
            return cb.cmp(&ca);
        }
        let code_a = a.get("codigo").and_then(|v| v.as_str()).unwrap_or("");
        let code_b = b.get("codigo").and_then(|v| v.as_str()).unwrap_or("");
        code_a.cmp(code_b)
    });

    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "items": result_bases,
            "total": result_bases.len(),
        })),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotulo_status_fallback_cobre_inativos() {
        assert_eq!(rotulo_status_fallback(Some("descontinuado")), ("descontinuado", "Descontinuado"));
        assert_eq!(rotulo_status_fallback(Some("terceirizado")), ("terceirizado", "Terceirizado"));
        assert_eq!(rotulo_status_fallback(None), ("saudavel", "Saudável"));
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn mesma_formulacao_traz_estoque_e_situacao_dos_irmaos() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool_conn = sqlx::PgPool::connect(&url).await.unwrap();
        let db = crate::core::db::Db::new(pool_conn);
        let pool = db.pool();

        for cod in ["TMF-A", "TMF-B", "TMF-OUTRO"] {
            sqlx::query("DELETE FROM formulations WHERE product_code = $1").bind(cod).execute(pool).await.unwrap();
            sqlx::query("DELETE FROM estoque_atual WHERE codigo = $1").bind(cod).execute(pool).await.unwrap();
            sqlx::query("DELETE FROM produtos WHERE codigo = $1").bind(cod).execute(pool).await.unwrap();
            sqlx::query("DELETE FROM items WHERE code = $1").bind(cod).execute(pool).await.unwrap();
        }

        sqlx::query("INSERT INTO config_linhas (linha_prefix, nome_linha) VALUES ('99', 'Linha Teste') ON CONFLICT (linha_prefix) DO NOTHING")
            .execute(pool).await.unwrap();
        sqlx::query("INSERT INTO items (code, description, unit) VALUES ('9.15.TMF1', 'INSUMO 1', 'KG'), ('9.15.TMF2', 'INSUMO 2', 'KG') ON CONFLICT (code) DO NOTHING")
            .execute(pool).await.unwrap();
        for (cod, desc, est) in [("TMF-A", "PRODUTO TMF 500ML", 12.0), ("TMF-B", "PRODUTO TMF 1L", 34.0), ("TMF-OUTRO", "OUTRO PRODUTO", 50.0)] {
            sqlx::query("INSERT INTO items (code, description, unit) VALUES ($1, $2, 'UN')").bind(cod).bind(desc).execute(pool).await.unwrap();
            sqlx::query("INSERT INTO produtos (codigo, descricao, linha_prefix) VALUES ($1, $2, '99')").bind(cod).bind(desc).execute(pool).await.unwrap();
            sqlx::query("INSERT INTO estoque_atual (codigo, estoque) VALUES ($1, $2)").bind(cod).bind(est).execute(pool).await.unwrap();
        }
        for (cod, ing, pct) in [
            ("TMF-A", "9.15.TMF1", 80.0), ("TMF-A", "9.15.TMF2", 20.0),
            ("TMF-B", "9.15.TMF1", 80.0), ("TMF-B", "9.15.TMF2", 20.0),
            ("TMF-OUTRO", "9.15.TMF1", 60.0), ("TMF-OUTRO", "9.15.TMF2", 40.0),
        ] {
            sqlx::query("INSERT INTO formulations (product_code, ingredient_code, quantity, percentage) VALUES ($1, $2, 1.0, $3)")
                .bind(cod).bind(ing).bind(pct).execute(pool).await.unwrap();
        }

        let lista = buscar_produtos_mesma_formulacao(&db, "TMF-A").await.unwrap();
        assert_eq!(lista.len(), 1);
        assert_eq!(lista[0].codigo, "TMF-B");
        assert_eq!(lista[0].estoque, 34);
        assert_eq!(lista[0].unidade, "UN");

        for cod in ["TMF-A", "TMF-B", "TMF-OUTRO"] {
            sqlx::query("DELETE FROM formulations WHERE product_code = $1").bind(cod).execute(pool).await.unwrap();
            sqlx::query("DELETE FROM estoque_atual WHERE codigo = $1").bind(cod).execute(pool).await.unwrap();
            sqlx::query("DELETE FROM produtos WHERE codigo = $1").bind(cod).execute(pool).await.unwrap();
            sqlx::query("DELETE FROM items WHERE code = $1").bind(cod).execute(pool).await.unwrap();
        }
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn mesma_formulacao_soma_insumos_repetidos_ignora_embalagem_e_aceita_arredondamento() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = sqlx::PgPool::connect(&url).await.unwrap();
        let mut tx = pool.begin().await.unwrap();

        sqlx::query("INSERT INTO config_linhas (linha_prefix, nome_linha) VALUES ('99.', 'Teste') ON CONFLICT (linha_prefix) DO NOTHING")
            .execute(&mut *tx)
            .await
            .unwrap();
        for (cod, desc) in [
            ("99.14.007", "TESTE ATIVADOR 1L"),
            ("99.14.014", "TESTE ATIVADOR 500ML"),
            ("99.14.099", "TESTE ATIVADOR ARREDONDADO"),
            ("99.13.069", "TESTE LISS 1L"),
            ("99.13.076", "TESTE LISS 120ML"),
            ("99.11.019", "TESTE SEM PERCENTUAL"),
        ] {
            sqlx::query("INSERT INTO produtos (codigo, descricao, linha_prefix) VALUES ($1, $2, '99.') ON CONFLICT (codigo) DO NOTHING")
                .bind(cod)
                .bind(desc)
                .execute(&mut *tx)
                .await
                .unwrap();
        }
        for (code, desc, unit) in [
            ("T.MP.AGUA", "AGUA DESMINERALIZADA", "L"),
            ("T.MP.CETO", "ALCOOL CETOESTEARILICO", "KG"),
            ("T.EMB.1L", "FRASCO 1L", "UN"),
            ("T.EMB.500", "FRASCO 500ML", "UN"),
            ("T.ROT.1L", "ROTULO 1L", "UN"),
        ] {
            sqlx::query("INSERT INTO items (code, description, unit) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING")
                .bind(code)
                .bind(desc)
                .bind(unit)
                .execute(&mut *tx)
                .await
                .unwrap();
        }

        let linhas = [
            // 99.14.007 (1L): água dividida 51.26437 + 29.92563 = 81.19 + embalagens 1L (pct 0)
            ("99.14.007", "T.MP.AGUA", 0.5126437_f64, Some(51.26437_f64)),
            ("99.14.007", "T.MP.AGUA", 0.2992563, Some(29.92563)),
            ("99.14.007", "T.MP.CETO", 0.1881, Some(18.81)),
            ("99.14.007", "T.EMB.1L", 1.0, Some(0.0)),
            ("99.14.007", "T.ROT.1L", 1.0, Some(0.0)),
            // 99.14.014 (500ml): água dividida 51.96437 + 29.22563 = 81.19 + embalagem 500ml
            ("99.14.014", "T.MP.AGUA", 0.25982185, Some(51.96437)),
            ("99.14.014", "T.MP.AGUA", 0.14612815, Some(29.22563)),
            ("99.14.014", "T.MP.CETO", 0.09405, Some(18.81)),
            ("99.14.014", "T.EMB.500", 1.0, Some(0.0)),
            // 99.14.099: arredondamento pequeno (+0.02 / -0.02 pp) dentro da tolerância 0.15
            ("99.14.099", "T.MP.AGUA", 0.8121, Some(81.21)),
            ("99.14.099", "T.MP.CETO", 0.1879, Some(18.79)),
            // 99.13.069 e 99.13.076: mesmos insumos, mas proporções 4 pp diferentes -> não são a mesma massa
            ("99.13.069", "T.MP.AGUA", 0.80, Some(80.0)),
            ("99.13.069", "T.MP.CETO", 0.20, Some(20.0)),
            ("99.13.076", "T.MP.AGUA", 0.76, Some(76.0)),
            ("99.13.076", "T.MP.CETO", 0.24, Some(24.0)),
            // 99.11.019: mesma proporção química que 99.14.007, mas percentage NULL (normalizado pela qty)
            ("99.11.019", "T.MP.AGUA", 0.8119, None),
            ("99.11.019", "T.MP.CETO", 0.1881, None),
            ("99.11.019", "T.EMB.500", 1.0, None),
        ];
        for (prod, ing, qty, pct) in linhas {
            sqlx::query(
                "INSERT INTO formulations (product_code, ingredient_code, description, quantity, percentage) VALUES ($1, $2, $2, $3, $4)",
            )
            .bind(prod)
            .bind(ing)
            .bind(qty)
            .bind(pct)
            .execute(&mut *tx)
            .await
            .unwrap();
        }

        let rows = buscar_linhas_mesma_formulacao_em(&mut *tx, "99.14.007").await.unwrap();
        let codigos: Vec<String> = rows.iter().map(|r| r.get::<String, _>(0)).collect();
        assert!(codigos.iter().any(|c| c == "99.14.014"), "deve encontrar quando água repetida soma 81,19% e embalagem muda: {codigos:?}");
        assert!(codigos.iter().any(|c| c == "99.14.099"), "deve aceitar pequena tolerância de arredondamento (0,02 pp): {codigos:?}");
        assert!(codigos.iter().any(|c| c == "99.11.019"), "deve normalizar por quantidade quando percentage vem nulo: {codigos:?}");
        assert!(!codigos.iter().any(|c| c == "99.13.069"), "não deve misturar fórmulas com diferença relevante");

        let outro_sentido = buscar_linhas_mesma_formulacao_em(&mut *tx, "99.13.076").await.unwrap();
        assert!(
            !outro_sentido.iter().any(|r| r.get::<String, _>(0) == "99.13.069"),
            "diferença de 4 pp entre 120ml e 1L não é mesma massa de reator"
        );

        tx.rollback().await.unwrap();
    }
}

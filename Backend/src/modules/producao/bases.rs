//! Bases de produção: resumo por base (demanda, estoque, lotes) e produtos com a mesma formulação.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde_json::json;
use sqlx::Row;
use std::collections::HashMap;
use std::sync::Arc;

use crate::handlers::imports::clean_product_code;
use crate::modules::producao::lotes::parse_unit_weight_from_desc;
use crate::handlers::AppState;
use crate::modules::producao::calculo::{fetch_calculation_data, post_process_kit_only_production};
use crate::modules::producao::gerenciamento::calculations::calculate_products;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/producao/produtos-mesma-formulacao/:code", get(get_produtos_mesma_formulacao))
        .route("/api/producao/bases-resumo", get(get_bases_resumo))
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct ProdutoMesmaFormulacao {
    pub codigo: String,
    pub descricao: String,
    pub base: Option<String>,
}

/// GET /api/producao/produtos-mesma-formulacao/:code
/// Retorna EXCLUSIVAMENTE os produtos que possuem a exata mesma formulação química (mesmas matérias-primas e proporções)
pub async fn get_produtos_mesma_formulacao(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let clean_code = code.trim().to_string();

    let query = r#"
      WITH target_formula AS (
        SELECT ingredient_code, ROUND(percentage::numeric, 4) as pct
        FROM formulations
        WHERE product_code = $1 AND percentage > 0
      ),
      target_count AS (
        SELECT COUNT(*)::bigint as total FROM target_formula
      ),
      other_products AS (
        SELECT f.product_code, COUNT(*)::bigint as ing_count
        FROM formulations f
        WHERE f.product_code != $1 AND f.percentage > 0
        GROUP BY f.product_code
        HAVING COUNT(*)::bigint = (SELECT total FROM target_count)
      ),
      matched_products AS (
        SELECT op.product_code
        FROM other_products op
        JOIN formulations f ON f.product_code = op.product_code AND f.percentage > 0
        JOIN target_formula tf ON tf.ingredient_code = f.ingredient_code AND ABS(ROUND(f.percentage::numeric, 4) - tf.pct) < 0.001
        GROUP BY op.product_code
        HAVING COUNT(*)::bigint = (SELECT total FROM target_count)
      )
      SELECT p.codigo, p.descricao, p.base
      FROM matched_products mp
      JOIN produtos p ON p.codigo = mp.product_code
      WHERE (SELECT total FROM target_count) > 0
      ORDER BY p.descricao;
    "#;

    match sqlx::query(query)
        .bind(&clean_code)
        .fetch_all(pool)
        .await
    {
        Ok(rows) => {
            let list: Vec<ProdutoMesmaFormulacao> = rows
                .into_iter()
                .map(|r| ProdutoMesmaFormulacao {
                    codigo: r.get::<String, _>(0),
                    descricao: r.get::<Option<String>, _>(1).unwrap_or_default(),
                    base: r.get::<Option<String>, _>(2),
                })
                .collect();
            (axum::http::StatusCode::OK, Json(list)).into_response()
        }
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar produtos com mesma formulação: {}", e) })),
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
    let _ = crate::modules::producao::fila::ensure_fila_demandas_table(pool).await;

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
        let is_base = p.categoria_produto.as_deref() == Some("cat_base")
            || p.status_produto.as_deref() == Some("bases")
            || p.status_produto.as_deref() == Some("base")
            || p.codigo.starts_with("1.36.")
            || p.codigo.starts_with("2.36.")
            || p.codigo.starts_with("60.36.");
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

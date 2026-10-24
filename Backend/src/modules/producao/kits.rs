//! Kits (cálculo e componentes) e situação dos insumos de um produto.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde_json::json;
use sqlx::{PgPool, Row};
use std::collections::HashMap;
use std::sync::Arc;

use crate::handlers::imports::clean_product_code;
use crate::handlers::AppState;
use crate::modules::producao::calculo::{fetch_calculation_data, post_process_kit_only_production};
use crate::models::{KitCalculationResult, KitComponentDetail, ProductCalculationResult, QueryParams};
use crate::modules::producao::gerenciamento::calculations::calculate_products;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/kits", get(list_kits))
        .route("/api/producao/insumos-status/:code", get(get_insumos_status))
}

/// Estoque de componentes que existem em `items` (embalagem/insumo), não em produtos.
/// `sales_residual`: pedidos de venda abertos (M/N) — não usar `estoque_atual.pedidos_aberto` (nPedidos).
async fn load_item_kit_component_stocks(
    pool: &PgPool,
    codes: &[String],
    sales_residual: &HashMap<String, i64>,
) -> HashMap<String, (String, i64, i64, i64)> {
    let mut out = HashMap::new();
    if codes.is_empty() {
        return out;
    }
    let rows = sqlx::query(
        r#"
        SELECT TRIM(REPLACE(i.code, '"', '')) AS code,
               i.description,
               COALESCE(s.stock_qty, e.estoque::float8, 0)::float8 AS estoque,
               COALESCE(s.in_production, e.producao::float8, 0)::float8 AS producao
        FROM items i
        LEFT JOIN estoque_atual e
          ON TRIM(REPLACE(e.codigo, '"', '')) = TRIM(REPLACE(i.code, '"', ''))
        LEFT JOIN LATERAL (
            SELECT stock_qty, in_production
            FROM stock_snapshots
            WHERE TRIM(REPLACE(item_code, '"', '')) = TRIM(REPLACE(i.code, '"', ''))
            ORDER BY snapshot_date DESC, id DESC
            LIMIT 1
        ) s ON true
        WHERE TRIM(REPLACE(i.code, '"', '')) = ANY($1)
        "#,
    )
    .bind(codes)
    .fetch_all(pool)
    .await;

    let Ok(rows) = rows else {
        return out;
    };

    for row in rows {
        let code: String = row.get(0);
        let desc: String = row.get(1);
        let estoque = row.get::<f64, _>(2).floor() as i64;
        let producao = row.get::<f64, _>(3).floor() as i64;
        let pedidos = sales_residual.get(&code).copied().unwrap_or(0);
        out.insert(code, (desc, estoque, producao, pedidos));
    }
    out
}

fn kit_component_from_item(
    code: &str,
    desc: &str,
    estoque: i64,
    producao: i64,
    pedidos: i64,
    qty: f64,
    fat_qtd: Option<f64>,
    fat_kits: Option<i32>,
) -> KitComponentDetail {
    let efp = estoque + producao - pedidos;
    let (status, status_label) = if efp <= 0 {
        ("critico", "Sem estoque")
    } else if efp < 10 {
        ("atencao", "Estoque baixo")
    } else {
        ("saudavel", "Estoque OK")
    };
    KitComponentDetail {
        codigo: code.to_string(),
        descricao: desc.to_string(),
        estoque,
        producao,
        pedidos_aberto: pedidos,
        estoque_futuro_com_producao: efp,
        producao_recomendada: 0,
        status: status.to_string(),
        status_label: status_label.to_string(),
        quantidade: qty,
        fator_proporcao_qtd: fat_qtd,
        fator_proporcao_kits: fat_kits,
        necessita_producao: false,
        fonte: Some("item".into()),
        produzir_apenas_kit: None,
    }
}

// 8. GET /api/kits (Get list of all kits with calculations and components)
pub async fn list_kits(
    State(state): State<Arc<AppState>>,
    Query(params): Query<QueryParams>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    // 1. Fetch normal calculation data
    let (products, stocks, fat_map, configs, overrides, sales_faltas_map) =
        match fetch_calculation_data(&state.db).await {
        Ok(data) => data,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao ler dados para cálculos: {}", e) }))
        ).into_response(),
    };

    // 2. Fetch kit composition
    let kit_composition = match state.db.get_kit_composition().await {
        Ok(comp) => comp,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar composição dos kits: {}", e) }))
        ).into_response(),
    };

    // 3. Calculate all items in real time
    let mut computed = calculate_products(&products, &stocks, &fat_map, &configs, &overrides);
    post_process_kit_only_production(&mut computed, &kit_composition);

    // Create a HashMap of computed products for fast lookup of component details
    let mut computed_map: HashMap<String, ProductCalculationResult> = HashMap::new();
    for p in &computed {
        computed_map.insert(clean_product_code(&p.codigo), p.clone());
        computed_map.insert(p.codigo.trim().to_string(), p.clone());
        computed_map.insert(p.codigo.replace('.', "").trim().to_string(), p.clone());
    }

    // Insumos/embalagens da composição (não estão em produtos)
    let mut item_codes: Vec<String> = Vec::new();
    for comps in kit_composition.values() {
        for (c, _, _, _) in comps {
            let code = clean_product_code(c);
            let code_norm = c.replace('.', "").trim().to_string();
            if !computed_map.contains_key(&code) && !computed_map.contains_key(&code_norm) && !item_codes.contains(&code) {
                item_codes.push(code);
            }
        }
    }
    let item_stocks =
        load_item_kit_component_stocks(pool, &item_codes, &sales_faltas_map).await;

    // 4. Build results for each kit
    let mut kit_results = Vec::new();

    for (raw_kit_code, raw_components_codes) in &kit_composition {
        let kit_code = clean_product_code(raw_kit_code);
        let kit_norm = raw_kit_code.replace('.', "").trim().to_string();
        let components_with_qty: Vec<(String, f64, Option<f64>, Option<i32>)> = raw_components_codes
            .iter()
            .map(|(c, q, fq, fk)| (clean_product_code(c), *q, *fq, *fk))
            .collect();

        // Find kit calculation details
        let mut kit_calc = match computed_map.get(&kit_code)
            .or_else(|| computed_map.get(raw_kit_code.trim()))
            .or_else(|| computed_map.get(&kit_norm)) {
            Some(c) => c.clone(),
            None => {
                let cleaned_code = clean_product_code(&kit_code);
                let kit_desc = sqlx::query_scalar::<_, String>(
                    "SELECT descricao FROM produtos WHERE TRIM(REPLACE(codigo, '\"', '')) = $1",
                )
                .bind(&cleaned_code)
                .fetch_optional(pool)
                .await
                .ok()
                .flatten()
                .unwrap_or_else(|| format!("Kit: {}", kit_code));

                let kit_stock = stocks.iter().find(|s| clean_product_code(&s.codigo) == kit_code);
                let estoque_val = kit_stock.map(|s| s.estoque).unwrap_or(0);
                let prod_val = kit_stock.map(|s| s.producao).unwrap_or(0);
                let pedidos_val = kit_stock.map(|s| s.pedidos_aberto).unwrap_or(0);

                let ovr = overrides.iter().find(|o| {
                    clean_product_code(&o.codigo) == kit_code || o.codigo.replace('.', "").trim() == kit_norm
                });

                let ideal_manual = ovr.and_then(|o| o.estoque_ideal_manual);
                let ideal_qtd = ideal_manual.map(|v| v as f64).unwrap_or(0.0);
                let efp = estoque_val + prod_val - pedidos_val;
                let rec = if ideal_qtd > efp as f64 { (ideal_qtd - efp as f64).round() as i64 } else { 0 };
                let (status, status_label) = if rec > 0 {
                    ("critico".to_string(), "Produzir Urgente".to_string())
                } else {
                    ("saudavel".to_string(), "Estoque OK".to_string())
                };

                ProductCalculationResult {
                    codigo: kit_code.clone(),
                    descricao: kit_desc,
                    linha_prefix: ovr.and_then(|o| o.linha_prefix_manual.clone()).unwrap_or_default(),
                    nome_linha: "Kits Comerciais".to_string(),
                    base: None,
                    base_codigo: None,
                    fase: None,
                    estoque: estoque_val,
                    producao: prod_val,
                    pedidos_aberto: pedidos_val,
                    estoque_futuro: estoque_val - pedidos_val,
                    estoque_futuro_com_producao: efp,
                    estoque_ideal_manual: ideal_manual,
                    pedidos_manual: ovr.and_then(|o| o.pedidos_manual),
                    media_manual: ovr.and_then(|o| o.media_manual),
                    is_lancamento_manual: ovr.and_then(|o| o.is_lancamento_manual),
                    visivel: ovr.and_then(|o| o.visivel).or(Some(1)),
                    observacao: ovr.and_then(|o| o.observacao.clone()),
                    linha_prefix_manual: ovr.and_then(|o| o.linha_prefix_manual.clone()),
                    status_produto: ovr.and_then(|o| o.status_produto.clone()).or(Some("ativo".to_string())),
                    categoria_produto: ovr.and_then(|o| o.categoria_produto.clone()).or(Some("kit".to_string())),
                    produzir_apenas_kit: Some(0),
                    lancamento_meta_meses: ovr.and_then(|o| o.lancamento_meta_meses),
                    lancamento_data_inicio: ovr.and_then(|o| o.lancamento_data_inicio.clone()),
                    terceirizado_modo: ovr.and_then(|o| o.terceirizado_modo.clone()),
                    is_kit_component: Some(false),
                    is_producao_programada: ovr.and_then(|o| o.is_producao_programada),
                    producao_programada_disparo: ovr.and_then(|o| o.producao_programada_disparo),
                    producao_programada_objetivo: ovr.and_then(|o| o.producao_programada_objetivo),
                    lancamento_gatilho: ovr.and_then(|o| o.lancamento_gatilho),
                    lancamento_estoque_maximo: ovr.and_then(|o| o.lancamento_estoque_maximo),
                    familia_produto: ovr.and_then(|o| o.familia_produto.clone()),
                    processo_termico: ovr.and_then(|o| o.processo_termico.clone()),
                    exclusivo_no_dia: ovr.and_then(|o| o.exclusivo_no_dia.clone()),
                    permite_bombona: ovr.and_then(|o| o.permite_bombona.clone()),
                    dias_ate_envase: ovr.and_then(|o| o.dias_ate_envase.clone()),
                    producao_minima_kg: ovr.and_then(|o| o.producao_minima_kg.clone()),
                    media_vendas: ovr.and_then(|o| o.media_manual).unwrap_or(0.0),
                    desvio_padrao: 0.0,
                    demanda_ajustada: ovr.and_then(|o| o.media_manual).unwrap_or(0.0),
                    is_lancamento: false,
                    estoque_ideal_meses: 0.0,
                    abrir_ordem_meses: 0.0,
                    abrir_prod_meses: 0.0,
                    estoque_ideal_qtd: ideal_qtd,
                    abrir_ordem_qtd: 0.0,
                    abrir_prod_qtd: 0.0,
                    duracao_meses: 99.0,
                    duracao_dias: 999.0,
                    status,
                    status_label,
                    producao_recomendada: rec,
                    has_formulation: true,
                    missing_ingredients: Vec::new(),
                    faltas_ativas: None,
                    pedidos_compra_aberto: None,
                    sugestao_compra: None,
                    is_kit: Some(true),
                    parent_kits: None,
                    na_fila: None,
                    planejado_semana: None,
                    conflito_regra: None,
                }
            }
        };

        kit_calc.codigo = clean_product_code(&kit_calc.codigo);

        // Gather components status
        let mut components_detail = Vec::new();
        let mut min_efp: Option<i64> = None;
        let mut min_estoque: Option<i64> = None;
        let mut critical_components = Vec::new();

        for (comp_code, comp_qty, fat_qtd, fat_kits) in &components_with_qty {
            let comp_norm = comp_code.replace('.', "").trim().to_string();
            let detail = if let Some(comp_calc) = computed_map.get(comp_code).or_else(|| computed_map.get(&comp_norm)) {
                if comp_calc.producao_recomendada > 0 {
                    critical_components.push(comp_code.clone());
                }
                Some(KitComponentDetail {
                    codigo: clean_product_code(&comp_calc.codigo),
                    descricao: comp_calc.descricao.clone(),
                    estoque: comp_calc.estoque,
                    producao: comp_calc.producao,
                    pedidos_aberto: comp_calc.pedidos_aberto,
                    estoque_futuro_com_producao: comp_calc.estoque_futuro_com_producao,
                    producao_recomendada: comp_calc.producao_recomendada,
                    status: comp_calc.status.clone(),
                    status_label: comp_calc.status_label.clone(),
                    quantidade: *comp_qty,
                    fator_proporcao_qtd: *fat_qtd,
                    fator_proporcao_kits: *fat_kits,
                    necessita_producao: comp_calc.producao_recomendada > 0,
                    fonte: Some("produto".into()),
                    produzir_apenas_kit: comp_calc.produzir_apenas_kit,
                })
            } else if let Some((desc, est, prod, ped)) = item_stocks.get(comp_code) {
                Some(kit_component_from_item(
                    comp_code,
                    desc,
                    *est,
                    *prod,
                    *ped,
                    *comp_qty,
                    *fat_qtd,
                    *fat_kits,
                ))
            } else {
                // Mantém o vínculo mesmo sem cadastro (não some da UI)
                Some(KitComponentDetail {
                    codigo: comp_code.clone(),
                    descricao: format!("{} (sem cadastro)", comp_code),
                    estoque: 0,
                    producao: 0,
                    pedidos_aberto: 0,
                    estoque_futuro_com_producao: 0,
                    producao_recomendada: 0,
                    status: "critico".into(),
                    status_label: "Sem cadastro".into(),
                    quantidade: *comp_qty,
                    fator_proporcao_qtd: *fat_qtd,
                    fator_proporcao_kits: *fat_kits,
                    necessita_producao: false,
                    fonte: None,
                    produzir_apenas_kit: None,
                })
            };

            if let Some(detail) = detail {
                let from_efp = if *comp_qty > 0.0 {
                    (detail.estoque_futuro_com_producao as f64 / *comp_qty).floor() as i64
                } else {
                    detail.estoque_futuro_com_producao
                };
                let from_estoque = if *comp_qty > 0.0 {
                    (detail.estoque as f64 / *comp_qty).floor() as i64
                } else {
                    detail.estoque
                };
                min_efp = Some(match min_efp {
                    Some(m) => std::cmp::min(m, from_efp),
                    None => from_efp,
                });
                min_estoque = Some(match min_estoque {
                    Some(m) => std::cmp::min(m, from_estoque),
                    None => from_estoque,
                });
                components_detail.push(detail);
            }
        }

        let max_mont_efp = min_efp.unwrap_or(0).max(0);
        let max_mont_estoque = min_estoque.unwrap_or(0).max(0);

        // Capacidade só dos componentes-produto (ignora embalagem/insumo na sugestão de produção).
        let mut min_prod_efp: Option<i64> = None;
        let mut min_prod_estoque: Option<i64> = None;
        for d in components_detail.iter().filter(|d| d.fonte.as_deref() == Some("produto")) {
            let from_efp = if d.quantidade > 0.0 {
                (d.estoque_futuro_com_producao as f64 / d.quantidade).floor() as i64
            } else {
                d.estoque_futuro_com_producao
            };
            let from_est = if d.quantidade > 0.0 {
                (d.estoque as f64 / d.quantidade).floor() as i64
            } else {
                d.estoque
            };
            min_prod_efp = Some(match min_prod_efp {
                Some(m) => std::cmp::min(m, from_efp),
                None => from_efp,
            });
            min_prod_estoque = Some(match min_prod_estoque {
                Some(m) => std::cmp::min(m, from_est),
                None => from_est,
            });
        }
        let max_mont_produtos_efp = min_prod_efp.unwrap_or(max_mont_efp).max(0);
        let _max_mont_produtos_estoque = min_prod_estoque.unwrap_or(max_mont_estoque).max(0);

        // Kit-only: sugestão = o que ainda falta produzir nos PRODUTOS da composição
        // (embalagem/insumo não entra — senão kits com caixa zerada ficam "Produzir Urgente"
        // mesmo com todos os itens já em OP).
        let necessidade_kit = kit_calc.producao_recomendada;
        if necessidade_kit > 0
            && (kit_calc.status == "critico" || kit_calc.status == "ordem")
        {
            let product_comps: Vec<_> = components_detail
                .iter()
                .filter(|d| d.fonte.as_deref() == Some("produto"))
                .collect();
            let product_bottlenecks_in_production = product_comps.is_empty()
                || product_comps.iter().all(|d| {
                    let kits_from_stock = if d.quantidade > 0.0 {
                        (d.estoque as f64 / d.quantidade).floor() as i64
                    } else {
                        d.estoque
                    };
                    kits_from_stock >= necessidade_kit || d.producao > 0
                });

            if max_mont_estoque >= necessidade_kit {
                // Físico completo (produtos + embalagens) — pode montar agora.
                kit_calc.status = "montar".to_string();
                kit_calc.status_label = "Montar Urgente".to_string();
            } else if max_mont_produtos_efp >= necessidade_kit || product_bottlenecks_in_production
            {
                kit_calc.status = "aguardando".to_string();
                kit_calc.status_label = "Aguardando Produção".to_string();
            }
        }
        if necessidade_kit > 0 {
            kit_calc.producao_recomendada =
                (necessidade_kit - max_mont_produtos_efp).max(0);
        }

        kit_results.push(KitCalculationResult {
            kit_detalhes: kit_calc,
            componentes: components_detail,
            max_montavel: max_mont_efp,
            max_montavel_estoque: max_mont_estoque,
            componentes_criticos: critical_components,
        });
    }

    // Apply visibility filter
    let show_hidden = params.show_hidden.unwrap_or(false);
    if !show_hidden {
        kit_results.retain(|k| k.kit_detalhes.visivel.unwrap_or(1) != 0);
    }

    // Extract stats for metadata based on visible kits (before search/status filters)
    let count_montar = kit_results.iter().filter(|k| k.kit_detalhes.status == "montar").count();
    let count_critico = kit_results.iter().filter(|k| k.kit_detalhes.status == "critico").count();
    let count_aguardando = kit_results.iter().filter(|k| k.kit_detalhes.status == "aguardando").count();
    let count_ordem = kit_results.iter().filter(|k| k.kit_detalhes.status == "ordem").count();
    let count_saudavel = kit_results.iter().filter(|k| k.kit_detalhes.status == "saudavel").count();
    let count_abundante = kit_results.iter().filter(|k| k.kit_detalhes.status == "abundante").count();
    let total_kits = kit_results.len();

    // Apply filtering
    if let Some(ref search) = params.search {
        if !search.trim().is_empty() {
            let term = search.trim().to_lowercase();
            kit_results.retain(|k| {
                k.kit_detalhes.codigo.to_lowercase().contains(&term) || 
                k.kit_detalhes.descricao.to_lowercase().contains(&term)
            });
        }
    }

    if let Some(ref line) = params.linha {
        if !line.is_empty() && line != "ALL" {
            kit_results.retain(|k| k.kit_detalhes.linha_prefix == *line);
        }
    }

    if let Some(ref status) = params.status {
        if !status.is_empty() && status != "ALL" {
            kit_results.retain(|k| k.kit_detalhes.status == *status);
        }
    }

    // Apply sorting
    if let Some(ref sort_field) = params.sort {
        let is_desc = params.order.as_deref().unwrap_or("asc") == "desc";
        match sort_field.as_str() {
            "codigo" => {
                kit_results.sort_by(|a, b| {
                    let res = a.kit_detalhes.codigo.cmp(&b.kit_detalhes.codigo);
                    if is_desc { res.reverse() } else { res }
                });
            }
            "descricao" => {
                kit_results.sort_by(|a, b| {
                    let res = a.kit_detalhes.descricao.to_lowercase().cmp(&b.kit_detalhes.descricao.to_lowercase());
                    if is_desc { res.reverse() } else { res }
                });
            }
            "max_montavel" => {
                kit_results.sort_by(|a, b| {
                    let res = a.max_montavel.cmp(&b.max_montavel);
                    if is_desc { res.reverse() } else { res }
                });
            }
            "componentes_criticos" => {
                kit_results.sort_by(|a, b| {
                    let res = a.componentes_criticos.len().cmp(&b.componentes_criticos.len());
                    if is_desc { res.reverse() } else { res }
                });
            }
            "estoque_futuro_com_producao" | "efp" => {
                kit_results.sort_by(|a, b| {
                    let res = a.kit_detalhes.estoque_futuro_com_producao.cmp(&b.kit_detalhes.estoque_futuro_com_producao);
                    if is_desc { res.reverse() } else { res }
                });
            }
            "duracao_meses" => {
                kit_results.sort_by(|a, b| {
                    let res = a.kit_detalhes.duracao_meses.partial_cmp(&b.kit_detalhes.duracao_meses).unwrap_or(std::cmp::Ordering::Equal);
                    if is_desc { res.reverse() } else { res }
                });
            }
            "status" => {
                kit_results.sort_by(|a, b| {
                    let res = a.kit_detalhes.status.cmp(&b.kit_detalhes.status);
                    if is_desc { res.reverse() } else { res }
                });
            }
            "producao_recomendada" => {
                kit_results.sort_by(|a, b| {
                    let res = a.kit_detalhes.producao_recomendada.cmp(&b.kit_detalhes.producao_recomendada);
                    if is_desc { res.reverse() } else { res }
                });
            }
            _ => {}
        }
    }

    // Extract stats for metadata
    let total_items = kit_results.len();

    // Paginate
    let page = params.page.unwrap_or(1);
    let limit = params.limit.unwrap_or(50);
    let total_pages = (total_items + limit - 1) / limit;
    
    let start = (page - 1) * limit;
    let items_slice = if start < total_items {
        let end = std::cmp::min(start + limit, total_items);
        kit_results[start..end].to_vec()
    } else {
        Vec::new()
    };

    (
        StatusCode::OK,
        Json(json!({
            "items": items_slice,
            "total": total_items,
            "page": page,
            "limit": limit,
            "total_pages": total_pages,
            "stats": {
                "total": total_kits,
                "montar": count_montar,
                "critico": count_critico,
                "aguardando": count_aguardando,
                "ordem": count_ordem,
                "saudavel": count_saudavel,
                "abundante": count_abundante,
            }
        }))
    ).into_response()
}

#[derive(Debug, serde::Deserialize)]
pub struct InsumosStatusParams {
    pub qty: Option<f64>,
    pub bulk_kg: Option<f64>,
}

#[derive(Debug, serde::Serialize)]
pub struct InsumoPurchaseOrderInfo {
    pub n_pedido: i32,
    pub c_nome_f: Option<String>,
    pub d_previsao: Option<String>,
    pub n_qtde: f64,
    pub n_chegou: f64,
    pub n_pendente: f64,
}

#[derive(Debug, serde::Serialize)]
pub struct InsumoStatusDetail {
    pub ingredient_code: String,
    pub description: String,
    pub qty_per_unit: f64,
    pub total_required: f64,
    pub current_stock: f64,
    pub missing_qty: f64,
    pub is_missing: bool,
    pub purchase_orders: Vec<InsumoPurchaseOrderInfo>,
    pub next_delivery_date: Option<String>,
    pub unit: Option<String>,
    pub category_id: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct ProductInsumosStatusResponse {
    pub product_code: String,
    pub batch_qty: f64,
    pub has_formulation: bool,
    pub all_in_stock: bool,
    pub missing_count: usize,
    pub previsao_normalizacao: Option<String>,
    pub status_insumos: String,
    pub ingredients: Vec<InsumoStatusDetail>,
}

// GET /api/producao/insumos-status/:code?qty=...&bulk_kg=...
pub async fn get_insumos_status(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
    Query(params): Query<InsumosStatusParams>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let raw_batch_qty = params.qty.unwrap_or(100.0).max(1.0);

    let clean_code = code.trim().replace('"', "");
    let query_form = r#"
        SELECT f.ingredient_code,
               COALESCE(f.description, i.description, '') as description,
               f.quantity,
               COALESCE(s.stock_qty, e.estoque::float8, 0.0)::float8 as current_stock,
               i.unit as item_unit,
               i.category_id as item_category
        FROM formulations f
        LEFT JOIN items i ON TRIM(REPLACE(i.code, '"', '')) = TRIM(REPLACE(f.ingredient_code, '"', ''))
        LEFT JOIN estoque_atual e ON TRIM(REPLACE(e.codigo, '"', '')) = TRIM(REPLACE(f.ingredient_code, '"', ''))
        LEFT JOIN LATERAL (
            SELECT stock_qty FROM stock_snapshots ss
            WHERE TRIM(REPLACE(ss.item_code, '"', '')) = TRIM(REPLACE(f.ingredient_code, '"', ''))
            ORDER BY ss.snapshot_date DESC, ss.id DESC LIMIT 1
        ) s ON true
        WHERE f.product_code = $1
           OR (f.product_code LIKE '0%' AND SUBSTR(f.product_code, 2) = $1)
           OR ($1 LIKE '0%' AND f.product_code = SUBSTR($1, 2))
        ORDER BY f.quantity DESC
    "#;

    let rows = match sqlx::query(query_form)
        .bind(&clean_code)
        .fetch_all(pool)
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    if rows.is_empty() {
        return (
            StatusCode::OK,
            Json(ProductInsumosStatusResponse {
                product_code: clean_code,
                batch_qty: raw_batch_qty,
                has_formulation: false,
                all_in_stock: false,
                missing_count: 0,
                previsao_normalizacao: None,
                status_insumos: "sem_formula".to_string(),
                ingredients: Vec::new(),
            }),
        )
            .into_response();
    }

    // Calcula a massa total de matéria-prima química na formulação (excluindo embalagens)
    let formula_chemical_mass: f64 = rows.iter().filter_map(|r| {
        let ing: String = r.get(0);
        let desc: String = r.get(1);
        let qty: f64 = r.get(2);
        if crate::modules::producao::cobertura::calc::is_embalagem(&ing, &desc) {
            None
        } else {
            Some(qty)
        }
    }).sum();

    // Se o usuário passou bulk_kg (a massa planejada para o tanque):
    // o fator multiplicador é exatamente bulk_kg / massa_quimica_da_formula
    let multiplier = if let Some(bulk_kg) = params.bulk_kg {
        if formula_chemical_mass > 0.0001 {
            bulk_kg / formula_chemical_mass
        } else {
            raw_batch_qty
        }
    } else {
        raw_batch_qty
    };

    let mut ingredients = Vec::new();
    let mut missing_count = 0;
    let mut max_delivery_date: Option<String> = None;
    let mut missing_without_po = false;

    for row in rows {
        let ing_code: String = row.get(0);
        let ing_desc: String = row.get(1);
        let qty_per_unit: f64 = row.get(2);
        let current_stock: f64 = row.get(3);

        let total_required = qty_per_unit * multiplier;
        let is_missing = current_stock < total_required;
        let missing_qty = if is_missing {
            total_required - current_stock
        } else {
            0.0
        };

        let mut purchase_orders = Vec::new();
        let mut next_delivery_date: Option<String> = None;

        if is_missing {
            missing_count += 1;
            let ing_clean = ing_code.replace('.', "");
            let po_query = r#"
                SELECT po.n_pedido, po.c_nome_f, po.d_previsao, poi.n_qtde, poi.n_chegou,
                       (poi.n_qtde - poi.n_chegou) as n_pendente
                FROM purchase_order_items poi
                JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
                WHERE (poi.c_referencia = $1 OR poi.c_referencia = $2)
                  AND po.c_status <> 'T'
                  AND (poi.n_qtde > poi.n_chegou)
                ORDER BY po.d_previsao ASC NULLS LAST
            "#;

            if let Ok(po_rows) = sqlx::query(po_query)
                .bind(&ing_code)
                .bind(&ing_clean)
                .fetch_all(pool)
                .await
            {
                for po_row in po_rows {
                    let prev_date: Option<String> = po_row.get(2);
                    if next_delivery_date.is_none() && prev_date.is_some() {
                        next_delivery_date = prev_date.clone();
                    }
                    purchase_orders.push(InsumoPurchaseOrderInfo {
                        n_pedido: crate::core::pg_row::pg_i32(&po_row, 0),
                        c_nome_f: po_row.get(1),
                        d_previsao: prev_date,
                        n_qtde: crate::core::pg_row::pg_f64(&po_row, 3),
                        n_chegou: crate::core::pg_row::pg_f64(&po_row, 4),
                        n_pendente: crate::core::pg_row::pg_f64(&po_row, 5),
                    });
                }
            }

            if purchase_orders.is_empty() {
                missing_without_po = true;
            } else if let Some(ref d) = next_delivery_date {
                match &max_delivery_date {
                    None => max_delivery_date = Some(d.clone()),
                    Some(curr) => {
                        if d > curr {
                            max_delivery_date = Some(d.clone());
                        }
                    }
                }
            }
        }

        let item_unit: Option<String> = row.try_get(4).ok().flatten();
        let item_category: Option<String> = row.try_get(5).ok().flatten();

        ingredients.push(InsumoStatusDetail {
            ingredient_code: ing_code,
            description: ing_desc,
            qty_per_unit,
            total_required,
            current_stock,
            missing_qty,
            is_missing,
            purchase_orders,
            next_delivery_date,
            unit: item_unit,
            category_id: item_category,
        });
    }

    let all_in_stock = missing_count == 0;
    let status_insumos = if all_in_stock {
        "disponivel".to_string()
    } else if missing_without_po {
        "sem_pedidos_compra".to_string()
    } else {
        "aguardando_compras".to_string()
    };

    (
        StatusCode::OK,
        Json(ProductInsumosStatusResponse {
            product_code: clean_code,
            batch_qty: multiplier,
            has_formulation: true,
            all_in_stock,
            missing_count,
            previsao_normalizacao: max_delivery_date,
            status_insumos,
            ingredients,
        }),
    )
        .into_response()
}

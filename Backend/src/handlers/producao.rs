use axum::{
    extract::{Query, State, Path},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::collections::HashMap;
use std::sync::Arc;
use serde_json::json;
use sqlx::{PgPool, Row};

use crate::core::db::Db;
use crate::models::{
    KitComponentDetail, KitCalculationResult, LineConfig, Product, ProductCalculationResult, ProductOverride, QueryParams, Stock,
    NewProducaoEntry, HistoryQueryParams,
};
use crate::modules::producao::gerenciamento::calculations::calculate_products;
use crate::handlers::AppState;

// Helper cross-imports
use crate::handlers::imports::clean_product_code;

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
    }
}




#[derive(Debug, serde::Deserialize)]
pub struct ResolveLotePayload {
    pub observations: String,
    pub resolved_by: Option<String>,
}

#[derive(serde::Serialize)]
pub struct ConferenciaItemDetail {
    pub product_code: String,
    pub description: String,
    pub actual_units_envasadas: f64,
    pub expected_finalized_units: f64,
    pub registered_units_stock: f64,
    pub discrepancy: f64,
    pub status: String,
}

#[derive(serde::Serialize)]
pub struct EnvaseItemDetail {
    pub packaging_code: String,
    pub description: String,
    pub expected_qty: f64,
    pub actual_qty: f64,
    pub difference: f64,
    pub percentage_diff: f64,
    pub status: String,
}

#[derive(serde::Serialize)]
pub struct EnvaseProductDetail {
    pub product_code: String,
    pub description: String,
    pub unit_weight_kg: f64,
    pub actual_units_envasadas: f64,
    pub packaging_items: Vec<EnvaseItemDetail>,
    pub has_packaging_formula: bool,
}

#[derive(serde::Serialize)]
pub struct PesagemItemDetail {
    pub ingredient_code: String,
    pub description: String,
    pub expected_qty: f64,
    pub actual_qty: f64,
    pub difference: f64,
    pub percentage_diff: f64,
    pub status: String,
}

// Data structures for detailed lote view
#[derive(serde::Serialize)]
pub struct LoteDetalhes {
    pub lote_number: String,
    pub product_code: String,
    pub product_description: String,
    pub quantity: f64,
    pub date: String,
    pub status: String,
    pub status_label: String,
    pub fabricated_by: String,
    pub authorized_by: String,
    pub pesagem_items: Vec<PesagemItemDetail>,
    pub pesagem_total_expected: f64,
    pub pesagem_total_actual: f64,
    pub envase_products: Vec<EnvaseProductDetail>,
    pub conferencia_items: Vec<ConferenciaItemDetail>,
    pub total_packaged_weight_kg: f64,
    pub bulk_loss_kg: f64,
    pub bulk_yield_percentage: f64,
    pub is_resolved: Option<bool>,
    pub resolution_obs: Option<String>,
}

struct RawLote {
            id: String,
            lote_number: String,
            product_code: String,
            product_description: String,
            quantity: f64,
            date: String,
            details: String,
            is_resolved: Option<bool>,
            resolution_obs: Option<String>,
        }

#[derive(Debug, serde::Deserialize)]
pub struct UpdateLotePayload {
    pub lote_erp: Option<String>,
}

// Helper to query all needed arrays for calculations
pub async fn fetch_calculation_data(state: &Db) -> anyhow::Result<(
    Vec<Product>,
    Vec<Stock>,
    HashMap<String, Vec<i64>>,
    Vec<LineConfig>,
    Vec<ProductOverride>,
    HashMap<String, i64>,
)> {
    let pool = state.pool();

    let product_rows = sqlx::query(
        "SELECT codigo, descricao, linha_prefix, base, media_levantamento FROM produtos",
    )
    .fetch_all(pool)
    .await?;

    let mut products = Vec::new();
    let mut known_codes = std::collections::HashSet::new();
    for row in product_rows {
        let code: String = row.get(0);
        known_codes.insert(clean_product_code(&code));
        products.push(Product {
            codigo: code,
            descricao: row.get(1),
            linha_prefix: row.get(2),
            base: row.get(3),
            base_codigo: None,
            media_levantamento: row.get(4),
        });
    }

    // Include Kits from kit_composicao and overrides that are not in produtos table
    if let Ok(kit_rows) = sqlx::query(
        "SELECT DISTINCT kit_codigo FROM kit_composicao"
    )
    .fetch_all(pool)
    .await
    {
        for row in kit_rows {
            let raw_kit: String = row.get(0);
            let clean_k = clean_product_code(&raw_kit);
            if !clean_k.is_empty() && !known_codes.contains(&clean_k) {
                known_codes.insert(clean_k.clone());
                let desc = sqlx::query_scalar::<_, String>(
                    "SELECT description FROM items WHERE TRIM(REPLACE(code, '\"', '')) = $1 LIMIT 1"
                )
                .bind(&clean_k)
                .fetch_optional(pool)
                .await
                .ok()
                .flatten()
                .unwrap_or_else(|| format!("Kit {}", clean_k));

                products.push(Product {
                    codigo: raw_kit,
                    descricao: desc,
                    linha_prefix: "".to_string(),
                    base: None,
                    base_codigo: None,
                    media_levantamento: 0.0,
                });
            }
        }
    }

    // Pedidos na Produção = residual M/N (allowlist ERP). Não usar estoque_atual.pedidos_aberto (nPedidos).
    let sales_faltas_days = crate::core::sales_open::resolve_faltas_days(state).await;
    let sales_faltas_map =
        crate::core::sales_open::fetch_residual_map(pool, sales_faltas_days)
            .await
            .unwrap_or_default();

    // Prod = max(nQtdeProducao ERP, soma Unidades dos lotes abertos no Hub).
    // Evita subcontar quando o cadastro ERP atrasa vs OPs PG ainda abertas.
    let open_prod_map =
        crate::core::production_reserve::fetch_open_production_units_map(pool).await;

    let stock_rows = sqlx::query(
        "SELECT codigo, estoque, producao, fase FROM estoque_atual",
    )
    .fetch_all(pool)
    .await?;

    let mut stocks = Vec::new();
    for row in stock_rows {
        let codigo: String = row.get(0);
        let estoque: f64 = row.get(1);
        let erp_producao: f64 = row.get(2);
        let hub_producao = open_prod_map.get(&codigo).copied().unwrap_or(0.0);
        let producao = erp_producao.max(hub_producao);
        stocks.push(Stock {
            codigo: codigo.clone(),
            estoque: estoque.round() as i64,
            producao: producao.round() as i64,
            pedidos_aberto: *sales_faltas_map.get(&codigo).unwrap_or(&0),
            fase: row.get(3),
        });
    }

    let configs = state.get_line_configs().await.map_err(|e| anyhow::anyhow!(e))?;
    let overrides = state.get_all_overrides().await.map_err(|e| anyhow::anyhow!(e))?;

    let mut fat_map = HashMap::new();
    let fat_rows = sqlx::query(
        "SELECT codigo, mes, quantidade::bigint FROM historico_faturamento",
    )
        .fetch_all(pool)
        .await?;
    for row in fat_rows {
        let code: String = row.get(0);
        let mes: i32 = row.get(1);
        let qty = crate::core::pg_row::pg_i64(&row, 2);
        let entry = fat_map.entry(code).or_insert_with(|| vec![0; 12]);
        if mes >= 1 && mes <= 12 {
            entry[(mes - 1) as usize] = qty;
        }
    }

    Ok((products, stocks, fat_map, configs, overrides, sales_faltas_map))
}

pub fn post_process_kit_only_production(
    computed: &mut [ProductCalculationResult],
    kit_composition: &HashMap<String, Vec<(String, f64, Option<f64>, Option<i32>)>>,
) {
    let mut kit_codes_set = std::collections::HashSet::new();
    for k in kit_composition.keys() {
        kit_codes_set.insert(clean_product_code(k));
        kit_codes_set.insert(k.trim().to_string());
        kit_codes_set.insert(k.replace('.', "").trim().to_string());
    }
    for p in computed.iter_mut() {
        let clean = clean_product_code(&p.codigo);
        let norm = p.codigo.replace('.', "").trim().to_string();
        if kit_codes_set.contains(&clean) || kit_codes_set.contains(p.codigo.trim()) || kit_codes_set.contains(&norm) || p.categoria_produto.as_deref() == Some("kit") {
            p.is_kit = Some(true);
            if p.categoria_produto.is_none() {
                p.categoria_produto = Some("kit".to_string());
            }
        }
    }

    // 1. Build a map of clean product code -> index in computed slice
    let mut code_to_idx = HashMap::new();
    for (i, p) in computed.iter().enumerate() {
        code_to_idx.insert(clean_product_code(&p.codigo), i);
        code_to_idx.insert(p.codigo.trim().to_string(), i);
        code_to_idx.insert(p.codigo.replace('.', "").trim().to_string(), i);
    }

    // 2. Build a map of component -> list of (parent_kit_code, qty_per_kit)
    let mut component_to_kits: HashMap<String, Vec<(String, f64)>> = HashMap::new();
    for (kit_code, components) in kit_composition {
        let clean_kit = clean_product_code(kit_code);
        for (comp, qty, _fq, _fk) in components {
            let clean_comp = clean_product_code(comp);
            let comp_trim = comp.trim().to_string();
            let comp_dotless = comp.replace('.', "").trim().to_string();
            component_to_kits.entry(clean_comp).or_default().push((clean_kit.clone(), *qty));
            component_to_kits.entry(comp_trim).or_default().push((clean_kit.clone(), *qty));
            component_to_kits.entry(comp_dotless).or_default().push((clean_kit.clone(), *qty));
        }
    }

    // 3. For each computed product, if it's a component of kits, propagate demand
    for i in 0..computed.len() {
        let comp_code = clean_product_code(&computed[i].codigo);
        if let Some(kits) = component_to_kits.get(&comp_code) {
            let mut total_kit_demand: f64 = 0.0;
            let mut parent_kit_labels: Vec<String> = Vec::new();
            let mut seen_parent_kits = std::collections::HashSet::new();

            for (kit_code, qty_per_kit) in kits {
                if seen_parent_kits.contains(kit_code) {
                    continue;
                }
                seen_parent_kits.insert(kit_code.clone());

                if let Some(&kit_idx) = code_to_idx.get(kit_code) {
                    let kit_rec_prod = computed[kit_idx].producao_recomendada;
                    if kit_rec_prod > 0 {
                        let demand_from_kit = kit_rec_prod as f64 * (*qty_per_kit);
                        total_kit_demand += demand_from_kit;
                        parent_kit_labels.push(format!("{} ({} un)", kit_code, demand_from_kit.round() as i64));
                    } else {
                        parent_kit_labels.push(kit_code.clone());
                    }
                } else {
                    parent_kit_labels.push(kit_code.clone());
                }
            }

            if !parent_kit_labels.is_empty() {
                computed[i].is_kit_component = Some(true);
                computed[i].parent_kits = Some(parent_kit_labels);
            }

            let apenas_kit = computed[i].produzir_apenas_kit.unwrap_or(0) == 1;

            if apenas_kit {
                let total_needed = total_kit_demand.round() as i64;
                let efp = computed[i].estoque_futuro_com_producao;
                let deficit = (total_needed - efp).max(0);

                if deficit > 0 {
                    computed[i].producao_recomendada = deficit;
                    computed[i].status = "critico".to_string();
                    computed[i].status_label = "Produzir para Kit".to_string();
                } else {
                    computed[i].producao_recomendada = 0;
                    computed[i].status = "saudavel".to_string();
                    computed[i].status_label = "Estoque OK (Apenas Kit)".to_string();
                }
            } else if total_kit_demand > 0.0 {
                // Item is sold individually AND used in kits.
                // Total requirement = direct ideal stock + demand from kits!
                let total_target = computed[i].estoque_ideal_qtd + total_kit_demand;
                let efp = computed[i].estoque_futuro_com_producao;
                let deficit = (total_target.round() as i64 - efp).max(0);

                if deficit > computed[i].producao_recomendada {
                    computed[i].producao_recomendada = deficit;
                    if computed[i].status == "saudavel" || computed[i].status == "abundante" {
                        computed[i].status = "critico".to_string();
                        computed[i].status_label = "Demanda de Kits".to_string();
                    }
                }
            }
        }
    }
}

// 6. GET /api/products (List products, calculate stock metrics in real-time, filter and paginate)
pub async fn list_products(
    State(state): State<Arc<AppState>>,
    Query(params): Query<QueryParams>,
) -> impl IntoResponse {
    let (products, stocks, fat_map, configs, overrides, sales_faltas_map) =
        match fetch_calculation_data(&state.db).await {
        Ok(data) => data,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao ler dados para cálculos: {}", e) }))
        ).into_response(),
    };

    // Calculate all items in real time
    let mut computed = calculate_products(&products, &stocks, &fat_map, &configs, &overrides);

    // Fetch kit composition and apply kit-only overrides
    let kit_composition = state.db.get_kit_composition().await.unwrap_or_default();
    post_process_kit_only_production(&mut computed, &kit_composition);

    let mut kit_components_set = std::collections::HashSet::new();
    for components in kit_composition.values() {
        for (comp, _qty, _fq, _fk) in components {
            kit_components_set.insert(comp.clone());
        }
    }

    // Fetch formulation and latest stock levels for error decoration
    let pool = state.db.pool();

    let target_days_coloracao = {
        let mut target = 90.0;
        if let Ok(Some(val)) = sqlx::query_scalar::<_, String>(
            "SELECT value FROM config WHERE key = 'compras_coloracao'",
        )
        .fetch_optional(pool)
        .await
        {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&val) {
                if let Some(days) = json.get("targetDays").and_then(|d| d.as_f64()) {
                    target = days;
                }
            }
        }
        target
    };

    let target_days_apoio = {
        let mut target = 90.0;
        if let Ok(Some(val)) = sqlx::query_scalar::<_, String>(
            "SELECT value FROM config WHERE key = 'compras_apoio'",
        )
        .fetch_optional(pool)
        .await
        {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&val) {
                if let Some(days) = json.get("targetDays").and_then(|d| d.as_f64()) {
                    target = days;
                }
            }
        }
        target
    };

    let mut category_parent_map: HashMap<String, String> = HashMap::new();
    if let Ok(rows) = sqlx::query("SELECT id, parent_id FROM categories")
        .fetch_all(pool)
        .await
    {
        for row in rows {
            if let Some(p_id) = row.get::<Option<String>, _>(1) {
                category_parent_map.insert(row.get(0), p_id);
            }
        }
    }

    let resolve_root_category = |cat_id: &str, parent_map: &HashMap<String, String>| -> String {
        let mut current = cat_id.to_string();
        let mut visited = std::collections::HashSet::new();
        visited.insert(current.clone());
        while let Some(parent) = parent_map.get(&current) {
            if visited.contains(parent) {
                break;
            }
            current = parent.clone();
            visited.insert(current.clone());
        }
        current
    };

    let mut formulations_map: HashMap<String, Vec<(String, String, f64)>> = HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT product_code, ingredient_code, description, quantity FROM formulations",
    )
    .fetch_all(pool)
    .await
    {
        for row in rows {
            let p_code: String = row.get(0);
            let ing_code: String = row.get(1);
            let desc: String = row.get::<Option<String>, _>(2).unwrap_or_default();
            let qty: f64 = row.get(3);
            let ingredients = formulations_map.entry(p_code).or_default();
            if let Some(existing) = ingredients.iter_mut().find(|(code, _, _)| code == &ing_code) {
                existing.2 += qty;
            } else {
                ingredients.push((ing_code, desc, qty));
            }
        }
    }

    let mut item_stock_map: HashMap<String, f64> = HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT DISTINCT ON (item_code) item_code, stock_qty
         FROM stock_snapshots
         ORDER BY item_code, snapshot_date DESC, id DESC",
    )
    .fetch_all(pool)
    .await
    {
        for row in rows {
            item_stock_map.insert(row.get(0), row.get(1));
        }
    }

    let mut purchase_transit_map: HashMap<String, i64> = HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT poi.c_referencia, SUM(poi.n_qtde - poi.n_chegou)
         FROM purchase_order_items poi
         JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
         WHERE po.c_status <> 'T' AND (poi.n_qtde > poi.n_chegou)
         GROUP BY poi.c_referencia",
    )
    .fetch_all(pool)
    .await
    {
        for row in rows {
            let code: String = row.get(0);
            let qty: f64 = row.get(1);
            purchase_transit_map.insert(code, qty.round() as i64);
        }
    }

    let mut component_to_kits: HashMap<String, Vec<String>> = HashMap::new();
    for (kit_code, components) in &kit_composition {
        let clean_kit = clean_product_code(kit_code);
        for (comp, _qty, _fq, _fk) in components {
            let clean_comp = clean_product_code(comp);
            let entry = component_to_kits.entry(clean_comp).or_default();
            if !entry.contains(&clean_kit) {
                entry.push(clean_kit.clone());
            }
        }
    }

    // Decorate computed items with formulation and missing ingredients info
    for p in &mut computed {
        let clean_code = clean_product_code(&p.codigo);
        let is_kit = kit_composition.contains_key(&p.codigo) || kit_composition.contains_key(&clean_code) || p.is_kit == Some(true);
        p.is_kit = Some(is_kit);
        if is_kit && p.categoria_produto.is_none() {
            p.categoria_produto = Some("kit".to_string());
        }
        if p.is_kit_component.is_none() || p.is_kit_component == Some(false) {
            p.is_kit_component = Some(kit_components_set.contains(&p.codigo) || kit_components_set.contains(&clean_code));
        }
        if p.parent_kits.is_none() {
            p.parent_kits = component_to_kits.get(&clean_code).cloned();
        }

        let has_form = formulations_map.contains_key(&p.codigo);
        let mut missing = Vec::new();
        if has_form && p.producao_recomendada > 0 {
            if let Some(ingredients) = formulations_map.get(&p.codigo) {
                for (ing_code, desc, qty) in ingredients {
                    let req = p.producao_recomendada as f64 * qty;
                    let stock = *item_stock_map.get(ing_code).unwrap_or(&0.0);
                    if stock < req {
                        missing.push(desc.clone());
                    }
                }
            }
        }
        p.has_formulation = has_form;
        p.missing_ingredients = missing;

        // Populate sales order faltas and purchase transit
        let active_faltas = *sales_faltas_map.get(&p.codigo).unwrap_or(&0);
        let transit_purchase = *purchase_transit_map.get(&p.codigo).unwrap_or(&0);
        p.faltas_ativas = Some(active_faltas);
        p.pedidos_compra_aberto = Some(transit_purchase);

        // Calculate sugestao_compra if the category resolves to coloracao or apoio
        let cat_p = p.categoria_produto.as_deref().unwrap_or("");
        let root_cat = if !cat_p.is_empty() {
            resolve_root_category(cat_p, &category_parent_map)
        } else {
            "".to_string()
        };
        let is_coloracao = root_cat == "cat_coloracao";
        let is_apoio = root_cat == "cat_apoio";

        if is_coloracao || is_apoio {
            let target_days = if is_coloracao { target_days_coloracao } else { target_days_apoio };
            let media_vendas = p.media_vendas;
            // Recalculate ideal quantity: (target_days / 30) * media_vendas (respect manual override if present)
            let ideal_qty = if let Some(manual_ideal) = p.estoque_ideal_manual {
                manual_ideal as f64
            } else {
                (target_days / 30.0) * media_vendas
            };
            p.estoque_ideal_qtd = ideal_qty;

            let current_stock = p.estoque as f64;
            let faltas = active_faltas as f64;
            let in_transit = transit_purchase as f64;
            let suggestion = ideal_qty + faltas - current_stock - in_transit;
            p.sugestao_compra = Some(if suggestion > 0.0 { suggestion.round() as i64 } else { 0 });
        }
    }

    // Filter out kits, coloracao, and apoio from the general production list!
    // Bases (cat_base) ficam na lista geral a menos que o filtro peça só bases.
    computed.retain(|p| {
        let clean_code = clean_product_code(&p.codigo);
        let is_kit = kit_composition.contains_key(&p.codigo) || kit_composition.contains_key(&clean_code);
        let cat_p = p.categoria_produto.as_deref().unwrap_or("");
        let root_cat = if !cat_p.is_empty() {
            resolve_root_category(cat_p, &category_parent_map)
        } else {
            "".to_string()
        };
        let is_coloracao = root_cat == "cat_coloracao";
        let is_apoio = root_cat == "cat_apoio";
        let is_base = root_cat == "cat_base" || p.status_produto.as_deref() == Some("bases") || p.status == "bases";

        if params.programadas_only == Some(true) || params.status.as_deref() == Some("programadas") {
            return p.is_producao_programada == Some(1);
        }

        if let Some(ref status) = params.status {
            if (status == "kit" || status == "kits") && is_kit {
                return true;
            }
            if status == "coloracao" && is_coloracao {
                return true;
            }
            if status == "apoio" && is_apoio {
                return true;
            }
            if (status == "base" || status == "bases") && is_base {
                return true;
            }
        }
        if let Some(ref cat) = params.categoria {
            if (cat == "kit" || cat == "kits" || cat == "cat_kit" || cat == "cat_kits") && is_kit {
                return true;
            }
            if cat == "cat_base" && is_base {
                return true;
            }
            if cat == "cat_coloracao" && is_coloracao {
                return true;
            }
            if cat == "cat_apoio" && is_apoio {
                return true;
            }
        }

        if params.include_kits == Some(true) {
            if params.include_programadas != Some(true) && params.show_hidden != Some(true) && p.is_producao_programada == Some(1) {
                return false;
            }
            return true;
        }

        if params.include_programadas != Some(true) && params.show_hidden != Some(true) && p.is_producao_programada == Some(1) {
            return false;
        }

        !is_kit && !is_coloracao && !is_apoio
    });

    // Extract stats for metadata based on visible products (excluding hidden ones and ignored statuses)
    let ignored_statuses =
        crate::modules::compras::planejamento::commands::get_ignored_product_statuses_query(pool.clone())
            .await
            .unwrap_or_default();
    let visible_products: Vec<&crate::models::ProductCalculationResult> = computed
        .iter()
        .filter(|p| {
            let status = p.status_produto.as_deref().unwrap_or("ativo");
            !ignored_statuses.contains(&status.to_string()) && p.visivel.unwrap_or(1) != 0
        })
        .collect();
    let count_critico = visible_products.iter().filter(|p| p.status == "critico").count();
    let count_ordem = visible_products.iter().filter(|p| p.status == "ordem").count();
    let count_saudavel = visible_products.iter().filter(|p| p.status == "saudavel").count();
    let count_abundante = visible_products.iter().filter(|p| p.status == "abundante").count();
    let count_lancamentos = visible_products.iter().filter(|p| p.is_lancamento).count();
    let total_visible = visible_products.len();

    // Apply visibility filter (skip for programadas_only — items programados devem aparecer mesmo que ocultos)
    let is_programadas_view = params.programadas_only == Some(true) || params.status.as_deref() == Some("programadas");
    let show_hidden = params.show_hidden.unwrap_or(false);
    if !show_hidden && !params.suspended_only.unwrap_or(false) && !is_programadas_view {
        computed.retain(|p| {
            let status = p.status_produto.as_deref().unwrap_or("ativo");
            !ignored_statuses.contains(&status.to_string()) && p.visivel.unwrap_or(1) != 0
        });
    }

    // Apply suspended filter if requested
    if params.suspended_only.unwrap_or(false) {
        computed.retain(|p| {
            let status = p.status_produto.as_deref().unwrap_or("ativo");
            ignored_statuses.contains(&status.to_string()) || p.visivel.unwrap_or(1) == 0
        });
    }

    // Apply filtering
    if let Some(ref search) = params.search {
        if !search.trim().is_empty() {
            let term = search.trim().to_lowercase();
            computed.retain(|p| {
                p.codigo.to_lowercase().contains(&term) || p.descricao.to_lowercase().contains(&term)
            });
        }
    }

    if let Some(ref line) = params.linha {
        if !line.is_empty() && line != "ALL" {
            computed.retain(|p| p.linha_prefix == *line);
        }
    }

    if let Some(ref status) = params.status {
        if !status.is_empty() && status != "ALL" {
            match status.as_str() {
                "ERR_NO_FORMULA" => {
                    computed.retain(|p| !p.has_formulation);
                }
                "ERR_MISSING_MATS" => {
                    computed.retain(|p| !p.missing_ingredients.is_empty());
                }
                "ERR_ANY" => {
                    computed.retain(|p| !p.has_formulation || !p.missing_ingredients.is_empty());
                }
                "coloracao" => {
                    computed.retain(|p| {
                        let cat_p = p.categoria_produto.as_deref().unwrap_or("");
                        let root_cat = if !cat_p.is_empty() {
                            resolve_root_category(cat_p, &category_parent_map)
                        } else {
                            "".to_string()
                        };
                        root_cat == "cat_coloracao"
                    });
                }
                "apoio" => {
                    computed.retain(|p| {
                        let cat_p = p.categoria_produto.as_deref().unwrap_or("");
                        let root_cat = if !cat_p.is_empty() {
                            resolve_root_category(cat_p, &category_parent_map)
                        } else {
                            "".to_string()
                        };
                        root_cat == "cat_apoio"
                    });
                }
                "base" | "bases" => {
                    computed.retain(|p| {
                        let cat_p = p.categoria_produto.as_deref().unwrap_or("");
                        let root_cat = if !cat_p.is_empty() {
                            resolve_root_category(cat_p, &category_parent_map)
                        } else {
                            "".to_string()
                        };
                        root_cat == "cat_base"
                            || p.status_produto.as_deref() == Some("bases")
                            || p.status == "bases"
                    });
                }
                _ => {
                    computed.retain(|p| p.status == *status);
                }
            }
        }
    }

    if let Some(ref cat) = params.categoria {
        if !cat.is_empty() && cat != "ALL" {
            computed.retain(|p| {
                let cat_p = p.categoria_produto.as_deref().unwrap_or("");
                let root_cat = if !cat_p.is_empty() {
                    resolve_root_category(cat_p, &category_parent_map)
                } else {
                    "".to_string()
                };
                root_cat == *cat
                    || (cat == "cat_base"
                        && (p.status_produto.as_deref() == Some("bases") || p.status == "bases"))
            });
        }
    }

    if let Some(ref base_filter) = params.base {
        if !base_filter.is_empty() && base_filter != "ALL" {
            if base_filter == "HAS_BASE" {
                computed.retain(|p| p.base.is_some() && !p.base.as_ref().unwrap().trim().is_empty());
            } else if base_filter == "NO_BASE" {
                computed.retain(|p| p.base.is_none() || p.base.as_ref().unwrap().trim().is_empty());
            } else {
                computed.retain(|p| {
                    p.base.as_ref().map(|b| b.trim() == base_filter).unwrap_or(false)
                });
            }
        }
    }

    // Apply sorting
    if let Some(ref sort_field) = params.sort {
        let is_desc = params.order.as_deref().unwrap_or("asc") == "desc";
        match sort_field.as_str() {
            "codigo" => {
                computed.sort_by(|a, b| {
                    let res = a.codigo.cmp(&b.codigo);
                    if is_desc { res.reverse() } else { res }
                });
            }
            "descricao" => {
                computed.sort_by(|a, b| {
                    let res = a.descricao.to_lowercase().cmp(&b.descricao.to_lowercase());
                    if is_desc { res.reverse() } else { res }
                });
            }
            "estoque_futuro_com_producao" | "efp" => {
                computed.sort_by(|a, b| {
                    let res = a.estoque_futuro_com_producao.cmp(&b.estoque_futuro_com_producao);
                    if is_desc { res.reverse() } else { res }
                });
            }
            "duracao_meses" => {
                computed.sort_by(|a, b| {
                    let res = a.duracao_meses.partial_cmp(&b.duracao_meses).unwrap_or(std::cmp::Ordering::Equal);
                    if is_desc { res.reverse() } else { res }
                });
            }
            "status" => {
                computed.sort_by(|a, b| {
                    let res = a.status.cmp(&b.status);
                    if is_desc { res.reverse() } else { res }
                });
            }
            "producao_recomendada" => {
                computed.sort_by(|a, b| {
                    let res = a.producao_recomendada.cmp(&b.producao_recomendada);
                    if is_desc { res.reverse() } else { res }
                });
            }
            _ => {}
        }
    }

    let total_items = computed.len();

    // Get unique base names for filter dropdown
    let mut bases_set = HashMap::new();
    for p in &products {
        if let Some(ref b) = p.base {
            let b_trimmed = b.trim();
            if !b_trimmed.is_empty() {
                bases_set.insert(b_trimmed.to_string(), true);
            }
        }
    }
    let mut unique_bases: Vec<String> = bases_set.into_keys().collect();
    unique_bases.sort();

    // Paginate
    let page = params.page.unwrap_or(1);
    let limit = params.limit.unwrap_or(50);
    let total_pages = (total_items + limit - 1) / limit;
    
    let start = (page - 1) * limit;
    let items_slice = if start < total_items {
        let end = std::cmp::min(start + limit, total_items);
        computed[start..end].to_vec()
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
                "critico": count_critico,
                "ordem": count_ordem,
                "saudavel": count_saudavel,
                "abundante": count_abundante,
                "lancamentos": count_lancamentos,
                "total_visible": total_visible,
            },
            "bases": unique_bases,
        }))
    ).into_response()
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

// 10. POST /api/historico
pub async fn add_producao(
    State(state): State<Arc<AppState>>,
    Json(entry): Json<NewProducaoEntry>,
) -> impl IntoResponse {
    if entry.codigo.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Código do produto não pode ser vazio" }))
        ).into_response();
    }
    if entry.quantidade <= 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Quantidade deve ser maior que zero" }))
        ).into_response();
    }
    if entry.data_producao.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Data da produção não pode ser vazia" }))
        ).into_response();
    }

    match state.db.add_producao_entry(&entry).await {
        Ok(id) => (
            StatusCode::CREATED,
            Json(json!({ "status": "success", "id": id, "message": "Produção lançada com sucesso!" }))
        ).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao salvar lançamento de produção: {}", e) }))
        ).into_response(),
    }
}

// 11. GET /api/historico
pub async fn list_producao(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HistoryQueryParams>,
) -> impl IntoResponse {
    match state.db.list_producao_history(&params).await {
        Ok(records) => (StatusCode::OK, Json(records)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao listar histórico de produção: {}", e) }))
        ).into_response(),
    }
}

// 12. DELETE /api/historico/:id
pub async fn delete_producao(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    match state.db.delete_producao_entry(id).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "status": "success", "message": "Produção estornada/excluída com sucesso!" }))
        ).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao estornar produção: {}", e) }))
        ).into_response(),
    }
}

// 12b. PUT /api/historico/:id/lote
pub async fn update_producao_lote(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateLotePayload>,
) -> impl IntoResponse {
    match state.db.update_producao_lote(id, payload.lote_erp.as_deref()).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "status": "success", "message": "Lote ERP atualizado com sucesso!" }))
        ).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao atualizar Lote ERP: {}", e) }))
        ).into_response(),
    }
}

// GET /api/producao/recalcular/preview
pub async fn preview_recalculation(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let product_code = match params.get("product_code") {
        Some(code) => code,
        None => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Falta product_code" }))).into_response(),
    };
    let ingredient_code = match params.get("ingredient_code") {
        Some(code) => code,
        None => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Falta ingredient_code" }))).into_response(),
    };
    
    let pool = state.db.pool();

    let product_desc: String = sqlx::query_scalar(
        "SELECT descricao FROM produtos WHERE codigo = $1",
    )
    .bind(product_code)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .unwrap_or_else(|| "Produto não encontrado".to_string());

    let ingredient_desc: String = sqlx::query_scalar(
        "SELECT description FROM items WHERE code = $1",
    )
    .bind(ingredient_code)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .unwrap_or_else(|| "Insumo não encontrado".to_string());

    let qty_per_unit: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(quantity), 0.0) FROM formulations WHERE product_code = $1 AND ingredient_code = $2",
    )
    .bind(product_code)
    .bind(ingredient_code)
    .fetch_one(pool)
    .await
    .unwrap_or(0.0);

    let total_produced: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(quantidade), 0)::bigint FROM historico_producao WHERE codigo = $1",
    )
    .bind(product_code)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let current_stock: f64 = sqlx::query_scalar(
        "SELECT stock_qty FROM stock_snapshots ss
         WHERE ss.item_code = $1
         ORDER BY ss.snapshot_date DESC, ss.id DESC LIMIT 1",
    )
    .bind(ingredient_code)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .unwrap_or(0.0);
    
    let total_consumption = total_produced as f64 * qty_per_unit;
    let expected_stock = current_stock - total_consumption;
    
    (
        StatusCode::OK,
        Json(crate::models::RecalculationPreviewResponse {
            product_code: product_code.clone(),
            product_description: product_desc,
            ingredient_code: ingredient_code.clone(),
            ingredient_description: ingredient_desc,
            total_produced,
            qty_per_unit,
            total_consumption,
            current_stock,
            expected_stock,
        })
    ).into_response()
}

// POST /api/producao/recalcular/ajustar
pub async fn apply_recalculation_adjustment(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<crate::models::RecalculationAdjustmentRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let (current_stock, reserved_qty, in_production, in_orders): (f64, f64, f64, f64) =
        match sqlx::query(
            "SELECT stock_qty, reserved_qty, in_production, in_orders FROM stock_snapshots ss
             WHERE ss.item_code = $1
             ORDER BY ss.snapshot_date DESC, ss.id DESC LIMIT 1",
        )
        .bind(&payload.ingredient_code)
        .fetch_optional(pool)
        .await
        {
            Ok(Some(row)) => (
                row.get(0),
                row.get(1),
                row.get(2),
                row.get(3),
            ),
            _ => (0.0, 0.0, 0.0, 0.0),
        };

    let new_stock = (current_stock - payload.adjustment_qty).max(0.0);

    let _ = sqlx::query(
        "INSERT INTO stock_imports (id, filename, source, imported_at, item_count)
         VALUES ('MANUAL_ADJUST', 'Ajuste Manual', 'AJUSTE', NOW(), 1)
         ON CONFLICT(id) DO NOTHING",
    )
    .execute(pool)
    .await;

    let new_uuid = uuid::Uuid::new_v4().to_string();

    match sqlx::query(
        "INSERT INTO stock_snapshots (id, import_id, item_code, stock_qty, reserved_qty, in_production, in_orders, snapshot_date)
         VALUES ($1, 'MANUAL_ADJUST', $2, $3, $4, $5, $6, NOW())",
    )
    .bind(&new_uuid)
    .bind(&payload.ingredient_code)
    .bind(new_stock)
    .bind(reserved_qty)
    .bind(in_production)
    .bind(in_orders)
    .execute(pool)
    .await
    {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ 
                "status": "success", 
                "message": format!("Estoque da embalagem/insumo {} ajustado de {} para {} com sucesso!", payload.ingredient_code, current_stock, new_stock) 
            }))
        ).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("Erro ao inserir snapshot de ajuste: {}", e) }))).into_response(),
    }
}

// GET /api/producao/lotes
pub async fn get_production_lotes(
    State(state): State<Arc<AppState>>,
    Query(params): Query<QueryParams>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let mut qb = sqlx::QueryBuilder::new(
        "SELECT m.id, m.document_number, m.item_code, p.descricao, m.quantity, m.date, m.details, r.is_resolved, r.observations
         FROM stock_movements m
         LEFT JOIN produtos p ON m.item_code = p.codigo
         LEFT JOIN lote_error_resolutions r ON m.document_number = r.lote_number
         WHERE m.item_type = 'produto' AND m.movement_type = 'entrada' AND m.date::timestamp <= NOW()",
    );

    if let Some(ref status) = params.status {
        if !status.is_empty() && status != "ALL" {
            qb.push(" AND m.details LIKE ");
            qb.push_bind(format!("%Status: {}%", status));
        }
    }

    if let Some(ref search) = params.search {
        if !search.trim().is_empty() {
            let like_arg = format!("%{}%", search.trim());
            qb.push(" AND (m.document_number LIKE ");
            qb.push_bind(like_arg.clone());
            qb.push(" OR m.item_code LIKE ");
            qb.push_bind(like_arg.clone());
            qb.push(" OR p.descricao LIKE ");
            qb.push_bind(like_arg.clone());
            qb.push(" OR m.details LIKE ");
            qb.push_bind(like_arg);
            qb.push(")");
        }
    }

    qb.push(" ORDER BY m.date DESC");
    let limit_val = params.limit.unwrap_or(10000);
    qb.push(format!(" LIMIT {}", limit_val));

    let rows = match qb.build().fetch_all(pool).await {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let mut raw_lotes = Vec::new();
    for row in rows {
        let is_resolved_int: Option<i32> = row.get(7);
        raw_lotes.push(RawLote {
            id: row.get(0),
            lote_number: row.get::<Option<String>, _>(1).unwrap_or_default(),
            product_code: row.get(2),
            product_description: row.get::<Option<String>, _>(3).unwrap_or_default(),
            quantity: row.get(4),
            date: row.get(5),
            details: row.get::<Option<String>, _>(6).unwrap_or_default(),
            is_resolved: is_resolved_int.map(|v| v == 1),
            resolution_obs: row.get(8),
        });
    }

    let mut grouped_lotes: Vec<crate::models::ProductionLote> = Vec::new();
    let mut lote_indices = std::collections::HashMap::new();

    for rl in raw_lotes {
        let mut status = String::new();
        let mut fabricated_by = String::new();
        let mut authorized_by = String::new();
        for part in rl.details.split('|') {
            let part = part.trim();
            if part.starts_with("Status:") {
                status = part.trim_start_matches("Status:").trim().to_string();
            } else if part.starts_with("Fab:") {
                fabricated_by = part.trim_start_matches("Fab:").trim().to_string();
            } else if part.starts_with("Aut:") {
                authorized_by = part.trim_start_matches("Aut:").trim().to_string();
            }
        }

        if let Some(&idx) = lote_indices.get(&rl.lote_number) {
            let lote: &mut crate::models::ProductionLote = &mut grouped_lotes[idx];
            if !lote.product_code.contains(&rl.product_code) {
                lote.product_code = format!("{} / {}", lote.product_code, rl.product_code);
                lote.product_description = format!("{} / {}", lote.product_description, rl.product_description);
            }
            lote.quantity += rl.quantity;
        } else {
            let new_lote = crate::models::ProductionLote {
                id: rl.id,
                lote_number: rl.lote_number.clone(),
                product_code: rl.product_code,
                product_description: rl.product_description,
                quantity: rl.quantity,
                date: rl.date,
                status,
                fabricated_by,
                authorized_by,
                yield_error: None,
                pesagem_error: None,
                envase_error: None,
                conferencia_error: None,
                is_resolved: rl.is_resolved,
                resolution_obs: rl.resolution_obs,
                snap_estoque: None,
                snap_producao: None,
                snap_pedidos: None,
                snap_efp: None,
                snap_media_vendas: None,
                snap_duracao_meses: None,
                snap_status: None,
                snap_status_label: None,
                snap_producao_recomendada: None,
                snap_estoque_ideal_qtd: None,
                snap_demanda_ajustada: None,
                observacoes: None,
            };
            lote_indices.insert(rl.lote_number, grouped_lotes.len());
            grouped_lotes.push(new_lote);
        }
    }

    use std::collections::HashMap as StdHashMap;

    let check_lote_nums: Vec<String> = grouped_lotes
        .iter()
        .filter(|l| l.status == "EA" || l.status == "FP" || l.status == "CF")
        .map(|l| l.lote_number.clone())
        .collect();

    let mut batch_by_lote: StdHashMap<String, Vec<(String, f64, String, String)>> = StdHashMap::new();
    let mut exit_sum_by_lote: StdHashMap<String, f64> = StdHashMap::new();
    let mut form_sum_by_prod: StdHashMap<String, f64> = StdHashMap::new();
    let mut exits_detail_by_lote: StdHashMap<String, StdHashMap<String, f64>> = StdHashMap::new();
    let mut recipe_by_prod: StdHashMap<String, Vec<(String, String, f64, Option<f64>)>> = StdHashMap::new();

    if !check_lote_nums.is_empty() {
        if let Ok(rows) = sqlx::query(
            "SELECT COALESCE(m.document_number, ''), m.item_code, m.quantity, COALESCE(p.descricao, ''), COALESCE(m.details, '')
             FROM stock_movements m
             LEFT JOIN produtos p ON m.item_code = p.codigo
             WHERE m.document_number = ANY($1)
               AND m.item_type = 'produto' AND m.movement_type = 'entrada'",
        )
        .bind(&check_lote_nums)
        .fetch_all(pool)
        .await
        {
            for row in rows {
                let doc: String = row.get(0);
                batch_by_lote.entry(doc).or_default().push((
                    row.get(1),
                    row.get(2),
                    row.get(3),
                    row.get(4),
                ));
            }
        }

        if let Ok(rows) = sqlx::query(
            "SELECT document_number, COALESCE(SUM(quantity), 0.0)
             FROM stock_movements
             WHERE document_number = ANY($1)
               AND item_type = 'insumo' AND movement_type = 'saida'
             GROUP BY document_number",
        )
        .bind(&check_lote_nums)
        .fetch_all(pool)
        .await
        {
            for row in rows {
                exit_sum_by_lote.insert(row.get(0), row.get(1));
            }
        }

        if let Ok(rows) = sqlx::query(
            "SELECT document_number, item_code, SUM(quantity)
             FROM stock_movements
             WHERE document_number = ANY($1) AND movement_type = 'saida'
             GROUP BY document_number, item_code",
        )
        .bind(&check_lote_nums)
        .fetch_all(pool)
        .await
        {
            for row in rows {
                let doc: String = row.get(0);
                let code: String = row.get(1);
                let qty: f64 = row.get(2);
                *exits_detail_by_lote
                    .entry(doc)
                    .or_default()
                    .entry(code)
                    .or_insert(0.0) += qty;
            }
        }

        let mut product_codes: Vec<String> = batch_by_lote
            .values()
            .flat_map(|v| v.iter().map(|(c, _, _, _)| c.clone()))
            .collect();
        for l in &grouped_lotes {
            if check_lote_nums.iter().any(|n| n == &l.lote_number) {
                for part in l.product_code.split(" / ") {
                    product_codes.push(part.trim().to_string());
                }
            }
        }
        product_codes.sort();
        product_codes.dedup();

        if !product_codes.is_empty() {
            if let Ok(rows) = sqlx::query(
                "SELECT product_code, COALESCE(SUM(quantity), 1.0)
                 FROM formulations WHERE product_code = ANY($1)
                 GROUP BY product_code",
            )
            .bind(&product_codes)
            .fetch_all(pool)
            .await
            {
                for row in rows {
                    form_sum_by_prod.insert(row.get(0), row.get(1));
                }
            }

            if let Ok(rows) = sqlx::query(
                "SELECT product_code, ingredient_code, COALESCE(description, ''), quantity, percentage
                 FROM formulations WHERE product_code = ANY($1)",
            )
            .bind(&product_codes)
            .fetch_all(pool)
            .await
            {
                for row in rows {
                    let pcode: String = row.get(0);
                    recipe_by_prod.entry(pcode).or_default().push((
                        row.get(1),
                        row.get(2),
                        row.get(3),
                        row.get(4),
                    ));
                }
            }
        }
    }

    let mut base_product_codes: StdHashMap<String, bool> = StdHashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT codigo FROM overrides_produtos
         WHERE categoria_produto = 'cat_base' OR status_produto = 'bases'",
    )
    .fetch_all(pool)
    .await
    {
        for row in rows {
            let c: String = row.get(0);
            base_product_codes.insert(c, true);
        }
    }

    for lote in &mut grouped_lotes {
        let status = &lote.status;
        if status == "EA" || status == "FP" || status == "CF" {
            let mut batch_products = batch_by_lote
                .get(&lote.lote_number)
                .cloned()
                .unwrap_or_default();
            if batch_products.is_empty() {
                batch_products.push((
                    lote.product_code.clone(),
                    lote.quantity,
                    lote.product_description.clone(),
                    lote.status.clone(),
                ));
            }

            let ing_exit_sum = exit_sum_by_lote
                .get(&lote.lote_number)
                .copied()
                .unwrap_or(0.0);
            let mut total_expected_weight = 0.0;
            for (p_code, p_qty, _, _) in &batch_products {
                let form_sum = form_sum_by_prod.get(p_code).copied().unwrap_or(1.0);
                total_expected_weight += p_qty * form_sum;
            }

            if ing_exit_sum > 0.0 && total_expected_weight > 0.0 {
                let diff = (ing_exit_sum - total_expected_weight).abs() / total_expected_weight;
                lote.yield_error = Some(diff > 0.10);
            }

            let empty_exits = StdHashMap::new();
            let exits = exits_detail_by_lote
                .get(&lote.lote_number)
                .unwrap_or(&empty_exits);

            let mut pesagem_err = false;
            let mut envase_err = false;
            let mut conferencia_err = false;

            for (p_code, p_qty, p_desc, p_details) in &batch_products {
                let (pe, ee, ce) = check_lote_errors_cached(
                    pool,
                    &lote.lote_number,
                    p_code,
                    *p_qty,
                    p_details,
                    p_desc,
                    exits,
                    &recipe_by_prod,
                    &batch_products,
                    base_product_codes.contains_key(p_code),
                )
                .await;
                if pe {
                    pesagem_err = true;
                }
                if ee {
                    envase_err = true;
                }
                if ce {
                    conferencia_err = true;
                }
            }

            lote.pesagem_error = Some(pesagem_err);
            lote.envase_error = Some(envase_err);
            lote.conferencia_error = Some(conferencia_err);
        }
    }

    // 1. Carrega snapshots existentes em historico_producao
    type SnapTuple = (
        Option<i64>, Option<i64>, Option<i64>, Option<i64>,
        Option<f64>, Option<f64>, Option<String>, Option<String>,
        Option<i64>, Option<f64>, Option<f64>, Option<String>,
    );
    let mut history_by_lote: StdHashMap<String, SnapTuple> = StdHashMap::new();
    let mut history_by_prod_date: StdHashMap<String, SnapTuple> = StdHashMap::new();

    if let Ok(rows) = sqlx::query(
        "SELECT lote_erp, codigo, data_producao, snap_estoque, snap_producao, snap_pedidos, snap_efp,
                snap_media_vendas, snap_duracao_meses, snap_status, snap_status_label,
                snap_producao_recomendada, snap_estoque_ideal_qtd, snap_demanda_ajustada, observacoes
         FROM historico_producao"
    )
    .fetch_all(pool)
    .await
    {
        for r in rows {
            let lote_erp: Option<String> = r.get(0);
            let codigo: String = r.get(1);
            let data_prod: String = r.get(2);
            let snap: SnapTuple = (
                r.get::<Option<i32>, _>(3).map(|v| v as i64),
                r.get::<Option<i32>, _>(4).map(|v| v as i64),
                r.get::<Option<i32>, _>(5).map(|v| v as i64),
                r.get::<Option<i32>, _>(6).map(|v| v as i64),
                r.get::<Option<f64>, _>(7),
                r.get::<Option<f64>, _>(8),
                r.get::<Option<String>, _>(9),
                r.get::<Option<String>, _>(10),
                r.get::<Option<i32>, _>(11).map(|v| v as i64),
                r.get::<Option<f64>, _>(12),
                r.get::<Option<f64>, _>(13),
                r.get::<Option<String>, _>(14),
            );
            if let Some(ref le) = lote_erp {
                let le_clean = le.trim();
                if !le_clean.is_empty() {
                    history_by_lote.insert(le_clean.to_string(), snap.clone());
                }
            }
            let d_clean = data_prod.split('T').next().unwrap_or(&data_prod).split(' ').next().unwrap_or(&data_prod);
            history_by_prod_date.insert(format!("{}_{}", codigo.trim(), d_clean), snap);
        }
    }

    // 2. Carrega métricas reais calculadas dos produtos para auto-snapshot de novos lotes ERP
    type ProdCalcTuple = (i64, i64, i64, f64, i64, String, String, i64, f64, f64, f64);
    let mut prod_metrics_map: StdHashMap<String, ProdCalcTuple> = StdHashMap::new();

    if let Ok((products, stocks, fat_map, configs, overrides, _)) = fetch_calculation_data(&state.db).await {
        let computed = calculate_products(&products, &stocks, &fat_map, &configs, &overrides);
        for item in computed {
            let tuple: ProdCalcTuple = (
                item.estoque,
                item.producao,
                item.pedidos_aberto,
                item.media_vendas,
                item.estoque_futuro_com_producao,
                item.status,
                item.status_label,
                item.producao_recomendada,
                item.duracao_meses,
                item.estoque_ideal_qtd,
                item.demanda_ajustada,
            );
            let raw_code = item.codigo.trim().to_string();
            let clean_code = clean_product_code(&raw_code);
            prod_metrics_map.insert(raw_code, tuple.clone());
            if !clean_code.is_empty() {
                prod_metrics_map.insert(clean_code, tuple);
            }
        }
    }

    // 3. Itera pelos lotes e associa snapshot ou cria snapshot automático
    let mut auto_inserts: Vec<(String, String, i32, Option<String>, i32, i32, i32, i32, f64, f64, String, String, i32, String)> = Vec::new();

    for lote in &mut grouped_lotes {
        let l_num = lote.lote_number.trim();
        let raw_p_code = lote.product_code.split(" / ").next().unwrap_or(&lote.product_code).trim();
        let p_code = clean_product_code(raw_p_code);
        let d_clean = lote.date.split('T').next().unwrap_or(&lote.date).split(' ').next().unwrap_or(&lote.date);
        let prod_date_key = format!("{}_{}", raw_p_code, d_clean);
        let clean_prod_date_key = format!("{}_{}", p_code, d_clean);

        if let Some(snap) = history_by_lote
            .get(l_num)
            .or_else(|| history_by_prod_date.get(&prod_date_key))
            .or_else(|| history_by_prod_date.get(&clean_prod_date_key))
        {
            lote.snap_estoque = snap.0;
            lote.snap_producao = snap.1;
            lote.snap_pedidos = snap.2;
            lote.snap_efp = snap.3;
            lote.snap_media_vendas = snap.4;
            lote.snap_duracao_meses = snap.5;
            lote.snap_status = snap.6.clone();
            lote.snap_status_label = snap.7.clone();
            lote.snap_producao_recomendada = snap.8;
            lote.snap_estoque_ideal_qtd = snap.9;
            lote.snap_demanda_ajustada = snap.10;
            lote.observacoes = snap.11.clone();
        } else if let Some(m) = prod_metrics_map.get(raw_p_code).or_else(|| prod_metrics_map.get(&p_code)) {
            lote.snap_estoque = Some(m.0);
            lote.snap_producao = Some(m.1);
            lote.snap_pedidos = Some(m.2);
            lote.snap_media_vendas = Some(m.3);
            lote.snap_efp = Some(m.4);
            lote.snap_status = Some(m.5.clone());
            lote.snap_status_label = Some(m.6.clone());
            lote.snap_producao_recomendada = Some(m.7);
            lote.snap_duracao_meses = Some(m.8);
            lote.snap_estoque_ideal_qtd = Some(m.9);
            lote.snap_demanda_ajustada = Some(m.10);
            lote.observacoes = Some("Registrado automaticamente via sincronização ERP".to_string());

            if !l_num.is_empty() {
                auto_inserts.push((
                    lote.date.clone(),
                    raw_p_code.to_string(),
                    lote.quantity.round() as i32,
                    Some("Sincronizado automaticamente via ERP".to_string()),
                    m.0 as i32,
                    m.1 as i32,
                    m.2 as i32,
                    m.4 as i32,
                    m.3,
                    m.8,
                    m.5.clone(),
                    m.6.clone(),
                    m.7 as i32,
                    l_num.to_string(),
                ));
            }
        }
    }

    // 4. Salva em historico_producao os novos lotes para persistência
    if !auto_inserts.is_empty() {
        for item in auto_inserts {
            let exists: Option<i32> = sqlx::query_scalar(
                "SELECT id FROM historico_producao WHERE lote_erp = $1 LIMIT 1"
            )
            .bind(&item.13)
            .fetch_optional(pool)
            .await
            .unwrap_or(None);

            if exists.is_none() {
                let _ = sqlx::query(
                    "INSERT INTO historico_producao (
                        data_producao, codigo, quantidade, observacoes,
                        snap_estoque, snap_producao, snap_pedidos, snap_efp,
                        snap_media_vendas, snap_duracao_meses, snap_status, snap_status_label,
                        snap_producao_recomendada, lote_erp
                     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)"
                )
                .bind(&item.0)
                .bind(&item.1)
                .bind(item.2)
                .bind(&item.3)
                .bind(item.4)
                .bind(item.5)
                .bind(item.6)
                .bind(item.7)
                .bind(item.8)
                .bind(item.9)
                .bind(&item.10)
                .bind(&item.11)
                .bind(item.12)
                .bind(&item.13)
                .execute(pool)
                .await;
            }
        }
    }

    (StatusCode::OK, Json(grouped_lotes)).into_response()
}

/// Versão com caches pré-carregados (lista de lotes) — evita N+1 em movements/formulations.
pub async fn check_lote_errors_cached(
    pool: &PgPool,
    lote_number: &str,
    product_code: &str,
    quantity: f64,
    details: &str,
    product_description: &str,
    exits_map: &std::collections::HashMap<String, f64>,
    recipe_by_prod: &std::collections::HashMap<String, Vec<(String, String, f64, Option<f64>)>>,
    batch_products_full: &[(String, f64, String, String)],
    is_production_base: bool,
) -> (bool, bool, bool) {
    let mut pesagem_error = false;
    let mut envase_error = false;
    let mut conferencia_error = false;

    let _ = (pool, lote_number);

    let batch_products: Vec<(String, f64, String)> = batch_products_full
        .iter()
        .map(|(c, q, d, _)| (c.clone(), *q, d.clone()))
        .collect();

    let recipe_items = recipe_by_prod
        .get(product_code)
        .cloned()
        .unwrap_or_default();

    let total_batch_quantity: f64 = batch_products.iter().map(|(_, qty, _)| *qty).sum();
    let pesagem_total_actual = exits_map
        .iter()
        .filter(|(code, _)| code.starts_with("9.15."))
        .map(|(_, qty)| *qty)
        .sum::<f64>();
    let basis_weight_total = if pesagem_total_actual > 0.0 {
        pesagem_total_actual
    } else {
        total_batch_quantity
    };

    let mut total_expected_ingredients = std::collections::HashMap::new();
    for (p_code, p_qty, p_desc) in &batch_products {
        let prop = if total_batch_quantity > 0.0 {
            *p_qty / total_batch_quantity
        } else {
            0.0
        };
        let basis_weight_p = basis_weight_total * prop;
        let p_unit_weight = parse_unit_weight_from_desc(p_desc);
        let empty = Vec::new();
        let p_recipe = recipe_by_prod.get(p_code).unwrap_or(&empty);
        for (ing_code, _desc, std_qty, percentage) in p_recipe {
            if ing_code.starts_with("9.15.") {
                let pct = percentage.unwrap_or(0.0);
                let expected_qty = if pct > 0.0 {
                    basis_weight_p * (pct / 100.0)
                } else {
                    let estimated_pct = if p_unit_weight > 0.0 {
                        (std_qty / p_unit_weight) * 100.0
                    } else {
                        0.0
                    };
                    basis_weight_p * (estimated_pct / 100.0)
                };
                *total_expected_ingredients
                    .entry(ing_code.clone())
                    .or_insert(0.0) += expected_qty;
            }
        }
    }

    for (ing_code, expected_qty) in &total_expected_ingredients {
        let actual_qty = *exits_map.get(ing_code).unwrap_or(&0.0);
        let percentage_diff = if *expected_qty > 0.0 {
            ((actual_qty - expected_qty) / expected_qty) * 100.0
        } else {
            0.0
        };
        if (actual_qty == 0.0 && *expected_qty > 0.0)
            || (*expected_qty > 0.0 && percentage_diff.abs() > 10.0)
        {
            pesagem_error = true;
            break;
        }
    }

    let packaging_recipe_items: Vec<(String, String, f64)> = recipe_items
        .iter()
        .filter(|(code, _, _, _)| !code.starts_with("9.15."))
        .map(|(c, d, q, _)| (c.clone(), d.clone(), *q))
        .collect();

    // Bases não vão para envase/conferência de unidades acabadas
    if is_production_base {
        return (pesagem_error, false, false);
    }

    let main_unit_weight = parse_unit_weight_from_desc(product_description);
    let mut actual_units_envasadas = 0.0;
    let mut primary_units = 0.0;
    let mut has_primary = false;

    for (code, desc, std_qty) in &packaging_recipe_items {
        if *std_qty <= 0.0 {
            continue;
        }
        let total_exit_qty = *exits_map.get(code).unwrap_or(&0.0);
        let mut total_sharing_weight = 0.0;
        let mut is_shared = false;
        for (other_code, other_qty, _) in &batch_products {
            let has_item = recipe_by_prod
                .get(other_code)
                .map(|r| r.iter().any(|(ic, _, _, _)| ic == code))
                .unwrap_or(false);
            if has_item {
                total_sharing_weight += *other_qty;
                if other_code != product_code {
                    is_shared = true;
                }
            }
        }
        let exit_qty = if is_shared && total_sharing_weight > 0.0 {
            total_exit_qty * (quantity / total_sharing_weight)
        } else {
            total_exit_qty
        };
        let units = exit_qty / std_qty;
        if is_primary_container(desc) && exit_qty > 0.0 {
            has_primary = true;
            if units > primary_units {
                primary_units = units;
            }
        }
        if units > actual_units_envasadas {
            actual_units_envasadas = units;
        }
    }

    let actual_units_envasadas = if has_primary {
        primary_units.round()
    } else {
        actual_units_envasadas.round()
    };
    let basis_units = if actual_units_envasadas > 0.0 {
        actual_units_envasadas
    } else if main_unit_weight > 0.0 {
        (quantity / main_unit_weight).round()
    } else {
        quantity
    };

    for (item_code, _, std_qty) in &packaging_recipe_items {
        let expected_qty = basis_units * std_qty;
        let total_exit_qty = *exits_map.get(item_code).unwrap_or(&0.0);
        let mut total_sharing_weight = 0.0;
        let mut is_shared = false;
        for (other_code, other_qty, _) in &batch_products {
            let has_item = recipe_by_prod
                .get(other_code)
                .map(|r| r.iter().any(|(ic, _, _, _)| ic == item_code))
                .unwrap_or(false);
            if has_item {
                total_sharing_weight += *other_qty;
                if other_code != product_code {
                    is_shared = true;
                }
            }
        }
        let actual_qty = if is_shared && total_sharing_weight > 0.0 {
            total_exit_qty * (quantity / total_sharing_weight)
        } else {
            total_exit_qty
        };
        let percentage_diff = if expected_qty > 0.0 {
            ((actual_qty - expected_qty) / expected_qty) * 100.0
        } else {
            0.0
        };
        if (actual_qty == 0.0 && expected_qty > 0.0)
            || (expected_qty > 0.0 && percentage_diff.abs() > 10.0)
        {
            envase_error = true;
            break;
        }
    }

    let mut unidades_conferidas = None;
    for part in details.split('|') {
        let part = part.trim();
        if part.starts_with("Unidades:") {
            if let Ok(u) = part.trim_start_matches("Unidades:").trim().parse::<f64>() {
                unidades_conferidas = Some(u);
            }
        }
    }
    if let Some(conf) = unidades_conferidas {
        if basis_units > 0.0 {
            let diff = ((conf - basis_units).abs() / basis_units) * 100.0;
            if diff > 10.0 {
                conferencia_error = true;
            }
        }
    }

    let _ = (pool, lote_number); // reserved for future base_code lookups
    (pesagem_error, envase_error, conferencia_error)
}

pub async fn check_lote_errors(
    pool: &PgPool,
    lote_number: &str,
    product_code: &str,
    quantity: f64,
    details: &str,
    product_description: &str,
) -> (bool, bool, bool) {
    let mut pesagem_error = false;
    let mut envase_error = false;
    let mut conferencia_error = false;

    let is_production_base: bool = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM overrides_produtos
         WHERE codigo = $1 AND (categoria_produto = 'cat_base' OR status_produto = 'bases')",
    )
    .bind(product_code)
    .fetch_one(pool)
    .await
    .unwrap_or(0)
        > 0;

    let mut exits_map = std::collections::HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT item_code, quantity FROM stock_movements
         WHERE document_number = $1 AND movement_type = 'saida'",
    )
    .bind(lote_number)
    .fetch_all(pool)
    .await
    {
        for row in rows {
            let code: String = row.get(0);
            let qty: f64 = row.get(1);
            *exits_map.entry(code).or_insert(0.0) += qty;
        }
    }

    let mut base_code: Option<String> = sqlx::query_scalar(
        "SELECT base_code FROM historico_producao WHERE lote_erp = $1 AND consume_base = 1 LIMIT 1",
    )
    .bind(lote_number)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    if base_code.is_none() {
        if let Some(b_desc) = sqlx::query_scalar::<_, Option<String>>(
            "SELECT base FROM produtos WHERE codigo = $1 LIMIT 1",
        )
        .bind(product_code)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .flatten()
        {
            if let Ok(bc) = sqlx::query_scalar::<_, String>(
                "SELECT codigo FROM produtos WHERE descricao = $1 LIMIT 1",
            )
            .bind(&b_desc)
            .fetch_optional(pool)
            .await
            {
                if let Some(bc) = bc {
                    if exits_map.contains_key(&bc) {
                        base_code = Some(bc);
                    }
                }
            }
        }
    }

    let mut base_ingredients = std::collections::HashSet::new();
    if let Some(ref bc) = base_code {
        if let Ok(rows) = sqlx::query(
            "SELECT ingredient_code FROM formulations WHERE product_code = $1",
        )
        .bind(bc)
        .fetch_all(pool)
        .await
        {
            for row in rows {
                base_ingredients.insert(row.get::<String, _>(0));
            }
        }
    }

    let mut batch_products = Vec::new();
    if let Ok(rows) = sqlx::query(
        "SELECT m.item_code, m.quantity, p.descricao
         FROM stock_movements m
         LEFT JOIN produtos p ON m.item_code = p.codigo
         WHERE m.document_number = $1 AND m.item_type = 'produto' AND m.movement_type = 'entrada'",
    )
    .bind(lote_number)
    .fetch_all(pool)
    .await
    {
        for row in rows {
            batch_products.push((
                row.get::<String, _>(0),
                crate::core::pg_row::pg_f64(&row, 1),
                row.get::<Option<String>, _>(2).unwrap_or_default(),
            ));
        }
    }

    if batch_products.is_empty() {
        batch_products.push((
            product_code.to_string(),
            quantity,
            product_description.to_string(),
        ));
    }

    let total_batch_quantity: f64 = batch_products.iter().map(|(_, qty, _)| *qty).sum();

    let mut recipe_items = Vec::new();
    if let Ok(rows) = sqlx::query(
        "SELECT ingredient_code, description, quantity, percentage FROM formulations WHERE product_code = $1",
    )
    .bind(product_code)
    .fetch_all(pool)
    .await
    {
        for row in rows {
            recipe_items.push((
                row.get::<String, _>(0),
                row.get::<Option<String>, _>(1).unwrap_or_default(),
                crate::core::pg_row::pg_f64(&row, 2),
                row.get::<Option<f64>, _>(3),
            ));
        }
    }

    let mut consolidated_recipe_items: Vec<(String, String, f64, Option<f64>)> = Vec::new();
    for (ing_code, ing_desc, qty, pct) in recipe_items {
        if let Some(existing) = consolidated_recipe_items
            .iter_mut()
            .find(|(code, _, _, _)| code == &ing_code)
        {
            existing.2 += qty;
            if let Some(p) = pct {
                existing.3 = Some(existing.3.unwrap_or(0.0) + p);
            }
        } else {
            consolidated_recipe_items.push((ing_code, ing_desc, qty, pct));
        }
    }
    let recipe_items = consolidated_recipe_items;

    let mut total_expected_ingredients = std::collections::HashMap::new();
    let pesagem_total_actual = exits_map
        .iter()
        .filter(|(code, _)| code.starts_with("9.15."))
        .map(|(_, qty)| *qty)
        .sum::<f64>();

    let basis_weight_total = if pesagem_total_actual > 0.0 {
        pesagem_total_actual
    } else {
        total_batch_quantity
    };

    for (p_code, p_qty, p_desc) in &batch_products {
        let prop = if total_batch_quantity > 0.0 {
            *p_qty / total_batch_quantity
        } else {
            0.0
        };
        let basis_weight_p = basis_weight_total * prop;
        let p_unit_weight = parse_unit_weight_from_desc(p_desc);

        let mut p_recipe = Vec::new();
        if let Ok(rows) = sqlx::query(
            "SELECT ingredient_code, quantity, percentage FROM formulations WHERE product_code = $1",
        )
        .bind(p_code)
        .fetch_all(pool)
        .await
        {
            for row in rows {
                p_recipe.push((
                    row.get::<String, _>(0),
                    crate::core::pg_row::pg_f64(&row, 1),
                    row.get::<Option<f64>, _>(2),
                ));
            }
        }

        for (ing_code, std_qty, percentage) in p_recipe {
            if ing_code.starts_with("9.15.") {
                let pct = percentage.unwrap_or(0.0);
                let expected_qty = if pct > 0.0 {
                    basis_weight_p * (pct / 100.0)
                } else {
                    let estimated_pct = if p_unit_weight > 0.0 {
                        (std_qty / p_unit_weight) * 100.0
                    } else {
                        0.0
                    };
                    basis_weight_p * (estimated_pct / 100.0)
                };
                *total_expected_ingredients.entry(ing_code).or_insert(0.0) += expected_qty;
            }
        }
    }

    for (ing_code, expected_qty) in &total_expected_ingredients {
        let mut actual_qty = *exits_map.get(ing_code).unwrap_or(&0.0);

        if let Ok(rows) = sqlx::query(
            "SELECT item_code_b FROM similar_items WHERE item_code_a = $1
             UNION
             SELECT item_code_a FROM similar_items WHERE item_code_b = $1",
        )
        .bind(ing_code)
        .fetch_all(pool)
        .await
        {
            for row in rows {
                let sim_code: String = row.get(0);
                if let Some(&qty) = exits_map.get(&sim_code) {
                    actual_qty += qty;
                }
            }
        }

        if actual_qty < 0.0001 {
            actual_qty = 0.0;
        }

        let difference = actual_qty - expected_qty;
        let percentage_diff = if *expected_qty > 0.0 {
            (difference / expected_qty) * 100.0
        } else {
            0.0
        };

        if (actual_qty == 0.0 && *expected_qty > 0.0)
            || (*expected_qty > 0.0 && percentage_diff.abs() > 10.0)
        {
            let is_missing = actual_qty == 0.0 && *expected_qty > 0.0;
            let is_in_base = is_missing && base_ingredients.contains(ing_code);
            if !is_in_base {
                pesagem_error = true;
            }
        }
    }

    let mut actual_units_envasadas = 0.0;
    let mut primary_units = 0.0;
    let mut has_primary = false;

    let mut packaging_recipe_items = Vec::new();
    for (code, desc, std_qty, _) in &recipe_items {
        if !code.starts_with("9.15.") {
            packaging_recipe_items.push((code.clone(), desc.clone(), *std_qty));
        }
    }

    if is_production_base {
        return (pesagem_error, false, false);
    }

    let main_unit_weight = parse_unit_weight_from_desc(product_description);

    for (code, desc, std_qty) in &packaging_recipe_items {
        if *std_qty > 0.0 {
            let total_exit_qty = *exits_map.get(code).unwrap_or(&0.0);

            let mut total_sharing_weight = 0.0;
            let mut is_shared = false;
            for (other_code, other_qty, _) in &batch_products {
                let has_item: i64 = sqlx::query_scalar(
                    "SELECT COUNT(*) FROM formulations WHERE product_code = $1 AND ingredient_code = $2",
                )
                .bind(other_code)
                .bind(code)
                .fetch_one(pool)
                .await
                .unwrap_or(0);
                if has_item > 0 {
                    total_sharing_weight += *other_qty;
                    if other_code != product_code {
                        is_shared = true;
                    }
                }
            }

            let exit_qty = if is_shared && total_sharing_weight > 0.0 {
                total_exit_qty * (quantity / total_sharing_weight)
            } else {
                total_exit_qty
            };

            let units = exit_qty / std_qty;

            if is_primary_container(desc) && exit_qty > 0.0 {
                has_primary = true;
                if units > primary_units {
                    primary_units = units;
                }
            }

            if units > actual_units_envasadas {
                actual_units_envasadas = units;
            }
        }
    }

    let actual_units_envasadas = if has_primary {
        primary_units.round()
    } else {
        actual_units_envasadas.round()
    };

    let basis_units = if actual_units_envasadas > 0.0 {
        actual_units_envasadas
    } else if main_unit_weight > 0.0 {
        (quantity / main_unit_weight).round()
    } else {
        quantity
    };

    for (item_code, _, std_qty) in &packaging_recipe_items {
        let expected_qty = basis_units * std_qty;
        let total_exit_qty = *exits_map.get(item_code).unwrap_or(&0.0);

        let mut total_sharing_weight = 0.0;
        let mut is_shared = false;
        for (other_code, other_qty, _) in &batch_products {
            let has_item: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM formulations WHERE product_code = $1 AND ingredient_code = $2",
            )
            .bind(other_code)
            .bind(item_code)
            .fetch_one(pool)
            .await
            .unwrap_or(0);
            if has_item > 0 {
                total_sharing_weight += *other_qty;
                if other_code != product_code {
                    is_shared = true;
                }
            }
        }

        let actual_qty = if is_shared && total_sharing_weight > 0.0 {
            total_exit_qty * (quantity / total_sharing_weight)
        } else {
            total_exit_qty
        };

        let difference = actual_qty - expected_qty;
        let percentage_diff = if expected_qty > 0.0 {
            (difference / expected_qty) * 100.0
        } else {
            0.0
        };

        if (actual_qty == 0.0 && expected_qty > 0.0)
            || (expected_qty > 0.0 && percentage_diff.abs() > 10.0)
        {
            envase_error = true;
        }
    }

    let mut unidades_conferidas = None;
    for part in details.split('|') {
        let part = part.trim();
        if part.starts_with("Unidades:") {
            if let Ok(u) = part.trim_start_matches("Unidades:").trim().parse::<f64>() {
                if u > 0.0 {
                    unidades_conferidas = Some(u);
                }
            }
        }
    }

    let expected_finalized = if actual_units_envasadas > 0.0 {
        actual_units_envasadas - 1.0
    } else {
        let fallback_units = if let Some(u) = unidades_conferidas {
            u + 1.0
        } else if main_unit_weight > 0.0 {
            (quantity / main_unit_weight).round()
        } else {
            quantity
        };
        fallback_units - 1.0
    };

    let registered_units = if let Some(u) = unidades_conferidas {
        u
    } else if main_unit_weight > 0.0 {
        (quantity / main_unit_weight).round()
    } else {
        quantity
    };
    let discrepancy = registered_units - expected_finalized;
    if discrepancy.abs() > 0.5 {
        conferencia_error = true;
    }

    (pesagem_error, envase_error, conferencia_error)
}

fn is_primary_container(desc: &str) -> bool {
    let d = desc.to_uppercase();
    d.contains("FRASCO") || 
    d.starts_with("FR ") || d.contains(" FR ") ||
    d.starts_with("FR.") || d.contains(" FR.") ||
    d.contains("POTE") || 
    d.starts_with("PT ") || d.contains(" PT ") ||
    d.starts_with("PT.") || d.contains(" PT.") ||
    d.contains("VIDRO") || 
    d.contains("BISNAGA") || 
    d.contains("SACHE") || d.contains("SACHÊ") || 
    d.contains("AMPOLA") || 
    d.contains("BALDE") || 
    d.contains("GALÃO") || d.contains("GALAO") || 
    d.contains("PET") ||
    d.contains("TAMPA") ||
    d.starts_with("TP ") || d.contains(" TP ") ||
    d.starts_with("TP.") || d.contains(" TP.") ||
    d.contains("VALVULA") || d.contains("VÁLVULA") ||
    d.contains("GARGALO") || d.contains("BORRIFADOR") ||
    d.contains("SPRAY") || d.contains("DISPENCER") ||
    d.contains("BICO")
}

// Helpers for parsing product sizes from descriptions
fn parse_unit_weight_from_desc(desc: &str) -> f64 {
    let desc_upper = desc.to_uppercase();
    let chars: Vec<char> = desc_upper.chars().collect();
    let n = chars.len();
    
    let mut i = 0;
    while i < n {
        if chars[i].is_ascii_digit() {
            let start = i;
            while i < n && (chars[i].is_ascii_digit() || chars[i] == '.' || chars[i] == ',') {
                i += 1;
            }
            let num_str: String = chars[start..i].iter().collect();
            let num_str_clean = num_str.replace(',', ".");
            if let Ok(num) = num_str_clean.parse::<f64>() {
                while i < n && (chars[i] == ' ' || chars[i] == '\t') {
                    i += 1;
                }
                if i < n {
                    let remaining: String = chars[i..].iter().collect();
                    if remaining.starts_with("ML") {
                        return num / 1000.0;
                    } else if remaining.starts_with("KG") {
                        return num;
                    } else if remaining.starts_with("GR") {
                        return num / 1000.0;
                    } else if remaining.starts_with("G") {
                        let next_char = chars.get(i + 1);
                        if next_char.is_none() || !next_char.unwrap().is_ascii_alphabetic() {
                            return num / 1000.0;
                        }
                    } else if remaining.starts_with("L") {
                        let next_char = chars.get(i + 1);
                        if next_char.is_none() || !next_char.unwrap().is_ascii_alphabetic() {
                            return num;
                        }
                    }
                }
            }
        } else {
            i += 1;
        }
    }
    0.25 // default
}

// GET /api/producao/lotes/:number
pub async fn get_lote_lookup(
    State(state): State<Arc<AppState>>,
    Path(lote_number): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let rows = match sqlx::query(
        "SELECT m.item_code, COALESCE(p.descricao, ''), m.quantity, m.date, COALESCE(m.details, '')
         FROM stock_movements m
         LEFT JOIN produtos p ON m.item_code = p.codigo
         WHERE m.document_number = $1 AND m.item_type = 'produto' AND m.movement_type = 'entrada'
         ORDER BY m.item_code",
    )
    .bind(&lote_number)
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
            StatusCode::NOT_FOUND,
            Json(json!({ "error": format!("Lote \"{}\" não encontrado", lote_number) })),
        )
            .into_response();
    }

    let mut status = String::new();
    let mut fabricated_by = String::new();
    let mut authorized_by = String::new();
    let mut d_pesado = String::new();
    let mut d_envase = String::new();
    let details: String = rows[0].get(4);
    for part in details.split('|') {
        let part = part.trim();
        if part.starts_with("Status:") {
            status = part.trim_start_matches("Status:").trim().to_string();
        } else if part.starts_with("Fab:") {
            fabricated_by = part.trim_start_matches("Fab:").trim().to_string();
        } else if part.starts_with("Aut:") {
            authorized_by = part.trim_start_matches("Aut:").trim().to_string();
        } else if part.starts_with("dPesado:") {
            let candidate = part.trim_start_matches("dPesado:").trim().to_string();
            if candidate.len() >= 8 {
                d_pesado = candidate;
            }
        } else if part.starts_with("dEnvase:") {
            let candidate = part.trim_start_matches("dEnvase:").trim().to_string();
            if candidate.len() >= 8 {
                d_envase = candidate;
            }
        }
    }

    if d_envase.is_empty() || d_pesado.is_empty() {
        if let Ok(other_movs) = sqlx::query(
            "SELECT COALESCE(details, '') FROM stock_movements WHERE document_number = $1 AND details IS NOT NULL AND details != ''",
        )
        .bind(&lote_number)
        .fetch_all(pool)
        .await
        {
            for m in other_movs {
                let det: String = m.get(0);
                for part in det.split('|') {
                    let part = part.trim();
                    if d_envase.is_empty() && part.starts_with("dEnvase:") {
                        let candidate = part.trim_start_matches("dEnvase:").trim().to_string();
                        if candidate.len() >= 8 {
                            d_envase = candidate;
                        }
                    }
                    if d_pesado.is_empty() && part.starts_with("dPesado:") {
                        let candidate = part.trim_start_matches("dPesado:").trim().to_string();
                        if candidate.len() >= 8 {
                            d_pesado = candidate;
                        }
                    }
                }
            }
        }
    }

    let status_label = match status.to_uppercase().as_str() {
        "EA" => "Estoque Atualizado",
        "PG" => "Em Pesagem",
        "PP" => "Pré-Produção",
        "PR" => "Em Produção",
        "EN" => "Em Envase",
        "CF" => "Conferido",
        "CA" => "Cancelado",
        "FP" => "Finalizado",
        _ => &status,
    }
    .to_string();

    let mut products = Vec::new();
    let mut product_code_parts = Vec::new();
    let mut product_desc_parts = Vec::new();
    let mut total_qty = 0.0f64;
    let mut date = String::new();

    for row in &rows {
        let code: String = row.get(0);
        let desc: String = row.get(1);
        let qty: f64 = row.get(2);
        let dt: String = row.get(3);
        if date.is_empty() {
            date = dt.clone();
        }
        total_qty += qty;
        product_code_parts.push(code.clone());
        product_desc_parts.push(desc.clone());
        products.push(json!({
            "productCode": code,
            "productDescription": desc,
            "quantity": qty,
            "unitWeightKg": parse_unit_weight_from_desc(&desc),
        }));
    }

    let effective_date = if !d_envase.is_empty() {
        d_envase.clone()
    } else if !d_pesado.is_empty() {
        d_pesado.clone()
    } else {
        date.clone()
    };

    (
        StatusCode::OK,
        Json(json!({
            "loteNumber": lote_number,
            "productCode": product_code_parts.join(" / "),
            "productDescription": product_desc_parts.join(" / "),
            "quantity": total_qty,
            "date": effective_date,
            "dLote": date,
            "dPesado": d_pesado,
            "dEnvase": d_envase,
            "status": status,
            "statusLabel": status_label,
            "fabricatedBy": fabricated_by,
            "authorizedBy": authorized_by,
            "products": products,
        })),
    )
        .into_response()
}

// GET /api/producao/lotes/:number/detalhes
pub async fn get_lote_detalhes(
    State(state): State<Arc<AppState>>,
    Path(lote_number): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let rows = match sqlx::query(
        "SELECT m.item_code, p.descricao, m.quantity, m.date, m.details
         FROM stock_movements m
         LEFT JOIN produtos p ON m.item_code = p.codigo
         WHERE m.document_number = $1 AND m.item_type = 'produto' AND m.movement_type = 'entrada'",
    )
    .bind(&lote_number)
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

    let mut products = Vec::new();
    for row in rows {
        products.push((
            row.get::<String, _>(0),
            row.get::<Option<String>, _>(1).unwrap_or_default(),
            crate::core::pg_row::pg_f64(&row, 2),
            row.get::<String, _>(3),
            row.get::<Option<String>, _>(4).unwrap_or_default(),
        ));
    }

    if products.is_empty() {
        return (StatusCode::NOT_FOUND, Json(json!({ "error": "Lote não encontrado no banco de dados" }))).into_response();
    }

    let product_code = products.iter().map(|p| p.0.clone()).collect::<Vec<_>>().join(" / ");
    let product_description = products.iter().map(|p| p.1.clone()).collect::<Vec<_>>().join(" / ");
    let quantity = products.iter().map(|p| p.2).sum::<f64>();
    let date = products[0].3.clone();
    
    let details_str = products[0].4.clone();
    let mut status = String::new();
    let mut fabricated_by = String::new();
    let mut authorized_by = String::new();
    for part in details_str.split('|') {
        let part = part.trim();
        if part.starts_with("Status:") {
            status = part.trim_start_matches("Status:").trim().to_string();
        } else if part.starts_with("Fab:") {
            fabricated_by = part.trim_start_matches("Fab:").trim().to_string();
        } else if part.starts_with("Aut:") {
            authorized_by = part.trim_start_matches("Aut:").trim().to_string();
        }
    }

    let status_label = match status.to_uppercase().as_str() {
        "EA" => "Estoque Atualizado",
        "PG" => "Em Pesagem",
        "PP" => "Pré-Produção",
        "PR" => "Em Produção",
        "EN" => "Em Envase",
        "CF" => "Conferido",
        "CA" => "Cancelado",
        "FP" => "Finalizado",
        _ => &status,
    }.to_string();

    let mut exits_map = std::collections::HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT item_code, quantity FROM stock_movements
         WHERE document_number = $1 AND item_type = 'insumo' AND movement_type = 'saida'",
    )
    .bind(&lote_number)
    .fetch_all(pool)
    .await
    {
        for row in rows {
            let code: String = row.get(0);
            let qty: f64 = row.get(1);
            *exits_map.entry(code).or_insert(0.0) += qty;
        }
    }

    let mut base_code: Option<String> = sqlx::query_scalar(
        "SELECT base_code FROM historico_producao WHERE lote_erp = $1 AND consume_base = 1 LIMIT 1",
    )
    .bind(&lote_number)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    if base_code.is_none() {
        for (p_code, _, _, _, _) in &products {
            if let Some(b_desc) = sqlx::query_scalar::<_, Option<String>>(
                "SELECT base FROM produtos WHERE codigo = $1 LIMIT 1",
            )
            .bind(p_code)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten()
            .flatten()
            {
                if let Ok(Some(bc)) = sqlx::query_scalar::<_, String>(
                    "SELECT codigo FROM produtos WHERE descricao = $1 LIMIT 1",
                )
                .bind(&b_desc)
                .fetch_optional(pool)
                .await
                {
                    if exits_map.contains_key(&bc) {
                        base_code = Some(bc);
                        break;
                    }
                }
            }
        }
    }

    let mut base_ingredients = std::collections::HashSet::new();
    if let Some(ref bc) = base_code {
        if let Ok(rows) = sqlx::query(
            "SELECT ingredient_code FROM formulations WHERE product_code = $1",
        )
        .bind(bc)
        .fetch_all(pool)
        .await
        {
            for row in rows {
                base_ingredients.insert(row.get::<String, _>(0));
            }
        }
    }

    let mut total_expected_ingredients = std::collections::HashMap::new();


    let pesagem_total_actual: f64 = exits_map.iter()
        .filter(|(code, _)| code.starts_with("9.15."))
        .map(|(_, qty)| *qty)
        .sum();

    let basis_weight_total = if pesagem_total_actual >= 0.1 * quantity {
        pesagem_total_actual
    } else {
        quantity
    };

    for (p_code, p_desc, p_qty, _, _) in &products {
        let prop = if quantity > 0.0 { *p_qty / quantity } else { 0.0 };
        let basis_weight_p = basis_weight_total * prop;
        let p_unit_weight = parse_unit_weight_from_desc(p_desc);
        
        let mut recipe_items = Vec::new();
        if let Ok(rows) = sqlx::query(
            "SELECT ingredient_code, description, quantity, percentage FROM formulations WHERE product_code = $1",
        )
        .bind(p_code)
        .fetch_all(pool)
        .await
        {
            for row in rows {
                recipe_items.push((
                    row.get::<String, _>(0),
                    row.get::<Option<String>, _>(1).unwrap_or_default(),
                    crate::core::pg_row::pg_f64(&row, 2),
                    row.get::<Option<f64>, _>(3),
                ));
            }
        }
        
        for (ing_code, ing_desc, std_qty, percentage) in recipe_items {
            if ing_code.starts_with("9.15.") {
                let pct = percentage.unwrap_or(0.0);
                let expected_qty = if pct > 0.0 {
                    basis_weight_p * (pct / 100.0)
                } else {
                    let estimated_pct = if p_unit_weight > 0.0 { (std_qty / p_unit_weight) * 100.0 } else { 0.0 };
                    basis_weight_p * (estimated_pct / 100.0)
                };
                
                let entry = total_expected_ingredients.entry(ing_code.clone()).or_insert((ing_desc, 0.0));
                entry.1 += expected_qty;
            }
        }
    }

    let mut pesagem_items = Vec::new();
    let mut pesagem_total_expected = 0.0;
    
    for (ing_code, (ing_desc, expected_qty)) in &total_expected_ingredients {

        pesagem_total_expected += expected_qty;

        let mut actual_qty = *exits_map.get(ing_code).unwrap_or(&0.0);
        if actual_qty < 0.0001 {
            actual_qty = 0.0;
        }

        let difference = actual_qty - expected_qty;
        let percentage_diff = if *expected_qty > 0.0 {
            (difference / expected_qty) * 100.0
        } else {
            0.0
        };

        let item_status = if actual_qty == 0.0 && *expected_qty > 0.0 {
            if base_ingredients.contains(ing_code) {
                "OK (Na Base)"
            } else {
                "MISSING"
            }
        } else if percentage_diff.abs() > 10.0 {
            "DISCREPANCY"
        } else {
            "OK"
        };

        pesagem_items.push(PesagemItemDetail {
            ingredient_code: ing_code.clone(),
            description: ing_desc.clone(),
            expected_qty: *expected_qty,
            actual_qty,
            difference,
            percentage_diff,
            status: item_status.to_string(),
        });
    }

    // Also include unplanned/unregistered exits in pesagem_items
    for (ing_code, actual_qty) in &exits_map {
        let is_base = base_code.as_ref().map(|bc| bc == ing_code).unwrap_or(false);
        if is_base || (ing_code.starts_with("9.15.") && !total_expected_ingredients.contains_key(ing_code)) {
            let mut ing_desc = String::new();
            if let Ok(Some(desc)) = sqlx::query_scalar::<_, String>(
                "SELECT description FROM items WHERE code = $1",
            )
            .bind(ing_code)
            .fetch_optional(pool)
            .await
            {
                ing_desc = desc;
            }
            if ing_desc.is_empty() {
                if let Ok(Some(desc)) = sqlx::query_scalar::<_, String>(
                    "SELECT descricao FROM produtos WHERE codigo = $1",
                )
                .bind(ing_code)
                .fetch_optional(pool)
                .await
                {
                    ing_desc = desc;
                }
            }
            if ing_desc.is_empty() {
                ing_desc = "Insumo não cadastrado".to_string();
            }

            let (expected_qty, status_str) = if is_base {
                let mut expected_base_weight = 0.0;
                for (code, (_, exp_qty)) in &total_expected_ingredients {
                    if base_ingredients.contains(code) {
                        expected_base_weight += exp_qty;
                    }
                }
                (expected_base_weight, "OK (Base)".to_string())
            } else {
                (0.0, "UNPLANNED".to_string())
            };

            let difference = *actual_qty - expected_qty;
            let percentage_diff = if expected_qty > 0.0 {
                (difference / expected_qty) * 100.0
            } else {
                100.0
            };

            pesagem_items.push(PesagemItemDetail {
                ingredient_code: ing_code.clone(),
                description: ing_desc,
                expected_qty,
                actual_qty: *actual_qty,
                difference,
                percentage_diff,
                status: status_str,
            });
        }
    }

    let mut envase_products = Vec::new();
    let mut conferencia_items = Vec::new();
    let mut total_packaged_weight_kg = 0.0;

    for (p_code, p_desc, p_qty, _, p_details) in &products {
        let p_is_base: bool = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM overrides_produtos
             WHERE codigo = $1 AND (categoria_produto = 'cat_base' OR status_produto = 'bases')",
        )
        .bind(p_code)
        .fetch_one(pool)
        .await
        .unwrap_or(0)
            > 0;
        if p_is_base {
            continue; // bases não entram em envase/conferência
        }

        let p_unit_weight = parse_unit_weight_from_desc(p_desc);
        
        let mut p_unidades_conferidas = None;
        for part in p_details.split('|') {
            let part = part.trim();
            if part.starts_with("Unidades:") {
                if let Ok(u) = part.trim_start_matches("Unidades:").trim().parse::<f64>() {
                    if u > 0.0 {
                        p_unidades_conferidas = Some(u);
                    }
                }
            }
        }

        let mut p_recipe_items = Vec::new();
        if let Ok(rows) = sqlx::query(
            "SELECT ingredient_code, description, quantity FROM formulations WHERE product_code = $1",
        )
        .bind(p_code)
        .fetch_all(pool)
        .await
        {
            for row in rows {
                let code: String = row.get(0);
                if !code.starts_with("9.15.") {
                    p_recipe_items.push((
                        code,
                        row.get::<Option<String>, _>(1).unwrap_or_default(),
                        crate::core::pg_row::pg_f64(&row, 2),
                    ));
                }
            }
        }

        let mut actual_units_envasadas = 0.0;
        let mut primary_units = 0.0;
        let mut has_primary = false;

        for (code, desc, std_qty) in &p_recipe_items {
            if *std_qty > 0.0 {
                let total_exit_qty = *exits_map.get(code).unwrap_or(&0.0);
                
                let mut total_sharing_weight = 0.0;
                let mut is_shared = false;
                for (other_code, _, other_qty, _, _) in &products {
                    let has_item: i64 = sqlx::query_scalar(
                        "SELECT COUNT(*) FROM formulations WHERE product_code = $1 AND ingredient_code = $2",
                    )
                    .bind(other_code)
                    .bind(code)
                    .fetch_one(pool)
                    .await
                    .unwrap_or(0);
                    if has_item > 0 {
                        total_sharing_weight += *other_qty;
                        if other_code != p_code {
                            is_shared = true;
                        }
                    }
                }
                
                let exit_qty = if is_shared && total_sharing_weight > 0.0 {
                    total_exit_qty * (*p_qty / total_sharing_weight)
                } else {
                    total_exit_qty
                };

                let units = exit_qty / std_qty;
                
                if is_primary_container(desc) && exit_qty > 0.0 {
                    has_primary = true;
                    if units > primary_units {
                        primary_units = units;
                    }
                }
                
                if units > actual_units_envasadas {
                    actual_units_envasadas = units;
                }
            }
        }

        let actual_units_envasadas = if has_primary {
            primary_units.round()
        } else {
            actual_units_envasadas.round()
        };

        let basis_units = if actual_units_envasadas > 0.0 {
            actual_units_envasadas
        } else {
            if p_unit_weight > 0.0 { (*p_qty / p_unit_weight).round() } else { *p_qty }
        };

        let mut envase_items = Vec::new();

        for (item_code, item_desc, std_qty) in &p_recipe_items {
            let expected_qty = basis_units * std_qty;
            
            let total_exit_qty = *exits_map.get(item_code).unwrap_or(&0.0);
            let mut total_sharing_weight = 0.0;
            let mut is_shared = false;
            for (other_code, _, other_qty, _, _) in &products {
                let has_item: i64 = sqlx::query_scalar(
                    "SELECT COUNT(*) FROM formulations WHERE product_code = $1 AND ingredient_code = $2",
                )
                .bind(other_code)
                .bind(item_code)
                .fetch_one(pool)
                .await
                .unwrap_or(0);
                if has_item > 0 {
                    total_sharing_weight += *other_qty;
                    if other_code != p_code {
                        is_shared = true;
                    }
                }
            }
            
            let actual_qty = if is_shared && total_sharing_weight > 0.0 {
                total_exit_qty * (*p_qty / total_sharing_weight)
            } else {
                total_exit_qty
            };

            let difference = actual_qty - expected_qty;
            let percentage_diff = if expected_qty > 0.0 {
                (difference / expected_qty) * 100.0
            } else {
                0.0
            };

            let item_status = if actual_qty == 0.0 && expected_qty > 0.0 {
                "MISSING"
            } else if percentage_diff.abs() > 10.0 {
                "DISCREPANCY"
            } else {
                "OK"
            };

            envase_items.push(EnvaseItemDetail {
                packaging_code: item_code.clone(),
                description: item_desc.clone(),
                expected_qty,
                actual_qty,
                difference,
                percentage_diff,
                status: item_status.to_string(),
            });
        }

        let has_packaging_formula = !p_recipe_items.is_empty();

        envase_products.push(EnvaseProductDetail {
            product_code: p_code.clone(),
            description: p_desc.clone(),
            unit_weight_kg: p_unit_weight,
            actual_units_envasadas,
            packaging_items: envase_items,
            has_packaging_formula,
        });

        let expected_finalized = if actual_units_envasadas > 0.0 {
            actual_units_envasadas - 1.0
        } else {
            let fallback_units = if let Some(u) = p_unidades_conferidas {
                u + 1.0
            } else if p_unit_weight > 0.0 {
                (*p_qty / p_unit_weight).round()
            } else {
                *p_qty
            };
            fallback_units - 1.0
        };

        let registered_units = if let Some(u) = p_unidades_conferidas {
            u
        } else if p_unit_weight > 0.0 {
            (*p_qty / p_unit_weight).round()
        } else {
            *p_qty
        };
        let discrepancy = registered_units - expected_finalized;
        let conf_status = if discrepancy.abs() > 0.5 {
            "DISCREPANCY"
        } else {
            "OK"
        };

        conferencia_items.push(ConferenciaItemDetail {
            product_code: p_code.clone(),
            description: p_desc.clone(),
            actual_units_envasadas,
            expected_finalized_units: expected_finalized,
            registered_units_stock: registered_units,
            discrepancy,
            status: conf_status.to_string(),
        });

        total_packaged_weight_kg += actual_units_envasadas * p_unit_weight;
    }

    let bulk_loss_kg = (basis_weight_total - total_packaged_weight_kg).max(0.0);
    let bulk_yield_percentage = if basis_weight_total > 0.0 {
        (total_packaged_weight_kg / basis_weight_total) * 100.0
    } else {
        0.0
    };

    let (is_resolved, resolution_obs) = match sqlx::query(
        "SELECT is_resolved, observations FROM lote_error_resolutions WHERE lote_number = $1",
    )
    .bind(&lote_number)
    .fetch_optional(pool)
    .await
    {
        Ok(Some(row)) => {
            let is_res_int: Option<i32> = row.get(0);
            (
                is_res_int.map(|v| v == 1),
                row.get::<Option<String>, _>(1),
            )
        }
        _ => (None, None),
    };

    let details = LoteDetalhes {
        lote_number,
        product_code,
        product_description,
        quantity,
        date,
        status,
        status_label,
        fabricated_by,
        authorized_by,
        pesagem_items,
        pesagem_total_expected,
        pesagem_total_actual,
        envase_products,
        conferencia_items,
        total_packaged_weight_kg,
        bulk_loss_kg,
        bulk_yield_percentage,
        is_resolved,
        resolution_obs,
    };

    (StatusCode::OK, Json(details)).into_response()
}

// POST /api/producao/lotes/:number/resolver
pub async fn save_lote_resolution(
    State(state): State<Arc<AppState>>,
    Path(lote_number): Path<String>,
    Json(payload): Json<ResolveLotePayload>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let resolved_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let resolved_by = payload.resolved_by.unwrap_or_else(|| "Administrador".to_string());

    match sqlx::query(
        "INSERT INTO lote_error_resolutions (lote_number, is_resolved, resolved_by, resolved_at, observations)
         VALUES ($1, 1, $2, $3, $4)
         ON CONFLICT(lote_number) DO UPDATE SET
            is_resolved = EXCLUDED.is_resolved,
            resolved_by = EXCLUDED.resolved_by,
            resolved_at = EXCLUDED.resolved_at,
            observations = EXCLUDED.observations",
    )
    .bind(&lote_number)
    .bind(&resolved_by)
    .bind(&resolved_at)
    .bind(&payload.observations)
    .execute(pool)
    .await
    {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// DELETE /api/producao/lotes/:number/resolver
pub async fn delete_lote_resolution(
    State(state): State<Arc<AppState>>,
    Path(lote_number): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    match sqlx::query("DELETE FROM lote_error_resolutions WHERE lote_number = $1")
        .bind(&lote_number)
        .execute(pool)
        .await
    {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

#[derive(Debug, serde::Deserialize)]
pub struct InsumosStatusParams {
    pub qty: Option<f64>,
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

// GET /api/producao/insumos-status/:code?qty=...
pub async fn get_insumos_status(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
    Query(params): Query<InsumosStatusParams>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let batch_qty = params.qty.unwrap_or(100.0).max(1.0);

    let clean_code = code.trim().replace('"', "");
    let query_form = r#"
        SELECT f.ingredient_code,
               COALESCE(f.description, i.description, '') as description,
               f.quantity,
               COALESCE(s.stock_qty, e.estoque::float8, 0.0)::float8 as current_stock
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
                batch_qty,
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

    let mut ingredients = Vec::new();
    let mut missing_count = 0;
    let mut max_delivery_date: Option<String> = None;
    let mut missing_without_po = false;

    for row in rows {
        let ing_code: String = row.get(0);
        let ing_desc: String = row.get(1);
        let qty_per_unit: f64 = row.get(2);
        let current_stock: f64 = row.get(3);

        let total_required = qty_per_unit * batch_qty;
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
            batch_qty,
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

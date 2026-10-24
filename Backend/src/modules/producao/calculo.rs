//! Cálculo de produção: dados de entrada, pós-processamento de kits, lista de produtos e recálculo.

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde_json::json;
use sqlx::Row;
use std::collections::HashMap;
use std::sync::Arc;

use crate::core::db::Db;
use crate::core::catalogo::{param, Acao};
use crate::handlers::imports::clean_product_code;
use crate::handlers::AppState;
use crate::models::{LineConfig, Product, ProductCalculationResult, ProductOverride, QueryParams, Stock};
use crate::modules::producao::gerenciamento::calculations::calculate_products;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/products", get(list_products))
        .route("/api/producao/recalcular/preview", get(preview_recalculation))
        .route("/api/producao/recalcular/ajustar", post(apply_recalculation_adjustment))
}

/// Ações do cadastro/cálculo de produtos descritas para agentes (ver `core::catalogo`).
/// O recálculo e o ajuste de estoque ficam de fora de propósito.
pub fn acoes() -> Vec<Acao> {
    vec![Acao::leitura(
        "listar_produtos",
        "producao",
        "Lista produtos com estoque, vendas, cobertura e sugestão de produção calculados na hora. Filtre e pagine para respostas menores.",
        "/api/products",
        vec![
            param("search", "query", "texto", false, "Busca por código ou descrição."),
            param("linha", "query", "texto", false, "Linha de produto."),
            param("status", "query", "texto", false, "Status calculado do produto."),
            param("categoria", "query", "texto", false, "Categoria."),
            param("base", "query", "texto", false, "Código da base."),
            param("page", "query", "inteiro", false, "Página."),
            param("limit", "query", "inteiro", false, "Itens por página."),
            param("sort", "query", "texto", false, "Campo de ordenação."),
            param("order", "query", "texto", false, "asc ou desc."),
            param("suspended_only", "query", "booleano", false, "Só os suspensos."),
            param("fixas_only", "query", "booleano", false, "Só produção fixa."),
        ],
    )]
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
        "SELECT codigo, descricao, linha_prefix, base, media_levantamento, base_codigo FROM produtos",
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
            base_codigo: row.get(5),
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

    // Fila de demandas e Planejamento ativo
    let _ = crate::modules::producao::fila::ensure_fila_demandas_table(pool).await;
    let mut fila_set = std::collections::HashSet::new();
    if let Ok(rows) = sqlx::query("SELECT codigo_produto FROM producao_fila_demandas")
        .fetch_all(pool)
        .await
    {
        for r in rows {
            let c: String = r.get(0);
            fila_set.insert(clean_product_code(&c));
            fila_set.insert(c.trim().to_string());
        }
    }

    let mut planejado_set = std::collections::HashSet::new();
    if let Ok(rows) = sqlx::query(
        "SELECT codigo_produto FROM producao_planejamento_semanal pp WHERE pp.ordem_status IN ('planejado', 'aprovado') AND NOT EXISTS (SELECT 1 FROM lote_custom_status c WHERE c.lote_number = COALESCE(NULLIF(TRIM(pp.lote_erp), ''), pp.id) AND c.custom_status IN ('Finalizada', 'Ordem Finalizada')) AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE pp.lote_erp IS NOT NULL AND TRIM(pp.lote_erp) <> '' AND sm.document_number = TRIM(pp.lote_erp) AND sm.item_type = 'produto' AND sm.movement_type = 'entrada')"
    )
    .fetch_all(pool)
    .await
    {
        for r in rows {
            let c: String = r.get(0);
            planejado_set.insert(clean_product_code(&c));
            planejado_set.insert(c.trim().to_string());
        }
    }

    // Decorate computed items with formulation and missing ingredients info
    for p in &mut computed {
        let clean_code = clean_product_code(&p.codigo);
        let trimmed_code = p.codigo.trim().to_string();

        let in_queue = fila_set.contains(&clean_code) || fila_set.contains(&trimmed_code);
        p.na_fila = Some(in_queue);

        let in_plan = planejado_set.contains(&clean_code) || planejado_set.contains(&trimmed_code);
        p.planejado_semana = Some(in_plan);

        let has_conflict = (p.is_producao_programada == Some(1) && p.is_lancamento)
            || (p.producao_programada_disparo.is_some() && p.producao_programada_objetivo.is_some()
                && p.producao_programada_disparo.unwrap_or(0) >= p.producao_programada_objetivo.unwrap_or(0));
        p.conflito_regra = Some(has_conflict);
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

    // Lista geral: sem kit, coloração, apoio e base.
    // Base só entra quando o filtro pede Gestão de Bases.
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
        let is_base = root_cat == "cat_base" 
            || p.status_produto.as_deref() == Some("bases") 
            || p.status == "bases"
            || p.codigo.contains(".36.")
            || p.descricao.to_uppercase().starts_with("BASE ")
            || p.descricao.to_uppercase().starts_with("PRE BASE ");

        if params.programadas_only == Some(true) || params.status.as_deref() == Some("programadas") {
            return p.is_producao_programada == Some(1);
        }

        if params.fixas_only == Some(true) {
            if is_base {
                return false;
            }
            let marcado = p.is_lancamento_manual == Some(1);
            let tem_teto = p.lancamento_gatilho.filter(|n| *n > 0).is_some()
                || p.lancamento_estoque_maximo.filter(|n| *n > 0).is_some();
            return marcado || tem_teto;
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

        if params.include_bases == Some(true) && is_base {
            return true;
        }

        if params.include_kits == Some(true) {
            if params.include_programadas != Some(true) && params.show_hidden != Some(true) && p.is_producao_programada == Some(1) {
                return false;
            }
            return true;
        }

        let is_prog = p.is_producao_programada == Some(1);
        let em_fixa = p.is_lancamento_manual == Some(1)
            || p.lancamento_gatilho.filter(|n| *n > 0).is_some()
            || p.lancamento_estoque_maximo.filter(|n| *n > 0).is_some();

        if params.include_all_regimes == Some(true) {
            if !is_base && (is_prog || em_fixa) {
                return true;
            }
        } else {
            if params.include_programadas != Some(true) && params.show_hidden != Some(true) && is_prog {
                return false;
            }
            if params.include_fixas != Some(true) && em_fixa {
                return false;
            }
        }

        !is_kit && !is_coloracao && !is_apoio && !is_base
    });

    // Extract stats for metadata based on visible products (excluding hidden ones and ignored statuses)
    let ignored_statuses =
        crate::modules::compras::planejamento::commands::get_ignored_product_statuses_query(pool.clone())
            .await
            .unwrap_or_default();
    let visible_products: Vec<&crate::models::ProductCalculationResult> = computed
        .iter()
        .filter(|p| {
            let cat_p = p.categoria_produto.as_deref().unwrap_or("");
            let root_cat = if !cat_p.is_empty() {
                resolve_root_category(cat_p, &category_parent_map)
            } else {
                "".to_string()
            };
            let is_base = root_cat == "cat_base"
                || p.status_produto.as_deref() == Some("bases")
                || p.status == "bases"
                || p.codigo.contains(".36.")
                || p.descricao.to_uppercase().starts_with("BASE ")
                || p.descricao.to_uppercase().starts_with("PRE BASE ");

            if is_base && (params.include_bases == Some(true) || params.categoria.as_deref() == Some("cat_base") || params.status.as_deref() == Some("bases") || params.status.as_deref() == Some("base")) {
                return p.visivel.unwrap_or(1) != 0;
            }

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
    let is_programadas_view = params.programadas_only == Some(true)
        || params.status.as_deref() == Some("programadas")
        || params.segment.as_deref() == Some("programadas");
    let show_hidden = params.show_hidden.unwrap_or(false);
    if !show_hidden && !params.suspended_only.unwrap_or(false) && !is_programadas_view {
        computed.retain(|p| {
            let cat_p = p.categoria_produto.as_deref().unwrap_or("");
            let root_cat = if !cat_p.is_empty() {
                resolve_root_category(cat_p, &category_parent_map)
            } else {
                "".to_string()
            };
            let is_base = root_cat == "cat_base"
                || p.status_produto.as_deref() == Some("bases")
                || p.status == "bases"
                || p.codigo.contains(".36.")
                || p.descricao.to_uppercase().starts_with("BASE ")
                || p.descricao.to_uppercase().starts_with("PRE BASE ");

            if is_base && (params.include_bases == Some(true) || params.categoria.as_deref() == Some("cat_base") || params.status.as_deref() == Some("bases") || params.status.as_deref() == Some("base")) {
                return p.visivel.unwrap_or(1) != 0;
            }

            let status = p.status_produto.as_deref().unwrap_or("ativo");
            if ignored_statuses.contains(&status.to_string()) {
                return false;
            }
            if params.include_all_regimes == Some(true) && p.is_producao_programada == Some(1) {
                return true;
            }
            p.visivel.unwrap_or(1) != 0
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
                            || p.codigo.contains(".36.")
                            || p.descricao.to_uppercase().starts_with("BASE ")
                            || p.descricao.to_uppercase().starts_with("PRE BASE ")
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
                        && (p.status_produto.as_deref() == Some("bases") 
                            || p.status == "bases"
                            || p.codigo.contains(".36.")
                            || p.descricao.to_uppercase().starts_with("BASE ")
                            || p.descricao.to_uppercase().starts_with("PRE BASE ")))
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

    // Compute segment counts across all visible products before segment filter
    let count_needed = computed.iter().filter(|p| {
        p.producao_recomendada > 0 || p.na_fila == Some(true) || p.planejado_semana == Some(true)
    }).count();
    let count_normal = computed.iter().filter(|p| {
        let is_prog = p.is_producao_programada == Some(1);
        let is_fixa = p.is_lancamento_manual == Some(1)
            || p.lancamento_gatilho.filter(|n| *n > 0).is_some()
            || p.lancamento_estoque_maximo.filter(|n| *n > 0).is_some();
        let is_kit_comp = p.is_kit_component == Some(true);
        !is_kit_comp && !is_prog && !is_fixa
    }).count();
    let count_kit_mixed = computed.iter().filter(|p| {
        p.is_kit_component == Some(true) && p.produzir_apenas_kit != Some(1)
    }).count();
    let count_kit_only = computed.iter().filter(|p| {
        p.is_kit_component == Some(true) && p.produzir_apenas_kit == Some(1)
    }).count();
    let count_programadas = computed.iter().filter(|p| {
        p.is_producao_programada == Some(1)
    }).count();
    let count_fixas = computed.iter().filter(|p| {
        p.is_lancamento_manual == Some(1)
            || p.lancamento_gatilho.filter(|n| *n > 0).is_some()
            || p.lancamento_estoque_maximo.filter(|n| *n > 0).is_some()
    }).count();

    // Apply segment filter if provided
    if let Some(ref seg) = params.segment {
        match seg.as_str() {
            "needed" => {
                computed.retain(|p| p.producao_recomendada > 0 || p.na_fila == Some(true) || p.planejado_semana == Some(true));
            }
            "normal" => {
                computed.retain(|p| {
                    let is_prog = p.is_producao_programada == Some(1);
                    let is_fixa = p.is_lancamento_manual == Some(1)
                        || p.lancamento_gatilho.filter(|n| *n > 0).is_some()
                        || p.lancamento_estoque_maximo.filter(|n| *n > 0).is_some();
                    let is_kit_comp = p.is_kit_component == Some(true);
                    !is_kit_comp && !is_prog && !is_fixa
                });
            }
            "kit_mixed" => {
                computed.retain(|p| {
                    p.is_kit_component == Some(true) && p.produzir_apenas_kit != Some(1)
                });
            }
            "kit_only" => {
                computed.retain(|p| {
                    p.is_kit_component == Some(true) && p.produzir_apenas_kit == Some(1)
                });
            }
            "programadas" => {
                computed.retain(|p| p.is_producao_programada == Some(1));
            }
            "fixas" => {
                computed.retain(|p| {
                    p.is_lancamento_manual == Some(1)
                        || p.lancamento_gatilho.filter(|n| *n > 0).is_some()
                        || p.lancamento_estoque_maximo.filter(|n| *n > 0).is_some()
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
            "segment_counts": {
                "needed": count_needed,
                "normal": count_normal,
                "kit_mixed": count_kit_mixed,
                "kit_only": count_kit_only,
                "programadas": count_programadas,
                "fixas": count_fixas,
            },
            "bases": unique_bases,
        }))
    ).into_response()
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

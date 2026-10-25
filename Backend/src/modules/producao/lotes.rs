//! Lotes de produção: lista, conferência de erros, detalhes, resoluções e último lote por produto.

use axum::{
    extract::{Query, State, Path},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Extension, Json, Router,
};
use std::sync::Arc;
use serde_json::json;
use sqlx::{PgPool, Row};

use crate::models::{
    QueryParams,
};
use crate::core::regras_produto::e_base;
use crate::modules::producao::gerenciamento::calculations::calculate_products;
use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::producao::calculo::fetch_calculation_data;
use crate::modules::producao::{auditoria, permissao};

// Helper cross-imports
use crate::handlers::imports::clean_product_code;
use crate::core::catalogo::{param, Acao};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/producao/lotes", get(get_production_lotes))
        .route("/api/producao/lotes/:number/detalhes", get(get_lote_detalhes))
        .route("/api/producao/lotes/:number", get(get_lote_lookup))
        .route("/api/producao/lotes/:number/resolver", post(save_lote_resolution).delete(delete_lote_resolution))
        .route("/api/producao/ultimo-lote", get(get_ultimo_lote_produto_query))
        .route("/api/producao/ultimo-lote/:code", get(get_ultimo_lote_produto))
}

/// Ações de consulta de lotes descritas para agentes (ver `core::catalogo`). A resolução de erros de lote fica de fora.
pub fn acoes() -> Vec<Acao> {
    const M: &str = "producao_lotes";
    vec![
        Acao::leitura(
            "listar_lotes",
            M,
            "Lista os lotes de produto já produzidos (entradas no estoque), do mais novo para o mais antigo.",
            "/api/producao/lotes",
            vec![
                param("search", "query", "texto", false, "Busca por lote, código, descrição ou detalhes."),
                param("status", "query", "texto", false, "Filtra pelo status do lote; ALL não filtra."),
                param("limit", "query", "inteiro", false, "Máximo de lotes (1 a 10000; padrão 10000)."),
            ],
        ),
        Acao::leitura(
            "obter_detalhes_lote",
            M,
            "Detalhes de um lote: produto, quantidade e consumo de insumos para conferência.",
            "/api/producao/lotes/:number/detalhes",
            vec![param("number", "caminho", "texto", true, "Número do lote.")],
        ),
        Acao::leitura(
            "consultar_lote",
            M,
            "Consulta rápida de um lote pelo número (itens e datas).",
            "/api/producao/lotes/:number",
            vec![param("number", "caminho", "texto", true, "Número do lote.")],
        ),
        Acao::leitura(
            "obter_ultimo_lote_produto",
            M,
            "Último lote produzido de um produto.",
            "/api/producao/ultimo-lote/:code",
            vec![param("code", "caminho", "texto", true, "Código do produto.")],
        ),
        Acao::leitura(
            "obter_ultimo_lote_produto_por_query",
            M,
            "Último lote produzido de um produto, com o código na query (útil para códigos com barra ou espaço).",
            "/api/producao/ultimo-lote",
            vec![param("code", "query", "texto", true, "Código do produto.")],
        ),
    ]
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
    custom_status: Option<String>,
    is_terceirizado: Option<bool>,
    data_previsao: Option<String>,
}



/// Métricas de um produto no momento do cálculo (a "foto" que o lote guarda):
/// estoque, produção, pedidos, média de vendas, estoque futuro, status, rótulo, produção recomendada,
/// duração em meses, estoque ideal e demanda ajustada.
type ProdCalcTuple = (i64, i64, i64, f64, i64, String, String, i64, f64, f64, f64);

/// Métricas calculadas agora de todos os produtos, por código bruto e por código limpo.
async fn carregar_metricas_produtos(db: &crate::core::db::Db) -> std::collections::HashMap<String, ProdCalcTuple> {
    let mut mapa = std::collections::HashMap::new();
    if let Ok((products, stocks, fat_map, configs, overrides, _)) = fetch_calculation_data(db).await {
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
            mapa.insert(raw_code, tuple.clone());
            if !clean_code.is_empty() {
                mapa.insert(clean_code, tuple);
            }
        }
    }
    mapa
}

/// Grava em `historico_producao` a foto (estoque, produção, status...) dos lotes de produto vindos do ERP que
/// ainda não têm uma. Roda no fim do sync do ERP (antes isso acontecia dentro do `GET /api/producao/lotes`).
/// Não duplica: só insere se não existir linha com o mesmo `lote_erp` (e o lote não casa por produto + data).
/// Devolve quantos lotes foram gravados.
pub async fn gravar_snapshots_lotes_novos(pool: &PgPool) -> Result<u64, sqlx::Error> {
    // Lotes de entrada de produto agrupados como na lista: produto e data do primeiro movimento (mais recente),
    // quantidade somada entre produtos distintos do mesmo lote.
    let rows = sqlx::query(
        "SELECT m.document_number, m.item_code, m.quantity, m.date
         FROM stock_movements m
         WHERE m.item_type = 'produto' AND m.movement_type = 'entrada' AND m.date::timestamp <= NOW()
         ORDER BY m.date DESC",
    )
    .fetch_all(pool)
    .await?;
    let mut ordem: Vec<String> = Vec::new();
    let mut lotes: std::collections::HashMap<String, (String, f64, String)> = std::collections::HashMap::new();
    for row in rows {
        let numero = row.get::<Option<String>, _>(0).unwrap_or_default();
        let codigo: String = row.get(1);
        let qtd: f64 = row.get(2);
        let data: String = row.get(3);
        match lotes.get_mut(&numero) {
            Some(l) => {
                if !l.0.contains(&codigo) {
                    l.0 = format!("{} / {}", l.0, codigo);
                    l.1 += qtd;
                }
            }
            None => {
                ordem.push(numero.clone());
                lotes.insert(numero, (codigo, qtd, data));
            }
        }
    }

    let mut por_lote: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut por_produto_data: std::collections::HashSet<String> = std::collections::HashSet::new();
    for r in sqlx::query("SELECT lote_erp, codigo, data_producao FROM historico_producao").fetch_all(pool).await? {
        if let Some(le) = r.get::<Option<String>, _>(0) {
            let le = le.trim();
            if !le.is_empty() {
                por_lote.insert(le.to_string());
            }
        }
        let codigo: String = r.get(1);
        let data: String = r.get(2);
        let d = data.split('T').next().unwrap_or(&data).split(' ').next().unwrap_or(&data);
        por_produto_data.insert(format!("{}_{}", codigo.trim(), d));
    }

    let metricas = carregar_metricas_produtos(&crate::core::db::Db::new(pool.clone())).await;
    let mut gravados = 0u64;
    for numero in ordem {
        let l_num = numero.trim();
        if l_num.is_empty() || por_lote.contains(l_num) {
            continue;
        }
        let (codigos, qtd, data) = &lotes[&numero];
        let raw_p_code = codigos.split(" / ").next().unwrap_or(codigos).trim();
        let p_code = clean_product_code(raw_p_code);
        let d = data.split('T').next().unwrap_or(data).split(' ').next().unwrap_or(data);
        if por_produto_data.contains(&format!("{raw_p_code}_{d}")) || por_produto_data.contains(&format!("{p_code}_{d}")) {
            continue;
        }
        let Some(m) = metricas.get(raw_p_code).or_else(|| metricas.get(&p_code)) else { continue };
        let r = sqlx::query(
            "INSERT INTO historico_producao (
                data_producao, codigo, quantidade, observacoes,
                snap_estoque, snap_producao, snap_pedidos, snap_efp,
                snap_media_vendas, snap_duracao_meses, snap_status, snap_status_label,
                snap_producao_recomendada, lote_erp
             )
             SELECT $1::text, $2::text, $3::int, $4::text, $5::int, $6::int, $7::int, $8::int,
                    $9::float8, $10::float8, $11::text, $12::text, $13::int, $14::text
             WHERE NOT EXISTS (SELECT 1 FROM historico_producao WHERE lote_erp = $14::text)",
        )
        .bind(data)
        .bind(raw_p_code)
        .bind(qtd.round() as i32)
        .bind("Sincronizado automaticamente via ERP")
        .bind(m.0 as i32)
        .bind(m.1 as i32)
        .bind(m.2 as i32)
        .bind(m.4 as i32)
        .bind(m.3)
        .bind(m.8)
        .bind(&m.5)
        .bind(&m.6)
        .bind(m.7 as i32)
        .bind(l_num)
        .execute(pool)
        .await;
        match r {
            Ok(r) => gravados += r.rows_affected(),
            Err(e) => eprintln!("[lotes] snapshot do lote {l_num} não gravou: {e}"),
        }
    }
    Ok(gravados)
}

// GET /api/producao/lotes
pub async fn get_production_lotes(
    State(state): State<Arc<AppState>>,
    Query(params): Query<QueryParams>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let mut qb = sqlx::QueryBuilder::new(
        "SELECT m.id, m.document_number, m.item_code, p.descricao, m.quantity, m.date, m.details, r.is_resolved, r.observations,
                c.custom_status, c.is_terceirizado, to_char(c.data_previsao, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS data_previsao
         FROM stock_movements m
         LEFT JOIN produtos p ON m.item_code = p.codigo
         LEFT JOIN lote_error_resolutions r ON m.document_number = r.lote_number
         LEFT JOIN lote_custom_status c ON m.document_number = c.lote_number
         WHERE m.item_type = 'produto' AND m.movement_type = 'entrada' AND m.date::timestamp <= NOW()",
    );

    if let Some(ref status) = params.status {
        if !status.is_empty() && status != "ALL" {
            qb.push(" AND (m.details LIKE ");
            qb.push_bind(format!("%Status: {}%", status));
            qb.push(" OR c.custom_status ILIKE ");
            qb.push_bind(format!("%{}%", status));
            qb.push(")");
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
            qb.push_bind(like_arg.clone());
            qb.push(" OR c.custom_status LIKE ");
            qb.push_bind(like_arg);
            qb.push(")");
        }
    }

    qb.push(" ORDER BY m.date DESC");
    let limit_val = params.limit.unwrap_or(10000).clamp(1, 10000);
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
            custom_status: row.get(9),
            is_terceirizado: row.get(10),
            data_previsao: row.get(11),
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

        // Se houver custom_status salvo no Acompanhamento de Produção, sincroniza com Gerenciamento de Produção!
        if let Some(ref cs) = rl.custom_status {
            match cs.as_str() {
                "Pesagem" => status = "PG".to_string(),
                "Produção" => status = "PR".to_string(),
                "Envase" => status = "EN".to_string(),
                "Rotulagem" => status = "CF".to_string(),
                "Finalizada" => status = "EA".to_string(),
                "Em Espera" => status = "ES".to_string(),
                _ => {}
            }
        }

        if let Some(&idx) = lote_indices.get(&rl.lote_number) {
            let lote: &mut crate::models::ProductionLote = &mut grouped_lotes[idx];
            if !lote.product_code.contains(&rl.product_code) {
                lote.product_code = format!("{} / {}", lote.product_code, rl.product_code);
                lote.product_description = format!("{} / {}", lote.product_description, rl.product_description);
                lote.quantity += rl.quantity;
            }
            if lote.custom_status.is_none() && rl.custom_status.is_some() {
                lote.custom_status = rl.custom_status.clone();
                if let Some(ref cs) = rl.custom_status {
                    match cs.as_str() {
                        "Pesagem" => lote.status = "PG".to_string(),
                        "Produção" => lote.status = "PR".to_string(),
                        "Envase" => lote.status = "EN".to_string(),
                        "Rotulagem" => lote.status = "CF".to_string(),
                        "Finalizada" => lote.status = "EA".to_string(),
                        "Em Espera" => lote.status = "ES".to_string(),
                        _ => {}
                    }
                }
            }
            if lote.data_previsao.is_none() && rl.data_previsao.is_some() {
                lote.data_previsao = rl.data_previsao;
            }
            if lote.is_terceirizado.is_none() && rl.is_terceirizado.is_some() {
                lote.is_terceirizado = rl.is_terceirizado;
            }
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
                custom_status: rl.custom_status,
                is_terceirizado: rl.is_terceirizado,
                data_previsao: rl.data_previsao,
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
        "SELECT p.codigo, o.categoria_produto, o.status_produto
         FROM produtos p LEFT JOIN overrides_produtos o ON o.codigo = p.codigo",
    )
    .fetch_all(pool)
    .await
    {
        for row in rows {
            let c: String = row.get(0);
            let cat: Option<String> = row.get(1);
            let st: Option<String> = row.get(2);
            if e_base(&c, cat.as_deref().unwrap_or(""), st.as_deref().unwrap_or("")) {
                base_product_codes.insert(c, true);
            }
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

    // 2. Carrega métricas reais calculadas dos produtos para o snapshot de lotes ERP novos (só exibição aqui;
    // quem grava em historico_producao é `gravar_snapshots_lotes_novos`, no fim do sync do ERP)
    let prod_metrics_map = carregar_metricas_produtos(&state.db).await;

    // 3. Itera pelos lotes e associa snapshot (o existente ou o calculado agora, só para a resposta)
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

    let is_production_base: bool = produto_e_base(pool, product_code).await;

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
            if let Ok(Some(bc)) = sqlx::query_scalar::<_, String>(
                "SELECT codigo FROM produtos WHERE descricao = $1 LIMIT 1",
            )
            .bind(&b_desc)
            .fetch_optional(pool)
            .await
            {
                base_code = Some(bc);
            }
        }
    }

    if base_code.is_none() {
        if let Ok(Some(bc)) = sqlx::query_scalar::<_, String>(
            "SELECT base_codigo FROM produtos WHERE codigo = $1 AND base_codigo IS NOT NULL AND base_codigo != '' LIMIT 1",
        )
        .bind(product_code)
        .fetch_optional(pool)
        .await
        {
            base_code = Some(bc);
        }
    }

    if base_code.is_none() {
        if let Ok(Some(bc)) = sqlx::query_scalar::<_, String>(
            "SELECT base_codigo FROM producao_planejamento_semanal WHERE (lote_erp = $1 OR id = $1) AND base_codigo IS NOT NULL AND base_codigo != '' LIMIT 1",
        )
        .bind(lote_number)
        .fetch_optional(pool)
        .await
        {
            base_code = Some(bc);
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
pub(crate) fn parse_unit_weight_from_desc(desc: &str) -> f64 {
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
    let lote_number = lote_number.trim().to_string();

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
    let lote_number = lote_number.trim().to_string();

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
                    base_code = Some(bc);
                    break;
                }
            }
            if let Ok(Some(bc)) = sqlx::query_scalar::<_, String>(
                "SELECT base_codigo FROM produtos WHERE codigo = $1 AND base_codigo IS NOT NULL AND base_codigo != '' LIMIT 1",
            )
            .bind(p_code)
            .fetch_optional(pool)
            .await
            {
                base_code = Some(bc);
                break;
            }
        }
    }

    if base_code.is_none() {
        if let Ok(Some(bc)) = sqlx::query_scalar::<_, String>(
            "SELECT base_codigo FROM producao_planejamento_semanal WHERE (lote_erp = $1 OR id = $1) AND base_codigo IS NOT NULL AND base_codigo != '' LIMIT 1",
        )
        .bind(&lote_number)
        .fetch_optional(pool)
        .await
        {
            base_code = Some(bc);
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
        let p_is_base: bool = produto_e_base(pool, p_code).await;
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

/// Resolução de erros do lote como está gravada (para a auditoria): `None` = sem resolução.
async fn resolucao_atual(pool: &PgPool, lote_number: &str) -> Option<serde_json::Value> {
    sqlx::query(
        "SELECT is_resolved, resolved_by, resolved_at, observations FROM lote_error_resolutions WHERE lote_number = $1",
    )
    .bind(lote_number)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .map(|row| {
        json!({
            "resolvido": row.get::<Option<i32>, _>(0).map(|v| v == 1),
            "resolvidoPor": row.get::<Option<String>, _>(1),
            "resolvidoEm": row.get::<Option<String>, _>(2),
            "observacoes": row.get::<Option<String>, _>(3),
        })
    })
}

// POST /api/producao/lotes/:number/resolver
// O autor é sempre o usuário logado (o `resolved_by` do corpo é ignorado).
pub async fn save_lote_resolution(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(lote_number): Path<String>,
    Json(payload): Json<ResolveLotePayload>,
) -> impl IntoResponse {
    if let Err(r) = permissao::exigir_edicao_em(&ctx, crate::modules::geral::auth::store::modulos_da_rota("/api/producao/lotes").unwrap_or(&[])) {
        return r;
    }
    let pool = state.db.pool();
    let resolved_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let resolved_by = ctx.display_name.clone();
    let antes = resolucao_atual(pool, &lote_number).await;

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
        Ok(_) => {
            auditoria::registrar(
                pool,
                &ctx.display_name,
                "resolver_lote",
                &lote_number,
                json!({ "antes": antes, "depois": resolucao_atual(pool, &lote_number).await }),
            )
            .await;
            (StatusCode::OK, Json(json!({ "success": true }))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// DELETE /api/producao/lotes/:number/resolver
pub async fn delete_lote_resolution(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(lote_number): Path<String>,
) -> impl IntoResponse {
    if let Err(r) = permissao::exigir_edicao_em(&ctx, crate::modules::geral::auth::store::modulos_da_rota("/api/producao/lotes").unwrap_or(&[])) {
        return r;
    }
    let pool = state.db.pool();
    let antes = resolucao_atual(pool, &lote_number).await;
    match sqlx::query("DELETE FROM lote_error_resolutions WHERE lote_number = $1")
        .bind(&lote_number)
        .execute(pool)
        .await
    {
        Ok(_) => {
            auditoria::registrar(pool, &ctx.display_name, "reabrir_lote", &lote_number, json!({ "antes": antes })).await;
            (StatusCode::OK, Json(json!({ "success": true }))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}


#[derive(Debug, serde::Deserialize)]
pub struct UltimoLoteQuery {
    pub code: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct UltimoLoteResponse {
    pub code: String,
    pub ultimo_lote: Option<String>,
    pub data_ultimo_lote: Option<String>,
    pub quantidade_kg: Option<f64>,
    pub origem: Option<String>,
    pub sugestao_proximo: Option<String>,
    pub historico: Vec<LoteHistoricoItem>,
}

#[derive(Debug, serde::Serialize)]
pub struct LoteHistoricoItem {
    pub lote: String,
    pub date: Option<String>,
    pub source: String,
    pub quantidade_kg: Option<f64>,
}

pub async fn get_ultimo_lote_produto_query(
    State(state): State<Arc<AppState>>,
    Query(query): Query<UltimoLoteQuery>,
) -> impl IntoResponse {
    let code = query.code.unwrap_or_default();
    get_ultimo_lote_impl(state, code).await
}

pub async fn get_ultimo_lote_produto(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    get_ultimo_lote_impl(state, code).await
}

async fn get_ultimo_lote_impl(
    state: Arc<AppState>,
    code: String,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let clean_code = clean_product_code(&code);

    let sql = r#"
        SELECT lote, date, source, quantidade_kg FROM (
            SELECT sm.document_number AS lote, sm.date::text AS date, 'ERP' AS source, 1 AS prio, sm.date::text AS sort_dt, sm.quantity::float8 AS quantidade_kg
            FROM stock_movements sm
            WHERE sm.item_code = $1 
              AND sm.document_number IS NOT NULL 
              AND TRIM(sm.document_number) != ''
              AND TRIM(sm.document_number) NOT LIKE 'PL-%'
              AND TRIM(sm.document_number) NOT LIKE 'pl-%'
              AND TRIM(sm.document_number) NOT LIKE 'PLAN_%'
              AND TRIM(sm.document_number) NOT LIKE 'plan_%'
              AND sm.movement_type = 'entrada'

            UNION ALL

            SELECT ell.lote, ell.data_lote::text AS date, 'Laudo' AS source, 1 AS prio, ell.data_lote::text AS sort_dt, ell.quantidade_kg::float8 AS quantidade_kg
            FROM erp_lotes_laudos ell
            WHERE ell.product_code = $1
              AND ell.lote IS NOT NULL
              AND TRIM(ell.lote) != ''
              AND TRIM(ell.lote) NOT LIKE 'PL-%'
              AND TRIM(ell.lote) NOT LIKE 'pl-%'
              AND TRIM(ell.lote) NOT LIKE 'PLAN_%'
              AND TRIM(ell.lote) NOT LIKE 'plan_%'

            UNION ALL

            SELECT pp.lote_erp AS lote, to_char(pp.data_planejada, 'YYYY-MM-DD') AS date, 'Planejamento' AS source, 2 AS prio, to_char(pp.data_planejada, 'YYYY-MM-DD') AS sort_dt, pp.quantidade_planejada::float8 AS quantidade_kg
            FROM producao_planejamento_semanal pp
            WHERE pp.codigo_produto = $1 
              AND pp.lote_erp IS NOT NULL 
              AND TRIM(pp.lote_erp) != ''
              AND TRIM(pp.lote_erp) NOT LIKE 'PL-%'
              AND TRIM(pp.lote_erp) NOT LIKE 'pl-%'
              AND TRIM(pp.lote_erp) NOT LIKE 'PLAN_%'
              AND TRIM(pp.lote_erp) NOT LIKE 'plan_%'

            UNION ALL

            SELECT pe.lote_number AS lote, to_char(pe.data_programada, 'YYYY-MM-DD') AS date, 'Envase' AS source, 3 AS prio, to_char(pe.data_programada, 'YYYY-MM-DD') AS sort_dt, pe.quantity_kg::float8 AS quantidade_kg
            FROM programacao_envase pe
            WHERE pe.product_code = $1
              AND pe.lote_number IS NOT NULL
              AND TRIM(pe.lote_number) != ''
              AND TRIM(pe.lote_number) NOT LIKE 'PL-%'
              AND TRIM(pe.lote_number) NOT LIKE 'pl-%'
              AND TRIM(pe.lote_number) NOT LIKE 'PLAN_%'
              AND TRIM(pe.lote_number) NOT LIKE 'plan_%'

            UNION ALL

            SELECT pr.lote_number AS lote, to_char(pr.data_programada, 'YYYY-MM-DD') AS date, 'Rotulagem' AS source, 4 AS prio, to_char(pr.data_programada, 'YYYY-MM-DD') AS sort_dt, NULL::float8 AS quantidade_kg
            FROM programacao_rotulagem pr
            WHERE pr.product_code = $1
              AND pr.lote_number IS NOT NULL
              AND TRIM(pr.lote_number) != ''
              AND TRIM(pr.lote_number) NOT LIKE 'PL-%'
              AND TRIM(pr.lote_number) NOT LIKE 'pl-%'
              AND TRIM(pr.lote_number) NOT LIKE 'PLAN_%'
              AND TRIM(pr.lote_number) NOT LIKE 'plan_%'

            UNION ALL

            SELECT ts.lote_number AS lote, to_char(ts.created_at, 'YYYY-MM-DD') AS date, 'Terceirizado' AS source, 5 AS prio, to_char(ts.created_at, 'YYYY-MM-DD') AS sort_dt, NULL::float8 AS quantidade_kg
            FROM terceirizados_solicitacoes ts
            WHERE ts.product_code = $1 
              AND ts.lote_number IS NOT NULL 
              AND TRIM(ts.lote_number) != ''
              AND TRIM(ts.lote_number) NOT LIKE 'PL-%'
              AND TRIM(ts.lote_number) NOT LIKE 'pl-%'
              AND TRIM(ts.lote_number) NOT LIKE 'PLAN_%'
              AND TRIM(ts.lote_number) NOT LIKE 'plan_%'
        ) all_lotes
        WHERE TRIM(lote) NOT LIKE 'PL-%'
          AND TRIM(lote) NOT LIKE 'pl-%'
          AND TRIM(lote) NOT LIKE 'PLAN_%'
          AND TRIM(lote) NOT LIKE 'plan_%'
        ORDER BY sort_dt DESC NULLS LAST, lote DESC
        LIMIT 10
    "#;

    match sqlx::query(sql)
        .bind(&clean_code)
        .fetch_all(pool)
        .await
    {
        Ok(rows) => {
            let mut historico = Vec::new();
            let mut seen_lotes = std::collections::HashSet::new();

            for row in rows {
                let lote: String = row.try_get("lote").unwrap_or_default();
                let date: Option<String> = row.try_get("date").ok();
                let source: String = row.try_get("source").unwrap_or_else(|_| "ERP".to_string());
                let quantidade_kg: Option<f64> = row.try_get("quantidade_kg").ok();
                let clean_lote = lote.trim().to_string();
                if !clean_lote.is_empty() && seen_lotes.insert(clean_lote.clone()) {
                    historico.push(LoteHistoricoItem {
                        lote: clean_lote,
                        date,
                        source,
                        quantidade_kg,
                    });
                }
            }

            let first = historico.first();
            let ultimo_lote = first.map(|x| x.lote.clone());
            let data_ultimo_lote = first.and_then(|x| x.date.clone());
            let quantidade_kg = first.and_then(|x| x.quantidade_kg);
            let origem = first.map(|x| x.source.clone());

            let sugestao_proximo = ultimo_lote.as_ref().and_then(|l| {
                if let Ok(num) = l.parse::<i64>() {
                    Some((num + 1).to_string())
                } else {
                    None
                }
            });

            (
                StatusCode::OK,
                Json(UltimoLoteResponse {
                    code: clean_code,
                    ultimo_lote,
                    data_ultimo_lote,
                    quantidade_kg,
                    origem,
                    sugestao_proximo,
                    historico,
                }),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar último lote: {}", e) })),
        )
            .into_response(),
    }
}

/// Base de produção pela regra única (`e_base`): categoria, status do override ou código ".36.".
async fn produto_e_base(pool: &PgPool, codigo: &str) -> bool {
    let (cat, st): (Option<String>, Option<String>) = sqlx::query_as(
        "SELECT categoria_produto, status_produto FROM overrides_produtos WHERE codigo = $1",
    )
    .bind(codigo)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .unwrap_or((None, None));
    e_base(codigo, cat.as_deref().unwrap_or(""), st.as_deref().unwrap_or(""))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn foto_do_lote_novo_grava_uma_vez_so() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let lote = format!("TESTE-{}", uuid::Uuid::new_v4());
        let codigo = "TESTE.LOTE.001";
        sqlx::query("INSERT INTO config_linhas (linha_prefix, nome_linha) VALUES ('ZZHIST', 'teste') ON CONFLICT DO NOTHING").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO produtos (codigo, descricao, linha_prefix) VALUES ($1, 'TESTE LOTE 500ML', 'ZZHIST') ON CONFLICT (codigo) DO NOTHING")
            .bind(codigo)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO stock_movements (id, item_code, item_type, movement_type, quantity, date, document_number) \
             VALUES ($1, $2, 'produto', 'entrada', 100, '2026-10-01', $3)",
        )
        .bind(format!("mov-{lote}"))
        .bind(codigo)
        .bind(&lote)
        .execute(&pool)
        .await
        .unwrap();

        gravar_snapshots_lotes_novos(&pool).await.unwrap();
        let segunda = gravar_snapshots_lotes_novos(&pool).await.unwrap();
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM historico_producao WHERE lote_erp = $1")
            .bind(&lote)
            .fetch_one(&pool)
            .await
            .unwrap();

        sqlx::query("DELETE FROM historico_producao WHERE codigo = $1").bind(codigo).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM stock_movements WHERE document_number = $1").bind(&lote).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM produtos WHERE codigo = $1").bind(codigo).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM config_linhas WHERE linha_prefix = 'ZZHIST'").execute(&pool).await.ok();
        assert_eq!(n, 1, "o lote ganha uma foto, e só uma");
        assert_eq!(segunda, 0, "a segunda rodada não grava de novo");
    }
}

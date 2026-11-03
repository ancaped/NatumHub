use axum::{
    extract::{Path, State},
    response::IntoResponse,
    routing::{delete, get},
    Json, Router,
};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::{Product, Report};
use crate::lab_queries::*;
use crate::modules::hub_api::util::{ok_json, ok_status, with_pool};

#[derive(serde::Deserialize)]
#[serde(untagged)]
enum SaveReportsPayload {
    Wrapped { reports: Vec<Report> },
    List(Vec<Report>),
    Single(Report),
}

#[derive(serde::Deserialize)]
#[serde(untagged)]
enum SaveProductPayload {
    Wrapped { products: Vec<Product> },
    List(Vec<Product>),
    Single(Product),
}

async fn get_microbio_config_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_microbio_config_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_microbio_config_handler(State(state): State<Arc<AppState>>, Json(config): Json<serde_json::Value>) -> impl IntoResponse {
    match with_pool(&state, |pool| save_config_microbio_query(pool, &config)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_products_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_products_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_product_handler(State(state): State<Arc<AppState>>, Json(payload): Json<SaveProductPayload>) -> impl IntoResponse {
    let products = match payload {
        SaveProductPayload::Wrapped { products } => products,
        SaveProductPayload::List(list) => list,
        SaveProductPayload::Single(prod) => vec![prod],
    };
    match with_pool(&state, move |pool| async move {
        for prod in &products {
            save_product_query(pool.clone(), prod).await?;
        }
        Ok(())
    }).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_product_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<crate::modules::geral::auth::models::AuthContext>,
    Path(code): Path<String>,
    axum::extract::Query(m): axum::extract::Query<crate::core::acao::Motivo>,
) -> impl IntoResponse {
    let copia = match crate::core::exclusao::preparar(state.db.pool(), m.motivo.as_deref(), "o produto da microbiologia", "SELECT to_jsonb(p) FROM products p WHERE p.code = $1", &[&code]).await {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };
    match with_pool(&state, |pool| delete_product_query(pool, &code)).await {
        Ok(()) => {
            copia.registrar(state.db.pool(), &ctx, "microbiologia", "excluir_produto_microbio", "microbio_product", &code, "Produto da microbiologia excluído").await;
            ok_status().into_response()
        }
        Err(e) => e.into_response(),
    }
}

async fn delete_all_products_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<crate::modules::geral::auth::models::AuthContext>,
    axum::extract::Query(m): axum::extract::Query<crate::core::acao::Motivo>,
) -> impl IntoResponse {
    // Apaga todos os produtos: a cópia leva todas as linhas (acima de 5 MB, só os códigos e a contagem).
    let mut copia = match crate::core::exclusao::preparar(
        state.db.pool(),
        m.motivo.as_deref(),
        "todos os produtos da microbiologia",
        "SELECT jsonb_build_object('total', COUNT(*), 'produtos', COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb)) FROM products p",
        &[],
    )
    .await
    {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };
    if let Some(c) = copia.copia.take() {
        let total = c["total"].as_u64().unwrap_or(0) as usize;
        copia.copia = Some(if c.to_string().len() > crate::core::exclusao::LIMITE_COPIA_BYTES {
            let codigos: Vec<serde_json::Value> = c["produtos"].as_array().map(|a| a.iter().map(|p| p["code"].clone()).collect()).unwrap_or_default();
            serde_json::json!({ "total": total, "codigos": codigos, "omitido": "cópia acima de 5 MB; guardados só os códigos e a contagem" })
        } else {
            c
        });
    }
    match with_pool(&state, |pool| delete_all_products_query(pool)).await {
        Ok(()) => {
            copia.registrar(state.db.pool(), &ctx, "microbiologia", "excluir_todos_produtos_microbio", "microbio_product", "todos", "Todos os produtos da microbiologia excluídos").await;
            ok_status().into_response()
        }
        Err(e) => e.into_response(),
    }
}

async fn get_reports_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_reports_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_reports_handler(State(state): State<Arc<AppState>>, Json(payload): Json<SaveReportsPayload>) -> impl IntoResponse {
    let reports = match payload {
        SaveReportsPayload::Wrapped { reports } => reports,
        SaveReportsPayload::List(list) => list,
        SaveReportsPayload::Single(rep) => vec![rep],
    };
    match with_pool(&state, move |pool| async move {
        save_reports_query(pool, &reports).await
    }).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_report_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<crate::modules::geral::auth::models::AuthContext>,
    Path(id): Path<String>,
    axum::extract::Query(m): axum::extract::Query<crate::core::acao::Motivo>,
) -> impl IntoResponse {
    let copia = match crate::core::exclusao::preparar(state.db.pool(), m.motivo.as_deref(), "o laudo microbiológico", "SELECT to_jsonb(r) FROM reports r WHERE r.id = $1", &[&id]).await {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };
    match with_pool(&state, |pool| delete_report_query(pool, &id)).await {
        Ok(()) => {
            copia.registrar(state.db.pool(), &ctx, "microbiologia", "excluir_laudo_microbio", "microbio_report", &id, "Laudo microbiológico excluído").await;
            ok_status().into_response()
        }
        Err(e) => e.into_response(),
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateReportsPrintedPayload {
    ids: Vec<String>,
    printed: bool,
}

async fn update_reports_printed_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<UpdateReportsPrintedPayload>,
) -> impl IntoResponse {
    match with_pool(&state, move |pool| async move {
        update_reports_printed_query(pool, &payload.ids, payload.printed).await
    })
    .await
    {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/hub/microbio/config", get(get_microbio_config_handler).post(save_microbio_config_handler))
        .route("/api/hub/microbio/products", get(get_products_handler).post(save_product_handler).delete(delete_all_products_handler))
        .route("/api/hub/microbio/products/:code", delete(delete_product_handler))
        .route("/api/hub/microbio/reports", get(get_reports_handler).post(save_reports_handler))
        .route("/api/hub/microbio/reports/printed", axum::routing::post(update_reports_printed_handler))
        .route("/api/hub/microbio/reports/:id", delete(delete_report_handler))
}

/// Ações de leitura da Microbiologia (ver `core::catalogo`).
pub fn acoes() -> Vec<crate::core::catalogo::Acao> {
    use crate::core::catalogo::{param, Acao};
    vec![
        Acao::leitura(
            "listar_produtos_microbio",
            "microbiologia",
            "Lista os produtos acompanhados pela microbiologia: código, nome, embalagem e validade. Use para saber quais produtos têm laudo microbiológico previsto.",
            "/api/hub/microbio/products",
            vec![],
        ),
        Acao::leitura(
            "listar_laudos_microbio",
            "microbiologia",
            "Lista os laudos microbiológicos: número, produto, lote, data de coleta, data de fabricação, técnico e se já foi impresso (e quando). Sem filtros; devolve todos.",
            "/api/hub/microbio/reports",
            vec![],
        ),
    ]
}

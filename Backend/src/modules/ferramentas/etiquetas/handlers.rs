use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Extension, Json,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::MODULE_FERRAMENTAS_ETIQUETAS;

use super::models::{
    CreateLabelTemplatePayload, CreatePrintHistoryPayload, UpdateLabelTemplatePayload,
};
use super::store;

fn err(status: StatusCode, msg: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({ "error": msg.into() }))).into_response()
}

fn can_access(ctx: &AuthContext) -> bool {
    ctx.role.is_supervisor() || ctx.has_module(MODULE_FERRAMENTAS_ETIQUETAS) || !ctx.operator_id.is_empty()
}

#[derive(Deserialize)]
pub struct HistoryQuery {
    pub limit: Option<i64>,
}

pub async fn list_templates_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    if !can_access(&ctx) {
        return err(StatusCode::FORBIDDEN, "Acesso não autorizado a modelos de etiquetas");
    }

    let pool = state.db.pool();
    match store::list_templates(pool).await {
        Ok(templates) => (StatusCode::OK, Json(templates)).into_response(),
        Err(e) => {
            eprintln!("[etiquetas] Erro ao listar modelos: {:?}", e);
            err(StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao listar modelos: {}", e))
        }
    }
}

pub async fn get_template_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    if !can_access(&ctx) {
        return err(StatusCode::FORBIDDEN, "Acesso não autorizado a modelos de etiquetas");
    }

    let pool = state.db.pool();
    match store::get_template(pool, id).await {
        Ok(Some(template)) => (StatusCode::OK, Json(template)).into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, "Modelo de etiqueta não encontrado"),
        Err(e) => {
            eprintln!("[etiquetas] Erro ao buscar modelo {}: {:?}", id, e);
            err(StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao buscar modelo: {}", e))
        }
    }
}

pub async fn create_template_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(payload): Json<CreateLabelTemplatePayload>,
) -> impl IntoResponse {
    if !can_access(&ctx) {
        return err(StatusCode::FORBIDDEN, "Acesso não autorizado a criar modelos de etiquetas");
    }

    if payload.name.trim().is_empty() {
        return err(StatusCode::BAD_REQUEST, "O nome do modelo é obrigatório");
    }

    let pool = state.db.pool();
    match store::create_template(pool, payload).await {
        Ok(template) => {
            crate::modules::geral::audit::record_domain(
                pool,
                Some(&ctx),
                "ferramentas_etiquetas",
                "create_label_template",
                "label_template",
                &template.id.to_string(),
                &format!("Modelo de etiqueta '{}' criado por {}", template.name, ctx.display_name),
                None,
                Some(json!({ "templateId": template.id, "name": template.name })),
            )
            .await;

            (StatusCode::CREATED, Json(template)).into_response()
        }
        Err(e) => {
            eprintln!("[etiquetas] Erro ao criar modelo: {:?}", e);
            err(StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao criar modelo: {}", e))
        }
    }
}

pub async fn update_template_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateLabelTemplatePayload>,
) -> impl IntoResponse {
    if !can_access(&ctx) {
        return err(StatusCode::FORBIDDEN, "Acesso não autorizado a atualizar modelos de etiquetas");
    }

    let pool = state.db.pool();
    match store::update_template(pool, id, payload).await {
        Ok(Some(template)) => {
            crate::modules::geral::audit::record_domain(
                pool,
                Some(&ctx),
                "ferramentas_etiquetas",
                "update_label_template",
                "label_template",
                &template.id.to_string(),
                &format!("Modelo de etiqueta '{}' atualizado por {}", template.name, ctx.display_name),
                None,
                Some(json!({ "templateId": template.id, "name": template.name })),
            )
            .await;

            (StatusCode::OK, Json(template)).into_response()
        }
        Ok(None) => err(StatusCode::NOT_FOUND, "Modelo de etiqueta não encontrado"),
        Err(e) => {
            eprintln!("[etiquetas] Erro ao atualizar modelo {}: {:?}", id, e);
            err(StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao atualizar modelo: {}", e))
        }
    }
}

pub async fn delete_template_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    if !can_access(&ctx) {
        return err(StatusCode::FORBIDDEN, "Acesso não autorizado a excluir modelos de etiquetas");
    }

    let pool = state.db.pool();
    match store::delete_template(pool, id).await {
        Ok(true) => {
            crate::modules::geral::audit::record_domain(
                pool,
                Some(&ctx),
                "ferramentas_etiquetas",
                "delete_label_template",
                "label_template",
                &id.to_string(),
                &format!("Modelo de etiqueta {} excluído por {}", id, ctx.display_name),
                None,
                None,
            )
            .await;

            (StatusCode::OK, Json(json!({ "success": true }))).into_response()
        }
        Ok(false) => err(StatusCode::NOT_FOUND, "Modelo de etiqueta não encontrado"),
        Err(e) => {
            eprintln!("[etiquetas] Erro ao excluir modelo {}: {:?}", id, e);
            err(StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao excluir modelo: {}", e))
        }
    }
}

pub async fn list_print_history_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(q): Query<HistoryQuery>,
) -> impl IntoResponse {
    if !can_access(&ctx) {
        return err(StatusCode::FORBIDDEN, "Acesso não autorizado ao histórico de etiquetas");
    }

    let pool = state.db.pool();
    let limit = q.limit.unwrap_or(100).clamp(1, 500);

    match store::list_print_history(pool, limit).await {
        Ok(history) => (StatusCode::OK, Json(history)).into_response(),
        Err(e) => {
            eprintln!("[etiquetas] Erro ao listar histórico de impressão: {:?}", e);
            err(StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao listar histórico: {}", e))
        }
    }
}

pub async fn create_print_history_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(payload): Json<CreatePrintHistoryPayload>,
) -> impl IntoResponse {
    if !can_access(&ctx) {
        return err(StatusCode::FORBIDDEN, "Acesso não autorizado a registrar impressão");
    }

    let pool = state.db.pool();
    let operator_id = Some(ctx.operator_id.clone());
    let operator_name = Some(ctx.display_name.clone());

    match store::create_print_history(pool, operator_id, operator_name, payload).await {
        Ok(record) => (StatusCode::CREATED, Json(record)).into_response(),
        Err(e) => {
            eprintln!("[etiquetas] Erro ao salvar histórico de impressão: {:?}", e);
            err(StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao salvar histórico: {}", e))
        }
    }
}

pub async fn list_catalog_products_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    if !can_access(&ctx) {
        return err(StatusCode::FORBIDDEN, "Acesso não autorizado");
    }

    let pool = state.db.pool();
    match store::list_catalog_products(pool).await {
        Ok(products) => (StatusCode::OK, Json(products)).into_response(),
        Err(e) => {
            eprintln!("[etiquetas] Erro ao listar produtos do catálogo: {:?}", e);
            err(StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao listar produtos: {}", e))
        }
    }
}

pub async fn list_production_lots_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    if !can_access(&ctx) {
        return err(StatusCode::FORBIDDEN, "Acesso não autorizado");
    }

    let pool = state.db.pool();
    match store::list_production_lots(pool).await {
        Ok(lots) => (StatusCode::OK, Json(lots)).into_response(),
        Err(e) => {
            eprintln!("[etiquetas] Erro ao listar lotes de produção: {:?}", e);
            err(StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao listar lotes: {}", e))
        }
    }
}

use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Extension, Json,
};
use serde_json::json;
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;

use super::models::{DocumentInput, DocumentsQuery, FamilyInput, TypeInput};
use super::store;

fn err(status: StatusCode, msg: impl Into<String>) -> Response {
    (status, Json(json!({ "error": msg.into() }))).into_response()
}

pub async fn list_families(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match store::list_families(state.db.pool(), false).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

pub async fn create_family(
    State(state): State<Arc<AppState>>,
    Json(input): Json<FamilyInput>,
) -> impl IntoResponse {
    if input.name.trim().is_empty() {
        return err(StatusCode::BAD_REQUEST, "Nome da família é obrigatório");
    }
    match store::create_family(state.db.pool(), input).await {
        Ok(row) => (StatusCode::CREATED, Json(row)).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn update_family(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(input): Json<FamilyInput>,
) -> impl IntoResponse {
    if input.name.trim().is_empty() {
        return err(StatusCode::BAD_REQUEST, "Nome da família é obrigatório");
    }
    match store::update_family(state.db.pool(), &id, input).await {
        Ok(row) => (StatusCode::OK, Json(row)).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn delete_family(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match store::delete_family(state.db.pool(), &id).await {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, e),
    }
}

#[derive(Debug, serde::Deserialize)]
pub struct TypesQuery {
    pub family_id: Option<String>,
}

pub async fn list_types(
    State(state): State<Arc<AppState>>,
    Query(q): Query<TypesQuery>,
) -> impl IntoResponse {
    match store::list_types(state.db.pool(), q.family_id.as_deref()).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

pub async fn create_type(
    State(state): State<Arc<AppState>>,
    Json(input): Json<TypeInput>,
) -> impl IntoResponse {
    if input.name.trim().is_empty() || input.family_id.trim().is_empty() {
        return err(StatusCode::BAD_REQUEST, "Família e nome são obrigatórios");
    }
    match store::create_type(state.db.pool(), input).await {
        Ok(row) => (StatusCode::CREATED, Json(row)).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn update_type(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(input): Json<TypeInput>,
) -> impl IntoResponse {
    match store::update_type(state.db.pool(), &id, input).await {
        Ok(row) => (StatusCode::OK, Json(row)).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn delete_type(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match store::delete_type(state.db.pool(), &id).await {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn list_documents(
    State(state): State<Arc<AppState>>,
    Query(q): Query<DocumentsQuery>,
) -> impl IntoResponse {
    match store::list_documents(state.db.pool(), q).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

pub async fn get_document(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match store::get_document(state.db.pool(), &id).await {
        Ok(row) => (StatusCode::OK, Json(row)).into_response(),
        Err(e) => err(StatusCode::NOT_FOUND, e),
    }
}

pub async fn create_document(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(input): Json<DocumentInput>,
) -> impl IntoResponse {
    if input.title.trim().is_empty() || input.family_id.trim().is_empty() {
        return err(StatusCode::BAD_REQUEST, "Título e família são obrigatórios");
    }
    match store::create_document(state.db.pool(), input, Some(&ctx.display_name)).await {
        Ok(row) => {
            let _ = store::check_alerts(state.db.pool()).await;
            crate::modules::geral::audit::record_domain(
                state.db.pool(),
                Some(&ctx),
                "qualidade_documentacao",
                "create",
                "document",
                &row.id,
                &format!("Documento criado: {}", row.title),
                None,
                Some(json!({ "id": row.id, "title": row.title, "familyId": row.family_id })),
            )
            .await;
            (StatusCode::CREATED, Json(row)).into_response()
        }
        Err(e) => err(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn update_document(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Extension(ctx): Extension<AuthContext>,
    Json(input): Json<DocumentInput>,
) -> impl IntoResponse {
    if input.title.trim().is_empty() || input.family_id.trim().is_empty() {
        return err(StatusCode::BAD_REQUEST, "Título e família são obrigatórios");
    }
    match store::update_document(state.db.pool(), &id, input).await {
        Ok(row) => {
            let _ = store::check_alerts(state.db.pool()).await;
            crate::modules::geral::audit::record_domain(
                state.db.pool(),
                Some(&ctx),
                "qualidade_documentacao",
                "update",
                "document",
                &row.id,
                &format!("Documento atualizado: {}", row.title),
                None,
                Some(json!({
                    "id": row.id,
                    "title": row.title,
                    "validUntil": row.valid_until,
                    "paymentStatus": row.payment_status
                })),
            )
            .await;
            (StatusCode::OK, Json(row)).into_response()
        }
        Err(e) => err(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn delete_document(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Extension(ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    match store::delete_document(state.db.pool(), &id).await {
        Ok(()) => {
            crate::modules::geral::audit::record_domain(
                state.db.pool(),
                Some(&ctx),
                "qualidade_documentacao",
                "delete",
                "document",
                &id,
                &format!("Documento excluído: {id}"),
                None,
                None,
            )
            .await;
            (StatusCode::OK, Json(json!({ "ok": true }))).into_response()
        }
        Err(e) => err(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn upload_file(
    State(state): State<Arc<AppState>>,
    Path(doc_id): Path<String>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let mut kind = String::from("documento");
    let mut filename = String::from("arquivo.pdf");
    let mut bytes: Option<Vec<u8>> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        if name == "kind" {
            if let Ok(v) = field.text().await {
                kind = v;
            }
        } else if name == "file" {
            if let Some(fname) = field.file_name().map(|s| s.to_string()) {
                filename = fname;
            }
            match field.bytes().await {
                Ok(b) => bytes = Some(b.to_vec()),
                Err(e) => return err(StatusCode::BAD_REQUEST, e.to_string()),
            }
        }
    }

    let Some(data) = bytes else {
        return err(StatusCode::BAD_REQUEST, "Arquivo não enviado");
    };
    if data.is_empty() {
        return err(StatusCode::BAD_REQUEST, "Arquivo vazio");
    }

    match store::add_file(state.db.pool(), &doc_id, &kind, &filename, &data).await {
        Ok(row) => (StatusCode::CREATED, Json(row)).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn download_file(
    State(state): State<Arc<AppState>>,
    Path(file_id): Path<String>,
) -> impl IntoResponse {
    match store::get_file(state.db.pool(), &file_id).await {
        Ok((meta, bytes)) => {
            let disposition = format!(
                "attachment; filename=\"{}\"",
                meta.original_name.replace('"', "")
            );
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "application/octet-stream")
                .header(header::CONTENT_DISPOSITION, disposition)
                .body(Body::from(bytes))
                .unwrap_or_else(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Falha no download"))
        }
        Err(e) => err(StatusCode::NOT_FOUND, e),
    }
}

pub async fn delete_file(
    State(state): State<Arc<AppState>>,
    Path(file_id): Path<String>,
) -> impl IntoResponse {
    match store::delete_file(state.db.pool(), &file_id).await {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn check_alerts(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match store::check_alerts(state.db.pool()).await {
        Ok(res) => (StatusCode::OK, Json(res)).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

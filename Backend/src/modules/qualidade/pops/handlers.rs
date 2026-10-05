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

use super::models::{
    DocumentInput, DocumentUpdateInput, DocumentsQuery, PublishInput, RevalidateInput, SectorInput,
    SeedInventoryInput,
};
use super::store;

fn err(status: StatusCode, msg: impl Into<String>) -> Response {
    (status, Json(json!({ "error": msg.into() }))).into_response()
}

pub async fn list_sectors(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match store::list_sectors(state.db.pool()).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

pub async fn create_sector(
    State(state): State<Arc<AppState>>,
    Json(input): Json<SectorInput>,
) -> impl IntoResponse {
    match store::create_sector(state.db.pool(), input).await {
        Ok(row) => (StatusCode::CREATED, Json(row)).into_response(),
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

pub async fn create_document(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(input): Json<DocumentInput>,
) -> impl IntoResponse {
    match store::create_document(state.db.pool(), input, Some(&ctx.display_name)).await {
        Ok(row) => (StatusCode::CREATED, Json(row)).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, e),
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

pub async fn update_document(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(input): Json<DocumentUpdateInput>,
) -> impl IntoResponse {
    match store::update_document(state.db.pool(), &id, input).await {
        Ok(row) => (StatusCode::OK, Json(row)).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn publish_document(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(input): Json<PublishInput>,
) -> impl IntoResponse {
    match store::publish_document(state.db.pool(), &id, input, Some(&ctx.display_name)).await {
        Ok(row) => (StatusCode::OK, Json(row)).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn revalidate_document(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(input): Json<RevalidateInput>,
) -> impl IntoResponse {
    match store::revalidate_document(state.db.pool(), &id, input, Some(&ctx.display_name)).await {
        Ok(row) => (StatusCode::OK, Json(row)).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn list_versions(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match store::list_versions(state.db.pool(), &id).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

pub async fn get_version(
    State(state): State<Arc<AppState>>,
    Path((id, vid)): Path<(String, String)>,
) -> impl IntoResponse {
    match store::get_version(state.db.pool(), &id, &vid).await {
        Ok(row) => (StatusCode::OK, Json(row)).into_response(),
        Err(e) => err(StatusCode::NOT_FOUND, e),
    }
}

pub async fn get_settings(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match store::get_settings(state.db.pool()).await {
        Ok(row) => (StatusCode::OK, Json(row)).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

pub async fn upload_logo(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let mut filename = String::from("logo.png");
    let mut bytes: Option<Vec<u8>> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" {
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

    match store::save_logo(state.db.pool(), &filename, &data).await {
        Ok(row) => (StatusCode::OK, Json(row)).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn download_logo(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match store::logo_bytes(state.db.pool()).await {
        Ok((bytes, mime)) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, mime)
            .header(header::CACHE_CONTROL, "no-store")
            .body(Body::from(bytes))
            .unwrap_or_else(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Falha no logo")),
        Err(e) => err(StatusCode::NOT_FOUND, e),
    }
}

pub async fn seed_inventory(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    body: Option<Json<SeedInventoryInput>>,
) -> impl IntoResponse {
    let force = body.map(|j| j.0.force).unwrap_or(false);
    match store::seed_inventory(state.db.pool(), Some(&ctx.display_name), force).await {
        Ok(row) => (StatusCode::OK, Json(row)).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn check_alerts(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match store::check_alerts(state.db.pool()).await {
        Ok(res) => (StatusCode::OK, Json(res)).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Extension, Json,
};
use serde_json::json;
use std::sync::Arc;

use crate::core::acao::{corpo_acao, Confirmar, ErroApi, RespostaAcao};
use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;

use super::models::{
    DocumentInput, DocumentUpdateInput, DocumentsQuery, MoverStatusInput, PublishInput, RevalidateInput, SectorInput,
    SeedInventoryInput,
};
use super::{eventos, formularios, servicos, store};

fn err(status: StatusCode, msg: impl Into<String>) -> Response {
    (status, Json(json!({ "error": msg.into() }))).into_response()
}

fn autor(ctx: &AuthContext) -> String {
    let n = ctx.display_name.trim();
    if n.is_empty() { "Operador".to_string() } else { n.to_string() }
}

/// Resposta das escritas em 2 passos (campos do resultado também na raiz, para a tela).
fn resposta(r: &RespostaAcao<serde_json::Value>, status: Option<StatusCode>) -> Response {
    (status.unwrap_or(StatusCode::OK), Json(corpo_acao(r))).into_response()
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

pub async fn list_formularios(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match super::formularios::listar(state.db.pool()).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

pub async fn criar_formulario(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(input): Json<formularios::NovoFormulario>,
) -> Result<Response, ErroApi> {
    // `confirmar` no corpo é a forma da tela antiga.
    let confirmar = c.confirmar || input.confirmar.unwrap_or(false);
    let r = formularios::criar(state.db.pool(), input, &autor(&ctx), confirmar).await?;
    Ok(resposta(&r, None))
}

pub async fn get_formulario(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> Result<Response, ErroApi> {
    let v = formularios::detalhar(state.db.pool(), &code).await?;
    Ok((StatusCode::OK, Json(v)).into_response())
}

pub async fn editar_formulario(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(code): Path<String>,
    Query(c): Query<Confirmar>,
    Json(input): Json<formularios::EditarFormulario>,
) -> Result<Response, ErroApi> {
    let r = formularios::editar(state.db.pool(), &code, input, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r, None))
}

#[derive(Debug, serde::Deserialize)]
pub struct StatusFormularioInput {
    #[serde(alias = "status")]
    pub destino: String,
    #[serde(default)]
    pub motivo: String,
}

pub async fn mover_status_formulario(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(code): Path<String>,
    Query(c): Query<Confirmar>,
    Json(input): Json<StatusFormularioInput>,
) -> Result<Response, ErroApi> {
    let r = formularios::mover_status(state.db.pool(), &code, &input.destino, &input.motivo, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r, None))
}

#[derive(Debug, serde::Deserialize)]
pub struct PublicarFormularioInput {
    #[serde(default)]
    pub motivo: String,
}

pub async fn publicar_formulario(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(code): Path<String>,
    Query(c): Query<Confirmar>,
    Json(input): Json<PublicarFormularioInput>,
) -> Result<Response, ErroApi> {
    let r = formularios::publicar(state.db.pool(), &code, &input.motivo, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r, None))
}

pub async fn revisar_formulario(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(code): Path<String>,
    Query(c): Query<Confirmar>,
    Json(input): Json<formularios::RevisaoFormulario>,
) -> Result<Response, ErroApi> {
    let confirmar = c.confirmar || input.confirmar.unwrap_or(false);
    let r = formularios::nova_revisao(state.db.pool(), &code, input, &autor(&ctx), confirmar).await?;
    Ok(resposta(&r, None))
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
    Query(c): Query<Confirmar>,
    Json(input): Json<DocumentInput>,
) -> Result<Response, ErroApi> {
    let r = servicos::criar_documento(state.db.pool(), input, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r, c.confirmar.then_some(StatusCode::CREATED)))
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
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(c): Query<Confirmar>,
    Json(input): Json<DocumentUpdateInput>,
) -> Result<Response, ErroApi> {
    let r = servicos::atualizar_documento(state.db.pool(), &id, input, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r, None))
}

pub async fn publish_document(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(c): Query<Confirmar>,
    Json(input): Json<PublishInput>,
) -> Result<Response, ErroApi> {
    let r = servicos::publicar_documento(state.db.pool(), &id, input, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r, None))
}

pub async fn mover_status(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(c): Query<Confirmar>,
    Json(input): Json<MoverStatusInput>,
) -> Result<Response, ErroApi> {
    let r = servicos::mover_status(state.db.pool(), &id, &input.status, &input.motivo, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r, None))
}

pub async fn revalidate_document(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(c): Query<Confirmar>,
    Json(input): Json<RevalidateInput>,
) -> Result<Response, ErroApi> {
    let r = servicos::revalidar_documento(state.db.pool(), &id, input, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r, None))
}

pub async fn list_eventos_documento(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match eventos::listar(state.db.pool(), "pop", &id).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e),
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

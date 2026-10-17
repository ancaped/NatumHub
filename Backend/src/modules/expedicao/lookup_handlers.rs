use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use crate::handlers::AppState;
use super::lookup_models::{CreateLookupInput, EcommerceLookup, UpdateLookupInput};

async fn ensure_lookup_tables(pool: &sqlx::PgPool) -> Result<(), String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS ecommerce_platforms (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            nome VARCHAR(100) NOT NULL UNIQUE,
            ativo BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )"
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS ecommerce_shipping (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            nome VARCHAR(100) NOT NULL UNIQUE,
            ativo BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )"
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS ecommerce_clients (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            nome VARCHAR(255) NOT NULL UNIQUE,
            ativo BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )"
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

async fn list_lookup(pool: &sqlx::PgPool, table: &str) -> Result<Vec<EcommerceLookup>, String> {
    let sql = format!("SELECT id, nome, ativo, created_at FROM {table} ORDER BY nome");
    sqlx::query_as::<_, EcommerceLookup>(&sql)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
}

async fn create_lookup(
    pool: &sqlx::PgPool,
    table: &str,
    input: CreateLookupInput,
) -> Result<EcommerceLookup, String> {
    let nome = input.nome.trim();
    if nome.is_empty() {
        return Err("Nome obrigatório".into());
    }
    let ativo = input.ativo.unwrap_or(true);
    let sql = format!(
        "INSERT INTO {table} (nome, ativo) VALUES ($1, $2) RETURNING id, nome, ativo, created_at"
    );
    sqlx::query_as::<_, EcommerceLookup>(&sql)
        .bind(nome)
        .bind(ativo)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())
}

async fn update_lookup(
    pool: &sqlx::PgPool,
    table: &str,
    id: uuid::Uuid,
    input: UpdateLookupInput,
) -> Result<EcommerceLookup, String> {
    let sql = format!(
        "UPDATE {table} SET
            nome = COALESCE($1, nome),
            ativo = COALESCE($2, ativo)
        WHERE id = $3
        RETURNING id, nome, ativo, created_at"
    );
    sqlx::query_as::<_, EcommerceLookup>(&sql)
        .bind(input.nome.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()))
        .bind(input.ativo)
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Registro não encontrado".to_string())
}

async fn delete_lookup(pool: &sqlx::PgPool, table: &str, id: uuid::Uuid) -> Result<bool, String> {
    let sql = format!("DELETE FROM {table} WHERE id = $1");
    let res = sqlx::query(&sql)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(res.rows_affected() > 0)
}

macro_rules! lookup_handlers {
    ($list:ident, $create:ident, $update:ident, $delete:ident, $table:expr) => {
        pub async fn $list(
            State(state): State<Arc<AppState>>,
        ) -> impl IntoResponse {
            let pool = state.db.pool();
            if let Err(e) = ensure_lookup_tables(pool).await {
                return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response();
            }
            match list_lookup(pool, $table).await {
                Ok(items) => (StatusCode::OK, Json(items)).into_response(),
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
            }
        }

        pub async fn $create(
            State(state): State<Arc<AppState>>,
            Json(input): Json<CreateLookupInput>,
        ) -> impl IntoResponse {
            let pool = state.db.pool();
            if let Err(e) = ensure_lookup_tables(pool).await {
                return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response();
            }
            match create_lookup(pool, $table, input).await {
                Ok(item) => (StatusCode::CREATED, Json(item)).into_response(),
                Err(e) => (StatusCode::BAD_REQUEST, e).into_response(),
            }
        }

        pub async fn $update(
            State(state): State<Arc<AppState>>,
            Path(id): Path<uuid::Uuid>,
            Json(input): Json<UpdateLookupInput>,
        ) -> impl IntoResponse {
            let pool = state.db.pool();
            if let Err(e) = ensure_lookup_tables(pool).await {
                return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response();
            }
            match update_lookup(pool, $table, id, input).await {
                Ok(item) => (StatusCode::OK, Json(item)).into_response(),
                Err(e) if e == "Registro não encontrado" => {
                    (StatusCode::NOT_FOUND, e).into_response()
                }
                Err(e) => (StatusCode::BAD_REQUEST, e).into_response(),
            }
        }

        pub async fn $delete(
            State(state): State<Arc<AppState>>,
            Path(id): Path<uuid::Uuid>,
        ) -> impl IntoResponse {
            let pool = state.db.pool();
            if let Err(e) = ensure_lookup_tables(pool).await {
                return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response();
            }
            match delete_lookup(pool, $table, id).await {
                Ok(true) => (StatusCode::OK, "Removido").into_response(),
                Ok(false) => (StatusCode::NOT_FOUND, "Registro não encontrado").into_response(),
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
            }
        }
    };
}

lookup_handlers!(
    list_platforms,
    create_platform,
    update_platform,
    delete_platform,
    "ecommerce_platforms"
);
lookup_handlers!(
    list_shipping,
    create_shipping,
    update_shipping,
    delete_shipping,
    "ecommerce_shipping"
);
lookup_handlers!(
    list_clients,
    create_client,
    update_client,
    delete_client,
    "ecommerce_clients"
);

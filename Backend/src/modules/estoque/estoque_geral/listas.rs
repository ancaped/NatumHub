//! Listas de contagem da consulta de estoque.
//! Congela saldo, reserva e pedido. Não grava movimento nem altera o ERP.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Extension, Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Row;
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscopoQuery {
    pub escopo: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NovaListaBody {
    pub escopo: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NovoItemBody {
    pub item_code: String,
    pub description: String,
    pub unit: String,
    pub saldo: f64,
    pub reservado: f64,
    pub em_pedido: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncluirItensBody {
    pub itens: Vec<NovoItemBody>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtualizarItemBody {
    pub reservado: f64,
    pub em_pedido: f64,
    pub contagem1: Option<f64>,
    pub contagem2: Option<f64>,
    pub contagem3: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListaItem {
    pub id: String,
    pub item_code: String,
    pub description: String,
    pub unit: String,
    pub saldo: f64,
    pub reservado: f64,
    pub em_pedido: f64,
    pub contagem1: Option<f64>,
    pub contagem2: Option<f64>,
    pub contagem3: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListaContagem {
    pub id: String,
    pub escopo: String,
    pub criada_em: String,
    pub criada_por: Option<String>,
    pub status: String,
    pub encerrada_em: Option<String>,
    pub itens: Vec<ListaItem>,
}

fn escopo_valido(escopo: &str) -> bool {
    matches!(
        escopo,
        "materia_prima" | "embalagens" | "coloracao" | "apoio" | "produtos" | "insumos"
    )
}

fn qtd_ok(v: f64) -> bool {
    v.is_finite() && v >= 0.0
}

fn qtd_opt_ok(v: Option<f64>) -> bool {
    v.map(qtd_ok).unwrap_or(true)
}

async fn ensure_tables(pool: &sqlx::PgPool) -> Result<(), String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS estoque_contagem_listas (
            id TEXT PRIMARY KEY,
            escopo TEXT NOT NULL,
            criada_em TEXT NOT NULL,
            criada_por TEXT,
            status TEXT NOT NULL DEFAULT 'aberta',
            encerrada_em TEXT
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS estoque_contagem_lista_itens (
            id TEXT PRIMARY KEY,
            lista_id TEXT NOT NULL REFERENCES estoque_contagem_listas(id) ON DELETE CASCADE,
            item_code TEXT NOT NULL,
            description TEXT NOT NULL,
            unit TEXT NOT NULL,
            saldo DOUBLE PRECISION NOT NULL,
            reservado DOUBLE PRECISION NOT NULL,
            em_pedido DOUBLE PRECISION NOT NULL,
            contagem_1 DOUBLE PRECISION,
            contagem_2 DOUBLE PRECISION,
            contagem_3 DOUBLE PRECISION,
            UNIQUE (lista_id, item_code)
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_estoque_contagem_listas_escopo
         ON estoque_contagem_listas (escopo, criada_em DESC)",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn map_item(row: &sqlx::postgres::PgRow) -> ListaItem {
    ListaItem {
        id: row.get(0),
        item_code: row.get(1),
        description: row.get(2),
        unit: row.get(3),
        saldo: row.get(4),
        reservado: row.get(5),
        em_pedido: row.get(6),
        contagem1: row.get(7),
        contagem2: row.get(8),
        contagem3: row.get(9),
    }
}

async fn load_lista(pool: &sqlx::PgPool, id: &str) -> Result<Option<ListaContagem>, String> {
    let head = sqlx::query(
        "SELECT id, escopo, criada_em, criada_por, status, encerrada_em
         FROM estoque_contagem_listas WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let Some(head) = head else {
        return Ok(None);
    };

    let rows = sqlx::query(
        "SELECT id, item_code, description, unit, saldo, reservado, em_pedido,
                contagem_1, contagem_2, contagem_3
         FROM estoque_contagem_lista_itens
         WHERE lista_id = $1
         ORDER BY description, item_code",
    )
    .bind(id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(Some(ListaContagem {
        id: head.get(0),
        escopo: head.get(1),
        criada_em: head.get(2),
        criada_por: head.get(3),
        status: head.get(4),
        encerrada_em: head.get(5),
        itens: rows.iter().map(map_item).collect(),
    }))
}

async fn lista_aberta(pool: &sqlx::PgPool, id: &str) -> Result<Option<bool>, String> {
    let status: Option<String> = sqlx::query_scalar(
        "SELECT status FROM estoque_contagem_listas WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(status.map(|s| s == "aberta"))
}

fn exigir_aberta(estado: Option<bool>) -> Result<(), axum::response::Response> {
    match estado {
        Some(true) => Ok(()),
        Some(false) => Err(err(
            StatusCode::CONFLICT,
            "Esta lista já foi marcada como lançada. Reabra para continuar.",
        )),
        None => Err(err(StatusCode::NOT_FOUND, "Lista não encontrada.")),
    }
}

async fn saldo_do_erp(pool: &sqlx::PgPool, code: &str) -> Result<f64, String> {
    match crate::core::legacy_db::refresh_stock_snapshot_from_erp(pool, code).await {
        Ok(live) => Ok(live.stock_qty),
        Err(e) => Err(format!("Não foi possível ler o saldo de {code} no ERP: {e}")),
    }
}

fn err(status: StatusCode, message: &str) -> axum::response::Response {
    (status, Json(json!({ "error": message }))).into_response()
}

pub async fn listar(
    State(state): State<Arc<AppState>>,
    Query(q): Query<EscopoQuery>,
) -> impl IntoResponse {
    if !escopo_valido(&q.escopo) {
        return err(StatusCode::BAD_REQUEST, "Módulo de estoque desconhecido.");
    }
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return err(StatusCode::INTERNAL_SERVER_ERROR, &e);
    }
    let ids: Vec<String> = match sqlx::query_scalar(
        "SELECT id FROM estoque_contagem_listas WHERE escopo = $1 ORDER BY criada_em DESC",
    )
    .bind(&q.escopo)
    .fetch_all(pool)
    .await
    {
        Ok(v) => v,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    };
    let mut listas = Vec::new();
    for id in ids {
        match load_lista(pool, &id).await {
            Ok(Some(lista)) => listas.push(lista),
            Ok(None) => {}
            Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &e),
        }
    }
    (StatusCode::OK, Json(listas)).into_response()
}

pub async fn criar(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<NovaListaBody>,
) -> impl IntoResponse {
    if !escopo_valido(&body.escopo) {
        return err(StatusCode::BAD_REQUEST, "Módulo de estoque desconhecido.");
    }
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return err(StatusCode::INTERNAL_SERVER_ERROR, &e);
    }
    let id = uuid::Uuid::new_v4().to_string();
    let agora = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if let Err(e) = sqlx::query(
        "INSERT INTO estoque_contagem_listas (id, escopo, criada_em, criada_por, status)
         VALUES ($1, $2, $3, $4, 'aberta')",
    )
    .bind(&id)
    .bind(&body.escopo)
    .bind(&agora)
    .bind(&ctx.display_name)
    .execute(pool)
    .await
    {
        return err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string());
    }
    match load_lista(pool, &id).await {
        Ok(Some(lista)) => (StatusCode::OK, Json(lista)).into_response(),
        Ok(None) => err(StatusCode::INTERNAL_SERVER_ERROR, "Lista não encontrada."),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

pub async fn incluir_itens(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<IncluirItensBody>,
) -> impl IntoResponse {
    if body.itens.is_empty() {
        return err(StatusCode::BAD_REQUEST, "Escolha ao menos um item.");
    }
    if body.itens.len() > 400 {
        return err(StatusCode::BAD_REQUEST, "Inclua no máximo 400 itens por vez.");
    }
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return err(StatusCode::INTERNAL_SERVER_ERROR, &e);
    }
    match lista_aberta(pool, &id).await {
        Ok(estado) => {
            if let Err(res) = exigir_aberta(estado) {
                return res;
            }
        }
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
    for item in &body.itens {
        let code = item.item_code.trim();
        if code.is_empty() || item.description.trim().is_empty() {
            return err(StatusCode::BAD_REQUEST, "Item sem código ou descrição.");
        }
        if !qtd_ok(item.reservado) || !qtd_ok(item.em_pedido) {
            return err(StatusCode::BAD_REQUEST, "Reserva e pedido não podem ser negativos.");
        }
        let saldo = match saldo_do_erp(pool, code).await {
            Ok(v) => v,
            Err(msg) => return err(StatusCode::BAD_GATEWAY, &msg),
        };
        let item_id = uuid::Uuid::new_v4().to_string();
        if let Err(e) = sqlx::query(
            "INSERT INTO estoque_contagem_lista_itens
                (id, lista_id, item_code, description, unit, saldo, reservado, em_pedido)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (lista_id, item_code) DO NOTHING",
        )
        .bind(&item_id)
        .bind(&id)
        .bind(code)
        .bind(item.description.trim())
        .bind(if item.unit.trim().is_empty() { "UN" } else { item.unit.trim() })
        .bind(saldo)
        .bind(item.reservado)
        .bind(item.em_pedido)
        .execute(pool)
        .await
        {
            return err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string());
        }
    }
    match load_lista(pool, &id).await {
        Ok(Some(lista)) => (StatusCode::OK, Json(lista)).into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, "Lista não encontrada."),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

pub async fn atualizar_item(
    State(state): State<Arc<AppState>>,
    Path((lista_id, item_id)): Path<(String, String)>,
    Json(body): Json<AtualizarItemBody>,
) -> impl IntoResponse {
    if !qtd_ok(body.reservado)
        || !qtd_ok(body.em_pedido)
        || !qtd_opt_ok(body.contagem1)
        || !qtd_opt_ok(body.contagem2)
        || !qtd_opt_ok(body.contagem3)
    {
        return err(StatusCode::BAD_REQUEST, "As quantidades não podem ser negativas.");
    }
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return err(StatusCode::INTERNAL_SERVER_ERROR, &e);
    }
    match lista_aberta(pool, &lista_id).await {
        Ok(estado) => {
            if let Err(res) = exigir_aberta(estado) {
                return res;
            }
        }
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
    let n = match sqlx::query(
        "UPDATE estoque_contagem_lista_itens
         SET reservado = $3, em_pedido = $4, contagem_1 = $5, contagem_2 = $6, contagem_3 = $7
         WHERE id = $1 AND lista_id = $2",
    )
    .bind(&item_id)
    .bind(&lista_id)
    .bind(body.reservado)
    .bind(body.em_pedido)
    .bind(body.contagem1)
    .bind(body.contagem2)
    .bind(body.contagem3)
    .execute(pool)
    .await
    {
        Ok(r) => r.rows_affected(),
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    };
    if n == 0 {
        return err(StatusCode::NOT_FOUND, "Item não está nesta lista.");
    }
    match load_lista(pool, &lista_id).await {
        Ok(Some(lista)) => (StatusCode::OK, Json(lista)).into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, "Lista não encontrada."),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

pub async fn remover_item(
    State(state): State<Arc<AppState>>,
    Path((lista_id, item_id)): Path<(String, String)>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return err(StatusCode::INTERNAL_SERVER_ERROR, &e);
    }
    match lista_aberta(pool, &lista_id).await {
        Ok(estado) => {
            if let Err(res) = exigir_aberta(estado) {
                return res;
            }
        }
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
    if let Err(e) = sqlx::query(
        "DELETE FROM estoque_contagem_lista_itens WHERE id = $1 AND lista_id = $2",
    )
    .bind(&item_id)
    .bind(&lista_id)
    .execute(pool)
    .await
    {
        return err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string());
    }
    match load_lista(pool, &lista_id).await {
        Ok(Some(lista)) => (StatusCode::OK, Json(lista)).into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, "Lista não encontrada."),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

async fn marcar(
    pool: &sqlx::PgPool,
    id: &str,
    status: &str,
    encerrada_em: Option<String>,
) -> Result<bool, String> {
    let n = sqlx::query(
        "UPDATE estoque_contagem_listas SET status = $2, encerrada_em = $3 WHERE id = $1",
    )
    .bind(id)
    .bind(status)
    .bind(encerrada_em)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?
    .rows_affected();
    Ok(n > 0)
}

pub async fn atualizar_saldos(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return err(StatusCode::INTERNAL_SERVER_ERROR, &e);
    }
    match lista_aberta(pool, &id).await {
        Ok(estado) => {
            if let Err(res) = exigir_aberta(estado) {
                return res;
            }
        }
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
    let codes: Vec<String> = match sqlx::query_scalar(
        "SELECT item_code FROM estoque_contagem_lista_itens WHERE lista_id = $1",
    )
    .bind(&id)
    .fetch_all(pool)
    .await
    {
        Ok(v) => v,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    };
    for code in codes {
        let saldo = match saldo_do_erp(pool, code.trim()).await {
            Ok(v) => v,
            Err(msg) => return err(StatusCode::BAD_GATEWAY, &msg),
        };
        if let Err(e) = sqlx::query(
            "UPDATE estoque_contagem_lista_itens SET saldo = $3 WHERE lista_id = $1 AND item_code = $2",
        )
        .bind(&id)
        .bind(code.trim())
        .bind(saldo)
        .execute(pool)
        .await
        {
            return err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string());
        }
    }
    match load_lista(pool, &id).await {
        Ok(Some(lista)) => (StatusCode::OK, Json(lista)).into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, "Lista não encontrada."),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

pub async fn encerrar(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return err(StatusCode::INTERNAL_SERVER_ERROR, &e);
    }
    let agora = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match marcar(pool, &id, "lancada", Some(agora)).await {
        Ok(true) => {}
        Ok(false) => return err(StatusCode::NOT_FOUND, "Lista não encontrada."),
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
    match load_lista(pool, &id).await {
        Ok(Some(lista)) => (StatusCode::OK, Json(lista)).into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, "Lista não encontrada."),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

pub async fn reabrir(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return err(StatusCode::INTERNAL_SERVER_ERROR, &e);
    }
    match marcar(pool, &id, "aberta", None).await {
        Ok(true) => {}
        Ok(false) => return err(StatusCode::NOT_FOUND, "Lista não encontrada."),
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
    match load_lista(pool, &id).await {
        Ok(Some(lista)) => (StatusCode::OK, Json(lista)).into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, "Lista não encontrada."),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

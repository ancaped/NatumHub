use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Extension, Json,
};
use serde::Deserialize;
use serde_json::json;
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;

use super::models::{AvariaOut, ItemLookupOut, ListQuery, LookupQuery, UpsertAvariaRequest};

const MODULE: &str = "qualidade_avarias";

const STATUSES: &[&str] = &[
    "em_analise",
    "retorno_estoque",
    "reparo",
    "embalagem",
    "descarte",
    "outro",
];

pub(super) const SELECT_COLS: &str = r#"
    a.id, a.register_number, a.item_code, a.description, a.lote, a.qty, a.location, a.status,
    a.notes, a.foto_path, a.created_by, a.decided_by, a.decided_at, a.created_at, a.updated_at,
    folha.sheet_number, folha.sheet_status,
    a.repair_type, a.problema, a.encaminhamento, a.fq_necessaria, a.fq_resultado, a.fq_observacao
"#;

pub(super) const AVARIA_FROM: &str = r#"
    FROM qualidade_avarias a
    LEFT JOIN LATERAL (
        SELECT fl.sheet_number, fl.status AS sheet_status
        FROM qualidade_avaria_folha_itens it
        JOIN qualidade_avaria_folhas fl ON fl.id = it.folha_id
        WHERE it.avaria_id = a.id AND fl.status <> 'cancelada'
        ORDER BY fl.id DESC
        LIMIT 1
    ) folha ON TRUE
"#;

pub async fn ensure_tables(pool: &PgPool) -> Result<(), String> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS qualidade_avarias (
            id BIGSERIAL PRIMARY KEY,
            register_number TEXT UNIQUE NOT NULL,
            item_code TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            lote TEXT NOT NULL DEFAULT '',
            qty DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK (qty > 0),
            location TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'em_analise'
                CHECK (status IN (
                    'em_analise', 'retorno_estoque', 'reparo', 'embalagem', 'descarte', 'outro'
                )),
            notes TEXT,
            foto_path TEXT,
            created_by TEXT,
            decided_by TEXT,
            decided_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS qualidade_avaria_folhas (
            id BIGSERIAL PRIMARY KEY,
            sheet_number TEXT UNIQUE NOT NULL,
            destination TEXT NOT NULL
                CHECK (destination IN ('expedicao', 'embalagem', 'reparo')),
            status TEXT NOT NULL DEFAULT 'aberta'
                CHECK (status IN ('aberta', 'devolvida', 'cancelada')),
            created_by TEXT,
            returned_by TEXT,
            returned_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS qualidade_avaria_folha_itens (
            id BIGSERIAL PRIMARY KEY,
            folha_id BIGINT NOT NULL REFERENCES qualidade_avaria_folhas(id) ON DELETE CASCADE,
            avaria_id BIGINT NOT NULL REFERENCES qualidade_avarias(id),
            UNIQUE (folha_id, avaria_id)
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    for stmt in [
        "CREATE INDEX IF NOT EXISTS idx_qualidade_avarias_status ON qualidade_avarias (status)",
        "CREATE INDEX IF NOT EXISTS idx_qualidade_avarias_item ON qualidade_avarias (item_code)",
        "CREATE INDEX IF NOT EXISTS idx_qualidade_avarias_lote ON qualidade_avarias (lote)",
        "CREATE INDEX IF NOT EXISTS idx_qualidade_avaria_folhas_status ON qualidade_avaria_folhas (status)",
        "CREATE INDEX IF NOT EXISTS idx_qualidade_avaria_folha_itens_avaria ON qualidade_avaria_folha_itens (avaria_id)",
        "ALTER TABLE qualidade_avarias ADD COLUMN IF NOT EXISTS repair_type TEXT",
        "ALTER TABLE qualidade_avarias ADD COLUMN IF NOT EXISTS problema TEXT",
        "ALTER TABLE qualidade_avarias ADD COLUMN IF NOT EXISTS encaminhamento TEXT",
        "ALTER TABLE qualidade_avarias ADD COLUMN IF NOT EXISTS fq_necessaria BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE qualidade_avarias ADD COLUMN IF NOT EXISTS fq_resultado TEXT",
        "ALTER TABLE qualidade_avarias ADD COLUMN IF NOT EXISTS fq_observacao TEXT",
        "ALTER TABLE qualidade_avaria_folhas ADD COLUMN IF NOT EXISTS box_count INTEGER NOT NULL DEFAULT 1",
    ] {
        sqlx::query(stmt)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub(super) fn require_module(ctx: &AuthContext) -> Result<(), Response> {
    if ctx.has_module(MODULE) {
        Ok(())
    } else {
        Err((
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Sem acesso ao módulo Avarias" })),
        )
            .into_response())
    }
}

pub(super) fn require_edit(ctx: &AuthContext) -> Result<(), Response> {
    if ctx.can_edit_module(MODULE) {
        Ok(())
    } else {
        Err((
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Sem permissão para alterar avarias" })),
        )
            .into_response())
    }
}

fn normalize_status(raw: &str) -> Result<&'static str, String> {
    let t = raw.trim();
    let t = if t.is_empty() { "em_analise" } else { t };
    STATUSES
        .iter()
        .copied()
        .find(|s| *s == t)
        .ok_or_else(|| format!("Status inválido: {t}"))
}

pub(super) fn map_avaria(r: &sqlx::postgres::PgRow) -> AvariaOut {
    let decided_at: Option<chrono::DateTime<chrono::Utc>> = r.get(12);
    let created_at: chrono::DateTime<chrono::Utc> = r.get(13);
    let updated_at: chrono::DateTime<chrono::Utc> = r.get(14);
    AvariaOut {
        id: crate::core::pg_row::pg_i64(r, 0),
        register_number: r.get(1),
        item_code: r.get(2),
        description: r.get(3),
        lote: r.get(4),
        qty: r.get(5),
        location: r.get(6),
        status: r.get(7),
        notes: r.get(8),
        foto_path: r.get(9),
        created_by: r.get(10),
        decided_by: r.get(11),
        decided_at: decided_at.map(|t| t.to_rfc3339()),
        created_at: created_at.to_rfc3339(),
        updated_at: updated_at.to_rfc3339(),
        sheet_number: r.get(15),
        sheet_status: r.get(16),
        repair_type: r.get(17),
        problema: r.get(18),
        encaminhamento: r.get(19),
        fq_necessaria: r.get(20),
        fq_resultado: r.get(21),
        fq_observacao: r.get(22),
    }
}

async fn load_one(pool: &PgPool, id: i64) -> Result<Option<AvariaOut>, String> {
    let sql = format!("SELECT {SELECT_COLS} {AVARIA_FROM} WHERE a.id = $1");
    let row = sqlx::query(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.as_ref().map(map_avaria))
}

async fn next_register_number(pool: &PgPool) -> Result<String, String> {
    let year = chrono::Local::now().format("%Y").to_string();
    let prefix = format!("AV-{year}-");
    let row = sqlx::query(
        r#"
        SELECT register_number FROM qualidade_avarias
        WHERE register_number LIKE $1
        ORDER BY register_number DESC
        LIMIT 1
        "#,
    )
    .bind(format!("{prefix}%"))
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let next = match row {
        Some(r) => {
            let last: String = r.get(0);
            last.rsplit('-')
                .next()
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(0)
                + 1
        }
        None => 1,
    };
    Ok(format!("{prefix}{next:04}"))
}

struct CleanInput {
    item_code: String,
    description: String,
    lote: String,
    qty: f64,
    location: String,
    status: &'static str,
    notes: Option<String>,
    repair_type: Option<String>,
    problema: Option<String>,
    encaminhamento: Option<String>,
    fq_necessaria: bool,
    fq_resultado: Option<String>,
    fq_observacao: Option<String>,
}

fn clean_input(payload: &UpsertAvariaRequest) -> Result<CleanInput, String> {
    let item_code = payload.item_code.trim().to_string();
    if item_code.is_empty() {
        return Err("Informe o código do item".into());
    }
    let description = payload.description.trim().to_string();
    if description.is_empty() {
        return Err("Informe a descrição do item".into());
    }
    if !payload.qty.is_finite() || payload.qty <= 0.0 {
        return Err("A quantidade precisa ser maior que zero".into());
    }
    let status = normalize_status(payload.status.as_deref().unwrap_or("em_analise"))?;
    let notes = payload
        .notes
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let repair_type = if status == "reparo" || status == "embalagem" {
        Some(
            payload
                .repair_type
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or("embalagem")
                .to_string(),
        )
    } else {
        None
    };
    if let Some(kind) = &repair_type {
        if kind != "embalagem" {
            return Err("Tipo de reparo inválido".into());
        }
    }
    let fq_resultado = payload
        .fq_resultado
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    if let Some(result) = &fq_resultado {
        if !matches!(result.as_str(), "pendente" | "aprovado" | "reprovado") {
            return Err("Resultado da análise físico-química inválido".into());
        }
    }
    let text = |value: &Option<String>| {
        value
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    };
    Ok(CleanInput {
        item_code,
        description,
        lote: payload.lote.as_deref().unwrap_or("").trim().to_string(),
        qty: payload.qty,
        location: payload.location.as_deref().unwrap_or("").trim().to_string(),
        status,
        notes,
        repair_type,
        problema: text(&payload.problema),
        encaminhamento: text(&payload.encaminhamento),
        fq_necessaria: payload.fq_necessaria.unwrap_or(false),
        fq_resultado,
        fq_observacao: text(&payload.fq_observacao),
    })
}

pub async fn list_avarias(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(query): Query<ListQuery>,
) -> impl IntoResponse {
    if let Err(resp) = require_module(&ctx) {
        return resp;
    }
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let status = query.status.unwrap_or_default();
    let status = status.trim();
    if !status.is_empty() && normalize_status(status).is_err() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("Status inválido: {status}") })),
        )
            .into_response();
    }
    let q = query.q.unwrap_or_default();
    let q = q.trim().to_string();
    let pattern = format!("%{q}%");

    let sql = format!(
        r#"
        SELECT {SELECT_COLS}
        {AVARIA_FROM}
        WHERE ($1 = '' OR a.status = $1)
          AND (
            $2 = ''
            OR a.register_number ILIKE $3
            OR a.item_code ILIKE $3
            OR a.description ILIKE $3
            OR a.lote ILIKE $3
            OR a.location ILIKE $3
          )
        ORDER BY a.created_at DESC
        LIMIT 300
        "#
    );
    match sqlx::query(&sql)
        .bind(status)
        .bind(&q)
        .bind(&pattern)
        .fetch_all(pool)
        .await
    {
        Ok(rows) => Json(rows.iter().map(map_avaria).collect::<Vec<_>>()).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_avaria(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    if let Err(resp) = require_module(&ctx) {
        return resp;
    }
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }
    match load_one(pool, id).await {
        Ok(Some(row)) => Json(row).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Avaria não encontrada" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn create_avaria(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(payload): Json<UpsertAvariaRequest>,
) -> impl IntoResponse {
    if let Err(resp) = require_edit(&ctx) {
        return resp;
    }
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }
    let input = match clean_input(&payload) {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": e })),
            )
                .into_response();
        }
    };
    let number = match next_register_number(pool).await {
        Ok(n) => n,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response();
        }
    };
    let who = ctx.display_name.clone();
    let inserted: Result<i64, sqlx::Error> = sqlx::query_scalar(
        r#"
        INSERT INTO qualidade_avarias (
            register_number, item_code, description, lote, qty, location, status, notes,
            created_by, decided_by, decided_at,
            repair_type, problema, encaminhamento, fq_necessaria, fq_resultado, fq_observacao
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            CASE WHEN $7 = 'em_analise' THEN NULL ELSE $9 END,
            CASE WHEN $7 = 'em_analise' THEN NULL ELSE NOW() END,
            $10, $11, $12, $13, $14, $15
        )
        RETURNING id
        "#,
    )
    .bind(&number)
    .bind(&input.item_code)
    .bind(&input.description)
    .bind(&input.lote)
    .bind(input.qty)
    .bind(&input.location)
    .bind(input.status)
    .bind(&input.notes)
    .bind(&who)
    .bind(&input.repair_type)
    .bind(&input.problema)
    .bind(&input.encaminhamento)
    .bind(input.fq_necessaria)
    .bind(&input.fq_resultado)
    .bind(&input.fq_observacao)
    .fetch_one(pool)
    .await;

    match inserted {
        Ok(id) => match load_one(pool, id).await {
            Ok(Some(row)) => (StatusCode::CREATED, Json(row)).into_response(),
            Ok(None) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Avaria criada, mas não foi possível reler" })),
            )
                .into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response(),
        },
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn update_avaria(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Json(payload): Json<UpsertAvariaRequest>,
) -> impl IntoResponse {
    if let Err(resp) = require_edit(&ctx) {
        return resp;
    }
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }
    let input = match clean_input(&payload) {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": e })),
            )
                .into_response();
        }
    };
    let who = ctx.display_name.clone();
    let updated = sqlx::query(
        r#"
        UPDATE qualidade_avarias SET
            item_code = $1,
            description = $2,
            lote = $3,
            qty = $4,
            location = $5,
            status = $6,
            notes = $7,
            repair_type = $10,
            problema = $11,
            encaminhamento = $12,
            fq_necessaria = $13,
            fq_resultado = $14,
            fq_observacao = $15,
            decided_by = CASE
                WHEN $6 = 'em_analise' THEN NULL
                WHEN status = $6 THEN decided_by
                ELSE $8
            END,
            decided_at = CASE
                WHEN $6 = 'em_analise' THEN NULL
                WHEN status = $6 THEN decided_at
                ELSE NOW()
            END,
            updated_at = NOW()
        WHERE id = $9
        "#,
    )
    .bind(&input.item_code)
    .bind(&input.description)
    .bind(&input.lote)
    .bind(input.qty)
    .bind(&input.location)
    .bind(input.status)
    .bind(&input.notes)
    .bind(&who)
    .bind(id)
    .bind(&input.repair_type)
    .bind(&input.problema)
    .bind(&input.encaminhamento)
    .bind(input.fq_necessaria)
    .bind(&input.fq_resultado)
    .bind(&input.fq_observacao)
    .execute(pool)
    .await;

    match updated {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Avaria não encontrada" })),
        )
            .into_response(),
        Ok(_) => match load_one(pool, id).await {
            Ok(Some(row)) => Json(row).into_response(),
            Ok(None) => (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Avaria não encontrada" })),
            )
                .into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response(),
        },
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JuntarBody {
    ids: Vec<i64>,
}

pub async fn juntar_avarias(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<JuntarBody>,
) -> impl IntoResponse {
    if let Err(resp) = require_edit(&ctx) {
        return resp;
    }
    let ids: Vec<i64> = body.ids.into_iter().filter(|id| *id > 0).collect();
    let unique = {
        let mut seen = ids.clone();
        seen.sort_unstable();
        seen.dedup();
        seen
    };
    if unique.len() < 2 || unique.len() > 40 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Selecione de 2 a 40 registros do mesmo código e lote" })),
        )
            .into_response();
    }
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let rows = match sqlx::query(
        r#"
        SELECT id, item_code, lote, qty, notes, status, foto_path
        FROM qualidade_avarias
        WHERE id = ANY($1)
        "#,
    )
    .bind(&unique)
    .fetch_all(pool)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    if rows.len() != unique.len() {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Algum registro da coleta não foi encontrado" })),
        )
            .into_response();
    }

    let mut code = String::new();
    let mut lote = String::new();
    let mut status = String::new();
    let mut qty_sum = 0.0_f64;
    let mut notes: Vec<String> = Vec::new();
    let mut keep_id = i64::MAX;
    let mut drop_fotos: Vec<(i64, String)> = Vec::new();
    for row in &rows {
        let id: i64 = row.get(0);
        let item_code: String = row.get(1);
        let item_lote: String = row.get(2);
        let qty: f64 = row.get(3);
        let item_notes: Option<String> = row.get(4);
        let item_status: String = row.get(5);
        let foto: Option<String> = row.get(6);
        let norm_status = if item_status == "embalagem" {
            "reparo"
        } else {
            item_status.as_str()
        };
        if code.is_empty() {
            code = item_code.trim().to_lowercase();
            lote = item_lote.trim().to_lowercase();
            status = norm_status.to_string();
        } else if item_code.trim().to_lowercase() != code
            || item_lote.trim().to_lowercase() != lote
            || norm_status != status
        {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Só dá para juntar registros do mesmo código, do mesmo lote e da mesma decisão" })),
            )
                .into_response();
        }
        qty_sum += qty;
        if let Some(note) = item_notes.map(|n| n.trim().to_string()).filter(|n| !n.is_empty()) {
            if !notes.iter().any(|n| n == &note) {
                notes.push(note);
            }
        }
        if id < keep_id {
            keep_id = id;
        }
        if let Some(rel) = foto.filter(|s| !s.trim().is_empty()) {
            drop_fotos.push((id, rel));
        }
    }

    let blocked: Option<String> = match sqlx::query(
        r#"
        SELECT fl.sheet_number
        FROM qualidade_avaria_folha_itens it
        JOIN qualidade_avaria_folhas fl ON fl.id = it.folha_id
        WHERE it.avaria_id = ANY($1) AND fl.status <> 'cancelada'
        LIMIT 1
        "#,
    )
    .bind(&unique)
    .fetch_optional(pool)
    .await
    {
        Ok(Some(row)) => Some(row.get(0)),
        Ok(None) => None,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    if let Some(number) = blocked {
        return (
            StatusCode::CONFLICT,
            Json(json!({ "error": format!("Um destes itens já está no controle {number}. Cancele o controle antes de juntar.") })),
        )
            .into_response();
    }

    let drop_ids: Vec<i64> = unique.into_iter().filter(|id| *id != keep_id).collect();
    let joined_notes = if notes.is_empty() {
        None
    } else {
        Some(notes.join("\n"))
    };
    let mut tx = match pool.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    if let Err(e) = sqlx::query(
        "UPDATE qualidade_avarias SET qty = $2, notes = $3, updated_at = NOW() WHERE id = $1",
    )
    .bind(keep_id)
    .bind(qty_sum)
    .bind(&joined_notes)
    .execute(&mut *tx)
    .await
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }
    if let Err(e) = sqlx::query("DELETE FROM qualidade_avarias WHERE id = ANY($1)")
        .bind(&drop_ids)
        .execute(&mut *tx)
        .await
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }
    if let Err(e) = tx.commit().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }
    for (id, rel) in drop_fotos {
        if id != keep_id {
            let _ = std::fs::remove_file(crate::core::app_config::saves_dir().join(rel));
        }
    }
    match load_one(pool, keep_id).await {
        Ok(Some(row)) => Json(row).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Registro juntado não encontrado" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn delete_avaria(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    if let Err(resp) = require_edit(&ctx) {
        return resp;
    }
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }
    let on_sheet: Option<String> = match sqlx::query(
        r#"
        SELECT fl.sheet_number
        FROM qualidade_avaria_folha_itens it
        JOIN qualidade_avaria_folhas fl ON fl.id = it.folha_id
        WHERE it.avaria_id = $1 AND fl.status <> 'cancelada'
        LIMIT 1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    {
        Ok(Some(r)) => Some(r.get(0)),
        Ok(None) => None,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    if let Some(number) = on_sheet {
        return (
            StatusCode::CONFLICT,
            Json(json!({ "error": format!("Este item está na folha {number}. Cancele a folha antes de excluir.") })),
        )
            .into_response();
    }

    let foto: Option<String> = match sqlx::query("SELECT foto_path FROM qualidade_avarias WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
    {
        Ok(Some(r)) => r.get(0),
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Avaria não encontrada" })),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    if let Err(e) = sqlx::query("DELETE FROM qualidade_avarias WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }
    if let Some(rel) = foto.filter(|s| !s.trim().is_empty()) {
        let abs = crate::core::app_config::saves_dir().join(&rel);
        let _ = std::fs::remove_file(abs);
    }
    Json(json!({ "ok": true })).into_response()
}

pub async fn lookup_item(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(query): Query<LookupQuery>,
) -> impl IntoResponse {
    if let Err(resp) = require_module(&ctx) {
        return resp;
    }
    let pool = state.db.pool();
    let q = query.q.unwrap_or_default();
    let q = q.trim();
    if q.len() < 2 {
        return Json(Vec::<ItemLookupOut>::new()).into_response();
    }
    let pattern = format!("%{q}%");

    let rows = match sqlx::query(
        r#"
        SELECT
            l.lote,
            l.product_code,
            COALESCE(p.descricao, l.product_code) AS description
        FROM erp_lotes_laudos l
        LEFT JOIN produtos p ON p.codigo = l.product_code
        WHERE l.lote ILIKE $1 OR l.product_code ILIKE $1 OR p.descricao ILIKE $1
        ORDER BY l.data_lote DESC NULLS LAST
        LIMIT 15
        "#,
    )
    .bind(&pattern)
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

    let mut out: Vec<ItemLookupOut> = rows
        .into_iter()
        .map(|r| ItemLookupOut {
            lote: r.get(0),
            product_code: r.get(1),
            description: r.get(2),
        })
        .collect();

    if out.is_empty() {
        let prod_rows = match sqlx::query(
            r#"
            SELECT codigo, COALESCE(descricao, codigo)
            FROM produtos
            WHERE codigo ILIKE $1 OR descricao ILIKE $1
            ORDER BY codigo
            LIMIT 15
            "#,
        )
        .bind(&pattern)
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
        out = prod_rows
            .into_iter()
            .map(|r| ItemLookupOut {
                lote: String::new(),
                product_code: r.get(0),
                description: r.get(1),
            })
            .collect();
    }

    Json(out).into_response()
}

fn foto_read_error(err: &impl std::error::Error) -> String {
    let detail = std::error::Error::source(err)
        .map(|e| e.to_string())
        .unwrap_or_default();
    let lower = detail.to_lowercase();
    if lower.contains("limit") || lower.contains("exceeded") {
        return "A foto é grande demais para o servidor. Tente de novo; o celular deve reduzir a imagem.".into();
    }
    if detail.is_empty() {
        "Não foi possível ler a foto enviada".into()
    } else {
        format!("Não foi possível ler a foto: {detail}")
    }
}

fn foto_mime(path: &str) -> &'static str {
    let lower = path.to_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".heic") || lower.ends_with(".heif") {
        "image/heic"
    } else {
        "image/jpeg"
    }
}

pub async fn upload_foto(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    if let Err(resp) = require_edit(&ctx) {
        return resp;
    }
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let exists: Option<i64> =
        match sqlx::query_scalar("SELECT id FROM qualidade_avarias WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
        {
            Ok(v) => v,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e.to_string() })),
                )
                    .into_response();
            }
        };
    if exists.is_none() {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Avaria não encontrada" })),
        )
            .into_response();
    }

    let mut filename = String::from("foto.jpg");
    let mut bytes: Option<Vec<u8>> = None;
    loop {
        let field = match multipart.next_field().await {
            Ok(Some(field)) => field,
            Ok(None) => break,
            Err(e) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": foto_read_error(&e) })),
                )
                    .into_response();
            }
        };
        if field.name() == Some("file") {
            if let Some(name) = field.file_name() {
                filename = name.to_string();
            }
            match field.bytes().await {
                Ok(b) => bytes = Some(b.to_vec()),
                Err(e) => {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({ "error": foto_read_error(&e) })),
                    )
                        .into_response();
                }
            }
        }
    }
    let Some(data) = bytes else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Arquivo não enviado" })),
        )
            .into_response();
    };
    if data.is_empty() || data.len() > 8 * 1024 * 1024 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "A foto precisa ter até 8 MB" })),
        )
            .into_response();
    }

    let ext = filename.rsplit('.').next().unwrap_or("jpg").to_lowercase();
    let ext = match ext.as_str() {
        "jpg" | "jpeg" | "png" | "webp" | "heic" | "heif" => ext,
        _ => "jpg".to_string(),
    };
    let rel = format!("avarias/{id}.{ext}");
    let abs = crate::core::app_config::saves_dir().join(&rel);
    if let Some(parent) = abs.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    }
    if let Err(e) = std::fs::write(&abs, &data) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = sqlx::query(
        "UPDATE qualidade_avarias SET foto_path = $1, updated_at = NOW() WHERE id = $2",
    )
    .bind(&rel)
    .bind(id)
    .execute(pool)
    .await
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    match load_one(pool, id).await {
        Ok(Some(row)) => Json(row).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Avaria não encontrada" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn get_foto(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    if let Err(resp) = require_module(&ctx) {
        return resp;
    }
    let pool = state.db.pool();
    let rel: Option<String> =
        match sqlx::query("SELECT foto_path FROM qualidade_avarias WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
        {
            Ok(Some(r)) => r.get(0),
            Ok(None) => None,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e.to_string() })),
                )
                    .into_response();
            }
        };
    let Some(rel) = rel.filter(|s| !s.trim().is_empty()) else {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Foto não encontrada" })),
        )
            .into_response();
    };
    let abs = crate::core::app_config::saves_dir().join(&rel);
    match std::fs::read(&abs) {
        Ok(bytes) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, foto_mime(&rel))
            .header(header::CACHE_CONTROL, "no-store")
            .body(Body::from(bytes))
            .unwrap_or_else(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": "Falha ao ler a foto" })),
                )
                    .into_response()
            }),
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Foto não encontrada" })),
        )
            .into_response(),
    }
}

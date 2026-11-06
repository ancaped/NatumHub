//! Campos de texto dos modelos de etiqueta (`{fornecedor}`, `{nota_fiscal}`...) preenchidos no Drawer do modelo.
//! Guarda o que já foi impresso em cada campo para sugerir de novo (igual no PC e no celular) e,
//! quando o campo existe no cadastro do sistema (ex.: fornecedor), sugere também os cadastrados.

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Extension, Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::MODULE_FERRAMENTAS_ETIQUETAS;

const MAX_VALOR: usize = 200;
const MAX_POR_PEDIDO: usize = 40;

#[derive(Serialize, Debug, PartialEq)]
pub struct Sugestao {
    pub valor: String,
    /// `historico` (já impresso) ou `sistema` (cadastro do Nexus).
    pub origem: &'static str,
}

#[derive(Deserialize)]
pub struct SugestoesQuery {
    pub campo: String,
    pub q: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Deserialize)]
pub struct ValorCampo {
    pub campo: String,
    pub valor: String,
}

#[derive(Deserialize)]
pub struct GravarValoresPayload {
    pub valores: Vec<ValorCampo>,
}

/// Nome do campo sem as chaves, em minúsculas. Vazio quando inválido.
fn normalizar_campo(campo: &str) -> String {
    let c = campo.trim().trim_matches(|ch| ch == '{' || ch == '}').to_lowercase();
    if !c.is_empty() && c.len() <= 64 && c.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '_') {
        c
    } else {
        String::new()
    }
}

/// Tabela e coluna do cadastro do sistema que alimentam as sugestões de um campo.
fn fonte_sistema(campo: &str) -> Option<(&'static str, &'static str)> {
    match campo {
        "fornecedor" | "supplier" => Some(("suppliers", "name")),
        "insumo_nome" | "insumo" => Some(("items", "description")),
        "codigo_ref" | "codigo_insumo" => Some(("items", "code")),
        _ => None,
    }
}

async fn ensure_table(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::raw_sql(
        r#"
        CREATE TABLE IF NOT EXISTS etiqueta_campo_valores (
            campo TEXT NOT NULL,
            valor TEXT NOT NULL,
            usos INT NOT NULL DEFAULT 1,
            ultimo_uso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (campo, valor)
        );
        CREATE INDEX IF NOT EXISTS idx_etiqueta_campo_valores_uso ON etiqueta_campo_valores(campo, ultimo_uso DESC);
        "#,
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Sugestões do campo: o que já foi impresso (mais recente primeiro) e depois o cadastro do sistema.
/// Com `q`, vale quem começa com o texto antes de quem apenas contém.
pub async fn sugerir(pool: &PgPool, campo: &str, q: &str, limit: i64) -> Result<Vec<Sugestao>, sqlx::Error> {
    ensure_table(pool).await?;
    let padrao = format!("%{}%", q.trim().replace('%', "").replace('_', "\\_"));
    let inicio = format!("{}%", q.trim().replace('%', "").replace('_', "\\_"));

    let historico: Vec<(String,)> = sqlx::query_as(
        r#"SELECT valor FROM etiqueta_campo_valores
           WHERE campo = $1 AND valor ILIKE $2
           ORDER BY (valor ILIKE $3) DESC, ultimo_uso DESC
           LIMIT $4"#,
    )
    .bind(campo)
    .bind(&padrao)
    .bind(&inicio)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    let mut saida: Vec<Sugestao> = historico.into_iter().map(|(valor,)| Sugestao { valor, origem: "historico" }).collect();

    if let Some((tabela, coluna)) = fonte_sistema(campo) {
        // tabela e coluna vêm de `fonte_sistema` (valores fixos), nunca do pedido.
        let sql = format!(
            "SELECT {coluna} FROM {tabela} WHERE {coluna} ILIKE $1 ORDER BY ({coluna} ILIKE $2) DESC, {coluna} ASC LIMIT $3"
        );
        let cadastro: Vec<(String,)> = sqlx::query_as(&sql).bind(&padrao).bind(&inicio).bind(limit).fetch_all(pool).await?;
        for (valor,) in cadastro {
            if !saida.iter().any(|s| s.valor.eq_ignore_ascii_case(&valor)) {
                saida.push(Sugestao { valor, origem: "sistema" });
            }
        }
    }

    saida.truncate(limit as usize);
    Ok(saida)
}

/// Guarda os valores impressos: soma o uso e atualiza a data do último uso.
pub async fn gravar(pool: &PgPool, valores: &[ValorCampo]) -> Result<usize, sqlx::Error> {
    ensure_table(pool).await?;
    let mut gravados = 0;
    for v in valores.iter().take(MAX_POR_PEDIDO) {
        let campo = normalizar_campo(&v.campo);
        let valor = v.valor.trim();
        if campo.is_empty() || valor.is_empty() || valor.chars().count() > MAX_VALOR {
            continue;
        }
        sqlx::query(
            r#"INSERT INTO etiqueta_campo_valores (campo, valor) VALUES ($1, $2)
               ON CONFLICT (campo, valor) DO UPDATE SET usos = etiqueta_campo_valores.usos + 1, ultimo_uso = NOW()"#,
        )
        .bind(&campo)
        .bind(valor)
        .execute(pool)
        .await?;
        gravados += 1;
    }
    Ok(gravados)
}

fn err(status: StatusCode, msg: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({ "error": msg.into() }))).into_response()
}

fn can_access(ctx: &AuthContext) -> bool {
    ctx.role.is_supervisor() || ctx.has_module(MODULE_FERRAMENTAS_ETIQUETAS) || !ctx.operator_id.is_empty()
}

pub async fn sugestoes_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(q): Query<SugestoesQuery>,
) -> impl IntoResponse {
    if !can_access(&ctx) {
        return err(StatusCode::FORBIDDEN, "Acesso não autorizado às etiquetas");
    }
    let campo = normalizar_campo(&q.campo);
    if campo.is_empty() {
        return err(StatusCode::BAD_REQUEST, "Campo inválido");
    }
    let limit = q.limit.unwrap_or(8).clamp(1, 30);
    match sugerir(state.db.pool(), &campo, q.q.as_deref().unwrap_or(""), limit).await {
        Ok(lista) => (StatusCode::OK, Json(lista)).into_response(),
        Err(e) => {
            eprintln!("[etiquetas] Erro ao buscar sugestões do campo {}: {:?}", campo, e);
            err(StatusCode::INTERNAL_SERVER_ERROR, "Erro ao buscar sugestões")
        }
    }
}

pub async fn gravar_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(payload): Json<GravarValoresPayload>,
) -> impl IntoResponse {
    if !can_access(&ctx) {
        return err(StatusCode::FORBIDDEN, "Acesso não autorizado às etiquetas");
    }
    match gravar(state.db.pool(), &payload.valores).await {
        Ok(n) => (StatusCode::OK, Json(json!({ "gravados": n }))).into_response(),
        Err(e) => {
            eprintln!("[etiquetas] Erro ao gravar valores dos campos: {:?}", e);
            err(StatusCode::INTERNAL_SERVER_ERROR, "Erro ao gravar valores")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normaliza_o_nome_do_campo() {
        assert_eq!(normalizar_campo("{Fornecedor}"), "fornecedor");
        assert_eq!(normalizar_campo(" nota_fiscal "), "nota_fiscal");
        assert_eq!(normalizar_campo("a b"), "");
        assert_eq!(normalizar_campo("{}"), "");
    }

    #[test]
    fn so_alguns_campos_tem_cadastro_do_sistema() {
        assert_eq!(fonte_sistema("fornecedor"), Some(("suppliers", "name")));
        assert_eq!(fonte_sistema("insumo_nome"), Some(("items", "description")));
        assert_eq!(fonte_sistema("nota_fiscal"), None);
    }
}

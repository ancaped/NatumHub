//! Restrição de leitura por módulo para operadores (supervisor liga/desliga; desligada por padrão).
//! Desligada: todo operador lê todas as telas e só grava onde tem "editar". Ligada: cada operador só lê os módulos marcados.
//! O estado fica no setting `restringir_leitura_operadores` e num `AtomicBool` (`store::restricao_leitura_ligada`).

use std::sync::Arc;

use axum::{
    extract::State,
    response::{IntoResponse, Response},
    routing::get,
    Extension, Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::PgPool;

use super::models::AuthContext;
use super::store::{definir_restricao_leitura, restricao_leitura_ligada, SETTING_RESTRINGIR_LEITURA};
use crate::core::acao::{executar_em_2_passos, ErroApi, RespostaAcao};
use crate::handlers::AppState;
use crate::modules::geral::audit;

const MODULO_AUDITORIA: &str = "hub_settings";

#[derive(Debug, Deserialize)]
pub struct AlterarRestricao {
    pub ligada: bool,
    #[serde(default)]
    pub confirmar: bool,
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/admin/permissoes/restricao-leitura", get(estado_rota).post(alterar_rota))
}

/// Operadores humanos ativos, não supervisores, com a quantidade de módulos de cada um.
async fn operadores_afetados(pool: &PgPool) -> Result<Vec<Value>, ErroApi> {
    let linhas: Vec<(String, i64)> = sqlx::query_as(
        "SELECT o.display_name, COUNT(m.module_key) FROM hub_operators o \
         LEFT JOIN hub_operator_modules m ON m.operator_id = o.id \
         WHERE o.active = 1 AND o.role NOT IN ('supervisor', 'admin') \
           AND COALESCE(to_jsonb(o) ->> 'kind', 'humano') <> 'agente' \
         GROUP BY o.id, o.display_name ORDER BY LOWER(o.display_name)",
    )
    .fetch_all(pool)
    .await?;
    Ok(linhas.into_iter().map(|(nome, modulos)| json!({ "nome": nome, "modulos": modulos })).collect())
}

pub async fn alterar(pool: &PgPool, autor: &AuthContext, entrada: AlterarRestricao) -> Result<RespostaAcao<Value>, ErroApi> {
    let antes = restricao_leitura_ligada();
    let nova = entrada.ligada;
    let operadores = operadores_afetados(pool).await?;
    let sem_modulo = operadores.iter().filter(|o| o["modulos"] == 0).count();
    let resposta = executar_em_2_passos(pool, "alterar_restricao_leitura", entrada.confirmar, move |tx| {
        Box::pin(async move {
            sqlx::query(
                "INSERT INTO settings (key, value) VALUES ($1, $2) \
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            )
            .bind(SETTING_RESTRINGIR_LEITURA)
            .bind(if nova { "true" } else { "false" })
            .execute(&mut **tx)
            .await?;
            Ok(json!({
                "de": antes,
                "para": nova,
                "operadoresAtivos": operadores.len(),
                "operadoresSemModulo": sem_modulo,
                "operadores": operadores,
            }))
        })
    })
    .await?;
    if entrada.confirmar {
        definir_restricao_leitura(nova);
        audit::record_domain(
            pool,
            Some(autor),
            MODULO_AUDITORIA,
            "alterar_restricao_leitura",
            "configuracao",
            SETTING_RESTRINGIR_LEITURA,
            "Restrição de leitura por módulo alterada",
            Some(json!({ "ligada": antes })),
            Some(json!({ "ligada": nova })),
        )
        .await;
    }
    Ok(resposta)
}

/// O middleware já barra quem não é supervisor; repetido aqui para a regra não depender só da lista de caminhos.
fn exigir_supervisor(ctx: &AuthContext) -> Result<(), ErroApi> {
    if ctx.role.is_supervisor() && !ctx.is_agente() {
        Ok(())
    } else {
        Err(ErroApi::novo(axum::http::StatusCode::FORBIDDEN, "apenas_supervisor", "Apenas o supervisor altera permissões."))
    }
}

async fn estado_rota(Extension(ctx): Extension<AuthContext>) -> Response {
    if let Err(e) = exigir_supervisor(&ctx) {
        return e.into_response();
    }
    Json(json!({ "ligada": restricao_leitura_ligada() })).into_response()
}

async fn alterar_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(entrada): Json<AlterarRestricao>,
) -> Response {
    if let Err(e) = exigir_supervisor(&ctx) {
        return e.into_response();
    }
    match alterar(state.db.pool(), &ctx, entrada).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

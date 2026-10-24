//! Configuração dos reatores (capacidade, ordem, ativo) usada pelo Planejamento de Produção.

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Extension, Json, Router,
};
use serde_json::json;
use sqlx::Row;
use std::sync::Arc;

use crate::core::acao::ErroApi;
use crate::core::catalogo::Acao;
use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::producao::{auditoria, permissao};

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/producao/reatores", get(list_reatores).put(save_reatores))
}

/// Ações dos reatores descritas para agentes (ver `core::catalogo`). A gravação da configuração fica de fora.
pub fn acoes() -> Vec<Acao> {
    vec![Acao::leitura(
        "listar_reatores",
        permissao::MODULO_PLANEJAMENTO,
        "Lista os reatores com capacidade em kg, tipo, ordem e se estão ativos.",
        "/api/producao/reatores",
        vec![],
    )]
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct ReatorConfigDto {
    pub id: String,
    pub nome: String,
    pub capacidade_kg: f64,
    pub tipo: String,
    pub ordem: i32,
    pub ativo: bool,
}

pub async fn list_reatores(State(state): State<Arc<AppState>>) -> Response {
    let pool = state.db.pool();
    let query = "SELECT id, nome, capacidade_kg::float8, tipo, ordem, ativo FROM producao_reatores_config ORDER BY ordem ASC, capacidade_kg ASC";
    match sqlx::query(query).fetch_all(pool).await {
        Ok(rows) => {
            let reatores: Vec<ReatorConfigDto> = rows
                .into_iter()
                .map(|r| ReatorConfigDto {
                    id: r.get(0),
                    nome: r.get(1),
                    capacidade_kg: r.get(2),
                    tipo: r.get(3),
                    ordem: r.get(4),
                    ativo: r.get(5),
                })
                .collect();
            (StatusCode::OK, Json(json!(reatores))).into_response()
        }
        Err(e) => ErroApi::interno(e.to_string()).into_response(),
    }
}

/// Valida os reatores recebidos (sem tocar no banco).
fn validar_reatores(reatores: &[ReatorConfigDto]) -> Result<(), ErroApi> {
    for reator in reatores {
        if reator.id.trim().is_empty() || reator.nome.trim().is_empty() {
            return Err(ErroApi::regra("Reator sem identificador ou nome."));
        }
        if !reator.capacidade_kg.is_finite() || reator.capacidade_kg <= 0.0 {
            return Err(ErroApi::regra(format!(
                "A capacidade do reator {} precisa ser maior que zero.",
                reator.nome
            )));
        }
    }
    Ok(())
}

/// Grava todos os reatores numa transação (upsert por id).
async fn gravar_reatores(pool: &sqlx::PgPool, reatores: &[ReatorConfigDto]) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    for reator in reatores {
        let q = r#"
            INSERT INTO producao_reatores_config (id, nome, capacidade_kg, tipo, ordem, ativo)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET
                nome = EXCLUDED.nome,
                capacidade_kg = EXCLUDED.capacidade_kg,
                tipo = EXCLUDED.tipo,
                ordem = EXCLUDED.ordem,
                ativo = EXCLUDED.ativo
        "#;
        sqlx::query(q)
            .bind(&reator.id)
            .bind(&reator.nome)
            .bind(reator.capacidade_kg)
            .bind(&reator.tipo)
            .bind(reator.ordem)
            .bind(reator.ativo)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await
}

pub async fn save_reatores(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(payload): Json<Vec<ReatorConfigDto>>,
) -> Response {
    if let Err(r) = permissao::exigir_edicao(&ctx) {
        return r;
    }
    if let Err(e) = validar_reatores(&payload) {
        return e.into_response();
    }
    if let Err(e) = gravar_reatores(state.db.pool(), &payload).await {
        return ErroApi::interno(e.to_string()).into_response();
    }
    auditoria::registrar(state.db.pool(), &ctx.display_name, "salvar_reatores", "reatores", json!({ "reatores": payload.iter().map(|r| json!({ "id": r.id, "capacidadeKg": r.capacidade_kg, "ativo": r.ativo })).collect::<Vec<_>>() })).await;
    (StatusCode::OK, Json(json!({ "ok": true }))).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reator(id: &str, nome: &str, cap: f64) -> ReatorConfigDto {
        ReatorConfigDto { id: id.into(), nome: nome.into(), capacidade_kg: cap, tipo: "reator".into(), ordem: 1, ativo: true }
    }

    #[test]
    fn rejeita_reator_sem_nome_ou_capacidade() {
        assert_eq!(validar_reatores(&[reator("R1", "", 100.0)]).unwrap_err().codigo, "regra_violada");
        assert!(validar_reatores(&[reator("R1", "Reator 1", 0.0)]).is_err());
        assert!(validar_reatores(&[reator("R1", "Reator 1", 100.0)]).is_ok());
    }
}

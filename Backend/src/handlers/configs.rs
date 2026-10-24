use axum::{
    extract::{State, Path},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use serde_json::json;

use crate::handlers::AppState;
use crate::models::{BulkOverrideRequest, LineConfig, ProductOverride};


// 1. GET /api/configs
pub async fn get_configs(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_line_configs().await {
        Ok(configs) => (StatusCode::OK, Json(configs)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar configurações: {}", e) })),
        ).into_response(),
    }
}

// 2. PUT /api/configs
pub async fn update_config(
    State(state): State<Arc<AppState>>,
    Json(config): Json<LineConfig>,
) -> impl IntoResponse {
    match state.db.update_line_config(&config).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao salvar configuração: {}", e) })),
        ).into_response(),
    }
}

// 2b. DELETE /api/configs/:prefix
pub async fn delete_config(
    State(state): State<Arc<AppState>>,
    Path(prefix): Path<String>,
) -> impl IntoResponse {
    if prefix == "DEFAULT" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "A linha DEFAULT não pode ser excluída" })),
        ).into_response();
    }
    match state.db.delete_line_config(&prefix).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao excluir linha: {}", e) })),
        ).into_response(),
    }
}

// 2c. GET /api/overrides
pub async fn get_overrides(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_all_overrides().await {
        Ok(overrides) => (StatusCode::OK, Json(overrides)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar overrides: {}", e) })),
        ).into_response(),
    }
}

/// Valida e normaliza as regras PCP por produto (vazio vira None).
pub fn validar_regras_pcp(ovr: &mut ProductOverride) -> Result<(), String> {
    if let Some(p) = ovr.processo_termico.as_ref() {
        let p = p.trim().to_lowercase();
        ovr.processo_termico = match p.as_str() {
            "" => None,
            "quente" | "frio" => Some(p),
            _ => return Err("processo_termico deve ser 'quente', 'frio' ou vazio".to_string()),
        };
    }
    if ovr.dias_ate_envase.map(|n| n < 0).unwrap_or(false) {
        return Err("dias_ate_envase não pode ser negativo".to_string());
    }
    if ovr
        .producao_minima_kg
        .map(|n| n < 0.0 || !n.is_finite())
        .unwrap_or(false)
    {
        return Err("producao_minima_kg não pode ser negativa".to_string());
    }
    Ok(())
}

// 3. POST /api/overrides
pub async fn save_override(
    State(state): State<Arc<AppState>>,
    Json(corpo): Json<serde_json::Value>,
) -> impl IntoResponse {
    let mut ovr: ProductOverride = match serde_json::from_value(corpo.clone()) {
        Ok(o) => o,
        Err(e) => {
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(json!({ "error": format!("Payload inválido: {}", e) })),
            )
                .into_response();
        }
    };
    ovr.regras_pcp_enviadas = [
        "processo_termico",
        "exclusivo_no_dia",
        "permite_bombona",
        "dias_ate_envase",
        "producao_minima_kg",
    ]
    .iter()
    .any(|k| corpo.get(*k).is_some());
    if let Err(e) = validar_regras_pcp(&mut ovr) {
        return (StatusCode::UNPROCESSABLE_ENTITY, Json(json!({ "error": e }))).into_response();
    }
    match state.db.save_override(&ovr).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao salvar override: {}", e) })),
        ).into_response(),
    }
}

// 3b. POST /api/overrides/bulk
pub async fn save_override_bulk(
    State(state): State<Arc<AppState>>,
    Json(req): Json<BulkOverrideRequest>,
) -> impl IntoResponse {
    match state.db.save_override_bulk(&req).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao salvar overrides em lote: {}", e) })),
        ).into_response(),
    }
}

// GET /api/lancamento/graduation-check
pub async fn get_graduation_candidates_handler(
    axum::extract::State(state): axum::extract::State<std::sync::Arc<AppState>>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let global_limit: i64 = match state.db.get_setting("lancamento_meta_meses_global").await {
        Ok(Some(val)) => val.parse().unwrap_or(6),
        _ => 6,
    };

    let rows = match sqlx::query(
        "SELECT op.codigo, p.descricao, cl.nome_linha, op.lancamento_meta_meses, op.lancamento_data_inicio
         FROM overrides_produtos op
         JOIN produtos p ON op.codigo = p.codigo
         LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
         WHERE op.status_produto = 'lancamento'",
    )
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("Erro ao buscar candidatos: {}", e) })),
            )
                .into_response();
        }
    };

    let mut candidates = Vec::new();

    for row in rows {
        use sqlx::Row;
        let code: String = row.get(0);
        let desc: String = row.get(1);
        let line_name: Option<String> = row.get(2);
        let meta: Option<i64> = crate::core::pg_row::pg_opt_i64(&row, 3);
        let date_start: Option<String> = row.get(4);

        let limit = meta.unwrap_or(global_limit);
        let months_with_sales: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM historico_faturamento WHERE codigo = $1 AND quantidade > 0",
        )
        .bind(&code)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        if months_with_sales >= limit {
            candidates.push(serde_json::json!({
                "codigo": code,
                "descricao": desc,
                "nome_linha": line_name.unwrap_or_else(|| "Geral".to_string()),
                "meses_com_historico": months_with_sales,
                "meta_meses": limit,
                "lancamento_data_inicio": date_start,
            }));
        }
    }

    (StatusCode::OK, Json(candidates)).into_response()
}

#[cfg(test)]
mod testes_regras_pcp {
    use super::*;
    use crate::core::db::Db;

    fn base(codigo: &str) -> ProductOverride {
        serde_json::from_value(json!({ "codigo": codigo })).unwrap()
    }

    #[test]
    fn valida_regras_pcp() {
        let mut o = base("X");
        o.processo_termico = Some(" Quente ".into());
        assert!(validar_regras_pcp(&mut o).is_ok());
        assert_eq!(o.processo_termico.as_deref(), Some("quente"));
        o.processo_termico = Some("  ".into());
        assert!(validar_regras_pcp(&mut o).is_ok());
        assert_eq!(o.processo_termico, None);
        o.processo_termico = Some("morno".into());
        assert!(validar_regras_pcp(&mut o).is_err());
        let mut o = base("X");
        o.dias_ate_envase = Some(-1);
        assert!(validar_regras_pcp(&mut o).is_err());
        let mut o = base("X");
        o.producao_minima_kg = Some(-0.5);
        assert!(validar_regras_pcp(&mut o).is_err());
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn grava_e_le_regras_pcp() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = sqlx::PgPool::connect(&url).await.unwrap();
        let db = Db::new(pool.clone());
        let cod = "ZZPCP6";
        sqlx::query("DELETE FROM overrides_produtos WHERE codigo = $1").bind(cod).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM produtos WHERE codigo = $1").bind(cod).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO config_linhas (linha_prefix, nome_linha) VALUES ('ZZPCP', 'teste') ON CONFLICT DO NOTHING").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO produtos (codigo, descricao, linha_prefix, media_levantamento) VALUES ($1, 'teste', 'ZZPCP', 0)")
            .bind(cod).execute(&pool).await.unwrap();

        // grava as 5 regras
        let mut o = base(cod);
        o.processo_termico = Some("frio".into());
        o.exclusivo_no_dia = Some(true);
        o.permite_bombona = Some(false);
        o.dias_ate_envase = Some(2);
        o.producao_minima_kg = Some(150.5);
        o.regras_pcp_enviadas = true;
        db.save_override(&o).await.unwrap();
        let lido = db.get_override(cod).await.unwrap().unwrap();
        assert_eq!(lido.processo_termico.as_deref(), Some("frio"));
        assert_eq!(lido.exclusivo_no_dia, Some(true));
        assert_eq!(lido.permite_bombona, Some(false));
        assert_eq!(lido.dias_ate_envase, Some(2));
        assert_eq!(lido.producao_minima_kg, Some(150.5));

        // payload sem as regras (outra tela): preserva
        let mut o2 = base(cod);
        o2.observacao = Some("obs".into());
        db.save_override(&o2).await.unwrap();
        let lido = db.get_override(cod).await.unwrap().unwrap();
        assert_eq!(lido.processo_termico.as_deref(), Some("frio"));
        assert_eq!(lido.dias_ate_envase, Some(2));
        // payload vazio sem as regras também não apaga a linha
        db.save_override(&base(cod)).await.unwrap();
        assert!(db.get_override(cod).await.unwrap().is_some());

        // payload com as regras nulas: limpa; e a linha some por estar vazia
        let mut o3 = base(cod);
        o3.regras_pcp_enviadas = true;
        db.save_override(&o3).await.unwrap();
        assert!(db.get_override(cod).await.unwrap().is_none());

        sqlx::query("DELETE FROM overrides_produtos WHERE codigo = $1").bind(cod).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM produtos WHERE codigo = $1").bind(cod).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM config_linhas WHERE linha_prefix = 'ZZPCP'").execute(&pool).await.unwrap();
    }
}

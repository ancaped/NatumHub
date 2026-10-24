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
    if let Some(obj) = corpo.as_object() {
        ovr.campos_enviados = obj.keys().filter(|k| k.as_str() != "codigo").cloned().collect();
    }
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
    if !crate::core::db::Db::ACOES_BULK.contains(&req.action.as_str()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("Ação em lote desconhecida: {}", req.action) })),
        )
            .into_response();
    }
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

    /// Monta o override como a rota faz: as chaves do corpo viram `campos_enviados`.
    fn do_corpo(corpo: serde_json::Value) -> ProductOverride {
        let mut o: ProductOverride = serde_json::from_value(corpo.clone()).unwrap();
        o.campos_enviados = corpo
            .as_object()
            .unwrap()
            .keys()
            .filter(|k| k.as_str() != "codigo")
            .cloned()
            .collect();
        o
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

        // grava as 5 regras + produção programada + categoria/status
        let o = do_corpo(json!({
            "codigo": cod,
            "processo_termico": "frio",
            "exclusivo_no_dia": true,
            "permite_bombona": false,
            "dias_ate_envase": 2,
            "producao_minima_kg": 150.5,
            "is_producao_programada": 1,
            "producao_programada_disparo": 10,
            "producao_programada_objetivo": 50,
            "categoria_produto": "cat-x",
            "status_produto": "lancamento",
        }));
        db.save_override(&o).await.unwrap();
        let lido = db.get_override(cod).await.unwrap().unwrap();
        assert_eq!(lido.processo_termico.as_deref(), Some("frio"));
        assert_eq!(lido.exclusivo_no_dia, Some(true));
        assert_eq!(lido.permite_bombona, Some(false));
        assert_eq!(lido.dias_ate_envase, Some(2));
        assert_eq!(lido.producao_minima_kg, Some(150.5));

        // salvar só o status (como o painel): preserva regras PCP e produção programada
        db.save_override(&do_corpo(json!({ "codigo": cod, "status_produto": "ativo" }))).await.unwrap();
        let lido = db.get_override(cod).await.unwrap().unwrap();
        assert_eq!(lido.status_produto.as_deref(), Some("ativo"));
        assert_eq!(lido.categoria_produto.as_deref(), Some("cat-x"));
        assert_eq!(lido.processo_termico.as_deref(), Some("frio"));
        assert_eq!(lido.dias_ate_envase, Some(2));
        assert_eq!(lido.is_producao_programada, Some(1));
        assert_eq!(lido.producao_programada_disparo, Some(10));
        assert_eq!(lido.producao_programada_objetivo, Some(50));

        // payload sem chaves não apaga nada
        db.save_override(&base(cod)).await.unwrap();
        assert!(db.get_override(cod).await.unwrap().is_some());

        // categoria_produto: null limpa a categoria e só ela
        db.save_override(&do_corpo(json!({ "codigo": cod, "categoria_produto": null }))).await.unwrap();
        let lido = db.get_override(cod).await.unwrap().unwrap();
        assert_eq!(lido.categoria_produto, None);
        assert_eq!(lido.status_produto.as_deref(), Some("ativo"));
        assert_eq!(lido.is_producao_programada, Some(1));

        // base_codigo: presente limpa/grava em produtos; ausente não mexe
        db.save_override(&do_corpo(json!({ "codigo": cod, "base_codigo": "B1" }))).await.unwrap();
        let bc = || async { sqlx::query_scalar::<_, Option<String>>("SELECT base_codigo FROM produtos WHERE codigo = $1").bind(cod).fetch_one(&pool).await.unwrap() };
        assert_eq!(bc().await.as_deref(), Some("B1"));
        db.save_override(&do_corpo(json!({ "codigo": cod, "observacao": "x" }))).await.unwrap();
        assert_eq!(bc().await.as_deref(), Some("B1"));
        db.save_override(&do_corpo(json!({ "codigo": cod, "base_codigo": null }))).await.unwrap();
        assert_eq!(bc().await, None);

        // limpar (lote): zera ajustes manuais, mantém PCP e programada, linha não some
        db.save_override(&do_corpo(json!({ "codigo": cod, "status_produto": "descontinuado", "media_manual": 3.0, "visivel": 0 }))).await.unwrap();
        let req = |action: &str| crate::models::BulkOverrideRequest { codigos: vec![cod.to_string()], action: action.into(), value_str: None };
        db.save_override_bulk(&req("clear")).await.unwrap();
        let lido = db.get_override(cod).await.unwrap().unwrap();
        assert_eq!(lido.status_produto, None);
        assert_eq!(lido.media_manual, None);
        assert_eq!(lido.visivel, None);
        assert_eq!(lido.observacao, None);
        assert_eq!(lido.processo_termico.as_deref(), Some("frio"));
        assert_eq!(lido.is_producao_programada, Some(1));
        assert_eq!(lido.producao_programada_objetivo, Some(50));
        assert!(db.save_override_bulk(&req("acao_inexistente")).await.is_err());

        // com as regras PCP e a programada limpas (chaves null), a linha some por estar vazia
        let o3 = do_corpo(json!({
            "codigo": cod,
            "processo_termico": null, "exclusivo_no_dia": null, "permite_bombona": null,
            "dias_ate_envase": null, "producao_minima_kg": null,
            "is_producao_programada": 0, "producao_programada_disparo": null, "producao_programada_objetivo": null,
        }));
        db.save_override(&o3).await.unwrap();
        assert!(db.get_override(cod).await.unwrap().is_none());

        sqlx::query("DELETE FROM overrides_produtos WHERE codigo = $1").bind(cod).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM produtos WHERE codigo = $1").bind(cod).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM config_linhas WHERE linha_prefix = 'ZZPCP'").execute(&pool).await.unwrap();
    }
}

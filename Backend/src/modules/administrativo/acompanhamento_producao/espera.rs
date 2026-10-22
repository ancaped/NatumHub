//! Tirar a marca "Em Espera" que sobrou num lote (ex.: já produzido, mas com `motivo_espera` e `data_em_espera`
//! ainda gravados). Serviço em 2 passos: sem `confirmar=true` só mostra a prévia (nada é gravado); com ele grava,
//! registra no histórico do lote e na auditoria. Não muda o status do lote nem as datas das etapas.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Extension, Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::producao::auditoria;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviaEspera {
    pub previa: bool,
    pub acao: &'static str,
    pub lote: String,
    pub status_do_lote: String,
    pub motivo_espera: Option<String>,
    pub data_em_espera: Option<String>,
    /// Etapas (pesagem, producao, rotulagem, envase) que têm marca de espera própria.
    pub etapas_afetadas: Vec<String>,
    /// Há algo para limpar? (false = o lote já está limpo)
    pub tem_o_que_limpar: bool,
    pub confirmar: &'static str,
}

#[derive(Debug, Deserialize)]
pub struct CorpoEspera {
    /// Sem `true` só devolve a prévia.
    #[serde(default)]
    pub confirmar: bool,
}

/// Remove das etapas a marca de espera: a etapa que estava com status "Em Espera" volta a ser derivada (a chave sai);
/// nas demais só os campos de motivo/insumo faltante são zerados. Devolve as etapas que mudaram.
pub fn limpar_etapas(etapas: &Value) -> (Value, Vec<String>) {
    let Some(obj) = etapas.as_object() else { return (etapas.clone(), Vec::new()) };
    let mut novo = serde_json::Map::new();
    let mut afetadas = Vec::new();
    for (etapa, entrada) in obj {
        let Some(e) = entrada.as_object() else {
            novo.insert(etapa.clone(), entrada.clone());
            continue;
        };
        let em_espera = e.get("status").and_then(Value::as_str) == Some("Em Espera");
        let tem_marca = ["motivoEspera", "insumoFaltanteCodigo", "insumoFaltanteDescricao"]
            .iter()
            .any(|k| e.get(*k).map(|v| !v.is_null() && v.as_str() != Some("")).unwrap_or(false));
        if em_espera {
            afetadas.push(etapa.clone());
            continue; // some: a etapa volta ao estado derivado
        }
        if tem_marca {
            afetadas.push(etapa.clone());
            let mut c = e.clone();
            for k in ["motivoEspera", "insumoFaltanteCodigo", "insumoFaltanteDescricao"] {
                c.insert(k.to_string(), Value::Null);
            }
            novo.insert(etapa.clone(), Value::Object(c));
        } else {
            novo.insert(etapa.clone(), entrada.clone());
        }
    }
    (Value::Object(novo), afetadas)
}

struct Estado {
    status: String,
    motivo: Option<String>,
    desde: Option<String>,
    etapas: Value,
}

async fn ler(pool: &PgPool, lote: &str) -> Result<Estado, (StatusCode, String)> {
    let r = sqlx::query(
        "SELECT custom_status, motivo_espera, \
                to_char(data_em_espera AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS desde, \
                COALESCE(etapas_status, '{}'::jsonb) AS etapas \
         FROM lote_custom_status WHERE lote_number = $1",
    )
    .bind(lote)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao ler o lote: {e}")))?
    .ok_or((StatusCode::NOT_FOUND, format!("O lote {lote} não tem status gravado.")))?;
    Ok(Estado {
        status: r.get::<String, _>("custom_status"),
        motivo: r.get::<Option<String>, _>("motivo_espera").filter(|m| !m.trim().is_empty()),
        desde: r.get::<Option<String>, _>("desde"),
        etapas: r.get::<Value, _>("etapas"),
    })
}

pub async fn previa(pool: &PgPool, lote: &str) -> Result<PreviaEspera, (StatusCode, String)> {
    let e = ler(pool, lote).await?;
    let (_, afetadas) = limpar_etapas(&e.etapas);
    Ok(PreviaEspera {
        previa: true,
        acao: "tirar_em_espera",
        lote: lote.to_string(),
        tem_o_que_limpar: e.motivo.is_some() || e.desde.is_some() || !afetadas.is_empty(),
        status_do_lote: e.status,
        motivo_espera: e.motivo,
        data_em_espera: e.desde,
        etapas_afetadas: afetadas,
        confirmar: "repita com confirmar=true para gravar",
    })
}

pub async fn limpar(pool: &PgPool, lote: &str, usuario: &str) -> Result<(), (StatusCode, String)> {
    let e = ler(pool, lote).await?;
    if e.status == "Em Espera" {
        return Err((
            StatusCode::CONFLICT,
            "O lote está com o status \"Em Espera\". Escolha o status correto dele no Quadro de Ordens.".into(),
        ));
    }
    let (etapas, afetadas) = limpar_etapas(&e.etapas);
    let mut tx = pool.begin().await.map_err(|er| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao iniciar: {er}")))?;
    sqlx::query(
        "UPDATE lote_custom_status SET motivo_espera = NULL, data_em_espera = NULL, etapas_status = $2, \
                updated_by = $3, updated_at = NOW() WHERE lote_number = $1",
    )
    .bind(lote)
    .bind(&etapas)
    .bind(usuario)
    .execute(&mut *tx)
    .await
    .map_err(|er| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao gravar: {er}")))?;
    sqlx::query(
        "INSERT INTO lote_status_history (lote_number, status, category, changed_by, notes) \
         SELECT lote_number, custom_status, category, $2, $3 FROM lote_custom_status WHERE lote_number = $1",
    )
    .bind(lote)
    .bind(usuario)
    .bind(format!("Marca de Em Espera removida{}", e.motivo.as_deref().map(|m| format!(" (era: {m})")).unwrap_or_default()))
    .execute(&mut *tx)
    .await
    .map_err(|er| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao registrar o histórico: {er}")))?;
    tx.commit().await.map_err(|er| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao confirmar: {er}")))?;
    auditoria::registrar(
        pool,
        usuario,
        "tirar_em_espera",
        lote,
        json!({ "motivo": e.motivo, "desde": e.desde, "etapas": afetadas, "status": e.status }),
    )
    .await;
    Ok(())
}

pub async fn limpar_espera_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(lote): Path<String>,
    Json(c): Json<CorpoEspera>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let lote = lote.trim().to_string();
    if !c.confirmar {
        return match previa(pool, &lote).await {
            Ok(p) => (StatusCode::OK, Json(p)).into_response(),
            Err((s, m)) => (s, Json(json!({ "error": m }))).into_response(),
        };
    }
    match limpar(pool, &lote, &ctx.display_name).await {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err((s, m)) => (s, Json(json!({ "error": m }))).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limpa_a_marca_de_espera_das_etapas() {
        let etapas = json!({
            "pesagem": { "status": "Em Espera", "motivoEspera": "Falta de insumo", "updatedBy": "X" },
            "producao": { "status": "concluido", "motivoEspera": null, "insumoFaltanteCodigo": null },
            "rotulagem": { "status": "ativo", "motivoEspera": "Aguardando tampa", "insumoFaltanteCodigo": "9.1" },
            "envase": "texto solto"
        });
        let (novo, afetadas) = limpar_etapas(&etapas);
        let mut a = afetadas.clone();
        a.sort();
        assert_eq!(a, vec!["pesagem", "rotulagem"]);
        assert!(novo.get("pesagem").is_none(), "a etapa que estava Em Espera volta a ser derivada");
        assert_eq!(novo["rotulagem"]["status"], "ativo", "o status da etapa não muda");
        assert!(novo["rotulagem"]["motivoEspera"].is_null() && novo["rotulagem"]["insumoFaltanteCodigo"].is_null());
        assert_eq!(novo["producao"], etapas["producao"], "etapa sem marca fica igual");
        assert_eq!(novo["envase"], "texto solto");
    }

    #[test]
    fn etapas_limpas_nao_mudam() {
        let (novo, afetadas) = limpar_etapas(&json!({}));
        assert!(afetadas.is_empty());
        assert_eq!(novo, json!({}));
        assert!(limpar_etapas(&json!(null)).1.is_empty());
    }

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn previa_e_limpeza_no_banco() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        // mesma forma das tabelas de produção (o banco de teste novo ainda não as tem)
        for ddl in [
            "CREATE TABLE IF NOT EXISTS lote_custom_status (lote_number TEXT PRIMARY KEY, custom_status TEXT NOT NULL, category TEXT, \
             updated_by TEXT, updated_at TIMESTAMPTZ DEFAULT NOW(), notes TEXT, data_producao TIMESTAMPTZ, data_em_espera TIMESTAMPTZ, \
             motivo_espera TEXT, etapas_status JSONB DEFAULT '{}'::jsonb)",
            "CREATE TABLE IF NOT EXISTS lote_status_history (id BIGSERIAL PRIMARY KEY, lote_number TEXT NOT NULL, status TEXT, category TEXT, \
             changed_by TEXT, changed_at TIMESTAMPTZ DEFAULT NOW(), notes TEXT)",
        ] {
            sqlx::query(ddl).execute(&pool).await.unwrap();
        }
        for l in ["TST-ESP-1", "TST-ESP-2"] {
            sqlx::query("DELETE FROM lote_custom_status WHERE lote_number = $1").bind(l).execute(&pool).await.unwrap();
        }
        sqlx::query(
            "INSERT INTO lote_custom_status (lote_number, custom_status, motivo_espera, data_em_espera, etapas_status, data_producao) \
             VALUES ('TST-ESP-1', 'Produzido', 'Ajuste / Correção', NOW(), '{\"producao\":{\"status\":\"concluido\",\"motivoEspera\":\"x\"}}'::jsonb, NOW())",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO lote_custom_status (lote_number, custom_status) VALUES ('TST-ESP-2', 'Em Espera')").execute(&pool).await.unwrap();

        let p = previa(&pool, "TST-ESP-1").await.unwrap();
        assert!(p.previa && p.tem_o_que_limpar);
        assert_eq!(p.motivo_espera.as_deref(), Some("Ajuste / Correção"));
        assert_eq!(p.etapas_afetadas, vec!["producao"]);
        let ainda: Option<String> = sqlx::query_scalar("SELECT motivo_espera FROM lote_custom_status WHERE lote_number = 'TST-ESP-1'").fetch_one(&pool).await.unwrap();
        assert!(ainda.is_some(), "a prévia não grava");

        limpar(&pool, "TST-ESP-1", "teste").await.unwrap();
        let r = sqlx::query("SELECT custom_status, motivo_espera, data_em_espera, data_producao, etapas_status FROM lote_custom_status WHERE lote_number = 'TST-ESP-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(r.get::<String, _>("custom_status"), "Produzido", "o status do lote não muda");
        assert!(r.get::<Option<String>, _>("motivo_espera").is_none());
        assert!(r.get::<Option<chrono::DateTime<chrono::Utc>>, _>("data_em_espera").is_none());
        assert!(r.get::<Option<chrono::DateTime<chrono::Utc>>, _>("data_producao").is_some(), "datas das etapas ficam");
        assert!(r.get::<Value, _>("etapas_status")["producao"]["motivoEspera"].is_null());
        assert!(!previa(&pool, "TST-ESP-1").await.unwrap().tem_o_que_limpar, "idempotente");

        // lote cujo STATUS é Em Espera: não limpa sozinho
        assert_eq!(limpar(&pool, "TST-ESP-2", "teste").await.unwrap_err().0, StatusCode::CONFLICT);
        assert_eq!(previa(&pool, "NAO-EXISTE").await.unwrap_err().0, StatusCode::NOT_FOUND);
        for l in ["TST-ESP-1", "TST-ESP-2"] {
            sqlx::query("DELETE FROM lote_custom_status WHERE lote_number = $1").bind(l).execute(&pool).await.unwrap();
            sqlx::query("DELETE FROM lote_status_history WHERE lote_number = $1").bind(l).execute(&pool).await.unwrap();
        }
    }
}

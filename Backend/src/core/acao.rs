//! Peças comuns das ações do Nexus, usadas pela tela e por agentes de IA.
//!
//! - `ErroApi`: erro com código estável (`{ "erro": { codigo, mensagem, detalhes } }`), para quem chama decidir
//!   pelo código e não pelo texto. Mantém também `"error": <mensagem>`, que a tela já lê.
//! - `executar_em_2_passos`: escrita em 2 passos. Sem `confirmar` roda a mesma gravação numa transação e desfaz
//!   (a prévia é exatamente o que seria gravado); com `confirmar` grava.

use std::fmt;

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{PgPool, Postgres, Transaction};

#[derive(Debug)]
pub struct ErroApi {
    pub status: StatusCode,
    pub codigo: &'static str,
    pub mensagem: String,
    pub detalhes: Option<Value>,
}

impl ErroApi {
    pub fn novo(status: StatusCode, codigo: &'static str, mensagem: impl Into<String>) -> Self {
        Self { status, codigo, mensagem: mensagem.into(), detalhes: None }
    }

    pub fn com_detalhes(mut self, detalhes: Value) -> Self {
        self.detalhes = Some(detalhes);
        self
    }

    pub fn invalido(mensagem: impl Into<String>) -> Self {
        Self::novo(StatusCode::BAD_REQUEST, "invalido", mensagem)
    }

    pub fn nao_autenticado(mensagem: impl Into<String>) -> Self {
        Self::novo(StatusCode::UNAUTHORIZED, "nao_autenticado", mensagem)
    }

    pub fn sem_permissao(mensagem: impl Into<String>) -> Self {
        Self::novo(StatusCode::FORBIDDEN, "sem_permissao", mensagem)
    }

    pub fn nao_encontrado(mensagem: impl Into<String>) -> Self {
        Self::novo(StatusCode::NOT_FOUND, "nao_encontrado", mensagem)
    }

    pub fn conflito(mensagem: impl Into<String>) -> Self {
        Self::novo(StatusCode::CONFLICT, "conflito", mensagem)
    }

    pub fn interno(mensagem: impl Into<String>) -> Self {
        Self::novo(StatusCode::INTERNAL_SERVER_ERROR, "erro_interno", mensagem)
    }

    pub fn corpo(&self) -> Value {
        json!({
            "erro": { "codigo": self.codigo, "mensagem": self.mensagem, "detalhes": self.detalhes },
            "error": self.mensagem,
        })
    }
}

impl fmt::Display for ErroApi {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.codigo, self.mensagem)
    }
}

impl IntoResponse for ErroApi {
    fn into_response(self) -> Response {
        (self.status, Json(self.corpo())).into_response()
    }
}

impl From<sqlx::Error> for ErroApi {
    fn from(e: sqlx::Error) -> Self {
        match e {
            sqlx::Error::RowNotFound => Self::nao_encontrado("Registro não encontrado."),
            e => Self::interno(format!("Erro no banco: {e}")),
        }
    }
}

/// `?confirmar=true` (ou `"confirmar": true` no corpo). Ausente = só prévia.
#[derive(Debug, Default, Deserialize)]
pub struct Confirmar {
    #[serde(default)]
    pub confirmar: bool,
}

/// Resposta de uma escrita em 2 passos: `previa=true` quando nada foi gravado.
#[derive(Debug, Serialize)]
pub struct RespostaAcao<T> {
    pub previa: bool,
    pub acao: &'static str,
    pub resultado: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confirmar: Option<&'static str>,
}

/// Roda `gravar` numa transação: com `confirmar` grava (commit); sem, desfaz (rollback) e devolve a prévia.
/// Erro em `gravar` sempre desfaz. Auditoria fica com quem chama, só quando `confirmar`.
pub async fn executar_em_2_passos<T, F>(
    pool: &PgPool,
    acao: &'static str,
    confirmar: bool,
    gravar: F,
) -> Result<RespostaAcao<T>, ErroApi>
where
    F: for<'t> FnOnce(&'t mut Transaction<'static, Postgres>) -> BoxFuture<'t, Result<T, ErroApi>>,
{
    let mut tx = pool.begin().await?;
    let resultado = match gravar(&mut tx).await {
        Ok(v) => v,
        Err(e) => {
            let _ = tx.rollback().await;
            return Err(e);
        }
    };
    if confirmar {
        tx.commit().await?;
    } else {
        tx.rollback().await?;
    }
    Ok(RespostaAcao {
        previa: !confirmar,
        acao,
        resultado,
        confirmar: (!confirmar).then_some("repita com confirmar=true para gravar"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn erro_traz_codigo_e_mantem_error_para_a_tela() {
        let e = ErroApi::sem_permissao("Sem permissão.").com_detalhes(json!({ "modulo": "producao" }));
        let c = e.corpo();
        assert_eq!(e.status, StatusCode::FORBIDDEN);
        assert_eq!(c["erro"]["codigo"], "sem_permissao");
        assert_eq!(c["erro"]["detalhes"]["modulo"], "producao");
        assert_eq!(c["error"], "Sem permissão.");
    }

    #[test]
    fn linha_nao_encontrada_vira_404() {
        assert_eq!(ErroApi::from(sqlx::Error::RowNotFound).status, StatusCode::NOT_FOUND);
    }

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn previa_desfaz_e_confirmar_grava() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        sqlx::query("DROP TABLE IF EXISTS nexus_teste_acao").execute(&pool).await.unwrap();
        sqlx::query("CREATE TABLE nexus_teste_acao (v INT)").execute(&pool).await.unwrap();
        for confirmar in [false, true] {
            let r = executar_em_2_passos(&pool, "teste", confirmar, |tx| {
                Box::pin(async move {
                    sqlx::query("INSERT INTO nexus_teste_acao VALUES (1)").execute(&mut **tx).await?;
                    Ok(1)
                })
            })
            .await
            .unwrap();
            assert_eq!(r.previa, !confirmar);
        }
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM nexus_teste_acao").fetch_one(&pool).await.unwrap();
        sqlx::query("DROP TABLE nexus_teste_acao").execute(&pool).await.unwrap();
        assert_eq!(n, 1, "só a execução com confirmar grava");
    }
}

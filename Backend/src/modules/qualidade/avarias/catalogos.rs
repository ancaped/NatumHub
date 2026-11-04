//! Catálogos das Avarias (locais e motivos): uma lista só no banco, igual para todas as máquinas.
//! Antes ficavam no `localStorage` de cada navegador.

use std::sync::Arc;

use axum::{
    extract::{Query, State},
    response::{IntoResponse, Response},
    Extension, Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{PgPool, Row};

use super::handlers::{require_edit, require_module};
use crate::core::acao::{corpo_acao, Confirmar, ErroApi};
use crate::handlers::AppState;
use crate::modules::estoque::escrita::{gravar_auditado, Resp};
use crate::modules::geral::auth::models::AuthContext;

const TIPOS: &[&str] = &["local", "motivo"];
const MAX_NOME: usize = 80;

async fn garantir_tabela(pool: &PgPool) -> Result<(), ErroApi> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS qualidade_avaria_catalogo (
            id BIGSERIAL PRIMARY KEY,
            kind TEXT NOT NULL CHECK (kind IN ('local', 'motivo')),
            nome TEXT NOT NULL,
            ativo BOOLEAN NOT NULL DEFAULT TRUE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_by TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
    )
    .execute(pool)
    .await?;
    sqlx::query("CREATE UNIQUE INDEX IF NOT EXISTS uq_qualidade_avaria_catalogo ON qualidade_avaria_catalogo (kind, lower(nome))")
        .execute(pool)
        .await?;
    Ok(())
}

/// Tira espaços das pontas e repetidos no meio; vazio ou longo demais é erro.
pub fn limpar_nome(nome: &str) -> Result<String, ErroApi> {
    let limpo = nome.split_whitespace().collect::<Vec<_>>().join(" ");
    if limpo.is_empty() {
        return Err(ErroApi::invalido("Informe o nome."));
    }
    if limpo.chars().count() > MAX_NOME {
        return Err(ErroApi::invalido(format!("No máximo {MAX_NOME} caracteres.")));
    }
    Ok(limpo)
}

pub fn validar_tipo(tipo: &str) -> Result<&'static str, ErroApi> {
    TIPOS
        .iter()
        .find(|t| **t == tipo.trim())
        .copied()
        .ok_or_else(|| ErroApi::invalido("Tipo inválido: use «local» ou «motivo»."))
}

/// `{ locais: [...], motivos: [...] }`, só os ativos, na ordem do catálogo.
pub async fn listar(pool: &PgPool) -> Result<Value, ErroApi> {
    garantir_tabela(pool).await?;
    let rows = sqlx::query("SELECT kind, nome FROM qualidade_avaria_catalogo WHERE ativo ORDER BY sort_order, id")
        .fetch_all(pool)
        .await?;
    let (mut locais, mut motivos) = (Vec::new(), Vec::new());
    for r in rows {
        let nome: String = r.get("nome");
        if r.get::<String, _>("kind") == "local" {
            locais.push(nome);
        } else {
            motivos.push(nome);
        }
    }
    Ok(json!({ "locais": locais, "motivos": motivos }))
}

/// Acrescenta um local ou motivo (ou reativa o que já existe, sem diferenciar maiúsculas).
pub async fn adicionar(pool: &PgPool, tipo: &str, nome: &str, autor: &str, confirmar: bool) -> Resp {
    garantir_tabela(pool).await?;
    let tipo = validar_tipo(tipo)?;
    let nome = limpar_nome(nome)?;
    let quem = autor.to_string();
    let entrada = json!({ "tipo": tipo, "nome": nome });
    let alvo = format!("{tipo}:{nome}");
    gravar_auditado(pool, "adicionar_catalogo_avaria", autor, &alvo, entrada, confirmar, move |c| {
        Box::pin(async move {
            let row = sqlx::query(
                r#"
                INSERT INTO qualidade_avaria_catalogo (kind, nome, created_by, sort_order)
                VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM qualidade_avaria_catalogo WHERE kind = $1))
                ON CONFLICT (kind, lower(nome)) DO UPDATE SET ativo = TRUE
                RETURNING nome, (xmax = 0) AS novo
                "#,
            )
            .bind(tipo)
            .bind(&nome)
            .bind(&quem)
            .fetch_one(&mut *c)
            .await?;
            Ok(json!({ "tipo": tipo, "nome": row.get::<String, _>("nome"), "jaExistia": !row.get::<bool, _>("novo") }))
        })
    })
    .await
}

fn autor(ctx: &AuthContext) -> String {
    let n = ctx.display_name.trim();
    if n.is_empty() { "Operador".to_string() } else { n.to_string() }
}

pub async fn get_catalogos(State(state): State<Arc<AppState>>, Extension(ctx): Extension<AuthContext>) -> Response {
    if let Err(resp) = require_module(&ctx) {
        return resp;
    }
    match listar(state.db.pool()).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Debug, Deserialize)]
pub struct NovoItemCatalogo {
    pub tipo: String,
    pub nome: String,
}

pub async fn post_catalogo(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(input): Json<NovoItemCatalogo>,
) -> Response {
    if let Err(resp) = require_edit(&ctx) {
        return resp;
    }
    match adicionar(state.db.pool(), &input.tipo, &input.nome, &autor(&ctx), c.confirmar).await {
        Ok(r) => Json(corpo_acao(&r)).into_response(),
        Err(e) => e.into_response(),
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn nome_perde_espacos_repetidos_e_recusa_vazio_ou_longo() {
        assert_eq!(limpar_nome("  Doca   2 ").unwrap(), "Doca 2");
        assert!(limpar_nome("   ").is_err());
        assert!(limpar_nome(&"x".repeat(81)).is_err());
        assert!(limpar_nome(&"x".repeat(80)).is_ok());
    }

    #[test]
    fn tipo_so_aceita_local_ou_motivo() {
        assert_eq!(validar_tipo(" local ").unwrap(), "local");
        assert_eq!(validar_tipo("motivo").unwrap(), "motivo");
        assert!(validar_tipo("setor").is_err());
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn adicionar_grava_so_na_confirmacao_e_nao_duplica_com_outra_caixa() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let nome = format!("Local de teste {}", &uuid::Uuid::new_v4().simple().to_string()[..8]);
        let tem = |v: &Value, n: &str| v["locais"].as_array().unwrap().iter().any(|x| x == n);

        let previa = adicionar(&pool, "local", &nome, "Teste Automatizado", false).await.unwrap();
        assert!(previa.previa);
        assert!(!tem(&listar(&pool).await.unwrap(), &nome), "a prévia não grava");

        let feito = adicionar(&pool, "local", &nome, "Teste Automatizado", true).await.unwrap();
        assert_eq!(feito.resultado["jaExistia"], false);
        assert!(tem(&listar(&pool).await.unwrap(), &nome));

        let outra = adicionar(&pool, "local", &nome.to_uppercase(), "Teste Automatizado", true).await.unwrap();
        assert_eq!(outra.resultado["jaExistia"], true);
        let n = listar(&pool).await.unwrap()["locais"].as_array().unwrap().iter()
            .filter(|x| x.as_str().is_some_and(|t| t.eq_ignore_ascii_case(&nome))).count();
        assert_eq!(n, 1);
    }
}

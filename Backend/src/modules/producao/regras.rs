//! Regras e anotações do planejamento da produção (`producao_regras`).
//!
//! O agente de IA do planejamento (e o operador) lê aqui o que precisa seguir antes de planejar e escreve o que aprende:
//! escopo `geral`, `linha` (prefixo), `base` (código da base) ou `produto` (código); tipo `regra` (deve seguir) ou
//! `anotacao` (contexto). Nada se apaga: arquivar = `ativo = false`. Escritas em 2 passos, com auditoria (antes e depois).

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, put},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{PgConnection, PgPool, Row};
use std::sync::Arc;

use crate::core::acao::{corpo_acao, executar_em_2_passos, Confirmar, ErroApi};
use crate::core::catalogo::{param, Acao};
use crate::core::regras_produto::LINHA_EFETIVA_SQL;
use crate::handlers::imports::clean_product_code;
use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::producao::{auditoria, permissao};

pub const ESCOPOS: [&str; 4] = ["geral", "produto", "linha", "base"];
pub const TIPOS: [&str; 2] = ["regra", "anotacao"];

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/producao/regras", get(listar_rota).post(criar_rota))
        .route("/api/producao/regras/:id", put(editar_rota))
}

/// Ações das regras e anotações descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<Acao> {
    const M: &str = permissao::MODULO_PLANEJAMENTO;
    let confirmar = || param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia.");
    vec![
        Acao::leitura(
            "listar_regras_producao",
            M,
            "Regras que o planejamento deve seguir e anotações por produto, linha ou base. Leia antes de planejar. Filtre por `escopo` (geral, linha, base, produto) e `alvo` (código do produto, prefixo da linha ou código da base).",
            "/api/producao/regras",
            vec![
                param("escopo", "query", "texto", false, "geral, linha, base ou produto."),
                param("alvo", "query", "texto", false, "Código do produto, prefixo da linha ou código da base."),
                param("incluir_arquivadas", "query", "booleano", false, "true traz também as arquivadas."),
                param("produto", "query", "texto", false, "Código do produto: devolve só as ativas que valem para ele (geral, linha, base e o próprio produto), nessa ordem."),
            ],
        ),
        Acao::gravacao(
            "criar_regra_producao",
            M,
            "Escreve uma regra (o planejamento deve seguir) ou uma anotação (contexto) de produção, no escopo geral, de uma linha, de uma base ou de um produto. Registre o que aprendeu como anotação do produto; nunca crie ou mude regra geral sem o Edson. Sem `confirmar=true` mostra só a prévia.",
            "POST",
            "/api/producao/regras",
            true,
            vec![
                confirmar(),
                param("escopo", "corpo", "texto", true, "geral, linha, base ou produto."),
                param("alvo", "corpo", "texto", false, "Código do produto, prefixo da linha ou código da base (vazio no geral)."),
                param("tipo", "corpo", "texto", true, "regra ou anotacao."),
                param("texto", "corpo", "texto", true, "O texto da regra ou da anotação."),
            ],
        ),
        Acao::gravacao(
            "editar_regra_producao",
            M,
            "Edita o texto ou o tipo de uma regra/anotação, ou a arquiva com `ativo=false` (nada é apagado). Sem `confirmar=true` mostra só a prévia (antes e depois).",
            "PUT",
            "/api/producao/regras/:id",
            true,
            vec![
                param("id", "caminho", "inteiro", true, "Id da regra."),
                confirmar(),
                param("texto", "corpo", "texto", false, "Novo texto."),
                param("tipo", "corpo", "texto", false, "regra ou anotacao."),
                param("ativo", "corpo", "booleano", false, "false arquiva; true reativa."),
            ],
        ),
    ]
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Regra {
    pub id: i64,
    pub escopo: String,
    pub alvo: Option<String>,
    pub tipo: String,
    pub texto: String,
    pub ativo: bool,
    pub criado_por: String,
    pub criado_em: String,
    pub atualizado_por: String,
    pub atualizado_em: String,
}

const COLUNAS: &str = "id, escopo, alvo, tipo, texto, ativo, criado_por, \
    to_char(criado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS criado_em, atualizado_por, \
    to_char(atualizado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS atualizado_em";

fn regra_da_linha(r: &sqlx::postgres::PgRow) -> Regra {
    Regra {
        id: r.get::<i64, _>("id"),
        escopo: r.get::<String, _>("escopo"),
        alvo: r.get::<Option<String>, _>("alvo"),
        tipo: r.get::<String, _>("tipo"),
        texto: r.get::<String, _>("texto"),
        ativo: r.get::<bool, _>("ativo"),
        criado_por: r.get::<String, _>("criado_por"),
        criado_em: r.get::<Option<String>, _>("criado_em").unwrap_or_default(),
        atualizado_por: r.get::<String, _>("atualizado_por"),
        atualizado_em: r.get::<Option<String>, _>("atualizado_em").unwrap_or_default(),
    }
}

fn db(e: sqlx::Error) -> ErroApi {
    ErroApi::interno(format!("Erro ao ler/gravar as regras: {e}"))
}

/// Lista as regras. `incluir_arquivadas=false` traz só as ativas. Ordem: geral, linha, base, produto; depois id.
pub async fn listar(
    pool: &PgPool,
    escopo: Option<&str>,
    alvo: Option<&str>,
    incluir_arquivadas: bool,
) -> Result<Vec<Regra>, ErroApi> {
    if let Some(e) = escopo {
        if !ESCOPOS.contains(&e) {
            return Err(ErroApi::invalido(format!("Escopo inválido: {e}. Use geral, linha, base ou produto.")));
        }
    }
    let alvo = alvo.map(str::trim).filter(|a| !a.is_empty());
    let alvos: Option<Vec<String>> = alvo.map(|a| vec![a.to_string(), clean_product_code(a)]);
    let sql = format!(
        "SELECT {COLUNAS} FROM producao_regras \
         WHERE ($1::text IS NULL OR escopo = $1) AND ($2::text[] IS NULL OR alvo = ANY($2)) AND ($3 OR ativo) \
         ORDER BY CASE escopo WHEN 'geral' THEN 0 WHEN 'linha' THEN 1 WHEN 'base' THEN 2 ELSE 3 END, id"
    );
    let rows = sqlx::query(&sql)
        .bind(escopo)
        .bind(alvos)
        .bind(incluir_arquivadas)
        .fetch_all(pool)
        .await
        .map_err(db)?;
    Ok(rows.iter().map(regra_da_linha).collect())
}

/// As regras e anotações ativas que valem para o produto, em ordem: geral, linha, base, produto.
/// Linha = linha efetiva (ajuste manual > automática); base = base do cadastro (se tiver).
pub async fn regras_que_valem(pool: &PgPool, codigo_produto: &str) -> Result<Vec<Regra>, ErroApi> {
    let bruto = codigo_produto.trim();
    let codigos = vec![bruto.to_string(), clean_product_code(bruto)];
    let cad = sqlx::query(&format!(
        "SELECT {LINHA_EFETIVA_SQL} AS linha, NULLIF(BTRIM(p.base_codigo), '') AS base \
         FROM produtos p LEFT JOIN overrides_produtos o ON o.codigo = p.codigo WHERE p.codigo = ANY($1) LIMIT 1"
    ))
    .bind(&codigos)
    .fetch_optional(pool)
    .await
    .map_err(db)?;
    let (linha, base): (Option<String>, Option<String>) = match cad {
        Some(r) => (
            r.get::<Option<String>, _>("linha").map(|l| l.trim().to_string()).filter(|l| !l.is_empty()),
            r.get::<Option<String>, _>("base").map(|b| clean_product_code(&b)),
        ),
        None => (None, None),
    };
    let sql = format!(
        "SELECT {COLUNAS} FROM producao_regras WHERE ativo AND ( \
            escopo = 'geral' \
            OR (escopo = 'linha' AND alvo = $1) \
            OR (escopo = 'base' AND alvo = $2) \
            OR (escopo = 'produto' AND alvo = ANY($3))) \
         ORDER BY CASE escopo WHEN 'geral' THEN 0 WHEN 'linha' THEN 1 WHEN 'base' THEN 2 ELSE 3 END, id"
    );
    let rows = sqlx::query(&sql)
        .bind(linha)
        .bind(base)
        .bind(&codigos)
        .fetch_all(pool)
        .await
        .map_err(db)?;
    Ok(rows.iter().map(regra_da_linha).collect())
}

#[derive(Debug, Deserialize)]
pub struct NovaRegra {
    pub escopo: String,
    #[serde(default)]
    pub alvo: Option<String>,
    pub tipo: String,
    pub texto: String,
}

#[derive(Debug, Deserialize)]
pub struct EdicaoRegra {
    #[serde(default)]
    pub texto: Option<String>,
    #[serde(default)]
    pub tipo: Option<String>,
    #[serde(default)]
    pub ativo: Option<bool>,
}

fn tipo_valido(tipo: &str) -> Result<(), ErroApi> {
    if TIPOS.contains(&tipo) {
        Ok(())
    } else {
        Err(ErroApi::invalido(format!("Tipo inválido: {tipo}. Use regra ou anotacao.")))
    }
}

/// Escopo, alvo e texto já limpos: (escopo, alvo, texto). Geral não tem alvo; os demais exigem.
fn validar_nova(n: &NovaRegra) -> Result<(String, Option<String>, String), ErroApi> {
    let escopo = n.escopo.trim();
    if !ESCOPOS.contains(&escopo) {
        return Err(ErroApi::invalido(format!("Escopo inválido: {escopo}. Use geral, linha, base ou produto.")));
    }
    tipo_valido(n.tipo.trim())?;
    let texto = n.texto.trim();
    if texto.is_empty() {
        return Err(ErroApi::invalido("Escreva o texto da regra ou da anotação."));
    }
    let alvo = n.alvo.as_deref().map(str::trim).filter(|a| !a.is_empty());
    let alvo = match (escopo, alvo) {
        ("geral", _) => None,
        (_, None) => return Err(ErroApi::invalido("Informe o alvo: código do produto, prefixo da linha ou código da base.")),
        ("linha", Some(a)) => Some(a.to_string()),
        (_, Some(a)) => Some(clean_product_code(a)),
    };
    Ok((escopo.to_string(), alvo, texto.to_string()))
}

/// Cria a regra na transação do chamador. Devolve a regra gravada.
pub async fn criar_em(conn: &mut PgConnection, nova: &NovaRegra, usuario: &str) -> Result<Regra, ErroApi> {
    let (escopo, alvo, texto) = validar_nova(nova)?;
    let sql = format!(
        "INSERT INTO producao_regras (escopo, alvo, tipo, texto, criado_por, atualizado_por) \
         VALUES ($1, $2, $3, $4, $5, $5) RETURNING {COLUNAS}"
    );
    let r = sqlx::query(&sql)
        .bind(escopo)
        .bind(alvo)
        .bind(nova.tipo.trim())
        .bind(texto)
        .bind(usuario)
        .fetch_one(&mut *conn)
        .await
        .map_err(db)?;
    Ok(regra_da_linha(&r))
}

/// Edita (texto/tipo) ou arquiva/reativa (`ativo`) com a linha travada. Devolve a regra antes e depois.
pub async fn editar_em(conn: &mut PgConnection, id: i64, e: &EdicaoRegra, usuario: &str) -> Result<(Regra, Regra), ErroApi> {
    if e.texto.is_none() && e.tipo.is_none() && e.ativo.is_none() {
        return Err(ErroApi::invalido("Informe o que mudar: texto, tipo ou ativo."));
    }
    let texto = e.texto.as_deref().map(str::trim);
    if texto == Some("") {
        return Err(ErroApi::invalido("O texto não pode ficar vazio."));
    }
    let tipo = e.tipo.as_deref().map(str::trim);
    if let Some(t) = tipo {
        tipo_valido(t)?;
    }
    let antes = sqlx::query(&format!("SELECT {COLUNAS} FROM producao_regras WHERE id = $1 FOR UPDATE"))
        .bind(id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(db)?
        .ok_or_else(|| ErroApi::nao_encontrado("Regra não encontrada."))?;
    let antes = regra_da_linha(&antes);
    let depois = sqlx::query(&format!(
        "UPDATE producao_regras SET texto = COALESCE($1, texto), tipo = COALESCE($2, tipo), ativo = COALESCE($3, ativo), \
         atualizado_por = $4, atualizado_em = NOW() WHERE id = $5 RETURNING {COLUNAS}"
    ))
    .bind(texto)
    .bind(tipo)
    .bind(e.ativo)
    .bind(usuario)
    .bind(id)
    .fetch_one(&mut *conn)
    .await
    .map_err(db)?;
    Ok((antes, regra_da_linha(&depois)))
}

// ---------------------------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ListarQuery {
    pub escopo: Option<String>,
    pub alvo: Option<String>,
    #[serde(default)]
    pub incluir_arquivadas: bool,
    /// Código do produto: troca o filtro por `regras_que_valem`.
    pub produto: Option<String>,
}

async fn listar_rota(State(state): State<Arc<AppState>>, Query(q): Query<ListarQuery>) -> Result<Response, ErroApi> {
    if let Some(produto) = q.produto.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        return Ok((StatusCode::OK, Json(regras_que_valem(state.db.pool(), produto).await?)).into_response());
    }
    let regras = listar(state.db.pool(), q.escopo.as_deref(), q.alvo.as_deref(), q.incluir_arquivadas).await?;
    Ok((StatusCode::OK, Json(regras)).into_response())
}

async fn criar_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(nova): Json<NovaRegra>,
) -> Result<Response, ErroApi> {
    if let Err(r) = permissao::exigir_edicao(&ctx) {
        return Ok(r);
    }
    let pool = state.db.pool();
    let usuario = ctx.display_name.clone();
    let r = executar_em_2_passos(pool, "criar_regra_producao", c.confirmar, |tx| {
        Box::pin(async move {
            let regra = criar_em(&mut **tx, &nova, &usuario).await?;
            Ok(json!({ "regra": regra }))
        })
    })
    .await?;
    if !r.previa {
        let alvo = r.resultado["regra"]["id"].to_string();
        auditoria::registrar(pool, &ctx.display_name, "criar_regra_producao", &alvo, json!({ "depois": r.resultado["regra"] })).await;
    }
    Ok((StatusCode::OK, Json(corpo_acao(&r))).into_response())
}

async fn editar_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Query(c): Query<Confirmar>,
    Json(edicao): Json<EdicaoRegra>,
) -> Result<Response, ErroApi> {
    if let Err(r) = permissao::exigir_edicao(&ctx) {
        return Ok(r);
    }
    let pool = state.db.pool();
    let usuario = ctx.display_name.clone();
    let r = executar_em_2_passos(pool, "editar_regra_producao", c.confirmar, |tx| {
        Box::pin(async move {
            let (antes, depois) = editar_em(&mut **tx, id, &edicao, &usuario).await?;
            Ok(json!({ "id": id, "antes": antes, "depois": depois }))
        })
    })
    .await?;
    if !r.previa {
        auditoria::registrar(pool, &ctx.display_name, "editar_regra_producao", &id.to_string(), r.resultado.clone()).await;
    }
    Ok((StatusCode::OK, Json(corpo_acao(&r))).into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nova(escopo: &str, alvo: Option<&str>, tipo: &str, texto: &str) -> NovaRegra {
        NovaRegra { escopo: escopo.into(), alvo: alvo.map(String::from), tipo: tipo.into(), texto: texto.into() }
    }

    #[test]
    fn valida_escopo_tipo_alvo_e_texto() {
        assert!(validar_nova(&nova("geral", Some("x"), "regra", " Texto ")).is_ok_and(|(e, a, t)| e == "geral" && a.is_none() && t == "Texto"));
        assert!(validar_nova(&nova("produto", None, "regra", "t")).is_err(), "produto exige alvo");
        assert!(validar_nova(&nova("produto", Some("  "), "anotacao", "t")).is_err());
        assert!(validar_nova(&nova("setor", Some("a"), "regra", "t")).is_err());
        assert!(validar_nova(&nova("linha", Some("3.1"), "dica", "t")).is_err());
        assert!(validar_nova(&nova("linha", Some("3.1"), "regra", "   ")).is_err());
        let (_, alvo, _) = validar_nova(&nova("produto", Some(" \"03.14.001\" "), "anotacao", "t")).unwrap();
        assert_eq!(alvo.as_deref(), Some("03.14.001"), "tira aspas e espaços do código");
    }

    async fn pool_teste() -> PgPool {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        sqlx::raw_sql(include_str!("../../../supabase/078_producao_regras.sql")).execute(&pool).await.unwrap();
        pool
    }

    async fn apagar_teste(pool: &PgPool, marca: &str) {
        sqlx::query("DELETE FROM producao_regras WHERE texto LIKE $1").bind(format!("{marca}%")).execute(pool).await.unwrap();
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn regras_que_valem_seguem_a_ordem_e_o_escopo() {
        let pool = pool_teste().await;
        let marca = format!("TESTE-{}", uuid::Uuid::new_v4());
        let prod = format!("{marca}.P");
        let outro = format!("{marca}.OUTRO");
        sqlx::query("INSERT INTO produtos (codigo, descricao, linha_prefix, base, base_codigo) VALUES ($1, 'Produto teste', 'DEFAULT', 'BASE TESTE', $2), ($3, 'Outro', 'DEFAULT', NULL, NULL)")
            .bind(&prod)
            .bind(format!("{marca}.B"))
            .bind(&outro)
            .execute(&pool)
            .await
            .unwrap();
        // a linha efetiva vem do ajuste manual
        sqlx::query("INSERT INTO overrides_produtos (codigo, linha_prefix_manual) VALUES ($1, 'LT.1'), ($2, 'LT.2')")
            .bind(&prod)
            .bind(&outro)
            .execute(&pool)
            .await
            .unwrap();

        let mut tx = pool.begin().await.unwrap();
        // inseridas de propósito fora de ordem
        criar_em(&mut tx, &nova("produto", Some(&prod), "anotacao", &format!("{marca} produto")), "t").await.unwrap();
        criar_em(&mut tx, &nova("base", Some(&format!("{marca}.B")), "regra", &format!("{marca} base")), "t").await.unwrap();
        criar_em(&mut tx, &nova("linha", Some("LT.1"), "regra", &format!("{marca} linha")), "t").await.unwrap();
        criar_em(&mut tx, &nova("geral", None, "regra", &format!("{marca} geral")), "t").await.unwrap();
        criar_em(&mut tx, &nova("linha", Some("LT.2"), "regra", &format!("{marca} linha outra")), "t").await.unwrap();
        criar_em(&mut tx, &nova("produto", Some(&outro), "anotacao", &format!("{marca} produto outro")), "t").await.unwrap();
        tx.commit().await.unwrap();

        let textos = |v: Vec<Regra>| v.into_iter().filter(|r| r.texto.starts_with(&marca)).map(|r| r.texto.replace(&marca, "").trim().to_string()).collect::<Vec<_>>();
        let vale = textos(regras_que_valem(&pool, &prod).await.unwrap());
        assert_eq!(vale, vec!["geral", "linha", "base", "produto"], "geral, linha, base e produto, sem as de outro alvo");
        let vale_outro = textos(regras_que_valem(&pool, &outro).await.unwrap());
        assert_eq!(vale_outro, vec!["geral", "linha outra", "produto outro"], "sem base: pula o escopo base");

        // arquivar tira das que valem, mas continua na lista com incluir_arquivadas
        let id: i64 = sqlx::query_scalar("SELECT id FROM producao_regras WHERE texto = $1").bind(format!("{marca} linha")).fetch_one(&pool).await.unwrap();
        let mut tx = pool.begin().await.unwrap();
        editar_em(&mut tx, id, &EdicaoRegra { texto: None, tipo: None, ativo: Some(false) }, "t").await.unwrap();
        tx.commit().await.unwrap();
        assert_eq!(textos(regras_que_valem(&pool, &prod).await.unwrap()), vec!["geral", "base", "produto"]);
        let todas = listar(&pool, Some("linha"), Some("LT.1"), true).await.unwrap();
        assert!(todas.iter().any(|r| r.id == id && !r.ativo));
        let ativas = listar(&pool, Some("linha"), Some("LT.1"), false).await.unwrap();
        assert!(ativas.iter().all(|r| r.id != id));

        apagar_teste(&pool, &marca).await;
        sqlx::query("DELETE FROM produtos WHERE codigo = ANY($1)").bind(vec![prod, outro]).execute(&pool).await.unwrap();
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn criar_e_arquivar_so_gravam_com_confirmar() {
        let pool = pool_teste().await;
        let marca = format!("TESTE-{}", uuid::Uuid::new_v4());
        let contar = || async { sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM producao_regras WHERE texto LIKE $1").bind(format!("{marca}%")).fetch_one(&pool).await.unwrap() };

        for confirmar in [false, true] {
            let n = nova("geral", None, "anotacao", &format!("{marca} criada"));
            let r = executar_em_2_passos(&pool, "criar_regra_producao", confirmar, |tx| {
                Box::pin(async move { Ok(criar_em(&mut **tx, &n, "teste").await?) })
            })
            .await
            .unwrap();
            assert_eq!(r.previa, !confirmar);
            assert_eq!(contar().await, if confirmar { 1 } else { 0 }, "a prévia não grava");
        }

        let id: i64 = sqlx::query_scalar("SELECT id FROM producao_regras WHERE texto LIKE $1").bind(format!("{marca}%")).fetch_one(&pool).await.unwrap();
        for confirmar in [false, true] {
            let r = executar_em_2_passos(&pool, "editar_regra_producao", confirmar, |tx| {
                Box::pin(async move {
                    let (a, d) = editar_em(&mut **tx, id, &EdicaoRegra { texto: None, tipo: None, ativo: Some(false) }, "teste").await?;
                    Ok((a.ativo, d.ativo))
                })
            })
            .await
            .unwrap();
            assert_eq!(r.resultado, (true, false), "antes ativa, depois arquivada");
            let ativo: bool = sqlx::query_scalar("SELECT ativo FROM producao_regras WHERE id = $1").bind(id).fetch_one(&pool).await.unwrap();
            assert_eq!(ativo, !confirmar, "só confirmar arquiva");
        }

        // edição inexistente e sem campos
        let mut tx = pool.begin().await.unwrap();
        assert_eq!(editar_em(&mut tx, -1, &EdicaoRegra { texto: Some("x".into()), tipo: None, ativo: None }, "t").await.unwrap_err().codigo, "nao_encontrado");
        assert_eq!(editar_em(&mut tx, id, &EdicaoRegra { texto: None, tipo: None, ativo: None }, "t").await.unwrap_err().codigo, "invalido");
        tx.rollback().await.unwrap();

        apagar_teste(&pool, &marca).await;
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn migracao_semeia_as_regras_gerais_so_uma_vez() {
        let pool = pool_teste().await;
        let antes: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM producao_regras WHERE criado_por = 'sistema' AND escopo = 'geral'").fetch_one(&pool).await.unwrap();
        assert!(antes >= 6, "regras gerais semeadas");
        sqlx::raw_sql(include_str!("../../../supabase/078_producao_regras.sql")).execute(&pool).await.unwrap();
        let depois: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM producao_regras WHERE criado_por = 'sistema' AND escopo = 'geral'").fetch_one(&pool).await.unwrap();
        assert_eq!(antes, depois, "rodar de novo não duplica");
    }
}

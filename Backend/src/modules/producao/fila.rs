//! Retirar item da Fila de Demandas (Banco de Demandas), lembrando o motivo.
//!
//! Escrita em 2 passos: sem `confirmar` só devolve a prévia; com ele apaga a(s) linha(s) e grava a decisão
//! `fila_descartada` na mesma transação. Toda retirada vai para `producao_auditoria`.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Extension, Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::core::acao::{executar_em_2_passos, exigir_motivo, Confirmar, ErroApi, Motivo};
use crate::core::catalogo::{param, Acao};
use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::producao::{auditoria, decisoes, permissao};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/producao/fila-demandas", get(list_fila_demandas).post(create_fila_demandas))
        .route(
            "/api/producao/fila-demandas/:id",
            delete(delete_fila_demanda).patch(update_fila_demanda).put(update_fila_demanda),
        )
        .route("/api/producao/fila-demandas/:id/retirar", post(retirar_rota))
        .route("/api/producao/fila-demandas/limpar", post(limpar_rota))
}

/// Ações da Fila de Demandas descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<Acao> {
    const M: &str = permissao::MODULO_PLANEJAMENTO;
    vec![
        Acao::leitura(
            "listar_fila_demandas",
            M,
            "Lista a Fila de Demandas da semana: os itens manuais (por prioridade) e os automáticos (produtos que a Demanda de Produção marca como necessários, do que acaba antes ao que acaba depois, menos o que já tem item manual, já está planejado na semana ou foi tirado da fila). Cada item traz a situação de insumos (`disponivel` ou `aguardando_insumos`, com o que falta), o processo do produto e a quantidade em unidades e kg.",
            "/api/producao/fila-demandas",
            vec![param("week", "query", "texto", false, "Semana 2026-W43; padrão: semana de hoje.")],
        ),
        Acao::gravacao(
            "enviar_para_fila",
            M,
            "Coloca um ou vários produtos na Fila de Demandas. Sem `confirmar=true` mostra só a prévia.",
            "POST",
            "/api/producao/fila-demandas",
            true,
            vec![
                param("confirmar", "query", "booleano", false, "true para gravar de fato; sem ele só a prévia (linhas da fila antes e depois)."),
                param("itens", "corpo", "item ou lista", true, "Cada item: codigoProduto, descricao, quantidade, unidade, quantidadeKg, origemDemanda, linhaEnvase, baseCodigo, observacoes, prioridade."),
            ],
        ),
        Acao::gravacao(
            "atualizar_demanda_fila",
            M,
            "Ajusta quantidade, kg, unidade, observações ou prioridade de um item da fila. Sem `confirmar=true` mostra só a prévia (antes e depois).",
            "PATCH",
            "/api/producao/fila-demandas/:id",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id do item da fila."),
                param("confirmar", "query", "booleano", false, "true para gravar de fato."),
                param("quantidade", "corpo", "número", false, "Nova quantidade."),
                param("quantidade_kg", "corpo", "número", false, "Novos kg."),
                param("unidade", "corpo", "texto", false, "Nova unidade."),
                param("observacoes", "corpo", "texto", false, "Observações."),
                param("prioridade", "corpo", "inteiro", false, "Prioridade (menor vem primeiro)."),
            ],
        ),
        Acao::exclusao(
            "excluir_da_fila",
            M,
            "Apaga um item da fila de demandas de vez (para só tirar da fila e ensinar o sistema, use `retirar_da_fila`). Exige `motivo` ao confirmar; a cópia do item apagado fica na auditoria; agentes não podem usar. Sem `confirmar=true` mostra só a prévia.",
            "DELETE",
            "/api/producao/fila-demandas/:id",
            vec![
                param("id", "caminho", "texto", true, "Id do item da fila."),
                param("confirmar", "query", "booleano", false, "true para excluir de fato."),
            ],
        ),
        Acao::gravacao(
            "retirar_da_fila",
            M,
            "Tira um item da fila lembrando o motivo (o sistema aprende com isso). Sem `confirmar=true` mostra só a prévia.",
            "POST",
            "/api/producao/fila-demandas/:id/retirar",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id do item da fila."),
                param("motivo", "corpo", "texto", true, "Por que o item sai da fila."),
                param("grupo", "corpo", "booleano", false, "true para tirar também os outros SKUs da mesma batelada."),
                param("confirmar", "corpo", "booleano", false, "true para retirar de fato."),
            ],
        ),
        Acao::exclusao(
            "limpar_fila_demandas",
            M,
            "Esvazia a Fila de Demandas: apaga todos os itens colocados à mão (os automáticos não são apagados). Exige `motivo` ao confirmar; ele vai para a auditoria junto com a cópia dos itens que saíram; agentes não podem usar. Não marca os produtos como descartados: os automáticos voltam à fila enquanto forem necessários (para tirar um produto e lembrar o motivo, use `retirar_da_fila`). Sem `confirmar=true` mostra só a lista do que sairia.",
            "POST",
            "/api/producao/fila-demandas/limpar",
            vec![
                param("motivo", "corpo", "texto", true, "Por que a fila está sendo limpa (obrigatório ao confirmar; vai para a auditoria)."),
                param("confirmar", "corpo", "booleano", false, "true para limpar de fato."),
            ],
        ),
    ]
}

#[derive(Debug, Clone)]
pub struct ItemFila {
    pub id: String,
    pub codigo: String,
    pub descricao: String,
    pub quantidade_kg: Option<f64>,
}

/// Tag `[batch:XYZ]` gravada em `observacoes` quando o item veio de uma batelada.
pub fn batch_da_observacao(obs: &str) -> Option<String> {
    let ini = obs.to_lowercase().find("[batch:")?;
    let resto = &obs[ini + 7..];
    let fim = resto.find(']')?;
    let tag = resto[..fim].trim();
    (!tag.is_empty()).then(|| tag.to_string())
}

/// Item pedido e, com `grupo`, os demais da mesma batelada. `None` se o id não existe.
pub async fn alvos(pool: &PgPool, id: &str, grupo: bool) -> Result<Option<(Vec<ItemFila>, Option<String>)>, String> {
    let linha = sqlx::query(
        "SELECT id, codigo_produto, descricao, quantidade_kg::float8 AS kg, COALESCE(observacoes, '') AS obs \
         FROM producao_fila_demandas WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Erro ao ler a fila: {e}"))?;
    let Some(l) = linha else { return Ok(None) };
    let batch = batch_da_observacao(&l.get::<String, _>("obs"));
    let mut itens = vec![ItemFila {
        id: l.get("id"),
        codigo: l.get("codigo_produto"),
        descricao: l.get("descricao"),
        quantidade_kg: l.get("kg"),
    }];
    if let (true, Some(b)) = (grupo, batch.as_ref()) {
        let outros = sqlx::query(
            "SELECT id, codigo_produto, descricao, quantidade_kg::float8 AS kg FROM producao_fila_demandas \
             WHERE id <> $1 AND observacoes ILIKE $2 ORDER BY codigo_produto",
        )
        .bind(id)
        .bind(format!("%[batch:{b}]%"))
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Erro ao ler a batelada: {e}"))?;
        for o in outros {
            itens.push(ItemFila {
                id: o.get("id"),
                codigo: o.get("codigo_produto"),
                descricao: o.get("descricao"),
                quantidade_kg: o.get("kg"),
            });
        }
    }
    Ok(Some((itens, batch)))
}

/// Apaga as linhas e lembra o motivo de cada produto, tudo numa transação.
pub async fn retirar(pool: &PgPool, itens: &[ItemFila], motivo: &str, usuario: &str) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| format!("Erro ao iniciar a retirada: {e}"))?;
    for it in itens {
        sqlx::query("DELETE FROM producao_fila_demandas WHERE id = $1")
            .bind(&it.id)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Erro ao retirar da fila: {e}"))?;
        sqlx::query(
            r#"
            INSERT INTO producao_decisoes (tipo, chave, valor, vezes, atualizado_por, atualizado_em)
            VALUES ($1, $2, $3, 1, $4, NOW())
            ON CONFLICT (tipo, chave) DO UPDATE SET
                valor = EXCLUDED.valor,
                vezes = CASE WHEN producao_decisoes.valor = EXCLUDED.valor THEN producao_decisoes.vezes + 1 ELSE 1 END,
                atualizado_por = EXCLUDED.atualizado_por,
                atualizado_em = NOW()
            "#,
        )
        .bind(decisoes::TIPO_FILA_DESCARTADA)
        .bind(&it.codigo)
        .bind(motivo)
        .bind(usuario)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Erro ao lembrar o motivo: {e}"))?;
    }
    tx.commit().await.map_err(|e| format!("Erro ao confirmar a retirada: {e}"))
}

fn itens_json(itens: &[ItemFila]) -> Vec<Value> {
    itens
        .iter()
        .map(|i| json!({ "id": i.id, "codigo": i.codigo, "descricao": i.descricao, "quantidadeKg": i.quantidade_kg }))
        .collect()
}

#[derive(Debug, Deserialize)]
struct RetirarBody {
    #[serde(default)]
    motivo: String,
    /// Tira também os outros SKUs da mesma batelada.
    #[serde(default)]
    grupo: bool,
    #[serde(default)]
    confirmar: bool,
}

fn erro(status: StatusCode, msg: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({ "error": msg.into() }))).into_response()
}

async fn retirar_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(b): Json<RetirarBody>,
) -> impl IntoResponse {
    if let Err(r) = permissao::exigir_edicao(&ctx) {
        return r;
    }
    let pool = state.db.pool();
    let motivo = b.motivo.trim();
    if !decisoes::valor_valido(decisoes::TIPO_FILA_DESCARTADA, motivo) {
        return erro(StatusCode::BAD_REQUEST, "Informe o motivo de tirar o item da fila.");
    }
    let (itens, batch) = match alvos(pool, &id, b.grupo).await {
        Ok(Some(x)) => x,
        Ok(None) => return erro(StatusCode::NOT_FOUND, "Item da fila não encontrado."),
        Err(e) => return erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    };
    if !b.confirmar {
        return (
            StatusCode::OK,
            Json(json!({
                "previa": true, "acao": "retirar_da_fila", "motivo": motivo, "batch": batch,
                "itens": itens_json(&itens), "confirmar": "repita com confirmar=true para retirar"
            })),
        )
            .into_response();
    }
    match retirar(pool, &itens, motivo, &ctx.display_name).await {
        Ok(()) => {
            auditoria::registrar(
                pool,
                &ctx.display_name,
                "retirar_da_fila",
                &id,
                json!({ "motivo": motivo, "batch": batch, "itens": itens_json(&itens) }),
            )
            .await;
            (StatusCode::OK, Json(json!({ "ok": true, "retirados": itens.len() }))).into_response()
        }
        Err(e) => erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

#[derive(Debug, Deserialize)]
struct LimparBody {
    #[serde(default)]
    motivo: String,
    #[serde(default)]
    confirmar: bool,
}

/// Apaga todos os itens da fila (linhas travadas) e devolve o instantâneo do que havia.
async fn limpar_itens(conn: &mut sqlx::PgConnection) -> Result<Value, ErroApi> {
    let itens: Vec<Value> = sqlx::query_scalar(
        "SELECT to_jsonb(t) - 'created_at' - 'updated_at' FROM producao_fila_demandas t \
         ORDER BY COALESCE(prioridade, 1), created_at FOR UPDATE",
    )
    .fetch_all(&mut *conn)
    .await?;
    sqlx::query("DELETE FROM producao_fila_demandas").execute(&mut *conn).await?;
    Ok(json!({ "total": itens.len(), "itens": itens }))
}

/// Serviço de "Limpar fila", em 2 passos: sem `confirmar` só lista o que sairia; com ele (e o motivo, obrigatório)
/// apaga tudo numa transação e audita com o instantâneo. Não grava `fila_descartada` (limpar não é "não quero este produto").
pub async fn limpar_fila(
    pool: &PgPool,
    motivo: &str,
    confirmar: bool,
    usuario: &str,
) -> Result<crate::core::acao::RespostaAcao<Value>, ErroApi> {
    let motivo = motivo.trim();
    if confirmar && motivo.is_empty() {
        return Err(ErroApi::invalido("Informe o motivo de limpar a fila."));
    }
    let r = executar_em_2_passos(pool, "limpar_fila_demandas", confirmar, |tx| {
        Box::pin(async move { limpar_itens(&mut **tx).await })
    })
    .await?;
    if !r.previa {
        auditoria::registrar(
            pool,
            usuario,
            "limpar_fila_demandas",
            "fila",
            json!({ "motivo": motivo, "total": r.resultado["total"], "itens": r.resultado["itens"] }),
        )
        .await;
    }
    Ok(r)
}

async fn limpar_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(q): Query<Confirmar>,
    Json(b): Json<LimparBody>,
) -> impl IntoResponse {
    if let Err(r) = permissao::exigir_edicao(&ctx) {
        return r;
    }
    match limpar_fila(state.db.pool(), &b.motivo, b.confirmar || q.confirmar, &ctx.display_name).await {
        Ok(r) => (StatusCode::OK, Json(crate::core::acao::corpo_acao(&r))).into_response(),
        Err(e) => e.into_response(),
    }
}

// ==========================================
// FILA DE DEMANDAS: listar, criar, atualizar e excluir
// ==========================================

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FilaDemandaRow {
    pub id: String,
    pub codigo_produto: String,
    pub descricao: String,
    pub quantidade: f64,
    pub unidade: String,
    pub quantidade_kg: Option<f64>,
    pub origem_demanda: String,
    pub linha_envase: Option<String>,
    pub base_codigo: Option<String>,
    pub base_nome: Option<String>,
    pub observacoes: Option<String>,
    pub prioridade: Option<i32>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateFilaDemandaItem {
    pub codigo_produto: String,
    pub descricao: String,
    pub quantidade: f64,
    #[serde(default = "default_fila_unidade")]
    pub unidade: String,
    pub quantidade_kg: Option<f64>,
    #[serde(default = "default_origem_demanda")]
    pub origem_demanda: String,
    pub linha_envase: Option<String>,
    pub base_codigo: Option<String>,
    pub base_nome: Option<String>,
    pub observacoes: Option<String>,
    pub prioridade: Option<i32>,
    /// `somar` acumula na demanda existente do SKU. Ausente ou `substituir` troca a quantidade.
    #[serde(default)]
    pub modo: Option<String>,
}

fn default_fila_unidade() -> String { "un".to_string() }
fn default_origem_demanda() -> String { "sugestao_estoque".to_string() }

#[derive(Debug, serde::Deserialize)]
#[serde(untagged)]
pub enum CreateFilaDemandaPayload {
    Batch(Vec<CreateFilaDemandaItem>),
    Single(CreateFilaDemandaItem),
}

pub async fn ensure_fila_demandas_table(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS producao_fila_demandas (
            id TEXT PRIMARY KEY,
            codigo_produto TEXT NOT NULL,
            descricao TEXT NOT NULL,
            quantidade NUMERIC(12, 3) NOT NULL,
            unidade TEXT NOT NULL DEFAULT 'un',
            quantidade_kg NUMERIC(12, 3),
            origem_demanda TEXT NOT NULL,
            linha_envase TEXT,
            base_codigo TEXT,
            base_nome TEXT,
            observacoes TEXT,
            prioridade INTEGER DEFAULT 1,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_fila_demandas_codigo ON producao_fila_demandas (codigo_produto)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_fila_demandas_prioridade ON producao_fila_demandas (prioridade, created_at)",
    )
    .execute(pool)
    .await?;

    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct FilaQuery {
    /// Semana 2026-W43; padrão: a semana de hoje.
    pub week: Option<String>,
}

/// Fila da semana: os itens manuais (tabela) e os automáticos (calculados), cada um com a situação de insumos.
/// A montagem fica em `fila_auto`.
pub async fn list_fila_demandas(
    State(state): State<Arc<AppState>>,
    Query(q): Query<FilaQuery>,
) -> impl IntoResponse {
    match crate::modules::producao::fila_auto::resposta_fila(&state.db, q.week.as_deref()).await {
        Ok(corpo) => (StatusCode::OK, Json(corpo)).into_response(),
        Err(e) => e.into_response(),
    }
}

pub async fn create_fila_demandas(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(q): Query<Confirmar>,
    Json(payload): Json<CreateFilaDemandaPayload>,
) -> impl IntoResponse {
    if let Err(r) = permissao::exigir_edicao(&ctx) {
        return r;
    }
    let pool = state.db.pool();
    let items = match payload {
        CreateFilaDemandaPayload::Batch(list) => list,
        CreateFilaDemandaPayload::Single(item) => vec![item],
    };

    // Sem `confirmar=true` a mesma gravação roda numa transação que é desfeita: a prévia é o que entraria.
    let r = executar_em_2_passos(pool, "enviar_para_fila", q.confirmar, |tx| {
        Box::pin(async move { gravar_fila_demandas(&mut **tx, items).await.map_err(|e| ErroApi::interno(format!("Erro ao gravar a fila de demandas: {e}"))) })
    })
    .await;
    match r {
        Ok(r) if r.previa => {
            let (ids, antes, depois) = r.resultado;
            (
                StatusCode::OK,
                Json(json!({
                    "previa": true, "acao": "enviar_para_fila", "count": ids.len(), "ids": ids,
                    "antes": antes, "depois": depois, "confirmar": "repita com confirmar=true para gravar"
                })),
            )
                .into_response()
        }
        Ok(r) => {
            let (ids, antes, depois) = r.resultado;
            auditoria::registrar(
                pool,
                &ctx.display_name,
                "enviar_para_fila",
                &format!("{} itens", ids.len()),
                json!({ "ids": ids, "antes": antes, "depois": depois }),
            )
            .await;
            (
                StatusCode::OK,
                Json(json!({ "ok": true, "count": ids.len(), "ids": ids })),
            )
                .into_response()
        }
        Err(e) => e.into_response(),
    }
}

/// Grava todos os itens numa transação. A fila tem uma linha por SKU, mas sem constraint única;
/// o advisory lock por código impede que dois POST simultâneos dupliquem o SKU.
/// Linhas da fila (sem carimbos de data) pelos ids, em ordem de código.
async fn instantaneo_fila(conn: &mut sqlx::PgConnection, ids: &[String]) -> Result<Vec<Value>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT to_jsonb(t) - 'created_at' - 'updated_at' FROM producao_fila_demandas t WHERE id = ANY($1) ORDER BY codigo_produto, id",
    )
    .bind(ids)
    .fetch_all(&mut *conn)
    .await
}

/// Devolve os ids gravados e as linhas antes e depois (para a auditoria).
async fn gravar_fila_demandas(
    conn: &mut sqlx::PgConnection,
    items: Vec<CreateFilaDemandaItem>,
) -> Result<(Vec<String>, Vec<Value>, Vec<Value>), sqlx::Error> {
    let mut ids = Vec::new();
    let mut antes: Vec<Value> = Vec::new();
    for it in items {
        sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
            .bind(&it.codigo_produto)
            .execute(&mut *conn)
            .await?;

        let existing_id: Option<String> = sqlx::query_scalar(
            "SELECT id FROM producao_fila_demandas WHERE codigo_produto = $1 LIMIT 1",
        )
        .bind(&it.codigo_produto)
        .fetch_optional(&mut *conn)
        .await?;

        if let Some(eid) = existing_id {
            antes.extend(instantaneo_fila(&mut *conn, std::slice::from_ref(&eid)).await?);
            if it.modo.as_deref() == Some("somar") {
                sqlx::query(
                    r#"
                    UPDATE producao_fila_demandas
                    SET quantidade = quantidade + $1,
                        quantidade_kg = COALESCE(quantidade_kg, 0) + COALESCE($2, 0),
                        unidade = COALESCE(NULLIF($3, ''), unidade),
                        observacoes = COALESCE($4, observacoes),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $5
                    "#,
                )
                .bind(it.quantidade)
                .bind(it.quantidade_kg)
                .bind(&it.unidade)
                .bind(&it.observacoes)
                .bind(&eid)
                .execute(&mut *conn)
                .await?;
            } else {
                sqlx::query(
                    r#"
                    UPDATE producao_fila_demandas
                    SET quantidade = $1,
                        unidade = $2,
                        quantidade_kg = $3,
                        origem_demanda = $4,
                        base_codigo = COALESCE($5, base_codigo),
                        base_nome = COALESCE($6, base_nome),
                        observacoes = COALESCE($7, observacoes),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $8
                    "#,
                )
                .bind(it.quantidade)
                .bind(&it.unidade)
                .bind(it.quantidade_kg)
                .bind(&it.origem_demanda)
                .bind(&it.base_codigo)
                .bind(&it.base_nome)
                .bind(&it.observacoes)
                .bind(&eid)
                .execute(&mut *conn)
                .await?;
            }
            ids.push(eid);
            continue;
        }

        let new_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO producao_fila_demandas (
                id, codigo_produto, descricao, quantidade, unidade,
                quantidade_kg, origem_demanda, linha_envase, base_codigo,
                base_nome, observacoes, prioridade
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            "#,
        )
        .bind(&new_id)
        .bind(&it.codigo_produto)
        .bind(&it.descricao)
        .bind(it.quantidade)
        .bind(&it.unidade)
        .bind(it.quantidade_kg)
        .bind(&it.origem_demanda)
        .bind(&it.linha_envase)
        .bind(&it.base_codigo)
        .bind(&it.base_nome)
        .bind(&it.observacoes)
        .bind(it.prioridade.unwrap_or(1))
        .execute(&mut *conn)
        .await?;
        ids.push(new_id);
    }
    let depois = instantaneo_fila(&mut *conn, &ids).await?;
    Ok((ids, antes, depois))
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFilaDemandaPayload {
    pub quantidade: Option<f64>,
    pub quantidade_kg: Option<f64>,
    pub unidade: Option<String>,
    pub observacoes: Option<String>,
    pub prioridade: Option<i32>,
}

/// Atualiza o item com a linha travada. Devolve a linha antes e depois; inexistente = 404.
async fn atualizar_fila_item(
    conn: &mut sqlx::PgConnection,
    id: &str,
    payload: &UpdateFilaDemandaPayload,
) -> Result<Value, ErroApi> {
    let antes = instantaneo_fila_travado(&mut *conn, id).await?;
    let depois: Value = sqlx::query_scalar(
        r#"
        UPDATE producao_fila_demandas
        SET quantidade = COALESCE($1, quantidade),
            quantidade_kg = COALESCE($2, quantidade_kg),
            unidade = COALESCE($3, unidade),
            observacoes = COALESCE($4, observacoes),
            prioridade = COALESCE($5, prioridade),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING to_jsonb(producao_fila_demandas) - 'created_at' - 'updated_at'
        "#,
    )
    .bind(payload.quantidade)
    .bind(payload.quantidade_kg)
    .bind(payload.unidade.as_deref())
    .bind(payload.observacoes.as_deref())
    .bind(payload.prioridade)
    .bind(id)
    .fetch_one(&mut *conn)
    .await?;
    Ok(json!({ "id": id, "antes": antes, "depois": depois }))
}

async fn instantaneo_fila_travado(conn: &mut sqlx::PgConnection, id: &str) -> Result<Value, ErroApi> {
    sqlx::query_scalar::<_, Value>(
        "SELECT to_jsonb(t) - 'created_at' - 'updated_at' FROM producao_fila_demandas t WHERE id = $1 FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?
    .ok_or_else(|| ErroApi::nao_encontrado("Item da fila não encontrado."))
}

pub async fn update_fila_demanda(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(q): Query<Confirmar>,
    Json(payload): Json<UpdateFilaDemandaPayload>,
) -> impl IntoResponse {
    if let Err(r) = permissao::exigir_edicao(&ctx) {
        return r;
    }
    let pool = state.db.pool();
    let id_tx = id.clone();
    let r = executar_em_2_passos(pool, "atualizar_fila", q.confirmar, |tx| {
        Box::pin(async move { atualizar_fila_item(&mut **tx, &id_tx, &payload).await })
    })
    .await;
    match r {
        Ok(r) if r.previa => (
            StatusCode::OK,
            Json(json!({ "previa": true, "acao": "atualizar_fila", "item": r.resultado, "confirmar": "repita com confirmar=true para gravar" })),
        )
            .into_response(),
        Ok(r) => {
            auditoria::registrar(pool, &ctx.display_name, "atualizar_fila", &id, r.resultado.clone()).await;
            (StatusCode::OK, Json(json!({ "ok": true, "updated": 1, "item": r.resultado }))).into_response()
        }
        Err(e) => e.into_response(),
    }
}

async fn excluir_fila_item(conn: &mut sqlx::PgConnection, id: &str) -> Result<Value, ErroApi> {
    let item = instantaneo_fila_travado(&mut *conn, id).await?;
    sqlx::query("DELETE FROM producao_fila_demandas WHERE id = $1")
        .bind(id)
        .execute(&mut *conn)
        .await?;
    Ok(item)
}

/// Serviço de "Excluir da fila", em 2 passos: o motivo é obrigatório ao confirmar e a cópia do item apagado
/// vai para a auditoria junto com o motivo.
pub async fn excluir_da_fila(
    pool: &PgPool,
    id: &str,
    motivo: Option<&str>,
    confirmar: bool,
    usuario: &str,
) -> Result<crate::core::acao::RespostaAcao<Value>, ErroApi> {
    let motivo = exigir_motivo(confirmar, motivo, "o item da fila")?;
    let id_tx = id.to_string();
    let r = executar_em_2_passos(pool, "excluir_da_fila", confirmar, |tx| {
        Box::pin(async move { excluir_fila_item(&mut **tx, &id_tx).await })
    })
    .await?;
    if !r.previa {
        auditoria::registrar(pool, usuario, "excluir_da_fila", id, json!({ "motivo": motivo, "item": r.resultado })).await;
    }
    Ok(r)
}

pub async fn delete_fila_demanda(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(q): Query<Confirmar>,
    Query(m): Query<Motivo>,
) -> impl IntoResponse {
    if let Err(r) = permissao::exigir_edicao(&ctx) {
        return r;
    }
    match excluir_da_fila(state.db.pool(), &id, m.motivo.as_deref(), q.confirmar, &ctx.display_name).await {
        Ok(r) if r.previa => (
            StatusCode::OK,
            Json(json!({ "previa": true, "acao": "excluir_da_fila", "item": r.resultado, "confirmar": "repita com confirmar=true e motivo=... para excluir" })),
        )
            .into_response(),
        Ok(r) => (StatusCode::OK, Json(json!({ "ok": true, "deleted": 1, "item": r.resultado }))).into_response(),
        Err(e) => e.into_response(),
    }
}

/// Resultado de consumir um item da fila ao agendar ordens.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsumoFila {
    pub fila_id: String,
    #[serde(flatten)]
    pub resultado: ResultadoConsumo,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(tag = "resultado", rename_all = "snake_case")]
pub enum ResultadoConsumo {
    Removido,
    #[serde(rename_all = "camelCase")]
    Reduzido { restante_kg: f64, restante_un: i64 },
    NaoEncontrado,
}

/// Peso (kg) de uma unidade, lido da descrição ("500ML" -> 0.5). Porta fiel de `parseProductUnitWeightKg`
/// do front. `None` (desconhecido) quando a descrição não traz uma medida válida: quem usa decide, nunca se presume 1 kg.
pub fn medida_kg(descricao: &str) -> Option<f64> {
    static RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re = RE.get_or_init(|| regex::Regex::new(r"(\d+(?:[.,]\d+)?)\s*(ML|L|GR|G|KG)\b").unwrap());
    let desc = descricao.to_uppercase();
    let m = re.captures(&desc)?;
    let val: f64 = m[1].replace(',', ".").parse().ok()?;
    if val <= 0.0 {
        return None;
    }
    match &m[2] {
        "KG" | "L" => Some(val),
        "G" | "GR" | "ML" => Some(val / 1000.0),
        _ => None,
    }
}

/// Consome `kg` agendados de um item da fila, na transação de quem chama: agendamento parcial devolve o saldo à
/// fila; total (ou sem kg) remove a linha. Item que não existe mais não é erro.
pub async fn consumir_fila(
    conn: &mut sqlx::PgConnection,
    fila_id: &str,
    kg: f64,
) -> Result<ConsumoFila, sqlx::Error> {
    let linha = sqlx::query(
        "SELECT descricao, quantidade::float8 AS qtd, quantidade_kg::float8 AS kg FROM producao_fila_demandas WHERE id = $1 FOR UPDATE",
    )
    .bind(fila_id)
    .fetch_optional(&mut *conn)
    .await?;
    let fila_id = fila_id.to_string();
    let Some(l) = linha else {
        return Ok(ConsumoFila { fila_id, resultado: ResultadoConsumo::NaoEncontrado });
    };
    let descricao: String = l.get("descricao");
    let fila_kg: f64 = l.get::<Option<f64>, _>("kg").unwrap_or(0.0);
    let fila_un: f64 = l.get::<Option<f64>, _>("qtd").unwrap_or(0.0);
    if fila_kg > 0.0 && kg > 0.0 && kg + 0.05 < fila_kg {
        let restante_kg = ((fila_kg - kg) * 10.0).round() / 10.0;
        // Unidades restantes: pelo peso da descrição; sem medida, na mesma proporção dos kg que sobraram.
        let restante_un = match medida_kg(&descricao) {
            Some(peso) => (restante_kg / peso).round() as i64,
            None => (fila_un * restante_kg / fila_kg).round() as i64,
        }
        .max(1);
        sqlx::query(
            "UPDATE producao_fila_demandas SET quantidade = $2::float8, quantidade_kg = $3::float8, unidade = 'un', \
             updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        )
        .bind(&fila_id)
        .bind(restante_un as f64)
        .bind(restante_kg)
        .execute(&mut *conn)
        .await?;
        Ok(ConsumoFila { fila_id, resultado: ResultadoConsumo::Reduzido { restante_kg, restante_un } })
    } else {
        sqlx::query("DELETE FROM producao_fila_demandas WHERE id = $1")
            .bind(&fila_id)
            .execute(&mut *conn)
            .await?;
        Ok(ConsumoFila { fila_id, resultado: ResultadoConsumo::Removido })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn peso_unitario_le_a_medida_da_descricao() {
        assert_eq!(medida_kg("CREME 1,5KG"), Some(1.5));
        assert_eq!(medida_kg("GEL 250 G"), Some(0.25));
        assert_eq!(medida_kg("OLEO 1L"), Some(1.0));
        assert_eq!(medida_kg("SHAMPOO 500ML"), Some(0.5));
        assert_eq!(medida_kg("SEM MEDIDA"), None);
        assert_eq!(medida_kg("X 0ML"), None);
    }

    #[test]
    fn le_a_tag_de_batelada() {
        assert_eq!(batch_da_observacao("x [batch:abc-1] y").as_deref(), Some("abc-1"));
        assert_eq!(batch_da_observacao("[BATCH: G7 ]").as_deref(), Some("G7"));
        assert_eq!(batch_da_observacao("sem tag"), None);
        assert_eq!(batch_da_observacao("[batch:]"), None);
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn atualizar_e_excluir_item_da_fila_so_gravam_com_confirmar() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let id = format!("tf2-{}", uuid::Uuid::new_v4());
        sqlx::query(
            "INSERT INTO producao_fila_demandas (id, codigo_produto, descricao, quantidade, unidade, quantidade_kg, origem_demanda) \
             VALUES ($1, 'TF2.001', 'TESTE 500ML', 10, 'un', 5, 'teste')",
        )
        .bind(&id)
        .execute(&pool)
        .await
        .unwrap();
        let qtd = |pool: PgPool, id: String| async move {
            sqlx::query_scalar::<_, Option<f64>>("SELECT quantidade::float8 FROM producao_fila_demandas WHERE id = $1")
                .bind(id)
                .fetch_optional(&pool)
                .await
                .unwrap()
                .flatten()
        };
        let payload = || UpdateFilaDemandaPayload { quantidade: Some(20.0), quantidade_kg: Some(10.0), unidade: None, observacoes: None, prioridade: None };

        for confirmar in [false, true] {
            let (i, p) = (id.clone(), payload());
            let r = executar_em_2_passos(&pool, "atualizar_fila", confirmar, |tx| {
                Box::pin(async move { atualizar_fila_item(&mut **tx, &i, &p).await })
            })
            .await
            .unwrap();
            assert_eq!(r.resultado["antes"]["quantidade"].as_f64(), Some(10.0));
            assert_eq!(r.resultado["depois"]["quantidade"].as_f64(), Some(20.0));
            assert_eq!(qtd(pool.clone(), id.clone()).await, Some(if confirmar { 20.0 } else { 10.0 }));
        }
        for confirmar in [false, true] {
            let i = id.clone();
            let r = executar_em_2_passos(&pool, "excluir_da_fila", confirmar, |tx| {
                Box::pin(async move { excluir_fila_item(&mut **tx, &i).await })
            })
            .await
            .unwrap();
            assert_eq!(r.resultado["codigo_produto"], "TF2.001");
            assert_eq!(qtd(pool.clone(), id.clone()).await.is_some(), !confirmar);
        }
        let i = id.clone();
        let e = executar_em_2_passos(&pool, "excluir_da_fila", true, |tx| {
            Box::pin(async move { excluir_fila_item(&mut **tx, &i).await })
        })
        .await
        .unwrap_err();
        assert_eq!(e.codigo, "nao_encontrado");
    }

    /// Excluir da fila: prévia não pede motivo, confirmar sem motivo é 400 e não apaga, com motivo apaga e a
    /// auditoria guarda o motivo, quem fez e a cópia do item.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn excluir_da_fila_exige_motivo_e_audita_a_copia() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let id = format!("tfm-{}", uuid::Uuid::new_v4());
        sqlx::query(
            "INSERT INTO producao_fila_demandas (id, codigo_produto, descricao, quantidade, unidade, origem_demanda) \
             VALUES ($1, 'TFM.001', 'TESTE MOTIVO', 7, 'un', 'teste')",
        )
        .bind(&id)
        .execute(&pool)
        .await
        .unwrap();
        let existe = || async { sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM producao_fila_demandas WHERE id = $1").bind(&id).fetch_one(&pool).await.unwrap() };

        let previa = excluir_da_fila(&pool, &id, None, false, "teste").await.unwrap();
        assert!(previa.previa);
        assert_eq!(existe().await, 1);
        for ruim in [None, Some("   ")] {
            let e = excluir_da_fila(&pool, &id, ruim, true, "teste").await.unwrap_err();
            assert_eq!(e.status, StatusCode::BAD_REQUEST);
            assert!(e.mensagem.starts_with("Informe o motivo de excluir"));
        }
        assert_eq!(existe().await, 1);

        excluir_da_fila(&pool, &id, Some("duplicado"), true, "agente-teste-motivo").await.unwrap();
        assert_eq!(existe().await, 0);
        let det: Value = sqlx::query_scalar(
            "SELECT detalhe FROM producao_auditoria WHERE acao = 'excluir_da_fila' AND alvo = $1 AND usuario = 'agente-teste-motivo'",
        )
        .bind(&id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(det["motivo"], "duplicado");
        assert_eq!(det["item"]["codigo_produto"], "TFM.001");
        assert_eq!(det["item"]["descricao"], "TESTE MOTIVO");
        sqlx::query("DELETE FROM producao_auditoria WHERE alvo = $1").bind(&id).execute(&pool).await.unwrap();
    }

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn retirar_apaga_a_batelada_e_lembra_o_motivo() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        for (id, cod, obs) in [("tf-1", "TF.001", "[batch:TFG]"), ("tf-2", "TF.002", "[batch:TFG]"), ("tf-3", "TF.003", "")] {
            sqlx::query(
                "INSERT INTO producao_fila_demandas (id, codigo_produto, descricao, quantidade, origem_demanda, observacoes) \
                 VALUES ($1, $2, 'teste', 1, 'teste', $3) ON CONFLICT (id) DO NOTHING",
            )
            .bind(id)
            .bind(cod)
            .bind(obs)
            .execute(&pool)
            .await
            .unwrap();
        }
        let (so_um, _) = alvos(&pool, "tf-1", false).await.unwrap().unwrap();
        assert_eq!(so_um.len(), 1, "sem grupo, só o item");
        let (grupo, batch) = alvos(&pool, "tf-1", true).await.unwrap().unwrap();
        assert_eq!((grupo.len(), batch.as_deref()), (2, Some("TFG")), "com grupo, a batelada toda");
        assert!(alvos(&pool, "nao-existe", false).await.unwrap().is_none());

        retirar(&pool, &grupo, "sem_demanda", "teste").await.unwrap();
        let ids: Vec<String> = sqlx::query_scalar("SELECT id FROM producao_fila_demandas WHERE id LIKE 'tf-%'")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert_eq!(ids, vec!["tf-3".to_string()]);
        assert_eq!(decisoes::atual(&pool, decisoes::TIPO_FILA_DESCARTADA, "TF.002").await.unwrap().unwrap().0, "sem_demanda");

        sqlx::query("DELETE FROM producao_fila_demandas WHERE id = 'tf-3'").execute(&pool).await.unwrap();
        for c in ["TF.001", "TF.002"] {
            decisoes::remover(&pool, decisoes::TIPO_FILA_DESCARTADA, c).await.unwrap();
        }
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn enviar_para_fila_so_grava_com_confirmar() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let cod = format!("EF.{}", uuid::Uuid::new_v4().simple());
        let item = || CreateFilaDemandaItem {
            codigo_produto: cod.clone(),
            descricao: "teste".into(),
            quantidade: 10.0,
            unidade: "un".into(),
            quantidade_kg: Some(5.0),
            origem_demanda: "manual".into(),
            linha_envase: None,
            base_codigo: None,
            base_nome: None,
            observacoes: None,
            prioridade: Some(1),
            modo: None,
        };
        let contar = || async { sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM producao_fila_demandas WHERE codigo_produto = $1").bind(&cod).fetch_one(&pool).await.unwrap() };
        for confirmar in [false, true] {
            let itens = vec![item()];
            let r = executar_em_2_passos(&pool, "enviar_para_fila", confirmar, |tx| {
                Box::pin(async move { gravar_fila_demandas(&mut **tx, itens).await.map_err(|e| ErroApi::interno(e.to_string())) })
            })
            .await
            .unwrap();
            assert_eq!(r.previa, !confirmar);
            assert_eq!(r.resultado.0.len(), 1, "a prévia traz o item que entraria");
            assert_eq!(contar().await, if confirmar { 1 } else { 0 }, "sem confirmar não grava");
        }
        sqlx::query("DELETE FROM producao_fila_demandas WHERE codigo_produto = $1").bind(&cod).execute(&pool).await.unwrap();
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn limpar_fila_so_apaga_com_confirmar_e_audita() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        sqlx::query("DELETE FROM producao_fila_demandas").execute(&pool).await.unwrap();
        for (id, cod) in [("lf-1", "LF.001"), ("lf-2", "LF.002")] {
            sqlx::query(
                "INSERT INTO producao_fila_demandas (id, codigo_produto, descricao, quantidade, origem_demanda) \
                 VALUES ($1, $2, 'teste', 1, 'manual')",
            )
            .bind(id)
            .bind(cod)
            .execute(&pool)
            .await
            .unwrap();
        }
        let contar = || async { sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM producao_fila_demandas").fetch_one(&pool).await.unwrap() };

        let e = limpar_fila(&pool, "  ", true, "teste").await.unwrap_err();
        assert_eq!(e.codigo, "invalido");
        assert_eq!(contar().await, 2, "sem motivo nada muda");

        let previa = limpar_fila(&pool, "", false, "teste").await.unwrap();
        assert!(previa.previa);
        assert_eq!(previa.resultado["total"], 2);
        assert_eq!(contar().await, 2, "a prévia não apaga");

        let antes: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM producao_auditoria WHERE acao = 'limpar_fila_demandas'")
            .fetch_one(&pool).await.unwrap();
        let r = limpar_fila(&pool, "teste de limpeza", true, "teste").await.unwrap();
        assert!(!r.previa);
        assert_eq!(r.resultado["total"], 2);
        assert_eq!(contar().await, 0, "confirmar apaga tudo");
        let depois: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM producao_auditoria WHERE acao = 'limpar_fila_demandas'")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(depois, antes + 1, "audita uma vez");
        let sem_decisao: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM producao_decisoes WHERE tipo = 'fila_descartada' AND chave IN ('LF.001','LF.002')")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(sem_decisao, 0, "limpar não grava decisão fila_descartada");
    }
}

//! Lançamento da conversão (vira / reembalagem) no ERP (ENTDEV / ENTDEVINS), em 2 passos.
//! O ERP não tem registro próprio de conversão (levantado em 2026-11-07, ai-memory `concepts/erp-montagem-kits`);
//! desenho decidido com o Edson: sai o produto de origem (S) e entra o de destino (E) em ENTDEV, as embalagens
//! consumidas saem (S) e as devolvidas voltam (E) em ENTDEVINS, tudo no mesmo `nRegistro`, com a observação
//! `CONVERSAO <de> PARA <para> - OV <nº da ordem>`. Reversão inverte E/S. A gravação reaproveita a de kits
//! (`kits_erp::gravar_no_erp`): backup antes, transação, recusa lançamento repetido, não mexe em nQtdeEstoque.

use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use axum::http::StatusCode;
use axum::Extension;
use serde::Deserialize;
use serde_json::json;
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::core::acao::ErroApi;
use crate::core::catalogo::{param, Acao};
use crate::handlers::{AppState, ViraPackagingDeductions};
use crate::modules::geral::audit;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::producao::kits_erp::{codigo_seguro, gravar_no_erp, Lancamento, LinhaErp};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/turnovers/orders/:id/lancamento-erp", get(previa))
        .route("/api/turnovers/orders/:id/lancamento-erp", post(lancar))
}

pub fn acoes() -> Vec<Acao> {
    vec![
        Acao::leitura(
            "previa_lancamento_conversao_erp",
            "montagem_kits",
            "Prévia do lançamento no ERP de uma ordem de conversão: saída do produto de origem, entrada do de destino e as embalagens (ENTDEV/ENTDEVINS), com a observação padrão e o número da ordem. Não grava nada no ERP.",
            "/api/turnovers/orders/:id/lancamento-erp",
            vec![
                param("id", "caminho", "inteiro", true, "Id da ordem de conversão."),
                param("tipo", "query", "texto", false, "conversao (padrão) ou reversao."),
            ],
        ),
        Acao::gravacao(
            "lancar_conversao_no_erp",
            "montagem_kits",
            "Grava no ERP a conversão (ou a reversão) de uma ordem de conversão. Sem confirmar=true devolve só a prévia; com confirmar=true grava uma vez por ordem e tipo, guarda o backup do saldo dos itens e marca a ordem como lançada no ERP.",
            "POST",
            "/api/turnovers/orders/:id/lancamento-erp",
            true,
            vec![
                param("id", "caminho", "inteiro", true, "Id da ordem de conversão."),
                param("tipo", "query", "texto", false, "conversao (padrão) ou reversao."),
                param("confirmar", "query", "booleano", false, "true grava; sem isso só mostra a prévia."),
            ],
        ),
    ]
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tipo {
    Conversao,
    Reversao,
}

fn texto_tipo(t: Tipo) -> &'static str {
    match t {
        Tipo::Conversao => "conversao",
        Tipo::Reversao => "reversao",
    }
}

/// Embalagem da ordem já na quantidade a lançar.
#[derive(Debug, Clone, PartialEq)]
pub struct Embalagem {
    pub codigo: String,
    pub quantidade: i64,
    /// `true`: consumida no destino (sai); `false`: devolvida da origem (entra).
    pub consumida: bool,
}

/// Monta as linhas do lançamento. Função pura.
pub fn montar_lancamento(
    tipo: Tipo,
    de: &str,
    para: &str,
    qtd_de: i64,
    qtd_para: i64,
    embalagens: &[Embalagem],
    numero_ordem: &str,
) -> Lancamento {
    let direto = tipo == Tipo::Conversao;
    let es = |sai: bool| if sai == direto { "S" } else { "E" };
    let mut linhas = vec![
        LinhaErp { tabela: "ENTDEV", codigo: de.to_string(), quantidade: qtd_de, tipo_es: es(true) },
        LinhaErp { tabela: "ENTDEV", codigo: para.to_string(), quantidade: qtd_para, tipo_es: es(false) },
    ];
    for e in embalagens.iter().filter(|e| e.quantidade > 0) {
        linhas.push(LinhaErp { tabela: "ENTDEVINS", codigo: e.codigo.clone(), quantidade: e.quantidade, tipo_es: es(e.consumida) });
    }
    let rotulo = if direto { "CONVERSAO" } else { "REVERSAO DA CONVERSAO" };
    Lancamento { observacao: format!("{rotulo} {de} PARA {para} - OV {numero_ordem}"), linhas }
}

struct OrdemVira {
    numero: String,
    de: String,
    para: String,
    qtd_de: i64,
    qtd_para: i64,
    ja_lancada: bool,
    embalagens: Vec<Embalagem>,
}

async fn carregar(pool: &PgPool, id: i64) -> Result<OrdemVira, ErroApi> {
    let r = sqlx::query(
        "SELECT order_number, de_produto_codigo, para_produto_codigo, quantity::float8, quantity_assembled::float8,
                erp_launched, COALESCE(packaging_deductions, '')
         FROM vira_ordens WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| ErroApi::interno(format!("Erro ao ler a ordem: {e}")))?
    .ok_or_else(|| ErroApi::nao_encontrado("Ordem de conversão não encontrada."))?;
    let limpo = |c: String| c.trim().trim_matches('"').to_string();
    let numero: String = r.get(0);
    let de = limpo(r.get(1));
    let para = limpo(r.get(2));
    let pedida: f64 = r.get(3);
    let montada: Option<f64> = r.get(4);
    let ja: i32 = r.try_get(5).unwrap_or(0);
    let bruto: String = r.get(6);
    let dados: ViraPackagingDeductions = serde_json::from_str(&bruto)
        .map_err(|_| ErroApi::regra("A ordem não tem as quantidades e embalagens calculadas; abra e salve a ordem antes de lançar."))?;
    let meta = dados
        .meta
        .filter(|m| m.qty_para > 0.0 && m.qty_de > 0.0)
        .ok_or_else(|| ErroApi::regra("A ordem não tem as quantidades de origem e destino; não há o que lançar."))?;
    let real = montada.filter(|m| *m > 0.0).unwrap_or(pedida);
    let razao = real / meta.qty_para;
    let embalagens = dados
        .items
        .iter()
        .filter_map(|l| {
            let consumida = l.role.trim().eq_ignore_ascii_case("consume");
            if !consumida && l.returned == Some(false) {
                return None; // devolução não confirmada pelo operador
            }
            let q = l.qty * razao;
            let quantidade = if consumida { q.ceil() } else { q.round() } as i64;
            Some(Embalagem { codigo: l.code.trim().to_string(), quantidade, consumida })
        })
        .collect();
    Ok(OrdemVira {
        numero,
        de,
        para,
        qtd_de: (meta.qty_de * razao).round() as i64,
        qtd_para: real.round() as i64,
        ja_lancada: ja != 0,
        embalagens,
    })
}

#[derive(Deserialize)]
struct TipoQuery {
    tipo: Option<Tipo>,
}

fn resumo(id: i64, o: &OrdemVira) -> serde_json::Value {
    json!({ "id": id, "numero": o.numero, "de": o.de, "para": o.para, "jaLancadaNoErp": o.ja_lancada })
}

async fn previa(State(state): State<Arc<AppState>>, Path(id): Path<i64>, Query(q): Query<TipoQuery>) -> impl IntoResponse {
    let o = match carregar(state.db.pool(), id).await {
        Ok(o) => o,
        Err(e) => return e.into_response(),
    };
    let lanc = montar_lancamento(q.tipo.unwrap_or(Tipo::Conversao), &o.de, &o.para, o.qtd_de, o.qtd_para, &o.embalagens, &o.numero);
    Json(json!({ "ordem": resumo(id, &o), "lancamento": lanc, "gravaNoErp": false })).into_response()
}

#[derive(Deserialize)]
struct LancarQuery {
    tipo: Option<Tipo>,
    confirmar: Option<bool>,
}

async fn lancar(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Query(q): Query<LancarQuery>,
) -> impl IntoResponse {
    if !ctx.can_edit_module("montagem_kits") {
        return ErroApi::sem_permissao("Sem permissão para alterar a Montagem de Kits.").into_response();
    }
    let pool = state.db.pool();
    let tipo = q.tipo.unwrap_or(Tipo::Conversao);
    let o = match carregar(pool, id).await {
        Ok(o) => o,
        Err(e) => return e.into_response(),
    };
    let lanc = montar_lancamento(tipo, &o.de, &o.para, o.qtd_de, o.qtd_para, &o.embalagens, &o.numero);
    if lanc.linhas.iter().any(|l| !codigo_seguro(&l.codigo)) {
        return ErroApi::invalido("Há código de item fora do padrão; o lançamento foi recusado.").into_response();
    }
    if !q.confirmar.unwrap_or(false) {
        return Json(json!({
            "previa": true,
            "ordem": resumo(id, &o),
            "lancamento": lanc,
            "confirmar": "repita com confirmar=true para gravar no ERP",
        }))
        .into_response();
    }
    let ja: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM kit_erp_lancamentos WHERE ordem_id = $1 AND tipo = $2 AND status = 'gravado'",
    )
    .bind(id)
    .bind(texto_tipo(tipo))
    .fetch_optional(pool)
    .await
    .unwrap_or(None);
    if ja.is_some() {
        return ErroApi::conflito(format!("A ordem {} já foi lançada no ERP como {}.", o.numero, texto_tipo(tipo))).into_response();
    }
    let produto = format!("{}>{}", o.de, o.para);
    match gravar_no_erp(pool, &lanc, texto_tipo(tipo), id, &o.numero, &produto, "vira_ordens", &ctx.display_name).await {
        Ok(res) => {
            audit::record_domain(
                pool,
                Some(&ctx),
                "montagem_kits",
                "lancar_conversao_no_erp",
                "kit_erp_lancamentos",
                &res.lancamento_id.to_string(),
                &format!("Conversão {} lançada no ERP ({}): registro {} de {}", o.numero, texto_tipo(tipo), res.n_registro, res.data_registro),
                None,
                Some(json!({ "linhas": lanc.linhas, "observacao": lanc.observacao })),
            )
            .await;
            Json(json!({ "gravado": true, "lancamentoId": res.lancamento_id, "dataRegistro": res.data_registro, "nRegistro": res.n_registro, "lancamento": lanc })).into_response()
        }
        Err(msg) => (StatusCode::BAD_GATEWAY, Json(json!({ "error": msg, "gravado": false }))).into_response(),
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    fn emb(cod: &str, q: i64, consumida: bool) -> Embalagem {
        Embalagem { codigo: cod.into(), quantidade: q, consumida }
    }

    #[test]
    fn conversao_sai_a_origem_entra_o_destino_e_embalagens() {
        let l = montar_lancamento(
            Tipo::Conversao,
            "2.13.101",
            "2.13.115",
            10,
            25,
            &[emb("9.31.042", 25, true), emb("9.29.013", 10, false)],
            "V-1001",
        );
        assert_eq!(l.observacao, "CONVERSAO 2.13.101 PARA 2.13.115 - OV V-1001");
        assert_eq!(l.linhas[0], LinhaErp { tabela: "ENTDEV", codigo: "2.13.101".into(), quantidade: 10, tipo_es: "S" });
        assert_eq!(l.linhas[1], LinhaErp { tabela: "ENTDEV", codigo: "2.13.115".into(), quantidade: 25, tipo_es: "E" });
        assert_eq!(l.linhas[2], LinhaErp { tabela: "ENTDEVINS", codigo: "9.31.042".into(), quantidade: 25, tipo_es: "S" });
        assert_eq!(l.linhas[3].tipo_es, "E", "embalagem devolvida volta ao estoque");
    }

    #[test]
    fn reversao_inverte_tudo() {
        let l = montar_lancamento(Tipo::Reversao, "A", "B", 1, 2, &[emb("9.1", 3, true), emb("9.2", 4, false), emb("9.3", 0, true)], "7");
        assert_eq!(l.observacao, "REVERSAO DA CONVERSAO A PARA B - OV 7");
        assert_eq!(l.linhas.iter().map(|x| x.tipo_es).collect::<Vec<_>>(), vec!["E", "S", "E", "S"]);
        assert_eq!(l.linhas.len(), 4, "embalagem com quantidade 0 não entra");
    }
}

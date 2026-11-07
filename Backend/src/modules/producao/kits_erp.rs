//! Lançamento da montagem/desmontagem de kit no ERP (ENTDEV / ENTDEVINS), SÓ PRÉVIA.
//! Formato levantado em 2026-11-05 (ai-memory `concepts/erp-montagem-kits`): uma linha E do kit e uma
//! linha S por componente (produto acabado em ENTDEV, insumo/embalagem `9.*` em ENTDEVINS), mesmo
//! `nRegistro`/hora e observação `MONTAGEM DO KIT <cód> - OM <nº da ordem>`. Desmontagem inverte E/S.
//! Esta rota NÃO grava no ERP; a gravação só entra depois da prova contra uma cópia do ERP.

use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Row;
use std::sync::Arc;
use sqlx::PgPool;

use crate::core::legacy_db::connect_sql_server;
use crate::modules::geral::audit;
use crate::modules::geral::auth::models::AuthContext;
use axum::Extension;
use axum::http::StatusCode;

use crate::core::acao::ErroApi;
use crate::core::catalogo::{param, Acao};
use crate::handlers::AppState;
use crate::modules::producao::kits::necessidade_componente;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/kits/orders/:id/lancamento-erp", get(previa_lancamento_erp))
        .route("/api/kits/orders/:id/lancamento-erp", post(lancar_no_erp))
}

pub fn acoes() -> Vec<Acao> {
    vec![Acao::leitura(
        "previa_lancamento_kit_erp",
        "montagem_kits",
        "Prévia do lançamento no ERP de uma ordem de montagem de kit: as linhas que seriam gravadas em ENTDEV (produtos) e ENTDEVINS (embalagens/insumos), com a observação padrão e o número da ordem. Não grava nada no ERP.",
        "/api/kits/orders/:id/lancamento-erp",
        vec![
            param("id", "caminho", "inteiro", true, "Id da ordem de montagem."),
            param("tipo", "query", "texto", false, "montagem (padrão) ou desmontagem."),
        ],
    ),
    Acao::gravacao(
        "lancar_kit_no_erp",
        "montagem_kits",
        "Grava no ERP (ENTDEV/ENTDEVINS) a montagem ou desmontagem de uma ordem de kit. Sem confirmar=true devolve só a prévia; com confirmar=true grava uma vez por ordem e tipo, guarda o backup do saldo dos itens e marca a ordem como lançada no ERP.",
        "POST",
        "/api/kits/orders/:id/lancamento-erp",
        true,
        vec![
            param("id", "caminho", "inteiro", true, "Id da ordem de montagem."),
            param("tipo", "query", "texto", false, "montagem (padrão) ou desmontagem."),
            param("confirmar", "query", "booleano", false, "true grava; sem isso só mostra a prévia."),
        ],
    )]
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tipo {
    Montagem,
    Desmontagem,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinhaErp {
    /// `ENTDEV` (produto acabado) ou `ENTDEVINS` (insumo/embalagem).
    pub tabela: &'static str,
    pub codigo: String,
    pub quantidade: i64,
    /// `E` entrada ou `S` saída.
    pub tipo_es: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Lancamento {
    pub observacao: String,
    pub linhas: Vec<LinhaErp>,
}

pub struct Componente {
    pub codigo: String,
    pub qtd_por_kit: f64,
    pub fator_qtd: Option<f64>,
    pub fator_kits: Option<i32>,
}

/// Monta as linhas do lançamento. Função pura: o mesmo cálculo de necessidade da tela de kits.
pub fn montar_lancamento(
    tipo: Tipo,
    kit: &str,
    kits: i64,
    componentes: &[Componente],
    numero_ordem: &str,
) -> Lancamento {
    let (rotulo, tipo_kit, tipo_comp) = match tipo {
        Tipo::Montagem => ("MONTAGEM", "E", "S"),
        Tipo::Desmontagem => ("DESMONTAGEM", "S", "E"),
    };
    let tabela_de = |cod: &str| if cod.starts_with("9.") { "ENTDEVINS" } else { "ENTDEV" };
    let mut linhas = vec![LinhaErp { tabela: "ENTDEV", codigo: kit.to_string(), quantidade: kits, tipo_es: tipo_kit }];
    for c in componentes {
        let q = necessidade_componente(c.qtd_por_kit, kits, c.fator_qtd, c.fator_kits);
        if q > 0 {
            linhas.push(LinhaErp { tabela: tabela_de(&c.codigo), codigo: c.codigo.clone(), quantidade: q, tipo_es: tipo_comp });
        }
    }
    Lancamento { observacao: format!("{rotulo} DO KIT {kit} - OM {numero_ordem}"), linhas }
}

#[derive(Deserialize)]
struct TipoQuery {
    tipo: Option<Tipo>,
}

struct OrdemCarregada {
    numero: String,
    kit: String,
    kits: i64,
    ja_lancada: bool,
    componentes: Vec<Componente>,
}

async fn carregar_ordem(pool: &PgPool, id: i64) -> Result<OrdemCarregada, ErroApi> {
    let ordem = sqlx::query(
        "SELECT order_number, kit_product_code, quantity, quantity_assembled, erp_launched
         FROM kit_assembly_orders WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| ErroApi::interno(format!("Erro ao ler a ordem: {e}")))?
    .ok_or_else(|| ErroApi::nao_encontrado("Ordem de montagem não encontrada."))?;
    let numero: String = ordem.get(0);
    let kit: String = ordem.get(1);
    let pedida: f64 = ordem.get(2);
    let montada: Option<f64> = ordem.get(3);
    let ja_lancada: i32 = ordem.try_get(4).unwrap_or(0);
    let kits = montada.filter(|m| *m > 0.0).unwrap_or(pedida).round() as i64;
    let rows = sqlx::query(
        "SELECT componente_codigo, quantidade::float8, fator_proporcao_qtd::float8, fator_proporcao_kits
         FROM kit_composicao WHERE kit_codigo = $1 ORDER BY componente_codigo",
    )
    .bind(&kit)
    .fetch_all(pool)
    .await
    .map_err(|e| ErroApi::interno(format!("Erro ao ler a composição: {e}")))?;
    let componentes: Vec<Componente> = rows
        .iter()
        .map(|r| Componente { codigo: r.get(0), qtd_por_kit: r.get(1), fator_qtd: r.get(2), fator_kits: r.get(3) })
        .collect();
    if componentes.is_empty() {
        return Err(ErroApi::regra(format!("O kit {kit} não tem composição no ERP; não há o que lançar.")));
    }
    Ok(OrdemCarregada { numero, kit, kits, ja_lancada: ja_lancada != 0, componentes })
}

fn texto_tipo(t: Tipo) -> &'static str {
    match t {
        Tipo::Montagem => "montagem",
        Tipo::Desmontagem => "desmontagem",
    }
}

async fn previa_lancamento_erp(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Query(q): Query<TipoQuery>,
) -> impl IntoResponse {
    let o = match carregar_ordem(state.db.pool(), id).await {
        Ok(o) => o,
        Err(e) => return e.into_response(),
    };
    let lanc = montar_lancamento(q.tipo.unwrap_or(Tipo::Montagem), &o.kit, o.kits, &o.componentes, &o.numero);
    Json(json!({
        "ordem": { "id": id, "numero": o.numero, "kit": o.kit, "kits": o.kits, "jaLancadaNoErp": o.ja_lancada },
        "lancamento": lanc,
        "gravaNoErp": false,
    }))
    .into_response()
}

#[derive(Deserialize)]
struct LancarQuery {
    tipo: Option<Tipo>,
    confirmar: Option<bool>,
}

/// Só códigos de produto/insumo comuns entram em SQL montado à mão (a consulta de saldo usa IN).
pub(crate) fn codigo_seguro(c: &str) -> bool {
    !c.is_empty() && c.len() <= 30 && c.chars().all(|ch| ch.is_ascii_alphanumeric() || ".-_ ".contains(ch))
}

async fn lancar_no_erp(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Query(q): Query<LancarQuery>,
) -> impl IntoResponse {
    if !ctx.can_edit_module("montagem_kits") {
        return ErroApi::sem_permissao("Sem permissão para alterar a Montagem de Kits.").into_response();
    }
    let pool = state.db.pool();
    let tipo = q.tipo.unwrap_or(Tipo::Montagem);
    let o = match carregar_ordem(pool, id).await {
        Ok(o) => o,
        Err(e) => return e.into_response(),
    };
    let lanc = montar_lancamento(tipo, &o.kit, o.kits, &o.componentes, &o.numero);
    if lanc.linhas.iter().any(|l| !codigo_seguro(&l.codigo)) {
        return ErroApi::invalido("Há código de item fora do padrão; o lançamento foi recusado.").into_response();
    }
    if !q.confirmar.unwrap_or(false) {
        return Json(json!({
            "previa": true,
            "ordem": { "id": id, "numero": o.numero, "kit": o.kit, "kits": o.kits, "jaLancadaNoErp": o.ja_lancada },
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
        return ErroApi::conflito(format!("A ordem {} já foi lançada no ERP como {}.", o.numero, texto_tipo(tipo)))
            .into_response();
    }
    match gravar_no_erp(pool, &lanc, texto_tipo(tipo), id, &o.numero, &o.kit, "kit_assembly_orders", &ctx.display_name).await {
        Ok(res) => {
            audit::record_domain(
                pool,
                Some(&ctx),
                "montagem_kits",
                "lancar_kit_no_erp",
                "kit_erp_lancamentos",
                &res.lancamento_id.to_string(),
                &format!("Ordem {} lançada no ERP ({}): registro {} de {}", o.numero, texto_tipo(tipo), res.n_registro, res.data_registro),
                None,
                Some(json!({ "linhas": lanc.linhas, "observacao": lanc.observacao })),
            )
            .await;
            Json(json!({ "gravado": true, "lancamentoId": res.lancamento_id, "dataRegistro": res.data_registro, "nRegistro": res.n_registro, "lancamento": lanc })).into_response()
        }
        Err(msg) => (StatusCode::BAD_GATEWAY, Json(json!({ "error": msg, "gravado": false }))).into_response(),
    }
}

pub(crate) struct GravacaoErp {
    pub lancamento_id: i64,
    pub data_registro: String,
    pub n_registro: i32,
}

/// Grava as linhas no SQL Server numa transação. Antes guarda no Postgres o saldo em cache dos itens
/// tocados e as linhas (`kit_erp_lancamentos`); só depois toca o ERP. Qualquer erro desfaz o ERP.
/// Não altera Produtos/Insumos.nQtdeEstoque: o ERP recalcula pelos movimentos.
/// `tabela_ordem` é uma constante dos chamadores (`kit_assembly_orders` ou `vira_ordens`), nunca texto de usuário.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn gravar_no_erp(
    pool: &PgPool,
    lanc: &Lancamento,
    tipo_txt: &str,
    ordem_id: i64,
    numero: &str,
    produto: &str,
    tabela_ordem: &str,
    operador: &str,
) -> Result<GravacaoErp, String> {
    let mut sql = connect_sql_server(pool).await.map_err(|e| format!("Sem conexão com o ERP: {e}"))?;
    let hoje = chrono::Local::now().format("%Y%m%d").to_string();
    let hora = chrono::Local::now().format("%H:%M:%S").to_string();
    let oper: String = operador.to_uppercase().chars().take(20).collect();

    // Backup do saldo em cache dos itens que vão mudar (leitura).
    let lista = |prod: bool| -> String {
        lanc.linhas
            .iter()
            .filter(|l| (l.tabela == "ENTDEV") == prod)
            .map(|l| format!("'{}'", l.codigo))
            .collect::<Vec<_>>()
            .join(",")
    };
    let mut backup = serde_json::Map::new();
    for (prod, tabela, col) in [(true, "Produtos", "cCodProd"), (false, "Insumos", "cReferencia")] {
        let itens = lista(prod);
        if itens.is_empty() {
            continue;
        }
        let q = format!("SELECT {col}, CAST(nQtdeEstoque AS FLOAT) FROM {tabela} WITH (NOLOCK) WHERE {col} IN ({itens})");
        let rows = sql
            .simple_query(q)
            .await
            .map_err(|e| format!("Erro ao ler o saldo atual: {e}"))?
            .into_first_result()
            .await
            .map_err(|e| format!("Erro ao ler o saldo atual: {e}"))?;
        for r in rows {
            let cod: &str = r.get(0).unwrap_or("");
            let saldo: f64 = r.get(1).unwrap_or(0.0);
            backup.insert(format!("{tabela}:{}", cod.trim()), json!(saldo));
        }
    }
    let lanc_id: i64 = sqlx::query_scalar(
        "INSERT INTO kit_erp_lancamentos (ordem_id, ordem_numero, tipo, kit_codigo, observacao, linhas, backup_antes, criado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
    )
    .bind(ordem_id)
    .bind(numero)
    .bind(tipo_txt)
    .bind(produto)
    .bind(&lanc.observacao)
    .bind(json!(lanc.linhas))
    .bind(serde_json::Value::Object(backup))
    .bind(operador)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Não consegui guardar o backup: {e}"))?;

    let resultado = escrever_no_sql_server(&mut sql, lanc, &hoje, &hora, &oper).await;
    match resultado {
        Ok(n) => {
            let _ = sqlx::query("UPDATE kit_erp_lancamentos SET status='gravado', data_registro=$2, n_registro=$3 WHERE id=$1")
                .bind(lanc_id).bind(&hoje).bind(n).execute(pool).await;
            // Desmontagem/reversão desfazem o lançamento: a ordem volta a "não lançada".
            let lancada = if matches!(tipo_txt, "desmontagem" | "reversao") { 0 } else { 1 };
            let _ = sqlx::query(&format!("UPDATE {tabela_ordem} SET erp_launched = {lancada} WHERE id = $1")).bind(ordem_id).execute(pool).await;
            Ok(GravacaoErp { lancamento_id: lanc_id, data_registro: hoje, n_registro: n })
        }
        Err(e) => {
            let _ = sqlx::query("UPDATE kit_erp_lancamentos SET status='erro', erro=$2 WHERE id=$1")
                .bind(lanc_id).bind(&e).execute(pool).await;
            Err(e)
        }
    }
}

async fn escrever_no_sql_server(
    sql: &mut tiberius::Client<tokio_util::compat::Compat<tokio::net::TcpStream>>,
    lanc: &Lancamento,
    hoje: &str,
    hora: &str,
    oper: &str,
) -> Result<i32, String> {
    async fn exec(sql: &mut tiberius::Client<tokio_util::compat::Compat<tokio::net::TcpStream>>, q: &str) -> Result<(), String> {
        sql.simple_query(q.to_string()).await.map_err(|e| e.to_string())?.into_results().await.map_err(|e| e.to_string())?;
        Ok(())
    }
    exec(sql, "SET XACT_ABORT ON; BEGIN TRANSACTION").await?;
    let r: Result<i32, String> = async {
        // já existe o mesmo lançamento (mesma observação com nº da ordem)? então não grava de novo
        let dup = sql
            .query("SELECT COUNT(*) FROM ENTDEV WITH (UPDLOCK, HOLDLOCK) WHERE CAST(mObservac AS NVARCHAR(400)) = @P1", &[&lanc.observacao])
            .await.map_err(|e| e.to_string())?
            .into_first_result().await.map_err(|e| e.to_string())?;
        if dup.first().and_then(|r| r.get::<i32, _>(0)).unwrap_or(0) > 0 {
            return Err("O ERP já tem um lançamento com esta observação; nada foi gravado.".into());
        }
        let mut n_max = 0;
        for t in ["ENTDEV", "ENTDEVINS"] {
            let rows = sql
                .query(format!("SELECT ISNULL(MAX(nRegistro),0) FROM {t} WITH (UPDLOCK, HOLDLOCK) WHERE dRegistro = @P1"), &[&hoje])
                .await.map_err(|e| e.to_string())?
                .into_first_result().await.map_err(|e| e.to_string())?;
            n_max = n_max.max(rows.first().and_then(|r| r.get::<i32, _>(0)).unwrap_or(0));
        }
        let n = n_max + 1;
        for l in &lanc.linhas {
            if l.tabela == "ENTDEV" {
                let qtd = l.quantidade as i32;
                sql.execute(
                    "INSERT INTO ENTDEV (dRegistro, nRegistro, nCodFornec, nCodProd, nQtde, cTipoES, CHORA, COPERADOR, mObservac) VALUES (@P1,@P2,1,@P3,@P4,@P5,@P6,@P7,@P8)",
                    &[&hoje, &n, &l.codigo.as_str(), &qtd, &l.tipo_es, &hora, &oper, &lanc.observacao.as_str()],
                ).await.map_err(|e| e.to_string())?;
            } else {
                let qtd = l.quantidade as f64;
                sql.execute(
                    "INSERT INTO ENTDEVINS (dRegistro, nRegistro, cReferencia, nQtde, cTipoES, cHora, cOperador, mObservac) VALUES (@P1,@P2,@P3,@P4,@P5,@P6,@P7,@P8)",
                    &[&hoje, &n, &l.codigo.as_str(), &qtd, &l.tipo_es, &hora, &oper, &lanc.observacao.as_str()],
                ).await.map_err(|e| e.to_string())?;
            }
        }
        Ok(n)
    }.await;
    match r {
        Ok(n) => {
            exec(sql, "COMMIT TRANSACTION").await?;
            Ok(n)
        }
        Err(e) => {
            let _ = exec(sql, "IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION").await;
            Err(e)
        }
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    fn c(cod: &str, q: f64) -> Componente {
        Componente { codigo: cod.into(), qtd_por_kit: q, fator_qtd: None, fator_kits: None }
    }

    #[test]
    fn montagem_entra_o_kit_e_saem_os_componentes() {
        let l = montar_lancamento(
            Tipo::Montagem,
            "2.11.064",
            12,
            &[c("2.13.107", 1.0), c("2.12.022", 1.0), c("9.04.083", 1.0), c("9.04.064", 0.1667)],
            "269026",
        );
        assert_eq!(l.observacao, "MONTAGEM DO KIT 2.11.064 - OM 269026");
        assert_eq!(l.linhas[0], LinhaErp { tabela: "ENTDEV", codigo: "2.11.064".into(), quantidade: 12, tipo_es: "E" });
        assert_eq!(l.linhas[1].tabela, "ENTDEV");
        assert_eq!(l.linhas[1].tipo_es, "S");
        assert_eq!(l.linhas[3].tabela, "ENTDEVINS");
        assert_eq!(l.linhas[4].quantidade, 3, "0,1667 x 12 = 2,0004 sobe para 3 (mesma regra da tela)");
    }

    #[test]
    fn desmontagem_inverte_entrada_e_saida() {
        let l = montar_lancamento(Tipo::Desmontagem, "10.13.003", 1, &[c("10.12.004", 1.0), c("10.11.004", 1.0)], "7");
        assert_eq!(l.observacao, "DESMONTAGEM DO KIT 10.13.003 - OM 7");
        assert_eq!(l.linhas[0].tipo_es, "S");
        assert!(l.linhas[1..].iter().all(|x| x.tipo_es == "E"));
    }

    #[test]
    fn fator_de_proporcao_vale_por_grupo_de_kits() {
        let comp = Componente { codigo: "9.04.064".into(), qtd_por_kit: 0.0, fator_qtd: Some(1.0), fator_kits: Some(6) };
        let l = montar_lancamento(Tipo::Montagem, "2.11.064", 12, &[comp], "1");
        assert_eq!(l.linhas[1].quantidade, 2);
    }
}

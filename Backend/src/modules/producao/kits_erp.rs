//! Lançamento da montagem/desmontagem de kit no ERP (ENTDEV / ENTDEVINS), SÓ PRÉVIA.
//! Formato levantado em 2026-11-05 (ai-memory `concepts/erp-montagem-kits`): uma linha E do kit e uma
//! linha S por componente (produto acabado em ENTDEV, insumo/embalagem `9.*` em ENTDEVINS), mesmo
//! `nRegistro`/hora e observação `MONTAGEM DO KIT <cód> - OM <nº da ordem>`. Desmontagem inverte E/S.
//! Esta rota NÃO grava no ERP; a gravação só entra depois da prova contra uma cópia do ERP.

use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Row;
use std::sync::Arc;

use crate::core::acao::ErroApi;
use crate::core::catalogo::{param, Acao};
use crate::handlers::AppState;
use crate::modules::producao::kits::necessidade_componente;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/kits/orders/:id/lancamento-erp", get(previa_lancamento_erp))
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

async fn previa_lancamento_erp(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Query(q): Query<TipoQuery>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let ordem = sqlx::query(
        "SELECT order_number, kit_product_code, quantity, quantity_assembled, erp_launched
         FROM kit_assembly_orders WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await;
    let ordem = match ordem {
        Ok(Some(r)) => r,
        Ok(None) => return ErroApi::nao_encontrado("Ordem de montagem não encontrada.").into_response(),
        Err(e) => return ErroApi::interno(format!("Erro ao ler a ordem: {e}")).into_response(),
    };
    let numero: String = ordem.get(0);
    let kit: String = ordem.get(1);
    let pedida: f64 = ordem.get(2);
    let montada: Option<f64> = ordem.get(3);
    let ja_lancada: i32 = ordem.try_get(4).unwrap_or(0);
    let kits = montada.filter(|m| *m > 0.0).unwrap_or(pedida).round() as i64;

    let comps = sqlx::query(
        "SELECT componente_codigo, quantidade::float8, fator_proporcao_qtd::float8, fator_proporcao_kits
         FROM kit_composicao WHERE kit_codigo = $1 ORDER BY componente_codigo",
    )
    .bind(&kit)
    .fetch_all(pool)
    .await;
    let comps: Vec<Componente> = match comps {
        Ok(rows) => rows
            .iter()
            .map(|r| Componente {
                codigo: r.get(0),
                qtd_por_kit: r.get(1),
                fator_qtd: r.get(2),
                fator_kits: r.get(3),
            })
            .collect(),
        Err(e) => return ErroApi::interno(format!("Erro ao ler a composição: {e}")).into_response(),
    };
    if comps.is_empty() {
        return ErroApi::regra(format!("O kit {kit} não tem composição no ERP; não há o que lançar.")).into_response();
    }
    let lanc = montar_lancamento(q.tipo.unwrap_or(Tipo::Montagem), &kit, kits, &comps, &numero);
    Json(json!({
        "ordem": { "id": id, "numero": numero, "kit": kit, "kits": kits, "jaLancadaNoErp": ja_lancada != 0 },
        "lancamento": lanc,
        "gravaNoErp": false,
    }))
    .into_response()
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

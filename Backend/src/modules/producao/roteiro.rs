//! Roteiro do planejamento para o agente de IA (`GET /api/producao/planejamento/roteiro`).
//!
//! Mesmo modelo de `qualidade/pops/normas.rs`: texto fixo no código + as regras gerais ativas da tabela
//! `producao_regras` + a lista de ações do planejamento gerada do catálogo (`acoes()`), para nunca ficar
//! diferente do código. Só descreve o caminho; não cria regra.

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::core::acao::ErroApi;
use crate::core::catalogo::Acao;
use crate::handlers::AppState;
use crate::modules::producao::{cobertura, contexto, fila, planejamento, regras};

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/producao/planejamento/roteiro", get(roteiro_rota))
}

/// Ações do roteiro descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<Acao> {
    vec![Acao::leitura(
        "roteiro_planejamento_producao",
        "planejamento_producao",
        "Roteiro do agente do planejamento: os passos para preencher um dia da semana, as regras gerais ativas e as ações do planejamento. Comece por aqui.",
        "/api/producao/planejamento/roteiro",
        vec![],
    )]
}

const PASSOS: &[&str] = &[
    "1. Leia este roteiro e as regras (`listar_regras_producao`). Regra geral só o Edson muda.",
    "2. Leia a semana (`listar_planejamento_semana`), a fila (`listar_fila_demandas`) e a cobertura (`obter_cobertura_semana`).",
    "3. Para cada candidato, leia o contexto do produto (`contexto_produto_producao`): estoque, vendas, últimos lotes, fila, regras e anotações.",
    "4. Simule (`simular_candidatos_cobertura`) antes de propor: só entra no dia o que tem 100% dos insumos e embalagens cobertos.",
    "5. Grave em 2 passos, um dia por vez, com motivo: primeiro sem confirmar (prévia), depois com confirmar=true (`gravar_ordens_planejamento`, `enviar_para_fila`).",
    "6. Registre o que aprendeu como anotação do produto (`criar_regra_producao` com tipo anotacao). Nunca mude regra geral sem o Edson.",
];

fn linha_da_acao(a: &Acao) -> String {
    format!("{} — {} ({} {})", a.nome, a.descricao, a.metodo, a.caminho)
}

/// Ações do planejamento, leituras primeiro (do catálogo dos módulos que o agente usa).
fn acoes_do_planejamento() -> Vec<Acao> {
    let mut v = Vec::new();
    v.extend(acoes());
    v.extend(regras::acoes());
    v.extend(contexto::acoes());
    v.extend(planejamento::acoes());
    v.extend(fila::acoes());
    v.extend(cobertura::acoes());
    v
}

/// Monta o roteiro a partir das regras gerais ativas (texto) e do catálogo.
pub fn montar(regras_gerais: &[String]) -> Value {
    let todas = acoes_do_planejamento();
    let mut itens_acoes: Vec<String> = todas.iter().filter(|a| !a.escrita).map(linha_da_acao).collect();
    itens_acoes.extend(todas.iter().filter(|a| a.escrita).map(linha_da_acao));
    json!({
        "titulo": "Roteiro do planejamento semanal da produção",
        "blocos": [
            { "titulo": "Passos", "itens": PASSOS },
            { "titulo": "Regras gerais (ativas)", "itens": regras_gerais },
            {
                "titulo": "Como escrever",
                "itens": [
                    "Toda escrita é em 2 passos: sem confirmar=true a rota só devolve a prévia do que mudaria; com confirmar=true grava.",
                    "Toda gravação registra quem fez (operador ou agente) na auditoria. Nada se apaga: regra e anotação se arquivam.",
                    "Anotação é contexto do produto (o que o histórico ensinou); regra é o que o planejamento deve seguir.",
                ],
            },
            { "titulo": "Ações", "itens": itens_acoes },
        ],
    })
}

/// Serviço: o roteiro com as regras gerais que estão ativas agora.
pub async fn roteiro(pool: &sqlx::PgPool) -> Result<Value, ErroApi> {
    let gerais: Vec<String> = regras::listar(pool, Some("geral"), None, false)
        .await?
        .into_iter()
        .map(|r| if r.tipo == "regra" { r.texto } else { format!("(anotação) {}", r.texto) })
        .collect();
    Ok(montar(&gerais))
}

async fn roteiro_rota(State(state): State<Arc<AppState>>) -> Result<Response, ErroApi> {
    Ok((StatusCode::OK, Json(roteiro(state.db.pool()).await?)).into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roteiro_tem_passos_regras_e_acoes_do_catalogo() {
        let v = montar(&["Regra um.".to_string()]);
        let blocos = v["blocos"].as_array().unwrap();
        assert!(blocos.iter().all(|b| !b["itens"].as_array().unwrap().is_empty()));
        assert_eq!(blocos[0]["titulo"], "Passos");
        assert_eq!(blocos[1]["itens"][0], "Regra um.");
        let txt = blocos.last().unwrap()["itens"].to_string();
        for esperado in [
            "/api/producao/planejamento/roteiro",
            "/api/producao/regras",
            "/api/producao/produtos/:codigo/contexto",
            "/api/producao/planejamento-semanal/bulk",
            "/api/producao/fila-demandas",
            "/api/producao/cobertura/simular",
        ] {
            assert!(txt.contains(esperado), "falta {esperado}");
        }
    }

    #[test]
    fn passos_citam_so_acoes_que_existem_no_catalogo() {
        let nomes: Vec<&str> = crate::core::catalogo::todas().iter().map(|a| a.nome).collect();
        let texto = PASSOS.join(" ");
        for parte in texto.split('`').skip(1).step_by(2) {
            assert!(nomes.contains(&parte), "o roteiro cita `{parte}`, que não está no catálogo");
        }
    }
}

//! Linha de Produtos (config_linhas): troca de prefixo em 2 passos e resumo de dados da linha (só leitura).
mod handlers;
pub mod prefixo;
pub mod resumo;

use std::sync::Arc;
use axum::{routing::{get, post}, Router};
use crate::core::catalogo::{param, Acao};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/admin/produtos-ativos/linhas/prefixo", post(handlers::trocar_prefixo))
        .route("/api/admin/produtos-ativos/linhas/:prefixo/resumo", get(handlers::resumo))
}

/// Ações descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<Acao> {
    const M: &str = "admin_linha_produtos";
    vec![
        Acao::gravacao(
            "renomear_prefixo_linha",
            M,
            "Troca o prefixo de uma linha de produtos (o prefixo é a chave da linha). Os produtos que passam a casar com o prefixo novo entram na linha, os que deixam de casar saem (voltam para outra linha ou DEFAULT); os ajustes manuais de linha e as regras de produção da linha acompanham. Recusa prefixo vazio, DEFAULT e o já usado por outra linha. Sem `confirmar=true` devolve só a prévia (quem entra, quem sai, quantos ajustes manuais mudam); com `confirmar=true` grava tudo numa transação e audita antes e depois.",
            "POST",
            "/api/admin/produtos-ativos/linhas/prefixo",
            true,
            vec![
                param("confirmar", "query", "booleano", false, "true grava; ausente só mostra a prévia."),
                param("prefixoAtual", "corpo", "texto", true, "Prefixo atual da linha."),
                param("prefixoNovo", "corpo", "texto", true, "Prefixo novo (letras, números, ponto, hífen, sublinhado; ex.: 9.15)."),
            ],
        ),
        Acao::leitura(
            "resumo_linha_produtos",
            M,
            "Dados de uma linha: vendas em unidades por mês (12 meses) e os produtos que mais vendem; estoque, produtos abaixo do gatilho e faltas de venda (os mesmos números da Demanda de Produção); produção dos últimos 6 meses, o que está planejado e o que está na fila. Sem faturamento em R$.",
            "/api/admin/produtos-ativos/linhas/:prefixo/resumo",
            vec![param("prefixo", "caminho", "texto", true, "Prefixo da linha.")],
        ),
    ]
}

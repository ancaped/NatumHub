mod handlers;

use std::sync::Arc;
use axum::{routing::get, Router};
use crate::core::catalogo::{param, Acao};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/admin/produtos-ativos/relatorio",
            get(handlers::relatorio_produtos_ativos),
        )
        .route(
            "/api/admin/produtos-ativos/sem-linha",
            get(handlers::prefixos_sem_linha),
        )
}

/// Ações do relatório de produtos ativos descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<Acao> {
    vec![
        Acao::leitura(
            "prefixos_sem_linha",
            "admin_linha_produtos",
            "Prefixos de código com produtos ativos que ainda estão em Outros/Geral por não terem linha cadastrada, com a quantidade de produtos e um exemplo de cada. Use para saber quais linhas faltam cadastrar.",
            "/api/admin/produtos-ativos/sem-linha",
            vec![],
        ),
        Acao::leitura(
        "relatorio_produtos_ativos",
        "admin_linha_produtos",
        "Relatório dos produtos ativos agrupados por linha e categoria, com estoque e status de cada um. Filtre por `linha`, `categoria`, `search` (código ou descrição) e `includeTerceirizados`. Use para uma visão geral do portfólio ativo; para um produto só use `detalhar_produto`.",
        "/api/admin/produtos-ativos/relatorio",
        vec![
            param("linha", "query", "texto", false, "Prefixo da linha (ALL ou vazio = todas)."),
            param("categoria", "query", "texto", false, "Categoria (ALL ou vazio = todas)."),
            param("includeTerceirizados", "query", "booleano", false, "Inclui produtos terceirizados."),
            param("search", "query", "texto", false, "Parte do código ou da descrição."),
        ],
        ),
    ]
}

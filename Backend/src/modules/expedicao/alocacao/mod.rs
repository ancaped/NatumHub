pub mod calculo;
pub mod handlers;
pub mod models;
pub mod service;

use std::sync::Arc;
use axum::{
    routing::{delete, get, post, put},
    Router,
};

use crate::core::catalogo::{param, Acao};
use crate::handlers::AppState;

const FAMILIAS: &[&str] = &["expedicao_alocacao", "expedicao_ecommerce", "expedicao"];

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/expedicao/alocacao/painel", get(handlers::get_painel))
        .route("/api/expedicao/alocacao/clientes-sugestao", get(handlers::get_clientes_sugestao))
        .route("/api/expedicao/alocacao/estruturas", post(handlers::post_estrutura))
        .route(
            "/api/expedicao/alocacao/estruturas/:id",
            put(handlers::put_estrutura).delete(handlers::delete_estrutura),
        )
        .route(
            "/api/expedicao/alocacao/estruturas/:id/gerar-grade",
            post(handlers::post_gerar_grade),
        )
        .route(
            "/api/expedicao/alocacao/posicoes/:id",
            put(handlers::put_posicao).delete(handlers::delete_posicao),
        )
        .route("/api/expedicao/alocacao/caixas", post(handlers::post_caixa))
        .route(
            "/api/expedicao/alocacao/caixas/:id",
            put(handlers::put_caixa).delete(handlers::delete_caixa),
        )
        .route(
            "/api/expedicao/alocacao/produtos/:codigo/caixa",
            put(handlers::put_produto_caixa),
        )
        .route("/api/expedicao/alocacao/atacadistas", post(handlers::post_atacadista))
        .route(
            "/api/expedicao/alocacao/atacadistas/:id",
            put(handlers::put_atacadista).delete(handlers::delete_atacadista),
        )
        .route("/api/expedicao/alocacao/alocacoes", post(handlers::post_alocacao))
        .route("/api/expedicao/alocacao/alocacoes/:id", delete(handlers::delete_alocacao))
        .route("/api/expedicao/alocacao/sugerir", post(handlers::post_sugerir))
        .route("/api/expedicao/alocacao/mover", post(handlers::post_mover_alocacao))
        .route(
            "/api/expedicao/alocacao/produtos-lote",
            post(handlers::post_produtos_caixa_lote),
        )
        .route("/api/expedicao/alocacao/importar-lote", post(handlers::post_importar_lote))
}

pub fn acoes() -> Vec<Acao> {
    vec![
        Acao::leitura(
            "consultar_painel_alocacao_expedicao",
            "expedicao_alocacao",
            "Retorna o painel completo da Alocação e Endereços da Expedição: estruturas e posições (vãos A1..G12 com ocupação cm/% e itens), caixas cadastradas, clientes atacadistas, Curva ABC com demanda Varejo × Atacado, estoque atual, diagnóstico de caixas do ERP e resumo geral.",
            "/api/expedicao/alocacao/painel",
            vec![
                param("estruturaId", "query", "texto", false, "Id da estrutura física (padrão: primeira estrutura ativa)."),
                param("janelaMeses", "query", "inteiro", false, "Janela de vendas em meses (1 a 36; padrão 12)."),
                param("metaMeses", "query", "número", false, "Meta de cobertura em meses (padrão 2.0)."),
                param("usarMetaLinha", "query", "booleano", false, "Se true, usa o estoqueIdealMult da linha quando disponível."),
                param("incluirInativos", "query", "booleano", false, "Se true, inclui produtos inativos/ocultos."),
            ],
        )
        .com_familias(FAMILIAS),
        Acao::leitura(
            "listar_clientes_sugestao_expedicao",
            "expedicao_alocacao",
            "Lista os principais clientes reais dos pedidos do ERP na janela (código, nome, quantidade de pedidos e unidades) indicando quem já corresponde às regras de atacadista da Expedição. Útil para cadastrar ou vincular novos atacadistas.",
            "/api/expedicao/alocacao/clientes-sugestao",
            vec![
                param("search", "query", "texto", false, "Filtro por parte do nome ou código do cliente."),
                param("janelaMeses", "query", "inteiro", false, "Janela de vendas em meses (padrão 12)."),
            ],
        )
        .com_familias(FAMILIAS),
    ]
}

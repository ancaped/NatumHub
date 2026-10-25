pub mod generator;
pub mod handlers;
pub mod models;

use axum::{
    routing::{get, post},
    Router,
};
use std::sync::Arc;
use crate::core::catalogo::{param, Acao};
use crate::handlers::AppState;

/// Ações de consulta dos PROC (processos) descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<Acao> {
    const M: &str = "producao_proc";
    vec![
        Acao::leitura(
            "listar_procs",
            M,
            "Lista os PROC (processos) de produtos, com totais por status.",
            "/api/producao/proc",
            vec![
                param("search", "query", "texto", false, "Código do produto ou descrição."),
                param("status", "query", "texto", false, "Status do PROC."),
                param("categoria", "query", "texto", false, "Categoria/família."),
                param("limit", "query", "inteiro", false, "Máximo de itens (até 500; padrão 100)."),
                param("offset", "query", "inteiro", false, "Quantos itens pular."),
            ],
        ),
        Acao::leitura(
            "mapa_procs",
            M,
            "Mapa de todos os PROC por produto (código, PROC, status, família e instruções do processo).",
            "/api/producao/proc/map",
            vec![],
        ),
        Acao::leitura(
            "resumo_procs",
            M,
            "Totais dos PROC por status.",
            "/api/producao/proc/summary",
            vec![],
        ),
        Acao::leitura(
            "obter_proc",
            M,
            "Um PROC pelo id.",
            "/api/producao/proc/:id",
            vec![param("id", "caminho", "texto", true, "Id do PROC.")],
        ),
    ]
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/producao/proc",
            get(handlers::list_procs).post(handlers::create_proc),
        )
        .route("/api/producao/proc/map", get(handlers::get_proc_map))
        .route(
            "/api/producao/proc/summary",
            get(handlers::get_proc_summary),
        )
        .route(
            "/api/producao/proc/generate",
            post(handlers::generate_proc_handler),
        )
        .route(
            "/api/producao/proc/:id",
            get(handlers::get_proc_by_id)
                .put(handlers::update_proc)
                .delete(handlers::delete_proc),
        )
}

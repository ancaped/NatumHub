//! Classificação do produto (dono: Administrativo > Linha de Produtos): status, categoria, base e linha.
//! Endpoint de ação com lista fechada de campos, 2 passos e auditoria (antes/depois). Os demais campos de
//! `overrides_produtos` (parâmetros PCP, estoque ideal...) têm outros donos e não passam por aqui.
mod handlers;
pub mod atendimento;

pub use handlers::classificar_produto;

use std::sync::Arc;
use axum::{routing::post, Router};
use crate::core::catalogo::{param, Acao};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/admin/produtos-ativos/classificacao", post(handlers::classificar))
}

/// Ação descrita para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<Acao> {
    vec![Acao::gravacao(
        "classificar_produto",
        "admin_linha_produtos",
        "Altera a classificação de UM produto: situação (ativo, lancamento, saindo_de_linha, descontinuado = inativo), atendimento (estoque, encomenda ou terceirizado; vazio herda o da linha; só estoque gera demanda de produção e de insumo), categoria, base (código do produto base) e linha (prefixo manual). `status_produto` ainda é aceito como nome antigo da situação (\"terceirizado\" vira ativo + atendimento terceirizado). Só os campos enviados mudam; enviar `null` limpa o campo (linha vazia volta ao automático; situação vazia vale ativo). Sem `confirmar=true` devolve só a prévia (antes, depois e o que muda). Registra quem alterou na auditoria.",
        "POST",
        "/api/admin/produtos-ativos/classificacao",
        true,
        vec![
            param("confirmar", "query", "booleano", false, "true grava; ausente só mostra a prévia."),
            param("codigo", "corpo", "texto", true, "Código do produto."),
            param("situacao", "corpo", "texto", false, "ativo, lancamento, saindo_de_linha ou descontinuado (inativo); null vale ativo."),
            param("atendimento", "corpo", "texto", false, "estoque, encomenda ou terceirizado; null herda o atendimento da linha."),
            param("categoria_produto", "corpo", "texto", false, "Id da categoria; null limpa."),
            param("base_codigo", "corpo", "texto", false, "Código do produto base; null limpa."),
            param("linha_prefix_manual", "corpo", "texto", false, "Prefixo de uma linha existente; null volta ao automático."),
        ],
    )]
}

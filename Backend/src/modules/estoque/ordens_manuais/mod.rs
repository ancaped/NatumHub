pub mod handlers;
pub mod models;
pub mod servicos;

use std::sync::Arc;
use axum::{
    routing::{delete, get, post},
    Router,
};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/estoque/ordens-manuais",
            get(handlers::list_orders).post(handlers::create_order),
        )
        .route(
            "/api/estoque/ordens-manuais/itens/busca",
            get(handlers::search_items),
        )
        .route(
            "/api/estoque/ordens-manuais/pendencias/por-item",
            get(handlers::pending_by_item),
        )
        .route(
            "/api/estoque/ordens-manuais/tipos",
            get(handlers::list_record_types).post(handlers::create_record_type),
        )
        .route(
            "/api/estoque/ordens-manuais/tipos/:id",
            delete(handlers::delete_record_type),
        )
        // Registros (folhas) antes de /:id
        .route(
            "/api/estoque/ordens-manuais/registros",
            get(handlers::list_sheet_registers),
        )
        .route(
            "/api/estoque/ordens-manuais/registros/bloco",
            post(handlers::create_sheet_block),
        )
        .route(
            "/api/estoque/ordens-manuais/registros/:id",
            get(handlers::get_sheet_register),
        )
        .route(
            "/api/estoque/ordens-manuais/registros/:id/conferir",
            post(handlers::conferir_sheet_register),
        )
        .route(
            "/api/estoque/ordens-manuais/registros/:id/reabrir",
            post(handlers::reabrir_sheet_register),
        )
        .route(
            "/api/estoque/ordens-manuais/:id",
            get(handlers::get_order)
                .put(handlers::update_order)
                .delete(handlers::delete_order),
        )
        .route(
            "/api/estoque/ordens-manuais/:id/postar",
            post(handlers::post_order),
        )
        .route(
            "/api/estoque/ordens-manuais/:id/reabrir",
            post(handlers::reopen_order),
        )
}

/// Ações das Ordens Manuais descritas para agentes (ver `core::catalogo`). Escritas em 2 passos e auditadas.
pub fn acoes() -> Vec<crate::core::catalogo::Acao> {
    use crate::core::catalogo::{param, Acao};
    let confirmar = || param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia.");
    vec![
        Acao::leitura(
            "listar_ordens_manuais",
            "estoque_ordens_manuais",
            "Lista as ordens manuais de entrada/saída de estoque com itens e status (OPEN ou POSTED).",
            "/api/estoque/ordens-manuais",
            vec![
                param("status", "query", "texto", false, "OPEN ou POSTED."),
                param("kind", "query", "texto", false, "entrada ou saida."),
                param("q", "query", "texto", false, "Texto de busca."),
            ],
        ),
        Acao::gravacao(
            "criar_ordem_manual",
            "estoque_ordens_manuais",
            "Cria uma ordem manual aberta (entrada ou saída de insumos fora do ERP). A prévia mostra a ordem com o número.",
            "POST",
            "/api/estoque/ordens-manuais",
            true,
            vec![
                param("kind", "corpo", "texto", true, "entrada ou saida."),
                param("recordType", "corpo", "texto", true, "Tipo de registro (ex.: Venda, Uso/Interno)."),
                param("partnerName", "corpo", "texto", true, "Pessoa ou empresa."),
                param("items", "corpo", "lista", true, "Itens: itemCode, qty, description, unit, notes."),
                param("orderDate", "corpo", "data", false, "AAAA-MM-DD (hoje por padrão)."),
                confirmar(),
            ],
        ),
        Acao::gravacao(
            "atualizar_ordem_manual",
            "estoque_ordens_manuais",
            "Edita uma ordem manual aberta (só OPEN).",
            "PUT",
            "/api/estoque/ordens-manuais/:id",
            true,
            vec![param("id", "caminho", "inteiro", true, "Id da ordem."), confirmar()],
        ),
        Acao::gravacao(
            "excluir_ordem_manual",
            "estoque_ordens_manuais",
            "Exclui uma ordem manual aberta (só OPEN).",
            "DELETE",
            "/api/estoque/ordens-manuais/:id",
            true,
            vec![param("id", "caminho", "inteiro", true, "Id da ordem."), confirmar()],
        ),
        Acao::gravacao(
            "postar_ordem_manual",
            "estoque_ordens_manuais",
            "Lança a ordem (OPEN para POSTED): ela deixa de contar como pendente de entrada/saída no MRP.",
            "POST",
            "/api/estoque/ordens-manuais/:id/postar",
            true,
            vec![param("id", "caminho", "inteiro", true, "Id da ordem."), confirmar()],
        ),
        Acao::gravacao(
            "reabrir_ordem_manual",
            "estoque_ordens_manuais",
            "Reabre uma ordem lançada (POSTED para OPEN): volta a contar como pendente no MRP.",
            "POST",
            "/api/estoque/ordens-manuais/:id/reabrir",
            true,
            vec![param("id", "caminho", "inteiro", true, "Id da ordem."), confirmar()],
        ),
        Acao::gravacao(
            "criar_tipo_registro_ordem_manual",
            "estoque_ordens_manuais",
            "Cadastra um tipo de registro de ordem manual.",
            "POST",
            "/api/estoque/ordens-manuais/tipos",
            true,
            vec![param("name", "corpo", "texto", true, "Nome do tipo."), confirmar()],
        ),
        Acao::gravacao(
            "excluir_tipo_registro_ordem_manual",
            "estoque_ordens_manuais",
            "Remove um tipo de registro de ordem manual.",
            "DELETE",
            "/api/estoque/ordens-manuais/tipos/:id",
            true,
            vec![param("id", "caminho", "inteiro", true, "Id do tipo."), confirmar()],
        ),
        Acao::gravacao(
            "criar_bloco_folhas_ordem_manual",
            "estoque_ordens_manuais",
            "Gera um bloco de folhas numeradas de Controle de Entrada/Saída de Insumo (CEI/CSI).",
            "POST",
            "/api/estoque/ordens-manuais/registros/bloco",
            true,
            vec![
                param("kind", "corpo", "texto", true, "entrada ou saida."),
                param("quantity", "corpo", "inteiro", true, "Quantidade de folhas (1 a 100)."),
                confirmar(),
            ],
        ),
        Acao::gravacao(
            "conferir_folha_ordem_manual",
            "estoque_ordens_manuais",
            "Marca uma folha de registro como conferida.",
            "POST",
            "/api/estoque/ordens-manuais/registros/:id/conferir",
            true,
            vec![param("id", "caminho", "inteiro", true, "Id da folha."), confirmar()],
        ),
        Acao::gravacao(
            "reabrir_folha_ordem_manual",
            "estoque_ordens_manuais",
            "Reabre uma folha de registro conferida.",
            "POST",
            "/api/estoque/ordens-manuais/registros/:id/reabrir",
            true,
            vec![param("id", "caminho", "inteiro", true, "Id da folha."), confirmar()],
        ),
    ]
}

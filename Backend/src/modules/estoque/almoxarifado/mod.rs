pub mod handlers;
pub mod models;
pub mod store;

use std::sync::Arc;
use axum::{
    routing::{get, post, put, delete},
    Router,
};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/almox/dashboard/stats", get(handlers::get_dashboard_stats))
        .route("/api/almox/items", get(handlers::list_items))
        .route("/api/almox/items/search", get(handlers::search_catalog))
        .route("/api/almox/items/link", post(handlers::link_erp_item))
        .route("/api/almox/items/local", post(handlers::create_local_item))
        .route("/api/almox/items/:code", get(handlers::get_item).delete(handlers::delete_item))
        .route(
            "/api/almox/items/:code/config",
            put(handlers::upsert_item_config),
        )
        .route(
            "/api/almox/items/:code/stats",
            get(handlers::get_item_stats),
        )
        .route(
            "/api/almox/items/:code/seed-from-erp",
            post(handlers::seed_from_erp),
        )
        .route(
            "/api/almox/items/:code/consumption",
            get(handlers::get_item_consumption),
        )
        .route(
            "/api/almox/fotos/:entity_type/:entity_id",
            get(handlers::list_fotos).post(handlers::add_foto),
        )
        .route(
            "/api/almox/fotos/:id",
            delete(handlers::delete_foto),
        )
        .route(
            "/api/almox/familias",
            get(handlers::list_familias).post(handlers::upsert_familia),
        )
        .route(
            "/api/almox/familias/:id",
            delete(handlers::delete_familia),
        )
        .route(
            "/api/almox/movements",
            get(handlers::list_movements).post(handlers::create_movement),
        )
        .route("/api/almox/counts/latest", get(handlers::latest_stock_count))
        .route("/api/almox/counts", post(handlers::apply_stock_count))
        .route("/api/almox/replenishment", get(handlers::list_replenishment))
        .route(
            "/api/almox/demands",
            get(handlers::list_demands).post(handlers::create_demand),
        )
        .route(
            "/api/almox/print-sequence",
            get(handlers::get_print_sequence).post(handlers::update_print_sequence),
        )
        .route(
            "/api/almox/print-slips",
            post(handlers::register_printed_slips),
        )
        .route(
            "/api/almox/demands/history",
            get(handlers::get_item_purchase_history),
        )
        .route(
            "/api/almox/demands/from-min",
            post(handlers::create_demand_from_min),
        )
        .route(
            "/api/almox/demands/:id/status",
            put(handlers::update_demand_status),
        )
        .route("/api/almox/demands/:id", put(handlers::update_demand))
        .route(
            "/api/almox/demands/:id/receive",
            post(handlers::receive_demand),
        )
        .route(
            "/api/almox/demands/:id/purchase",
            post(handlers::mark_purchased),
        )
        .route(
            "/api/almox/demands/:id/receipt",
            get(handlers::get_demand_receipt),
        )
        .route(
            "/api/almox/equipments",
            get(handlers::list_equipments).post(handlers::create_equipment),
        )
        .route(
            "/api/almox/equipments/:id",
            get(handlers::get_equipment).put(handlers::update_equipment),
        )
        .route(
            "/api/almox/maintenances",
            get(handlers::list_maintenances).post(handlers::create_maintenance),
        )
        .route(
            "/api/almox/maintenances/:id",
            put(handlers::update_maintenance),
        )
}

/// Ações de leitura do Almoxarifado descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<crate::core::catalogo::Acao> {
    use crate::core::catalogo::{param, Acao};
    vec![
        Acao::leitura(
            "obter_painel_almox",
            "estoque_almoxarifado",
            "Indicadores gerais do almoxarifado (itens, abaixo do mínimo, demandas).",
            "/api/almox/dashboard/stats",
            vec![],
        ),
        Acao::leitura(
            "listar_itens_almox",
            "estoque_almoxarifado",
            "Lista os itens do almoxarifado com saldo, mínimo e seção.",
            "/api/almox/items",
            vec![
                param("onlyActive", "query", "booleano", false, "Só itens ativos."),
                param("section", "query", "texto", false, "Filtra por seção."),
            ],
        ),
        Acao::leitura(
            "buscar_catalogo_almox",
            "estoque_itens",
            "Busca itens do catálogo do ERP por código ou descrição (para vincular ao almoxarifado).",
            "/api/almox/items/search",
            vec![
                param("q", "query", "texto", true, "Texto da busca."),
                param("limit", "query", "inteiro", false, "Máximo de resultados (40 por padrão)."),
            ],
        ),
        Acao::leitura(
            "detalhar_item_almox",
            "estoque_almoxarifado",
            "Detalhe de um item do almoxarifado pelo código.",
            "/api/almox/items/:code",
            vec![
                param("code", "caminho", "texto", true, "Código do item."),
            ],
        ),
        Acao::leitura(
            "obter_estatisticas_item_almox",
            "estoque_almoxarifado",
            "Estatísticas de movimentação e saldo de um item.",
            "/api/almox/items/:code/stats",
            vec![
                param("code", "caminho", "texto", true, "Código do item."),
            ],
        ),
        Acao::leitura(
            "obter_consumo_item_almox",
            "estoque_almoxarifado",
            "Consumo histórico de um item.",
            "/api/almox/items/:code/consumption",
            vec![
                param("code", "caminho", "texto", true, "Código do item."),
            ],
        ),
        Acao::leitura(
            "listar_familias_almox",
            "estoque_almoxarifado",
            "Lista as famílias de itens do almoxarifado.",
            "/api/almox/familias",
            vec![],
        ),
        Acao::leitura(
            "listar_movimentos_almox",
            "estoque_almoxarifado",
            "Lista movimentações de estoque do almoxarifado, mais novas primeiro.",
            "/api/almox/movements",
            vec![
                param("itemCode", "query", "texto", false, "Só movimentos deste item."),
                param("from", "query", "data", false, "Data inicial (AAAA-MM-DD)."),
                param("to", "query", "data", false, "Data final (AAAA-MM-DD)."),
                param("limit", "query", "inteiro", false, "Máximo de linhas (200 por padrão)."),
            ],
        ),
        Acao::leitura(
            "obter_ultima_contagem_almox",
            "estoque_almoxarifado",
            "Situação da última contagem de estoque aplicada.",
            "/api/almox/counts/latest",
            vec![],
        ),
        Acao::leitura(
            "listar_reposicao_almox",
            "estoque_almoxarifado",
            "Itens que precisam de reposição (abaixo do mínimo).",
            "/api/almox/replenishment",
            vec![],
        ),
        Acao::leitura(
            "listar_demandas_almox",
            "estoque_almoxarifado",
            "Lista as demandas de compra do almoxarifado com seu status.",
            "/api/almox/demands",
            vec![],
        ),
        Acao::leitura(
            "consultar_historico_compra_almox",
            "estoque_almoxarifado",
            "Histórico de compras de um item do almoxarifado.",
            "/api/almox/demands/history",
            vec![
                param("itemCode", "query", "texto", false, "Código do item."),
                param("q", "query", "texto", false, "Texto de busca."),
            ],
        ),
        Acao::leitura(
            "listar_equipamentos_almox",
            "estoque_equipamentos",
            "Lista equipamentos e peças do parque.",
            "/api/almox/equipments",
            vec![],
        ),
        Acao::leitura(
            "detalhar_equipamento_almox",
            "estoque_equipamentos",
            "Detalhe de um equipamento.",
            "/api/almox/equipments/:id",
            vec![
                param("id", "caminho", "texto", true, "Id do equipamento."),
            ],
        ),
        Acao::leitura(
            "listar_manutencoes_almox",
            "estoque_manutencoes",
            "Lista manutenções de equipamentos.",
            "/api/almox/maintenances",
            vec![
                param("equipmentId", "query", "texto", false, "Só manutenções deste equipamento."),
            ],
        ),
    ]
}

pub mod handlers;
pub mod models;
pub mod servicos;
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

/// Ações do Almoxarifado descritas para agentes (ver `core::catalogo`).
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
        // ---- Escritas: todas em 2 passos (sem `confirmar=true` só devolvem a prévia) e auditadas com o autor.
        Acao::gravacao(
            "criar_item_local_almox",
            "estoque_almoxarifado",
            "Cadastra um item local do Supermercado (fora do ERP).",
            "POST",
            "/api/almox/items/local",
            true,
            vec![
                param("section", "corpo", "texto", true, "Seção; só 'supermercado'."),
                param("description", "corpo", "texto", true, "Descrição do item."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "salvar_config_item_almox",
            "estoque_almoxarifado",
            "Salva a configuração de um item do almoxarifado (seção, mínimo, ideal, ativo).",
            "PUT",
            "/api/almox/items/:code/config",
            true,
            vec![
                param("code", "caminho", "texto", true, "Código do item."),
                param("section", "corpo", "texto", false, "Seção do item."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "vincular_item_erp_almox",
            "estoque_almoxarifado",
            "Vincula um item do ERP a uma seção do almoxarifado.",
            "POST",
            "/api/almox/items/link",
            true,
            vec![
                param("itemCode", "corpo", "texto", true, "Código do item no ERP."),
                param("section", "corpo", "texto", true, "Seção de destino."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "semear_item_do_erp_almox",
            "estoque_almoxarifado",
            "Abre o saldo do item no almoxarifado com o saldo atual do ERP (só supervisor).",
            "POST",
            "/api/almox/items/:code/seed-from-erp",
            true,
            vec![
                param("code", "caminho", "texto", true, "Código do item."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "excluir_item_almox",
            "estoque_almoxarifado",
            "Remove um item do almoxarifado (apaga a configuração, o saldo e as fotos dele).",
            "DELETE",
            "/api/almox/items/:code",
            true,
            vec![
                param("code", "caminho", "texto", true, "Código do item."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "salvar_familia_almox",
            "estoque_almoxarifado",
            "Cria ou atualiza uma família (seção) de itens do almoxarifado.",
            "POST",
            "/api/almox/familias",
            true,
            vec![
                param("id", "corpo", "texto", true, "Identificador da família."),
                param("label", "corpo", "texto", true, "Nome da família."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "excluir_familia_almox",
            "estoque_almoxarifado",
            "Remove uma família; os itens dela passam para 'outros'.",
            "DELETE",
            "/api/almox/familias/:id",
            true,
            vec![
                param("id", "caminho", "texto", true, "Identificador da família."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "lancar_movimento_almox",
            "estoque_almoxarifado",
            "Lança entrada, saída ou ajuste de saldo de um item do almoxarifado. A prévia mostra o movimento sem gravar.",
            "POST",
            "/api/almox/movements",
            true,
            vec![
                param("itemCode", "corpo", "texto", true, "Código do item."),
                param("movementType", "corpo", "texto", true, "entrada, saida ou ajuste (ajuste só supervisor)."),
                param("quantity", "corpo", "numero", true, "Quantidade (no ajuste, o saldo novo)."),
                param("reason", "corpo", "texto", false, "Motivo."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "aplicar_contagem_almox",
            "estoque_almoxarifado",
            "Aplica uma contagem de estoque: ajusta o saldo dos itens contados. A prévia mostra entradas e saídas geradas.",
            "POST",
            "/api/almox/counts",
            true,
            vec![
                param("lines", "corpo", "lista", true, "Itens contados (código e quantidade)."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "criar_demanda_almox",
            "estoque_almoxarifado",
            "Cria uma demanda de compra do almoxarifado.",
            "POST",
            "/api/almox/demands",
            true,
            vec![
                param("title", "corpo", "texto", false, "Título da demanda."),
                param("items", "corpo", "lista", false, "Itens a comprar."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "criar_demanda_do_minimo_almox",
            "estoque_almoxarifado",
            "Cria uma demanda de compra com todos os itens abaixo do mínimo.",
            "POST",
            "/api/almox/demands/from-min",
            true,
            vec![param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia.")],
        ),
        Acao::gravacao(
            "atualizar_status_demanda_almox",
            "estoque_almoxarifado",
            "Muda o status de uma demanda de compra.",
            "PUT",
            "/api/almox/demands/:id/status",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id da demanda."),
                param("status", "corpo", "texto", true, "impresso, aberta, pedida, recebida ou cancelada."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "atualizar_demanda_almox",
            "estoque_almoxarifado",
            "Edita uma demanda de compra (não vale para cancelada).",
            "PUT",
            "/api/almox/demands/:id",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id da demanda."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "receber_demanda_almox",
            "estoque_almoxarifado",
            "Dá entrada no estoque dos itens recebidos de uma demanda.",
            "POST",
            "/api/almox/demands/:id/receive",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id da demanda."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "marcar_demanda_comprada_almox",
            "estoque_almoxarifado",
            "Marca uma demanda como comprada (loja e valores).",
            "POST",
            "/api/almox/demands/:id/purchase",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id da demanda."),
                param("storeName", "corpo", "texto", true, "Loja da compra."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "atualizar_sequencia_impressao_almox",
            "estoque_almoxarifado",
            "Ajusta o último número de etiqueta de demanda impresso.",
            "POST",
            "/api/almox/print-sequence",
            true,
            vec![
                param("lastSequence", "corpo", "inteiro", true, "Último número impresso."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "registrar_etiquetas_impressas_almox",
            "estoque_almoxarifado",
            "Registra um bloco de etiquetas de demanda impressas.",
            "POST",
            "/api/almox/print-slips",
            true,
            vec![
                param("startSeq", "corpo", "inteiro", true, "Primeiro número do bloco."),
                param("count", "corpo", "inteiro", true, "Quantidade de etiquetas."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "adicionar_foto_almox",
            "estoque_almoxarifado",
            "Anexa uma foto a um item ou equipamento.",
            "POST",
            "/api/almox/fotos/:entity_type/:entity_id",
            true,
            vec![
                param("entity_type", "caminho", "texto", true, "item ou equipment."),
                param("entity_id", "caminho", "texto", true, "Código do item ou id do equipamento."),
                param("photoData", "corpo", "texto", true, "Foto em data URL."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "excluir_foto_almox",
            "estoque_almoxarifado",
            "Remove uma foto anexada.",
            "DELETE",
            "/api/almox/fotos/:id",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id da foto."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "criar_equipamento_almox",
            "estoque_equipamentos",
            "Cadastra um equipamento do parque.",
            "POST",
            "/api/almox/equipments",
            true,
            vec![
                param("code", "corpo", "texto", true, "Código do equipamento."),
                param("name", "corpo", "texto", true, "Nome."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "atualizar_equipamento_almox",
            "estoque_equipamentos",
            "Atualiza o cadastro de um equipamento.",
            "PUT",
            "/api/almox/equipments/:id",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id do equipamento."),
                param("code", "corpo", "texto", true, "Código do equipamento."),
                param("name", "corpo", "texto", true, "Nome."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "criar_manutencao_almox",
            "estoque_manutencoes",
            "Registra uma manutenção de equipamento (e a próxima, se for recorrente).",
            "POST",
            "/api/almox/maintenances",
            true,
            vec![
                param("equipmentId", "corpo", "texto", true, "Id do equipamento."),
                param("kind", "corpo", "texto", true, "Tipo da manutenção."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "atualizar_manutencao_almox",
            "estoque_manutencoes",
            "Atualiza uma manutenção (status, datas, peças).",
            "PUT",
            "/api/almox/maintenances/:id",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id da manutenção."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
    ]
}

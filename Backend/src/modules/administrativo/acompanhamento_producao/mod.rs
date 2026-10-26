pub mod models;
pub mod store;
pub mod handlers;
pub mod espera;
pub mod quadros_estado;
pub mod etapas_efetivas;

use std::sync::Arc;
use axum::{
    routing::{get, post, delete},
    Router,
};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/administrativo/acompanhamento-producao",
            get(handlers::get_acompanhamento_producao),
        )
        .route(
            "/api/administrativo/acompanhamento-producao/auditoria",
            get(handlers::get_auditoria_lotes),
        )
        .route(
            "/api/administrativo/acompanhamento-producao/quadros-estado",
            get(quadros_estado::get_quadros_estado).post(quadros_estado::salvar_quadros_estado),
        )
        .route(
            "/api/administrativo/lote-status",
            post(handlers::save_lote_custom_status),
        )
        .route(
            "/api/administrativo/lote-ficha",
            post(handlers::save_ficha_ordem),
        )
        .route(
            "/api/administrativo/lote-status/batch",
            post(handlers::save_batch_lote_custom_status),
        )
        .route(
            "/api/administrativo/lote-status/:number",
            delete(handlers::delete_lote_custom_status),
        )
        .route(
            "/api/administrativo/lote-status/:number/history",
            get(handlers::get_lote_history),
        )
        .route(
            "/api/administrativo/lote-status/:number/terceirizado",
            post(handlers::toggle_terceirizado),
        )
        .route(
            "/api/administrativo/lote-status/:number/previsao",
            post(handlers::save_lote_previsao),
        )
        .route(
            "/api/administrativo/lote-status/:number/timestamps",
            post(handlers::save_lote_timestamps),
        )
        .route(
            "/api/administrativo/lote-status/:number/limpar-espera",
            post(espera::limpar_espera_rota),
        )
        .route(
            "/api/administrativo/lote-status/:number/ocultar-quadro",
            post(handlers::ocultar_quadro_lote),
        )
        .route(
            "/api/administrativo/lote-status/:number/restaurar-quadro",
            post(handlers::restaurar_quadro_lote),
        )
        .route(
            "/api/administrativo/lote-status/:number/etapa-status",
            post(handlers::save_lote_etapa_status),
        )
        .route(
            "/api/administrativo/terceirizados/solicitacoes",
            get(handlers::get_terceirizados_solicitacoes)
                .post(handlers::create_terceirizados_solicitacao),
        )
        .route(
            "/api/administrativo/terceirizados/solicitacoes/:id/vincular",
            post(handlers::vincular_terceirizado_solicitacao),
        )
        .route(
            "/api/administrativo/terceirizados/solicitacoes/:id/desvincular",
            post(handlers::desvincular_terceirizado_solicitacao),
        )
        .route(
            "/api/administrativo/terceirizados/solicitacoes/:id",
            delete(handlers::delete_terceirizados_solicitacao),
        )
        .route(
            "/api/administrativo/terceirizados/solicitacoes/:id/aprovar",
            post(handlers::aprovar_terceirizado_solicitacao),
        )
        .route(
            "/api/administrativo/terceirizados/solicitacoes/:id/previsao",
            post(handlers::update_terceirizado_previsao)
                .put(handlers::update_terceirizado_previsao),
        )
        .route(
            "/api/administrativo/terceirizados/produto/:code",
            get(handlers::lookup_produto_terceirizado),
        )
        .route(
            "/api/administrativo/acompanhamento-producao/sheets/config",
            get(handlers::get_sheets_config).post(handlers::save_sheets_config),
        )
        .route(
            "/api/administrativo/acompanhamento-producao/sheets/sync",
            post(handlers::sync_sheets_now),
        )
        .route(
            "/api/administrativo/envase/programacao",
            get(handlers::get_programacao_envase).post(handlers::save_programacao_envase),
        )
        .route(
            "/api/administrativo/envase/programacao/:id",
            delete(handlers::delete_programacao_envase),
        )
        .route(
            "/api/administrativo/envase/programacao/lote/:lote_number",
            delete(handlers::delete_programacao_envase_by_lote),
        )
        .route(
            "/api/administrativo/envase/programacao/reorder",
            post(handlers::reorder_programacao_envase),
        )
        .route(
            "/api/administrativo/rotulagem/programacao",
            get(handlers::get_programacao_rotulagem).post(handlers::save_programacao_rotulagem),
        )
        .route(
            "/api/administrativo/rotulagem/programacao/:id",
            delete(handlers::delete_programacao_rotulagem),
        )
        .route(
            "/api/administrativo/rotulagem/programacao/lote/:lote_number",
            delete(handlers::delete_programacao_rotulagem_by_lote),
        )
        .route(
            "/api/administrativo/rotulagem/programacao/reorder",
            post(handlers::reorder_programacao_rotulagem),
        )
}

/// Ações de leitura do Acompanhamento de Produção (ver `core::catalogo`).
pub fn acoes() -> Vec<crate::core::catalogo::Acao> {
    use crate::core::catalogo::{param, Acao};
    vec![
        Acao::leitura(
            "listar_acompanhamento_producao",
            "admin_acompanhamento_producao",
            "Lista os lotes do acompanhamento de produção (status do ERP e status próprio).",
            "/api/administrativo/acompanhamento-producao",
            vec![
                param("search", "query", "texto", false, "Texto de busca."),
                param("statusErp", "query", "texto", false, "Status no ERP."),
                param("statusNosso", "query", "texto", false, "Status no Nexus."),
                param("categoria", "query", "texto", false, "Categoria."),
                param("dateStart", "query", "data", false, "Data inicial (AAAA-MM-DD)."),
                param("dateEnd", "query", "data", false, "Data final (AAAA-MM-DD)."),
                param("limit", "query", "inteiro", false, "Máximo de lotes."),
                param("apenasTerceirizados", "query", "booleano", false, "Só terceirizados."),
            ],
        ),
        Acao::leitura(
            "ler_estado_quadros_acompanhamento",
            "admin_acompanhamento_producao",
            "Estado dos quadros: ordem manual, concluídos, liberados para envase, filas manuais, caldeira e adiados.",
            "/api/administrativo/acompanhamento-producao/quadros-estado",
            vec![],
        ),
        Acao::leitura(
            "auditar_lotes_acompanhamento",
            "admin_acompanhamento_producao",
            "Auditoria de divergências entre os lotes do ERP e o acompanhamento.",
            "/api/administrativo/acompanhamento-producao/auditoria",
            vec![],
        ),
        Acao::leitura(
            "consultar_historico_lote_acompanhamento",
            "admin_acompanhamento_producao",
            "Histórico de mudanças de status de um lote.",
            "/api/administrativo/lote-status/:number/history",
            vec![
                param("number", "caminho", "texto", true, "Número do lote."),
            ],
        ),
        Acao::leitura(
            "listar_solicitacoes_terceirizados",
            "admin_acompanhamento_producao",
            "Lista solicitações de produção terceirizada.",
            "/api/administrativo/terceirizados/solicitacoes",
            vec![],
        ),
        Acao::leitura(
            "consultar_produto_terceirizado",
            "admin_acompanhamento_producao",
            "Consulta um produto pelo código para terceirização.",
            "/api/administrativo/terceirizados/produto/:code",
            vec![
                param("code", "caminho", "texto", true, "Código do produto."),
            ],
        ),
        Acao::leitura(
            "listar_programacao_envase",
            "admin_acompanhamento_producao",
            "Programação de envase do dia.",
            "/api/administrativo/envase/programacao",
            vec![
                param("data", "query", "data", false, "Dia (AAAA-MM-DD; hoje por padrão)."),
            ],
        ),
        Acao::leitura(
            "listar_programacao_rotulagem",
            "admin_acompanhamento_producao",
            "Programação de rotulagem do dia.",
            "/api/administrativo/rotulagem/programacao",
            vec![
                param("data", "query", "data", false, "Dia (AAAA-MM-DD; hoje por padrão)."),
                param("tipo", "query", "texto", false, "Tipo de rotulagem."),
            ],
        ),
    ]
}

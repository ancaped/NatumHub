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
            "/api/administrativo/terceirizados/solicitacoes/:id/status",
            post(handlers::status_terceirizado_solicitacao),
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
        Acao::gravacao(
            "criar_solicitacao_terceirizado",
            "admin_acompanhamento_producao",
            "Cria uma solicitação de produção terceirizada e a coloca na fila do Planejamento (origem terceirizado).",
            "POST",
            "/api/administrativo/terceirizados/solicitacoes",
            true,
            vec![
                param("productCode", "corpo", "texto", true, "Código do produto."),
                param("productDescription", "corpo", "texto", false, "Descrição do produto."),
                param("quantity", "corpo", "número", true, "Quantidade."),
                param("unit", "corpo", "texto", false, "Unidade (UN por padrão)."),
                param("quantityKg", "corpo", "número", false, "Quantidade em kg."),
                param("quantityUn", "corpo", "número", false, "Quantidade em unidades."),
                param("fornecedor", "corpo", "texto", false, "Fornecedor terceirizado."),
                param("previsaoEntrega", "corpo", "data", false, "Previsão de entrega (AAAA-MM-DD)."),
                param("observacoes", "corpo", "texto", false, "Observações."),
                param("loteNumber", "corpo", "texto", false, "Lote já existente para vincular na criação."),
                param("confirmar", "query", "booleano", false, "true para gravar de fato (sem ele só mostra a prévia)."),
            ],
        ),
        Acao::gravacao(
            "aprovar_solicitacao_terceirizado",
            "admin_acompanhamento_producao",
            "Marca ou revoga a aprovação de embalagem ou matéria-prima; com as duas a solicitação vira APROVADO.",
            "POST",
            "/api/administrativo/terceirizados/solicitacoes/:id/aprovar",
            true,
            vec![
                param("id", "caminho", "inteiro", true, "Id da solicitação."),
                param("tipo", "corpo", "texto", true, "embalagem ou materia_prima."),
                param("aprovado", "corpo", "booleano", true, "true aprova; false revoga."),
                param("confirmar", "query", "booleano", false, "true para gravar de fato (sem ele só mostra a prévia)."),
            ],
        ),
        Acao::gravacao(
            "alterar_previsao_solicitacao_terceirizado",
            "admin_acompanhamento_producao",
            "Altera a previsão de entrega da solicitação (e do lote vinculado).",
            "POST",
            "/api/administrativo/terceirizados/solicitacoes/:id/previsao",
            true,
            vec![
                param("id", "caminho", "inteiro", true, "Id da solicitação."),
                param("previsaoEntrega", "corpo", "data", false, "AAAA-MM-DD; vazio limpa."),
                param("confirmar", "query", "booleano", false, "true para gravar de fato (sem ele só mostra a prévia)."),
            ],
        ),
        Acao::gravacao(
            "vincular_solicitacao_terceirizado",
            "admin_acompanhamento_producao",
            "Vincula a solicitação a um lote (status VINCULADO). Recusa se já estiver em fabricação, entregue, finalizada ou cancelada.",
            "POST",
            "/api/administrativo/terceirizados/solicitacoes/:id/vincular",
            true,
            vec![
                param("id", "caminho", "inteiro", true, "Id da solicitação."),
                param("loteNumber", "corpo", "texto", true, "Número do lote."),
                param("confirmar", "query", "booleano", false, "true para gravar de fato (sem ele só mostra a prévia)."),
            ],
        ),
        Acao::gravacao(
            "desvincular_solicitacao_terceirizado",
            "admin_acompanhamento_producao",
            "Desfaz o vínculo com o lote; a solicitação volta para APROVADO ou SOLICITADO.",
            "POST",
            "/api/administrativo/terceirizados/solicitacoes/:id/desvincular",
            true,
            vec![
                param("id", "caminho", "inteiro", true, "Id da solicitação."),
                param("confirmar", "query", "booleano", false, "true para gravar de fato (sem ele só mostra a prévia)."),
            ],
        ),
        Acao::gravacao(
            "alterar_status_solicitacao_terceirizado",
            "admin_acompanhamento_producao",
            "Avança a solicitação: EM_FABRICACAO (exige VINCULADO), ENTREGUE (exige EM_FABRICACAO), FINALIZADO (exige ENTREGUE) ou CANCELADO.",
            "POST",
            "/api/administrativo/terceirizados/solicitacoes/:id/status",
            true,
            vec![
                param("id", "caminho", "inteiro", true, "Id da solicitação."),
                param("status", "corpo", "texto", true, "EM_FABRICACAO, ENTREGUE, FINALIZADO ou CANCELADO."),
                param("motivo", "corpo", "texto", false, "Motivo (usado no cancelamento)."),
                param("confirmar", "query", "booleano", false, "true para gravar de fato (sem ele só mostra a prévia)."),
            ],
        ),
        Acao::gravacao(
            "cancelar_solicitacao_terceirizado",
            "admin_acompanhamento_producao",
            "Cancela a solicitação (não apaga), desmarca o lote vinculado e tira o item pendente da fila do Planejamento.",
            "DELETE",
            "/api/administrativo/terceirizados/solicitacoes/:id",
            true,
            vec![
                param("id", "caminho", "inteiro", true, "Id da solicitação."),
                param("motivo", "query", "texto", false, "Motivo do cancelamento."),
                param("confirmar", "query", "booleano", false, "true para gravar de fato (sem ele só mostra a prévia)."),
            ],
        ),
        Acao::gravacao(
            "marcar_lote_terceirizado",
            "admin_acompanhamento_producao",
            "Marca ou desmarca um lote como terceirizado.",
            "POST",
            "/api/administrativo/lote-status/:number/terceirizado",
            true,
            vec![
                param("number", "caminho", "texto", true, "Número do lote."),
                param("isTerceirizado", "corpo", "booleano", true, "true marca; false desmarca."),
                param("confirmar", "query", "booleano", false, "true para gravar de fato (sem ele só mostra a prévia)."),
            ],
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

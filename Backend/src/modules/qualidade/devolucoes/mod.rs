pub mod controles;
pub mod handlers;
pub mod models;

use axum::{
    routing::{get, post},
    Router,
};
use std::sync::Arc;

use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/qualidade/devolucoes",
            get(handlers::list_devolucoes).post(handlers::create_devolucao),
        )
        .route(
            "/api/qualidade/devolucoes/lookup-item",
            get(handlers::lookup_item),
        )
        .route(
            "/api/qualidade/devolucoes/lote-specs",
            get(handlers::lote_specs),
        )
        .route(
            "/api/qualidade/devolucoes/controles",
            get(controles::list_controles).post(controles::create_controle),
        )
        .route(
            "/api/qualidade/devolucoes/controles/pendentes",
            get(controles::pending_controles),
        )
        .route(
            "/api/qualidade/devolucoes/controles/:id",
            get(controles::get_controle),
        )
        .route(
            "/api/qualidade/devolucoes/controles/:id/volumes",
            post(controles::set_volumes),
        )
        .route(
            "/api/qualidade/devolucoes/controles/:id/devolver",
            post(controles::devolver_controle),
        )
        .route(
            "/api/qualidade/devolucoes/controles/:id/cancelar",
            post(controles::cancelar_controle),
        )
        .route(
            "/api/qualidade/devolucoes/:id",
            get(handlers::get_devolucao)
                .put(handlers::update_devolucao)
                .delete(handlers::delete_devolucao),
        )
        .route(
            "/api/qualidade/devolucoes/:id/receber",
            post(handlers::receber_devolucao),
        )
        .route(
            "/api/qualidade/devolucoes/:id/iniciar-conferencia",
            post(handlers::iniciar_conferencia),
        )
        .route(
            "/api/qualidade/devolucoes/:id/fechar-cq",
            post(handlers::fechar_cq),
        )
        .route(
            "/api/qualidade/devolucoes/:id/itens/:item_id/conferir",
            post(handlers::conferir_item),
        )
        .route(
            "/api/qualidade/devolucoes/:id/itens/:item_id/dividir",
            post(handlers::dividir_item),
        )
        .route(
            "/api/qualidade/devolucoes/:id/itens/:item_id/analise-fq",
            post(handlers::salvar_analise_fq),
        )
        .route(
            "/api/qualidade/devolucoes/:id/itens/:item_id/foto",
            get(handlers::get_item_foto).post(handlers::upload_item_foto),
        )
        .route(
            "/api/qualidade/devolucoes/:id/itens/:item_id/erp",
            post(handlers::marcar_erp_item),
        )
}

/// Ações de leitura das Devoluções (ver `core::catalogo`).
pub fn acoes() -> Vec<crate::core::catalogo::Acao> {
    use crate::core::catalogo::{param, Acao};
    vec![
        Acao::leitura(
            "listar_devolucoes",
            "qualidade_devolucoes",
            "Lista as devoluções de clientes recebidas (até 500, das mais recentes), com registro, cliente, NF, data, status, volumes e itens (quantidade, lotes, disposição, conferência, FQ). `filtro`: abertas (não finalizadas), em_conferencia ou finalizadas; `status` filtra um status exato e `q` busca em registro, cliente, NF e recebedor. Para uma só use `detalhar_devolucao`.",
            "/api/qualidade/devolucoes",
            vec![
                param("status", "query", "texto", false, "Filtra por status."),
                param("q", "query", "texto", false, "Texto de busca."),
                param("filtro", "query", "texto", false, "abertas, finalizadas ou all."),
            ],
        ),
        Acao::leitura(
            "consultar_item_devolucao",
            "qualidade_devolucoes",
            "Busca lotes/produtos para registrar uma devolução por lote, código ou descrição (até 15). Devolve lote, código do produto, descrição e, quando há laudo, pH, viscosidade, densidade e unidades por caixa; se nada casa nos laudos, procura nos produtos. Use antes de registrar a devolução.",
            "/api/qualidade/devolucoes/lookup-item",
            vec![
                param("q", "query", "texto", true, "Código ou descrição."),
            ],
        ),
        Acao::leitura(
            "consultar_specs_lote_devolucao",
            "qualidade_devolucoes",
            "Especificações de um lote vindas dos laudos do ERP: devolve `ph`, `viscosidade` e `densidade` (nulos se o lote não tem laudo ou `lote` vem vazio), usando o laudo mais recente. Informe `code` quando o lote tiver mais de um produto. Use para conferir o produto devolvido.",
            "/api/qualidade/devolucoes/lote-specs",
            vec![
                param("lote", "query", "texto", true, "Número do lote."),
                param("code", "query", "texto", false, "Código do produto."),
            ],
        ),
        Acao::leitura(
            "listar_controles_devolucao",
            "qualidade_devolucoes",
            "Lista os controles (folhas) de devolução, do mais novo ao mais antigo: número da folha, status, volumes, quem criou e devolveu, e as devoluções com seus itens. Para os que ainda não entraram em controle use `listar_controles_devolucao_pendentes`.",
            "/api/qualidade/devolucoes/controles",
            vec![],
        ),
        Acao::leitura(
            "listar_controles_devolucao_pendentes",
            "qualidade_devolucoes",
            "Lista as devoluções que ainda não estão em nenhum controle ativo (controles cancelados não contam), da mais recente à mais antiga, com cliente, NF, volumes e itens. Use para montar um controle novo.",
            "/api/qualidade/devolucoes/controles/pendentes",
            vec![],
        ),
        Acao::leitura(
            "detalhar_controle_devolucao",
            "qualidade_devolucoes",
            "Um controle (folha) de devolução pelo id: número, status, volumes, quem criou e devolveu, e cada devolução incluída com seus itens (quantidade, lotes, disposição, status no ERP). Dá 404 se não existir.",
            "/api/qualidade/devolucoes/controles/:id",
            vec![
                param("id", "caminho", "inteiro", true, "Id do controle."),
            ],
        ),
        Acao::leitura(
            "detalhar_devolucao",
            "qualidade_devolucoes",
            "Uma devolução pelo id, com cabeçalho (registro, status, cliente, NF, datas, recebedor, transportadora, volumes, quem recebeu e conferiu) e itens (quantidade, lotes, conferida, disposição, status no ERP e medições da FQ). Dá 404 se não existir.",
            "/api/qualidade/devolucoes/:id",
            vec![
                param("id", "caminho", "inteiro", true, "Id da devolução."),
            ],
        ),
    ]
}

pub mod catalogos;
pub mod folhas;
pub mod handlers;
pub mod models;

use axum::{
    extract::DefaultBodyLimit,
    routing::get,
    Router,
};
use std::sync::Arc;

use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/qualidade/avarias",
            get(handlers::list_avarias).post(handlers::create_avaria),
        )
        .route(
            "/api/qualidade/avarias/lookup-item",
            get(handlers::lookup_item),
        )
        .route(
            "/api/qualidade/avarias/catalogos",
            get(catalogos::get_catalogos).post(catalogos::post_catalogo),
        )
        .route(
            "/api/qualidade/avarias/folhas",
            get(folhas::list_folhas).post(folhas::create_folha),
        )
        .route(
            "/api/qualidade/avarias/folhas/pendentes",
            get(folhas::pending_folhas),
        )
        .route(
            "/api/qualidade/avarias/folhas/:id",
            get(folhas::get_folha),
        )
        .route(
            "/api/qualidade/avarias/folhas/:id/caixas",
            axum::routing::post(folhas::set_caixas),
        )
        .route(
            "/api/qualidade/avarias/folhas/:id/devolver",
            axum::routing::post(folhas::devolver_folha),
        )
        .route(
            "/api/qualidade/avarias/folhas/:id/cancelar",
            axum::routing::post(folhas::cancelar_folha),
        )
        .route(
            "/api/qualidade/avarias/juntar",
            axum::routing::post(handlers::juntar_avarias),
        )
        .route(
            "/api/qualidade/avarias/:id",
            get(handlers::get_avaria)
                .put(handlers::update_avaria)
                .delete(handlers::delete_avaria),
        )
        .route(
            "/api/qualidade/avarias/:id/foto",
            get(handlers::get_foto).post(handlers::upload_foto).layer(DefaultBodyLimit::max(
                12 * 1024 * 1024,
            )),
        )
}

/// Ações de leitura das Avarias (ver `core::catalogo`).
pub fn acoes() -> Vec<crate::core::catalogo::Acao> {
    use crate::core::catalogo::{param, Acao};
    vec![
        Acao::leitura(
            "listar_avarias",
            "qualidade_avarias",
            "Lista as avarias registradas (até 300, da mais nova à mais antiga), cada uma com número do registro, item, lote, quantidade, local, status, folha, encaminhamento e dados da FQ. Filtre por `status` e/ou busque por texto em número, item, descrição, lote ou local. Para uma só use `detalhar_avaria`.",
            "/api/qualidade/avarias",
            vec![
                param("status", "query", "texto", false, "Filtra por status."),
                param("q", "query", "texto", false, "Texto de busca."),
            ],
        ),
        Acao::leitura(
            "consultar_item_avaria",
            "qualidade_avarias",
            "Busca lotes/produtos para registrar uma avaria: com 2 letras ou mais procura por lote, código ou descrição nos laudos de lote (até 15), e se não achar procura nos produtos. Devolve lote, código do produto e descrição. Use antes de registrar a avaria.",
            "/api/qualidade/avarias/lookup-item",
            vec![
                param("q", "query", "texto", true, "Código ou descrição."),
            ],
        ),
        Acao::leitura(
            "listar_catalogos_avaria",
            "qualidade_avarias",
            "Lista os locais e os motivos usados no cadastro de avarias (`locais` e `motivos`), na ordem do catálogo. É a lista única do Nexus, igual para todos.",
            "/api/qualidade/avarias/catalogos",
            vec![],
        ),
        Acao::gravacao(
            "adicionar_catalogo_avaria",
            "qualidade_avarias",
            "Acrescenta um local ou um motivo ao catálogo das avarias (ou reativa o que já existe, sem diferenciar maiúsculas). Sem `confirmar=true` mostra só a prévia.",
            "POST",
            "/api/qualidade/avarias/catalogos",
            true,
            vec![
                param("tipo", "corpo", "texto", true, "local ou motivo."),
                param("nome", "corpo", "texto", true, "Nome (até 80 caracteres)."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::leitura(
            "listar_folhas_avaria",
            "qualidade_avarias",
            "Lista as folhas de avaria (documento que leva avarias a um destino), da mais nova à mais antiga: número, destino, status, quem criou e devolveu, quantidade de itens e de caixas. Para os itens de uma folha use `detalhar_folha_avaria`.",
            "/api/qualidade/avarias/folhas",
            vec![],
        ),
        Acao::leitura(
            "listar_folhas_avaria_pendentes",
            "qualidade_avarias",
            "Lista as avarias que ainda não estão em nenhuma folha e esperam o destino pedido (`expedicao` = retorno ao estoque, `embalagem` ou `reparo`; padrão expedicao), da mais antiga à mais nova, até 200. Devolve avarias, não folhas; use para montar uma folha nova.",
            "/api/qualidade/avarias/folhas/pendentes",
            vec![
                param("destination", "query", "texto", false, "Destino (expedicao por padrão)."),
            ],
        ),
        Acao::leitura(
            "detalhar_folha_avaria",
            "qualidade_avarias",
            "Uma folha de avaria pelo id, com número, destino, status, quem criou e devolveu, quantidade de caixas e a lista de avarias dela (registro, item, lote, quantidade, local, status). Dá 404 se não existir.",
            "/api/qualidade/avarias/folhas/:id",
            vec![
                param("id", "caminho", "inteiro", true, "Id da folha."),
            ],
        ),
        Acao::leitura(
            "detalhar_avaria",
            "qualidade_avarias",
            "Uma avaria pelo id, com registro, item, lote, quantidade, local, status, observações, foto, quem criou e decidiu, folha, tipo de reparo, problema, encaminhamento e dados da FQ (necessária, resultado, observação). Dá 404 se não existir.",
            "/api/qualidade/avarias/:id",
            vec![
                param("id", "caminho", "inteiro", true, "Id da avaria."),
            ],
        ),
    ]
}

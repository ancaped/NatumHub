pub mod eventos;
pub mod formularios;
pub mod handlers;
pub mod models;
pub mod servicos;
pub mod store;
#[cfg(test)]
mod testes;

use axum::{
    routing::{get, post},
    Router,
};
use std::sync::Arc;

use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/qualidade/pops/sectors",
            get(handlers::list_sectors).post(handlers::create_sector),
        )
        .route(
            "/api/qualidade/pops/documents",
            get(handlers::list_documents).post(handlers::create_document),
        )
        .route(
            "/api/qualidade/pops/documents/:id",
            get(handlers::get_document).put(handlers::update_document).patch(handlers::update_document),
        )
        .route(
            "/api/qualidade/pops/documents/:id/publish",
            post(handlers::publish_document),
        )
        .route(
            "/api/qualidade/pops/documents/:id/status",
            post(handlers::mover_status),
        )
        .route(
            "/api/qualidade/pops/documents/:id/revalidate",
            post(handlers::revalidate_document),
        )
        .route(
            "/api/qualidade/pops/documents/:id/eventos",
            get(handlers::list_eventos_documento),
        )
        .route(
            "/api/qualidade/pops/documents/:id/versions",
            get(handlers::list_versions),
        )
        .route(
            "/api/qualidade/pops/documents/:id/versions/:vid",
            get(handlers::get_version),
        )
        .route(
            "/api/qualidade/pops/settings",
            get(handlers::get_settings).put(handlers::upload_logo),
        )
        .route(
            "/api/qualidade/pops/settings/logo",
            get(handlers::download_logo),
        )
        .route(
            "/api/qualidade/pops/seed-inventory",
            post(handlers::seed_inventory),
        )
        .route(
            "/api/qualidade/pops/formularios",
            get(handlers::list_formularios).post(handlers::criar_formulario),
        )
        .route(
            "/api/qualidade/pops/formularios/:code",
            get(handlers::get_formulario).put(handlers::editar_formulario),
        )
        .route(
            "/api/qualidade/pops/formularios/:code/status",
            post(handlers::mover_status_formulario),
        )
        .route(
            "/api/qualidade/pops/formularios/:code/publicar",
            post(handlers::publicar_formulario),
        )
        .route(
            "/api/qualidade/pops/formularios/:code/revisao",
            post(handlers::revisar_formulario),
        )
        .route(
            "/api/qualidade/pops/check-alerts",
            post(handlers::check_alerts),
        )
}

/// Ações de leitura dos POPs (ver `core::catalogo`).
pub fn acoes() -> Vec<crate::core::catalogo::Acao> {
    use crate::core::catalogo::{param, Acao};
    let confirmar = || param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia.");
    vec![
        Acao::leitura(
            "listar_setores_pop",
            "qualidade_pops",
            "Lista os setores dos POPs.",
            "/api/qualidade/pops/sectors",
            vec![],
        ),
        Acao::leitura(
            "listar_formularios_pop",
            "qualidade_pops",
            "Lista os formulários vinculados aos POPs (fase 1, CQL e PRD).",
            "/api/qualidade/pops/formularios",
            vec![],
        ),
        Acao::leitura(
            "detalhar_formulario_pop",
            "qualidade_pops",
            "Detalhe de um formulário: dados, histórico de revisões (com a cópia de cada publicação) e trilha de eventos.",
            "/api/qualidade/pops/formularios/:code",
            vec![param("code", "caminho", "texto", true, "Código do formulário (ex.: FOR-CQL-015-01).")],
        ),
        Acao::leitura(
            "listar_eventos_documento_pop",
            "qualidade_pops",
            "Trilha de eventos de um POP (criado, editado, enviado, devolvido, publicado, revalidado, obsoleto): quem, quando e o motivo.",
            "/api/qualidade/pops/documents/:id/eventos",
            vec![param("id", "caminho", "texto", true, "Id do POP.")],
        ),
        Acao::leitura(
            "listar_documentos_pop",
            "qualidade_pops",
            "Lista os POPs.",
            "/api/qualidade/pops/documents",
            vec![
                param("sectorId", "query", "texto", false, "Só POPs deste setor."),
                param("status", "query", "texto", false, "Filtra por status."),
                param("q", "query", "texto", false, "Texto de busca."),
            ],
        ),
        Acao::leitura(
            "detalhar_documento_pop",
            "qualidade_pops",
            "Detalhe de um POP.",
            "/api/qualidade/pops/documents/:id",
            vec![
                param("id", "caminho", "texto", true, "Id do POP."),
            ],
        ),
        Acao::leitura(
            "listar_versoes_documento_pop",
            "qualidade_pops",
            "Versões de um POP.",
            "/api/qualidade/pops/documents/:id/versions",
            vec![
                param("id", "caminho", "texto", true, "Id do POP."),
            ],
        ),
        Acao::leitura(
            "detalhar_versao_documento_pop",
            "qualidade_pops",
            "Conteúdo de uma versão de POP.",
            "/api/qualidade/pops/documents/:id/versions/:vid",
            vec![
                param("id", "caminho", "texto", true, "Id do POP."),
                param("vid", "caminho", "texto", true, "Id da versão."),
            ],
        ),
        // ── Escritas dos POPs (2 passos: sem confirmar=true só devolve a prévia; grava auditoria e evento) ──
        Acao::gravacao(
            "criar_documento_pop",
            "qualidade_pops",
            "Cria um POP em rascunho.",
            "POST",
            "/api/qualidade/pops/documents",
            true,
            vec![
                param("code", "corpo", "texto", true, "Código POP-SET-NNN."),
                param("title", "corpo", "texto", true, "Título."),
                param("sectorId", "corpo", "texto", true, "Id do setor."),
                param("content", "corpo", "objeto", false, "Corpo do POP ({ body })."),
                confirmar(),
            ],
        ),
        Acao::gravacao(
            "editar_documento_pop",
            "qualidade_pops",
            "Edita título, setor, responsáveis e, só em rascunho, o corpo do POP.",
            "PUT",
            "/api/qualidade/pops/documents/:id",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id do POP."),
                param("title", "corpo", "texto", false, "Novo título."),
                param("sectorId", "corpo", "texto", false, "Novo setor."),
                param("content", "corpo", "objeto", false, "Novo corpo (só em rascunho)."),
                confirmar(),
            ],
        ),
        Acao::gravacao(
            "enviar_aprovacao_pop",
            "qualidade_pops",
            "Envia o POP em rascunho para aprovação (status=in_review). Motivo obrigatório.",
            "POST",
            "/api/qualidade/pops/documents/:id/status",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id do POP."),
                param("status", "corpo", "texto", true, "in_review."),
                param("motivo", "corpo", "texto", true, "Motivo."),
                confirmar(),
            ],
        ),
        Acao::gravacao(
            "devolver_pop",
            "qualidade_pops",
            "Devolve o POP em aprovação ao rascunho (status=draft). Motivo obrigatório.",
            "POST",
            "/api/qualidade/pops/documents/:id/status",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id do POP."),
                param("status", "corpo", "texto", true, "draft."),
                param("motivo", "corpo", "texto", true, "Motivo."),
                confirmar(),
            ],
        ),
        Acao::gravacao(
            "tornar_pop_obsoleto",
            "qualidade_pops",
            "Torna o POP vigente (ou em aprovação) obsoleto (status=obsolete). Não apaga. Motivo obrigatório.",
            "POST",
            "/api/qualidade/pops/documents/:id/status",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id do POP."),
                param("status", "corpo", "texto", true, "obsolete."),
                param("motivo", "corpo", "texto", true, "Motivo."),
                confirmar(),
            ],
        ),
        Acao::gravacao(
            "aprovar_pop",
            "qualidade_pops",
            "Aprova e publica uma revisão do POP (de «em aprovação» ou de vigente): nova versão, vigência e próxima revisão em 2 anos.",
            "POST",
            "/api/qualidade/pops/documents/:id/publish",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id do POP."),
                param("changeSummary", "corpo", "texto", true, "Motivo da revisão."),
                param("effectiveDate", "corpo", "data", false, "Vigência AAAA-MM-DD (hoje por padrão)."),
                confirmar(),
            ],
        ),
        Acao::gravacao(
            "revalidar_pop",
            "qualidade_pops",
            "Revalida um POP vigente (mesmo texto, nova vigência e próxima revisão).",
            "POST",
            "/api/qualidade/pops/documents/:id/revalidate",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id do POP."),
                param("changeSummary", "corpo", "texto", true, "Motivo."),
                param("effectiveDate", "corpo", "data", false, "Vigência AAAA-MM-DD (hoje por padrão)."),
                confirmar(),
            ],
        ),
        // ── Escritas dos formulários ──
        Acao::gravacao(
            "criar_formulario_pop",
            "qualidade_pops",
            "Cria um formulário em rascunho (nasce com Data, Executado por e Verificado (CQ)).",
            "POST",
            "/api/qualidade/pops/formularios",
            true,
            vec![
                param("code", "corpo", "texto", true, "Código FOR-SET-NNN-NN."),
                param("popCode", "corpo", "texto", true, "POP vinculado (POP-...)."),
                param("title", "corpo", "texto", true, "Título."),
                param("periodicity", "corpo", "texto", false, "Periodicidade (Por uso, Diária...)."),
                param("orientation", "corpo", "texto", false, "portrait ou landscape."),
                confirmar(),
            ],
        ),
        Acao::gravacao(
            "editar_formulario_pop",
            "qualidade_pops",
            "Edita o rascunho do formulário: título, POP, periodicidade, orientação, áreas, limites, colunas e linhas por folha. Vigente muda só por nova revisão.",
            "PUT",
            "/api/qualidade/pops/formularios/:code",
            true,
            vec![
                param("code", "caminho", "texto", true, "Código do formulário."),
                param("title", "corpo", "texto", false, "Título."),
                param("popCode", "corpo", "texto", false, "POP vinculado (precisa existir)."),
                param("periodicity", "corpo", "texto", false, "Periodicidade."),
                param("orientation", "corpo", "texto", false, "portrait ou landscape."),
                param("areas", "corpo", "lista", false, "Áreas (uma folha por área)."),
                param("limits", "corpo", "texto", false, "Limites de aceitação (vazio apaga)."),
                param("columns", "corpo", "lista", false, "Colunas: label, kind (data|hora|numero|texto|sim_nao|rubrica), limit."),
                param("rowsPerSheet", "corpo", "inteiro", false, "Linhas por folha (1 a 60; 0 = padrão)."),
                confirmar(),
            ],
        ),
        Acao::gravacao(
            "enviar_formulario_aprovacao",
            "qualidade_pops",
            "Envia o formulário em rascunho para aprovação (destino=in_review). Motivo obrigatório.",
            "POST",
            "/api/qualidade/pops/formularios/:code/status",
            true,
            vec![
                param("code", "caminho", "texto", true, "Código do formulário."),
                param("destino", "corpo", "texto", true, "in_review."),
                param("motivo", "corpo", "texto", true, "Motivo."),
                confirmar(),
            ],
        ),
        Acao::gravacao(
            "devolver_formulario",
            "qualidade_pops",
            "Devolve o formulário em aprovação ao rascunho (destino=draft). Motivo obrigatório.",
            "POST",
            "/api/qualidade/pops/formularios/:code/status",
            true,
            vec![
                param("code", "caminho", "texto", true, "Código do formulário."),
                param("destino", "corpo", "texto", true, "draft."),
                param("motivo", "corpo", "texto", true, "Motivo."),
                confirmar(),
            ],
        ),
        Acao::gravacao(
            "tornar_formulario_obsoleto",
            "qualidade_pops",
            "Torna o formulário vigente (ou em aprovação) obsoleto (destino=obsolete). Não apaga. Motivo obrigatório.",
            "POST",
            "/api/qualidade/pops/formularios/:code/status",
            true,
            vec![
                param("code", "caminho", "texto", true, "Código do formulário."),
                param("destino", "corpo", "texto", true, "obsolete."),
                param("motivo", "corpo", "texto", true, "Motivo."),
                confirmar(),
            ],
        ),
        Acao::gravacao(
            "aprovar_formulario_pop",
            "qualidade_pops",
            "Aprova o formulário em aprovação: vira vigente (vigência hoje, próxima revisão em 2 anos), soma a revisão e guarda a cópia no histórico.",
            "POST",
            "/api/qualidade/pops/formularios/:code/publicar",
            true,
            vec![
                param("code", "caminho", "texto", true, "Código do formulário."),
                param("motivo", "corpo", "texto", true, "Motivo."),
                confirmar(),
            ],
        ),
        Acao::gravacao(
            "abrir_nova_revisao_formulario",
            "qualidade_pops",
            "Abre o rascunho da próxima revisão de um formulário vigente. A vigente segue valendo até publicar.",
            "POST",
            "/api/qualidade/pops/formularios/:code/revisao",
            true,
            vec![
                param("code", "caminho", "texto", true, "Código do formulário."),
                param("motivo", "corpo", "texto", true, "O que vai mudar."),
                confirmar(),
            ],
        ),
    ]
}

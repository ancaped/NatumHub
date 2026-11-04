pub mod eventos;
pub mod formularios;
pub mod handlers;
pub mod lote;
pub mod models;
pub mod normas;
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
            "/api/qualidade/pops/documents/emitir-lote",
            post(handlers::emitir_lote_pops),
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
            "/api/qualidade/pops/formularios/emitir-lote",
            post(handlers::emitir_lote_formularios),
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
            "/api/qualidade/pops/formularios/:code/pasta-mes",
            post(handlers::pasta_do_mes_formulario),
        )
        .route(
            "/api/qualidade/pops/normas",
            get(handlers::normas),
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
            "Lista os setores dos POPs na ordem de exibição (id, nome, ordem, ativo). Use para obter o `sectorId` dos filtros e da criação de POPs.",
            "/api/qualidade/pops/sectors",
            vec![],
        ),
        Acao::leitura(
            "normas_pops",
            "qualidade_pops",
            "Regras de controle de documentos dos POPs e formulários: norma, códigos e setores, status e fluxo, revisão e vigência, emissão em lote, formulários, preenchimento em papel e como os agentes leem e escrevem. É o mesmo texto da aba Normas e regras.",
            "/api/qualidade/pops/normas",
            vec![],
        ),
        Acao::leitura(
            "listar_formularios_pop",
            "qualidade_pops",
            "Lista todos os formulários vinculados aos POPs (códigos FOR-...), por código: POP vinculado, título, periodicidade, campos, status, revisão vigente, orientação, vigência e próxima revisão. Sem filtros; para um só use a rota do formulário.",
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
            "Lista os POPs por setor e código: código, título, setor, revisão vigente, vigência, próxima revisão com dias restantes (`daysToReview`, negativo = atrasado), status e responsáveis. Filtre por `sectorId`, `status` ou busca em código/título. Para o conteúdo use `detalhar_documento_pop`.",
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
            "Um POP pelo id, com os mesmos campos da lista e a versão vigente completa (`currentVersion`, com o conteúdo do POP, responsáveis e resumo da mudança). Para o histórico use `listar_versoes_documento_pop`.",
            "/api/qualidade/pops/documents/:id",
            vec![
                param("id", "caminho", "texto", true, "Id do POP."),
            ],
        ),
        Acao::leitura(
            "listar_versoes_documento_pop",
            "qualidade_pops",
            "Histórico de revisões de um POP, da mais nova à mais antiga: revisão, vigência, próxima revisão, tipo e resumo da mudança, responsáveis e o conteúdo de cada versão. Para uma só versão use `detalhar_versao_documento_pop`.",
            "/api/qualidade/pops/documents/:id/versions",
            vec![
                param("id", "caminho", "texto", true, "Id do POP."),
            ],
        ),
        Acao::leitura(
            "detalhar_versao_documento_pop",
            "qualidade_pops",
            "Uma versão específica de um POP (`vid`): revisão, vigência, próxima revisão, tipo e resumo da mudança, responsáveis e o conteúdo completo. Use para comparar com a versão vigente.",
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
            "Cria um POP novo em rascunho (código POP-SET-NNN, título, setor e, opcionalmente, o corpo). Devolve o POP criado. Depois de escrito, envie para aprovação com `enviar_aprovacao_pop`. Sem `confirmar=true` mostra só a prévia.",
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
            "Edita título, setor, responsáveis e, só enquanto está em rascunho, o corpo do POP. Devolve o POP atualizado. Para mudar o status use `enviar_aprovacao_pop`, `devolver_pop` ou `revalidar_pop`. Sem `confirmar=true` mostra só a prévia.",
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
            "Envia o POP em rascunho para aprovação (`status`=in_review); o motivo é obrigatório e fica na trilha. Devolve o POP com o novo status. Para voltar ao rascunho use `devolver_pop`. Sem `confirmar=true` mostra só a prévia.",
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
            "Devolve o POP em aprovação ao rascunho (`status`=draft) para correção; o motivo é obrigatório e fica na trilha. Devolve o POP com o novo status. Sem `confirmar=true` mostra só a prévia.",
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
            "Revalida um POP vigente sem mudar o texto: soma uma revisão, define nova vigência (hoje por padrão) e nova data de próxima revisão. Só vale para POP publicado (senão dá erro de regra); o motivo (`changeSummary`) é obrigatório. Sem `confirmar=true` mostra só a prévia.",
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
        Acao::gravacao(
            "emitir_lote_pops",
            "qualidade_pops",
            "Emite POPs em lote (rascunho/em aprovação → vigente): mantém a revisão e a vigência do Word na emissão inicial, próxima revisão em 2 anos. Passe ids ou setor; ignora o que já está vigente ou obsoleto. Motivo obrigatório.",
            "POST",
            "/api/qualidade/pops/documents/emitir-lote",
            true,
            vec![
                param("ids", "corpo", "lista", false, "Ids dos POPs."),
                param("setor", "corpo", "texto", false, "Id do setor (ex.: cql), alternativa a ids."),
                param("motivo", "corpo", "texto", true, "Motivo (ex.: Emissão inicial na codificação nova)."),
                confirmar(),
            ],
        ),
        Acao::gravacao(
            "emitir_lote_formularios_pop",
            "qualidade_pops",
            "Emite formulários em lote (rascunho/em aprovação → vigente): primeira publicação Rev. 00, vigência hoje, com cópia no histórico. Passe codes ou setor (sigla, ex.: CQL). Motivo obrigatório.",
            "POST",
            "/api/qualidade/pops/formularios/emitir-lote",
            true,
            vec![
                param("codes", "corpo", "lista", false, "Códigos dos formulários."),
                param("setor", "corpo", "texto", false, "Sigla do setor no código (ex.: CQL), alternativa a codes."),
                param("motivo", "corpo", "texto", true, "Motivo (ex.: Emissão inicial na codificação nova)."),
                confirmar(),
            ],
        ),
        // ── Escritas dos formulários ──
        Acao::gravacao(
            "criar_formulario_pop",
            "qualidade_pops",
            "Cria um formulário em rascunho vinculado a um POP (código FOR-SET-NNN-NN), já com os campos Data, Executado por e Verificado (CQ). Devolve o formulário; ajuste os campos com a edição do formulário e envie com `enviar_formulario_aprovacao`. Sem `confirmar=true` mostra só a prévia.",
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
            "Edita o rascunho do formulário: título, POP, periodicidade, orientação, áreas, limites, especificações, colunas e linhas por folha. Vigente muda só por nova revisão.",
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
                param("specifications", "corpo", "texto", false, "Especificações impressas abaixo da tabela, uma por linha (vazio apaga)."),
                param("columns", "corpo", "lista", false, "Colunas: label, kind (data|hora|numero|texto|sim_nao|rubrica), limit, width (% da folha, 5 a 80; vazio = proporcional ao tipo)."),
                param("rowsPerSheet", "corpo", "inteiro", false, "Linhas por folha (1 a 60; 0 = padrão). Menos linhas = linhas mais altas."),
                param("layout", "corpo", "objeto", false, "Cabeçalho da folha: {showArea, showEquip} (Setor/Área e Equipamento/ID; o Mês/Ano sempre sai)."),
                confirmar(),
            ],
        ),
        Acao::gravacao(
            "enviar_formulario_aprovacao",
            "qualidade_pops",
            "Envia o formulário em rascunho para aprovação (`status`=in_review, nome antigo `destino`); o motivo é obrigatório e vai para a trilha. Devolve o formulário com o novo status. Sem `confirmar=true` mostra só a prévia.",
            "POST",
            "/api/qualidade/pops/formularios/:code/status",
            true,
            vec![
                param("code", "caminho", "texto", true, "Código do formulário."),
                param("status", "corpo", "texto", true, "in_review. (Nome antigo `destino` continua aceito; se vierem os dois têm que ser iguais.)"),
                param("motivo", "corpo", "texto", true, "Motivo."),
                confirmar(),
            ],
        ),
        Acao::gravacao(
            "devolver_formulario",
            "qualidade_pops",
            "Devolve o formulário em aprovação ao rascunho (`status`=draft, nome antigo `destino`) para correção; o motivo é obrigatório e vai para a trilha. Devolve o formulário com o novo status. Sem `confirmar=true` mostra só a prévia.",
            "POST",
            "/api/qualidade/pops/formularios/:code/status",
            true,
            vec![
                param("code", "caminho", "texto", true, "Código do formulário."),
                param("status", "corpo", "texto", true, "draft. (Nome antigo `destino` continua aceito; se vierem os dois têm que ser iguais.)"),
                param("motivo", "corpo", "texto", true, "Motivo."),
                confirmar(),
            ],
        ),
        Acao::gravacao(
            "tornar_formulario_obsoleto",
            "qualidade_pops",
            "Torna o formulário vigente (ou em aprovação) obsoleto (status=obsolete). Não apaga. Motivo obrigatório.",
            "POST",
            "/api/qualidade/pops/formularios/:code/status",
            true,
            vec![
                param("code", "caminho", "texto", true, "Código do formulário."),
                param("status", "corpo", "texto", true, "obsolete. (Nome antigo `destino` continua aceito; se vierem os dois têm que ser iguais.)"),
                param("motivo", "corpo", "texto", true, "Motivo."),
                confirmar(),
            ],
        ),
        Acao::gravacao(
            "aprovar_formulario_pop",
            "qualidade_pops",
            "Aprova o formulário (rascunho ou em aprovação): vira vigente (vigência hoje, próxima revisão em 2 anos), soma a revisão e guarda a cópia no histórico. Do rascunho, a trilha registra o envio e a aprovação.",
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
            "marcar_formulario_pasta_do_mes",
            "qualidade_pops",
            "Liga ou desliga o formulário na «pasta do mês» do setor (os formulários que a fábrica preenche todo mês e que saem juntos na impressão mensal). Não muda status nem revisão. Sem `confirmar=true` mostra só a prévia.",
            "POST",
            "/api/qualidade/pops/formularios/:code/pasta-mes",
            true,
            vec![
                param("code", "caminho", "texto", true, "Código do formulário."),
                param("ativo", "corpo", "booleano", true, "true = entra na pasta do mês; false = sai."),
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

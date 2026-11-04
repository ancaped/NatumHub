mod handlers;

use std::sync::Arc;
use axum::{routing::{delete, get, post}, Router};
use crate::core::catalogo::{param, Acao};
use crate::handlers::AppState;

/// As rotas ficam sob `/api/admin/produtos-ativos` (mesmo módulo de permissão da Linha de Produtos).
pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/admin/produtos-ativos/linhas-kits",
            get(handlers::listar).post(handlers::salvar),
        )
        .route("/api/admin/produtos-ativos/linhas-kits/atribuir", post(handlers::atribuir))
        .route("/api/admin/produtos-ativos/linhas-kits/:id", delete(handlers::excluir))
}

/// Ações de linhas de kits descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<Acao> {
    const M: &str = "admin_linha_produtos";
    vec![
        Acao::leitura(
            "listar_linhas_kits",
            M,
            "Linhas de kits (Kits Natum, Kits Hair...) com os prefixos de código que as sugerem, e os kits ativos com a linha sugerida pelo prefixo, a linha manual (se houver) e a linha final. Traz também kits sem composição no ERP. Use para saber a que linha cada kit pertence; a composição do kit continua só no ERP.",
            "/api/admin/produtos-ativos/linhas-kits",
            vec![],
        ),
        Acao::gravacao(
            "salvar_linha_kit",
            M,
            "Cria ou altera uma linha de kits (nome e prefixos de código que a sugerem). Sem `id` cria uma nova; com `id` altera. Um prefixo só pode estar em uma linha. Sem `confirmar=true` devolve só a prévia (antes e depois).",
            "POST",
            "/api/admin/produtos-ativos/linhas-kits",
            true,
            vec![
                param("confirmar", "query", "booleano", false, "true grava; ausente só mostra a prévia."),
                param("id", "corpo", "texto", false, "Id da linha a alterar; vazio cria uma nova."),
                param("nome", "corpo", "texto", true, "Nome da linha, por exemplo Kits Natum."),
                param("prefixos", "corpo", "lista de texto", false, "Primeiros segmentos do código do kit que sugerem esta linha (ex.: 1, 2, 10)."),
            ],
        ),
        Acao::gravacao(
            "atribuir_linha_kit",
            M,
            "Liga kits a uma linha de kits (correção manual da sugestão por prefixo) ou, sem `linhaId`, volta ao automático. Funciona também para kits sem composição no ERP. Sem `confirmar=true` devolve só a prévia (linha atual e nova de cada kit).",
            "POST",
            "/api/admin/produtos-ativos/linhas-kits/atribuir",
            true,
            vec![
                param("confirmar", "query", "booleano", false, "true grava; ausente só mostra a prévia."),
                param("codigos", "corpo", "lista de texto", true, "Códigos dos kits."),
                param("linhaId", "corpo", "texto", false, "Id da linha de kits; vazio volta ao automático (prefixo)."),
            ],
        ),
        Acao::exclusao(
            "excluir_linha_kit",
            M,
            "Exclui uma linha de kits: as ligações manuais dela somem e os kits voltam à sugestão pelo prefixo. Exige `motivo` ao confirmar; a cópia da linha fica na auditoria; agentes não podem usar. Sem `confirmar=true` devolve só a prévia (quantas ligações manuais seriam removidas).",
            "DELETE",
            "/api/admin/produtos-ativos/linhas-kits/:id",
            vec![
                param("id", "caminho", "texto", true, "Id da linha de kits."),
                param("confirmar", "query", "booleano", false, "true grava; ausente só mostra a prévia."),
            ],
        ),
    ]
}

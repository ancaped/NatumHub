//! Linha de Produtos (config_linhas): troca de prefixo em 2 passos e resumo de dados da linha (só leitura).
mod classificacao_linha;
mod handlers;
pub use classificacao_linha::classificar_linha;
pub mod heranca;
pub mod prefixo;
pub mod resumo;

use std::sync::Arc;
use axum::{routing::{get, post}, Router};
use crate::core::catalogo::{param, Acao};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/admin/produtos-ativos/linhas/prefixo", post(handlers::trocar_prefixo))
        .route("/api/admin/produtos-ativos/linhas/classificacao", post(handlers::classificar_linha))
        .route("/api/admin/produtos-ativos/linhas/atendimentos", get(handlers::atendimentos))
        .route("/api/admin/produtos-ativos/linhas/heranca", get(handlers::heranca))
        .route("/api/admin/produtos-ativos/linhas/principal", post(handlers::linha_principal))
        .route("/api/admin/produtos-ativos/linhas/parametro", post(handlers::parametro))
        .route("/api/admin/produtos-ativos/linhas/:prefixo/resumo", get(handlers::resumo))
}

/// Ações descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<Acao> {
    const M: &str = "admin_linha_produtos";
    vec![
        Acao::gravacao(
            "renomear_prefixo_linha",
            M,
            "Troca o prefixo de uma linha de produtos (o prefixo é a chave da linha). Os produtos que passam a casar com o prefixo novo entram na linha, os que deixam de casar saem (voltam para outra linha ou DEFAULT); os ajustes manuais de linha e as regras de produção da linha acompanham. Recusa prefixo vazio, DEFAULT e o já usado por outra linha. Sem `confirmar=true` devolve só a prévia (quem entra, quem sai, quantos ajustes manuais mudam); com `confirmar=true` grava tudo numa transação e audita antes e depois.",
            "POST",
            "/api/admin/produtos-ativos/linhas/prefixo",
            true,
            vec![
                param("confirmar", "query", "booleano", false, "true grava; ausente só mostra a prévia."),
                param("prefixoAtual", "corpo", "texto", true, "Prefixo atual da linha."),
                param("prefixoNovo", "corpo", "texto", true, "Prefixo novo (letras, números, ponto, hífen, sublinhado; ex.: 9.15)."),
            ],
        ),
        Acao::gravacao(
            "classificar_linha",
            M,
            "Muda o atendimento padrão de uma linha (estoque ou terceirizado) e/ou a deixa ativa ou inativa. Só o atendimento `estoque` gera demanda automática de produção e de insumo; produto com exceção própria de atendimento não muda. Linha inativa esconde a linha e os produtos dela em todos os módulos (o histórico fica guardado). Sem `confirmar=true` devolve só a prévia (quantos produtos mudam de efeito); com `confirmar=true` grava e audita antes e depois.",
            "POST",
            "/api/admin/produtos-ativos/linhas/classificacao",
            true,
            vec![
                param("confirmar", "query", "booleano", false, "true grava; ausente só mostra a prévia."),
                param("prefixo", "corpo", "texto", true, "Prefixo da linha."),
                param("atendimento", "corpo", "texto", false, "estoque ou terceirizado."),
                param("ativa", "corpo", "booleano", false, "false inativa a linha; true a reativa."),
            ],
        ),
        Acao::gravacao(
            "definir_linha_principal",
            M,
            "Faz uma linha virar sublinha de outra (ou tira a linha principal). Só um nível: sublinha não tem sublinha, linha com sublinhas não vira sublinha, DEFAULT não entra. Ao virar sublinha os valores atuais continuam próprios (nenhum número muda). Inativar a principal esconde as sublinhas junto. Sem `confirmar=true` devolve só a prévia; com `confirmar=true` grava e audita antes e depois.",
            "POST",
            "/api/admin/produtos-ativos/linhas/principal",
            true,
            vec![
                param("confirmar", "query", "booleano", false, "true grava; ausente só mostra a prévia."),
                param("prefixo", "corpo", "texto", true, "Prefixo da linha que vira sublinha."),
                param("principal", "corpo", "texto", false, "Prefixo da linha principal; ausente ou vazio tira a linha principal."),
            ],
        ),
        Acao::gravacao(
            "parametro_linha",
            M,
            "Marca um parâmetro de uma linha como próprio (com `valor`) ou, numa sublinha, volta a herdar o valor da principal. Parâmetros: estoque_ideal, abrir_ordem, abrir_prod, fator_z, atendimento. Mudar o valor de uma principal vale para as sublinhas que herdam. A prévia mostra quantas sublinhas e produtos mudam; com `confirmar=true` grava e audita.",
            "POST",
            "/api/admin/produtos-ativos/linhas/parametro",
            true,
            vec![
                param("confirmar", "query", "booleano", false, "true grava; ausente só mostra a prévia."),
                param("prefixo", "corpo", "texto", true, "Prefixo da linha."),
                param("parametro", "corpo", "texto", true, "estoque_ideal, abrir_ordem, abrir_prod, fator_z ou atendimento."),
                param("modo", "corpo", "texto", true, "proprio (valor próprio) ou herdar (volta ao valor da principal)."),
                param("valor", "corpo", "número ou texto", false, "Valor novo (modo proprio); sem valor só deixa de herdar mantendo o número de agora."),
            ],
        ),
        Acao::leitura(
            "heranca_linhas_produtos",
            M,
            "Para cada linha: a linha principal (se for sublinha), quais parâmetros herda e a escolha própria de ativa/inativa.",
            "/api/admin/produtos-ativos/linhas/heranca",
            vec![],
        ),
        Acao::leitura(
            "atendimentos_linhas_produtos",
            M,
            "Atendimento e situação ativa de cada linha, e os produtos com exceção de atendimento ou que não geram demanda por herança da linha.",
            "/api/admin/produtos-ativos/linhas/atendimentos",
            vec![],
        ),
        Acao::leitura(
            "resumo_linha_produtos",
            M,
            "Dados de uma linha: vendas em unidades por mês (12 meses) e os produtos que mais vendem; estoque, produtos abaixo do gatilho e faltas de venda (os mesmos números da Demanda de Produção); produção dos últimos 6 meses, o que está planejado e o que está na fila. Sem faturamento em R$.",
            "/api/admin/produtos-ativos/linhas/:prefixo/resumo",
            vec![param("prefixo", "caminho", "texto", true, "Prefixo da linha.")],
        ),
    ]
}

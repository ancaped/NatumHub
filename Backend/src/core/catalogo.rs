//! Catálogo de ações do Nexus para agentes de IA (e para qualquer cliente que queira descobrir a API).
//!
//! Cada módulo descreve suas rotas úteis em `acoes()` logo abaixo do `router()`; aqui só juntamos as listas.
//! O catálogo é só descrição: quem decide o que cada agente pode fazer continua sendo
//! `auth::store::{has_read_access, has_write_access}` (ver `agentes::acoes_para`).

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Param {
    pub nome: &'static str,
    /// `caminho`, `query` ou `corpo`.
    pub onde: &'static str,
    pub tipo: &'static str,
    pub obrigatorio: bool,
    pub descricao: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Acao {
    pub nome: &'static str,
    /// `module_key` de permissão usado pela rota.
    pub modulo: &'static str,
    pub descricao: &'static str,
    pub metodo: &'static str,
    pub caminho: &'static str,
    /// Grava no banco.
    pub escrita: bool,
    /// Sem `confirmar=true` só devolve a prévia.
    pub dois_passos: bool,
    pub parametros: Vec<Param>,
}

pub fn param(nome: &'static str, onde: &'static str, tipo: &'static str, obrigatorio: bool, descricao: &'static str) -> Param {
    Param { nome, onde, tipo, obrigatorio, descricao }
}

impl Acao {
    /// Consulta (não grava), por `GET`.
    pub fn leitura(nome: &'static str, modulo: &'static str, descricao: &'static str, caminho: &'static str, parametros: Vec<Param>) -> Self {
        Self { nome, modulo, descricao, metodo: "GET", caminho, escrita: false, dois_passos: false, parametros }
    }

    /// Consulta que usa `POST` por causa do corpo (não grava).
    pub fn calculo(nome: &'static str, modulo: &'static str, descricao: &'static str, caminho: &'static str, parametros: Vec<Param>) -> Self {
        Self { nome, modulo, descricao, metodo: "POST", caminho, escrita: false, dois_passos: false, parametros }
    }

    /// Grava no banco. `dois_passos`: sem `confirmar=true` devolve só a prévia.
    pub fn gravacao(
        nome: &'static str,
        modulo: &'static str,
        descricao: &'static str,
        metodo: &'static str,
        caminho: &'static str,
        dois_passos: bool,
        parametros: Vec<Param>,
    ) -> Self {
        Self { nome, modulo, descricao, metodo, caminho, escrita: true, dois_passos, parametros }
    }
}

/// Todas as ações descritas, juntando as listas dos módulos.
pub fn todas() -> Vec<Acao> {
    use crate::modules::producao::{
        auditoria, bases, calculo, cobertura, decisoes, fila, historico, insumos_classificacao, kits, lotes, planejamento, proc,
        reatores, trocas,
    };
    let mut v = Vec::new();
    v.extend(planejamento::acoes());
    v.extend(fila::acoes());
    v.extend(reatores::acoes());
    v.extend(cobertura::acoes());
    v.extend(lotes::acoes());
    v.extend(calculo::acoes());
    v.extend(bases::acoes());
    v.extend(kits::acoes());
    v.extend(auditoria::acoes());
    v.extend(decisoes::acoes());
    v.extend(trocas::acoes());
    v.extend(insumos_classificacao::acoes());
    v.extend(historico::acoes());
    v.extend(proc::acoes());
    v.extend(crate::modules::estoque::movimentos::acoes());
    v.extend(crate::modules::estoque::estoque_geral::acoes());
    v.extend(crate::modules::compras::planejamento::acoes());
    v.extend(crate::modules::hub_api::compras::acoes());
    v.extend(crate::handlers::estoque::acoes_produtos());
    v.extend(crate::handlers::vendas::acoes_vendas());
    v.extend(crate::handlers::configs::acoes_linha_produtos());
    v.extend(crate::handlers::kits::acoes_kits_composicao());
    v.extend(crate::modules::administrativo::produtos_ativos_relatorios::acoes());
    v.extend(crate::modules::estoque::almoxarifado::acoes());
    v.extend(crate::modules::qualidade::avarias::acoes());
    v.extend(crate::modules::qualidade::devolucoes::acoes());
    v.extend(crate::modules::qualidade::recebimento_mp::acoes());
    v.extend(crate::modules::qualidade::pops::acoes());
    v.extend(crate::modules::qualidade::documentacao::acoes());
    v.extend(crate::modules::administrativo::acompanhamento_producao::acoes());
    v.extend(crate::modules::expedicao::acoes());
    v.extend(crate::modules::financeiro::acoes());
    v.extend(crate::modules::hub_api::microbio::acoes());
    v.extend(crate::modules::hub_api::fisco::acoes());
    v
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    /// Escritas que ainda gravam direto, sem prévia. Escrita nova sem 2 passos fora desta lista reprova o teste.
    const ESCRITAS_SEM_DOIS_PASSOS: &[&str] = &[
        "gravar_ordens_planejamento",
        "enviar_para_fila",
    ];

    #[test]
    fn nomes_sao_unicos() {
        let mut vistos = HashSet::new();
        for a in todas() {
            assert!(vistos.insert(a.nome), "nome repetido no catálogo: {}", a.nome);
        }
    }

    #[test]
    fn dois_passos_implica_escrita() {
        for a in todas() {
            assert!(!a.dois_passos || a.escrita, "{} é 2 passos mas não é escrita", a.nome);
        }
    }

    #[test]
    fn cada_acao_tem_modulo_valido_para_a_rota() {
        for a in todas() {
            let modulos = crate::modules::geral::auth::store::modulos_da_rota(a.caminho)
                .unwrap_or_else(|| panic!("{}: rota sem módulo mapeado ({})", a.nome, a.caminho));
            assert!(modulos.contains(&a.modulo), "{}: módulo {} não dá acesso a {}", a.nome, a.modulo, a.caminho);
        }
    }

    #[test]
    fn metodo_e_escrita_batem() {
        for a in todas() {
            assert!(matches!(a.metodo, "GET" | "POST" | "PUT" | "PATCH" | "DELETE"), "{}: método {}", a.nome, a.metodo);
            if a.metodo == "GET" {
                assert!(!a.escrita, "{}: GET não grava", a.nome);
            }
            for p in &a.parametros {
                assert!(matches!(p.onde, "caminho" | "query" | "corpo"), "{}: onde inválido em {}", a.nome, p.nome);
            }
        }
    }

    #[test]
    fn caminho_existe_no_fonte_do_modulo() {
        let fontes = [
            include_str!("../modules/producao/planejamento.rs"),
            include_str!("../modules/producao/fila.rs"),
            include_str!("../modules/producao/reatores.rs"),
            include_str!("../modules/producao/cobertura/mod.rs"),
            include_str!("../modules/producao/lotes.rs"),
            include_str!("../modules/producao/calculo.rs"),
            include_str!("../modules/producao/bases.rs"),
            include_str!("../modules/producao/kits.rs"),
            include_str!("../modules/producao/auditoria.rs"),
            include_str!("../modules/producao/decisoes.rs"),
            include_str!("../modules/producao/trocas.rs"),
            include_str!("../modules/producao/insumos_classificacao.rs"),
            include_str!("../modules/producao/historico.rs"),
            include_str!("../modules/producao/proc/mod.rs"),
            include_str!("../modules/estoque/movimentos.rs"),
            include_str!("../modules/estoque/estoque_geral/mod.rs"),
            include_str!("../modules/compras/planejamento/mod.rs"),
            include_str!("../modules/hub_api/compras.rs"),
            include_str!("../modules/administrativo/produtos_ativos_relatorios/mod.rs"),
            include_str!("../modules/estoque/almoxarifado/mod.rs"),
            include_str!("../modules/qualidade/avarias/mod.rs"),
            include_str!("../modules/qualidade/devolucoes/mod.rs"),
            include_str!("../modules/qualidade/recebimento_mp/mod.rs"),
            include_str!("../modules/qualidade/pops/mod.rs"),
            include_str!("../modules/qualidade/documentacao/mod.rs"),
            include_str!("../modules/administrativo/acompanhamento_producao/mod.rs"),
            include_str!("../modules/expedicao/mod.rs"),
            include_str!("../modules/financeiro/mod.rs"),
            include_str!("../modules/hub_api/microbio.rs"),
            include_str!("../modules/hub_api/fisco.rs"),
            include_str!("../server.rs"),
        ]
        .concat();
        for a in todas() {
            let literal = format!("\"{}\"", a.caminho);
            assert!(fontes.contains(&literal), "{}: rota {} não existe nos routers", a.nome, a.caminho);
        }
    }

    #[test]
    fn escritas_sem_dois_passos_sao_so_as_conhecidas() {
        let sem: Vec<&str> = todas().iter().filter(|a| a.escrita && !a.dois_passos).map(|a| a.nome).collect();
        println!("escritas sem 2 passos (exceções conhecidas): {sem:?}");
        for nome in &sem {
            assert!(ESCRITAS_SEM_DOIS_PASSOS.contains(nome), "escrita nova sem 2 passos: {nome}");
        }
        for nome in ESCRITAS_SEM_DOIS_PASSOS {
            assert!(sem.contains(nome), "{nome} saiu da lista de exceções: tire-o de ESCRITAS_SEM_DOIS_PASSOS");
        }
    }
}

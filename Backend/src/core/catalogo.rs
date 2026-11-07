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
    /// `module_key` de permissão usado pela rota. Quando `modulos` está preenchido, qualquer um deles libera.
    pub modulo: &'static str,
    /// Famílias que liberam a ação. Vazio = só `modulo`.
    #[serde(skip_serializing_if = "modulos_vazio")]
    pub modulos: &'static [&'static str],
    pub descricao: &'static str,
    pub metodo: &'static str,
    pub caminho: &'static str,
    /// Grava no banco.
    pub escrita: bool,
    /// Sem `confirmar=true` só devolve a prévia.
    pub dois_passos: bool,
    /// Apaga registro: exige `motivo` ao confirmar, guarda cópia na auditoria e agentes não podem usar.
    pub exclui: bool,
    pub parametros: Vec<Param>,
}

pub fn param(nome: &'static str, onde: &'static str, tipo: &'static str, obrigatorio: bool, descricao: &'static str) -> Param {
    Param { nome, onde, tipo, obrigatorio, descricao }
}

fn modulos_vazio(m: &&[&str]) -> bool {
    m.is_empty()
}

impl Acao {
    /// Consulta (não grava), por `GET`.
    pub fn leitura(nome: &'static str, modulo: &'static str, descricao: &'static str, caminho: &'static str, parametros: Vec<Param>) -> Self {
        Self { nome, modulo, modulos: &[], descricao, metodo: "GET", caminho, escrita: false, dois_passos: false, exclui: false, parametros }
    }

    /// Consulta que usa `POST` por causa do corpo (não grava).
    pub fn calculo(nome: &'static str, modulo: &'static str, descricao: &'static str, caminho: &'static str, parametros: Vec<Param>) -> Self {
        Self { nome, modulo, modulos: &[], descricao, metodo: "POST", caminho, escrita: false, dois_passos: false, exclui: false, parametros }
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
        Self { nome, modulo, modulos: &[], descricao, metodo, caminho, escrita: true, dois_passos, exclui: false, parametros }
    }

    /// A ação vale para qualquer uma destas famílias (a checagem fina continua no handler).
    pub fn com_familias(mut self, modulos: &'static [&'static str]) -> Self {
        self.modulos = modulos;
        self
    }

    pub fn familias(&self) -> Vec<&'static str> {
        if self.modulos.is_empty() { vec![self.modulo] } else { self.modulos.to_vec() }
    }
}

impl Acao {
    /// Apaga registro (sempre em 2 passos). Exige `motivo` ao confirmar, a cópia do que foi apagado fica na auditoria
    /// e agentes não podem usar. O parâmetro `motivo` é acrescentado aqui se a ação não o declarou.
    pub fn exclusao(
        nome: &'static str,
        modulo: &'static str,
        descricao: &'static str,
        metodo: &'static str,
        caminho: &'static str,
        mut parametros: Vec<Param>,
    ) -> Self {
        if !parametros.iter().any(|p| p.nome == "motivo") {
            let onde = if metodo == "DELETE" { "query" } else { "corpo" };
            parametros.push(param(
                "motivo",
                onde,
                "texto",
                true,
                "Por que o registro está sendo apagado (obrigatório ao confirmar; vai para a auditoria com a cópia do que foi apagado). Também aceito no corpo, quando houver.",
            ));
        }
        Self { nome, modulo, modulos: &[], descricao, metodo, caminho, escrita: true, dois_passos: true, exclui: true, parametros }
    }
}

/// A rota `padrao` do catálogo (com `:param`) casa com o `caminho` pedido?
pub fn caminho_casa(padrao: &str, caminho: &str) -> bool {
    let a: Vec<&str> = padrao.trim_end_matches('/').split('/').collect();
    let b: Vec<&str> = caminho.split('?').next().unwrap_or("").trim_end_matches('/').split('/').collect();
    a.len() == b.len() && a.iter().zip(&b).all(|(x, y)| x.starts_with(':') || x == y)
}

/// Mensagem do 403 que agentes recebem ao tentar excluir.
pub const AGENTE_NAO_EXCLUI: &str =
    "Agentes não excluem registros: use retirar/arquivar quando existir, ou peça a um operador.";

/// A chamada apaga registro? Todo `DELETE` (menos o logout da sessão) e as ações do catálogo marcadas com `exclui`
/// (as que usam `POST`, como limpar a fila). É por aqui que o middleware recusa agentes.
pub fn e_exclusao(metodo: &str, caminho: &str) -> bool {
    let da_rota = todas().into_iter().find(|a| a.metodo == metodo && caminho_casa(a.caminho, caminho));
    match da_rota {
        // ação descrita no catálogo: vale a marca dela (um DELETE que só cancela, como o das solicitações, não apaga)
        Some(a) => a.exclui,
        None => metodo == "DELETE",
    }
}

/// Todas as ações descritas, juntando as listas dos módulos.
pub fn todas() -> Vec<Acao> {
    use crate::modules::producao::{
        auditoria, bases, calculo, cobertura, decisoes, fila, historico, insumos_classificacao, kits, lotes, planejamento, proc,
        reatores, trocas,
    };
    use crate::modules::producao::{contexto, regras, roteiro, sequencia};
    let mut v = Vec::new();
    v.extend(planejamento::acoes());
    v.extend(fila::acoes());
    v.extend(crate::modules::producao::sem_peso::acoes());
    v.extend(reatores::acoes());
    v.extend(cobertura::acoes());
    v.extend(lotes::acoes());
    v.extend(calculo::acoes());
    v.extend(bases::acoes());
    v.extend(kits::acoes());
    v.extend(auditoria::acoes());
    v.extend(decisoes::acoes());
    v.extend(regras::acoes());
    v.extend(contexto::acoes());
    v.extend(roteiro::acoes());
    v.extend(sequencia::acoes());
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
    v.extend(crate::modules::administrativo::linhas_kits::acoes());
    v.extend(crate::modules::estoque::almoxarifado::acoes());
    v.extend(crate::modules::estoque::ordens_manuais::acoes());
    v.extend(crate::modules::qualidade::avarias::acoes());
    v.extend(crate::modules::qualidade::devolucoes::acoes());
    v.extend(crate::modules::qualidade::recebimento_mp::acoes());
    v.extend(crate::modules::qualidade::pops::acoes());
    v.extend(crate::modules::qualidade::documentacao::acoes());
    v.extend(crate::modules::administrativo::acompanhamento_producao::acoes());
    v.extend(crate::modules::expedicao::acoes());
    v.extend(crate::modules::financeiro::acoes());
    v.extend(crate::modules::geral::agentes::acoes());
    v.extend(crate::modules::hub_api::microbio::acoes());
    v.extend(crate::modules::hub_api::fisco::acoes());
    v
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    /// Escritas que ainda gravam direto, sem prévia. Escrita nova sem 2 passos fora desta lista reprova o teste.
    const ESCRITAS_SEM_DOIS_PASSOS: &[&str] = &[];

    #[test]
    fn trocar_categoria_item_segue_a_familia_e_nao_so_apoio() {
        let acao = todas().into_iter().find(|a| a.nome == "trocar_categoria_item").expect("ação no catálogo");
        for familia in ["compras_materia_prima", "compras_embalagens", "compras_coloracao", "compras_apoio"] {
            assert!(acao.familias().contains(&familia), "{familia} não libera a troca");
        }
        assert_ne!(acao.modulos, &["compras_apoio"][..]);
    }

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
            for m in a.familias() {
                assert!(modulos.contains(&m), "{}: módulo {} não dá acesso a {}", a.nome, m, a.caminho);
            }
        }
    }

    /// Descrição de uma linha só não diz ao agente o que volta nem quando usar: mínimo de 90 caracteres.
    #[test]
    fn descricoes_tem_tamanho_minimo() {
        for a in todas() {
            assert!(a.descricao.chars().count() >= 90, "{}: descrição curta demais ({} caracteres)", a.nome, a.descricao.chars().count());
        }
    }

    #[test]
    fn exclusoes_exigem_motivo_e_dizem_isso_na_descricao() {
        let mut n = 0;
        for a in todas().into_iter().filter(|a| a.exclui) {
            n += 1;
            assert!(a.escrita && a.dois_passos, "{}: exclusão é escrita em 2 passos", a.nome);
            assert!(a.parametros.iter().any(|p| p.nome == "motivo" && p.obrigatorio), "{}: falta o parâmetro motivo", a.nome);
            assert!(a.descricao.contains("motivo") && a.descricao.contains("auditoria") && a.descricao.contains("agentes não podem"), "{}: descrição sem a regra de exclusão", a.nome);
        }
        assert!(n >= 10, "esperava as exclusões marcadas, achei {n}");
    }

    /// Todo `DELETE` do catálogo ou é exclusão marcada ou está na lista dos que só cancelam.
    #[test]
    fn delete_do_catalogo_e_exclusao_ou_cancelamento_conhecido() {
        const SO_CANCELAM: &[&str] = &["cancelar_solicitacao_terceirizado"];
        for a in todas().into_iter().filter(|a| a.metodo == "DELETE") {
            assert!(a.exclui || SO_CANCELAM.contains(&a.nome), "{}: DELETE sem marcar como exclusão", a.nome);
        }
    }

    #[test]
    fn agente_nao_exclui_mas_cancelar_e_logout_seguem() {
        assert!(e_exclusao("DELETE", "/api/producao/fila-demandas/abc"));
        assert!(e_exclusao("POST", "/api/producao/fila-demandas/limpar"));
        assert!(e_exclusao("DELETE", "/api/rota/sem/catalogo/1"));
        assert!(!e_exclusao("DELETE", "/api/administrativo/terceirizados/solicitacoes/7"));
        assert!(!e_exclusao("POST", "/api/producao/fila-demandas"));
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
            include_str!("../modules/producao/regras.rs"),
            include_str!("../modules/producao/contexto.rs"),
            include_str!("../modules/producao/roteiro.rs"),
            include_str!("../modules/producao/sequencia.rs"),
            include_str!("../modules/producao/trocas.rs"),
            include_str!("../modules/producao/insumos_classificacao.rs"),
            include_str!("../modules/producao/historico.rs"),
            include_str!("../modules/producao/proc/mod.rs"),
            include_str!("../modules/estoque/movimentos.rs"),
            include_str!("../modules/estoque/estoque_geral/mod.rs"),
            include_str!("../modules/compras/planejamento/mod.rs"),
            include_str!("../modules/hub_api/compras.rs"),
            include_str!("../modules/administrativo/produtos_ativos_relatorios/mod.rs"),
            include_str!("../modules/administrativo/linhas_kits/mod.rs"),
            include_str!("../modules/estoque/almoxarifado/mod.rs"),
            include_str!("../modules/estoque/ordens_manuais/mod.rs"),
            include_str!("../modules/qualidade/avarias/mod.rs"),
            include_str!("../modules/qualidade/devolucoes/mod.rs"),
            include_str!("../modules/qualidade/recebimento_mp/mod.rs"),
            include_str!("../modules/qualidade/pops/mod.rs"),
            include_str!("../modules/qualidade/documentacao/mod.rs"),
            include_str!("../modules/administrativo/acompanhamento_producao/mod.rs"),
            include_str!("../modules/producao/sem_peso.rs"),
            include_str!("../modules/producao/kits_erp.rs"),
            include_str!("../modules/producao/vira_erp.rs"),
            include_str!("../modules/expedicao/mod.rs"),
            include_str!("../modules/financeiro/mod.rs"),
            include_str!("../modules/geral/agentes/mod.rs"),
            include_str!("../modules/hub_api/microbio.rs"),
            include_str!("../modules/hub_api/fisco.rs"),
            include_str!("../handlers/vendas.rs"),
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

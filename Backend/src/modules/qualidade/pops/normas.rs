//! Normas e regras do controle de documentos (POPs e formulários). Texto fixo: a aba «Normas e regras» e os agentes
//! (ação `normas_pops`) leem desta mesma fonte. Só descreve o que o código e a decisão do Edson já fazem; não cria regra.

use serde_json::{json, Value};

struct Bloco {
    titulo: &'static str,
    itens: &'static [&'static str],
}

const BLOCOS: &[Bloco] = &[
    Bloco {
        titulo: "Norma",
        itens: &[
            "A fábrica segue a RDC ANVISA 48/2013 (BPF de higiene pessoal, cosméticos e perfumes).",
            "A Vigilância Sanitária de Minas Gerais aplica essa RDC. Não há regra mineira própria de numeração.",
            "O texto oficial da RDC precisa ser conferido antes de fechar a revisão dos POPs.",
        ],
    },
    Bloco {
        titulo: "Códigos e setores",
        itens: &[
            "POP: POP-SETOR-NNN, revisão com dois dígitos. Exemplo: POP-CQL-015 Rev. 04.",
            "Formulário: FOR-SETOR-NNN-SEQ, no número do POP ao qual pertence. Exemplo: FOR-CQL-015-01.",
            "Setores (sigla do código): ADM Administração, ALM Almoxarifado, ATD Atendimento, EXP Expedição, PRD Produção e CQL Controle de Qualidade.",
            "O sequencial do formulário não muda. A revisão muda quando a alteração é aprovada.",
            "Um formulário se vincula a um POP que existe; o título do POP aparece na folha.",
        ],
    },
    Bloco {
        titulo: "Status e fluxo",
        itens: &[
            "Rascunho → em aprovação → vigente → obsoleto. Em aprovação pode voltar a rascunho.",
            "Enviar, devolver, aprovar, revalidar ou tornar obsoleto exige motivo.",
            "Só o rascunho se edita. Documento vigente muda por «Nova revisão», que abre um rascunho; a vigente segue valendo até a nova ser aprovada.",
            "Nada é apagado. O obsoleto sai da lista Em uso e continua em Todos os status.",
            "Toda mudança grava um evento na trilha (quem, quando, de qual status para qual e o motivo). A trilha não se altera nem se apaga.",
            "Elaborado, revisado e aprovado se assinam à caneta na folha impressa.",
            "Só a revisão vigente pode ser usada no chão de fábrica. Folha antiga se marca OBSOLETO e se recolhe.",
        ],
    },
    Bloco {
        titulo: "Revisão e vigência",
        itens: &[
            "A revisão é feita a cada 2 anos, ou antes se o processo mudar. A próxima revisão é a vigência mais 2 anos; passada a data, o documento aparece como vencido.",
            "Emissão inicial de POP mantém a revisão e a data de vigência do Word (revisão mínima 1).",
            "Revisão nova de POP soma 1 à revisão e usa a vigência informada (hoje, se não informada).",
            "Formulário: a primeira publicação é a Rev. 00 e cada publicação seguinte soma 1. A vigência é a data da aprovação.",
            "Cada publicação guarda uma cópia completa do documento no histórico de revisões.",
        ],
    },
    Bloco {
        titulo: "Emissão em lote",
        itens: &[
            "Leva POPs ou formulários de rascunho/em aprovação até vigente numa operação só, com a mesma regra da aprovação individual.",
            "Entram só rascunho e em aprovação. Vigentes e obsoletos são ignorados, com o motivo na resposta.",
            "Escolhe-se por lista de códigos ou por setor. O motivo é obrigatório e vale para todos.",
            "Sem confirmar só mostra a prévia: o que entra, com revisão, vigência e próxima revisão, e o que foi ignorado.",
            "Documento cuja próxima revisão já passou nasce marcado como vencido.",
        ],
    },
    Bloco {
        titulo: "Formulários",
        itens: &[
            "Colunas: de 1 a 14, cada uma com rótulo, tipo (data, hora, número, texto, sim/não ou rubrica) e, se houver, limite.",
            "Limites de aceitação: faixa impressa acima da tabela. Fora do limite, abrir não conformidade.",
            "Especificações: texto fixo impresso abaixo da tabela, uma por linha (soluções de limpeza, frequência, orientação). Vêm do formulário original.",
            "Áreas: cada área é uma folha (até 30). Sem áreas, é uma folha só com a área em branco.",
            "Linhas por folha: as que preenchem a folha (descontando limites e especificações) ou o número definido, de 1 a 60.",
            "Folha em pé (A4 vertical) ou deitada (A4 horizontal). Rascunho, em aprovação e obsoleto saem com marca d'água.",
            "A impressão oficial usa a revisão vigente; enquanto uma nova revisão está em rascunho, imprime-se a vigente.",
        ],
    },
    Bloco {
        titulo: "Preenchimento em papel",
        itens: &[
            "Caneta azul ou preta, no momento da atividade. Sem lápis, caneta apagável ou corretivo.",
            "Data DD/MM/AAAA. Quem executou e quem verificou assinam.",
            "Erro: um traço, o valor certo ao lado, rubrica, data e motivo. O erro continua legível.",
            "Campo que não se aplica: N/A. Fora do limite: abrir não conformidade (POP-CQL-081).",
        ],
    },
    Bloco {
        titulo: "Registro eletrônico",
        itens: &[
            "O Nexus ainda não substitui o papel. Temperatura e limpeza em tela ficam para a fase seguinte.",
            "Quando entrar, o registro eletrônico precisa de login individual, motivo em toda alteração e proibição de apagar.",
        ],
    },
];

/// Bloco «Para agentes»: as rotas vêm do catálogo do módulo (`acoes()`), para nunca ficar diferente do código.
fn bloco_agentes() -> Value {
    let acoes = super::acoes();
    let mut itens: Vec<String> = vec![
        "Leitura (GET): use as ações abaixo para ler POPs, formulários, trilha de eventos e estas normas.".into(),
        "Toda escrita é em 2 passos: sem confirmar=true a rota só devolve a prévia do que mudaria; com confirmar=true grava.".into(),
        "Mudança de status, aprovação e nova revisão exigem motivo. Toda gravação registra quem fez (operador ou agente) na auditoria e na trilha.".into(),
    ];
    itens.extend(
        acoes
            .iter()
            .filter(|a| !a.escrita)
            .map(|a| format!("{} — {} ({} {})", a.nome, a.descricao, a.metodo, a.caminho)),
    );
    itens.extend(acoes.iter().filter(|a| a.escrita).map(|a| format!("{} — {} ({} {})", a.nome, a.descricao, a.metodo, a.caminho)));
    json!({ "titulo": "Para agentes", "itens": itens })
}

/// `GET /api/qualidade/pops/normas`.
pub fn normas() -> Value {
    let mut blocos: Vec<Value> = BLOCOS.iter().map(|b| json!({ "titulo": b.titulo, "itens": b.itens })).collect();
    blocos.push(bloco_agentes());
    json!({
        "titulo": "Normas e regras do controle de documentos dos POPs e formulários",
        "blocos": blocos,
    })
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn normas_tem_blocos_e_rotas_do_catalogo() {
        let v = normas();
        let blocos = v["blocos"].as_array().unwrap();
        assert!(blocos.len() >= 8);
        assert!(blocos.iter().all(|b| !b["itens"].as_array().unwrap().is_empty()));
        let agentes = blocos.last().unwrap();
        assert_eq!(agentes["titulo"], "Para agentes");
        let txt = agentes["itens"].to_string();
        assert!(txt.contains("/api/qualidade/pops/formularios/:code"));
        assert!(txt.contains("/api/qualidade/pops/normas"));
    }
}

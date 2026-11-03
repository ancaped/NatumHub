//! Processo do produto no servidor (uma fonte só): quente, frio ou shampoo, se pode ir na bombona, recipiente
//! sugerido e a quantidade recomendada do cadastro em unidades e em kg.
//!
//! Porta fiel de `getProductProcessType` (`Frontend/src/modules/producao/lib/processoProduto.ts`); a fila automática e a
//! sequência do planejamento usam esta. Funções puras: sem banco.

use serde::Serialize;

use crate::core::regras_produto::e_base;
use crate::modules::producao::fila::medida_kg;

/// Produção quente na bombona com água quente da caldeira: até 150 kg (regra do Edson, 2026-11-03).
pub const LIMITE_BOMBONA_QUENTE_KG: f64 = 150.0;
/// A frio, a bombona comporta até 200 kg.
pub const LIMITE_BOMBONA_FRIO_KG: f64 = 200.0;

/// Dados do produto que decidem o processo. Textos vazios = ausente.
#[derive(Debug, Clone, Default)]
pub struct EntradaProcesso<'a> {
    pub codigo: &'a str,
    pub descricao: &'a str,
    /// Nome da base cadastrada no produto.
    pub base: &'a str,
    pub categoria_produto: &'a str,
    pub status_produto: &'a str,
    /// Quantidade recomendada (unidades; kg se for base). 0 = sem recomendação.
    pub producao_recomendada: f64,
    pub estoque_ideal_manual: f64,
    pub lote_minimo: f64,
    /// Regras do cadastro (Regras & Parâmetros PCP): `quente`, `frio` ou nenhuma (segue o automático).
    pub processo_termico: Option<&'a str>,
    pub permite_bombona: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessoProduto {
    pub is_quente: bool,
    pub is_shampoo: bool,
    pub can_bombona: bool,
    pub motivo: String,
    pub label: String,
    pub recipiente_sugerido: &'static str,
    /// `None` quando a descrição não traz medida (peso desconhecido).
    pub unit_weight_kg: Option<f64>,
    pub req_units: f64,
    pub req_qty_kg: f64,
}

/// Primeiro valor "verdadeiro" (diferente de zero), como o `||` do JavaScript.
fn ou(a: f64, b: f64) -> f64 {
    if a != 0.0 {
        a
    } else {
        b
    }
}

fn arredonda1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

/// Recipiente para massa grande (caldeira): 1000 misto a partir de 600 kg, 200 até 250 kg, senão 500.
fn recipiente_grande(kg: f64) -> &'static str {
    if kg >= 600.0 {
        "R_1000_MISTO"
    } else if kg <= 250.0 {
        "R_200"
    } else {
        "R_500"
    }
}

/// Classificação técnica de processo (com as regras do cadastro do produto por cima do automático).
pub fn tipo_de_processo(p: &EntradaProcesso) -> ProcessoProduto {
    let mut r = inferir(p);
    if let Some(t) = p.processo_termico.filter(|t| *t == "quente" || *t == "frio") {
        r.is_quente = t == "quente";
        r.motivo = format!("Processo {} (definido no produto)", if t == "quente" { "a quente" } else { "a frio" });
        r.label = format!("{} (definido no produto)", r.label);
    }
    if let Some(b) = p.permite_bombona {
        r.can_bombona = b;
    }
    r
}

fn inferir(p: &EntradaProcesso) -> ProcessoProduto {
    let desc = p.descricao.to_uppercase();
    let base = p.base.to_uppercase();
    let tem = |termos: &[&str]| termos.iter().any(|t| desc.contains(t));

    if e_base(p.codigo, p.categoria_produto, p.status_produto) {
        let shampoo = tem(&["SH", "SHAMPOO", "LAURIL"]);
        let quente = !shampoo && tem(&["MASC", "COND", "CREME", "AOX", "RELAX", "TIOGLICOLATO"]);
        let rec = if p.producao_recomendada > 0.0 {
            p.producao_recomendada
        } else if shampoo {
            1000.0
        } else {
            500.0
        };
        return ProcessoProduto {
            is_quente: quente,
            is_shampoo: shampoo,
            can_bombona: rec <= LIMITE_BOMBONA_FRIO_KG,
            motivo: if shampoo { "Base de Shampoo a Frio" } else if quente { "Base a Quente (Caldeira)" } else { "Base de Produção" }.into(),
            label: if shampoo { "Base Frio" } else if quente { "Base Quente" } else { "Base Granel" }.into(),
            recipiente_sugerido: if shampoo {
                "R_1000_SHAMPOO"
            } else if rec >= 600.0 {
                "R_1000_MISTO"
            } else if rec <= 250.0 {
                "R_200"
            } else {
                "R_500"
            },
            unit_weight_kg: Some(1.0),
            req_units: rec,
            req_qty_kg: rec,
        };
    }

    // Sem medida na descrição o peso é desconhecido; para o porte do recipiente vale 1 kg por unidade.
    let unit_weight_kg = medida_kg(p.descricao);
    let req_units = ou(ou(ou(p.producao_recomendada, p.estoque_ideal_manual), p.lote_minimo), 100.0);
    let req_kg = (arredonda1(req_units * unit_weight_kg.unwrap_or(1.0))).max(1.0);
    let feito = |is_quente: bool, is_shampoo: bool, can_bombona: bool, motivo: &str, label: &str, recipiente: &'static str| ProcessoProduto {
        is_quente,
        is_shampoo,
        can_bombona,
        motivo: motivo.into(),
        label: label.into(),
        recipiente_sugerido: recipiente,
        unit_weight_kg,
        req_units,
        req_qty_kg: req_kg,
    };

    if tem(&["SH", "SHAMPOO", "SABONETE", "TONICO"]) {
        return feito(
            false,
            true,
            req_kg <= LIMITE_BOMBONA_FRIO_KG,
            "Processo a Frio (Mistura direta)",
            "A Frio (Shampoo)",
            if req_kg >= 450.0 {
                "R_1000_SHAMPOO"
            } else if req_kg <= 200.0 {
                "BOMBONAS"
            } else {
                "R_500"
            },
        );
    }

    // Pomadas, ceras, óleos especiais: quente.
    if tem(&["POMADA", "CERA", "PASTA", "OLEO", "SERUM"]) {
        let r40 = req_kg <= 45.0;
        return feito(
            true,
            false,
            req_kg <= LIMITE_BOMBONA_QUENTE_KG,
            if r40 { "Reator 40kg Quente (Fusão de ceras/óleos)" } else { "Fusão de ceras/óleos (Quente)" },
            if r40 { "Reator 40kg" } else { "Caldeira" },
            if r40 {
                "R_40"
            } else if req_kg <= 100.0 {
                "R_100"
            } else {
                recipiente_grande(req_kg)
            },
        );
    }

    // Máscaras, cremes, botox: quente (até 45 kg no reator 40; até 150 kg pode ir na bombona com água quente da caldeira).
    if tem(&["MASC", "CREME", "DEFRIZANTE", "BOTOX"]) {
        let r40 = req_kg <= 45.0;
        let bombona = req_kg <= LIMITE_BOMBONA_QUENTE_KG;
        return feito(
            true,
            false,
            bombona,
            if r40 {
                "Reator 40kg (Produção Quente)"
            } else if bombona {
                "Máscara Quente na Bombona (Água da Caldeira)"
            } else {
                "Emulsão a Quente (Requer Caldeira)"
            },
            if r40 {
                "Reator 40kg"
            } else if bombona {
                "Bombona (Água Caldeira)"
            } else {
                "Caldeira"
            },
            if r40 {
                "R_40"
            } else if bombona {
                "BOMBONAS"
            } else {
                recipiente_grande(req_kg)
            },
        );
    }

    let frio_na_bombona = if req_kg <= 200.0 {
        "BOMBONAS"
    } else if req_kg >= 600.0 {
        "R_1000_MISTO"
    } else {
        "R_500"
    };

    // Leave-in com base pronta: a frio na bombona.
    if desc.contains("LEAVE") && !base.is_empty() {
        return feito(false, false, true, "Leave-in com base pronta (Mistura a Frio)", "A Frio (Base)", frio_na_bombona);
    }

    // Condicionador sem base pronta no ERP: funde tensoativo catiônico, quente.
    if desc.contains("COND") && base.is_empty() {
        let r40 = req_kg <= 45.0;
        return feito(
            true,
            false,
            req_kg <= LIMITE_BOMBONA_QUENTE_KG,
            if r40 { "Reator 40kg (Condicionador Quente)" } else { "Condicionador sem base pronta (Requer Caldeira)" },
            if r40 { "Reator 40kg" } else { "Caldeira" },
            if r40 {
                "R_40"
            } else if req_kg <= LIMITE_BOMBONA_QUENTE_KG {
                "BOMBONAS"
            } else {
                recipiente_grande(req_kg)
            },
        );
    }

    // Condicionador com base pronta: a frio em bombona.
    if desc.contains("COND") && !base.is_empty() {
        return feito(false, false, true, "Condicionador com base pronta (Mistura a Frio)", "A Frio (Base)", frio_na_bombona);
    }

    feito(
        false,
        false,
        req_kg <= LIMITE_BOMBONA_FRIO_KG,
        "Geral",
        "Geral",
        if req_kg >= 600.0 {
            "R_1000_MISTO"
        } else if req_kg <= 200.0 {
            "BOMBONAS"
        } else {
            "R_200"
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn produto<'a>(descricao: &'a str, recomendada: f64) -> EntradaProcesso<'a> {
        EntradaProcesso { descricao, producao_recomendada: recomendada, ..Default::default() }
    }

    #[test]
    fn shampoo_e_processo_a_frio() {
        let r = tipo_de_processo(&produto("SHAMPOO LISO 500ML", 100.0));
        assert!(!r.is_quente);
        assert!(r.is_shampoo);
        assert_eq!(r.label, "A Frio (Shampoo)");
        assert_eq!(r.req_qty_kg, 50.0);
    }

    #[test]
    fn mascara_e_quente_e_bombona_so_ate_150_kg() {
        let pequena = tipo_de_processo(&produto("MASCARA HIDRATANTE 1KG", 150.0));
        assert!(pequena.is_quente);
        assert!(pequena.can_bombona);
        assert_eq!(pequena.recipiente_sugerido, "BOMBONAS");
        let grande = tipo_de_processo(&produto("MASCARA HIDRATANTE 1KG", 160.0));
        assert!(grande.is_quente);
        assert!(!grande.can_bombona);
        assert_eq!(grande.label, "Caldeira");
    }

    #[test]
    fn base_de_shampoo_e_a_frio() {
        let p = EntradaProcesso { descricao: "BASE SHAMPOO NEUTRO", categoria_produto: "cat_base", ..Default::default() };
        let r = tipo_de_processo(&p);
        assert!(!r.is_quente);
        assert!(r.is_shampoo);
        assert_eq!(r.label, "Base Frio");
        assert_eq!(r.recipiente_sugerido, "R_1000_SHAMPOO");
        assert_eq!(r.req_qty_kg, 1000.0, "sem recomendação a base de shampoo vale 1000 kg");
    }

    #[test]
    fn processo_termico_do_produto_sobrepoe_o_automatico_e_marca_o_rotulo() {
        let shampoo = EntradaProcesso { processo_termico: Some("quente"), ..produto("SHAMPOO LISO 500ML", 100.0) };
        let quente = tipo_de_processo(&shampoo);
        assert!(quente.is_quente);
        assert_eq!(quente.label, "A Frio (Shampoo) (definido no produto)");
        assert!(quente.motivo.contains("a quente (definido no produto)"));
        let mascara = EntradaProcesso { processo_termico: Some("frio"), ..produto("MASCARA HIDRATANTE 1KG", 150.0) };
        let frio = tipo_de_processo(&mascara);
        assert!(!frio.is_quente);
        assert!(frio.label.contains("(definido no produto)"));
    }

    #[test]
    fn permite_bombona_false_forca_can_bombona_false() {
        let p = EntradaProcesso { permite_bombona: Some(false), ..produto("MASCARA HIDRATANTE 1KG", 150.0) };
        let r = tipo_de_processo(&p);
        assert!(!r.can_bombona);
        assert!(r.is_quente);
        assert_eq!(r.label, "Bombona (Água Caldeira)");
    }

    #[test]
    fn sem_regra_do_cadastro_o_resultado_e_o_automatico() {
        let p = produto("MASCARA HIDRATANTE 1KG", 150.0);
        let com_nulos = EntradaProcesso { processo_termico: None, permite_bombona: None, ..p.clone() };
        assert_eq!(tipo_de_processo(&com_nulos), tipo_de_processo(&p));
        assert!(tipo_de_processo(&p).can_bombona);
    }

    #[test]
    fn limite_da_bombona_quente_e_150_kg_e_a_frio_200() {
        assert_eq!(LIMITE_BOMBONA_QUENTE_KG, 150.0);
        assert!(tipo_de_processo(&produto("MASCARA HIDRATANTE 1KG", 150.0)).can_bombona);
        assert!(!tipo_de_processo(&produto("MASCARA HIDRATANTE 1KG", 151.0)).can_bombona);
        assert!(tipo_de_processo(&produto("SHAMPOO LISO 1KG", 200.0)).can_bombona);
    }

    #[test]
    fn quantidade_cai_no_estoque_ideal_lote_minimo_e_100() {
        let a = EntradaProcesso { estoque_ideal_manual: 40.0, ..produto("CREME 1KG", 0.0) };
        assert_eq!(tipo_de_processo(&a).req_units, 40.0);
        let b = EntradaProcesso { lote_minimo: 70.0, ..produto("CREME 1KG", 0.0) };
        assert_eq!(tipo_de_processo(&b).req_units, 70.0);
        assert_eq!(tipo_de_processo(&produto("CREME 1KG", 0.0)).req_units, 100.0);
    }

    #[test]
    fn sem_medida_na_descricao_o_peso_e_desconhecido() {
        let r = tipo_de_processo(&produto("PRODUTO SEM MEDIDA", 10.0));
        assert_eq!(r.unit_weight_kg, None);
        assert_eq!(r.req_qty_kg, 10.0, "para o porte vale 1 kg por unidade");
    }
}

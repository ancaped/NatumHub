//! Status efetivo de cada etapa (pesagem, produção, rotulagem, envase) de um lote, calculado no servidor.
//! Regra: a etapa está concluída se foi gravada como concluída ou se a data agendada dela já passou
//! (ou é hoje e já são 18h em America/Sao_Paulo), salvo se estiver em espera ou o lote cancelado no ERP.
//! O front só exibe; a função dele (`getLoteEtapaStatus`) fica como fallback quando o campo não vier.

use chrono::{FixedOffset, NaiveDate, Timelike, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::models::AcompanhamentoLoteItem;

pub const HORA_FIM_DO_DIA: u32 = 18;

#[derive(Debug, Serialize, Deserialize, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EtapaEfetiva {
    pub status: String,
    pub is_espera: bool,
    pub is_concluido: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EtapasEfetivas {
    pub pesagem: EtapaEfetiva,
    pub producao: EtapaEfetiva,
    pub rotulagem: EtapaEfetiva,
    pub envase: EtapaEfetiva,
}

/// Data (AAAA-MM-DD) e hora de agora em America/Sao_Paulo (UTC-3, sem horário de verão).
pub fn agora_sp() -> (String, u32) {
    let fuso = FixedOffset::west_opt(3 * 3600).expect("fuso de São Paulo");
    let agora = Utc::now().with_timezone(&fuso);
    (agora.format("%Y-%m-%d").to_string(), agora.hour())
}

/// Data do texto como AAAA-MM-DD (aceita `2026-10-24...` e `24/10/2026`), igual a `parseLoteDateToIso` do front.
pub fn data_iso(texto: &str) -> Option<String> {
    let limpo = texto.trim().split(' ').next()?.split('T').next()?;
    let partes: Vec<&str> = limpo.split(['-', '/']).collect();
    if partes.len() != 3 {
        return None;
    }
    let (a, m, d) = if partes[0].len() == 4 {
        (partes[0], partes[1], partes[2])
    } else if partes[2].len() == 4 {
        (partes[2], partes[1], partes[0])
    } else {
        return None;
    };
    let ano: i32 = a.parse().ok()?;
    let mes: u32 = m.parse().ok()?;
    let dia: u32 = d.parse().ok()?;
    NaiveDate::from_ymd_opt(ano, mes, dia)?;
    Some(format!("{ano:04}-{mes:02}-{dia:02}"))
}

/// A data agendada já passou, ou é hoje e já deu a hora de fechar o dia.
pub fn passou_do_fim_do_dia(data_agendada: &str, hoje: &str, hora: u32) -> bool {
    data_agendada < hoje || (data_agendada == hoje && hora >= HORA_FIM_DO_DIA)
}

fn preenchido(o: &Option<String>) -> Option<&str> {
    o.as_deref().map(str::trim).filter(|s| !s.is_empty())
}

/// Data agendada da etapa: data própria da etapa, previsão, data do planejamento ou abertura no ERP.
fn data_agendada(l: &AcompanhamentoLoteItem, etapa: &str) -> Option<String> {
    let propria = match etapa {
        "pesagem" => preenchido(&l.data_pesagem).and_then(data_iso).or_else(|| preenchido(&l.data_producao).and_then(data_iso)),
        "producao" => preenchido(&l.data_producao).and_then(data_iso),
        "rotulagem" => preenchido(&l.data_rotulagem).and_then(data_iso),
        "envase" => preenchido(&l.data_envase).and_then(data_iso),
        _ => None,
    };
    propria
        .or_else(|| preenchido(&l.data_previsao).and_then(data_iso))
        .or_else(|| data_iso(&l.date))
}

fn etapa_efetiva(l: &AcompanhamentoLoteItem, etapa: &str, hoje: &str, hora: u32) -> EtapaEfetiva {
    let agendada = data_agendada(l, etapa);
    let auto_ok = agendada.as_deref().is_some_and(|d| passou_do_fim_do_dia(d, hoje, hora)) && l.erp_status != "CA";
    let entrada = l.etapas_status.as_ref().and_then(|v| v.get(etapa)).filter(|v| !v.is_null());

    if let Some(e) = entrada {
        let status = e.get("status").and_then(Value::as_str).unwrap_or("");
        let tem_motivo = e.get("motivoEspera").and_then(Value::as_str).is_some_and(|m| !m.is_empty());
        let is_espera = status == "Em Espera" || tem_motivo;
        let explicito = status == "concluido" || status == "Concluído";
        let is_concluido = explicito || (!is_espera && auto_ok);
        let status = if !status.is_empty() {
            status.to_string()
        } else if is_concluido {
            "concluido".to_string()
        } else if is_espera {
            "Em Espera".to_string()
        } else {
            "ativo".to_string()
        };
        return EtapaEfetiva { status, is_espera, is_concluido };
    }

    // Lote antigo, sem estrutura por etapa: só vale como espera se a pausa pertencia a esta etapa.
    let cs = l.custom_status.as_deref();
    let raw_espera = cs == Some("Em Espera") || preenchido(&l.motivo_espera).is_some();
    let sem = |o: &Option<String>| preenchido(o).is_none();
    let espera_legado = raw_espera
        && match etapa {
            "pesagem" => cs == Some("Pesagem") || (sem(&l.data_producao) && sem(&l.data_liberado_envase) && sem(&l.data_envase) && sem(&l.data_rotulagem)),
            "producao" => matches!(cs, Some("Produção" | "Produzido" | "Caldeira")) && sem(&l.data_liberado_envase) && sem(&l.data_envase),
            "rotulagem" => cs == Some("Rotulagem"),
            "envase" => matches!(cs, Some("Envase" | "Ordem Parcial")),
            _ => false,
        };
    let is_concluido = !espera_legado && auto_ok;
    let status = if espera_legado { "Em Espera" } else if is_concluido { "concluido" } else { "pendente" };
    EtapaEfetiva { status: status.to_string(), is_espera: espera_legado, is_concluido }
}

pub fn calcular(l: &AcompanhamentoLoteItem, hoje: &str, hora: u32) -> EtapasEfetivas {
    EtapasEfetivas {
        pesagem: etapa_efetiva(l, "pesagem", hoje, hora),
        producao: etapa_efetiva(l, "producao", hoje, hora),
        rotulagem: etapa_efetiva(l, "rotulagem", hoje, hora),
        envase: etapa_efetiva(l, "envase", hoje, hora),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn lote(data_producao: &str, etapas: Value) -> AcompanhamentoLoteItem {
        serde_json::from_value(json!({
            "loteNumber": "L1", "productCode": "P", "productDescription": "X", "quantity": 1.0, "quantityKg": 1.0,
            "date": "2026-01-01", "erpStatus": "PG", "erpStatusLabel": "PG", "isTerceirizado": false,
            "dataProducao": data_producao, "etapasStatus": etapas
        }))
        .unwrap()
    }

    #[test]
    fn passou_do_dia_hoje_antes_e_depois_das_18h() {
        assert!(passou_do_fim_do_dia("2026-10-23", "2026-10-24", 8), "dia anterior");
        assert!(!passou_do_fim_do_dia("2026-10-24", "2026-10-24", 17), "hoje antes das 18h");
        assert!(passou_do_fim_do_dia("2026-10-24", "2026-10-24", 18), "hoje às 18h");
        assert!(!passou_do_fim_do_dia("2026-10-25", "2026-10-24", 23), "amanhã");
    }

    #[test]
    fn etapa_conclui_pelo_relogio_mas_nao_em_espera() {
        let l = lote("2026-10-24", json!({}));
        assert!(!calcular(&l, "2026-10-24", 17).producao.is_concluido);
        assert!(calcular(&l, "2026-10-24", 18).producao.is_concluido);
        assert!(calcular(&l, "2026-10-25", 8).producao.is_concluido);

        let em_espera = lote("2026-10-20", json!({ "producao": { "status": "Em Espera", "motivoEspera": "falta insumo" } }));
        let e = calcular(&em_espera, "2026-10-25", 8).producao;
        assert!(e.is_espera && !e.is_concluido, "em espera nunca conclui sozinha");

        let gravado = lote("2026-12-01", json!({ "producao": { "status": "concluido" } }));
        assert!(calcular(&gravado, "2026-10-24", 8).producao.is_concluido, "gravada como concluída");

        let mut cancelado = lote("2026-10-20", json!({}));
        cancelado.erp_status = "CA".into();
        assert!(!calcular(&cancelado, "2026-10-25", 8).producao.is_concluido, "cancelado no ERP não conclui pelo relógio");
    }

    #[test]
    fn data_aceita_formato_brasileiro_e_iso() {
        assert_eq!(data_iso("24/10/2026").as_deref(), Some("2026-10-24"));
        assert_eq!(data_iso("2026-10-24T10:00:00Z").as_deref(), Some("2026-10-24"));
        assert_eq!(data_iso("lixo"), None);
    }
}

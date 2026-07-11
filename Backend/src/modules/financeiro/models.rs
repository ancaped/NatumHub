use serde::{Deserialize, Serialize};

/// Extrai um f64 de um Value que pode ser:
/// - número JSON: 500.0
/// - string numérica com ponto decimal: "500.00" / "1500.50"
/// - string numérica com vírgula (pt-BR): "500,00" / "1.500,00"
pub fn value_to_f64(v: &serde_json::Value) -> f64 {
    match v {
        serde_json::Value::Number(n) => n.as_f64().unwrap_or(0.0),
        serde_json::Value::String(s) => parse_money_str(s),
        _ => 0.0,
    }
}

/// Interpreta strings monetárias BR e US de forma segura.
pub fn parse_money_str(s: &str) -> f64 {
    let s = s.trim();
    if s.is_empty() {
        return 0.0;
    }
    // Remove espaços e símbolo de moeda comuns
    let s = s
        .replace("R$", "")
        .replace(" ", "")
        .replace('\u{00a0}', "");

    let has_comma = s.contains(',');
    let has_dot = s.contains('.');

    let normalized = if has_comma && has_dot {
        // Ambos: o último separador é o decimal
        if s.rfind(',').unwrap_or(0) > s.rfind('.').unwrap_or(0) {
            // 1.500,00 → remove pontos de milhar, vírgula vira decimal
            s.replace('.', "").replace(',', ".")
        } else {
            // 1,500.00 → remove vírgulas de milhar
            s.replace(',', "")
        }
    } else if has_comma {
        // Só vírgula: "500,00" ou "1500,5"
        s.replace(',', ".")
    } else {
        // Só ponto ou inteiro: "1500.00" / "1500" — ponto é decimal, NÃO milhar
        s.to_string()
    };

    normalized.parse::<f64>().unwrap_or(0.0)
}

/// Extrai uma Option<String> de um Value que pode ser:
/// - string: retorna Some(string)
/// - array vazio []: retorna None (quirk das APIs PHP do Tiny)
/// - null: retorna None
pub fn value_to_opt_string(v: &serde_json::Value) -> Option<String> {
    match v {
        serde_json::Value::String(s) if !s.trim().is_empty() => Some(s.clone()),
        _ => None,
    }
}

/// Ofuscação leve do token (XOR + base64). Não é vault — apenas evita texto legível no SQLite.
const TOKEN_OBFUSCATE_KEY: &[u8] = b"NatumHub-Tiny-Token-v1-2026";
const TOKEN_PREFIX: &str = "enc1:";

pub fn obfuscate_token(plain: &str) -> String {
    if plain.is_empty() {
        return String::new();
    }
    let key = TOKEN_OBFUSCATE_KEY;
    let xored: Vec<u8> = plain
        .as_bytes()
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect();
    format!("{}{}", TOKEN_PREFIX, base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        xored,
    ))
}

pub fn deobfuscate_token(stored: &str) -> String {
    let stored = stored.trim();
    if stored.is_empty() {
        return String::new();
    }
    // Retrocompatível: tokens antigos em texto puro
    if !stored.starts_with(TOKEN_PREFIX) {
        return stored.to_string();
    }
    let b64 = &stored[TOKEN_PREFIX.len()..];
    let Ok(bytes) = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64) else {
        return String::new();
    };
    let key = TOKEN_OBFUSCATE_KEY;
    let plain: Vec<u8> = bytes
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect();
    String::from_utf8(plain).unwrap_or_default()
}

/// TinyConta com campos permissivos (serde_json::Value) para tolerar
/// o comportamento do Tiny ERP de retornar [] em vez de null/string.
#[derive(Debug, Deserialize, Clone)]
pub struct TinyConta {
    pub id: serde_json::Value,
    pub nome_cliente: serde_json::Value,
    pub historico: Option<serde_json::Value>,
    pub numero_doc: Option<serde_json::Value>,
    pub data_vencimento: Option<serde_json::Value>,
    pub data_emissao: Option<serde_json::Value>,
    pub valor: serde_json::Value,
    pub saldo: serde_json::Value,
    pub situacao: serde_json::Value,
}

impl TinyConta {
    pub fn id_as_i64(&self) -> i64 {
        match &self.id {
            serde_json::Value::Number(n) => n.as_i64().unwrap_or(0),
            serde_json::Value::String(s) => s.parse::<i64>().unwrap_or(0),
            _ => 0,
        }
    }
    pub fn nome_cliente_str(&self) -> String {
        match &self.nome_cliente {
            serde_json::Value::String(s) => s.clone(),
            _ => String::new(),
        }
    }
    pub fn historico_str(&self) -> Option<String> {
        self.historico.as_ref().and_then(value_to_opt_string)
    }
    pub fn numero_doc_str(&self) -> Option<String> {
        self.numero_doc.as_ref().and_then(value_to_opt_string)
    }
    pub fn data_vencimento_str(&self) -> String {
        match &self.data_vencimento {
            Some(v) => match v {
                serde_json::Value::String(s) => s.clone(),
                _ => String::new(),
            },
            None => String::new(),
        }
    }
    pub fn data_emissao_str(&self) -> String {
        match &self.data_emissao {
            Some(v) => match v {
                serde_json::Value::String(s) => s.clone(),
                _ => String::new(),
            },
            None => String::new(),
        }
    }
    pub fn valor_f64(&self) -> f64 {
        value_to_f64(&self.valor)
    }
    pub fn saldo_f64(&self) -> f64 {
        value_to_f64(&self.saldo)
    }
    pub fn situacao_str(&self) -> String {
        match &self.situacao {
            serde_json::Value::String(s) => s.to_lowercase(),
            _ => String::new(),
        }
    }
}

#[derive(Debug, Deserialize, Clone)]
pub struct TinyContaWrapper {
    pub conta: TinyConta,
}

#[derive(Debug, Deserialize, Clone)]
pub struct TinyResponseContas {
    pub status: String,
    pub status_processamento: Option<serde_json::Value>,
    pub pagina: Option<serde_json::Value>,
    pub numero_paginas: Option<serde_json::Value>,
    pub contas: Option<serde_json::Value>,
    pub erros: Option<serde_json::Value>,
}

impl TinyResponseContas {
    pub fn pagina_as_i32(&self) -> i32 {
        match &self.pagina {
            Some(serde_json::Value::Number(n)) => n.as_i64().unwrap_or(1) as i32,
            Some(serde_json::Value::String(s)) => s.parse().unwrap_or(1),
            _ => 1,
        }
    }
    pub fn numero_paginas_as_i32(&self) -> i32 {
        match &self.numero_paginas {
            Some(serde_json::Value::Number(n)) => n.as_i64().unwrap_or(1) as i32,
            Some(serde_json::Value::String(s)) => s.parse().unwrap_or(1),
            _ => 1,
        }
    }
    pub fn contas_list(&self) -> Vec<TinyConta> {
        let arr = match &self.contas {
            Some(serde_json::Value::Array(a)) if !a.is_empty() => a,
            _ => return vec![],
        };
        arr.iter()
            .filter_map(|item| {
                let conta_val = item.get("conta")?;
                serde_json::from_value::<TinyConta>(conta_val.clone()).ok()
            })
            .collect()
    }
    pub fn first_error(&self) -> Option<String> {
        let arr = match &self.erros {
            Some(serde_json::Value::Array(a)) if !a.is_empty() => a,
            _ => return None,
        };
        arr.first()
            .and_then(|e| e.get("erro").and_then(|v| v.as_str()).map(|s| s.to_string()))
    }
}

#[derive(Debug, Deserialize, Clone)]
pub struct TinyResponseRoot {
    pub retorno: TinyResponseContas,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FinancialAccount {
    pub id: i64,
    pub nome_cliente: String,
    pub historico: Option<String>,
    pub numero_doc: Option<String>,
    pub data_emissao: String,
    pub data_vencimento: String,
    pub valor: f64,
    pub saldo: f64,
    pub situacao: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncRequest {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub status: String,
    pub last_sync: String,
    pub receivables_upserted: usize,
    pub payables_upserted: usize,
    pub receivables_removed: usize,
    pub payables_removed: usize,
    pub elapsed_ms: u128,
    pub start_date: String,
    pub end_date: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusResponse {
    pub is_configured: bool,
    pub last_sync: Option<String>,
    pub receivables_count: i64,
    pub payables_count: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountsQuery {
    pub tipo: String,
    pub situacao: Option<String>,
    pub search: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    /// 1-based page (default 1)
    pub page: Option<i64>,
    /// page size (default 100, max 500)
    pub limit: Option<i64>,
    /// "true" → apenas aberto/parcial com vencimento < hoje
    pub overdue: Option<String>,
    /// N → aberto/parcial com vencimento entre hoje e hoje+N
    pub due_within_days: Option<i64>,
    /// "true" → apenas aberto/parcial
    pub only_open: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountsPage {
    pub items: Vec<FinancialAccount>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
    pub total_valor: f64,
    pub total_saldo: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyFlow {
    pub period: String,
    pub entrada_total: f64,
    pub entrada_paga: f64,
    pub saida_total: f64,
    pub saida_paga: f64,
    pub saldo_periodo: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgingBucket {
    pub label: String,
    pub min_days: i64,
    pub max_days: Option<i64>,
    pub count: i64,
    pub saldo: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartyBalance {
    pub nome: String,
    pub count: i64,
    pub saldo: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyProjection {
    pub week_start: String,
    pub week_end: String,
    pub label: String,
    pub entradas: f64,
    pub saidas: f64,
    pub saldo: f64,
    pub acumulado: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttentionItem {
    pub id: i64,
    pub tipo: String, // "receber" | "pagar"
    pub nome_cliente: String,
    pub historico: Option<String>,
    pub numero_doc: Option<String>,
    pub data_vencimento: String,
    pub valor: f64,
    pub saldo: f64,
    pub situacao: String,
    /// Dias de atraso (positivo) ou dias até vencer (negativo/zero)
    pub dias: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncMeta {
    pub is_configured: bool,
    pub last_sync: Option<String>,
    pub coverage_start: Option<String>,
    pub coverage_end: Option<String>,
    pub days_since_sync: Option<i64>,
    pub is_stale: bool,
    pub stale_threshold_days: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthComparison {
    pub mes_atual: String,
    pub mes_anterior: String,
    pub recebido_atual: f64,
    pub recebido_anterior: f64,
    pub pago_atual: f64,
    pub pago_anterior: f64,
    pub liquido_atual: f64,
    pub liquido_anterior: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Concentration {
    pub top3_saldo: f64,
    pub total_aberto: f64,
    pub pct_top3: f64,
    pub alert: bool,
    pub threshold_pct: f64,
    pub top_names: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SparkPoint {
    pub label: String,
    pub period_start: String,
    pub valor: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowSummary {
    // Totais gerais
    pub total_receber_aberto: f64,
    pub total_receber_atrasado: f64,
    pub total_receber_pago: f64,
    pub total_pagar_aberto: f64,
    pub total_pagar_atrasado: f64,
    pub total_pagar_pago: f64,
    /// Posição líquida = receber em aberto − pagar em aberto
    pub posicao_liquida: f64,
    /// Atrasado líquido (risco) = receber atrasado − pagar atrasado
    pub risco_liquido: f64,

    // % atraso = atrasado / aberto
    pub pct_atraso_receber: f64,
    pub pct_atraso_pagar: f64,

    // Janelas de vencimento (saldo em aberto)
    pub receber_vencendo_7d: f64,
    pub receber_vencendo_30d: f64,
    pub pagar_vencendo_7d: f64,
    pub pagar_vencendo_30d: f64,

    // Contagens
    pub qtd_receber_aberto: i64,
    pub qtd_receber_atrasado: i64,
    pub qtd_pagar_aberto: i64,
    pub qtd_pagar_atrasado: i64,

    // Pagos no mês corrente (aprox. por data de vencimento — API pesquisa não traz liquidação)
    pub recebido_mes_atual: f64,
    pub pago_mes_atual: f64,
    pub valores_sao_aproximados: bool,

    pub sync_meta: SyncMeta,
    pub month_comparison: MonthComparison,
    pub concentration_clientes: Concentration,
    pub concentration_fornecedores: Concentration,
    pub sparkline_liquido: Vec<SparkPoint>,

    pub attention_receber_atrasado: Vec<AttentionItem>,
    pub attention_pagar_atrasado: Vec<AttentionItem>,
    pub attention_receber_7d: Vec<AttentionItem>,
    pub attention_pagar_7d: Vec<AttentionItem>,

    pub aging_receber: Vec<AgingBucket>,
    pub aging_pagar: Vec<AgingBucket>,
    pub top_clientes: Vec<PartyBalance>,
    pub top_fornecedores: Vec<PartyBalance>,
    pub weekly_projection: Vec<WeeklyProjection>,
    pub flow: Vec<MonthlyFlow>,
}

/// Resumo leve para o card do Hub principal
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HubFinancialSummary {
    pub is_configured: bool,
    pub last_sync: Option<String>,
    pub is_stale: bool,
    pub posicao_liquida: f64,
    pub total_receber_atrasado: f64,
    pub pagar_vencendo_7d: f64,
    pub pct_atraso_receber: f64,
    pub qtd_receber_atrasado: i64,
    pub qtd_pagar_atrasado: i64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_br_thousands() {
        assert!((parse_money_str("1.500,00") - 1500.0).abs() < 0.001);
        assert!((parse_money_str("500,50") - 500.5).abs() < 0.001);
    }

    #[test]
    fn parse_us_decimal() {
        assert!((parse_money_str("1500.00") - 1500.0).abs() < 0.001);
        assert!((parse_money_str("500.5") - 500.5).abs() < 0.001);
    }

    #[test]
    fn parse_us_thousands() {
        assert!((parse_money_str("1,500.00") - 1500.0).abs() < 0.001);
    }

    #[test]
    fn parse_json_number() {
        assert!((value_to_f64(&json!(1234.56)) - 1234.56).abs() < 0.001);
        assert!((value_to_f64(&json!("99,90")) - 99.9).abs() < 0.001);
    }

    #[test]
    fn token_roundtrip() {
        let plain = "abc123-secret-token";
        let enc = obfuscate_token(plain);
        assert!(enc.starts_with("enc1:"));
        assert_ne!(enc, plain);
        assert_eq!(deobfuscate_token(&enc), plain);
        // plaintext legacy
        assert_eq!(deobfuscate_token(plain), plain);
    }
}

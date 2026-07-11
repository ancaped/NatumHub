use reqwest::Client;
use std::collections::HashMap;
use crate::modules::financeiro::models::{TinyResponseRoot, TinyConta};

pub struct TinyClient {
    client: Client,
    token: String,
}

/// Frases que o Tiny ERP usa para indicar "sem registros" — verificadas
/// diretamente no texto bruto para evitar falhas de parsing.
const NO_RECORDS_PHRASES: &[&str] = &[
    "não retornou registros",
    "nao retornou registros",
    "nenhum registro encontrado",
    "nenhum registro foi encontrado",
    "sem registros",
    "no records found",
    "registro n",   // cobre "registros não encontrados" parcialmente
];

fn text_indicates_no_records(text: &str) -> bool {
    let lower = text.to_lowercase();
    NO_RECORDS_PHRASES.iter().any(|p| lower.contains(p))
}

/// Extrai qualquer mensagem de erro do JSON do Tiny, independentemente
/// do formato exato (array, objeto, string aninhada, etc.).
fn extract_any_error_message(text: &str) -> Option<String> {
    // Try to parse as generic JSON and walk the tree
    let val: serde_json::Value = serde_json::from_str(text).ok()?;

    // Common paths Tiny uses for error messages
    let paths: &[&[&str]] = &[
        &["retorno", "erros"],
        &["retorno", "erro"],
        &["retorno", "mensagem"],
        &["retorno", "msg"],
        &["erros"],
        &["erro"],
    ];

    for path in paths {
        let mut cur = &val;
        let mut found = true;
        for key in path.iter() {
            if let Some(next) = cur.get(*key) {
                cur = next;
            } else {
                found = false;
                break;
            }
        }
        if !found { continue; }

        match cur {
            // Array of {"erro": "..."} objects
            serde_json::Value::Array(arr) => {
                if arr.is_empty() { continue; }
                // Try to get first item's "erro" field
                if let Some(first) = arr.first() {
                    let msg = first.get("erro")
                        .or_else(|| first.get("msg"))
                        .or_else(|| first.get("mensagem"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| first.to_string());
                    return Some(msg);
                }
            }
            // Object with "erro" field
            serde_json::Value::Object(map) => {
                if let Some(m) = map.get("erro").or(map.get("msg")).or(map.get("mensagem")) {
                    if let Some(s) = m.as_str() {
                        return Some(s.to_string());
                    }
                }
                return Some(cur.to_string());
            }
            // Plain string
            serde_json::Value::String(s) => {
                return Some(s.clone());
            }
            _ => {}
        }
    }
    None
}

impl TinyClient {
    pub fn new(token: String) -> Self {
        Self {
            client: Client::new(),
            token,
        }
    }

    pub async fn fetch_contas(
        &self,
        endpoint: &str, // "contas.receber.pesquisa.php" or "contas.pagar.pesquisa.php"
        data_inicial: &str, // dd/mm/aaaa
        data_final: &str,   // dd/mm/aaaa
    ) -> Result<Vec<TinyConta>, String> {
        let url = format!("https://api.tiny.com.br/api2/{}", endpoint);
        let mut all_contas = Vec::new();
        let mut page = 1;

        loop {
            let mut params = HashMap::new();
            params.insert("token", self.token.as_str());
            params.insert("formato", "json");
            params.insert("data_ini_vencimento", data_inicial);
            params.insert("data_fim_vencimento", data_final);
            let page_str = page.to_string();
            params.insert("pagina", &page_str);

            let res = self.client.post(&url)
                .form(&params)
                .send()
                .await
                .map_err(|e| format!("Falha de conexão com a API do Tiny: {}", e))?;

            if !res.status().is_success() {
                return Err(format!("Tiny API retornou HTTP {}", res.status()));
            }

            let text = res.text().await
                .map_err(|e| format!("Falha ao ler resposta: {}", e))?;

            // ── Verificação 1: texto bruto para "sem registros"
            if text_indicates_no_records(&text) {
                println!("[TinyClient] {} pág.{}: sem registros → parando.", endpoint, page);
                break;
            }

            // ── Parse do JSON
            let response: TinyResponseRoot = match serde_json::from_str(&text) {
                Ok(r) => r,
                Err(e) => {
                    // Inclui os primeiros 500 chars do raw na mensagem para diagnóstico
                    let preview = &text[..text.len().min(500)];
                    println!("[TinyClient] Parse JSON falhou. endpoint={} pág={} erro={} raw={}", endpoint, page, e, preview);
                    return Err(format!(
                        "Erro ao deserializar resposta do Tiny ERP: {}. Primeiros 300 chars: {}",
                        e, &text[..text.len().min(300)]
                    ));
                }
            };

            let retorno = &response.retorno;

            // ── Verificação 2: status == "Erro" no payload JSON
            if retorno.status.to_lowercase() == "erro" {
                // Tenta extrair a mensagem de qualquer forma possível
                let msg = extract_any_error_message(&text)
                    .or_else(|| retorno.first_error());

                println!("[TinyClient] status=Erro endpoint={} pág={} msg={:?}", endpoint, page, msg);

                if let Some(ref m) = msg {
                    if text_indicates_no_records(m) {
                        break; // "sem registros" via mensagem de erro → normal
                    }
                    return Err(format!("Tiny API retornou erro: {}", m));
                }

                // Se não conseguiu extrair mensagem, devolve o raw para diagnóstico
                return Err(format!(
                    "Tiny API retornou erro (sem mensagem extraível). Raw: {}",
                    &text[..text.len().min(400)]
                ));
            }

            // ── Extrai as contas da resposta
            let contas = retorno.contas_list();
            println!("[TinyClient] {} pág.{}/{} → {} contas", endpoint, page, retorno.numero_paginas_as_i32(), contas.len());

            if contas.is_empty() {
                break;
            }
            all_contas.extend(contas);

            // ── Paginação
            let total_pages = retorno.numero_paginas_as_i32();
            if page >= total_pages {
                break;
            }
            page += 1;

            // Throttle para não exceder rate limit
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }

        println!("[TinyClient] {} concluído: {} registros totais.", endpoint, all_contas.len());
        Ok(all_contas)
    }
}

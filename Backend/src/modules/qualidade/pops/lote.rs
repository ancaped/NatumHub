//! Emitir em lote: leva POPs ou formulários de rascunho/em aprovação até vigente numa transação só,
//! com a mesma regra da aprovação individual (2 passos, auditoria e eventos por documento).
//! Sem `confirmar` devolve só a prévia: o que entra, com revisão/vigência/próxima revisão, e o que foi ignorado.

use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{PgConnection, Row};

use super::models::PublishInput;
use super::{formularios, store};
use crate::core::acao::ErroApi;
use crate::modules::estoque::escrita::{gravar_auditado, Resp};
use sqlx::PgPool;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LotePops {
    #[serde(default)]
    pub ids: Vec<String>,
    /// Id do setor (ex.: `cql`); alternativa a `ids`.
    #[serde(default)]
    pub setor: Option<String>,
    #[serde(default)]
    pub motivo: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoteFormularios {
    #[serde(default)]
    pub codes: Vec<String>,
    /// Sigla do setor no código (ex.: `CQL` para FOR-CQL-...); alternativa a `codes`.
    #[serde(default)]
    pub setor: Option<String>,
    #[serde(default)]
    pub motivo: String,
}

/// Só rascunho e em aprovação entram; o resto é ignorado com o motivo.
pub fn classificar_emissao(status: &str) -> Result<(), &'static str> {
    match status {
        "draft" | "in_review" => Ok(()),
        "published" => Err("já vigente"),
        "obsolete" => Err("obsoleto"),
        _ => Err("status desconhecido"),
    }
}

fn setor_valido(s: &Option<String>) -> Option<String> {
    s.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string)
}

fn ignorado(code: &str, title: &str, motivo: &str) -> Value {
    json!({ "code": code, "title": title, "motivo": motivo })
}

fn resultado(emitidos: Vec<Value>, ignorados: Vec<Value>) -> Value {
    let vencidos = emitidos.iter().filter(|e| e["vencida"] == true).count();
    json!({ "total": emitidos.len(), "vencidos": vencidos, "emitidos": emitidos, "ignorados": ignorados })
}

/// Próxima revisão antes de hoje = já nasce vencida.
fn vencida(proxima: Option<&str>) -> bool {
    proxima.is_some_and(|d| d < store::today().format("%Y-%m-%d").to_string().as_str())
}

// ───────────────────────── POPs ─────────────────────────

pub async fn emitir_pops(pool: &PgPool, input: LotePops, autor: &str, confirmar: bool) -> Resp {
    store::ensure_tables(pool).await.map_err(ErroApi::interno)?;
    let motivo = formularios::exigir_motivo(&input.motivo)?;
    let setor = setor_valido(&input.setor);
    if input.ids.is_empty() && setor.is_none() {
        return Err(ErroApi::invalido("Informe os POPs (ids) ou o setor."));
    }
    let alvo = setor.clone().map(|s| format!("setor:{s}")).unwrap_or_else(|| format!("{} POPs", input.ids.len()));
    let entrada = json!({ "ids": input.ids, "setor": setor, "motivo": motivo });
    let quem = autor.to_string();
    let ids = input.ids;
    gravar_auditado(pool, "emitir_lote_pops", autor, &alvo, entrada, confirmar, move |c| {
        Box::pin(async move { emitir_pops_tx(&mut *c, &ids, setor.as_deref(), &motivo, &quem).await })
    })
    .await
}

async fn emitir_pops_tx(c: &mut PgConnection, ids: &[String], setor: Option<&str>, motivo: &str, quem: &str) -> Result<Value, ErroApi> {
    let rows = match setor {
        Some(s) => sqlx::query("SELECT id, code, title, status FROM pop_documents WHERE lower(sector_id) = lower($1) ORDER BY code")
            .bind(s)
            .fetch_all(&mut *c)
            .await?,
        None => sqlx::query("SELECT id, code, title, status FROM pop_documents WHERE id = ANY($1) ORDER BY code")
            .bind(ids)
            .fetch_all(&mut *c)
            .await?,
    };
    let mut emitidos = Vec::new();
    let mut ignorados = Vec::new();
    let mut achados = std::collections::HashSet::new();
    for r in &rows {
        let (id, code, title, status): (String, String, String, String) = (r.get("id"), r.get("code"), r.get("title"), r.get("status"));
        achados.insert(id.clone());
        if let Err(m) = classificar_emissao(&status) {
            ignorados.push(ignorado(&code, &title, m));
            continue;
        }
        if status == "draft" {
            store::mover_status_tx(&mut *c, &id, "in_review", Some(motivo), quem).await?;
        }
        let entrada = PublishInput {
            effective_date: None,
            change_summary: Some(motivo.to_string()),
            content: None,
            elaborated_by: None,
            reviewed_by: None,
            approved_by: Some(quem.to_string()),
        };
        let doc = store::publish_document_tx(&mut *c, &id, entrada, quem).await?;
        emitidos.push(json!({
            "id": id, "code": code, "title": title, "statusAnterior": status,
            "revisao": doc.current_revision, "vigencia": doc.effective_date, "proximaRevisao": doc.next_review_date,
            "vencida": vencida(doc.next_review_date.as_deref()),
        }));
    }
    for id in ids.iter().filter(|i| setor.is_none() && !achados.contains(*i)) {
        ignorados.push(ignorado(id, "", "não encontrado"));
    }
    if emitidos.is_empty() && ignorados.is_empty() {
        return Err(ErroApi::regra("Nenhum POP encontrado para emitir."));
    }
    Ok(resultado(emitidos, ignorados))
}

// ───────────────────────── formulários ─────────────────────────

pub async fn emitir_formularios(pool: &PgPool, input: LoteFormularios, autor: &str, confirmar: bool) -> Resp {
    formularios::ensure(pool).await.map_err(ErroApi::interno)?;
    let motivo = formularios::exigir_motivo(&input.motivo)?;
    let setor = setor_valido(&input.setor);
    if input.codes.is_empty() && setor.is_none() {
        return Err(ErroApi::invalido("Informe os formulários (codes) ou o setor."));
    }
    if let Some(s) = &setor {
        if !s.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err(ErroApi::invalido("Setor inválido."));
        }
    }
    let alvo = setor.clone().map(|s| format!("setor:{s}")).unwrap_or_else(|| format!("{} formulários", input.codes.len()));
    let entrada = json!({ "codes": input.codes, "setor": setor, "motivo": motivo });
    let quem = autor.to_string();
    let codes = input.codes;
    gravar_auditado(pool, "emitir_lote_formularios_pop", autor, &alvo, entrada, confirmar, move |c| {
        Box::pin(async move { emitir_formularios_tx(&mut *c, &codes, setor.as_deref(), &motivo, &quem).await })
    })
    .await
}

async fn emitir_formularios_tx(c: &mut PgConnection, codes: &[String], setor: Option<&str>, motivo: &str, quem: &str) -> Result<Value, ErroApi> {
    let rows = match setor {
        Some(s) => sqlx::query("SELECT code, title, status FROM pop_formularios WHERE upper(code) LIKE 'FOR-' || upper($1) || '-%' ORDER BY code")
            .bind(s)
            .fetch_all(&mut *c)
            .await?,
        None => {
            let maiusculos: Vec<String> = codes.iter().map(|c| c.trim().to_uppercase()).collect();
            sqlx::query("SELECT code, title, status FROM pop_formularios WHERE code = ANY($1) ORDER BY code")
                .bind(maiusculos)
                .fetch_all(&mut *c)
                .await?
        }
    };
    let mut emitidos = Vec::new();
    let mut ignorados = Vec::new();
    let mut achados = std::collections::HashSet::new();
    for r in &rows {
        let (code, title, status): (String, String, String) = (r.get("code"), r.get("title"), r.get("status"));
        achados.insert(code.clone());
        if let Err(m) = classificar_emissao(&status) {
            ignorados.push(ignorado(&code, &title, m));
            continue;
        }
        if status == "draft" {
            formularios::mover_status_tx(&mut *c, &code, "in_review", motivo, quem).await?;
        }
        let f = formularios::publicar_tx(&mut *c, &code, motivo, quem).await?;
        let proxima = f["nextReviewDate"].as_str().map(str::to_string);
        emitidos.push(json!({
            "code": code, "title": title, "statusAnterior": status,
            "revisao": f["revision"], "vigencia": f["effectiveDate"], "proximaRevisao": proxima,
            "vencida": vencida(proxima.as_deref()),
        }));
    }
    for code in codes.iter().filter(|_| setor.is_none()) {
        if !achados.contains(&code.trim().to_uppercase()) {
            ignorados.push(ignorado(code, "", "não encontrado"));
        }
    }
    if emitidos.is_empty() && ignorados.is_empty() {
        return Err(ErroApi::regra("Nenhum formulário encontrado para emitir."));
    }
    Ok(resultado(emitidos, ignorados))
}

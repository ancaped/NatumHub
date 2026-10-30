//! Escritas do POP em 2 passos, com auditoria e evento na trilha (`pop_eventos`).
//! A lógica fica em `store::*_tx` (roda na transação do 2 passos); aqui só se escolhe a ação e o alvo.

use serde_json::{json, Value};

use sqlx::PgPool;

use super::models::{DocumentInput, DocumentUpdateInput, PublishInput, RevalidateInput};
use super::store;
use crate::core::acao::ErroApi;
use crate::modules::estoque::escrita::{gravar_auditado, Resp};

fn para_json<T: serde::Serialize>(v: &T) -> Result<Value, ErroApi> {
    serde_json::to_value(v).map_err(|e| ErroApi::interno(e.to_string()))
}

async fn preparar(pool: &PgPool) -> Result<(), ErroApi> {
    store::ensure_tables(pool).await.map_err(ErroApi::interno)
}

pub async fn criar_documento(pool: &PgPool, input: DocumentInput, autor: &str, confirmar: bool) -> Resp {
    preparar(pool).await?;
    let alvo = input.code.trim().to_uppercase();
    let entrada = json!({ "code": alvo, "title": input.title.trim(), "sectorId": input.sector_id });
    let quem = autor.to_string();
    gravar_auditado(pool, "criar_documento_pop", autor, &alvo, entrada, confirmar, move |c| {
        Box::pin(async move { para_json(&store::create_document_tx(c, input, &quem).await?) })
    })
    .await
}

pub async fn atualizar_documento(pool: &PgPool, id: &str, input: DocumentUpdateInput, autor: &str, confirmar: bool) -> Resp {
    preparar(pool).await?;
    let entrada = json!({ "id": id, "title": input.title, "sectorId": input.sector_id, "corpo": input.content.is_some() });
    let quem = autor.to_string();
    let id_s = id.to_string();
    gravar_auditado(pool, "editar_documento_pop", autor, id, entrada, confirmar, move |c| {
        Box::pin(async move { para_json(&store::update_document_tx(c, &id_s, input, &quem).await?) })
    })
    .await
}

/// `destino`: `in_review` (enviar para aprovação), `draft` (devolver) ou `obsolete`.
pub async fn mover_status(pool: &PgPool, id: &str, destino: &str, motivo: &str, autor: &str, confirmar: bool) -> Resp {
    preparar(pool).await?;
    let entrada = json!({ "id": id, "destino": destino, "motivo": motivo });
    let quem = autor.to_string();
    let id_s = id.to_string();
    let destino_s = destino.to_string();
    let motivo_s = motivo.to_string();
    gravar_auditado(pool, "mover_status_pop", autor, id, entrada, confirmar, move |c| {
        Box::pin(async move { para_json(&store::mover_status_tx(c, &id_s, &destino_s, Some(&motivo_s), &quem).await?) })
    })
    .await
}

pub async fn publicar_documento(pool: &PgPool, id: &str, input: PublishInput, autor: &str, confirmar: bool) -> Resp {
    preparar(pool).await?;
    let entrada = json!({ "id": id, "motivo": input.change_summary, "vigencia": input.effective_date });
    let quem = autor.to_string();
    let id_s = id.to_string();
    gravar_auditado(pool, "publicar_documento_pop", autor, id, entrada, confirmar, move |c| {
        Box::pin(async move { para_json(&store::publish_document_tx(c, &id_s, input, &quem).await?) })
    })
    .await
}

pub async fn revalidar_documento(pool: &PgPool, id: &str, input: RevalidateInput, autor: &str, confirmar: bool) -> Resp {
    preparar(pool).await?;
    let entrada = json!({ "id": id, "motivo": input.change_summary, "vigencia": input.effective_date });
    let quem = autor.to_string();
    let id_s = id.to_string();
    gravar_auditado(pool, "revalidar_documento_pop", autor, id, entrada, confirmar, move |c| {
        Box::pin(async move { para_json(&store::revalidate_document_tx(c, &id_s, input, &quem).await?) })
    })
    .await
}

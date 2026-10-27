//! Escritas das Ordens Manuais (ordens, tipos de registro e folhas) como serviços reutilizáveis.
//!
//! Regra fixa do AGENTS.md: 2 passos (sem `confirmar` só a prévia, exatamente o que seria gravado) e auditoria do
//! autor. O handler só chama estas funções; postar/reabrir mexem no pendente que entra no MRP, por isso a prévia
//! devolve a ordem já com o novo status.

use serde_json::{json, Value};
use sqlx::{PgConnection, PgPool, Row};

use crate::core::acao::ErroApi;
use crate::modules::estoque::escrita::{gravar_auditado, Resp};

use super::handlers::{ensure_tables, load_full, load_sheet, next_order_number, normalize_kind, sheet_prefix};
use super::models::{
    CreateManualOrderRequest, CreateRecordTypeRequest, CreateSheetBlockRequest, ManualOrderItemIn, RecordTypeOut,
    UpdateManualOrderRequest,
};

async fn garantir(pool: &PgPool) -> Result<(), ErroApi> {
    ensure_tables(pool).await.map_err(ErroApi::interno)
}

fn erro_texto(e: String) -> ErroApi {
    ErroApi::invalido(e)
}

fn validar_itens(itens: &[ManualOrderItemIn]) -> Result<(), ErroApi> {
    for it in itens {
        if it.item_code.trim().is_empty() || !(it.qty > 0.0) {
            return Err(ErroApi::invalido("Cada item precisa de código e qty > 0"));
        }
    }
    Ok(())
}

async fn inserir_itens(conn: &mut PgConnection, id: i64, itens: &[ManualOrderItemIn]) -> Result<(), ErroApi> {
    for it in itens {
        sqlx::query(
            r#"
            INSERT INTO manual_stock_order_items (order_id, item_code, description, unit, qty, notes)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(id)
        .bind(it.item_code.trim())
        .bind(it.description.as_deref().unwrap_or("").trim())
        .bind(it.unit.as_deref().unwrap_or("UN"))
        .bind(it.qty)
        .bind(&it.notes)
        .execute(&mut *conn)
        .await
        .map_err(|e| ErroApi::invalido(e.to_string()))?;
    }
    Ok(())
}

pub async fn criar_ordem(pool: &PgPool, payload: CreateManualOrderRequest, autor: &str, confirmar: bool) -> Resp {
    garantir(pool).await?;
    let kind = normalize_kind(&payload.kind).map_err(erro_texto)?;
    if payload.items.is_empty() {
        return Err(ErroApi::invalido("Informe ao menos um item"));
    }
    validar_itens(&payload.items)?;
    if payload.partner_name.trim().is_empty() {
        return Err(ErroApi::invalido("Informe a pessoa/empresa"));
    }
    let record_type = payload.record_type.trim().to_string();
    if record_type.is_empty() {
        return Err(ErroApi::invalido("Informe o tipo de registro (ex.: Venda, Uso/Interno)"));
    }
    let order_date = payload
        .order_date
        .as_deref()
        .and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| chrono::Local::now().date_naive());
    let entrada = json!({
        "kind": kind,
        "recordType": record_type,
        "partnerName": payload.partner_name.trim(),
        "itens": payload.items.len(),
    });
    let alvo = payload.partner_name.trim().to_string();
    let quem = autor.to_string();
    gravar_auditado(pool, "criar_ordem_manual", autor, &alvo, entrada, confirmar, move |c| {
        Box::pin(async move {
            let order_number = next_order_number(&mut *c).await.map_err(ErroApi::interno)?;
            let row = sqlx::query(
                r#"
                INSERT INTO manual_stock_orders
                    (order_number, kind, record_type, partner_name, order_date, status, notes, created_by)
                VALUES ($1, $2, $3, $4, $5, 'OPEN', $6, $7)
                RETURNING id
                "#,
            )
            .bind(&order_number)
            .bind(kind)
            .bind(&record_type)
            .bind(payload.partner_name.trim())
            .bind(order_date)
            .bind(&payload.notes)
            .bind(&quem)
            .fetch_one(&mut *c)
            .await
            .map_err(|e| ErroApi::invalido(e.to_string()))?;
            let id = crate::core::pg_row::pg_i64(&row, 0);
            sqlx::query("INSERT INTO manual_stock_record_types (name) VALUES ($1) ON CONFLICT (name) DO NOTHING")
                .bind(&record_type)
                .execute(&mut *c)
                .await?;
            inserir_itens(&mut *c, id, &payload.items).await?;
            let ordem = load_full(&mut *c, id).await.map_err(ErroApi::interno)?;
            Ok(serde_json::to_value(&ordem).unwrap_or(Value::Null))
        })
    })
    .await
}

pub async fn atualizar_ordem(pool: &PgPool, id: i64, payload: UpdateManualOrderRequest, autor: &str, confirmar: bool) -> Resp {
    garantir(pool).await?;
    let entrada = json!({ "id": id });
    gravar_auditado(pool, "atualizar_ordem_manual", autor, &id.to_string(), entrada, confirmar, move |c| {
        Box::pin(async move {
            let status: Option<String> = sqlx::query_scalar("SELECT status FROM manual_stock_orders WHERE id = $1")
                .bind(id)
                .fetch_optional(&mut *c)
                .await?;
            let Some(status) = status else {
                return Err(ErroApi::nao_encontrado("Ordem não encontrada"));
            };
            if status != "OPEN" {
                return Err(ErroApi::invalido("Só é possível editar ordens abertas (OPEN)"));
            }

            if let Some(ref kind_raw) = payload.kind {
                let k = normalize_kind(kind_raw).map_err(erro_texto)?;
                sqlx::query("UPDATE manual_stock_orders SET kind = $1 WHERE id = $2")
                    .bind(k)
                    .bind(id)
                    .execute(&mut *c)
                    .await
                    .map_err(|e| ErroApi::invalido(e.to_string()))?;
            }
            if let Some(ref name) = payload.partner_name {
                sqlx::query("UPDATE manual_stock_orders SET partner_name = $1 WHERE id = $2")
                    .bind(name.trim())
                    .bind(id)
                    .execute(&mut *c)
                    .await?;
            }
            if let Some(ref rt) = payload.record_type {
                let rt = rt.trim();
                if !rt.is_empty() {
                    sqlx::query("UPDATE manual_stock_orders SET record_type = $1 WHERE id = $2")
                        .bind(rt)
                        .bind(id)
                        .execute(&mut *c)
                        .await?;
                    sqlx::query("INSERT INTO manual_stock_record_types (name) VALUES ($1) ON CONFLICT (name) DO NOTHING")
                        .bind(rt)
                        .execute(&mut *c)
                        .await?;
                }
            }
            if let Some(ref d) = payload.order_date {
                if let Ok(nd) = chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d") {
                    sqlx::query("UPDATE manual_stock_orders SET order_date = $1 WHERE id = $2")
                        .bind(nd)
                        .bind(id)
                        .execute(&mut *c)
                        .await?;
                }
            }
            if payload.notes.is_some() {
                sqlx::query("UPDATE manual_stock_orders SET notes = $1 WHERE id = $2")
                    .bind(&payload.notes)
                    .bind(id)
                    .execute(&mut *c)
                    .await?;
            }
            if let Some(ref items) = payload.items {
                if items.is_empty() {
                    return Err(ErroApi::invalido("Informe ao menos um item"));
                }
                sqlx::query("DELETE FROM manual_stock_order_items WHERE order_id = $1")
                    .bind(id)
                    .execute(&mut *c)
                    .await?;
                validar_itens(items)?;
                inserir_itens(&mut *c, id, items).await?;
            }
            let ordem = load_full(&mut *c, id).await.map_err(ErroApi::interno)?;
            Ok(serde_json::to_value(&ordem).unwrap_or(Value::Null))
        })
    })
    .await
}

/// Lança a ordem (OPEN -> POSTED): ela deixa de contar como pendente no MRP.
pub async fn postar_ordem(pool: &PgPool, id: i64, autor: &str, confirmar: bool) -> Resp {
    garantir(pool).await?;
    let quem = autor.to_string();
    gravar_auditado(pool, "postar_ordem_manual", autor, &id.to_string(), json!({ "id": id }), confirmar, move |c| {
        Box::pin(async move {
            let r = sqlx::query(
                r#"
                UPDATE manual_stock_orders
                SET status = 'POSTED', posted_by = $2, posted_at = NOW()
                WHERE id = $1 AND status = 'OPEN'
                "#,
            )
            .bind(id)
            .bind(&quem)
            .execute(&mut *c)
            .await?;
            if r.rows_affected() == 0 {
                return Err(ErroApi::invalido("Ordem não encontrada ou já lançada"));
            }
            let ordem = load_full(&mut *c, id).await.map_err(ErroApi::interno)?;
            Ok(serde_json::to_value(&ordem).unwrap_or(Value::Null))
        })
    })
    .await
}

/// Reabre a ordem lançada (POSTED -> OPEN): volta a contar como pendente no MRP.
pub async fn reabrir_ordem(pool: &PgPool, id: i64, autor: &str, confirmar: bool) -> Resp {
    garantir(pool).await?;
    gravar_auditado(pool, "reabrir_ordem_manual", autor, &id.to_string(), json!({ "id": id }), confirmar, move |c| {
        Box::pin(async move {
            let r = sqlx::query(
                r#"
                UPDATE manual_stock_orders
                SET status = 'OPEN', posted_by = NULL, posted_at = NULL
                WHERE id = $1 AND status = 'POSTED'
                "#,
            )
            .bind(id)
            .execute(&mut *c)
            .await?;
            if r.rows_affected() == 0 {
                return Err(ErroApi::invalido("Ordem não encontrada ou não está POSTED"));
            }
            let ordem = load_full(&mut *c, id).await.map_err(ErroApi::interno)?;
            Ok(serde_json::to_value(&ordem).unwrap_or(Value::Null))
        })
    })
    .await
}

/// Exclui a ordem aberta (mesmo comportamento de antes: só OPEN), agora com prévia e auditoria.
pub async fn excluir_ordem(pool: &PgPool, id: i64, autor: &str, confirmar: bool) -> Resp {
    garantir(pool).await?;
    gravar_auditado(pool, "excluir_ordem_manual", autor, &id.to_string(), json!({ "id": id }), confirmar, move |c| {
        Box::pin(async move {
            let ordem = load_full(&mut *c, id).await.ok();
            let r = sqlx::query("DELETE FROM manual_stock_orders WHERE id = $1 AND status = 'OPEN'")
                .bind(id)
                .execute(&mut *c)
                .await?;
            if r.rows_affected() == 0 {
                return Err(ErroApi::invalido("Só é possível excluir ordens abertas"));
            }
            Ok(json!({ "ok": true, "excluida": ordem }))
        })
    })
    .await
}

pub async fn criar_tipo_registro(pool: &PgPool, payload: CreateRecordTypeRequest, autor: &str, confirmar: bool) -> Resp {
    garantir(pool).await?;
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return Err(ErroApi::invalido("Nome do tipo obrigatório"));
    }
    gravar_auditado(pool, "criar_tipo_registro_ordem_manual", autor, &name.clone(), json!({ "name": name }), confirmar, move |c| {
        Box::pin(async move {
            let r = sqlx::query(
                r#"
                INSERT INTO manual_stock_record_types (name) VALUES ($1)
                ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
                RETURNING id, name, created_at
                "#,
            )
            .bind(&name)
            .fetch_one(&mut *c)
            .await
            .map_err(|e| ErroApi::invalido(e.to_string()))?;
            let created_at: chrono::DateTime<chrono::Utc> = r.get(2);
            let tipo = RecordTypeOut { id: crate::core::pg_row::pg_i64(&r, 0), name: r.get(1), created_at: created_at.to_rfc3339() };
            Ok(serde_json::to_value(&tipo).unwrap_or(Value::Null))
        })
    })
    .await
}

pub async fn excluir_tipo_registro(pool: &PgPool, id: i64, autor: &str, confirmar: bool) -> Resp {
    garantir(pool).await?;
    gravar_auditado(pool, "excluir_tipo_registro_ordem_manual", autor, &id.to_string(), json!({ "id": id }), confirmar, move |c| {
        Box::pin(async move {
            let nome: Option<String> = sqlx::query_scalar("SELECT name FROM manual_stock_record_types WHERE id = $1")
                .bind(id)
                .fetch_optional(&mut *c)
                .await?;
            let r = sqlx::query("DELETE FROM manual_stock_record_types WHERE id = $1")
                .bind(id)
                .execute(&mut *c)
                .await?;
            if r.rows_affected() == 0 {
                return Err(ErroApi::nao_encontrado("Tipo não encontrado"));
            }
            Ok(json!({ "ok": true, "excluido": nome }))
        })
    })
    .await
}

// ─── Folhas de registro (Controle Entrada/Saída de Insumo) ───

async fn proximo_numero_folha(conn: &mut PgConnection, kind: &str) -> Result<u32, ErroApi> {
    let year = chrono::Local::now().format("%Y").to_string();
    let prefix = format!("{}-{}-", sheet_prefix(kind), year);
    let row = sqlx::query(
        r#"
        SELECT register_number FROM manual_stock_sheet_registers
        WHERE register_number LIKE $1
        ORDER BY register_number DESC
        LIMIT 1
        FOR UPDATE
        "#,
    )
    .bind(format!("{prefix}%"))
    .fetch_optional(&mut *conn)
    .await?;
    Ok(match row {
        Some(r) => {
            let last: String = r.get(0);
            last.rsplit('-').next().and_then(|s| s.parse::<u32>().ok()).unwrap_or(0) + 1
        }
        None => 1,
    })
}

/// Gera um bloco de folhas numeradas (CEI/CSI). Devolve `{ "registros": [...] }`.
pub async fn criar_bloco_folhas(pool: &PgPool, payload: CreateSheetBlockRequest, autor: &str, confirmar: bool) -> Resp {
    garantir(pool).await?;
    let kind = normalize_kind(&payload.kind).map_err(erro_texto)?;
    let qty = payload.quantity;
    if qty < 1 || qty > 100 {
        return Err(ErroApi::invalido("quantity deve ser entre 1 e 100"));
    }
    let quem = autor.to_string();
    gravar_auditado(pool, "criar_bloco_folhas_ordem_manual", autor, kind, json!({ "kind": kind, "quantity": qty }), confirmar, move |c| {
        Box::pin(async move {
            let mut next_seq = proximo_numero_folha(&mut *c, kind).await?;
            let year = chrono::Local::now().format("%Y").to_string();
            let prefix = sheet_prefix(kind);
            let mut ids = Vec::with_capacity(qty as usize);
            for _ in 0..qty {
                let register_number = format!("{prefix}-{year}-{next_seq:04}");
                let row = sqlx::query(
                    r#"
                    INSERT INTO manual_stock_sheet_registers
                        (register_number, kind, status, created_by)
                    VALUES ($1, $2, 'retirada', $3)
                    RETURNING id
                    "#,
                )
                .bind(&register_number)
                .bind(kind)
                .bind(&quem)
                .fetch_one(&mut *c)
                .await
                .map_err(|e| ErroApi::invalido(e.to_string()))?;
                ids.push(crate::core::pg_row::pg_i64(&row, 0));
                next_seq += 1;
            }
            let mut out = Vec::with_capacity(ids.len());
            for id in ids {
                out.push(load_sheet(&mut *c, id).await.map_err(ErroApi::interno)?);
            }
            Ok(json!({ "registros": out }))
        })
    })
    .await
}

pub async fn conferir_folha(pool: &PgPool, id: i64, autor: &str, confirmar: bool) -> Resp {
    garantir(pool).await?;
    let quem = autor.to_string();
    gravar_auditado(pool, "conferir_folha_ordem_manual", autor, &id.to_string(), json!({ "id": id }), confirmar, move |c| {
        Box::pin(async move {
            let r = sqlx::query(
                r#"
                UPDATE manual_stock_sheet_registers
                SET status = 'conferida', conferred_by = $2, conferred_at = NOW()
                WHERE id = $1 AND status = 'retirada'
                "#,
            )
            .bind(id)
            .bind(&quem)
            .execute(&mut *c)
            .await?;
            if r.rows_affected() == 0 {
                return Err(ErroApi::invalido("Registro não encontrado ou já conferido"));
            }
            let s = load_sheet(&mut *c, id).await.map_err(ErroApi::interno)?;
            Ok(serde_json::to_value(&s).unwrap_or(Value::Null))
        })
    })
    .await
}

pub async fn reabrir_folha(pool: &PgPool, id: i64, autor: &str, confirmar: bool) -> Resp {
    garantir(pool).await?;
    gravar_auditado(pool, "reabrir_folha_ordem_manual", autor, &id.to_string(), json!({ "id": id }), confirmar, move |c| {
        Box::pin(async move {
            let r = sqlx::query(
                r#"
                UPDATE manual_stock_sheet_registers
                SET status = 'retirada', conferred_by = NULL, conferred_at = NULL
                WHERE id = $1 AND status = 'conferida'
                "#,
            )
            .bind(id)
            .execute(&mut *c)
            .await?;
            if r.rows_affected() == 0 {
                return Err(ErroApi::invalido("Registro não encontrado ou não está conferido"));
            }
            let s = load_sheet(&mut *c, id).await.map_err(ErroApi::interno)?;
            Ok(serde_json::to_value(&s).unwrap_or(Value::Null))
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::estoque::ordens_manuais::models::ManualOrderItemIn;

    fn pedido(parceiro: &str) -> CreateManualOrderRequest {
        CreateManualOrderRequest {
            kind: "saida".into(),
            record_type: "Teste R4b".into(),
            partner_name: parceiro.into(),
            order_date: None,
            notes: None,
            items: vec![ManualOrderItemIn { item_code: "ZZ-R4B".into(), description: Some("Teste".into()), unit: None, qty: 2.0, notes: None }],
        }
    }

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn criar_e_postar_ordem_manual_so_gravam_com_confirmar_e_auditam() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let parceiro = "ZZ Parceiro R4b";
        let limpar = || async {
            sqlx::query("DELETE FROM manual_stock_orders WHERE partner_name = $1").bind(parceiro).execute(&pool).await.unwrap();
            sqlx::query("DELETE FROM producao_auditoria WHERE usuario = 'Teste R4b'").execute(&pool).await.unwrap();
        };
        ensure_tables(&pool).await.unwrap();
        limpar().await;
        let total = || async {
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM manual_stock_orders WHERE partner_name = $1")
                .bind(parceiro)
                .fetch_one(&pool)
                .await
                .unwrap()
        };
        let auditorias = |acao: &'static str| {
            let pool = pool.clone();
            async move {
                sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM producao_auditoria WHERE usuario = 'Teste R4b' AND acao = $1")
                    .bind(acao)
                    .fetch_one(&pool)
                    .await
                    .unwrap()
            }
        };

        // criar: prévia não grava nem audita
        let r = criar_ordem(&pool, pedido(parceiro), "Teste R4b", false).await.unwrap();
        assert!(r.previa);
        assert_eq!(r.resultado["status"], "OPEN");
        assert_eq!(total().await, 0);
        assert_eq!(auditorias("criar_ordem_manual").await, 0);

        // criar: confirmar grava e audita
        let r = criar_ordem(&pool, pedido(parceiro), "Teste R4b", true).await.unwrap();
        assert!(!r.previa);
        assert_eq!(total().await, 1);
        assert_eq!(auditorias("criar_ordem_manual").await, 1);
        let id = r.resultado["id"].as_i64().unwrap();

        // postar: a prévia mostra POSTED mas o banco continua OPEN
        let status = || async {
            sqlx::query_scalar::<_, String>("SELECT status FROM manual_stock_orders WHERE id = $1").bind(id).fetch_one(&pool).await.unwrap()
        };
        let r = postar_ordem(&pool, id, "Teste R4b", false).await.unwrap();
        assert!(r.previa);
        assert_eq!(r.resultado["status"], "POSTED");
        assert_eq!(status().await, "OPEN");
        assert_eq!(auditorias("postar_ordem_manual").await, 0);

        let r = postar_ordem(&pool, id, "Teste R4b", true).await.unwrap();
        assert!(!r.previa);
        assert_eq!(status().await, "POSTED");
        assert_eq!(auditorias("postar_ordem_manual").await, 1);

        // postar de novo: regra violada (já lançada), sem gravar nada
        let e = postar_ordem(&pool, id, "Teste R4b", true).await.unwrap_err();
        assert_eq!(e.codigo, "invalido");

        // reabrir volta para OPEN
        reabrir_ordem(&pool, id, "Teste R4b", true).await.unwrap();
        assert_eq!(status().await, "OPEN");
        limpar().await;
    }
}

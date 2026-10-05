use sqlx::{PgPool, Row};
use uuid::Uuid;
use crate::modules::compras::planejamento::models::*;

/// Gera o próximo número de lote sequencial amigável, ex: "LOTE #001", "LOTE #002"
async fn get_next_lote_numero(pool: &PgPool) -> Result<String, String> {
    let row = sqlx::query(
        "SELECT lote_numero FROM purchase_request_batches ORDER BY created_at DESC LIMIT 50"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao obter lotes anteriores: {e}"))?;

    let mut max_seq: i64 = 0;
    for r in row {
        let num_str: String = r.try_get("lote_numero").unwrap_or_default();
        // Tenta extrair os números do texto (ex: "LOTE #042" -> 42 ou "LOTE-42" -> 42)
        let digits: String = num_str.chars().filter(|c| c.is_ascii_digit()).collect();
        if let Ok(val) = digits.parse::<i64>() {
            if val > max_seq {
                max_seq = val;
            }
        }
    }

    let next_seq = max_seq + 1;
    Ok(format!("LOTE #{:03}", next_seq))
}

pub async fn create_purchase_request_batch_query(
    pool: PgPool,
    input: CreatePurchaseRequestBatchInput,
) -> Result<PurchaseRequestBatchDetail, String> {
    if input.items.is_empty() {
        return Err("A lista de solicitação precisa ter pelo menos 1 item.".to_string());
    }

    let batch_id = Uuid::new_v4().to_string();
    let lote_numero = get_next_lote_numero(&pool).await?;

    let mut tx = pool.begin().await.map_err(|e| format!("Erro ao iniciar transação: {e}"))?;

    sqlx::query(
        "INSERT INTO purchase_request_batches (id, lote_numero, modulo, titulo, observacoes, created_by, status, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, 'pendente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    )
    .bind(&batch_id)
    .bind(&lote_numero)
    .bind(&input.modulo)
    .bind(&input.titulo)
    .bind(&input.observacoes)
    .bind(&input.created_by)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Erro ao criar lote de solicitação: {e}"))?;

    for item in &input.items {
        let item_id = Uuid::new_v4().to_string();
        let unit = item.unit.clone().unwrap_or_else(|| "UN".to_string());

        sqlx::query(
            "INSERT INTO purchase_request_items (
                id, batch_id, item_code, item_description, unit, quantity_requested,
                current_stock_at_time, overall_avg_at_time, sim_producao_at_time, future_stock_at_time,
                target_days_at_time, trigger_days_at_time, supplier_name, observacao, status, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'solicitado', CURRENT_TIMESTAMP)"
        )
        .bind(&item_id)
        .bind(&batch_id)
        .bind(&item.item_code)
        .bind(&item.item_description)
        .bind(&unit)
        .bind(item.quantity_requested)
        .bind(item.current_stock_at_time.unwrap_or(0.0))
        .bind(item.overall_avg_at_time.unwrap_or(0.0))
        .bind(item.sim_producao_at_time.unwrap_or(0.0))
        .bind(item.future_stock_at_time.unwrap_or(0.0))
        .bind(item.target_days_at_time.unwrap_or(90))
        .bind(item.trigger_days_at_time.unwrap_or(30))
        .bind(&item.supplier_name)
        .bind(&item.observacao)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Erro ao inserir item do lote: {e}"))?;
    }

    tx.commit().await.map_err(|e| format!("Erro ao confirmar transação: {e}"))?;

    get_purchase_request_batch_detail_query(pool, &batch_id).await
}

pub async fn get_purchase_request_batches_query(
    pool: PgPool,
    modulo: Option<&str>,
    status: Option<&str>,
    search: Option<&str>,
) -> Result<Vec<PurchaseRequestBatch>, String> {
    let mut query = String::from(
        "SELECT 
            b.id, b.lote_numero, b.modulo, b.titulo, b.observacoes, b.created_by, b.status,
            b.created_at::text, b.updated_at::text,
            COUNT(i.id) as total_items
         FROM purchase_request_batches b
         LEFT JOIN purchase_request_items i ON b.id = i.batch_id
         WHERE 1=1 "
    );

    let mut args: Vec<String> = Vec::new();
    let mut idx = 1;

    if let Some(m) = modulo {
        if !m.is_empty() && m != "all" && m != "geral" {
            query.push_str(&format!(" AND b.modulo = ${idx}"));
            args.push(m.to_string());
            idx += 1;
        }
    }

    if let Some(st) = status {
        if !st.is_empty() && st != "ALL" && st != "todos" {
            query.push_str(&format!(" AND b.status = ${idx}"));
            args.push(st.to_string());
            idx += 1;
        }
    }

    if let Some(s) = search {
        if !s.trim().is_empty() {
            query.push_str(&format!(
                " AND (b.lote_numero ILIKE ${idx} OR b.titulo ILIKE ${idx} OR b.observacoes ILIKE ${idx} OR b.created_by ILIKE ${idx} OR EXISTS (SELECT 1 FROM purchase_request_items sub_i WHERE sub_i.batch_id = b.id AND (sub_i.item_code ILIKE ${idx} OR sub_i.item_description ILIKE ${idx})))"
            ));
            args.push(format!("%{}%", s.trim()));
        }
    }

    query.push_str(" GROUP BY b.id, b.lote_numero, b.modulo, b.titulo, b.observacoes, b.created_by, b.status, b.created_at, b.updated_at ORDER BY b.created_at DESC");

    let mut q = sqlx::query(&query);
    for arg in args {
        q = q.bind(arg);
    }

    let rows = q.fetch_all(&pool).await.map_err(|e| format!("Erro ao buscar lotes: {e}"))?;

    let mut batches = Vec::new();
    for r in rows {
        let batch_id: String = r.get("id");
        let lote_numero: String = r.get("lote_numero");
        let modulo_val: String = r.get("modulo");
        let titulo: Option<String> = r.get("titulo");
        let observacoes: Option<String> = r.get("observacoes");
        let created_by: Option<String> = r.get("created_by");
        let raw_status: String = r.get("status");
        let created_at: String = r.get("created_at");
        let updated_at: String = r.get("updated_at");
        let total_items: i64 = r.get("total_items");

        // Busca itens para calcular correlação com ERP em tempo real
        let items = get_batch_items_with_erp(&pool, &batch_id, &created_at).await.unwrap_or_default();
        let items_with_order = items.iter().filter(|i| i.erp_pedido_numero.is_some()).count() as i64;
        let items_completed = items.iter().filter(|i| i.status == "entregue").count() as i64;

        let computed_status = if raw_status == "cancelado" {
            "cancelado".to_string()
        } else if raw_status == "concluido" || (items_completed == total_items && total_items > 0) {
            "concluido".to_string()
        } else if items_with_order == total_items && total_items > 0 {
            "atendido".to_string()
        } else if items_with_order > 0 {
            "parcial".to_string()
        } else {
            "pendente".to_string()
        };

        batches.push(PurchaseRequestBatch {
            id: batch_id,
            lote_numero,
            modulo: modulo_val,
            titulo,
            observacoes,
            created_by,
            status: computed_status,
            total_items,
            items_with_order,
            items_completed,
            created_at,
            updated_at,
        });
    }

    Ok(batches)
}

/// Busca os itens de um lote cruzando em tempo real com pedidos de compra do ERP
async fn get_batch_items_with_erp(
    pool: &PgPool,
    batch_id: &str,
    batch_created_at: &str,
) -> Result<Vec<PurchaseRequestBatchItem>, String> {
    let rows = sqlx::query(
        "SELECT 
            id, batch_id, item_code, item_description, unit, quantity_requested,
            current_stock_at_time, overall_avg_at_time, sim_producao_at_time, future_stock_at_time,
            target_days_at_time, trigger_days_at_time, supplier_name, observacao, status,
            erp_pedido_numero, erp_pedido_data, erp_fornecedor, erp_pedido_qtd, erp_pedido_chegou, erp_previsao_entrega,
            erp_synced_at::text, created_at::text
         FROM purchase_request_items
         WHERE batch_id = $1
         ORDER BY item_code ASC"
    )
    .bind(batch_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao buscar itens do lote: {e}"))?;

    let mut items = Vec::new();

    // Data de corte para pedidos ERP: a partir da data de criação do lote (ou pedidos abertos recentes)
    let date_cutoff = if batch_created_at.len() >= 10 {
        &batch_created_at[..10]
    } else {
        "2020-01-01"
    };

    for r in rows {
        let id: String = r.get("id");
        let b_id: String = r.get("batch_id");
        let item_code: String = r.get("item_code");
        let item_description: String = r.get("item_description");
        let unit: String = r.get("unit");
        let quantity_requested: f64 = r.get("quantity_requested");
        let current_stock_at_time: f64 = r.get("current_stock_at_time");
        let overall_avg_at_time: f64 = r.get("overall_avg_at_time");
        let sim_producao_at_time: f64 = r.get("sim_producao_at_time");
        let future_stock_at_time: f64 = r.get("future_stock_at_time");
        let target_days_at_time: i32 = r.get("target_days_at_time");
        let trigger_days_at_time: i32 = r.get("trigger_days_at_time");
        let supplier_name: Option<String> = r.get("supplier_name");
        let observacao: Option<String> = r.get("observacao");
        let db_status: String = r.get("status");
        let mut erp_pedido_numero: Option<i32> = r.get("erp_pedido_numero");
        let mut erp_pedido_data: Option<String> = r.get("erp_pedido_data");
        let mut erp_fornecedor: Option<String> = r.get("erp_fornecedor");
        let mut erp_pedido_qtd: Option<f64> = r.get("erp_pedido_qtd");
        let mut erp_pedido_chegou: Option<f64> = r.get("erp_pedido_chegou");
        let mut erp_previsao_entrega: Option<String> = r.get("erp_previsao_entrega");
        let erp_synced_at: Option<String> = r.get("erp_synced_at");
        let created_at: String = r.get("created_at");

        let clean_code = item_code.replace('.', "").trim().to_string();

        // Consulta ERP em tempo real para verificar se o pedido foi lançado após a solicitação
        let erp_match = sqlx::query(
            "SELECT 
                po.n_pedido, po.d_pedido, po.c_nome_f, poi.n_qtde, poi.n_chegou, po.d_previsao, po.c_status
             FROM purchase_order_items poi
             JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
             WHERE (REPLACE(poi.c_referencia, '.', '') = $1 OR poi.c_referencia = $2)
               AND TRIM(COALESCE(po.c_status, '')) <> 'C'
               AND (po.d_pedido >= $3 OR poi.n_qtde > poi.n_chegou)
             ORDER BY po.d_pedido DESC, po.n_pedido DESC
             LIMIT 1"
        )
        .bind(&clean_code)
        .bind(&item_code)
        .bind(date_cutoff)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

        let mut item_status = db_status.clone();

        if let Some(erp_row) = erp_match {
            let p_num: i32 = erp_row.get("n_pedido");
            let p_date: Option<String> = erp_row.get("d_pedido");
            let p_fornec: Option<String> = erp_row.get("c_nome_f");
            let p_qtd: f64 = erp_row.get("n_qtde");
            let p_chegou: f64 = erp_row.get("n_chegou");
            let p_prev: Option<String> = erp_row.get("d_previsao");

            erp_pedido_numero = Some(p_num);
            erp_pedido_data = p_date;
            erp_fornecedor = p_fornec;
            erp_pedido_qtd = Some(p_qtd);
            erp_pedido_chegou = Some(p_chegou);
            erp_previsao_entrega = p_prev;

            if p_chegou >= quantity_requested || (p_qtd > 0.0 && p_chegou >= p_qtd) {
                item_status = "entregue".to_string();
            } else {
                item_status = "pedido_gerado".to_string();
            }
        }

        items.push(PurchaseRequestBatchItem {
            id,
            batch_id: b_id,
            item_code,
            item_description,
            unit,
            quantity_requested,
            current_stock_at_time,
            overall_avg_at_time,
            sim_producao_at_time,
            future_stock_at_time,
            target_days_at_time,
            trigger_days_at_time,
            supplier_name,
            observacao,
            status: item_status,
            erp_pedido_numero,
            erp_pedido_data,
            erp_fornecedor,
            erp_pedido_qtd,
            erp_pedido_chegou,
            erp_previsao_entrega,
            erp_synced_at,
            created_at,
        });
    }

    Ok(items)
}

pub async fn get_purchase_request_batch_detail_query(
    pool: PgPool,
    id: &str,
) -> Result<PurchaseRequestBatchDetail, String> {
    let r = sqlx::query(
        "SELECT id, lote_numero, modulo, titulo, observacoes, created_by, status, created_at::text, updated_at::text
         FROM purchase_request_batches
         WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Erro ao buscar lote: {e}"))?
    .ok_or_else(|| "Lote de solicitação não encontrado.".to_string())?;

    let batch_id: String = r.get("id");
    let lote_numero: String = r.get("lote_numero");
    let modulo: String = r.get("modulo");
    let titulo: Option<String> = r.get("titulo");
    let observacoes: Option<String> = r.get("observacoes");
    let created_by: Option<String> = r.get("created_by");
    let raw_status: String = r.get("status");
    let created_at: String = r.get("created_at");
    let updated_at: String = r.get("updated_at");

    let items = get_batch_items_with_erp(&pool, &batch_id, &created_at).await?;
    let total_items = items.len() as i64;
    let items_with_order = items.iter().filter(|i| i.erp_pedido_numero.is_some()).count() as i64;
    let items_completed = items.iter().filter(|i| i.status == "entregue").count() as i64;

    let computed_status = if raw_status == "cancelado" {
        "cancelado".to_string()
    } else if raw_status == "concluido" || (items_completed == total_items && total_items > 0) {
        "concluido".to_string()
    } else if items_with_order == total_items && total_items > 0 {
        "atendido".to_string()
    } else if items_with_order > 0 {
        "parcial".to_string()
    } else {
        "pendente".to_string()
    };

    Ok(PurchaseRequestBatchDetail {
        batch: PurchaseRequestBatch {
            id: batch_id,
            lote_numero,
            modulo,
            titulo,
            observacoes,
            created_by,
            status: computed_status,
            total_items,
            items_with_order,
            items_completed,
            created_at,
            updated_at,
        },
        items,
    })
}

pub async fn update_purchase_request_batch_query(
    pool: PgPool,
    id: &str,
    status: Option<&str>,
    observacoes: Option<&str>,
) -> Result<(), String> {
    let mut query = String::from("UPDATE purchase_request_batches SET updated_at = CURRENT_TIMESTAMP");
    let mut args: Vec<String> = Vec::new();
    let mut idx = 1;

    if let Some(st) = status {
        query.push_str(&format!(", status = ${idx}"));
        args.push(st.to_string());
        idx += 1;
    }

    if let Some(obs) = observacoes {
        query.push_str(&format!(", observacoes = ${idx}"));
        args.push(obs.to_string());
        idx += 1;
    }

    query.push_str(&format!(" WHERE id = ${idx}"));
    args.push(id.to_string());

    let mut q = sqlx::query(&query);
    for arg in args {
        q = q.bind(arg);
    }

    q.execute(&pool).await.map_err(|e| format!("Erro ao atualizar lote: {e}"))?;
    Ok(())
}

pub async fn delete_purchase_request_batch_query(
    pool: PgPool,
    id: &str,
) -> Result<(), String> {
    sqlx::query("DELETE FROM purchase_request_batches WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Erro ao excluir lote: {e}"))?;
    Ok(())
}

/// Retorna resumo de todos os itens com solicitações em andamento (últimos 90 dias e não cancelados/entregues)
pub async fn get_active_requested_items_summary_query(
    pool: PgPool,
) -> Result<Vec<ActiveRequestedItemSummary>, String> {
    let rows = sqlx::query(
        "SELECT 
            i.item_code, i.item_description, i.quantity_requested,
            b.id as batch_id, b.lote_numero, b.modulo, b.created_at::text,
            EXTRACT(DAY FROM (CURRENT_TIMESTAMP - b.created_at))::int as days_ago,
            i.status, i.erp_pedido_numero, i.erp_pedido_data, i.erp_fornecedor,
            i.erp_pedido_qtd, i.erp_pedido_chegou, i.erp_previsao_entrega
         FROM purchase_request_items i
         JOIN purchase_request_batches b ON i.batch_id = b.id
         WHERE b.status <> 'cancelado' 
           AND b.status <> 'concluido'
           AND b.created_at >= CURRENT_DATE - INTERVAL '90 days'
         ORDER BY b.created_at DESC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Erro ao consultar itens solicitados ativos: {e}"))?;

    let mut result = Vec::new();

    for r in rows {
        let item_code: String = r.get("item_code");
        let item_description: String = r.get("item_description");
        let quantity_requested: f64 = r.get("quantity_requested");
        let batch_id: String = r.get("batch_id");
        let lote_numero: String = r.get("lote_numero");
        let modulo: String = r.get("modulo");
        let created_at: String = r.get("created_at");
        let days_ago: i32 = r.try_get("days_ago").unwrap_or(0);
        let mut status: String = r.get("status");
        let mut erp_pedido_numero: Option<i32> = r.get("erp_pedido_numero");
        let mut erp_pedido_data: Option<String> = r.get("erp_pedido_data");
        let mut erp_fornecedor: Option<String> = r.get("erp_fornecedor");
        let mut erp_pedido_qtd: Option<f64> = r.get("erp_pedido_qtd");
        let mut erp_pedido_chegou: Option<f64> = r.get("erp_pedido_chegou");
        let mut erp_previsao_entrega: Option<String> = r.get("erp_previsao_entrega");

        // Se ainda não tem pedido gravado, tenta cruzamento com ERP em tempo real
        if erp_pedido_numero.is_none() {
            let clean_code = item_code.replace('.', "").trim().to_string();
            let date_cutoff = if created_at.len() >= 10 { &created_at[..10] } else { "2020-01-01" };

            let erp_match = sqlx::query(
                "SELECT po.n_pedido, po.d_pedido, po.c_nome_f, poi.n_qtde, poi.n_chegou, po.d_previsao
                 FROM purchase_order_items poi
                 JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
                 WHERE (REPLACE(poi.c_referencia, '.', '') = $1 OR poi.c_referencia = $2)
                   AND TRIM(COALESCE(po.c_status, '')) <> 'C'
                   AND (po.d_pedido >= $3 OR poi.n_qtde > poi.n_chegou)
                 ORDER BY po.d_pedido DESC, po.n_pedido DESC
                 LIMIT 1"
            )
            .bind(&clean_code)
            .bind(&item_code)
            .bind(date_cutoff)
            .fetch_optional(&pool)
            .await
            .unwrap_or(None);

            if let Some(erp_row) = erp_match {
                let p_num: i32 = erp_row.get("n_pedido");
                let p_date: Option<String> = erp_row.get("d_pedido");
                let p_fornec: Option<String> = erp_row.get("c_nome_f");
                let p_qtd: f64 = erp_row.get("n_qtde");
                let p_chegou: f64 = erp_row.get("n_chegou");
                let p_prev: Option<String> = erp_row.get("d_previsao");

                erp_pedido_numero = Some(p_num);
                erp_pedido_data = p_date;
                erp_fornecedor = p_fornec;
                erp_pedido_qtd = Some(p_qtd);
                erp_pedido_chegou = Some(p_chegou);
                erp_previsao_entrega = p_prev;

                if p_chegou >= quantity_requested || (p_qtd > 0.0 && p_chegou >= p_qtd) {
                    status = "entregue".to_string();
                } else {
                    status = "pedido_gerado".to_string();
                }
            }
        }

        result.push(ActiveRequestedItemSummary {
            item_code,
            item_description,
            batch_id,
            lote_numero,
            modulo,
            created_at,
            days_ago: days_ago as i64,
            quantity_requested,
            status,
            erp_pedido_numero,
            erp_pedido_data,
            erp_fornecedor,
            erp_pedido_qtd,
            erp_pedido_chegou,
            erp_previsao_entrega,
        });
    }

    Ok(result)
}

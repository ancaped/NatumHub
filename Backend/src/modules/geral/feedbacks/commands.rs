use sqlx::{PgPool, Row};

use super::models::{
    Feedback, FeedbackAdminUpdate, FeedbackDetail, FeedbackNote,
    FeedbackReorderItem, FeedbackSubmitInput,
};

const FEEDBACK_SELECT: &str = r#"SELECT id, "type", description, page, logs, screenshot, status, "createdAt", "resolvedAt", requested_by, priority, admin_notes, module_key FROM feedbacks"#;

fn map_feedback_row(row: &sqlx::postgres::PgRow) -> Feedback {
    let logs: String = row.get(4);
    let screenshot: String = row.get(5);
    Feedback {
        id: row.get(0),
        feedback_type: row.get(1),
        description: row.get(2),
        page: row.get(3),
        module_key: row.try_get::<Option<String>, _>(12).unwrap_or(None),
        logs: logs.clone(),
        screenshot: screenshot.clone(),
        status: row.get(6),
        created_at: row.get(7),
        resolved_at: row.get(8),
        requested_by: row.get(9),
        priority: row.try_get::<i32, _>(10).unwrap_or(100),
        admin_notes: row.get(11),
        has_logs: !logs.trim().is_empty(),
        has_screenshot: !screenshot.is_empty(),
        notes_count: 0,
    }
}

fn map_feedback_list_row(row: &sqlx::postgres::PgRow) -> Feedback {
    let mut fb = map_feedback_row(row);
    // Lista: não envia payload pesado; flags + contagem de notas.
    fb.has_logs = !fb.logs.trim().is_empty();
    fb.has_screenshot = !fb.screenshot.is_empty();
    fb.notes_count = row.try_get::<i64, _>(13).unwrap_or(0) as i32;
    fb.logs = String::new();
    fb.screenshot = String::new();
    fb
}

async fn fetch_feedback_by_id(pool: &PgPool, id: &str) -> Result<Feedback, String> {
    let sql = format!(r#"{} WHERE id = $1"#, FEEDBACK_SELECT);
    let row = sqlx::query(&sql)
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(map_feedback_row(&row))
}

pub async fn get_feedbacks_admin_query(pool: PgPool) -> Result<Vec<Feedback>, String> {
    let sql = r#"SELECT id, "type", description, page, logs, screenshot, status, "createdAt", "resolvedAt",
                requested_by, priority, admin_notes, module_key,
                (SELECT COUNT(*)::bigint FROM feedback_notes n WHERE n.feedback_id = feedbacks.id) AS notes_count
         FROM feedbacks
         ORDER BY
         CASE status
           WHEN 'pending' THEN 0
           WHEN 'in_progress' THEN 1
           WHEN 'queued' THEN 2
           WHEN 'planned' THEN 3
           WHEN 'awaiting_review' THEN 4
           WHEN 'wont_fix' THEN 5
           WHEN 'resolved' THEN 6
           ELSE 7
         END,
         priority ASC,
         "createdAt" DESC"#;
    let rows = sqlx::query(sql)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(map_feedback_list_row).collect())
}

fn format_datetime_display(raw: &str) -> String {
    if raw.contains('T') {
        raw.replace('T', " ").split('.').next().unwrap_or(raw).to_string()
    } else {
        raw.to_string()
    }
}

pub fn infer_module_key_from_page(page: &str) -> Option<String> {
    let p = page.to_lowercase();
    if p.contains("físico-química") || p.contains("fisico-quimica") || p.contains("fisco_quimica") {
        Some("fisco_quimica".to_string())
    } else if p.contains("microbiologia") {
        Some("microbiologia".to_string())
    } else if p.contains("lote") {
        Some("producao_lotes".to_string())
    } else if p.contains("base") {
        Some("producao_bases".to_string())
    } else if p.contains("kit") {
        Some("montagem_kits".to_string())
    } else if p.contains("proc") {
        Some("producao_proc".to_string())
    } else if p.contains("rotina") {
        Some("producao".to_string())
    } else if p.contains("planejamento") {
        Some("planejamento_producao".to_string())
    } else if p.contains("acompanhamento de produ") {
        Some("admin_acompanhamento_producao".to_string())
    } else if p.contains("linha de produto") || p.contains("produtos ativo") {
        Some("admin_linha_produtos".to_string())
    } else if p.contains("pop") {
        Some("qualidade_pops".to_string())
    } else if p.contains("devolu") {
        Some("qualidade_devolucoes".to_string())
    } else if p.contains("avaria") {
        Some("qualidade_avarias".to_string())
    } else if p.contains("recebimento mp") || p.contains("recebimento de mp") {
        Some("qualidade_recebimento_mp".to_string())
    } else if p.contains("documenta") {
        Some("qualidade_documentacao".to_string())
    } else if p.contains("simulador") {
        Some("compras_simulation".to_string())
    } else if p.contains("pedido") {
        Some("compras_pedidos".to_string())
    } else if p.contains("nota") {
        Some("compras_notas".to_string())
    } else if p.contains("almoxarifado") || p.contains("almox") {
        Some("estoque_almoxarifado".to_string())
    } else if p.contains("ordens manuais") || p.contains("ordem manual") {
        Some("estoque_ordens_manuais".to_string())
    } else if p.contains("etiqueta") {
        Some("ferramentas_etiquetas".to_string())
    } else if p.contains("impressora") {
        Some("ferramentas_impressoras".to_string())
    } else if p.contains("supervisor") || p.contains("configura") {
        Some("hub_settings".to_string())
    } else if p.contains("produção") || p.contains("producao") {
        Some("producao".to_string())
    } else if p.contains("compras") {
        Some("compras_materia_prima".to_string())
    } else if p.contains("qualidade") {
        Some("controle_qualidade".to_string())
    } else if p.contains("venda") {
        Some("vendas".to_string())
    } else if p.contains("mapa") || p.contains("desenvolvimento") || p.contains("feedback") {
        Some("desenvolvimento".to_string())
    } else {
        None
    }
}

pub async fn save_feedback_from_user_query(
    pool: PgPool,
    input: &FeedbackSubmitInput,
    requested_by: &str,
) -> Result<(), String> {
    let _ = sqlx::query("ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS module_key TEXT")
        .execute(&pool)
        .await;

    let max_prio: i32 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(priority), 99) FROM feedbacks WHERE status IN ('pending','queued','in_progress')",
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(99);

    let inferred_key = input
        .module_key
        .as_deref()
        .filter(|k| !k.trim().is_empty())
        .map(String::from)
        .or_else(|| infer_module_key_from_page(&input.page));

    sqlx::query(
        r#"INSERT INTO feedbacks (id, "type", description, page, logs, screenshot, status, "createdAt", requested_by, priority, module_key)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', CURRENT_TIMESTAMP::TEXT, $7, $8, $9)"#,
    )
    .bind(&input.id)
    .bind(&input.feedback_type)
    .bind(&input.description)
    .bind(&input.page)
    .bind(&input.logs)
    .bind(&input.screenshot)
    .bind(&requested_by)
    .bind(max_prio + 1)
    .bind(inferred_key)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn update_feedback_admin_query(
    pool: PgPool,
    id: &str,
    update: &FeedbackAdminUpdate,
) -> Result<(), String> {
    let current_status: String = sqlx::query_scalar("SELECT status FROM feedbacks WHERE id = $1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(status) = &update.status {
        let moving_to_queue = status == "queued" || status == "in_progress" || status == "planned";
        if current_status == "awaiting_review" && moving_to_queue {
            let notes = get_feedback_notes_query(pool.clone(), id).await?;
            if notes.is_empty() {
                return Err(
                    "Devolver à fila exige pelo menos uma nota do supervisor.".to_string(),
                );
            }
        }
        let moving_to_review = status == "awaiting_review";
        if moving_to_review
            && (current_status == "queued" || current_status == "in_progress" || current_status == "planned")
        {
            let notes = get_feedback_notes_query(pool.clone(), id).await?;
            if notes.is_empty() {
                return Err(
                    "Enviar para Em aberto exige uma nota de resolução (comentário).".to_string(),
                );
            }
        }
        if status == "resolved" {
            sqlx::query(
                r#"UPDATE feedbacks SET status = $1, "resolvedAt" = CURRENT_TIMESTAMP::TEXT WHERE id = $2"#,
            )
            .bind(status)
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
        } else {
            sqlx::query(
                r#"UPDATE feedbacks SET status = $1, "resolvedAt" = NULL WHERE id = $2"#,
            )
            .bind(status)
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }
    if let Some(priority) = update.priority {
        sqlx::query("UPDATE feedbacks SET priority = $1 WHERE id = $2")
            .bind(priority)
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    if let Some(notes) = &update.admin_notes {
        sqlx::query("UPDATE feedbacks SET admin_notes = $1 WHERE id = $2")
            .bind(notes)
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub async fn get_feedback_notes_query(
    pool: PgPool,
    feedback_id: &str,
) -> Result<Vec<FeedbackNote>, String> {
    let rows = sqlx::query(
        "SELECT id, feedback_id, author, body, created_at FROM feedback_notes
         WHERE feedback_id = $1 ORDER BY created_at ASC, id ASC",
    )
    .bind(feedback_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|row| FeedbackNote {
            id: row.get(0),
            feedback_id: row.get(1),
            author: row.get(2),
            body: row.get(3),
            created_at: row.get(4),
        })
        .collect())
}

pub async fn get_feedback_detail_query(pool: PgPool, id: &str) -> Result<FeedbackDetail, String> {
    let mut fb = fetch_feedback_by_id(&pool, id).await?;
    let notes = get_feedback_notes_query(pool.clone(), id).await?;
    fb.has_logs = !fb.logs.trim().is_empty();
    fb.has_screenshot = !fb.screenshot.is_empty();
    fb.notes_count = notes.len() as i32;
    Ok(FeedbackDetail { feedback: fb, notes })
}

/// Grava a nota e recompõe `admin_notes` (texto corrido de todas as notas). Serve ao POST de notas e às ações em
/// transação (`resolver`/`devolver`), que passam a conexão da transação.
pub(super) async fn inserir_nota(
    conn: &mut sqlx::PgConnection,
    id: &str,
    author: &str,
    body: &str,
) -> Result<String, sqlx::Error> {
    let note_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO feedback_notes (id, feedback_id, author, body) VALUES ($1, $2, $3, $4)")
        .bind(&note_id)
        .bind(id)
        .bind(author)
        .bind(body.trim())
        .execute(&mut *conn)
        .await?;

    let rows = sqlx::query(
        "SELECT author, body, created_at FROM feedback_notes WHERE feedback_id = $1 ORDER BY created_at ASC, id ASC",
    )
    .bind(id)
    .fetch_all(&mut *conn)
    .await?;
    let combined: String = rows
        .iter()
        .map(|r| {
            let when = r
                .get::<Option<String>, _>(2)
                .as_deref()
                .map(format_datetime_display)
                .unwrap_or_else(|| "-".to_string());
            format!("[{}] {}:\n{}", when, r.get::<String, _>(0), r.get::<String, _>(1).trim())
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    sqlx::query("UPDATE feedbacks SET admin_notes = $1 WHERE id = $2")
        .bind(&combined)
        .bind(id)
        .execute(&mut *conn)
        .await?;
    Ok(note_id)
}

pub async fn add_feedback_note_query(
    pool: PgPool,
    id: &str,
    author: &str,
    body: &str,
) -> Result<FeedbackNote, String> {
    if body.trim().is_empty() {
        return Err("Nota vazia.".to_string());
    }
    let mut conn = pool.acquire().await.map_err(|e| e.to_string())?;
    let note_id = inserir_nota(&mut conn, id, author, body).await.map_err(|e| e.to_string())?;
    get_feedback_notes_query(pool, id)
        .await?
        .into_iter()
        .find(|n| n.id == note_id)
        .ok_or_else(|| "Nota não encontrada após insert.".to_string())
}

pub async fn reorder_feedbacks_query(
    pool: PgPool,
    items: &[FeedbackReorderItem],
) -> Result<(), String> {
    for item in items {
        sqlx::query("UPDATE feedbacks SET priority = $1 WHERE id = $2")
            .bind(item.priority)
            .bind(&item.id)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

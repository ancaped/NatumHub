use sqlx::{PgPool, Row};
use tauri::State;

use crate::DbState;
use super::models::{
    Feedback, FeedbackAdminUpdate, FeedbackDetail, FeedbackNote,
    FeedbackReorderItem, FeedbackSubmitInput,
};

const FEEDBACK_SELECT: &str = r#"SELECT id, "type", description, page, logs, screenshot, status, "createdAt", "resolvedAt", requested_by, priority, admin_notes FROM feedbacks"#;

fn map_feedback_row(row: &sqlx::postgres::PgRow) -> Feedback {
    Feedback {
        id: row.get(0),
        feedback_type: row.get(1),
        description: row.get(2),
        page: row.get(3),
        logs: row.get(4),
        screenshot: row.get(5),
        status: row.get(6),
        created_at: row.get(7),
        resolved_at: row.get(8),
        requested_by: row.get(9),
        priority: row.try_get::<i32, _>(10).unwrap_or(100),
        admin_notes: row.get(11),
    }
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
    let sql = format!(
        r#"{} ORDER BY
         CASE status
           WHEN 'in_progress' THEN 0
           WHEN 'queued' THEN 1
           WHEN 'awaiting_review' THEN 2
           WHEN 'pending' THEN 3
           WHEN 'wont_fix' THEN 4
           WHEN 'resolved' THEN 5
           ELSE 6
         END,
         priority ASC,
         "createdAt" DESC"#,
        FEEDBACK_SELECT
    );
    let rows = sqlx::query(&sql)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(map_feedback_row).collect())
}

#[tauri::command]
pub fn get_feedbacks(_state: State<DbState>) -> Result<Vec<Feedback>, String> {
    Err("Use a API REST (/api/hub/feedbacks/manage)".into())
}

pub fn get_root_feedbacks_dir() -> std::path::PathBuf {
    if let Ok(mut path) = std::env::current_exe() {
        while path.pop() {
            if path.join("Backend").is_dir() && path.join("Frontend").is_dir() {
                return path.join("Feedbacks");
            }
        }
    }
    std::path::PathBuf::from("../Feedbacks")
}

fn format_datetime_display(raw: &str) -> String {
    if raw.contains('T') {
        raw.replace('T', " ").split('.').next().unwrap_or(raw).to_string()
    } else {
        raw.to_string()
    }
}

pub fn write_feedback_folder(feedback: &Feedback, notes: &[FeedbackNote]) -> Result<(), String> {
    use base64::Engine;
    let feedbacks_dir = get_root_feedbacks_dir();
    let short_id = feedback.id.get(0..8).unwrap_or(&feedback.id);
    let folder = feedbacks_dir.join(format!("feedback_{}", short_id));
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;

    let created = feedback
        .created_at
        .as_deref()
        .map(format_datetime_display)
        .unwrap_or_else(|| "-".to_string());

    let json_data = serde_json::json!({
        "id": feedback.id,
        "tipo": feedback.feedback_type,
        "descricao": feedback.description,
        "pagina": feedback.page,
        "status": feedback.status,
        "prioridade": feedback.priority,
        "solicitante": feedback.requested_by,
        "criado_em": created,
        "resolvido_em": feedback.resolved_at,
        "notas_admin": feedback.admin_notes,
        "tem_screenshot": !feedback.screenshot.is_empty(),
        "tem_logs": !feedback.logs.trim().is_empty()
    });
    std::fs::write(
        folder.join("feedback.json"),
        serde_json::to_string_pretty(&json_data).unwrap_or_default(),
    )
    .map_err(|e| e.to_string())?;

    let triagem = format!(
        "# Triagem — Feedback {}\n\n| Campo | Valor |\n| --- | --- |\n| **Status** | `{}` |\n| **Prioridade** | {} (menor = mais urgente) |\n| **Solicitante** | {} |\n| **Data/Hora** | {} |\n| **Página** | {} |\n\n## Notas do administrador\n\n{}\n\n## Instrução para agente IA\n\nLeia `feedback.json`, `logs.txt` e `screenshot.png` nesta pasta. **Triagem:** aguarda aprovação do supervisor (não resolver). **Fila:** corrija o código, preencha `resolucao.md` e altere o status para `awaiting_review` (em aberto). O supervisor finaliza como `resolved`.\n",
        short_id,
        feedback.status,
        feedback.priority,
        feedback.requested_by.as_deref().unwrap_or("-"),
        created,
        feedback.page,
        feedback
            .admin_notes
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("_Sem notas._")
    );
    std::fs::write(folder.join("triagem.md"), triagem).map_err(|e| e.to_string())?;

    let mut notas_md = String::from("# Histórico de notas — administrador\n\n");
    if notes.is_empty() {
        notas_md.push_str("_Nenhuma nota registrada._\n");
    } else {
        for n in notes {
            let when = n
                .created_at
                .as_deref()
                .map(format_datetime_display)
                .unwrap_or_else(|| "-".to_string());
            notas_md.push_str(&format!(
                "## {} — {}\n\n{}\n\n---\n\n",
                when, n.author, n.body.trim()
            ));
        }
    }
    std::fs::write(folder.join("notas_historico.md"), notas_md).map_err(|e| e.to_string())?;

    if !feedback.logs.trim().is_empty() {
        std::fs::write(folder.join("logs.txt"), &feedback.logs).map_err(|e| e.to_string())?;
    }

    if !feedback.screenshot.is_empty() {
        let b64_data = if let Some(pos) = feedback.screenshot.find(',') {
            &feedback.screenshot[pos + 1..]
        } else {
            &feedback.screenshot
        };
        if let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(b64_data) {
            let _ = std::fs::write(folder.join("screenshot.png"), &decoded);
        }
    }

    Ok(())
}

pub async fn sync_feedback_md(pool: PgPool) -> Result<(), String> {
    let rows = sqlx::query(FEEDBACK_SELECT)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut queue: Vec<(i32, String)> = Vec::new();
    let mut pending: Vec<(i32, String)> = Vec::new();
    let mut review: Vec<(i32, String)> = Vec::new();
    let mut wont_fix: Vec<(i32, String)> = Vec::new();
    let mut resolved: Vec<(i32, String)> = Vec::new();

    for row in &rows {
        let id: String = row.get(0);
        let fb_type: String = row.get(1);
        let desc: String = row.get(2);
        let page: String = row.get(3);
        let status: String = row.get(6);
        let created: Option<String> = row.get(7);
        let resolved_at: Option<String> = row.get(8);
        let requested_by: Option<String> = row.get(9);
        let priority: i32 = row.try_get::<i32, _>(10).unwrap_or(100);
        let admin_notes: Option<String> = row.get(11);

        let desc_clean = desc.replace('\n', " ").replace('|', "\\|");
        let page_clean = page.replace('\n', " ").replace('|', "\\|");
        let created_disp = created
            .as_deref()
            .map(format_datetime_display)
            .unwrap_or_else(|| "-".to_string());
        let short_id = id.get(0..8).unwrap_or(&id);
        let folder_link = format!("[📁](./feedback_{}/)", short_id);
        let solicitante = requested_by.unwrap_or_else(|| "-".to_string());
        let tipo = if fb_type == "bug" {
            "🔴 Bug"
        } else {
            "🔵 Sugestão"
        };
        let notes = admin_notes
            .unwrap_or_default()
            .replace('\n', " ")
            .replace('|', "\\|");

        let row_line = format!(
            "| {} | `{}` | {} | {} | {} | {} | {} | {} | {} | {} |",
            priority,
            short_id,
            solicitante,
            created_disp,
            tipo,
            page_clean,
            status,
            desc_clean,
            if notes.is_empty() { "-".to_string() } else { notes },
            folder_link
        );

        match status.as_str() {
            "resolved" => {
                let res_date = resolved_at
                    .as_deref()
                    .map(format_datetime_display)
                    .unwrap_or_else(|| "-".to_string());
                resolved.push((
                    priority,
                    format!(
                        "| {} | `{}` | {} | {} | {} | {} | {} | {} |",
                        priority, short_id, solicitante, created_disp, tipo, page_clean, res_date, folder_link
                    ),
                ));
            }
            "wont_fix" => wont_fix.push((priority, row_line)),
            "pending" => pending.push((priority, row_line)),
            "awaiting_review" => review.push((priority, row_line)),
            "queued" | "in_progress" => queue.push((priority, row_line)),
            _ => pending.push((priority, row_line)),
        }
    }

    queue.sort_by_key(|(p, _)| *p);
    pending.sort_by_key(|(p, _)| *p);
    review.sort_by_key(|(p, _)| *p);
    wont_fix.sort_by_key(|(p, _)| *p);
    resolved.sort_by_key(|(p, _)| *p);

    let mut md = String::new();
    md.push_str("# Feedback e Relatórios — NatumHub\n\n");
    md.push_str("> Gerado automaticamente. **Agentes IA:** priorize a **Fila** (menor `Prio` primeiro). Status: triagem → fila → em aberto (conferência) → finalizado.\n\n");

    md.push_str("## 📋 Fila (agentes IA)\n\n");
    md.push_str("Status `queued` ou `in_progress`, ordenados por prioridade.\n\n");
    if queue.is_empty() {
        md.push_str("_Fila vazia._\n\n");
    } else {
        md.push_str("| Prio | ID | Solicitante | Data/Hora | Tipo | Página | Status | Descrição | Notas admin | Pasta |\n");
        md.push_str("| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n");
        for (_, line) in queue {
            md.push_str(&line);
            md.push('\n');
        }
        md.push('\n');
    }

    md.push_str("## 🟡 Triagem\n\n");
    if pending.is_empty() {
        md.push_str("_Nenhum item em triagem._\n\n");
    } else {
        md.push_str("| Prio | ID | Solicitante | Data/Hora | Tipo | Página | Status | Descrição | Notas admin | Pasta |\n");
        md.push_str("| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n");
        for (_, line) in pending {
            md.push_str(&line);
            md.push('\n');
        }
        md.push('\n');
    }

    md.push_str("## 🔵 Em aberto (conferência supervisor)\n\n");
    if review.is_empty() {
        md.push_str("_Nenhum aguardando conferência._\n\n");
    } else {
        md.push_str("| Prio | ID | Solicitante | Data/Hora | Tipo | Página | Status | Descrição | Notas admin | Pasta |\n");
        md.push_str("| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n");
        for (_, line) in review {
            md.push_str(&line);
            md.push('\n');
        }
        md.push('\n');
    }

    md.push_str("## ⛔ Reprovados\n\n");
    if wont_fix.is_empty() {
        md.push_str("_Nenhum._\n\n");
    } else {
        md.push_str("| Prio | ID | Solicitante | Data/Hora | Tipo | Página | Status | Descrição | Notas admin | Pasta |\n");
        md.push_str("| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n");
        for (_, line) in wont_fix {
            md.push_str(&line);
            md.push('\n');
        }
        md.push('\n');
    }

    md.push_str("## 🟢 Finalizados\n\n");
    if resolved.is_empty() {
        md.push_str("_Nenhum._\n\n");
    } else {
        md.push_str("| Prio | ID | Solicitante | Data/Hora | Tipo | Página | Resolvido em | Pasta |\n");
        md.push_str("| ---: | --- | --- | --- | --- | --- | --- | --- |\n");
        for (_, line) in resolved {
            md.push_str(&line);
            md.push('\n');
        }
        md.push('\n');
    }

    let feedbacks_dir = get_root_feedbacks_dir();
    let _ = std::fs::create_dir_all(&feedbacks_dir);
    let _ = std::fs::write(feedbacks_dir.join("feedback.md"), &md);
    Ok(())
}

pub async fn save_feedback_from_user_query(
    pool: PgPool,
    input: &FeedbackSubmitInput,
    requested_by: &str,
) -> Result<(), String> {
    let max_prio: i32 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(priority), 99) FROM feedbacks WHERE status IN ('pending','queued','in_progress')",
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(99);

    sqlx::query(
        r#"INSERT INTO feedbacks (id, "type", description, page, logs, screenshot, status, "createdAt", requested_by, priority)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', CURRENT_TIMESTAMP::TEXT, $7, $8)"#,
    )
    .bind(&input.id)
    .bind(&input.feedback_type)
    .bind(&input.description)
    .bind(&input.page)
    .bind(&input.logs)
    .bind(&input.screenshot)
    .bind(&requested_by)
    .bind(max_prio + 1)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let fb = fetch_feedback_by_id(&pool, &input.id).await?;
    let _ = write_feedback_folder(&fb, &[]);
    let _ = sync_feedback_md(pool.clone()).await;
    Ok(())
}

pub async fn save_feedback_query(pool: PgPool, feedback: &Feedback) -> Result<(), String> {
    sqlx::query(
        r#"INSERT INTO feedbacks (id, "type", description, page, logs, screenshot, status, "createdAt", "resolvedAt", requested_by, priority, admin_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET
           "type" = EXCLUDED."type",
           description = EXCLUDED.description,
           page = EXCLUDED.page,
           logs = EXCLUDED.logs,
           screenshot = EXCLUDED.screenshot,
           status = EXCLUDED.status,
           "createdAt" = EXCLUDED."createdAt",
           "resolvedAt" = EXCLUDED."resolvedAt",
           requested_by = EXCLUDED.requested_by,
           priority = EXCLUDED.priority,
           admin_notes = EXCLUDED.admin_notes"#,
    )
    .bind(&feedback.id)
    .bind(&feedback.feedback_type)
    .bind(&feedback.description)
    .bind(&feedback.page)
    .bind(&feedback.logs)
    .bind(&feedback.screenshot)
    .bind(&feedback.status)
    .bind(&feedback.created_at)
    .bind(&feedback.resolved_at)
    .bind(&feedback.requested_by)
    .bind(feedback.priority)
    .bind(&feedback.admin_notes)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    let _ = write_feedback_folder(feedback, &[]);
    let _ = sync_feedback_md(pool.clone()).await;
    Ok(())
}

#[tauri::command]
pub fn save_feedback(_state: State<DbState>, _feedback: Feedback) -> Result<(), String> {
    Err("Use a API REST (/api/hub/feedbacks)".into())
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
        let moving_to_queue = status == "queued" || status == "in_progress";
        if current_status == "awaiting_review" && moving_to_queue {
            let notes = get_feedback_notes_query(pool.clone(), id).await?;
            if notes.is_empty() {
                return Err(
                    "Devolver à fila exige pelo menos uma nota do supervisor.".to_string(),
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

    let fb = fetch_feedback_by_id(&pool, id).await?;

    if fb.status == "resolved" {
        let short_id = id.get(0..8).unwrap_or(&id);
        let folder = get_root_feedbacks_dir().join(format!("feedback_{}", short_id));
        if folder.is_dir() && !folder.join("resolucao.md").exists() {
            let _ = std::fs::write(
                folder.join("resolucao.md"),
                format!(
                    "# Resolução — Feedback {}\n\n**Status:** Resolvido\n**Data:** {}\n\n## Descrição da resolução\n\n_A ser preenchido pelo agente/desenvolvedor._\n",
                    short_id,
                    chrono::Local::now().format("%Y-%m-%d %H:%M:%S")
                ),
            );
        }
    }

    sync_feedback_files_query(pool.clone(), id).await?;
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

pub async fn sync_feedback_files_query(pool: PgPool, id: &str) -> Result<(), String> {
    let fb = fetch_feedback_by_id(&pool, id).await?;
    let notes = get_feedback_notes_query(pool.clone(), id).await?;
    let _ = write_feedback_folder(&fb, &notes);
    let _ = sync_feedback_md(pool.clone()).await;
    Ok(())
}

pub async fn get_feedback_detail_query(pool: PgPool, id: &str) -> Result<FeedbackDetail, String> {
    let fb = fetch_feedback_by_id(&pool, id).await?;
    let notes = get_feedback_notes_query(pool.clone(), id).await?;
    Ok(FeedbackDetail { feedback: fb, notes })
}

pub async fn add_feedback_note_query(
    pool: PgPool,
    id: &str,
    author: &str,
    body: &str,
) -> Result<FeedbackNote, String> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return Err("Nota vazia.".to_string());
    }

    let note_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO feedback_notes (id, feedback_id, author, body) VALUES ($1, $2, $3, $4)",
    )
    .bind(&note_id)
    .bind(&id)
    .bind(&author)
    .bind(trimmed)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let notes = get_feedback_notes_query(pool.clone(), id).await?;
    let combined: String = notes
        .iter()
        .map(|n| {
            let when = n
                .created_at
                .as_deref()
                .map(format_datetime_display)
                .unwrap_or_else(|| "-".to_string());
            format!("[{}] {}:\n{}", when, n.author, n.body.trim())
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    sqlx::query("UPDATE feedbacks SET admin_notes = $1 WHERE id = $2")
        .bind(&combined)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    sync_feedback_files_query(pool.clone(), id).await?;

    notes
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
    let _ = sync_feedback_md(pool.clone()).await;
    Ok(())
}

pub async fn resolve_feedback_query(pool: PgPool, id: &str) -> Result<(), String> {
    update_feedback_admin_query(
        pool,
        id,
        &FeedbackAdminUpdate {
            status: Some("resolved".to_string()),
            priority: None,
            admin_notes: None,
        },
    )
    .await
}

#[tauri::command]
pub fn resolve_feedback(_state: State<DbState>, _id: String) -> Result<(), String> {
    Err("Use a API REST (/api/hub/feedbacks/:id)".into())
}

// Legacy alias for old get_feedbacks_conn callers
pub async fn get_feedbacks_query(pool: PgPool) -> Result<Vec<Feedback>, String> {
    get_feedbacks_admin_query(pool).await
}

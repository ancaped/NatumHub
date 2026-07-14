use sqlx::Row;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pool = app_lib::core::pg_db::create_pool().await?;
    
    // IDs de 8 caracteres do Grupo 1
    let partial_ids = vec![
        "dcee019d",
        "81864e2a",
        "76e50470",
        "d0f3ea60",
        "1aa1aa7b",
        "6444b519",
    ];

    println!("Buscando UUIDs completos no Postgres...");
    for pid in partial_ids {
        let row = sqlx::query("SELECT id, description, page FROM feedbacks WHERE id::text LIKE $1")
            .bind(format!("{}%", pid))
            .fetch_optional(&pool)
            .await?;
        
        if let Some(r) = row {
            let full_uuid: String = r.get("id");
            let desc: String = r.get("description");
            let page: String = r.get("page");
            println!("Found Feedback: {} -> {} (Page: {})", pid, full_uuid, page);
            
            // Inserir nota
            let note_id = uuid::Uuid::new_v4().to_string();
            let note_body = format!(
                "Resolução — 2026-07-14\nCausa: Título e/ou descrição desnecessários ou poluídos de acordo com o design de UI atual.\nCorreção: Remoção do bloco de título/descrição do header nas respectivas visualizações frontend.\nArquivos: PedidosView.tsx, NotasFiscaisView.tsx, MontagemKitsView.tsx, ActiveProductsView.tsx\nValidação: cargo check ✓ · npm run build ✓"
            );
            
            sqlx::query("INSERT INTO feedback_notes (id, feedback_id, author, body) VALUES ($1, $2, $3, $4)")
                .bind(note_id)
                .bind(&full_uuid)
                .bind("IA")
                .bind(note_body)
                .execute(&pool)
                .await?;
            println!("  Nota de resolução inserida.");

            // Atualizar status
            sqlx::query("UPDATE feedbacks SET status = 'awaiting_review' WHERE id = $1")
                .bind(&full_uuid)
                .execute(&pool)
                .await?;
            println!("  Status atualizado para 'awaiting_review'.");
        } else {
            println!("Warning: Feedback com ID parcial {} não foi encontrado.", pid);
        }
    }

    println!("\nRegenerando feedback_index.md...");
    app_lib::modules::geral::feedbacks::commands::sync_feedback_md(pool.clone()).await?;
    println!("feedback_index.md atualizado com sucesso!");

    Ok(())
}

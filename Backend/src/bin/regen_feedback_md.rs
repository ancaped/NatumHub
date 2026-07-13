#[tokio::main]
async fn main() -> Result<(), String> {
    let pool = app_lib::core::pg_db::create_pool()
        .await
        .map_err(|e| e.to_string())?;
    app_lib::modules::geral::feedbacks::commands::sync_feedback_md(pool).await?;
    println!("Feedbacks/feedback.md regenerated.");
    Ok(())
}

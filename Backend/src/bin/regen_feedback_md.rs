use rusqlite::Connection;

fn main() -> Result<(), String> {
    let conn = Connection::open("../Saves/data.db").map_err(|e| e.to_string())?;
    app_lib::modules::geral::feedbacks::commands::sync_feedback_md(&conn)?;
    println!("Feedbacks/feedback.md regenerated.");
    Ok(())
}

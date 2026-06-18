use rusqlite::Connection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let conn = Connection::open("../data.db")?;
    
    println!("=== FEEDBACKS MATCHING 6e75e45c ===");
    let mut stmt = conn.prepare("SELECT id, type, page, description FROM feedbacks WHERE id LIKE '%6e75e45c%'")?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?))
    })?;
    for r in rows {
        let (id, t, p, d) = r?;
        println!("  id={}, type={}, page={}, desc={:.30}", id, t, p, d);
    }
    
    Ok(())
}

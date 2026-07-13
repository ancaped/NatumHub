use rusqlite::Connection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let conn = Connection::open("../data.db")?;
    
    let mut stmt = conn.prepare(
        "SELECT id, type, description, page, status, createdAt, resolvedAt FROM feedbacks"
    )?;
    
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, String>(3)?,
            r.get::<_, String>(4)?,
            r.get::<_, String>(5)?,
            r.get::<_, Option<String>>(6)?,
        ))
    })?;
    
    println!("ALL FEEDBACKS IN SQLITE:");
    for r in rows {
        if let Ok((id, fb_type, desc, page, status, created, resolved)) = r {
            println!("ID: {}, Type: {}, Status: {}, Page: {}, Created: {}, Resolved: {:?}", id, fb_type, status, page, created, resolved);
            println!("  Desc: {}", desc);
        }
    }
    
    Ok(())
}

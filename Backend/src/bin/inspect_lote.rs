use rusqlite::Connection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db_path = app_lib::core::app_config::data_db_path();
    println!("DB path: {}", db_path.display());
    let conn = Connection::open(&db_path)?;
    
    let lote = "15100";
    let mut stmt = conn.prepare(
        "SELECT m.item_code, COALESCE(p.descricao, ''), m.quantity
         FROM stock_movements m
         LEFT JOIN produtos p ON m.item_code = p.codigo
         WHERE TRIM(COALESCE(m.document_number, '')) = TRIM(?1)
           AND m.item_type = 'produto' AND m.movement_type = 'entrada'
         ORDER BY m.item_code",
    )?;
    let rows: Vec<_> = stmt
        .query_map([lote], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, f64>(2)?))
        })?
        .filter_map(|r| r.ok())
        .collect();
    println!("Lote {} lookup: {} produto(s)", lote, rows.len());
    for (code, desc, qty) in rows {
        println!("  {} — {} ({})", code, desc, qty);
    }

    Ok(())
}

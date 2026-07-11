use rusqlite::Connection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let conn = Connection::open("../Saves/data.db")?;
    
    // Total suppliers
    let total: i32 = conn.query_row("SELECT COUNT(*) FROM suppliers", [], |r| r.get(0))?;
    println!("Total suppliers in DB: {}", total);
    
    // Raw material suppliers query
    let mut stmt = conn.prepare(
        "SELECT DISTINCT s.id, s.name 
         FROM suppliers s
         WHERE s.id IN (
             SELECT DISTINCT inv.supplier_id FROM invoices inv
             INNER JOIN items i ON inv.item_code = i.code OR replace(inv.item_code, '.', '') = replace(i.code, '.', '')
             INNER JOIN categories c ON i.category_id = c.id
             WHERE c.parent_id = 'cat_mp' OR c.id = 'cat_mp'
         ) OR s.id IN (
             SELECT DISTINCT qp.supplier_id FROM quotation_prices qp
             INNER JOIN quotation_items qi ON qp.quotation_item_id = qi.id
             INNER JOIN items i ON qi.item_code = i.code
             INNER JOIN categories c ON i.category_id = c.id
             WHERE c.parent_id = 'cat_mp' OR c.id = 'cat_mp'
         ) ORDER BY s.name"
    )?;
    
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    
    let mut count = 0;
    println!("Raw material suppliers (filtered):");
    for r in rows {
        let (id, name) = r?;
        count += 1;
        println!("  {}: {}", id, name);
    }
    println!("Total filtered raw material suppliers: {}", count);
    
    Ok(())
}

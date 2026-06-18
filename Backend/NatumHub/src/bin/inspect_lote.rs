use rusqlite::Connection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let conn = Connection::open("../data.db")?;
    
    // Find document numbers with multiple products
    let mut stmt = conn.prepare(
        "SELECT document_number, COUNT(DISTINCT item_code) as c 
         FROM stock_movements 
         WHERE item_type = 'produto' AND movement_type = 'entrada'
         GROUP BY document_number 
         HAVING c > 1"
    )?;
    
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, Option<String>>(0)?,
            r.get::<_, i32>(1)?,
        ))
    })?;
    
    println!("Lotes with multiple products:");
    for r in rows {
        if let Ok((doc, count)) = r {
            println!("  Doc: {:?}, Product Count: {}", doc, count);
        }
    }

    // Let's print all product entries for some of these lotes
    let doc = "14955";
    println!("\nlotes_baixas rows for Lote {}:", doc);
    let mut stmt2 = conn.prepare(
        "SELECT cReferencia, nQtde, cCodProd, cUsuario, cJustificativa 
         FROM lotes_baixas 
         WHERE nLote = 14955"
    )?;
    let rows2 = stmt2.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, f64>(1)?,
            r.get::<_, Option<String>>(2)?,
            r.get::<_, Option<String>>(3)?,
            r.get::<_, Option<String>>(4)?,
        ))
    })?;
    for r2 in rows2 {
        if let Ok((ref_code, qty, prod_code, user, just)) = r2 {
            println!("  Ref: {}, Qty: {}, ProdCode: {:?}, User: {:?}, Just: {:?}", ref_code, qty, prod_code, user, just);
        }
    }

    Ok(())
}

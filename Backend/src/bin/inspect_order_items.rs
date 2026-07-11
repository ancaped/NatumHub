use rusqlite::Connection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let conn = Connection::open("../Saves/data.db")?;
    
    // Count linked formulations to items table
    let count_items_linked: i32 = conn.query_row(
        "SELECT COUNT(*) 
         FROM formulations f 
         JOIN items i ON (
             f.product_code = i.code OR
             (f.product_code LIKE '0%' AND SUBSTR(f.product_code, 2) = i.code) OR
             (i.code LIKE '0%' AND f.product_code = SUBSTR(i.code, 2))
         )", [], |r| r.get(0)
    ).unwrap_or(0);

    let total: i32 = conn.query_row("SELECT COUNT(*) FROM formulations", [], |r| r.get(0))?;
    
    println!("Linked to items with improved JOIN: {} / {}", count_items_linked, total);

    // Let's count how many match EITHER produtos OR items!
    let count_either: i32 = conn.query_row(
        "SELECT COUNT(DISTINCT f.rowid)
         FROM formulations f
         LEFT JOIN produtos p ON (
             f.product_code = p.codigo OR
             (f.product_code LIKE '0%' AND SUBSTR(f.product_code, 2) = p.codigo) OR
             (p.codigo LIKE '0%' AND f.product_code = SUBSTR(p.codigo, 2))
         )
         LEFT JOIN items i ON (
             f.product_code = i.code OR
             (f.product_code LIKE '0%' AND SUBSTR(f.product_code, 2) = i.code) OR
             (i.code LIKE '0%' AND f.product_code = SUBSTR(i.code, 2))
         )
         WHERE p.codigo IS NOT NULL OR i.code IS NOT NULL", [], |r| r.get(0)
    ).unwrap_or(0);
    println!("Linked to either: {} / {}", count_either, total);

    // Let's print some examples of formulations that are NOT linked to either, to see their codes
    let mut stmt = conn.prepare(
        "SELECT DISTINCT f.product_code
         FROM formulations f
         LEFT JOIN produtos p ON (
             f.product_code = p.codigo OR
             (f.product_code LIKE '0%' AND SUBSTR(f.product_code, 2) = p.codigo) OR
             (p.codigo LIKE '0%' AND f.product_code = SUBSTR(p.codigo, 2))
         )
         LEFT JOIN items i ON (
             f.product_code = i.code OR
             (f.product_code LIKE '0%' AND SUBSTR(f.product_code, 2) = i.code) OR
             (i.code LIKE '0%' AND f.product_code = SUBSTR(i.code, 2))
         )
         WHERE p.codigo IS NULL AND i.code IS NULL
         LIMIT 10"
    )?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    println!("\nExamples of unlinked formulation product codes:");
    for r in rows {
        if let Ok(code) = r {
            println!("  {}", code);
        }
    }

    Ok(())
}

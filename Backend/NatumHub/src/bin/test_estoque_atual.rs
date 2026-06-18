use rusqlite::Connection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let conn = Connection::open("../data.db")?;
    
    // Search the entire database for any table/column containing '134044' or similar
    let term = "134044";
    println!("Searching all tables for '{}'...", term);
    
    let mut tbl_stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'")?;
    let tbls = tbl_stmt.query_map([], |row| row.get::<_, String>(0))?;
    for t in tbls {
        let table_name = t?;
        // Get column names
        let mut col_stmt = conn.prepare(&format!("PRAGMA table_info({})", table_name))?;
        let cols = col_stmt.query_map([], |row| row.get::<_, String>(1))?;
        let col_names: Vec<String> = cols.filter_map(Result::ok).collect();
        
        for col in col_names {
            let query = format!("SELECT COUNT(*) FROM {} WHERE CAST({} AS TEXT) LIKE ?", table_name, col);
            let count: i32 = conn.query_row(&query, [format!("%{}%", term)], |row| row.get(0)).unwrap_or(0);
            if count > 0 {
                println!("Match found in Table: {}, Column: {}, Count: {}", table_name, col, count);
                // Print a few matching rows
                let select_query = format!("SELECT {} FROM {} WHERE CAST({} AS TEXT) LIKE ? LIMIT 5", col, table_name, col);
                let mut sel_stmt = conn.prepare(&select_query)?;
                let sel_rows = sel_stmt.query_map([format!("%{}%", term)], |row| row.get::<_, String>(0))?;
                for r in sel_rows {
                    if let Ok(val) = r {
                        println!("  Value: {}", val);
                    }
                }
            }
        }
    }
    
    Ok(())
}

use rusqlite::Connection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let conn = Connection::open("../Saves/data.db")?;

    let target_code = "9.15.010";

    println!("=== LATEST STOCK SNAPSHOTS FOR {} ===", target_code);
    let mut stmt = conn.prepare("
        SELECT id, import_id, stock_qty, reserved_qty, in_production, in_orders, snapshot_date 
        FROM stock_snapshots 
        WHERE item_code = ?1 
        ORDER BY snapshot_date DESC, id DESC LIMIT 5
    ")?;
    let mut rows = stmt.query([target_code])?;
    while let Some(row) = rows.next()? {
        let id: String = row.get(0)?;
        let import_id: String = row.get(1)?;
        let stock_qty: f64 = row.get(2)?;
        let reserved_qty: f64 = row.get(3)?;
        let in_production: f64 = row.get(4)?;
        let in_orders: f64 = row.get(5)?;
        let date: Option<String> = row.get(6)?;
        println!("ID: {}, ImportID: {}, Stock: {}, Reserved: {}, InProd: {}, InOrders: {}, Date: {:?}", id, import_id, stock_qty, reserved_qty, in_production, in_orders, date);
    }

    Ok(())
}

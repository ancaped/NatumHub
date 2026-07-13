use app_lib::legacy_db::sync_from_sql_server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db_path = "../data.db";
    let res = sync_from_sql_server(db_path).await?;
    println!("Sync finished: {} products, {} items", res.products, res.items);
    Ok(())
}

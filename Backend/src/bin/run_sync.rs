use app_lib::core::legacy_db::{sync_from_sql_server, SyncMode};
use app_lib::core::pg_db;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mode = if std::env::args().any(|a| a == "--full") {
        SyncMode::Full
    } else {
        SyncMode::Incremental
    };
    let pool = pg_db::create_pool().await?;
    let res = sync_from_sql_server(&pool, mode).await?;
    println!(
        "Sync {} finished (since {}): {} products, {} items, {} movements | stock verify checked={} repaired={}",
        res.mode,
        res.since,
        res.products,
        res.items,
        res.movements,
        res.stock_verified,
        res.stock_repaired
    );
    Ok(())
}

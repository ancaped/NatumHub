use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect("postgresql://postgres:postgres@localhost:5432/postgres")
        .await?;

    let rows = sqlx::query(
        "SELECT DISTINCT observacoes, count(*) as cnt FROM procs_produtos GROUP BY observacoes ORDER BY cnt DESC"
    )
    .fetch_all(&pool)
    .await?;

    println!("Valores existentes em observacoes:");
    for r in rows {
        use sqlx::Row;
        let obs: Option<String> = r.get("observacoes");
        let cnt: i64 = r.get("cnt");
        println!(" - '{:?}' => {} produtos", obs, cnt);
    }

    Ok(())
}

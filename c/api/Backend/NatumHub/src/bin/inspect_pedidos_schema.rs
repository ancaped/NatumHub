use app_lib::legacy_db::connect_sql_server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut client = connect_sql_server(Some("../data.db")).await?;

    let stream = client.query("
        SELECT COUNT(*)
        FROM Pedidos2 p2 WITH (NOLOCK)
        INNER JOIN Pedidos1 p1 WITH (NOLOCK) ON p1.nPedido = p2.nPedido AND p1.dPedido = p2.dPedido
        WHERE p1.dPedido >= DATEADD(month, -6, GETDATE()) OR (p1.CSTATUS NOT IN ('FT', 'CA') AND p1.CSTATUS IS NOT NULL)
    ", &[]).await?;
    let row = stream.into_first_result().await?;
    let count: i32 = row[0].get(0).unwrap_or(0);
    println!("Total sales order items (last 6 months + active): {}", count);

    let stream2 = client.query("
        SELECT COUNT(*)
        FROM Pedidos2 p2 WITH (NOLOCK)
        INNER JOIN Pedidos1 p1 WITH (NOLOCK) ON p1.nPedido = p2.nPedido AND p1.dPedido = p2.dPedido
        WHERE p1.CSTATUS NOT IN ('FT', 'CA') AND p1.CSTATUS IS NOT NULL
    ", &[]).await?;
    let row2 = stream2.into_first_result().await?;
    let count2: i32 = row2[0].get(0).unwrap_or(0);
    println!("Total sales order items (active only): {}", count2);

    Ok(())
}

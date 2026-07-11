use app_lib::core::legacy_db::connect_sql_server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut client = connect_sql_server(Some("../Saves/data.db")).await?;

    let statuses = vec!["FT", "CA", "FP", "EX", "PP", "CF", "LB", "AL"];
    
    for status in statuses {
        println!("\n=== SAMPLES FOR STATUS: {} ===", status);
        let query = format!("
            SELECT TOP 2
                p1.nPedido,
                CONVERT(varchar, p1.dPedido, 120) COLLATE Latin1_General_CI_AS,
                p1.cNome COLLATE Latin1_General_CI_AS,
                CAST(p1.nValorTot AS FLOAT),
                p1.NNOTAFISCAL,
                (SELECT SUM(p2.nQtde) FROM Pedidos2 p2 WHERE p2.nPedido = p1.nPedido AND p2.dPedido = p1.dPedido) as requested,
                (SELECT SUM(p2.nQtdeFat) FROM Pedidos2 p2 WHERE p2.nPedido = p1.nPedido AND p2.dPedido = p1.dPedido) as invoiced
            FROM Pedidos1 p1 WITH (NOLOCK)
            WHERE p1.CSTATUS = '{}'
              AND p1.dPedido >= DATEADD(month, -24, GETDATE())
            ORDER BY p1.dPedido DESC
        ", status);
        
        let stream = client.query(&query, &[]).await?;
        let rows = stream.into_first_result().await?;
        
        for row in rows {
            let n_pedido: i32 = row.get(0).unwrap_or(0);
            let date: &str = row.get(1).unwrap_or("");
            let client_name: &str = row.get(2).unwrap_or("");
            let total_val: f64 = row.get(3).unwrap_or(0.0);
            let nf: i32 = row.get(4).unwrap_or(0);
            let req_qty: i32 = row.get(5).unwrap_or(0);
            let inv_qty: i32 = row.get(6).unwrap_or(0);
            
            println!("  Pedido: {:<6} | Data: {} | Cliente: {:<40} | Valor: {:<8.2} | NF: {:<5} | QtdPedida: {:<4} | QtdFaturada: {:<4}", 
                     n_pedido, date, client_name.trim(), total_val, nf, req_qty, inv_qty);
        }
    }
    
    Ok(())
}

use tiberius::{Client, Config};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut config = Config::new();
    config.host("192.168.101.249");
    config.port(1433);
    config.authentication(tiberius::AuthMethod::sql_server("sa", "byteonDS2015"));
    config.database("NATUM");
    config.trust_cert();

    let tcp = TcpStream::connect(config.get_addr()).await?;
    tcp.set_nodelay(true)?;
    let mut client = Client::connect(config, tcp.compat_write()).await?;

    for lote in &[15348, 15377, 15276, 15321, 15234] {
        println!("=== LOTE {} ===", lote);
        let query = format!("
            SELECT 
                cStatus COLLATE Latin1_General_CI_AS as cStatus,
                CONVERT(varchar, dReservaP, 120) COLLATE Latin1_General_CI_AS as dReservaP,
                CONVERT(varchar, dPesado, 120) COLLATE Latin1_General_CI_AS as dPesado
            FROM Lotes
            WHERE nLote = {}
        ", lote);
        let stream = client.query(&query, &[]).await?;
        let db_rows = stream.into_first_result().await?;
        for row in db_rows {
            let status: &str = row.get::<&str, _>(0).unwrap_or("").trim();
            let d_reserva: &str = row.get(1).unwrap_or("NULL");
            let d_pesado: &str = row.get(2).unwrap_or("NULL");
            println!("  Status: '{}' | dReservaP: '{}' | dPesado: '{}'", 
                status, d_reserva, d_pesado);
        }
    }

    Ok(())
}

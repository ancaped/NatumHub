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

    let query = "
        SELECT cStatus, COUNT(*) 
        FROM Lotes 
        GROUP BY cStatus
    ";
    let stream = client.query(query, &[]).await?;
    let db_rows = stream.into_first_result().await?;
    
    println!("Statuses in Lotes:");
    for row in db_rows {
        let status: &str = row.get(0).unwrap_or("");
        let count: i32 = row.get(1).unwrap_or(0);
        println!("  Status: '{}' | Count: {}", status, count);
    }

    Ok(())
}

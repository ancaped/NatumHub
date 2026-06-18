use tiberius::{Client, Config};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let host = "192.168.101.249";
    let port = 1433;
    let user = "sa";
    let password = "byteonDS2015";
    let database = "NATUM";
    
    let mut config = Config::new();
    config.host(host);
    config.port(port);
    config.authentication(tiberius::AuthMethod::sql_server(user, password));
    config.database(database);
    config.trust_cert();
    
    let tcp = TcpStream::connect(config.get_addr()).await?;
    tcp.set_nodelay(true)?;
    let mut client = Client::connect(config, tcp.compat_write()).await?;

    println!("Counting sales in VENDAS2 grouped by year...");
    let stream = client.query("
        SELECT 
            YEAR(dVenda) as year,
            COUNT(*) as count
        FROM VENDAS2 WITH (NOLOCK)
        GROUP BY YEAR(dVenda)
        ORDER BY year DESC
    ", &[]).await?;
    
    let rows = stream.into_first_result().await?;
    for row in rows {
        println!("Year={:?}, count={:?}",
            row.get::<i32, _>(0),
            row.get::<i32, _>(1),
        );
    }
    
    Ok(())
}

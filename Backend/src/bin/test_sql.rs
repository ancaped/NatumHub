use tiberius::{Client, Config};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Credenciais via ambiente: NATUM_SQL_HOST/PORT/USER/PASSWORD/DATABASE
    let host = std::env::var("NATUM_SQL_HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let port: u16 = std::env::var("NATUM_SQL_PORT").unwrap_or_else(|_| "1433".into()).parse().unwrap_or(1433);
    let user = std::env::var("NATUM_SQL_USER").unwrap_or_default();
    let password = std::env::var("NATUM_SQL_PASSWORD").unwrap_or_default();
    let database = std::env::var("NATUM_SQL_DATABASE").unwrap_or_default();
    if user.is_empty() || password.is_empty() || database.is_empty() {
        eprintln!("Defina NATUM_SQL_USER, NATUM_SQL_PASSWORD e NATUM_SQL_DATABASE.");
        std::process::exit(1);
    }

    let mut config = Config::new();
    config.host(&host);
    config.port(port);
    config.authentication(tiberius::AuthMethod::sql_server(&user, &password));
    config.database(&database);
    config.trust_cert();

    let tcp = TcpStream::connect(config.get_addr()).await?;
    tcp.set_nodelay(true)?;
    let mut client = Client::connect(config, tcp.compat_write()).await?;

    let query = "
        SELECT 
            cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
            CAST(nQtdeEstoque AS FLOAT) as nQtdeEstoque,
            CAST(nqtdeReserva AS FLOAT) as nqtdeReserva,
            CAST(nQtdeProducao AS FLOAT) as nQtdeProducao,
            CAST(nQtdePedidos AS FLOAT) as nQtdePedidos,
            cInativo COLLATE Latin1_General_CI_AS as cInativo
        FROM Insumos WITH (NOLOCK)
        WHERE cReferencia = '9.15.010';
    ";
    let stream = client.query(query, &[]).await?;
    let db_rows = stream.into_first_result().await?;
    println!("Rows count: {}", db_rows.len());
    for row in db_rows {
        let code: &str = row.get(0).unwrap_or("");
        let stock: f64 = row.get(1).unwrap_or(0.0);
        let res: f64 = row.get(2).unwrap_or(0.0);
        let prod: f64 = row.get(3).unwrap_or(0.0);
        let ped: f64 = row.get(4).unwrap_or(0.0);
        let inat: Option<&str> = row.get(5);
        println!("Code: {}, Stock: {}, Reserved: {}, InProd: {}, InOrders: {}, Inativo: {:?}", code, stock, res, prod, ped, inat);
    }

    Ok(())
}

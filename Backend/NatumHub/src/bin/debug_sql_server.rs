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

    // Let's search Lotes_Baixas for nLote = 14995
    println!("--- Querying Lotes_Baixas for nLote = 14995 ---");
    let stream = client.query("
        SELECT 
            Registro,
            nLote,
            cReferencia COLLATE Latin1_General_CI_AS,
            CAST(nQtde AS FLOAT),
            cUsuario COLLATE Latin1_General_CI_AS,
            cJustificativa COLLATE Latin1_General_CI_AS,
            cCodProd COLLATE Latin1_General_CI_AS
        FROM Lotes_Baixas
        WHERE nLote = 14995
    ", &[]).await?;
    let rows = stream.into_first_result().await?;
    for row in rows {
        println!("  Baixa: Registro={:?}, ref={:?}, qty={:?}, user={:?}, prod_code={:?}",
            row.get::<i32, _>(0),
            row.get::<&str, _>(2),
            row.get::<f64, _>(3),
            row.get::<&str, _>(4),
            row.get::<&str, _>(6),
        );
    }

    // Let's search Lotes_MATERIAIS for nLote = 14995 or cLote = '14995'
    println!("--- Querying Lotes_MATERIAIS ---");
    let stream = client.query("
        SELECT COLUMN_NAME COLLATE Latin1_General_CI_AS 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Lotes_MATERIAIS'
    ", &[]).await?;
    if let Ok(rows) = stream.into_first_result().await {
        for row in rows {
            println!("  Column: {:?}", row.get::<&str, _>(0));
        }
    }

    Ok(())
}

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

    println!("Querying Lotes for products using 9.15.323...");
    let stream = client.query("
        SELECT 
            nLote,
            cCodProd,
            cCodProd2,
            cCodProd3,
            cCodProd4,
            CAST(nQtde AS FLOAT) as nQtde,
            CAST(nQtde1 AS FLOAT) as nQtde1,
            CAST(nQtde2 AS FLOAT) as nQtde2,
            CAST(nQtde3 AS FLOAT) as nQtde3,
            CAST(nQtde4 AS FLOAT) as nQtde4,
            dLote,
            cStatus
        FROM Lotes WITH (NOLOCK)
        WHERE (cStatus NOT IN ('EA', 'CF', 'FP', 'CA') OR cStatus IS NULL)
        AND (
            cCodProd IN ('60.11.015', '1.14.054', '2.13.074', '2.12.039', '2.11.044', '2.13.081', '1.13.064', '2.13.080', '1.11.063', '1.12.039', '2.12.056', '60.12.017', '6.13.012') OR
            cCodProd2 IN ('60.11.015', '1.14.054', '2.13.074', '2.12.039', '2.11.044', '2.13.081', '1.13.064', '2.13.080', '1.11.063', '1.12.039', '2.12.056', '60.12.017', '6.13.012') OR
            cCodProd3 IN ('60.11.015', '1.14.054', '2.13.074', '2.12.039', '2.11.044', '2.13.081', '1.13.064', '2.13.080', '1.11.063', '1.12.039', '2.12.056', '60.12.017', '6.13.012') OR
            cCodProd4 IN ('60.11.015', '1.14.054', '2.13.074', '2.12.039', '2.11.044', '2.13.081', '1.13.064', '2.13.080', '1.11.063', '1.12.039', '2.12.056', '60.12.017', '6.13.012')
        )
        ORDER BY dLote DESC
    ", &[]).await?;
    
    let rows = stream.into_first_result().await?;
    println!("Found {} matching lots", rows.len());
    for row in rows {
        let lote: i32 = row.get(0).unwrap_or(0);
        let status: &str = row.get::<&str, _>(11).unwrap_or("").trim();
        let date: chrono::NaiveDateTime = row.get(10).unwrap();
        
        let p1: &str = row.get::<&str, _>(1).unwrap_or("").trim();
        let p2: &str = row.get::<&str, _>(2).unwrap_or("").trim();
        let p3: &str = row.get::<&str, _>(3).unwrap_or("").trim();
        let p4: &str = row.get::<&str, _>(4).unwrap_or("").trim();
        
        let q1: f64 = row.get(5).unwrap_or(0.0);
        let q2: f64 = row.get(6).unwrap_or(0.0);
        let q3: f64 = row.get(7).unwrap_or(0.0);
        let q4: f64 = row.get(8).unwrap_or(0.0);

        println!("Lote={:?}, Date={:?}, Status={:?}, P1={:?}({:?}), P2={:?}({:?}), P3={:?}({:?}), P4={:?}({:?})",
            lote, date.format("%Y-%m-%d").to_string(), status,
            p1, q1, p2, q2, p3, q3, p4, q4
        );
    }
    
    Ok(())
}

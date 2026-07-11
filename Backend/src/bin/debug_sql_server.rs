use tiberius::{Client, Config};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;

fn env(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Credenciais via ambiente (nunca hardcode):
    //   NATUM_SQL_HOST, NATUM_SQL_PORT, NATUM_SQL_USER, NATUM_SQL_PASSWORD, NATUM_SQL_DATABASE
    let host = env("NATUM_SQL_HOST", "127.0.0.1");
    let port: u16 = env("NATUM_SQL_PORT", "1433").parse().unwrap_or(1433);
    let user = env("NATUM_SQL_USER", "");
    let password = env("NATUM_SQL_PASSWORD", "");
    let database = env("NATUM_SQL_DATABASE", "");

    if user.is_empty() || password.is_empty() || database.is_empty() {
        eprintln!("Defina NATUM_SQL_USER, NATUM_SQL_PASSWORD e NATUM_SQL_DATABASE no ambiente.");
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

    // Let's search Lotes_Baixas for nLote = 14995
    println!("--- Querying Lotes_Baixas for nLote = 14995 ---");
    let stream = client
        .query(
            "
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
    ",
            &[],
        )
        .await?;
    let rows = stream.into_first_result().await?;
    for row in rows {
        println!(
            "  Baixa: Registro={:?}, ref={:?}, qty={:?}, user={:?}, prod_code={:?}",
            row.get::<i32, _>(0),
            row.get::<&str, _>(2),
            row.get::<f64, _>(3),
            row.get::<&str, _>(4),
            row.get::<&str, _>(6),
        );
    }

    Ok(())
}

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

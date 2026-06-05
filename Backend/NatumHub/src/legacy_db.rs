use rusqlite::{params, Connection};
use tiberius::{Client, Config};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;
use std::collections::HashSet;
use uuid::Uuid;
use chrono::NaiveDateTime;
use crate::parser::get_linha_prefix;

pub struct SyncResult {
    pub products: usize,
    pub suppliers: usize,
    pub items: usize,
    pub snapshots: usize,
    pub invoices: usize,
    pub consumption: usize,
    pub formulations: usize,
    pub movements: usize,
}

// Intermediate thread-safe structs to hold SQL Server data
struct ProductRow {
    codigo: String,
    descricao: String,
    estoque: i32,
    producao: i32,
    pedidos: i32,
    base: Option<String>,
    fase: Option<String>,
    m_sales: [i32; 12],
}

struct SupplierRow {
    cod_fornec: i32,
    nome: String,
    contato: Option<String>,
    email: Option<String>,
    obs: Option<String>,
}

struct InsumoRow {
    code: String,
    desc: String,
    unit: String,
    line: Option<String>,
    type_code: Option<String>,
    is_ignored: i32,
}

struct MaterialRow {
    code: String,
    desc: String,
    unit: String,
    line: Option<String>,
    type_code: Option<String>,
    is_ignored: i32,
}

struct StockRow {
    code: String,
    stock_qty: f64,
    reserved_qty: f64,
    in_prod: f64,
    in_orders: f64,
}

#[derive(Clone, Debug)]
struct InvoiceRow {
    nota: i32,
    code: String,
    desc: Option<String>,
    unit: Option<String>,
    quantity: f64,
    unit_price: f64,
    total_value: f64,
    fornec_name: Option<String>,
    supplier_id: Option<String>,
    date_str: Option<String>,
}

struct ConsumptionRow {
    code: String,
    year: i32,
    total_qty: f64,
    monthly_avg: f64,
}

struct FormulationRow {
    product_code: String,
    ingredient_code: String,
    description: Option<String>,
    quantity: f64,
    percentage: Option<f64>,
}

struct LoteRow {
    lote: i32,
    product_code: String,
    qty: f64,
    date_str: String,
    status: Option<String>,
    fab: Option<String>,
    aut: Option<String>,
}

struct LoteBaixaRow {
    registro: i32,
    lote: i32,
    ref_code: String,
    qty: f64,
    date_str: String,
    user: Option<String>,
    just: Option<String>,
    prod_code: Option<String>,
}

struct VendaRow {
    registro: i32,
    venda: i32,
    prod_code: String,
    qty: f64,
    date_str: String,
    client_name: Option<String>,
    nota_fiscal: Option<i32>,
}

fn get_setting_from_db_or_file(conn: Option<&Connection>, key: &str, default: &str) -> String {
    if let Some(c) = conn {
        if let Ok(val) = c.query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get::<_, String>(0)) {
            return val;
        }
    }
    // Fallback: try to open "../data.db"
    if let Ok(c) = Connection::open("../data.db") {
        if let Ok(val) = c.query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get::<_, String>(0)) {
            return val;
        }
    }
    default.to_string()
}

pub async fn connect_sql_server(sqlite_path: Option<&str>) -> anyhow::Result<Client<tokio_util::compat::Compat<TcpStream>>> {
    let path = sqlite_path.unwrap_or("../data.db");
    let (host, port_str, user, password, database) = {
        let conn = Connection::open(path).ok();
        let conn_ref = conn.as_ref();
        let host = get_setting_from_db_or_file(conn_ref, "sql_host", "192.168.101.249");
        let port_str = get_setting_from_db_or_file(conn_ref, "sql_port", "1433");
        let user = get_setting_from_db_or_file(conn_ref, "sql_user", "sa");
        let password = get_setting_from_db_or_file(conn_ref, "sql_password", "byteonDS2015");
        let database = get_setting_from_db_or_file(conn_ref, "sql_database", "NATUM");
        (host, port_str, user, password, database)
    };
    
    let port: u16 = port_str.parse().unwrap_or(1433);

    let mut config = Config::new();
    config.host(&host);
    config.port(port);
    config.authentication(tiberius::AuthMethod::sql_server(&user, &password));
    config.database(&database);
    config.trust_cert(); // trust local SQL Server certs

    let tcp = TcpStream::connect(config.get_addr()).await?;
    tcp.set_nodelay(true)?;

    let client = Client::connect(config, tcp.compat_write()).await?;
    Ok(client)
}

pub async fn sync_from_sql_server(sqlite_path: &str) -> anyhow::Result<SyncResult> {
    let mut client = connect_sql_server(Some(sqlite_path)).await?;

    // ==========================================
    // 1. FETCH ALL DATA FROM SQL SERVER FIRST (AWAIT POINTS)
    // ==========================================

    // A. Query Products
    let query_produtos = "
SELECT 
    p.cCodProd COLLATE Latin1_General_CI_AS as cCodProd,
    p.cNomeProd COLLATE Latin1_General_CI_AS as cNomeProd,
    CAST(p.nQtdeEstoque AS INT) as nQtdeEstoque,
    CAST(p.nQtdeProducao AS INT) as nQtdeProducao,
    CAST(p.nPedidos AS INT) as nPedidos,
    p.cBase COLLATE Latin1_General_CI_AS as cBase,
    p.cNomeTipo COLLATE Latin1_General_CI_AS as cNomeTipo,
    CAST(ISNULL(v.M1, 0) AS INT) as M1,
    CAST(ISNULL(v.M2, 0) AS INT) as M2,
    CAST(ISNULL(v.M3, 0) AS INT) as M3,
    CAST(ISNULL(v.M4, 0) AS INT) as M4,
    CAST(ISNULL(v.M5, 0) AS INT) as M5,
    CAST(ISNULL(v.M6, 0) AS INT) as M6,
    CAST(ISNULL(v.M7, 0) AS INT) as M7,
    CAST(ISNULL(v.M8, 0) AS INT) as M8,
    CAST(ISNULL(v.M9, 0) AS INT) as M9,
    CAST(ISNULL(v.M10, 0) AS INT) as M10,
    CAST(ISNULL(v.M11, 0) AS INT) as M11,
    CAST(ISNULL(v.M12, 0) AS INT) as M12
FROM Produtos p WITH (NOLOCK)
LEFT JOIN (
    SELECT 
        cCodProd,
        SUM(CASE WHEN MONTH(dVenda) = 1 THEN nQtde ELSE 0 END) as M1,
        SUM(CASE WHEN MONTH(dVenda) = 2 THEN nQtde ELSE 0 END) as M2,
        SUM(CASE WHEN MONTH(dVenda) = 3 THEN nQtde ELSE 0 END) as M3,
        SUM(CASE WHEN MONTH(dVenda) = 4 THEN nQtde ELSE 0 END) as M4,
        SUM(CASE WHEN MONTH(dVenda) = 5 THEN nQtde ELSE 0 END) as M5,
        SUM(CASE WHEN MONTH(dVenda) = 6 THEN nQtde ELSE 0 END) as M6,
        SUM(CASE WHEN MONTH(dVenda) = 7 THEN nQtde ELSE 0 END) as M7,
        SUM(CASE WHEN MONTH(dVenda) = 8 THEN nQtde ELSE 0 END) as M8,
        SUM(CASE WHEN MONTH(dVenda) = 9 THEN nQtde ELSE 0 END) as M9,
        SUM(CASE WHEN MONTH(dVenda) = 10 THEN nQtde ELSE 0 END) as M10,
        SUM(CASE WHEN MONTH(dVenda) = 11 THEN nQtde ELSE 0 END) as M11,
        SUM(CASE WHEN MONTH(dVenda) = 12 THEN nQtde ELSE 0 END) as M12
    FROM VENDAS2 WITH (NOLOCK)
    WHERE YEAR(dVenda) = YEAR(GETDATE())
    GROUP BY cCodProd
) v ON p.cCodProd = v.cCodProd
WHERE p.cInativo = 'N' OR p.cInativo IS NULL;
    ";
    println!("Step A: Querying Produtos");
    let stream = client.query(query_produtos, &[]).await?;
    let db_rows_prod = stream.into_first_result().await?;
    let mut products_list = Vec::new();
    for row in db_rows_prod {
        let codigo: &str = row.get(0).unwrap_or("");
        if codigo.is_empty() { continue; }
        let raw_descricao: &str = row.get(1).unwrap_or("");
        let mut m_sales: [i32; 12] = [0; 12];
        for i in 0..12 {
            m_sales[i] = row.get(7 + i).unwrap_or(0);
        }
        products_list.push(ProductRow {
            codigo: codigo.trim().to_string(),
            descricao: raw_descricao.trim().to_string(),
            estoque: row.get(2).unwrap_or(0),
            producao: row.get(3).unwrap_or(0),
            pedidos: row.get(4).unwrap_or(0),
            base: row.get(5).map(|s: &str| s.trim().to_string()).filter(|s| !s.is_empty()),
            fase: row.get(6).map(|s: &str| s.trim().to_string()).filter(|s| !s.is_empty()),
            m_sales,
        });
    }

    // B. Query Suppliers
    let query_fornecedores = "
SELECT 
    nCodFornec,
    cNomeF COLLATE Latin1_General_CI_AS as cNomeF,
    cContatoF COLLATE Latin1_General_CI_AS as cContatoF,
    cEmail COLLATE Latin1_General_CI_AS as cEmail,
    mObservacF COLLATE Latin1_General_CI_AS as mObservacF
FROM Fornecedores WITH (NOLOCK)
WHERE cNomeF IS NOT NULL AND cNomeF <> '';
    ";
    println!("Step B: Querying Fornecedores");
    let stream = client.query(query_fornecedores, &[]).await?;
    let db_rows_fornec = stream.into_first_result().await?;
    let mut suppliers_list = Vec::new();
    for row in db_rows_fornec {
        let cod_fornec: i32 = row.get(0).unwrap_or(0);
        if cod_fornec == 0 { continue; }
        suppliers_list.push(SupplierRow {
            cod_fornec,
            nome: row.get(1).unwrap_or("").trim().to_string(),
            contato: row.get(2).map(|s: &str| s.trim().to_string()),
            email: row.get(3).map(|s: &str| s.trim().to_string()),
            obs: row.get(4).map(|s: &str| s.trim().to_string()),
        });
    }

    // C. Query Insumos Items
    let query_insumos = "
SELECT 
    cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    cDescricao COLLATE Latin1_General_CI_AS as cDescricao,
    cUnidade COLLATE Latin1_General_CI_AS as cUnidade,
    cReferenciaNova COLLATE Latin1_General_CI_AS as cReferenciaNova,
    cCF COLLATE Latin1_General_CI_AS as cCF,
    cInativo COLLATE Latin1_General_CI_AS as cInativo
FROM Insumos WITH (NOLOCK)
WHERE cReferencia IS NOT NULL AND cReferencia <> '';
    ";
    println!("Step C: Querying Insumos");
    let stream = client.query(query_insumos, &[]).await?;
    let db_rows_insumos = stream.into_first_result().await?;
    let mut insumos_list = Vec::new();
    for row in db_rows_insumos {
        let code: &str = row.get(0).unwrap_or("");
        if code.is_empty() { continue; }
        let raw_inativo: Option<&str> = row.get(5);
        let is_ignored = if raw_inativo.map(|s| s.trim() == "S").unwrap_or(false) { 1 } else { 0 };
        insumos_list.push(InsumoRow {
            code: code.trim().to_string(),
            desc: row.get(1).unwrap_or("").trim().to_string(),
            unit: row.get(2).unwrap_or("UN").trim().to_string(),
            line: row.get(3).map(|s: &str| s.trim().to_string()),
            type_code: row.get(4).map(|s: &str| s.trim().to_string()),
            is_ignored,
        });
    }

    // C2. Query Materiais Items
    let query_materiais = "
SELECT 
    cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    cDescricao COLLATE Latin1_General_CI_AS as cDescricao,
    cUnidade COLLATE Latin1_General_CI_AS as cUnidade,
    cReferenciaNova COLLATE Latin1_General_CI_AS as cReferenciaNova,
    cCF COLLATE Latin1_General_CI_AS as cCF,
    cInativo COLLATE Latin1_General_CI_AS as cInativo
FROM Materiais WITH (NOLOCK)
WHERE cReferencia IS NOT NULL AND cReferencia <> '';
    ";
    println!("Step D: Querying Materiais");
    let stream = client.query(query_materiais, &[]).await?;
    let db_rows_materiais = stream.into_first_result().await?;
    let mut materiais_list = Vec::new();
    for row in db_rows_materiais {
        let code: &str = row.get(0).unwrap_or("");
        if code.is_empty() { continue; }
        let raw_inativo: Option<&str> = row.get(5);
        let is_ignored = if raw_inativo.map(|s| s.trim() == "S").unwrap_or(false) { 1 } else { 0 };
        materiais_list.push(MaterialRow {
            code: code.trim().to_string(),
            desc: row.get(1).unwrap_or("").trim().to_string(),
            unit: row.get(2).unwrap_or("UN").trim().to_string(),
            line: row.get(3).map(|s: &str| s.trim().to_string()),
            type_code: row.get(4).map(|s: &str| s.trim().to_string()),
            is_ignored,
        });
    }

    // D. Query Insumos Stocks & Snapshots
    let query_stocks = "
SELECT 
    cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    CAST(nQtdeEstoque AS FLOAT) as nQtdeEstoque,
    CAST(nqtdeReserva AS FLOAT) as nqtdeReserva,
    CAST(nQtdeProducao AS FLOAT) as nQtdeProducao,
    CAST(nQtdePedidos AS FLOAT) as nQtdePedidos
FROM Insumos WITH (NOLOCK)
WHERE cReferencia IS NOT NULL AND cReferencia <> '' AND (cInativo = 'N' OR cInativo IS NULL);
    ";
    println!("Step D1: Querying Insumos Stocks");
    let stream = client.query(query_stocks, &[]).await?;
    let db_rows_stocks = stream.into_first_result().await?;
    let mut stocks_list = Vec::new();
    for row in db_rows_stocks {
        let code: &str = row.get(0).unwrap_or("");
        if code.is_empty() { continue; }
        stocks_list.push(StockRow {
            code: code.trim().to_string(),
            stock_qty: row.get(1).unwrap_or(0.0),
            reserved_qty: row.get(2).unwrap_or(0.0),
            in_prod: row.get(3).unwrap_or(0.0),
            in_orders: row.get(4).unwrap_or(0.0),
        });
    }

    // D2. Query Materiais Stocks
    let query_mat_stocks = "
SELECT 
    cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    CAST(nQtdeEstoque AS FLOAT) as nQtdeEstoque,
    CAST(0.0 AS FLOAT) as nqtdeReserva,
    CAST(nQtdeProducao AS FLOAT) as nQtdeProducao,
    CAST(nQtdePedidos AS FLOAT) as nQtdePedidos
FROM Materiais WITH (NOLOCK)
WHERE cReferencia IS NOT NULL AND cReferencia <> '' AND (cInativo = 'N' OR cInativo IS NULL);
    ";
    println!("Step D2: Querying Materiais Stocks");
    let stream = client.query(query_mat_stocks, &[]).await?;
    let db_rows_mat_stocks = stream.into_first_result().await?;
    let mut mat_stocks_list = Vec::new();
    for row in db_rows_mat_stocks {
        let code: &str = row.get(0).unwrap_or("");
        if code.is_empty() { continue; }
        mat_stocks_list.push(StockRow {
            code: code.trim().to_string(),
            stock_qty: row.get(1).unwrap_or(0.0),
            reserved_qty: row.get(2).unwrap_or(0.0),
            in_prod: row.get(3).unwrap_or(0.0),
            in_orders: row.get(4).unwrap_or(0.0),
        });
    }

    // E. Query Invoices
    let query_invoices = "
SELECT 
    c.NOTA,
    c.CODIGO_PRODUTO COLLATE Latin1_General_CI_AS as CODIGO_PRODUTO,
    c.DESCRICAO_PRODUTO COLLATE Latin1_General_CI_AS as DESCRICAO_PRODUTO,
    c.UNIDADE COLLATE Latin1_General_CI_AS as UNIDADE,
    CAST(c.QUANTIDADE AS FLOAT) as QUANTIDADE,
    CAST(c.VALOR_UNITARIO AS FLOAT) as VALOR_UNITARIO,
    CAST(c.VALOR_TOTAL AS FLOAT) as VALOR_TOTAL,
    f.RAZAO_SOCIAL COLLATE Latin1_General_CI_AS as RAZAO_SOCIAL,
    c.nCodFornec,
    f.DATA_EMISSAO
FROM COMPRAS2 c WITH (NOLOCK)
LEFT JOIN COMPRAS1 f WITH (NOLOCK) ON c.nCodFornec = f.nCodFornec AND c.NOTA = f.NOTA
WHERE f.DATA_EMISSAO >= DATEADD(month, -12, GETDATE())
  AND c.CODIGO_PRODUTO IS NOT NULL AND c.CODIGO_PRODUTO <> '';
    ";
    println!("Step E: Querying Purchases");
    let stream = client.query(query_invoices, &[]).await?;
    let db_rows_invoices = stream.into_first_result().await?;
    let mut invoices_list = Vec::new();
    for row in db_rows_invoices {
        let nota: i32 = row.get(0).unwrap_or(0);
        let code: &str = row.get(1).unwrap_or("");
        if nota == 0 || code.is_empty() { continue; }
        let cod_fornec: i32 = row.get(8).unwrap_or(0);
        let supplier_id = if cod_fornec == 0 { None } else { Some(cod_fornec.to_string()) };
        let data_emissao: Option<NaiveDateTime> = row.get(9);
        let date_str = data_emissao.map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());
        invoices_list.push(InvoiceRow {
            nota,
            code: code.trim().to_string(),
            desc: row.get(2).map(|s: &str| s.trim().to_string()),
            unit: row.get(3).map(|s: &str| s.trim().to_string()),
            quantity: row.get(4).unwrap_or(0.0),
            unit_price: row.get(5).unwrap_or(0.0),
            total_value: row.get(6).unwrap_or(0.0),
            fornec_name: row.get(7).map(|s: &str| s.trim().to_string()),
            supplier_id,
            date_str,
        });
    }

    // F. Query Consumption
    let query_consumption = "
SELECT 
    c.CODIGO_PRODUTO COLLATE Latin1_General_CI_AS as CODIGO_PRODUTO,
    YEAR(f.DATA_EMISSAO) as Ano,
    CAST(SUM(c.QUANTIDADE) AS FLOAT) as TotalQtd,
    CAST(SUM(c.QUANTIDADE) / 12.0 AS FLOAT) as MediaMensal
FROM COMPRAS2 c WITH (NOLOCK)
LEFT JOIN COMPRAS1 f WITH (NOLOCK) ON c.nCodFornec = f.nCodFornec AND c.NOTA = f.NOTA
WHERE YEAR(f.DATA_EMISSAO) IN (2024, 2025, 2026)
  AND c.CODIGO_PRODUTO IS NOT NULL AND c.CODIGO_PRODUTO <> ''
GROUP BY c.CODIGO_PRODUTO, YEAR(f.DATA_EMISSAO);
    ";
    println!("Step F: Querying Consumption");
    let stream = client.query(query_consumption, &[]).await?;
    let db_rows_consumption = stream.into_first_result().await?;
    let mut consumption_list = Vec::new();
    for row in db_rows_consumption {
        let code: &str = row.get(0).unwrap_or("");
        let year: i32 = row.get(1).unwrap_or(0);
        if code.is_empty() || year == 0 { continue; }
        consumption_list.push(ConsumptionRow {
            code: code.trim().to_string(),
            year,
            total_qty: row.get(2).unwrap_or(0.0),
            monthly_avg: row.get(3).unwrap_or(0.0),
        });
    }

    // G. Query Formulations (Composicao table)
    let query_formulations = "
SELECT 
    c.cCodProd COLLATE Latin1_General_CI_AS as cCodProd,
    c.cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    c.cDescricao COLLATE Latin1_General_CI_AS as cDescricao,
    CAST(c.nQuantidade AS FLOAT) as nQuantidade,
    CAST(c.NPERCENTUAL AS FLOAT) as NPERCENTUAL
FROM Composicao c WITH (NOLOCK)
WHERE c.cCodProd IS NOT NULL AND c.cReferencia IS NOT NULL;
    ";
    println!("Step G: Querying Formulations");
    let stream = client.query(query_formulations, &[]).await?;
    let db_rows_formulations = stream.into_first_result().await?;
    let mut formulations_list = Vec::new();
    for row in db_rows_formulations {
        let product_code: &str = row.get(0).unwrap_or("");
        let ingredient_code: &str = row.get(1).unwrap_or("");
        if product_code.is_empty() || ingredient_code.is_empty() { continue; }
        formulations_list.push(FormulationRow {
            product_code: product_code.trim().to_string(),
            ingredient_code: ingredient_code.trim().to_string(),
            description: row.get(2).map(|s: &str| s.trim().to_string()),
            quantity: row.get(3).unwrap_or(0.0),
            percentage: row.get(4),
        });
    }

    // H. Query Lotes (Production logs for Finished Goods)
    let query_lotes = "
SELECT 
    l.nLote,
    l.cCodProd COLLATE Latin1_General_CI_AS as cCodProd,
    CAST(l.nQtde AS FLOAT) as nQtde,
    CONVERT(varchar, l.dLote, 120) COLLATE Latin1_General_CI_AS as dLote,
    l.cStatus COLLATE Latin1_General_CI_AS as cStatus,
    l.cFabricadopor COLLATE Latin1_General_CI_AS as cFabricadopor,
    l.cAutorizadopor COLLATE Latin1_General_CI_AS as cAutorizadopor
FROM Lotes l WITH (NOLOCK)
WHERE l.dLote >= DATEADD(month, -12, GETDATE())
  AND l.cCodProd IS NOT NULL AND l.cCodProd <> '';
    ";
    println!("Step H: Querying Lotes");
    let stream = client.query(query_lotes, &[]).await?;
    let db_rows_lotes = stream.into_first_result().await?;
    let mut lotes_list = Vec::new();
    for row in db_rows_lotes {
        let lote: i32 = row.get(0).unwrap_or(0);
        let product_code: &str = row.get(1).unwrap_or("");
        let d_lote: Option<&str> = row.get(3);
        if lote == 0 || product_code.is_empty() || d_lote.is_none() { continue; }
        lotes_list.push(LoteRow {
            lote,
            product_code: product_code.trim().to_string(),
            qty: row.get(2).unwrap_or(0.0),
            date_str: d_lote.unwrap().to_string(),
            status: row.get(4).map(|s: &str| s.trim().to_string()),
            fab: row.get(5).map(|s: &str| s.trim().to_string()),
            aut: row.get(6).map(|s: &str| s.trim().to_string()),
        });
    }

    // I. Query Lotes_Baixas (Insumo exits logs)
    let query_lotes_baixas = "
SELECT 
    b.Registro,
    b.nLote,
    b.cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    CAST(b.nQtde AS FLOAT) as nQtde,
    CONVERT(varchar, b.dLog, 120) COLLATE Latin1_General_CI_AS as dLog,
    b.cUsuario COLLATE Latin1_General_CI_AS as cUsuario,
    b.cJustificativa COLLATE Latin1_General_CI_AS as cJustificativa,
    b.cCodProd COLLATE Latin1_General_CI_AS as cCodProd
FROM Lotes_Baixas b WITH (NOLOCK)
WHERE b.dLog >= DATEADD(month, -12, GETDATE())
  AND b.cReferencia IS NOT NULL AND b.cReferencia <> '';
    ";
    println!("Step I: Querying Lotes Baixas");
    let stream = client.query(query_lotes_baixas, &[]).await?;
    let db_rows_baixas = stream.into_first_result().await?;
    let mut lotes_baixas_list = Vec::new();
    for row in db_rows_baixas {
        let registro: i32 = row.get(0).unwrap_or(0);
        let ref_code: &str = row.get(2).unwrap_or("");
        let d_log: Option<&str> = row.get(4);
        if registro == 0 || ref_code.is_empty() || d_log.is_none() { continue; }
        lotes_baixas_list.push(LoteBaixaRow {
            registro,
            lote: row.get(1).unwrap_or(0),
            ref_code: ref_code.trim().to_string(),
            qty: row.get(3).unwrap_or(0.0),
            date_str: d_log.unwrap().to_string(),
            user: row.get(5).map(|s: &str| s.trim().to_string()),
            just: row.get(6).map(|s: &str| s.trim().to_string()),
            prod_code: row.get(7).map(|s: &str| s.trim().to_string()),
        });
    }

    // J. Query Vendas (Product sales logs)
    let query_vendas = "
SELECT 
    v2.nRegistro,
    v2.nVenda,
    v2.cCodProd COLLATE Latin1_General_CI_AS as cCodProd,
    CAST(v2.nQtde AS FLOAT) as nQtde,
    CONVERT(varchar, v2.dVenda, 120) COLLATE Latin1_General_CI_AS as dVenda,
    v1.cNome COLLATE Latin1_General_CI_AS as cNome,
    v2.nNotaFiscal
FROM VENDAS2 v2 WITH (NOLOCK)
INNER JOIN VENDAS1 v1 WITH (NOLOCK) ON v2.nVenda = v1.nVenda AND CAST(v2.dVenda AS DATE) = CAST(v1.dVenda AS DATE)
WHERE v2.dVenda >= DATEADD(month, -12, GETDATE())
  AND v2.cCodProd IS NOT NULL AND v2.cCodProd <> '';
    ";
    println!("Step J: Querying Vendas");
    let stream = client.query(query_vendas, &[]).await?;
    let db_rows_vendas = stream.into_first_result().await?;
    let mut vendas_list = Vec::new();
    for row in db_rows_vendas {
        let registro: i32 = row.get(0).unwrap_or(0);
        let prod_code: &str = row.get(2).unwrap_or("");
        let d_venda: Option<&str> = row.get(4);
        if registro == 0 || prod_code.is_empty() || d_venda.is_none() { continue; }
        vendas_list.push(VendaRow {
            registro,
            venda: row.get(1).unwrap_or(0),
            prod_code: prod_code.trim().to_string(),
            qty: row.get(3).unwrap_or(0.0),
            date_str: d_venda.unwrap().to_string(),
            client_name: row.get(5).map(|s: &str| s.trim().to_string()),
            nota_fiscal: row.get(6),
        });
    }

    // ==========================================
    // 2. OPEN TRANSACTION AND WRITE TO SQLITE (NO AWAIT POINTS)
    // ==========================================
    let mut sqlite_conn = Connection::open(sqlite_path)?;
    sqlite_conn.execute("PRAGMA foreign_keys = OFF", [])?;
    let tx = sqlite_conn.transaction()?;

    // Write Products
    let mut count_prod = 0;
    let mut synced_prod_codes = HashSet::new();

    for p in products_list {
        let prefix = get_linha_prefix(&p.codigo);

        tx.execute(
            "INSERT INTO produtos (codigo, descricao, linha_prefix, base, media_levantamento)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(codigo) DO UPDATE SET
                descricao = excluded.descricao,
                linha_prefix = excluded.linha_prefix,
                base = excluded.base,
                media_levantamento = excluded.media_levantamento",
            params![p.codigo, p.descricao, prefix, p.base, p.media_lev()],
        )?;

        tx.execute(
            "INSERT INTO estoque_atual (codigo, estoque, producao, pedidos_aberto, fase)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(codigo) DO UPDATE SET
                estoque = excluded.estoque,
                producao = excluded.producao,
                pedidos_aberto = excluded.pedidos_aberto,
                fase = excluded.fase",
            params![p.codigo, p.estoque, p.producao, p.pedidos, p.fase],
        )?;

        tx.execute("DELETE FROM historico_faturamento WHERE codigo = ?1", params![p.codigo])?;

        for mes in 1..=12 {
            let quantidade = p.m_sales[mes - 1];
            tx.execute(
                "INSERT INTO historico_faturamento (codigo, mes, quantidade)
                 VALUES (?1, ?2, ?3)",
                params![p.codigo, mes, quantidade],
            )?;
        }

        synced_prod_codes.insert(p.codigo.clone());
        count_prod += 1;
    }

    // Zero out old products no longer in ERP
    let db_prod_codes: Vec<String> = {
        let mut stmt = tx.prepare("SELECT codigo FROM estoque_atual")?;
        let codes: Vec<String> = stmt.query_map([], |r| r.get::<_, String>(0))?
            .filter_map(|r| r.ok())
            .collect();
        codes
    };

    for code in db_prod_codes {
        if !synced_prod_codes.contains(&code) {
            tx.execute(
                "UPDATE estoque_atual SET estoque = 0, producao = 0, pedidos_aberto = 0 WHERE codigo = ?1",
                params![code],
            )?;
        }
    }

    // Write Suppliers
    let mut count_fornec = 0;
    let mut existing_suppliers = std::collections::HashMap::new();
    {
        let mut stmt = tx.prepare("SELECT id, name FROM suppliers")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        for r in rows {
            if let Ok((id, name)) = r {
                existing_suppliers.insert(name, id);
            }
        }
    }

    let mut current_names = std::collections::HashSet::new();
    for s in suppliers_list {
        let id_str = s.cod_fornec.to_string();
        let mut unique_name = s.nome.clone();
        
        while (existing_suppliers.contains_key(&unique_name) && existing_suppliers.get(&unique_name) != Some(&id_str))
           || current_names.contains(&unique_name) 
        {
            unique_name = format!("{} (ID: {})", s.nome, id_str);
            if current_names.contains(&unique_name) || (existing_suppliers.contains_key(&unique_name) && existing_suppliers.get(&unique_name) != Some(&id_str)) {
                unique_name = format!("{} (ID: {}-dup)", s.nome, id_str);
                break;
            }
        }
        
        existing_suppliers.insert(unique_name.clone(), id_str.clone());
        current_names.insert(unique_name.clone());

        tx.execute(
            "INSERT INTO suppliers (id, name, contact, email, notes)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                contact = excluded.contact,
                email = excluded.email,
                notes = excluded.notes",
            params![id_str, unique_name, s.contato, s.email, s.obs],
        )?;
        count_fornec += 1;
    }

    // Write Insumos Items
    let mut count_items = 0;
    for item in insumos_list {
        let category_id = if item.code.starts_with("9.15.") { "cat_mp" } else { "cat_emb" };
        tx.execute(
            "INSERT INTO items (code, description, unit, category_id, line, type, is_ignored)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(code) DO UPDATE SET
                description = excluded.description,
                unit = excluded.unit,
                category_id = excluded.category_id,
                line = excluded.line,
                type = excluded.type,
                is_ignored = excluded.is_ignored,
                updated_at = CURRENT_TIMESTAMP",
            params![item.code, item.desc, item.unit, category_id, item.line, item.type_code, item.is_ignored],
        )?;
        count_items += 1;
    }

    // Write Materiais Items
    for item in materiais_list {
        tx.execute(
            "INSERT INTO items (code, description, unit, category_id, line, type, is_ignored)
             VALUES (?1, ?2, ?3, 'cat_mat', ?4, ?5, ?6)
             ON CONFLICT(code) DO UPDATE SET
                description = excluded.description,
                unit = excluded.unit,
                category_id = excluded.category_id,
                line = excluded.line,
                type = excluded.type,
                is_ignored = excluded.is_ignored,
                updated_at = CURRENT_TIMESTAMP",
            params![item.code, item.desc, item.unit, item.line, item.type_code, item.is_ignored],
        )?;
        count_items += 1;
    }

    // Write Stock Snapshots (Insumos + Materiais)
    let mut count_snapshots = 0;
    let total_snapshots = stocks_list.len() + mat_stocks_list.len();
    if total_snapshots > 0 {
        let stock_import_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO stock_imports (id, filename, source, item_count) 
             VALUES (?1, 'SQL Server Sync', 'ERP', ?2)",
            params![stock_import_id, total_snapshots as i32],
        )?;

        // Write Insumos stock
        for stk in stocks_list {
            let snapshot_id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO stock_snapshots (id, import_id, item_code, stock_qty, reserved_qty, in_production, in_orders)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![snapshot_id, stock_import_id, stk.code, stk.stock_qty, stk.reserved_qty, stk.in_prod, stk.in_orders],
            )?;
            count_snapshots += 1;
        }

        // Write Materiais stock
        for stk in mat_stocks_list {
            let snapshot_id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO stock_snapshots (id, import_id, item_code, stock_qty, reserved_qty, in_production, in_orders)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![snapshot_id, stock_import_id, stk.code, stk.stock_qty, stk.reserved_qty, stk.in_prod, stk.in_orders],
            )?;
            count_snapshots += 1;
        }
    }

    // Write Invoices
    let mut count_invoices = 0;
    for inv in invoices_list.clone() {
        let nota_str = inv.nota.to_string();
        let invoice_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO invoices (id, invoice_number, item_code, description, unit, quantity, unit_price, total_value, supplier_name, supplier_id, invoice_date)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(invoice_number, item_code) DO UPDATE SET
                description = excluded.description,
                unit = excluded.unit,
                quantity = excluded.quantity,
                unit_price = excluded.unit_price,
                total_value = excluded.total_value,
                supplier_name = excluded.supplier_name,
                supplier_id = excluded.supplier_id,
                invoice_date = excluded.invoice_date",
            params![invoice_id, nota_str, inv.code, inv.desc, inv.unit, inv.quantity, inv.unit_price, inv.total_value, inv.fornec_name, inv.supplier_id, inv.date_str],
        )?;
        count_invoices += 1;
    }

    // Write Consumption
    let mut count_consumption = 0;
    for c in consumption_list {
        let consumption_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO consumption (id, item_code, year, total_qty, monthly_avg)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(item_code, year) DO UPDATE SET
                total_qty = excluded.total_qty,
                monthly_avg = excluded.monthly_avg,
                imported_at = CURRENT_TIMESTAMP",
            params![consumption_id, c.code, c.year, c.total_qty, c.monthly_avg],
        )?;
        count_consumption += 1;
    }

    // Write Formulations
    let mut count_formulations = 0;
    tx.execute("DELETE FROM formulations", [])?;
    for f in formulations_list {
        tx.execute(
            "INSERT INTO formulations (product_code, ingredient_code, description, quantity, percentage)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(product_code, ingredient_code) DO UPDATE SET
                description = excluded.description,
                quantity = excluded.quantity,
                percentage = excluded.percentage",
            params![f.product_code, f.ingredient_code, f.description, f.quantity, f.percentage],
        )?;
        count_formulations += 1;
    }

    // Write Stock Movements (Unified)
    let mut count_movements = 0;
    tx.execute("DELETE FROM stock_movements", [])?;

    // 1. Purchases entries
    for inv in invoices_list {
        let mov_id = Uuid::new_v4().to_string();
        let item_type = if inv.code.starts_with("9.15.") { "insumo" } else { "material" };
        let date_clean = inv.date_str.as_deref().unwrap_or("");
        tx.execute(
            "INSERT INTO stock_movements (id, item_code, item_type, movement_type, quantity, date, document_number, details)
             VALUES (?1, ?2, ?3, 'entrada', ?4, ?5, ?6, ?7)",
            params![mov_id, inv.code, item_type, inv.quantity, date_clean, inv.nota.to_string(), inv.fornec_name],
        )?;
        count_movements += 1;
    }

    // 2. Insumo exits (Lotes_Baixas)
    for b in lotes_baixas_list {
        let mov_id = Uuid::new_v4().to_string();
        let details = format!("OP: {} | Usuário: {} | Justificativa: {}", b.lote, b.user.as_deref().unwrap_or(""), b.just.as_deref().unwrap_or(""));
        tx.execute(
            "INSERT INTO stock_movements (id, item_code, item_type, movement_type, quantity, date, document_number, details)
             VALUES (?1, ?2, 'insumo', 'saida', ?3, ?4, ?5, ?6)",
            params![mov_id, b.ref_code, b.qty, b.date_str, b.lote.to_string(), details],
        )?;
        count_movements += 1;
    }

    // 3. Product entries (Lotes / Production runs)
    for l in lotes_list {
        let mov_id = Uuid::new_v4().to_string();
        let details = format!("Status: {} | Fab: {} | Aut: {}", l.status.as_deref().unwrap_or(""), l.fab.as_deref().unwrap_or(""), l.aut.as_deref().unwrap_or(""));
        tx.execute(
            "INSERT INTO stock_movements (id, item_code, item_type, movement_type, quantity, date, document_number, details)
             VALUES (?1, ?2, 'produto', 'entrada', ?3, ?4, ?5, ?6)",
            params![mov_id, l.product_code, l.qty, l.date_str, l.lote.to_string(), details],
        )?;
        count_movements += 1;
    }

    // 4. Product exits (Vendas)
    for v in vendas_list {
        let mov_id = Uuid::new_v4().to_string();
        let doc_str = v.nota_fiscal.map(|n| n.to_string()).unwrap_or_else(|| format!("Pedido: {}", v.venda));
        tx.execute(
            "INSERT INTO stock_movements (id, item_code, item_type, movement_type, quantity, date, document_number, details)
             VALUES (?1, ?2, 'produto', 'saida', ?3, ?4, ?5, ?6)",
            params![mov_id, v.prod_code, v.qty, v.date_str, doc_str, v.client_name],
        )?;
        count_movements += 1;
    }

    tx.commit()?;
    let _ = sqlite_conn.execute("PRAGMA foreign_keys = ON", []);

    Ok(SyncResult {
        products: count_prod,
        suppliers: count_fornec,
        items: count_items,
        snapshots: count_snapshots,
        invoices: count_invoices,
        consumption: count_consumption,
        formulations: count_formulations,
        movements: count_movements,
    })
}

impl ProductRow {
    fn media_lev(&self) -> f64 {
        let total: i32 = self.m_sales.iter().sum();
        (total as f64) / 12.0
    }
}

// ==========================================
// 3. LIGHTWEIGHT DATABASE COPY / DUMP UTILITY
// ==========================================
pub async fn create_database_dump(sqlite_path: &str) -> anyhow::Result<crate::models::DbDumpResult> {
    let start_time = std::time::Instant::now();
    let mut client = connect_sql_server(None).await?;
    
    // ==========================================
    // 1. FETCH ALL DATA FROM SQL SERVER FIRST (AWAIT POINTS)
    // ==========================================

    // A. Dump Insumos
    let insumos_rows = {
        let stream = client.query("
            SELECT 
                cReferencia COLLATE Latin1_General_CI_AS,
                cDescricao COLLATE Latin1_General_CI_AS,
                cUnidade COLLATE Latin1_General_CI_AS,
                cReferenciaNova COLLATE Latin1_General_CI_AS,
                cCF COLLATE Latin1_General_CI_AS,
                CAST(nQtdeEstoque AS FLOAT),
                CAST(nqtdeReserva AS FLOAT),
                CAST(nQtdeProducao AS FLOAT),
                CAST(nQtdePedidos AS FLOAT),
                cInativo COLLATE Latin1_General_CI_AS
            FROM Insumos WITH (NOLOCK)", 
            &[]
        ).await?;
        stream.into_first_result().await?
    };

    // B. Dump Produtos
    let produtos_rows = {
        let stream = client.query("
            SELECT 
                cCodProd COLLATE Latin1_General_CI_AS,
                cNomeProd COLLATE Latin1_General_CI_AS,
                cunidade COLLATE Latin1_General_CI_AS,
                cInativo COLLATE Latin1_General_CI_AS,
                CAST(nQtdeEstoque AS FLOAT),
                CAST(nQtdeProducao AS FLOAT),
                CAST(nPedidos AS FLOAT),
                cBase COLLATE Latin1_General_CI_AS,
                cNomeTipo COLLATE Latin1_General_CI_AS
            FROM Produtos WITH (NOLOCK)", 
            &[]
        ).await?;
        stream.into_first_result().await?
    };

    // C. Dump Materiais
    let materiais_rows = {
        let stream = client.query("
            SELECT 
                cReferencia COLLATE Latin1_General_CI_AS,
                cDescricao COLLATE Latin1_General_CI_AS,
                cUnidade COLLATE Latin1_General_CI_AS,
                cReferenciaNova COLLATE Latin1_General_CI_AS,
                cCF COLLATE Latin1_General_CI_AS,
                CAST(nQtdeEstoque AS FLOAT),
                CAST(0.0 AS FLOAT),
                CAST(nQtdeProducao AS FLOAT),
                CAST(nQtdePedidos AS FLOAT),
                cInativo COLLATE Latin1_General_CI_AS
            FROM Materiais WITH (NOLOCK)", 
            &[]
        ).await?;
        stream.into_first_result().await?
    };

    // D. Dump Composicao
    let composicao_rows = {
        let stream = client.query("
            SELECT 
                cCodProd COLLATE Latin1_General_CI_AS,
                cReferencia COLLATE Latin1_General_CI_AS,
                cDescricao COLLATE Latin1_General_CI_AS,
                CAST(nQuantidade AS FLOAT),
                CAST(NPERCENTUAL AS FLOAT)
            FROM Composicao WITH (NOLOCK)", 
            &[]
        ).await?;
        stream.into_first_result().await?
    };

    // E. Dump Fornecedores
    let fornecedores_rows = {
        let stream = client.query("SELECT nCodFornec, cNomeF COLLATE Latin1_General_CI_AS, cContatoF COLLATE Latin1_General_CI_AS, cEmail COLLATE Latin1_General_CI_AS, mObservacF COLLATE Latin1_General_CI_AS FROM Fornecedores WITH (NOLOCK)", &[]).await?;
        stream.into_first_result().await?
    };

    // F. Dump Clientes
    let clientes_rows = {
        let stream = client.query("SELECT nCodigo, cNome COLLATE Latin1_General_CI_AS FROM Clientes WITH (NOLOCK)", &[]).await?;
        stream.into_first_result().await?
    };

    // G. Dump Lotes
    let lotes_rows = {
        let stream = client.query("
            SELECT 
                nLote,
                cCodProd COLLATE Latin1_General_CI_AS,
                CAST(nQtde AS FLOAT),
                CONVERT(varchar, dLote, 120) COLLATE Latin1_General_CI_AS,
                cStatus COLLATE Latin1_General_CI_AS,
                cFabricadopor COLLATE Latin1_General_CI_AS,
                cAutorizadopor COLLATE Latin1_General_CI_AS
            FROM Lotes WITH (NOLOCK)
            WHERE dLote >= DATEADD(month, -24, GETDATE())", 
            &[]
        ).await?;
        stream.into_first_result().await?
    };

    // H. Dump Baixas
    let baixas_rows = {
        let stream = client.query("
            SELECT 
                Registro,
                nLote,
                cReferencia COLLATE Latin1_General_CI_AS,
                CAST(nQtde AS FLOAT),
                CONVERT(varchar, dLog, 120) COLLATE Latin1_General_CI_AS,
                cUsuario COLLATE Latin1_General_CI_AS,
                cJustificativa COLLATE Latin1_General_CI_AS,
                cCodProd COLLATE Latin1_General_CI_AS
            FROM Lotes_Baixas WITH (NOLOCK)
            WHERE dLog >= DATEADD(month, -24, GETDATE())", 
            &[]
        ).await?;
        stream.into_first_result().await?
    };

    // I. Dump Compras1
    let compras1_rows = {
        let stream = client.query("
            SELECT
                NOTA,
                CONVERT(varchar, DATA_EMISSAO, 120) COLLATE Latin1_General_CI_AS,
                RAZAO_SOCIAL COLLATE Latin1_General_CI_AS,
                nCodFornec 
            FROM COMPRAS1 WITH (NOLOCK)
            WHERE DATA_EMISSAO >= DATEADD(month, -24, GETDATE())", 
            &[]
        ).await?;
        stream.into_first_result().await?
    };

    // J. Dump Compras2
    let compras2_rows = {
        let stream = client.query("
            SELECT 
                c.NOTA,
                c.nCodFornec,
                c.CODIGO_PRODUTO COLLATE Latin1_General_CI_AS,
                c.DESCRICAO_PRODUTO COLLATE Latin1_General_CI_AS,
                c.UNIDADE COLLATE Latin1_General_CI_AS,
                CAST(c.QUANTIDADE AS FLOAT),
                CAST(c.VALOR_UNITARIO AS FLOAT),
                CAST(c.VALOR_TOTAL AS FLOAT)
            FROM COMPRAS2 c WITH (NOLOCK)
            WHERE c.nCodFornec IS NOT NULL 
              AND c.NOTA IN (
                  SELECT NOTA FROM COMPRAS1 WITH (NOLOCK) WHERE DATA_EMISSAO >= DATEADD(month, -24, GETDATE())
              )", 
            &[]
        ).await?;
        stream.into_first_result().await?
    };

    // K. Dump Vendas1
    let vendas1_rows = {
        let stream = client.query("
            SELECT
                nVenda,
                CONVERT(varchar, dVenda, 120) COLLATE Latin1_General_CI_AS,
                cNome COLLATE Latin1_General_CI_AS,
                NNOTAFISCAL 
            FROM VENDAS1 WITH (NOLOCK)
            WHERE dVenda >= DATEADD(month, -24, GETDATE())", 
            &[]
        ).await?;
        stream.into_first_result().await?
    };

    // L. Dump Vendas2
    let vendas2_rows = {
        let stream = client.query("
            SELECT 
                nRegistro,
                nVenda,
                CONVERT(varchar, dVenda, 120) COLLATE Latin1_General_CI_AS,
                cCodProd COLLATE Latin1_General_CI_AS,
                nQtde,
                CAST(nPreco AS FLOAT),
                CAST(nValor AS FLOAT),
                nNotaFiscal,
                cLote COLLATE Latin1_General_CI_AS
            FROM VENDAS2 WITH (NOLOCK)
            WHERE dVenda >= DATEADD(month, -24, GETDATE())", 
            &[]
        ).await?;
        stream.into_first_result().await?
    };

    // ==========================================
    // 2. OPEN TRANSACTION AND WRITE TO SQLITE (NO AWAIT POINTS)
    // ==========================================
    let mut sqlite_conn = Connection::open(sqlite_path)?;
    sqlite_conn.execute("PRAGMA foreign_keys = OFF", [])?;
    let _ = sqlite_conn.query_row("PRAGMA journal_mode = WAL", [], |_| Ok(()));
    sqlite_conn.execute("PRAGMA synchronous = NORMAL", [])?;
    
    let mut tables_copied = Vec::new();

    // 1. Write Insumos
    {
        let tx = sqlite_conn.transaction()?;
        tx.execute("DROP TABLE IF EXISTS insumos", [])?;
        tx.execute(
            "CREATE TABLE insumos (
                cReferencia TEXT PRIMARY KEY,
                cDescricao TEXT,
                cUnidade TEXT,
                cReferenciaNova TEXT,
                cCF TEXT,
                nQtdeEstoque REAL,
                nqtdeReserva REAL,
                nQtdeProducao REAL,
                nQtdePedidos REAL,
                cInativo TEXT
            )",
            [],
        )?;
        for row in insumos_rows {
            let ref_code: &str = row.get(0).unwrap_or("");
            if ref_code.is_empty() { continue; }
            tx.execute(
                "INSERT INTO insumos VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    ref_code.trim(),
                    row.get::<&str, _>(1).map(|s| s.trim()),
                    row.get::<&str, _>(2).map(|s| s.trim()),
                    row.get::<&str, _>(3).map(|s| s.trim()),
                    row.get::<&str, _>(4).map(|s| s.trim()),
                    row.get::<f64, _>(5),
                    row.get::<f64, _>(6),
                    row.get::<f64, _>(7),
                    row.get::<f64, _>(8),
                    row.get::<&str, _>(9).map(|s| s.trim())
                ]
            )?;
        }
        tx.commit()?;
    }
    tables_copied.push("Insumos".to_string());

    // 2. Write Produtos
    {
        let tx = sqlite_conn.transaction()?;
        tx.execute("DROP TABLE IF EXISTS produtos", [])?;
        tx.execute(
            "CREATE TABLE produtos (
                cCodProd TEXT PRIMARY KEY,
                cNomeProd TEXT,
                cUnidade TEXT,
                cInativo TEXT,
                nQtdeEstoque REAL,
                nQtdeProducao REAL,
                nPedidos REAL,
                cBase TEXT,
                cNomeTipo TEXT
            )",
            [],
        )?;
        for row in produtos_rows {
            let code: &str = row.get(0).unwrap_or("");
            if code.is_empty() { continue; }
            tx.execute(
                "INSERT INTO produtos VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    code.trim(),
                    row.get::<&str, _>(1).map(|s| s.trim()),
                    row.get::<&str, _>(2).map(|s| s.trim()),
                    row.get::<&str, _>(3).map(|s| s.trim()),
                    row.get::<f64, _>(4),
                    row.get::<f64, _>(5),
                    row.get::<f64, _>(6),
                    row.get::<&str, _>(7).map(|s| s.trim()),
                    row.get::<&str, _>(8).map(|s| s.trim())
                ]
            )?;
        }
        tx.commit()?;
    }
    tables_copied.push("Produtos".to_string());

    // 3. Write Materiais
    {
        let tx = sqlite_conn.transaction()?;
        tx.execute("DROP TABLE IF EXISTS materiais", [])?;
        tx.execute(
            "CREATE TABLE materiais (
                cReferencia TEXT PRIMARY KEY,
                cDescricao TEXT,
                cUnidade TEXT,
                cReferenciaNova TEXT,
                cCF TEXT,
                nQtdeEstoque REAL,
                nqtdeReserva REAL,
                nQtdeProducao REAL,
                nQtdePedidos REAL,
                cInativo TEXT
            )",
            [],
        )?;
        for row in materiais_rows {
            let ref_code: &str = row.get(0).unwrap_or("");
            if ref_code.is_empty() { continue; }
            tx.execute(
                "INSERT INTO materiais VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    ref_code.trim(),
                    row.get::<&str, _>(1).map(|s| s.trim()),
                    row.get::<&str, _>(2).map(|s| s.trim()),
                    row.get::<&str, _>(3).map(|s| s.trim()),
                    row.get::<&str, _>(4).map(|s| s.trim()),
                    row.get::<f64, _>(5),
                    row.get::<f64, _>(6),
                    row.get::<f64, _>(7),
                    row.get::<f64, _>(8),
                    row.get::<&str, _>(9).map(|s| s.trim())
                ]
            )?;
        }
        tx.commit()?;
    }
    tables_copied.push("Materiais".to_string());

    // 4. Write Composicao
    {
        let tx = sqlite_conn.transaction()?;
        tx.execute("DROP TABLE IF EXISTS composicao", [])?;
        tx.execute(
            "CREATE TABLE composicao (
                cCodProd TEXT,
                cReferencia TEXT,
                cDescricao TEXT,
                nQuantidade REAL,
                nPercentual REAL,
                PRIMARY KEY (cCodProd, cReferencia)
            )",
            [],
        )?;
        for row in composicao_rows {
            let p_code: &str = row.get(0).unwrap_or("");
            let r_code: &str = row.get(1).unwrap_or("");
            if p_code.is_empty() || r_code.is_empty() { continue; }
            let _ = tx.execute(
                "INSERT OR IGNORE INTO composicao VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    p_code.trim(),
                    r_code.trim(),
                    row.get::<&str, _>(2).map(|s| s.trim()),
                    row.get::<f64, _>(3),
                    row.get::<f64, _>(4)
                ]
            );
        }
        tx.commit()?;
    }
    tables_copied.push("Composicao".to_string());

    // 5. Write Fornecedores
    {
        let tx = sqlite_conn.transaction()?;
        tx.execute("DROP TABLE IF EXISTS fornecedores", [])?;
        tx.execute(
            "CREATE TABLE fornecedores (
                nCodFornec INTEGER PRIMARY KEY,
                cNomeF TEXT,
                cContatoF TEXT,
                cEmail TEXT,
                mObservacF TEXT
            )",
            [],
        )?;
        for row in fornecedores_rows {
            let id: i32 = row.get(0).unwrap_or(0);
            if id == 0 { continue; }
            tx.execute(
                "INSERT INTO fornecedores VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    id,
                    row.get::<&str, _>(1).map(|s| s.trim()),
                    row.get::<&str, _>(2).map(|s| s.trim()),
                    row.get::<&str, _>(3).map(|s| s.trim()),
                    row.get::<&str, _>(4).map(|s| s.trim())
                ]
            )?;
        }
        tx.commit()?;
    }
    tables_copied.push("Fornecedores".to_string());

    // 6. Write Clientes
    {
        let tx = sqlite_conn.transaction()?;
        tx.execute("DROP TABLE IF EXISTS clientes", [])?;
        tx.execute(
            "CREATE TABLE clientes (
                nCodigo INTEGER PRIMARY KEY,
                cNome TEXT
            )",
            [],
        )?;
        for row in clientes_rows {
            let code: i32 = row.get(0).unwrap_or(0);
            if code == 0 { continue; }
            tx.execute(
                "INSERT INTO clientes VALUES (?1, ?2)",
                params![code, row.get::<&str, _>(1).map(|s| s.trim())]
            )?;
        }
        tx.commit()?;
    }
    tables_copied.push("Clientes".to_string());

    // 7. Write Lotes
    {
        let tx = sqlite_conn.transaction()?;
        tx.execute("DROP TABLE IF EXISTS lotes", [])?;
        tx.execute(
            "CREATE TABLE lotes (
                nLote INTEGER PRIMARY KEY,
                cCodProd TEXT,
                nQtde REAL,
                dLote TEXT,
                cStatus TEXT,
                cFabricadopor TEXT,
                cAutorizadopor TEXT
            )",
            [],
        )?;
        for row in lotes_rows {
            let id: i32 = row.get(0).unwrap_or(0);
            if id == 0 { continue; }
            tx.execute(
                "INSERT INTO lotes VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    id,
                    row.get::<&str, _>(1).map(|s| s.trim()),
                    row.get::<f64, _>(2),
                    row.get::<&str, _>(3),
                    row.get::<&str, _>(4).map(|s| s.trim()),
                    row.get::<&str, _>(5).map(|s| s.trim()),
                    row.get::<&str, _>(6).map(|s| s.trim())
                ]
            )?;
        }
        tx.commit()?;
    }
    tables_copied.push("Lotes".to_string());

    // 8. Write Baixas
    {
        let tx = sqlite_conn.transaction()?;
        tx.execute("DROP TABLE IF EXISTS lotes_baixas", [])?;
        tx.execute(
            "CREATE TABLE lotes_baixas (
                Registro INTEGER PRIMARY KEY,
                nLote INTEGER,
                cReferencia TEXT,
                nQtde REAL,
                dLog TEXT,
                cUsuario TEXT,
                cJustificativa TEXT,
                cCodProd TEXT
            )",
            [],
        )?;
        for row in baixas_rows {
            let reg: i32 = row.get(0).unwrap_or(0);
            if reg == 0 { continue; }
            tx.execute(
                "INSERT INTO lotes_baixas VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    reg,
                    row.get::<i32, _>(1),
                    row.get::<&str, _>(2).map(|s| s.trim()),
                    row.get::<f64, _>(3),
                    row.get::<&str, _>(4),
                    row.get::<&str, _>(5).map(|s| s.trim()),
                    row.get::<&str, _>(6).map(|s| s.trim()),
                    row.get::<&str, _>(7).map(|s| s.trim())
                ]
            )?;
        }
        tx.commit()?;
    }
    tables_copied.push("Lotes_Baixas".to_string());

    // 9. Write Compras1
    {
        let tx = sqlite_conn.transaction()?;
        tx.execute("DROP TABLE IF EXISTS compras1", [])?;
        tx.execute(
            "CREATE TABLE compras1 (
                Nota INTEGER,
                DataEmissao TEXT,
                RazaoSocial TEXT,
                nCodFornec INTEGER,
                PRIMARY KEY (Nota, nCodFornec)
            )",
            [],
        )?;
        for row in compras1_rows {
            let nota: i32 = row.get(0).unwrap_or(0);
            let cod_fornec: i32 = row.get(3).unwrap_or(0);
            if nota == 0 || cod_fornec == 0 { continue; }
            let _ = tx.execute(
                "INSERT OR IGNORE INTO compras1 VALUES (?1, ?2, ?3, ?4)",
                params![
                    nota,
                    row.get::<&str, _>(1),
                    row.get::<&str, _>(2).map(|s| s.trim()),
                    cod_fornec
                ]
            );
        }
        tx.commit()?;
    }
    tables_copied.push("COMPRAS1".to_string());

    // 10. Write Compras2
    {
        let tx = sqlite_conn.transaction()?;
        tx.execute("DROP TABLE IF EXISTS compras2", [])?;
        tx.execute(
            "CREATE TABLE compras2 (
                Nota INTEGER,
                nCodFornec INTEGER,
                CodigoProduto TEXT,
                DescricaoProduto TEXT,
                Unidade TEXT,
                Quantidade REAL,
                ValorUnitario REAL,
                ValorTotal REAL
            )",
            [],
        )?;
        for row in compras2_rows {
            let nota: i32 = row.get(0).unwrap_or(0);
            let cod_fornec: i32 = row.get(1).unwrap_or(0);
            if nota == 0 || cod_fornec == 0 { continue; }
            tx.execute(
                "INSERT INTO compras2 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    nota,
                    cod_fornec,
                    row.get::<&str, _>(2).map(|s| s.trim()),
                    row.get::<&str, _>(3).map(|s| s.trim()),
                    row.get::<&str, _>(4).map(|s| s.trim()),
                    row.get::<f64, _>(5),
                    row.get::<f64, _>(6),
                    row.get::<f64, _>(7)
                ]
            )?;
        }
        tx.commit()?;
    }
    tables_copied.push("COMPRAS2".to_string());

    // 11. Write Vendas1
    {
        let tx = sqlite_conn.transaction()?;
        tx.execute("DROP TABLE IF EXISTS vendas1", [])?;
        tx.execute(
            "CREATE TABLE vendas1 (
                nVenda INTEGER PRIMARY KEY,
                dVenda TEXT,
                cNome TEXT,
                nNotaFiscal INTEGER
            )",
            [],
        )?;
        for row in vendas1_rows {
            let v: i32 = row.get(0).unwrap_or(0);
            if v == 0 { continue; }
            let _ = tx.execute(
                "INSERT OR IGNORE INTO vendas1 VALUES (?1, ?2, ?3, ?4)",
                params![
                    v,
                    row.get::<&str, _>(1),
                    row.get::<&str, _>(2).map(|s| s.trim()),
                    row.get::<i32, _>(3)
                ]
            );
        }
        tx.commit()?;
    }
    tables_copied.push("VENDAS1".to_string());

    // 12. Write Vendas2
    {
        let tx = sqlite_conn.transaction()?;
        tx.execute("DROP TABLE IF EXISTS vendas2", [])?;
        tx.execute(
            "CREATE TABLE vendas2 (
                nRegistro INTEGER,
                nVenda INTEGER,
                dVenda TEXT,
                cCodProd TEXT,
                nQtde INTEGER,
                nPreco REAL,
                nValor REAL,
                nNotaFiscal INTEGER,
                cLote TEXT
            )",
            [],
        )?;
        for row in vendas2_rows {
            let reg: i32 = row.get(0).unwrap_or(0);
            if reg == 0 { continue; }
            tx.execute(
                "INSERT INTO vendas2 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    reg,
                    row.get::<i32, _>(1),
                    row.get::<&str, _>(2),
                    row.get::<&str, _>(3).map(|s| s.trim()),
                    row.get::<i32, _>(4),
                    row.get::<f64, _>(5),
                    row.get::<f64, _>(6),
                    row.get::<i32, _>(7),
                    row.get::<&str, _>(8).map(|s| s.trim())
                ]
            )?;
        }
        tx.commit()?;
    }
    tables_copied.push("VENDAS2".to_string());

    let _ = sqlite_conn.execute("PRAGMA foreign_keys = ON", []);
    
    let size_bytes = std::fs::metadata(sqlite_path)?.len();
    let elapsed_ms = start_time.elapsed().as_millis() as u64;
    
    Ok(crate::models::DbDumpResult {
        filename: "legacy_dump.db".to_string(),
        size_bytes,
        tables_copied,
        elapsed_ms,
    })
}

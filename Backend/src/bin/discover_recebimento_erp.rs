use app_lib::core::pg_db::create_pool;
use app_lib::core::legacy_db::connect_sql_server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("Conectando ao Postgres...");
    let pool = create_pool().await.map_err(|e| anyhow::anyhow!(e))?;

    println!("Conectando ao SQL Server (ERP)...");
    let mut client = connect_sql_server(&pool).await?;
    println!("Conexao com SQL Server OK!");

    // 1. Listar tabelas que contenham nomes sugestivos
    println!("\n=== BUSCANDO TABELAS NO SQL SERVER ===");
    let query_tables = r#"
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
    "#;
    let stream = client.query(query_tables, &[]).await?;
    let rows = stream.into_first_result().await?;
    let mut matching_tables = Vec::new();
    for r in &rows {
        if let Some(tbl) = r.get::<&str, _>(0) {
            let lower = tbl.to_lowercase();
            if lower.contains("receb")
                || lower.contains("insum")
                || lower.contains("entrad")
                || lower.contains("compra")
                || lower.contains("lote")
                || lower.contains("laudo")
                || lower.contains("qualid")
                || lower.contains("nota")
                || lower.contains("estoq")
                || lower.contains("analis")
            {
                matching_tables.push(tbl.to_string());
                println!("Tabela candidata: {}", tbl);
            }
        }
    }

    // 2. Procurar tabelas que contenham o lote '201607030' ou nota '80839' ou '169629' (do print do usuário!)
    println!("\n=== BUSCANDO EM Recebe_Insumos_Rel PARA Registro = 4482 ===");
    let q_rel_4482 = r#"
        SELECT 
            Registro_Rel,
            Registro,
            CAST(cNomeF AS NVARCHAR(200)) AS Fornecedor,
            NOTA,
            CAST(cReferencia AS NVARCHAR(100)) AS CodigoRef,
            CAST(cDescricao AS NVARCHAR(200)) AS InsumoDesc,
            CAST(cLoteFornec AS NVARCHAR(100)) AS LoteFornec,
            CONVERT(NVARCHAR(10), dRelatorio, 103) AS DataRelatorio,
            CAST(cSituacao AS NVARCHAR(50)) AS Situacao,
            CAST(cAnalista AS NVARCHAR(100)) AS Analista,
            CAST(cResponsavel AS NVARCHAR(100)) AS Responsavel,
            CAST(cEspecificacao1 AS NVARCHAR(200)) AS Esp1,
            CAST(cResultado1 AS NVARCHAR(200)) AS Res1,
            CAST(cEspecificacao2 AS NVARCHAR(200)) AS Esp2,
            CAST(cResultado2 AS NVARCHAR(200)) AS Res2,
            CAST(cEspecificacao3 AS NVARCHAR(200)) AS Esp3,
            CAST(cResultado3 AS NVARCHAR(200)) AS Res3,
            CAST(cEspecificacao4 AS NVARCHAR(200)) AS Esp4,
            CAST(cResultado4 AS NVARCHAR(200)) AS Res4
        FROM Recebe_Insumos_Rel WITH (NOLOCK)
        WHERE Registro = 4482
    "#;
    match client.query(q_rel_4482, &[]).await {
        Ok(stream) => match stream.into_first_result().await {
            Ok(rows) => {
                println!("Encontrados em Recebe_Insumos_Rel: {}", rows.len());
                for r in rows {
                    println!("Rel: {:?}, Esp1: {:?}, Res1: {:?}", r.get::<i32, _>("Registro_Rel"), r.get::<&str, _>("Esp1"), r.get::<&str, _>("Res1"));
                }
            }
            Err(e) => println!("Erro into_first_result: {}", e),
        },
        Err(e) => println!("Erro query: {}", e),
    }

    println!("\n=== TOP 5 RECEBIMENTOS MAIS RECENTES ===");
    let q_latest = r#"
        SELECT TOP 5
            Registro,
            CAST(cNomeF AS NVARCHAR(200)) AS Fornecedor,
            NOTA,
            CAST(cReferencia AS NVARCHAR(100)) AS CodigoRef,
            CAST(cDescricao AS NVARCHAR(200)) AS InsumoDesc,
            CAST(UNIDADE AS NVARCHAR(50)) AS Unidade,
            CAST(QUANTIDADE AS FLOAT) AS Quantidade,
            CONVERT(NVARCHAR(10), dEntrada, 103) AS DataEntrada,
            CAST(cLoteFornec AS NVARCHAR(100)) AS LoteFornec,
            CONVERT(NVARCHAR(10), dValidade, 103) AS DataValidade,
            CAST(cCodigoReceb AS NVARCHAR(100)) AS CodigoReceb,
            CAST(cStatus AS NVARCHAR(50)) AS StatusReceb,
            CAST(cUsuario AS NVARCHAR(100)) AS Usuario,
            nRegistro
        FROM Recebe_Insumos WITH (NOLOCK)
        ORDER BY Registro DESC
    "#;
    match client.query(q_latest, &[]).await {
        Ok(stream) => match stream.into_first_result().await {
            Ok(rows) => {
                for r in rows {
                    println!(
                        "Reg: {:?}, DataEntr: {:?}, Fornec: {:?}, NF: {:?}, Insumo: {:?}, Qtd: {:?} {:?}, Lote: {:?}, Val: {:?}, CodReceb: {:?}, Status: {:?}",
                        r.get::<i32, _>("Registro"),
                        r.get::<&str, _>("DataEntrada"),
                        r.get::<&str, _>("Fornecedor"),
                        r.get::<i32, _>("NOTA"),
                        r.get::<&str, _>("InsumoDesc"),
                        r.get::<f64, _>("Quantidade"),
                        r.get::<&str, _>("Unidade"),
                        r.get::<&str, _>("LoteFornec"),
                        r.get::<&str, _>("DataValidade"),
                        r.get::<&str, _>("CodigoReceb"),
                        r.get::<&str, _>("StatusReceb"),
                    );
                }
            }
            Err(e) => println!("Erro into_first_result: {}", e),
        },
        Err(e) => println!("Erro query: {}", e),
    }

    println!("\n=== COLUNAS DE Recebe_Insumos ===");
    let q_cols = r#"
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Recebe_Insumos'
        ORDER BY ORDINAL_POSITION
    "#;
    let stream = client.query(q_cols, &[]).await?;
    for r in stream.into_first_result().await? {
        println!("Col: {:?} ({:?})", r.get::<&str, _>(0), r.get::<&str, _>(1));
    }

    println!("\n=== CONTAGEM DE TABELAS RELACIONADAS ===");
    for tbl in &["Recebe_Insumos", "Recebe_Insumos_Rel", "Recebe_Insumos_Rel2", "Recebe_Insumos_Rel3", "Lotes_InsRel", "Lotes_CQ1", "Lotes_CQ2", "Lotes_CQ3"] {
        let q = format!("SELECT COUNT(*) FROM {} WITH (NOLOCK)", tbl);
        match client.query(&q, &[]).await {
            Ok(s) => match s.into_first_result().await {
                Ok(rows) => {
                    let cnt: i32 = rows[0].get(0).unwrap_or(0);
                    println!("Tabela {}: {} linhas", tbl, cnt);
                }
                Err(e) => println!("Tabela {} erro: {}", tbl, e),
            },
            Err(e) => println!("Tabela {} query err: {}", tbl, e),
        }
    }

    println!("\n=== COLUNAS DE Lotes_InsRel ===");
    let q_cols_lir = r#"
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Lotes_InsRel'
        ORDER BY ORDINAL_POSITION
    "#;
    let stream = client.query(q_cols_lir, &[]).await?;
    for r in stream.into_first_result().await? {
        println!("Col: {:?} ({:?})", r.get::<&str, _>(0), r.get::<&str, _>(1));
    }

    println!("\n=== TOP 5 DE Lotes_InsRel ===");
    let q_top_lir = r#"
        SELECT TOP 5 *
        FROM Lotes_InsRel WITH (NOLOCK)
        ORDER BY 1 DESC
    "#;
    let stream = client.query(q_top_lir, &[]).await?;
    for r in stream.into_first_result().await? {
        println!("Row LIR: {:?}", r);
    }

    Ok(())
}

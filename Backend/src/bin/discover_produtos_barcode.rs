//! Discovery: coluna de código de barras em Produtos (SQL Server).
//! `cargo run --bin discover_produtos_barcode`

use app_lib::core::legacy_db::connect_sql_server;
use app_lib::core::pg_db;
use std::fs;
use std::path::PathBuf;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pool = pg_db::create_pool().await?;
    let mut client = connect_sql_server(&pool).await?;
    let mut out = String::from("# Discovery — código de barras em Produtos\n\n");

    out.push_str("## Colunas candidatas (Produtos)\n\n");
    let stream = client
        .query(
            r#"
SELECT COLUMN_NAME COLLATE Latin1_General_CI_AS,
       DATA_TYPE COLLATE Latin1_General_CI_AS,
       CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = N'Produtos'
  AND (
    COLUMN_NAME LIKE '%Bar%'
    OR COLUMN_NAME LIKE '%barr%'
    OR COLUMN_NAME LIKE '%EAN%'
    OR COLUMN_NAME LIKE '%ean%'
    OR COLUMN_NAME LIKE '%GTIN%'
    OR COLUMN_NAME LIKE '%gtin%'
    OR COLUMN_NAME LIKE '%CodBar%'
    OR COLUMN_NAME LIKE '%CODIGO_BAR%'
  )
ORDER BY ORDINAL_POSITION
"#,
            &[],
        )
        .await?;
    let rows = stream.into_first_result().await?;
    out.push_str("| Coluna | Tipo | Len |\n|--------|------|-----|\n");
    let mut candidates: Vec<String> = Vec::new();
    for r in &rows {
        let name: &str = r.get(0).unwrap_or("").trim();
        let dtype: &str = r.get(1).unwrap_or("").trim();
        let len: Option<i32> = r.get(2);
        out.push_str(&format!(
            "| {name} | {dtype} | {} |\n",
            len.map(|n| n.to_string()).unwrap_or_else(|| "—".into())
        ));
        if !name.is_empty() {
            candidates.push(name.to_string());
        }
    }
    if candidates.is_empty() {
        out.push_str("\nNenhuma coluna com nome óbvio. Listando TODAS as colunas texto de Produtos:\n\n");
        let stream = client
            .query(
                r#"
SELECT COLUMN_NAME COLLATE Latin1_General_CI_AS,
       DATA_TYPE COLLATE Latin1_General_CI_AS,
       CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = N'Produtos'
  AND DATA_TYPE IN ('varchar','nvarchar','char','nchar','text','ntext')
ORDER BY ORDINAL_POSITION
"#,
                &[],
            )
            .await?;
        let all = stream.into_first_result().await?;
        out.push_str("| Coluna | Tipo | Len |\n|--------|------|-----|\n");
        for r in &all {
            let name: &str = r.get(0).unwrap_or("").trim();
            let dtype: &str = r.get(1).unwrap_or("").trim();
            let len: Option<i32> = r.get(2);
            out.push_str(&format!(
                "| {name} | {dtype} | {} |\n",
                len.map(|n| n.to_string()).unwrap_or_else(|| "—".into())
            ));
            let u = name.to_ascii_lowercase();
            if u.contains("bar") || u.contains("ean") || u.contains("gtin") || u.contains("upc") {
                candidates.push(name.to_string());
            }
        }
    }

    out.push_str("\n## Amostras\n\n");
    for col in candidates.iter().take(8) {
        let safe = col.replace(']', "]]");
        let q = format!(
            "SELECT TOP 25 \
                LTRIM(RTRIM(cCodProd)) COLLATE Latin1_General_CI_AS, \
                LTRIM(RTRIM(CAST([{safe}] AS nvarchar(80)))) COLLATE Latin1_General_CI_AS \
             FROM Produtos WITH (NOLOCK) \
             WHERE [{safe}] IS NOT NULL \
               AND LTRIM(RTRIM(CAST([{safe}] AS nvarchar(80)))) <> '' \
               AND (cInativo = 'N' OR cInativo IS NULL) \
             ORDER BY cCodProd"
        );
        out.push_str(&format!("### Produtos.{col}\n\n| Codigo | Valor |\n|--------|-------|\n"));
        match client.query(q.as_str(), &[]).await {
            Ok(s) => {
                let rows = s.into_first_result().await?;
                for r in rows {
                    let c: &str = r.get(0).unwrap_or("").trim();
                    let v: &str = r.get(1).unwrap_or("").trim();
                    out.push_str(&format!("| {c} | {} |\n", v.replace('|', "\\|")));
                }
                out.push('\n');
            }
            Err(e) => out.push_str(&format!("erro: {e}\n\n")),
        }
    }

    let dest = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("erp-import")
        .join("discovery-produtos-barcode.md");
    fs::write(&dest, &out)?;
    println!("Escrito: {}", dest.display());
    println!("Candidatas: {:?}", candidates);
    Ok(())
}

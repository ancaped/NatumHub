//! Discovery Passo O — tabelas/tipos de movimento de insumos no SQL Server.
//! Uso (PC Principal): `cargo run --bin discover_movimentos_insumos`
//! Credenciais: hub_settings (sql_*) via postgres.env — não imprime senha.

use app_lib::core::legacy_db::connect_sql_server;
use app_lib::core::pg_db;
use std::fs;
use std::path::PathBuf;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pool = pg_db::create_pool().await?;
    let mut client = connect_sql_server(&pool).await?;

    let mut out = String::new();
    out.push_str("# Discovery — movimentos insumos (ERP)\n\n");
    out.push_str(&format!(
        "Gerado em {} (UTC). Somente leitura.\n\n",
        chrono::Utc::now().format("%Y-%m-%d %H:%M:%S")
    ));

    // 1) Tabelas candidatas
    out.push_str("## 1. Tabelas candidatas\n\n");
    let stream = client
        .query(
            r#"
SELECT TABLE_SCHEMA, TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
  AND (
    TABLE_NAME LIKE '%Estoque%'
    OR TABLE_NAME LIKE '%Mov%'
    OR TABLE_NAME LIKE '%Hist%'
    OR TABLE_NAME LIKE '%Invent%'
    OR TABLE_NAME LIKE '%Acerto%'
    OR TABLE_NAME LIKE '%Ajuste%'
    OR TABLE_NAME LIKE '%Kardex%'
    OR TABLE_NAME LIKE '%Insumo%'
    OR TABLE_NAME LIKE '%Lanc%'
    OR TABLE_NAME LIKE '%Manual%'
  )
ORDER BY TABLE_NAME
"#,
            &[],
        )
        .await?;
    let tables = stream.into_first_result().await?;
    out.push_str("| Schema | Tabela |\n|--------|--------|\n");
    let mut table_names: Vec<String> = Vec::new();
    for row in &tables {
        let schema: &str = row.get(0).unwrap_or("");
        let name: &str = row.get(1).unwrap_or("");
        out.push_str(&format!("| {schema} | {name} |\n"));
        table_names.push(name.trim().to_string());
    }
    out.push_str(&format!("\nTotal: {} tabelas.\n\n", table_names.len()));

    // 2) Justificativas Lotes_Baixas
    out.push_str("## 2. Lotes_Baixas — justificativas acerto/ajuste/invent/manual\n\n");
    let stream = client
        .query(
            r#"
SELECT TOP 80
  LTRIM(RTRIM(CAST(cJustificativa AS nvarchar(400)))) AS justif,
  COUNT(*) AS qtd
FROM Lotes_Baixas WITH (NOLOCK)
WHERE cJustificativa IS NOT NULL
  AND (
    cJustificativa LIKE '%acerto%'
    OR cJustificativa LIKE '%ajuste%'
    OR cJustificativa LIKE '%invent%'
    OR cJustificativa LIKE '%manual%'
  )
GROUP BY LTRIM(RTRIM(CAST(cJustificativa AS nvarchar(400))))
ORDER BY qtd DESC
"#,
            &[],
        )
        .await?;
    let baixas = stream.into_first_result().await?;
    out.push_str("| Justificativa | Qtd |\n|---------------|-----|\n");
    for row in &baixas {
        let j: &str = row.get(0).unwrap_or("").trim();
        let q: i32 = row.get(1).unwrap_or(0);
        let j_esc = j.replace('|', "\\|");
        out.push_str(&format!("| {j_esc} | {q} |\n"));
    }
    out.push_str(&format!("\nTotal grupos: {}.\n\n", baixas.len()));

    let search_tables: Vec<&str> = table_names
        .iter()
        .map(|s| s.as_str())
        .filter(|n| {
            let u = n.to_ascii_lowercase();
            u.contains("mov")
                || u.contains("hist")
                || u.contains("estoque")
                || u.contains("acerto")
                || u.contains("ajuste")
                || u.contains("invent")
                || u.contains("kardex")
                || u.contains("lanc")
        })
        .collect();

    // 3) Busca textual
    out.push_str("## 3. Busca de textos '(entrada' / '(saida' / 'Acerto Manual'\n\n");
    for tname in search_tables.iter().take(40) {
        let q = format!(
            r#"
SELECT COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = N'{t}'
  AND DATA_TYPE IN ('varchar', 'nvarchar', 'char', 'nchar', 'text', 'ntext')
ORDER BY ORDINAL_POSITION
"#,
            t = tname.replace('\'', "''")
        );
        let stream = match client.query(q.as_str(), &[]).await {
            Ok(s) => s,
            Err(e) => {
                out.push_str(&format!("### `{tname}` — erro colunas: {e}\n\n"));
                continue;
            }
        };
        let cols = stream.into_first_result().await?;
        let col_names: Vec<String> = cols
            .iter()
            .filter_map(|r| r.get::<&str, _>(0).map(|s| s.trim().to_string()))
            .collect();
        if col_names.is_empty() {
            continue;
        }

        let n_cols = col_names.len();
        out.push_str(&format!("### `{tname}` ({n_cols} cols texto)\n\n"));

        let likes: Vec<String> = col_names
            .iter()
            .take(12)
            .map(|c| {
                let c = c.replace(']', "]]");
                format!(
                    "CAST([{c}] AS nvarchar(400)) LIKE N'%(entrada%' \
                     OR CAST([{c}] AS nvarchar(400)) LIKE N'%(saida%' \
                     OR CAST([{c}] AS nvarchar(400)) LIKE N'%Acerto Manual%' \
                     OR CAST([{c}] AS nvarchar(400)) LIKE N'%acerto de estoque%'"
                )
            })
            .collect();
        let where_or = likes.join(" OR ");
        let sample_cols = col_names
            .iter()
            .take(6)
            .map(|c| {
                let c = c.replace(']', "]]");
                format!("LTRIM(RTRIM(CAST([{c}] AS nvarchar(200))))")
            })
            .collect::<Vec<_>>()
            .join(", ");
        let sample_q = format!(
            "SELECT TOP 15 {sample_cols} FROM [{t}] WITH (NOLOCK) WHERE {where_or}",
            t = tname.replace(']', "]]")
        );
        match client.query(sample_q.as_str(), &[]).await {
            Ok(s) => {
                let rows = s.into_first_result().await?;
                out.push_str(&format!("Hits: {} (TOP 15)\n\n", rows.len()));
                let take = col_names.len().min(6);
                for (i, row) in rows.iter().enumerate() {
                    let mut parts = Vec::new();
                    for ci in 0..take {
                        if let Some(v) = row.get::<&str, _>(ci) {
                            let v = v.trim();
                            if !v.is_empty() {
                                parts.push(format!(
                                    "{}={}",
                                    col_names[ci],
                                    v.replace('\n', " ")
                                ));
                            }
                        }
                    }
                    if !parts.is_empty() {
                        out.push_str(&format!("- {}. {}\n", i + 1, parts.join(" | ")));
                    }
                }
                out.push('\n');
            }
            Err(e) => {
                out.push_str(&format!("Erro amostra: {e}\n\n"));
            }
        }
    }

    // 4) DISTINCT tipos
    out.push_str("## 4. Valores DISTINCT em colunas Tipo/Oper/Historico\n\n");
    for tname in search_tables.iter().take(25) {
        let q = format!(
            r#"
SELECT COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = N'{t}'
  AND (
    COLUMN_NAME LIKE '%Tipo%'
    OR COLUMN_NAME LIKE '%Oper%'
    OR COLUMN_NAME LIKE '%Historico%'
    OR COLUMN_NAME LIKE '%Desc%'
  )
"#,
            t = tname.replace('\'', "''")
        );
        let Ok(stream) = client.query(q.as_str(), &[]).await else {
            continue;
        };
        let cols = stream.into_first_result().await?;
        for row in cols {
            let col: &str = row.get(0).unwrap_or("").trim();
            if col.is_empty() {
                continue;
            }
            let dq = format!(
                "SELECT TOP 40 LTRIM(RTRIM(CAST([{c}] AS nvarchar(200)))) AS v, COUNT(*) AS q \
                 FROM [{t}] WITH (NOLOCK) \
                 WHERE [{c}] IS NOT NULL AND LTRIM(RTRIM(CAST([{c}] AS nvarchar(200)))) <> '' \
                 GROUP BY LTRIM(RTRIM(CAST([{c}] AS nvarchar(200)))) \
                 ORDER BY q DESC",
                c = col.replace(']', "]]"),
                t = tname.replace(']', "]]")
            );
            if let Ok(s) = client.query(dq.as_str(), &[]).await {
                let rows = s.into_first_result().await?;
                if rows.is_empty() {
                    continue;
                }
                out.push_str(&format!(
                    "### `{tname}.{col}`\n\n| Valor | Qtd |\n|-------|-----|\n"
                ));
                for r in rows {
                    let v: &str = r.get(0).unwrap_or("").trim();
                    let qv: i32 = r.get(1).unwrap_or(0);
                    out.push_str(&format!("| {} | {qv} |\n", v.replace('|', "\\|")));
                }
                out.push('\n');
            }
        }
    }

    let dest = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("erp-import")
        .join("discovery-movimentos-insumos-result.md");
    fs::write(&dest, &out)?;
    println!("Escrito: {}", dest.display());
    println!("Tabelas candidatas: {}", table_names.len());
    Ok(())
}

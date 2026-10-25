use calamine::{open_workbook, Data, Reader, Xlsx};
use sqlx::PgPool;
use std::path::Path;

use crate::core::regras_produto::{carregar_prefixos_linhas, linha_do_codigo};

fn cell_as_string(cell: &Data) -> String {
    match cell {
        Data::String(s) => s.trim().to_string(),
        Data::Float(f) => f.to_string(),
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => b.to_string(),
        _ => "".to_string(),
    }
}

fn cell_as_i64(cell: &Data) -> i64 {
    match cell {
        Data::Int(i) => *i,
        Data::Float(f) => *f as i64,
        Data::String(s) => s.trim().parse::<i64>().unwrap_or(0),
        Data::Bool(b) => if *b { 1 } else { 0 },
        _ => 0,
    }
}

fn cell_as_f64(cell: &Data) -> f64 {
    match cell {
        Data::Float(f) => *f,
        Data::Int(i) => *i as f64,
        Data::String(s) => s.trim().replace(',', ".").parse::<f64>().unwrap_or(0.0),
        _ => 0.0,
    }
}

pub async fn parse_faturamento_excel<P: AsRef<Path>>(
    file_path: P,
    pool: &PgPool,
) -> anyhow::Result<usize> {
    let mut workbook: Xlsx<_> = open_workbook(file_path)?;
    let sheets = workbook.sheet_names();
    if sheets.is_empty() {
        return Err(anyhow::anyhow!("O arquivo de faturamento está vazio ou sem abas"));
    }

    let sheet_name = &sheets[0];
    let range = workbook.worksheet_range(sheet_name)?;

    let mut tx = pool.begin().await?;
    let prefixos = carregar_prefixos_linhas(&mut *tx).await?;
    let mut count = 0;

    for (_row_idx, row) in range.rows().skip(1).enumerate() {
        if row.len() < 2 {
            continue;
        }

        let codigo = cell_as_string(&row[0]);
        let nome_produto = cell_as_string(&row[1]);

        if codigo.is_empty() {
            continue;
        }

        let prefix = linha_do_codigo(&codigo, &prefixos);

        // Garantir que o produto existe (sem sobrescrever detalhes melhores)
        sqlx::query(
            "INSERT INTO produtos (codigo, descricao, linha_prefix, base)
             VALUES ($1, $2, $3, NULL)
             ON CONFLICT(codigo) DO UPDATE SET
                descricao = CASE WHEN descricao = '' THEN EXCLUDED.descricao ELSE descricao END",
        )
        .bind(&codigo)
        .bind(&nome_produto)
        .bind(&prefix)
        .execute(&mut *tx)
        .await?;

        // Limpar histórico antigo desse produto
        sqlx::query("DELETE FROM historico_faturamento WHERE codigo = $1")
            .bind(&codigo)
            .execute(&mut *tx)
            .await?;

        // Inserir faturamento mensal (Jan=col 2 … Dez=col 13)
        for mes in 1..=12 {
            let col_idx = (mes + 1) as usize;
            if col_idx < row.len() {
                let quantidade = cell_as_i64(&row[col_idx]);
                sqlx::query(
                    "INSERT INTO historico_faturamento (codigo, mes, quantidade)
                     VALUES ($1, $2, $3)",
                )
                .bind(&codigo)
                .bind(mes)
                .bind(quantidade)
                .execute(&mut *tx)
                .await?;
            }
        }
        count += 1;
    }

    tx.commit().await?;
    Ok(count)
}

pub async fn parse_levantamento_excel<P: AsRef<Path>>(
    file_path: P,
    pool: &PgPool,
) -> anyhow::Result<usize> {
    let mut workbook: Xlsx<_> = open_workbook(file_path)?;
    let sheets = workbook.sheet_names();
    if sheets.is_empty() {
        return Err(anyhow::anyhow!(
            "O arquivo de levantamento de produção está vazio ou sem abas"
        ));
    }

    let sheet_name = &sheets[0];
    let range = workbook.worksheet_range(sheet_name)?;

    let mut tx = pool.begin().await?;
    let prefixos = carregar_prefixos_linhas(&mut *tx).await?;
    let mut count = 0;

    for (_row_idx, row) in range.rows().skip(1).enumerate() {
        if row.len() < 10 {
            continue;
        }

        let codigo = cell_as_string(&row[0]);
        let descricao = cell_as_string(&row[1]);

        if codigo.is_empty() {
            continue;
        }

        let media_lev = cell_as_f64(&row[4]);
        // Colunas 6–8 (estoque/produção/pedidos) são ignoradas de propósito:
        // a fonte canônica é o ERP (passo A / resync-produtos). Excel não sobrescreve.

        let fase = if row.len() > 13 {
            let f = cell_as_string(&row[13]);
            if f.is_empty() { None } else { Some(f) }
        } else {
            None
        };

        let base_val = if row.len() > 17 {
            let b = cell_as_string(&row[17]);
            if b.is_empty() { None } else { Some(b) }
        } else {
            None
        };

        let prefix = linha_do_codigo(&codigo, &prefixos);

        sqlx::query(
            "INSERT INTO produtos (codigo, descricao, linha_prefix, base, media_levantamento)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT(codigo) DO UPDATE SET
                descricao = EXCLUDED.descricao,
                linha_prefix = EXCLUDED.linha_prefix,
                base = EXCLUDED.base,
                media_levantamento = EXCLUDED.media_levantamento",
        )
        .bind(&codigo)
        .bind(&descricao)
        .bind(&prefix)
        .bind(&base_val)
        .bind(media_lev)
        .execute(&mut *tx)
        .await?;

        // Só garante a linha e atualiza fase; nunca sobrescreve estoque/produção/pedidos.
        sqlx::query(
            "INSERT INTO estoque_atual (codigo, estoque, producao, pedidos_aberto, fase)
             VALUES ($1, 0.0, 0.0, 0.0, $2)
             ON CONFLICT(codigo) DO UPDATE SET
                fase = COALESCE(EXCLUDED.fase, estoque_atual.fase)",
        )
        .bind(&codigo)
        .bind(&fase)
        .execute(&mut *tx)
        .await?;

        count += 1;
    }

    tx.commit().await?;
    Ok(count)
}

pub async fn parse_kits_excel<P: AsRef<Path>>(
    file_path: P,
    pool: &PgPool,
) -> anyhow::Result<usize> {
    Ok(importar_kits_excel(file_path, pool, true).await?.importadas)
}

/// Resultado da importação (ou da prévia) da composição de kits.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumoKitsExcel {
    /// Relações manuais que existiam e saem (o arquivo as substitui).
    pub removidas: usize,
    /// Relações do arquivo que entram.
    pub importadas: usize,
    /// Kits que existiam com relação manual ou aparecem no arquivo, em ordem alfabética.
    pub kits_afetados: Vec<String>,
}

/// Lê o arquivo e regrava as relações manuais numa transação: com `confirmar` faz commit; sem, desfaz (prévia).
pub async fn importar_kits_excel<P: AsRef<Path>>(
    file_path: P,
    pool: &PgPool,
    confirmar: bool,
) -> anyhow::Result<ResumoKitsExcel> {
    let mut workbook: Xlsx<_> = open_workbook(file_path)?;
    let sheets = workbook.sheet_names();

    let mut tx = pool.begin().await?;
    let prefixos = carregar_prefixos_linhas(&mut *tx).await?;

    let mut kits: std::collections::BTreeSet<String> = sqlx::query_scalar(
        "SELECT DISTINCT kit_codigo FROM kit_composicao WHERE COALESCE(origem, 'manual') = 'manual'",
    )
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .collect();
    let removidas: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM kit_composicao WHERE COALESCE(origem, 'manual') = 'manual'")
        .fetch_one(&mut *tx)
        .await?;

    // Não apaga origem=erp (Passo P). Só regrava linhas manuais do Excel.
    sqlx::query("DELETE FROM kit_composicao WHERE COALESCE(origem, 'manual') = 'manual'")
        .execute(&mut *tx)
        .await?;

    let mut count = 0;

    let sheets_to_parse = ["HAIREXTRATTUS", "LISSSHINE", "NATUM"];
    for sheet_name in sheets_to_parse {
        if !sheets.iter().any(|s| s == sheet_name) {
            continue;
        }

        let range = workbook.worksheet_range(sheet_name)?;
        for row in range.rows().skip(1) {
            if row.len() < 3 {
                continue;
            }

            let kit_code = cell_as_string(&row[0]);
            let kit_desc = cell_as_string(&row[1]);
            let comp_code = cell_as_string(&row[2]);
            let comp_desc = if row.len() > 3 {
                cell_as_string(&row[3])
            } else {
                "".to_string()
            };

            let quantidade: f64 = if row.len() > 4 {
                match &row[4] {
                    calamine::Data::Float(f) => *f,
                    calamine::Data::Int(i) => *i as f64,
                    calamine::Data::String(s) => s.trim().replace(',', ".").parse::<f64>().unwrap_or(1.0),
                    _ => 1.0,
                }
            } else {
                1.0
            };

            if kit_code.is_empty() || comp_code.is_empty() {
                continue;
            }

            let kit_prefix = linha_do_codigo(&kit_code, &prefixos);
            let comp_prefix = linha_do_codigo(&comp_code, &prefixos);

            sqlx::query(
                "INSERT INTO produtos (codigo, descricao, linha_prefix, base)
                 VALUES ($1, $2, $3, NULL)
                 ON CONFLICT(codigo) DO UPDATE SET
                    descricao = CASE WHEN descricao = '' THEN EXCLUDED.descricao ELSE descricao END",
            )
            .bind(&kit_code)
            .bind(&kit_desc)
            .bind(&kit_prefix)
            .execute(&mut *tx)
            .await?;

            sqlx::query(
                "INSERT INTO produtos (codigo, descricao, linha_prefix, base)
                 VALUES ($1, $2, $3, NULL)
                 ON CONFLICT(codigo) DO UPDATE SET
                    descricao = CASE WHEN descricao = '' THEN EXCLUDED.descricao ELSE descricao END",
            )
            .bind(&comp_code)
            .bind(&comp_desc)
            .bind(&comp_prefix)
            .execute(&mut *tx)
            .await?;

            sqlx::query(
                "INSERT INTO kit_composicao (kit_codigo, componente_codigo, quantidade, fator_proporcao_qtd, fator_proporcao_kits, origem)
                 VALUES ($1, $2, $3::numeric, 1.0, 1, 'manual')
                 ON CONFLICT(kit_codigo, componente_codigo) DO UPDATE SET
                    quantidade = EXCLUDED.quantidade,
                    fator_proporcao_qtd = 1.0,
                    fator_proporcao_kits = 1,
                    origem = 'manual'",
            )
            .bind(&kit_code)
            .bind(&comp_code)
            .bind(quantidade)
            .execute(&mut *tx)
            .await?;

            kits.insert(kit_code.clone());
            count += 1;
        }
    }

    if confirmar {
        tx.commit().await?;
    } else {
        tx.rollback().await?;
    }
    Ok(ResumoKitsExcel { removidas: removidas as usize, importadas: count, kits_afetados: kits.into_iter().collect() })
}

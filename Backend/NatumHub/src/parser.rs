use calamine::{open_workbook, Data, Reader, Xlsx};
use rusqlite::{params, Connection};
use std::path::Path;

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

pub fn get_linha_prefix(codigo: &str) -> String {
    if let Some(first_part) = codigo.split('.').next() {
        let trimmed = first_part.trim();
        if let Ok(num) = trimmed.parse::<i32>() {
            let num_str = num.to_string();
            let known_prefixes = ["1", "2", "3", "5", "6", "10", "14", "17", "20", "70"];
            if known_prefixes.contains(&num_str.as_str()) {
                return num_str;
            }
        }
    }
    "DEFAULT".to_string()
}

pub fn parse_faturamento_excel<P: AsRef<Path>>(file_path: P, conn: &mut Connection) -> anyhow::Result<usize> {
    let mut workbook: Xlsx<_> = open_workbook(file_path)?;
    let sheets = workbook.sheet_names();
    if sheets.is_empty() {
        return Err(anyhow::anyhow!("O arquivo de faturamento está vazio ou sem abas"));
    }

    let sheet_name = &sheets[0];
    let range = workbook.worksheet_range(sheet_name)?;
    
    let tx = conn.transaction()?;
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

        let prefix = get_linha_prefix(&codigo);

        // 1. Garantir que o produto existe na tabela produtos (sem sobrescrever se já existir detalhes melhores)
        tx.execute(
            "INSERT INTO produtos (codigo, descricao, linha_prefix, base)
             VALUES (?1, ?2, ?3, NULL)
             ON CONFLICT(codigo) DO UPDATE SET
                descricao = CASE WHEN descricao = '' THEN excluded.descricao ELSE descricao END",
            params![codigo, nome_produto, prefix],
        )?;

        // 2. Limpar histórico antigo desse produto
        tx.execute("DELETE FROM historico_faturamento WHERE codigo = ?1", params![codigo])?;

        // 3. Inserir faturamento mensal para os 12 meses
        // Colunas correspondentes a Janeiro (índice 2) a Dezembro (índice 13)
        for mes in 1..=12 {
            let col_idx = (mes + 1) as usize;
            if col_idx < row.len() {
                let quantidade = cell_as_i64(&row[col_idx]);
                tx.execute(
                    "INSERT INTO historico_faturamento (codigo, mes, quantidade)
                     VALUES (?1, ?2, ?3)",
                    params![codigo, mes, quantidade],
                )?;
            }
        }
        count += 1;
    }

    tx.commit()?;
    Ok(count)
}

pub fn parse_levantamento_excel<P: AsRef<Path>>(file_path: P, conn: &mut Connection) -> anyhow::Result<usize> {
    let mut workbook: Xlsx<_> = open_workbook(file_path)?;
    let sheets = workbook.sheet_names();
    if sheets.is_empty() {
        return Err(anyhow::anyhow!("O arquivo de levantamento de produção está vazio ou sem abas"));
    }

    let sheet_name = &sheets[0];
    let range = workbook.worksheet_range(sheet_name)?;

    let tx = conn.transaction()?;
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

        let media_lev = cell_as_f64(&row[4]); // Coluna Média
        let estoque = cell_as_i64(&row[6]);   // Coluna Qtde. em Estoque
        let producao = cell_as_i64(&row[7]);  // Coluna Qtde. em Produção
        let pedidos = cell_as_i64(&row[8]);   // Coluna Pedidos em Aberto
        
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

        let prefix = get_linha_prefix(&codigo);

        // 1. Inserir ou atualizar produto
        tx.execute(
            "INSERT INTO produtos (codigo, descricao, linha_prefix, base, media_levantamento)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(codigo) DO UPDATE SET
                descricao = excluded.descricao,
                linha_prefix = excluded.linha_prefix,
                base = excluded.base,
                media_levantamento = excluded.media_levantamento",
            params![codigo, descricao, prefix, base_val, media_lev],
        )?;

        // 2. Inserir ou atualizar estoque atual
        tx.execute(
            "INSERT INTO estoque_atual (codigo, estoque, producao, pedidos_aberto, fase)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(codigo) DO UPDATE SET
                estoque = excluded.estoque,
                producao = excluded.producao,
                pedidos_aberto = excluded.pedidos_aberto,
                fase = excluded.fase",
            params![codigo, estoque, producao, pedidos, fase],
        )?;

        count += 1;
    }

    tx.commit()?;
    Ok(count)
}

pub fn parse_kits_excel<P: AsRef<Path>>(file_path: P, conn: &mut Connection) -> anyhow::Result<usize> {
    let mut workbook: Xlsx<_> = open_workbook(file_path)?;
    let sheets = workbook.sheet_names();
    
    let tx = conn.transaction()?;
    
    // Clear old compositions
    tx.execute("DELETE FROM kit_composicao", [])?;
    
    let mut count = 0;
    
    // Sheets to parse
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
            let comp_desc = if row.len() > 3 { cell_as_string(&row[3]) } else { "".to_string() };
            
            let quantidade: i64 = if row.len() > 4 {
                match &row[4] {
                    calamine::Data::Float(f) => *f as i64,
                    calamine::Data::Int(i) => *i,
                    calamine::Data::String(s) => s.trim().parse::<i64>().unwrap_or(1),
                    _ => 1,
                }
            } else {
                1
            };
            
            if kit_code.is_empty() || comp_code.is_empty() {
                continue;
            }
            
            let kit_prefix = get_linha_prefix(&kit_code);
            let comp_prefix = get_linha_prefix(&comp_code);
            
            // Insert kit product
            tx.execute(
                "INSERT INTO produtos (codigo, descricao, linha_prefix, base)
                 VALUES (?1, ?2, ?3, NULL)
                 ON CONFLICT(codigo) DO UPDATE SET
                    descricao = CASE WHEN descricao = '' THEN excluded.descricao ELSE descricao END",
                params![kit_code, kit_desc, kit_prefix],
            )?;
            
            // Insert component product
            tx.execute(
                "INSERT INTO produtos (codigo, descricao, linha_prefix, base)
                 VALUES (?1, ?2, ?3, NULL)
                 ON CONFLICT(codigo) DO UPDATE SET
                    descricao = CASE WHEN descricao = '' THEN excluded.descricao ELSE descricao END",
                params![comp_code, comp_desc, comp_prefix],
            )?;
            
            // Insert composition link
            tx.execute(
                "INSERT INTO kit_composicao (kit_codigo, componente_codigo, quantidade) VALUES (?1, ?2, ?3)
                 ON CONFLICT(kit_codigo, componente_codigo) DO UPDATE SET quantidade = excluded.quantidade",
                params![kit_code, comp_code, quantidade],
            )?;
            
            count += 1;
        }
    }
    
    tx.commit()?;
    Ok(count)
}

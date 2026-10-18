use app_lib::core::pg_db::create_pool;
use app_lib::core::legacy_db::connect_sql_server;
use chrono::NaiveDate;
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("Conectando ao Postgres...");
    let pool = create_pool().await.map_err(|e| anyhow::anyhow!(e))?;

    println!("Conectando ao SQL Server (ERP)...");
    let mut client = connect_sql_server(&pool).await?;
    println!("Conexao com SQL Server OK!");

    // 1. Importar Recebe_Insumos
    println!("\n=== IMPORTANDO Recebe_Insumos PARA erp_recebimentos_insumos ===");
    let q_receb = r#"
        SELECT 
            Registro,
            nCodFornec,
            CAST(cNomeF AS NVARCHAR(200)) AS cNomeF,
            NOTA,
            CONVERT(NVARCHAR(19), DATA_EMISSAO, 120) AS dEmissaoStr,
            CAST(cReferencia AS NVARCHAR(100)) AS cReferencia,
            CAST(cDescricao AS NVARCHAR(200)) AS cDescricao,
            CAST(UNIDADE AS NVARCHAR(50)) AS UNIDADE,
            CAST(QUANTIDADE AS FLOAT) AS QUANTIDADE,
            CAST(VALOR_UNITARIO AS FLOAT) AS VALOR_UNITARIO,
            CAST(VALOR_TOTAL AS FLOAT) AS VALOR_TOTAL,
            CONVERT(NVARCHAR(10), dEntrada, 120) AS dEntradaStr,
            CAST(cLoteFornec AS NVARCHAR(100)) AS cLoteFornec,
            CONVERT(NVARCHAR(10), dValidade, 120) AS dValidadeStr,
            CAST(cTipoReceb AS NVARCHAR(50)) AS cTipoReceb,
            CAST(cCodigoReceb AS NVARCHAR(100)) AS cCodigoReceb,
            CAST(cObservacoes AS NVARCHAR(MAX)) AS cObservacoes,
            CAST(cStatus AS NVARCHAR(50)) AS cStatus,
            CAST(cUsuario AS NVARCHAR(100)) AS cUsuario,
            nRegistro
        FROM Recebe_Insumos WITH (NOLOCK)
        ORDER BY Registro ASC
    "#;

    let stream = client.query(q_receb, &[]).await?;
    let rows = stream.into_first_result().await?;
    println!("Total de registros recebidos do SQL Server: {}", rows.len());

    let mut total_saved = 0;
    const CHUNK_SIZE: usize = 500;

    for chunk in rows.chunks(CHUNK_SIZE) {
        let mut v_registro: Vec<i32> = Vec::with_capacity(chunk.len());
        let mut v_cod_fornec: Vec<Option<i32>> = Vec::with_capacity(chunk.len());
        let mut v_fornec: Vec<Option<String>> = Vec::with_capacity(chunk.len());
        let mut v_nota: Vec<Option<i32>> = Vec::with_capacity(chunk.len());
        let mut v_emissao: Vec<Option<String>> = Vec::with_capacity(chunk.len());
        let mut v_cod_insumo: Vec<String> = Vec::with_capacity(chunk.len());
        let mut v_desc_insumo: Vec<String> = Vec::with_capacity(chunk.len());
        let mut v_unidade: Vec<Option<String>> = Vec::with_capacity(chunk.len());
        let mut v_qtd: Vec<f64> = Vec::with_capacity(chunk.len());
        let mut v_vlr_unit: Vec<Option<f64>> = Vec::with_capacity(chunk.len());
        let mut v_vlr_tot: Vec<Option<f64>> = Vec::with_capacity(chunk.len());
        let mut v_entrada: Vec<Option<NaiveDate>> = Vec::with_capacity(chunk.len());
        let mut v_lote: Vec<Option<String>> = Vec::with_capacity(chunk.len());
        let mut v_validade: Vec<Option<NaiveDate>> = Vec::with_capacity(chunk.len());
        let mut v_tipo: Vec<Option<String>> = Vec::with_capacity(chunk.len());
        let mut v_cod_receb: Vec<Option<String>> = Vec::with_capacity(chunk.len());
        let mut v_obs: Vec<Option<String>> = Vec::with_capacity(chunk.len());
        let mut v_status: Vec<Option<String>> = Vec::with_capacity(chunk.len());
        let mut v_usuario: Vec<Option<String>> = Vec::with_capacity(chunk.len());
        let mut v_num_reg: Vec<Option<i32>> = Vec::with_capacity(chunk.len());

        for r in chunk {
            let reg: i32 = r.get("Registro").unwrap_or(0);
            v_registro.push(reg);
            v_cod_fornec.push(r.get("nCodFornec"));
            v_fornec.push(r.get::<&str, _>("cNomeF").map(|s| s.trim().to_string()));
            v_nota.push(r.get("NOTA"));
            v_emissao.push(r.get::<&str, _>("dEmissaoStr").map(|s| s.to_string()));
            v_cod_insumo.push(r.get::<&str, _>("cReferencia").unwrap_or("").trim().to_string());
            v_desc_insumo.push(r.get::<&str, _>("cDescricao").unwrap_or("").trim().to_string());
            v_unidade.push(r.get::<&str, _>("UNIDADE").map(|s| s.trim().to_string()));
            v_qtd.push(r.get::<f64, _>("QUANTIDADE").unwrap_or(0.0));
            v_vlr_unit.push(r.get::<f64, _>("VALOR_UNITARIO"));
            v_vlr_tot.push(r.get::<f64, _>("VALOR_TOTAL"));

            let dt_ent = r.get::<&str, _>("dEntradaStr").and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());
            v_entrada.push(dt_ent);

            v_lote.push(r.get::<&str, _>("cLoteFornec").map(|s| s.trim().to_string()));

            let dt_val = r.get::<&str, _>("dValidadeStr").and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());
            v_validade.push(dt_val);

            v_tipo.push(r.get::<&str, _>("cTipoReceb").map(|s| s.trim().to_string()));
            v_cod_receb.push(r.get::<&str, _>("cCodigoReceb").map(|s| s.trim().to_string()));
            v_obs.push(r.get::<&str, _>("cObservacoes").map(|s| s.trim().to_string()));
            v_status.push(r.get::<&str, _>("cStatus").map(|s| s.trim().to_string()));
            v_usuario.push(r.get::<&str, _>("cUsuario").map(|s| s.trim().to_string()));
            v_num_reg.push(r.get("nRegistro"));
        }

        sqlx::query(
            r#"
            INSERT INTO erp_recebimentos_insumos (
                registro, cod_fornecedor, fornecedor, nota_fiscal,
                codigo_insumo, descricao_insumo, unidade, quantidade,
                valor_unitario, valor_total, data_entrada, lote_fornecedor,
                data_validade, tipo_recebimento, codigo_recebimento,
                observacoes, status_erp, usuario, num_registro, updated_at
            )
            SELECT 
                r, cf, f, nf,
                ci, di, u, q,
                vu, vt, de, lf,
                dv, tr, cr,
                ob, st, us, nr, NOW()
            FROM UNNEST(
                $1::int4[], $2::int4[], $3::text[], $4::int4[],
                $5::text[], $6::text[], $7::text[], $8::float8[],
                $9::float8[], $10::float8[], $11::date[], $12::text[],
                $13::date[], $14::text[], $15::text[],
                $16::text[], $17::text[], $18::text[], $19::int4[]
            ) AS t(r, cf, f, nf, ci, di, u, q, vu, vt, de, lf, dv, tr, cr, ob, st, us, nr)
            ON CONFLICT (registro) DO UPDATE SET
                cod_fornecedor = EXCLUDED.cod_fornecedor,
                fornecedor = EXCLUDED.fornecedor,
                nota_fiscal = EXCLUDED.nota_fiscal,
                codigo_insumo = EXCLUDED.codigo_insumo,
                descricao_insumo = EXCLUDED.descricao_insumo,
                unidade = EXCLUDED.unidade,
                quantidade = EXCLUDED.quantidade,
                valor_unitario = EXCLUDED.valor_unitario,
                valor_total = EXCLUDED.valor_total,
                data_entrada = EXCLUDED.data_entrada,
                lote_fornecedor = EXCLUDED.lote_fornecedor,
                data_validade = EXCLUDED.data_validade,
                tipo_recebimento = EXCLUDED.tipo_recebimento,
                codigo_recebimento = EXCLUDED.codigo_recebimento,
                observacoes = EXCLUDED.observacoes,
                status_erp = EXCLUDED.status_erp,
                usuario = EXCLUDED.usuario,
                num_registro = EXCLUDED.num_registro,
                updated_at = NOW()
            "#
        )
        .bind(&v_registro)
        .bind(&v_cod_fornec)
        .bind(&v_fornec)
        .bind(&v_nota)
        .bind(&v_cod_insumo)
        .bind(&v_desc_insumo)
        .bind(&v_unidade)
        .bind(&v_qtd)
        .bind(&v_vlr_unit)
        .bind(&v_vlr_tot)
        .bind(&v_entrada)
        .bind(&v_lote)
        .bind(&v_validade)
        .bind(&v_tipo)
        .bind(&v_cod_receb)
        .bind(&v_obs)
        .bind(&v_status)
        .bind(&v_usuario)
        .bind(&v_num_reg)
        .execute(&pool)
        .await?;

        total_saved += chunk.len();
        if total_saved % 2000 == 0 || total_saved == rows.len() {
            println!("  Progresso: {}/{} registros gravados no Postgres", total_saved, rows.len());
        }
    }

    println!("Sucesso! {} recebimentos sincronizados em erp_recebimentos_insumos.", total_saved);

    // 2. Importar Recebe_Insumos_Rel (Laudos do ERP)
    println!("\n=== IMPORTANDO Recebe_Insumos_Rel PARA recebimento_mp_laudos ===");
    let q_rel = r#"
        SELECT 
            Registro_Rel,
            Registro,
            CAST(cNomeF AS NVARCHAR(200)) AS cNomeF,
            NOTA,
            CAST(cReferencia AS NVARCHAR(100)) AS cReferencia,
            CAST(cDescricao AS NVARCHAR(200)) AS cDescricao,
            CAST(cLoteFornec AS NVARCHAR(100)) AS cLoteFornec,
            CONVERT(NVARCHAR(10), dRelatorio, 120) AS dRelatorioStr,
            CAST(cSituacao AS NVARCHAR(50)) AS cSituacao,
            CAST(cAnalista AS NVARCHAR(100)) AS cAnalista,
            CAST(cResponsavel AS NVARCHAR(100)) AS cResponsavel,
            CAST(cEspecificacao1 AS NVARCHAR(200)) AS cEspecificacao1,
            CAST(cResultado1 AS NVARCHAR(200)) AS cResultado1,
            CAST(cEspecificacao2 AS NVARCHAR(200)) AS cEspecificacao2,
            CAST(cResultado2 AS NVARCHAR(200)) AS cResultado2,
            CAST(cEspecificacao3 AS NVARCHAR(200)) AS cEspecificacao3,
            CAST(cResultado3 AS NVARCHAR(200)) AS cResultado3,
            CAST(cEspecificacao4 AS NVARCHAR(200)) AS cEspecificacao4,
            CAST(cResultado4 AS NVARCHAR(200)) AS cResultado4,
            CAST(mObservacoes AS NVARCHAR(MAX)) AS mObservacoes
        FROM Recebe_Insumos_Rel WITH (NOLOCK)
        ORDER BY Registro_Rel ASC
    "#;

    let rel_stream = client.query(q_rel, &[]).await?;
    let rel_rows = rel_stream.into_first_result().await?;
    println!("Total de laudos encontrados em Recebe_Insumos_Rel: {}", rel_rows.len());

    let mut laudos_importados = 0;
    for r in rel_rows {
        let rel_id: i32 = r.get("Registro_Rel").unwrap_or(0);
        let reg_erp: Option<i32> = r.get("Registro");
        let cod_laudo = format!("LAU-MP-ERP-{:04}", rel_id);

        let cod_insumo = r.get::<&str, _>("cReferencia").unwrap_or("").trim().to_string();
        let desc_insumo = r.get::<&str, _>("cDescricao").unwrap_or("").trim().to_string();
        let fornec = r.get::<&str, _>("cNomeF").unwrap_or("").trim().to_string();
        let nota: Option<i32> = r.get("NOTA");
        let lote = r.get::<&str, _>("cLoteFornec").unwrap_or("").trim().to_string();

        let dt_laudo = r.get::<&str, _>("dRelatorioStr")
            .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
            .unwrap_or_else(|| chrono::Local::now().date_naive());

        let sit = r.get::<&str, _>("cSituacao").unwrap_or("").trim().to_uppercase();
        let parecer = if sit == "AP" || sit == "APROVADO" {
            "APROVADO"
        } else if sit == "REP" || sit == "REPROVADO" {
            "REPROVADO"
        } else {
            "APROVADO"
        };

        let resp = r.get::<&str, _>("cResponsavel")
            .or_else(|| r.get::<&str, _>("cAnalista"))
            .unwrap_or("CQ")
            .trim()
            .to_string();

        let mut testes = Vec::new();
        for i in 1..=4 {
            let esp_key = format!("cEspecificacao{}", i);
            let res_key = format!("cResultado{}", i);
            if let Some(esp) = r.get::<&str, _>(esp_key.as_str()) {
                let esp_clean = esp.trim();
                if !esp_clean.is_empty() {
                    let res_clean = r.get::<&str, _>(res_key.as_str()).unwrap_or("").trim();
                    testes.push(json!({
                        "ensaio": esp_clean,
                        "especificacao": "",
                        "resultado": res_clean,
                        "conforme": true
                    }));
                }
            }
        }

        let obs = r.get::<&str, _>("mObservacoes").map(|s| s.trim().to_string());

        // Se reg_erp existir, buscar data_entrada e quantidade do recebimento
        let (data_entrada, quantidade, unidade, cod_receb) = if let Some(reg) = reg_erp {
            let row = sqlx::query(
                "SELECT data_entrada, CAST(quantidade AS FLOAT8) as qtd, unidade, codigo_recebimento FROM erp_recebimentos_insumos WHERE registro = $1"
            )
            .bind(reg)
            .fetch_optional(&pool)
            .await?;
            if let Some(rw) = row {
                let dt: Option<NaiveDate> = sqlx::Row::get(&rw, "data_entrada");
                let q: f64 = sqlx::Row::get(&rw, "qtd");
                let u: Option<String> = sqlx::Row::get(&rw, "unidade");
                let cr: Option<String> = sqlx::Row::get(&rw, "codigo_recebimento");
                (
                    dt.unwrap_or(dt_laudo),
                    q,
                    u.unwrap_or_else(|| "KG".to_string()),
                    cr,
                )
            } else {
                (dt_laudo, 0.0, "KG".to_string(), None)
            }
        } else {
            (dt_laudo, 0.0, "KG".to_string(), None)
        };

        sqlx::query(
            r#"
            INSERT INTO recebimento_mp_laudos (
                codigo_laudo, registro_erp, codigo_recebimento,
                codigo_insumo, descricao_insumo, fornecedor, nota_fiscal,
                lote_fornecedor, quantidade, unidade, data_entrada,
                data_laudo, parecer, responsavel_cq, testes, observacoes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (codigo_laudo) DO UPDATE SET
                registro_erp = EXCLUDED.registro_erp,
                codigo_recebimento = EXCLUDED.codigo_recebimento,
                codigo_insumo = EXCLUDED.codigo_insumo,
                descricao_insumo = EXCLUDED.descricao_insumo,
                fornecedor = EXCLUDED.fornecedor,
                nota_fiscal = EXCLUDED.nota_fiscal,
                lote_fornecedor = EXCLUDED.lote_fornecedor,
                quantidade = EXCLUDED.quantidade,
                unidade = EXCLUDED.unidade,
                data_entrada = EXCLUDED.data_entrada,
                data_laudo = EXCLUDED.data_laudo,
                parecer = EXCLUDED.parecer,
                responsavel_cq = EXCLUDED.responsavel_cq,
                testes = EXCLUDED.testes,
                observacoes = EXCLUDED.observacoes,
                updated_at = NOW()
            "#
        )
        .bind(&cod_laudo)
        .bind(reg_erp)
        .bind(&cod_receb)
        .bind(&cod_insumo)
        .bind(&desc_insumo)
        .bind(&fornec)
        .bind(nota)
        .bind(&lote)
        .bind(quantidade)
        .bind(&unidade)
        .bind(data_entrada)
        .bind(dt_laudo)
        .bind(parecer)
        .bind(&resp)
        .bind(json!(testes))
        .bind(&obs)
        .execute(&pool)
        .await?;

        laudos_importados += 1;
    }

    println!("Sucesso! {} laudos importados do ERP para recebimento_mp_laudos.", laudos_importados);
    Ok(())
}

use serde::Serialize;
use sqlx::{PgPool, Postgres, Row, Transaction};
use crate::core::acao::{executar_em_2_passos, ErroApi, RespostaAcao};
use super::models::{
    valor_novo, Campo,
    AcompanhamentoLoteItem, SaveLoteCustomStatusPayload, AcompanhamentoQueryParams, 
    StatusHistoryEntry, TerceirizadoSolicitacaoItem, CreateTerceirizadoSolicitacaoPayload,
    ProgramacaoEnvaseItem, SaveProgramacaoEnvasePayload, ReorderProgramacaoEnvasePayload,
    ProgramacaoRotulagemItem, SaveProgramacaoRotulagemPayload, ReorderProgramacaoRotulagemPayload,
    SaveFichaOrdemPayload, SaveLoteTimestampsPayload, SaveLoteEtapaStatusPayload
};

pub async fn list_acompanhamento(
    pool: &PgPool,
    params: &AcompanhamentoQueryParams,
) -> Result<Vec<AcompanhamentoLoteItem>, String> {
    let has_search = params.search.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false);
    let search_open = if has_search { "TRUE" } else { "FALSE" };

    let search_union = if has_search {
        r#"
            UNION ALL
            SELECT 
                sm.document_number,
                NULL::text AS planning_id,
                sm.item_code,
                sm.quantity,
                sm.date,
                NULL::text AS data_planejada,
                sm.details,
                'Produção' AS default_category,
                NULL::text AS planning_descricao,
                NULL::int4 AS planning_ordem,
                NULL::text AS reator_id
            FROM stock_movements sm
            WHERE sm.item_type = 'produto' AND sm.movement_type = 'entrada'
              AND NOT EXISTS (
                  SELECT 1 FROM producao_planejamento_semanal pp3
                  WHERE (pp3.lote_erp IS NOT NULL AND TRIM(pp3.lote_erp) = sm.document_number)
                     OR pp3.id = sm.document_number
              )
              AND NOT EXISTS (
                  SELECT 1 FROM lote_custom_status c3
                  WHERE c3.lote_number = sm.document_number
              )
            UNION ALL
            SELECT
                ell.lote,
                NULL::text AS planning_id,
                ell.product_code,
                COALESCE(ell.quantidade_kg, 0)::float8,
                SUBSTRING(COALESCE(ell.data_lote, '') FROM 1 FOR 10),
                NULL::text AS data_planejada,
                'Laudo ERP',
                'Produção' AS default_category,
                p_ell.descricao AS planning_descricao,
                NULL::int4 AS planning_ordem,
                NULL::text AS reator_id
            FROM erp_lotes_laudos ell
            LEFT JOIN produtos p_ell ON ell.product_code = p_ell.codigo
            WHERE NOT EXISTS (
                  SELECT 1 FROM lote_custom_status c4
                  WHERE c4.lote_number = ell.lote
              )
              AND NOT EXISTS (
                  SELECT 1 FROM producao_planejamento_semanal pp4
                  WHERE (pp4.lote_erp IS NOT NULL AND TRIM(pp4.lote_erp) = ell.lote)
                     OR pp4.id = ell.lote
              )
        "#
    } else {
        ""
    };

    let sql = format!(
        r#"
        SELECT 
            m.document_number AS lote_number,
            m.item_code,
            COALESCE(p.descricao, m.planning_descricao, m.item_code) AS descricao,
            m.quantity AS kg,
            m.date,
            m.details,
            m.planning_ordem,
            m.reator_id,
            m.planning_id,
            CASE
                WHEN m.planning_id IS NOT NULL AND (c.custom_status IS NULL OR c.custom_status IN ('Aberto', 'Pendente', 'Produzido', 'Finalizada', 'Ordem Finalizada')) THEN 'Pesagem'
                ELSE COALESCE(c.custom_status, 'Pesagem')
            END AS custom_status,
            CASE 
                WHEN m.default_category = 'Caldeira' THEN 'Caldeira'
                ELSE COALESCE(c.category, m.default_category, 'Produção')
            END AS category,
            c.updated_by,
            to_char(c.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
            c.notes,
            COALESCE(
                to_char(c.data_pesagem AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS"-03:00"'),
                m.data_planejada || 'T08:00:00Z',
                m.date || 'T08:00:00Z'
            ) AS data_pesagem,
            COALESCE(
                to_char(c.data_producao AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS"-03:00"'),
                m.data_planejada || 'T08:00:00Z',
                m.date || 'T08:00:00Z'
            ) AS data_producao,
            to_char(c.data_liberado_envase AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS"-03:00"') AS data_liberado_envase,
            to_char(c.data_envase AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS"-03:00"') AS data_envase,
            to_char(c.data_rotulagem AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS"-03:00"') AS data_rotulagem,
            to_char(c.data_finalizada AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS"-03:00"') AS data_finalizada,
            to_char(c.data_em_espera AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS"-03:00"') AS data_em_espera,
            COALESCE(
                to_char(c.data_previsao AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS"-03:00"'),
                m.data_planejada || 'T08:00:00Z',
                m.date || 'T08:00:00Z'
            ) AS data_previsao,
            c.motivo_espera,
            c.ficha_ordem,
            c.quantidade_envasada_parcial::float8 AS quantidade_envasada_parcial,
            c.insumo_faltante_codigo,
            c.insumo_faltante_descricao,
            c.fornecedor_terceirizado,
            c.historico_reagendamentos,
            c.quadros_ocultos,
            c.etapas_status,
            COALESCE(c.is_terceirizado, FALSE) OR (ovr.terceirizado_modo IS NOT NULL) OR EXISTS (
                SELECT 1 FROM terceirizados_solicitacoes ts 
                WHERE ts.status != 'CANCELADO' 
                AND ts.lote_number = m.document_number
            ) AS is_terceirizado
        FROM (
            SELECT 
                COALESCE(NULLIF(TRIM(pp.lote_erp), ''), pp.id) AS document_number,
                pp.id AS planning_id,
                COALESCE(sm.item_code, pp.codigo_produto) AS item_code,
                COALESCE(sm.quantity, pp.quantidade_planejada::float8) AS quantity,
                COALESCE(
                    to_char(pp.data_planejada, 'YYYY-MM-DD'),
                    SUBSTRING(sm.date FROM 1 FOR 10),
                    SUBSTRING(ell.data_lote FROM 1 FOR 10),
                    to_char(pp.created_at, 'YYYY-MM-DD')
                ) AS date,
                to_char(pp.data_planejada, 'YYYY-MM-DD') AS data_planejada,
                COALESCE(
                    sm.details || ' | Planejamento Semanal | Reator: ' || COALESCE(pp.reator_id, '') || ' | Processo: ' || COALESCE(pp.processo_termico, ''),
                    'Status: PG | ' || 
                    CASE 
                        WHEN pp.observacoes ~* '~[0-9.,]+\s*un' THEN 
                            'Unidades: ' || REPLACE(REPLACE(substring(pp.observacoes from '~([0-9.,]+)\s*un'), '.', ''), ',', '.') || ' | '
                        ELSE 
                            'Unidades: ' || ROUND(COALESCE(sm.quantity, pp.quantidade_planejada::float8) / NULLIF(
                                COALESCE(NULLIF(
                                    CASE WHEN pw.mt IS NULL THEN NULL
                                         ELSE REPLACE((pw.mt)[1], ',', '.')::float8 * (CASE WHEN (pw.mt)[2] IN ('KG', 'L') THEN 1.0 ELSE 0.001 END)
                                    END, 0), 1.0), 0
                            ))::text || ' | '
                    END ||
                    'Planejamento Semanal | Reator: ' || COALESCE(pp.reator_id, '') || ' | Processo: ' || COALESCE(pp.processo_termico, '') || ' | Ordem: ' || COALESCE(pp.ordem_sequencia, 1)::text
                ) AS details,
                CASE 
                    WHEN pp.processo_termico IN ('caldeira', 'agua_caldeira', 'quente') OR pp.reator_id ILIKE '%caldeira%' THEN 'Caldeira'
                    ELSE 'Produção'
                END AS default_category,
                COALESCE(sm.item_descricao, pp.descricao) AS planning_descricao,
                COALESCE(pp.ordem_sequencia, 1)::int4 AS planning_ordem,
                NULLIF(TRIM(pp.reator_id), '') AS reator_id
            FROM producao_planejamento_semanal pp
            LEFT JOIN produtos p_calc ON pp.codigo_produto = p_calc.codigo
            -- peso unitário: primeira medida da descrição como token (350ML não casa 50ML; 2,5L não casa 5L), igual ao front
            LEFT JOIN LATERAL (
                SELECT regexp_match(UPPER(COALESCE(p_calc.descricao, pp.descricao, '')), '(\d+(?:[.,]\d+)?)\s*(ML|L|GR|G|KG)\y') AS mt
            ) pw ON TRUE
            LEFT JOIN erp_lotes_laudos ell ON (pp.lote_erp IS NOT NULL AND TRIM(pp.lote_erp) != '' AND ell.lote = TRIM(pp.lote_erp) AND (ell.product_code = pp.codigo_produto OR ell.product_code IS NULL))
            LEFT JOIN (
                SELECT sm2.document_number, sm2.item_code, sm2.quantity, sm2.date, sm2.details, p2.descricao AS item_descricao
                FROM stock_movements sm2
                LEFT JOIN produtos p2 ON sm2.item_code = p2.codigo
                WHERE sm2.item_type = 'produto' AND sm2.movement_type = 'entrada'
            ) sm ON (pp.lote_erp IS NOT NULL AND TRIM(pp.lote_erp) != '' AND sm.document_number = TRIM(pp.lote_erp) AND (sm.item_code = pp.codigo_produto OR sm.item_code IS NULL))
            WHERE (pp.ordem_status IS NULL OR pp.ordem_status != 'cancelado')

            UNION ALL

            SELECT 
                c.lote_number AS document_number,
                NULL::text AS planning_id,
                COALESCE(sm.item_code, ell.product_code, '') AS item_code,
                COALESCE(sm.quantity, ell.quantidade_kg, 0)::float8 AS quantity,
                COALESCE(SUBSTRING(sm.date FROM 1 FOR 10), SUBSTRING(ell.data_lote FROM 1 FOR 10), to_char(c.updated_at, 'YYYY-MM-DD')) AS date,
                NULL::text AS data_planejada,
                COALESCE(sm.details, 'Status: PG') AS details,
                COALESCE(c.category, 'Produção') AS default_category,
                COALESCE(sm.item_descricao, p_ell.descricao) AS planning_descricao,
                NULL::int4 AS planning_ordem,
                NULL::text AS reator_id
            FROM lote_custom_status c
            LEFT JOIN (
                SELECT sm2.document_number, sm2.item_code, sm2.quantity, sm2.date, sm2.details, p2.descricao AS item_descricao
                FROM stock_movements sm2
                LEFT JOIN produtos p2 ON sm2.item_code = p2.codigo
                WHERE sm2.item_type = 'produto' AND sm2.movement_type = 'entrada'
            ) sm ON (sm.document_number = c.lote_number)
            LEFT JOIN erp_lotes_laudos ell ON (ell.lote = c.lote_number)
            LEFT JOIN produtos p_ell ON (ell.product_code = p_ell.codigo)
            WHERE c.custom_status NOT IN ('Finalizada', 'Ordem Finalizada')
              AND (
                {}
                OR (
                -- 1. Lotes pausados / em espera (permanecem ativos nas filas)
                (c.motivo_espera IS NOT NULL AND TRIM(c.motivo_espera) != '')
                OR c.custom_status IN ('Em Espera', 'Pausado', 'Ordem Parcial')
                OR (c.etapas_status IS NOT NULL AND (c.etapas_status::text ILIKE '%"isEspera":true%' OR c.etapas_status::text ILIKE '%"isEspera": true%'))

                -- 2. Lotes liberados para envase ou com etapa em andamento/programada
                OR (c.data_liberado_envase IS NOT NULL)
                OR (c.custom_status = 'Liberado para Envase')
                OR (c.custom_status IN ('Produzido', 'Envase', 'Rotulagem', 'Pesagem', 'Produção'))
                OR EXISTS (SELECT 1 FROM programacao_envase pe WHERE pe.lote_number = c.lote_number)
                OR EXISTS (SELECT 1 FROM programacao_rotulagem pr WHERE pr.lote_number = c.lote_number)

                -- 3. Lotes adicionados manualmente para hoje ou no futuro
                OR (c.adicionado_manualmente_em IS NOT NULL AND c.adicionado_manualmente_em >= CURRENT_DATE)
                )
              )
              AND NOT EXISTS (
                  SELECT 1 FROM producao_planejamento_semanal pp2
                  WHERE (pp2.lote_erp IS NOT NULL AND TRIM(pp2.lote_erp) = c.lote_number)
                     OR pp2.id = c.lote_number
              )
            {}
        ) m
        LEFT JOIN produtos p ON m.item_code = p.codigo
        LEFT JOIN LATERAL (
            SELECT c.*
            FROM lote_custom_status c
            WHERE c.lote_number = m.document_number
               OR (m.planning_id IS NOT NULL AND c.lote_number = m.planning_id)
            ORDER BY (CASE WHEN c.lote_number = m.document_number THEN 0 ELSE 1 END) ASC
            LIMIT 1
        ) c ON TRUE
        LEFT JOIN overrides_produtos ovr ON m.item_code = ovr.codigo
        WHERE 1=1
        "#,
        search_open,
        search_union
    );

    let mut qb = sqlx::QueryBuilder::new(sql);

    if params.apenas_terceirizados == Some(true) {
        qb.push(" AND (COALESCE(c.is_terceirizado, FALSE) = TRUE OR ovr.terceirizado_modo IS NOT NULL OR c.category ILIKE '%terceir%' OR EXISTS (SELECT 1 FROM terceirizados_solicitacoes ts WHERE ts.status != 'CANCELADO' AND ts.lote_number = m.document_number))");
    }

    if let Some(ref search) = params.search {
        if !search.trim().is_empty() {
            let pattern = format!("%{}%", search.trim());
            qb.push(" AND (m.document_number ILIKE ");
            qb.push_bind(pattern.clone());
            qb.push(" OR m.item_code ILIKE ");
            qb.push_bind(pattern.clone());
            qb.push(" OR p.descricao ILIKE ");
            qb.push_bind(pattern.clone());
            qb.push(" OR c.updated_by ILIKE ");
            qb.push_bind(pattern.clone());
            qb.push(" OR c.motivo_espera ILIKE ");
            qb.push_bind(pattern);
            qb.push(")");
        }
    }

    if let Some(ref cat) = params.categoria {
        if !cat.trim().is_empty() && cat != "ALL" {
            qb.push(" AND (CASE WHEN m.default_category = 'Caldeira' THEN 'Caldeira' ELSE COALESCE(c.category, m.default_category, 'Produção') END) = ");
            qb.push_bind(cat.trim().to_string());
        }
    }

    if let Some(ref st) = params.status_nosso {
        if !st.trim().is_empty() && st != "ALL" {
            if st == "PENDENTE" {
                qb.push(" AND c.custom_status IS NULL");
            } else {
                qb.push(" AND c.custom_status = ");
                qb.push_bind(st.trim().to_string());
            }
        }
    }

    if let Some(ref start) = params.date_start {
        if !start.trim().is_empty() {
            qb.push(" AND m.date >= ");
            qb.push_bind(start.trim().to_string());
        }
    }

    if let Some(ref end) = params.date_end {
        if !end.trim().is_empty() {
            qb.push(" AND m.date <= ");
            qb.push_bind(end.trim().to_string());
        }
    }

    qb.push(" ORDER BY CASE WHEN (c.custom_status IS NOT NULL AND c.custom_status != 'Ordem Finalizada' AND c.custom_status != 'Finalizada') OR c.data_previsao IS NOT NULL THEN 0 ELSE 1 END, m.date DESC");
    let limit = params.limit.unwrap_or(2500).clamp(1, 5000);
    qb.push(format!(" LIMIT {}", limit));

    let rows = qb.build().fetch_all(pool).await
        .map_err(|e| format!("Erro ao consultar acompanhamento de produção: {e}"))?;

    let mut items = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for row in rows {
        let lote_number: String = row.try_get::<Option<String>, _>("lote_number").ok().flatten().unwrap_or_default();
        let product_code: String = row.try_get::<Option<String>, _>("item_code").ok().flatten().unwrap_or_default();
        if !lote_number.is_empty() && !product_code.is_empty() && !seen.insert((lote_number.clone(), product_code.clone())) {
            continue;
        }
        let product_description: String = row.try_get::<Option<String>, _>("descricao").ok().flatten().unwrap_or_default();
        let kg: f64 = row.try_get::<Option<f64>, _>("kg").ok().flatten().unwrap_or(0.0);
        let date: String = row.try_get::<Option<String>, _>("date").ok().flatten().unwrap_or_default();
        let details: String = row.try_get::<Option<String>, _>("details").ok().flatten().unwrap_or_default();
        let mut custom_status: Option<String> = row.try_get::<Option<String>, _>("custom_status").ok().flatten();
        if let Some(ref s) = custom_status {
            if s == "Produção" {
                custom_status = Some("Produzido".to_string());
            } else if s == "Finalizada" {
                custom_status = Some("Ordem Finalizada".to_string());
            }
        }
        let category: Option<String> = row.try_get::<Option<String>, _>("category").ok().flatten();
        let updated_by: Option<String> = row.try_get::<Option<String>, _>("updated_by").ok().flatten();
        let updated_at: Option<String> = row.try_get::<Option<String>, _>("updated_at").ok().flatten();
        let notes: Option<String> = row.try_get::<Option<String>, _>("notes").ok().flatten();
        let data_pesagem: Option<String> = row.try_get::<Option<String>, _>("data_pesagem").ok().flatten();
        let data_producao: Option<String> = row.try_get::<Option<String>, _>("data_producao").ok().flatten();
        let data_liberado_envase: Option<String> = row.try_get::<Option<String>, _>("data_liberado_envase").ok().flatten();
        let data_envase: Option<String> = row.try_get::<Option<String>, _>("data_envase").ok().flatten();
        let data_rotulagem: Option<String> = row.try_get::<Option<String>, _>("data_rotulagem").ok().flatten();
        let data_finalizada: Option<String> = row.try_get::<Option<String>, _>("data_finalizada").ok().flatten();
        let data_em_espera: Option<String> = row.try_get::<Option<String>, _>("data_em_espera").ok().flatten();
        let data_previsao: Option<String> = row.try_get::<Option<String>, _>("data_previsao").ok().flatten();
        let motivo_espera: Option<String> = row.try_get::<Option<String>, _>("motivo_espera").ok().flatten();
        let is_terceirizado: bool = row.try_get::<Option<bool>, _>("is_terceirizado").ok().flatten().unwrap_or(false);
        let ficha_ordem: Option<serde_json::Value> = row.try_get::<Option<serde_json::Value>, _>("ficha_ordem").ok().flatten();
        let quantidade_envasada_parcial: Option<f64> = row.try_get::<Option<f64>, _>("quantidade_envasada_parcial").ok().flatten();
        let insumo_faltante_codigo: Option<String> = row.try_get::<Option<String>, _>("insumo_faltante_codigo").ok().flatten();
        let insumo_faltante_descricao: Option<String> = row.try_get::<Option<String>, _>("insumo_faltante_descricao").ok().flatten();
        let fornecedor_terceirizado: Option<String> = row.try_get::<Option<String>, _>("fornecedor_terceirizado").ok().flatten();
        let historico_reagendamentos: Option<serde_json::Value> = row.try_get::<Option<serde_json::Value>, _>("historico_reagendamentos").ok().flatten();
        let quadros_ocultos: Option<serde_json::Value> = row.try_get::<Option<serde_json::Value>, _>("quadros_ocultos").ok().flatten();
        let etapas_status: Option<serde_json::Value> = row.try_get::<Option<serde_json::Value>, _>("etapas_status").ok().flatten();
        let planning_ordem: Option<i32> = row.try_get::<Option<i32>, _>("planning_ordem").ok().flatten();
        let reator_id: Option<String> = row.try_get::<Option<String>, _>("reator_id").ok().flatten()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let planning_id: Option<String> = row.try_get::<Option<String>, _>("planning_id").ok().flatten();

        // Extrai Unidades de details (se presente)
        let mut unidades: Option<f64> = None;
        let mut erp_code = if details.contains("Planejamento Semanal") || custom_status.as_deref() == Some("Pesagem") {
            "PG".to_string()
        } else {
            "EA".to_string()
        };

        for part in details.split('|') {
            let part = part.trim();
            if part.starts_with("Status:") {
                erp_code = part.trim_start_matches("Status:").trim().to_string();
            } else if part.starts_with("Unidades:") {
                if let Ok(u) = part.trim_start_matches("Unidades:").trim().parse::<f64>() {
                    if u > 0.0 {
                        unidades = Some(u);
                    }
                }
            }
        }

        if details.contains("Planejamento Semanal") && erp_code == "EA" {
            erp_code = "PG".to_string();
        }

        let erp_label = match erp_code.as_str() {
            "EA" => "Concluído (EA)".to_string(),
            "CA" => "Cancelado (CA)".to_string(),
            "PG" => "Pesagem (PG)".to_string(),
            "PP" => "Produção (PP)".to_string(),
            "PR" => "Produzido (PR)".to_string(),
            "EN" => "Envase (EN)".to_string(),
            "CF" => "Conferido (CF)".to_string(),
            _ => erp_code.clone(),
        };

        let final_unidades = match unidades {
            Some(u) => u,
            None => {
                let unit_w = parse_product_unit_weight_kg(&product_description);
                if unit_w > 0.0 && kg > 0.0 {
                    (kg / unit_w).round()
                } else {
                    kg
                }
            }
        };

        items.push(AcompanhamentoLoteItem {
            lote_number,
            product_code,
            product_description,
            quantity: final_unidades,
            quantity_kg: kg,
            date,
            details: Some(details),
            erp_status: erp_code,
            erp_status_label: erp_label,
            custom_status,
            category,
            updated_by,
            updated_at,
            notes,
            data_pesagem,
            data_producao,
            data_liberado_envase,
            data_envase,
            data_rotulagem,
            data_finalizada,
            data_em_espera,
            data_previsao,
            motivo_espera,
            is_terceirizado,
            ficha_ordem,
            quantidade_envasada_parcial,
            insumo_faltante_codigo,
            insumo_faltante_descricao,
            fornecedor_terceirizado,
            historico_reagendamentos,
            quadros_ocultos,
            etapas_status,
            planning_ordem,
            reator_id,
            planning_id,
        });
    }

    Ok(items)
}

type Tx<'a> = Transaction<'a, Postgres>;

fn normalizar_status(s: &str) -> String {
    match s.trim() {
        "Produção" => "Produzido".to_string(),
        "Finalizada" => "Ordem Finalizada".to_string(),
        outro => outro.to_string(),
    }
}

/// Registra uma transição no histórico do lote. Falha aqui desfaz a gravação inteira (não se ignora mais o erro).
async fn gravar_historico(
    tx: &mut Tx<'_>,
    lote: &str,
    status: &str,
    category: Option<&str>,
    autor: Option<&str>,
    notes: Option<&str>,
) -> Result<(), ErroApi> {
    sqlx::query(
        r#"
        INSERT INTO lote_status_history (lote_number, status, category, changed_by, changed_at, notes)
        VALUES ($1, $2, $3, $4, NOW(), $5)
        "#,
    )
    .bind(lote)
    .bind(status)
    .bind(category)
    .bind(autor)
    .bind(notes)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// Grava o status do lote. Campos ausentes preservam o que já está gravado (`category`, `motivoEspera`, insumo
/// faltante); `null` explícito limpa. Escreve o histórico (com o status anterior) na mesma transação.
pub async fn upsert_status_tx(tx: &mut Tx<'_>, payload: &SaveLoteCustomStatusPayload) -> Result<(), ErroApi> {
    if payload.lote_number.trim().is_empty() {
        return Err(ErroApi::invalido("Informe o lote."));
    }
    let is_terceirizado_val = payload.is_terceirizado.unwrap_or(false);

    let anterior: Option<String> = sqlx::query_scalar(
        "SELECT custom_status FROM lote_custom_status WHERE lote_number = $1 FOR UPDATE",
    )
    .bind(&payload.lote_number)
    .fetch_optional(&mut **tx)
    .await?;
    let mut normalized_status = normalizar_status(&payload.custom_status);
    if normalized_status.is_empty() {
        normalized_status = anterior.clone().unwrap_or_else(|| "Aberto".to_string());
    }

    let category_efetiva: Option<String> = sqlx::query_scalar(
        r#"
        INSERT INTO lote_custom_status (
            lote_number, custom_status, category, updated_by, updated_at, notes,
            data_pesagem, data_producao, data_liberado_envase, data_envase, data_rotulagem, data_finalizada, data_em_espera,
            motivo_espera, is_terceirizado, ficha_ordem, quantidade_envasada_parcial,
            insumo_faltante_codigo, insumo_faltante_descricao, fornecedor_terceirizado
        )
        VALUES (
            $1, $2, $3, $4, NOW(), $5,
            CASE WHEN $2 IN ('Pesagem', 'Produção', 'Produzido', 'Liberado para Envase', 'Envase', 'Rotulagem') THEN NOW() ELSE NULL END,
            CASE WHEN $2 IN ('Produção', 'Produzido') THEN NOW() ELSE NULL END,
            CASE WHEN $2 = 'Liberado para Envase' THEN NOW() ELSE NULL END,
            CASE WHEN $2 IN ('Envase', 'Ordem Parcial') THEN NOW() ELSE NULL END,
            CASE WHEN $2 = 'Rotulagem' THEN NOW() ELSE NULL END,
            CASE WHEN $2 IN ('Finalizada', 'Ordem Finalizada') THEN NOW() ELSE NULL END,
            CASE WHEN $6 IS NOT NULL THEN NOW() ELSE NULL END,
            $6, $7, $8, $9,
            $10, $11, $12
        )
        ON CONFLICT (lote_number) DO UPDATE SET
            custom_status = EXCLUDED.custom_status,
            category = CASE WHEN $13 THEN EXCLUDED.category ELSE lote_custom_status.category END,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW(),
            notes = COALESCE(EXCLUDED.notes, lote_custom_status.notes),
            data_pesagem = CASE WHEN EXCLUDED.custom_status IN ('Pesagem', 'Produção', 'Produzido', 'Liberado para Envase', 'Envase', 'Rotulagem') THEN COALESCE(lote_custom_status.data_pesagem, NOW()) ELSE lote_custom_status.data_pesagem END,
            data_producao = CASE WHEN EXCLUDED.custom_status IN ('Produção', 'Produzido') THEN COALESCE(lote_custom_status.data_producao, NOW()) ELSE lote_custom_status.data_producao END,
            data_liberado_envase = CASE WHEN EXCLUDED.custom_status = 'Liberado para Envase' THEN COALESCE(lote_custom_status.data_liberado_envase, NOW()) ELSE lote_custom_status.data_liberado_envase END,
            data_envase = CASE WHEN EXCLUDED.custom_status IN ('Envase', 'Ordem Parcial') THEN COALESCE(lote_custom_status.data_envase, NOW()) ELSE lote_custom_status.data_envase END,
            data_rotulagem = CASE WHEN EXCLUDED.custom_status = 'Rotulagem' THEN COALESCE(lote_custom_status.data_rotulagem, NOW()) ELSE lote_custom_status.data_rotulagem END,
            data_finalizada = CASE WHEN EXCLUDED.custom_status IN ('Finalizada', 'Ordem Finalizada') THEN COALESCE(lote_custom_status.data_finalizada, NOW()) ELSE lote_custom_status.data_finalizada END,
            data_em_espera = CASE WHEN $14
                THEN (CASE WHEN EXCLUDED.motivo_espera IS NOT NULL THEN COALESCE(lote_custom_status.data_em_espera, NOW()) ELSE NULL END)
                ELSE lote_custom_status.data_em_espera END,
            motivo_espera = CASE WHEN $14 THEN EXCLUDED.motivo_espera ELSE lote_custom_status.motivo_espera END,
            is_terceirizado = CASE WHEN $7 THEN TRUE ELSE lote_custom_status.is_terceirizado END,
            ficha_ordem = COALESCE(EXCLUDED.ficha_ordem, lote_custom_status.ficha_ordem),
            quantidade_envasada_parcial = COALESCE(EXCLUDED.quantidade_envasada_parcial, lote_custom_status.quantidade_envasada_parcial),
            insumo_faltante_codigo = CASE WHEN $15 THEN EXCLUDED.insumo_faltante_codigo ELSE lote_custom_status.insumo_faltante_codigo END,
            insumo_faltante_descricao = CASE WHEN $16 THEN EXCLUDED.insumo_faltante_descricao ELSE lote_custom_status.insumo_faltante_descricao END,
            fornecedor_terceirizado = COALESCE(EXCLUDED.fornecedor_terceirizado, lote_custom_status.fornecedor_terceirizado)
        RETURNING category
        "#
    )
    .bind(&payload.lote_number)
    .bind(&normalized_status)
    .bind(valor_novo(&payload.category))
    .bind(&payload.updated_by)
    .bind(&payload.notes)
    .bind(valor_novo(&payload.motivo_espera))
    .bind(is_terceirizado_val)
    .bind(&payload.ficha_ordem)
    .bind(payload.quantidade_envasada_parcial)
    .bind(valor_novo(&payload.insumo_faltante_codigo))
    .bind(valor_novo(&payload.insumo_faltante_descricao))
    .bind(&payload.fornecedor_terceirizado)
    .bind(payload.category.is_some())
    .bind(payload.motivo_espera.is_some())
    .bind(payload.insumo_faltante_codigo.is_some())
    .bind(payload.insumo_faltante_descricao.is_some())
    .fetch_one(&mut **tx)
    .await?;

    if normalized_status == "Ordem Finalizada" {
        sqlx::query("DELETE FROM programacao_envase WHERE lote_number = $1")
            .bind(&payload.lote_number)
            .execute(&mut **tx)
            .await?;
    }

    // Histórico de transições, com o status anterior
    let mut partes: Vec<String> = Vec::new();
    if let Some(ref a) = anterior {
        partes.push(format!("Anterior: {a}"));
    }
    if let Some(n) = valor_novo(&payload.motivo_espera).or_else(|| payload.notes.clone()) {
        partes.push(n);
    }
    let history_notes = if partes.is_empty() { None } else { Some(partes.join(" | ")) };
    gravar_historico(
        tx,
        &payload.lote_number,
        &normalized_status,
        category_efetiva.as_deref(),
        payload.updated_by.as_deref(),
        history_notes.as_deref(),
    )
    .await
}

pub async fn upsert_status(pool: &PgPool, payload: &SaveLoteCustomStatusPayload) -> Result<(), ErroApi> {
    let mut tx = pool.begin().await?;
    upsert_status_tx(&mut tx, payload).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn save_ficha_ordem(
    pool: &PgPool,
    payload: &SaveFichaOrdemPayload,
) -> Result<(), ErroApi> {
    if payload.lote_number.trim().is_empty() {
        return Err(ErroApi::invalido("Informe o lote."));
    }
    let normalized_status = payload.custom_status.as_deref().map(normalizar_status).filter(|s| !s.is_empty());

    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        INSERT INTO lote_custom_status (
            lote_number, custom_status, updated_by, updated_at,
            ficha_ordem, quantidade_envasada_parcial,
            data_finalizada, data_envase
        )
        VALUES (
            $1, COALESCE($2, 'Pendente'), $3, NOW(),
            $4, $5,
            CASE WHEN $2 IN ('Finalizada', 'Ordem Finalizada') THEN NOW() ELSE NULL END,
            CASE WHEN $2 IN ('Envase', 'Ordem Parcial') THEN NOW() ELSE NULL END
        )
        ON CONFLICT (lote_number) DO UPDATE SET
            ficha_ordem = EXCLUDED.ficha_ordem,
            quantidade_envasada_parcial = COALESCE(EXCLUDED.quantidade_envasada_parcial, lote_custom_status.quantidade_envasada_parcial),
            updated_by = COALESCE(EXCLUDED.updated_by, lote_custom_status.updated_by),
            updated_at = NOW(),
            custom_status = CASE 
                WHEN EXCLUDED.custom_status IS NOT NULL AND EXCLUDED.custom_status != 'Pendente' THEN EXCLUDED.custom_status 
                ELSE lote_custom_status.custom_status 
            END,
            data_finalizada = CASE 
                WHEN EXCLUDED.custom_status IN ('Finalizada', 'Ordem Finalizada') THEN COALESCE(lote_custom_status.data_finalizada, NOW()) 
                ELSE lote_custom_status.data_finalizada 
            END,
            data_envase = CASE 
                WHEN EXCLUDED.custom_status IN ('Envase', 'Ordem Parcial') THEN COALESCE(lote_custom_status.data_envase, NOW()) 
                ELSE lote_custom_status.data_envase 
            END
        "#
    )
    .bind(&payload.lote_number)
    .bind(&normalized_status)
    .bind(&payload.updated_by)
    .bind(&payload.ficha_ordem)
    .bind(payload.quantidade_envasada_parcial)
    .execute(&mut *tx)
    .await?;

    if let Some(ref st) = normalized_status {
        gravar_historico(
            &mut tx,
            &payload.lote_number,
            st,
            Some("Ficha da Ordem"),
            payload.updated_by.as_deref(),
            Some("Apontamento via Ficha da Ordem"),
        )
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

/// Aplica o mesmo status a vários lotes, tudo ou nada. Só para status preenchido; o reset (apagar a linha do lote)
/// é `apagar_status_lotes`, em 2 passos.
pub async fn save_batch_lote_custom_status(
    pool: &PgPool,
    payload: &super::models::BatchLoteCustomStatusPayload,
) -> Result<usize, ErroApi> {
    let Some(ref new_status) = payload.custom_status else { return Ok(0) };
    let mut tx = pool.begin().await?;
    let mut feitos = 0usize;
    for lote in &payload.lote_numbers {
        let single_payload = SaveLoteCustomStatusPayload {
            lote_number: lote.clone(),
            custom_status: new_status.clone(),
            category: payload.category.clone(),
            updated_by: payload.updated_by.clone(),
            notes: payload.notes.clone(),
            motivo_espera: payload.motivo_espera.clone(),
            is_terceirizado: None,
            ficha_ordem: None,
            quantidade_envasada_parcial: None,
            insumo_faltante_codigo: None,
            insumo_faltante_descricao: None,
            fornecedor_terceirizado: None,
            etapas_status: None,
        };
        upsert_status_tx(&mut tx, &single_payload).await?;
        feitos += 1;
    }
    tx.commit().await?;
    Ok(feitos)
}

/// O que será (ou foi) apagado ao redefinir o status de um lote.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusApagado {
    pub lote_number: String,
    pub status_anterior: String,
    pub category: Option<String>,
    pub motivo_espera: Option<String>,
}

/// Apaga a linha inteira do lote em `lote_custom_status` (volta ao status padrão), registrando antes no histórico
/// o status que existia. `None` = o lote não tinha linha.
async fn apagar_status_tx(tx: &mut Tx<'_>, lote: &str, autor: &str) -> Result<Option<StatusApagado>, ErroApi> {
    let row = sqlx::query(
        "SELECT custom_status, category, motivo_espera FROM lote_custom_status WHERE lote_number = $1 FOR UPDATE",
    )
    .bind(lote)
    .fetch_optional(&mut **tx)
    .await?;
    let Some(row) = row else { return Ok(None) };
    let apagado = StatusApagado {
        lote_number: lote.to_string(),
        status_anterior: row.try_get::<Option<String>, _>("custom_status").ok().flatten().unwrap_or_default(),
        category: row.try_get::<Option<String>, _>("category").ok().flatten(),
        motivo_espera: row.try_get::<Option<String>, _>("motivo_espera").ok().flatten(),
    };
    gravar_historico(
        tx,
        lote,
        "Status Removido",
        apagado.category.as_deref(),
        Some(autor),
        Some(&format!("Anterior: {}. Lote redefinido para o status padrão.", apagado.status_anterior)),
    )
    .await?;
    sqlx::query("DELETE FROM lote_custom_status WHERE lote_number = $1")
        .bind(lote)
        .execute(&mut **tx)
        .await?;
    Ok(Some(apagado))
}

/// Redefine o status de um ou mais lotes (apaga a linha). Escrita em 2 passos: sem `confirmar` só devolve o que
/// seria apagado; com `confirmar` apaga, grava o histórico e a auditoria.
pub async fn apagar_status_lotes(
    pool: &PgPool,
    lotes: &[String],
    autor: &str,
    confirmar: bool,
) -> Result<RespostaAcao<Vec<StatusApagado>>, ErroApi> {
    let mut unicos: Vec<String> = Vec::new();
    for l in lotes {
        if !l.trim().is_empty() && !unicos.contains(l) {
            unicos.push(l.clone());
        }
    }
    if unicos.is_empty() {
        return Err(ErroApi::invalido("Informe ao menos um lote."));
    }
    let autor_tx = autor.to_string();
    let lista = unicos.clone();
    let resposta = executar_em_2_passos(pool, "redefinir_status_lote", confirmar, move |tx| {
        Box::pin(async move {
            let mut apagados = Vec::new();
            for l in &lista {
                if let Some(a) = apagar_status_tx(tx, l, &autor_tx).await? {
                    apagados.push(a);
                }
            }
            Ok(apagados)
        })
    })
    .await?;
    if confirmar && !resposta.resultado.is_empty() {
        crate::modules::producao::auditoria::registrar(
            pool,
            autor,
            "redefinir_status_lote",
            &unicos.join(","),
            serde_json::json!({ "apagados": resposta.resultado }),
        )
        .await;
    }
    Ok(resposta)
}

const ETAPAS_VALIDAS: [&str; 4] = ["pesagem", "producao", "envase", "rotulagem"];

/// Fuso fixo da fábrica (Brasil sem horário de verão): data/hora sem fuso é lida como America/Sao_Paulo.
fn fuso_sp() -> chrono::FixedOffset {
    chrono::FixedOffset::west_opt(3 * 3600).expect("fuso")
}

/// Data/hora de agendamento da etapa → RFC 3339. `AAAA-MM-DD` vira 08:00; sem fuso vira America/Sao_Paulo.
fn normalizar_data_agendada(d: &str) -> Result<String, ErroApi> {
    use chrono::TimeZone;
    let t = d.trim();
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(t) {
        return Ok(dt.to_rfc3339());
    }
    if let Ok(dia) = chrono::NaiveDate::parse_from_str(t, "%Y-%m-%d") {
        let ndt = dia.and_hms_opt(8, 0, 0).expect("hora");
        return Ok(fuso_sp().from_local_datetime(&ndt).single().expect("fuso fixo").to_rfc3339());
    }
    for fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"] {
        if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(t, fmt) {
            return Ok(fuso_sp().from_local_datetime(&ndt).single().expect("fuso fixo").to_rfc3339());
        }
    }
    Err(ErroApi::regra(format!("Data de agendamento inválida: \"{t}\". Use AAAA-MM-DD ou AAAA-MM-DDTHH:MM.")))
}

pub async fn save_lote_etapa_status(
    pool: &PgPool,
    payload: &SaveLoteEtapaStatusPayload,
    lote_number: &str,
) -> Result<(), ErroApi> {
    let etapa = payload.etapa.trim().to_lowercase();
    if !ETAPAS_VALIDAS.contains(&etapa.as_str()) {
        return Err(ErroApi::regra(format!(
            "Etapa inválida: \"{}\". Use: {}.",
            payload.etapa.trim(),
            ETAPAS_VALIDAS.join(", ")
        )));
    }
    let status = payload.status.trim().to_string();
    if status.is_empty() {
        return Err(ErroApi::regra("Informe o status da etapa."));
    }
    let dt_agendada_str: Option<String> = match payload.data_agendada.as_deref().map(str::trim) {
        Some(d) if !d.is_empty() => Some(normalizar_data_agendada(d)?),
        _ => None,
    };
    let motivo = payload.motivo_espera.clone();
    let insumo_cod = payload.insumo_faltante_codigo.clone();
    let insumo_desc = payload.insumo_faltante_descricao.clone();
    let updated_by = payload.updated_by.clone().unwrap_or_else(|| "Operador".to_string());
    let now_iso = chrono::Utc::now().to_rfc3339();

    let etapa_obj = serde_json::json!({
        "status": status,
        "motivoEspera": motivo,
        "insumoFaltanteCodigo": insumo_cod,
        "insumoFaltanteDescricao": insumo_desc,
        "updatedBy": updated_by,
        "updatedAt": now_iso
    });

    let patch = serde_json::json!({
        etapa.clone(): etapa_obj
    });

    sqlx::query(
        r#"
        INSERT INTO lote_custom_status (
            lote_number, custom_status, etapas_status, updated_by, updated_at,
            data_pesagem, data_producao, data_rotulagem, data_envase
        ) VALUES (
            $1, 'Pendente', $2, $3, NOW(),
            CASE 
                WHEN $4 = 'pesagem' AND $6::text IS NOT NULL THEN ($6 || '')::timestamptz
                WHEN $4 = 'pesagem' AND ($5 = 'concluido' OR $5 = 'Concluído') THEN NOW() 
                ELSE NULL 
            END,
            CASE 
                WHEN $4 = 'producao' AND $6::text IS NOT NULL THEN ($6 || '')::timestamptz
                WHEN $4 = 'producao' AND ($5 = 'concluido' OR $5 = 'Concluído') THEN NOW() 
                ELSE NULL 
            END,
            CASE 
                WHEN $4 = 'rotulagem' AND $6::text IS NOT NULL THEN ($6 || '')::timestamptz
                WHEN $4 = 'rotulagem' AND ($5 = 'concluido' OR $5 = 'Concluído') THEN NOW() 
                ELSE NULL 
            END,
            CASE 
                WHEN $4 = 'envase' AND $6::text IS NOT NULL THEN ($6 || '')::timestamptz
                WHEN $4 = 'envase' AND ($5 = 'concluido' OR $5 = 'Concluído') THEN NOW() 
                ELSE NULL 
            END
        )
        ON CONFLICT (lote_number) DO UPDATE SET
            etapas_status = COALESCE(lote_custom_status.etapas_status, '{}'::jsonb) || $2,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW(),
            data_pesagem = CASE 
                WHEN $4 = 'pesagem' AND $6::text IS NOT NULL THEN ($6 || '')::timestamptz
                WHEN $4 = 'pesagem' AND ($5 = 'concluido' OR $5 = 'Concluído') THEN COALESCE(lote_custom_status.data_pesagem, NOW()) 
                ELSE lote_custom_status.data_pesagem 
            END,
            data_producao = CASE 
                WHEN $4 = 'producao' AND $6::text IS NOT NULL THEN ($6 || '')::timestamptz
                WHEN $4 = 'producao' AND ($5 = 'concluido' OR $5 = 'Concluído') THEN COALESCE(lote_custom_status.data_producao, NOW()) 
                ELSE lote_custom_status.data_producao 
            END,
            data_rotulagem = CASE 
                WHEN $4 = 'rotulagem' AND $6::text IS NOT NULL THEN ($6 || '')::timestamptz
                WHEN $4 = 'rotulagem' AND ($5 = 'concluido' OR $5 = 'Concluído') THEN COALESCE(lote_custom_status.data_rotulagem, NOW()) 
                ELSE lote_custom_status.data_rotulagem 
            END,
            data_envase = CASE 
                WHEN $4 = 'envase' AND $6::text IS NOT NULL THEN ($6 || '')::timestamptz
                WHEN $4 = 'envase' AND ($5 = 'concluido' OR $5 = 'Concluído') THEN COALESCE(lote_custom_status.data_envase, NOW()) 
                ELSE lote_custom_status.data_envase 
            END,
            quadros_ocultos = CASE
                WHEN ($5 = 'ativo' OR $5 = 'concluido' OR $5 = 'Concluído' OR $5 = 'fila') AND lote_custom_status.quadros_ocultos IS NOT NULL
                THEN (
                    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
                    FROM jsonb_array_elements_text(lote_custom_status.quadros_ocultos) AS elem
                    WHERE elem <> $4
                )
                ELSE lote_custom_status.quadros_ocultos
            END
        "#
    )
    .bind(lote_number)
    .bind(&patch)
    .bind(&updated_by)
    .bind(&etapa)
    .bind(&status)
    .bind(&dt_agendada_str)
    .execute(pool)
    .await?;

    Ok(())
}

/// Interpreta uma data/hora enviada pela tela. Sem fuso, vale como UTC (comportamento antigo); só a data vira 12:00.
fn parse_data(campo: &str, s: &str) -> Result<chrono::DateTime<chrono::Utc>, ErroApi> {
    let trimmed = s.trim();
    chrono::DateTime::parse_from_rfc3339(trimmed)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .or_else(|_| chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S").map(|ndt| ndt.and_utc()))
        .or_else(|_| chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M").map(|ndt| ndt.and_utc()))
        .or_else(|_| {
            chrono::NaiveDate::parse_from_str(trimmed, "%Y-%m-%d").map(|d| d.and_hms_opt(12, 0, 0).unwrap().and_utc())
        })
        .map_err(|_| ErroApi::regra(format!("Data inválida em {campo}: \"{trimmed}\".")))
}

/// `(enviado, valor)`: ausente = (false, None) preserva; `null` ou vazio = (true, None) limpa; texto = (true, Some).
fn data_campo(campo: &str, c: &Campo<String>) -> Result<(bool, Option<chrono::DateTime<chrono::Utc>>), ErroApi> {
    match c {
        None => Ok((false, None)),
        Some(None) => Ok((true, None)),
        Some(Some(s)) if s.trim().is_empty() => Ok((true, None)),
        Some(Some(s)) => Ok((true, Some(parse_data(campo, s)?))),
    }
}

/// Data de previsão atual do lote (ou a data do ERP) para detectar reagendamento.
async fn previsao_anterior(tx: &mut Tx<'_>, lote: &str) -> Result<Option<String>, ErroApi> {
    let atual: Option<chrono::DateTime<chrono::Utc>> =
        sqlx::query_scalar("SELECT data_previsao FROM lote_custom_status WHERE lote_number = $1")
            .bind(lote)
            .fetch_optional(&mut **tx)
            .await?
            .flatten();
    if let Some(cp) = atual {
        return Ok(Some(cp.format("%Y-%m-%d").to_string()));
    }
    let erp_dt: Option<String> = sqlx::query_scalar(
        "SELECT date::text FROM stock_movements WHERE document_number = $1 AND item_type = 'produto' AND movement_type = 'entrada' LIMIT 1",
    )
    .bind(lote)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(erp_dt.map(|d| d.chars().take(10).collect::<String>()))
}

/// Entrada do histórico de reagendamentos (adiamento/antecipação), se a data mudou.
fn entrada_reagendamento(
    antiga: Option<&str>,
    nova: chrono::DateTime<chrono::Utc>,
    agora: chrono::DateTime<chrono::Utc>,
    autor: &str,
) -> Option<serde_json::Value> {
    let old_str = antiga?;
    let new_date_str = nova.format("%Y-%m-%d").to_string();
    if old_str == new_date_str {
        return None;
    }
    let is_adiamento = new_date_str.as_str() > old_str;
    let motivo = if is_adiamento {
        format!("Adiado de {} para {}", old_str, new_date_str)
    } else {
        format!("Antecipado de {} para {}", old_str, new_date_str)
    };
    Some(serde_json::json!([{
        "dataAnterior": old_str,
        "novaData": new_date_str,
        "motivo": motivo,
        "tipo": if is_adiamento { "adiamento" } else { "antecipacao" },
        "etapa": "pcp",
        "alteradoEm": agora.to_rfc3339(),
        "alteradoPor": autor
    }]))
}

pub async fn save_lote_previsao(
    pool: &PgPool,
    lote_number: &str,
    data_previsao: Option<&str>,
    updated_by: Option<&str>,
    fornecedor_terceirizado: Option<&str>,
) -> Result<(), ErroApi> {
    let now = chrono::Utc::now();
    let prev_dt = match data_previsao.map(str::trim) {
        Some(d) if !d.is_empty() => Some(parse_data("previsão", d)?),
        _ => None,
    };

    let mut tx = pool.begin().await?;
    let new_entry_json = match prev_dt {
        Some(new_dt) => {
            let antiga = previsao_anterior(&mut tx, lote_number).await?;
            entrada_reagendamento(antiga.as_deref(), new_dt, now, updated_by.unwrap_or("Operador"))
        }
        None => None,
    };

    sqlx::query(
        r#"
        INSERT INTO lote_custom_status (
            lote_number, custom_status, data_previsao, updated_by, updated_at, fornecedor_terceirizado,
            historico_reagendamentos
        )
        VALUES ($1, 'Aberto', $2, $3, $4, $5, COALESCE($6, '[]'::jsonb))
        ON CONFLICT (lote_number) DO UPDATE SET
            data_previsao = EXCLUDED.data_previsao,
            updated_by = COALESCE(EXCLUDED.updated_by, lote_custom_status.updated_by),
            updated_at = EXCLUDED.updated_at,
            fornecedor_terceirizado = COALESCE(EXCLUDED.fornecedor_terceirizado, lote_custom_status.fornecedor_terceirizado),
            historico_reagendamentos = CASE 
                WHEN $6 IS NOT NULL THEN COALESCE(lote_custom_status.historico_reagendamentos, '[]'::jsonb) || $6
                ELSE COALESCE(lote_custom_status.historico_reagendamentos, '[]'::jsonb)
            END
        "#
    )
    .bind(lote_number)
    .bind(prev_dt)
    .bind(updated_by)
    .bind(now)
    .bind(fornecedor_terceirizado)
    .bind(new_entry_json)
    .execute(&mut *tx)
    .await?;

    let note_text = match prev_dt {
        Some(dt) => format!("Previsão de produção definida/alterada para {}", dt.format("%d/%m/%Y")),
        None => "Previsão de produção atualizada".to_string(),
    };
    gravar_historico(&mut tx, lote_number, "Previsão Alterada", None, updated_by, Some(&note_text)).await?;
    tx.commit().await?;
    Ok(())
}

/// Ajuste manual das datas das etapas. Só os campos enviados mudam: ausente preserva; `null` (ou vazio) limpa.
pub async fn save_lote_timestamps(
    pool: &PgPool,
    payload: &SaveLoteTimestampsPayload,
) -> Result<(), ErroApi> {
    if payload.lote_number.trim().is_empty() {
        return Err(ErroApi::invalido("Informe o lote."));
    }
    let now = chrono::Utc::now();
    let (set_pesagem, dt_pesagem) = data_campo("dataPesagem", &payload.data_pesagem)?;
    let (set_producao, dt_producao) = data_campo("dataProducao", &payload.data_producao)?;
    let (set_lib, dt_lib_envase) = data_campo("dataLiberadoEnvase", &payload.data_liberado_envase)?;
    let (set_envase, dt_envase) = data_campo("dataEnvase", &payload.data_envase)?;
    let (set_rotulagem, dt_rotulagem) = data_campo("dataRotulagem", &payload.data_rotulagem)?;
    let (set_finalizada, dt_finalizada) = data_campo("dataFinalizada", &payload.data_finalizada)?;
    let (set_previsao, dt_previsao) = data_campo("dataPrevisao", &payload.data_previsao)?;

    let enviados: Vec<&str> = [
        (set_pesagem, "pesagem"),
        (set_producao, "produção"),
        (set_lib, "liberado p/ envase"),
        (set_envase, "envase"),
        (set_rotulagem, "rotulagem"),
        (set_finalizada, "finalizada"),
        (set_previsao, "previsão"),
    ]
    .iter()
    .filter(|(on, _)| *on)
    .map(|(_, n)| *n)
    .collect();
    if enviados.is_empty() {
        return Err(ErroApi::regra("Informe ao menos uma data para ajustar."));
    }

    let autor = payload.updated_by.as_deref().unwrap_or("Operador");
    let mut tx = pool.begin().await?;
    let new_entry_json = match (set_previsao, dt_previsao) {
        (true, Some(new_dt)) => {
            let antiga = previsao_anterior(&mut tx, &payload.lote_number).await?;
            entrada_reagendamento(antiga.as_deref(), new_dt, now, autor)
        }
        _ => None,
    };

    sqlx::query(
        r#"
        INSERT INTO lote_custom_status (
            lote_number, custom_status, updated_by, updated_at,
            data_pesagem, data_producao, data_liberado_envase, data_envase, data_rotulagem, data_finalizada, data_previsao,
            historico_reagendamentos
        )
        VALUES ($1, 'Aberto', $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, '[]'::jsonb))
        ON CONFLICT (lote_number) DO UPDATE SET
            data_pesagem = CASE WHEN $12 THEN EXCLUDED.data_pesagem ELSE lote_custom_status.data_pesagem END,
            data_producao = CASE WHEN $13 THEN EXCLUDED.data_producao ELSE lote_custom_status.data_producao END,
            data_liberado_envase = CASE WHEN $14 THEN EXCLUDED.data_liberado_envase ELSE lote_custom_status.data_liberado_envase END,
            data_envase = CASE WHEN $15 THEN EXCLUDED.data_envase ELSE lote_custom_status.data_envase END,
            data_rotulagem = CASE WHEN $16 THEN EXCLUDED.data_rotulagem ELSE lote_custom_status.data_rotulagem END,
            data_finalizada = CASE WHEN $17 THEN EXCLUDED.data_finalizada ELSE lote_custom_status.data_finalizada END,
            data_previsao = CASE WHEN $18 THEN EXCLUDED.data_previsao ELSE lote_custom_status.data_previsao END,
            updated_by = COALESCE(EXCLUDED.updated_by, lote_custom_status.updated_by),
            updated_at = EXCLUDED.updated_at,
            historico_reagendamentos = CASE 
                WHEN $11 IS NOT NULL THEN COALESCE(lote_custom_status.historico_reagendamentos, '[]'::jsonb) || $11
                ELSE COALESCE(lote_custom_status.historico_reagendamentos, '[]'::jsonb)
            END
        "#
    )
    .bind(&payload.lote_number)
    .bind(&payload.updated_by)
    .bind(now)
    .bind(dt_pesagem)
    .bind(dt_producao)
    .bind(dt_lib_envase)
    .bind(dt_envase)
    .bind(dt_rotulagem)
    .bind(dt_finalizada)
    .bind(dt_previsao)
    .bind(new_entry_json)
    .bind(set_pesagem)
    .bind(set_producao)
    .bind(set_lib)
    .bind(set_envase)
    .bind(set_rotulagem)
    .bind(set_finalizada)
    .bind(set_previsao)
    .execute(&mut *tx)
    .await?;

    gravar_historico(
        &mut tx,
        &payload.lote_number,
        "Datas Ajustadas",
        None,
        payload.updated_by.as_deref(),
        Some(&format!("Ajuste manual de datas e horários das etapas ({})", enviados.join(", "))),
    )
    .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn set_lote_terceirizado(
    pool: &PgPool,
    lote_number: &str,
    is_terceirizado: bool,
) -> Result<(), String> {
    sqlx::query(
        r#"
        INSERT INTO lote_custom_status (lote_number, custom_status, is_terceirizado, updated_at)
        VALUES ($1, 'Aberto', $2, NOW())
        ON CONFLICT (lote_number) DO UPDATE SET
            is_terceirizado = EXCLUDED.is_terceirizado,
            updated_at = NOW()
        "#
    )
    .bind(lote_number)
    .bind(is_terceirizado)
    .execute(pool)
    .await
    .map_err(|e| format!("Erro ao alterar flag terceirizado: {e}"))?;

    Ok(())
}

pub async fn get_lote_history(
    pool: &PgPool,
    lote_number: &str,
) -> Result<Vec<StatusHistoryEntry>, String> {
    let rows = sqlx::query(
        r#"
        SELECT id, lote_number, status, category, changed_by,
               to_char(changed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS changed_at,
               notes
        FROM lote_status_history
        WHERE lote_number = $1
        ORDER BY changed_at DESC, id DESC
        "#
    )
    .bind(lote_number)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao buscar histórico: {e}"))?;

    let mut list = Vec::new();
    for row in rows {
        list.push(StatusHistoryEntry {
            id: row.try_get::<i64, _>("id").unwrap_or(0),
            lote_number: row.try_get::<Option<String>, _>("lote_number").ok().flatten().unwrap_or_default(),
            status: row.try_get::<Option<String>, _>("status").ok().flatten().unwrap_or_default(),
            category: row.try_get::<Option<String>, _>("category").ok().flatten(),
            changed_by: row.try_get::<Option<String>, _>("changed_by").ok().flatten(),
            changed_at: row.try_get::<Option<String>, _>("changed_at").ok().flatten().unwrap_or_default(),
            notes: row.try_get::<Option<String>, _>("notes").ok().flatten(),
        });
    }
    Ok(list)
}

// -------------------------------------------------------------
// Terceirizados: Solicitações e Auto-Vínculo
// -------------------------------------------------------------

pub async fn auto_vincular_solicitacoes(_pool: &PgPool) -> Result<i64, String> {
    // Vínculo automático desativado: agora é 100% manual pelo supervisor
    Ok(0)
}

pub async fn list_terceirizados_solicitacoes(pool: &PgPool) -> Result<Vec<TerceirizadoSolicitacaoItem>, String> {
    let _ = auto_vincular_solicitacoes(pool).await;

    let rows = sqlx::query(
        r#"
        SELECT 
            s.id,
            s.product_code,
            COALESCE(s.product_description, p.descricao, s.product_code) AS product_description,
            s.quantity::float8 AS quantity,
            COALESCE(s.unit, 'UN') AS unit,
            s.quantity_kg::float8 AS quantity_kg,
            s.quantity_un::float8 AS quantity_un,
            s.status,
            s.lote_number,
            s.fornecedor,
            to_char(s.previsao_entrega, 'YYYY-MM-DD') AS previsao_entrega,
            s.observacoes,
            s.solicitado_por,
            COALESCE(s.aprovacao_embalagem, false) AS aprovacao_embalagem,
            s.aprovacao_embalagem_por,
            to_char(s.aprovacao_embalagem_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS aprovacao_embalagem_em,
            COALESCE(s.aprovacao_materia_prima, false) AS aprovacao_materia_prima,
            s.aprovacao_materia_prima_por,
            to_char(s.aprovacao_materia_prima_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS aprovacao_materia_prima_em,
            to_char(s.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(s.vinculado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS vinculado_em
        FROM terceirizados_solicitacoes s
        LEFT JOIN produtos p ON s.product_code = p.codigo
        ORDER BY s.created_at DESC, s.id DESC
        "#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao consultar solicitações de terceirizados: {e}"))?;

    let mut items = Vec::new();
    for row in rows {
        let qty: f64 = row.try_get::<f64, _>("quantity").unwrap_or(0.0);
        let qty_kg: Option<f64> = row.try_get::<Option<f64>, _>("quantity_kg").ok().flatten();
        let qty_un: Option<f64> = row.try_get::<Option<f64>, _>("quantity_un").ok().flatten();

        items.push(TerceirizadoSolicitacaoItem {
            id: row.get("id"),
            product_code: row.get("product_code"),
            product_description: row.get("product_description"),
            quantity: qty,
            unit: row.get("unit"),
            quantity_kg: qty_kg,
            quantity_un: qty_un,
            status: row.get("status"),
            lote_number: row.get("lote_number"),
            fornecedor: row.get("fornecedor"),
            previsao_entrega: row.get("previsao_entrega"),
            observacoes: row.get("observacoes"),
            solicitado_por: row.get("solicitado_por"),
            aprovacao_embalagem: row.get("aprovacao_embalagem"),
            aprovacao_embalagem_por: row.get("aprovacao_embalagem_por"),
            aprovacao_embalagem_em: row.get("aprovacao_embalagem_em"),
            aprovacao_materia_prima: row.get("aprovacao_materia_prima"),
            aprovacao_materia_prima_por: row.get("aprovacao_materia_prima_por"),
            aprovacao_materia_prima_em: row.get("aprovacao_materia_prima_em"),
            created_at: row.get("created_at"),
            vinculado_em: row.get("vinculado_em"),
        });
    }
    Ok(items)
}

pub async fn create_terceirizados_solicitacao(
    pool: &PgPool,
    payload: &CreateTerceirizadoSolicitacaoPayload,
) -> Result<i64, String> {
    let prev_date = payload.previsao_entrega.as_deref()
        .filter(|s| !s.trim().is_empty())
        .and_then(|s| chrono::NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d").ok());

    let lote_num_clean = payload.lote_number.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let initial_status = if lote_num_clean.is_some() { "VINCULADO" } else { "SOLICITADO" };

    let row = sqlx::query(
        r#"
        INSERT INTO terceirizados_solicitacoes (
            product_code, product_description, quantity, unit,
            quantity_kg, quantity_un,
            fornecedor, previsao_entrega, observacoes, solicitado_por,
            status, lote_number, vinculado_em, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CASE WHEN $12 IS NOT NULL THEN NOW() ELSE NULL END, NOW())
        RETURNING id
        "#
    )
    .bind(&payload.product_code)
    .bind(&payload.product_description)
    .bind(payload.quantity)
    .bind(payload.unit.as_deref().unwrap_or("UN"))
    .bind(payload.quantity_kg)
    .bind(payload.quantity_un)
    .bind(&payload.fornecedor)
    .bind(prev_date)
    .bind(&payload.observacoes)
    .bind(&payload.solicitado_por)
    .bind(initial_status)
    .bind(lote_num_clean)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Erro ao criar solicitação de terceirizado: {e}"))?;

    let new_id: i64 = row.get("id");

    // Marca os lotes desse produto/lote como terceirizados em lote_custom_status
    if let Some(lote) = lote_num_clean {
        let _ = sqlx::query(
            r#"
            INSERT INTO lote_custom_status (lote_number, custom_status, is_terceirizado, updated_at)
            VALUES ($1, 'Aberto', TRUE, NOW())
            ON CONFLICT (lote_number) DO UPDATE SET is_terceirizado = TRUE, updated_at = NOW()
            "#
        )
        .bind(lote)
        .execute(pool)
        .await;
    } else {
        let _ = sqlx::query(
            r#"
            INSERT INTO lote_custom_status (lote_number, custom_status, is_terceirizado, updated_at)
            SELECT DISTINCT m.document_number, 'Aberto', TRUE, NOW()
            FROM stock_movements m
            WHERE m.item_code = $1 AND m.item_type = 'produto'
            ON CONFLICT (lote_number) DO UPDATE SET is_terceirizado = TRUE, updated_at = NOW()
            "#
        )
        .bind(&payload.product_code)
        .execute(pool)
        .await;
    }

    Ok(new_id)
}

pub async fn aprovar_terceirizado_solicitacao(
    pool: &PgPool,
    id: i64,
    tipo: &str,
    aprovado: bool,
    aprovado_por: &str,
) -> Result<TerceirizadoSolicitacaoItem, String> {
    if tipo == "embalagem" {
        if aprovado {
            sqlx::query(
                "UPDATE terceirizados_solicitacoes 
                 SET aprovacao_embalagem = TRUE, aprovacao_embalagem_por = $1, aprovacao_embalagem_em = NOW() 
                 WHERE id = $2"
            )
            .bind(aprovado_por)
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| format!("Erro ao aprovar embalagem: {e}"))?;
        } else {
            sqlx::query(
                "UPDATE terceirizados_solicitacoes 
                 SET aprovacao_embalagem = FALSE, aprovacao_embalagem_por = NULL, aprovacao_embalagem_em = NULL 
                 WHERE id = $1"
            )
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| format!("Erro ao revogar aprovação de embalagem: {e}"))?;
        }
    } else if tipo == "materia_prima" {
        if aprovado {
            sqlx::query(
                "UPDATE terceirizados_solicitacoes 
                 SET aprovacao_materia_prima = TRUE, aprovacao_materia_prima_por = $1, aprovacao_materia_prima_em = NOW() 
                 WHERE id = $2"
            )
            .bind(aprovado_por)
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| format!("Erro ao aprovar matéria-prima: {e}"))?;
        } else {
            sqlx::query(
                "UPDATE terceirizados_solicitacoes 
                 SET aprovacao_materia_prima = FALSE, aprovacao_materia_prima_por = NULL, aprovacao_materia_prima_em = NULL 
                 WHERE id = $1"
            )
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| format!("Erro ao revogar aprovação de matéria-prima: {e}"))?;
        }
    } else {
        return Err(format!("Tipo de aprovação inválido: {tipo}"));
    }

    // Verifica se ambas as aprovações estão concluídas para avançar a solicitação
    let check: Option<(bool, bool, String, Option<String>)> = sqlx::query_as(
        "SELECT COALESCE(aprovacao_embalagem, false), COALESCE(aprovacao_materia_prima, false), status, lote_number
         FROM terceirizados_solicitacoes WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some((emb, mat, status_atual, lote_num)) = check {
        if lote_num.is_some() {
            // Se já vinculado ao lote, preserva VINCULADO
        } else if emb && mat {
            // Ambas aprovações ok -> parte para a etapa APROVADO
            let _ = sqlx::query("UPDATE terceirizados_solicitacoes SET status = 'APROVADO' WHERE id = $1")
                .bind(id)
                .execute(pool)
                .await;
        } else if status_atual == "APROVADO" {
            // Se uma aprovação foi removida, retorna para SOLICITADO
            let _ = sqlx::query("UPDATE terceirizados_solicitacoes SET status = 'SOLICITADO' WHERE id = $1")
                .bind(id)
                .execute(pool)
                .await;
        }
    }

    let items = list_terceirizados_solicitacoes(pool).await?;
    items.into_iter().find(|s| s.id == id).ok_or_else(|| "Solicitação não encontrada".to_string())
}

pub async fn update_terceirizado_previsao(
    pool: &PgPool,
    id: i64,
    previsao_entrega: Option<&str>,
    _updated_by: Option<&str>,
) -> Result<TerceirizadoSolicitacaoItem, String> {
    let prev_date = previsao_entrega
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());

    let row = sqlx::query(
        r#"
        UPDATE terceirizados_solicitacoes
        SET previsao_entrega = $1
        WHERE id = $2
        RETURNING lote_number
        "#
    )
    .bind(prev_date)
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Erro ao atualizar previsão de entrega: {e}"))?
    .ok_or_else(|| "Solicitação não encontrada".to_string())?;

    let lote_number: Option<String> = row.get("lote_number");
    if let Some(ref lote) = lote_number {
        if let Some(date_val) = prev_date {
            let date_str = date_val.format("%Y-%m-%d").to_string();
            let _ = sqlx::query(
                r#"
                INSERT INTO lote_custom_status (lote_number, data_previsao, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (lote_number) DO UPDATE
                SET data_previsao = $2, updated_at = NOW()
                "#
            )
            .bind(lote)
            .bind(&date_str)
            .execute(pool)
            .await;
        } else {
            let _ = sqlx::query(
                r#"
                UPDATE lote_custom_status
                SET data_previsao = NULL, updated_at = NOW()
                WHERE lote_number = $1
                "#
            )
            .bind(lote)
            .execute(pool)
            .await;
        }
    }

    let items = list_terceirizados_solicitacoes(pool).await?;
    items
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(|| "Solicitação não encontrada após atualização".to_string())
}

pub async fn lookup_produto_terceirizado(
    pool: &PgPool,
    code: &str,
) -> Result<Option<super::models::ProdutoTerceirizadoLookup>, String> {
    let clean = code.trim();
    if clean.is_empty() {
        return Ok(None);
    }

    let row = sqlx::query(
        r#"
        SELECT p.codigo, p.descricao,
               (
                   SELECT ROUND((AVG(quantidade_kg / NULLIF(unidades, 0)))::numeric, 4)::float8
                   FROM erp_lotes_laudos
                   WHERE product_code = p.codigo AND unidades > 0
               ) AS peso_historico
        FROM produtos p
        WHERE p.codigo = $1 OR p.codigo ILIKE $1
        LIMIT 1
        "#
    )
    .bind(clean)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Erro ao buscar produto: {e}"))?;

    let Some(row) = row else {
        return Ok(None);
    };

    let codigo: String = row.get("codigo");
    let descricao: String = row.get("descricao");
    let peso_historico: Option<f64> = row.try_get::<Option<f64>, _>("peso_historico").ok().flatten();

    let peso_desc = parse_weight_from_desc(&descricao);
    let peso_unitario_kg = peso_desc.or(peso_historico);

    Ok(Some(super::models::ProdutoTerceirizadoLookup {
        codigo,
        descricao,
        peso_unitario_kg,
    }))
}

fn parse_weight_from_desc(desc: &str) -> Option<f64> {
    let tokens: Vec<&str> = desc.split_whitespace().collect();
    for i in 0..tokens.len() {
        let t = tokens[i].trim().to_uppercase();
        if let Some(num_str) = t.strip_suffix("ML") {
            if let Ok(v) = num_str.replace(',', ".").parse::<f64>() {
                if v > 0.0 { return Some(v / 1000.0); }
            }
        }
        if let Some(num_str) = t.strip_suffix("KG") {
            if let Ok(v) = num_str.replace(',', ".").parse::<f64>() {
                if v > 0.0 { return Some(v); }
            }
        }
        if let Some(num_str) = t.strip_suffix("GR").or_else(|| t.strip_suffix("G")) {
            if let Ok(v) = num_str.replace(',', ".").parse::<f64>() {
                if v > 0.0 { return Some(v / 1000.0); }
            }
        }
        if let Some(num_str) = t.strip_suffix("L") {
            if let Ok(v) = num_str.replace(',', ".").parse::<f64>() {
                if v > 0.0 { return Some(v); }
            }
        }
        if i + 1 < tokens.len() {
            let next = tokens[i + 1].trim().to_uppercase();
            let next_clean = next.trim_matches(|c: char| !c.is_alphabetic());
            if let Ok(v) = t.replace(',', ".").parse::<f64>() {
                if next_clean == "ML" {
                    return Some(v / 1000.0);
                } else if next_clean == "L" || next_clean == "LT" || next_clean == "LITRO" || next_clean == "LITROS" {
                    return Some(v);
                } else if next_clean == "KG" || next_clean == "QUILO" || next_clean == "QUILOS" || next_clean == "K" {
                    return Some(v);
                } else if next_clean == "G" || next_clean == "GR" || next_clean == "GRAMA" || next_clean == "GRAMAS" {
                    return Some(v / 1000.0);
                }
            }
        }
    }
    None
}

pub async fn vincular_terceirizado_lote(
    pool: &PgPool,
    id: i64,
    lote_number: &str,
) -> Result<(), String> {
    sqlx::query(
        r#"
        UPDATE terceirizados_solicitacoes
        SET lote_number = $1, status = 'VINCULADO', vinculado_em = NOW()
        WHERE id = $2
        "#
    )
    .bind(lote_number)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| format!("Erro ao vincular lote à solicitação: {e}"))?;

    let _ = sqlx::query(
        r#"
        INSERT INTO lote_custom_status (lote_number, custom_status, is_terceirizado, updated_at)
        VALUES ($1, 'Aberto', TRUE, NOW())
        ON CONFLICT (lote_number) DO UPDATE SET
            is_terceirizado = TRUE,
            updated_at = NOW()
        "#
    )
    .bind(lote_number)
    .execute(pool)
    .await;

    Ok(())
}

pub async fn desvincular_terceirizado_lote(
    pool: &PgPool,
    id: i64,
) -> Result<(), String> {
    let old_lote: Option<String> = sqlx::query_scalar(
        "SELECT lote_number FROM terceirizados_solicitacoes WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    sqlx::query(
        r#"
        UPDATE terceirizados_solicitacoes
        SET lote_number = NULL, status = 'SOLICITADO', vinculado_em = NULL
        WHERE id = $1
        "#
    )
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| format!("Erro ao desvincular lote da solicitação: {e}"))?;

    if let Some(lote) = old_lote {
        let _ = sqlx::query(
            r#"
            UPDATE lote_custom_status
            SET is_terceirizado = FALSE, updated_at = NOW()
            WHERE lote_number = $1
            AND NOT EXISTS (
                SELECT 1 FROM terceirizados_solicitacoes ts
                WHERE ts.id != $2 AND ts.status != 'CANCELADO' AND ts.lote_number = $1
            )
            "#
        )
        .bind(&lote)
        .bind(id)
        .execute(pool)
        .await;
    }

    Ok(())
}

/// Exclui a solicitação e desmarca "terceirizado" só do lote vinculado a ela, e só se nenhuma outra solicitação
/// ativa continuar apontando para esse lote. Os demais lotes do mesmo produto não são tocados.
pub async fn delete_terceirizados_solicitacao(
    pool: &PgPool,
    id: i64,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| format!("Erro ao iniciar a exclusão: {e}"))?;
    let lote: Option<String> = sqlx::query_scalar(
        "SELECT lote_number FROM terceirizados_solicitacoes WHERE id = $1 FOR UPDATE"
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| format!("Erro ao ler a solicitação de terceirizado: {e}"))?
    .flatten();

    sqlx::query("DELETE FROM terceirizados_solicitacoes WHERE id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Erro ao deletar solicitação de terceirizado: {e}"))?;

    if let Some(lote) = lote {
        sqlx::query(
            r#"
            UPDATE lote_custom_status
            SET is_terceirizado = FALSE, updated_at = NOW()
            WHERE lote_number = $1
            AND NOT EXISTS (
                SELECT 1 FROM terceirizados_solicitacoes ts
                WHERE ts.status != 'CANCELADO' AND ts.lote_number = $1
            )
            "#
        )
        .bind(&lote)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Erro ao desmarcar o lote terceirizado: {e}"))?;
    }

    tx.commit().await.map_err(|e| format!("Erro ao confirmar a exclusão: {e}"))?;
    Ok(())
}

// -------------------------------------------------------------
// Sincronização com Google Sheets
// -------------------------------------------------------------

const SHEETS_CONFIG_KEY: &str = "acompanhamento_sheets_config";

pub async fn get_sheets_config(pool: &PgPool) -> Result<super::models::SheetsSyncConfig, String> {
    let row_val: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = $1")
        .bind(SHEETS_CONFIG_KEY)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

    if let Some(json_str) = row_val {
        if let Ok(cfg) = serde_json::from_str::<super::models::SheetsSyncConfig>(&json_str) {
            return Ok(cfg);
        }
    }

    Ok(super::models::SheetsSyncConfig {
        webhook_url: None,
        spreadsheet_url: None,
        auto_sync: false,
        last_sync_at: None,
        last_sync_status: None,
        last_sync_count: None,
        last_sync_error: None,
    })
}

pub async fn save_sheets_config(
    pool: &PgPool,
    payload: &super::models::SaveSheetsConfigPayload,
) -> Result<super::models::SheetsSyncConfig, String> {
    let mut current = get_sheets_config(pool).await?;

    if let Some(ref url) = payload.webhook_url {
        let trimmed = url.trim();
        current.webhook_url = if trimmed.is_empty() { None } else { Some(trimmed.to_string()) };
    }
    if let Some(ref url) = payload.spreadsheet_url {
        let trimmed = url.trim();
        current.spreadsheet_url = if trimmed.is_empty() { None } else { Some(trimmed.to_string()) };
    }
    if let Some(auto) = payload.auto_sync {
        current.auto_sync = auto;
    }
    if payload.clear_error == Some(true) {
        current.last_sync_error = None;
        current.last_sync_status = None;
    }

    let json_val = serde_json::to_string(&current).map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        INSERT INTO settings (key, value)
        VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        "#
    )
    .bind(SHEETS_CONFIG_KEY)
    .bind(&json_val)
    .execute(pool)
    .await
    .map_err(|e| format!("Erro ao salvar configuração do Google Sheets: {e}"))?;

    Ok(current)
}

pub async fn trigger_sheets_sync(pool: &PgPool) -> Result<serde_json::Value, String> {
    let mut cfg = get_sheets_config(pool).await?;
    let webhook_url = cfg.webhook_url.as_deref().unwrap_or("").trim();
    if webhook_url.is_empty() {
        return Err("A URL do Webhook do Google Apps Script não foi configurada.".to_string());
    }

    let params = super::models::AcompanhamentoQueryParams::default();
    let lotes = list_acompanhamento(pool, &params).await?;
    let solicitacoes = list_terceirizados_solicitacoes(pool).await.unwrap_or_default();
    let kits = crate::handlers::kits::fetch_kit_orders(pool).await.unwrap_or_default();

    let lotes_internos: Vec<_> = lotes.iter().filter(|l| !l.is_terceirizado).cloned().collect();
    let lotes_terceirizados: Vec<_> = lotes.iter().filter(|l| l.is_terceirizado).cloned().collect();

    let payload = serde_json::json!({
        "lotes": lotes,
        "lotesInternos": lotes_internos,
        "lotesTerceirizados": lotes_terceirizados,
        "solicitacoes": solicitacoes,
        "kits": kits,
        "timestamp": chrono::Utc::now().to_rfc3339()
    });

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Erro ao inicializar cliente HTTP: {e}"))?;

    let now_str = chrono::Utc::now().to_rfc3339();
    let res = match client.post(webhook_url).json(&payload).send().await {
        Ok(r) => r,
        Err(e) => {
            cfg.last_sync_at = Some(now_str);
            cfg.last_sync_status = Some("error".to_string());
            cfg.last_sync_error = Some(format!("Falha de conexão: {e}"));
            let _ = save_sheets_config_internal(pool, &cfg).await;
            return Err(format!("Falha ao conectar com o Google Sheets: {e}"));
        }
    };

    let status = res.status();
    let text = res.text().await.unwrap_or_default();

    if status.is_success() {
        let total_synced = lotes.len() + solicitacoes.len() + kits.len();
        cfg.last_sync_at = Some(now_str);
        cfg.last_sync_status = Some("success".to_string());
        cfg.last_sync_count = Some(total_synced);
        cfg.last_sync_error = None;
        let _ = save_sheets_config_internal(pool, &cfg).await;

        Ok(serde_json::json!({
            "success": true,
            "totalLotes": lotes.len(),
            "totalTerceirizados": lotes_terceirizados.len() + solicitacoes.len(),
            "totalKits": kits.len(),
            "response": text
        }))
    } else {
        cfg.last_sync_at = Some(now_str);
        cfg.last_sync_status = Some("error".to_string());
        let err_msg = if status.as_u16() == 401 {
            "HTTP 401 Não Autorizado: O Google bloqueou o acesso ao Webhook. No Apps Script, configure 'Quem pode acessar' como 'Qualquer pessoa' (Anyone). Se a planilha for apenas para visualização, basta usar o link direto.".to_string()
        } else {
            let clean = text.replace('\n', " ").replace('\r', "");
            let truncated = clean.chars().take(180).collect::<String>();
            format!("HTTP {status}: {truncated}")
        };
        cfg.last_sync_error = Some(err_msg.clone());
        let _ = save_sheets_config_internal(pool, &cfg).await;

        Err(err_msg)
    }
}

async fn save_sheets_config_internal(pool: &PgPool, cfg: &super::models::SheetsSyncConfig) -> Result<(), String> {
    let json_val = serde_json::to_string(cfg).map_err(|e| e.to_string())?;
    let _ = sqlx::query(
        r#"
        INSERT INTO settings (key, value)
        VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        "#
    )
    .bind(SHEETS_CONFIG_KEY)
    .bind(&json_val)
    .execute(pool)
    .await;
    Ok(())
}

pub fn spawn_auto_sheets_sync(_pool: PgPool) {
    // Sincronização automática com Google Sheets desativada por solicitação do usuário
}

// =========================================================================
// PROGRAMAÇÃO DE ENVASE
// =========================================================================

pub async fn list_programacao_envase(
    pool: &PgPool,
    data: &str,
) -> Result<Vec<ProgramacaoEnvaseItem>, String> {
    let is_all = data.trim().is_empty() || data.eq_ignore_ascii_case("todos") || data.eq_ignore_ascii_case("all");
    let rows = if is_all {
        sqlx::query(
            r#"
            SELECT
                id,
                to_char(data_programada, 'YYYY-MM-DD') AS data_programada,
                linha,
                ordem,
                lote_number,
                product_code,
                product_description,
                quantity,
                quantity_kg,
                categoria_envase,
                COALESCE(is_colorido, FALSE) AS is_colorido,
                cor,
                status_envase,
                observacoes,
                created_by,
                to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            FROM programacao_envase
            WHERE status_envase != 'CANCELADO'
            ORDER BY linha ASC, ordem ASC, id ASC
            "#
        )
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Erro ao listar programação de envase: {e}"))?
    } else {
        sqlx::query(
            r#"
            SELECT
                id,
                to_char(data_programada, 'YYYY-MM-DD') AS data_programada,
                linha,
                ordem,
                lote_number,
                product_code,
                product_description,
                quantity,
                quantity_kg,
                categoria_envase,
                COALESCE(is_colorido, FALSE) AS is_colorido,
                cor,
                status_envase,
                observacoes,
                created_by,
                to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            FROM programacao_envase
            WHERE data_programada = $1::date
            ORDER BY linha ASC, ordem ASC, id ASC
            "#
        )
        .bind(data)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Erro ao listar programação de envase: {e}"))?
    };

    let mut items = Vec::new();
    for row in rows {
        items.push(ProgramacaoEnvaseItem {
            id: row.try_get::<i64, _>("id").or_else(|_| row.try_get::<i32, _>("id").map(|v| v as i64)).unwrap_or(0),
            data_programada: row.try_get("data_programada").unwrap_or_default(),
            linha: row.try_get("linha").unwrap_or_default(),
            ordem: row.try_get("ordem").unwrap_or(1),
            lote_number: row.try_get("lote_number").unwrap_or_default(),
            product_code: row.try_get("product_code").unwrap_or_default(),
            product_description: row.try_get("product_description").unwrap_or_default(),
            quantity: row.try_get("quantity").unwrap_or(0.0),
            quantity_kg: row.try_get("quantity_kg").unwrap_or(0.0),
            categoria_envase: row.try_get("categoria_envase").unwrap_or_default(),
            is_colorido: row.try_get("is_colorido").unwrap_or(false),
            cor: row.try_get("cor").ok(),
            status_envase: row.try_get("status_envase").unwrap_or_default(),
            observacoes: row.try_get("observacoes").ok(),
            created_by: row.try_get("created_by").ok(),
            created_at: row.try_get("created_at").unwrap_or_default(),
            updated_at: row.try_get("updated_at").unwrap_or_default(),
        });
    }

    Ok(items)
}

pub async fn save_programacao_envase(
    pool: &PgPool,
    payload: &SaveProgramacaoEnvasePayload,
) -> Result<ProgramacaoEnvaseItem, String> {
    let status_envase = payload.status_envase.as_deref().unwrap_or("PROGRAMADO");
    let is_colorido = payload.is_colorido.unwrap_or(false);

    if let Some(id) = payload.id {
        if id > 0 {
            let row = sqlx::query(
                r#"
                UPDATE programacao_envase
                SET
                    data_programada = $1::date,
                    linha = $2,
                    ordem = COALESCE($3, ordem),
                    lote_number = $4,
                    product_code = $5,
                    product_description = $6,
                    quantity = $7,
                    quantity_kg = $8,
                    categoria_envase = $9,
                    is_colorido = $10,
                    cor = $11,
                    status_envase = $12,
                    observacoes = $13,
                    updated_at = NOW()
                WHERE id = $14
                RETURNING
                    id,
                    to_char(data_programada, 'YYYY-MM-DD') AS data_programada,
                    linha,
                    ordem,
                    lote_number,
                    product_code,
                    product_description,
                    quantity,
                    quantity_kg,
                    categoria_envase,
                    is_colorido,
                    cor,
                    status_envase,
                    observacoes,
                    created_by,
                    to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                    to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
                "#
            )
            .bind(&payload.data_programada)
            .bind(&payload.linha)
            .bind(payload.ordem)
            .bind(&payload.lote_number)
            .bind(&payload.product_code)
            .bind(&payload.product_description)
            .bind(payload.quantity)
            .bind(payload.quantity_kg)
            .bind(&payload.categoria_envase)
            .bind(is_colorido)
            .bind(&payload.cor)
            .bind(status_envase)
            .bind(&payload.observacoes)
            .bind(id)
            .fetch_one(pool)
            .await
            .map_err(|e| format!("Erro ao atualizar programação de envase: {e}"))?;

            return Ok(ProgramacaoEnvaseItem {
                id: row.try_get::<i64, _>("id").or_else(|_| row.try_get::<i32, _>("id").map(|v| v as i64)).unwrap_or(0),
                data_programada: row.try_get("data_programada").unwrap_or_default(),
                linha: row.try_get("linha").unwrap_or_default(),
                ordem: row.try_get("ordem").unwrap_or(1),
                lote_number: row.try_get("lote_number").unwrap_or_default(),
                product_code: row.try_get("product_code").unwrap_or_default(),
                product_description: row.try_get("product_description").unwrap_or_default(),
                quantity: row.try_get("quantity").unwrap_or(0.0),
                quantity_kg: row.try_get("quantity_kg").unwrap_or(0.0),
                categoria_envase: row.try_get("categoria_envase").unwrap_or_default(),
                is_colorido: row.try_get("is_colorido").unwrap_or(false),
                cor: row.try_get("cor").ok(),
                status_envase: row.try_get("status_envase").unwrap_or_default(),
                observacoes: row.try_get("observacoes").ok(),
                created_by: row.try_get("created_by").ok(),
                created_at: row.try_get("created_at").unwrap_or_default(),
                updated_at: row.try_get("updated_at").unwrap_or_default(),
            });
        }
    }

    // Caso novo item: calcular ordem caso não informada. Transação + trava por dia/linha: duas gravações
    // simultâneas não pegam a mesma ordem.
    let mut tx = pool.begin().await.map_err(|e| format!("Erro ao iniciar a gravação: {e}"))?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
        .bind(format!("programacao_envase:{}:{}", payload.data_programada, payload.linha))
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Erro ao travar a programação de envase: {e}"))?;
    let ordem = match payload.ordem {
        Some(o) if o > 0 => o,
        _ => {
            let r = sqlx::query(
                "SELECT COALESCE(MAX(ordem), 0) + 1 AS next_ordem FROM programacao_envase WHERE data_programada = $1::date AND linha = $2"
            )
            .bind(&payload.data_programada)
            .bind(&payload.linha)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| format!("Erro ao calcular a ordem do envase: {e}"))?;
            r.try_get::<i32, _>("next_ordem").unwrap_or(1)
        }
    };

    let row = sqlx::query(
        r#"
        INSERT INTO programacao_envase (
            data_programada, linha, ordem, lote_number, product_code,
            product_description, quantity, quantity_kg, categoria_envase,
            is_colorido, cor,
            status_envase, observacoes, created_by, created_at, updated_at
        )
        VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
        RETURNING
            id,
            to_char(data_programada, 'YYYY-MM-DD') AS data_programada,
            linha,
            ordem,
            lote_number,
            product_code,
            product_description,
            quantity,
            quantity_kg,
            categoria_envase,
            is_colorido,
            cor,
            status_envase,
            observacoes,
            created_by,
            to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
        "#
    )
    .bind(&payload.data_programada)
    .bind(&payload.linha)
    .bind(ordem)
    .bind(&payload.lote_number)
    .bind(&payload.product_code)
    .bind(&payload.product_description)
    .bind(payload.quantity)
    .bind(payload.quantity_kg)
    .bind(&payload.categoria_envase)
    .bind(is_colorido)
    .bind(&payload.cor)
    .bind(status_envase)
    .bind(&payload.observacoes)
    .bind(&payload.created_by)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| format!("Erro ao inserir programação de envase: {e}"))?;
    tx.commit().await.map_err(|e| format!("Erro ao confirmar a programação de envase: {e}"))?;

    Ok(ProgramacaoEnvaseItem {
        id: row.try_get::<i64, _>("id").or_else(|_| row.try_get::<i32, _>("id").map(|v| v as i64)).unwrap_or(0),
        data_programada: row.try_get("data_programada").unwrap_or_default(),
        linha: row.try_get("linha").unwrap_or_default(),
        ordem: row.try_get("ordem").unwrap_or(1),
        lote_number: row.try_get("lote_number").unwrap_or_default(),
        product_code: row.try_get("product_code").unwrap_or_default(),
        product_description: row.try_get("product_description").unwrap_or_default(),
        quantity: row.try_get("quantity").unwrap_or(0.0),
        quantity_kg: row.try_get("quantity_kg").unwrap_or(0.0),
        categoria_envase: row.try_get("categoria_envase").unwrap_or_default(),
        is_colorido: row.try_get("is_colorido").unwrap_or(false),
        cor: row.try_get("cor").ok(),
        status_envase: row.try_get("status_envase").unwrap_or_default(),
        observacoes: row.try_get("observacoes").ok(),
        created_by: row.try_get("created_by").ok(),
        created_at: row.try_get("created_at").unwrap_or_default(),
        updated_at: row.try_get("updated_at").unwrap_or_default(),
    })
}

pub async fn delete_programacao_envase(pool: &PgPool, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM programacao_envase WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("Erro ao remover programação de envase: {e}"))?;
    Ok(())
}

pub async fn delete_programacao_envase_by_lote(pool: &PgPool, lote_number: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM programacao_envase WHERE lote_number = $1")
        .bind(lote_number)
        .execute(pool)
        .await
        .map_err(|e| format!("Erro ao remover programação de envase do lote: {e}"))?;
    Ok(())
}

pub async fn reorder_programacao_envase(
    pool: &PgPool,
    payload: &ReorderProgramacaoEnvasePayload,
) -> Result<(), String> {
    // Tudo ou nada: uma falha no meio não deixa a fila meio reordenada.
    let mut tx = pool.begin().await.map_err(|e| format!("Erro ao iniciar a reordenação: {e}"))?;
    for item in &payload.items {
        sqlx::query(
            "UPDATE programacao_envase SET ordem = $1, linha = $2, updated_at = NOW() WHERE id = $3"
        )
        .bind(item.ordem)
        .bind(&item.linha)
        .bind(item.id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Erro ao reordenar item {}: {e}", item.id))?;
    }
    tx.commit().await.map_err(|e| format!("Erro ao confirmar a reordenação: {e}"))?;
    Ok(())
}

pub async fn ocultar_quadro_lote(
    pool: &PgPool,
    lote_number: &str,
    quadro: &str,
    updated_by: Option<&str>,
) -> Result<(), String> {
    let q_norm = quadro.trim().to_lowercase();
    let quadro_json = serde_json::json!([q_norm]);

    sqlx::query(
        r#"
        INSERT INTO lote_custom_status (lote_number, custom_status, quadros_ocultos, updated_by, updated_at)
        VALUES ($1, 'Aberto', $2, $3, NOW())
        ON CONFLICT (lote_number) DO UPDATE SET
            quadros_ocultos = CASE
                WHEN lote_custom_status.quadros_ocultos IS NULL OR jsonb_typeof(lote_custom_status.quadros_ocultos) != 'array' THEN $2
                WHEN NOT (lote_custom_status.quadros_ocultos @> $2) THEN lote_custom_status.quadros_ocultos || $2
                ELSE lote_custom_status.quadros_ocultos
            END,
            custom_status = CASE 
                WHEN $4 = 'envase' AND lote_custom_status.custom_status = 'Liberado para Envase' THEN 'Produzido'
                ELSE lote_custom_status.custom_status
            END,
            data_liberado_envase = CASE 
                WHEN $4 = 'envase' THEN NULL 
                ELSE lote_custom_status.data_liberado_envase 
            END,
            adicionado_manualmente_em = CASE
                WHEN $4 IN ('pesagem', 'producao', 'envase', 'rotulagem') THEN NULL
                ELSE lote_custom_status.adicionado_manualmente_em
            END,
            updated_by = COALESCE($3, lote_custom_status.updated_by),
            updated_at = NOW()
        "#
    )
    .bind(lote_number)
    .bind(&quadro_json)
    .bind(updated_by)
    .bind(&q_norm)
    .execute(pool)
    .await
    .map_err(|e| format!("Erro ao ocultar lote do quadro: {e}"))?;

    // Also sync quadros_ocultos to linked planning ID if lote_number is ERP lote or planning ID
    let _ = sqlx::query(
        r#"
        UPDATE lote_custom_status
        SET quadros_ocultos = CASE
                WHEN quadros_ocultos IS NULL OR jsonb_typeof(quadros_ocultos) != 'array' THEN $2
                WHEN NOT (quadros_ocultos @> $2) THEN quadros_ocultos || $2
                ELSE quadros_ocultos
            END
        WHERE lote_number IN (
            SELECT pp.id FROM producao_planejamento_semanal pp WHERE pp.lote_erp = $1
            UNION
            SELECT pp.lote_erp FROM producao_planejamento_semanal pp WHERE pp.id = $1 AND pp.lote_erp IS NOT NULL
        )
        "#
    )
    .bind(lote_number)
    .bind(&quadro_json)
    .execute(pool)
    .await;

    if q_norm == "envase" {
        let _ = delete_programacao_envase_by_lote(pool, lote_number).await;
    }

    Ok(())
}

pub async fn restaurar_quadro_lote(
    pool: &PgPool,
    lote_number: &str,
    quadro: &str,
    updated_by: Option<&str>,
) -> Result<(), String> {
    let q_norm = quadro.trim().to_lowercase();
    let initial_status = match q_norm.as_str() {
        "pesagem" => "Pesagem",
        "producao" => "Produção",
        "envase" => "Liberado para Envase",
        "rotulagem" => "Rotulagem",
        _ => "Pesagem",
    };

    if q_norm == "todos" || q_norm == "all" {
        sqlx::query(
            r#"
            INSERT INTO lote_custom_status (lote_number, custom_status, quadros_ocultos, adicionado_manualmente_em, updated_by, updated_at)
            VALUES ($1, $2, '[]'::jsonb, CURRENT_DATE, $3, NOW())
            ON CONFLICT (lote_number) DO UPDATE SET
                quadros_ocultos = '[]'::jsonb,
                adicionado_manualmente_em = CURRENT_DATE,
                updated_by = COALESCE($3, lote_custom_status.updated_by),
                updated_at = NOW()
            "#
        )
        .bind(lote_number)
        .bind(initial_status)
        .bind(updated_by)
        .execute(pool)
        .await
        .map_err(|e| format!("Erro ao restaurar todos os quadros do lote: {e}"))?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO lote_custom_status (lote_number, custom_status, quadros_ocultos, adicionado_manualmente_em, updated_by, updated_at)
            VALUES ($1, $2, '[]'::jsonb, CURRENT_DATE, $3, NOW())
            ON CONFLICT (lote_number) DO UPDATE SET
                adicionado_manualmente_em = CURRENT_DATE,
                quadros_ocultos = CASE
                    WHEN lote_custom_status.quadros_ocultos IS NOT NULL AND jsonb_typeof(lote_custom_status.quadros_ocultos) = 'array' 
                    THEN (
                        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
                        FROM jsonb_array_elements_text(lote_custom_status.quadros_ocultos) AS elem
                        WHERE elem != $4
                    )
                    ELSE '[]'::jsonb
                END,
                updated_by = COALESCE($3, lote_custom_status.updated_by),
                updated_at = NOW()
            "#
        )
        .bind(lote_number)
        .bind(initial_status)
        .bind(updated_by)
        .bind(&q_norm)
        .execute(pool)
        .await
        .map_err(|e| format!("Erro ao restaurar quadro do lote: {e}"))?;
    }

    Ok(())
}

// -------------------------------------------------------------
// Programação de Rotulagem (Máquina e Manual)
// -------------------------------------------------------------

pub async fn list_programacao_rotulagem(
    pool: &PgPool,
    data: &str,
) -> Result<Vec<ProgramacaoRotulagemItem>, String> {
    let is_all = data.trim().is_empty() || data.eq_ignore_ascii_case("todos") || data.eq_ignore_ascii_case("all");
    let rows = if is_all {
        sqlx::query(
            r#"
            SELECT
                id,
                to_char(data_programada, 'YYYY-MM-DD') AS data_programada,
                tipo,
                ordem,
                lote_number,
                product_code,
                product_description,
                quantity,
                quantity_kg,
                status_rotulagem,
                observacoes,
                created_by,
                to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            FROM programacao_rotulagem
            WHERE status_rotulagem != 'CANCELADO'
            ORDER BY tipo ASC, ordem ASC, id ASC
            "#
        )
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Erro ao listar programação de rotulagem: {e}"))?
    } else {
        sqlx::query(
            r#"
            SELECT
                id,
                to_char(data_programada, 'YYYY-MM-DD') AS data_programada,
                tipo,
                ordem,
                lote_number,
                product_code,
                product_description,
                quantity,
                quantity_kg,
                status_rotulagem,
                observacoes,
                created_by,
                to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            FROM programacao_rotulagem
            WHERE data_programada = $1::date
            ORDER BY tipo ASC, ordem ASC, id ASC
            "#
        )
        .bind(data)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Erro ao listar programação de rotulagem: {e}"))?
    };

    let mut items = Vec::new();
    for row in rows {
        items.push(ProgramacaoRotulagemItem {
            id: row.try_get::<i64, _>("id").or_else(|_| row.try_get::<i32, _>("id").map(|v| v as i64)).unwrap_or(0),
            data_programada: row.try_get("data_programada").unwrap_or_default(),
            tipo: row.try_get("tipo").unwrap_or_default(),
            ordem: row.try_get("ordem").unwrap_or(1),
            lote_number: row.try_get("lote_number").unwrap_or_default(),
            product_code: row.try_get("product_code").unwrap_or_default(),
            product_description: row.try_get("product_description").unwrap_or_default(),
            quantity: row.try_get("quantity").unwrap_or(0.0),
            quantity_kg: row.try_get("quantity_kg").unwrap_or(0.0),
            status_rotulagem: row.try_get("status_rotulagem").unwrap_or_default(),
            observacoes: row.try_get("observacoes").ok(),
            created_by: row.try_get("created_by").ok(),
            created_at: row.try_get("created_at").unwrap_or_default(),
            updated_at: row.try_get("updated_at").unwrap_or_default(),
        });
    }

    Ok(items)
}

pub async fn save_programacao_rotulagem(
    pool: &PgPool,
    payload: &SaveProgramacaoRotulagemPayload,
) -> Result<ProgramacaoRotulagemItem, String> {
    let status_rotulagem = payload.status_rotulagem.as_deref().unwrap_or("PROGRAMADO");

    if let Some(id) = payload.id {
        if id > 0 {
            let row = sqlx::query(
                r#"
                UPDATE programacao_rotulagem
                SET
                    data_programada = $1::date,
                    tipo = $2,
                    ordem = COALESCE($3, ordem),
                    lote_number = $4,
                    product_code = $5,
                    product_description = $6,
                    quantity = $7,
                    quantity_kg = $8,
                    status_rotulagem = $9,
                    observacoes = $10,
                    updated_at = NOW()
                WHERE id = $11
                RETURNING
                    id,
                    to_char(data_programada, 'YYYY-MM-DD') AS data_programada,
                    tipo,
                    ordem,
                    lote_number,
                    product_code,
                    product_description,
                    quantity,
                    quantity_kg,
                    status_rotulagem,
                    observacoes,
                    created_by,
                    to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                    to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
                "#
            )
            .bind(&payload.data_programada)
            .bind(&payload.tipo)
            .bind(payload.ordem)
            .bind(&payload.lote_number)
            .bind(&payload.product_code)
            .bind(&payload.product_description)
            .bind(payload.quantity)
            .bind(payload.quantity_kg)
            .bind(status_rotulagem)
            .bind(&payload.observacoes)
            .bind(id)
            .fetch_one(pool)
            .await
            .map_err(|e| format!("Erro ao atualizar programação de rotulagem: {e}"))?;

            return Ok(ProgramacaoRotulagemItem {
                id: row.try_get::<i64, _>("id").or_else(|_| row.try_get::<i32, _>("id").map(|v| v as i64)).unwrap_or(0),
                data_programada: row.try_get("data_programada").unwrap_or_default(),
                tipo: row.try_get("tipo").unwrap_or_default(),
                ordem: row.try_get("ordem").unwrap_or(1),
                lote_number: row.try_get("lote_number").unwrap_or_default(),
                product_code: row.try_get("product_code").unwrap_or_default(),
                product_description: row.try_get("product_description").unwrap_or_default(),
                quantity: row.try_get("quantity").unwrap_or(0.0),
                quantity_kg: row.try_get("quantity_kg").unwrap_or(0.0),
                status_rotulagem: row.try_get("status_rotulagem").unwrap_or_default(),
                observacoes: row.try_get("observacoes").ok(),
                created_by: row.try_get("created_by").ok(),
                created_at: row.try_get("created_at").unwrap_or_default(),
                updated_at: row.try_get("updated_at").unwrap_or_default(),
            });
        }
    }

    // Caso novo item: calcular ordem caso não informada (transação + trava por dia/tipo, como no envase)
    let mut tx = pool.begin().await.map_err(|e| format!("Erro ao iniciar a gravação: {e}"))?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
        .bind(format!("programacao_rotulagem:{}:{}", payload.data_programada, payload.tipo))
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Erro ao travar a programação de rotulagem: {e}"))?;
    let ordem = match payload.ordem {
        Some(o) if o > 0 => o,
        _ => {
            let r = sqlx::query(
                "SELECT COALESCE(MAX(ordem), 0) + 1 AS next_ordem FROM programacao_rotulagem WHERE data_programada = $1::date AND tipo = $2"
            )
            .bind(&payload.data_programada)
            .bind(&payload.tipo)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| format!("Erro ao calcular a ordem da rotulagem: {e}"))?;
            r.try_get::<i32, _>("next_ordem").unwrap_or(1)
        }
    };

    let row = sqlx::query(
        r#"
        INSERT INTO programacao_rotulagem (
            data_programada, tipo, ordem, lote_number, product_code,
            product_description, quantity, quantity_kg,
            status_rotulagem, observacoes, created_by, created_at, updated_at
        )
        VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
        RETURNING
            id,
            to_char(data_programada, 'YYYY-MM-DD') AS data_programada,
            tipo,
            ordem,
            lote_number,
            product_code,
            product_description,
            quantity,
            quantity_kg,
            status_rotulagem,
            observacoes,
            created_by,
            to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
        "#
    )
    .bind(&payload.data_programada)
    .bind(&payload.tipo)
    .bind(ordem)
    .bind(&payload.lote_number)
    .bind(&payload.product_code)
    .bind(&payload.product_description)
    .bind(payload.quantity)
    .bind(payload.quantity_kg)
    .bind(status_rotulagem)
    .bind(&payload.observacoes)
    .bind(&payload.created_by)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| format!("Erro ao criar programação de rotulagem: {e}"))?;
    tx.commit().await.map_err(|e| format!("Erro ao confirmar a programação de rotulagem: {e}"))?;

    Ok(ProgramacaoRotulagemItem {
        id: row.try_get::<i64, _>("id").or_else(|_| row.try_get::<i32, _>("id").map(|v| v as i64)).unwrap_or(0),
        data_programada: row.try_get("data_programada").unwrap_or_default(),
        tipo: row.try_get("tipo").unwrap_or_default(),
        ordem: row.try_get("ordem").unwrap_or(1),
        lote_number: row.try_get("lote_number").unwrap_or_default(),
        product_code: row.try_get("product_code").unwrap_or_default(),
        product_description: row.try_get("product_description").unwrap_or_default(),
        quantity: row.try_get("quantity").unwrap_or(0.0),
        quantity_kg: row.try_get("quantity_kg").unwrap_or(0.0),
        status_rotulagem: row.try_get("status_rotulagem").unwrap_or_default(),
        observacoes: row.try_get("observacoes").ok(),
        created_by: row.try_get("created_by").ok(),
        created_at: row.try_get("created_at").unwrap_or_default(),
        updated_at: row.try_get("updated_at").unwrap_or_default(),
    })
}

pub async fn delete_programacao_rotulagem(pool: &PgPool, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM programacao_rotulagem WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("Erro ao remover programação de rotulagem: {e}"))?;
    Ok(())
}

pub async fn delete_programacao_rotulagem_by_lote(pool: &PgPool, lote_number: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM programacao_rotulagem WHERE lote_number = $1")
        .bind(lote_number)
        .execute(pool)
        .await
        .map_err(|e| format!("Erro ao remover programação de rotulagem do lote: {e}"))?;
    Ok(())
}

pub async fn reorder_programacao_rotulagem(
    pool: &PgPool,
    payload: &ReorderProgramacaoRotulagemPayload,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| format!("Erro ao iniciar a reordenação: {e}"))?;
    for item in &payload.items {
        sqlx::query(
            "UPDATE programacao_rotulagem SET ordem = $1, tipo = $2, updated_at = NOW() WHERE id = $3"
        )
        .bind(item.ordem)
        .bind(&item.tipo)
        .bind(item.id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Erro ao reordenar item de rotulagem {}: {e}", item.id))?;
    }
    tx.commit().await.map_err(|e| format!("Erro ao confirmar a reordenação: {e}"))?;
    Ok(())
}

/// Peso unitário (kg) pela primeira medida da descrição, lida como token (`350ML` não casa `50ML`, `2,5L` não casa
/// `5L`). Mesma regra de `Frontend/src/modules/producao/lib/unitConversion.ts`; sem medida, 1,0.
pub fn parse_product_unit_weight_kg(descricao: &str) -> f64 {
    static RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re = RE.get_or_init(|| regex::Regex::new(r"(\d+(?:[.,]\d+)?)\s*(ML|L|GR|G|KG)\b").expect("regex do peso unitário"));
    let desc = descricao.to_uppercase();
    let Some(c) = re.captures(&desc) else { return 1.0 };
    let Ok(val) = c[1].replace(',', ".").parse::<f64>() else { return 1.0 };
    if val <= 0.0 {
        return 1.0;
    }
    match &c[2] {
        "KG" | "L" => val,
        _ => val / 1000.0,
    }
}

/// Auditoria somente leitura dos lotes: aponta onde a mesma ordem pode estar aparecendo duas vezes
/// (planejamento sem lote ERP x lote ERP já mexido nos quadros), lotes ERP digitados que não existem
/// e o mesmo lote + produto em mais de uma ordem do planejamento. Não corrige nada.
pub async fn auditoria_lotes(pool: &PgPool) -> Result<serde_json::Value, String> {
    use serde_json::json;

    let pares = sqlx::query(
        r#"
        SELECT DISTINCT
            c.lote_number AS lote_erp,
            pp.id AS planning_id,
            pp.codigo_produto,
            pp.descricao,
            to_char(pp.data_planejada, 'YYYY-MM-DD') AS data_planejada,
            pp.quantidade_planejada::float8 AS kg,
            to_char((COALESCE(c.data_producao, c.updated_at) AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS data_lote
        FROM lote_custom_status c
        JOIN stock_movements sm
          ON sm.document_number = c.lote_number AND sm.item_type = 'produto' AND sm.movement_type = 'entrada'
        JOIN producao_planejamento_semanal pp ON pp.codigo_produto = sm.item_code
        WHERE c.lote_number !~* '^(PLAN_|PL-)'
          AND (pp.lote_erp IS NULL OR TRIM(pp.lote_erp) = '')
          AND (pp.ordem_status IS NULL OR pp.ordem_status <> 'cancelado')
          AND NOT EXISTS (
              SELECT 1 FROM producao_planejamento_semanal pq WHERE TRIM(pq.lote_erp) = c.lote_number
          )
          AND ABS(pp.data_planejada - (COALESCE(c.data_producao, c.updated_at) AT TIME ZONE 'America/Sao_Paulo')::date) <= 7
        ORDER BY data_planejada DESC
        LIMIT 200
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro na auditoria (pares PLAN x ERP): {e}"))?;

    let inexistentes = sqlx::query(
        r#"
        SELECT pp.id AS planning_id,
               TRIM(pp.lote_erp) AS lote_erp,
               pp.codigo_produto,
               pp.descricao,
               to_char(pp.data_planejada, 'YYYY-MM-DD') AS data_planejada
        FROM producao_planejamento_semanal pp
        WHERE pp.lote_erp IS NOT NULL AND TRIM(pp.lote_erp) <> ''
          AND (pp.ordem_status IS NULL OR pp.ordem_status <> 'cancelado')
          AND pp.updated_at < NOW() - INTERVAL '6 hours'
          AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.document_number = TRIM(pp.lote_erp))
          AND NOT EXISTS (SELECT 1 FROM erp_lotes_laudos ell WHERE ell.lote = TRIM(pp.lote_erp))
        ORDER BY pp.data_planejada DESC
        LIMIT 200
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro na auditoria (lote ERP inexistente): {e}"))?;

    let repetidos = sqlx::query(
        r#"
        SELECT TRIM(pp.lote_erp) AS lote_erp,
               pp.codigo_produto,
               COUNT(*)::int8 AS ordens,
               array_agg(pp.id ORDER BY pp.created_at) AS planning_ids,
               SUM(pp.quantidade_planejada)::float8 AS kg_total
        FROM producao_planejamento_semanal pp
        WHERE pp.lote_erp IS NOT NULL AND TRIM(pp.lote_erp) <> ''
          AND (pp.ordem_status IS NULL OR pp.ordem_status <> 'cancelado')
        GROUP BY TRIM(pp.lote_erp), pp.codigo_produto
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
        LIMIT 200
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro na auditoria (lote repetido): {e}"))?;

    let txt = |r: &sqlx::postgres::PgRow, c: &str| r.try_get::<Option<String>, _>(c).ok().flatten();
    let num = |r: &sqlx::postgres::PgRow, c: &str| r.try_get::<Option<f64>, _>(c).ok().flatten();

    let pares_json: Vec<serde_json::Value> = pares
        .iter()
        .map(|r| {
            json!({
                "loteErp": txt(r, "lote_erp"),
                "planningId": txt(r, "planning_id"),
                "codigoProduto": txt(r, "codigo_produto"),
                "descricao": txt(r, "descricao"),
                "dataPlanejada": txt(r, "data_planejada"),
                "dataLote": txt(r, "data_lote"),
                "kg": num(r, "kg"),
            })
        })
        .collect();

    let inexistentes_json: Vec<serde_json::Value> = inexistentes
        .iter()
        .map(|r| {
            json!({
                "planningId": txt(r, "planning_id"),
                "loteErp": txt(r, "lote_erp"),
                "codigoProduto": txt(r, "codigo_produto"),
                "descricao": txt(r, "descricao"),
                "dataPlanejada": txt(r, "data_planejada"),
            })
        })
        .collect();

    let repetidos_json: Vec<serde_json::Value> = repetidos
        .iter()
        .map(|r| {
            json!({
                "loteErp": txt(r, "lote_erp"),
                "codigoProduto": txt(r, "codigo_produto"),
                "ordens": r.try_get::<Option<i64>, _>("ordens").ok().flatten().unwrap_or(0),
                "planningIds": r.try_get::<Option<Vec<String>>, _>("planning_ids").ok().flatten().unwrap_or_default(),
                "kgTotal": num(r, "kg_total"),
            })
        })
        .collect();

    Ok(json!({
        "paresPlanErp": pares_json,
        "loteErpInexistente": inexistentes_json,
        "loteRepetido": repetidos_json,
        "total": pares_json.len() + inexistentes_json.len() + repetidos_json.len(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn peso_unitario_le_a_medida_como_token() {
        let casos: [(&str, f64); 10] = [
            ("SHAMPOO 350ML", 0.35),
            ("CONDICIONADOR 2,5L", 2.5),
            ("OLEO 15 L", 15.0),
            ("CREME 500 G", 0.5),
            ("SABONETE 1KG", 1.0),
            ("MASCARA 50ML", 0.05),
            ("GEL 120 GR", 0.12),
            ("PRODUTO 5L", 5.0),
            ("PRODUTO SEM MEDIDA", 1.0),
            ("", 1.0),
        ];
        for (desc, esperado) in casos {
            let v = parse_product_unit_weight_kg(desc);
            assert!((v - esperado).abs() < 1e-9, "{desc}: {v} != {esperado}");
        }
    }

    #[test]
    fn data_agendada_sem_fuso_vale_sao_paulo() {
        assert_eq!(normalizar_data_agendada("2026-10-24").unwrap(), "2026-10-24T08:00:00-03:00");
        assert_eq!(normalizar_data_agendada("2026-10-24T14:30").unwrap(), "2026-10-24T14:30:00-03:00");
        assert_eq!(normalizar_data_agendada("2026-10-24 14:30:15").unwrap(), "2026-10-24T14:30:15-03:00");
        assert_eq!(normalizar_data_agendada("2026-10-24T14:30:00+00:00").unwrap(), "2026-10-24T14:30:00+00:00");
        assert_eq!(normalizar_data_agendada("amanhã").unwrap_err().status, axum::http::StatusCode::UNPROCESSABLE_ENTITY);
    }

    #[test]
    fn campo_distingue_ausente_de_null() {
        let p: SaveLoteTimestampsPayload = serde_json::from_value(json!({ "dataProducao": null, "dataEnvase": "2026-10-24" })).unwrap();
        assert!(p.data_pesagem.is_none(), "ausente");
        assert_eq!(p.data_producao, Some(None), "null explícito");
        assert_eq!(p.data_envase, Some(Some("2026-10-24".to_string())));
    }

    async fn pool_de_teste() -> PgPool {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        for ddl in [
            "CREATE TABLE IF NOT EXISTS lote_custom_status (lote_number TEXT PRIMARY KEY, custom_status TEXT NOT NULL)",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS category TEXT",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS updated_by TEXT",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS notes TEXT",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS data_pesagem TIMESTAMPTZ",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS data_producao TIMESTAMPTZ",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS data_liberado_envase TIMESTAMPTZ",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS data_envase TIMESTAMPTZ",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS data_rotulagem TIMESTAMPTZ",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS data_finalizada TIMESTAMPTZ",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS data_em_espera TIMESTAMPTZ",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS data_previsao TIMESTAMPTZ",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS motivo_espera TEXT",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS is_terceirizado BOOLEAN DEFAULT FALSE",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS ficha_ordem JSONB DEFAULT '{}'::jsonb",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS quantidade_envasada_parcial NUMERIC(15, 4) DEFAULT 0",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS historico_reagendamentos JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS quadros_ocultos JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS etapas_status JSONB DEFAULT '{}'::jsonb",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS insumo_faltante_codigo TEXT",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS insumo_faltante_descricao TEXT",
            "ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS fornecedor_terceirizado TEXT",
            "CREATE TABLE IF NOT EXISTS lote_status_history (id BIGSERIAL PRIMARY KEY, lote_number TEXT NOT NULL, status TEXT NOT NULL, \
             category TEXT, changed_by TEXT, changed_at TIMESTAMPTZ DEFAULT NOW(), notes TEXT)",
            "ALTER TABLE lote_status_history ADD COLUMN IF NOT EXISTS category TEXT",
            "ALTER TABLE lote_status_history ADD COLUMN IF NOT EXISTS changed_by TEXT",
            "ALTER TABLE lote_status_history ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ DEFAULT NOW()",
            "ALTER TABLE lote_status_history ADD COLUMN IF NOT EXISTS notes TEXT",
            "CREATE TABLE IF NOT EXISTS programacao_envase (id BIGSERIAL PRIMARY KEY, lote_number TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS terceirizados_solicitacoes (id BIGSERIAL PRIMARY KEY, product_code TEXT NOT NULL, \
             quantity NUMERIC NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'SOLICITADO', lote_number TEXT)",
            "CREATE TABLE IF NOT EXISTS producao_auditoria (id BIGSERIAL PRIMARY KEY, quando TIMESTAMPTZ NOT NULL DEFAULT NOW(), \
             usuario TEXT NOT NULL, acao TEXT NOT NULL, alvo TEXT NOT NULL DEFAULT '', detalhe JSONB NOT NULL DEFAULT '{}'::jsonb)",
        ] {
            sqlx::query(ddl).execute(&pool).await.unwrap();
        }
        pool
    }

    async fn limpar_lotes(pool: &PgPool, lotes: &[&str]) {
        for l in lotes {
            sqlx::query("DELETE FROM lote_custom_status WHERE lote_number = $1").bind(l).execute(pool).await.unwrap();
            sqlx::query("DELETE FROM lote_status_history WHERE lote_number = $1").bind(l).execute(pool).await.unwrap();
        }
    }

    /// A expressão de peso unitário do SQL da listagem dá o mesmo resultado que a função em Rust.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn peso_unitario_do_sql_igual_ao_do_rust() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        for desc in ["SHAMPOO 350ML", "COND 2,5L", "OLEO 15 L", "CREME 500 G", "SAB 1KG", "MASC 50ML", "X 120 GR", "SEM MEDIDA", "KIT 500 GRAMAS"] {
            let sql: f64 = sqlx::query_scalar(
                r#"SELECT COALESCE(NULLIF(CASE WHEN pw.mt IS NULL THEN NULL
                          ELSE REPLACE((pw.mt)[1], ',', '.')::float8 * (CASE WHEN (pw.mt)[2] IN ('KG', 'L') THEN 1.0 ELSE 0.001 END) END, 0), 1.0)::float8
                   FROM (SELECT regexp_match(UPPER(COALESCE($1::text, '')), '(\d+(?:[.,]\d+)?)\s*(ML|L|GR|G|KG)\y') AS mt) pw"#,
            )
            .bind(desc)
            .fetch_one(&pool)
            .await
            .unwrap();
            let rust = parse_product_unit_weight_kg(desc);
            assert!((sql - rust).abs() < 1e-9, "{desc}: sql {sql} != rust {rust}");
        }
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn timestamps_so_muda_o_que_foi_enviado() {
        let pool = pool_de_teste().await;
        limpar_lotes(&pool, &["TST-ACP-TS"]).await;
        let completo: SaveLoteTimestampsPayload = serde_json::from_value(json!({
            "loteNumber": "TST-ACP-TS", "updatedBy": "t",
            "dataPesagem": "2026-10-20T10:00:00Z", "dataProducao": "2026-10-21T10:00:00Z", "dataEnvase": "2026-10-22T10:00:00Z"
        })).unwrap();
        save_lote_timestamps(&pool, &completo).await.unwrap();

        // só a produção muda: pesagem e envase ficam
        let so_producao: SaveLoteTimestampsPayload = serde_json::from_value(json!({
            "loteNumber": "TST-ACP-TS", "updatedBy": "t", "dataProducao": "2026-10-25T10:00:00Z"
        })).unwrap();
        save_lote_timestamps(&pool, &so_producao).await.unwrap();
        let r = sqlx::query("SELECT to_char(data_pesagem AT TIME ZONE 'UTC','YYYY-MM-DD') AS p, to_char(data_producao AT TIME ZONE 'UTC','YYYY-MM-DD') AS d, \
                             to_char(data_envase AT TIME ZONE 'UTC','YYYY-MM-DD') AS e FROM lote_custom_status WHERE lote_number = 'TST-ACP-TS'")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(r.get::<Option<String>, _>("p").as_deref(), Some("2026-10-20"), "pesagem preservada");
        assert_eq!(r.get::<Option<String>, _>("d").as_deref(), Some("2026-10-25"));
        assert_eq!(r.get::<Option<String>, _>("e").as_deref(), Some("2026-10-22"), "envase preservado");

        // null explícito limpa só aquele campo
        let limpa: SaveLoteTimestampsPayload = serde_json::from_value(json!({ "loteNumber": "TST-ACP-TS", "dataEnvase": null })).unwrap();
        save_lote_timestamps(&pool, &limpa).await.unwrap();
        let r = sqlx::query("SELECT data_pesagem IS NOT NULL AS p, data_envase IS NULL AS e FROM lote_custom_status WHERE lote_number = 'TST-ACP-TS'")
            .fetch_one(&pool).await.unwrap();
        assert!(r.get::<bool, _>("p") && r.get::<bool, _>("e"));

        // data inválida e corpo vazio: 422, nada muda
        let ruim: SaveLoteTimestampsPayload = serde_json::from_value(json!({ "loteNumber": "TST-ACP-TS", "dataPesagem": "ontem" })).unwrap();
        assert_eq!(save_lote_timestamps(&pool, &ruim).await.unwrap_err().status, axum::http::StatusCode::UNPROCESSABLE_ENTITY);
        let vazio: SaveLoteTimestampsPayload = serde_json::from_value(json!({ "loteNumber": "TST-ACP-TS" })).unwrap();
        assert!(save_lote_timestamps(&pool, &vazio).await.is_err());
        limpar_lotes(&pool, &["TST-ACP-TS"]).await;
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn upsert_status_preserva_o_que_nao_veio() {
        let pool = pool_de_teste().await;
        limpar_lotes(&pool, &["TST-ACP-UP"]).await;
        let esp: SaveLoteCustomStatusPayload = serde_json::from_value(json!({
            "loteNumber": "TST-ACP-UP", "customStatus": "Em Espera", "category": "Caldeira", "updatedBy": "t",
            "motivoEspera": "Falta de frasco", "insumoFaltanteCodigo": "9.1", "insumoFaltanteDescricao": "Frasco"
        })).unwrap();
        upsert_status(&pool, &esp).await.unwrap();

        // só o status: categoria, motivo e insumo continuam
        let so_status: SaveLoteCustomStatusPayload = serde_json::from_value(json!({
            "loteNumber": "TST-ACP-UP", "customStatus": "Produzido", "updatedBy": "t"
        })).unwrap();
        upsert_status(&pool, &so_status).await.unwrap();
        let r = sqlx::query("SELECT custom_status, category, motivo_espera, insumo_faltante_codigo, insumo_faltante_descricao, data_em_espera IS NOT NULL AS espera \
                             FROM lote_custom_status WHERE lote_number = 'TST-ACP-UP'").fetch_one(&pool).await.unwrap();
        assert_eq!(r.get::<String, _>("custom_status"), "Produzido");
        assert_eq!(r.get::<Option<String>, _>("category").as_deref(), Some("Caldeira"));
        assert_eq!(r.get::<Option<String>, _>("motivo_espera").as_deref(), Some("Falta de frasco"));
        assert_eq!(r.get::<Option<String>, _>("insumo_faltante_codigo").as_deref(), Some("9.1"));
        assert_eq!(r.get::<Option<String>, _>("insumo_faltante_descricao").as_deref(), Some("Frasco"));
        assert!(r.get::<bool, _>("espera"));

        // sem customStatus: o status do lote fica; só a categoria muda
        let so_categoria: SaveLoteCustomStatusPayload = serde_json::from_value(json!({ "loteNumber": "TST-ACP-UP", "category": "Outra" })).unwrap();
        upsert_status(&pool, &so_categoria).await.unwrap();
        let (st, cat): (String, Option<String>) = sqlx::query_as("SELECT custom_status, category FROM lote_custom_status WHERE lote_number = 'TST-ACP-UP'")
            .fetch_one(&pool).await.unwrap();
        assert_eq!((st.as_str(), cat.as_deref()), ("Produzido", Some("Outra")));

        // null explícito limpa
        let limpa: SaveLoteCustomStatusPayload = serde_json::from_value(json!({
            "loteNumber": "TST-ACP-UP", "customStatus": "Produzido", "updatedBy": "t",
            "category": null, "motivoEspera": null, "insumoFaltanteCodigo": null, "insumoFaltanteDescricao": null
        })).unwrap();
        upsert_status(&pool, &limpa).await.unwrap();
        let r = sqlx::query("SELECT category, motivo_espera, insumo_faltante_codigo, data_em_espera FROM lote_custom_status WHERE lote_number = 'TST-ACP-UP'")
            .fetch_one(&pool).await.unwrap();
        assert!(r.get::<Option<String>, _>("category").is_none());
        assert!(r.get::<Option<String>, _>("motivo_espera").is_none());
        assert!(r.get::<Option<String>, _>("insumo_faltante_codigo").is_none());
        assert!(r.get::<Option<chrono::DateTime<chrono::Utc>>, _>("data_em_espera").is_none());

        // histórico traz o status anterior
        let notas: Vec<Option<String>> = sqlx::query_scalar("SELECT notes FROM lote_status_history WHERE lote_number = 'TST-ACP-UP' ORDER BY id")
            .fetch_all(&pool).await.unwrap();
        assert_eq!(notas.len(), 4);
        assert!(notas[1].as_deref().unwrap_or("").contains("Anterior: Em Espera"));
        limpar_lotes(&pool, &["TST-ACP-UP"]).await;
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn redefinir_status_e_em_2_passos_e_deixa_historico() {
        let pool = pool_de_teste().await;
        limpar_lotes(&pool, &["TST-ACP-DEL"]).await;
        sqlx::query("INSERT INTO lote_custom_status (lote_number, custom_status, category) VALUES ('TST-ACP-DEL', 'Envase', 'Produção')")
            .execute(&pool).await.unwrap();
        let lotes = vec!["TST-ACP-DEL".to_string(), "TST-ACP-NAO-EXISTE".to_string()];

        let previa = apagar_status_lotes(&pool, &lotes, "t", false).await.unwrap();
        assert!(previa.previa);
        assert_eq!(previa.resultado.len(), 1);
        assert_eq!(previa.resultado[0].status_anterior, "Envase");
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM lote_custom_status WHERE lote_number = 'TST-ACP-DEL'").fetch_one(&pool).await.unwrap();
        assert_eq!(n, 1, "a prévia não apaga");

        let feito = apagar_status_lotes(&pool, &lotes, "t", true).await.unwrap();
        assert!(!feito.previa);
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM lote_custom_status WHERE lote_number = 'TST-ACP-DEL'").fetch_one(&pool).await.unwrap();
        assert_eq!(n, 0);
        let nota: String = sqlx::query_scalar("SELECT notes FROM lote_status_history WHERE lote_number = 'TST-ACP-DEL' AND status = 'Status Removido'")
            .fetch_one(&pool).await.unwrap();
        assert!(nota.contains("Anterior: Envase"));
        assert!(apagar_status_lotes(&pool, &[], "t", true).await.is_err());
        limpar_lotes(&pool, &["TST-ACP-DEL"]).await;
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn excluir_solicitacao_so_desmarca_o_lote_vinculado() {
        let pool = pool_de_teste().await;
        limpar_lotes(&pool, &["TST-ACP-T1", "TST-ACP-T2", "TST-ACP-T3"]).await;
        sqlx::query("DELETE FROM terceirizados_solicitacoes WHERE product_code = 'TST-ACP-PROD'").execute(&pool).await.unwrap();
        for l in ["TST-ACP-T1", "TST-ACP-T2", "TST-ACP-T3"] {
            sqlx::query("INSERT INTO lote_custom_status (lote_number, custom_status, is_terceirizado) VALUES ($1, 'Aberto', TRUE)")
                .bind(l).execute(&pool).await.unwrap();
        }
        // T1: solicitação própria; T2: marcado à mão; T3: tem outra solicitação ativa além da que será excluída
        let s1: i64 = sqlx::query_scalar("INSERT INTO terceirizados_solicitacoes (product_code, quantity, lote_number, status) VALUES ('TST-ACP-PROD', 1, 'TST-ACP-T1', 'VINCULADO') RETURNING id")
            .fetch_one(&pool).await.unwrap();
        let s3a: i64 = sqlx::query_scalar("INSERT INTO terceirizados_solicitacoes (product_code, quantity, lote_number, status) VALUES ('TST-ACP-PROD', 1, 'TST-ACP-T3', 'VINCULADO') RETURNING id")
            .fetch_one(&pool).await.unwrap();
        sqlx::query("INSERT INTO terceirizados_solicitacoes (product_code, quantity, lote_number, status) VALUES ('TST-ACP-PROD', 1, 'TST-ACP-T3', 'VINCULADO')")
            .execute(&pool).await.unwrap();

        delete_terceirizados_solicitacao(&pool, s1).await.unwrap();
        delete_terceirizados_solicitacao(&pool, s3a).await.unwrap();
        let marca = |l: &'static str| {
            let pool = pool.clone();
            async move {
                sqlx::query_scalar::<_, Option<bool>>("SELECT is_terceirizado FROM lote_custom_status WHERE lote_number = $1")
                    .bind(l).fetch_one(&pool).await.unwrap().unwrap_or(false)
            }
        };
        assert!(!marca("TST-ACP-T1").await, "o lote da solicitação excluída é desmarcado");
        assert!(marca("TST-ACP-T2").await, "outro lote do mesmo produto não é tocado");
        assert!(marca("TST-ACP-T3").await, "lote com outra solicitação ativa continua marcado");
        sqlx::query("DELETE FROM terceirizados_solicitacoes WHERE product_code = 'TST-ACP-PROD'").execute(&pool).await.unwrap();
        limpar_lotes(&pool, &["TST-ACP-T1", "TST-ACP-T2", "TST-ACP-T3"]).await;
    }
}

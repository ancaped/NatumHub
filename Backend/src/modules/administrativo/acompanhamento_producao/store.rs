use sqlx::{PgPool, Row};
use super::models::{
    AcompanhamentoLoteItem, SaveLoteCustomStatusPayload, AcompanhamentoQueryParams, 
    StatusHistoryEntry, TerceirizadoSolicitacaoItem, CreateTerceirizadoSolicitacaoPayload,
    ProgramacaoEnvaseItem, SaveProgramacaoEnvasePayload, ReorderProgramacaoEnvasePayload,
    ProgramacaoRotulagemItem, SaveProgramacaoRotulagemPayload, ReorderProgramacaoRotulagemPayload,
    SaveFichaOrdemPayload, SaveLoteTimestampsPayload, SaveLoteEtapaStatusPayload
};

pub async fn ensure_schema(pool: &PgPool) -> Result<(), String> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS lote_custom_status (
            lote_number      TEXT PRIMARY KEY,
            custom_status    TEXT NOT NULL,
            category         TEXT,
            updated_by       TEXT,
            updated_at       TIMESTAMPTZ DEFAULT NOW(),
            notes            TEXT,
            data_pesagem     TIMESTAMPTZ,
            data_producao    TIMESTAMPTZ,
            data_envase      TIMESTAMPTZ,
            data_rotulagem   TIMESTAMPTZ,
            data_finalizada  TIMESTAMPTZ,
            data_em_espera   TIMESTAMPTZ,
            data_previsao    TIMESTAMPTZ,
            motivo_espera    TEXT,
            is_terceirizado  BOOLEAN DEFAULT FALSE
        );
        ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS data_previsao TIMESTAMPTZ;
        ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS data_liberado_envase TIMESTAMPTZ;
        ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS ficha_ordem JSONB DEFAULT '{}'::jsonb;
        ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS quantidade_envasada_parcial NUMERIC(15, 4) DEFAULT 0;
        ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS historico_reagendamentos JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS quadros_ocultos JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS etapas_status JSONB DEFAULT '{}'::jsonb;
        CREATE INDEX IF NOT EXISTS idx_lote_custom_status ON lote_custom_status(custom_status);
        CREATE INDEX IF NOT EXISTS idx_lote_custom_terceirizado ON lote_custom_status(is_terceirizado);

        CREATE TABLE IF NOT EXISTS lote_status_history (
            id            BIGSERIAL PRIMARY KEY,
            lote_number   TEXT NOT NULL,
            status        TEXT NOT NULL,
            category      TEXT,
            changed_by    TEXT,
            changed_at    TIMESTAMPTZ DEFAULT NOW(),
            notes         TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_lote_status_history_lote ON lote_status_history(lote_number);

        CREATE TABLE IF NOT EXISTS terceirizados_solicitacoes (
            id                  BIGSERIAL PRIMARY KEY,
            product_code        TEXT NOT NULL,
            product_description TEXT,
            quantity            NUMERIC NOT NULL,
            unit                TEXT DEFAULT 'UN',
            status              TEXT NOT NULL DEFAULT 'SOLICITADO',
            lote_number         TEXT,
            fornecedor          TEXT,
            previsao_entrega    DATE,
            observacoes         TEXT,
            solicitado_por      TEXT,
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            vinculado_em        TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS idx_terceirizados_solicitacoes_prod ON terceirizados_solicitacoes(product_code);
        CREATE INDEX IF NOT EXISTS idx_terceirizados_solicitacoes_status ON terceirizados_solicitacoes(status);
        CREATE INDEX IF NOT EXISTS idx_terceirizados_solicitacoes_lote ON terceirizados_solicitacoes(lote_number);

        ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS quantity_kg NUMERIC;
        ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS quantity_un NUMERIC;
        ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS aprovacao_embalagem BOOLEAN DEFAULT FALSE;
        ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS aprovacao_embalagem_por TEXT;
        ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS aprovacao_embalagem_em TIMESTAMPTZ;
        ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS aprovacao_materia_prima BOOLEAN DEFAULT FALSE;
        ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS aprovacao_materia_prima_por TEXT;
        ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS aprovacao_materia_prima_em TIMESTAMPTZ;

        CREATE TABLE IF NOT EXISTS programacao_envase (
            id SERIAL PRIMARY KEY,
            data_programada DATE NOT NULL,
            linha VARCHAR(20) NOT NULL,
            ordem INT NOT NULL DEFAULT 1,
            lote_number VARCHAR(100) NOT NULL,
            product_code VARCHAR(100) NOT NULL,
            product_description TEXT NOT NULL,
            quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
            quantity_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
            categoria_envase VARCHAR(50) NOT NULL,
            status_envase VARCHAR(50) NOT NULL DEFAULT 'PROGRAMADO',
            observacoes TEXT,
            created_by VARCHAR(100),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_programacao_envase_data ON programacao_envase(data_programada);
        CREATE INDEX IF NOT EXISTS idx_programacao_envase_lote ON programacao_envase(lote_number);
        ALTER TABLE programacao_envase ADD COLUMN IF NOT EXISTS is_colorido BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE programacao_envase ADD COLUMN IF NOT EXISTS cor VARCHAR(50);
        ALTER TABLE programacao_envase ALTER COLUMN id TYPE BIGINT;
        ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS insumo_faltante_codigo TEXT;
        ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS insumo_faltante_descricao TEXT;
        ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS fornecedor_terceirizado TEXT;
        ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS etapas_status JSONB DEFAULT '{}'::jsonb;

        CREATE TABLE IF NOT EXISTS programacao_rotulagem (
            id BIGSERIAL PRIMARY KEY,
            data_programada DATE NOT NULL,
            tipo VARCHAR(20) NOT NULL,
            ordem INT NOT NULL DEFAULT 1,
            lote_number VARCHAR(100) NOT NULL,
            product_code VARCHAR(100) NOT NULL,
            product_description TEXT NOT NULL,
            quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
            quantity_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
            status_rotulagem VARCHAR(50) NOT NULL DEFAULT 'PROGRAMADO',
            observacoes TEXT,
            created_by VARCHAR(100),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_programacao_rotulagem_data ON programacao_rotulagem(data_programada);
        CREATE INDEX IF NOT EXISTS idx_programacao_rotulagem_lote ON programacao_rotulagem(lote_number);
        CREATE INDEX IF NOT EXISTS idx_programacao_rotulagem_tipo ON programacao_rotulagem(tipo);
        "#
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Erro ao criar tabela lote_custom_status/terceirizados_solicitacoes/programacao_envase/programacao_rotulagem: {e}"))?;

    Ok(())
}

pub async fn list_acompanhamento(
    pool: &PgPool,
    params: &AcompanhamentoQueryParams,
) -> Result<Vec<AcompanhamentoLoteItem>, String> {
    let sql = String::from(
        r#"
        SELECT 
            m.document_number AS lote_number,
            m.item_code,
            COALESCE(p.descricao, m.item_code) AS descricao,
            m.quantity AS kg,
            m.date,
            m.details,
            COALESCE(c.custom_status, 'Pesagem') AS custom_status,
            c.category,
            c.updated_by,
            to_char(c.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
            c.notes,
            COALESCE(to_char(c.data_pesagem, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), m.date || 'T08:00:00Z') AS data_pesagem,
            COALESCE(to_char(c.data_producao, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), m.date || 'T08:00:00Z') AS data_producao,
            to_char(c.data_liberado_envase, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS data_liberado_envase,
            to_char(c.data_envase, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS data_envase,
            to_char(c.data_rotulagem, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS data_rotulagem,
            to_char(c.data_finalizada, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS data_finalizada,
            to_char(c.data_em_espera, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS data_em_espera,
            COALESCE(to_char(c.data_previsao, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), m.date || 'T08:00:00Z') AS data_previsao,
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
                sm.document_number,
                sm.item_code,
                sm.quantity,
                sm.date,
                sm.details
            FROM stock_movements sm
            WHERE sm.item_type = 'produto' AND sm.movement_type = 'entrada'

            UNION ALL

            SELECT 
                COALESCE(NULLIF(pp.lote_erp, ''), 'PL-' || SUBSTRING(pp.id FROM 1 FOR 8)) AS document_number,
                pp.codigo_produto AS item_code,
                pp.quantidade_planejada::float8 AS quantity,
                to_char(pp.data_planejada, 'YYYY-MM-DD') AS date,
                'Planejamento Semanal' AS details
            FROM producao_planejamento_semanal pp
            WHERE (pp.ordem_status = 'aprovado' OR (pp.lote_erp IS NOT NULL AND pp.lote_erp != ''))
              AND NOT EXISTS (
                  SELECT 1 FROM stock_movements sm2
                  WHERE sm2.item_type = 'produto' AND sm2.movement_type = 'entrada'
                    AND sm2.document_number = pp.lote_erp
              )
        ) m
        LEFT JOIN produtos p ON m.item_code = p.codigo
        LEFT JOIN lote_custom_status c ON m.document_number = c.lote_number
        LEFT JOIN overrides_produtos ovr ON m.item_code = ovr.codigo
        WHERE 1=1
        "#
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
            qb.push(" AND c.category = ");
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
    let limit = params.limit.unwrap_or(2500);
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

        // Extrai Unidades de details (se presente)
        let mut unidades: f64 = kg;
        let mut erp_code = "EA".to_string();

        for part in details.split('|') {
            let part = part.trim();
            if part.starts_with("Status:") {
                erp_code = part.trim_start_matches("Status:").trim().to_string();
            } else if part.starts_with("Unidades:") {
                if let Ok(u) = part.trim_start_matches("Unidades:").trim().parse::<f64>() {
                    if u > 0.0 {
                        unidades = u;
                    }
                }
            }
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

        items.push(AcompanhamentoLoteItem {
            lote_number,
            product_code,
            product_description,
            quantity: unidades,
            quantity_kg: kg,
            date,
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
        });
    }

    Ok(items)
}

pub async fn upsert_status(
    pool: &PgPool,
    payload: &SaveLoteCustomStatusPayload,
) -> Result<(), String> {
    let is_terceirizado_val = payload.is_terceirizado.unwrap_or(false);
    let mut normalized_status = payload.custom_status.clone();
    if normalized_status == "Produção" {
        normalized_status = "Produzido".to_string();
    } else if normalized_status == "Finalizada" {
        normalized_status = "Ordem Finalizada".to_string();
    }

    sqlx::query(
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
            category = EXCLUDED.category,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW(),
            notes = COALESCE(EXCLUDED.notes, lote_custom_status.notes),
            data_pesagem = CASE WHEN EXCLUDED.custom_status IN ('Pesagem', 'Produção', 'Produzido', 'Liberado para Envase', 'Envase', 'Rotulagem') THEN COALESCE(lote_custom_status.data_pesagem, NOW()) ELSE lote_custom_status.data_pesagem END,
            data_producao = CASE WHEN EXCLUDED.custom_status IN ('Produção', 'Produzido') THEN COALESCE(lote_custom_status.data_producao, NOW()) ELSE lote_custom_status.data_producao END,
            data_liberado_envase = CASE WHEN EXCLUDED.custom_status = 'Liberado para Envase' THEN COALESCE(lote_custom_status.data_liberado_envase, NOW()) ELSE lote_custom_status.data_liberado_envase END,
            data_envase = CASE WHEN EXCLUDED.custom_status IN ('Envase', 'Ordem Parcial') THEN COALESCE(lote_custom_status.data_envase, NOW()) ELSE lote_custom_status.data_envase END,
            data_rotulagem = CASE WHEN EXCLUDED.custom_status = 'Rotulagem' THEN COALESCE(lote_custom_status.data_rotulagem, NOW()) ELSE lote_custom_status.data_rotulagem END,
            data_finalizada = CASE WHEN EXCLUDED.custom_status IN ('Finalizada', 'Ordem Finalizada') THEN COALESCE(lote_custom_status.data_finalizada, NOW()) ELSE lote_custom_status.data_finalizada END,
            data_em_espera = CASE WHEN EXCLUDED.motivo_espera IS NOT NULL THEN COALESCE(lote_custom_status.data_em_espera, NOW()) ELSE NULL END,
            motivo_espera = EXCLUDED.motivo_espera,
            is_terceirizado = CASE WHEN $7 THEN TRUE ELSE lote_custom_status.is_terceirizado END,
            ficha_ordem = COALESCE(EXCLUDED.ficha_ordem, lote_custom_status.ficha_ordem),
            quantidade_envasada_parcial = COALESCE(EXCLUDED.quantidade_envasada_parcial, lote_custom_status.quantidade_envasada_parcial),
            insumo_faltante_codigo = EXCLUDED.insumo_faltante_codigo,
            insumo_faltante_descricao = EXCLUDED.insumo_faltante_descricao,
            fornecedor_terceirizado = COALESCE(EXCLUDED.fornecedor_terceirizado, lote_custom_status.fornecedor_terceirizado)
        "#
    )
    .bind(&payload.lote_number)
    .bind(&normalized_status)
    .bind(&payload.category)
    .bind(&payload.updated_by)
    .bind(&payload.notes)
    .bind(&payload.motivo_espera)
    .bind(is_terceirizado_val)
    .bind(&payload.ficha_ordem)
    .bind(payload.quantidade_envasada_parcial)
    .bind(&payload.insumo_faltante_codigo)
    .bind(&payload.insumo_faltante_descricao)
    .bind(&payload.fornecedor_terceirizado)
    .execute(pool)
    .await
    .map_err(|e| format!("Erro ao salvar status customizado: {e}"))?;

    if normalized_status == "Ordem Finalizada" || normalized_status == "Finalizada" {
        let _ = delete_programacao_envase_by_lote(pool, &payload.lote_number).await;
    }

    // Grava também no histórico de transições
    let history_notes = payload.motivo_espera.clone().or_else(|| payload.notes.clone());
    let _ = sqlx::query(
        r#"
        INSERT INTO lote_status_history (lote_number, status, category, changed_by, changed_at, notes)
        VALUES ($1, $2, $3, $4, NOW(), $5)
        "#
    )
    .bind(&payload.lote_number)
    .bind(&normalized_status)
    .bind(&payload.category)
    .bind(&payload.updated_by)
    .bind(&history_notes)
    .execute(pool)
    .await;

    Ok(())
}

pub async fn save_ficha_ordem(
    pool: &PgPool,
    payload: &SaveFichaOrdemPayload,
) -> Result<(), String> {
    let mut normalized_status = payload.custom_status.clone();
    if let Some(ref st) = normalized_status {
        if st == "Produção" {
            normalized_status = Some("Produzido".to_string());
        } else if st == "Finalizada" {
            normalized_status = Some("Ordem Finalizada".to_string());
        }
    }

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
    .execute(pool)
    .await
    .map_err(|e| format!("Erro ao salvar ficha da ordem: {e}"))?;

    if let Some(ref st) = normalized_status {
        let _ = sqlx::query(
            r#"
            INSERT INTO lote_status_history (lote_number, status, category, changed_by, changed_at, notes)
            VALUES ($1, $2, 'Ficha da Ordem', $3, NOW(), 'Apontamento via Ficha da Ordem')
            "#
        )
        .bind(&payload.lote_number)
        .bind(st)
        .bind(&payload.updated_by)
        .execute(pool)
        .await;
    }

    Ok(())
}

pub async fn save_batch_lote_custom_status(
    pool: &PgPool,
    payload: &super::models::BatchLoteCustomStatusPayload,
) -> Result<usize, String> {
    let count = payload.lote_numbers.len();
    if count == 0 {
        return Ok(0);
    }

    if let Some(ref new_status) = payload.custom_status {
        if new_status.trim().is_empty() {
            for lote in &payload.lote_numbers {
                delete_status(pool, lote).await?;
            }
            return Ok(count);
        }

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
            upsert_status(pool, &single_payload).await?;
        }
    } else {
        for lote in &payload.lote_numbers {
            delete_status(pool, lote).await?;
        }
    }

    Ok(count)
}

pub async fn save_lote_etapa_status(
    pool: &PgPool,
    payload: &SaveLoteEtapaStatusPayload,
    lote_number: &str,
) -> Result<(), String> {
    let etapa = payload.etapa.trim().to_lowercase();
    let status = payload.status.trim().to_string();
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
            CASE WHEN $4 = 'pesagem' AND ($5 = 'concluido' OR $5 = 'Concluído') THEN NOW() ELSE NULL END,
            CASE WHEN $4 = 'producao' AND ($5 = 'concluido' OR $5 = 'Concluído') THEN NOW() ELSE NULL END,
            CASE WHEN $4 = 'rotulagem' AND ($5 = 'concluido' OR $5 = 'Concluído') THEN NOW() ELSE NULL END,
            CASE WHEN $4 = 'envase' AND ($5 = 'concluido' OR $5 = 'Concluído') THEN NOW() ELSE NULL END
        )
        ON CONFLICT (lote_number) DO UPDATE SET
            etapas_status = COALESCE(lote_custom_status.etapas_status, '{}'::jsonb) || $2,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW(),
            data_pesagem = CASE WHEN $4 = 'pesagem' AND ($5 = 'concluido' OR $5 = 'Concluído') THEN COALESCE(lote_custom_status.data_pesagem, NOW()) ELSE lote_custom_status.data_pesagem END,
            data_producao = CASE WHEN $4 = 'producao' AND ($5 = 'concluido' OR $5 = 'Concluído') THEN COALESCE(lote_custom_status.data_producao, NOW()) ELSE lote_custom_status.data_producao END,
            data_rotulagem = CASE WHEN $4 = 'rotulagem' AND ($5 = 'concluido' OR $5 = 'Concluído') THEN COALESCE(lote_custom_status.data_rotulagem, NOW()) ELSE lote_custom_status.data_rotulagem END,
            data_envase = CASE WHEN $4 = 'envase' AND ($5 = 'concluido' OR $5 = 'Concluído') THEN COALESCE(lote_custom_status.data_envase, NOW()) ELSE lote_custom_status.data_envase END
        "#
    )
    .bind(lote_number)
    .bind(&patch)
    .bind(&updated_by)
    .bind(&etapa)
    .bind(&status)
    .execute(pool)
    .await
    .map_err(|e| format!("Erro ao salvar status da etapa: {e}"))?;

    Ok(())
}

pub async fn save_lote_previsao(
    pool: &PgPool,
    lote_number: &str,
    data_previsao: Option<&str>,
    updated_by: Option<&str>,
    fornecedor_terceirizado: Option<&str>,
) -> Result<(), String> {
    let now = chrono::Utc::now();
    let prev_dt = if let Some(dp) = data_previsao {
        let trimmed = dp.trim();
        if trimmed.is_empty() {
            None
        } else {
            chrono::DateTime::parse_from_rfc3339(trimmed)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .or_else(|_| {
                    chrono::NaiveDate::parse_from_str(trimmed, "%Y-%m-%d")
                        .map(|d| d.and_hms_opt(12, 0, 0).unwrap().and_utc())
                })
                .ok()
        }
    } else {
        None
    };

    // Buscar data_previsao atual (ou data da OP original) para detectar reagendamento/adiamento
    let current_previsao: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
        "SELECT data_previsao FROM lote_custom_status WHERE lote_number = $1"
    )
    .bind(lote_number)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    let old_date_str: Option<String> = if let Some(cp) = current_previsao {
        Some(cp.format("%Y-%m-%d").to_string())
    } else {
        let erp_dt: Option<String> = sqlx::query_scalar(
            "SELECT date::text FROM stock_movements WHERE document_number = $1 AND item_type = 'produto' AND movement_type = 'entrada' LIMIT 1"
        )
        .bind(lote_number)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);
        erp_dt.map(|d| d.chars().take(10).collect::<String>())
    };

    let new_entry_json: Option<serde_json::Value> = if let Some(new_dt) = prev_dt {
        let new_date_str = new_dt.format("%Y-%m-%d").to_string();
        if let Some(ref old_str) = old_date_str {
            if old_str != &new_date_str {
                let is_adiamento = &new_date_str > old_str;
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
                    "alteradoEm": now.to_rfc3339(),
                    "alteradoPor": updated_by.unwrap_or("Operador")
                }]))
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    // Upsert em lote_custom_status
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
    .execute(pool)
    .await
    .map_err(|e| format!("Erro ao salvar previsão do lote: {e}"))?;

    // Registra no histórico de auditoria
    let note_text = match prev_dt {
        Some(dt) => format!("Previsão de produção definida/alterada para {}", dt.format("%d/%m/%Y")),
        None => "Previsão de produção atualizada".to_string(),
    };

    let _ = sqlx::query(
        r#"
        INSERT INTO lote_status_history (lote_number, status, changed_by, changed_at, notes)
        VALUES ($1, 'Previsão Alterada', $2, $3, $4)
        "#
    )
    .bind(lote_number)
    .bind(updated_by)
    .bind(now)
    .bind(&note_text)
    .execute(pool)
    .await;

    Ok(())
}

fn parse_timestamp_opt(val: Option<&str>) -> Option<chrono::DateTime<chrono::Utc>> {
    if let Some(s) = val {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            None
        } else {
            chrono::DateTime::parse_from_rfc3339(trimmed)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .or_else(|_| {
                    chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S")
                        .map(|ndt| ndt.and_utc())
                })
                .or_else(|_| {
                    chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M")
                        .map(|ndt| ndt.and_utc())
                })
                .or_else(|_| {
                    chrono::NaiveDate::parse_from_str(trimmed, "%Y-%m-%d")
                        .map(|d| d.and_hms_opt(12, 0, 0).unwrap().and_utc())
                })
                .ok()
        }
    } else {
        None
    }
}

pub async fn save_lote_timestamps(
    pool: &PgPool,
    payload: &SaveLoteTimestampsPayload,
) -> Result<(), String> {
    let now = chrono::Utc::now();
    let dt_pesagem = parse_timestamp_opt(payload.data_pesagem.as_deref());
    let dt_producao = parse_timestamp_opt(payload.data_producao.as_deref());
    let dt_lib_envase = parse_timestamp_opt(payload.data_liberado_envase.as_deref());
    let dt_envase = parse_timestamp_opt(payload.data_envase.as_deref());
    let dt_rotulagem = parse_timestamp_opt(payload.data_rotulagem.as_deref());
    let dt_finalizada = parse_timestamp_opt(payload.data_finalizada.as_deref());
    let dt_previsao = parse_timestamp_opt(payload.data_previsao.as_deref());

    // Detectar alteração de data_previsao para histórico de reagendamento
    let current_previsao: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
        "SELECT data_previsao FROM lote_custom_status WHERE lote_number = $1"
    )
    .bind(&payload.lote_number)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    let old_date_str: Option<String> = if let Some(cp) = current_previsao {
        Some(cp.format("%Y-%m-%d").to_string())
    } else {
        let erp_dt: Option<String> = sqlx::query_scalar(
            "SELECT date::text FROM stock_movements WHERE document_number = $1 AND item_type = 'produto' AND movement_type = 'entrada' LIMIT 1"
        )
        .bind(&payload.lote_number)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);
        erp_dt.map(|d| d.chars().take(10).collect::<String>())
    };

    let new_entry_json: Option<serde_json::Value> = if let Some(new_dt) = dt_previsao {
        let new_date_str = new_dt.format("%Y-%m-%d").to_string();
        if let Some(ref old_str) = old_date_str {
            if old_str != &new_date_str {
                let is_adiamento = &new_date_str > old_str;
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
                    "alteradoEm": now.to_rfc3339(),
                    "alteradoPor": payload.updated_by.as_deref().unwrap_or("Operador")
                }]))
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
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
            data_pesagem = EXCLUDED.data_pesagem,
            data_producao = EXCLUDED.data_producao,
            data_liberado_envase = EXCLUDED.data_liberado_envase,
            data_envase = EXCLUDED.data_envase,
            data_rotulagem = EXCLUDED.data_rotulagem,
            data_finalizada = EXCLUDED.data_finalizada,
            data_previsao = COALESCE(EXCLUDED.data_previsao, lote_custom_status.data_previsao),
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
    .execute(pool)
    .await
    .map_err(|e| format!("Erro ao salvar timestamps do lote: {e}"))?;

    let _ = sqlx::query(
        r#"
        INSERT INTO lote_status_history (lote_number, status, changed_by, changed_at, notes)
        VALUES ($1, 'Datas Ajustadas', $2, $3, 'Ajuste manual de datas e horários das etapas')
        "#
    )
    .bind(&payload.lote_number)
    .bind(&payload.updated_by)
    .bind(now)
    .execute(pool)
    .await;

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

pub async fn delete_status(
    pool: &PgPool,
    lote_number: &str,
) -> Result<(), String> {
    sqlx::query("DELETE FROM lote_custom_status WHERE lote_number = $1")
        .bind(lote_number)
        .execute(pool)
        .await
        .map_err(|e| format!("Erro ao remover status: {e}"))?;

    Ok(())
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

pub async fn delete_terceirizados_solicitacao(
    pool: &PgPool,
    id: i64,
) -> Result<(), String> {
    let row: Option<(Option<String>, String)> = sqlx::query_as(
        "SELECT lote_number, product_code FROM terceirizados_solicitacoes WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    sqlx::query("DELETE FROM terceirizados_solicitacoes WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("Erro ao deletar solicitação de terceirizado: {e}"))?;

    if let Some((lote_opt, prod_code)) = row {
        if let Some(lote) = lote_opt {
            let _ = sqlx::query(
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
            .execute(pool)
            .await;
        }

        let _ = sqlx::query(
            r#"
            UPDATE lote_custom_status
            SET is_terceirizado = FALSE, updated_at = NOW()
            WHERE lote_number IN (
                SELECT m.document_number FROM stock_movements m WHERE m.item_code = $1
            )
            AND NOT EXISTS (
                SELECT 1 FROM terceirizados_solicitacoes ts
                WHERE ts.status != 'CANCELADO' AND ts.product_code = $1
            )
            "#
        )
        .bind(&prod_code)
        .execute(pool)
        .await;
    }

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

    // Caso novo item: calcular ordem caso não informada
    let ordem = match payload.ordem {
        Some(o) if o > 0 => o,
        _ => {
            let max_row = sqlx::query(
                "SELECT COALESCE(MAX(ordem), 0) + 1 AS next_ordem FROM programacao_envase WHERE data_programada = $1::date AND linha = $2"
            )
            .bind(&payload.data_programada)
            .bind(&payload.linha)
            .fetch_one(pool)
            .await;
            match max_row {
                Ok(r) => r.try_get::<i32, _>("next_ordem").unwrap_or(1),
                Err(_) => 1,
            }
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
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Erro ao inserir programação de envase: {e}"))?;

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
    for item in &payload.items {
        sqlx::query(
            "UPDATE programacao_envase SET ordem = $1, linha = $2, updated_at = NOW() WHERE id = $3"
        )
        .bind(item.ordem)
        .bind(&item.linha)
        .bind(item.id)
        .execute(pool)
        .await
        .map_err(|e| format!("Erro ao reordenar item {}: {e}", item.id))?;
    }
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
            updated_by = COALESCE($3, lote_custom_status.updated_by),
            updated_at = NOW()
        "#
    )
    .bind(lote_number)
    .bind(&quadro_json)
    .bind(updated_by)
    .execute(pool)
    .await
    .map_err(|e| format!("Erro ao ocultar lote do quadro: {e}"))?;

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

    if q_norm == "todos" || q_norm == "all" {
        sqlx::query(
            r#"
            UPDATE lote_custom_status
            SET quadros_ocultos = '[]'::jsonb,
                updated_by = COALESCE($2, updated_by),
                updated_at = NOW()
            WHERE lote_number = $1
            "#
        )
        .bind(lote_number)
        .bind(updated_by)
        .execute(pool)
        .await
        .map_err(|e| format!("Erro ao restaurar todos os quadros do lote: {e}"))?;
    } else {
        sqlx::query(
            r#"
            UPDATE lote_custom_status
            SET quadros_ocultos = CASE
                    WHEN quadros_ocultos IS NOT NULL AND jsonb_typeof(quadros_ocultos) = 'array' 
                    THEN (
                        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
                        FROM jsonb_array_elements_text(quadros_ocultos) AS elem
                        WHERE elem != $2
                    )
                    ELSE '[]'::jsonb
                END,
                updated_by = COALESCE($3, updated_by),
                updated_at = NOW()
            WHERE lote_number = $1
            "#
        )
        .bind(lote_number)
        .bind(&q_norm)
        .bind(updated_by)
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

    // Caso novo item: calcular ordem caso não informada
    let ordem = match payload.ordem {
        Some(o) if o > 0 => o,
        _ => {
            let max_row = sqlx::query(
                "SELECT COALESCE(MAX(ordem), 0) + 1 AS next_ordem FROM programacao_rotulagem WHERE data_programada = $1::date AND tipo = $2"
            )
            .bind(&payload.data_programada)
            .bind(&payload.tipo)
            .fetch_one(pool)
            .await;
            match max_row {
                Ok(r) => r.try_get::<i32, _>("next_ordem").unwrap_or(1),
                Err(_) => 1,
            }
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
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Erro ao criar programação de rotulagem: {e}"))?;

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
    for item in &payload.items {
        sqlx::query(
            "UPDATE programacao_rotulagem SET ordem = $1, tipo = $2, updated_at = NOW() WHERE id = $3"
        )
        .bind(item.ordem)
        .bind(&item.tipo)
        .bind(item.id)
        .execute(pool)
        .await
        .map_err(|e| format!("Erro ao reordenar item de rotulagem {}: {e}", item.id))?;
    }
    Ok(())
}




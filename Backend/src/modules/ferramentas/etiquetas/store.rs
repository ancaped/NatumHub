use sqlx::PgPool;
use uuid::Uuid;

use super::models::{
    CatalogProductInfo, CreateLabelTemplatePayload, CreatePrintHistoryPayload, LabelPrintHistoryRecord,
    LabelTemplate, UpdateLabelTemplatePayload,
};

pub async fn ensure_table(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::raw_sql(
        r#"
        CREATE TABLE IF NOT EXISTS hub_label_templates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            description TEXT,
            category TEXT NOT NULL DEFAULT 'custom',
            width_mm FLOAT8 NOT NULL DEFAULT 100.0,
            height_mm FLOAT8 NOT NULL DEFAULT 50.0,
            orientation TEXT NOT NULL DEFAULT 'landscape',
            elements_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            is_default BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_hub_label_templates_category ON hub_label_templates(category);
        CREATE INDEX IF NOT EXISTS idx_hub_label_templates_is_default ON hub_label_templates(is_default);

        CREATE TABLE IF NOT EXISTS hub_label_print_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            template_id UUID,
            template_name TEXT NOT NULL,
            product_code TEXT,
            product_name TEXT,
            lot_number TEXT,
            operator_id TEXT,
            operator_name TEXT,
            copies INT NOT NULL DEFAULT 1,
            printer_name TEXT,
            printed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_hub_label_print_history_printed_at ON hub_label_print_history(printed_at DESC);
        CREATE INDEX IF NOT EXISTS idx_hub_label_print_history_product_code ON hub_label_print_history(product_code);
        CREATE INDEX IF NOT EXISTS idx_hub_label_print_history_operator_id ON hub_label_print_history(operator_id);
        "#,
    )
    .execute(pool)
    .await?;

    let _ = sqlx::raw_sql("ALTER TABLE hub_label_templates ALTER COLUMN width_mm TYPE FLOAT8 USING width_mm::float8;").execute(pool).await;
    let _ = sqlx::raw_sql("ALTER TABLE hub_label_templates ALTER COLUMN height_mm TYPE FLOAT8 USING height_mm::float8;").execute(pool).await;
    sqlx::raw_sql(
        "ALTER TABLE hub_label_templates ADD COLUMN IF NOT EXISTS chave TEXT;
         CREATE UNIQUE INDEX IF NOT EXISTS idx_hub_label_templates_chave ON hub_label_templates(chave) WHERE chave IS NOT NULL;",
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn list_templates(pool: &PgPool) -> Result<Vec<LabelTemplate>, sqlx::Error> {
    ensure_table(pool).await?;

    let rows = sqlx::query_as::<_, LabelTemplate>(
        r#"
        SELECT 
            id,
            name,
            description,
            category,
            width_mm::float8 as width_mm,
            height_mm::float8 as height_mm,
            orientation,
            elements_json,
            is_default,
            chave,
            created_at,
            updated_at
        FROM hub_label_templates
        ORDER BY is_default DESC, name ASC, created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn get_template(pool: &PgPool, id: Uuid) -> Result<Option<LabelTemplate>, sqlx::Error> {
    ensure_table(pool).await?;

    let row = sqlx::query_as::<_, LabelTemplate>(
        r#"
        SELECT 
            id,
            name,
            description,
            category,
            width_mm::float8 as width_mm,
            height_mm::float8 as height_mm,
            orientation,
            elements_json,
            is_default,
            chave,
            created_at,
            updated_at
        FROM hub_label_templates
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

pub async fn create_template(
    pool: &PgPool,
    payload: CreateLabelTemplatePayload,
) -> Result<LabelTemplate, sqlx::Error> {
    ensure_table(pool).await?;

    let width_mm = payload.width_mm.unwrap_or(100.0);
    let height_mm = payload.height_mm.unwrap_or(50.0);
    let orientation = payload.orientation.unwrap_or_else(|| "landscape".to_string());
    let category = payload.category.unwrap_or_else(|| "custom".to_string());
    let is_default = payload.is_default.unwrap_or(false);

    let row = sqlx::query_as::<_, LabelTemplate>(
        r#"
        INSERT INTO hub_label_templates (
            name,
            description,
            category,
            width_mm,
            height_mm,
            orientation,
            elements_json,
            is_default,
            chave
        )
        VALUES ($1, $2, $3, $4::float8, $5::float8, $6, $7, $8, $9)
        RETURNING
            id,
            name,
            description,
            category,
            width_mm::float8 as width_mm,
            height_mm::float8 as height_mm,
            orientation,
            elements_json,
            is_default,
            chave,
            created_at,
            updated_at
        "#,
    )
    .bind(payload.name)
    .bind(payload.description)
    .bind(category)
    .bind(width_mm)
    .bind(height_mm)
    .bind(orientation)
    .bind(payload.elements_json)
    .bind(is_default)
    .bind(payload.chave.filter(|c| !c.trim().is_empty()))
    .fetch_one(pool)
    .await?;

    Ok(row)
}

pub async fn update_template(
    pool: &PgPool,
    id: Uuid,
    payload: UpdateLabelTemplatePayload,
) -> Result<Option<LabelTemplate>, sqlx::Error> {
    ensure_table(pool).await?;

    let current = match get_template(pool, id).await? {
        Some(t) => t,
        None => return Ok(None),
    };

    let name = payload.name.unwrap_or(current.name);
    let description = payload.description.or(current.description);
    let category = payload.category.unwrap_or(current.category);
    let width_mm = payload.width_mm.unwrap_or(current.width_mm);
    let height_mm = payload.height_mm.unwrap_or(current.height_mm);
    let orientation = payload.orientation.unwrap_or(current.orientation);
    let elements_json = payload.elements_json.unwrap_or(current.elements_json);
    let is_default = payload.is_default.unwrap_or(current.is_default);

    let row = sqlx::query_as::<_, LabelTemplate>(
        r#"
        UPDATE hub_label_templates
        SET
            name = $2,
            description = $3,
            category = $4,
            width_mm = $5::float8,
            height_mm = $6::float8,
            orientation = $7,
            elements_json = $8,
            is_default = $9,
            updated_at = NOW()
        WHERE id = $1
        RETURNING
            id,
            name,
            description,
            category,
            width_mm::float8 as width_mm,
            height_mm::float8 as height_mm,
            orientation,
            elements_json,
            is_default,
            chave,
            created_at,
            updated_at
        "#,
    )
    .bind(id)
    .bind(name)
    .bind(description)
    .bind(category)
    .bind(width_mm)
    .bind(height_mm)
    .bind(orientation)
    .bind(elements_json)
    .bind(is_default)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

pub async fn delete_template(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
    ensure_table(pool).await?;

    let res = sqlx::query(
        r#"
        DELETE FROM hub_label_templates
        WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(pool)
    .await?;

    Ok(res.rows_affected() > 0)
}

pub async fn list_print_history(
    pool: &PgPool,
    limit: i64,
) -> Result<Vec<LabelPrintHistoryRecord>, sqlx::Error> {
    ensure_table(pool).await?;

    let rows = sqlx::query_as::<_, LabelPrintHistoryRecord>(
        r#"
        SELECT 
            id,
            template_id,
            template_name,
            product_code,
            product_name,
            lot_number,
            operator_id,
            operator_name,
            copies,
            printer_name,
            printed_at
        FROM hub_label_print_history
        ORDER BY printed_at DESC
        LIMIT $1
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn create_print_history(
    pool: &PgPool,
    operator_id: Option<String>,
    operator_name: Option<String>,
    payload: CreatePrintHistoryPayload,
) -> Result<LabelPrintHistoryRecord, sqlx::Error> {
    ensure_table(pool).await?;

    let copies = payload.copies.unwrap_or(1);

    let row = sqlx::query_as::<_, LabelPrintHistoryRecord>(
        r#"
        INSERT INTO hub_label_print_history (
            template_id,
            template_name,
            product_code,
            product_name,
            lot_number,
            operator_id,
            operator_name,
            copies,
            printer_name,
            printed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING
            id,
            template_id,
            template_name,
            product_code,
            product_name,
            lot_number,
            operator_id,
            operator_name,
            copies,
            printer_name,
            printed_at
        "#,
    )
    .bind(payload.template_id)
    .bind(payload.template_name)
    .bind(payload.product_code)
    .bind(payload.product_name)
    .bind(payload.lot_number)
    .bind(operator_id)
    .bind(operator_name)
    .bind(copies)
    .bind(payload.printer_name)
    .fetch_one(pool)
    .await?;

    Ok(row)
}

pub async fn list_catalog_products(pool: &PgPool) -> Result<Vec<CatalogProductInfo>, sqlx::Error> {
    let sql = format!(
        r#"
        SELECT 
            p.codigo,
            p.descricao,
            {},
            p.codigo_barras,
            o.categoria_produto,
            NULLIF(p.qtde_cx, 0)
        FROM produtos p
        LEFT JOIN overrides_produtos o ON o.codigo = p.codigo
        ORDER BY p.descricao ASC
        LIMIT 5000
        "#,
        crate::core::regras_produto::LINHA_EFETIVA_SQL
    );
    let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, Option<String>, Option<i32>)>(&sql)
    .fetch_all(pool)
    .await?;

    let list = rows
        .into_iter()
        .map(|(codigo, descricao, linha, codigo_barras, categoria, qtde_cx)| {
            // Gerar DUN-14 derivado se EAN existir (prefixo 1 + 12 digitos + checksum)
            let box_barcode = codigo_barras.as_ref().map(|ean| {
                if ean.len() == 13 {
                    format!("1{}", &ean[0..12])
                } else {
                    format!("DUN-{}", codigo)
                }
            });

            CatalogProductInfo {
                codigo,
                descricao,
                codigo_barras,
                codigo_barras_caixa: box_barcode,
                quantidade_caixa: qtde_cx.filter(|n| *n > 0),
                linha,
                categoria,
            }
        })
        .collect();

    Ok(list)
}

pub async fn list_production_lots(pool: &PgPool) -> Result<Vec<super::models::ProductionLotItem>, sqlx::Error> {
    let rows = sqlx::query_as::<_, (i32, String, Option<String>, Option<String>, i32, Option<String>, Option<String>)>(
        r#"
        SELECT 
            h.id,
            h.codigo,
            p.descricao,
            COALESCE(h.lote_erp, 'LOTE-' || h.id::text) as lote,
            h.quantidade,
            h.data_producao,
            p.codigo_barras
        FROM historico_producao h
        LEFT JOIN produtos p ON p.codigo = h.codigo
        ORDER BY h.id DESC
        LIMIT 60
        "#,
    )
    .fetch_all(pool)
    .await?;

    let list = rows
        .into_iter()
        .map(|(id, codigo, descricao, lote, quantidade, data_producao, codigo_barras)| {
            let dun = codigo_barras.as_ref().map(|ean| {
                if ean.len() == 13 {
                    format!("1{}", &ean[0..12])
                } else {
                    format!("DUN-{}", codigo)
                }
            });

            super::models::ProductionLotItem {
                id,
                descricao: descricao.unwrap_or_else(|| codigo.clone()),
                codigo,
                lote: lote.unwrap_or_else(|| format!("LOTE-{}", id)),
                quantidade,
                data_producao,
                codigo_barras,
                codigo_barras_caixa: dun,
            }
        })
        .collect();

    Ok(list)
}

/// Lotes do ERP, do mais recente para o mais antigo, com quanto de etiqueta já foi impressa.
/// `q` procura no número do lote, código e descrição do produto.
pub async fn list_lotes_etiqueta(
    pool: &PgPool,
    q: Option<&str>,
    limit: i64,
) -> Result<Vec<super::models::LoteEtiquetaItem>, sqlx::Error> {
    let termo = q.map(str::trim).filter(|t| !t.is_empty()).map(|t| format!("%{}%", t));
    // Uma linha por item de cada ordem do ERP (entradas de produto): ordem com 2 ou mais itens mostra todos,
    // cada um com a própria quantidade. As etiquetas impressas contam por lote + produto.
    let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, Option<i32>, Option<String>, i64, Option<String>, f64, Option<String>)>(
        r#"
        WITH ent AS (
            SELECT m.document_number AS lote, m.item_code AS codigo,
                   SUM(m.quantity)::float8 AS kg,
                   MAX(m.date) AS data,
                   string_agg(m.details, '|') AS det
            FROM stock_movements m
            WHERE m.item_type = 'produto' AND m.movement_type = 'entrada'
              AND COALESCE(m.document_number, '') <> '' AND m.date::timestamp <= NOW()
            GROUP BY m.document_number, m.item_code
        )
        SELECT
            ent.lote,
            ent.codigo,
            p.descricao,
            ent.data,
            NULLIF(p.qtde_cx, 0),
            NULLIF(TRIM(p.codigo_barras), ''),
            COALESCE(e.copias, 0)::bigint,
            e.ultima,
            ent.kg,
            ent.det
        FROM ent
        LEFT JOIN produtos p ON p.codigo = ent.codigo
        LEFT JOIN (
            SELECT lot_number, product_code, SUM(copies) AS copias,
                   to_char(MAX(printed_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ultima
            FROM hub_label_print_history
            WHERE template_name = 'Etiqueta de Lote (ERP)'
            GROUP BY lot_number, product_code
        ) e ON e.lot_number = ent.lote AND COALESCE(e.product_code, ent.codigo) = ent.codigo
        WHERE ($1::text IS NULL
               OR ent.lote ILIKE $1
               OR ent.codigo ILIKE $1
               OR p.descricao ILIKE $1)
        ORDER BY ent.data DESC, ent.lote DESC, ent.codigo
        LIMIT $2
        "#,
    )
    .bind(termo)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(lote, codigo, descricao, data_producao, qtde_cx, ean, impressas, ultima, kg, det)| {
            // O lote do ERP entra em kg. Unidades: as conferidas no envase ("Unidades: N" nos detalhes)
            // ou, sem conferência, kg / peso da unidade pela descrição (mesma regra da conferência da Produção).
            let (unidades, estimada) = unidades_do_lote(kg, det.as_deref(), descricao.as_deref());
            let mut item = item_etiqueta(lote, codigo, descricao, unidades, data_producao, qtde_cx, ean, impressas, ultima, None);
            item.quantidade_estimada = estimada;
            item
        })
        .collect())
}

/// Unidades do item de um lote e se foram estimadas (kg / peso da unidade) em vez de conferidas no envase.
fn unidades_do_lote(kg: f64, detalhes: Option<&str>, descricao: Option<&str>) -> (i32, bool) {
    let conferidas = detalhes
        .unwrap_or("")
        .split('|')
        .filter_map(|p| p.trim().strip_prefix("Unidades:").and_then(|v| v.trim().parse::<f64>().ok()))
        .find(|u| *u > 0.0);
    let peso = crate::modules::producao::lotes::parse_unit_weight_from_desc(descricao.unwrap_or(""));
    match conferidas {
        Some(u) => (u.round() as i32, false),
        None if peso > 0.0 => ((kg / peso).round() as i32, true),
        None => (kg.round() as i32, true),
    }
}

#[allow(clippy::too_many_arguments)]
fn item_etiqueta(
    lote: String,
    codigo: String,
    descricao: Option<String>,
    quantidade: i32,
    data_producao: Option<String>,
    qtde_cx: Option<i32>,
    ean: Option<String>,
    impressas: i64,
    ultima: Option<String>,
    status: Option<String>,
) -> super::models::LoteEtiquetaItem {
    let caixas = qtde_cx
        .filter(|c| *c > 0)
        .map(|c| (quantidade + c - 1) / c)
        .filter(|n| *n > 0);
    super::models::LoteEtiquetaItem {
        descricao: descricao.unwrap_or_else(|| codigo.clone()),
        lote,
        codigo,
        quantidade,
        data_producao,
        quantidade_caixa: qtde_cx,
        codigo_barras: ean.filter(|e| e.len() == 13),
        quantidade_estimada: false,
        etiquetas_sugeridas: caixas.map(|n| n + 1),
        caixas,
        etiquetas_impressas: impressas,
        ultima_impressao: ultima,
        status,
    }
}

/// Ordens de montagem de kit (o número da ordem é o lote do kit), da mais recente para a mais antiga.
pub async fn list_kits_etiqueta(
    pool: &PgPool,
    q: Option<&str>,
    limit: i64,
) -> Result<Vec<super::models::LoteEtiquetaItem>, sqlx::Error> {
    let termo = q.map(str::trim).filter(|t| !t.is_empty()).map(|t| format!("%{}%", t));
    let rows = sqlx::query_as::<_, (String, String, String, i32, String, String, Option<i32>, Option<String>, i64, Option<String>)>(
        r#"
        SELECT
            o.order_number,
            o.kit_product_code,
            o.kit_product_description,
            ROUND(COALESCE(o.quantity_assembled, o.quantity))::int,
            o.created_at,
            o.status,
            NULLIF(p.qtde_cx, 0),
            NULLIF(TRIM(p.codigo_barras), ''),
            COALESCE(e.copias, 0)::bigint,
            e.ultima
        FROM kit_assembly_orders o
        LEFT JOIN produtos p ON p.codigo = o.kit_product_code
        LEFT JOIN (
            SELECT lot_number, SUM(copies) AS copias, to_char(MAX(printed_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ultima
            FROM hub_label_print_history
            WHERE template_name = 'Etiqueta de Kit (ERP)'
            GROUP BY lot_number
        ) e ON e.lot_number = o.order_number
        WHERE ($1::text IS NULL
               OR o.order_number ILIKE $1
               OR o.kit_product_code ILIKE $1
               OR o.kit_product_description ILIKE $1)
        ORDER BY o.id DESC
        LIMIT $2
        "#,
    )
    .bind(termo)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(lote, codigo, descricao, quantidade, criada, status, qtde_cx, ean, impressas, ultima)| {
            item_etiqueta(lote, codigo, Some(descricao), quantidade, Some(criada), qtde_cx, ean, impressas, ultima, Some(status))
        })
        .collect())
}

/// Produtos de Coloração (categoria efetiva `cat_coloracao`: override ou código 1.34.*), por descrição.
pub async fn list_coloracoes_etiqueta(
    pool: &PgPool,
    q: Option<&str>,
    limit: i64,
) -> Result<Vec<super::models::ColoracaoEtiquetaItem>, sqlx::Error> {
    let termo = q.map(str::trim).filter(|t| !t.is_empty()).map(|t| format!("%{}%", t));
    // A categoria do produto pode ser uma subcategoria de Coloração (árvore em `categories`), como na Compras.
    let rows = sqlx::query_as::<_, (String, String, String, Option<i32>, Option<String>, i64, Option<String>)>(
        r#"
        WITH RECURSIVE arvore AS (
            SELECT id FROM categories WHERE id = 'cat_coloracao'
            UNION
            SELECT c.id FROM categories c JOIN arvore a ON c.parent_id = a.id
        )
        SELECT
            p.codigo,
            p.descricao,
            CASE WHEN p.descricao ILIKE '%tonaliz%' OR cc.name ILIKE '%tonaliz%' THEN 'tonalizante' ELSE 'coloracao' END,
            NULLIF(p.qtde_cx, 0),
            NULLIF(TRIM(p.codigo_barras), ''),
            COALESCE(e.copias, 0)::bigint,
            e.ultima
        FROM produtos p
        LEFT JOIN overrides_produtos o ON o.codigo = p.codigo
        LEFT JOIN categories cc ON cc.id = NULLIF(o.categoria_produto, '')
        LEFT JOIN (
            SELECT product_code, SUM(copies) AS copias, to_char(MAX(printed_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ultima
            FROM hub_label_print_history
            WHERE template_name = 'Etiqueta de Coloração (ERP)'
            GROUP BY product_code
        ) e ON e.product_code = p.codigo
        WHERE COALESCE(NULLIF(o.categoria_produto, ''), CASE WHEN p.codigo LIKE '1.34.%' THEN 'cat_coloracao' END) IN (SELECT id FROM arvore)
          AND ($1::text IS NULL OR p.codigo ILIKE $1 OR p.descricao ILIKE $1)
        ORDER BY p.descricao ASC
        LIMIT $2
        "#,
    )
    .bind(termo)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(codigo, descricao, tipo, qtde_cx, ean, impressas, ultima)| super::models::ColoracaoEtiquetaItem {
            tipo,
            codigo,
            descricao,
            quantidade_caixa: qtde_cx,
            codigo_barras: ean.filter(|e| e.len() == 13),
            etiquetas_impressas: impressas,
            ultima_impressao: ultima,
        })
        .collect())
}

#[cfg(test)]
mod testes_lotes {
    use super::unidades_do_lote;

    #[test]
    fn unidades_conferidas_tem_prioridade_sobre_o_peso() {
        assert_eq!(unidades_do_lote(150.0, Some("Lote X|Unidades: 480"), Some("SH 300 ML")), (480, false));
    }

    #[test]
    fn sem_conferencia_estima_pelo_peso_da_descricao() {
        let (u, estimada) = unidades_do_lote(30.0, None, Some("SH HOMEM 300 ML"));
        assert!(estimada);
        assert!(u > 0);
    }
}

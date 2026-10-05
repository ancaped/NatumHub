use sqlx::{PgPool, Row};
use std::collections::HashMap;

use crate::modules::compras::planejamento::models::*;

async fn ensure_suppliers_columns(pool: &PgPool) {
    let _ = sqlx::query(
        "ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL;
         ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS cnpj TEXT;
         CREATE INDEX IF NOT EXISTS idx_suppliers_parent_id ON suppliers(parent_id);
         CREATE INDEX IF NOT EXISTS idx_suppliers_cnpj ON suppliers(cnpj);"
    )
    .execute(pool)
    .await;
}

pub async fn get_suppliers_query(
    pool: PgPool,
    parent_category_id: Option<String>,
) -> Result<Vec<Supplier>, String> {
    ensure_suppliers_columns(&pool).await;

    let sql = if let Some(ref parent_cat) = parent_category_id {
        if parent_cat == "coloracao" || parent_cat == "apoio" {
            let prefix_cond = if parent_cat == "coloracao" {
                "inv.item_code LIKE '1.34.%'"
            } else {
                "inv.item_code LIKE '1.30.%'"
            };
            let parent_id = if parent_cat == "coloracao" {
                "cat_coloracao"
            } else {
                "cat_apoio"
            };
            format!(
                "SELECT DISTINCT s.id, s.name, s.contact, s.email, s.notes, s.cnpj, s.parent_id, ps.name as parent_name
                 FROM suppliers s
                 LEFT JOIN suppliers ps ON s.parent_id = ps.id
                 WHERE s.id IN (
                     SELECT DISTINCT inv.supplier_id FROM invoices inv
                     LEFT JOIN overrides_produtos op ON op.codigo = inv.item_code
                     WHERE (
                         op.categoria_produto = '{parent_id}'
                         OR op.categoria_produto IN (SELECT id FROM categories WHERE parent_id = '{parent_id}')
                         OR (op.categoria_produto IS NULL AND {prefix_cond})
                     )
                 )
                 OR s.id IN (
                     SELECT DISTINCT s_sub.parent_id FROM suppliers s_sub
                     WHERE s_sub.id IN (
                         SELECT DISTINCT inv.supplier_id FROM invoices inv
                         LEFT JOIN overrides_produtos op ON op.codigo = inv.item_code
                         WHERE (
                             op.categoria_produto = '{parent_id}'
                             OR op.categoria_produto IN (SELECT id FROM categories WHERE parent_id = '{parent_id}')
                             OR (op.categoria_produto IS NULL AND {prefix_cond})
                         )
                     )
                 )
                 ORDER BY s.name"
            )
        } else {
            format!(
                "SELECT DISTINCT s.id, s.name, s.contact, s.email, s.notes, s.cnpj, s.parent_id, ps.name as parent_name
                 FROM suppliers s
                 LEFT JOIN suppliers ps ON s.parent_id = ps.id
                 WHERE s.id IN (
                     SELECT DISTINCT inv.supplier_id FROM invoices inv
                     INNER JOIN items i ON inv.item_code = i.code OR replace(inv.item_code, '.', '') = replace(i.code, '.', '')
                     INNER JOIN categories c ON i.category_id = c.id
                     WHERE c.parent_id = '{parent_cat}' OR c.id = '{parent_cat}'
                 ) OR s.id IN (
                     SELECT DISTINCT qp.supplier_id FROM quotation_prices qp
                     INNER JOIN quotation_items qi ON qp.quotation_item_id = qi.id
                     INNER JOIN items i ON qi.item_code = i.code
                     INNER JOIN categories c ON i.category_id = c.id
                     WHERE c.parent_id = '{parent_cat}' OR c.id = '{parent_cat}'
                 ) OR s.id IN (
                     SELECT DISTINCT s_sub.parent_id FROM suppliers s_sub
                     WHERE s_sub.id IN (
                         SELECT DISTINCT inv.supplier_id FROM invoices inv
                         INNER JOIN items i ON inv.item_code = i.code OR replace(inv.item_code, '.', '') = replace(i.code, '.', '')
                         INNER JOIN categories c ON i.category_id = c.id
                         WHERE c.parent_id = '{parent_cat}' OR c.id = '{parent_cat}'
                     )
                 )
                 ORDER BY s.name"
            )
        }
    } else {
        "SELECT s.id, s.name, s.contact, s.email, s.notes, s.cnpj, s.parent_id, ps.name as parent_name
         FROM suppliers s
         LEFT JOIN suppliers ps ON s.parent_id = ps.id
         ORDER BY s.name".to_string()
    };

    let rows = sqlx::query(&sql)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    // Preload children map for all suppliers
    let child_rows = sqlx::query(
        "SELECT id, name, cnpj, contact, email, parent_id
         FROM suppliers
         WHERE parent_id IS NOT NULL
         ORDER BY name"
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let mut children_map: HashMap<String, Vec<SupplierSummary>> = HashMap::new();
    for crow in child_rows {
        let parent: String = crow.get(5);
        children_map.entry(parent).or_default().push(SupplierSummary {
            id: crow.get(0),
            name: crow.get(1),
            cnpj: crow.get(2),
            contact: crow.get(3),
            email: crow.get(4),
        });
    }

    Ok(rows
        .into_iter()
        .map(|row| {
            let id: String = row.get(0);
            let linked = children_map.get(&id).cloned();
            let linked_count = linked.as_ref().map(|v| v.len() as i64);
            Supplier {
                id,
                name: row.get(1),
                contact: row.get(2),
                email: row.get(3),
                notes: row.get(4),
                cnpj: row.get(5),
                parent_id: row.get(6),
                parent_name: row.get(7),
                linked_suppliers: linked,
                linked_count,
            }
        })
        .collect())
}

pub async fn save_supplier_query(pool: PgPool, supplier: &Supplier) -> Result<(), String> {
    ensure_suppliers_columns(&pool).await;

    sqlx::query(
        "INSERT INTO suppliers (id, name, contact, email, notes, cnpj, parent_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT(id) DO UPDATE SET
             name = EXCLUDED.name,
             contact = EXCLUDED.contact,
             email = EXCLUDED.email,
             notes = EXCLUDED.notes,
             cnpj = EXCLUDED.cnpj,
             parent_id = EXCLUDED.parent_id",
    )
    .bind(&supplier.id)
    .bind(&supplier.name)
    .bind(&supplier.contact)
    .bind(&supplier.email)
    .bind(&supplier.notes)
    .bind(&supplier.cnpj)
    .bind(&supplier.parent_id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn unify_suppliers_query(
    pool: PgPool,
    parent_id: &str,
    child_ids: &[String],
) -> Result<(), String> {
    ensure_suppliers_columns(&pool).await;

    if child_ids.is_empty() {
        return Ok(());
    }

    // Verify parent exists
    let parent_exists: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM suppliers WHERE id = $1)")
        .bind(parent_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if !parent_exists {
        return Err("Fornecedor principal não encontrado.".to_string());
    }

    for child_id in child_ids {
        if child_id == parent_id {
            continue;
        }
        // Link child to parent
        sqlx::query("UPDATE suppliers SET parent_id = $1 WHERE id = $2")
            .bind(parent_id)
            .bind(child_id)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;

        // If the child had children, reparent them to parent_id
        let _ = sqlx::query("UPDATE suppliers SET parent_id = $1 WHERE parent_id = $2")
            .bind(parent_id)
            .bind(child_id)
            .execute(&pool)
            .await;
    }

    Ok(())
}

pub async fn unlink_supplier_query(pool: PgPool, supplier_id: &str) -> Result<(), String> {
    ensure_suppliers_columns(&pool).await;

    sqlx::query("UPDATE suppliers SET parent_id = NULL WHERE id = $1")
        .bind(supplier_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_supplier_history_query(pool: PgPool, id: &str) -> Result<serde_json::Value, String> {
    ensure_suppliers_columns(&pool).await;

    let inv_rows = sqlx::query(
        "SELECT id, invoice_number, item_code, description, unit, quantity, unit_price, total_value, supplier_name, supplier_id, invoice_date,
                cfop, COALESCE(icms_value, 0.0), COALESCE(ipi_value, 0.0), COALESCE(freight_value, 0.0), entry_date, carrier_name, supplier_cnpj, payment_installments
         FROM invoices
         WHERE supplier_id = $1
            OR supplier_id IN (SELECT s.id FROM suppliers s WHERE s.parent_id = $1)
            OR supplier_id = (SELECT s.parent_id FROM suppliers s WHERE s.id = $1 AND s.parent_id IS NOT NULL)
            OR supplier_id IN (
                SELECT s.id FROM suppliers s
                WHERE s.parent_id = (SELECT s2.parent_id FROM suppliers s2 WHERE s2.id = $1 AND s2.parent_id IS NOT NULL)
            )
         ORDER BY invoice_date DESC",
    )
    .bind(id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let invoices: Vec<Invoice> = inv_rows
        .into_iter()
        .map(|row| Invoice {
            id: row.get(0),
            invoice_number: row.get(1),
            item_code: row.get(2),
            description: row.get(3),
            unit: row.get(4),
            quantity: row.get(5),
            unit_price: row.get(6),
            total_value: row.get(7),
            supplier_name: row.get(8),
            supplier_id: row.get(9),
            invoice_date: row.get(10),
            cfop: row.get(11),
            icms_value: row.get(12),
            ipi_value: row.get(13),
            freight_value: row.get(14),
            entry_date: row.get(15),
            carrier_name: row.get(16),
            supplier_cnpj: row.get(17),
            payment_installments: row.get(18),
            ..Default::default()
        })
        .collect();

    let pp_rows = sqlx::query(
        "SELECT invoice_date, unit_price, supplier_name, invoice_number
         FROM invoices
         WHERE (supplier_id = $1
            OR supplier_id IN (SELECT s.id FROM suppliers s WHERE s.parent_id = $1)
            OR supplier_id = (SELECT s.parent_id FROM suppliers s WHERE s.id = $1 AND s.parent_id IS NOT NULL)
            OR supplier_id IN (
                SELECT s.id FROM suppliers s
                WHERE s.parent_id = (SELECT s2.parent_id FROM suppliers s2 WHERE s2.id = $1 AND s2.parent_id IS NOT NULL)
            ))
           AND unit_price > 0
         ORDER BY invoice_date",
    )
    .bind(id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let price_points: Vec<PricePoint> = pp_rows
        .into_iter()
        .map(|row| PricePoint {
            date: row.get(0),
            unit_price: row.get(1),
            supplier_name: row.get(2),
            invoice_number: row.get(3),
        })
        .collect();

    Ok(serde_json::json!({
        "invoices": invoices,
        "pricePoints": price_points
    }))
}

pub async fn get_price_evolution_query(pool: PgPool, item_code: &str) -> Result<Vec<PricePoint>, String> {
    let rows = sqlx::query(
        "SELECT invoice_date, unit_price, COALESCE(supplier_name,''), invoice_number
         FROM invoices WHERE item_code = $1 AND unit_price > 0
         ORDER BY invoice_date",
    )
    .bind(item_code)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| PricePoint {
            date: row.get(0),
            unit_price: row.get(1),
            supplier_name: row.get(2),
            invoice_number: row.get(3),
        })
        .collect())
}

pub async fn get_spending_by_supplier_query(
    pool: PgPool,
    start: &str,
    end: &str,
    parent_category_id: Option<String>,
) -> Result<Vec<SupplierSpend>, String> {
    ensure_suppliers_columns(&pool).await;

    let sql = if let Some(ref parent_cat) = parent_category_id {
        if parent_cat == "coloracao" || parent_cat == "apoio" {
            let prefix_cond = if parent_cat == "coloracao" {
                "inv.item_code LIKE '1.34.%'"
            } else {
                "inv.item_code LIKE '1.30.%'"
            };
            let parent_id = if parent_cat == "coloracao" {
                "cat_coloracao"
            } else {
                "cat_apoio"
            };
            format!(
                "SELECT COALESCE(ps.id, s.id, inv.supplier_id, 'unknown'),
                        COALESCE(ps.name, s.name, inv.supplier_name, 'Desconhecido'),
                        SUM(inv.total_value), COUNT(DISTINCT inv.invoice_number)
                 FROM invoices inv
                 LEFT JOIN suppliers s ON s.id = inv.supplier_id
                 LEFT JOIN suppliers ps ON ps.id = s.parent_id
                 LEFT JOIN overrides_produtos op ON op.codigo = inv.item_code
                 WHERE inv.invoice_date >= $1 AND inv.invoice_date <= $2
                   AND (
                       op.categoria_produto = '{parent_id}'
                       OR op.categoria_produto IN (SELECT id FROM categories WHERE parent_id = '{parent_id}')
                       OR (op.categoria_produto IS NULL AND {prefix_cond})
                   )
                 GROUP BY COALESCE(ps.id, s.id, inv.supplier_id, 'unknown'),
                          COALESCE(ps.name, s.name, inv.supplier_name, 'Desconhecido')
                 ORDER BY SUM(inv.total_value) DESC"
            )
        } else {
            format!(
                "SELECT COALESCE(ps.id, s.id, inv.supplier_id, 'unknown'),
                        COALESCE(ps.name, s.name, inv.supplier_name, 'Desconhecido'),
                        SUM(inv.total_value), COUNT(DISTINCT inv.invoice_number)
                 FROM invoices inv
                 LEFT JOIN suppliers s ON s.id = inv.supplier_id
                 LEFT JOIN suppliers ps ON ps.id = s.parent_id
                 JOIN items i ON i.code = inv.item_code
                 LEFT JOIN categories c ON c.id = i.category_id
                 WHERE inv.invoice_date >= $1 AND inv.invoice_date <= $2
                   AND COALESCE(i.is_ignored, 0) = 0
                   AND (c.parent_id = '{parent_cat}' OR c.id = '{parent_cat}')
                 GROUP BY COALESCE(ps.id, s.id, inv.supplier_id, 'unknown'),
                          COALESCE(ps.name, s.name, inv.supplier_name, 'Desconhecido')
                 ORDER BY SUM(inv.total_value) DESC"
            )
        }
    } else {
        "SELECT COALESCE(ps.id, s.id, inv.supplier_id, 'unknown'),
                COALESCE(ps.name, s.name, inv.supplier_name, 'Desconhecido'),
                SUM(inv.total_value), COUNT(DISTINCT inv.invoice_number)
         FROM invoices inv
         LEFT JOIN suppliers s ON s.id = inv.supplier_id
         LEFT JOIN suppliers ps ON ps.id = s.parent_id
         JOIN items i ON i.code = inv.item_code
         WHERE inv.invoice_date >= $1 AND inv.invoice_date <= $2 AND COALESCE(i.is_ignored, 0) = 0
         GROUP BY COALESCE(ps.id, s.id, inv.supplier_id, 'unknown'),
                  COALESCE(ps.name, s.name, inv.supplier_name, 'Desconhecido')
         ORDER BY SUM(inv.total_value) DESC".to_string()
    };

    let rows = sqlx::query(&sql)
        .bind(start)
        .bind(end)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| SupplierSpend {
            supplier_id: row.get(0),
            supplier_name: row.get(1),
            total_value: row.get(2),
            invoice_count: row.get(3),
        })
        .collect())
}

pub async fn get_spending_by_category_query(
    pool: PgPool,
    start: &str,
    end: &str,
    parent_category_id: Option<String>,
) -> Result<Vec<CategorySpend>, String> {
    let sql = if let Some(ref parent_cat) = parent_category_id {
        if parent_cat == "coloracao" || parent_cat == "apoio" {
            let prefix_cond = if parent_cat == "coloracao" {
                "p.codigo LIKE '1.34.%'"
            } else {
                "p.codigo LIKE '1.30.%'"
            };
            let parent_id = if parent_cat == "coloracao" {
                "cat_coloracao"
            } else {
                "cat_apoio"
            };
            format!(
                "SELECT COALESCE(p.linha_prefix,'unknown'), COALESCE(cl.nome_linha,'Sem Linha'),
                        SUM(inv.total_value), COUNT(DISTINCT inv.item_code)
                 FROM invoices inv
                 JOIN produtos p ON inv.item_code = p.codigo
                 LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
                 LEFT JOIN overrides_produtos op ON op.codigo = p.codigo
                 WHERE inv.invoice_date >= $1 AND inv.invoice_date <= $2
                   AND (
                       op.categoria_produto = '{parent_id}'
                       OR op.categoria_produto IN (SELECT id FROM categories WHERE parent_id = '{parent_id}')
                       OR (op.categoria_produto IS NULL AND {prefix_cond})
                   )
                 GROUP BY p.linha_prefix, cl.nome_linha
                 ORDER BY SUM(inv.total_value) DESC"
            )
        } else {
            format!(
                "SELECT COALESCE(i.category_id,'uncategorized'), COALESCE(c.name,'Sem Categoria'),
                        SUM(inv.total_value), COUNT(DISTINCT inv.item_code)
                 FROM invoices inv
                 JOIN items i ON i.code = inv.item_code
                 LEFT JOIN categories c ON c.id = i.category_id
                 WHERE inv.invoice_date >= $1 AND inv.invoice_date <= $2
                   AND COALESCE(i.is_ignored, 0) = 0
                   AND (c.parent_id = '{parent_cat}' OR c.id = '{parent_cat}')
                 GROUP BY i.category_id, c.name
                 ORDER BY SUM(inv.total_value) DESC"
            )
        }
    } else {
        "SELECT COALESCE(i.category_id,'uncategorized'), COALESCE(c.name,'Sem Categoria'),
                SUM(inv.total_value), COUNT(DISTINCT inv.item_code)
         FROM invoices inv
         JOIN items i ON i.code = inv.item_code
         LEFT JOIN categories c ON c.id = i.category_id
         WHERE inv.invoice_date >= $1 AND inv.invoice_date <= $2 AND COALESCE(i.is_ignored, 0) = 0
         GROUP BY i.category_id, c.name
         ORDER BY SUM(inv.total_value) DESC".to_string()
    };

    let rows = sqlx::query(&sql)
        .bind(start)
        .bind(end)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| CategorySpend {
            category_id: row.get(0),
            category_name: row.get(1),
            total_value: row.get(2),
            item_count: crate::core::pg_row::pg_i32(&row, 3),
        })
        .collect())
}

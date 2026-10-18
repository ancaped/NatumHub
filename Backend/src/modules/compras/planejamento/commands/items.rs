use std::collections::HashMap;

use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::modules::compras::planejamento::models::*;
use crate::modules::compras::planejamento::commands::get_auto_ignored_ingredients_query;

fn map_item_row(row: sqlx::postgres::PgRow, auto_ignored: &std::collections::HashMap<String, String>) -> Item {
    let code: String = row.get(0);
    let is_manually_ignored = row.get::<i32, _>(7) != 0;
    let is_auto_ignored = auto_ignored.contains_key(&code);
    let ignored_reason = auto_ignored.get(&code).cloned();
    Item {
        code: code.clone(),
        description: row.get(1),
        unit: row.get(2),
        category_id: row.get(3),
        line: row.get(4),
        type_code: row.get(5),
        notes: row.get(6),
        is_ignored: is_manually_ignored || is_auto_ignored,
        is_auto_ignored: Some(is_auto_ignored),
        ignored_reason,
    }
}

pub async fn get_items_query(pool: PgPool, category_id: Option<String>) -> Result<Vec<Item>, String> {
    let auto_ignored = get_auto_ignored_ingredients_query(pool.clone()).await?;

    let rows = if let Some(ref cat_id) = category_id {
        sqlx::query(
            "SELECT code, description, unit, category_id, line, \"type\", notes, is_ignored FROM items WHERE category_id = $1 ORDER BY description",
        )
        .bind(cat_id)
        .fetch_all(&pool)
        .await
    } else {
        sqlx::query(
            "SELECT code, description, unit, category_id, line, \"type\", notes, is_ignored FROM items ORDER BY description",
        )
        .fetch_all(&pool)
        .await
    }
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| map_item_row(row, &auto_ignored))
        .collect())
}

pub async fn list_similar_pairs_query(pool: PgPool) -> Result<Vec<SimilarPair>, String> {
    let rows = sqlx::query(
        "SELECT item_code_a, item_code_b FROM similar_items ORDER BY item_code_a, item_code_b",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| SimilarPair {
            code_a: row.get(0),
            code_b: row.get(1),
        })
        .collect())
}

pub async fn get_similar_items_query(pool: PgPool, code: &str) -> Result<Vec<Item>, String> {
    let auto_ignored = get_auto_ignored_ingredients_query(pool.clone()).await?;

    let rows = sqlx::query(
        "SELECT code, description, unit, category_id, line, \"type\", notes, is_ignored
         FROM items
         WHERE code IN (
             SELECT item_code_b FROM similar_items WHERE item_code_a = $1
             UNION
             SELECT item_code_a FROM similar_items WHERE item_code_b = $1
         )
         ORDER BY description",
    )
    .bind(code)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| map_item_row(row, &auto_ignored))
        .collect())
}

pub async fn add_similar_item_query(pool: PgPool, code_a: &str, code_b: &str) -> Result<(), String> {
    let (first, second) = if code_a < code_b {
        (code_a, code_b)
    } else {
        (code_b, code_a)
    };
    sqlx::query(
        "INSERT INTO similar_items (item_code_a, item_code_b) VALUES ($1, $2)
         ON CONFLICT (item_code_a, item_code_b) DO NOTHING",
    )
    .bind(first)
    .bind(second)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn ensure_similar_links(pool: &PgPool) -> Result<(), String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS item_similar_links (
            id TEXT PRIMARY KEY,
            group_id TEXT NOT NULL,
            item_code TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(group_id, item_code)
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_similar_links_group ON item_similar_links(group_id)")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("CREATE UNIQUE INDEX IF NOT EXISTS idx_similar_links_item ON item_similar_links(item_code)")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn group_of(pool: &PgPool, code: &str) -> Result<Option<String>, String> {
    sqlx::query_scalar("SELECT group_id FROM item_similar_links WHERE item_code = $1")
        .bind(code)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())
}

async fn members_of(pool: &PgPool, group_id: &str) -> Result<Vec<String>, String> {
    let rows = sqlx::query("SELECT item_code FROM item_similar_links WHERE group_id = $1 ORDER BY item_code")
        .bind(group_id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|row| row.get(0)).collect())
}

async fn insert_link(pool: &PgPool, group_id: &str, code: &str) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO item_similar_links (id, group_id, item_code, created_at)
         VALUES ($1, $2, $3, NOW()::text)
         ON CONFLICT (item_code) DO UPDATE SET group_id = EXCLUDED.group_id",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(group_id)
    .bind(code)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn write_clique(pool: &PgPool, codes: &[String]) -> Result<(), String> {
    for i in 0..codes.len() {
        for j in (i + 1)..codes.len() {
            add_similar_item_query(pool.clone(), &codes[i], &codes[j]).await?;
        }
    }
    Ok(())
}

async fn detach_code(pool: &PgPool, code: &str) -> Result<(), String> {
    let Some(group_id) = group_of(pool, code).await? else {
        return Ok(());
    };
    let others: Vec<String> = members_of(pool, &group_id)
        .await?
        .into_iter()
        .filter(|c| c != code)
        .collect();
    for other in &others {
        remove_similar_item_query(pool.clone(), code, other).await?;
    }
    sqlx::query("DELETE FROM item_similar_links WHERE item_code = $1")
        .bind(code)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    if others.len() < 2 {
        sqlx::query("DELETE FROM item_similar_links WHERE group_id = $1")
            .bind(&group_id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn absorb_existing_pairs(pool: &PgPool) -> Result<(), String> {
    let pairs = list_similar_pairs_query(pool.clone()).await?;
    let rows = sqlx::query("SELECT item_code, group_id FROM item_similar_links")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    let mut home: HashMap<String, String> = HashMap::new();
    for row in rows {
        home.insert(row.get(0), row.get(1));
    }
    for pair in pairs {
        let left = home.get(&pair.code_a).cloned();
        let right = home.get(&pair.code_b).cloned();
        match (left, right) {
            (Some(a), Some(b)) if a != b => {
                let moving = members_of(pool, &b).await?;
                for code in moving {
                    insert_link(pool, &a, &code).await?;
                    home.insert(code, a.clone());
                }
            }
            (Some(a), None) => {
                insert_link(pool, &a, &pair.code_b).await?;
                home.insert(pair.code_b, a);
            }
            (None, Some(b)) => {
                insert_link(pool, &b, &pair.code_a).await?;
                home.insert(pair.code_a, b);
            }
            (None, None) => {
                let group_id = Uuid::new_v4().to_string();
                insert_link(pool, &group_id, &pair.code_a).await?;
                insert_link(pool, &group_id, &pair.code_b).await?;
                home.insert(pair.code_a, group_id.clone());
                home.insert(pair.code_b, group_id);
            }
            _ => {}
        }
    }
    let mut group_ids: Vec<String> = home.into_values().collect();
    group_ids.sort();
    group_ids.dedup();
    for group_id in group_ids {
        let members = members_of(pool, &group_id).await?;
        if members.len() >= 2 {
            write_clique(pool, &members).await?;
        }
    }
    Ok(())
}

pub async fn list_similar_groups_query(pool: PgPool) -> Result<Vec<SimilarGroup>, String> {
    ensure_similar_links(&pool).await?;
    absorb_existing_pairs(&pool).await?;
    let rows = sqlx::query(
        "SELECT l.group_id, l.item_code,
                COALESCE(i.description, l.item_code),
                COALESCE(i.unit, ''),
                COALESCE(e.estoque, 0)::float8
         FROM item_similar_links l
         LEFT JOIN items i ON i.code = l.item_code
         LEFT JOIN estoque_atual e ON e.codigo = l.item_code
         ORDER BY l.group_id, l.item_code",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut groups: Vec<SimilarGroup> = Vec::new();
    for row in rows {
        let group_id: String = row.get(0);
        let member = SimilarGroupMember {
            code: row.get(1),
            description: row.get(2),
            unit: row.get(3),
            stock: row.get(4),
        };
        if groups.last().map(|g| g.group_id.as_str()) != Some(group_id.as_str()) {
            groups.push(SimilarGroup {
                group_id,
                members: vec![member],
                stock_total: 0.0,
            });
        } else if let Some(group) = groups.last_mut() {
            group.members.push(member);
        }
    }
    for group in &mut groups {
        group.stock_total = group.members.iter().map(|m| m.stock).sum();
    }
    groups.retain(|g| g.members.len() >= 2);
    Ok(groups)
}

pub async fn link_similar_group_query(
    pool: PgPool,
    group_id: Option<String>,
    codes: Vec<String>,
) -> Result<(), String> {
    ensure_similar_links(&pool).await?;
    let mut codes: Vec<String> = codes
        .into_iter()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
        .collect();
    codes.sort();
    codes.dedup();
    if group_id.is_none() && codes.len() < 2 {
        return Err("Um grupo precisa de pelo menos dois itens.".into());
    }
    if codes.is_empty() {
        return Err("Informe o item que entra no grupo.".into());
    }
    for code in &codes {
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM items WHERE code = $1)")
            .bind(code)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;
        if !exists {
            return Err(format!("Item {code} não encontrado."));
        }
    }

    let target = if let Some(id) = group_id.filter(|id| !id.is_empty()) {
        id
    } else {
        let mut found: Option<String> = None;
        for code in &codes {
            if let Some(existing) = group_of(&pool, code).await? {
                found = Some(existing);
                break;
            }
        }
        found.unwrap_or_else(|| Uuid::new_v4().to_string())
    };

    for code in &codes {
        if group_of(&pool, code).await?.as_deref() != Some(target.as_str()) {
            detach_code(&pool, code).await?;
            insert_link(&pool, &target, code).await?;
        }
    }
    let members = members_of(&pool, &target).await?;
    write_clique(&pool, &members).await?;
    Ok(())
}

pub async fn unlink_similar_item_from_group_query(pool: PgPool, code: &str) -> Result<(), String> {
    ensure_similar_links(&pool).await?;
    detach_code(&pool, code.trim()).await
}

pub async fn unlink_similar_group_query(pool: PgPool, group_id: &str) -> Result<(), String> {
    ensure_similar_links(&pool).await?;
    let members = members_of(&pool, group_id).await?;
    for i in 0..members.len() {
        for j in (i + 1)..members.len() {
            remove_similar_item_query(pool.clone(), &members[i], &members[j]).await?;
        }
    }
    sqlx::query("DELETE FROM item_similar_links WHERE group_id = $1")
        .bind(group_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn list_stock_calibrations_query(pool: PgPool) -> Result<Vec<String>, String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS item_stock_calibrations (
            item_code TEXT PRIMARY KEY,
            stock DOUBLE PRECISION NOT NULL,
            updated_at TEXT NOT NULL
        )",
    )
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    let rows = sqlx::query("SELECT item_code FROM item_stock_calibrations ORDER BY item_code")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|row| row.get(0)).collect())
}

pub async fn set_item_real_stock_query(pool: PgPool, code: &str, stock: f64) -> Result<(), String> {
    let code = code.trim();
    if code.is_empty() || !stock.is_finite() || stock < 0.0 {
        return Err("Informe o código e um estoque válido.".into());
    }
    list_stock_calibrations_query(pool.clone()).await?;
    let is_product: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM produtos WHERE codigo = $1)")
        .bind(code)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    if is_product {
        sqlx::query(
            "INSERT INTO estoque_atual (codigo, estoque, producao, pedidos_aberto)
             VALUES ($1, $2, 0, 0)
             ON CONFLICT (codigo) DO UPDATE SET estoque = EXCLUDED.estoque",
        )
        .bind(code)
        .bind(stock)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    sqlx::query(
        "UPDATE stock_snapshots SET stock_qty = $2
         WHERE id = (
             SELECT id FROM stock_snapshots
             WHERE TRIM(item_code) = TRIM($1)
             ORDER BY snapshot_date DESC, id DESC
             LIMIT 1
         )",
    )
    .bind(code)
    .bind(stock)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    sqlx::query(
        "INSERT INTO item_stock_calibrations (item_code, stock, updated_at)
         VALUES ($1, $2, NOW()::text)
         ON CONFLICT (item_code) DO UPDATE SET stock = EXCLUDED.stock, updated_at = EXCLUDED.updated_at",
    )
    .bind(code)
    .bind(stock)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn remove_similar_item_query(pool: PgPool, code_a: &str, code_b: &str) -> Result<(), String> {
    let (first, second) = if code_a < code_b {
        (code_a, code_b)
    } else {
        (code_b, code_a)
    };
    sqlx::query("DELETE FROM similar_items WHERE item_code_a = $1 AND item_code_b = $2")
        .bind(first)
        .bind(second)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn update_item_details_query(
    pool: PgPool,
    code: &str,
    notes: Option<String>,
    is_ignored: bool,
) -> Result<(), String> {
    let is_product: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM produtos WHERE codigo = $1)")
        .bind(code)
        .fetch_one(&pool)
        .await
        .unwrap_or(false);

    if is_product {
        sqlx::query(
            "INSERT INTO overrides_produtos (codigo, observacao, visivel)
             VALUES ($1, $2, $3)
             ON CONFLICT(codigo) DO UPDATE SET
                observacao = EXCLUDED.observacao,
                visivel = EXCLUDED.visivel",
        )
        .bind(code)
        .bind(&notes)
        .bind(if is_ignored { 0 } else { 1 })
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            "UPDATE items SET notes = $2, is_ignored = $3, updated_at = CURRENT_TIMESTAMP::TEXT WHERE code = $1",
        )
        .bind(code)
        .bind(&notes)
        .bind(if is_ignored { 1 } else { 0 })
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub async fn update_items_category_query(
    pool: PgPool,
    codes: &[String],
    category_id: Option<String>,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for code in codes {
        let is_product: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM produtos WHERE codigo = $1)")
            .bind(code)
            .fetch_one(&mut *tx)
            .await
            .unwrap_or(false);

        if is_product {
            sqlx::query(
                "INSERT INTO overrides_produtos (codigo, categoria_produto)
                 VALUES ($1, $2)
                 ON CONFLICT(codigo) DO UPDATE SET categoria_produto = EXCLUDED.categoria_produto",
            )
            .bind(code)
            .bind(&category_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        } else {
            let target_cat = match &category_id {
                Some(cat) => Some(cat.clone()),
                None => {
                    let default_cat = if code.starts_with("9.15.") {
                        "cat_mp"
                    } else if code.starts_with("08.") {
                        "cat_mat"
                    } else {
                        "cat_emb"
                    };
                    Some(default_cat.to_string())
                }
            };
            sqlx::query(
                "UPDATE items SET category_id = $2, manual_category = 1, updated_at = CURRENT_TIMESTAMP::TEXT WHERE code = $1",
            )
            .bind(code)
            .bind(&target_cat)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn import_item_observations_query(
    pool: PgPool,
    observations: &[ObsInput],
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for obs in observations {
        sqlx::query(
            "UPDATE items SET notes = $2, is_ignored = 1, updated_at = CURRENT_TIMESTAMP::TEXT WHERE code = $1",
        )
        .bind(&obs.code)
        .bind(&obs.notes)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

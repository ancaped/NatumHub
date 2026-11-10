use std::collections::HashMap;

use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::core::acao::{executar_em_2_passos, ErroApi, RespostaAcao};
use crate::modules::compras::planejamento::models::*;
use crate::modules::compras::planejamento::commands::get_auto_ignored_ingredients_query;
use crate::modules::geral::audit;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::{
    MODULE_COMPRAS_APOIO, MODULE_COMPRAS_COLOR, MODULE_COMPRAS_EMB, MODULE_COMPRAS_MP,
};

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
        // só a consulta combinada traz a coluna 8; nas demais o `try_get` falha e o campo some do JSON
        is_product: row.try_get::<bool, _>(8).ok().filter(|b| *b),
    }
}

/// Categoria efetiva de um produto (alias `p` = produtos, `o` = overrides_produtos): o override, ou pelo prefixo do código.
const CATEGORIA_EFETIVA_PRODUTO: &str = "COALESCE(NULLIF(o.categoria_produto, ''), CASE WHEN p.codigo LIKE '1.34.%' THEN 'cat_coloracao' WHEN p.codigo LIKE '1.30.%' THEN 'cat_apoio' END)";

/// Filtros de `GET /api/hub/compras/items`. Sem nenhum, a consulta é a de sempre (só `items`).
#[derive(Debug, Default, Clone)]
pub struct FiltroItens {
    pub category_id: Option<String>,
    pub search: Option<String>,
    pub incluir_produtos: bool,
}

/// Padrão `ILIKE` seguro da busca: apara, escapa `\`, `%` e `_` e envolve em `%…%`. Vazio = sem filtro.
pub fn padrao_busca(busca: &str) -> Option<String> {
    let t = busca.trim();
    if t.is_empty() {
        return None;
    }
    let mut p = String::with_capacity(t.len() + 2);
    p.push('%');
    for c in t.chars() {
        if matches!(c, '\\' | '%' | '_') {
            p.push('\\');
        }
        p.push(c);
    }
    p.push('%');
    Some(p)
}

pub async fn get_items_query(pool: PgPool, filtro: FiltroItens) -> Result<Vec<Item>, String> {
    let auto_ignored = get_auto_ignored_ingredients_query(pool.clone()).await?;

    let categoria = filtro.category_id.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string);
    let busca = filtro.search.as_deref().and_then(padrao_busca);

    let rows = if categoria.is_none() && busca.is_none() && !filtro.incluir_produtos {
        sqlx::query(
            "SELECT code, description, unit, category_id, line, \"type\", notes, is_ignored FROM items ORDER BY description",
        )
        .fetch_all(&pool)
        .await
    } else {
        // insumos (`items`) + produtos de Apoio/Coloração; código que é insumo e produto de Apoio/Coloração = só a linha de produto
        let sql = format!(
            "WITH RECURSIVE
               raiz AS (SELECT id FROM categories WHERE $1::text IS NOT NULL AND (id = $1 OR lower(name) = lower($1))),
               arvore AS (SELECT id FROM raiz UNION SELECT c.id FROM categories c JOIN arvore a ON c.parent_id = a.id),
               raiz_produtos AS (SELECT id FROM categories WHERE id IN ('cat_apoio', 'cat_coloracao')),
               arvore_produtos AS (SELECT id FROM raiz_produtos UNION SELECT c.id FROM categories c JOIN arvore_produtos a ON c.parent_id = a.id)
             SELECT code, description, unit, category_id, line, \"type\", notes, is_ignored, is_product FROM (
               SELECT i.code, i.description, i.unit, i.category_id, i.line, i.\"type\" AS \"type\", i.notes, i.is_ignored, false AS is_product
                 FROM items i
                WHERE NOT EXISTS (
                        SELECT 1 FROM produtos p LEFT JOIN overrides_produtos o ON o.codigo = p.codigo
                         WHERE p.codigo = i.code AND {efetiva} IN (SELECT id FROM arvore_produtos))
                  AND ($1::text IS NULL OR i.category_id IN (SELECT id FROM arvore))
                  AND ($2::text IS NULL OR i.code ILIKE $2 OR i.description ILIKE $2)
               UNION ALL
               SELECT p.codigo, p.descricao, 'UN'::text, {efetiva}, NULL::text, NULL::text, o.observacao,
                      CASE WHEN o.visivel = 0 THEN 1 ELSE 0 END, true
                 FROM produtos p
                 LEFT JOIN overrides_produtos o ON o.codigo = p.codigo
                WHERE {efetiva} IN (SELECT id FROM arvore_produtos)
                  AND ($1::text IS NULL OR {efetiva} IN (SELECT id FROM arvore))
                  AND ($2::text IS NULL OR p.codigo ILIKE $2 OR p.descricao ILIKE $2)
             ) t
             ORDER BY description",
            efetiva = CATEGORIA_EFETIVA_PRODUTO
        );
        sqlx::query(&sql).bind(&categoria).bind(&busca).fetch_all(&pool).await
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
            updated_at TEXT NOT NULL,
            erp_base DOUBLE PRECISION
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
        aplicar_categoria_na_tx(&mut tx, code, &category_id).await?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Grava a categoria de um código: produto (`produtos`) vai para `overrides_produtos.categoria_produto`;
/// insumo (`items`) para `items.category_id` (com `None`, volta à categoria padrão pelo prefixo).
async fn aplicar_categoria_na_tx(
    tx: &mut sqlx::PgConnection,
    code: &str,
    category_id: &Option<String>,
) -> Result<(), String> {
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
        .bind(category_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        let target_cat = match category_id {
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
    Ok(())
}

/// Módulos de Compras que cuidam de uma família de categorias (a raiz da árvore em `categories`).
pub fn modulos_da_familia(raiz: &str) -> &'static [&'static str] {
    match raiz {
        "cat_coloracao" => &[MODULE_COMPRAS_COLOR],
        "cat_apoio" => &[MODULE_COMPRAS_APOIO],
        "cat_mp" => &[MODULE_COMPRAS_MP],
        "cat_emb" => &[MODULE_COMPRAS_EMB],
        _ => &[MODULE_COMPRAS_MP, MODULE_COMPRAS_EMB],
    }
}

/// Quem pode trocar a categoria de um item: supervisor sempre; agente precisa editar um módulo da família da
/// categoria de origem (se houver) e um da família do destino; operador humano não supervisor, não.
pub fn checar_permissao_troca(ctx: &AuthContext, raiz_origem: Option<&str>, raiz_destino: &str) -> Result<(), ErroApi> {
    if !ctx.is_agente() {
        return if ctx.role.is_supervisor() {
            Ok(())
        } else {
            Err(ErroApi::sem_permissao("Só supervisor troca a categoria de um item."))
        };
    }
    for (lado, raiz) in raiz_origem.map(|r| ("de origem", r)).into_iter().chain([("de destino", raiz_destino)]) {
        let modulos = modulos_da_familia(raiz);
        if !modulos.iter().any(|m| ctx.can_edit_module(m)) {
            return Err(ErroApi::sem_permissao(format!(
                "Trocar a categoria exige editar {} (categoria {lado}).",
                modulos.join(" ou ")
            ))
            .com_detalhes(json!({ "modulosNecessarios": modulos })));
        }
    }
    Ok(())
}

/// Agente só mexe em produto que já é de Apoio/Coloração: dar categoria a outro produto muda como a Produção e o MRP o tratam.
pub fn checar_produto_do_agente(ctx: &AuthContext, tipo: &str, raiz_origem: Option<&str>) -> Result<(), ErroApi> {
    if ctx.is_agente() && tipo == "produto" && !matches!(raiz_origem, Some("cat_apoio" | "cat_coloracao")) {
        return Err(ErroApi::sem_permissao("Agente só troca a categoria de produto que já é de Material de Apoio ou Coloração; os demais ficam com o supervisor."));
    }
    Ok(())
}

/// Raiz da árvore de categorias (sobe por `parent_id`, com trava contra ciclo).
pub(super) async fn raiz_da_categoria(conn: &mut sqlx::PgConnection, id: &str) -> Result<Option<String>, ErroApi> {
    Ok(sqlx::query_scalar(
        "WITH RECURSIVE sobe AS (
             SELECT id, parent_id, 0 AS n FROM categories WHERE id = $1
             UNION ALL
             SELECT c.id, c.parent_id, s.n + 1 FROM categories c JOIN sobe s ON c.id = s.parent_id WHERE s.n < 20
         ) SELECT id FROM sobe ORDER BY n DESC LIMIT 1",
    )
    .bind(id)
    .fetch_optional(conn)
    .await?)
}

async fn nome_da_categoria(conn: &mut sqlx::PgConnection, id: &str) -> Result<Option<String>, ErroApi> {
    Ok(sqlx::query_scalar("SELECT name FROM categories WHERE id = $1").bind(id).fetch_optional(conn).await?)
}

/// Serviço (2 passos): troca a categoria de um produto de Apoio/Coloração ou de um insumo. Reutilizável por agentes.
pub async fn trocar_categoria_item(
    pool: &PgPool,
    ctx: &AuthContext,
    code: &str,
    category_id: &str,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let destino_id = category_id.trim().to_string();
    if destino_id.is_empty() {
        return Err(ErroApi::invalido("Informe categoryId (use listar_categorias_compras)."));
    }
    let (ctx_tx, code_tx, destino_tx) = (ctx.clone(), code.to_string(), destino_id.clone());
    let resposta = executar_em_2_passos(pool, "trocar_categoria_item", confirmar, move |tx| {
        Box::pin(async move {
            let destino_nome = nome_da_categoria(&mut **tx, &destino_tx)
                .await?
                .ok_or_else(|| ErroApi::invalido(format!("Categoria '{destino_tx}' não existe (use listar_categorias_compras).")))?;

            // produto: categoria efetiva (override ou prefixo); insumo: items.category_id
            let produto: Option<(String, Option<String>)> = sqlx::query_as(&format!(
                "SELECT p.descricao, {CATEGORIA_EFETIVA_PRODUTO} FROM produtos p LEFT JOIN overrides_produtos o ON o.codigo = p.codigo WHERE p.codigo = $1"
            ))
            .bind(&code_tx)
            .fetch_optional(&mut **tx)
            .await?;
            let (tipo, descricao, origem_id) = match produto {
                Some((d, c)) => ("produto", d, c),
                None => {
                    let insumo: Option<(String, Option<String>)> =
                        sqlx::query_as("SELECT description, category_id FROM items WHERE code = $1")
                            .bind(&code_tx)
                            .fetch_optional(&mut **tx)
                            .await?;
                    let (d, c) = insumo.ok_or_else(|| ErroApi::nao_encontrado(format!("Item {code_tx} não encontrado.")))?;
                    ("insumo", d, c)
                }
            };

            let raiz_origem = match origem_id.as_deref() {
                Some(id) => raiz_da_categoria(&mut **tx, id).await?,
                None => None,
            };
            let raiz_destino = raiz_da_categoria(&mut **tx, &destino_tx).await?.unwrap_or_else(|| destino_tx.clone());
            checar_produto_do_agente(&ctx_tx, tipo, raiz_origem.as_deref())?;
            checar_permissao_troca(&ctx_tx, raiz_origem.as_deref(), &raiz_destino)?;

            let origem_nome = match origem_id.as_deref() {
                Some(id) => nome_da_categoria(&mut **tx, id).await?,
                None => None,
            };
            let mudou = origem_id.as_deref() != Some(destino_tx.as_str());
            if mudou {
                aplicar_categoria_na_tx(&mut **tx, &code_tx, &Some(destino_tx.clone())).await.map_err(ErroApi::interno)?;
            }
            Ok(json!({
                "codigo": code_tx,
                "descricao": descricao,
                "tipo": tipo,
                "categoriaAntes": { "id": origem_id, "nome": origem_nome },
                "categoriaDepois": { "id": destino_tx, "nome": destino_nome },
                "mudou": mudou,
                "moduloAuditoria": modulos_da_familia(&raiz_destino)[0],
            }))
        })
    })
    .await?;
    if confirmar && resposta.resultado["mudou"] == json!(true) {
        let r = &resposta.resultado;
        let modulo = r["moduloAuditoria"].as_str().unwrap_or(MODULE_COMPRAS_APOIO);
        let resumo = format!("Categoria de {code} trocada de {} para {}", r["categoriaAntes"]["id"].as_str().unwrap_or("(nenhuma)"), destino_id);
        let antes = json!({ "categoria": r["categoriaAntes"] });
        let depois = json!({ "categoria": r["categoriaDepois"], "tipo": r["tipo"], "origem": ctx.origem.as_str() });
        audit::record_domain(pool, Some(ctx), modulo, "trocar_categoria_item", "item", code, &resumo, Some(antes), Some(depois)).await;
    }
    Ok(resposta)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::geral::auth::models::{OperatorRole, Origem};

    fn ctx(origem: Origem, role: OperatorRole, modulos: &[(&str, &str)]) -> AuthContext {
        AuthContext {
            operator_id: "a1".into(),
            display_name: "Teste".into(),
            role,
            modules: modulos.iter().map(|(m, _)| m.to_string()).collect(),
            permissions: modulos.iter().map(|(m, n)| (m.to_string(), n.to_string())).collect(),
            origem,
        }
    }

    #[test]
    fn familias_de_categoria_apontam_para_o_modulo_certo() {
        assert_eq!(modulos_da_familia("cat_coloracao"), &["compras_coloracao"]);
        assert_eq!(modulos_da_familia("cat_apoio"), &["compras_apoio"]);
        assert_eq!(modulos_da_familia("cat_mp"), &["compras_materia_prima"]);
        assert_eq!(modulos_da_familia("cat_emb"), &["compras_embalagens"]);
        assert_eq!(modulos_da_familia("cat_mat"), &["compras_materia_prima", "compras_embalagens"]);
    }

    #[test]
    fn agente_so_troca_dentro_da_familia_que_edita() {
        let agente = ctx(Origem::Agente, OperatorRole::Operador, &[("compras_apoio", "edit")]);
        assert!(checar_permissao_troca(&agente, Some("cat_apoio"), "cat_apoio").is_ok());
        assert!(checar_permissao_troca(&agente, None, "cat_apoio").is_ok());
        let e = checar_permissao_troca(&agente, Some("cat_apoio"), "cat_coloracao").unwrap_err();
        assert_eq!(e.codigo, "sem_permissao");
        assert!(e.mensagem.contains("compras_coloracao"), "{}", e.mensagem);
        let e = checar_permissao_troca(&agente, Some("cat_coloracao"), "cat_apoio").unwrap_err();
        assert!(e.mensagem.contains("compras_coloracao"), "{}", e.mensagem);
        // só "ver" não basta
        let leitor = ctx(Origem::Agente, OperatorRole::Operador, &[("compras_apoio", "view")]);
        assert!(checar_permissao_troca(&leitor, Some("cat_apoio"), "cat_apoio").is_err());
    }

    #[test]
    fn agente_nao_mexe_em_produto_fora_de_apoio_e_coloracao() {
        let agente = ctx(Origem::Agente, OperatorRole::Operador, &[("compras_apoio", "edit")]);
        assert!(checar_produto_do_agente(&agente, "produto", Some("cat_apoio")).is_ok());
        assert!(checar_produto_do_agente(&agente, "produto", None).is_err());
        assert!(checar_produto_do_agente(&agente, "produto", Some("cat_base")).is_err());
        assert!(checar_produto_do_agente(&agente, "insumo", None).is_ok());
        let sup = ctx(Origem::Tela, OperatorRole::Supervisor, &[]);
        assert!(checar_produto_do_agente(&sup, "produto", None).is_ok());
    }

    #[test]
    fn operador_comum_recusado_e_supervisor_aceito() {
        let op = ctx(Origem::Tela, OperatorRole::Operador, &[("compras_apoio", "edit")]);
        assert_eq!(checar_permissao_troca(&op, Some("cat_apoio"), "cat_apoio").unwrap_err().codigo, "sem_permissao");
        let sup = ctx(Origem::Tela, OperatorRole::Supervisor, &[]);
        assert!(checar_permissao_troca(&sup, Some("cat_apoio"), "cat_coloracao").is_ok());
    }

    #[test]
    fn rota_da_troca_chega_ao_handler_so_com_editar_em_compras() {
        use crate::modules::geral::auth::store::has_write_access;
        let rota = "/api/hub/compras/items/1.30.001/categoria";
        assert!(has_write_access(&ctx(Origem::Agente, OperatorRole::Operador, &[("compras_apoio", "edit")]), rota, "POST"));
        assert!(!has_write_access(&ctx(Origem::Agente, OperatorRole::Operador, &[("compras_apoio", "view")]), rota, "POST"));
        assert!(!has_write_access(&ctx(Origem::Agente, OperatorRole::Operador, &[("vendas", "edit")]), rota, "POST"));
    }

    #[test]
    fn busca_escapa_curingas_e_ignora_vazio() {
        assert_eq!(padrao_busca("  "), None);
        assert_eq!(padrao_busca(" cola "), Some("%cola%".to_string()));
        assert_eq!(padrao_busca("50%_a\\b"), Some("%50\\%\\_a\\\\b%".to_string()));
    }

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn lista_produtos_de_apoio_e_troca_categoria_em_2_passos() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let marca = Uuid::new_v4().to_string()[..8].to_string();
        let sub = format!("sub_teste_{marca}");
        let cod = format!("1.30.T{marca}");
        let linha: String = match sqlx::query_scalar("SELECT linha_prefix FROM config_linhas LIMIT 1").fetch_optional(&pool).await.unwrap() {
            Some(l) => l,
            None => {
                sqlx::query("INSERT INTO config_linhas (linha_prefix, nome_linha) VALUES ('T', 'Teste')").execute(&pool).await.unwrap();
                "T".into()
            }
        };
        sqlx::query("INSERT INTO categories (id, name, parent_id) VALUES ($1, $2, 'cat_apoio')").bind(&sub).bind(format!("Sub teste {marca}")).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO produtos (codigo, descricao, linha_prefix) VALUES ($1, $2, $3)").bind(&cod).bind(format!("Produto teste {marca}")).bind(&linha).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO overrides_produtos (codigo, categoria_produto) VALUES ($1, $2)").bind(&cod).bind(&sub).execute(&pool).await.unwrap();

        let tem = |itens: &[Item]| itens.iter().any(|i| i.code == cod);
        // insumo cujo código também é produto de fora de Apoio/Coloração não some da lista com filtro
        let cod_misto = format!("9.15.T{marca}");
        sqlx::query("INSERT INTO items (code, description, unit, category_id) VALUES ($1, $2, 'KG', 'cat_mp')").bind(&cod_misto).bind(format!("Misto teste {marca}")).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO produtos (codigo, descricao, linha_prefix) VALUES ($1, $2, $3)").bind(&cod_misto).bind(format!("Misto teste {marca}")).bind(&linha).execute(&pool).await.unwrap();
        let achados = get_items_query(pool.clone(), FiltroItens { search: Some(format!("Misto teste {marca}")), ..Default::default() }).await.unwrap();
        assert_eq!(achados.len(), 1);
        assert_eq!(achados[0].code, cod_misto);
        assert_eq!(achados[0].is_product, None);
        let por_busca = get_items_query(pool.clone(), FiltroItens { search: Some(format!("Produto teste {marca}")), ..Default::default() }).await.unwrap();
        assert_eq!(por_busca.len(), 1);
        // agente só com compras_apoio não mexe em produto fora de Apoio/Coloração
        let agente = ctx(Origem::Agente, OperatorRole::Operador, &[("compras_apoio", "edit")]);
        assert_eq!(trocar_categoria_item(&pool, &agente, &cod_misto, "cat_apoio", false).await.unwrap_err().codigo, "sem_permissao");
        assert!(trocar_categoria_item(&pool, &agente, &cod, "cat_apoio", false).await.unwrap().previa);
        // sem filtros: só insumos
        let sem = get_items_query(pool.clone(), FiltroItens::default()).await.unwrap();
        assert!(!tem(&sem) && sem.iter().all(|i| i.is_product.is_none()));
        // categoryId=cat_apoio traz o produto da subcategoria, marcado como produto
        let com = get_items_query(pool.clone(), FiltroItens { category_id: Some("cat_apoio".into()), ..Default::default() }).await.unwrap();
        assert_eq!(com.iter().find(|i| i.code == cod).and_then(|i| i.is_product), Some(true));

        let mut sup = ctx(Origem::Tela, OperatorRole::Supervisor, &[]);
        sup.display_name = format!("sup-{marca}");
        let cat_de = |pool: PgPool, cod: String| async move {
            sqlx::query_scalar::<_, Option<String>>("SELECT categoria_produto FROM overrides_produtos WHERE codigo = $1").bind(cod).fetch_one(&pool).await.unwrap()
        };
        // prévia não grava
        let p = trocar_categoria_item(&pool, &sup, &cod, "cat_apoio", false).await.unwrap();
        assert!(p.previa && p.resultado["mudou"] == json!(true) && p.resultado["tipo"] == "produto");
        assert_eq!(cat_de(pool.clone(), cod.clone()).await.as_deref(), Some(sub.as_str()));
        // categoria inexistente e código desconhecido
        assert_eq!(trocar_categoria_item(&pool, &sup, &cod, "nao_existe", false).await.unwrap_err().codigo, "invalido");
        assert_eq!(trocar_categoria_item(&pool, &sup, "x.nao.existe", "cat_apoio", false).await.unwrap_err().codigo, "nao_encontrado");
        // confirmar grava e audita
        let r = trocar_categoria_item(&pool, &sup, &cod, "cat_apoio", true).await.unwrap();
        assert!(!r.previa);
        assert_eq!(cat_de(pool.clone(), cod.clone()).await.as_deref(), Some("cat_apoio"));
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM hub_audit_events WHERE action = 'trocar_categoria_item' AND entity_id = $1").bind(&cod).fetch_one(&pool).await.unwrap();
        assert_eq!(n, 1);

        sqlx::query("DELETE FROM items WHERE code = $1").bind(&cod_misto).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM produtos WHERE codigo = $1").bind(&cod_misto).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM overrides_produtos WHERE codigo = $1").bind(&cod).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM produtos WHERE codigo = $1").bind(&cod).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM categories WHERE id = $1").bind(&sub).execute(&pool).await.unwrap();
    }
}

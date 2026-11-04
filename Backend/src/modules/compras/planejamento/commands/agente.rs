//! Escritas de Compras para a tela e para agentes: prévia sem `confirmar`, gravação com motivo.
//! A permissão é a família da categoria (matéria-prima, embalagens, coloração, apoio).
//! Nenhuma destas funções apaga categoria, insumo ou lista.

use serde_json::{json, Value};
use sqlx::{PgConnection, Row};
use uuid::Uuid;

use crate::core::acao::ErroApi;
use crate::modules::geral::auth::models::AuthContext;

pub const FAMILIAS: &[&str] = &[
    "compras_materia_prima",
    "compras_embalagens",
    "compras_coloracao",
    "compras_apoio",
];

const RAZES: &[(&str, &str)] = &[
    ("cat_mp", "compras_materia_prima"),
    ("cat_emb", "compras_embalagens"),
    ("cat_coloracao", "compras_coloracao"),
    ("cat_apoio", "compras_apoio"),
];

pub fn modulo_da_raiz(raiz: &str) -> Option<&'static str> {
    RAZES.iter().find(|(id, _)| *id == raiz).map(|(_, m)| *m)
}

fn raiz_pelo_codigo(code: &str) -> Option<&'static str> {
    if code.starts_with("1.34.") {
        Some("cat_coloracao")
    } else if code.starts_with("1.30.") {
        Some("cat_apoio")
    } else if code.starts_with("9.15.") || code.starts_with("9.") {
        Some("cat_mp")
    } else if code.starts_with("08.") {
        Some("cat_emb")
    } else {
        None
    }
}

pub fn e_classe_a(nome: &str) -> bool {
    nome.to_lowercase().contains("classe a")
}

pub fn status_item_valido(status: &str) -> bool {
    matches!(status, "ativo" | "suspenso" | "ignorado")
}

pub fn modulo_da_lista(modulo: &str) -> Option<&'static str> {
    match modulo.trim().to_lowercase().as_str() {
        "materia_prima" | "mp" | "cat_mp" | "compras_materia_prima" => Some("compras_materia_prima"),
        "embalagens" | "emb" | "cat_emb" | "compras_embalagens" => Some("compras_embalagens"),
        "coloracao" | "cat_coloracao" | "compras_coloracao" => Some("compras_coloracao"),
        "apoio" | "cat_apoio" | "compras_apoio" => Some("compras_apoio"),
        _ => None,
    }
}

fn motivo_ok(motivo: &str) -> Result<&str, ErroApi> {
    let m = motivo.trim();
    if m.is_empty() {
        return Err(ErroApi::invalido("Informe o motivo da alteração."));
    }
    Ok(m)
}

fn exige_familia(ctx: &AuthContext, raiz: &str) -> Result<&'static str, ErroApi> {
    let modulo = modulo_da_raiz(raiz).ok_or_else(|| {
        ErroApi::regra("Essa categoria não pertence a matéria-prima, embalagens, coloração ou apoio.")
            .com_detalhes(json!({ "raiz": raiz }))
    })?;
    if ctx.can_edit_module(modulo) {
        return Ok(modulo);
    }
    Err(ErroApi::sem_permissao("Sem permissão de edição nesta família de compras.").com_detalhes(json!({
        "familia": modulo,
        "raiz": raiz,
    })))
}

fn exige_modulo_lista(ctx: &AuthContext, modulo_lista: &str) -> Result<&'static str, ErroApi> {
    let modulo = modulo_da_lista(modulo_lista).ok_or_else(|| {
        ErroApi::invalido("Módulo da lista inválido. Use materia_prima, embalagens, coloracao ou apoio.")
            .com_detalhes(json!({ "modulo": modulo_lista }))
    })?;
    if ctx.can_edit_module(modulo) {
        return Ok(modulo);
    }
    Err(ErroApi::sem_permissao("Sem permissão de edição nesta família de compras.").com_detalhes(json!({ "familia": modulo })))
}

struct Cat {
    id: String,
    name: String,
    parent_id: Option<String>,
}

async fn ler_categoria(conn: &mut PgConnection, id: &str) -> Result<Cat, ErroApi> {
    let row = sqlx::query("SELECT id, name, parent_id FROM categories WHERE id = $1")
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?;
    let Some(row) = row else {
        return Err(ErroApi::nao_encontrado("Categoria não encontrada.").com_detalhes(json!({ "id": id })));
    };
    Ok(Cat { id: row.get("id"), name: row.get("name"), parent_id: row.get("parent_id") })
}

async fn raiz_de(conn: &mut PgConnection, id: &str) -> Result<String, ErroApi> {
    let mut atual = id.to_string();
    for _ in 0..8 {
        let cat = ler_categoria(conn, &atual).await?;
        if cat.parent_id.as_deref().map(str::trim).filter(|s| !s.is_empty()).is_none() {
            return Ok(cat.id);
        }
        atual = cat.parent_id.unwrap();
    }
    Err(ErroApi::regra("A árvore de categorias passou de 8 níveis."))
}

async fn periodo_de(conn: &mut PgConnection, id: &str) -> Result<Option<i32>, ErroApi> {
    let mut atual = Some(id.to_string());
    for _ in 0..8 {
        let Some(cid) = atual else { break };
        let p: Option<i32> = sqlx::query_scalar(
            "SELECT periodo_media FROM compras_config_personalizado WHERE target_id = $1 AND periodo_media IS NOT NULL ORDER BY CASE WHEN level = 'subcategoria' THEN 0 ELSE 1 END LIMIT 1",
        )
        .bind(&cid)
        .fetch_optional(&mut *conn)
        .await?
        .flatten();
        if p.is_some() {
            return Ok(p);
        }
        let cat = ler_categoria(conn, &cid).await?;
        atual = cat.parent_id.filter(|s| !s.trim().is_empty());
    }
    Ok(None)
}

async fn gravar_periodo(conn: &mut PgConnection, id: &str, periodo: i32) -> Result<(), ErroApi> {
    sqlx::query(
        "INSERT INTO compras_config_personalizado (level, target_id, periodo_media)
         VALUES ('subcategoria', $1, $2)
         ON CONFLICT (level, target_id) DO UPDATE SET periodo_media = EXCLUDED.periodo_media",
    )
    .bind(id)
    .bind(periodo)
    .execute(&mut *conn)
    .await?;
    Ok(())
}

fn validar_periodo(periodo: i32) -> Result<i32, ErroApi> {
    if (1..=3650).contains(&periodo) {
        Ok(periodo)
    } else {
        Err(ErroApi::invalido("O período de estoque precisa estar entre 1 e 3650 dias."))
    }
}

async fn nome_repetido(conn: &mut PgConnection, parent_id: &str, nome: &str, exceto: Option<&str>) -> Result<bool, ErroApi> {
    let id: Option<String> = sqlx::query_scalar(
        "SELECT id FROM categories WHERE parent_id = $1 AND lower(trim(name)) = lower(trim($2)) AND ($3::text IS NULL OR id <> $3) LIMIT 1",
    )
    .bind(parent_id)
    .bind(nome)
    .bind(exceto)
    .fetch_optional(&mut *conn)
    .await?;
    Ok(id.is_some())
}

pub async fn criar_subcategoria(
    conn: &mut PgConnection,
    ctx: &AuthContext,
    nome: &str,
    parent_id: &str,
    periodo: Option<i32>,
    motivo: &str,
) -> Result<Value, ErroApi> {
    let motivo = motivo_ok(motivo)?;
    let nome = nome.trim();
    if nome.is_empty() {
        return Err(ErroApi::invalido("Informe o nome da subcategoria."));
    }
    let parent = ler_categoria(conn, parent_id.trim()).await?;
    let raiz = raiz_de(conn, &parent.id).await?;
    let familia = exige_familia(ctx, &raiz)?;
    if nome_repetido(conn, &parent.id, nome, None).await? {
        return Err(ErroApi::conflito("Já existe uma subcategoria com esse nome nessa família."));
    }
    let herdado = periodo_de(conn, &parent.id).await?;
    let aplicado = match periodo {
        Some(p) => Some(validar_periodo(p)?),
        None => herdado,
    };
    let id = format!("cat_{}", Uuid::new_v4().simple());
    sqlx::query("INSERT INTO categories (id, name, parent_id) VALUES ($1, $2, $3)")
        .bind(&id)
        .bind(nome)
        .bind(&parent.id)
        .execute(&mut *conn)
        .await?;
    if let Some(p) = aplicado {
        gravar_periodo(conn, &id, p).await?;
    }
    Ok(json!({
        "antes": Value::Null,
        "depois": { "id": id, "nome": nome, "parentId": parent.id, "periodo": aplicado, "periodoHerdado": herdado },
        "motivo": motivo,
        "familia": familia,
    }))
}

pub async fn ajustar_subcategoria(
    conn: &mut PgConnection,
    ctx: &AuthContext,
    id: &str,
    nome: Option<&str>,
    periodo: Option<i32>,
    permitir_restrito: bool,
    motivo: &str,
) -> Result<Value, ErroApi> {
    let motivo = motivo_ok(motivo)?;
    let cat = ler_categoria(conn, id.trim()).await?;
    let raiz = raiz_de(conn, &cat.id).await?;
    let familia = exige_familia(ctx, &raiz)?;
    let e_raiz = cat.parent_id.as_deref().map(str::trim).filter(|s| !s.is_empty()).is_none();
    let nome_novo = nome.map(str::trim).filter(|s| !s.is_empty());
    if nome_novo.is_none() && periodo.is_none() {
        return Err(ErroApi::invalido("Informe o nome ou o período para ajustar."));
    }
    let mexe_classe_a = e_classe_a(&cat.name) || nome_novo.is_some_and(e_classe_a);
    if (e_raiz || mexe_classe_a) && !permitir_restrito {
        return Err(ErroApi::regra(
            "Categoria raiz e Classe A só mudam com permitirRestrito=true.",
        ));
    }
    if e_raiz && !ctx.role.is_supervisor() {
        return Err(ErroApi::sem_permissao("Categoria raiz só o supervisor altera."));
    }
    let nome_final = nome_novo.unwrap_or(cat.name.as_str());
    if nome_final.is_empty() {
        return Err(ErroApi::invalido("O nome não pode ficar vazio."));
    }
    if let Some(parent) = cat.parent_id.as_deref() {
        if nome_repetido(conn, parent, nome_final, Some(&cat.id)).await? {
            return Err(ErroApi::conflito("Já existe uma subcategoria com esse nome nessa família."));
        }
    }
    let periodo_antes = periodo_de(conn, &cat.id).await?;
    let periodo_depois = match periodo {
        Some(p) => Some(validar_periodo(p)?),
        None => periodo_antes,
    };
    if nome_final == cat.name && periodo_depois == periodo_antes {
        return Err(ErroApi::regra("Nada mudou."));
    }
    sqlx::query("UPDATE categories SET name = $2 WHERE id = $1")
        .bind(&cat.id)
        .bind(nome_final)
        .execute(&mut *conn)
        .await?;
    if let Some(p) = periodo {
        gravar_periodo(conn, &cat.id, validar_periodo(p)?).await?;
    }
    Ok(json!({
        "antes": { "id": cat.id, "nome": cat.name, "parentId": cat.parent_id, "periodo": periodo_antes },
        "depois": { "id": cat.id, "nome": nome_final, "parentId": cat.parent_id, "periodo": periodo_depois },
        "motivo": motivo,
        "familia": familia,
    }))
}

async fn categoria_do_codigo(conn: &mut PgConnection, code: &str) -> Result<Option<String>, ErroApi> {
    let prod: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM produtos WHERE codigo = $1)")
        .bind(code)
        .fetch_one(&mut *conn)
        .await
        .unwrap_or(false);
    if prod {
        let cat: Option<String> = sqlx::query_scalar("SELECT categoria_produto FROM overrides_produtos WHERE codigo = $1")
            .bind(code)
            .fetch_optional(&mut *conn)
            .await?
            .flatten();
        return Ok(cat.filter(|s| !s.is_empty()));
    }
    let existe: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM items WHERE code = $1)")
        .bind(code)
        .fetch_one(&mut *conn)
        .await
        .unwrap_or(false);
    if !existe {
        return Err(ErroApi::nao_encontrado("Item não encontrado.").com_detalhes(json!({ "codigo": code })));
    }
    let cat: Option<String> = sqlx::query_scalar("SELECT category_id FROM items WHERE code = $1")
        .bind(code)
        .fetch_optional(&mut *conn)
        .await?
        .flatten();
    Ok(cat.filter(|s| !s.is_empty()))
}

async fn aplicar_categoria(conn: &mut PgConnection, code: &str, category_id: &str) -> Result<(), ErroApi> {
    let prod: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM produtos WHERE codigo = $1)")
        .bind(code)
        .fetch_one(&mut *conn)
        .await
        .unwrap_or(false);
    if prod {
        sqlx::query(
            "INSERT INTO overrides_produtos (codigo, categoria_produto) VALUES ($1, $2)
             ON CONFLICT (codigo) DO UPDATE SET categoria_produto = EXCLUDED.categoria_produto",
        )
        .bind(code)
        .bind(category_id)
        .execute(&mut *conn)
        .await?;
    } else {
        sqlx::query(
            "UPDATE items SET category_id = $2, manual_category = 1, updated_at = CURRENT_TIMESTAMP::TEXT WHERE code = $1",
        )
        .bind(code)
        .bind(category_id)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

pub async fn mover_itens(
    conn: &mut PgConnection,
    ctx: &AuthContext,
    codigos: &[String],
    category_id: &str,
    motivo: &str,
) -> Result<Value, ErroApi> {
    let motivo = motivo_ok(motivo)?;
    if codigos.is_empty() {
        return Err(ErroApi::invalido("Informe ao menos um código."));
    }
    if codigos.len() > 1000 {
        return Err(ErroApi::invalido("O lote aceita no máximo 1000 códigos."));
    }
    let destino = ler_categoria(conn, category_id.trim()).await?;
    let raiz_destino = raiz_de(conn, &destino.id).await?;
    let familia = exige_familia(ctx, &raiz_destino)?;
    let mut itens = Vec::new();
    for code in codigos {
        let code = code.trim();
        if code.is_empty() {
            continue;
        }
        let antes = categoria_do_codigo(conn, code).await?;
        if let Some(origem) = antes.as_deref() {
            let raiz_origem = raiz_de(conn, origem).await?;
            if raiz_origem != raiz_destino && !ctx.role.is_supervisor() {
                return Err(ErroApi::regra("Mover para outra família é só do supervisor.").com_detalhes(json!({
                    "codigo": code,
                    "de": raiz_origem,
                    "para": raiz_destino,
                })));
            }
        }
        aplicar_categoria(conn, code, &destino.id).await?;
        itens.push(json!({ "codigo": code, "antes": antes, "depois": destino.id }));
    }
    if itens.is_empty() {
        return Err(ErroApi::invalido("Informe ao menos um código."));
    }
    Ok(json!({
        "antes": itens.iter().map(|i| json!({ "codigo": i["codigo"], "categoryId": i["antes"] })).collect::<Vec<_>>(),
        "depois": itens.iter().map(|i| json!({ "codigo": i["codigo"], "categoryId": i["depois"] })).collect::<Vec<_>>(),
        "categoryId": destino.id,
        "quantidade": itens.len(),
        "motivo": motivo,
        "familia": familia,
    }))
}

async fn ler_status(conn: &mut PgConnection, code: &str) -> Result<(bool, String, Option<String>), ErroApi> {
    let prod: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM produtos WHERE codigo = $1)")
        .bind(code)
        .fetch_one(&mut *conn)
        .await
        .unwrap_or(false);
    if prod {
        let row = sqlx::query("SELECT COALESCE(visivel, 1) AS visivel, status_compra, categoria_produto FROM overrides_produtos WHERE codigo = $1")
            .bind(code)
            .fetch_optional(&mut *conn)
            .await?;
        let (status, cat) = match row {
            Some(r) => {
                let visivel: i32 = r.try_get("visivel").unwrap_or(1);
                let gravado: Option<String> = r.try_get("status_compra").ok().flatten();
                let status = gravado.unwrap_or_else(|| if visivel == 0 { "suspenso".into() } else { "ativo".into() });
                (status, r.try_get("categoria_produto").ok().flatten())
            }
            None => ("ativo".into(), None),
        };
        return Ok((true, status, cat));
    }
    let row = sqlx::query("SELECT COALESCE(is_ignored, 0) AS is_ignored, status_compra, category_id FROM items WHERE code = $1")
        .bind(code)
        .fetch_optional(&mut *conn)
        .await?;
    let Some(row) = row else {
        return Err(ErroApi::nao_encontrado("Item não encontrado.").com_detalhes(json!({ "codigo": code })));
    };
    let ignored: i32 = row.try_get("is_ignored").unwrap_or(0);
    let gravado: Option<String> = row.try_get("status_compra").ok().flatten();
    let status = gravado.unwrap_or_else(|| if ignored == 1 { "suspenso".into() } else { "ativo".into() });
    Ok((false, status, row.try_get("category_id").ok().flatten()))
}

pub async fn alterar_status_item(
    conn: &mut PgConnection,
    ctx: &AuthContext,
    code: &str,
    status: &str,
    motivo: &str,
) -> Result<Value, ErroApi> {
    let motivo = motivo_ok(motivo)?;
    let status = status.trim();
    if !status_item_valido(status) {
        return Err(ErroApi::invalido("Status inválido. Use ativo, suspenso ou ignorado."));
    }
    let code = code.trim();
    let (produto, antes, cat) = ler_status(conn, code).await?;
    let raiz = match cat.as_deref().filter(|c| !c.is_empty()) {
        Some(c) => raiz_de(conn, c).await?,
        None => raiz_pelo_codigo(code)
            .ok_or_else(|| ErroApi::regra("O item não tem categoria. Classifique antes de mudar o status."))?
            .to_string(),
    };
    let familia = exige_familia(ctx, &raiz)?;
    if antes == status {
        return Err(ErroApi::regra("Nada mudou."));
    }
    let fora = status != "ativo";
    if produto {
        sqlx::query(
            "INSERT INTO overrides_produtos (codigo, visivel, status_compra) VALUES ($1, $2, $3)
             ON CONFLICT (codigo) DO UPDATE SET visivel = EXCLUDED.visivel, status_compra = EXCLUDED.status_compra",
        )
        .bind(code)
        .bind(if fora { 0 } else { 1 })
        .bind(status)
        .execute(&mut *conn)
        .await?;
    } else {
        sqlx::query(
            "UPDATE items SET is_ignored = $2, status_compra = $3, updated_at = CURRENT_TIMESTAMP::TEXT WHERE code = $1",
        )
        .bind(code)
        .bind(if fora { 1 } else { 0 })
        .bind(status)
        .execute(&mut *conn)
        .await?;
    }
    Ok(json!({
        "antes": { "codigo": code, "status": antes },
        "depois": { "codigo": code, "status": status, "naDemanda": !fora },
        "motivo": motivo,
        "familia": familia,
    }))
}

async fn proximo_lote(conn: &mut PgConnection) -> Result<String, ErroApi> {
    let rows = sqlx::query("SELECT lote_numero FROM purchase_request_batches ORDER BY created_at DESC LIMIT 50")
        .fetch_all(&mut *conn)
        .await?;
    let mut max_seq: i64 = 0;
    for r in rows {
        let num: String = r.try_get("lote_numero").unwrap_or_default();
        let digits: String = num.chars().filter(|c| c.is_ascii_digit()).collect();
        if let Ok(val) = digits.parse::<i64>() {
            max_seq = max_seq.max(val);
        }
    }
    Ok(format!("LOTE #{:03}", max_seq + 1))
}

pub struct ItemLista<'a> {
    pub item_code: &'a str,
    pub item_description: &'a str,
    pub unit: Option<&'a str>,
    pub quantity_requested: f64,
    pub observacao: Option<&'a str>,
}

pub async fn criar_lista(
    conn: &mut PgConnection,
    ctx: &AuthContext,
    modulo: &str,
    titulo: Option<&str>,
    observacoes: Option<&str>,
    created_by: &str,
    itens: &[ItemLista<'_>],
    motivo: &str,
) -> Result<Value, ErroApi> {
    let motivo = motivo_ok(motivo)?;
    if itens.is_empty() {
        return Err(ErroApi::invalido("A lista precisa ter pelo menos 1 item."));
    }
    let familia = exige_modulo_lista(ctx, modulo)?;
    let id = Uuid::new_v4().to_string();
    let lote = proximo_lote(conn).await?;
    sqlx::query(
        "INSERT INTO purchase_request_batches (id, lote_numero, modulo, titulo, observacoes, created_by, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pendente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    )
    .bind(&id)
    .bind(&lote)
    .bind(modulo)
    .bind(titulo)
    .bind(observacoes)
    .bind(created_by)
    .execute(&mut *conn)
    .await?;
    for item in itens {
        inserir_item_lista(conn, &id, item).await?;
    }
    Ok(json!({
        "antes": Value::Null,
        "depois": { "id": id, "loteNumero": lote, "modulo": modulo, "titulo": titulo, "itens": itens.len() },
        "motivo": motivo,
        "familia": familia,
    }))
}

async fn inserir_item_lista(conn: &mut PgConnection, batch_id: &str, item: &ItemLista<'_>) -> Result<(), ErroApi> {
    let code = item.item_code.trim();
    if code.is_empty() {
        return Err(ErroApi::invalido("Item da lista sem código."));
    }
    sqlx::query(
        "INSERT INTO purchase_request_items (
            id, batch_id, item_code, item_description, unit, quantity_requested,
            current_stock_at_time, overall_avg_at_time, sim_producao_at_time, future_stock_at_time,
            target_days_at_time, trigger_days_at_time, supplier_name, observacao, status, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0, 0, 90, 30, NULL, $7, 'solicitado', CURRENT_TIMESTAMP)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(batch_id)
    .bind(code)
    .bind(item.item_description)
    .bind(item.unit.unwrap_or("UN"))
    .bind(item.quantity_requested)
    .bind(item.observacao)
    .execute(&mut *conn)
    .await?;
    Ok(())
}

async fn lista_modulo(conn: &mut PgConnection, id: &str) -> Result<(String, Option<String>, Option<String>, String), ErroApi> {
    let row = sqlx::query("SELECT modulo, titulo, observacoes, status FROM purchase_request_batches WHERE id = $1")
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?;
    let Some(row) = row else {
        return Err(ErroApi::nao_encontrado("Lista não encontrada.").com_detalhes(json!({ "id": id })));
    };
    Ok((row.get("modulo"), row.get("titulo"), row.get("observacoes"), row.get("status")))
}

pub async fn editar_lista(
    conn: &mut PgConnection,
    ctx: &AuthContext,
    id: &str,
    titulo: Option<&str>,
    observacoes: Option<&str>,
    status: Option<&str>,
    motivo: &str,
) -> Result<Value, ErroApi> {
    let motivo = motivo_ok(motivo)?;
    let (modulo, titulo_antes, obs_antes, status_antes) = lista_modulo(conn, id).await?;
    let familia = exige_modulo_lista(ctx, &modulo)?;
    if let Some(st) = status {
        if !matches!(st, "pendente" | "cancelado" | "concluido") {
            return Err(ErroApi::invalido("Status da lista inválido. Use pendente, cancelado ou concluido."));
        }
    }
    let titulo_depois = titulo.or(titulo_antes.as_deref());
    let obs_depois = observacoes.or(obs_antes.as_deref());
    let status_depois = status.unwrap_or(status_antes.as_str());
    if titulo_depois == titulo_antes.as_deref() && obs_depois == obs_antes.as_deref() && status_depois == status_antes {
        return Err(ErroApi::regra("Nada mudou."));
    }
    sqlx::query(
        "UPDATE purchase_request_batches
         SET titulo = $2, observacoes = $3, status = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1",
    )
    .bind(id)
    .bind(titulo_depois)
    .bind(obs_depois)
    .bind(status_depois)
    .execute(&mut *conn)
    .await?;
    Ok(json!({
        "antes": { "id": id, "titulo": titulo_antes, "observacoes": obs_antes, "status": status_antes },
        "depois": { "id": id, "titulo": titulo_depois, "observacoes": obs_depois, "status": status_depois },
        "motivo": motivo,
        "familia": familia,
    }))
}

pub async fn incluir_itens_lista(
    conn: &mut PgConnection,
    ctx: &AuthContext,
    id: &str,
    itens: &[ItemLista<'_>],
    motivo: &str,
) -> Result<Value, ErroApi> {
    let motivo = motivo_ok(motivo)?;
    if itens.is_empty() {
        return Err(ErroApi::invalido("Informe ao menos um item."));
    }
    let (modulo, _, _, _) = lista_modulo(conn, id).await?;
    let familia = exige_modulo_lista(ctx, &modulo)?;
    let mut codigos = Vec::new();
    for item in itens {
        inserir_item_lista(conn, id, item).await?;
        codigos.push(item.item_code.trim());
    }
    sqlx::query("UPDATE purchase_request_batches SET updated_at = CURRENT_TIMESTAMP WHERE id = $1")
        .bind(id)
        .execute(&mut *conn)
        .await?;
    Ok(json!({
        "antes": { "id": id, "itens": [] },
        "depois": { "id": id, "itens": codigos },
        "motivo": motivo,
        "familia": familia,
    }))
}

pub async fn retirar_itens_lista(
    conn: &mut PgConnection,
    ctx: &AuthContext,
    id: &str,
    codigos: &[String],
    motivo: &str,
) -> Result<Value, ErroApi> {
    let motivo = motivo_ok(motivo)?;
    if codigos.is_empty() {
        return Err(ErroApi::invalido("Informe ao menos um código para tirar da lista."));
    }
    let (modulo, _, _, _) = lista_modulo(conn, id).await?;
    let familia = exige_modulo_lista(ctx, &modulo)?;
    let mut tirados = Vec::new();
    for code in codigos {
        let code = code.trim();
        if code.is_empty() {
            continue;
        }
        let n = sqlx::query(
            "UPDATE purchase_request_items SET status = 'retirado'
             WHERE batch_id = $1 AND item_code = $2 AND status <> 'retirado'",
        )
        .bind(id)
        .bind(code)
        .execute(&mut *conn)
        .await?
        .rows_affected();
        if n == 0 {
            return Err(ErroApi::nao_encontrado("Item não está na lista.").com_detalhes(json!({ "codigo": code })));
        }
        tirados.push(code);
    }
    sqlx::query("UPDATE purchase_request_batches SET updated_at = CURRENT_TIMESTAMP WHERE id = $1")
        .bind(id)
        .execute(&mut *conn)
        .await?;
    Ok(json!({
        "antes": { "id": id, "itens": tirados.clone() },
        "depois": { "id": id, "itens": [], "retirados": tirados },
        "motivo": motivo,
        "familia": familia,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn familia_segue_a_raiz() {
        assert_eq!(modulo_da_raiz("cat_mp"), Some("compras_materia_prima"));
        assert_eq!(modulo_da_raiz("cat_emb"), Some("compras_embalagens"));
        assert_eq!(modulo_da_raiz("cat_coloracao"), Some("compras_coloracao"));
        assert_eq!(modulo_da_raiz("cat_apoio"), Some("compras_apoio"));
        assert_eq!(modulo_da_raiz("cat_mat"), None);
    }

    #[test]
    fn classe_a_exige_o_nome() {
        assert!(e_classe_a("Tonalizante Classe A"));
        assert!(e_classe_a("totalizante classe a"));
        assert!(!e_classe_a("Fragrâncias"));
    }

    #[test]
    fn status_so_os_tres() {
        assert!(status_item_valido("ativo") && status_item_valido("suspenso") && status_item_valido("ignorado"));
        assert!(!status_item_valido("apagado"));
    }

    #[test]
    fn rotas_novas_montam_junto_com_as_da_tela() {
        let _ = crate::modules::hub_api::compras::router();
    }

    #[test]
    fn lista_aponta_para_a_familia() {
        assert_eq!(modulo_da_lista("embalagens"), Some("compras_embalagens"));
        assert_eq!(modulo_da_lista("APOIO"), Some("compras_apoio"));
        assert_eq!(modulo_da_lista("geral"), None);
    }
}

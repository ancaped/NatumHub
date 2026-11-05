//! Escritas de Compras para a tela e para agentes: prévia sem `confirmar`, gravação com motivo.
//! A permissão é a família da categoria (matéria-prima, embalagens, coloração, apoio).
//! Nenhuma destas funções apaga categoria, insumo ou lista.

use serde_json::{json, Value};
use sqlx::{PgConnection, Row};
use uuid::Uuid;

use crate::core::acao::ErroApi;
use crate::modules::compras::planejamento::models::{CreatePurchaseRequestItemInput, DemandResult};
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

/// Status que vale na prática. A tela só grava `is_ignored`/`visivel`: item na demanda é sempre ativo, mesmo que
/// `status_compra` esteja velho; item fora da demanda é ignorado só se foi gravado assim, senão suspenso.
pub fn status_efetivo(fora_da_demanda: bool, gravado: Option<&str>) -> String {
    match (fora_da_demanda, gravado) {
        (false, _) => "ativo",
        (true, Some("ignorado")) => "ignorado",
        (true, _) => "suspenso",
    }
    .to_string()
}

/// Agente só mexe em produto que já é de Material de Apoio ou Coloração: mudar outro muda como Produção e MRP o tratam.
pub fn agente_pode_mexer_no_produto(raiz_atual: Option<&str>) -> bool {
    matches!(raiz_atual, Some("cat_apoio" | "cat_coloracao"))
}

/// Nome da lista como a tela grava em `purchase_request_batches.modulo` e `compras_lista_itens.modulo`.
pub fn nome_da_lista(modulo: &str) -> Option<&'static str> {
    match modulo_da_lista(modulo)? {
        "compras_materia_prima" => Some("materia_prima"),
        "compras_embalagens" => Some("embalagens"),
        "compras_coloracao" => Some("coloracao"),
        "compras_apoio" => Some("apoio"),
        _ => None,
    }
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
    arquivada: bool,
}

async fn ler_categoria(conn: &mut PgConnection, id: &str) -> Result<Cat, ErroApi> {
    let row = sqlx::query("SELECT id, name, parent_id, arquivada_em IS NOT NULL AS arquivada FROM categories WHERE id = $1")
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?;
    let Some(row) = row else {
        return Err(ErroApi::nao_encontrado("Categoria não encontrada.").com_detalhes(json!({ "id": id })));
    };
    Ok(Cat { id: row.get("id"), name: row.get("name"), parent_id: row.get("parent_id"), arquivada: row.get("arquivada") })
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

/// Período gravado para esta categoria (só a linha dela, sem herdar).
async fn periodo_configurado(conn: &mut PgConnection, id: &str) -> Result<Option<i32>, ErroApi> {
    Ok(sqlx::query_scalar(
        "SELECT periodo_media FROM compras_config_personalizado WHERE target_id = $1 AND periodo_media IS NOT NULL ORDER BY CASE WHEN level = 'subcategoria' THEN 0 ELSE 1 END LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?
    .flatten())
}

/// Período geral da família (tela de configurações de Compras); 12 meses se não houver.
async fn periodo_global(conn: &mut PgConnection, raiz: &str) -> Result<i32, ErroApi> {
    let chave = match raiz {
        "cat_coloracao" => "compras_coloracao",
        "cat_apoio" => "compras_apoio",
        _ => "compras_main",
    };
    let p: Option<i32> = sqlx::query_scalar("SELECT CAST((value::json->>'averagePeriodMonths') AS INTEGER) FROM config WHERE key = $1")
        .bind(chave)
        .fetch_optional(&mut *conn)
        .await?
        .flatten();
    Ok(p.filter(|p| *p > 0).unwrap_or(12))
}

/// O que uma subcategoria nova sob `parent_id` herda: o período da mãe, senão o geral da família.
/// Mesma ordem que a demanda usa (`resolve_periodo_media`): a própria, a mãe, o geral, 12.
async fn periodo_herdado_por(conn: &mut PgConnection, parent_id: &str) -> Result<i32, ErroApi> {
    if let Some(p) = periodo_configurado(conn, parent_id).await? {
        return Ok(p);
    }
    let raiz = raiz_de(conn, parent_id).await?;
    periodo_global(conn, &raiz).await
}

/// Período que vale hoje para a categoria.
async fn periodo_efetivo(conn: &mut PgConnection, cat: &Cat) -> Result<i32, ErroApi> {
    if let Some(p) = periodo_configurado(conn, &cat.id).await? {
        return Ok(p);
    }
    match cat.parent_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(mae) => periodo_herdado_por(conn, mae).await,
        None => periodo_global(conn, &cat.id).await,
    }
}

fn exige_ativa(cat: Cat) -> Result<Cat, ErroApi> {
    if cat.arquivada {
        return Err(ErroApi::regra("A categoria está arquivada.").com_detalhes(json!({ "id": cat.id, "nome": cat.name })));
    }
    Ok(cat)
}

/// Acha a categoria pelo id completo; senão por prefixo do id (8+ caracteres) ou pelo nome exato, se só houver um.
async fn resolver_categoria(conn: &mut PgConnection, referencia: &str) -> Result<Cat, ErroApi> {
    let r = referencia.trim();
    if r.is_empty() {
        return Err(ErroApi::invalido("Informe a categoria (id, prefixo do id ou nome exato)."));
    }
    if let Ok(cat) = ler_categoria(conn, r).await {
        return exige_ativa(cat);
    }
    let rows = sqlx::query(
        "SELECT id, name, parent_id, false AS arquivada FROM categories
         WHERE arquivada_em IS NULL AND ((length($1) >= 8 AND id LIKE $1 || '%') OR lower(trim(name)) = lower(trim($1)))
         ORDER BY id LIMIT 6",
    )
    .bind(r)
    .fetch_all(&mut *conn)
    .await?;
    match rows.len() {
        0 => Err(ErroApi::nao_encontrado("Categoria não encontrada.").com_detalhes(json!({ "referencia": r }))),
        1 => Ok(Cat { id: rows[0].get("id"), name: rows[0].get("name"), parent_id: rows[0].get("parent_id"), arquivada: false }),
        _ => {
            let candidatas: Vec<Value> = rows
                .iter()
                .map(|x| json!({ "id": x.get::<String, _>("id"), "nome": x.get::<String, _>("name"), "parentId": x.get::<Option<String>, _>("parent_id") }))
                .collect();
            Err(ErroApi::conflito("Mais de uma categoria combina; use o id completo.").com_detalhes(json!({ "referencia": r, "candidatas": candidatas })))
        }
    }
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
        "SELECT id FROM categories WHERE arquivada_em IS NULL AND parent_id = $1 AND lower(trim(name)) = lower(trim($2)) AND ($3::text IS NULL OR id <> $3) LIMIT 1",
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
    let parent = resolver_categoria(conn, parent_id).await?;
    let raiz = raiz_de(conn, &parent.id).await?;
    let familia = exige_familia(ctx, &raiz)?;
    if nome_repetido(conn, &parent.id, nome, None).await? {
        return Err(ErroApi::conflito("Já existe uma subcategoria com esse nome nessa família."));
    }
    let herdado = periodo_herdado_por(conn, &parent.id).await?;
    // só grava período próprio se vier no corpo; senão a nova segue a mãe (e o geral) como a demanda já faz
    let explicito = match periodo {
        Some(p) => Some(validar_periodo(p)?),
        None => None,
    };
    let id = format!("cat_{}", Uuid::new_v4().simple());
    sqlx::query("INSERT INTO categories (id, name, parent_id) VALUES ($1, $2, $3)")
        .bind(&id)
        .bind(nome)
        .bind(&parent.id)
        .execute(&mut *conn)
        .await?;
    if let Some(p) = explicito {
        gravar_periodo(conn, &id, p).await?;
    }
    Ok(json!({
        "antes": Value::Null,
        "depois": { "id": id, "nome": nome, "parentId": parent.id, "periodo": explicito.unwrap_or(herdado), "periodoHerdado": herdado, "periodoGravado": explicito.is_some() },
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
    let cat = resolver_categoria(conn, id).await?;
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
    let periodo_antes = periodo_efetivo(conn, &cat).await?;
    let periodo_depois = match periodo {
        Some(p) => validar_periodo(p)?,
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

/// Arquiva uma subcategoria vazia (sem itens e sem filhas ativas). Não apaga: só marca `arquivada_em`.
pub async fn arquivar_subcategoria(
    conn: &mut PgConnection,
    ctx: &AuthContext,
    id: &str,
    permitir_restrito: bool,
    motivo: &str,
) -> Result<Value, ErroApi> {
    let motivo = motivo_ok(motivo)?;
    let cat = resolver_categoria(conn, id).await?;
    let raiz = raiz_de(conn, &cat.id).await?;
    let familia = exige_familia(ctx, &raiz)?;
    if cat.parent_id.as_deref().map(str::trim).filter(|s| !s.is_empty()).is_none() {
        return Err(ErroApi::regra("Categoria raiz não se arquiva."));
    }
    if e_classe_a(&cat.name) && !permitir_restrito {
        return Err(ErroApi::regra("Classe A só se arquiva com permitirRestrito=true."));
    }
    let filhas: Vec<(String, String)> = sqlx::query_as(
        "SELECT id, name FROM categories WHERE parent_id = $1 AND arquivada_em IS NULL ORDER BY name LIMIT 10",
    )
    .bind(&cat.id)
    .fetch_all(&mut *conn)
    .await?;
    let itens: Vec<String> = sqlx::query_scalar(
        "SELECT code FROM items WHERE category_id = $1
         UNION ALL SELECT codigo FROM overrides_produtos WHERE categoria_produto = $1
         ORDER BY 1 LIMIT 10",
    )
    .bind(&cat.id)
    .fetch_all(&mut *conn)
    .await?;
    let total_itens: i64 = sqlx::query_scalar(
        "SELECT (SELECT count(*) FROM items WHERE category_id = $1) + (SELECT count(*) FROM overrides_produtos WHERE categoria_produto = $1)",
    )
    .bind(&cat.id)
    .fetch_one(&mut *conn)
    .await?;
    if total_itens > 0 || !filhas.is_empty() {
        return Err(ErroApi::regra("A subcategoria ainda tem itens ou subcategorias ativas; mova-os antes de arquivar.").com_detalhes(json!({
            "id": cat.id,
            "nome": cat.name,
            "totalItens": total_itens,
            "itens": itens,
            "subcategorias": filhas.iter().map(|(i, n)| json!({ "id": i, "nome": n })).collect::<Vec<_>>(),
        })));
    }
    sqlx::query("UPDATE categories SET arquivada_em = CURRENT_TIMESTAMP::TEXT WHERE id = $1")
        .bind(&cat.id)
        .execute(&mut *conn)
        .await?;
    Ok(json!({
        "antes": { "id": cat.id, "nome": cat.name, "parentId": cat.parent_id, "arquivada": false },
        "depois": { "id": cat.id, "nome": cat.name, "parentId": cat.parent_id, "arquivada": true },
        "motivo": motivo,
        "familia": familia,
    }))
}

async fn e_produto(conn: &mut PgConnection, code: &str) -> Result<bool, ErroApi> {
    Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM produtos WHERE codigo = $1)").bind(code).fetch_one(&mut *conn).await?)
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
    let destino = resolver_categoria(conn, category_id).await?;
    let raiz_destino = raiz_de(conn, &destino.id).await?;
    let familia = exige_familia(ctx, &raiz_destino)?;
    // um lote por vez e sempre na mesma ordem de código: dois lotes que se cruzam não travam um ao outro (deadlock)
    sqlx::query("SELECT pg_advisory_xact_lock(7270118)").execute(&mut *conn).await?;
    let mut ordenados: Vec<&str> = codigos.iter().map(|c| c.trim()).filter(|c| !c.is_empty()).collect();
    ordenados.sort_unstable();
    ordenados.dedup();
    let mut itens = Vec::new();
    for code in ordenados {
        let antes = categoria_do_codigo(conn, code).await?;
        if ctx.is_agente() && e_produto(conn, code).await? {
            let raiz_atual = match antes.as_deref() {
                Some(c) => Some(raiz_de(conn, c).await?),
                None => raiz_pelo_codigo(code).map(String::from),
            };
            if !agente_pode_mexer_no_produto(raiz_atual.as_deref()) {
                return Err(ErroApi::sem_permissao(
                    "Agente só troca a categoria de produto que já é de Material de Apoio ou Coloração; os demais ficam com o supervisor.",
                )
                .com_detalhes(json!({ "codigo": code })));
            }
        }
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
                let status = status_efetivo(visivel == 0, gravado.as_deref());
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
    let status = status_efetivo(ignored == 1, gravado.as_deref());
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

/// Números do item na hora do pedido (os mesmos que a tela grava no lote). `None` = sem o dado.
#[derive(Default, Clone)]
pub struct DadosDoItem {
    pub estoque: Option<f64>,
    pub media: Option<f64>,
    pub sim_producao: Option<f64>,
    pub estoque_futuro: Option<f64>,
    pub dias_objetivo: Option<i32>,
    pub dias_disparo: Option<i32>,
    pub fornecedor: Option<String>,
}

impl DadosDoItem {
    /// O que o agente mandou vale; o que faltar vem da demanda do ERP; sem nenhum dos dois fica `None`.
    pub fn montar(entrada: &CreatePurchaseRequestItemInput, demanda: Option<&DemandResult>) -> Self {
        Self {
            estoque: entrada.current_stock_at_time.or(demanda.map(|d| d.current_stock)),
            media: entrada.overall_avg_at_time.or(demanda.map(|d| d.overall_avg)),
            sim_producao: entrada.sim_producao_at_time.or(demanda.map(|d| d.sim_producao)),
            estoque_futuro: entrada.future_stock_at_time.or(demanda.map(|d| d.future_stock_forecast)),
            dias_objetivo: entrada.target_days_at_time.or(demanda.map(|d| d.target_days)),
            dias_disparo: entrada.trigger_days_at_time.or(demanda.map(|d| d.trigger_days)),
            fornecedor: entrada
                .supplier_name
                .clone()
                .or_else(|| demanda.and_then(|d| d.last_supplier_invoice.clone().or_else(|| d.last_supplier_order.clone()))),
        }
    }

    /// Sem estoque nem média o relatório sairia com zeros no lugar de números reais.
    pub fn sem_numeros(&self) -> bool {
        self.estoque.is_none() && self.media.is_none()
    }
}

pub struct ItemLista<'a> {
    pub item_code: &'a str,
    pub item_description: &'a str,
    pub unit: Option<&'a str>,
    pub quantity_requested: f64,
    pub observacao: Option<&'a str>,
    pub dados: DadosDoItem,
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
    let lista = nome_da_lista(modulo).ok_or_else(|| ErroApi::invalido("Módulo da lista inválido."))?;
    let id = Uuid::new_v4().to_string();
    let lote = proximo_lote(conn).await?;
    sqlx::query(
        "INSERT INTO purchase_request_batches (id, lote_numero, modulo, titulo, observacoes, created_by, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pendente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    )
    .bind(&id)
    .bind(&lote)
    .bind(lista)
    .bind(titulo)
    .bind(observacoes)
    .bind(created_by)
    .execute(&mut *conn)
    .await?;
    for item in itens {
        inserir_item_lista(conn, &id, item).await?;
    }
    // como na tela: o que virou lote sai da Lista de Compra do módulo (só estes itens)
    let chaves: Vec<String> = itens.iter().map(|i| i.item_code.trim().replace('.', "")).collect();
    sqlx::query("DELETE FROM compras_lista_itens WHERE modulo = $1 AND item_chave = ANY($2)")
        .bind(lista)
        .bind(&chaves)
        .execute(&mut *conn)
        .await?;
    let sem_numeros: Vec<&str> = itens.iter().filter(|i| i.dados.sem_numeros()).map(|i| i.item_code.trim()).collect();
    Ok(json!({
        "antes": Value::Null,
        "depois": { "id": id, "loteNumero": lote, "modulo": lista, "titulo": titulo, "itens": itens.len() },
        "semDadosDeEstoque": sem_numeros,
        "motivo": motivo,
        "familia": familia,
    }))
}

async fn inserir_item_lista(conn: &mut PgConnection, batch_id: &str, item: &ItemLista<'_>) -> Result<(), ErroApi> {
    let code = item.item_code.trim();
    if code.is_empty() {
        return Err(ErroApi::invalido("Item da lista sem código."));
    }
    if !item.quantity_requested.is_finite() || item.quantity_requested < 0.0 {
        return Err(ErroApi::invalido(format!("Quantidade inválida para o item {code}.")));
    }
    let d = &item.dados;
    sqlx::query(
        "INSERT INTO purchase_request_items (
            id, batch_id, item_code, item_description, unit, quantity_requested,
            current_stock_at_time, overall_avg_at_time, sim_producao_at_time, future_stock_at_time,
            target_days_at_time, trigger_days_at_time, supplier_name, observacao, status, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'solicitado', CURRENT_TIMESTAMP)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(batch_id)
    .bind(code)
    .bind(item.item_description)
    .bind(item.unit.unwrap_or("UN"))
    .bind(item.quantity_requested)
    .bind(d.estoque.unwrap_or(0.0))
    .bind(d.media.unwrap_or(0.0))
    .bind(d.sim_producao.unwrap_or(0.0))
    .bind(d.estoque_futuro.unwrap_or(0.0))
    .bind(d.dias_objetivo.unwrap_or(90))
    .bind(d.dias_disparo.unwrap_or(30))
    .bind(d.fornecedor.as_deref())
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

// ---- Propostas de subcategoria: agente propõe, supervisor aprova ----

const AVISO_PROPOSTA: &str = "Proposta registrada: a subcategoria só passa a existir quando o supervisor aprovar na tela Organização.";

/// Agente não cria subcategoria: registra a proposta (pendente). Mesmas validações de `criar_subcategoria`.
pub async fn propor_subcategoria(
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
    let parent = resolver_categoria(conn, parent_id).await?;
    let raiz = raiz_de(conn, &parent.id).await?;
    let familia = exige_familia(ctx, &raiz)?;
    if nome_repetido(conn, &parent.id, nome, None).await? {
        return Err(ErroApi::conflito("Já existe uma subcategoria com esse nome nessa família."));
    }
    let periodo = match periodo {
        Some(p) => Some(validar_periodo(p)?),
        None => None,
    };
    let pendente: Option<String> = sqlx::query_scalar(
        "SELECT id FROM compras_subcategoria_propostas WHERE status = 'pendente' AND parent_id = $1 AND lower(btrim(nome)) = lower(btrim($2)) LIMIT 1",
    )
    .bind(&parent.id)
    .bind(nome)
    .fetch_optional(&mut *conn)
    .await?;
    if let Some(id) = pendente {
        return Err(ErroApi::conflito("Já existe uma proposta pendente com esse nome nessa família.").com_detalhes(json!({ "propostaId": id })));
    }
    let id = format!("prop_{}", Uuid::new_v4().simple());
    sqlx::query(
        "INSERT INTO compras_subcategoria_propostas (id, nome, parent_id, periodo, motivo, proposto_por, proposto_por_nome)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(&id)
    .bind(nome)
    .bind(&parent.id)
    .bind(periodo)
    .bind(motivo)
    .bind(&ctx.operator_id)
    .bind(&ctx.display_name)
    .execute(&mut *conn)
    .await?;
    Ok(json!({
        "antes": Value::Null,
        "depois": { "id": id, "nome": nome, "parentId": parent.id, "periodo": periodo, "status": "pendente", "proposta": true },
        "motivo": motivo,
        "familia": familia,
        "aviso": AVISO_PROPOSTA,
    }))
}

/// Supervisor aprova: cria a subcategoria (mesma regra de `criar_subcategoria`) e fecha a proposta.
pub async fn aprovar_proposta(conn: &mut PgConnection, ctx: &AuthContext, id: &str, motivo: &str) -> Result<Value, ErroApi> {
    let motivo = motivo_ok(motivo)?;
    let row = sqlx::query("SELECT nome, parent_id, periodo, motivo, status FROM compras_subcategoria_propostas WHERE id = $1 FOR UPDATE")
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?;
    let Some(row) = row else {
        return Err(ErroApi::nao_encontrado("Proposta não encontrada.").com_detalhes(json!({ "id": id })));
    };
    let status: String = row.get("status");
    if status != "pendente" {
        return Err(ErroApi::regra("Essa proposta já foi decidida.").com_detalhes(json!({ "id": id, "status": status })));
    }
    let nome: String = row.get("nome");
    let parent_id: String = row.get("parent_id");
    let periodo: Option<i32> = row.get("periodo");
    let motivo_proposta: String = row.get("motivo");
    let criada = criar_subcategoria(conn, ctx, &nome, &parent_id, periodo, &motivo_proposta).await?;
    let categoria_id = criada["depois"]["id"].as_str().unwrap_or_default().to_string();
    sqlx::query(
        "UPDATE compras_subcategoria_propostas SET status = 'aprovada', decidido_por = $2, decidido_em = now(), motivo_decisao = $3, categoria_id = $4 WHERE id = $1",
    )
    .bind(id)
    .bind(&ctx.operator_id)
    .bind(motivo)
    .bind(&categoria_id)
    .execute(&mut *conn)
    .await?;
    Ok(json!({
        "antes": { "propostaId": id, "status": "pendente" },
        "depois": { "id": categoria_id, "nome": nome, "parentId": parent_id, "periodo": criada["depois"]["periodo"], "propostaId": id },
        "motivo": motivo,
        "familia": criada["familia"],
    }))
}

pub async fn recusar_proposta(conn: &mut PgConnection, ctx: &AuthContext, id: &str, motivo: &str) -> Result<Value, ErroApi> {
    let motivo = motivo_ok(motivo)?;
    let row = sqlx::query("SELECT nome, parent_id, status FROM compras_subcategoria_propostas WHERE id = $1 FOR UPDATE")
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?;
    let Some(row) = row else {
        return Err(ErroApi::nao_encontrado("Proposta não encontrada.").com_detalhes(json!({ "id": id })));
    };
    let status: String = row.get("status");
    if status != "pendente" {
        return Err(ErroApi::regra("Essa proposta já foi decidida.").com_detalhes(json!({ "id": id, "status": status })));
    }
    let nome: String = row.get("nome");
    let parent_id: String = row.get("parent_id");
    let raiz = raiz_de(conn, &parent_id).await?;
    sqlx::query("UPDATE compras_subcategoria_propostas SET status = 'recusada', decidido_por = $2, decidido_em = now(), motivo_decisao = $3 WHERE id = $1")
        .bind(id)
        .bind(&ctx.operator_id)
        .bind(motivo)
        .execute(&mut *conn)
        .await?;
    Ok(json!({
        "antes": { "id": id, "status": "pendente", "nome": nome },
        "depois": { "id": id, "status": "recusada", "nome": nome, "parentId": parent_id },
        "motivo": motivo,
        "familia": modulo_da_raiz(&raiz).unwrap_or("compras_materia_prima"),
    }))
}

pub async fn listar_propostas(pool: &sqlx::PgPool, status: &str) -> Result<Vec<Value>, ErroApi> {
    let rows = sqlx::query(
        "SELECT p.id, p.nome, p.parent_id, c.name AS parent_nome, p.periodo, p.motivo, p.status, p.proposto_por_nome,
                p.created_at::text AS criada_em, p.decidido_em::text AS decidida_em, p.motivo_decisao, p.categoria_id
         FROM compras_subcategoria_propostas p JOIN categories c ON c.id = p.parent_id
         WHERE ($1 = 'todas' OR p.status = $1) ORDER BY p.created_at DESC LIMIT 200",
    )
    .bind(status)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<String, _>("id"), "nome": r.get::<String, _>("nome"), "parentId": r.get::<String, _>("parent_id"),
                "parentNome": r.get::<String, _>("parent_nome"), "periodo": r.get::<Option<i32>, _>("periodo"),
                "motivo": r.get::<String, _>("motivo"), "status": r.get::<String, _>("status"),
                "propostoPor": r.get::<Option<String>, _>("proposto_por_nome"), "criadaEm": r.get::<String, _>("criada_em"),
                "decididaEm": r.get::<Option<String>, _>("decidida_em"), "motivoDecisao": r.get::<Option<String>, _>("motivo_decisao"),
                "categoriaId": r.get::<Option<String>, _>("categoria_id"),
            })
        })
        .collect())
}

/// Subcategorias ativas com quantos itens e produtos cada uma tem (base do aviso de fusão).
pub async fn resumo_subcategorias(pool: &sqlx::PgPool) -> Result<Vec<Value>, ErroApi> {
    let rows = sqlx::query(
        "SELECT c.id, c.name, c.parent_id,
                (SELECT COUNT(*) FROM items i WHERE i.category_id = c.id AND COALESCE(i.is_ignored, 0) = 0) AS itens,
                (SELECT COUNT(*) FROM overrides_produtos o WHERE o.categoria_produto = c.id) AS produtos
         FROM categories c WHERE c.arquivada_em IS NULL ORDER BY c.name",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .iter()
        .map(|r| json!({ "id": r.get::<String, _>("id"), "name": r.get::<String, _>("name"), "parentId": r.get::<Option<String>, _>("parent_id"), "itens": r.get::<i64, _>("itens"), "produtos": r.get::<i64, _>("produtos") }))
        .collect())
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
    fn status_segue_a_demanda_e_nao_um_valor_velho() {
        assert_eq!(status_efetivo(false, Some("suspenso")), "ativo");
        assert_eq!(status_efetivo(false, None), "ativo");
        assert_eq!(status_efetivo(true, None), "suspenso");
        assert_eq!(status_efetivo(true, Some("ativo")), "suspenso");
        assert_eq!(status_efetivo(true, Some("ignorado")), "ignorado");
    }

    #[test]
    fn agente_so_mexe_em_produto_de_apoio_ou_coloracao() {
        assert!(agente_pode_mexer_no_produto(Some("cat_apoio")));
        assert!(agente_pode_mexer_no_produto(Some("cat_coloracao")));
        assert!(!agente_pode_mexer_no_produto(Some("cat_mp")));
        assert!(!agente_pode_mexer_no_produto(None));
    }

    #[test]
    fn nome_da_lista_aceita_apelidos_e_grava_o_da_tela() {
        assert_eq!(nome_da_lista("mp"), Some("materia_prima"));
        assert_eq!(nome_da_lista("compras_embalagens"), Some("embalagens"));
        assert_eq!(nome_da_lista("cat_apoio"), Some("apoio"));
        assert_eq!(nome_da_lista("geral"), None);
    }

    #[test]
    fn dados_do_item_usam_o_que_o_agente_mandou() {
        let entrada = CreatePurchaseRequestItemInput {
            item_code: "9.15.001".into(),
            item_description: "X".into(),
            unit: None,
            quantity_requested: 1.0,
            current_stock_at_time: Some(12.5),
            overall_avg_at_time: None,
            sim_producao_at_time: None,
            future_stock_at_time: None,
            target_days_at_time: Some(60),
            trigger_days_at_time: None,
            supplier_name: Some("FORNEC".into()),
            observacao: None,
        };
        let d = DadosDoItem::montar(&entrada, None);
        assert_eq!((d.estoque, d.media, d.dias_objetivo), (Some(12.5), None, Some(60)));
        assert_eq!(d.fornecedor.as_deref(), Some("FORNEC"));
        assert!(!d.sem_numeros());
        assert!(DadosDoItem::default().sem_numeros());
    }

    #[test]
    fn lista_aponta_para_a_familia() {
        assert_eq!(modulo_da_lista("embalagens"), Some("compras_embalagens"));
        assert_eq!(modulo_da_lista("APOIO"), Some("compras_apoio"));
        assert_eq!(modulo_da_lista("geral"), None);
    }

    fn ctx_de(role: crate::modules::geral::auth::models::OperatorRole, origem: crate::modules::geral::auth::models::Origem) -> AuthContext {
        AuthContext {
            operator_id: "a1".into(),
            display_name: "Teste".into(),
            role,
            modules: vec!["compras_materia_prima".into()],
            permissions: vec![("compras_materia_prima".to_string(), "edit".to_string())].into_iter().collect(),
            origem,
        }
    }

    /// Tudo dentro de uma transação que no fim é desfeita: não deixa nada no banco.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn agente_produto_status_e_lote_com_numeros() {
        use crate::modules::geral::auth::models::{OperatorRole, Origem};
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = sqlx::PgPool::connect(&url).await.unwrap();
        // a coluna `status_compra` vem da migração 082 (idempotente); o banco de teste pode ainda não ter
        sqlx::raw_sql(include_str!("../../../../../supabase/082_compras_status_item.sql")).execute(&pool).await.unwrap();
        let mut tx = pool.begin().await.unwrap();
        let agente = ctx_de(OperatorRole::Operador, Origem::Agente);
        let supervisor = ctx_de(OperatorRole::Supervisor, Origem::Tela);

        sqlx::query("INSERT INTO items (code, description, unit, category_id) VALUES ('ZZ.AG.001', 'ZZ item', 'KG', 'cat_mp'), ('ZZ.AG.002', 'ZZ item 2', 'KG', 'cat_mp')")
            .execute(&mut *tx).await.unwrap();
        sqlx::query("INSERT INTO config_linhas (linha_prefix, nome_linha) VALUES ('ZZAG', 'teste') ON CONFLICT DO NOTHING").execute(&mut *tx).await.unwrap();
        sqlx::query("INSERT INTO produtos (codigo, descricao, linha_prefix) VALUES ('ZZ.AG.PROD', 'ZZ produto', 'ZZAG')").execute(&mut *tx).await.unwrap();

        // produto sem categoria de Apoio/Coloração: agente é recusado, supervisor move
        let recusa = mover_itens(&mut *tx, &agente, &["ZZ.AG.PROD".to_string()], "cat_mp", "teste").await.unwrap_err();
        assert_eq!(recusa.codigo, "sem_permissao");
        let ok = mover_itens(&mut *tx, &supervisor, &["ZZ.AG.PROD".to_string()], "cat_mp", "teste").await.unwrap();
        assert_eq!(ok["quantidade"], 1);
        // insumo o agente continua movendo dentro da família
        mover_itens(&mut *tx, &agente, &["ZZ.AG.001".to_string()], "cat_mp", "teste").await.unwrap();

        // a tela reativou o item (só is_ignored) e `status_compra` ficou velho: vale a demanda
        sqlx::query("UPDATE items SET is_ignored = 0, status_compra = 'suspenso' WHERE code = 'ZZ.AG.001'").execute(&mut *tx).await.unwrap();
        let r = alterar_status_item(&mut *tx, &agente, "ZZ.AG.001", "suspenso", "teste").await.unwrap();
        assert_eq!(r["antes"]["status"], "ativo");
        assert_eq!(r["depois"]["status"], "suspenso");
        let nada = alterar_status_item(&mut *tx, &agente, "ZZ.AG.001", "suspenso", "teste").await.unwrap_err();
        assert_eq!(nada.codigo, "regra_violada");

        // lote por agente: números gravados, apelido do módulo vira o nome da tela e a Lista de Compra só perde os itens do lote
        sqlx::query("INSERT INTO compras_lista_itens (modulo, item_chave, item_code) VALUES ('materia_prima', 'ZZAG001', 'ZZ.AG.001'), ('materia_prima', 'ZZAG002', 'ZZ.AG.002'), ('embalagens', 'ZZAG001', 'ZZ.AG.001')")
            .execute(&mut *tx).await.unwrap();
        let itens = [
            ItemLista {
                item_code: "ZZ.AG.001",
                item_description: "ZZ item",
                unit: Some("KG"),
                quantity_requested: 5.0,
                observacao: None,
                dados: DadosDoItem { estoque: Some(12.5), media: Some(3.0), dias_objetivo: Some(60), fornecedor: Some("FORNEC".into()), ..Default::default() },
            },
        ];
        let lote = criar_lista(&mut *tx, &agente, "mp", Some("ZZ"), None, "zz", &itens, "teste").await.unwrap();
        assert_eq!(lote["depois"]["modulo"], "materia_prima");
        assert_eq!(lote["semDadosDeEstoque"], json!([]));
        let (estoque, media, dias, fornecedor): (f64, f64, i32, Option<String>) = sqlx::query_as(
            "SELECT current_stock_at_time, overall_avg_at_time, target_days_at_time, supplier_name FROM purchase_request_items WHERE item_code = 'ZZ.AG.001'",
        )
        .fetch_one(&mut *tx).await.unwrap();
        assert_eq!((estoque, media, dias, fornecedor.as_deref()), (12.5, 3.0, 60, Some("FORNEC")));
        let modulo_gravado: String = sqlx::query_scalar("SELECT modulo FROM purchase_request_batches WHERE titulo = 'ZZ'").fetch_one(&mut *tx).await.unwrap();
        assert_eq!(modulo_gravado, "materia_prima");
        let restam: Vec<(String, String)> = sqlx::query_as("SELECT modulo, item_chave FROM compras_lista_itens WHERE item_chave LIKE 'ZZAG%' ORDER BY 1, 2")
            .fetch_all(&mut *tx).await.unwrap();
        assert_eq!(restam, vec![("embalagens".to_string(), "ZZAG001".to_string()), ("materia_prima".to_string(), "ZZAG002".to_string())]);

        // item sem nenhum número é apontado, e quantidade inválida é recusada
        let sem = [ItemLista { item_code: "ZZ.AG.002", item_description: "x", unit: None, quantity_requested: 1.0, observacao: None, dados: DadosDoItem::default() }];
        let r = criar_lista(&mut *tx, &agente, "materia_prima", None, None, "zz", &sem, "teste").await.unwrap();
        assert_eq!(r["semDadosDeEstoque"], json!(["ZZ.AG.002"]));
        let neg = [ItemLista { item_code: "ZZ.AG.002", item_description: "x", unit: None, quantity_requested: -1.0, observacao: None, dados: DadosDoItem::default() }];
        let e = criar_lista(&mut *tx, &agente, "materia_prima", None, None, "zz", &neg, "teste").await.unwrap_err();
        assert_eq!(e.codigo, "invalido");

        tx.rollback().await.unwrap();
    }

    /// Agente propõe, supervisor aprova ou recusa; nada existe antes da aprovação.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn proposta_de_subcategoria_aprovar_e_recusar() {
        use crate::modules::geral::auth::models::{OperatorRole, Origem};
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = sqlx::PgPool::connect(&url).await.unwrap();
        let mut tx = pool.begin().await.unwrap();
        let agente = ctx_de(OperatorRole::Operador, Origem::Agente);
        let sup = ctx_de(OperatorRole::Supervisor, Origem::Tela);

        let p = propor_subcategoria(&mut *tx, &agente, "ZZ proposta A", "cat_mp", Some(6), "teste").await.unwrap();
        let id_a = p["depois"]["id"].as_str().unwrap().to_string();
        assert_eq!(p["depois"]["status"], "pendente");
        let existe: i64 = sqlx::query_scalar("SELECT count(*) FROM categories WHERE name = 'ZZ proposta A'").fetch_one(&mut *tx).await.unwrap();
        assert_eq!(existe, 0, "proposta não cria a categoria");
        // proposta repetida e nome de motivo vazio
        assert_eq!(propor_subcategoria(&mut *tx, &agente, " zz PROPOSTA a ", "cat_mp", None, "t").await.unwrap_err().codigo, "conflito");
        assert_eq!(propor_subcategoria(&mut *tx, &agente, "ZZ outra", "cat_mp", None, " ").await.unwrap_err().codigo, "invalido");
        // sem permissão na família
        assert_eq!(propor_subcategoria(&mut *tx, &agente, "ZZ emb", "cat_emb", None, "t").await.unwrap_err().codigo, "sem_permissao");

        let ap = aprovar_proposta(&mut *tx, &sup, &id_a, "ok").await.unwrap();
        let cat = ap["depois"]["id"].as_str().unwrap().to_string();
        assert_eq!(ap["depois"]["periodo"].as_i64(), Some(6));
        let (nome, pai): (String, Option<String>) = sqlx::query_as("SELECT name, parent_id FROM categories WHERE id = $1").bind(&cat).fetch_one(&mut *tx).await.unwrap();
        assert_eq!((nome.as_str(), pai.as_deref()), ("ZZ proposta A", Some("cat_mp")));
        assert_eq!(aprovar_proposta(&mut *tx, &sup, &id_a, "ok").await.unwrap_err().codigo, "regra_violada");
        assert_eq!(recusar_proposta(&mut *tx, &sup, &id_a, "x").await.unwrap_err().codigo, "regra_violada");

        let p2 = propor_subcategoria(&mut *tx, &agente, "ZZ proposta B", "cat_mp", None, "teste").await.unwrap();
        let id_b = p2["depois"]["id"].as_str().unwrap().to_string();
        assert_eq!(recusar_proposta(&mut *tx, &sup, &id_b, "  ").await.unwrap_err().codigo, "invalido");
        let rc = recusar_proposta(&mut *tx, &sup, &id_b, "duplica a A").await.unwrap();
        assert_eq!(rc["depois"]["status"], "recusada");

        tx.rollback().await.unwrap();
    }

    /// Subcategoria nova herda o período (da mãe, senão o geral); id, prefixo ou nome acham a categoria; lote em ordem estável.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn subcategoria_herda_periodo_e_acha_por_nome_ou_prefixo() {
        use crate::modules::geral::auth::models::{OperatorRole, Origem};
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = sqlx::PgPool::connect(&url).await.unwrap();
        let mut tx = pool.begin().await.unwrap();
        let agente = ctx_de(OperatorRole::Operador, Origem::Agente);
        sqlx::query("INSERT INTO config (key, value) VALUES ('compras_main', '{\"averagePeriodMonths\": 7}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value")
            .execute(&mut *tx).await.unwrap();

        // sem período no corpo e sem período na mãe: herda o geral da família, sem gravar linha própria
        let a = criar_subcategoria(&mut *tx, &agente, "ZZ rev A", "cat_mp", None, "t").await.unwrap();
        let id_a = a["depois"]["id"].as_str().unwrap().to_string();
        assert_eq!((a["depois"]["periodo"].as_i64(), a["depois"]["periodoHerdado"].as_i64()), (Some(7), Some(7)));
        assert_eq!(a["depois"]["periodoGravado"], false);
        let linhas: i64 = sqlx::query_scalar("SELECT count(*) FROM compras_config_personalizado WHERE target_id = $1").bind(&id_a).fetch_one(&mut *tx).await.unwrap();
        assert_eq!(linhas, 0);

        // período no corpo é gravado; filha criada pelo NOME da mãe herda esse período
        let b = criar_subcategoria(&mut *tx, &agente, "ZZ rev B", "cat_mp", Some(5), "t").await.unwrap();
        let id_b = b["depois"]["id"].as_str().unwrap().to_string();
        assert_eq!((b["depois"]["periodo"].as_i64(), b["depois"]["periodoGravado"].as_bool()), (Some(5), Some(true)));
        let c = criar_subcategoria(&mut *tx, &agente, "ZZ rev igual", "ZZ rev B", None, "t").await.unwrap();
        assert_eq!((c["depois"]["periodo"].as_i64(), c["depois"]["periodoHerdado"].as_i64()), (Some(5), Some(5)));
        // mãe achada por prefixo do id
        criar_subcategoria(&mut *tx, &agente, "ZZ rev igual", &id_a[..12], None, "t").await.unwrap();

        // nome que existe em duas categorias: recusa e lista as candidatas
        let amb = ajustar_subcategoria(&mut *tx, &agente, "ZZ rev igual", Some("ZZ x"), None, false, "t").await.unwrap_err();
        assert_eq!(amb.codigo, "conflito");

        // ajusta por prefixo do id; o período de antes e de depois é o que vale hoje
        let aj = ajustar_subcategoria(&mut *tx, &agente, &id_b[..12], Some("ZZ rev B2"), None, false, "t").await.unwrap();
        assert_eq!((aj["antes"]["periodo"].as_i64(), aj["depois"]["periodo"].as_i64()), (Some(5), Some(5)));

        // lote com código repetido e destino pelo nome: um item só, sem travar
        sqlx::query("INSERT INTO items (code, description, unit, category_id) VALUES ('9.99.ZZMV', 'ZZ item', 'KG', 'cat_mp')").execute(&mut *tx).await.unwrap();
        let mv = mover_itens(&mut *tx, &agente, &["9.99.ZZMV".to_string(), "9.99.ZZMV".to_string()], "ZZ rev B2", "t").await.unwrap();
        assert_eq!(mv["quantidade"], 1);

        // arquivar: recusa com item ou filha ativa; arquiva vazia; some das listas e não recebe mais itens
        let e = arquivar_subcategoria(&mut *tx, &agente, "ZZ rev B2", false, "t").await.unwrap_err();
        assert_eq!(e.codigo, "regra_violada");
        sqlx::query("UPDATE items SET category_id = 'cat_mp' WHERE code = '9.99.ZZMV'").execute(&mut *tx).await.unwrap();
        let e = arquivar_subcategoria(&mut *tx, &agente, "ZZ rev B2", false, "t").await.unwrap_err();
        assert_eq!(e.codigo, "regra_violada", "ainda tem filha ativa");
        let e = arquivar_subcategoria(&mut *tx, &agente, "cat_mp", false, "t").await.unwrap_err();
        assert_eq!(e.codigo, "regra_violada", "raiz não arquiva");
        let folha = criar_subcategoria(&mut *tx, &agente, "ZZ folha", "cat_mp", None, "t").await.unwrap();
        let id_f = folha["depois"]["id"].as_str().unwrap().to_string();
        let ok = arquivar_subcategoria(&mut *tx, &agente, &id_f, false, "t").await.unwrap();
        assert_eq!(ok["depois"]["arquivada"], true);
        let e = arquivar_subcategoria(&mut *tx, &agente, &id_f, false, "t").await.unwrap_err();
        assert_eq!(e.codigo, "regra_violada", "já arquivada");
        let visiveis: i64 = sqlx::query_scalar("SELECT count(*) FROM categories WHERE id = $1 AND arquivada_em IS NULL").bind(&id_f).fetch_one(&mut *tx).await.unwrap();
        assert_eq!(visiveis, 0);
        let e = criar_subcategoria(&mut *tx, &agente, "ZZ filha", &id_f, None, "t").await.unwrap_err();
        assert_eq!(e.codigo, "regra_violada", "arquivada não recebe filha");
        let e = mover_itens(&mut *tx, &agente, &["9.99.ZZMV".to_string()], &id_f, "t").await.unwrap_err();
        assert_eq!(e.codigo, "regra_violada", "arquivada não recebe item");
        // o nome da arquivada volta a ficar livre
        criar_subcategoria(&mut *tx, &agente, "ZZ folha", "cat_mp", None, "t").await.unwrap();

        tx.rollback().await.unwrap();
    }
}

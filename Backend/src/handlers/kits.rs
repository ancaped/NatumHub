use axum::{
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Extension, Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::core::acao::{executar_em_2_passos, Confirmar, ErroApi};
use crate::core::catalogo::{param, Acao};
use crate::handlers::AppState;
use crate::models::NewKitComposicao;
use crate::modules::geral::audit;
use crate::modules::geral::auth::models::AuthContext;

/// Ações de composição de kits descritas para agentes (ver `core::catalogo`).
pub fn acoes_kits_composicao() -> Vec<Acao> {
    const M: &str = "montagem_kits";
    vec![
        Acao::leitura(
            "listar_ordens_montagem_kits",
            M,
            "Lista as ordens de montagem de kits (da mais nova para a mais antiga), com status, quantidades e lotes dos componentes.",
            "/api/kits/orders",
            vec![],
        ),
        Acao::leitura(
            "listar_ordens_reembalagem",
            M,
            "Lista as ordens de reembalagem (vira: um produto vira outro), com status, quantidades e embalagens.",
            "/api/turnovers/orders",
            vec![],
        ),
        Acao::leitura(
            "listar_composicao_reembalagem",
            M,
            "Lista as relações de reembalagem (produto de origem -> produto de destino e fator de conversão).",
            "/api/turnovers/composicao",
            vec![],
        ),
        Acao::leitura(
            "listar_composicao_kits",
            M,
            "Lista as relações kit → componente (manuais e vindas do ERP).",
            "/api/kits/composicao",
            vec![],
        ),
        Acao::leitura(
            "buscar_candidatos_componente_kit",
            M,
            "Busca produtos que podem ser componentes de um kit.",
            "/api/kits/component-candidates",
            vec![
                param("q", "query", "texto", false, "Parte do código ou da descrição."),
                param("limit", "query", "inteiro", false, "Máximo de resultados."),
            ],
        ),
        Acao::gravacao(
            "importar_composicao_kits",
            M,
            "Reimporta a planilha de composição de kits: substitui todas as relações manuais (as do ERP ficam). Sem `confirmar=true` só devolve a prévia (quantas saem, quantas entram, kits afetados). Envio multipart com o arquivo no campo `file`.",
            "POST",
            "/api/kits/composicao/upload",
            true,
            vec![
                param("confirmar", "query", "booleano", false, "true grava; ausente só mostra a prévia."),
                param("file", "corpo", "arquivo xlsx", true, "Planilha com as abas HAIREXTRATTUS, LISSSHINE e NATUM."),
            ],
        ),
    ]
}

const MODULO_KITS: &str = "montagem_kits";

/// Só quem tem edição na Montagem de Kits grava (leitura continua liberada).
fn exigir_montagem(ctx: &AuthContext) -> Result<(), axum::response::Response> {
    if ctx.can_edit_module(MODULO_KITS) {
        Ok(())
    } else {
        Err(ErroApi::sem_permissao("Sem permissão para alterar a Montagem de Kits.").into_response())
    }
}

/// Linha da ordem como JSON (para auditoria antes/depois). `tabela` é sempre uma constante daqui.
async fn instantaneo_ordem(pool: &PgPool, tabela: &'static str, id: i64) -> Option<serde_json::Value> {
    sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM {tabela} t WHERE id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

/// Relação de composição (kit ou vira) como JSON, para auditoria. Nomes de tabela/coluna são constantes daqui.
async fn instantaneo_composicao(
    pool: &PgPool,
    tabela: &'static str,
    col_a: &'static str,
    col_b: &'static str,
    a: &str,
    b: &str,
) -> Option<serde_json::Value> {
    sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM {tabela} t WHERE {col_a} = $1 AND {col_b} = $2"))
        .bind(a)
        .bind(b)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

/// Número da ordem sem colidir com o UNIQUE: dentro da transação, com lock por tabela, usa o número pedido se
/// estiver livre; senão o próximo da sequência (a tela pede `next-order-number` antes e duas pessoas podem pedir o mesmo).
async fn numero_livre(
    conn: &mut sqlx::PgConnection,
    tabela: &'static str,
    pedido: &str,
    padrao: &str,
) -> Result<String, sqlx::Error> {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
        .bind(tabela)
        .execute(&mut *conn)
        .await?;
    let mut candidato = pedido.to_string();
    if !candidato.trim().is_empty() {
        let ja: bool = sqlx::query_scalar(&format!("SELECT EXISTS (SELECT 1 FROM {tabela} WHERE order_number = $1)"))
            .bind(&candidato)
            .fetch_one(&mut *conn)
            .await?;
        if !ja {
            return Ok(candidato);
        }
    }
    let ultimo: Option<String> =
        sqlx::query_scalar(&format!("SELECT order_number FROM {tabela} ORDER BY id DESC LIMIT 1"))
            .fetch_optional(&mut *conn)
            .await?;
    candidato = compute_next_order_number(ultimo, padrao);
    for _ in 0..1000 {
        let ja: bool = sqlx::query_scalar(&format!("SELECT EXISTS (SELECT 1 FROM {tabela} WHERE order_number = $1)"))
            .bind(&candidato)
            .fetch_one(&mut *conn)
            .await?;
        if !ja {
            break;
        }
        candidato = compute_next_order_number(Some(candidato), padrao);
    }
    Ok(candidato)
}

#[derive(Debug, Deserialize)]
pub struct KitComponentSearchQuery {
    pub q: Option<String>,
    pub limit: Option<i64>,
}

// GET /api/kits/component-candidates?q=
pub async fn search_kit_component_candidates(
    State(state): State<Arc<AppState>>,
    Query(q): Query<KitComponentSearchQuery>,
) -> impl IntoResponse {
    let term = q.q.unwrap_or_default();
    if term.trim().is_empty() {
        return (StatusCode::OK, Json(json!({ "items": [] }))).into_response();
    }
    match state
        .db
        .search_kit_component_candidates(&term, q.limit.unwrap_or(20))
        .await
    {
        Ok(rows) => {
            let items: Vec<_> = rows
                .into_iter()
                .map(|(codigo, descricao, fonte)| {
                    json!({
                        "codigo": codigo,
                        "descricao": descricao,
                        "fonte": fonte,
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!({ "items": items }))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar componentes: {}", e) })),
        )
            .into_response(),
    }
}

// GET /api/kits/composicao
pub async fn list_kit_composicao(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_kit_composition_full().await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao listar composição de kits: {}", e) })),
        )
            .into_response(),
    }
}

// POST /api/kits/composicao
pub async fn add_kit_composicao_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<NewKitComposicao>,
) -> impl IntoResponse {
    if let Err(r) = exigir_montagem(&ctx) {
        return r;
    }
    if body.kit_codigo.trim().is_empty() || body.componente_codigo.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "kit_codigo e componente_codigo são obrigatórios" })),
        )
            .into_response();
    }
    if !body.quantidade.is_finite() || body.quantidade <= 0.0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "A quantidade deve ser maior que zero." })),
        )
            .into_response();
    }
    let pool = state.db.pool();
    let antes = instantaneo_composicao(pool, "kit_composicao", "kit_codigo", "componente_codigo", &body.kit_codigo, &body.componente_codigo).await;
    match state
        .db
        .add_kit_composicao(
            &body.kit_codigo,
            &body.componente_codigo,
            body.quantidade,
            body.fator_proporcao_qtd,
            body.fator_proporcao_kits,
        )
        .await
    {
        Ok(_) => {
            let depois = instantaneo_composicao(pool, "kit_composicao", "kit_codigo", "componente_codigo", &body.kit_codigo, &body.componente_codigo).await;
            audit::record_domain(
                pool,
                Some(&ctx),
                MODULO_KITS,
                "salvar_composicao_kit",
                "kit_composicao",
                &format!("{}/{}", body.kit_codigo, body.componente_codigo),
                &format!("Composição do kit {}: componente {}", body.kit_codigo, body.componente_codigo),
                antes,
                depois,
            )
            .await;
            (StatusCode::CREATED, Json(json!({ "status": "success" }))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao adicionar relação de kit: {}", e) })),
        )
            .into_response(),
    }
}

// DELETE /api/kits/composicao/:kit/:comp
pub async fn delete_kit_composicao_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path((kit, comp)): Path<(String, String)>,
) -> impl IntoResponse {
    if let Err(r) = exigir_montagem(&ctx) {
        return r;
    }
    let pool = state.db.pool();
    let antes = instantaneo_composicao(pool, "kit_composicao", "kit_codigo", "componente_codigo", &kit, &comp).await;
    match state.db.delete_kit_composicao(&kit, &comp).await {
        Ok(_) => {
            audit::record_domain(
                pool,
                Some(&ctx),
                MODULO_KITS,
                "excluir_composicao_kit",
                "kit_composicao",
                &format!("{kit}/{comp}"),
                &format!("Composição do kit {kit}: componente {comp} removido"),
                antes,
                None,
            )
            .await;
            (StatusCode::OK, Json(json!({ "status": "success" }))).into_response()
        }
        Err(e) => {
            let status = if e.contains("vinda do ERP") {
                StatusCode::FORBIDDEN
            } else if e.contains("não encontrada") {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            let msg = if status == StatusCode::INTERNAL_SERVER_ERROR {
                format!("Erro ao excluir relação de kit: {}", e)
            } else {
                e
            };
            (status, Json(json!({ "error": msg }))).into_response()
        }
    }
}

// POST /api/kits/composicao/upload (re-import xlsx, replaces all)
pub async fn upload_kit_composicao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    use std::fs::File;
    use std::io::Write;

    let mut file_data: Option<axum::body::Bytes> = None;
    let mut file_name: Option<String> = None;
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("file") {
            file_name = field.file_name().map(|s| s.to_string());
            if let Ok(bytes) = field.bytes().await {
                file_data = Some(bytes);
                break;
            }
        }
    }
    let bytes = match file_data {
        Some(b) => b,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Arquivo não encontrado no formulário" })),
            )
                .into_response();
        }
    };
    let temp_path = std::env::temp_dir().join(format!("temp_kits_upload_{}.xlsx", uuid::Uuid::new_v4()));
    let mut file = match File::create(&temp_path) {
        Ok(f) => f,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Erro ao criar arquivo temporário: {}", e) })),
            )
                .into_response();
        }
    };
    if let Err(e) = file.write_all(&bytes) {
        drop(file);
        let _ = std::fs::remove_file(&temp_path);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao escrever arquivo: {}", e) })),
        )
            .into_response();
    }
    // Limpeza de linhas manuais ocorre dentro de importar_kits_excel (tx); sem confirmar a transação é desfeita.
    let pool = state.db.pool();
    let resultado =
        crate::modules::compras::planejamento::parser::importar_kits_excel(&temp_path, pool, c.confirmar).await;
    let _ = std::fs::remove_file(&temp_path);
    match resultado {
        Ok(resumo) if !c.confirmar => (
            StatusCode::OK,
            Json(json!({
                "previa": true,
                "acao": "importar_composicao_kits",
                "resultado": resumo,
                "confirmar": "repita com confirmar=true para gravar",
            })),
        )
            .into_response(),
        Ok(resumo) => {
            let fname = file_name.unwrap_or_else(|| "kits.xlsx".to_string());
            let _ = state
                .db
                .record_import(
                    "kits",
                    &fname,
                    resumo.importadas as i64,
                    "success",
                    Some(&format!("{} relações importadas", resumo.importadas)),
                )
                .await;
            audit::record_domain(
                pool,
                Some(&ctx),
                "montagem_kits",
                "importar_composicao_kits",
                "kit_composicao",
                &fname,
                &format!("Composição de kits importada: {} relações", resumo.importadas),
                Some(json!({ "relacoesManuaisRemovidas": resumo.removidas })),
                Some(json!({ "relacoesImportadas": resumo.importadas, "kitsAfetados": resumo.kits_afetados })),
            )
            .await;
            (
                StatusCode::OK,
                Json(json!({
                    "status": "success",
                    "previa": false,
                    "imported": resumo.importadas,
                    "resultado": resumo,
                    "message": format!("Composição de kits importada: {} relações", resumo.importadas)
                })),
            )
                .into_response()
        }
        Err(e) => ErroApi::invalido(format!("Erro ao processar planilha: {}", e)).into_response(),
    }
}

pub async fn fetch_kit_orders(pool: &PgPool) -> Result<Vec<crate::models::KitAssemblyOrder>, String> {
    let rows = sqlx::query(
        "SELECT id, order_number, kit_product_code, kit_product_description, quantity,
                status, created_at, completed_at, assembled_by, checked_by, observations,
                erp_launched, components_lotes, quantity_assembled
         FROM kit_assembly_orders
         ORDER BY id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|row| crate::models::KitAssemblyOrder {
            id: crate::core::pg_row::pg_i64(row, 0),
            order_number: row.get(1),
            kit_product_code: row.get(2),
            kit_product_description: row.get(3),
            quantity: crate::core::pg_row::pg_f64(row, 4),
            status: row.get(5),
            created_at: row.get(6),
            completed_at: row.get(7),
            assembled_by: row.get(8),
            checked_by: row.get(9),
            observations: row.get(10),
            erp_launched: row.try_get::<i32, _>(11).unwrap_or(0),
            components_lotes: row.get(12),
            quantity_assembled: row
                .try_get::<Option<f64>, _>(13)
                .ok()
                .flatten()
                .or_else(|| {
                    row.try_get::<Option<i32>, _>(13)
                        .ok()
                        .flatten()
                        .map(|v| v as f64)
                }),
        })
        .collect())
}

pub async fn list_kit_orders(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();
    match fetch_kit_orders(pool).await {
        Ok(orders) => (StatusCode::OK, Json(orders)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn create_kit_order(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(payload): Json<crate::models::CreateKitOrderRequest>,
) -> impl IntoResponse {
    if let Err(r) = exigir_montagem(&ctx) {
        return r;
    }
    if !payload.quantity.is_finite() || payload.quantity <= 0.0 {
        return ErroApi::invalido("A quantidade da ordem deve ser maior que zero.").into_response();
    }
    if payload.quantity_assembled.is_some_and(|q| !q.is_finite() || q < 0.0) {
        return ErroApi::invalido("A quantidade montada não pode ser negativa.").into_response();
    }
    let pool = state.db.pool();
    let created_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let status = payload.status.clone().unwrap_or_else(|| "PENDING".to_string());
    // Ordem nova não tem quantidade montada (NULL); a tela já trata null como "ainda não montou".
    let qty_assembled = payload.quantity_assembled;

    let resultado: Result<(i64, String), sqlx::Error> = async {
        let mut tx = pool.begin().await?;
        let numero = numero_livre(&mut tx, "kit_assembly_orders", &payload.order_number, "1001").await?;
        let row = sqlx::query(
            "INSERT INTO kit_assembly_orders (
                order_number, kit_product_code, kit_product_description, quantity, status,
                created_at, assembled_by, checked_by, observations, erp_launched, components_lotes,
                quantity_assembled
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11)
             RETURNING id",
        )
        .bind(&numero)
        .bind(&payload.kit_product_code)
        .bind(&payload.kit_product_description)
        .bind(payload.quantity)
        .bind(&status)
        .bind(&created_at)
        .bind(&payload.assembled_by)
        .bind(&payload.checked_by)
        .bind(&payload.observations)
        .bind(&payload.components_lotes)
        .bind(qty_assembled)
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok((crate::core::pg_row::pg_i64(&row, 0), numero))
    }
    .await;

    match resultado {
        Ok((last_id, numero)) => {
            audit::record_domain(
                pool,
                Some(&ctx),
                MODULO_KITS,
                "criar_ordem_kit",
                "kit_assembly_orders",
                &last_id.to_string(),
                &format!("Ordem de montagem {} criada: {} x {}", numero, payload.quantity, payload.kit_product_code),
                None,
                instantaneo_ordem(pool, "kit_assembly_orders", last_id).await,
            )
            .await;
            (
                StatusCode::CREATED,
                Json(json!({
                    "id": last_id,
                    "orderNumber": numero,
                    "createdAt": created_at,
                    "message": "Ordem de montagem criada"
                })),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("Erro ao criar ordem de montagem: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn update_kit_order(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Json(payload): Json<crate::models::UpdateKitOrderRequest>,
) -> impl IntoResponse {
    if let Err(r) = exigir_montagem(&ctx) {
        return r;
    }
    if payload.quantity.is_some_and(|q| !q.is_finite() || q <= 0.0) {
        return ErroApi::invalido("A quantidade da ordem deve ser maior que zero.").into_response();
    }
    if payload.quantity_assembled.is_some_and(|q| !q.is_finite() || q < 0.0) {
        return ErroApi::invalido("A quantidade montada não pode ser negativa.").into_response();
    }
    let pool = state.db.pool();
    let antes = instantaneo_ordem(pool, "kit_assembly_orders", id).await;
    let mut qb = sqlx::QueryBuilder::new("UPDATE kit_assembly_orders SET ");
    let mut has_set = false;

    let mut separated = qb.separated(", ");

    if let Some(ref order_number) = payload.order_number {
        separated.push("order_number = ");
        separated.push_bind_unseparated(order_number);
        has_set = true;
    }
    if let Some(quantity) = payload.quantity {
        separated.push("quantity = ");
        separated.push_bind_unseparated(quantity);
        has_set = true;
    }
    if let Some(ref status) = payload.status {
        separated.push("status = ");
        separated.push_bind_unseparated(status);
        has_set = true;
        if status == "COMPLETED" {
            let completed_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            separated.push("completed_at = ");
            separated.push_bind_unseparated(completed_at);
        } else if status == "PENDING" {
            separated.push("completed_at = NULL");
        }
    }
    if let Some(ref assembled_by) = payload.assembled_by {
        separated.push("assembled_by = ");
        separated.push_bind_unseparated(assembled_by);
        has_set = true;
    }
    if let Some(ref checked_by) = payload.checked_by {
        separated.push("checked_by = ");
        separated.push_bind_unseparated(checked_by);
        has_set = true;
    }
    if let Some(ref observations) = payload.observations {
        separated.push("observations = ");
        separated.push_bind_unseparated(observations);
        has_set = true;
    }
    if let Some(erp_launched) = payload.erp_launched {
        separated.push("erp_launched = ");
        separated.push_bind_unseparated(erp_launched);
        has_set = true;
    }
    if let Some(ref components_lotes) = payload.components_lotes {
        separated.push("components_lotes = ");
        separated.push_bind_unseparated(components_lotes);
        has_set = true;
    }
    if let Some(quantity_assembled) = payload.quantity_assembled {
        separated.push("quantity_assembled = ");
        separated.push_bind_unseparated(quantity_assembled);
        has_set = true;
    }

    if !has_set {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Nenhum campo para atualizar" })),
        )
            .into_response();
    }

    qb.push(" WHERE id = ");
    qb.push_bind(id);

    match qb.build().execute(pool).await {
        Ok(_) => {
            audit::record_domain(
                pool,
                Some(&ctx),
                MODULO_KITS,
                "atualizar_ordem_kit",
                "kit_assembly_orders",
                &id.to_string(),
                &format!("Ordem de montagem {id} atualizada"),
                antes,
                instantaneo_ordem(pool, "kit_assembly_orders", id).await,
            )
            .await;
            (
                StatusCode::OK,
                Json(json!({ "message": "Ordem de montagem atualizada" })),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("Erro ao atualizar: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn delete_kit_order(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Query(q): Query<Confirmar>,
) -> impl IntoResponse {
    excluir_ordem(state, ctx, id, q.confirmar, "kit_assembly_orders", "excluir_ordem_kit", "Ordem de montagem", "Ordem de montagem excluída").await
}

/// Exclui uma ordem (kit ou reembalagem) em 2 passos: sem `confirmar` só devolve a ordem que sairia.
async fn excluir_ordem(
    state: Arc<AppState>,
    ctx: AuthContext,
    id: i64,
    confirmar: bool,
    tabela: &'static str,
    acao: &'static str,
    rotulo: &'static str,
    mensagem: &'static str,
) -> axum::response::Response {
    if let Err(r) = exigir_montagem(&ctx) {
        return r;
    }
    let pool = state.db.pool();
    let r = executar_em_2_passos(pool, acao, confirmar, |tx| {
        Box::pin(async move {
            let ordem: serde_json::Value = sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM {tabela} t WHERE id = $1 FOR UPDATE"))
                .bind(id)
                .fetch_optional(&mut **tx)
                .await?
                .ok_or_else(|| ErroApi::nao_encontrado(format!("{rotulo} não encontrada.")))?;
            sqlx::query(&format!("DELETE FROM {tabela} WHERE id = $1"))
                .bind(id)
                .execute(&mut **tx)
                .await?;
            Ok(ordem)
        })
    })
    .await;
    match r {
        Ok(r) if r.previa => (
            StatusCode::OK,
            Json(json!({ "previa": true, "acao": acao, "item": r.resultado, "confirmar": "repita com confirmar=true para excluir" })),
        )
            .into_response(),
        Ok(r) => {
            audit::record_domain(
                pool,
                Some(&ctx),
                MODULO_KITS,
                acao,
                tabela,
                &id.to_string(),
                &format!("{rotulo} {id} excluída"),
                Some(r.resultado),
                None,
            )
            .await;
            (StatusCode::OK, Json(json!({ "message": mensagem }))).into_response()
        }
        Err(e) => e.into_response(),
    }
}

fn compute_next_order_number(last_order: Option<String>, default: &str) -> String {
    match last_order {
        Some(last) => {
            let mut prefix = String::new();
            let mut num_str = String::new();
            for c in last.chars() {
                if c.is_ascii_digit() {
                    num_str.push(c);
                } else {
                    if !num_str.is_empty() {
                        prefix.push_str(&num_str);
                        num_str.clear();
                    }
                    prefix.push(c);
                }
            }
            if let Ok(num) = num_str.parse::<i64>() {
                let formatted_num = format!("{:0width$}", num + 1, width = num_str.len());
                format!("{}{}", prefix, formatted_num)
            } else {
                format!("{}-1", last)
            }
        }
        None => default.to_string(),
    }
}

pub async fn get_next_kit_order_number(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();
    let last_order: Option<String> = sqlx::query_scalar(
        "SELECT order_number FROM kit_assembly_orders ORDER BY id DESC LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let next_order = compute_next_order_number(last_order, "1001");
    (StatusCode::OK, Json(json!({ "nextOrderNumber": next_order }))).into_response()
}

pub async fn list_vira_composicao(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();
    match sqlx::query(
        "SELECT vc.de_produto_codigo, pd.descricao as de_desc,
                vc.para_produto_codigo, pp.descricao as para_desc,
                vc.quantidade
         FROM vira_composicao vc
         JOIN produtos pd ON TRIM(REPLACE(vc.de_produto_codigo, '\"', '')) = TRIM(REPLACE(pd.codigo, '\"', ''))
         JOIN produtos pp ON TRIM(REPLACE(vc.para_produto_codigo, '\"', '')) = TRIM(REPLACE(pp.codigo, '\"', ''))
         ORDER BY pd.descricao",
    )
    .fetch_all(pool)
    .await
    {
        Ok(rows) => {
            let list: Vec<crate::models::ViraComposicaoRow> = rows
                .iter()
                .map(|row| crate::models::ViraComposicaoRow {
                    de_produto_codigo: row.get(0),
                    de_produto_descricao: row.get(1),
                    para_produto_codigo: row.get(2),
                    para_produto_descricao: row.get(3),
                    quantidade: crate::core::pg_row::pg_f64(row, 4),
                })
                .collect();
            (StatusCode::OK, Json(list)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn add_vira_composicao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(payload): Json<crate::models::NewViraComposicao>,
) -> impl IntoResponse {
    if let Err(r) = exigir_montagem(&ctx) {
        return r;
    }
    if payload.de_produto_codigo.trim().is_empty() || payload.para_produto_codigo.trim().is_empty() {
        return ErroApi::invalido("Informe o produto de origem e o de destino.").into_response();
    }
    if !payload.quantidade.is_finite() || payload.quantidade <= 0.0 {
        return ErroApi::invalido("A quantidade deve ser maior que zero.").into_response();
    }
    let pool = state.db.pool();
    let antes = instantaneo_composicao(pool, "vira_composicao", "de_produto_codigo", "para_produto_codigo", &payload.de_produto_codigo, &payload.para_produto_codigo).await;
    match sqlx::query(
        "INSERT INTO vira_composicao (de_produto_codigo, para_produto_codigo, quantidade)
         VALUES ($1, $2, $3)
         ON CONFLICT(de_produto_codigo, para_produto_codigo) DO UPDATE SET quantidade = EXCLUDED.quantidade",
    )
    .bind(&payload.de_produto_codigo)
    .bind(&payload.para_produto_codigo)
    .bind(payload.quantidade)
    .execute(pool)
    .await
    {
        Ok(_) => {
            audit::record_domain(
                pool,
                Some(&ctx),
                MODULO_KITS,
                "salvar_composicao_vira",
                "vira_composicao",
                &format!("{}/{}", payload.de_produto_codigo, payload.para_produto_codigo),
                &format!("Composição de vira {} -> {}", payload.de_produto_codigo, payload.para_produto_codigo),
                antes,
                Some(json!({
                    "de_produto_codigo": payload.de_produto_codigo,
                    "para_produto_codigo": payload.para_produto_codigo,
                    "quantidade": payload.quantidade,
                })),
            )
            .await;
            (
                StatusCode::CREATED,
                Json(json!({ "message": "Composição de vira adicionada" })),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn delete_vira_composicao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path((de, para)): Path<(String, String)>,
) -> impl IntoResponse {
    if let Err(r) = exigir_montagem(&ctx) {
        return r;
    }
    let pool = state.db.pool();
    let antes = instantaneo_composicao(pool, "vira_composicao", "de_produto_codigo", "para_produto_codigo", &de, &para).await;
    match sqlx::query(
        "DELETE FROM vira_composicao WHERE de_produto_codigo = $1 AND para_produto_codigo = $2",
    )
    .bind(&de)
    .bind(&para)
    .execute(pool)
    .await
    {
        Ok(_) => {
            audit::record_domain(
                pool,
                Some(&ctx),
                MODULO_KITS,
                "excluir_composicao_vira",
                "vira_composicao",
                &format!("{de}/{para}"),
                &format!("Composição de vira {de} -> {para} excluída"),
                antes,
                None,
            )
            .await;
            (
                StatusCode::OK,
                Json(json!({ "message": "Composição de vira excluída" })),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

async fn fetch_vira_orders(pool: &PgPool) -> Result<Vec<crate::models::ViraOrder>, String> {
    let rows = sqlx::query(
        "SELECT id, order_number, de_produto_codigo, de_produto_descricao,
                para_produto_codigo, para_produto_descricao, quantity, status,
                created_at, completed_at, assembled_by, checked_by, observations,
                erp_launched, quantity_assembled, packaging_deductions, motivo
         FROM vira_ordens
         ORDER BY id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|row| crate::models::ViraOrder {
            id: crate::core::pg_row::pg_i64(row, 0),
            order_number: row.get(1),
            de_produto_codigo: row.get(2),
            de_produto_descricao: row.get(3),
            para_produto_codigo: row.get(4),
            para_produto_descricao: row.get(5),
            quantity: crate::core::pg_row::pg_f64(row, 6),
            status: row.get(7),
            created_at: row.get(8),
            completed_at: row.get(9),
            assembled_by: row.get(10),
            checked_by: row.get(11),
            observations: row.get(12),
            erp_launched: row.try_get::<i32, _>(13).unwrap_or(0),
            quantity_assembled: row
                .try_get::<Option<f64>, _>(14)
                .ok()
                .flatten()
                .or_else(|| {
                    row.try_get::<Option<i32>, _>(14)
                        .ok()
                        .flatten()
                        .map(|v| v as f64)
                }),
            packaging_deductions: row.try_get(15).ok().flatten(),
            motivo: row.try_get(16).ok().flatten(),
        })
        .collect())
}

pub async fn list_vira_orders(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();
    match fetch_vira_orders(pool).await {
        Ok(list) => (StatusCode::OK, Json(list)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn create_vira_order(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(payload): Json<crate::models::CreateViraOrderRequest>,
) -> impl IntoResponse {
    if let Err(r) = exigir_montagem(&ctx) {
        return r;
    }
    if !payload.quantity.is_finite() || payload.quantity <= 0.0 {
        return ErroApi::invalido("A quantidade da ordem deve ser maior que zero.").into_response();
    }
    if payload.quantity_assembled.is_some_and(|q| !q.is_finite() || q < 0.0) {
        return ErroApi::invalido("A quantidade montada não pode ser negativa.").into_response();
    }
    let pool = state.db.pool();
    let created_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let status = payload.status.clone().unwrap_or_else(|| "PENDING".to_string());
    // Ordem nova não tem quantidade montada (NULL); a tela já trata null como "ainda não montou".
    let qty_assembled = payload.quantity_assembled;

    let packaging_json = match &payload.packaging_deductions {
        Some(raw) if !raw.trim().is_empty() => match normalize_packaging_deductions_json(raw) {
            Ok(s) => Some(s),
            Err(e) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": e })),
                )
                    .into_response();
            }
        },
        _ => None,
    };

    let inserido: Result<(i64, String), sqlx::Error> = async {
        let mut tx = pool.begin().await?;
        let numero = numero_livre(&mut tx, "vira_ordens", &payload.order_number, "V-1001").await?;
        let row = sqlx::query(
        "INSERT INTO vira_ordens (
            order_number, de_produto_codigo, de_produto_descricao,
            para_produto_codigo, para_produto_descricao, quantity, status,
            created_at, assembled_by, checked_by, observations, erp_launched, quantity_assembled,
            packaging_deductions, motivo
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, $12, $13, $14)
         RETURNING id",
    )
    .bind(&numero)
    .bind(&payload.de_produto_codigo)
    .bind(&payload.de_produto_codigo)
    .bind(&payload.para_produto_codigo)
    .bind(&payload.para_produto_codigo)
    .bind(payload.quantity)
    .bind(&status)
    .bind(&created_at)
    .bind(&payload.assembled_by)
    .bind(&payload.checked_by)
    .bind(&payload.observations)
    .bind(qty_assembled)
    .bind(&packaging_json)
    .bind(&payload.motivo)
    .fetch_one(&mut *tx)
    .await?;
        tx.commit().await?;
        Ok((crate::core::pg_row::pg_i64(&row, 0), numero))
    }
    .await;
    let (last_id, numero) = match inserido {
        Ok(x) => x,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": format!("Erro ao criar ordem de reembalagem: {}", e) })),
            )
                .into_response();
        }
    };

    let _ = sqlx::query(
        "UPDATE vira_ordens
         SET de_produto_descricao = COALESCE(
                 (SELECT descricao FROM produtos WHERE TRIM(REPLACE(codigo, '\"', '')) = TRIM(REPLACE(de_produto_codigo, '\"', '')) LIMIT 1),
                 de_produto_codigo),
             para_produto_descricao = COALESCE(
                 (SELECT descricao FROM produtos WHERE TRIM(REPLACE(codigo, '\"', '')) = TRIM(REPLACE(para_produto_codigo, '\"', '')) LIMIT 1),
                 para_produto_codigo)
         WHERE id = $1",
    )
    .bind(last_id)
    .execute(pool)
    .await;

    audit::record_domain(
        pool,
        Some(&ctx),
        MODULO_KITS,
        "criar_ordem_vira",
        "vira_ordens",
        &last_id.to_string(),
        &format!(
            "Ordem de reembalagem {} criada: {} x {} -> {}",
            numero, payload.quantity, payload.de_produto_codigo, payload.para_produto_codigo
        ),
        None,
        instantaneo_ordem(pool, "vira_ordens", last_id).await,
    )
    .await;

    (
        StatusCode::CREATED,
        Json(json!({ "id": last_id, "orderNumber": numero, "message": "Ordem de vira criada" })),
    )
        .into_response()
}

pub async fn update_vira_order(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Json(payload): Json<crate::models::UpdateViraOrderRequest>,
) -> impl IntoResponse {
    if let Err(r) = exigir_montagem(&ctx) {
        return r;
    }
    if payload.quantity_assembled.is_some_and(|q| !q.is_finite() || q < 0.0) {
        return ErroApi::invalido("A quantidade montada não pode ser negativa.").into_response();
    }
    let pool = state.db.pool();
    let antes = instantaneo_ordem(pool, "vira_ordens", id).await;
    let mut qb = sqlx::QueryBuilder::new("UPDATE vira_ordens SET ");
    let mut has_set = false;
    let mut separated = qb.separated(", ");

    if let Some(ref status) = payload.status {
        separated.push("status = ");
        separated.push_bind_unseparated(status);
        has_set = true;
        if status == "COMPLETED" {
            let completed_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            separated.push("completed_at = ");
            separated.push_bind_unseparated(completed_at);
        } else if status == "PENDING" {
            separated.push("completed_at = NULL");
        }
    }
    if let Some(ref assembled_by) = payload.assembled_by {
        separated.push("assembled_by = ");
        separated.push_bind_unseparated(assembled_by);
        has_set = true;
    }
    if let Some(ref checked_by) = payload.checked_by {
        separated.push("checked_by = ");
        separated.push_bind_unseparated(checked_by);
        has_set = true;
    }
    if let Some(ref observations) = payload.observations {
        separated.push("observations = ");
        separated.push_bind_unseparated(observations);
        has_set = true;
    }
    if let Some(erp_launched) = payload.erp_launched {
        separated.push("erp_launched = ");
        separated.push_bind_unseparated(erp_launched);
        has_set = true;
    }
    if let Some(quantity_assembled) = payload.quantity_assembled {
        separated.push("quantity_assembled = ");
        separated.push_bind_unseparated(quantity_assembled);
        has_set = true;
    }
    if let Some(ref packaging_deductions) = payload.packaging_deductions {
        let normalized = match normalize_packaging_deductions_json(packaging_deductions) {
            Ok(s) => s,
            Err(e) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": e })),
                )
                    .into_response();
            }
        };
        separated.push("packaging_deductions = ");
        separated.push_bind_unseparated(normalized);
        has_set = true;
    }
    if let Some(ref motivo) = payload.motivo {
        separated.push("motivo = ");
        separated.push_bind_unseparated(motivo);
        has_set = true;
    }

    if !has_set {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Nenhum campo para atualizar" })),
        )
            .into_response();
    }

    qb.push(" WHERE id = ");
    qb.push_bind(id);

    match qb.build().execute(pool).await {
        Ok(_) => {
            audit::record_domain(
                pool,
                Some(&ctx),
                MODULO_KITS,
                "atualizar_ordem_vira",
                "vira_ordens",
                &id.to_string(),
                &format!("Ordem de reembalagem {id} atualizada"),
                antes,
                instantaneo_ordem(pool, "vira_ordens", id).await,
            )
            .await;
            (
                StatusCode::OK,
                Json(json!({ "message": "Ordem de reembalagem atualizada" })),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("Erro ao atualizar: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn delete_vira_order(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Query(q): Query<Confirmar>,
) -> impl IntoResponse {
    excluir_ordem(state, ctx, id, q.confirmar, "vira_ordens", "excluir_ordem_vira", "Ordem de reembalagem", "Ordem de vira excluída").await
}

pub async fn get_next_vira_order_number(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();
    let last_order: Option<String> = sqlx::query_scalar(
        "SELECT order_number FROM vira_ordens ORDER BY id DESC LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let next_order = compute_next_order_number(last_order, "V-1001");
    (StatusCode::OK, Json(json!({ "nextOrderNumber": next_order }))).into_response()
}

// —— Embalagens na conversão (somente registro em vira_ordens; sem mexer estoque) ——

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackagingPreviewQuery {
    pub de: String,
    pub para: String,
    pub qty_de: Option<f64>,
    pub qty_para: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ViraPackagingMeta {
    pub qty_de: f64,
    pub fator: f64,
    pub qty_para: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ViraPackagingLine {
    pub code: String,
    pub description: String,
    pub qty: f64,
    /// `return` | `consume`
    pub role: String,
    pub product_code: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub returned: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ViraPackagingDeductions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<ViraPackagingMeta>,
    pub items: Vec<ViraPackagingLine>,
}

fn is_packaging_ingredient(code: &str) -> bool {
    !code.trim().starts_with("9.15.")
}

async fn fetch_product_packaging(
    pool: &PgPool,
    product_code: &str,
) -> Result<Vec<(String, String, f64)>, String> {
    let rows = sqlx::query(
        "SELECT ingredient_code, COALESCE(description, ''), quantity
         FROM formulations
         WHERE TRIM(REPLACE(product_code, '\"', '')) = TRIM(REPLACE($1, '\"', ''))",
    )
    .bind(product_code)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let code: String = row.get(0);
            if !is_packaging_ingredient(&code) {
                return None;
            }
            let desc: String = row.get(1);
            let qty: f64 = crate::core::pg_row::pg_f64(&row, 2);
            Some((code, desc, qty))
        })
        .collect())
}

/// Normaliza `packaging_deductions` para JSON tipado `{ meta?, items }`.
/// Aceita legado: array puro de linhas.
pub fn normalize_packaging_deductions_json(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    let value: serde_json::Value =
        serde_json::from_str(trimmed).map_err(|e| format!("JSON inválido em packaging_deductions: {e}"))?;

    let payload = if value.is_array() {
        let items: Vec<ViraPackagingLine> = serde_json::from_value(value)
            .map_err(|e| format!("Linhas de embalagem inválidas: {e}"))?;
        ViraPackagingDeductions { meta: None, items }
    } else {
        serde_json::from_value(value)
            .map_err(|e| format!("packaging_deductions inválido: {e}"))?
    };

    for line in &payload.items {
        let role = line.role.trim().to_ascii_lowercase();
        if role != "return" && role != "consume" {
            return Err(format!(
                "role inválido '{}' (use return ou consume)",
                line.role
            ));
        }
        if line.code.trim().is_empty() {
            return Err("código de embalagem vazio".into());
        }
    }

    serde_json::to_string(&payload).map_err(|e| e.to_string())
}

// GET /api/turnovers/packaging-preview?de=&para=&qtyDe=&qtyPara=
pub async fn preview_vira_packaging(
    State(state): State<Arc<AppState>>,
    Query(q): Query<PackagingPreviewQuery>,
) -> impl IntoResponse {
    let de = q.de.trim().to_string();
    let para = q.para.trim().to_string();
    if de.is_empty() || para.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Parâmetros de e para são obrigatórios" })),
        )
            .into_response();
    }

    let pool = state.db.pool();
    let fator: f64 = sqlx::query_scalar(
        "SELECT quantidade FROM vira_composicao
         WHERE TRIM(REPLACE(de_produto_codigo, '\"', '')) = TRIM(REPLACE($1, '\"', ''))
           AND TRIM(REPLACE(para_produto_codigo, '\"', '')) = TRIM(REPLACE($2, '\"', ''))
         LIMIT 1",
    )
    .bind(&de)
    .bind(&para)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .unwrap_or(1.0);

    let qty_de = q.qty_de.filter(|v| *v > 0.0).unwrap_or(1.0);
    let qty_para = q
        .qty_para
        .filter(|v| *v > 0.0)
        .unwrap_or_else(|| qty_de * fator);

    let (pack_de, pack_para) = match (
        fetch_product_packaging(pool, &de).await,
        fetch_product_packaging(pool, &para).await,
    ) {
        (Ok(a), Ok(b)) => (a, b),
        (Err(e), _) | (_, Err(e)) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Erro ao ler formulações: {e}") })),
            )
                .into_response();
        }
    };

    let returns: Vec<_> = pack_de
        .into_iter()
        .map(|(code, description, unit_qty)| {
            json!({
                "code": code,
                "description": description,
                "unitQty": unit_qty,
                "qty": unit_qty * qty_de,
                "role": "return",
                "productCode": de,
                "returned": true,
            })
        })
        .collect();

    let consumes: Vec<_> = pack_para
        .into_iter()
        .map(|(code, description, unit_qty)| {
            json!({
                "code": code,
                "description": description,
                "unitQty": unit_qty,
                "qty": unit_qty * qty_para,
                "role": "consume",
                "productCode": para,
            })
        })
        .collect();

    Json(json!({
        "fator": fator,
        "qtyDe": qty_de,
        "qtyPara": qty_para,
        "returns": returns,
        "consumes": consumes,
    }))
    .into_response()
}

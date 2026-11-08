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

use crate::core::acao::{executar_em_2_passos, exigir_motivo, Confirmar, ErroApi, Motivo};
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
            "Lista as ordens de conversão (um produto é convertido em outro), com status, quantidades e embalagens.",
            "/api/turnovers/orders",
            vec![],
        ),
        Acao::leitura(
            "listar_composicao_reembalagem",
            M,
            "Lista as fórmulas de conversão (produto de origem -> produto de destino e fator de conversão).",
            "/api/turnovers/composicao",
            vec![],
        ),
        Acao::leitura(
            "listar_variacoes_conversao",
            M,
            "Para um produto de origem, lista os produtos com a MESMA formulação de matéria-prima (mesma proporção de cada ingrediente 9.15.*, tolerância de 0,5 ponto), com o conteúdo de cada um em kg (soma das quantidades de matéria-prima por unidade da formulação) e o fator de conversão (conteúdo da origem ÷ conteúdo do destino). `base_codigo` do produto não é usado: está vazio nos produtos acabados.",
            "/api/turnovers/variacoes",
            vec![param("de", "query", "texto", true, "Código do produto de origem.")],
        ),
        Acao::leitura(
            "listar_pessoas_kits",
            M,
            "Lista os nomes de quem monta e confere ordens de kits e de conversão (lista compartilhada, usada nos campos \"Quem montou\" e \"Quem conferiu\").",
            "/api/kits/pessoas",
            vec![],
        ),
        Acao::gravacao(
            "adicionar_pessoa_kits",
            M,
            "Acrescenta um nome à lista de quem monta e confere (ignora repetidos, sem diferenciar maiúsculas). Sem `confirmar=true` só devolve a prévia (lista como ficaria); com `confirmar=true` grava e devolve a lista.",
            "POST",
            "/api/kits/pessoas",
            true,
            vec![
                param("nome", "corpo", "texto", true, "Nome da pessoa."),
                param("confirmar", "query", "booleano", false, "true grava; ausente só mostra a prévia."),
            ],
        ),
        Acao::exclusao(
            "remover_pessoa_kits",
            M,
            "Tira um nome da lista de quem monta e confere (ordens antigas mantêm o nome). Exige `motivo` ao confirmar; a lista anterior fica na auditoria; agentes não podem usar. Sem `confirmar=true` devolve só a prévia.",
            "DELETE",
            "/api/kits/pessoas",
            vec![
                param("nome", "query", "texto", true, "Nome exato como está na lista."),
                param("confirmar", "query", "booleano", false, "true remove; ausente só mostra a prévia."),
            ],
        ),
        Acao::leitura(
            "listar_composicao_kits",
            M,
            "Lista as relações kit → componente (manuais e vindas do ERP): kit, componente, quantidade, fator de proporção, origem e estoque do componente. Use para ver do que cada kit é montado; para achar componentes novos use `buscar_candidatos_componente_kit`.",
            "/api/kits/composicao",
            vec![],
        ),
        Acao::leitura(
            "buscar_candidatos_componente_kit",
            M,
            "Busca produtos e itens que podem ser componentes de um kit pelo código ou parte da descrição (codigo, descricao e fonte). Sem `q` devolve lista vazia. Use antes de cadastrar uma relação de kit.",
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
    Query(m): Query<Motivo>,
) -> impl IntoResponse {
    if let Err(r) = exigir_montagem(&ctx) {
        return r;
    }
    // Exclusão direta (sem prévia): o motivo é sempre obrigatório.
    let motivo = match exigir_motivo(true, m.motivo.as_deref(), "a relação de kit") {
        Ok(m) => m,
        Err(e) => return e.into_response(),
    };
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
                Some(json!({ "motivo": motivo, "copia": antes })),
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
    Query(m): Query<Motivo>,
) -> impl IntoResponse {
    excluir_ordem(state, ctx, id, q.confirmar, m.motivo, "kit_assembly_orders", "excluir_ordem_kit", "Ordem de montagem", "Ordem de montagem excluída").await
}

/// Exclui uma ordem (kit ou reembalagem) em 2 passos: sem `confirmar` só devolve a ordem que sairia.
async fn excluir_ordem(
    state: Arc<AppState>,
    ctx: AuthContext,
    id: i64,
    confirmar: bool,
    motivo: Option<String>,
    tabela: &'static str,
    acao: &'static str,
    rotulo: &'static str,
    mensagem: &'static str,
) -> axum::response::Response {
    if let Err(r) = exigir_montagem(&ctx) {
        return r;
    }
    let motivo = match exigir_motivo(confirmar, motivo.as_deref(), "a ordem") {
        Ok(m) => m,
        Err(e) => return e.into_response(),
    };
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
                Some(json!({ "motivo": motivo, "copia": r.resultado })),
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
                vc.quantidade, vc.baixa_origem_na_venda
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
                    baixa_origem_na_venda: row.try_get::<bool, _>(5).unwrap_or(false),
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
        "INSERT INTO vira_composicao (de_produto_codigo, para_produto_codigo, quantidade, baixa_origem_na_venda)
         VALUES ($1, $2, $3, COALESCE($4, FALSE))
         ON CONFLICT(de_produto_codigo, para_produto_codigo) DO UPDATE SET
             quantidade = EXCLUDED.quantidade,
             baixa_origem_na_venda = COALESCE($4, vira_composicao.baixa_origem_na_venda)",
    )
    .bind(&payload.de_produto_codigo)
    .bind(&payload.para_produto_codigo)
    .bind(payload.quantidade)
    .bind(payload.baixa_origem_na_venda)
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
                &format!("Fórmula de conversão {} -> {}", payload.de_produto_codigo, payload.para_produto_codigo),
                antes,
                Some(json!({
                    "de_produto_codigo": payload.de_produto_codigo,
                    "para_produto_codigo": payload.para_produto_codigo,
                    "quantidade": payload.quantidade,
                    "baixa_origem_na_venda": payload.baixa_origem_na_venda,
                })),
            )
            .await;
            (
                StatusCode::CREATED,
                Json(json!({ "message": "Fórmula de conversão adicionada" })),
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
    Query(m): Query<Motivo>,
) -> impl IntoResponse {
    if let Err(r) = exigir_montagem(&ctx) {
        return r;
    }
    // Exclusão direta (sem prévia): o motivo é sempre obrigatório.
    let motivo = match exigir_motivo(true, m.motivo.as_deref(), "a fórmula de conversão") {
        Ok(m) => m,
        Err(e) => return e.into_response(),
    };
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
                &format!("Fórmula de conversão {de} -> {para} excluída"),
                Some(json!({ "motivo": motivo, "copia": antes })),
                None,
            )
            .await;
            (
                StatusCode::OK,
                Json(json!({ "message": "Fórmula de conversão excluída" })),
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
                Json(json!({ "error": format!("Erro ao criar ordem de conversão: {}", e) })),
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
            "Ordem de conversão {} criada: {} x {} -> {}",
            numero, payload.quantity, payload.de_produto_codigo, payload.para_produto_codigo
        ),
        None,
        instantaneo_ordem(pool, "vira_ordens", last_id).await,
    )
    .await;

    (
        StatusCode::CREATED,
        Json(json!({ "id": last_id, "orderNumber": numero, "message": "Ordem de conversão criada" })),
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
                &format!("Ordem de conversão {id} atualizada"),
                antes,
                instantaneo_ordem(pool, "vira_ordens", id).await,
            )
            .await;
            (
                StatusCode::OK,
                Json(json!({ "message": "Ordem de conversão atualizada" })),
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
    Query(m): Query<Motivo>,
) -> impl IntoResponse {
    excluir_ordem(state, ctx, id, q.confirmar, m.motivo, "vira_ordens", "excluir_ordem_vira", "Ordem de conversão", "Ordem de conversão excluída").await
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

/// Fórmula de matéria-prima do produto (ingredientes que não são embalagem), em proporção do total.
async fn fetch_product_mp_formula(pool: &PgPool, product_code: &str) -> Result<Vec<(String, f64)>, String> {
    let rows = sqlx::query(
        "SELECT ingredient_code, quantity
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
            if is_packaging_ingredient(&code) {
                return None;
            }
            let qty: f64 = crate::core::pg_row::pg_f64(&row, 1);
            if qty > 0.0 { Some((code.trim().to_string(), qty)) } else { None }
        })
        .collect())
}

/// Compara duas fórmulas de matéria-prima pela proporção de cada ingrediente (250 g e 100 g da mesma
/// fórmula dão "igual"). `indisponivel` quando um dos produtos não tem fórmula de matéria-prima.
pub fn comparar_formulas_mp(a: &[(String, f64)], b: &[(String, f64)]) -> &'static str {
    let soma = |f: &[(String, f64)]| f.iter().map(|(_, q)| *q).sum::<f64>();
    let (ta, tb) = (soma(a), soma(b));
    if a.is_empty() || b.is_empty() || ta <= 0.0 || tb <= 0.0 {
        return "indisponivel";
    }
    let prop = |f: &[(String, f64)], t: f64| {
        let mut m = std::collections::BTreeMap::<String, f64>::new();
        for (c, q) in f {
            *m.entry(c.clone()).or_insert(0.0) += q / t;
        }
        m
    };
    let (pa, pb) = (prop(a, ta), prop(b, tb));
    if pa.len() != pb.len() {
        return "diferente";
    }
    for (c, va) in &pa {
        match pb.get(c) {
            Some(vb) if (va - vb).abs() <= 0.005 => {}
            _ => return "diferente",
        }
    }
    "igual"
}

#[cfg(test)]
mod testes_formula_mp {
    use super::comparar_formulas_mp;

    fn f(v: &[(&str, f64)]) -> Vec<(String, f64)> {
        v.iter().map(|(c, q)| (c.to_string(), *q)).collect()
    }

    #[test]
    fn mesma_formula_em_tamanhos_diferentes_e_igual() {
        assert_eq!(comparar_formulas_mp(&f(&[("A", 250.0), ("B", 50.0)]), &f(&[("A", 100.0), ("B", 20.0)])), "igual");
    }

    #[test]
    fn ingrediente_diferente_ou_proporcao_diferente_e_diferente() {
        assert_eq!(comparar_formulas_mp(&f(&[("A", 100.0), ("B", 20.0)]), &f(&[("A", 100.0), ("C", 20.0)])), "diferente");
        assert_eq!(comparar_formulas_mp(&f(&[("A", 100.0), ("B", 20.0)]), &f(&[("A", 100.0), ("B", 40.0)])), "diferente");
    }

    #[test]
    fn sem_formula_e_indisponivel() {
        assert_eq!(comparar_formulas_mp(&[], &f(&[("A", 1.0)])), "indisponivel");
    }
}

// ---- Lista de pessoas (quem monta / quem confere) ----
const CHAVE_PESSOAS_KITS: &str = "kits_pessoas";

/// Nome como será guardado: sem espaços sobrando, no máximo 60 caracteres.
pub fn normalizar_nome_pessoa(bruto: &str) -> String {
    bruto.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(60).collect()
}

/// Acrescenta `nome` (sem repetir, ignorando maiúsculas) e mantém a lista em ordem alfabética.
pub fn incluir_pessoa(lista: &mut Vec<String>, nome: &str) -> bool {
    let n = normalizar_nome_pessoa(nome);
    if n.is_empty() || lista.iter().any(|x| x.to_lowercase() == n.to_lowercase()) {
        return false;
    }
    lista.push(n);
    lista.sort_by_key(|x| x.to_lowercase());
    true
}

async fn ler_pessoas_kits(state: &AppState) -> Vec<String> {
    state
        .db
        .get_setting(CHAVE_PESSOAS_KITS)
        .await
        .ok()
        .flatten()
        .and_then(|v| serde_json::from_str::<Vec<String>>(&v).ok())
        .unwrap_or_default()
}

async fn gravar_pessoas_kits(state: &AppState, lista: &[String]) -> Result<(), String> {
    state
        .db
        .save_setting(CHAVE_PESSOAS_KITS, &serde_json::to_string(lista).unwrap_or_else(|_| "[]".into()))
        .await
}

#[derive(Deserialize)]
pub struct NovaPessoaKits {
    pub nome: String,
}

#[derive(Deserialize)]
pub struct RemoverPessoaKits {
    pub nome: String,
    #[serde(default)]
    pub confirmar: bool,
    #[serde(default)]
    pub motivo: Option<String>,
}

// GET /api/kits/pessoas
pub async fn list_pessoas_kits(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    Json(ler_pessoas_kits(&state).await)
}

// POST /api/kits/pessoas { nome }
pub async fn add_pessoa_kits(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<NovaPessoaKits>,
) -> impl IntoResponse {
    if let Err(r) = exigir_montagem(&ctx) {
        return r;
    }
    if normalizar_nome_pessoa(&body.nome).is_empty() {
        return ErroApi::invalido("Informe o nome da pessoa.").into_response();
    }
    let antes = ler_pessoas_kits(&state).await;
    let mut lista = antes.clone();
    if !c.confirmar {
        incluir_pessoa(&mut lista, &body.nome);
        return Json(json!({ "previa": true, "acao": "adicionar_pessoa_kits", "resultado": { "ficam": lista } })).into_response();
    }
    if incluir_pessoa(&mut lista, &body.nome) {
        if let Err(e) = gravar_pessoas_kits(&state, &lista).await {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response();
        }
        audit::record_domain(
            state.db.pool(),
            Some(&ctx),
            MODULO_KITS,
            "adicionar_pessoa_kits",
            "settings",
            CHAVE_PESSOAS_KITS,
            &format!("Pessoa adicionada à lista de kits: {}", normalizar_nome_pessoa(&body.nome)),
            Some(json!(antes)),
            Some(json!(lista)),
        )
        .await;
    }
    (StatusCode::OK, Json(lista)).into_response()
}

// DELETE /api/kits/pessoas?nome=&confirmar=
pub async fn remove_pessoa_kits(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(q): Query<RemoverPessoaKits>,
) -> impl IntoResponse {
    if let Err(r) = exigir_montagem(&ctx) {
        return r;
    }
    let antes = ler_pessoas_kits(&state).await;
    let alvo = normalizar_nome_pessoa(&q.nome).to_lowercase();
    if !antes.iter().any(|x| x.to_lowercase() == alvo) {
        return (StatusCode::NOT_FOUND, Json(json!({ "error": "Esse nome não está na lista." }))).into_response();
    }
    let lista: Vec<String> = antes.iter().filter(|x| x.to_lowercase() != alvo).cloned().collect();
    if !q.confirmar {
        return Json(json!({
            "previa": true,
            "acao": "remover_pessoa_kits",
            "resultado": { "remove": q.nome, "ficam": lista },
        }))
        .into_response();
    }
    let motivo = match exigir_motivo(true, q.motivo.as_deref(), "o nome da lista") {
        Ok(m) => m,
        Err(e) => return e.into_response(),
    };
    if let Err(e) = gravar_pessoas_kits(&state, &lista).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response();
    }
    audit::record_domain(
        state.db.pool(),
        Some(&ctx),
        MODULO_KITS,
        "remover_pessoa_kits",
        "settings",
        CHAVE_PESSOAS_KITS,
        &format!("Pessoa removida da lista de kits: {}", q.nome),
        Some(json!({ "motivo": motivo, "copia": antes })),
        Some(json!(lista)),
    )
    .await;
    (StatusCode::OK, Json(lista)).into_response()
}

#[cfg(test)]
mod testes_pessoas_kits {
    use super::{incluir_pessoa, normalizar_nome_pessoa};

    #[test]
    fn nome_perde_espacos_sobrando() {
        assert_eq!(normalizar_nome_pessoa("  Maria   da  Silva "), "Maria da Silva");
    }

    #[test]
    fn inclui_sem_repetir_e_em_ordem() {
        let mut l: Vec<String> = vec!["Zeca".into()];
        assert!(incluir_pessoa(&mut l, "ana"));
        assert!(!incluir_pessoa(&mut l, "ZECA"));
        assert!(!incluir_pessoa(&mut l, "   "));
        assert_eq!(l, vec!["ana".to_string(), "Zeca".to_string()]);
    }
}

// ---- Variações com a mesma formulação (conversão) ----

/// Conteúdo por unidade, em kg: soma das quantidades de matéria-prima (9.15.*) da formulação.
pub fn conteudo_kg_por_unidade(mp: &[(String, f64)]) -> f64 {
    mp.iter().map(|(_, q)| *q).sum()
}

/// Produtos de `todas` com a mesma formulação de matéria-prima da origem, com conteúdo e fator
/// (conteúdo da origem ÷ conteúdo do destino). Fora a própria origem e fórmulas sem matéria-prima.
pub fn variacoes_mesma_formulacao(
    origem: &str,
    todas: &std::collections::BTreeMap<String, Vec<(String, f64)>>,
) -> Vec<(String, f64, f64)> {
    let Some(f_origem) = todas.get(origem) else { return vec![] };
    let c_origem = conteudo_kg_por_unidade(f_origem);
    if c_origem <= 0.0 {
        return vec![];
    }
    todas
        .iter()
        .filter(|(cod, f)| cod.as_str() != origem && comparar_formulas_mp(f_origem, f) == "igual")
        .filter_map(|(cod, f)| {
            let c = conteudo_kg_por_unidade(f);
            if c > 0.0 { Some((cod.clone(), c, c_origem / c)) } else { None }
        })
        .collect()
}

#[derive(Deserialize)]
pub struct VariacoesQuery {
    pub de: String,
}

// GET /api/turnovers/variacoes?de=
pub async fn listar_variacoes_conversao(
    State(state): State<Arc<AppState>>,
    Query(q): Query<VariacoesQuery>,
) -> impl IntoResponse {
    let de = q.de.trim().replace('"', "");
    if de.is_empty() {
        return ErroApi::invalido("Informe o produto de origem.").into_response();
    }
    let pool = state.db.pool();
    let rows = match sqlx::query(
        "SELECT TRIM(REPLACE(product_code, '\"', '')), TRIM(ingredient_code), quantity FROM formulations",
    )
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };
    let mut todas: std::collections::BTreeMap<String, Vec<(String, f64)>> = std::collections::BTreeMap::new();
    for row in rows {
        let produto: String = row.get(0);
        let ingrediente: String = row.get(1);
        let qtd: f64 = crate::core::pg_row::pg_f64(&row, 2);
        if !is_packaging_ingredient(&ingrediente) && qtd > 0.0 {
            todas.entry(produto).or_default().push((ingrediente, qtd));
        }
    }
    let origem_conteudo = todas.get(&de).map(|f| conteudo_kg_por_unidade(f)).unwrap_or(0.0);
    let achadas = variacoes_mesma_formulacao(&de, &todas);

    let mut variacoes = Vec::new();
    for (codigo, conteudo, fator) in achadas {
        let linha = sqlx::query(
            "SELECT p.descricao, COALESCE(e.estoque, 0)
             FROM produtos p LEFT JOIN estoque_atual e ON e.codigo = p.codigo
             WHERE TRIM(REPLACE(p.codigo, '\"', '')) = $1 LIMIT 1",
        )
        .bind(&codigo)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();
        let Some(linha) = linha else { continue };
        let descricao: String = linha.get(0);
        variacoes.push(json!({
            "codigo": codigo,
            "descricao": descricao,
            "conteudoKg": conteudo,
            "fator": fator,
            "estoque": crate::core::pg_row::pg_f64(&linha, 1),
        }));
    }
    variacoes.sort_by(|a, b| {
        a["conteudoKg"].as_f64().partial_cmp(&b["conteudoKg"].as_f64()).unwrap_or(std::cmp::Ordering::Equal)
    });
    Json(json!({
        "origem": { "codigo": de, "conteudoKg": origem_conteudo },
        "variacoes": variacoes,
    }))
    .into_response()
}

#[cfg(test)]
mod testes_variacoes_conversao {
    use super::variacoes_mesma_formulacao;
    use std::collections::BTreeMap;

    fn f(v: &[(&str, f64)]) -> Vec<(String, f64)> {
        v.iter().map(|(c, q)| (c.to_string(), *q)).collect()
    }

    #[test]
    fn acha_so_as_de_mesma_formulacao_e_calcula_o_fator() {
        let mut t = BTreeMap::new();
        t.insert("250".to_string(), f(&[("9.15.1", 0.1875), ("9.15.2", 0.0625)])); // 250 g
        t.insert("100".to_string(), f(&[("9.15.1", 0.075), ("9.15.2", 0.025)])); // 100 g, mesma proporção
        t.insert("500".to_string(), f(&[("9.15.1", 0.375), ("9.15.2", 0.125)])); // 500 g, mesma proporção
        t.insert("outra".to_string(), f(&[("9.15.1", 0.1), ("9.15.3", 0.1)])); // outra formulação
        let mut v = variacoes_mesma_formulacao("250", &t);
        v.sort_by(|a, b| a.0.cmp(&b.0));
        assert_eq!(v.len(), 2);
        assert_eq!(v[0].0, "100");
        assert!((v[0].2 - 2.5).abs() < 1e-9); // 1 de 250 g dá 2,5 de 100 g
        assert_eq!(v[1].0, "500");
        assert!((v[1].2 - 0.5).abs() < 1e-9); // 100 un de 250 g -> 50 un de 500 g
    }

    #[test]
    fn origem_sem_formulacao_nao_tem_variacoes() {
        let t: BTreeMap<String, Vec<(String, f64)>> = BTreeMap::new();
        assert!(variacoes_mesma_formulacao("x", &t).is_empty());
    }
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

    let formula = match (
        fetch_product_mp_formula(pool, &de).await,
        fetch_product_mp_formula(pool, &para).await,
    ) {
        (Ok(a), Ok(b)) => comparar_formulas_mp(&a, &b),
        _ => "indisponivel",
    };

    // Embalagens da última ordem do mesmo par (o que o operador confirmou da vez anterior).
    let ultima = sqlx::query(
        "SELECT order_number, packaging_deductions FROM vira_ordens
         WHERE TRIM(REPLACE(de_produto_codigo, '\"', '')) = TRIM(REPLACE($1, '\"', ''))
           AND TRIM(REPLACE(para_produto_codigo, '\"', '')) = TRIM(REPLACE($2, '\"', ''))
           AND COALESCE(packaging_deductions, '') <> ''
         ORDER BY id DESC LIMIT 1",
    )
    .bind(&de)
    .bind(&para)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .map(|r| json!({ "orderNumber": r.get::<String, _>(0), "packagingDeductions": r.get::<String, _>(1) }));

    Json(json!({
        "fator": fator,
        "qtyDe": qty_de,
        "qtyPara": qty_para,
        "returns": returns,
        "consumes": consumes,
        "formula": formula,
        "ultimaOrdem": ultima,
    }))
    .into_response()
}

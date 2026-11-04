use axum::{
    extract::{Path, Query, State},
    response::{IntoResponse, Response},
    Extension, Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::core::acao::{exigir_motivo, executar_em_2_passos, Confirmar, ErroApi, Motivo, RespostaAcao};
use crate::core::regras_produto::{produto_ativo, status_ignorados_padrao};
use crate::handlers::AppState;
use crate::modules::geral::audit;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::MODULE_ADMIN_LINHA_PRODUTOS;

const MODULO_AUDITORIA: &str = "admin_linha_produtos";
/// Quantos kits uma atribuição em lote aceita.
const MAX_KITS_POR_ATRIBUICAO: usize = 500;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinhaKit {
    pub id: String,
    pub nome: String,
    pub prefixos: Vec<String>,
    pub ordem: i32,
    pub kits: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalvarLinha {
    pub id: Option<String>,
    pub nome: String,
    #[serde(default)]
    pub prefixos: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Atribuir {
    pub codigos: Vec<String>,
    pub linha_id: Option<String>,
}

fn pode_ler(ctx: &AuthContext) -> Result<(), ErroApi> {
    if ctx.role.is_supervisor() || ctx.has_module(MODULE_ADMIN_LINHA_PRODUTOS) {
        Ok(())
    } else {
        Err(ErroApi::sem_permissao("Sem permissão para Linha de Produtos."))
    }
}

fn pode_editar(ctx: &AuthContext) -> Result<(), ErroApi> {
    if ctx.role.is_supervisor() || ctx.can_edit_module(MODULE_ADMIN_LINHA_PRODUTOS) {
        Ok(())
    } else {
        Err(ErroApi::sem_permissao("Sem permissão para editar Linha de Produtos."))
    }
}

/// Primeiro segmento do código do kit ("2.12.047" → "2").
fn prefixo_do_codigo(codigo: &str) -> &str {
    codigo.split('.').next().unwrap_or("").trim()
}

/// Linha sugerida pelo prefixo do código: a primeira linha (por ordem) que lista esse prefixo.
pub fn sugerir_linha(codigo: &str, linhas: &[LinhaKit]) -> Option<String> {
    let prefixo = prefixo_do_codigo(codigo);
    if prefixo.is_empty() {
        return None;
    }
    linhas.iter().find(|l| l.prefixos.iter().any(|p| p == prefixo)).map(|l| l.id.clone())
}

/// Id da linha a partir do nome: minúsculas, sem acento, `_` entre palavras.
fn slug(nome: &str) -> String {
    let mut s = String::new();
    for c in nome.to_lowercase().chars() {
        let c = match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            c => c,
        };
        if c.is_ascii_alphanumeric() {
            s.push(c);
        } else if !s.ends_with('_') && !s.is_empty() {
            s.push('_');
        }
    }
    s.trim_end_matches('_').to_string()
}

async fn carregar_linhas(pool: &PgPool) -> Result<Vec<LinhaKit>, ErroApi> {
    let rows = sqlx::query("SELECT id, nome, prefixos, ordem FROM linhas_kits ORDER BY ordem, nome")
        .fetch_all(pool)
        .await?;
    Ok(rows
        .into_iter()
        .map(|r| LinhaKit {
            id: r.get(0),
            nome: r.get(1),
            prefixos: r.get(2),
            ordem: r.get(3),
            kits: 0,
        })
        .collect())
}

/// Serviço: linhas de kits e kits ativos com a linha sugerida, a manual e a final. Reutilizável por agentes.
pub async fn listar_linhas_kits(pool: &PgPool) -> Result<Value, ErroApi> {
    let mut linhas = carregar_linhas(pool).await?;
    let ignorados = crate::modules::compras::planejamento::commands::get_ignored_product_statuses_query(pool.clone())
        .await
        .unwrap_or_else(|_| status_ignorados_padrao());

    // Kit = tem composição no ERP, está marcado como kit, já tem linha ligada ou a descrição começa com KIT.
    let rows = sqlx::query(
        r#"
        SELECT p.codigo, p.descricao,
               COALESCE(NULLIF(TRIM(o.status_produto), ''), 'ativo') AS status,
               o.visivel,
               (SELECT COUNT(*) FROM kit_composicao kc WHERE kc.kit_codigo = p.codigo) AS composicao,
               kl.linha_kit_id
        FROM produtos p
        LEFT JOIN overrides_produtos o ON o.codigo = p.codigo
        LEFT JOIN kits_linha kl ON kl.kit_codigo = p.codigo
        WHERE p.codigo IN (SELECT kit_codigo FROM kit_composicao)
           OR kl.kit_codigo IS NOT NULL
           OR p.descricao ~* '^(mini +)?kit( |$)'
           OR o.categoria_produto = 'kit'
           OR o.categoria_produto IN (SELECT id FROM categories WHERE LOWER(name) IN ('kit', 'kits'))
        ORDER BY p.codigo
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut kits: Vec<Value> = Vec::new();
    for row in rows {
        let status: String = row.get(2);
        if !produto_ativo(&status, row.get::<Option<i32>, _>(3), &ignorados) {
            continue;
        }
        let codigo: String = row.get(0);
        let manual: Option<String> = row.get(5);
        let sugerida = sugerir_linha(&codigo, &linhas);
        let efetiva = manual.clone().or_else(|| sugerida.clone());
        if let Some(id) = &efetiva {
            if let Some(l) = linhas.iter_mut().find(|l| &l.id == id) {
                l.kits += 1;
            }
        }
        kits.push(json!({
            "codigo": codigo,
            "descricao": row.get::<String, _>(1),
            "composicao": row.get::<i64, _>(4),
            "linhaSugerida": sugerida,
            "linhaManual": manual,
            "linha": efetiva,
        }));
    }
    Ok(json!({ "linhas": linhas, "kits": kits }))
}

fn normalizar_prefixos(brutos: &[String]) -> Result<Vec<String>, ErroApi> {
    let mut out: Vec<String> = Vec::new();
    for p in brutos {
        let p = p.trim();
        if p.is_empty() {
            continue;
        }
        if !p.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err(ErroApi::invalido(format!("Prefixo inválido: \"{p}\". Use só o primeiro segmento do código (ex.: 1, 2, 10).")));
        }
        if !out.iter().any(|x| x == p) {
            out.push(p.to_string());
        }
    }
    Ok(out)
}

/// Serviço: cria ou altera uma linha de kits (2 passos). Reutilizável por agentes.
pub async fn salvar_linha(
    pool: &PgPool,
    ctx: &AuthContext,
    corpo: SalvarLinha,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    pode_editar(ctx)?;
    let nome = corpo.nome.trim().to_string();
    if nome.is_empty() || nome.chars().count() > 60 {
        return Err(ErroApi::invalido("Informe o nome da linha (até 60 caracteres)."));
    }
    let prefixos = normalizar_prefixos(&corpo.prefixos)?;
    let id_pedido = corpo.id.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(String::from);

    let nome_tx = nome.clone();
    let prefixos_tx = prefixos.clone();
    let resposta = executar_em_2_passos(pool, "salvar_linha_kit", confirmar, move |tx| {
        Box::pin(async move {
            let antes: Option<Value> = match &id_pedido {
                Some(id) => {
                    let r = sqlx::query("SELECT nome, prefixos FROM linhas_kits WHERE id = $1 FOR UPDATE")
                        .bind(id)
                        .fetch_optional(&mut **tx)
                        .await?
                        .ok_or_else(|| ErroApi::nao_encontrado(format!("Linha de kits {id} não existe.")))?;
                    Some(json!({ "nome": r.get::<String, _>(0), "prefixos": r.get::<Vec<String>, _>(1) }))
                }
                None => None,
            };

            let id_atual = id_pedido.clone().unwrap_or_default();
            let conflito = sqlx::query("SELECT nome FROM linhas_kits WHERE prefixos && $1::text[] AND id <> $2 LIMIT 1")
                .bind(&prefixos_tx)
                .bind(&id_atual)
                .fetch_optional(&mut **tx)
                .await?;
            if let Some(c) = conflito {
                return Err(ErroApi::conflito(format!(
                    "Algum desses prefixos já pertence à linha \"{}\". Um prefixo só pode estar em uma linha.",
                    c.get::<String, _>(0)
                )));
            }

            let id = match &id_pedido {
                Some(id) => {
                    sqlx::query("UPDATE linhas_kits SET nome = $2, prefixos = $3 WHERE id = $1")
                        .bind(id)
                        .bind(&nome_tx)
                        .bind(&prefixos_tx)
                        .execute(&mut **tx)
                        .await?;
                    id.clone()
                }
                None => {
                    let base = {
                        let s = slug(&nome_tx);
                        if s.is_empty() { "linha".to_string() } else { s }
                    };
                    let mut id = base.clone();
                    let mut n = 2;
                    while sqlx::query("SELECT 1 FROM linhas_kits WHERE id = $1").bind(&id).fetch_optional(&mut **tx).await?.is_some() {
                        id = format!("{base}_{n}");
                        n += 1;
                    }
                    sqlx::query(
                        "INSERT INTO linhas_kits (id, nome, prefixos, ordem)
                         VALUES ($1, $2, $3, COALESCE((SELECT MAX(ordem) FROM linhas_kits), 0) + 1)",
                    )
                    .bind(&id)
                    .bind(&nome_tx)
                    .bind(&prefixos_tx)
                    .execute(&mut **tx)
                    .await?;
                    id
                }
            };
            Ok(json!({
                "acao": if antes.is_some() { "alterar" } else { "criar" },
                "id": id,
                "antes": antes,
                "depois": { "nome": nome_tx, "prefixos": prefixos_tx },
            }))
        })
    })
    .await?;

    if confirmar {
        audit::record_domain(
            pool,
            Some(ctx),
            MODULO_AUDITORIA,
            "salvar_linha_kit",
            "linha_kit",
            resposta.resultado["id"].as_str().unwrap_or(""),
            &format!("Linha de kits \"{nome}\" salva"),
            Some(resposta.resultado.clone()),
            None,
        )
        .await;
    }
    Ok(resposta)
}

/// Serviço: liga kits a uma linha (ou volta ao automático com `linha_id` vazio). 2 passos.
pub async fn atribuir_linha(
    pool: &PgPool,
    ctx: &AuthContext,
    corpo: Atribuir,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    pode_editar(ctx)?;
    let mut codigos: Vec<String> = Vec::new();
    for c in &corpo.codigos {
        let c = c.trim();
        if !c.is_empty() && !codigos.iter().any(|x| x == c) {
            codigos.push(c.to_string());
        }
    }
    if codigos.is_empty() {
        return Err(ErroApi::invalido("Informe ao menos um kit."));
    }
    if codigos.len() > MAX_KITS_POR_ATRIBUICAO {
        return Err(ErroApi::invalido(format!("No máximo {MAX_KITS_POR_ATRIBUICAO} kits por vez.")));
    }
    let linha_id = corpo.linha_id.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(String::from);

    let codigos_tx = codigos.clone();
    let linha_tx = linha_id.clone();
    let resposta = executar_em_2_passos(pool, "atribuir_linha_kit", confirmar, move |tx| {
        Box::pin(async move {
            if let Some(id) = &linha_tx {
                if sqlx::query("SELECT 1 FROM linhas_kits WHERE id = $1").bind(id).fetch_optional(&mut **tx).await?.is_none() {
                    return Err(ErroApi::nao_encontrado(format!("Linha de kits {id} não existe.")));
                }
            }
            let mut itens: Vec<Value> = Vec::new();
            let mut mudam = 0;
            for codigo in &codigos_tx {
                let desc = sqlx::query("SELECT descricao FROM produtos WHERE codigo = $1")
                    .bind(codigo)
                    .fetch_optional(&mut **tx)
                    .await?
                    .ok_or_else(|| ErroApi::nao_encontrado(format!("Produto {codigo} não existe.")))?
                    .get::<String, _>(0);
                let de: Option<String> = sqlx::query("SELECT linha_kit_id FROM kits_linha WHERE kit_codigo = $1")
                    .bind(codigo)
                    .fetch_optional(&mut **tx)
                    .await?
                    .map(|r| r.get(0));
                match &linha_tx {
                    Some(id) => {
                        sqlx::query(
                            "INSERT INTO kits_linha (kit_codigo, linha_kit_id) VALUES ($1, $2)
                             ON CONFLICT (kit_codigo) DO UPDATE SET linha_kit_id = EXCLUDED.linha_kit_id, updated_at = CURRENT_TIMESTAMP::TEXT",
                        )
                        .bind(codigo)
                        .bind(id)
                        .execute(&mut **tx)
                        .await?;
                    }
                    None => {
                        sqlx::query("DELETE FROM kits_linha WHERE kit_codigo = $1").bind(codigo).execute(&mut **tx).await?;
                    }
                }
                let muda = de != linha_tx;
                if muda {
                    mudam += 1;
                }
                itens.push(json!({ "codigo": codigo, "descricao": desc, "de": de, "para": linha_tx, "muda": muda }));
            }
            Ok(json!({ "total": itens.len(), "totalComMudanca": mudam, "itens": itens }))
        })
    })
    .await?;

    if confirmar {
        audit::record_domain(
            pool,
            Some(ctx),
            MODULO_AUDITORIA,
            "atribuir_linha_kit",
            "kit_linha",
            codigos.first().map(String::as_str).unwrap_or(""),
            &format!("{} kit(s) ligados à linha {}", codigos.len(), linha_id.as_deref().unwrap_or("(automática)")),
            Some(resposta.resultado.clone()),
            None,
        )
        .await;
    }
    Ok(resposta)
}

/// Serviço: exclui a linha; as ligações manuais dela somem (cascata) e os kits voltam à sugestão. 2 passos.
pub async fn excluir_linha(
    pool: &PgPool,
    ctx: &AuthContext,
    id: &str,
    motivo: Option<&str>,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    pode_editar(ctx)?;
    let motivo = exigir_motivo(confirmar, motivo, "a linha de kits")?;
    let id_tx = id.to_string();
    let resposta = executar_em_2_passos(pool, "excluir_linha_kit", confirmar, move |tx| {
        Box::pin(async move {
            let r = sqlx::query("SELECT nome, prefixos FROM linhas_kits WHERE id = $1 FOR UPDATE")
                .bind(&id_tx)
                .fetch_optional(&mut **tx)
                .await?
                .ok_or_else(|| ErroApi::nao_encontrado(format!("Linha de kits {id_tx} não existe.")))?;
            let ligacoes: i64 = sqlx::query("SELECT COUNT(*) FROM kits_linha WHERE linha_kit_id = $1")
                .bind(&id_tx)
                .fetch_one(&mut **tx)
                .await?
                .get(0);
            sqlx::query("DELETE FROM linhas_kits WHERE id = $1").bind(&id_tx).execute(&mut **tx).await?;
            Ok(json!({
                "linha": id_tx,
                "nome": r.get::<String, _>(0),
                "prefixos": r.get::<Vec<String>, _>(1),
                "ligacoesManuaisRemovidas": ligacoes,
            }))
        })
    })
    .await?;
    if confirmar {
        audit::record_domain(
            pool,
            Some(ctx),
            MODULO_AUDITORIA,
            "excluir_linha_kit",
            "linha_kit",
            id,
            &format!("Linha de kits {id} excluída"),
            Some(json!({ "motivo": motivo, "linha": resposta.resultado })),
            None,
        )
        .await;
    }
    Ok(resposta)
}

pub async fn listar(State(state): State<Arc<AppState>>, Extension(ctx): Extension<AuthContext>) -> Response {
    if let Err(e) = pode_ler(&ctx) {
        return e.into_response();
    }
    match listar_linhas_kits(state.db.pool()).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

pub async fn salvar(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(corpo): Json<SalvarLinha>,
) -> Response {
    match salvar_linha(state.db.pool(), &ctx, corpo, c.confirmar).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

pub async fn atribuir(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(corpo): Json<Atribuir>,
) -> Response {
    match atribuir_linha(state.db.pool(), &ctx, corpo, c.confirmar).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

pub async fn excluir(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Query(m): Query<Motivo>,
    Path(id): Path<String>,
) -> Response {
    match excluir_linha(state.db.pool(), &ctx, &id, m.motivo.as_deref(), c.confirmar).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn linha(id: &str, prefixos: &[&str]) -> LinhaKit {
        LinhaKit { id: id.into(), nome: id.into(), prefixos: prefixos.iter().map(|s| s.to_string()).collect(), ordem: 0, kits: 0 }
    }

    #[test]
    fn sugere_a_linha_pelo_primeiro_segmento_do_codigo() {
        let linhas = vec![linha("natum", &["1"]), linha("hair", &["2"]), linha("liss", &["10"])];
        assert_eq!(sugerir_linha("2.12.047", &linhas).as_deref(), Some("hair"));
        assert_eq!(sugerir_linha("10.13.006", &linhas).as_deref(), Some("liss"));
        assert_eq!(sugerir_linha("1.13.068", &linhas).as_deref(), Some("natum"));
        assert_eq!(sugerir_linha("99.1.1", &linhas), None, "prefixo sem linha");
        assert_eq!(sugerir_linha("", &linhas), None);
    }

    #[test]
    fn id_da_linha_sai_do_nome_sem_acento() {
        assert_eq!(slug("Kits Salão & Cia"), "kits_salao_cia");
        assert_eq!(slug("  Kits Natum  "), "kits_natum");
        assert_eq!(slug("!!!"), "");
    }

    #[test]
    fn prefixos_repetidos_somem_e_invalidos_sao_recusados() {
        assert_eq!(normalizar_prefixos(&["1".into(), " 1 ".into(), "".into(), "10".into()]).unwrap(), vec!["1", "10"]);
        assert!(normalizar_prefixos(&["1.2".into()]).is_err());
    }
}

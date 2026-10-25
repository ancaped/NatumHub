use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Extension, Json,
};
use std::collections::HashMap;
use std::sync::Arc;
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::core::acao::{executar_em_2_passos, Confirmar, ErroApi};
use crate::core::catalogo::{param, Acao};
use crate::handlers::AppState;
use crate::models::{BulkOverrideRequest, LineConfig, ProductOverride};
use crate::modules::geral::audit;
use crate::modules::geral::auth::models::AuthContext;

const MODULO_AUDITORIA: &str = "admin_linha_produtos";

/// Status de produto aceitos (mesma lista de `PRODUCT_LINE_STATUSES` em `Frontend/src/modules/geral/lib/types.ts`).
pub const STATUS_PRODUTO_VALIDOS: [&str; 5] = ["ativo", "lancamento", "saindo_de_linha", "descontinuado", "terceirizado"];

/// Ações de Linha de Produtos descritas para agentes (ver `core::catalogo`).
pub fn acoes_linha_produtos() -> Vec<Acao> {
    const M: &str = "producao";
    vec![
        Acao::leitura(
            "listar_linhas_produto",
            M,
            "Lista a definição das linhas de produto (multiplicadores de estoque e fator de segurança).",
            "/api/configs",
            vec![],
        ),
        Acao::leitura(
            "listar_overrides_produto",
            M,
            "Lista os ajustes manuais por produto (status, linha, estoque ideal, regras PCP etc.).",
            "/api/overrides",
            vec![],
        ),
        Acao::leitura(
            "candidatos_graduacao_lancamento",
            M,
            "Produtos em lançamento que já têm meses de venda suficientes para graduar.",
            "/api/lancamento/graduation-check",
            vec![],
        ),
        Acao::gravacao(
            "alterar_overrides_em_lote",
            M,
            "Aplica uma ação do painel de Linha de Produtos a vários produtos (ocultar, status, linha, categoria, lançamento, observação, limpar). Sem `confirmar=true` devolve só a prévia (valor atual e novo por produto).",
            "POST",
            "/api/overrides/bulk",
            true,
            vec![
                param("confirmar", "query", "booleano", false, "true grava; ausente só mostra a prévia."),
                param("codigos", "corpo", "lista de texto", true, "Códigos dos produtos."),
                param("action", "corpo", "texto", true, "hide, show, set_launch_auto, set_launch_yes, set_launch_no, sair_producao_fixa, set_obs, set_line, set_status, set_category ou clear."),
                param("value_str", "corpo", "texto", false, "Valor da ação (status, linha, categoria ou observação)."),
            ],
        ),
        Acao::gravacao(
            "excluir_linha_produto",
            M,
            "Exclui uma linha de produto: produtos e overrides dela voltam para DEFAULT. Sem `confirmar=true` devolve só a prévia (quantos seriam remapeados).",
            "DELETE",
            "/api/configs/:prefix",
            true,
            vec![
                param("prefix", "caminho", "texto", true, "Prefixo da linha (DEFAULT não pode ser excluída)."),
                param("confirmar", "query", "booleano", false, "true grava; ausente só mostra a prévia."),
            ],
        ),
    ]
}


// 1. GET /api/configs
pub async fn get_configs(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_line_configs().await {
        Ok(configs) => (StatusCode::OK, Json(configs)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar configurações: {}", e) })),
        ).into_response(),
    }
}

// 2. PUT /api/configs
pub async fn update_config(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(mut config): Json<LineConfig>,
) -> Response {
    if let Err(e) = validar_config(&mut config) {
        return e.into_response();
    }
    let pool = state.db.pool();
    let antes = state
        .db
        .get_line_configs()
        .await
        .ok()
        .and_then(|v| v.into_iter().find(|c| c.linha_prefix == config.linha_prefix));
    match state.db.update_line_config(&config).await {
        Ok(_) => {
            audit::record_domain(
                pool,
                Some(&ctx),
                MODULO_AUDITORIA,
                "salvar_linha_produto",
                "config_linha",
                &config.linha_prefix,
                &format!("Linha {} salva", config.linha_prefix),
                antes.as_ref().and_then(|c| serde_json::to_value(c).ok()),
                serde_json::to_value(&config).ok(),
            )
            .await;
            (StatusCode::OK, Json(json!({ "status": "success" }))).into_response()
        }
        Err(e) => ErroApi::interno(format!("Erro ao salvar configuração: {}", e)).into_response(),
    }
}

/// Prefixo e nome preenchidos; multiplicadores e fator de segurança numéricos e maiores que zero.
pub fn validar_config(config: &mut LineConfig) -> Result<(), ErroApi> {
    config.linha_prefix = config.linha_prefix.trim().to_string();
    config.nome_linha = config.nome_linha.trim().to_string();
    if config.linha_prefix.is_empty() {
        return Err(ErroApi::invalido("O prefixo da linha é obrigatório."));
    }
    if config.nome_linha.is_empty() {
        return Err(ErroApi::invalido("O nome da linha é obrigatório."));
    }
    for (nome, valor) in [
        ("estoque_ideal_mult", config.estoque_ideal_mult),
        ("abrir_ordem_mult", config.abrir_ordem_mult),
        ("abrir_prod_mult", config.abrir_prod_mult),
        ("fator_seguranca_z", config.fator_seguranca_z),
    ] {
        if !valor.is_finite() || valor <= 0.0 {
            return Err(ErroApi::regra(format!("{nome} deve ser um número maior que zero.")));
        }
    }
    Ok(())
}

// 2b. DELETE /api/configs/:prefix (2 passos: sem confirmar=true só mostra o que seria remapeado)
pub async fn delete_config(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Path(prefix): Path<String>,
) -> Response {
    match excluir_linha(state.db.pool(), &ctx, &prefix, c.confirmar).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

/// Serviço: exclui a linha (produtos e overrides voltam para DEFAULT). Reutilizável por agentes.
pub async fn excluir_linha(
    pool: &PgPool,
    ctx: &AuthContext,
    prefix: &str,
    confirmar: bool,
) -> Result<crate::core::acao::RespostaAcao<Value>, ErroApi> {
    if prefix == "DEFAULT" {
        return Err(ErroApi::invalido("A linha DEFAULT não pode ser excluída"));
    }
    let antes: Option<LineConfig> = crate::core::db::Db::new(pool.clone())
        .get_line_configs()
        .await
        .map_err(ErroApi::interno)?
        .into_iter()
        .find(|c| c.linha_prefix == prefix);
    let prefixo = prefix.to_string();
    let resposta = executar_em_2_passos(pool, "excluir_linha_produto", confirmar, move |tx| {
        Box::pin(async move {
            let (produtos, overrides) = crate::core::db::Db::excluir_linha_na_tx(tx, &prefixo)
                .await
                .map_err(ErroApi::interno)?;
            Ok(json!({
                "linha": prefixo,
                "produtosParaDefault": produtos,
                "overridesParaDefault": overrides,
            }))
        })
    })
    .await?;
    if confirmar {
        audit::record_domain(
            pool,
            Some(ctx),
            MODULO_AUDITORIA,
            "excluir_linha_produto",
            "config_linha",
            prefix,
            &format!("Linha {prefix} excluída"),
            Some(json!({ "config": antes, "resultado": resposta.resultado })),
            None,
        )
        .await;
    }
    Ok(resposta)
}

// 2c. GET /api/overrides
pub async fn get_overrides(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_all_overrides().await {
        Ok(overrides) => (StatusCode::OK, Json(overrides)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar overrides: {}", e) })),
        ).into_response(),
    }
}

/// Valida e normaliza as regras PCP por produto (vazio vira None).
pub fn validar_regras_pcp(ovr: &mut ProductOverride) -> Result<(), String> {
    if let Some(p) = ovr.processo_termico.as_ref() {
        let p = p.trim().to_lowercase();
        ovr.processo_termico = match p.as_str() {
            "" => None,
            "quente" | "frio" => Some(p),
            _ => return Err("processo_termico deve ser 'quente', 'frio' ou vazio".to_string()),
        };
    }
    if ovr.dias_ate_envase.map(|n| n < 0).unwrap_or(false) {
        return Err("dias_ate_envase não pode ser negativo".to_string());
    }
    if ovr
        .producao_minima_kg
        .map(|n| n < 0.0 || !n.is_finite())
        .unwrap_or(false)
    {
        return Err("producao_minima_kg não pode ser negativa".to_string());
    }
    Ok(())
}

// 3. POST /api/overrides (1 produto: a tela mostra o que salva; grava direto e audita antes/depois)
pub async fn save_override(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(corpo): Json<serde_json::Value>,
) -> Response {
    let mut ovr: ProductOverride = match serde_json::from_value(corpo.clone()) {
        Ok(o) => o,
        Err(e) => return ErroApi::regra(format!("Payload inválido: {}", e)).into_response(),
    };
    if let Some(obj) = corpo.as_object() {
        ovr.campos_enviados = obj.keys().filter(|k| k.as_str() != "codigo").cloned().collect();
    }
    if let Err(e) = validar_regras_pcp(&mut ovr) {
        return ErroApi::regra(e).into_response();
    }
    let antes = state.db.get_override(&ovr.codigo).await.ok().flatten();
    match state.db.save_override(&ovr).await {
        Ok(_) => {
            let depois = state.db.get_override(&ovr.codigo).await.ok().flatten();
            audit::record_domain(
                state.db.pool(),
                Some(&ctx),
                MODULO_AUDITORIA,
                "salvar_override_produto",
                "override_produto",
                &ovr.codigo,
                &format!("Ajustes do produto {} salvos", ovr.codigo),
                antes.as_ref().and_then(|o| serde_json::to_value(o).ok()),
                depois.as_ref().and_then(|o| serde_json::to_value(o).ok()),
            )
            .await;
            (StatusCode::OK, Json(json!({ "status": "success" }))).into_response()
        }
        Err(e) => ErroApi::interno(format!("Erro ao salvar override: {}", e)).into_response(),
    }
}

/// Colunas de `overrides_produtos` que cada ação em lote altera (lista fixa: entra em SQL).
pub fn campos_da_acao(action: &str) -> &'static [&'static str] {
    match action {
        "hide" | "show" => &["visivel"],
        "set_launch_auto" | "set_launch_yes" | "set_launch_no" => &["is_lancamento_manual"],
        "sair_producao_fixa" => &["is_lancamento_manual", "lancamento_gatilho", "lancamento_estoque_maximo"],
        "set_obs" => &["observacao"],
        "set_line" => &["linha_prefix_manual"],
        "set_status" => &["status_produto"],
        "set_category" => &["categoria_produto"],
        "clear" => &[
            "estoque_ideal_manual",
            "pedidos_manual",
            "media_manual",
            "is_lancamento_manual",
            "visivel",
            "observacao",
            "linha_prefix_manual",
            "status_produto",
            "categoria_produto",
        ],
        _ => &[],
    }
}

/// Validação que não depende do banco: ação conhecida, produtos informados e status conhecido.
pub fn validar_bulk(req: &BulkOverrideRequest) -> Result<(), ErroApi> {
    if !crate::core::db::Db::ACOES_BULK.contains(&req.action.as_str()) {
        return Err(ErroApi::invalido(format!("Ação em lote desconhecida: {}", req.action)));
    }
    if req.codigos.is_empty() {
        return Err(ErroApi::invalido("Nenhum produto informado."));
    }
    if req.action == "set_status" {
        if let Some(v) = req.value_str.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            if !STATUS_PRODUTO_VALIDOS.contains(&v) {
                return Err(ErroApi::regra(format!(
                    "Status desconhecido: {v}. Use um de: {}.",
                    STATUS_PRODUTO_VALIDOS.join(", ")
                )));
            }
        }
    }
    Ok(())
}

/// `set_line`: prefixo precisa existir em `config_linhas` (ou ser AUTO/vazio, que limpa o ajuste manual).
async fn validar_linha_do_bulk(pool: &PgPool, req: &BulkOverrideRequest) -> Result<(), ErroApi> {
    if req.action != "set_line" {
        return Ok(());
    }
    let Some(v) = req.value_str.as_deref().map(str::trim).filter(|s| !s.is_empty() && *s != "AUTO") else {
        return Ok(());
    };
    let existe: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM config_linhas WHERE linha_prefix = $1)")
        .bind(v)
        .fetch_one(pool)
        .await?;
    if existe {
        Ok(())
    } else {
        Err(ErroApi::regra(format!("Linha inexistente: {v}.")))
    }
}

type Foto = HashMap<String, Vec<Option<String>>>;

/// Valor (como texto) de cada coluna afetada, por produto; produto sem override fica sem entrada.
async fn foto_dos_campos(
    conn: &mut sqlx::PgConnection,
    codigos: &[String],
    campos: &[&str],
) -> Result<Foto, ErroApi> {
    let mut foto: Foto = HashMap::new();
    for (i, campo) in campos.iter().enumerate() {
        let linhas: Vec<(String, Option<String>)> =
            sqlx::query_as(&format!("SELECT codigo, {campo}::text FROM overrides_produtos WHERE codigo = ANY($1)"))
                .bind(codigos)
                .fetch_all(&mut *conn)
                .await?;
        for (codigo, valor) in linhas {
            let v = foto.entry(codigo).or_insert_with(|| vec![None; campos.len()]);
            v[i] = valor;
        }
    }
    Ok(foto)
}

/// Produtos cujo valor muda, com `de`/`para` por campo (só os campos que mudam).
pub fn itens_da_previa(codigos: &[String], campos: &[&str], antes: &Foto, depois: &Foto) -> Vec<Value> {
    let vazio = vec![None; campos.len()];
    let mut vistos = std::collections::HashSet::new();
    let mut itens = Vec::new();
    for codigo in codigos {
        if !vistos.insert(codigo) {
            continue;
        }
        let a = antes.get(codigo).unwrap_or(&vazio);
        let d = depois.get(codigo).unwrap_or(&vazio);
        let mudancas: Vec<Value> = campos
            .iter()
            .enumerate()
            .filter(|(i, _)| a[*i] != d[*i])
            .map(|(i, campo)| json!({ "campo": campo, "de": a[i], "para": d[i] }))
            .collect();
        if !mudancas.is_empty() {
            itens.push(json!({ "codigo": codigo, "mudancas": mudancas }));
        }
    }
    itens
}

const LIMITE_PREVIA: usize = 50;

/// Serviço: ação em lote sobre overrides, em 2 passos. Reutilizável por agentes.
pub async fn alterar_overrides_em_lote(
    pool: &PgPool,
    ctx: &AuthContext,
    req: BulkOverrideRequest,
    confirmar: bool,
) -> Result<crate::core::acao::RespostaAcao<Value>, ErroApi> {
    validar_bulk(&req)?;
    validar_linha_do_bulk(pool, &req).await?;
    let req_tx = req.clone();
    let resposta = executar_em_2_passos(pool, "alterar_overrides_em_lote", confirmar, move |tx| {
        Box::pin(async move {
            let campos = campos_da_acao(&req_tx.action);
            let antes = foto_dos_campos(&mut **tx, &req_tx.codigos, campos).await?;
            crate::core::db::Db::bulk_na_tx(tx, &req_tx).await.map_err(ErroApi::interno)?;
            let depois = foto_dos_campos(&mut **tx, &req_tx.codigos, campos).await?;
            let itens = itens_da_previa(&req_tx.codigos, campos, &antes, &depois);
            let total = itens.len();
            Ok(json!({
                "acao": req_tx.action,
                "valor": req_tx.value_str,
                "totalProdutos": req_tx.codigos.len(),
                "totalComMudanca": total,
                "itens": itens.into_iter().take(LIMITE_PREVIA).collect::<Vec<_>>(),
            }))
        })
    })
    .await?;
    if confirmar {
        audit::record_domain(
            pool,
            Some(ctx),
            MODULO_AUDITORIA,
            "alterar_overrides_em_lote",
            "override_produto",
            "lote",
            &format!("{} em {} produto(s)", req.action, req.codigos.len()),
            Some(json!({ "codigos": req.codigos.iter().take(200).collect::<Vec<_>>() })),
            Some(resposta.resultado.clone()),
        )
        .await;
    }
    Ok(resposta)
}

// 3b. POST /api/overrides/bulk (2 passos: sem confirmar=true só devolve a prévia)
pub async fn save_override_bulk(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(req): Json<BulkOverrideRequest>,
) -> Response {
    match alterar_overrides_em_lote(state.db.pool(), &ctx, req, c.confirmar).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

// GET /api/lancamento/graduation-check
pub async fn get_graduation_candidates_handler(
    axum::extract::State(state): axum::extract::State<std::sync::Arc<AppState>>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let global_limit: i64 = match state.db.get_setting("lancamento_meta_meses_global").await {
        Ok(Some(val)) => val.parse().unwrap_or(6),
        _ => 6,
    };

    let rows = match sqlx::query(
        "SELECT op.codigo, p.descricao, cl.nome_linha, op.lancamento_meta_meses, op.lancamento_data_inicio
         FROM overrides_produtos op
         JOIN produtos p ON op.codigo = p.codigo
         LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
         WHERE op.status_produto = 'lancamento'",
    )
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("Erro ao buscar candidatos: {}", e) })),
            )
                .into_response();
        }
    };

    let mut candidates = Vec::new();

    for row in rows {
        use sqlx::Row;
        let code: String = row.get(0);
        let desc: String = row.get(1);
        let line_name: Option<String> = row.get(2);
        let meta: Option<i64> = crate::core::pg_row::pg_opt_i64(&row, 3);
        let date_start: Option<String> = row.get(4);

        let limit = meta.unwrap_or(global_limit);
        let months_with_sales: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM historico_faturamento WHERE codigo = $1 AND quantidade > 0",
        )
        .bind(&code)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        if months_with_sales >= limit {
            candidates.push(serde_json::json!({
                "codigo": code,
                "descricao": desc,
                "nome_linha": line_name.unwrap_or_else(|| "Geral".to_string()),
                "meses_com_historico": months_with_sales,
                "meta_meses": limit,
                "lancamento_data_inicio": date_start,
            }));
        }
    }

    (StatusCode::OK, Json(candidates)).into_response()
}

#[cfg(test)]
mod testes_validacao {
    use super::*;

    fn linha() -> LineConfig {
        serde_json::from_value(json!({
            "linha_prefix": "AB", "nome_linha": "Linha AB",
            "estoque_ideal_mult": 1.0, "abrir_ordem_mult": 1.0, "abrir_prod_mult": 1.0, "fator_seguranca_z": 1.65
        }))
        .unwrap()
    }

    fn bulk(action: &str, valor: Option<&str>) -> BulkOverrideRequest {
        BulkOverrideRequest { codigos: vec!["X".into()], action: action.into(), value_str: valor.map(String::from) }
    }

    #[test]
    fn config_exige_prefixo_nome_e_numeros_positivos() {
        assert!(validar_config(&mut linha()).is_ok());
        let mut c = linha();
        c.linha_prefix = "  ".into();
        assert_eq!(validar_config(&mut c).unwrap_err().status, StatusCode::BAD_REQUEST);
        let mut c = linha();
        c.nome_linha = "".into();
        assert_eq!(validar_config(&mut c).unwrap_err().status, StatusCode::BAD_REQUEST);
        for campo in 0..4 {
            for ruim in [0.0, -1.0, f64::NAN] {
                let mut c = linha();
                match campo {
                    0 => c.estoque_ideal_mult = ruim,
                    1 => c.abrir_ordem_mult = ruim,
                    2 => c.abrir_prod_mult = ruim,
                    _ => c.fator_seguranca_z = ruim,
                }
                assert_eq!(validar_config(&mut c).unwrap_err().status, StatusCode::UNPROCESSABLE_ENTITY);
            }
        }
    }

    #[test]
    fn bulk_valida_acao_produtos_e_status() {
        assert!(validar_bulk(&bulk("hide", None)).is_ok());
        assert!(validar_bulk(&bulk("acao_inexistente", None)).is_err());
        let mut vazio = bulk("hide", None);
        vazio.codigos.clear();
        assert!(validar_bulk(&vazio).is_err());
        for s in STATUS_PRODUTO_VALIDOS {
            assert!(validar_bulk(&bulk("set_status", Some(s))).is_ok());
        }
        assert!(validar_bulk(&bulk("set_status", Some(""))).is_ok(), "vazio limpa o status");
        assert_eq!(validar_bulk(&bulk("set_status", Some("quebrado"))).unwrap_err().status, StatusCode::UNPROCESSABLE_ENTITY);
        assert!(validar_bulk(&bulk("set_line", Some("qualquer"))).is_ok(), "linha é conferida no banco");
    }

    #[test]
    fn campos_de_toda_acao_estao_definidos() {
        for a in crate::core::db::Db::ACOES_BULK {
            assert!(!campos_da_acao(a).is_empty(), "{a} sem campos");
        }
    }

    #[test]
    fn previa_lista_so_o_que_muda() {
        let codigos = vec!["A".to_string(), "B".to_string(), "A".to_string()];
        let campos = ["visivel"];
        let mut antes = Foto::new();
        antes.insert("A".into(), vec![Some("1".into())]);
        antes.insert("B".into(), vec![Some("0".into())]);
        let mut depois = Foto::new();
        depois.insert("A".into(), vec![Some("0".into())]);
        depois.insert("B".into(), vec![Some("0".into())]);
        let itens = itens_da_previa(&codigos, &campos, &antes, &depois);
        assert_eq!(itens.len(), 1, "B não muda e A repetido conta uma vez");
        assert_eq!(itens[0]["codigo"], "A");
        assert_eq!(itens[0]["mudancas"][0]["de"], "1");
        assert_eq!(itens[0]["mudancas"][0]["para"], "0");
    }
}

#[cfg(test)]
mod testes_dois_passos {
    use super::*;
    use crate::modules::geral::auth::models::{AuthContext, OperatorRole, Origem};

    fn ctx() -> AuthContext {
        AuthContext {
            operator_id: "t1".into(),
            display_name: "Teste".into(),
            role: OperatorRole::Operador,
            modules: vec![],
            permissions: HashMap::new(),
            origem: Origem::Tela,
        }
    }

    /// Mesma lista de `PRODUCT_LINE_STATUSES` do front (`types.ts`): uma fonte só em cada lado, conferida aqui.
    #[test]
    fn status_validos_batem_com_o_front() {
        let types = include_str!("../../../Frontend/src/modules/geral/lib/types.ts");
        let a = types.find("PRODUCT_LINE_STATUSES: ProductLineStatusConfig[]").expect("lista no front");
        let trecho = &types[a..];
        let fim = trecho.find("];").unwrap();
        let valores: Vec<&str> = trecho[..fim]
            .split("value: '")
            .skip(1)
            .map(|p| p.split('\'').next().unwrap())
            .collect();
        assert_eq!(valores, STATUS_PRODUTO_VALIDOS.to_vec());
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn bulk_so_grava_com_confirmar_e_valida_linha() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = sqlx::PgPool::connect(&url).await.unwrap();
        let cod = "ZZBULK1";
        sqlx::query("DELETE FROM overrides_produtos WHERE codigo = $1").bind(cod).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM produtos WHERE codigo = $1").bind(cod).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO config_linhas (linha_prefix, nome_linha) VALUES ('ZZBLK', 'teste') ON CONFLICT DO NOTHING").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO produtos (codigo, descricao, linha_prefix, media_levantamento) VALUES ($1, 'teste', 'ZZBLK', 0)")
            .bind(cod).execute(&pool).await.unwrap();
        let req = |action: &str, valor: Option<&str>| BulkOverrideRequest {
            codigos: vec![cod.to_string()],
            action: action.into(),
            value_str: valor.map(String::from),
        };
        let status = || async {
            sqlx::query_scalar::<_, Option<String>>("SELECT status_produto FROM overrides_produtos WHERE codigo = $1")
                .bind(cod).fetch_optional(&pool).await.unwrap().flatten()
        };

        // prévia: devolve o de/para e não grava (nem cria a linha de override)
        let r = alterar_overrides_em_lote(&pool, &ctx(), req("set_status", Some("lancamento")), false).await.unwrap();
        assert!(r.previa);
        assert_eq!(r.resultado["totalComMudanca"], 1);
        assert_eq!(r.resultado["itens"][0]["mudancas"][0]["para"], "lancamento");
        assert_eq!(status().await, None);

        // confirmar: grava
        let r = alterar_overrides_em_lote(&pool, &ctx(), req("set_status", Some("lancamento")), true).await.unwrap();
        assert!(!r.previa);
        assert_eq!(status().await.as_deref(), Some("lancamento"));

        // validações: status desconhecido e linha inexistente
        let e = alterar_overrides_em_lote(&pool, &ctx(), req("set_status", Some("quebrado")), false).await.unwrap_err();
        assert_eq!(e.status, StatusCode::UNPROCESSABLE_ENTITY);
        let e = alterar_overrides_em_lote(&pool, &ctx(), req("set_line", Some("NAOEXISTE")), false).await.unwrap_err();
        assert_eq!(e.status, StatusCode::UNPROCESSABLE_ENTITY);
        assert!(alterar_overrides_em_lote(&pool, &ctx(), req("set_line", Some("ZZBLK")), false).await.is_ok());
        assert!(alterar_overrides_em_lote(&pool, &ctx(), req("set_line", Some("AUTO")), false).await.is_ok());

        // excluir linha: prévia conta e não mexe; confirmar remapeia para DEFAULT
        let r = excluir_linha(&pool, &ctx(), "ZZBLK", false).await.unwrap();
        assert!(r.previa);
        assert_eq!(r.resultado["produtosParaDefault"], 1);
        let ainda: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM config_linhas WHERE linha_prefix = 'ZZBLK'").fetch_one(&pool).await.unwrap();
        assert_eq!(ainda, 1);
        assert!(excluir_linha(&pool, &ctx(), "DEFAULT", false).await.is_err());
        excluir_linha(&pool, &ctx(), "ZZBLK", true).await.unwrap();
        let ainda: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM config_linhas WHERE linha_prefix = 'ZZBLK'").fetch_one(&pool).await.unwrap();
        assert_eq!(ainda, 0);

        sqlx::query("DELETE FROM overrides_produtos WHERE codigo = $1").bind(cod).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM produtos WHERE codigo = $1").bind(cod).execute(&pool).await.unwrap();
    }
}

#[cfg(test)]
mod testes_regras_pcp {
    use super::*;
    use crate::core::db::Db;

    fn base(codigo: &str) -> ProductOverride {
        serde_json::from_value(json!({ "codigo": codigo })).unwrap()
    }

    /// Monta o override como a rota faz: as chaves do corpo viram `campos_enviados`.
    fn do_corpo(corpo: serde_json::Value) -> ProductOverride {
        let mut o: ProductOverride = serde_json::from_value(corpo.clone()).unwrap();
        o.campos_enviados = corpo
            .as_object()
            .unwrap()
            .keys()
            .filter(|k| k.as_str() != "codigo")
            .cloned()
            .collect();
        o
    }

    #[test]
    fn valida_regras_pcp() {
        let mut o = base("X");
        o.processo_termico = Some(" Quente ".into());
        assert!(validar_regras_pcp(&mut o).is_ok());
        assert_eq!(o.processo_termico.as_deref(), Some("quente"));
        o.processo_termico = Some("  ".into());
        assert!(validar_regras_pcp(&mut o).is_ok());
        assert_eq!(o.processo_termico, None);
        o.processo_termico = Some("morno".into());
        assert!(validar_regras_pcp(&mut o).is_err());
        let mut o = base("X");
        o.dias_ate_envase = Some(-1);
        assert!(validar_regras_pcp(&mut o).is_err());
        let mut o = base("X");
        o.producao_minima_kg = Some(-0.5);
        assert!(validar_regras_pcp(&mut o).is_err());
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn grava_e_le_regras_pcp() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = sqlx::PgPool::connect(&url).await.unwrap();
        let db = Db::new(pool.clone());
        let cod = "ZZPCP6";
        sqlx::query("DELETE FROM overrides_produtos WHERE codigo = $1").bind(cod).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM produtos WHERE codigo = $1").bind(cod).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO config_linhas (linha_prefix, nome_linha) VALUES ('ZZPCP', 'teste') ON CONFLICT DO NOTHING").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO produtos (codigo, descricao, linha_prefix, media_levantamento) VALUES ($1, 'teste', 'ZZPCP', 0)")
            .bind(cod).execute(&pool).await.unwrap();

        // grava as 5 regras + produção programada + categoria/status
        let o = do_corpo(json!({
            "codigo": cod,
            "processo_termico": "frio",
            "exclusivo_no_dia": true,
            "permite_bombona": false,
            "dias_ate_envase": 2,
            "producao_minima_kg": 150.5,
            "is_producao_programada": 1,
            "producao_programada_disparo": 10,
            "producao_programada_objetivo": 50,
            "categoria_produto": "cat-x",
            "status_produto": "lancamento",
        }));
        db.save_override(&o).await.unwrap();
        let lido = db.get_override(cod).await.unwrap().unwrap();
        assert_eq!(lido.processo_termico.as_deref(), Some("frio"));
        assert_eq!(lido.exclusivo_no_dia, Some(true));
        assert_eq!(lido.permite_bombona, Some(false));
        assert_eq!(lido.dias_ate_envase, Some(2));
        assert_eq!(lido.producao_minima_kg, Some(150.5));

        // salvar só o status (como o painel): preserva regras PCP e produção programada
        db.save_override(&do_corpo(json!({ "codigo": cod, "status_produto": "ativo" }))).await.unwrap();
        let lido = db.get_override(cod).await.unwrap().unwrap();
        assert_eq!(lido.status_produto.as_deref(), Some("ativo"));
        assert_eq!(lido.categoria_produto.as_deref(), Some("cat-x"));
        assert_eq!(lido.processo_termico.as_deref(), Some("frio"));
        assert_eq!(lido.dias_ate_envase, Some(2));
        assert_eq!(lido.is_producao_programada, Some(1));
        assert_eq!(lido.producao_programada_disparo, Some(10));
        assert_eq!(lido.producao_programada_objetivo, Some(50));

        // payload sem chaves não apaga nada
        db.save_override(&base(cod)).await.unwrap();
        assert!(db.get_override(cod).await.unwrap().is_some());

        // categoria_produto: null limpa a categoria e só ela
        db.save_override(&do_corpo(json!({ "codigo": cod, "categoria_produto": null }))).await.unwrap();
        let lido = db.get_override(cod).await.unwrap().unwrap();
        assert_eq!(lido.categoria_produto, None);
        assert_eq!(lido.status_produto.as_deref(), Some("ativo"));
        assert_eq!(lido.is_producao_programada, Some(1));

        // base_codigo: presente limpa/grava em produtos; ausente não mexe
        db.save_override(&do_corpo(json!({ "codigo": cod, "base_codigo": "B1" }))).await.unwrap();
        let bc = || async { sqlx::query_scalar::<_, Option<String>>("SELECT base_codigo FROM produtos WHERE codigo = $1").bind(cod).fetch_one(&pool).await.unwrap() };
        assert_eq!(bc().await.as_deref(), Some("B1"));
        db.save_override(&do_corpo(json!({ "codigo": cod, "observacao": "x" }))).await.unwrap();
        assert_eq!(bc().await.as_deref(), Some("B1"));
        db.save_override(&do_corpo(json!({ "codigo": cod, "base_codigo": null }))).await.unwrap();
        assert_eq!(bc().await, None);

        // limpar (lote): zera ajustes manuais, mantém PCP e programada, linha não some
        db.save_override(&do_corpo(json!({ "codigo": cod, "status_produto": "descontinuado", "media_manual": 3.0, "visivel": 0 }))).await.unwrap();
        let req = |action: &str| crate::models::BulkOverrideRequest { codigos: vec![cod.to_string()], action: action.into(), value_str: None };
        db.save_override_bulk(&req("clear")).await.unwrap();
        let lido = db.get_override(cod).await.unwrap().unwrap();
        assert_eq!(lido.status_produto, None);
        assert_eq!(lido.media_manual, None);
        assert_eq!(lido.visivel, None);
        assert_eq!(lido.observacao, None);
        assert_eq!(lido.processo_termico.as_deref(), Some("frio"));
        assert_eq!(lido.is_producao_programada, Some(1));
        assert_eq!(lido.producao_programada_objetivo, Some(50));
        assert!(db.save_override_bulk(&req("acao_inexistente")).await.is_err());

        // com as regras PCP e a programada limpas (chaves null), a linha some por estar vazia
        let o3 = do_corpo(json!({
            "codigo": cod,
            "processo_termico": null, "exclusivo_no_dia": null, "permite_bombona": null,
            "dias_ate_envase": null, "producao_minima_kg": null,
            "is_producao_programada": 0, "producao_programada_disparo": null, "producao_programada_objetivo": null,
        }));
        db.save_override(&o3).await.unwrap();
        assert!(db.get_override(cod).await.unwrap().is_none());

        sqlx::query("DELETE FROM overrides_produtos WHERE codigo = $1").bind(cod).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM produtos WHERE codigo = $1").bind(cod).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM config_linhas WHERE linha_prefix = 'ZZPCP'").execute(&pool).await.unwrap();
    }
}

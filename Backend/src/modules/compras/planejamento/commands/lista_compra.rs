//! Lista de Compra: itens separados para o próximo lote de solicitação, uma lista por módulo de Compras.
//! Serviços reutilizáveis pela tela e por agentes; a gravação é em 2 passos e auditada.

use serde_json::{json, Value};
use sqlx::{PgPool, Row};

use crate::core::acao::{executar_em_2_passos, ErroApi, RespostaAcao};
use crate::modules::geral::audit;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::{
    MODULE_COMPRAS_APOIO, MODULE_COMPRAS_COLOR, MODULE_COMPRAS_EMB, MODULE_COMPRAS_MP,
};

/// Módulo de permissão correspondente à lista (`materia_prima`, `embalagens`, `coloracao`, `apoio`).
fn modulo_de_permissao(modulo: &str) -> Result<&'static str, ErroApi> {
    match modulo {
        "materia_prima" => Ok(MODULE_COMPRAS_MP),
        "embalagens" => Ok(MODULE_COMPRAS_EMB),
        "coloracao" => Ok(MODULE_COMPRAS_COLOR),
        "apoio" => Ok(MODULE_COMPRAS_APOIO),
        outro => Err(ErroApi::invalido(format!(
            "Módulo '{outro}' inválido: use materia_prima, embalagens, coloracao ou apoio."
        ))),
    }
}

/// Valida o módulo e a permissão de edição dele (supervisor sempre pode). Devolve o módulo de permissão.
fn checar_modulo_e_permissao(ctx: &AuthContext, modulo: &str) -> Result<&'static str, ErroApi> {
    let chave = modulo_de_permissao(modulo)?;
    if !ctx.can_edit_module(chave) {
        return Err(ErroApi::sem_permissao(format!("Mexer na Lista de Compra de '{modulo}' exige editar o módulo {chave}."))
            .com_detalhes(json!({ "modulo": chave })));
    }
    Ok(chave)
}

/// Chave de comparação do item: código sem pontos e sem espaços nas pontas.
fn chave_do_item(code: &str) -> String {
    code.trim().replace('.', "")
}

/// Códigos aparados, sem vazios e sem repetidos (pela chave), na ordem em que vieram: `(chave, código)`.
fn normalizar_codigos(codigos: &[String]) -> Result<Vec<(String, String)>, ErroApi> {
    if codigos.is_empty() {
        return Err(ErroApi::invalido("Informe ao menos um código em `codigos`."));
    }
    let mut vistos = std::collections::HashSet::new();
    let mut saida = Vec::new();
    for c in codigos {
        let code = c.trim();
        if code.is_empty() {
            return Err(ErroApi::invalido("`codigos` não pode ter código vazio."));
        }
        let chave = chave_do_item(code);
        if vistos.insert(chave.clone()) {
            saida.push((chave, code.to_string()));
        }
    }
    Ok(saida)
}

fn validar_numero(nome: &str, v: Option<f64>) -> Result<(), ErroApi> {
    match v {
        Some(n) if !n.is_finite() || n < 0.0 => Err(ErroApi::invalido(format!("`{nome}` deve ser um número maior ou igual a zero."))),
        _ => Ok(()),
    }
}

/// Itens da lista do módulo, na ordem em que foram adicionados.
pub async fn listar_lista_compra(pool: &PgPool, modulo: &str) -> Result<Value, ErroApi> {
    modulo_de_permissao(modulo)?;
    let rows = sqlx::query(
        "SELECT item_code, quantidade_manual, media_manual, adicionado_por, adicionado_em::text
         FROM compras_lista_itens WHERE modulo = $1 ORDER BY adicionado_em, item_chave",
    )
    .bind(modulo)
    .fetch_all(pool)
    .await?;
    let itens: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "itemCode": r.get::<String, _>(0),
                "quantidadeManual": r.get::<Option<f64>, _>(1),
                "mediaManual": r.get::<Option<f64>, _>(2),
                "adicionadoPor": r.get::<Option<String>, _>(3),
                "adicionadoEm": r.get::<Option<String>, _>(4),
            })
        })
        .collect();
    Ok(json!({ "modulo": modulo, "itens": itens }))
}

async fn auditar(pool: &PgPool, ctx: &AuthContext, acao: &str, modulo: &str, chave_modulo: &str, resumo: &str, depois: Value) {
    audit::record_domain(pool, Some(ctx), chave_modulo, acao, "lista_compra", modulo, resumo, None, Some(depois)).await;
}

/// Serviço (2 passos): põe itens na Lista de Compra do módulo. Os que já estão são ignorados.
/// Código que não existe no cadastro (insumos e produtos de Apoio/Coloração) é recusado (`invalido`).
pub async fn adicionar_itens_lista_compra(
    pool: &PgPool,
    ctx: &AuthContext,
    modulo: &str,
    codigos: &[String],
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let chave_modulo = checar_modulo_e_permissao(ctx, modulo)?;
    let codigos = normalizar_codigos(codigos)?;
    let (modulo_tx, quem) = (modulo.to_string(), ctx.display_name.clone());
    let resposta = executar_em_2_passos(pool, "adicionar_itens_lista_compra", confirmar, move |tx| {
        Box::pin(async move {
            let chaves: Vec<String> = codigos.iter().map(|(k, _)| k.clone()).collect();
            let conhecidos: Vec<String> = sqlx::query_scalar(
                "SELECT replace(trim(code), '.', '') FROM items WHERE replace(trim(code), '.', '') = ANY($1)
                 UNION
                 SELECT replace(trim(codigo), '.', '') FROM produtos WHERE replace(trim(codigo), '.', '') = ANY($1)",
            )
            .bind(&chaves)
            .fetch_all(&mut **tx)
            .await?;
            let desconhecidos: Vec<&str> =
                codigos.iter().filter(|(k, _)| !conhecidos.contains(k)).map(|(_, c)| c.as_str()).collect();
            if !desconhecidos.is_empty() {
                return Err(ErroApi::invalido(format!("Códigos que não existem no cadastro de itens: {}.", desconhecidos.join(", ")))
                    .com_detalhes(json!({ "desconhecidos": desconhecidos })));
            }
            let na_lista: Vec<String> =
                sqlx::query_scalar("SELECT item_chave FROM compras_lista_itens WHERE modulo = $1 AND item_chave = ANY($2)")
                    .bind(&modulo_tx)
                    .bind(&chaves)
                    .fetch_all(&mut **tx)
                    .await?;
            let (mut adicionados, mut ja_na_lista) = (Vec::new(), Vec::new());
            for (chave, code) in &codigos {
                if na_lista.contains(chave) {
                    ja_na_lista.push(code.clone());
                    continue;
                }
                sqlx::query(
                    "INSERT INTO compras_lista_itens (modulo, item_chave, item_code, adicionado_por) VALUES ($1, $2, $3, $4)
                     ON CONFLICT (modulo, item_chave) DO NOTHING",
                )
                .bind(&modulo_tx)
                .bind(chave)
                .bind(code)
                .bind(&quem)
                .execute(&mut **tx)
                .await?;
                adicionados.push(code.clone());
            }
            Ok(json!({ "modulo": modulo_tx, "adicionados": adicionados, "jaNaLista": ja_na_lista }))
        })
    })
    .await?;
    if confirmar {
        let adicionados = resposta.resultado["adicionados"].clone();
        let n = adicionados.as_array().map_or(0, Vec::len);
        if n > 0 {
            let resumo = format!("{n} item(ns) adicionado(s) à Lista de Compra de {modulo}");
            let depois = json!({ "adicionados": adicionados, "origem": ctx.origem.as_str() });
            auditar(pool, ctx, "adicionar_itens_lista_compra", modulo, chave_modulo, &resumo, depois).await;
        }
    }
    Ok(resposta)
}

/// Serviço (2 passos): tira itens da Lista de Compra do módulo. Os que não estavam vêm em `naoEstavam`.
pub async fn remover_itens_lista_compra(
    pool: &PgPool,
    ctx: &AuthContext,
    modulo: &str,
    codigos: &[String],
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let chave_modulo = checar_modulo_e_permissao(ctx, modulo)?;
    let codigos = normalizar_codigos(codigos)?;
    let modulo_tx = modulo.to_string();
    let resposta = executar_em_2_passos(pool, "remover_itens_lista_compra", confirmar, move |tx| {
        Box::pin(async move {
            let (mut removidos, mut nao_estavam) = (Vec::new(), Vec::new());
            for (chave, code) in &codigos {
                let apagou = sqlx::query("DELETE FROM compras_lista_itens WHERE modulo = $1 AND item_chave = $2")
                    .bind(&modulo_tx)
                    .bind(chave)
                    .execute(&mut **tx)
                    .await?
                    .rows_affected();
                if apagou > 0 { removidos.push(code.clone()) } else { nao_estavam.push(code.clone()) }
            }
            Ok(json!({ "modulo": modulo_tx, "removidos": removidos, "naoEstavam": nao_estavam }))
        })
    })
    .await?;
    if confirmar {
        let removidos = resposta.resultado["removidos"].clone();
        let n = removidos.as_array().map_or(0, Vec::len);
        if n > 0 {
            let resumo = format!("{n} item(ns) removido(s) da Lista de Compra de {modulo}");
            let depois = json!({ "removidos": removidos, "origem": ctx.origem.as_str() });
            auditar(pool, ctx, "remover_itens_lista_compra", modulo, chave_modulo, &resumo, depois).await;
        }
    }
    Ok(resposta)
}

/// Serviço (2 passos): grava a quantidade e a média manuais de um item que já está na lista (nulo limpa o campo).
pub async fn ajustar_item_lista_compra(
    pool: &PgPool,
    ctx: &AuthContext,
    modulo: &str,
    codigo: &str,
    quantidade_manual: Option<f64>,
    media_manual: Option<f64>,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let chave_modulo = checar_modulo_e_permissao(ctx, modulo)?;
    let code = codigo.trim().to_string();
    if code.is_empty() {
        return Err(ErroApi::invalido("Informe o `codigo` do item."));
    }
    validar_numero("quantidadeManual", quantidade_manual)?;
    validar_numero("mediaManual", media_manual)?;
    let chave = chave_do_item(&code);
    let modulo_tx = modulo.to_string();
    let resposta = executar_em_2_passos(pool, "ajustar_item_lista_compra", confirmar, move |tx| {
        Box::pin(async move {
            let atual: Option<(Option<f64>, Option<f64>)> = sqlx::query_as(
                "SELECT quantidade_manual, media_manual FROM compras_lista_itens WHERE modulo = $1 AND item_chave = $2 FOR UPDATE",
            )
            .bind(&modulo_tx)
            .bind(&chave)
            .fetch_optional(&mut **tx)
            .await?;
            let (q_antes, m_antes) =
                atual.ok_or_else(|| ErroApi::nao_encontrado(format!("Item {code} não está na Lista de Compra de {modulo_tx}.")))?;
            let mudou = q_antes != quantidade_manual || m_antes != media_manual;
            if mudou {
                sqlx::query("UPDATE compras_lista_itens SET quantidade_manual = $3, media_manual = $4 WHERE modulo = $1 AND item_chave = $2")
                    .bind(&modulo_tx)
                    .bind(&chave)
                    .bind(quantidade_manual)
                    .bind(media_manual)
                    .execute(&mut **tx)
                    .await?;
            }
            Ok(json!({
                "modulo": modulo_tx,
                "codigo": code,
                "antes": { "quantidadeManual": q_antes, "mediaManual": m_antes },
                "depois": { "quantidadeManual": quantidade_manual, "mediaManual": media_manual },
                "mudou": mudou,
            }))
        })
    })
    .await?;
    if confirmar && resposta.resultado["mudou"] == json!(true) {
        let r = &resposta.resultado;
        let resumo = format!("Item {} ajustado na Lista de Compra de {modulo}", r["codigo"].as_str().unwrap_or_default());
        let mut depois = r["depois"].clone();
        depois["codigo"] = r["codigo"].clone();
        depois["origem"] = json!(ctx.origem.as_str());
        audit::record_domain(pool, Some(ctx), chave_modulo, "ajustar_item_lista_compra", "lista_compra", modulo, &resumo, Some(r["antes"].clone()), Some(depois)).await;
    }
    Ok(resposta)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::compras::planejamento::commands::create_purchase_request_batch_query;
    use crate::modules::compras::planejamento::models::{CreatePurchaseRequestBatchInput, CreatePurchaseRequestItemInput};
    use crate::modules::geral::auth::models::{OperatorRole, Origem};

    fn ctx(modulos: &[&str]) -> AuthContext {
        AuthContext {
            operator_id: "a1".into(),
            display_name: "Teste".into(),
            role: OperatorRole::Operador,
            modules: modulos.iter().map(|m| m.to_string()).collect(),
            permissions: modulos.iter().map(|m| (m.to_string(), "edit".to_string())).collect(),
            origem: Origem::Agente,
        }
    }

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    async fn limpar(pool: &PgPool) {
        for sql in [
            "DELETE FROM compras_lista_itens WHERE item_chave LIKE 'ZZLISTA%'",
            "DELETE FROM purchase_request_items WHERE item_code LIKE 'ZZ.LISTA.%'",
            "DELETE FROM purchase_request_batches WHERE id NOT IN (SELECT batch_id FROM purchase_request_items) AND titulo = 'ZZ lista teste'",
            "DELETE FROM items WHERE code LIKE 'ZZ.LISTA.%'",
            "DELETE FROM hub_audit_events WHERE entity_type = 'lista_compra' AND summary LIKE '%Lista de Compra%' AND (after_json::text LIKE '%ZZ.LISTA.%')",
        ] {
            sqlx::query(sql).execute(pool).await.unwrap();
        }
    }

    async fn na_lista(pool: &PgPool, modulo: &str) -> Vec<String> {
        sqlx::query_scalar("SELECT item_chave FROM compras_lista_itens WHERE modulo = $1 AND item_chave LIKE 'ZZLISTA%' ORDER BY item_chave")
            .bind(modulo)
            .fetch_all(pool)
            .await
            .unwrap()
    }

    async fn auditorias(pool: &PgPool, acao: &str) -> i64 {
        sqlx::query_scalar("SELECT COUNT(*) FROM hub_audit_events WHERE action = $1 AND after_json::text LIKE '%ZZ.LISTA.%'")
            .bind(acao)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[test]
    fn codigos_sao_normalizados() {
        let n = normalizar_codigos(&s(&[" 9.15.001 ", "9.15.001", "9.15.002"])).unwrap();
        assert_eq!(n, vec![("915001".to_string(), "9.15.001".to_string()), ("915002".to_string(), "9.15.002".to_string())]);
        assert_eq!(normalizar_codigos(&[]).unwrap_err().codigo, "invalido");
        assert_eq!(normalizar_codigos(&s(&["  "])).unwrap_err().codigo, "invalido");
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn lista_compra_servicos() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        sqlx::raw_sql(include_str!("../../../../../supabase/081_compras_lista_itens.sql")).execute(&pool).await.unwrap();
        limpar(&pool).await;
        for c in ["ZZ.LISTA.A", "ZZ.LISTA.B", "ZZ.LISTA.C"] {
            sqlx::query("INSERT INTO items (code, description, unit, category_id) VALUES ($1, 'Teste lista', 'KG', 'cat_mp')")
                .bind(c)
                .execute(&pool)
                .await
                .unwrap();
        }
        let mp = ctx(&[MODULE_COMPRAS_MP]);

        // módulo inválido, sem permissão do módulo, código desconhecido
        assert_eq!(adicionar_itens_lista_compra(&pool, &mp, "xx", &s(&["ZZ.LISTA.A"]), false).await.unwrap_err().codigo, "invalido");
        let sem = adicionar_itens_lista_compra(&pool, &mp, "embalagens", &s(&["ZZ.LISTA.A"]), false).await.unwrap_err();
        assert_eq!(sem.codigo, "sem_permissao");
        assert_eq!(sem.detalhes.unwrap()["modulo"], json!(MODULE_COMPRAS_EMB));
        let desc = adicionar_itens_lista_compra(&pool, &mp, "materia_prima", &s(&["ZZ.LISTA.A", "ZZ.NAO.EXISTE"]), true).await.unwrap_err();
        assert_eq!(desc.codigo, "invalido");
        assert!(na_lista(&pool, "materia_prima").await.is_empty());

        // prévia não grava nem audita
        let p = adicionar_itens_lista_compra(&pool, &mp, "materia_prima", &s(&["ZZ.LISTA.A", "ZZ.LISTA.B"]), false).await.unwrap();
        assert!(p.previa);
        assert_eq!(p.resultado["adicionados"], json!(["ZZ.LISTA.A", "ZZ.LISTA.B"]));
        assert!(na_lista(&pool, "materia_prima").await.is_empty());
        assert_eq!(auditorias(&pool, "adicionar_itens_lista_compra").await, 0);

        // adicionar e repetir (código sem pontos conta como o mesmo)
        let r = adicionar_itens_lista_compra(&pool, &mp, "materia_prima", &s(&["ZZ.LISTA.A", "ZZ.LISTA.B"]), true).await.unwrap();
        assert_eq!(r.resultado["adicionados"], json!(["ZZ.LISTA.A", "ZZ.LISTA.B"]));
        let r = adicionar_itens_lista_compra(&pool, &mp, "materia_prima", &s(&["ZZLISTAA", "ZZ.LISTA.C"]), true).await.unwrap();
        assert_eq!(r.resultado["adicionados"], json!(["ZZ.LISTA.C"]));
        assert_eq!(r.resultado["jaNaLista"], json!(["ZZLISTAA"]));
        assert_eq!(na_lista(&pool, "materia_prima").await.len(), 3);
        assert_eq!(auditorias(&pool, "adicionar_itens_lista_compra").await, 2);
        // repetir sem mudança não audita
        adicionar_itens_lista_compra(&pool, &mp, "materia_prima", &s(&["ZZ.LISTA.A"]), true).await.unwrap();
        assert_eq!(auditorias(&pool, "adicionar_itens_lista_compra").await, 2);

        // módulos não se misturam
        let emb = ctx(&[MODULE_COMPRAS_EMB]);
        adicionar_itens_lista_compra(&pool, &emb, "embalagens", &s(&["ZZ.LISTA.A"]), true).await.unwrap();
        assert_eq!(na_lista(&pool, "embalagens").await, vec!["ZZLISTAA".to_string()]);
        let lista = listar_lista_compra(&pool, "materia_prima").await.unwrap();
        let codigos: Vec<&str> = lista["itens"].as_array().unwrap().iter().filter_map(|i| i["itemCode"].as_str()).filter(|c| c.starts_with("ZZ")).collect();
        assert_eq!(codigos, vec!["ZZ.LISTA.A", "ZZ.LISTA.B", "ZZ.LISTA.C"]);
        assert_eq!(listar_lista_compra(&pool, "xx").await.unwrap_err().codigo, "invalido");

        // ajustar: negativo e não finito recusados, fora da lista, prévia, gravar, limpar com nulo
        assert_eq!(ajustar_item_lista_compra(&pool, &mp, "materia_prima", "ZZ.LISTA.A", Some(-1.0), None, true).await.unwrap_err().codigo, "invalido");
        assert_eq!(ajustar_item_lista_compra(&pool, &mp, "materia_prima", "ZZ.LISTA.A", None, Some(f64::NAN), true).await.unwrap_err().codigo, "invalido");
        assert_eq!(ajustar_item_lista_compra(&pool, &mp, "apoio", "ZZ.LISTA.A", Some(1.0), None, true).await.unwrap_err().codigo, "sem_permissao");
        assert_eq!(ajustar_item_lista_compra(&pool, &mp, "materia_prima", "ZZ.OUTRO", Some(1.0), None, true).await.unwrap_err().codigo, "nao_encontrado");
        let valores = |pool: PgPool| async move {
            sqlx::query_as::<_, (Option<f64>, Option<f64>)>("SELECT quantidade_manual, media_manual FROM compras_lista_itens WHERE modulo = 'materia_prima' AND item_chave = 'ZZLISTAA'")
                .fetch_one(&pool)
                .await
                .unwrap()
        };
        let p = ajustar_item_lista_compra(&pool, &mp, "materia_prima", "ZZ.LISTA.A", Some(10.0), Some(2.5), false).await.unwrap();
        assert!(p.previa);
        assert_eq!(p.resultado["mudou"], json!(true));
        assert_eq!(valores(pool.clone()).await, (None, None));
        ajustar_item_lista_compra(&pool, &mp, "materia_prima", "ZZ.LISTA.A", Some(10.0), Some(2.5), true).await.unwrap();
        assert_eq!(valores(pool.clone()).await, (Some(10.0), Some(2.5)));
        assert_eq!(auditorias(&pool, "ajustar_item_lista_compra").await, 1);
        let igual = ajustar_item_lista_compra(&pool, &mp, "materia_prima", "ZZ.LISTA.A", Some(10.0), Some(2.5), true).await.unwrap();
        assert_eq!(igual.resultado["mudou"], json!(false));
        assert_eq!(auditorias(&pool, "ajustar_item_lista_compra").await, 1);
        let limpo = ajustar_item_lista_compra(&pool, &mp, "materia_prima", "ZZ.LISTA.A", None, None, true).await.unwrap();
        assert_eq!(limpo.resultado["antes"], json!({ "quantidadeManual": 10.0, "mediaManual": 2.5 }));
        assert_eq!(valores(pool.clone()).await, (None, None));

        // remover: prévia, confirmar, quem não estava
        let p = remover_itens_lista_compra(&pool, &mp, "materia_prima", &s(&["ZZ.LISTA.C"]), false).await.unwrap();
        assert!(p.previa);
        assert_eq!(na_lista(&pool, "materia_prima").await.len(), 3);
        assert_eq!(auditorias(&pool, "remover_itens_lista_compra").await, 0);
        let r = remover_itens_lista_compra(&pool, &mp, "materia_prima", &s(&["ZZ.LISTA.C", "ZZ.LISTA.X"]), true).await.unwrap();
        assert_eq!(r.resultado["removidos"], json!(["ZZ.LISTA.C"]));
        assert_eq!(r.resultado["naoEstavam"], json!(["ZZ.LISTA.X"]));
        assert_eq!(auditorias(&pool, "remover_itens_lista_compra").await, 1);
        remover_itens_lista_compra(&pool, &mp, "materia_prima", &s(&["ZZ.LISTA.X"]), true).await.unwrap();
        assert_eq!(auditorias(&pool, "remover_itens_lista_compra").await, 1);

        // criar lote tira só os itens do lote, no módulo do lote
        let item = |code: &str| CreatePurchaseRequestItemInput {
            item_code: code.into(),
            item_description: "Teste lista".into(),
            unit: Some("KG".into()),
            quantity_requested: 1.0,
            current_stock_at_time: None,
            overall_avg_at_time: None,
            sim_producao_at_time: None,
            future_stock_at_time: None,
            target_days_at_time: None,
            trigger_days_at_time: None,
            supplier_name: None,
            observacao: None,
        };
        let lote = create_purchase_request_batch_query(
            pool.clone(),
            CreatePurchaseRequestBatchInput {
                modulo: "materia_prima".into(),
                titulo: Some("ZZ lista teste".into()),
                observacoes: None,
                created_by: Some("Teste".into()),
                items: vec![item("ZZ.LISTA.A")],
            },
        )
        .await
        .unwrap();
        assert_eq!(na_lista(&pool, "materia_prima").await, vec!["ZZLISTAB".to_string()]);
        assert_eq!(na_lista(&pool, "embalagens").await, vec!["ZZLISTAA".to_string()]);

        sqlx::query("DELETE FROM purchase_request_items WHERE batch_id = $1").bind(&lote.batch.id).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM purchase_request_batches WHERE id = $1").bind(&lote.batch.id).execute(&pool).await.unwrap();
        limpar(&pool).await;
    }
}

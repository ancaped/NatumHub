use axum::{
    extract::{Query, State},
    response::{IntoResponse, Response},
    Extension, Json,
};
use serde_json::{json, Map, Value};
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::core::acao::{executar_em_2_passos, Confirmar, ErroApi, RespostaAcao};
use crate::core::regras_produto::{atendimento_efetivo, situacao_do_status_legado, status_de_consumo, ATENDIMENTOS, SITUACOES};
use crate::handlers::configs::STATUS_PRODUTO_VALIDOS;
use super::atendimento::{sincronizar_status, Alvo};
use crate::handlers::AppState;
use crate::modules::geral::audit;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::MODULE_ADMIN_LINHA_PRODUTOS;

const MODULO_AUDITORIA: &str = "admin_linha_produtos";
/// Lista fechada: único conjunto de campos que esta ação grava.
pub const CAMPOS: [&str; 5] = ["situacao", "atendimento", "categoria_produto", "base_codigo", "linha_prefix_manual"];

/// Valor pedido para um campo: ausente no corpo = não mexe; `None` = limpa.
type Pedido = Vec<(&'static str, Option<String>)>;

/// Lê o corpo: `codigo` + os campos da lista fechada que vieram (chave presente, inclusive `null`).
/// Campo fora da lista é recusado, para o chamador não achar que gravou algo que foi ignorado.
fn ler_corpo(corpo: &Value) -> Result<(String, Pedido), ErroApi> {
    let obj: &Map<String, Value> = corpo.as_object().ok_or_else(|| ErroApi::invalido("Corpo inválido."))?;
    // `status_produto` é o nome antigo: "terceirizado" vira situação ativo + atendimento terceirizado; os demais viram situação.
    let mut convertido;
    let obj = if obj.contains_key("status_produto") {
        convertido = obj.clone();
        let antigo = convertido.remove("status_produto").unwrap_or(Value::Null);
        match antigo.as_str().map(str::trim) {
            Some(st) if !STATUS_PRODUTO_VALIDOS.contains(&st) => {
                return Err(ErroApi::regra(format!("Status desconhecido: {st}. Use um de: {}.", STATUS_PRODUTO_VALIDOS.join(", "))));
            }
            Some("terceirizado") => {
                convertido.entry("situacao").or_insert(json!("ativo"));
                convertido.entry("atendimento").or_insert(json!("terceirizado"));
            }
            _ => {
                convertido.entry("situacao").or_insert(antigo);
            }
        }
        &convertido
    } else {
        obj
    };
    let codigo = obj.get("codigo").and_then(Value::as_str).map(str::trim).unwrap_or("");
    if codigo.is_empty() {
        return Err(ErroApi::invalido("Informe o código do produto."));
    }
    if let Some(k) = obj.keys().find(|k| k.as_str() != "codigo" && !CAMPOS.contains(&k.as_str())) {
        return Err(ErroApi::invalido(format!("Campo não pertence à classificação: {k}. Use: {}.", CAMPOS.join(", "))));
    }
    let mut pedido: Pedido = Vec::new();
    for campo in CAMPOS {
        let Some(v) = obj.get(campo) else { continue };
        let texto = match v {
            Value::Null if campo == "situacao" => Some("ativo".to_string()),
            Value::Null => None,
            Value::String(s) if campo == "situacao" && s.trim().is_empty() => Some("ativo".to_string()),
            Value::String(s) => Some(s.trim().to_string()).filter(|s| !s.is_empty() && s != "AUTO"),
            _ => return Err(ErroApi::invalido(format!("{campo} deve ser texto ou null."))),
        };
        pedido.push((campo, texto));
    }
    if pedido.is_empty() {
        return Err(ErroApi::invalido(format!("Informe ao menos um campo: {}.", CAMPOS.join(", "))));
    }
    Ok((codigo.to_string(), pedido))
}

fn pode_editar(ctx: &AuthContext) -> Result<(), ErroApi> {
    if ctx.role.is_supervisor() || ctx.can_edit_module(MODULE_ADMIN_LINHA_PRODUTOS) {
        Ok(())
    } else {
        Err(ErroApi::sem_permissao("Sem permissão para editar Linha de Produtos."))
    }
}

/// Valores atuais dos campos + descrição (None na descrição = produto não existe). `atendimento_efetivo` e
/// `status_consumo` vão junto para informar (não são campos gravados).
async fn foto(conn: &mut sqlx::PgConnection, codigo: &str) -> Result<Option<(String, Map<String, Value>)>, ErroApi> {
    let r = sqlx::query(
        "SELECT p.descricao, o.status_produto, o.situacao, o.atendimento, o.categoria_produto, p.base_codigo, o.linha_prefix_manual, cl.atendimento \
         FROM produtos p LEFT JOIN overrides_produtos o ON o.codigo = p.codigo \
         LEFT JOIN config_linhas cl ON cl.linha_prefix = COALESCE(NULLIF(o.linha_prefix_manual, ''), p.linha_prefix) \
         WHERE p.codigo = $1",
    )
    .bind(codigo)
    .fetch_optional(&mut *conn)
    .await?;
    Ok(r.map(|r| {
        let status: Option<String> = r.get(1);
        let (sit_legado, atd_legado) = situacao_do_status_legado(status.as_deref());
        let situacao = r.get::<Option<String>, _>(2).unwrap_or(sit_legado);
        let atd: Option<String> = r.get::<Option<String>, _>(3).or(atd_legado.map(String::from));
        let efetivo = atendimento_efetivo(atd.as_deref(), r.get::<Option<String>, _>(7).as_deref());
        let mut m = Map::new();
        m.insert("situacao".into(), json!(situacao));
        m.insert("atendimento".into(), json!(atd));
        m.insert("categoria_produto".into(), json!(r.get::<Option<String>, _>(4)));
        m.insert("base_codigo".into(), json!(r.get::<Option<String>, _>(5)));
        m.insert("linha_prefix_manual".into(), json!(r.get::<Option<String>, _>(6)));
        m.insert("atendimento_efetivo".into(), json!(efetivo));
        m.insert("status_consumo".into(), json!(status_de_consumo(&situacao, efetivo)));
        (r.get::<Option<String>, _>(0).unwrap_or_default(), m)
    }))
}

/// Regras de valor, com acesso ao banco (linha e base precisam existir).
async fn validar(conn: &mut sqlx::PgConnection, codigo: &str, pedido: &Pedido) -> Result<(), ErroApi> {
    for (campo, valor) in pedido {
        let Some(v) = valor else { continue };
        match *campo {
            "situacao" if !SITUACOES.contains(&v.as_str()) => {
                return Err(ErroApi::regra(format!("Situação desconhecida: {v}. Use uma de: {}.", SITUACOES.join(", "))));
            }
            "atendimento" if !ATENDIMENTOS.contains(&v.as_str()) => {
                return Err(ErroApi::regra(format!("Atendimento desconhecido: {v}. Use um de: {}.", ATENDIMENTOS.join(", "))));
            }
            "linha_prefix_manual" => {
                let existe: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM config_linhas WHERE linha_prefix = $1)")
                    .bind(v)
                    .fetch_one(&mut *conn)
                    .await?;
                if !existe {
                    return Err(ErroApi::regra(format!("Linha inexistente: {v}.")));
                }
            }
            "base_codigo" => {
                if v == codigo {
                    return Err(ErroApi::regra("O produto não pode ser a própria base."));
                }
                let existe: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM produtos WHERE codigo = $1)")
                    .bind(v)
                    .fetch_one(&mut *conn)
                    .await?;
                if !existe {
                    return Err(ErroApi::regra(format!("Base inexistente: {v}.")));
                }
            }
            _ => {}
        }
    }
    Ok(())
}

/// Serviço: classifica um produto (status, categoria, base, linha). 2 passos; só grava com `confirmar`.
/// Reutilizável por agentes e por outros módulos.
pub async fn classificar_produto(
    pool: &PgPool,
    ctx: &AuthContext,
    corpo: Value,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    pode_editar(ctx)?;
    let (codigo, pedido) = ler_corpo(&corpo)?;
    let codigo_tx = codigo.clone();
    let resposta = executar_em_2_passos(pool, "classificar_produto", confirmar, move |tx| {
        Box::pin(async move {
            let conn: &mut sqlx::PgConnection = &mut **tx;
            let (descricao, antes) = foto(conn, &codigo_tx)
                .await?
                .ok_or_else(|| ErroApi::nao_encontrado(format!("Produto {} não existe.", codigo_tx)))?;
            validar(conn, &codigo_tx, &pedido).await?;
            let mudam: Vec<&(&str, Option<String>)> =
                pedido.iter().filter(|(c, v)| antes.get(*c).and_then(Value::as_str).map(str::to_string) != *v).collect();
            if !mudam.is_empty() {
                sqlx::query("INSERT INTO overrides_produtos (codigo) VALUES ($1) ON CONFLICT (codigo) DO NOTHING")
                    .bind(&codigo_tx)
                    .execute(&mut *conn)
                    .await?;
            }
            for (campo, valor) in &mudam {
                // Nome de coluna vem da lista fechada CAMPOS (nunca do chamador).
                let sql = if *campo == "base_codigo" {
                    "UPDATE produtos SET base_codigo = $2 WHERE codigo = $1".to_string()
                } else {
                    format!("UPDATE overrides_produtos SET {campo} = $2 WHERE codigo = $1")
                };
                sqlx::query(&sql).bind(&codigo_tx).bind(valor).execute(&mut *conn).await?;
            }
            if !mudam.is_empty() {
                // O status que Produção e Compras leem acompanha situação, atendimento e linha.
                sincronizar_status(conn, Alvo::Codigos(&[codigo_tx.clone()])).await?;
            }
            let (_, depois) = foto(conn, &codigo_tx).await?.unwrap_or_default();
            let mudancas: Vec<Value> = mudam
                .iter()
                .map(|(c, v)| json!({ "campo": c, "de": antes.get(*c).cloned().unwrap_or(Value::Null), "para": v }))
                .collect();
            Ok(json!({
                "codigo": codigo_tx,
                "descricao": descricao,
                "muda": !mudancas.is_empty(),
                "mudancas": mudancas,
                "antes": antes,
                "depois": depois,
            }))
        })
    })
    .await?;

    if confirmar && resposta.resultado["muda"] == json!(true) {
        audit::record_domain(
            pool,
            Some(ctx),
            MODULO_AUDITORIA,
            "classificar_produto",
            "produto_classificacao",
            &codigo,
            &format!("Classificação do produto {codigo} alterada"),
            Some(resposta.resultado["antes"].clone()),
            Some(resposta.resultado["depois"].clone()),
        )
        .await;
    }
    Ok(resposta)
}

/// POST /api/admin/produtos-ativos/classificacao (sem `?confirmar=true` só devolve a prévia).
pub async fn classificar(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(corpo): Json<Value>,
) -> Response {
    match classificar_produto(state.db.pool(), &ctx, corpo, c.confirmar).await {
        Ok(r) => Json(r).into_response(),
        Err(e) => e.into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn corpo_recusa_campo_de_outro_dono() {
        let e = ler_corpo(&json!({ "codigo": "1", "estoque_ideal_manual": 5 })).unwrap_err();
        assert!(e.corpo()["error"].as_str().unwrap().contains("estoque_ideal_manual"));
    }

    #[test]
    fn corpo_distingue_ausente_de_null_e_auto() {
        let (c, p) = ler_corpo(&json!({ "codigo": " 1 ", "base_codigo": null, "linha_prefix_manual": "AUTO", "categoria_produto": " x " })).unwrap();
        assert_eq!(c, "1");
        assert_eq!(p, vec![("categoria_produto", Some("x".into())), ("base_codigo", None), ("linha_prefix_manual", None)]);
        assert!(ler_corpo(&json!({ "codigo": "1" })).is_err());
        assert!(ler_corpo(&json!({ "base_codigo": null })).is_err());
    }

    #[test]
    fn status_antigo_vira_situacao_e_atendimento() {
        let (_, p) = ler_corpo(&json!({ "codigo": "1", "status_produto": "terceirizado" })).unwrap();
        assert_eq!(p, vec![("situacao", Some("ativo".into())), ("atendimento", Some("terceirizado".into()))]);
        let (_, p) = ler_corpo(&json!({ "codigo": "1", "status_produto": "descontinuado" })).unwrap();
        assert_eq!(p, vec![("situacao", Some("descontinuado".into()))]);
        assert!(ler_corpo(&json!({ "codigo": "1", "status_produto": "lixo" })).is_err());
        // situação vazia ou null vale ativo; atendimento vazio herda da linha
        let (_, p) = ler_corpo(&json!({ "codigo": "1", "situacao": null, "atendimento": null })).unwrap();
        assert_eq!(p, vec![("situacao", Some("ativo".into())), ("atendimento", None)]);
    }

    use crate::modules::geral::auth::models::{OperatorRole, Origem};
    use std::collections::HashMap;

    fn supervisor() -> AuthContext {
        AuthContext {
            operator_id: "t1".into(),
            display_name: "Teste".into(),
            role: OperatorRole::Supervisor,
            modules: vec![],
            permissions: HashMap::new(),
            origem: Origem::Tela,
        }
    }

    async fn status_de(pool: &PgPool, cod: &str) -> Option<String> {
        sqlx::query_scalar::<_, Option<String>>("SELECT status_produto FROM overrides_produtos WHERE codigo = $1")
            .bind(cod)
            .fetch_optional(pool)
            .await
            .unwrap()
            .flatten()
    }

    /// Atendimento da linha e do produto: o status que Produção e Compras leem acompanha; terceirizado antigo não muda.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn atendimento_mantem_o_status_espelho_para_producao_e_compras() {
        use crate::modules::administrativo::linhas::classificar_linha;
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        for sql in [
            "DELETE FROM overrides_produtos WHERE codigo IN ('ZZL1.1', 'ZZL1.2', 'ZZL1.3')",
            "DELETE FROM produtos WHERE codigo IN ('ZZL1.1', 'ZZL1.2', 'ZZL1.3')",
            "DELETE FROM config_linhas WHERE linha_prefix = 'ZZL1'",
        ] {
            sqlx::query(sql).execute(&pool).await.unwrap();
        }
        sqlx::query("INSERT INTO config_linhas (linha_prefix, nome_linha) VALUES ('ZZL1', 'Teste L1')").execute(&pool).await.unwrap();
        sqlx::raw_sql(include_str!("../../../../supabase/113_situacao_atendimento.sql")).execute(&pool).await.unwrap();
        for c in ["ZZL1.1", "ZZL1.2", "ZZL1.3"] {
            sqlx::query("INSERT INTO produtos (codigo, descricao, linha_prefix, media_levantamento) VALUES ($1, 'teste', 'ZZL1', 0)").bind(c).execute(&pool).await.unwrap();
        }
        // ZZL1.2 é lançamento; ZZL1.3 era terceirizado antes da L1 (status antigo, sem situação)
        sqlx::query("INSERT INTO overrides_produtos (codigo, status_produto, situacao) VALUES ('ZZL1.2', 'lancamento', 'lancamento')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO overrides_produtos (codigo, status_produto) VALUES ('ZZL1.3', 'terceirizado')").execute(&pool).await.unwrap();
        // migração: terceirizado antigo -> ativo + atendimento terceirizado, status lido continua igual
        sqlx::raw_sql(include_str!("../../../../supabase/113_situacao_atendimento.sql")).execute(&pool).await.unwrap();
        let (sit, atd): (Option<String>, Option<String>) =
            sqlx::query_as("SELECT situacao, atendimento FROM overrides_produtos WHERE codigo = 'ZZL1.3'").fetch_one(&pool).await.unwrap();
        assert_eq!((sit.as_deref(), atd.as_deref()), (Some("ativo"), Some("terceirizado")));
        assert_eq!(status_de(&pool, "ZZL1.3").await.as_deref(), Some("terceirizado"));
        let ctx = supervisor();

        // prévia da linha não grava
        let r = classificar_linha(&pool, &ctx, "ZZL1", Some("encomenda".into()), None, false).await.unwrap();
        assert!(r.previa);
        assert_eq!(status_de(&pool, "ZZL1.1").await, None);
        // confirma: todos que herdam passam a ler "terceirizado"; ZZL1.3 tem exceção própria (terceirizado) e segue igual
        classificar_linha(&pool, &ctx, "ZZL1", Some("encomenda".into()), None, true).await.unwrap();
        assert_eq!(status_de(&pool, "ZZL1.1").await.as_deref(), Some("terceirizado"));
        assert_eq!(status_de(&pool, "ZZL1.2").await.as_deref(), Some("terceirizado"));
        // exceção do produto: ZZL1.2 volta a ser fabricado para estoque e lê a situação lançamento
        classificar_produto(&pool, &ctx, json!({ "codigo": "ZZL1.2", "atendimento": "estoque" }), true).await.unwrap();
        assert_eq!(status_de(&pool, "ZZL1.2").await.as_deref(), Some("lancamento"));
        // linha volta ao estoque: quem herdava volta a ler ativo; quem tem exceção terceirizado continua
        classificar_linha(&pool, &ctx, "ZZL1", Some("estoque".into()), None, true).await.unwrap();
        assert_eq!(status_de(&pool, "ZZL1.1").await.as_deref(), Some("ativo"));
        assert_eq!(status_de(&pool, "ZZL1.3").await.as_deref(), Some("terceirizado"));
        // inativar produto lê "descontinuado" mesmo com atendimento terceirizado
        classificar_produto(&pool, &ctx, json!({ "codigo": "ZZL1.3", "situacao": "descontinuado" }), true).await.unwrap();
        assert_eq!(status_de(&pool, "ZZL1.3").await.as_deref(), Some("descontinuado"));
        // linha inativa usa visivel = 0 (já esconde em todos os módulos)
        classificar_linha(&pool, &ctx, "ZZL1", None, Some(false), true).await.unwrap();
        let v: i32 = sqlx::query_scalar("SELECT visivel FROM config_linhas WHERE linha_prefix = 'ZZL1'").fetch_one(&pool).await.unwrap();
        assert_eq!(v, 0);

        for sql in [
            "DELETE FROM overrides_produtos WHERE codigo IN ('ZZL1.1', 'ZZL1.2', 'ZZL1.3')",
            "DELETE FROM produtos WHERE codigo IN ('ZZL1.1', 'ZZL1.2', 'ZZL1.3')",
            "DELETE FROM config_linhas WHERE linha_prefix = 'ZZL1'",
            "DELETE FROM hub_audit_events WHERE entity_id IN ('ZZL1', 'ZZL1.2', 'ZZL1.3')",
        ] {
            sqlx::query(sql).execute(&pool).await.unwrap();
        }
    }
}

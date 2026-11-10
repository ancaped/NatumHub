use axum::{
    extract::{Query, State},
    response::{IntoResponse, Response},
    Extension, Json,
};
use serde_json::{json, Map, Value};
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::core::acao::{executar_em_2_passos, Confirmar, ErroApi, RespostaAcao};
use crate::handlers::configs::STATUS_PRODUTO_VALIDOS;
use crate::handlers::AppState;
use crate::modules::geral::audit;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::MODULE_ADMIN_LINHA_PRODUTOS;

const MODULO_AUDITORIA: &str = "admin_linha_produtos";
/// Lista fechada: único conjunto de campos que esta ação grava.
pub const CAMPOS: [&str; 4] = ["status_produto", "categoria_produto", "base_codigo", "linha_prefix_manual"];

/// Valor pedido para um campo: ausente no corpo = não mexe; `None` = limpa.
type Pedido = Vec<(&'static str, Option<String>)>;

/// Lê o corpo: `codigo` + os campos da lista fechada que vieram (chave presente, inclusive `null`).
/// Campo fora da lista é recusado, para o chamador não achar que gravou algo que foi ignorado.
fn ler_corpo(corpo: &Value) -> Result<(String, Pedido), ErroApi> {
    let obj: &Map<String, Value> = corpo.as_object().ok_or_else(|| ErroApi::invalido("Corpo inválido."))?;
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
            Value::Null => None,
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

/// Valores atuais dos 4 campos + descrição (None na descrição = produto não existe).
async fn foto(conn: &mut sqlx::PgConnection, codigo: &str) -> Result<Option<(String, Map<String, Value>)>, ErroApi> {
    let r = sqlx::query(
        "SELECT p.descricao, o.status_produto, o.categoria_produto, p.base_codigo, o.linha_prefix_manual \
         FROM produtos p LEFT JOIN overrides_produtos o ON o.codigo = p.codigo WHERE p.codigo = $1",
    )
    .bind(codigo)
    .fetch_optional(&mut *conn)
    .await?;
    Ok(r.map(|r| {
        let mut m = Map::new();
        m.insert("status_produto".into(), json!(r.get::<Option<String>, _>(1)));
        m.insert("categoria_produto".into(), json!(r.get::<Option<String>, _>(2)));
        m.insert("base_codigo".into(), json!(r.get::<Option<String>, _>(3)));
        m.insert("linha_prefix_manual".into(), json!(r.get::<Option<String>, _>(4)));
        (r.get::<Option<String>, _>(0).unwrap_or_default(), m)
    }))
}

/// Regras de valor, com acesso ao banco (linha e base precisam existir).
async fn validar(conn: &mut sqlx::PgConnection, codigo: &str, pedido: &Pedido) -> Result<(), ErroApi> {
    for (campo, valor) in pedido {
        let Some(v) = valor else { continue };
        match *campo {
            "status_produto" if !STATUS_PRODUTO_VALIDOS.contains(&v.as_str()) => {
                return Err(ErroApi::regra(format!(
                    "Status desconhecido: {v}. Use um de: {}.",
                    STATUS_PRODUTO_VALIDOS.join(", ")
                )));
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
}

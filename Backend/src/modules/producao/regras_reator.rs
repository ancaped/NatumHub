//! Regras de reator/processo por produto (dono: Produção): processo térmico, exclusivo no dia, permite bombona
//! e dias até o envase. Endpoint de ação com lista fechada de campos, 2 passos e auditoria (antes/depois).
//! Os demais campos de `overrides_produtos` têm outros donos e não passam por aqui. `NULL` = sem regra
//! (comportamento automático de sempre). A fila automática e a sequência do Planejamento leem estes campos
//! por `carregar_regras` (etapa C2 do plano de fluxo), inclusive para produto que não está na Demanda.

use axum::{
    extract::{Query, State},
    response::{IntoResponse, Response},
    routing::post,
    Extension, Json, Router,
};
use serde_json::{json, Map, Value};
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::core::acao::{executar_em_2_passos, Confirmar, ErroApi, RespostaAcao};
use crate::core::catalogo::{param, Acao};
use crate::core::db::Db;
use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::{MODULE_PLANEJAMENTO_PRODUCAO, MODULE_PRODUCAO};
use crate::modules::producao::auditoria;

/// Lista fechada: único conjunto de campos que esta ação grava.
pub const CAMPOS: [&str; 4] = ["processo_termico", "exclusivo_no_dia", "permite_bombona", "dias_ate_envase"];

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/producao/produtos/regras-reator", post(definir_rota))
}

/// Ação descrita para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<Acao> {
    vec![Acao::gravacao(
        "definir_regras_reator_produto",
        "planejamento_producao",
        "Define as regras de reator de UM produto: `processo_termico` (quente ou frio), `exclusivo_no_dia` (true/false: o produto ocupa o reator sozinho no dia), `permite_bombona` (true/false) e `dias_ate_envase` (inteiro >= 0). Só os campos enviados mudam; enviar `null` limpa o campo (sem regra = automático). Nunca invente valores: quem define é o Edson. Sem `confirmar=true` devolve só a prévia (antes, depois e o que muda). Registra quem alterou na auditoria.",
        "POST",
        "/api/producao/produtos/regras-reator",
        true,
        vec![
            param("confirmar", "query", "booleano", false, "true grava; ausente só mostra a prévia."),
            param("codigo", "corpo", "texto", true, "Código do produto."),
            param("processo_termico", "corpo", "texto", false, "quente ou frio; null limpa."),
            param("exclusivo_no_dia", "corpo", "booleano", false, "true/false; null limpa."),
            param("permite_bombona", "corpo", "booleano", false, "true/false; null limpa."),
            param("dias_ate_envase", "corpo", "inteiro", false, "Dias entre fabricar e envasar (>= 0); null limpa."),
        ],
    )]
}

/// Valor pedido já tipado: ausente no corpo = não mexe; `Value::Null` = limpa.
type Pedido = Vec<(&'static str, Value)>;

/// Lê o corpo: `codigo` + os campos da lista fechada que vieram (chave presente, inclusive `null`).
/// Campo fora da lista é recusado, para o chamador não achar que gravou algo que foi ignorado.
fn ler_corpo(corpo: &Value) -> Result<(String, Pedido), ErroApi> {
    let obj: &Map<String, Value> = corpo.as_object().ok_or_else(|| ErroApi::invalido("Corpo inválido."))?;
    let codigo = obj.get("codigo").and_then(Value::as_str).map(str::trim).unwrap_or("");
    if codigo.is_empty() {
        return Err(ErroApi::invalido("Informe o código do produto."));
    }
    if let Some(k) = obj.keys().find(|k| k.as_str() != "codigo" && !CAMPOS.contains(&k.as_str())) {
        return Err(ErroApi::invalido(format!("Campo não pertence às regras de reator: {k}. Use: {}.", CAMPOS.join(", "))));
    }
    let mut pedido: Pedido = Vec::new();
    for campo in CAMPOS {
        let Some(v) = obj.get(campo) else { continue };
        let tipado = match (campo, v) {
            (_, Value::Null) => Value::Null,
            ("processo_termico", Value::String(s)) => match s.trim().to_lowercase().as_str() {
                "" => Value::Null,
                p @ ("quente" | "frio") => json!(p),
                _ => return Err(ErroApi::invalido("processo_termico deve ser 'quente', 'frio' ou null.")),
            },
            ("exclusivo_no_dia" | "permite_bombona", Value::Bool(b)) => json!(b),
            ("dias_ate_envase", Value::Number(n)) => match n.as_i64() {
                Some(n) if (0..=3650).contains(&n) => json!(n),
                _ => return Err(ErroApi::invalido("dias_ate_envase deve ser um inteiro entre 0 e 3650.")),
            },
            _ => return Err(ErroApi::invalido(format!("Valor inválido para {campo}."))),
        };
        pedido.push((campo, tipado));
    }
    if pedido.is_empty() {
        return Err(ErroApi::invalido(format!("Informe ao menos um campo: {}.", CAMPOS.join(", "))));
    }
    Ok((codigo.to_string(), pedido))
}

fn pode_editar(ctx: &AuthContext) -> Result<(), ErroApi> {
    if ctx.role.is_supervisor() || ctx.can_edit_module(MODULE_PLANEJAMENTO_PRODUCAO) || ctx.can_edit_module(MODULE_PRODUCAO) {
        Ok(())
    } else {
        Err(ErroApi::sem_permissao("Sem permissão para alterar as regras de reator."))
    }
}

/// Valores atuais dos 4 campos + descrição (None = produto não existe).
async fn foto(conn: &mut sqlx::PgConnection, codigo: &str) -> Result<Option<(String, Map<String, Value>)>, ErroApi> {
    let r = sqlx::query(
        "SELECT p.descricao, o.processo_termico, o.exclusivo_no_dia, o.permite_bombona, o.dias_ate_envase \
         FROM produtos p LEFT JOIN overrides_produtos o ON o.codigo = p.codigo WHERE p.codigo = $1",
    )
    .bind(codigo)
    .fetch_optional(&mut *conn)
    .await?;
    Ok(r.map(|r| {
        let mut m = Map::new();
        m.insert("processo_termico".into(), json!(r.get::<Option<String>, _>(1)));
        m.insert("exclusivo_no_dia".into(), json!(r.get::<Option<bool>, _>(2)));
        m.insert("permite_bombona".into(), json!(r.get::<Option<bool>, _>(3)));
        m.insert("dias_ate_envase".into(), json!(r.get::<Option<i32>, _>(4)));
        (r.get::<Option<String>, _>(0).unwrap_or_default(), m)
    }))
}

/// Regras de reator de um produto como estão no cadastro (`None` = sem regra, segue o automático).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RegrasProduto {
    pub processo_termico: Option<String>,
    pub exclusivo_no_dia: Option<bool>,
    pub permite_bombona: Option<bool>,
}

/// Regras dos produtos que têm alguma definida, por código canônico (sem aspas e espaços). Quem não aparece não tem regra.
/// É a leitura única para a sugestão: vale também para item da fila ou ordem do quadro de produto fora da Demanda.
pub async fn carregar_regras(pool: &PgPool) -> Result<std::collections::HashMap<String, RegrasProduto>, ErroApi> {
    let rows = sqlx::query(
        "SELECT codigo, processo_termico, exclusivo_no_dia, permite_bombona FROM overrides_produtos \
         WHERE processo_termico IS NOT NULL OR exclusivo_no_dia IS NOT NULL OR permite_bombona IS NOT NULL",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| {
            let codigo: String = r.get(0);
            (
                codigo.trim().replace('"', ""),
                RegrasProduto { processo_termico: r.get(1), exclusivo_no_dia: r.get(2), permite_bombona: r.get(3) },
            )
        })
        .collect())
}

/// Serviço: define as regras de reator de um produto. 2 passos; só grava com `confirmar`.
/// Reutilizável por agentes e por outros módulos.
pub async fn definir_regras_reator(
    pool: &PgPool,
    ctx: &AuthContext,
    corpo: Value,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    pode_editar(ctx)?;
    let (codigo, pedido) = ler_corpo(&corpo)?;
    let codigo_tx = codigo.clone();
    let resposta = executar_em_2_passos(pool, "definir_regras_reator_produto", confirmar, move |tx| {
        Box::pin(async move {
            let conn: &mut sqlx::PgConnection = &mut **tx;
            let (descricao, antes) = foto(conn, &codigo_tx)
                .await?
                .ok_or_else(|| ErroApi::nao_encontrado(format!("Produto {codigo_tx} não existe.")))?;
            let mudam: Vec<&(&str, Value)> = pedido.iter().filter(|(c, v)| antes.get(*c) != Some(v)).collect();
            if !mudam.is_empty() {
                sqlx::query("INSERT INTO overrides_produtos (codigo) VALUES ($1) ON CONFLICT (codigo) DO NOTHING")
                    .bind(&codigo_tx)
                    .execute(&mut *conn)
                    .await?;
            }
            for (campo, valor) in &mudam {
                // Nome de coluna vem da lista fechada CAMPOS (nunca do chamador).
                let sql = format!("UPDATE overrides_produtos SET {campo} = $2 WHERE codigo = $1");
                let q = sqlx::query(&sql).bind(&codigo_tx);
                match *campo {
                    "processo_termico" => q.bind(valor.as_str().map(str::to_string)).execute(&mut *conn).await?,
                    "dias_ate_envase" => q.bind(valor.as_i64().map(|n| n as i32)).execute(&mut *conn).await?,
                    _ => q.bind(valor.as_bool()).execute(&mut *conn).await?,
                };
            }
            if !mudam.is_empty() {
                // Mesma limpeza do POST /overrides: linha que ficou toda nula/default não deve existir.
                Db::apagar_override_se_vazio(conn, &codigo_tx).await.map_err(ErroApi::interno)?;
            }
            let mudancas: Vec<Value> = mudam
                .iter()
                .map(|(c, v)| json!({ "campo": c, "de": antes.get(*c).cloned().unwrap_or(Value::Null), "para": v }))
                .collect();
            let mut depois = antes.clone();
            for (c, v) in &mudam {
                depois.insert((*c).into(), v.clone());
            }
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
        auditoria::registrar(
            pool,
            &ctx.display_name,
            "definir_regras_reator_produto",
            &codigo,
            json!({ "antes": resposta.resultado["antes"], "depois": resposta.resultado["depois"] }),
        )
        .await;
    }
    Ok(resposta)
}

/// POST /api/producao/produtos/regras-reator (sem `?confirmar=true` só devolve a prévia).
pub async fn definir_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(corpo): Json<Value>,
) -> Response {
    match definir_regras_reator(state.db.pool(), &ctx, corpo, c.confirmar).await {
        Ok(r) => Json(crate::core::acao::corpo_acao(&r)).into_response(),
        Err(e) => e.into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn corpo_recusa_campo_de_outro_dono() {
        let e = ler_corpo(&json!({ "codigo": "1", "status_produto": "ativo" })).unwrap_err();
        assert!(e.corpo()["error"].as_str().unwrap().contains("status_produto"));
    }

    #[test]
    fn corpo_tipa_normaliza_e_distingue_ausente_de_null() {
        let (c, p) = ler_corpo(&json!({ "codigo": " 1 ", "processo_termico": " Quente ", "permite_bombona": null, "dias_ate_envase": 2 })).unwrap();
        assert_eq!(c, "1");
        assert_eq!(p, vec![("processo_termico", json!("quente")), ("permite_bombona", Value::Null), ("dias_ate_envase", json!(2))]);
        assert!(ler_corpo(&json!({ "codigo": "1" })).is_err());
        assert!(ler_corpo(&json!({ "processo_termico": "frio" })).is_err());
    }

    #[test]
    fn corpo_recusa_valor_fora_do_tipo() {
        for c in [
            json!({ "codigo": "1", "processo_termico": "morno" }),
            json!({ "codigo": "1", "exclusivo_no_dia": "sim" }),
            json!({ "codigo": "1", "dias_ate_envase": -1 }),
            json!({ "codigo": "1", "dias_ate_envase": 1.5 }),
        ] {
            assert!(ler_corpo(&c).is_err(), "{c}");
        }
    }
}

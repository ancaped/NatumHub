//! Sublinhas da Linha de Produtos (decisão do Edson, 2026-11-14).
//! Uma sublinha aponta para uma linha principal (`config_linhas.linha_principal`) e, por parâmetro, herda o valor dela
//! (`herda_*`) ou tem valor próprio. As colunas de valor de `config_linhas` guardam sempre o valor EFETIVO: Produção e
//! Compras continuam lendo `config_linhas` e recebem o número já resolvido. Este módulo é o único que mantém essa cópia
//! (`propagar`); ações em 2 passos com auditoria; só um nível; DEFAULT não entra.
use serde_json::{json, Map, Value};
use sqlx::{PgConnection, PgPool, Row};

use crate::core::acao::{executar_em_2_passos, ErroApi, RespostaAcao};
use crate::core::regras_produto::{ATENDIMENTOS, LINHA_EFETIVA_SQL};
use crate::modules::administrativo::classificacao::atendimento::{sincronizar_status, Alvo};
use crate::modules::geral::audit;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::MODULE_ADMIN_LINHA_PRODUTOS;

const MODULO_AUDITORIA: &str = "admin_linha_produtos";

/// Parâmetros que uma sublinha pode herdar: (chave na API, rótulo, coluna do valor, coluna da marca).
pub const PARAMETROS: [(&str, &str, &str, &str); 5] = [
    ("estoque_ideal", "Estoque ideal", "estoque_ideal_mult", "herda_estoque_ideal"),
    ("abrir_ordem", "Abrir ordem", "abrir_ordem_mult", "herda_abrir_ordem"),
    ("abrir_prod", "Abrir produção", "abrir_prod_mult", "herda_abrir_prod"),
    ("fator_z", "Fator Z", "fator_seguranca_z", "herda_fator_z"),
    ("atendimento", "Atendimento", "atendimento", "herda_atendimento"),
];

fn parametro(chave: &str) -> Option<&'static (&'static str, &'static str, &'static str, &'static str)> {
    PARAMETROS.iter().find(|p| p.0 == chave)
}

fn pode_editar(ctx: &AuthContext) -> Result<(), ErroApi> {
    if ctx.role.is_supervisor() || ctx.can_edit_module(MODULE_ADMIN_LINHA_PRODUTOS) {
        Ok(())
    } else {
        Err(ErroApi::sem_permissao("Sem permissão para editar Linha de Produtos."))
    }
}

// ---------- regras puras ----------

/// Valor efetivo de um parâmetro: o da principal quando herda, senão o próprio.
pub fn valor_efetivo<T>(proprio: T, da_principal: T, herda: bool) -> T {
    if herda {
        da_principal
    } else {
        proprio
    }
}

/// O que se sabe de uma linha para validar a escolha da principal.
pub struct EstadoPrincipal {
    pub existe: bool,
    /// A linha escolhida como principal já é sublinha de outra.
    pub e_sublinha: bool,
}

/// Regras de integridade: só um nível, linha não é principal de si mesma, DEFAULT não entra.
pub fn validar_principal(prefixo: &str, principal: &str, tem_sublinhas: bool, estado: &EstadoPrincipal) -> Result<(), String> {
    if prefixo == "DEFAULT" || principal == "DEFAULT" {
        return Err("A linha DEFAULT (produtos sem linha) não participa de sublinhas.".into());
    }
    if prefixo == principal {
        return Err("Uma linha não pode ser a principal de si mesma.".into());
    }
    if !estado.existe {
        return Err(format!("A linha principal {principal} não existe."));
    }
    if estado.e_sublinha {
        return Err(format!("{principal} já é sublinha de outra linha: só há um nível (sublinha não tem sublinha)."));
    }
    if tem_sublinhas {
        return Err(format!("{prefixo} já tem sublinhas: uma linha com sublinhas não pode virar sublinha."));
    }
    Ok(())
}

pub fn validar_valor(chave: &str, valor: &Value) -> Result<Value, String> {
    if chave == "atendimento" {
        let a = valor.as_str().unwrap_or("").trim();
        if ATENDIMENTOS.contains(&a) {
            return Ok(json!(a));
        }
        return Err(format!("Atendimento desconhecido: {a}. Use um de: {}.", ATENDIMENTOS.join(", ")));
    }
    match valor.as_f64() {
        Some(v) if v.is_finite() && v > 0.0 => Ok(json!(v)),
        _ => Err("O valor deve ser um número maior que zero.".into()),
    }
}

// ---------- parte com banco ----------

#[derive(Debug, Clone, PartialEq)]
struct Foto {
    prefixo: String,
    nome: String,
    valores: [String; 5],
    visivel: i32,
    produtos: i64,
}

async fn fotografar(conn: &mut PgConnection, principal: &str) -> Result<Vec<Foto>, sqlx::Error> {
    let linhas = sqlx::query(&format!(
        "SELECT c.linha_prefix, c.nome_linha, c.estoque_ideal_mult::text, c.abrir_ordem_mult::text, c.abrir_prod_mult::text, \
                c.fator_seguranca_z::text, c.atendimento, c.visivel, \
                (SELECT COUNT(*) FROM produtos p LEFT JOIN overrides_produtos o ON o.codigo = p.codigo WHERE {LINHA_EFETIVA_SQL} = c.linha_prefix) \
         FROM config_linhas c WHERE c.linha_principal = $1 ORDER BY c.linha_prefix"
    ))
    .bind(principal)
    .fetch_all(&mut *conn)
    .await?;
    Ok(linhas
        .iter()
        .map(|r| Foto {
            prefixo: r.get(0),
            nome: r.get(1),
            valores: [r.get(2), r.get(3), r.get(4), r.get(5), r.get(6)],
            visivel: r.get(7),
            produtos: r.get(8),
        })
        .collect())
}

/// Sublinha que mudou de efeito ao propagar.
pub struct Mudanca {
    pub prefixo: String,
    pub nome: String,
    pub produtos: i64,
    pub parametros: Vec<&'static str>,
    pub escondida: bool,
    pub reaparece: bool,
}

impl Mudanca {
    pub fn json(&self) -> Value {
        json!({ "prefixo": self.prefixo, "nome": self.nome, "produtos": self.produtos, "parametros": self.parametros,
                "escondida": self.escondida, "reaparece": self.reaparece })
    }
}

/// Recalcula as sublinhas de `principal`: parâmetros herdados recebem o valor da principal e a visibilidade vale
/// "própria E principal ativa". Devolve só as sublinhas cujo efeito mudou. Mantém o status espelho de Produção/Compras.
pub async fn propagar(conn: &mut PgConnection, principal: &str) -> Result<Vec<Mudanca>, sqlx::Error> {
    let antes = fotografar(conn, principal).await?;
    if antes.is_empty() {
        return Ok(vec![]);
    }
    sqlx::query(
        "UPDATE config_linhas s SET \
            estoque_ideal_mult = CASE WHEN s.herda_estoque_ideal THEN p.estoque_ideal_mult ELSE s.estoque_ideal_mult END, \
            abrir_ordem_mult = CASE WHEN s.herda_abrir_ordem THEN p.abrir_ordem_mult ELSE s.abrir_ordem_mult END, \
            abrir_prod_mult = CASE WHEN s.herda_abrir_prod THEN p.abrir_prod_mult ELSE s.abrir_prod_mult END, \
            fator_seguranca_z = CASE WHEN s.herda_fator_z THEN p.fator_seguranca_z ELSE s.fator_seguranca_z END, \
            atendimento = CASE WHEN s.herda_atendimento THEN p.atendimento ELSE s.atendimento END, \
            visivel = CASE WHEN p.visivel = 0 THEN 0 ELSE s.visivel_proprio END \
         FROM config_linhas p WHERE p.linha_prefix = $1 AND s.linha_principal = p.linha_prefix",
    )
    .bind(principal)
    .execute(&mut *conn)
    .await?;
    let depois = fotografar(conn, principal).await?;
    let mut mudancas = vec![];
    for (a, d) in antes.iter().zip(depois.iter()) {
        if a == d {
            continue;
        }
        let parametros: Vec<&'static str> =
            PARAMETROS.iter().enumerate().filter(|(i, _)| a.valores[*i] != d.valores[*i]).map(|(_, p)| p.1).collect();
        if a.valores[4] != d.valores[4] {
            sincronizar_status(conn, Alvo::Linha(&d.prefixo)).await?;
        }
        mudancas.push(Mudanca {
            prefixo: d.prefixo.clone(),
            nome: d.nome.clone(),
            produtos: d.produtos,
            parametros,
            escondida: a.visivel != 0 && d.visivel == 0,
            reaparece: a.visivel == 0 && d.visivel != 0,
        });
    }
    Ok(mudancas)
}

/// Depois de qualquer gravação em `config_linhas` fora deste módulo (PUT /api/configs): a escolha de ativa/inativa
/// vira a escolha própria da linha e as sublinhas (ou a própria sublinha) são recalculadas.
pub async fn reaplicar(conn: &mut PgConnection, prefixo: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE config_linhas SET visivel_proprio = visivel WHERE linha_prefix = $1").bind(prefixo).execute(&mut *conn).await?;
    let principal: Option<String> =
        sqlx::query_scalar("SELECT linha_principal FROM config_linhas WHERE linha_prefix = $1").bind(prefixo).fetch_optional(&mut *conn).await?.flatten();
    propagar(conn, principal.as_deref().unwrap_or(prefixo)).await?;
    Ok(())
}

/// Ao excluir uma linha principal as sublinhas viram linhas próprias, com os valores que já tinham (nada muda de número).
pub async fn soltar_sublinhas(conn: &mut PgConnection, principal: &str) -> Result<u64, sqlx::Error> {
    Ok(sqlx::query(
        "UPDATE config_linhas SET linha_principal = NULL, herda_estoque_ideal = FALSE, herda_abrir_ordem = FALSE, \
            herda_abrir_prod = FALSE, herda_fator_z = FALSE, herda_atendimento = FALSE, visivel = visivel_proprio \
         WHERE linha_principal = $1",
    )
    .bind(principal)
    .execute(&mut *conn)
    .await?
    .rows_affected())
}

fn resumo_mudancas(m: &[Mudanca]) -> Value {
    json!({
        "sublinhasAfetadas": m.len(),
        "produtosAfetados": m.iter().map(|x| x.produtos).sum::<i64>(),
        "sublinhas": m.iter().map(Mudanca::json).collect::<Vec<_>>(),
    })
}

struct LinhaLida {
    nome: String,
    principal: Option<String>,
    herda: [bool; 5],
    valores: [Value; 5],
    visivel: i32,
}

async fn ler_linha(conn: &mut PgConnection, prefixo: &str) -> Result<LinhaLida, ErroApi> {
    let r = sqlx::query(
        "SELECT nome_linha, linha_principal, herda_estoque_ideal, herda_abrir_ordem, herda_abrir_prod, herda_fator_z, herda_atendimento, \
                estoque_ideal_mult::float8, abrir_ordem_mult::float8, abrir_prod_mult::float8, fator_seguranca_z::float8, atendimento, visivel \
         FROM config_linhas WHERE linha_prefix = $1 FOR UPDATE",
    )
    .bind(prefixo)
    .fetch_optional(&mut *conn)
    .await?
    .ok_or_else(|| ErroApi::nao_encontrado(format!("Linha {prefixo} não existe.")))?;
    Ok(LinhaLida {
        nome: r.get(0),
        principal: r.get(1),
        herda: [r.get(2), r.get(3), r.get(4), r.get(5), r.get(6)],
        valores: [json!(r.get::<f64, _>(7)), json!(r.get::<f64, _>(8)), json!(r.get::<f64, _>(9)), json!(r.get::<f64, _>(10)), json!(r.get::<String, _>(11))],
        visivel: r.get(12),
    })
}

fn estado_json(l: &LinhaLida) -> Value {
    let mut m = Map::new();
    m.insert("linhaPrincipal".into(), json!(l.principal));
    for (i, p) in PARAMETROS.iter().enumerate() {
        m.insert(p.0.into(), json!({ "valor": l.valores[i], "herda": l.herda[i] }));
    }
    Value::Object(m)
}

async fn auditar(pool: &PgPool, ctx: &AuthContext, acao: &str, prefixo: &str, texto: String, antes: Value, depois: Value) {
    audit::record_domain(pool, Some(ctx), MODULO_AUDITORIA, acao, "linha_produto", prefixo, &texto, Some(antes), Some(depois)).await;
}

/// Serviço: define (ou tira, com `None`) a linha principal. Ao virar sublinha os valores atuais continuam próprios.
pub async fn definir_linha_principal(
    pool: &PgPool,
    ctx: &AuthContext,
    prefixo: &str,
    principal: Option<String>,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    pode_editar(ctx)?;
    let prefixo = prefixo.trim().to_string();
    let principal = principal.map(|p| p.trim().to_string()).filter(|p| !p.is_empty());
    let (p, nova) = (prefixo.clone(), principal.clone());
    let resposta = executar_em_2_passos(pool, "definir_linha_principal", confirmar, move |tx| {
        Box::pin(async move {
            let conn: &mut sqlx::PgConnection = &mut **tx;
            if p == "DEFAULT" {
                return Err(ErroApi::regra("A linha DEFAULT (produtos sem linha) não participa de sublinhas."));
            }
            let antes = ler_linha(&mut *conn, &p).await?;
            let sublinhas: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM config_linhas WHERE linha_principal = $1").bind(&p).fetch_one(&mut *conn).await?;
            let mut escondida = false;
            if let Some(n) = nova.as_deref() {
                let linha_n = sqlx::query("SELECT linha_principal FROM config_linhas WHERE linha_prefix = $1")
                    .bind(n)
                    .fetch_optional(&mut *conn)
                    .await?;
                let estado = EstadoPrincipal {
                    existe: linha_n.is_some(),
                    e_sublinha: linha_n.as_ref().map(|r| r.get::<Option<String>, _>(0).is_some()).unwrap_or(false),
                };
                validar_principal(&p, n, sublinhas > 0, &estado).map_err(ErroApi::regra)?;
                // Os valores atuais continuam próprios: só a marca de principal entra.
                sqlx::query("UPDATE config_linhas SET linha_principal = $2, visivel_proprio = visivel WHERE linha_prefix = $1")
                    .bind(&p)
                    .bind(n)
                    .execute(&mut *conn)
                    .await?;
                let m = propagar(&mut *conn, n).await?;
                escondida = m.iter().any(|x| x.prefixo == p && x.escondida);
            } else {
                if antes.principal.is_none() {
                    return Err(ErroApi::regra(format!("{p} já é uma linha própria (não tem linha principal).")));
                }
                // Os valores efetivos de agora ficam como próprios; a visibilidade volta a ser a escolha da própria linha.
                sqlx::query(
                    "UPDATE config_linhas SET linha_principal = NULL, herda_estoque_ideal = FALSE, herda_abrir_ordem = FALSE, \
                        herda_abrir_prod = FALSE, herda_fator_z = FALSE, herda_atendimento = FALSE, visivel = visivel_proprio WHERE linha_prefix = $1",
                )
                .bind(&p)
                .execute(&mut *conn)
                .await?;
            }
            let depois = ler_linha(&mut *conn, &p).await?;
            let produtos: i64 = sqlx::query_scalar(&format!(
                "SELECT COUNT(*) FROM produtos p LEFT JOIN overrides_produtos o ON o.codigo = p.codigo WHERE {LINHA_EFETIVA_SQL} = $1"
            ))
            .bind(&p)
            .fetch_one(&mut *conn)
            .await?;
            let mut avisos = vec![];
            if nova.is_some() {
                avisos.push("Os valores atuais da linha continuam como próprios: nenhum número muda. Escolha depois o que volta a herdar da principal.");
            } else {
                avisos.push("A linha deixa de ser sublinha e fica com os valores que tem agora.");
            }
            if escondida {
                avisos.push("A principal está inativa: esta linha passa a ficar escondida junto com ela.");
            }
            Ok(json!({
                "prefixo": p, "nomeLinha": depois.nome, "linhaPrincipalAntes": antes.principal, "linhaPrincipalDepois": nova,
                "muda": antes.principal != nova, "produtosNaLinha": produtos, "escondidaPelaPrincipal": escondida,
                "antes": estado_json(&antes), "depois": estado_json(&depois), "avisos": avisos,
            }))
        })
    })
    .await?;
    if confirmar && resposta.resultado["muda"] == json!(true) {
        auditar(pool, ctx, "definir_linha_principal", &prefixo, format!("Linha {prefixo}: linha principal alterada"), resposta.resultado["antes"].clone(), resposta.resultado["depois"].clone()).await;
    }
    Ok(resposta)
}

/// Serviço: marca um parâmetro como próprio (com valor) ou volta a herdar da principal. Em linha principal ou isolada,
/// `proprio` com valor muda o valor e as sublinhas que herdam acompanham (a prévia diz quantos produtos mudam).
pub async fn parametro_linha(
    pool: &PgPool,
    ctx: &AuthContext,
    prefixo: &str,
    chave: &str,
    modo: &str,
    valor: Option<Value>,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    pode_editar(ctx)?;
    let (_, rotulo, col_valor, col_herda) = *parametro(chave).ok_or_else(|| {
        ErroApi::invalido(format!("Parâmetro desconhecido: {chave}. Use um de: {}.", PARAMETROS.iter().map(|p| p.0).collect::<Vec<_>>().join(", ")))
    })?;
    let idx = PARAMETROS.iter().position(|p| p.0 == chave).unwrap_or(0);
    if modo != "proprio" && modo != "herdar" {
        return Err(ErroApi::invalido("`modo` deve ser `proprio` ou `herdar`."));
    }
    let novo = match (modo, valor) {
        ("proprio", Some(v)) => Some(validar_valor(chave, &v).map_err(ErroApi::regra)?),
        _ => None,
    };
    let prefixo = prefixo.trim().to_string();
    let p = prefixo.clone();
    let modo_s = modo.to_string();
    let chave_s = chave.to_string();
    let resposta = executar_em_2_passos(pool, "parametro_linha", confirmar, move |tx| {
        Box::pin(async move {
            let conn: &mut sqlx::PgConnection = &mut **tx;
            let antes = ler_linha(&mut *conn, &p).await?;
            let principal = antes.principal.clone();
            let mut afetados = vec![];
            if modo_s == "herdar" {
                let Some(pai) = principal.as_deref() else {
                    return Err(ErroApi::regra(format!("{p} não é sublinha: não há principal para herdar.")));
                };
                if antes.herda[idx] {
                    return Err(ErroApi::regra(format!("{rotulo} já é herdado da principal {pai}.")));
                }
                sqlx::query(&format!("UPDATE config_linhas SET {col_herda} = TRUE WHERE linha_prefix = $1")).bind(&p).execute(&mut *conn).await?;
                afetados = propagar(&mut *conn, pai).await?;
            } else if let Some(v) = novo.as_ref() {
                if antes.herda[idx] {
                    // Marca como próprio e já grava o valor novo.
                    sqlx::query(&format!("UPDATE config_linhas SET {col_herda} = FALSE WHERE linha_prefix = $1")).bind(&p).execute(&mut *conn).await?;
                }
                if chave_s == "atendimento" {
                    sqlx::query("UPDATE config_linhas SET atendimento = $2 WHERE linha_prefix = $1").bind(&p).bind(v.as_str().unwrap_or("estoque")).execute(&mut *conn).await?;
                    sincronizar_status(&mut *conn, Alvo::Linha(&p)).await?;
                } else {
                    sqlx::query(&format!("UPDATE config_linhas SET {col_valor} = $2 WHERE linha_prefix = $1")).bind(&p).bind(v.as_f64().unwrap_or(1.0)).execute(&mut *conn).await?;
                }
                afetados = propagar(&mut *conn, &p).await?;
            } else {
                // `proprio` sem valor: só tira a marca de herdar, mantendo o valor de agora (o número não muda).
                if principal.is_none() || !antes.herda[idx] {
                    return Err(ErroApi::invalido("Informe `valor` para mudar o parâmetro."));
                }
                sqlx::query(&format!("UPDATE config_linhas SET {col_herda} = FALSE WHERE linha_prefix = $1")).bind(&p).execute(&mut *conn).await?;
            }
            let depois = ler_linha(&mut *conn, &p).await?;
            let produtos_da_linha: i64 = sqlx::query_scalar(&format!(
                "SELECT COUNT(*) FROM produtos p LEFT JOIN overrides_produtos o ON o.codigo = p.codigo WHERE {LINHA_EFETIVA_SQL} = $1"
            ))
            .bind(&p)
            .fetch_one(&mut *conn)
            .await?;
            let mut r = resumo_mudancas(&afetados);
            let proprio_efeito = antes.valores[idx] != depois.valores[idx];
            // Produtos que mudam: os das sublinhas afetadas (em "herdar" a própria sublinha já está nelas) e, quando a própria linha muda de número, os dela.
            let produtos_afetados = r["produtosAfetados"].as_i64().unwrap_or(0) + if proprio_efeito && modo_s != "herdar" { produtos_da_linha } else { 0 };
            r["produtosAfetados"] = json!(produtos_afetados);
            r["prefixo"] = json!(p);
            r["nomeLinha"] = json!(depois.nome);
            r["parametro"] = json!(rotulo);
            r["muda"] = json!(proprio_efeito || antes.herda[idx] != depois.herda[idx]);
            r["valorMuda"] = json!(proprio_efeito);
            r["produtosNaLinha"] = json!(produtos_da_linha);
            r["antes"] = estado_json(&antes);
            r["depois"] = estado_json(&depois);
            Ok(r)
        })
    })
    .await?;
    if confirmar && resposta.resultado["muda"] == json!(true) {
        auditar(pool, ctx, "parametro_linha", &prefixo, format!("Linha {prefixo}: {rotulo} ({modo})"), resposta.resultado["antes"].clone(), resposta.resultado["depois"].clone()).await;
    }
    Ok(resposta)
}

/// Leitura para a tela: principal, marcas de herança e escolha própria de ativa/inativa de cada linha.
pub async fn listar_heranca(pool: &PgPool) -> Result<Value, ErroApi> {
    let rows = sqlx::query(
        "SELECT linha_prefix, linha_principal, herda_estoque_ideal, herda_abrir_ordem, herda_abrir_prod, herda_fator_z, herda_atendimento, \
                visivel_proprio, atendimento FROM config_linhas",
    )
    .fetch_all(pool)
    .await?;
    let mut m = Map::new();
    for r in &rows {
        m.insert(
            r.get::<String, _>(0),
            json!({
                "linhaPrincipal": r.get::<Option<String>, _>(1),
                "herda": { "estoque_ideal": r.get::<bool, _>(2), "abrir_ordem": r.get::<bool, _>(3), "abrir_prod": r.get::<bool, _>(4),
                           "fator_z": r.get::<bool, _>(5), "atendimento": r.get::<bool, _>(6) },
                "ativaPropria": r.get::<i32, _>(7) != 0,
                "atendimento": r.get::<String, _>(8),
            }),
        );
    }
    Ok(json!({ "linhas": m }))
}

#[cfg(test)]
mod testes {
    use super::*;

    fn estado(existe: bool, e_sublinha: bool) -> EstadoPrincipal {
        EstadoPrincipal { existe, e_sublinha }
    }

    #[test]
    fn heranca_usa_valor_da_principal_so_quando_herda() {
        assert_eq!(valor_efetivo(2.0, 3.0, true), 3.0);
        assert_eq!(valor_efetivo(2.0, 3.0, false), 2.0);
        assert_eq!(valor_efetivo("encomenda", "estoque", true), "estoque");
    }

    #[test]
    fn integridade_das_sublinhas() {
        assert!(validar_principal("B", "A", false, &estado(true, false)).is_ok());
        assert!(validar_principal("A", "A", false, &estado(true, false)).is_err(), "não é principal de si mesma");
        assert!(validar_principal("B", "DEFAULT", false, &estado(true, false)).is_err());
        assert!(validar_principal("DEFAULT", "A", false, &estado(true, false)).is_err());
        assert!(validar_principal("B", "A", false, &estado(false, false)).is_err(), "principal precisa existir");
        assert!(validar_principal("B", "A", false, &estado(true, true)).is_err(), "sublinha não tem sublinha");
        assert!(validar_principal("B", "A", true, &estado(true, false)).is_err(), "linha com sublinhas não vira sublinha");
    }

    #[test]
    fn valores_validados() {
        assert!(validar_valor("estoque_ideal", &json!(1.5)).is_ok());
        assert!(validar_valor("fator_z", &json!(0)).is_err());
        assert!(validar_valor("fator_z", &json!(-1)).is_err());
        assert!(validar_valor("atendimento", &json!("encomenda")).is_ok());
        assert!(validar_valor("atendimento", &json!("outro")).is_err());
    }

    // ---- com banco (CI: NEXUS_TEST_DATABASE_URL) ----
    use crate::modules::geral::auth::models::{Origem, OperatorRole};
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

    async fn linha(pool: &PgPool, p: &str) -> (f64, f64, String, i32) {
        sqlx::query_as("SELECT estoque_ideal_mult::float8, abrir_ordem_mult::float8, atendimento, visivel FROM config_linhas WHERE linha_prefix = $1")
            .bind(p)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn sublinha_herda_valor_da_principal_e_inativa_junto() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        sqlx::raw_sql(include_str!("../../../../supabase/121_linhas_sublinhas.sql")).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM config_linhas WHERE linha_prefix IN ('ZZSP', 'ZZSS', 'ZZSX')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO config_linhas (linha_prefix, nome_linha, estoque_ideal_mult, abrir_ordem_mult) VALUES ('ZZSP', 'Principal', 2.0, 1.5), ('ZZSS', 'Sub', 6.0, 4.0), ('ZZSX', 'Outra', 3.0, 3.0)")
            .execute(&pool)
            .await
            .unwrap();
        let ctx = supervisor();

        // prévia não grava
        let r = definir_linha_principal(&pool, &ctx, "ZZSS", Some("ZZSP".into()), false).await.unwrap();
        assert!(r.previa);
        assert_eq!(sqlx::query_scalar::<_, Option<String>>("SELECT linha_principal FROM config_linhas WHERE linha_prefix = 'ZZSS'").fetch_one(&pool).await.unwrap(), None);
        // regras de integridade
        assert!(definir_linha_principal(&pool, &ctx, "ZZSP", Some("ZZSP".into()), true).await.is_err());
        assert!(definir_linha_principal(&pool, &ctx, "ZZSS", Some("DEFAULT".into()), true).await.is_err());
        assert!(definir_linha_principal(&pool, &ctx, "ZZSS", Some("NAOEXISTE".into()), true).await.is_err());
        // vira sublinha: nenhum número muda
        definir_linha_principal(&pool, &ctx, "ZZSS", Some("ZZSP".into()), true).await.unwrap();
        assert_eq!(linha(&pool, "ZZSS").await, (6.0, 4.0, "estoque".into(), 1));
        // um nível só
        assert!(definir_linha_principal(&pool, &ctx, "ZZSX", Some("ZZSS".into()), true).await.is_err(), "sublinha não tem sublinha");
        // herda: a prévia conta, a gravação copia o valor da principal
        let r = parametro_linha(&pool, &ctx, "ZZSS", "estoque_ideal", "herdar", None, false).await.unwrap();
        assert_eq!(r.resultado["sublinhasAfetadas"], json!(1));
        assert_eq!(linha(&pool, "ZZSS").await.0, 6.0);
        parametro_linha(&pool, &ctx, "ZZSS", "estoque_ideal", "herdar", None, true).await.unwrap();
        assert_eq!(linha(&pool, "ZZSS").await.0, 2.0);
        assert_eq!(linha(&pool, "ZZSS").await.1, 4.0, "o que não herda continua próprio");
        // mudar a principal vale para quem herda, não para quem tem valor próprio
        parametro_linha(&pool, &ctx, "ZZSP", "estoque_ideal", "proprio", Some(json!(2.5)), true).await.unwrap();
        parametro_linha(&pool, &ctx, "ZZSP", "abrir_ordem", "proprio", Some(json!(1.8)), true).await.unwrap();
        assert_eq!(linha(&pool, "ZZSS").await.0, 2.5);
        assert_eq!(linha(&pool, "ZZSS").await.1, 4.0);
        // valor próprio solta a herança
        parametro_linha(&pool, &ctx, "ZZSS", "estoque_ideal", "proprio", Some(json!(5.0)), true).await.unwrap();
        parametro_linha(&pool, &ctx, "ZZSP", "estoque_ideal", "proprio", Some(json!(2.7)), true).await.unwrap();
        assert_eq!(linha(&pool, "ZZSS").await.0, 5.0);
        // inativar a principal esconde a sublinha; reativar devolve
        let r = crate::modules::administrativo::linhas::classificar_linha(&pool, &ctx, "ZZSP", None, Some(false), false).await.unwrap();
        assert_eq!(r.resultado["sublinhasEscondidas"].as_array().unwrap().len(), 1);
        crate::modules::administrativo::linhas::classificar_linha(&pool, &ctx, "ZZSP", None, Some(false), true).await.unwrap();
        assert_eq!(linha(&pool, "ZZSS").await.3, 0);
        crate::modules::administrativo::linhas::classificar_linha(&pool, &ctx, "ZZSP", None, Some(true), true).await.unwrap();
        assert_eq!(linha(&pool, "ZZSS").await.3, 1);
        // tirar a principal mantém os valores
        definir_linha_principal(&pool, &ctx, "ZZSS", None, true).await.unwrap();
        assert_eq!(linha(&pool, "ZZSS").await.0, 5.0);

        sqlx::query("DELETE FROM config_linhas WHERE linha_prefix IN ('ZZSP', 'ZZSS', 'ZZSX')").execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM hub_audit_events WHERE entity_id IN ('ZZSP', 'ZZSS', 'ZZSX')").execute(&pool).await.unwrap();
    }
}

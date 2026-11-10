//! Atendimento padrão e Ativa/Inativa da linha (L1). Ativa/Inativa usa `config_linhas.visivel` (0 = inativa), que já
//! esconde a linha e os produtos dela em Produção, Compras, "onde é usado" dos insumos e relatórios.
//! 2 passos com auditoria; o status que Produção e Compras leem acompanha o atendimento da linha.
use serde_json::{json, Map, Value};
use sqlx::{PgPool, Row};

use crate::core::acao::{executar_em_2_passos, ErroApi, RespostaAcao};
use crate::core::regras_produto::{ATENDIMENTOS, LINHA_EFETIVA_SQL};
use crate::modules::administrativo::classificacao::atendimento::{sincronizar_status, Alvo};
use crate::modules::geral::audit;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::MODULE_ADMIN_LINHA_PRODUTOS;

const MODULO_AUDITORIA: &str = "admin_linha_produtos";

fn pode_editar(ctx: &AuthContext) -> Result<(), ErroApi> {
    if ctx.role.is_supervisor() || ctx.can_edit_module(MODULE_ADMIN_LINHA_PRODUTOS) {
        Ok(())
    } else {
        Err(ErroApi::sem_permissao("Sem permissão para editar Linha de Produtos."))
    }
}

/// Serviço: muda o atendimento padrão e/ou ativa/inativa da linha. `None` = não mexe. Sem `confirmar` só prévia.
pub async fn classificar_linha(
    pool: &PgPool,
    ctx: &AuthContext,
    prefixo: &str,
    atendimento: Option<String>,
    ativa: Option<bool>,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    pode_editar(ctx)?;
    let prefixo = prefixo.trim().to_string();
    if atendimento.is_none() && ativa.is_none() {
        return Err(ErroApi::invalido("Informe `atendimento` e/ou `ativa`."));
    }
    if let Some(a) = atendimento.as_deref() {
        if !ATENDIMENTOS.contains(&a) {
            return Err(ErroApi::regra(format!("Atendimento desconhecido: {a}. Use um de: {}.", ATENDIMENTOS.join(", "))));
        }
    }
    let p = prefixo.clone();
    let resposta = executar_em_2_passos(pool, "classificar_linha", confirmar, move |tx| {
        Box::pin(async move {
            let conn: &mut sqlx::PgConnection = &mut **tx;
            let linha = sqlx::query("SELECT nome_linha, atendimento, visivel FROM config_linhas WHERE linha_prefix = $1 FOR UPDATE")
                .bind(&p)
                .fetch_optional(&mut *conn)
                .await?
                .ok_or_else(|| ErroApi::nao_encontrado(format!("Linha {p} não existe.")))?;
            let nome: String = linha.get(0);
            let atend_antes: String = linha.get(1);
            let ativa_antes = linha.get::<i32, _>(2) != 0;
            if p == "DEFAULT" && ativa == Some(false) {
                return Err(ErroApi::regra("A linha DEFAULT (produtos sem linha) não pode ser inativada."));
            }
            let produtos: i64 = sqlx::query_scalar(&format!(
                "SELECT COUNT(*) FROM produtos p LEFT JOIN overrides_produtos o ON o.codigo = p.codigo WHERE {LINHA_EFETIVA_SQL} = $1"
            ))
            .bind(&p)
            .fetch_one(&mut *conn)
            .await?;
            let com_excecao: i64 = sqlx::query_scalar(&format!(
                "SELECT COUNT(*) FROM produtos p JOIN overrides_produtos o ON o.codigo = p.codigo \
                 WHERE {LINHA_EFETIVA_SQL} = $1 AND o.atendimento IS NOT NULL"
            ))
            .bind(&p)
            .fetch_one(&mut *conn)
            .await?;
            let atend_depois = atendimento.clone().unwrap_or_else(|| atend_antes.clone());
            let ativa_depois = ativa.unwrap_or(ativa_antes);
            sqlx::query("UPDATE config_linhas SET atendimento = $2, visivel = $3 WHERE linha_prefix = $1")
                .bind(&p)
                .bind(&atend_depois)
                .bind(if ativa_depois { 1 } else { 0 })
                .execute(&mut *conn)
                .await?;
            let status_mudam = if atend_depois != atend_antes {
                sincronizar_status(conn, Alvo::Linha(&p)).await?
            } else {
                0
            };
            let mut antes = Map::new();
            antes.insert("atendimento".into(), json!(atend_antes));
            antes.insert("ativa".into(), json!(ativa_antes));
            let mut depois = Map::new();
            depois.insert("atendimento".into(), json!(atend_depois));
            depois.insert("ativa".into(), json!(ativa_depois));
            let mut avisos = vec!["Produtos com exceção de atendimento (marcada no produto) não mudam com o padrão da linha."];
            if !ativa_depois {
                avisos.push("Linha inativa: a linha e os produtos dela somem das telas e do onde é usado dos insumos; o histórico fica guardado.");
            }
            Ok(json!({
                "prefixo": p,
                "nomeLinha": nome,
                "muda": atend_antes != atend_depois || ativa_antes != ativa_depois,
                "antes": antes,
                "depois": depois,
                "produtosNaLinha": produtos,
                "produtosComExcecaoDeAtendimento": com_excecao,
                "produtosQueMudamDeEfeito": status_mudam,
                "avisos": avisos,
            }))
        })
    })
    .await?;
    if confirmar && resposta.resultado["muda"] == json!(true) {
        audit::record_domain(
            pool,
            Some(ctx),
            MODULO_AUDITORIA,
            "classificar_linha",
            "linha_produto",
            &prefixo,
            &format!("Linha {prefixo}: atendimento padrão / ativa alterados"),
            Some(resposta.resultado["antes"].clone()),
            Some(resposta.resultado["depois"].clone()),
        )
        .await;
    }
    Ok(resposta)
}

/// Leitura enxuta para a tela: atendimento e ativa de cada linha, e os produtos com exceção de atendimento
/// ou que não geram demanda por herança da linha.
pub async fn listar_atendimentos(pool: &PgPool) -> Result<Value, ErroApi> {
    let linhas = sqlx::query("SELECT linha_prefix, atendimento, visivel FROM config_linhas").fetch_all(pool).await?;
    let mut l = Map::new();
    for r in &linhas {
        l.insert(r.get::<String, _>(0), json!({ "atendimento": r.get::<String, _>(1), "ativa": r.get::<i32, _>(2) != 0 }));
    }
    let prods = sqlx::query(&format!(
        "SELECT p.codigo, o.situacao, o.atendimento, cl.atendimento FROM produtos p \
         JOIN overrides_produtos o ON o.codigo = p.codigo \
         LEFT JOIN config_linhas cl ON cl.linha_prefix = {LINHA_EFETIVA_SQL} \
         WHERE o.atendimento IS NOT NULL OR o.situacao IS NOT NULL AND o.situacao <> 'ativo' OR cl.atendimento <> 'estoque'"
    ))
    .fetch_all(pool)
    .await?;
    let mut m = Map::new();
    for r in &prods {
        let atd: Option<String> = r.get(2);
        let linha: Option<String> = r.get(3);
        let efetivo = crate::core::regras_produto::atendimento_efetivo(atd.as_deref(), linha.as_deref());
        m.insert(
            r.get::<String, _>(0),
            json!({ "situacao": r.get::<Option<String>, _>(1).unwrap_or_else(|| "ativo".into()), "atendimento": atd, "atendimentoEfetivo": efetivo }),
        );
    }
    Ok(json!({ "linhas": l, "produtos": m }))
}

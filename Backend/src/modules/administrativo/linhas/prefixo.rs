//! Troca do prefixo de uma linha (`config_linhas.linha_prefix`). O prefixo é a chave da linha: `produtos.linha_prefix`
//! o referencia, `overrides_produtos.linha_prefix_manual` e `producao_regras` (escopo linha) guardam o texto.
//! Ação em 2 passos: a prévia mostra quem entra e quem sai da linha; só `confirmar=true` grava (numa transação) e audita.
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::core::acao::{executar_em_2_passos, ErroApi, RespostaAcao};
use crate::core::regras_produto::{carregar_prefixos_linhas, linha_do_codigo, prefixos_equivalentes};
use crate::modules::geral::audit;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::MODULE_ADMIN_LINHA_PRODUTOS;

const MODULO_AUDITORIA: &str = "admin_linha_produtos";
/// Quantos produtos cada lista da prévia traz (os totais são sempre completos).
const LIMITE_LISTA: usize = 100;

/// Resultado do cálculo puro: quem muda de linha por causa da troca.
#[derive(Debug, Default, PartialEq)]
pub struct TrocaDePrefixo {
    /// (codigo, descricao, linha_atual) de quem passa a ter o prefixo novo vindo de outra linha.
    pub entram: Vec<(String, String, String)>,
    /// (codigo, descricao, linha_nova) de quem estava na linha antiga e vai para outra.
    pub saem: Vec<(String, String, String)>,
    /// Quantos ficam na linha, só com o prefixo renomeado.
    pub continuam: usize,
    /// (codigo, linha_nova) de todos os produtos cujo `produtos.linha_prefix` precisa mudar.
    pub atualizar: Vec<(String, String)>,
}

/// Cálculo puro. `produtos` = (codigo, descricao, linha_prefix guardada); `prefixos` = linhas cadastradas (sem DEFAULT),
/// incluindo `antigo`. A linha automática de cada produto vem de `linha_do_codigo`, antes e depois da troca.
pub fn calcular_troca(produtos: &[(String, String, String)], prefixos: &[String], antigo: &str, novo: &str) -> TrocaDePrefixo {
    let depois: Vec<String> = prefixos.iter().map(|p| if p == antigo { novo.to_string() } else { p.clone() }).collect();
    let mut r = TrocaDePrefixo::default();
    for (codigo, descricao, guardada) in produtos {
        let antes_calc = linha_do_codigo(codigo, prefixos);
        let nova = linha_do_codigo(codigo, &depois);
        let estava = guardada == antigo;
        // Quem não está na linha antiga e não muda de resultado com a troca fica como está.
        if !estava && antes_calc == nova {
            continue;
        }
        if estava && nova == novo {
            r.continuam += 1;
        } else if estava {
            r.saem.push((codigo.clone(), descricao.clone(), nova.clone()));
        } else if nova == novo {
            r.entram.push((codigo.clone(), descricao.clone(), guardada.clone()));
        }
        if *guardada != nova {
            r.atualizar.push((codigo.clone(), nova));
        }
    }
    r
}

fn pode_editar(ctx: &AuthContext) -> Result<(), ErroApi> {
    if ctx.role.is_supervisor() || ctx.can_edit_module(MODULE_ADMIN_LINHA_PRODUTOS) {
        Ok(())
    } else {
        Err(ErroApi::sem_permissao("Sem permissão para editar Linha de Produtos."))
    }
}

/// Prefixo novo: só letras, números, ponto, hífen e sublinhado; nada de DEFAULT nem vazio.
fn validar_formato(novo: &str) -> Result<(), ErroApi> {
    if novo.is_empty() {
        return Err(ErroApi::invalido("Informe o prefixo novo."));
    }
    if novo.eq_ignore_ascii_case("DEFAULT") {
        return Err(ErroApi::regra("DEFAULT é a linha reservada para produtos sem linha; escolha outro prefixo."));
    }
    if !novo.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_')) {
        return Err(ErroApi::invalido("O prefixo só pode ter letras, números, ponto, hífen e sublinhado (ex.: 9.15)."));
    }
    Ok(())
}

fn lista(itens: &[(String, String, String)], campo: &str) -> Vec<Value> {
    itens
        .iter()
        .take(LIMITE_LISTA)
        .map(|(c, d, outra)| json!({ "codigo": c, "descricao": d, campo: outra }))
        .collect()
}

/// Serviço: troca o prefixo de uma linha. Sem `confirmar` devolve só a prévia. Reutilizável por agentes.
pub async fn renomear_prefixo_linha(
    pool: &PgPool,
    ctx: &AuthContext,
    atual: &str,
    novo: &str,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    pode_editar(ctx)?;
    let atual = atual.trim().to_string();
    let novo = novo.trim().to_string();
    if atual.is_empty() || atual.eq_ignore_ascii_case("DEFAULT") {
        return Err(ErroApi::regra("A linha DEFAULT não pode mudar de prefixo."));
    }
    validar_formato(&novo)?;
    if novo == atual {
        return Err(ErroApi::regra("O prefixo novo é igual ao atual."));
    }
    let (a, n) = (atual.clone(), novo.clone());
    let resposta = executar_em_2_passos(pool, "renomear_prefixo_linha", confirmar, move |tx| {
        Box::pin(async move {
            let conn: &mut sqlx::PgConnection = &mut **tx;
            let linha: Option<(String,)> = sqlx::query_as("SELECT nome_linha FROM config_linhas WHERE linha_prefix = $1 FOR UPDATE")
                .bind(&a)
                .fetch_optional(&mut *conn)
                .await?;
            let (nome,) = linha.ok_or_else(|| ErroApi::nao_encontrado(format!("Linha {a} não existe.")))?;
            let prefixos = carregar_prefixos_linhas(&mut *conn).await?;
            if let Some(outro) = prefixos.iter().find(|p| **p != a && prefixos_equivalentes(p, &n)) {
                return Err(ErroApi::regra(format!("O prefixo {n} já é usado pela linha {outro}.")));
            }
            let produtos: Vec<(String, String, String)> =
                sqlx::query_as("SELECT codigo, descricao, linha_prefix FROM produtos").fetch_all(&mut *conn).await?;
            let troca = calcular_troca(&produtos, &prefixos, &a, &n);

            // A linha nova nasce como cópia da antiga (nome e parâmetros); a antiga some no fim, depois de soltar os produtos.
            sqlx::query(
                "INSERT INTO config_linhas (linha_prefix, nome_linha, estoque_ideal_mult, abrir_ordem_mult, abrir_prod_mult, fator_seguranca_z, visivel, atendimento) \
                 SELECT $2, nome_linha, estoque_ideal_mult, abrir_ordem_mult, abrir_prod_mult, fator_seguranca_z, visivel, atendimento \
                 FROM config_linhas WHERE linha_prefix = $1",
            )
            .bind(&a)
            .bind(&n)
            .execute(&mut *conn)
            .await?;
            for bloco in troca.atualizar.chunks(1000) {
                let codigos: Vec<String> = bloco.iter().map(|x| x.0.clone()).collect();
                let linhas: Vec<String> = bloco.iter().map(|x| x.1.clone()).collect();
                sqlx::query(
                    "UPDATE produtos p SET linha_prefix = u.nova FROM UNNEST($1::text[], $2::text[]) AS u(codigo, nova) WHERE p.codigo = u.codigo",
                )
                .bind(&codigos)
                .bind(&linhas)
                .execute(&mut *conn)
                .await?;
            }
            let manuais: Vec<String> = sqlx::query_scalar(
                "UPDATE overrides_produtos SET linha_prefix_manual = $2 WHERE linha_prefix_manual = $1 RETURNING codigo",
            )
            .bind(&a)
            .bind(&n)
            .fetch_all(&mut *conn)
            .await?;
            let regras = sqlx::query("UPDATE producao_regras SET alvo = $2 WHERE escopo = 'linha' AND alvo = $1")
                .bind(&a)
                .bind(&n)
                .execute(&mut *conn)
                .await?
                .rows_affected();
            sqlx::query("DELETE FROM config_linhas WHERE linha_prefix = $1").bind(&a).execute(&mut *conn).await?;
            // Quem entrou ou saiu pode ter outro atendimento de linha: o status que Produção e Compras leem acompanha.
            let movidos: Vec<String> = troca.atualizar.iter().map(|x| x.0.clone()).collect();
            crate::modules::administrativo::classificacao::atendimento::sincronizar_status(
                conn,
                crate::modules::administrativo::classificacao::atendimento::Alvo::Codigos(&movidos),
            )
            .await?;

            Ok(json!({
                "prefixoAtual": a,
                "prefixoNovo": n,
                "nomeLinha": nome,
                "produtosContinuam": troca.continuam,
                "produtosEntram": troca.entram.len(),
                "produtosSaem": troca.saem.len(),
                "entram": lista(&troca.entram, "linhaAtual"),
                "saem": lista(&troca.saem, "linhaNova"),
                "listaTruncada": troca.entram.len() > LIMITE_LISTA || troca.saem.len() > LIMITE_LISTA,
                "ajustesManuaisAtualizados": manuais.len(),
                "regrasDeProducaoAtualizadas": regras,
                "codigosEntram": troca.entram.iter().map(|x| x.0.clone()).collect::<Vec<_>>(),
                "codigosSaem": troca.saem.iter().map(|x| x.0.clone()).collect::<Vec<_>>(),
                "codigosManuais": manuais,
            }))
        })
    })
    .await?;

    if confirmar {
        let r = &resposta.resultado;
        audit::record_domain(
            pool,
            Some(ctx),
            MODULO_AUDITORIA,
            "renomear_prefixo_linha",
            "linha_produto",
            &atual,
            &format!("Prefixo da linha {atual} trocado para {novo}"),
            Some(json!({ "linha_prefix": atual, "nome_linha": r["nomeLinha"] })),
            Some(json!({
                "linha_prefix": novo,
                "produtosContinuam": r["produtosContinuam"],
                "entram": r["codigosEntram"],
                "saem": r["codigosSaem"],
                "ajustesManuais": r["codigosManuais"],
                "regrasDeProducaoAtualizadas": r["regrasDeProducaoAtualizadas"],
            })),
        )
        .await;
    }
    Ok(resposta)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(c: &str, linha: &str) -> (String, String, String) {
        (c.into(), format!("Produto {c}"), linha.into())
    }

    #[test]
    fn renomear_mantem_quem_ja_estava_e_puxa_quem_agora_casa() {
        let prefixos = vec!["9.15".to_string(), "1".to_string()];
        // 9.15.001 está na linha; 9.16.001 hoje é DEFAULT e passa a casar com o prefixo novo 9.16.
        let produtos = vec![p("9.15.001", "9.15"), p("9.16.001", "DEFAULT"), p("1.1.1", "1")];
        let t = calcular_troca(&produtos, &prefixos, "9.15", "9.16");
        assert_eq!(t.continuam, 0);
        assert_eq!(t.saem.iter().map(|x| x.0.as_str()).collect::<Vec<_>>(), vec!["9.15.001"]);
        assert_eq!(t.saem[0].2, "DEFAULT");
        assert_eq!(t.entram.iter().map(|x| x.0.as_str()).collect::<Vec<_>>(), vec!["9.16.001"]);
        assert_eq!(t.atualizar.len(), 2);
    }

    #[test]
    fn corrigir_digitacao_sem_trocar_produtos() {
        // linha cadastrada como "9.5" por engano, os produtos são 9.5.x e continuam casando com "9.05"? não: 9.05 = 9.5.
        let prefixos = vec!["9.5".to_string()];
        let produtos = vec![p("9.5.1", "9.5"), p("9.5.2", "9.5")];
        let t = calcular_troca(&produtos, &prefixos, "9.5", "9.05");
        assert_eq!(t.continuam, 2);
        assert!(t.entram.is_empty() && t.saem.is_empty());
        assert_eq!(t.atualizar.len(), 2); // só o texto da chave muda
    }

    #[test]
    fn prefixo_mais_longo_de_outra_linha_vence() {
        let prefixos = vec!["9".to_string(), "9.15".to_string()];
        let produtos = vec![p("9.15.1", "9.15"), p("9.2.1", "9")];
        let t = calcular_troca(&produtos, &prefixos, "9.15", "9.2");
        assert_eq!(t.entram.len(), 1); // 9.2.1 sai de "9" e entra em "9.2"
        assert_eq!(t.saem.len(), 1); // 9.15.1 volta para "9"
        assert_eq!(t.saem[0].2, "9");
    }

    #[test]
    fn formato_recusa_vazio_default_e_caracteres_estranhos() {
        assert!(validar_formato("").is_err());
        assert!(validar_formato("default").is_err());
        assert!(validar_formato("9 15").is_err());
        assert!(validar_formato("9.15").is_ok());
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

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn previa_nao_grava_e_confirmar_grava_com_auditoria() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = sqlx::PgPool::connect(&url).await.unwrap();
        for sql in [
            "DELETE FROM producao_regras WHERE alvo IN ('ZZP1', 'ZZP2')",
            "DELETE FROM overrides_produtos WHERE codigo IN ('ZZP1.1', 'ZZP2.9')",
            "DELETE FROM produtos WHERE codigo IN ('ZZP1.1', 'ZZP2.9')",
            "DELETE FROM config_linhas WHERE linha_prefix IN ('ZZP1', 'ZZP2')",
            "DELETE FROM hub_audit_events WHERE action = 'renomear_prefixo_linha' AND entity_id = 'ZZP1'",
        ] {
            sqlx::query(sql).execute(&pool).await.unwrap();
        }
        sqlx::query("INSERT INTO config_linhas (linha_prefix, nome_linha) VALUES ('ZZP1', 'Teste prefixo')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO produtos (codigo, descricao, linha_prefix, media_levantamento) VALUES ('ZZP1.1', 'dentro', 'ZZP1', 0)").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO produtos (codigo, descricao, linha_prefix, media_levantamento) VALUES ('ZZP2.9', 'manual', 'DEFAULT', 0)").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO overrides_produtos (codigo, linha_prefix_manual) VALUES ('ZZP2.9', 'ZZP1')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO producao_regras (escopo, alvo, tipo, texto) VALUES ('linha', 'ZZP1', 'anotacao', 'teste')").execute(&pool).await.unwrap();
        let ctx = supervisor();

        // recusas
        assert!(renomear_prefixo_linha(&pool, &ctx, "ZZP1", "", false).await.is_err());
        assert!(renomear_prefixo_linha(&pool, &ctx, "ZZP1", "DEFAULT", false).await.is_err());
        assert!(renomear_prefixo_linha(&pool, &ctx, "ZZP1", "1", false).await.is_err(), "1 já é de outra linha");

        // prévia: devolve o que mudaria e não grava
        let r = renomear_prefixo_linha(&pool, &ctx, "ZZP1", "ZZP2", false).await.unwrap();
        assert!(r.previa);
        assert_eq!(r.resultado["ajustesManuaisAtualizados"], 1);
        assert_eq!(r.resultado["regrasDeProducaoAtualizadas"], 1);
        let ainda: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM config_linhas WHERE linha_prefix = 'ZZP1'").fetch_one(&pool).await.unwrap();
        assert_eq!(ainda, 1);
        let novo: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM config_linhas WHERE linha_prefix = 'ZZP2'").fetch_one(&pool).await.unwrap();
        assert_eq!(novo, 0);
        let audit_antes: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM hub_audit_events WHERE action = 'renomear_prefixo_linha' AND entity_id = 'ZZP1'").fetch_one(&pool).await.unwrap();
        assert_eq!(audit_antes, 0);

        // confirmar: grava tudo e audita
        let r = renomear_prefixo_linha(&pool, &ctx, "ZZP1", "ZZP2", true).await.unwrap();
        assert!(!r.previa);
        let linha: String = sqlx::query_scalar("SELECT linha_prefix FROM produtos WHERE codigo = 'ZZP2.9'").fetch_one(&pool).await.unwrap();
        assert_eq!(linha, "ZZP2", "o produto ZZP2.9 casa com o prefixo novo");
        let manual: String = sqlx::query_scalar("SELECT linha_prefix_manual FROM overrides_produtos WHERE codigo = 'ZZP2.9'").fetch_one(&pool).await.unwrap();
        assert_eq!(manual, "ZZP2");
        let regra: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM producao_regras WHERE escopo = 'linha' AND alvo = 'ZZP2'").fetch_one(&pool).await.unwrap();
        assert_eq!(regra, 1);
        let velha: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM config_linhas WHERE linha_prefix = 'ZZP1'").fetch_one(&pool).await.unwrap();
        assert_eq!(velha, 0);
        let auditado: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM hub_audit_events WHERE action = 'renomear_prefixo_linha' AND entity_id = 'ZZP1'").fetch_one(&pool).await.unwrap();
        assert_eq!(auditado, 1);

        for sql in [
            "DELETE FROM producao_regras WHERE alvo = 'ZZP2'",
            "DELETE FROM overrides_produtos WHERE codigo IN ('ZZP1.1', 'ZZP2.9')",
            "DELETE FROM produtos WHERE codigo IN ('ZZP1.1', 'ZZP2.9')",
            "DELETE FROM config_linhas WHERE linha_prefix = 'ZZP2'",
            "DELETE FROM hub_audit_events WHERE action = 'renomear_prefixo_linha' AND entity_id = 'ZZP1'",
        ] {
            sqlx::query(sql).execute(&pool).await.unwrap();
        }
    }
}

//! Situação × atendimento do produto (L1). A regra pura fica em `core::regras_produto`; aqui está a parte com banco:
//! manter `overrides_produtos.status_produto` (o que Produção e Compras leem) como espelho da regra.
use sqlx::PgConnection;

use crate::core::regras_produto::{atendimento_efetivo, situacao_do_status_legado, status_de_consumo};

/// Quais produtos reconciliar.
pub enum Alvo<'a> {
    Codigos(&'a [String]),
    /// Produtos da linha efetiva (prefixo).
    Linha(&'a str),
    Todos,
}

const LINHA_EFETIVA: &str = "COALESCE(NULLIF(o.linha_prefix_manual, ''), p.linha_prefix)";

/// Recalcula o status espelho dos produtos do `alvo` (situação + atendimento efetivo) e grava só o que muda.
/// Produto sem linha de override ganha uma só se a linha dele não gera demanda (o espelho precisa existir para Produção/Compras).
/// Devolve quantos produtos tiveram o status espelho alterado.
pub async fn sincronizar_status(conn: &mut PgConnection, alvo: Alvo<'_>) -> Result<u64, sqlx::Error> {
    let filtro = match alvo {
        Alvo::Codigos(_) => "p.codigo = ANY($1)",
        Alvo::Linha(_) => "COALESCE(NULLIF(o.linha_prefix_manual, ''), p.linha_prefix) = $1",
        Alvo::Todos => "TRUE",
    };
    // 1) garante a linha de override de quem está numa linha que não gera demanda.
    let criar = format!(
        "INSERT INTO overrides_produtos (codigo) \
         SELECT p.codigo FROM produtos p LEFT JOIN overrides_produtos o ON o.codigo = p.codigo \
         JOIN config_linhas cl ON cl.linha_prefix = {LINHA_EFETIVA} \
         WHERE o.codigo IS NULL AND cl.atendimento <> 'estoque' AND {filtro} \
         ON CONFLICT (codigo) DO NOTHING"
    );
    // 2) lê o estado atual.
    let ler = format!(
        "SELECT p.codigo, o.status_produto, o.situacao, o.atendimento, cl.atendimento \
         FROM overrides_produtos o JOIN produtos p ON p.codigo = o.codigo \
         LEFT JOIN config_linhas cl ON cl.linha_prefix = {LINHA_EFETIVA} \
         WHERE {filtro}"
    );
    macro_rules! com_alvo {
        ($sql:expr) => {{
            let q = sqlx::query($sql);
            match &alvo {
                Alvo::Codigos(c) => q.bind(*c),
                Alvo::Linha(l) => q.bind(*l),
                Alvo::Todos => q,
            }
        }};
    }
    com_alvo!(&criar).execute(&mut *conn).await?;
    let linhas = {
        let q = sqlx::query_as::<_, (String, Option<String>, Option<String>, Option<String>, Option<String>)>(&ler);
        match &alvo {
            Alvo::Codigos(c) => q.bind(*c),
            Alvo::Linha(l) => q.bind(*l),
            Alvo::Todos => q,
        }
        .fetch_all(&mut *conn)
        .await?
    };
    let (mut cods, mut sits, mut status): (Vec<String>, Vec<Option<String>>, Vec<String>) = (vec![], vec![], vec![]);
    let mut mudou = 0u64;
    for (codigo, st_atual, sit, atd_produto, atd_linha) in linhas {
        // Situação: a guardada; sem ela vale o status antigo (só "terceirizado" muda de sentido: era situação, agora é atendimento).
        let (sit_legado, _) = situacao_do_status_legado(st_atual.as_deref());
        let situacao = sit.clone().unwrap_or(sit_legado);
        let efetivo = atendimento_efetivo(atd_produto.as_deref(), atd_linha.as_deref());
        let espelho = status_de_consumo(&situacao, efetivo);
        if st_atual.as_deref() == Some(espelho.as_str()) {
            continue;
        }
        mudou += 1;
        // A situação só precisa ser guardada quando o espelho deixa de repeti-la (senão ela se perderia ao sobrescrever o status).
        let nova_sit = if espelho == situacao { sit } else { Some(situacao) };
        cods.push(codigo);
        sits.push(nova_sit);
        status.push(espelho);
    }
    for i in (0..cods.len()).step_by(1000) {
        let fim = (i + 1000).min(cods.len());
        sqlx::query(
            "UPDATE overrides_produtos o SET situacao = u.sit, status_produto = u.st \
             FROM UNNEST($1::text[], $2::text[], $3::text[]) AS u(codigo, sit, st) WHERE o.codigo = u.codigo",
        )
        .bind(&cods[i..fim])
        .bind(&sits[i..fim])
        .bind(&status[i..fim])
        .execute(&mut *conn)
        .await?;
    }
    Ok(mudou)
}

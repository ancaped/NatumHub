//! Escrita em 2 passos com auditoria, comum às telas do Estoque (Almoxarifado, Equipamentos, Ordens Manuais).
//!
//! Regra fixa do AGENTS.md: sem `confirmar` a gravação roda numa transação e é desfeita (a prévia é exatamente o que
//! seria gravado); com `confirmar` grava e registra quem fez em `producao_auditoria`.

use futures_util::future::BoxFuture;
use serde_json::{json, Value};
use sqlx::{PgConnection, PgPool};

use crate::core::acao::{executar_em_2_passos, ErroApi, RespostaAcao};
use crate::modules::producao::auditoria;

pub type Resp = Result<RespostaAcao<Value>, ErroApi>;

/// Resultados grandes (fotos em base64, listas longas) não vão inteiros para a auditoria.
fn resumo(v: &Value) -> Value {
    let n = v.to_string().len();
    if n > 4000 {
        json!({ "omitido": format!("resultado com {n} caracteres") })
    } else {
        v.clone()
    }
}

/// Roda `f` na transação do 2 passos e, quando confirmado, audita (`autor`, `acao`, `alvo`, `entrada` + resultado).
pub async fn gravar_auditado<F>(
    pool: &PgPool,
    acao: &'static str,
    autor: &str,
    alvo: &str,
    entrada: Value,
    confirmar: bool,
    f: F,
) -> Resp
where
    F: for<'c> FnOnce(&'c mut PgConnection) -> BoxFuture<'c, Result<Value, ErroApi>> + Send + 'static,
{
    let r = executar_em_2_passos(pool, acao, confirmar, move |tx| Box::pin(async move { f(&mut **tx).await })).await?;
    if confirmar {
        let mut detalhe = json!({ "entrada": entrada, "resultado": resumo(&r.resultado) });
        // Exclusões trazem a cópia do que foi apagado em `copia` e ela vai inteira para a auditoria.
        if let Some(copia) = r.resultado.get("copia") {
            detalhe["copia"] = copia.clone();
        }
        auditoria::registrar(pool, autor, acao, alvo, detalhe).await;
    }
    Ok(r)
}

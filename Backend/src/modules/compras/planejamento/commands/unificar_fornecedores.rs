//! Unificar e desvincular fornecedores (liga `suppliers.parent_id` ao fornecedor principal), em serviços que rodam
//! dentro de uma transação para o fluxo de 2 passos (prévia sem gravar, `confirmar=true` grava) e devolvem o
//! antes/depois para a auditoria. O código do ERP de cada cadastro nunca muda.

use serde_json::{json, Value};
use sqlx::{PgConnection, Row};

use crate::core::acao::ErroApi;

struct Forn {
    id: String,
    name: String,
    parent_id: Option<String>,
}

async fn ler(conn: &mut PgConnection, id: &str) -> Result<Option<Forn>, ErroApi> {
    let row = sqlx::query("SELECT id, name, parent_id FROM suppliers WHERE id = $1").bind(id).fetch_optional(&mut *conn).await?;
    Ok(row.map(|r| Forn { id: r.get("id"), name: r.get::<Option<String>, _>("name").unwrap_or_default(), parent_id: r.get("parent_id") }))
}

fn motivo_ok(motivo: &str) -> Result<&str, ErroApi> {
    let m = motivo.trim();
    if m.is_empty() {
        return Err(ErroApi::invalido("Informe o motivo da alteração."));
    }
    Ok(m)
}

fn resumo(f: &Forn) -> Value {
    json!({ "id": f.id, "nome": f.name, "principalAntes": f.parent_id })
}

/// Liga `filhos` ao `principal`. Quem já era principal de outros leva os filhos junto.
pub async fn unificar(conn: &mut PgConnection, principal: &str, filhos: &[String], motivo: &str) -> Result<Value, ErroApi> {
    let motivo = motivo_ok(motivo)?;
    let Some(pai) = ler(conn, principal).await? else {
        return Err(ErroApi::nao_encontrado("Fornecedor principal não encontrado.").com_detalhes(json!({ "id": principal })));
    };
    if let Some(avo) = &pai.parent_id {
        return Err(ErroApi::regra("O principal escolhido já está ligado a outro fornecedor; escolha o principal dele.")
            .com_detalhes(json!({ "principal": pai.id, "ligadoA": avo })));
    }
    let mut vistos = std::collections::BTreeSet::new();
    let mut alvo: Vec<Forn> = Vec::new();
    for id in filhos {
        let id = id.trim();
        if id.is_empty() || id == pai.id || !vistos.insert(id.to_string()) {
            continue;
        }
        let Some(f) = ler(conn, id).await? else {
            return Err(ErroApi::nao_encontrado("Fornecedor não encontrado.").com_detalhes(json!({ "id": id })));
        };
        alvo.push(f);
    }
    if alvo.is_empty() {
        return Err(ErroApi::invalido("Informe ao menos um fornecedor para ligar ao principal."));
    }
    if alvo.iter().all(|f| f.parent_id.as_deref() == Some(pai.id.as_str())) {
        return Err(ErroApi::regra("Nada mudou: esses cadastros já estão ligados a esse principal."));
    }
    let mut herdados: Vec<Value> = Vec::new();
    for f in &alvo {
        let netos = sqlx::query("SELECT id, name FROM suppliers WHERE parent_id = $1 AND id <> $2")
            .bind(&f.id)
            .bind(&pai.id)
            .fetch_all(&mut *conn)
            .await?;
        for n in netos {
            herdados.push(json!({ "id": n.get::<String, _>("id"), "nome": n.get::<Option<String>, _>("name").unwrap_or_default(), "de": f.id }));
        }
    }
    for f in &alvo {
        sqlx::query("UPDATE suppliers SET parent_id = $1 WHERE id = $2").bind(&pai.id).bind(&f.id).execute(&mut *conn).await?;
        sqlx::query("UPDATE suppliers SET parent_id = $1 WHERE parent_id = $2 AND id <> $1").bind(&pai.id).bind(&f.id).execute(&mut *conn).await?;
    }
    Ok(json!({
        "antes": { "principal": { "id": pai.id, "nome": pai.name }, "filhos": alvo.iter().map(resumo).collect::<Vec<_>>() },
        "depois": {
            "id": pai.id,
            "principal": pai.name,
            "filhos": alvo.iter().map(|f| json!({ "id": f.id, "nome": f.name })).collect::<Vec<_>>(),
            "filhosHerdados": herdados,
        },
        "motivo": motivo,
        "familia": "compras_materia_prima",
    }))
}

/// Tira o cadastro do grupo (volta a ser principal de si mesmo).
pub async fn desvincular(conn: &mut PgConnection, id: &str, motivo: &str) -> Result<Value, ErroApi> {
    let motivo = motivo_ok(motivo)?;
    let Some(f) = ler(conn, id).await? else {
        return Err(ErroApi::nao_encontrado("Fornecedor não encontrado.").com_detalhes(json!({ "id": id })));
    };
    let Some(pai) = f.parent_id.clone() else {
        return Err(ErroApi::regra("Nada mudou: esse cadastro não está ligado a nenhum principal."));
    };
    sqlx::query("UPDATE suppliers SET parent_id = NULL WHERE id = $1").bind(&f.id).execute(&mut *conn).await?;
    Ok(json!({
        "antes": { "id": f.id, "nome": f.name, "principal": pai },
        "depois": { "id": f.id, "nome": f.name, "principal": Value::Null },
        "motivo": motivo,
        "familia": "compras_materia_prima",
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Tudo dentro de uma transação desfeita no fim.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn unificar_e_desvincular_em_transacao() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = sqlx::PgPool::connect(&url).await.unwrap();
        let mut tx = pool.begin().await.unwrap();
        sqlx::query("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS parent_id TEXT").execute(&mut *tx).await.unwrap();
        for (id, nome) in [("zz_f1", "ZZ UM"), ("zz_f2", "ZZ DOIS"), ("zz_f3", "ZZ TRES"), ("zz_f4", "ZZ QUATRO")] {
            sqlx::query("INSERT INTO suppliers (id, name) VALUES ($1, $2)").bind(id).bind(nome).execute(&mut *tx).await.unwrap();
        }
        assert_eq!(unificar(&mut *tx, "zz_f1", &["zz_f2".into()], "  ").await.unwrap_err().codigo, "invalido");
        assert_eq!(unificar(&mut *tx, "zz_nao", &["zz_f2".into()], "t").await.unwrap_err().codigo, "nao_encontrado");
        assert_eq!(unificar(&mut *tx, "zz_f1", &["zz_f1".into()], "t").await.unwrap_err().codigo, "invalido");

        let r = unificar(&mut *tx, "zz_f1", &["zz_f2".into(), "zz_f2".into(), "zz_f3".into()], "t").await.unwrap();
        assert_eq!(r["depois"]["filhos"].as_array().unwrap().len(), 2);
        let pai: Option<String> = sqlx::query_scalar("SELECT parent_id FROM suppliers WHERE id = 'zz_f2'").fetch_one(&mut *tx).await.unwrap();
        assert_eq!(pai.as_deref(), Some("zz_f1"));
        assert_eq!(unificar(&mut *tx, "zz_f1", &["zz_f2".into()], "t").await.unwrap_err().codigo, "regra_violada");
        // principal não pode ser filho de outro
        assert_eq!(unificar(&mut *tx, "zz_f2", &["zz_f4".into()], "t").await.unwrap_err().codigo, "regra_violada");
        // quem já tem filhos leva os filhos para o novo principal
        unificar(&mut *tx, "zz_f4", &["zz_f1".into()], "t").await.unwrap();
        let n: i64 = sqlx::query_scalar("SELECT count(*) FROM suppliers WHERE parent_id = 'zz_f4'").fetch_one(&mut *tx).await.unwrap();
        assert_eq!(n, 3);

        desvincular(&mut *tx, "zz_f3", "t").await.unwrap();
        assert_eq!(desvincular(&mut *tx, "zz_f3", "t").await.unwrap_err().codigo, "regra_violada");
        tx.rollback().await.unwrap();
    }
}

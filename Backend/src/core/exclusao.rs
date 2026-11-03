//! Exclusões de registros digitados: motivo obrigatório e cópia do que foi apagado na auditoria.
//!
//! Uso nas rotas que apagam: `let p = exclusao::preparar(pool, motivo, "o laudo", COPIA_SQL, &[id]).await?;` antes do
//! DELETE (valida o motivo e lê a cópia completa da linha e dos filhos) e, depois que o DELETE deu certo,
//! `p.registrar(pool, &ctx, modulo, acao, entidade, id, resumo).await` (grava em `hub_audit_events.before_json`
//! `{ motivo, copia }`) ou, nos módulos que auditam em `producao_auditoria`, `p.detalhe()`.
//! Nunca ponha segredos (`password_hash`, tokens) no SQL da cópia.

use serde_json::{json, Value};
use sqlx::PgPool;

use crate::core::acao::{exigir_motivo, ErroApi};
use crate::modules::geral::auth::models::AuthContext;

/// Acima disso a cópia vai só como ids + contagem (ver `limitar_copia`).
pub const LIMITE_COPIA_BYTES: usize = 5 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct Preparada {
    pub motivo: String,
    /// Cópia lida antes do DELETE; `None` quando a linha não existe (o DELETE devolve o 404 de sempre).
    pub copia: Option<Value>,
}

/// Exige o motivo e lê a cópia. `copia_sql` devolve **uma** coluna jsonb e usa `$1..$n` (texto, com cast no SQL:
/// `$1::bigint`). Sem linha, `copia` fica `None`.
pub async fn preparar(pool: &PgPool, motivo: Option<&str>, o_que: &str, copia_sql: &str, binds: &[&str]) -> Result<Preparada, ErroApi> {
    let motivo = exigir_motivo(true, motivo, o_que)?;
    let mut q = sqlx::query_scalar::<_, Option<Value>>(copia_sql);
    for b in binds {
        q = q.bind(*b);
    }
    let copia = match q.fetch_optional(pool).await {
        Ok(v) => v.flatten(),
        // tabela que nem existe ainda (criada sob demanda): não há o que copiar
        Err(sqlx::Error::Database(e)) if e.code().as_deref() == Some("42P01") => None,
        Err(e) => return Err(ErroApi::interno(format!("Não foi possível copiar o registro para a auditoria: {e}"))),
    };
    Ok(Preparada { motivo, copia })
}

/// Cópia grande demais (acima de `LIMITE_COPIA_BYTES`) vira `{ omitido, total }`.
pub fn limitar_copia(copia: Value, total: usize) -> Value {
    if copia.to_string().len() > LIMITE_COPIA_BYTES {
        json!({ "omitido": "cópia acima de 5 MB; guardada só a contagem", "total": total })
    } else {
        copia
    }
}

impl Preparada {
    /// `{ motivo, copia }`, para auditorias que montam o próprio detalhe.
    pub fn detalhe(&self) -> Value {
        json!({ "motivo": self.motivo, "copia": self.copia })
    }

    /// Grava em `hub_audit_events` (quem, o quê, motivo e a cópia em `before_json`).
    pub async fn registrar(&self, pool: &PgPool, ctx: &AuthContext, modulo: &str, acao: &str, entidade: &str, id: &str, resumo: &str) {
        crate::modules::geral::audit::record_domain(
            pool,
            Some(ctx),
            modulo,
            acao,
            entidade,
            id,
            &format!("{resumo}: {}", self.motivo),
            Some(self.detalhe()),
            None,
        )
        .await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn sem_motivo_nao_chega_nem_a_ler_a_copia() {
        // pool "preguiçoso" que nunca conecta: se tentasse ler a cópia, daria erro interno e não 400
        let pool = PgPool::connect_lazy("postgres://x@127.0.0.1:1/x").unwrap();
        for ruim in [None, Some(""), Some("   ")] {
            let e = preparar(&pool, ruim, "o laudo", "SELECT NULL::jsonb", &[]).await.unwrap_err();
            assert_eq!(e.status, axum::http::StatusCode::BAD_REQUEST);
            assert_eq!(e.mensagem, "Informe o motivo de excluir o laudo.");
        }
    }

    #[test]
    fn copia_grande_vira_contagem() {
        let grande = Value::String("x".repeat(LIMITE_COPIA_BYTES + 1));
        assert_eq!(limitar_copia(grande, 3)["total"], 3);
        assert_eq!(limitar_copia(json!([1]), 1), json!([1]));
    }

    /// Com banco: a cópia lida antes do DELETE e o registro em `hub_audit_events`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn copia_e_auditoria_com_banco() {
        use crate::modules::geral::auth::models::{OperatorRole, Origem};
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        sqlx::query("CREATE TABLE IF NOT EXISTS nexus_teste_exclusao (id BIGINT PRIMARY KEY, nome TEXT)").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO nexus_teste_exclusao VALUES (77, 'laudo teste') ON CONFLICT DO NOTHING").execute(&pool).await.unwrap();
        let sql = "SELECT to_jsonb(t) FROM nexus_teste_exclusao t WHERE t.id = $1::bigint";
        assert!(preparar(&pool, None, "o registro", sql, &["77"]).await.is_err());
        let p = preparar(&pool, Some("duplicado"), "o registro", sql, &["77"]).await.unwrap();
        assert_eq!(p.copia.as_ref().unwrap()["nome"], "laudo teste");
        assert!(preparar(&pool, Some("x"), "o registro", sql, &["78"]).await.unwrap().copia.is_none());

        let ctx = AuthContext {
            operator_id: "t1".into(),
            display_name: "Teste Exclusao".into(),
            role: OperatorRole::Operador,
            modules: vec![],
            permissions: Default::default(),
            origem: Origem::Tela,
        };
        p.registrar(&pool, &ctx, "teste_exclusao", "excluir_teste", "registro", "77", "Registro excluído").await;
        let antes: Value = sqlx::query_scalar("SELECT before_json FROM hub_audit_events WHERE action = 'excluir_teste' AND entity_id = '77' ORDER BY created_at DESC LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(antes["motivo"], "duplicado");
        assert_eq!(antes["copia"]["nome"], "laudo teste");
        sqlx::query("DELETE FROM hub_audit_events WHERE action = 'excluir_teste'").execute(&pool).await.unwrap();
        sqlx::query("DROP TABLE nexus_teste_exclusao").execute(&pool).await.unwrap();

        // cast de uuid com parâmetro de texto (pedidos e cadastros da expedição)
        let u = "SELECT to_jsonb(t) FROM (SELECT $1::uuid AS id) t";
        let c = preparar(&pool, Some("x"), "o registro", u, &["00000000-0000-0000-0000-000000000001"]).await.unwrap();
        assert_eq!(c.copia.unwrap()["id"], "00000000-0000-0000-0000-000000000001");
    }

    /// A cópia do operador nunca leva a senha.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn copia_do_operador_nao_leva_senha() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        crate::modules::geral::auth::store::init_auth_tables(&pool).await.unwrap();
        sqlx::query("DELETE FROM hub_operators WHERE id = 'op-teste-exclusao'").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO hub_operators (id, display_name, role, active, update_channel, password_hash) VALUES ('op-teste-exclusao', 'Op Teste Exclusao', 'operador', 1, 'stable', 'HASH-SECRETO')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO hub_operator_modules (operator_id, module_key) VALUES ('op-teste-exclusao', 'producao') ON CONFLICT DO NOTHING")
            .execute(&pool)
            .await
            .unwrap();
        let p = preparar(&pool, Some("saiu da empresa"), "o operador", crate::modules::geral::auth::handlers::COPIA_OPERADOR, &["op-teste-exclusao"])
            .await
            .unwrap();
        let copia = p.copia.unwrap();
        assert_eq!(copia["displayName"], "Op Teste Exclusao");
        assert_eq!(copia["modulos"][0]["modulo"], "producao");
        assert!(!copia.to_string().contains("HASH-SECRETO") && !copia.to_string().contains("password"));
        sqlx::query("DELETE FROM hub_operator_modules WHERE operator_id = 'op-teste-exclusao'").execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM hub_operators WHERE id = 'op-teste-exclusao'").execute(&pool).await.unwrap();
    }
}

//! Trilha de eventos dos POPs e dos formulários (`pop_eventos`): quem fez o quê, quando e por quê.
//! Só se acrescenta: a tabela não aceita UPDATE nem DELETE (trigger na migração 075).

use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use sqlx::{PgConnection, PgPool, Row};
use tokio::sync::Mutex;

pub const DDL_075: &str = include_str!("../../../../supabase/075_pops_controle_documentos.sql");

static PRONTO: AtomicBool = AtomicBool::new(false);
static TRAVA: Mutex<()> = Mutex::const_new(());

/// Garante as tabelas/colunas da migração 075 (o boot já aplica; isto cobre bancos de teste e corrida de boot).
pub async fn garantir(pool: &PgPool) -> Result<(), String> {
    if PRONTO.load(Ordering::Relaxed) {
        return Ok(());
    }
    let _guard = TRAVA.lock().await;
    if PRONTO.load(Ordering::Relaxed) {
        return Ok(());
    }
    let ja: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pop_eventos')",
    )
    .fetch_one(pool)
    .await
    .unwrap_or(false);
    if !ja {
        use sqlx::Executor;
        if let Err(e) = pool.execute(DDL_075).await {
            let m = e.to_string().to_lowercase();
            let benigno = m.contains("already exists") || m.contains("pg_type_typname_nsp_index") || m.contains("pg_class_relname_nsp_index");
            if !benigno {
                return Err(e.to_string());
            }
        }
    }
    PRONTO.store(true, Ordering::Relaxed);
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Evento {
    pub id: i64,
    pub tipo: String,
    pub r#ref: String,
    pub acao: String,
    pub de_status: Option<String>,
    pub para_status: Option<String>,
    pub motivo: Option<String>,
    pub usuario: String,
    pub criado_em: String,
}

/// Acrescenta um evento na mesma transação da escrita que ele descreve.
#[allow(clippy::too_many_arguments)]
pub async fn registrar(
    conn: &mut PgConnection,
    tipo: &str,
    referencia: &str,
    acao: &str,
    de_status: Option<&str>,
    para_status: Option<&str>,
    motivo: Option<&str>,
    usuario: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO pop_eventos (tipo, ref, acao, de_status, para_status, motivo, usuario) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(tipo)
    .bind(referencia)
    .bind(acao)
    .bind(de_status)
    .bind(para_status)
    .bind(motivo.map(str::trim).filter(|m| !m.is_empty()))
    .bind(usuario)
    .execute(&mut *conn)
    .await?;
    Ok(())
}

fn mapear(r: &sqlx::postgres::PgRow) -> Evento {
    Evento {
        id: r.get("id"),
        tipo: r.get("tipo"),
        r#ref: r.get("ref"),
        acao: r.get("acao"),
        de_status: r.get("de_status"),
        para_status: r.get("para_status"),
        motivo: r.get("motivo"),
        usuario: r.get("usuario"),
        criado_em: r.get::<chrono::DateTime<chrono::Utc>, _>("criado_em").to_rfc3339(),
    }
}

/// Eventos de um POP (`tipo = pop`, `ref` = id) ou de um formulário (`tipo = formulario`, `ref` = código), do mais novo ao mais antigo.
pub async fn listar(pool: &PgPool, tipo: &str, referencia: &str) -> Result<Vec<Evento>, String> {
    garantir(pool).await?;
    let rows = sqlx::query(
        "SELECT id, tipo, ref, acao, de_status, para_status, motivo, usuario, criado_em FROM pop_eventos WHERE tipo = $1 AND ref = $2 ORDER BY criado_em DESC, id DESC",
    )
    .bind(tipo)
    .bind(referencia)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(mapear).collect())
}

//! Estoque calibrado (o "estoque real" que o operador digita). Vale como DIFERENÇA sobre o ERP:
//! estoque = ERP agora + (real − ERP no dia da calibração), então acompanha as movimentações seguintes.
//! Calibração antiga (sem `erp_base`) segue como valor fixo até ser removida. Nada aqui mexe no estoque do ERP
//! (`stock_snapshots` / `estoque_atual`).

use serde_json::{json, Value};
use sqlx::{PgConnection, PgPool, Row};

use crate::core::acao::ErroApi;
use crate::modules::compras::planejamento::models::Calibracao;

/// Estoque que a tela deve usar e, se houver calibração, o detalhe dela.
pub fn efetivo(erp: f64, cal_stock: Option<f64>, cal_base: Option<f64>) -> (f64, Option<Calibracao>) {
    match (cal_stock, cal_base) {
        (None, _) => (erp, None),
        (Some(real), Some(base)) => {
            let dif = real - base;
            (erp + dif, Some(Calibracao { erp, diferenca: dif, fixa: false }))
        }
        (Some(real), None) => (real, Some(Calibracao { erp, diferenca: real - erp, fixa: true })),
    }
}

/// Estoque do ERP agora: produto em `estoque_atual`, insumo no último `stock_snapshots`.
async fn estoque_do_erp(conn: &mut PgConnection, code: &str) -> Result<f64, ErroApi> {
    let produto: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM produtos WHERE codigo = $1)").bind(code).fetch_one(&mut *conn).await?;
    let v: Option<f64> = if produto {
        sqlx::query_scalar("SELECT estoque FROM estoque_atual WHERE codigo = $1").bind(code).fetch_optional(&mut *conn).await?.flatten()
    } else {
        sqlx::query_scalar("SELECT stock_qty FROM stock_snapshots WHERE TRIM(item_code) = TRIM($1) ORDER BY snapshot_date DESC, id DESC LIMIT 1")
            .bind(code)
            .fetch_optional(&mut *conn)
            .await?
            .flatten()
    };
    Ok(v.unwrap_or(0.0))
}

async fn calibracao_atual(conn: &mut PgConnection, code: &str) -> Result<Option<(f64, Option<f64>)>, ErroApi> {
    let row = sqlx::query("SELECT stock, erp_base FROM item_stock_calibrations WHERE TRIM(item_code) = TRIM($1)")
        .bind(code)
        .fetch_optional(&mut *conn)
        .await?;
    Ok(row.map(|r| (r.get::<f64, _>("stock"), r.get::<Option<f64>, _>("erp_base"))))
}

fn motivo_ok(motivo: &str) -> Result<&str, ErroApi> {
    let m = motivo.trim();
    if m.is_empty() {
        return Err(ErroApi::invalido("Informe o motivo da alteração."));
    }
    Ok(m)
}

/// Grava o estoque real do item como diferença sobre o ERP de agora.
pub async fn calibrar(conn: &mut PgConnection, code: &str, estoque_real: f64, motivo: &str) -> Result<Value, ErroApi> {
    let motivo = motivo_ok(motivo)?;
    let code = code.trim();
    if code.is_empty() || !estoque_real.is_finite() || estoque_real < 0.0 {
        return Err(ErroApi::invalido("Informe o código e um estoque válido."));
    }
    let existe: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM items WHERE code = $1) OR EXISTS(SELECT 1 FROM produtos WHERE codigo = $1)")
        .bind(code)
        .fetch_one(&mut *conn)
        .await?;
    if !existe {
        return Err(ErroApi::nao_encontrado("Item não encontrado.").com_detalhes(json!({ "codigo": code })));
    }
    let erp = estoque_do_erp(conn, code).await?;
    let antes = calibracao_atual(conn, code).await?;
    let (estoque_antes, _) = match antes {
        Some((s, b)) => efetivo(erp, Some(s), b),
        None => (erp, None),
    };
    if (estoque_antes - estoque_real).abs() < 1e-9 && antes.is_some_and(|(_, b)| b.is_some()) {
        return Err(ErroApi::regra("Nada mudou: o estoque já está nesse valor."));
    }
    sqlx::query(
        "INSERT INTO item_stock_calibrations (item_code, stock, updated_at, erp_base) VALUES ($1, $2, NOW()::text, $3)
         ON CONFLICT (item_code) DO UPDATE SET stock = EXCLUDED.stock, updated_at = EXCLUDED.updated_at, erp_base = EXCLUDED.erp_base",
    )
    .bind(code)
    .bind(estoque_real)
    .bind(erp)
    .execute(&mut *conn)
    .await?;
    Ok(json!({
        "antes": { "id": code, "estoque": estoque_antes, "calibrado": antes.is_some(), "estoqueErp": erp },
        "depois": { "id": code, "estoque": estoque_real, "calibrado": true, "estoqueErp": erp, "diferenca": estoque_real - erp },
        "motivo": motivo,
        "familia": "compras_materia_prima",
    }))
}

/// Tira a calibração: o item volta a mostrar o estoque do ERP.
pub async fn remover(conn: &mut PgConnection, code: &str, motivo: &str) -> Result<Value, ErroApi> {
    let motivo = motivo_ok(motivo)?;
    let code = code.trim();
    let Some((real, base)) = calibracao_atual(conn, code).await? else {
        return Err(ErroApi::regra("Nada mudou: esse item não tem estoque calibrado.").com_detalhes(json!({ "codigo": code })));
    };
    let erp = estoque_do_erp(conn, code).await?;
    let (antes, _) = efetivo(erp, Some(real), base);
    sqlx::query("DELETE FROM item_stock_calibrations WHERE TRIM(item_code) = TRIM($1)").bind(code).execute(&mut *conn).await?;
    Ok(json!({
        "antes": { "id": code, "estoque": antes, "calibrado": true, "fixa": base.is_none(), "estoqueErp": erp },
        "depois": { "id": code, "estoque": erp, "calibrado": false, "estoqueErp": erp },
        "motivo": motivo,
        "familia": "compras_materia_prima",
    }))
}

/// Estoque efetivo de vários itens de uma vez (para quem lê fora da lista de demanda): código -> (efetivo, calibração).
pub async fn efetivos(pool: &PgPool, codigos: &[String]) -> std::collections::HashMap<String, (f64, Option<Calibracao>)> {
    let mut out = std::collections::HashMap::new();
    let rows = sqlx::query(
        "SELECT TRIM(c.item_code) AS code, c.stock, c.erp_base,
                COALESCE((SELECT s.stock_qty FROM stock_snapshots s WHERE TRIM(s.item_code) = TRIM(c.item_code) ORDER BY s.snapshot_date DESC, s.id DESC LIMIT 1), 0) AS erp
         FROM item_stock_calibrations c WHERE TRIM(c.item_code) = ANY($1)",
    )
    .bind(codigos)
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    for r in rows {
        let (code, stock, base, erp): (String, f64, Option<f64>, f64) = (r.get("code"), r.get("stock"), r.get("erp_base"), r.get("erp"));
        out.insert(code, efetivo(erp, Some(stock), base));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sem_calibracao_vale_o_erp() {
        assert_eq!(efetivo(219.1, None, None), (219.1, None));
    }

    #[test]
    fn calibracao_com_base_acompanha_o_erp() {
        // contou 290 quando o ERP dizia 300 (diferença -10); depois o ERP caiu para 250: vale 240
        let (e, c) = efetivo(250.0, Some(290.0), Some(300.0));
        assert_eq!(e, 240.0);
        assert_eq!(c, Some(Calibracao { erp: 250.0, diferenca: -10.0, fixa: false }));
    }

    #[test]
    fn calibracao_antiga_sem_base_segue_fixa_e_avisa() {
        let (e, c) = efetivo(219.1, Some(20.0), None);
        assert_eq!(e, 20.0);
        assert_eq!(c.map(|c| (c.fixa, c.erp)), Some((true, 219.1)));
    }

    /// Banco de teste, tudo numa transação desfeita: calibrar não mexe no estoque do ERP; remover volta ao ERP.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn calibrar_e_remover_nao_mexem_no_erp() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = sqlx::PgPool::connect(&url).await.unwrap();
        let mut tx = pool.begin().await.unwrap();
        sqlx::query("CREATE TABLE IF NOT EXISTS item_stock_calibrations (item_code TEXT PRIMARY KEY, stock DOUBLE PRECISION NOT NULL, updated_at TEXT NOT NULL, erp_base DOUBLE PRECISION)").execute(&mut *tx).await.unwrap();
        sqlx::query("ALTER TABLE item_stock_calibrations ADD COLUMN IF NOT EXISTS erp_base DOUBLE PRECISION").execute(&mut *tx).await.unwrap();
        sqlx::query("INSERT INTO items (code, description, unit) VALUES ('9.99.ZZCAL', 'ZZ', 'KG')").execute(&mut *tx).await.unwrap();
        sqlx::query("INSERT INTO stock_imports (id) VALUES ('zz_imp_cal')").execute(&mut *tx).await.unwrap();
        sqlx::query("INSERT INTO stock_snapshots (id, import_id, item_code, stock_qty, reserved_qty, in_production, in_orders) VALUES ('zz_snap_cal', 'zz_imp_cal', '9.99.ZZCAL', 300, 0, 0, 0)").execute(&mut *tx).await.unwrap();
        assert_eq!(calibrar(&mut *tx, "9.99.ZZCAL", 10.0, " ").await.unwrap_err().codigo, "invalido");
        assert_eq!(calibrar(&mut *tx, "9.99.NAO", 10.0, "t").await.unwrap_err().codigo, "nao_encontrado");
        let r = calibrar(&mut *tx, "9.99.ZZCAL", 290.0, "contagem").await.unwrap();
        assert_eq!(r["depois"]["diferenca"].as_f64(), Some(-10.0));
        let erp: f64 = sqlx::query_scalar("SELECT stock_qty FROM stock_snapshots WHERE item_code = '9.99.ZZCAL' ORDER BY id DESC LIMIT 1").fetch_one(&mut *tx).await.unwrap();
        assert_eq!(erp, 300.0, "o estoque do ERP não é tocado");
        assert_eq!(calibrar(&mut *tx, "9.99.ZZCAL", 290.0, "t").await.unwrap_err().codigo, "regra_violada");
        let rm = remover(&mut *tx, "9.99.ZZCAL", "teste").await.unwrap();
        assert_eq!(rm["depois"]["estoque"].as_f64(), Some(300.0));
        assert_eq!(remover(&mut *tx, "9.99.ZZCAL", "t").await.unwrap_err().codigo, "regra_violada");
        tx.rollback().await.unwrap();
    }
}

//! Medição da duração estimada (fase 1 do plano `decisions/plano-duracao-estimada-compras`): foto diária da previsão
//! de cada item e comparação com o consumo que de fato saiu. Só mede; não altera nenhum cálculo da demanda.

use std::collections::HashMap;

use serde_json::{json, Value};
use sqlx::{PgPool, Row};

use super::get_demands_query;

/// Família a partir da raiz da categoria; sem categoria, pelo prefixo do código.
pub fn familia_do_item(raiz: Option<&str>, code: &str) -> &'static str {
    match raiz {
        Some("cat_mp") => "materia_prima",
        Some("cat_emb") | Some("cat_mat") => "embalagens",
        Some("cat_coloracao") => "coloracao",
        Some("cat_apoio") => "apoio",
        _ => {
            if code.starts_with("1.34.") {
                "coloracao"
            } else if code.starts_with("1.30.") {
                "apoio"
            } else if code.starts_with("08.") {
                "embalagens"
            } else if code.starts_with("9.") {
                "materia_prima"
            } else {
                "outros"
            }
        }
    }
}

fn raiz_de<'a>(id: &'a str, pais: &'a HashMap<String, Option<String>>) -> &'a str {
    let mut atual = id;
    for _ in 0..8 {
        match pais.get(atual) {
            Some(Some(p)) if !p.trim().is_empty() => atual = p.as_str(),
            _ => break,
        }
    }
    atual
}

/// Grava a foto do dia (uma por dia). Devolve quantos itens foram gravados; 0 se o dia já tinha foto.
pub async fn registrar_snapshot_do_dia(pool: &PgPool) -> Result<usize, String> {
    let ja: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM compras_duracao_snapshots WHERE data = CURRENT_DATE)")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    if ja {
        return Ok(0);
    }
    let demandas = get_demands_query(pool.clone(), None, 90, None, false).await?;
    let pais: HashMap<String, Option<String>> = sqlx::query("SELECT id, parent_id FROM categories")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?
        .iter()
        .map(|r| (r.get::<String, _>("id"), r.get::<Option<String>, _>("parent_id")))
        .collect();
    let (mut codes, mut fams, mut dur, mut cons, mut est, mut sem) = (vec![], vec![], vec![], vec![], vec![], vec![]);
    for d in &demandas {
        let raiz = d.category_id.as_deref().map(|c| raiz_de(c, &pais));
        codes.push(d.item_code.clone());
        fams.push(familia_do_item(raiz, &d.item_code).to_string());
        dur.push(if d.estimated_duration_days >= 9999.0 { None } else { Some(d.estimated_duration_days) });
        cons.push(d.overall_avg / 30.0);
        est.push(d.future_stock_forecast);
        sem.push(d.sem_controle);
    }
    let n = codes.len();
    sqlx::query(
        "INSERT INTO compras_duracao_snapshots (data, item_code, familia, duracao_prevista_dias, consumo_diario_previsto, estoque_previsto, sem_controle)
         SELECT CURRENT_DATE, c, f, d, k, e, s
         FROM UNNEST($1::text[], $2::text[], $3::float8[], $4::float8[], $5::float8[], $6::bool[]) AS t(c, f, d, k, e, s)
         ON CONFLICT (data, item_code) DO NOTHING",
    )
    .bind(&codes)
    .bind(&fams)
    .bind(&dur)
    .bind(&cons)
    .bind(&est)
    .bind(&sem)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(n)
}

/// Tarefa de fundo: confere de hora em hora se já existe a foto de hoje e grava se não.
pub async fn vigiar_snapshot_diario(pool: PgPool) {
    tokio::time::sleep(std::time::Duration::from_secs(300)).await;
    loop {
        match registrar_snapshot_do_dia(&pool).await {
            Ok(n) if n > 0 => println!("[Compras] foto da duração estimada gravada: {n} itens."),
            Ok(_) => {}
            Err(e) => eprintln!("[Compras] foto da duração estimada falhou: {e}"),
        }
        tokio::time::sleep(std::time::Duration::from_secs(3600)).await;
    }
}

fn pct(x: f64) -> Value {
    json!((x * 10.0).round() / 10.0)
}

/// Erro da previsão de consumo guardada nas fotos, `horizonte_dias` depois de cada uma (só entram fotos já "vencidas").
async fn acuracia_real(pool: &PgPool, horizonte_dias: i32) -> Result<Value, String> {
    let resumo = sqlx::query("SELECT COUNT(DISTINCT data) AS dias, MIN(data)::text AS primeira, MAX(data)::text AS ultima FROM compras_duracao_snapshots")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let rows = sqlx::query(
        "WITH s AS (
             SELECT data, item_code, familia, consumo_diario_previsto * $1::float8 AS previsto
             FROM compras_duracao_snapshots
             WHERE data <= CURRENT_DATE - $1::int AND NOT sem_controle
         ),
         r AS (
             SELECT s.data, s.item_code, s.familia, s.previsto, COALESCE(SUM(m.quantity), 0)::float8 AS real
             FROM s LEFT JOIN stock_movements m
               ON m.item_code = s.item_code AND m.movement_type = 'saida' AND m.item_type IN ('insumo', 'produto')
              AND m.date >= to_char(s.data, 'YYYY-MM-DD') AND m.date < to_char(s.data + $1::int, 'YYYY-MM-DD')
             GROUP BY s.data, s.item_code, s.familia, s.previsto
         )
         SELECT familia, COUNT(*) AS amostras, COUNT(DISTINCT item_code) AS itens, SUM(previsto) AS previsto, SUM(real) AS real,
                SUM(ABS(previsto - real)) AS erro_abs, SUM((real = 0)::int) AS sem_consumo
         FROM r GROUP BY familia ORDER BY familia",
    )
    .bind(horizonte_dias)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let familias: Vec<Value> = rows
        .iter()
        .map(|r| {
            let (prev, real, erro): (f64, f64, f64) = (r.get("previsto"), r.get("real"), r.get("erro_abs"));
            json!({
                "familia": r.get::<String, _>("familia"), "amostras": r.get::<i64, _>("amostras"), "itens": r.get::<i64, _>("itens"),
                "previsto": prev.round(), "real": real.round(),
                "erroPct": if real > 0.0 { pct(100.0 * erro / real) } else { Value::Null },
                "viesPct": if real > 0.0 { pct(100.0 * (prev - real) / real) } else { Value::Null },
                "semConsumo": r.get::<i64, _>("sem_consumo"),
            })
        })
        .collect();
    Ok(json!({
        "horizonteDias": horizonte_dias,
        "fotos": { "dias": resumo.get::<i64, _>("dias"), "primeira": resumo.get::<Option<String>, _>("primeira"), "ultima": resumo.get::<Option<String>, _>("ultima") },
        "familias": familias,
        "observacao": if rows.is_empty() { "Ainda não há foto com mais de o horizonte de dias: a medição real aparece quando a primeira foto completar esse prazo." } else { "" },
    }))
}

/// Teste histórico com o método de hoje (média dos 12 meses anteriores) sobre as saídas já registradas:
/// dá a base de comparação sem esperar as fotos.
async fn acuracia_historica(pool: &PgPool, horizonte_meses: i32) -> Result<Value, String> {
    let rows = sqlx::query(
        "WITH RECURSIVE raiz(id, root) AS (
             SELECT id, id FROM categories WHERE parent_id IS NULL
             UNION ALL SELECT c.id, r.root FROM categories c JOIN raiz r ON c.parent_id = r.id
         ),
         mov AS (
             SELECT item_code, to_date(left(date, 7) || '-01', 'YYYY-MM-DD') AS mes, SUM(quantity)::float8 AS q
             FROM stock_movements
             WHERE movement_type = 'saida' AND item_type IN ('insumo', 'produto')
               AND date >= to_char(date_trunc('month', CURRENT_DATE) - INTERVAL '40 months', 'YYYY-MM-DD')
               AND date < to_char(date_trunc('month', CURRENT_DATE), 'YYYY-MM-DD')
             GROUP BY 1, 2
         ),
         grade AS (
             SELECT i.item_code, g::date AS mes
             FROM (SELECT DISTINCT item_code FROM mov) i,
                  generate_series((date_trunc('month', CURRENT_DATE) - INTERVAL '40 months')::date,
                                  (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date, INTERVAL '1 month') g
         ),
         s AS (SELECT g.item_code, g.mes, COALESCE(m.q, 0) AS q FROM grade g LEFT JOIN mov m ON m.item_code = g.item_code AND m.mes = g.mes),
         p AS (
             SELECT item_code, mes,
                    avg(q) OVER (PARTITION BY item_code ORDER BY mes ROWS BETWEEN 12 PRECEDING AND 1 PRECEDING) AS media12,
                    count(*) OVER (PARTITION BY item_code ORDER BY mes ROWS BETWEEN 12 PRECEDING AND 1 PRECEDING) AS n,
                    sum(q) OVER (PARTITION BY item_code ORDER BY mes ROWS BETWEEN CURRENT ROW AND ($1::int - 1) FOLLOWING) AS real,
                    count(*) OVER (PARTITION BY item_code ORDER BY mes ROWS BETWEEN CURRENT ROW AND ($1::int - 1) FOLLOWING) AS k
             FROM s
         ),
         f AS (
             SELECT p.*, CASE
                 WHEN p.item_code LIKE '1.34.%' THEN 'coloracao'
                 WHEN p.item_code LIKE '1.30.%' THEN 'apoio'
                 WHEN rr.root = 'cat_mp' THEN 'materia_prima'
                 WHEN rr.root IN ('cat_emb', 'cat_mat') THEN 'embalagens'
                 WHEN p.item_code LIKE '08.%' THEN 'embalagens'
                 WHEN p.item_code LIKE '9.%' THEN 'materia_prima'
                 ELSE 'outros' END AS familia
             FROM p LEFT JOIN items it ON it.code = p.item_code LEFT JOIN raiz rr ON rr.id = it.category_id
             WHERE p.mes <= (date_trunc('month', CURRENT_DATE) - ($1::int || ' months')::interval)::date
               AND p.mes >= (date_trunc('month', CURRENT_DATE) - INTERVAL '14 months')::date
               AND p.k = $1::int AND p.n >= 12 AND p.media12 > 0
         )
         SELECT familia, COUNT(*) AS amostras, COUNT(DISTINCT item_code) AS itens,
                SUM(media12 * $1::int) AS previsto, SUM(real) AS real, SUM(ABS(media12 * $1::int - real)) AS erro_abs,
                SUM((real = 0)::int) AS sem_consumo
         FROM f WHERE familia <> 'outros' GROUP BY familia ORDER BY familia",
    )
    .bind(horizonte_meses)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let familias: Vec<Value> = rows
        .iter()
        .map(|r| {
            let (prev, real, erro): (f64, f64, f64) = (r.get("previsto"), r.get("real"), r.get("erro_abs"));
            json!({
                "familia": r.get::<String, _>("familia"), "amostras": r.get::<i64, _>("amostras"), "itens": r.get::<i64, _>("itens"),
                "previsto": prev.round(), "real": real.round(),
                "erroPct": if real > 0.0 { pct(100.0 * erro / real) } else { Value::Null },
                "viesPct": if real > 0.0 { pct(100.0 * (prev - real) / real) } else { Value::Null },
                "semConsumo": r.get::<i64, _>("sem_consumo"),
            })
        })
        .collect();
    let padrao = sqlx::query(
        "SELECT CASE WHEN meses >= 10 THEN 'continuo' WHEN meses >= 5 THEN 'ocasional' ELSE 'em_lotes' END AS padrao, COUNT(*) AS itens
         FROM (SELECT item_code, COUNT(DISTINCT left(date, 7)) AS meses FROM stock_movements
               WHERE movement_type = 'saida' AND item_type IN ('insumo', 'produto')
                 AND date >= to_char(CURRENT_DATE - INTERVAL '12 months', 'YYYY-MM-DD')
                 AND (item_code IN (SELECT code FROM items) OR item_code LIKE '1.30.%' OR item_code LIKE '1.34.%')
               GROUP BY item_code) x
         GROUP BY 1",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let padrao: serde_json::Map<String, Value> = padrao.iter().map(|r| (r.get::<String, _>("padrao"), json!(r.get::<i64, _>("itens")))).collect();
    Ok(json!({
        "metodo": "média dos 12 meses anteriores × horizonte, comparada com o consumo real dos meses seguintes",
        "horizonteMeses": horizonte_meses,
        "familias": familias,
        "padraoDeConsumo": padrao,
    }))
}

pub async fn acuracia_duracao(pool: &PgPool, horizonte_dias: i32) -> Result<Value, String> {
    let meses = (horizonte_dias / 30).clamp(1, 6);
    Ok(json!({
        "real": acuracia_real(pool, horizonte_dias).await?,
        "historico": acuracia_historica(pool, meses).await?,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn familia_pela_raiz_ou_pelo_prefixo() {
        assert_eq!(familia_do_item(Some("cat_mat"), "x"), "embalagens");
        assert_eq!(familia_do_item(Some("cat_mp"), "x"), "materia_prima");
        assert_eq!(familia_do_item(None, "1.34.001"), "coloracao");
        assert_eq!(familia_do_item(None, "1.30.001"), "apoio");
        assert_eq!(familia_do_item(None, "08.05.001"), "embalagens");
        assert_eq!(familia_do_item(Some("outra"), "7.1"), "outros");
    }

    /// Roda no banco de teste: a foto do dia grava uma vez, e as consultas de medição não quebram.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn foto_do_dia_grava_uma_vez_e_a_medicao_responde() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        sqlx::query("DELETE FROM compras_duracao_snapshots WHERE data = CURRENT_DATE").execute(&pool).await.unwrap();
        let n = registrar_snapshot_do_dia(&pool).await.unwrap();
        let gravados: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM compras_duracao_snapshots WHERE data = CURRENT_DATE").fetch_one(&pool).await.unwrap();
        assert_eq!(gravados as usize, n, "gravou uma linha por item da demanda");
        if n > 0 {
            assert_eq!(registrar_snapshot_do_dia(&pool).await.unwrap(), 0, "segunda chamada no mesmo dia não grava");
        }
        let r = acuracia_duracao(&pool, 30).await.unwrap();
        assert!(r["historico"]["familias"].is_array());
        assert_eq!(r["real"]["horizonteDias"], 30);
        sqlx::query("DELETE FROM compras_duracao_snapshots WHERE data = CURRENT_DATE").execute(&pool).await.unwrap();
    }
}

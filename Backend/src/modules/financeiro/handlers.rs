use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{Duration, Local, NaiveDate};
use rusqlite::{params, Connection};
use serde_json::json;
use std::sync::Arc;
use std::time::Instant;

use crate::handlers::AppState;
use crate::modules::financeiro::client::TinyClient;
use crate::modules::financeiro::models::{
    deobfuscate_token, obfuscate_token, AccountsPage, AccountsQuery, AgingBucket, AttentionItem,
    Concentration, FinancialAccount, FlowSummary, HubFinancialSummary, MonthComparison,
    MonthlyFlow, PartyBalance, SparkPoint, StatusResponse, SyncMeta, SyncRequest, SyncResult,
    WeeklyProjection,
};

fn convert_to_iso_date(d: &str) -> String {
    let parts: Vec<&str> = d.split('/').collect();
    if parts.len() == 3 {
        let day = if parts[0].len() == 1 {
            format!("0{}", parts[0])
        } else {
            parts[0].to_string()
        };
        let month = if parts[1].len() == 1 {
            format!("0{}", parts[1])
        } else {
            parts[1].to_string()
        };
        format!("{}-{}-{}", parts[2], month, day)
    } else {
        d.to_string()
    }
}

fn parse_date_flexible(d: &str, fallback: NaiveDate) -> NaiveDate {
    if d.contains('/') {
        NaiveDate::parse_from_str(d, "%d/%m/%Y").unwrap_or(fallback)
    } else {
        NaiveDate::parse_from_str(d, "%Y-%m-%d").unwrap_or(fallback)
    }
}

fn get_tiny_token(db: &crate::core::db::Db) -> Option<String> {
    match db.get_setting("tiny_api_token") {
        Ok(Some(t)) => {
            let plain = deobfuscate_token(&t);
            if plain.trim().is_empty() {
                None
            } else {
                Some(plain)
            }
        }
        _ => None,
    }
}

fn ensure_indexes(conn: &Connection) {
    let _ = conn.execute_batch(
        "
        CREATE INDEX IF NOT EXISTS idx_tiny_receber_venc ON tiny_contas_receber(data_vencimento);
        CREATE INDEX IF NOT EXISTS idx_tiny_receber_sit ON tiny_contas_receber(situacao);
        CREATE INDEX IF NOT EXISTS idx_tiny_receber_nome ON tiny_contas_receber(nome_cliente);
        CREATE INDEX IF NOT EXISTS idx_tiny_pagar_venc ON tiny_contas_pagar(data_vencimento);
        CREATE INDEX IF NOT EXISTS idx_tiny_pagar_sit ON tiny_contas_pagar(situacao);
        CREATE INDEX IF NOT EXISTS idx_tiny_pagar_nome ON tiny_contas_pagar(nome_cliente);
        ",
    );
}

fn upsert_accounts(
    tx: &Connection,
    table: &str,
    contas: &[crate::modules::financeiro::models::TinyConta],
) -> Result<Vec<i64>, String> {
    let mut ids = Vec::with_capacity(contas.len());
    let sql = format!(
        "INSERT OR REPLACE INTO {} 
         (id, nome_cliente, historico, numero_doc, data_emissao, data_vencimento, valor, saldo, situacao)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        table
    );
    for conta in contas {
        let id = conta.id_as_i64();
        if id == 0 {
            continue;
        }
        let em_iso = convert_to_iso_date(&conta.data_emissao_str());
        let ven_iso = convert_to_iso_date(&conta.data_vencimento_str());
        tx.execute(
            &sql,
            params![
                id,
                conta.nome_cliente_str(),
                conta.historico_str(),
                conta.numero_doc_str(),
                em_iso,
                ven_iso,
                conta.valor_f64(),
                conta.saldo_f64(),
                conta.situacao_str()
            ],
        )
        .map_err(|e| format!("Erro ao salvar em {}: {}", table, e))?;
        ids.push(id);
    }
    Ok(ids)
}

/// Remove do intervalo contas que não voltaram na sync (reconciliação).
fn reconcile_period(
    tx: &Connection,
    table: &str,
    start_iso: &str,
    end_iso: &str,
    kept_ids: &[i64],
) -> Result<usize, String> {
    // Temp table com IDs mantidos
    tx.execute("DROP TABLE IF EXISTS _tiny_sync_ids", [])
        .map_err(|e| e.to_string())?;
    tx.execute("CREATE TEMP TABLE _tiny_sync_ids (id INTEGER PRIMARY KEY)", [])
        .map_err(|e| e.to_string())?;

    {
        let mut stmt = tx
            .prepare("INSERT OR IGNORE INTO _tiny_sync_ids (id) VALUES (?1)")
            .map_err(|e| e.to_string())?;
        for id in kept_ids {
            stmt.execute(params![id]).map_err(|e| e.to_string())?;
        }
    }

    let deleted = tx
        .execute(
            &format!(
                "DELETE FROM {} 
                 WHERE data_vencimento >= ?1 AND data_vencimento <= ?2
                   AND id NOT IN (SELECT id FROM _tiny_sync_ids)",
                table
            ),
            params![start_iso, end_iso],
        )
        .map_err(|e| e.to_string())?;

    let _ = tx.execute("DROP TABLE IF EXISTS _tiny_sync_ids", []);
    Ok(deleted)
}

// 1. GET /api/financeiro/status
pub async fn get_financial_status(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let token_configured = get_tiny_token(&state.db).is_some();

    let last_sync = match state.db.get_setting("tiny_financial_last_sync") {
        Ok(Some(date)) => Some(date),
        _ => None,
    };

    let (receivables_count, payables_count) = match state.db.connect() {
        Ok(conn) => {
            ensure_indexes(&conn);
            let r: i64 = conn
                .query_row("SELECT COUNT(*) FROM tiny_contas_receber", [], |row| row.get(0))
                .unwrap_or(0);
            let p: i64 = conn
                .query_row("SELECT COUNT(*) FROM tiny_contas_pagar", [], |row| row.get(0))
                .unwrap_or(0);
            (r, p)
        }
        Err(_) => (0, 0),
    };

    (
        StatusCode::OK,
        Json(StatusResponse {
            is_configured: token_configured,
            last_sync,
            receivables_count,
            payables_count,
        }),
    )
        .into_response()
}

// 2. POST /api/financeiro/sync
pub async fn sync_financial_data(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SyncRequest>,
) -> impl IntoResponse {
    let started = Instant::now();

    let token = match get_tiny_token(&state.db) {
        Some(t) => t,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Token da API do Tiny não está configurado." })),
            )
                .into_response();
        }
    };

    let today = Local::now().naive_local().date();
    let start_date_parsed = match req.start_date {
        Some(ref d) => parse_date_flexible(d, today - Duration::days(90)),
        None => today - Duration::days(90),
    };
    let end_date_parsed = match req.end_date {
        Some(ref d) => parse_date_flexible(d, today + Duration::days(180)),
        None => today + Duration::days(180),
    };

    let start_str = start_date_parsed.format("%d/%m/%Y").to_string();
    let end_str = end_date_parsed.format("%d/%m/%Y").to_string();
    let start_iso = start_date_parsed.format("%Y-%m-%d").to_string();
    let end_iso = end_date_parsed.format("%Y-%m-%d").to_string();

    let client = TinyClient::new(token);

    let receivables = match client
        .fetch_contas("contas.receber.pesquisa.php", &start_str, &end_str)
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Erro ao sincronizar Contas a Receber: {}", e) })),
            )
                .into_response();
        }
    };

    let payables = match client
        .fetch_contas("contas.pagar.pesquisa.php", &start_str, &end_str)
        .await
    {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Erro ao sincronizar Contas a Pagar: {}", e) })),
            )
                .into_response();
        }
    };

    let mut conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    ensure_indexes(&conn);

    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let recv_ids = match upsert_accounts(&tx, "tiny_contas_receber", &receivables) {
        Ok(ids) => ids,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response();
        }
    };
    let pay_ids = match upsert_accounts(&tx, "tiny_contas_pagar", &payables) {
        Ok(ids) => ids,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response();
        }
    };

    let recv_removed = match reconcile_period(
        &tx,
        "tiny_contas_receber",
        &start_iso,
        &end_iso,
        &recv_ids,
    ) {
        Ok(n) => n,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Reconciliação receber: {}", e) })),
            )
                .into_response();
        }
    };
    let pay_removed =
        match reconcile_period(&tx, "tiny_contas_pagar", &start_iso, &end_iso, &pay_ids) {
            Ok(n) => n,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": format!("Reconciliação pagar: {}", e) })),
                )
                    .into_response();
            }
        };

    if let Err(e) = tx.commit() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro de transação: {}", e) })),
        )
            .into_response();
    }

    let now_str = Local::now().format("%d/%m/%Y %H:%M:%S").to_string();
    let _ = state.db.save_setting("tiny_financial_last_sync", &now_str);
    let _ = state
        .db
        .save_setting("tiny_financial_sync_start", &start_iso);
    let _ = state.db.save_setting("tiny_financial_sync_end", &end_iso);

    (
        StatusCode::OK,
        Json(SyncResult {
            status: "success".into(),
            last_sync: now_str,
            receivables_upserted: recv_ids.len(),
            payables_upserted: pay_ids.len(),
            receivables_removed: recv_removed,
            payables_removed: pay_removed,
            elapsed_ms: started.elapsed().as_millis(),
            start_date: start_iso,
            end_date: end_iso,
        }),
    )
        .into_response()
}

// 3. GET /api/financeiro/contas
pub async fn get_financial_accounts(
    State(state): State<Arc<AppState>>,
    Query(query): Query<AccountsQuery>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    ensure_indexes(&conn);

    let table_name = if query.tipo == "pagar" {
        "tiny_contas_pagar"
    } else {
        "tiny_contas_receber"
    };

    let page = query.page.unwrap_or(1).max(1);
    let limit = query.limit.unwrap_or(100).clamp(1, 500);
    let offset = (page - 1) * limit;

    let mut where_sql = String::from(" WHERE 1=1");
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref sit) = query.situacao {
        if sit != "todos" && !sit.trim().is_empty() {
            where_sql.push_str(" AND situacao = ?");
            params_vec.push(Box::new(sit.to_lowercase()));
        }
    }

    if let Some(ref search) = query.search {
        if !search.trim().is_empty() {
            where_sql.push_str(" AND (nome_cliente LIKE ? OR historico LIKE ? OR numero_doc LIKE ?)");
            let term = format!("%{}%", search.trim());
            params_vec.push(Box::new(term.clone()));
            params_vec.push(Box::new(term.clone()));
            params_vec.push(Box::new(term));
        }
    }

    if let Some(ref start) = query.start_date {
        if !start.trim().is_empty() {
            where_sql.push_str(" AND data_vencimento >= ?");
            params_vec.push(Box::new(start.clone()));
        }
    }

    if let Some(ref end) = query.end_date {
        if !end.trim().is_empty() {
            where_sql.push_str(" AND data_vencimento <= ?");
            params_vec.push(Box::new(end.clone()));
        }
    }

    let overdue = query
        .overdue
        .as_ref()
        .map(|s| s.eq_ignore_ascii_case("true") || s == "1")
        .unwrap_or(false);
    let only_open = query
        .only_open
        .as_ref()
        .map(|s| s.eq_ignore_ascii_case("true") || s == "1")
        .unwrap_or(false);

    if overdue || only_open {
        where_sql.push_str(" AND situacao IN ('aberto','parcial')");
    }
    if overdue {
        where_sql.push_str(" AND data_vencimento < date('now','localtime') AND data_vencimento != ''");
    }
    if let Some(days) = query.due_within_days {
        if days > 0 {
            where_sql.push_str(
                " AND situacao IN ('aberto','parcial') \
                 AND data_vencimento >= date('now','localtime') \
                 AND data_vencimento <= date('now','localtime', ?)",
            );
            params_vec.push(Box::new(format!("+{} days", days)));
        }
    }

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

    let count_sql = format!("SELECT COUNT(*) FROM {}{}", table_name, where_sql);
    let total: i64 = match conn.query_row(&count_sql, params_refs.as_slice(), |row| row.get(0)) {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Erro ao contar: {}", e) })),
            )
                .into_response();
        }
    };

    let sums_sql = format!(
        "SELECT COALESCE(SUM(valor),0), COALESCE(SUM(saldo),0) FROM {}{}",
        table_name, where_sql
    );
    let (total_valor, total_saldo): (f64, f64) = conn
        .query_row(&sums_sql, params_refs.as_slice(), |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .unwrap_or((0.0, 0.0));

    let list_sql = format!(
        "SELECT id, nome_cliente, historico, numero_doc, data_emissao, data_vencimento, valor, saldo, situacao 
         FROM {}{} ORDER BY data_vencimento ASC LIMIT ? OFFSET ?",
        table_name, where_sql
    );

    let mut list_params: Vec<Box<dyn rusqlite::ToSql>> = params_vec;
    list_params.push(Box::new(limit));
    list_params.push(Box::new(offset));
    let list_refs: Vec<&dyn rusqlite::ToSql> = list_params.iter().map(|b| b.as_ref()).collect();

    let mut stmt = match conn.prepare(&list_sql) {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Erro ao preparar SQL: {}", e) })),
            )
                .into_response();
        }
    };

    let accounts: Vec<FinancialAccount> = match stmt.query_map(list_refs.as_slice(), |row| {
        Ok(FinancialAccount {
            id: row.get(0)?,
            nome_cliente: row.get(1)?,
            historico: row.get(2)?,
            numero_doc: row.get(3)?,
            data_emissao: row.get(4)?,
            data_vencimento: row.get(5)?,
            valor: row.get(6)?,
            saldo: row.get(7)?,
            situacao: row.get(8)?,
        })
    }) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Erro ao mapear contas: {}", e) })),
            )
                .into_response();
        }
    };

    let total_pages = if total == 0 {
        1
    } else {
        ((total as f64) / (limit as f64)).ceil() as i64
    };

    (
        StatusCode::OK,
        Json(AccountsPage {
            items: accounts,
            total,
            page,
            limit,
            total_pages,
            total_valor,
            total_saldo,
        }),
    )
        .into_response()
}

fn sum_open(conn: &Connection, table: &str) -> f64 {
    conn.query_row(
        &format!(
            "SELECT COALESCE(SUM(saldo), 0.0) FROM {} WHERE situacao IN ('aberto','parcial')",
            table
        ),
        [],
        |row| row.get(0),
    )
    .unwrap_or(0.0)
}

fn sum_overdue(conn: &Connection, table: &str, today: &str) -> f64 {
    conn.query_row(
        &format!(
            "SELECT COALESCE(SUM(saldo), 0.0) FROM {} 
             WHERE situacao IN ('aberto','parcial') AND data_vencimento < ?1 AND data_vencimento != ''",
            table
        ),
        params![today],
        |row| row.get(0),
    )
    .unwrap_or(0.0)
}

fn sum_paid(conn: &Connection, table: &str) -> f64 {
    conn.query_row(
        &format!(
            "SELECT COALESCE(SUM(valor - saldo), 0.0) FROM {} WHERE situacao IN ('pago','parcial')",
            table
        ),
        [],
        |row| row.get(0),
    )
    .unwrap_or(0.0)
}

fn count_open(conn: &Connection, table: &str) -> i64 {
    conn.query_row(
        &format!(
            "SELECT COUNT(*) FROM {} WHERE situacao IN ('aberto','parcial')",
            table
        ),
        [],
        |row| row.get(0),
    )
    .unwrap_or(0)
}

fn count_overdue(conn: &Connection, table: &str, today: &str) -> i64 {
    conn.query_row(
        &format!(
            "SELECT COUNT(*) FROM {} WHERE situacao IN ('aberto','parcial') AND data_vencimento < ?1 AND data_vencimento != ''",
            table
        ),
        params![today],
        |row| row.get(0),
    )
    .unwrap_or(0)
}

fn sum_due_between(conn: &Connection, table: &str, start: &str, end: &str) -> f64 {
    conn.query_row(
        &format!(
            "SELECT COALESCE(SUM(saldo), 0.0) FROM {} 
             WHERE situacao IN ('aberto','parcial') 
               AND data_vencimento >= ?1 AND data_vencimento <= ?2",
            table
        ),
        params![start, end],
        |row| row.get(0),
    )
    .unwrap_or(0.0)
}

fn sum_paid_in_month(conn: &Connection, table: &str, ym: &str) -> f64 {
    // Aproxima: contas com situação pago/parcial cujo vencimento cai no mês
    // (Tiny listagem não traz data de pagamento na pesquisa)
    conn.query_row(
        &format!(
            "SELECT COALESCE(SUM(CASE WHEN situacao = 'pago' THEN valor WHEN situacao = 'parcial' THEN (valor - saldo) ELSE 0 END), 0.0)
             FROM {} WHERE strftime('%Y-%m', data_vencimento) = ?1 AND situacao IN ('pago','parcial')",
            table
        ),
        params![ym],
        |row| row.get(0),
    )
    .unwrap_or(0.0)
}

fn aging_buckets(conn: &Connection, table: &str, today: NaiveDate) -> Vec<AgingBucket> {
    // buckets por atraso (dias > 0 = atrasado) e futuros
    let defs: Vec<(&str, i64, Option<i64>, bool)> = vec![
        ("A vencer 0–7d", 0, Some(7), false),
        ("A vencer 8–30d", 8, Some(30), false),
        ("A vencer 31–90d", 31, Some(90), false),
        ("A vencer 90d+", 91, None, false),
        ("Atrasado 1–30d", 1, Some(30), true),
        ("Atrasado 31–60d", 31, Some(60), true),
        ("Atrasado 61–90d", 61, Some(90), true),
        ("Atrasado 90d+", 91, None, true),
    ];

    let mut out = Vec::new();
    for (label, min_d, max_d, overdue) in defs {
        let mut sql = format!(
            "SELECT COUNT(*), COALESCE(SUM(saldo),0) FROM {} 
             WHERE situacao IN ('aberto','parcial') AND data_vencimento != ''",
            table
        );
        // days = julianday(today) - julianday(vencimento) → positivo se atrasado
        if overdue {
            sql.push_str(" AND data_vencimento < date('now','localtime')");
            sql.push_str(" AND CAST(julianday(date('now','localtime')) - julianday(data_vencimento) AS INTEGER) >= ?1");
            if max_d.is_some() {
                sql.push_str(" AND CAST(julianday(date('now','localtime')) - julianday(data_vencimento) AS INTEGER) <= ?2");
            }
        } else {
            sql.push_str(" AND data_vencimento >= date('now','localtime')");
            sql.push_str(" AND CAST(julianday(data_vencimento) - julianday(date('now','localtime')) AS INTEGER) >= ?1");
            if max_d.is_some() {
                sql.push_str(" AND CAST(julianday(data_vencimento) - julianday(date('now','localtime')) AS INTEGER) <= ?2");
            }
        }

        let (count, saldo): (i64, f64) = if let Some(max) = max_d {
            conn.query_row(&sql, params![min_d, max], |row| Ok((row.get(0)?, row.get(1)?)))
                .unwrap_or((0, 0.0))
        } else {
            conn.query_row(&sql, params![min_d], |row| Ok((row.get(0)?, row.get(1)?)))
                .unwrap_or((0, 0.0))
        };

        let _ = today; // used via SQL date('now')
        out.push(AgingBucket {
            label: label.into(),
            min_days: min_d,
            max_days: max_d,
            count,
            saldo,
        });
    }
    out
}

fn top_parties(conn: &Connection, table: &str, limit: i64) -> Vec<PartyBalance> {
    let sql = format!(
        "SELECT nome_cliente, COUNT(*), COALESCE(SUM(saldo),0)
         FROM {} WHERE situacao IN ('aberto','parcial') AND nome_cliente != ''
         GROUP BY nome_cliente
         ORDER BY 3 DESC
         LIMIT ?1",
        table
    );
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    stmt.query_map(params![limit], |row| {
        Ok(PartyBalance {
            nome: row.get(0)?,
            count: row.get(1)?,
            saldo: row.get(2)?,
        })
    })
    .map(|rows| rows.filter_map(|r| r.ok()).collect())
    .unwrap_or_default()
}

fn weekly_projection(conn: &Connection, weeks: i64) -> Vec<WeeklyProjection> {
    let today = Local::now().naive_local().date();
    let mut out = Vec::new();
    let mut acumulado = 0.0;

    for w in 0..weeks {
        let start = today + Duration::days(w * 7);
        let end = start + Duration::days(6);
        let start_s = start.format("%Y-%m-%d").to_string();
        let end_s = end.format("%Y-%m-%d").to_string();

        let entradas = sum_due_between(conn, "tiny_contas_receber", &start_s, &end_s);
        let saidas = sum_due_between(conn, "tiny_contas_pagar", &start_s, &end_s);
        let saldo = entradas - saidas;
        acumulado += saldo;

        out.push(WeeklyProjection {
            week_start: start_s,
            week_end: end_s.clone(),
            label: format!("{}–{}", start.format("%d/%m"), end.format("%d/%m")),
            entradas,
            saidas,
            saldo,
            acumulado,
        });
    }
    out
}

fn pct(part: f64, whole: f64) -> f64 {
    if whole.abs() < 0.0001 {
        0.0
    } else {
        (part / whole) * 100.0
    }
}

fn previous_month_ym(ym: &str) -> String {
    let parts: Vec<&str> = ym.split('-').collect();
    if parts.len() != 2 {
        return ym.to_string();
    }
    let y: i32 = parts[0].parse().unwrap_or(2026);
    let m: u32 = parts[1].parse().unwrap_or(1);
    if m <= 1 {
        format!("{:04}-12", y - 1)
    } else {
        format!("{:04}-{:02}", y, m - 1)
    }
}

fn concentration(conn: &Connection, table: &str, threshold_pct: f64) -> Concentration {
    let total_aberto = sum_open(conn, table);
    let tops = top_parties(conn, table, 3);
    let top3_saldo: f64 = tops.iter().map(|p| p.saldo).sum();
    let pct_top3 = pct(top3_saldo, total_aberto);
    Concentration {
        top3_saldo,
        total_aberto,
        pct_top3,
        alert: pct_top3 >= threshold_pct && total_aberto > 0.0,
        threshold_pct,
        top_names: tops.into_iter().map(|p| p.nome).collect(),
    }
}

/// Sparkline: saldo líquido (entradas−saídas por vencimento) nas últimas N semanas.
fn sparkline_liquido(conn: &Connection, weeks_back: i64) -> Vec<SparkPoint> {
    let today = Local::now().naive_local().date();
    let mut out = Vec::new();
    for w in (0..weeks_back).rev() {
        let start = today - Duration::days((w + 1) * 7 - 1) - Duration::days(6);
        // align: week ending today-ish
        let end = today - Duration::days(w * 7);
        let start = end - Duration::days(6);
        let start_s = start.format("%Y-%m-%d").to_string();
        let end_s = end.format("%Y-%m-%d").to_string();

        let entradas: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(valor),0) FROM tiny_contas_receber
                 WHERE situacao != 'cancelado' AND data_vencimento >= ?1 AND data_vencimento <= ?2",
                params![start_s, end_s],
                |row| row.get(0),
            )
            .unwrap_or(0.0);
        let saidas: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(valor),0) FROM tiny_contas_pagar
                 WHERE situacao != 'cancelado' AND data_vencimento >= ?1 AND data_vencimento <= ?2",
                params![start_s, end_s],
                |row| row.get(0),
            )
            .unwrap_or(0.0);

        out.push(SparkPoint {
            label: format!("{}", end.format("%d/%m")),
            period_start: start_s,
            valor: entradas - saidas,
        });
    }
    out
}

fn attention_list(
    conn: &Connection,
    table: &str,
    tipo: &str,
    mode: &str, // "overdue" | "due7"
    limit: i64,
) -> Vec<AttentionItem> {
    let today = Local::now().naive_local().date();
    let today_s = today.format("%Y-%m-%d").to_string();
    let in_7 = (today + Duration::days(7)).format("%Y-%m-%d").to_string();

    let (sql, order) = if mode == "overdue" {
        (
            format!(
                "SELECT id, nome_cliente, historico, numero_doc, data_vencimento, valor, saldo, situacao
                 FROM {} WHERE situacao IN ('aberto','parcial')
                   AND data_vencimento < ?1 AND data_vencimento != ''
                 ORDER BY data_vencimento ASC LIMIT ?2",
                table
            ),
            true,
        )
    } else {
        (
            format!(
                "SELECT id, nome_cliente, historico, numero_doc, data_vencimento, valor, saldo, situacao
                 FROM {} WHERE situacao IN ('aberto','parcial')
                   AND data_vencimento >= ?1 AND data_vencimento <= ?2
                 ORDER BY data_vencimento ASC LIMIT ?3",
                table
            ),
            false,
        )
    };

    let mut out = Vec::new();
    if order {
        let mut stmt = match conn.prepare(&sql) {
            Ok(s) => s,
            Err(_) => return out,
        };
        let rows = stmt.query_map(params![today_s, limit], |row| {
            let data_vencimento: String = row.get(4)?;
            let dias = days_between(&data_vencimento, &today_s);
            Ok(AttentionItem {
                id: row.get(0)?,
                tipo: tipo.into(),
                nome_cliente: row.get(1)?,
                historico: row.get(2)?,
                numero_doc: row.get(3)?,
                data_vencimento,
                valor: row.get(5)?,
                saldo: row.get(6)?,
                situacao: row.get(7)?,
                dias,
            })
        });
        if let Ok(rows) = rows {
            out.extend(rows.filter_map(|r| r.ok()));
        }
    } else {
        let mut stmt = match conn.prepare(&sql) {
            Ok(s) => s,
            Err(_) => return out,
        };
        let rows = stmt.query_map(params![today_s, in_7, limit], |row| {
            let data_vencimento: String = row.get(4)?;
            let dias = days_between(&today_s, &data_vencimento); // days until due (positive)
            Ok(AttentionItem {
                id: row.get(0)?,
                tipo: tipo.into(),
                nome_cliente: row.get(1)?,
                historico: row.get(2)?,
                numero_doc: row.get(3)?,
                data_vencimento,
                valor: row.get(5)?,
                saldo: row.get(6)?,
                situacao: row.get(7)?,
                dias: -dias, // negativo = a vencer em N dias
            })
        });
        if let Ok(rows) = rows {
            out.extend(rows.filter_map(|r| r.ok()));
        }
    }
    out
}

fn days_between(from_iso: &str, to_iso: &str) -> i64 {
    let parse = |s: &str| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok();
    match (parse(from_iso), parse(to_iso)) {
        (Some(a), Some(b)) => (b - a).num_days(),
        _ => 0,
    }
}

fn build_sync_meta(state: &crate::core::db::Db) -> SyncMeta {
    let is_configured = get_tiny_token(state).is_some();
    let last_sync = state.get_setting("tiny_financial_last_sync").ok().flatten();
    let coverage_start = state.get_setting("tiny_financial_sync_start").ok().flatten();
    let coverage_end = state.get_setting("tiny_financial_sync_end").ok().flatten();

    let stale_threshold_days = 2i64;
    let days_since_sync = last_sync.as_ref().and_then(|s| {
        // formats: "dd/mm/yyyy HH:MM:SS"
        let date_part = s.split_whitespace().next().unwrap_or(s);
        let parsed = NaiveDate::parse_from_str(date_part, "%d/%m/%Y")
            .or_else(|_| NaiveDate::parse_from_str(date_part, "%Y-%m-%d"))
            .ok()?;
        let today = Local::now().naive_local().date();
        Some((today - parsed).num_days())
    });

    let is_stale = days_since_sync.map(|d| d >= stale_threshold_days).unwrap_or(true);

    SyncMeta {
        is_configured,
        last_sync,
        coverage_start,
        coverage_end,
        days_since_sync,
        is_stale: is_configured && is_stale,
        stale_threshold_days,
    }
}

// 4. GET /api/financeiro/fluxo  (dashboard completo)
pub async fn get_financial_flow(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SyncRequest>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    ensure_indexes(&conn);

    let today = Local::now().naive_local().date();
    let today_str = today.format("%Y-%m-%d").to_string();
    let ym = today.format("%Y-%m").to_string();

    let start = query.start_date.unwrap_or_else(|| {
        (today - Duration::days(90)).format("%Y-%m-%d").to_string()
    });
    let end = query
        .end_date
        .unwrap_or_else(|| (today + Duration::days(180)).format("%Y-%m-%d").to_string());

    let in_7 = (today + Duration::days(7)).format("%Y-%m-%d").to_string();
    let in_30 = (today + Duration::days(30)).format("%Y-%m-%d").to_string();

    let total_receber_aberto = sum_open(&conn, "tiny_contas_receber");
    let total_receber_atrasado = sum_overdue(&conn, "tiny_contas_receber", &today_str);
    let total_receber_pago = sum_paid(&conn, "tiny_contas_receber");
    let total_pagar_aberto = sum_open(&conn, "tiny_contas_pagar");
    let total_pagar_atrasado = sum_overdue(&conn, "tiny_contas_pagar", &today_str);
    let total_pagar_pago = sum_paid(&conn, "tiny_contas_pagar");

    let posicao_liquida = total_receber_aberto - total_pagar_aberto;
    let risco_liquido = total_receber_atrasado - total_pagar_atrasado;

    let receber_vencendo_7d =
        sum_due_between(&conn, "tiny_contas_receber", &today_str, &in_7);
    let receber_vencendo_30d =
        sum_due_between(&conn, "tiny_contas_receber", &today_str, &in_30);
    let pagar_vencendo_7d = sum_due_between(&conn, "tiny_contas_pagar", &today_str, &in_7);
    let pagar_vencendo_30d = sum_due_between(&conn, "tiny_contas_pagar", &today_str, &in_30);

    // Monthly flow
    let sql_flow = "
        WITH periods AS (
            SELECT DISTINCT strftime('%Y-%m', data_vencimento) as period FROM tiny_contas_receber WHERE data_vencimento >= ?1 AND data_vencimento <= ?2 AND situacao != 'cancelado'
            UNION
            SELECT DISTINCT strftime('%Y-%m', data_vencimento) as period FROM tiny_contas_pagar WHERE data_vencimento >= ?1 AND data_vencimento <= ?2 AND situacao != 'cancelado'
        ),
        entradas AS (
            SELECT strftime('%Y-%m', data_vencimento) as period,
                   SUM(valor) as total,
                   SUM(CASE WHEN situacao = 'pago' THEN valor WHEN situacao = 'parcial' THEN (valor - saldo) ELSE 0.0 END) as pago
            FROM tiny_contas_receber
            WHERE data_vencimento >= ?1 AND data_vencimento <= ?2 AND situacao != 'cancelado'
            GROUP BY 1
        ),
        saidas AS (
            SELECT strftime('%Y-%m', data_vencimento) as period,
                   SUM(valor) as total,
                   SUM(CASE WHEN situacao = 'pago' THEN valor WHEN situacao = 'parcial' THEN (valor - saldo) ELSE 0.0 END) as pago
            FROM tiny_contas_pagar
            WHERE data_vencimento >= ?1 AND data_vencimento <= ?2 AND situacao != 'cancelado'
            GROUP BY 1
        )
        SELECT p.period,
               COALESCE(e.total, 0.0),
               COALESCE(e.pago, 0.0),
               COALESCE(s.total, 0.0),
               COALESCE(s.pago, 0.0)
        FROM periods p
        LEFT JOIN entradas e ON p.period = e.period
        LEFT JOIN saidas s ON p.period = s.period
        ORDER BY p.period ASC
    ";

    let mut flow = Vec::new();
    if let Ok(mut stmt) = conn.prepare(sql_flow) {
        if let Ok(rows) = stmt.query_map(params![start, end], |row| {
            let entrada_total: f64 = row.get(1)?;
            let entrada_paga: f64 = row.get(2)?;
            let saida_total: f64 = row.get(3)?;
            let saida_paga: f64 = row.get(4)?;
            Ok(MonthlyFlow {
                period: row.get(0)?,
                entrada_total,
                entrada_paga,
                saida_total,
                saida_paga,
                saldo_periodo: entrada_total - saida_total,
            })
        }) {
            for r in rows.flatten() {
                flow.push(r);
            }
        }
    }

    let pct_atraso_receber = pct(total_receber_atrasado, total_receber_aberto);
    let pct_atraso_pagar = pct(total_pagar_atrasado, total_pagar_aberto);
    let ym_prev = previous_month_ym(&ym);
    let recebido_atual = sum_paid_in_month(&conn, "tiny_contas_receber", &ym);
    let recebido_anterior = sum_paid_in_month(&conn, "tiny_contas_receber", &ym_prev);
    let pago_atual = sum_paid_in_month(&conn, "tiny_contas_pagar", &ym);
    let pago_anterior = sum_paid_in_month(&conn, "tiny_contas_pagar", &ym_prev);

    (
        StatusCode::OK,
        Json(FlowSummary {
            total_receber_aberto,
            total_receber_atrasado,
            total_receber_pago,
            total_pagar_aberto,
            total_pagar_atrasado,
            total_pagar_pago,
            posicao_liquida,
            risco_liquido,
            pct_atraso_receber,
            pct_atraso_pagar,
            receber_vencendo_7d,
            receber_vencendo_30d,
            pagar_vencendo_7d,
            pagar_vencendo_30d,
            qtd_receber_aberto: count_open(&conn, "tiny_contas_receber"),
            qtd_receber_atrasado: count_overdue(&conn, "tiny_contas_receber", &today_str),
            qtd_pagar_aberto: count_open(&conn, "tiny_contas_pagar"),
            qtd_pagar_atrasado: count_overdue(&conn, "tiny_contas_pagar", &today_str),
            recebido_mes_atual: recebido_atual,
            pago_mes_atual: pago_atual,
            valores_sao_aproximados: true,
            sync_meta: build_sync_meta(&state.db),
            month_comparison: MonthComparison {
                mes_atual: ym.clone(),
                mes_anterior: ym_prev,
                recebido_atual,
                recebido_anterior,
                pago_atual,
                pago_anterior,
                liquido_atual: recebido_atual - pago_atual,
                liquido_anterior: recebido_anterior - pago_anterior,
            },
            concentration_clientes: concentration(&conn, "tiny_contas_receber", 50.0),
            concentration_fornecedores: concentration(&conn, "tiny_contas_pagar", 50.0),
            sparkline_liquido: sparkline_liquido(&conn, 8),
            attention_receber_atrasado: attention_list(&conn, "tiny_contas_receber", "receber", "overdue", 10),
            attention_pagar_atrasado: attention_list(&conn, "tiny_contas_pagar", "pagar", "overdue", 10),
            attention_receber_7d: attention_list(&conn, "tiny_contas_receber", "receber", "due7", 10),
            attention_pagar_7d: attention_list(&conn, "tiny_contas_pagar", "pagar", "due7", 10),
            aging_receber: aging_buckets(&conn, "tiny_contas_receber", today),
            aging_pagar: aging_buckets(&conn, "tiny_contas_pagar", today),
            top_clientes: top_parties(&conn, "tiny_contas_receber", 8),
            top_fornecedores: top_parties(&conn, "tiny_contas_pagar", 8),
            weekly_projection: weekly_projection(&conn, 8),
            flow,
        }),
    )
        .into_response()
}

// 5. POST /api/financeiro/token
pub async fn save_tiny_token(
    State(state): State<Arc<AppState>>,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    let token = match body.get("token") {
        Some(t) => t.as_str().unwrap_or("").trim(),
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Token não fornecido." })),
            )
                .into_response();
        }
    };

    let stored = obfuscate_token(token);
    match state.db.save_setting("tiny_api_token", &stored) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao salvar token: {}", e) })),
        )
            .into_response(),
    }
}

use sqlx::{PgPool, Row};
use std::collections::HashMap;
use tiberius::{Client, Config};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;
use std::collections::HashSet;
use uuid::Uuid;
use chrono::{Duration, Local, NaiveDate, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use crate::modules::compras::planejamento::parser::get_linha_prefix;

/// Modo de sincronização ERP.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncMode {
    /// Rebuild da janela histórica (piso configurável; padrão desde 2024-01-01).
    Full,
    /// Delta desde watermark − overlap (2 dias). Escalona para Full se não houver cursor.
    Incremental,
}

impl SyncMode {
    pub fn as_str(self) -> &'static str {
        match self {
            SyncMode::Full => "full",
            SyncMode::Incremental => "incremental",
        }
    }

    pub fn parse(raw: Option<&str>) -> Self {
        match raw.map(|s| s.trim().to_ascii_lowercase()).as_deref() {
            Some("full") | Some("completo") => SyncMode::Full,
            _ => SyncMode::Incremental,
        }
    }
}

/// Piso padrão do sync completo (tabelas transacionais). Sobrescrito por `erp_sync_history_floor`.
const HISTORY_FLOOR_DEFAULT: &str = "2024-01-01";
/// Quando a opção "histórico completo" está ativa.
const HISTORY_FLOOR_ALL: &str = "1900-01-01";
const HISTORY_FLOOR_SETTING: &str = "erp_sync_history_floor";
const OVERLAP_DAYS: i64 = 2;
const WATERMARK_KEY: &str = "erp_sync_watermark";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct ErpSyncWatermark {
    version: u32,
    #[serde(default)]
    last_full_at: Option<String>,
    #[serde(default)]
    last_incremental_at: Option<String>,
    #[serde(default)]
    cursor: Option<String>,
}

pub struct SyncResult {
    pub products: usize,
    pub suppliers: usize,
    pub items: usize,
    pub snapshots: usize,
    pub invoices: usize,
    pub consumption: usize,
    pub formulations: usize,
    pub kit_composicao: usize,
    pub movements: usize,
    pub purchase_orders: usize,
    pub sales_orders: usize,
    pub mode: &'static str,
    pub since: String,
    /// Insumos conferidos contra `nQtdeEstoque` após gravar snapshots.
    pub stock_verified: usize,
    /// Insumos corrigidos na verificação pós-sync.
    pub stock_repaired: usize,
}

// Intermediate thread-safe structs to hold SQL Server data
struct ProductRow {
    codigo: String,
    descricao: String,
    estoque: f64,
    producao: f64,
    pedidos: f64,
    base: Option<String>,
    fase: Option<String>,
    m_sales: [i32; 12],
    codigo_barras: Option<String>,
}

struct SupplierRow {
    cod_fornec: i32,
    nome: String,
    contato: Option<String>,
    email: Option<String>,
    obs: Option<String>,
}

struct InsumoRow {
    code: String,
    desc: String,
    unit: String,
    line: Option<String>,
    type_code: Option<String>,
    is_ignored: i32,
}

struct MaterialRow {
    code: String,
    desc: String,
    unit: String,
    line: Option<String>,
    type_code: Option<String>,
    is_ignored: i32,
}

#[derive(Clone)]
struct StockRow {
    code: String,
    stock_qty: f64,
    reserved_qty: f64,
    in_prod: f64,
    in_orders: f64,
}

/// Lê FLOAT/REAL/INT do SQL Server via Tiberius sem cair em 0 silencioso à toa.
fn mssql_f64(row: &tiberius::Row, idx: usize) -> f64 {
    if let Ok(Some(v)) = row.try_get::<f64, _>(idx) {
        return v;
    }
    if let Ok(Some(v)) = row.try_get::<f32, _>(idx) {
        return v as f64;
    }
    if let Ok(Some(v)) = row.try_get::<i64, _>(idx) {
        return v as f64;
    }
    if let Ok(Some(v)) = row.try_get::<i32, _>(idx) {
        return v as f64;
    }
    0.0
}

#[derive(Clone, Debug)]
struct InvoiceRow {
    nota: i32,
    code: String,
    desc: Option<String>,
    unit: Option<String>,
    quantity: f64,
    unit_price: f64,
    total_value: f64,
    fornec_name: Option<String>,
    supplier_id: Option<String>,
    date_str: Option<String>,
    cfop: Option<String>,
    icms_value: f64,
    ipi_value: f64,
    freight_value: f64,
    entry_date: Option<String>,
    carrier_name: Option<String>,
    supplier_cnpj: Option<String>,
    payment_installments: Option<String>,
    fte_number: Option<String>,
    fte_value: f64,
    fte_carrier_name: Option<String>,
    fte_carrier_cnpj: Option<String>,
    fte_issue_date: Option<String>,
    fte_entry_date: Option<String>,
    fte_cif_fob: Option<String>,
    fte_serie: Option<String>,
    fte_cfop: Option<String>,
    fte_natureza: Option<String>,
    fte_icms_value: f64,
}

struct ConsumptionRow {
    code: String,
    year: i32,
    total_qty: f64,
    monthly_avg: f64,
}

struct FormulationRow {
    product_code: String,
    ingredient_code: String,
    description: Option<String>,
    quantity: f64,
    percentage: Option<f64>,
}

struct KitComposicaoErpRow {
    kit_codigo: String,
    componente_codigo: String,
    quantidade: f64,
    fator_proporcao_qtd: f64,
    fator_proporcao_kits: i32,
}

struct LoteRow {
    lote: i32,
    product_code: String,
    qty: f64,
    date_str: String,
    status: Option<String>,
    fab: Option<String>,
    aut: Option<String>,
    unidades: Option<f64>,
    d_pesado: Option<String>,
    d_envase: Option<String>,
    ph: Option<f64>,
    viscosidade: Option<f64>,
    densidade: Option<f64>,
    viscosidade_24h: Option<f64>,
    responsavel: Option<String>,
    resultado: Option<String>,
    data_inspecao: Option<String>,
    observacoes: Option<String>,
}

struct LoteBaixaRow {
    registro: i32,
    lote: i32,
    ref_code: String,
    qty: f64,
    date_str: String,
    user: Option<String>,
    just: Option<String>,
    prod_code: Option<String>,
    n_qtde_ref: f64,
}

/// Agrupa duplicatas (nlote, creferencia) somando qty/nqtderef — mantém menor registro.
fn dedupe_lotes_baixas(rows: Vec<LoteBaixaRow>) -> Vec<LoteBaixaRow> {
    let mut merged: HashMap<(i32, String), LoteBaixaRow> = HashMap::new();
    for row in rows {
        let key = (row.lote, row.ref_code.clone());
        merged
            .entry(key)
            .and_modify(|existing| {
                existing.qty += row.qty;
                existing.n_qtde_ref += row.n_qtde_ref;
                if row.registro < existing.registro {
                    existing.registro = row.registro;
                }
            })
            .or_insert(row);
    }
    merged.into_values().collect()
}

/// Passo O — movimentos extras de insumos (acertos/inventário). Preencher SQL real via erp-import.
struct ExtraInsumoMovRow {
    ref_code: String,
    qty: f64,
    date_str: String,
    mov_type: String,
    document: String,
    details: String,
}

struct VendaRow {
    venda: i32,
    prod_code: String,
    qty: f64,
    date_str: String,
    client_name: Option<String>,
    nota_fiscal: Option<i32>,
}

struct PedidoCpa1Row {
    n_registro: i32,
    n_pedido: i32,
    d_pedido: Option<String>,
    n_cod_fornec: Option<i32>,
    c_nome_f: Option<String>,
    c_usuario: Option<String>,
    c_status: Option<String>,
    c_prazo_pgto: Option<String>,
    c_prev_entrega: Option<String>,
    n_valor: f64,
    d_previsao: Option<String>,
    c_email: Option<String>,
    m_observac: Option<String>,
}

struct PedidoCpa2Row {
    n_pedido_registro: i32,
    n_pedido: i32,
    c_referencia: String,
    n_qtde: f64,
    n_preco: f64,
    n_chegou: f64,
    c_descricao: Option<String>,
    c_unidade: Option<String>,
    n_valor_total: f64,
    n_registro: i32,
    c_chegada: Option<String>,
}

struct SalesOrderRow {
    n_pedido: i32,
    d_pedido: String,
    n_codigo: Option<i32>,
    c_nome: Option<String>,
    n_valor_tot: f64,
    c_status: Option<String>,
    n_nota_fiscal: i32,
    d_previsao: Option<String>,
    d_entrega: Option<String>,
    m_observac: Option<String>,
}

struct SalesOrderItemRow {
    n_pedido: i32,
    d_pedido: String,
    n_registro: Option<i32>,
    c_cod_prod: String,
    n_qtde: i32,
    n_qtde_fat: i32,
    n_preco: f64,
    c_lote: Option<String>,
}

async fn get_setting_from_pool(pool: &PgPool, key: &str) -> Option<String> {
    sqlx::query("SELECT value FROM settings WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .map(|r| r.get(0))
}

async fn save_setting_to_pool(pool: &PgPool, key: &str, value: &str) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}

async fn load_watermark(pool: &PgPool) -> ErpSyncWatermark {
    let Some(raw) = get_setting_from_pool(pool, WATERMARK_KEY).await else {
        return ErpSyncWatermark {
            version: 1,
            ..Default::default()
        };
    };
    serde_json::from_str(&raw).unwrap_or(ErpSyncWatermark {
        version: 1,
        ..Default::default()
    })
}

async fn save_watermark(pool: &PgPool, wm: &ErpSyncWatermark) -> anyhow::Result<()> {
    let raw = serde_json::to_string(wm)?;
    save_setting_to_pool(pool, WATERMARK_KEY, &raw).await
}

fn parse_ymd(s: &str) -> Option<NaiveDate> {
    let trimmed = s.trim();
    if trimmed.len() >= 10 {
        NaiveDate::parse_from_str(&trimmed[..10], "%Y-%m-%d").ok()
    } else {
        None
    }
}

fn resolve_sync_window(
    requested: SyncMode,
    wm: &ErpSyncWatermark,
    floor_ymd: &str,
) -> (SyncMode, String) {
    let has_cursor = wm
        .cursor
        .as_ref()
        .map(|c| parse_ymd(c).is_some())
        .unwrap_or(false);

    let effective = match requested {
        SyncMode::Full => SyncMode::Full,
        SyncMode::Incremental if has_cursor => SyncMode::Incremental,
        SyncMode::Incremental => SyncMode::Full,
    };

    let floor = parse_ymd(floor_ymd).unwrap_or_else(|| {
        NaiveDate::from_ymd_opt(2024, 1, 1).unwrap()
    });
    let floor_str = floor.format("%Y-%m-%d").to_string();

    let since = match effective {
        SyncMode::Full => floor_str,
        SyncMode::Incremental => {
            let cursor =
                parse_ymd(wm.cursor.as_deref().unwrap_or(floor_ymd)).unwrap_or(floor);
            let with_overlap = cursor - Duration::days(OVERLAP_DAYS);
            let since_date = if with_overlap < floor {
                floor
            } else {
                with_overlap
            };
            since_date.format("%Y-%m-%d").to_string()
        }
    };

    (effective, since)
}

/// Lê `erp_sync_history_floor`: data `YYYY-MM-DD`, ou `all`/`completo` para histórico sem corte 2024.
async fn load_history_floor(pool: &PgPool) -> String {
    let raw: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = $1")
        .bind(HISTORY_FLOOR_SETTING)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();

    match raw.as_deref().map(str::trim) {
        None | Some("") => HISTORY_FLOOR_DEFAULT.to_string(),
        Some("all") | Some("completo") | Some("full") | Some("historico") => {
            HISTORY_FLOOR_ALL.to_string()
        }
        Some(ymd) => {
            if parse_ymd(ymd).is_some() {
                ymd.chars().take(10).collect()
            } else {
                HISTORY_FLOOR_DEFAULT.to_string()
            }
        }
    }
}

fn sql_datetime_since(since_ymd: &str) -> String {
    format!("{} 00:00:00", since_ymd)
}

/// Data `YYYY-MM-DD` para chave natural (n_pedido, d_pedido).
fn normalize_pedido_date(d: &str) -> String {
    let t = d.trim();
    if t.len() >= 10 {
        t[..10].to_string()
    } else {
        t.to_string()
    }
}

/// Pedidos que o Hub ainda trata como abertos — reconsultar no ERP mesmo fora da janela incremental.
async fn load_hub_open_sales_order_keys(pool: &PgPool) -> Vec<(i32, String)> {
    let rows = sqlx::query(
        r#"
        SELECT DISTINCT so.n_pedido, so.d_pedido::text
        FROM sales_orders so
        WHERE TRIM(COALESCE(so.c_status, '')) IN ('PP', 'LB', 'EX', 'CF', 'AL')
           OR EXISTS (
                SELECT 1 FROM sales_order_items soi
                WHERE soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
                  AND soi.n_qtde > soi.n_qtde_fat
                  AND TRIM(COALESCE(so.c_status, '')) NOT IN ('FT', 'CA')
           )
        "#,
    )
    .fetch_all(pool)
    .await;

    let Ok(rows) = rows else {
        return Vec::new();
    };

    rows.into_iter()
        .map(|r| {
            let n_pedido: i32 = r.get(0);
            let d_pedido: String = r.get(1);
            (n_pedido, normalize_pedido_date(&d_pedido))
        })
        .collect()
}

/// Lotes que o Hub ainda trata como abertos em stock_movements — reconsultar no ERP mesmo fora da janela incremental.
async fn load_hub_open_lote_numbers(pool: &PgPool) -> Vec<i32> {
    let rows = sqlx::query_scalar::<_, String>(
        r#"
        SELECT DISTINCT document_number
        FROM stock_movements
        WHERE item_type = 'produto' AND movement_type = 'entrada'
          AND COALESCE(document_number, '') ~ '^[0-9]+$'
          AND details IS NOT NULL
          AND (details LIKE '%Status: PG%' OR details LIKE '%Status: PP%' OR details LIKE '%Status: PR%' OR details LIKE '%Status: EN%')
          AND details NOT LIKE '%Status: EA%'
          AND details NOT LIKE '%Status: CF%'
          AND details NOT LIKE '%Status: FP%'
          AND details NOT LIKE '%Status: CA%'
          AND details NOT LIKE '%Status: FI%'
        "#,
    )
    .fetch_all(pool)
    .await;

    let Ok(rows) = rows else {
        return Vec::new();
    };

    let mut out: Vec<i32> = rows
        .into_iter()
        .filter_map(|s| s.parse::<i32>().ok())
        .collect();
    out.sort_unstable();
    out.dedup();
    out
}

fn build_pedido_pairs_sql_filter(pairs: &[(i32, String)], p1_alias: bool) -> String {
    if pairs.is_empty() {
        return "1 = 0".to_string();
    }
    let prefix = if p1_alias { "p1." } else { "" };
    pairs
        .iter()
        .map(|(n, d)| {
            format!(
                "({prefix}nPedido = {n} AND CONVERT(date, {prefix}dPedido) = '{d}')"
            )
        })
        .collect::<Vec<_>>()
        .join(" OR ")
}

fn merge_sales_orders(
    target: &mut Vec<SalesOrderRow>,
    incoming: Vec<SalesOrderRow>,
) {
    let mut seen: HashSet<(i32, String)> = target
        .iter()
        .map(|s| (s.n_pedido, normalize_pedido_date(&s.d_pedido)))
        .collect();
    for so in incoming {
        let key = (so.n_pedido, normalize_pedido_date(&so.d_pedido));
        if seen.insert(key.clone()) {
            target.push(so);
        } else if let Some(existing) = target.iter_mut().find(|s| {
            s.n_pedido == so.n_pedido && normalize_pedido_date(&s.d_pedido) == key.1
        }) {
            *existing = so;
        }
    }
}

fn merge_sales_order_items(
    target: &mut Vec<SalesOrderItemRow>,
    incoming: Vec<SalesOrderItemRow>,
) {
    let mut seen: HashSet<(i32, String, String)> = target
        .iter()
        .map(|s| {
            (
                s.n_pedido,
                normalize_pedido_date(&s.d_pedido),
                s.c_cod_prod.clone(),
            )
        })
        .collect();
    for soi in incoming {
        let key = (
            soi.n_pedido,
            normalize_pedido_date(&soi.d_pedido),
            soi.c_cod_prod.clone(),
        );
        if seen.insert(key.clone()) {
            target.push(soi);
        } else if let Some(existing) = target.iter_mut().find(|s| {
            s.n_pedido == soi.n_pedido
                && normalize_pedido_date(&s.d_pedido) == key.1
                && s.c_cod_prod == key.2
        }) {
            *existing = soi;
        }
    }
}

async fn fetch_sales_orders_reconcile(
    client: &mut Client<tokio_util::compat::Compat<tokio::net::TcpStream>>,
    pairs: &[(i32, String)],
) -> anyhow::Result<Vec<SalesOrderRow>> {
    if pairs.is_empty() {
        return Ok(Vec::new());
    }
    let filter = build_pedido_pairs_sql_filter(pairs, false);
    let query = format!(
        "
SELECT 
    nPedido,
    CONVERT(varchar, dPedido, 120) COLLATE Latin1_General_CI_AS as dPedido,
    nCodigo,
    cNome COLLATE Latin1_General_CI_AS as cNome,
    CAST(nValorTot AS FLOAT) as nValorTot,
    CSTATUS COLLATE Latin1_General_CI_AS as CSTATUS,
    NNOTAFISCAL,
    CONVERT(varchar, dPrevisaoDespacho, 120) COLLATE Latin1_General_CI_AS as dPrevisao,
    CONVERT(varchar, dEntrega, 120) COLLATE Latin1_General_CI_AS as dEntrega,
    CAST(mObservac AS NVARCHAR(MAX)) COLLATE Latin1_General_CI_AS as mObservac
FROM Pedidos1 WITH (NOLOCK)
WHERE {filter};
"
    );
    let stream = client.query(query, &[]).await?;
    let rows = stream.into_first_result().await?;
    let mut out = Vec::new();
    for row in rows {
        let n_pedido: i32 = row.get(0).unwrap_or(0);
        let d_pedido: &str = row.get(1).unwrap_or("");
        if n_pedido == 0 || d_pedido.is_empty() {
            continue;
        }
        out.push(SalesOrderRow {
            n_pedido,
            d_pedido: d_pedido.trim().to_string(),
            n_codigo: row.get(2),
            c_nome: row.get(3).map(|s: &str| s.trim().to_string()),
            n_valor_tot: row.get(4).unwrap_or(0.0),
            c_status: row.get(5).map(|s: &str| s.trim().to_string()),
            n_nota_fiscal: row.get(6).unwrap_or(0),
            d_previsao: row.get(7).map(|s: &str| s.trim().to_string()),
            d_entrega: row.get(8).map(|s: &str| s.trim().to_string()),
            m_observac: row.get(9).map(|s: &str| s.trim().to_string()),
        });
    }
    Ok(out)
}

async fn fetch_sales_order_items_reconcile(
    client: &mut Client<tokio_util::compat::Compat<tokio::net::TcpStream>>,
    pairs: &[(i32, String)],
) -> anyhow::Result<Vec<SalesOrderItemRow>> {
    if pairs.is_empty() {
        return Ok(Vec::new());
    }
    let filter = build_pedido_pairs_sql_filter(pairs, true);
    let query = format!(
        "
SELECT 
    p2.nPedido,
    CONVERT(varchar, p2.dPedido, 120) COLLATE Latin1_General_CI_AS as dPedido,
    p2.nRegistro,
    p2.cCodProd COLLATE Latin1_General_CI_AS as cCodProd,
    CAST(p2.nQtde AS INT) as nQtde,
    CAST(p2.nQtdeFat AS INT) as nQtdeFat,
    CAST(p2.nPreco AS FLOAT) as nPreco,
    p2.cLote COLLATE Latin1_General_CI_AS as cLote
FROM Pedidos2 p2 WITH (NOLOCK)
INNER JOIN Pedidos1 p1 WITH (NOLOCK) ON p1.nPedido = p2.nPedido AND p1.dPedido = p2.dPedido
WHERE {filter};
"
    );
    let stream = client.query(query, &[]).await?;
    let rows = stream.into_first_result().await?;
    let mut out = Vec::new();
    for row in rows {
        let n_pedido: i32 = row.get(0).unwrap_or(0);
        let d_pedido: &str = row.get(1).unwrap_or("");
        let c_cod_prod: &str = row.get(3).unwrap_or("");
        if n_pedido == 0 || d_pedido.is_empty() || c_cod_prod.is_empty() {
            continue;
        }
        out.push(SalesOrderItemRow {
            n_pedido,
            d_pedido: d_pedido.trim().to_string(),
            n_registro: row.get(2),
            c_cod_prod: c_cod_prod.trim().to_string(),
            n_qtde: row.get(4).unwrap_or(0),
            n_qtde_fat: row.get(5).unwrap_or(0),
            n_preco: row.get(6).unwrap_or(0.0),
            c_lote: row.get(7).map(|s: &str| s.trim().to_string()),
        });
    }
    Ok(out)
}

struct MovInsert {
    id: String,
    item_code: String,
    item_type: String,
    movement_type: String,
    quantity: f64,
    date: String,
    document_number: String,
    details: String,
}

async fn flush_stock_movements(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    batch: &mut Vec<MovInsert>,
) -> anyhow::Result<()> {
    if batch.is_empty() {
        return Ok(());
    }
    let ids: Vec<String> = batch.iter().map(|m| m.id.clone()).collect();
    let codes: Vec<String> = batch.iter().map(|m| m.item_code.clone()).collect();
    let types: Vec<String> = batch.iter().map(|m| m.item_type.clone()).collect();
    let mtypes: Vec<String> = batch.iter().map(|m| m.movement_type.clone()).collect();
    let qtys: Vec<f64> = batch.iter().map(|m| m.quantity).collect();
    let dates: Vec<String> = batch.iter().map(|m| m.date.clone()).collect();
    let docs: Vec<String> = batch.iter().map(|m| m.document_number.clone()).collect();
    let details: Vec<String> = batch.iter().map(|m| m.details.clone()).collect();

    sqlx::query(
        r#"
        INSERT INTO stock_movements (id, item_code, item_type, movement_type, quantity, date, document_number, details)
        SELECT * FROM UNNEST(
            $1::text[], $2::text[], $3::text[], $4::text[], $5::float8[], $6::text[], $7::text[], $8::text[]
        )
        ON CONFLICT (document_number, item_code) WHERE item_type = 'produto' AND movement_type = 'entrada' AND COALESCE(document_number, '') <> ''
        DO UPDATE SET
            quantity = EXCLUDED.quantity,
            date = EXCLUDED.date,
            details = EXCLUDED.details
        "#,
    )
    .bind(&ids)
    .bind(&codes)
    .bind(&types)
    .bind(&mtypes)
    .bind(&qtys)
    .bind(&dates)
    .bind(&docs)
    .bind(&details)
    .execute(&mut **tx)
    .await?;

    batch.clear();
    Ok(())
}

const MOV_BATCH: usize = 500;

async fn env_or_setting(pool: &PgPool, env_key: &str, setting_key: &str, default: &str) -> String {
    if let Ok(v) = std::env::var(env_key) {
        if !v.is_empty() {
            return v;
        }
    }
    if let Some(v) = get_setting_from_pool(pool, setting_key).await {
        if !v.is_empty() {
            return v;
        }
    }
    default.to_string()
}

pub async fn connect_sql_server(pool: &PgPool) -> anyhow::Result<Client<tokio_util::compat::Compat<TcpStream>>> {
    // Defaults neutros — nunca embutir senhas reais no binário.
    // Credenciais devem vir de settings (UI) ou variáveis de ambiente NATUM_SQL_*.
    let host = env_or_setting(pool, "NATUM_SQL_HOST", "sql_host", "127.0.0.1").await;
    let port_str = env_or_setting(pool, "NATUM_SQL_PORT", "sql_port", "1433").await;
    let user = env_or_setting(pool, "NATUM_SQL_USER", "sql_user", "").await;
    let password = env_or_setting(pool, "NATUM_SQL_PASSWORD", "sql_password", "").await;
    let database = env_or_setting(pool, "NATUM_SQL_DATABASE", "sql_database", "").await;

    if host.trim().is_empty() || user.trim().is_empty() || password.is_empty() || database.trim().is_empty() {
        anyhow::bail!(
            "Credenciais SQL Server incompletas. Configure host, usuário, senha e banco em Configurações \
             (ou via NATUM_SQL_HOST/USER/PASSWORD/DATABASE)."
        );
    }
    
    let port: u16 = port_str.parse().unwrap_or(1433);

    let mut config = Config::new();
    config.host(&host);
    config.port(port);
    config.authentication(tiberius::AuthMethod::sql_server(&user, &password));
    config.database(&database);
    config.trust_cert(); // trust local SQL Server certs

    let tcp = TcpStream::connect(config.get_addr()).await?;
    tcp.set_nodelay(true)?;

    let client = Client::connect(config, tcp.compat_write()).await?;
    Ok(client)
}

pub async fn sync_from_sql_server(pool: &PgPool, requested: SyncMode) -> anyhow::Result<SyncResult> {
    // Garante que todas as migrações SQL (colunas e tabelas novas) estejam aplicadas antes de rodar o sync
    let _ = crate::modules::geral::postgres_bootstrap::commands::run_schema_migrations(pool).await;

    // Queries SQL e mapeamento documentados em ../../erp-import/ (raiz do projeto).
    let wm = load_watermark(pool).await;
    let history_floor = load_history_floor(pool).await;
    let (mode, since) = resolve_sync_window(requested, &wm, &history_floor);
    let since_dt = sql_datetime_since(&since);
    eprintln!(
        "[ERP Sync] solicitado={} efetivo={} since={} (floor={})",
        requested.as_str(),
        mode.as_str(),
        since,
        history_floor
    );

    let mut client = connect_sql_server(pool).await?;

    let hub_open_keys = load_hub_open_sales_order_keys(pool).await;
    if !hub_open_keys.is_empty() {
        eprintln!(
            "[ERP Sync] Hub tem {} pedido(s) de venda ainda abertos — reconciliação M/N ativa.",
            hub_open_keys.len()
        );
    }

    let hub_open_lotes = load_hub_open_lote_numbers(pool).await;
    if !hub_open_lotes.is_empty() {
        eprintln!(
            "[ERP Sync] Hub tem {} lote(s) de produção ainda abertos — reconciliação ativa.",
            hub_open_lotes.len()
        );
    }

    // ==========================================
    // 1. FETCH ALL DATA FROM SQL SERVER FIRST (AWAIT POINTS)
    // ==========================================

    // A. Query Products
    let query_produtos = "
SELECT 
    p.cCodProd COLLATE Latin1_General_CI_AS as cCodProd,
    p.cNomeProd COLLATE Latin1_General_CI_AS as cNomeProd,
    CAST(p.nQtdeEstoque AS FLOAT) as nQtdeEstoque,
    CAST(p.nQtdeProducao AS FLOAT) as nQtdeProducao,
    CAST(p.nPedidos AS FLOAT) as nPedidos,
    p.cBase COLLATE Latin1_General_CI_AS as cBase,
    p.cNomeTipo COLLATE Latin1_General_CI_AS as cNomeTipo,
    CAST(ISNULL(v.M1, 0) AS INT) as M1,
    CAST(ISNULL(v.M2, 0) AS INT) as M2,
    CAST(ISNULL(v.M3, 0) AS INT) as M3,
    CAST(ISNULL(v.M4, 0) AS INT) as M4,
    CAST(ISNULL(v.M5, 0) AS INT) as M5,
    CAST(ISNULL(v.M6, 0) AS INT) as M6,
    CAST(ISNULL(v.M7, 0) AS INT) as M7,
    CAST(ISNULL(v.M8, 0) AS INT) as M8,
    CAST(ISNULL(v.M9, 0) AS INT) as M9,
    CAST(ISNULL(v.M10, 0) AS INT) as M10,
    CAST(ISNULL(v.M11, 0) AS INT) as M11,
    CAST(ISNULL(v.M12, 0) AS INT) as M12,
    NULLIF(LTRIM(RTRIM(p.cCodBarras COLLATE Latin1_General_CI_AS)), '') as cCodBarras
FROM Produtos p WITH (NOLOCK)
LEFT JOIN (
    SELECT 
        cCodProd,
        SUM(CASE WHEN MONTH(dVenda) = 1 THEN nQtde ELSE 0 END) as M1,
        SUM(CASE WHEN MONTH(dVenda) = 2 THEN nQtde ELSE 0 END) as M2,
        SUM(CASE WHEN MONTH(dVenda) = 3 THEN nQtde ELSE 0 END) as M3,
        SUM(CASE WHEN MONTH(dVenda) = 4 THEN nQtde ELSE 0 END) as M4,
        SUM(CASE WHEN MONTH(dVenda) = 5 THEN nQtde ELSE 0 END) as M5,
        SUM(CASE WHEN MONTH(dVenda) = 6 THEN nQtde ELSE 0 END) as M6,
        SUM(CASE WHEN MONTH(dVenda) = 7 THEN nQtde ELSE 0 END) as M7,
        SUM(CASE WHEN MONTH(dVenda) = 8 THEN nQtde ELSE 0 END) as M8,
        SUM(CASE WHEN MONTH(dVenda) = 9 THEN nQtde ELSE 0 END) as M9,
        SUM(CASE WHEN MONTH(dVenda) = 10 THEN nQtde ELSE 0 END) as M10,
        SUM(CASE WHEN MONTH(dVenda) = 11 THEN nQtde ELSE 0 END) as M11,
        SUM(CASE WHEN MONTH(dVenda) = 12 THEN nQtde ELSE 0 END) as M12
    FROM VENDAS2 WITH (NOLOCK)
    WHERE YEAR(dVenda) = YEAR(GETDATE())
    GROUP BY cCodProd
) v ON p.cCodProd = v.cCodProd
WHERE p.cInativo = 'N' OR p.cInativo IS NULL;
    ";
    println!("Step A: Querying Produtos");
    let stream = client.query(query_produtos, &[]).await?;
    let db_rows_prod = stream.into_first_result().await?;
    let mut products_list = Vec::new();
    for row in db_rows_prod {
        let codigo: &str = row.get(0).unwrap_or("");
        if codigo.is_empty() { continue; }
        let raw_descricao: &str = row.get(1).unwrap_or("");
        let mut m_sales: [i32; 12] = [0; 12];
        for i in 0..12 {
            m_sales[i] = row.get(7 + i).unwrap_or(0);
        }
        let codigo_barras = row
            .get(19)
            .map(|s: &str| s.trim().to_string())
            .filter(|s| !s.is_empty());
        products_list.push(ProductRow {
            codigo: codigo.trim().to_string(),
            descricao: raw_descricao.trim().to_string(),
            estoque: row.get(2).unwrap_or(0.0),
            producao: row.get(3).unwrap_or(0.0),
            pedidos: row.get(4).unwrap_or(0.0),
            base: row.get(5).map(|s: &str| s.trim().to_string()).filter(|s| !s.is_empty()),
            fase: row.get(6).map(|s: &str| s.trim().to_string()).filter(|s| !s.is_empty()),
            m_sales,
            codigo_barras,
        });
    }

    // B. Query Suppliers
    let query_fornecedores = "
SELECT 
    nCodFornec,
    cNomeF COLLATE Latin1_General_CI_AS as cNomeF,
    cContatoF COLLATE Latin1_General_CI_AS as cContatoF,
    cEmail COLLATE Latin1_General_CI_AS as cEmail,
    mObservacF COLLATE Latin1_General_CI_AS as mObservacF
FROM Fornecedores WITH (NOLOCK)
WHERE cNomeF IS NOT NULL AND cNomeF <> '';
    ";
    println!("Step B: Querying Fornecedores");
    let stream = client.query(query_fornecedores, &[]).await?;
    let db_rows_fornec = stream.into_first_result().await?;
    let mut suppliers_list = Vec::new();
    for row in db_rows_fornec {
        let cod_fornec: i32 = row.get(0).unwrap_or(0);
        if cod_fornec == 0 { continue; }
        suppliers_list.push(SupplierRow {
            cod_fornec,
            nome: row.get(1).unwrap_or("").trim().to_string(),
            contato: row.get(2).map(|s: &str| s.trim().to_string()),
            email: row.get(3).map(|s: &str| s.trim().to_string()),
            obs: row.get(4).map(|s: &str| s.trim().to_string()),
        });
    }

    // C. Query Insumos Items
    let query_insumos = "
SELECT 
    cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    cDescricao COLLATE Latin1_General_CI_AS as cDescricao,
    cUnidade COLLATE Latin1_General_CI_AS as cUnidade,
    cReferenciaNova COLLATE Latin1_General_CI_AS as cReferenciaNova,
    cCF COLLATE Latin1_General_CI_AS as cCF,
    cInativo COLLATE Latin1_General_CI_AS as cInativo
FROM Insumos WITH (NOLOCK)
WHERE cReferencia IS NOT NULL AND cReferencia <> '';
    ";
    println!("Step C: Querying Insumos");
    let stream = client.query(query_insumos, &[]).await?;
    let db_rows_insumos = stream.into_first_result().await?;
    let mut insumos_list = Vec::new();
    for row in db_rows_insumos {
        let code: &str = row.get(0).unwrap_or("");
        if code.is_empty() { continue; }
        let raw_inativo: Option<&str> = row.get(5);
        let is_ignored = if raw_inativo.map(|s| s.trim() == "S").unwrap_or(false) { 1 } else { 0 };
        insumos_list.push(InsumoRow {
            code: code.trim().to_string(),
            desc: row.get(1).unwrap_or("").trim().to_string(),
            unit: row.get(2).unwrap_or("UN").trim().to_string(),
            line: row.get(3).map(|s: &str| s.trim().to_string()),
            type_code: row.get(4).map(|s: &str| s.trim().to_string()),
            is_ignored,
        });
    }

    // C2. Query Materiais Items
    let query_materiais = "
SELECT 
    cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    cDescricao COLLATE Latin1_General_CI_AS as cDescricao,
    cUnidade COLLATE Latin1_General_CI_AS as cUnidade,
    cReferenciaNova COLLATE Latin1_General_CI_AS as cReferenciaNova,
    cCF COLLATE Latin1_General_CI_AS as cCF,
    cInativo COLLATE Latin1_General_CI_AS as cInativo
FROM Materiais WITH (NOLOCK)
WHERE cReferencia IS NOT NULL AND cReferencia <> '';
    ";
    println!("Step D: Querying Materiais");
    let stream = client.query(query_materiais, &[]).await?;
    let db_rows_materiais = stream.into_first_result().await?;
    let mut materiais_list = Vec::new();
    for row in db_rows_materiais {
        let code: &str = row.get(0).unwrap_or("");
        if code.is_empty() { continue; }
        let raw_inativo: Option<&str> = row.get(5);
        let is_ignored = if raw_inativo.map(|s| s.trim() == "S").unwrap_or(false) { 1 } else { 0 };
        materiais_list.push(MaterialRow {
            code: code.trim().to_string(),
            desc: row.get(1).unwrap_or("").trim().to_string(),
            unit: row.get(2).unwrap_or("UN").trim().to_string(),
            line: row.get(3).map(|s: &str| s.trim().to_string()),
            type_code: row.get(4).map(|s: &str| s.trim().to_string()),
            is_ignored,
        });
    }

    // D. Query Insumos Stocks & Snapshots
    // Estoque da tela ERP ("Estoque atual") = nQtdeEstoque
    // Primeira passagem D1: lê estoque da tela do ERP (nQtdeEstoque).
    let query_stocks = "
SELECT 
    cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    CAST(nQtdeEstoque AS FLOAT) as nQtdeEstoque,
    CAST(nqtdeReserva AS FLOAT) as nqtdeReserva,
    CAST(nQtdeProducao AS FLOAT) as nQtdeProducao,
    CAST(nQtdePedidos AS FLOAT) as nQtdePedidos
FROM Insumos
WHERE cReferencia IS NOT NULL AND cReferencia <> '' AND (cInativo = 'N' OR cInativo IS NULL);
    ";
    let query_stocks_clean = D1_INSUMOS_STOCKS_SQL_CLEAN;
    println!("Step D1: Querying Insumos Stocks (nQtdeEstoque)");
    let stream = client.query(query_stocks, &[]).await?;
    let db_rows_stocks = stream.into_first_result().await?;
    let mut stocks_list = Vec::new();
    for row in db_rows_stocks {
        let code: &str = row.get(0).unwrap_or("");
        if code.is_empty() { continue; }
        stocks_list.push(StockRow {
            code: code.trim().to_string(),
            stock_qty: mssql_f64(&row, 1),
            reserved_qty: mssql_f64(&row, 2),
            in_prod: mssql_f64(&row, 3),
            in_orders: mssql_f64(&row, 4),
        });
    }

    // D2. Query Materiais Stocks
    let query_mat_stocks = "
SELECT 
    cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    CAST(nQtdeEstoque AS FLOAT) as nQtdeEstoque,
    CAST(0.0 AS FLOAT) as nqtdeReserva,
    CAST(nQtdeProducao AS FLOAT) as nQtdeProducao,
    CAST(nQtdePedidos AS FLOAT) as nQtdePedidos
FROM Materiais WITH (NOLOCK)
WHERE cReferencia IS NOT NULL AND cReferencia <> '' AND (cInativo = 'N' OR cInativo IS NULL);
    ";
    println!("Step D2: Querying Materiais Stocks");
    let stream = client.query(query_mat_stocks, &[]).await?;
    let db_rows_mat_stocks = stream.into_first_result().await?;
    let mut mat_stocks_list = Vec::new();
    for row in db_rows_mat_stocks {
        let code: &str = row.get(0).unwrap_or("");
        if code.is_empty() { continue; }
        mat_stocks_list.push(StockRow {
            code: code.trim().to_string(),
            stock_qty: mssql_f64(&row, 1),
            reserved_qty: mssql_f64(&row, 2),
            in_prod: mssql_f64(&row, 3),
            in_orders: mssql_f64(&row, 4),
        });
    }

    // E. Query Invoices (full: 48 meses; incremental: desde watermark)
    let query_invoices = if mode == SyncMode::Incremental {
        format!(
            "
SELECT 
    c.NOTA,
    c.CODIGO_PRODUTO COLLATE Latin1_General_CI_AS as CODIGO_PRODUTO,
    c.DESCRICAO_PRODUTO COLLATE Latin1_General_CI_AS as DESCRICAO_PRODUTO,
    c.UNIDADE COLLATE Latin1_General_CI_AS as UNIDADE,
    CAST(c.QUANTIDADE AS FLOAT) as QUANTIDADE,
    CAST(c.VALOR_UNITARIO AS FLOAT) as VALOR_UNITARIO,
    CAST(c.VALOR_TOTAL AS FLOAT) as VALOR_TOTAL,
    f.RAZAO_SOCIAL COLLATE Latin1_General_CI_AS as RAZAO_SOCIAL,
    c.nCodFornec,
    f.DATA_EMISSAO,
    c.CFOP COLLATE Latin1_General_CI_AS as CFOP,
    CAST(c.VALOR_ICMS_PROD AS FLOAT) as VALOR_ICMS,
    CAST(c.VALOR_IPI AS FLOAT) as VALOR_IPI,
    CAST(f.VALOR_FRETE AS FLOAT) as VALOR_FRETE,
    f.T_RAZAO_SOCIAL COLLATE Latin1_General_CI_AS as TRANSPORTADORA,
    f.CNPJ_CPF COLLATE Latin1_General_CI_AS as CNPJ_FORNEC,
    f.DATA_SAIDA as DATA_ENTRADA,
    f.DUP1_NUMERO COLLATE Latin1_General_CI_AS as D1_NUM,
    f.DUP1_VENC as D1_VENC,
    CAST(f.DUP1_VALOR AS FLOAT) as D1_VAL,
    f.DUP2_NUMERO COLLATE Latin1_General_CI_AS as D2_NUM,
    f.DUP2_VENC as D2_VENC,
    CAST(f.DUP2_VALOR AS FLOAT) as D2_VAL,
    f.DUP3_NUMERO COLLATE Latin1_General_CI_AS as D3_NUM,
    f.DUP3_VENC as D3_VENC,
    CAST(f.DUP3_VALOR AS FLOAT) as D3_VAL,
    f.DUP4_NUMERO COLLATE Latin1_General_CI_AS as D4_NUM,
    f.DUP4_VENC as D4_VENC,
    CAST(f.DUP4_VALOR AS FLOAT) as D4_VAL,
    f.F_Conhecimento COLLATE Latin1_General_CI_AS as FTE_NUM,
    CAST(f.F_Valor_Doc_Fiscal AS FLOAT) as FTE_VALOR,
    f.F_Transportadora COLLATE Latin1_General_CI_AS as FTE_CARRIER_NAME,
    f.F_CNPJ COLLATE Latin1_General_CI_AS as FTE_CARRIER_CNPJ,
    f.F_Data_Emissao as FTE_ISSUE_DATE,
    f.F_Data_Entrada as FTE_ENTRY_DATE,
    f.F_CIF_FOB COLLATE Latin1_General_CI_AS as FTE_CIF_FOB,
    f.F_Serie COLLATE Latin1_General_CI_AS as FTE_SERIE,
    f.F_CFOP COLLATE Latin1_General_CI_AS as FTE_CFOP,
    f.F_Natureza COLLATE Latin1_General_CI_AS as FTE_NATUREZA,
    CAST(f.F_Valor_ICMS AS FLOAT) as FTE_ICMS
FROM COMPRAS2 c WITH (NOLOCK)
LEFT JOIN COMPRAS1 f WITH (NOLOCK) ON c.nCodFornec = f.nCodFornec AND c.NOTA = f.NOTA
WHERE f.DATA_EMISSAO >= '{since_dt}'
  AND c.CODIGO_PRODUTO IS NOT NULL AND c.CODIGO_PRODUTO <> '';
"
        )
    } else {
        "
SELECT 
    c.NOTA,
    c.CODIGO_PRODUTO COLLATE Latin1_General_CI_AS as CODIGO_PRODUTO,
    c.DESCRICAO_PRODUTO COLLATE Latin1_General_CI_AS as DESCRICAO_PRODUTO,
    c.UNIDADE COLLATE Latin1_General_CI_AS as UNIDADE,
    CAST(c.QUANTIDADE AS FLOAT) as QUANTIDADE,
    CAST(c.VALOR_UNITARIO AS FLOAT) as VALOR_UNITARIO,
    CAST(c.VALOR_TOTAL AS FLOAT) as VALOR_TOTAL,
    f.RAZAO_SOCIAL COLLATE Latin1_General_CI_AS as RAZAO_SOCIAL,
    c.nCodFornec,
    f.DATA_EMISSAO,
    c.CFOP COLLATE Latin1_General_CI_AS as CFOP,
    CAST(c.VALOR_ICMS_PROD AS FLOAT) as VALOR_ICMS,
    CAST(c.VALOR_IPI AS FLOAT) as VALOR_IPI,
    CAST(f.VALOR_FRETE AS FLOAT) as VALOR_FRETE,
    f.T_RAZAO_SOCIAL COLLATE Latin1_General_CI_AS as TRANSPORTADORA,
    f.CNPJ_CPF COLLATE Latin1_General_CI_AS as CNPJ_FORNEC,
    f.DATA_SAIDA as DATA_ENTRADA,
    f.DUP1_NUMERO COLLATE Latin1_General_CI_AS as D1_NUM,
    f.DUP1_VENC as D1_VENC,
    CAST(f.DUP1_VALOR AS FLOAT) as D1_VAL,
    f.DUP2_NUMERO COLLATE Latin1_General_CI_AS as D2_NUM,
    f.DUP2_VENC as D2_VENC,
    CAST(f.DUP2_VALOR AS FLOAT) as D2_VAL,
    f.DUP3_NUMERO COLLATE Latin1_General_CI_AS as D3_NUM,
    f.DUP3_VENC as D3_VENC,
    CAST(f.DUP3_VALOR AS FLOAT) as D3_VAL,
    f.DUP4_NUMERO COLLATE Latin1_General_CI_AS as D4_NUM,
    f.DUP4_VENC as D4_VENC,
    CAST(f.DUP4_VALOR AS FLOAT) as D4_VAL,
    f.F_Conhecimento COLLATE Latin1_General_CI_AS as FTE_NUM,
    CAST(f.F_Valor_Doc_Fiscal AS FLOAT) as FTE_VALOR,
    f.F_Transportadora COLLATE Latin1_General_CI_AS as FTE_CARRIER_NAME,
    f.F_CNPJ COLLATE Latin1_General_CI_AS as FTE_CARRIER_CNPJ,
    f.F_Data_Emissao as FTE_ISSUE_DATE,
    f.F_Data_Entrada as FTE_ENTRY_DATE,
    f.F_CIF_FOB COLLATE Latin1_General_CI_AS as FTE_CIF_FOB,
    f.F_Serie COLLATE Latin1_General_CI_AS as FTE_SERIE,
    f.F_CFOP COLLATE Latin1_General_CI_AS as FTE_CFOP,
    f.F_Natureza COLLATE Latin1_General_CI_AS as FTE_NATUREZA,
    CAST(f.F_Valor_ICMS AS FLOAT) as FTE_ICMS
FROM COMPRAS2 c WITH (NOLOCK)
LEFT JOIN COMPRAS1 f WITH (NOLOCK) ON c.nCodFornec = f.nCodFornec AND c.NOTA = f.NOTA
WHERE f.DATA_EMISSAO >= DATEADD(month, -48, GETDATE())
  AND c.CODIGO_PRODUTO IS NOT NULL AND c.CODIGO_PRODUTO <> '';
"
        .to_string()
    };
    println!("Step E: Querying Purchases (since {since})");
    let stream = client.query(query_invoices, &[]).await?;
    let db_rows_invoices = stream.into_first_result().await?;
    let mut invoices_list = Vec::new();
    for row in db_rows_invoices {
        let nota: i32 = row.get(0).unwrap_or(0);
        let code: &str = row.get(1).unwrap_or("");
        if nota == 0 || code.is_empty() { continue; }
        let cod_fornec: i32 = row.get(8).unwrap_or(0);
        let supplier_id = if cod_fornec == 0 { None } else { Some(cod_fornec.to_string()) };
        let data_emissao: Option<NaiveDateTime> = row.get(9);
        let date_str = data_emissao.map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());
        
        let cfop = row.get::<&str, _>(10).map(|s| s.trim().to_string());
        let icms_value = row.get::<f64, _>(11).unwrap_or(0.0);
        let ipi_value = row.get::<f64, _>(12).unwrap_or(0.0);
        let freight_value = row.get::<f64, _>(13).unwrap_or(0.0);
        let carrier_name = row.get::<&str, _>(14).map(|s| s.trim().to_string());
        let supplier_cnpj = row.get::<&str, _>(15).map(|s| s.trim().to_string());
        
        let data_entrada: Option<NaiveDateTime> = row.get(16);
        let entry_date = data_entrada.map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());

        // Processa as duplicatas para gerar um JSON estruturado
        let mut installments = Vec::new();
        
        // DUP1
        let d1_num = row.get::<&str, _>(17).unwrap_or("").trim().to_string();
        let d1_venc: Option<NaiveDateTime> = row.get(18);
        let d1_val = row.get::<f64, _>(19).unwrap_or(0.0);
        if !d1_num.is_empty() && d1_val > 0.0 {
            installments.push(serde_json::json!({
                "numero": d1_num,
                "vencimento": d1_venc.map(|dt| dt.format("%Y-%m-%d").to_string()),
                "valor": d1_val
            }));
        }

        // DUP2
        let d2_num = row.get::<&str, _>(20).unwrap_or("").trim().to_string();
        let d2_venc: Option<NaiveDateTime> = row.get(21);
        let d2_val = row.get::<f64, _>(22).unwrap_or(0.0);
        if !d2_num.is_empty() && d2_val > 0.0 {
            installments.push(serde_json::json!({
                "numero": d2_num,
                "vencimento": d2_venc.map(|dt| dt.format("%Y-%m-%d").to_string()),
                "valor": d2_val
            }));
        }

        // DUP3
        let d3_num = row.get::<&str, _>(23).unwrap_or("").trim().to_string();
        let d3_venc: Option<NaiveDateTime> = row.get(24);
        let d3_val = row.get::<f64, _>(25).unwrap_or(0.0);
        if !d3_num.is_empty() && d3_val > 0.0 {
            installments.push(serde_json::json!({
                "numero": d3_num,
                "vencimento": d3_venc.map(|dt| dt.format("%Y-%m-%d").to_string()),
                "valor": d3_val
            }));
        }

        // DUP4
        let d4_num = row.get::<&str, _>(26).unwrap_or("").trim().to_string();
        let d4_venc: Option<NaiveDateTime> = row.get(27);
        let d4_val = row.get::<f64, _>(28).unwrap_or(0.0);
        if !d4_num.is_empty() && d4_val > 0.0 {
            installments.push(serde_json::json!({
                "numero": d4_num,
                "vencimento": d4_venc.map(|dt| dt.format("%Y-%m-%d").to_string()),
                "valor": d4_val
            }));
        }

        let payment_installments = if installments.is_empty() {
            None
        } else {
            Some(serde_json::to_string(&installments).unwrap_or_default())
        };

        let fte_number = row.get::<&str, _>(29).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let fte_value = row.get::<f64, _>(30).unwrap_or(0.0);
        let fte_carrier_name = row.get::<&str, _>(31).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let fte_carrier_cnpj = row.get::<&str, _>(32).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        
        let fte_issue_dt: Option<NaiveDateTime> = row.get(33);
        let fte_issue_date = fte_issue_dt.map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());

        let fte_entry_dt: Option<NaiveDateTime> = row.get(34);
        let fte_entry_date = fte_entry_dt.map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());

        let fte_cif_fob = row.get::<&str, _>(35).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let fte_serie = row.get::<&str, _>(36).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let fte_cfop = row.get::<&str, _>(37).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let fte_natureza = row.get::<&str, _>(38).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let fte_icms_value = row.get::<f64, _>(39).unwrap_or(0.0);

        invoices_list.push(InvoiceRow {
            nota,
            code: code.trim().to_string(),
            desc: row.get(2).map(|s: &str| s.trim().to_string()),
            unit: row.get(3).map(|s: &str| s.trim().to_string()),
            quantity: row.get(4).unwrap_or(0.0),
            unit_price: row.get(5).unwrap_or(0.0),
            total_value: row.get(6).unwrap_or(0.0),
            fornec_name: row.get(7).map(|s: &str| s.trim().to_string()),
            supplier_id,
            date_str,
            cfop,
            icms_value,
            ipi_value,
            freight_value,
            entry_date,
            carrier_name,
            supplier_cnpj,
            payment_installments,
            fte_number,
            fte_value,
            fte_carrier_name,
            fte_carrier_cnpj,
            fte_issue_date,
            fte_entry_date,
            fte_cif_fob,
            fte_serie,
            fte_cfop,
            fte_natureza,
            fte_icms_value,
        });
    }

    // F. Query Consumption (Real consumption from Lotes_Baixas instead of COMPRAS)
    let query_consumption = "
SELECT 
    b.cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    YEAR(b.dLog) as Ano,
    CAST(SUM(b.nQtde) AS FLOAT) as TotalQtd,
    CAST(SUM(b.nQtde) / 12.0 AS FLOAT) as MediaMensal
FROM Lotes_Baixas b WITH (NOLOCK)
WHERE YEAR(b.dLog) >= YEAR(GETDATE()) - 5
  AND b.cReferencia IS NOT NULL AND b.cReferencia <> ''
GROUP BY b.cReferencia, YEAR(b.dLog);
    ";
    println!("Step F: Querying Consumption");
    let stream = client.query(query_consumption, &[]).await?;
    let db_rows_consumption = stream.into_first_result().await?;
    let mut consumption_list = Vec::new();
    for row in db_rows_consumption {
        let code: &str = row.get(0).unwrap_or("");
        let year: i32 = row.get(1).unwrap_or(0);
        if code.is_empty() || year == 0 { continue; }
        consumption_list.push(ConsumptionRow {
            code: code.trim().to_string(),
            year,
            total_qty: row.get(2).unwrap_or(0.0),
            monthly_avg: row.get(3).unwrap_or(0.0),
        });
    }

    // G. Query Formulations (Composicao table)
    let query_formulations = "
SELECT 
    c.cCodProd COLLATE Latin1_General_CI_AS as cCodProd,
    c.cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    c.cDescricao COLLATE Latin1_General_CI_AS as cDescricao,
    CAST(c.nQuantidade AS FLOAT) as nQuantidade,
    CAST(c.NPERCENTUAL AS FLOAT) as NPERCENTUAL
FROM Composicao c WITH (NOLOCK)
WHERE c.cCodProd IS NOT NULL AND c.cReferencia IS NOT NULL;
    ";
    println!("Step G: Querying Formulations");
    let stream = client.query(query_formulations, &[]).await?;
    let db_rows_formulations = stream.into_first_result().await?;
    let mut formulations_list = Vec::new();
    for row in db_rows_formulations {
        let product_code: &str = row.get(0).unwrap_or("");
        let ingredient_code: &str = row.get(1).unwrap_or("");
        if product_code.is_empty() || ingredient_code.is_empty() { continue; }
        formulations_list.push(FormulationRow {
            product_code: product_code.trim().to_string(),
            ingredient_code: ingredient_code.trim().to_string(),
            description: row.get(2).map(|s: &str| s.trim().to_string()),
            quantity: row.get(3).unwrap_or(0.0),
            percentage: row.get(4),
        });
    }

    // P. Query composição de kits (Manutenção de Kits / dbo.Kits)
    let query_kit_composicao = "
SELECT
    LTRIM(RTRIM(k.cKit)) COLLATE Latin1_General_CI_AS AS kit_codigo,
    LTRIM(RTRIM(k.cCodProd)) COLLATE Latin1_General_CI_AS AS componente_codigo,
    MAX(CAST(k.nQtde AS FLOAT)) / NULLIF(MAX(CAST(k.nAcada AS FLOAT)), 0) AS quantidade,
    CAST(1.0 AS FLOAT) AS fator_proporcao_qtd,
    CAST(MAX(k.nAcada) AS INT) AS fator_proporcao_kits
FROM Kits k WITH (NOLOCK)
WHERE k.cEntSaiEstoque = 'S'
  AND k.cKit IS NOT NULL
  AND k.cCodProd IS NOT NULL
  AND LTRIM(RTRIM(k.cKit)) <> ''
  AND LTRIM(RTRIM(k.cCodProd)) <> ''
  AND NULLIF(CAST(k.nAcada AS FLOAT), 0) IS NOT NULL
GROUP BY LTRIM(RTRIM(k.cKit)), LTRIM(RTRIM(k.cCodProd));
    ";
    println!("Step P: Querying Kits (composição)");
    let stream = client.query(query_kit_composicao, &[]).await?;
    let db_rows_kits = stream.into_first_result().await?;
    let mut kit_composicao_map: std::collections::HashMap<(String, String), KitComposicaoErpRow> =
        std::collections::HashMap::new();
    for row in db_rows_kits {
        let kit_codigo: &str = row.get(0).unwrap_or("");
        let componente_codigo: &str = row.get(1).unwrap_or("");
        if kit_codigo.is_empty() || componente_codigo.is_empty() {
            continue;
        }
        let quantidade: f64 = row.get(2).unwrap_or(0.0);
        if !quantidade.is_finite() || quantidade <= 0.0 {
            continue;
        }
        let fator_kits: i32 = row.get(4).unwrap_or(1).max(1);
        let key = (
            kit_codigo.trim().to_string(),
            componente_codigo.trim().to_string(),
        );
        // Cinto de segurança: mesmo com GROUP BY no SQL, evita ON CONFLICT 2x no mesmo INSERT.
        kit_composicao_map.insert(
            key.clone(),
            KitComposicaoErpRow {
                kit_codigo: key.0,
                componente_codigo: key.1,
                quantidade,
                fator_proporcao_qtd: row.get(3).unwrap_or(1.0),
                fator_proporcao_kits: fator_kits,
            },
        );
    }
    let kit_composicao_list: Vec<KitComposicaoErpRow> = kit_composicao_map.into_values().collect();

    // H. Query Lotes (Production logs for Finished Goods)
    let open_lotes_condition = if hub_open_lotes.is_empty() {
        String::new()
    } else {
        let in_list = hub_open_lotes
            .iter()
            .map(|n| n.to_string())
            .collect::<Vec<_>>()
            .join(",");
        format!("OR l.nLote IN ({in_list})")
    };

    let query_lotes = format!(
        "
SELECT 
    l.nLote,
    l.cCodProd COLLATE Latin1_General_CI_AS as cCodProd,
    l.cCodProd2 COLLATE Latin1_General_CI_AS as cCodProd2,
    l.cCodProd3 COLLATE Latin1_General_CI_AS as cCodProd3,
    l.cCodProd4 COLLATE Latin1_General_CI_AS as cCodProd4,
    CAST(l.nQtde AS FLOAT) as nQtde,
    CAST(l.nQtde1 AS FLOAT) as nQtde1,
    CAST(l.nQtde2 AS FLOAT) as nQtde2,
    CAST(l.nQtde3 AS FLOAT) as nQtde3,
    CAST(l.nQtde4 AS FLOAT) as nQtde4,
    CONVERT(varchar, l.dLote, 120) COLLATE Latin1_General_CI_AS as dLote,
    l.cStatus COLLATE Latin1_General_CI_AS as cStatus,
    l.cFabricadopor COLLATE Latin1_General_CI_AS as cFabricadopor,
    l.cAutorizadopor COLLATE Latin1_General_CI_AS as cAutorizadopor,
    CAST(l.nUnidades AS FLOAT) as nUnidades,
    CAST(l.nUnidades1 AS FLOAT) as nUnidades1,
    CAST(l.nUnidades2 AS FLOAT) as nUnidades2,
    CAST(l.nUnidades3 AS FLOAT) as nUnidades3,
    CAST(l.nUnidades4 AS FLOAT) as nUnidades4,
    CAST(l.nUnidadesReais1 AS FLOAT) as nUnidadesReais1,
    CAST(l.nUnidadesReais2 AS FLOAT) as nUnidadesReais2,
    CAST(l.nUnidadesReais3 AS FLOAT) as nUnidadesReais3,
    CAST(l.nUnidadesReais4 AS FLOAT) as nUnidadesReais4,
    CONVERT(varchar, l.dPesado, 120) COLLATE Latin1_General_CI_AS as dPesado,
    CONVERT(varchar, l.dEnvasado, 120) COLLATE Latin1_General_CI_AS as dEnvasado,
    CONVERT(varchar, l.dEnvase1, 120) COLLATE Latin1_General_CI_AS as dEnvase1,
    CONVERT(varchar, l.dEnvase2, 120) COLLATE Latin1_General_CI_AS as dEnvase2,
    CONVERT(varchar, l.dEnvase3, 120) COLLATE Latin1_General_CI_AS as dEnvase3,
    CONVERT(varchar, l.dEnvase4, 120) COLLATE Latin1_General_CI_AS as dEnvase4,
    CONVERT(varchar, l.dConf1, 120) COLLATE Latin1_General_CI_AS as dConf1,
    CAST(l.nPH AS FLOAT) as nPH,
    CAST(l.nviscosidade AS FLOAT) as nviscosidade,
    CAST(l.ndensidade AS FLOAT) as ndensidade,
    CAST(l.nViscosidade24 AS FLOAT) as nViscosidade24,
    l.cResponsavel1 COLLATE Latin1_General_CI_AS as cResponsavel1,
    l.cResultado1 COLLATE Latin1_General_CI_AS as cResultado1,
    CONVERT(varchar, l.dinspecao1, 120) COLLATE Latin1_General_CI_AS as dinspecao1,
    CAST(l.mObservac AS VARCHAR(1000)) COLLATE Latin1_General_CI_AS as mObservac
FROM Lotes l WITH (NOLOCK)
WHERE (
    l.dLote >= '{since_dt}' 
    OR l.cStatus IN ('PG', 'PP', 'PR', 'EN', 'CF')
    OR l.dEnvasado >= '{since_dt}'
    OR l.dPesado >= '{since_dt}'
    OR l.dConf1 >= '{since_dt}'
    {open_lotes_condition}
)
  AND (
    (l.cCodProd IS NOT NULL AND l.cCodProd <> '') OR
    (l.cCodProd2 IS NOT NULL AND l.cCodProd2 <> '') OR
    (l.cCodProd3 IS NOT NULL AND l.cCodProd3 <> '') OR
    (l.cCodProd4 IS NOT NULL AND l.cCodProd4 <> '')
  );
"
    );
    println!("Step H: Querying Lotes (since {since})");
    let stream = client.query(query_lotes, &[]).await?;
    let db_rows_lotes = stream.into_first_result().await?;
    let mut lotes_list = Vec::new();
    for row in db_rows_lotes {
        let lote: i32 = row.get(0).unwrap_or(0);
        let d_lote: Option<&str> = row.get(10);
        if lote == 0 || d_lote.is_none() { continue; }
        let date_str = d_lote.unwrap().to_string();

        let status = row.get::<&str, _>(11).map(|s| s.trim().to_string());
        let fab = row.get::<&str, _>(12).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let aut = row.get::<&str, _>(13).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let d_pesado = row.get::<&str, _>(23).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let d_envasado = row.get::<&str, _>(24).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let d_envase_arr = [
            row.get::<&str, _>(25).map(|s| s.trim().to_string()),
            row.get::<&str, _>(26).map(|s| s.trim().to_string()),
            row.get::<&str, _>(27).map(|s| s.trim().to_string()),
            row.get::<&str, _>(28).map(|s| s.trim().to_string()),
        ];
        let d_conf1 = row.get::<&str, _>(29).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());

        let ph = row.get::<f64, _>(30).filter(|v| *v > 0.0);
        let visc = row.get::<f64, _>(31).filter(|v| *v > 0.0);
        let dens = row.get::<f64, _>(32).filter(|v| *v > 0.0);
        let visc24 = row.get::<f64, _>(33).filter(|v| *v > 0.0);
        let resp = row.get::<&str, _>(34).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let res = row.get::<&str, _>(35).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let dinsp = row.get::<&str, _>(36).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let obs = row.get::<&str, _>(37).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());

        let prods = [
            (row.get::<&str, _>(1), row.get::<f64, _>(6), row.get::<f64, _>(15), row.get::<f64, _>(19)),
            (row.get::<&str, _>(2), row.get::<f64, _>(7), row.get::<f64, _>(16), row.get::<f64, _>(20)),
            (row.get::<&str, _>(3), row.get::<f64, _>(8), row.get::<f64, _>(17), row.get::<f64, _>(21)),
            (row.get::<&str, _>(4), row.get::<f64, _>(9), row.get::<f64, _>(18), row.get::<f64, _>(22)),
        ];

        let total_bulk_qty = row.get::<f64, _>(5).unwrap_or(0.0);
        let total_units_field = row.get::<f64, _>(14).unwrap_or(0.0);

        let mut present_count = 0;
        for (code_opt, _, _, _) in &prods {
            if let Some(code) = code_opt {
                if !code.trim().is_empty() {
                    present_count += 1;
                }
            }
        }

        for (idx, (code_opt, planned_kg_opt, planned_units_opt, real_units_opt)) in prods.iter().enumerate() {
            if let Some(code) = code_opt {
                let code_trimmed = code.trim().to_string();
                if code_trimmed.is_empty() { continue; }

                let mut qty = planned_kg_opt.unwrap_or(0.0);
                if qty <= 0.0 {
                    if present_count <= 1 || idx == 0 {
                        qty = total_bulk_qty;
                    }
                }

                let mut unidades = real_units_opt.unwrap_or(0.0);
                if unidades <= 0.0 {
                    unidades = planned_units_opt.unwrap_or(0.0);
                }
                if unidades <= 0.0 {
                    if present_count <= 1 || idx == 0 {
                        unidades = total_units_field;
                    }
                }

                let item_envase = d_envase_arr[idx]
                    .as_ref()
                    .filter(|s| s.len() >= 8)
                    .or(d_envasado.as_ref().filter(|s| s.len() >= 8))
                    .or(d_pesado.as_ref().filter(|s| s.len() >= 8))
                    .or(d_conf1.as_ref().filter(|s| s.len() >= 8))
                    .cloned();

                lotes_list.push(LoteRow {
                    lote,
                    product_code: code_trimmed,
                    qty,
                    date_str: date_str.clone(),
                    status: status.clone(),
                    fab: fab.clone(),
                    aut: aut.clone(),
                    unidades: Some(unidades),
                    d_pesado: d_pesado.clone(),
                    d_envase: item_envase,
                    ph,
                    viscosidade: visc,
                    densidade: dens,
                    viscosidade_24h: visc24,
                    responsavel: resp.clone(),
                    resultado: res.clone(),
                    data_inspecao: dinsp.clone(),
                    observacoes: obs.clone(),
                });
            }
        }
    }


    // I. Query Lotes_Baixas (Insumo exits logs)
    let query_lotes_baixas = format!(
        "
SELECT 
    b.Registro,
    b.nLote,
    b.cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    CAST(b.nQtde AS FLOAT) as nQtde,
    CONVERT(varchar, b.dLog, 120) COLLATE Latin1_General_CI_AS as dLog,
    b.cUsuario COLLATE Latin1_General_CI_AS as cUsuario,
    b.cJustificativa COLLATE Latin1_General_CI_AS as cJustificativa,
    b.cCodProd COLLATE Latin1_General_CI_AS as cCodProd,
    CAST(b.nQtdeRef AS FLOAT) as nQtdeRef
FROM Lotes_Baixas b WITH (NOLOCK)
WHERE b.dLog >= '{since_dt}'
  AND b.cReferencia IS NOT NULL AND b.cReferencia <> '';
"
    );
    println!("Step I: Querying Lotes Baixas (since {since})");
    let stream = client.query(query_lotes_baixas, &[]).await?;
    let db_rows_baixas = stream.into_first_result().await?;
    let mut lotes_baixas_list = Vec::new();
    for row in db_rows_baixas {
        let registro: i32 = row.get(0).unwrap_or(0);
        let ref_code: &str = row.get(2).unwrap_or("");
        let d_log: Option<&str> = row.get(4);
        if registro == 0 || ref_code.is_empty() || d_log.is_none() { continue; }
        lotes_baixas_list.push(LoteBaixaRow {
            registro,
            lote: row.get(1).unwrap_or(0),
            ref_code: ref_code.trim().to_string(),
            qty: row.get(3).unwrap_or(0.0),
            date_str: d_log.unwrap().to_string(),
            user: row.get(5).map(|s: &str| s.trim().to_string()),
            just: row.get(6).map(|s: &str| s.trim().to_string()),
            prod_code: row.get(7).map(|s: &str| s.trim().to_string()),
            n_qtde_ref: row.get(8).unwrap_or(0.0),
        });
    }
    let lb_before = lotes_baixas_list.len();
    lotes_baixas_list = dedupe_lotes_baixas(lotes_baixas_list);
    if lotes_baixas_list.len() < lb_before {
        eprintln!(
            "[ERP Sync] lotes_baixas dedupe: {} -> {} linhas (SUM por nlote+creferencia)",
            lb_before,
            lotes_baixas_list.len()
        );
    }

    // O. Movimentos extras de insumos (acertos / inventário) — query placeholder até discovery
    // Ver erp-import/sql/O-movimentos-insumos.sql e MOVIMENTOS-INSUMOS.md
    let query_extra_insumo = format!(
        "
SELECT
    CAST(NULL AS varchar(40)) AS cReferencia,
    CAST(0 AS FLOAT) AS nQtde,
    CAST(NULL AS varchar(30)) AS dMov,
    CAST(NULL AS varchar(40)) AS cTipo,
    CAST(NULL AS varchar(40)) AS cDocumento,
    CAST(NULL AS nvarchar(200)) AS cDetalhes
WHERE 1 = 0 AND '{since_dt}' IS NOT NULL;
"
    );
    println!("Step O: Querying movimentos extras de insumos (placeholder até discovery)");
    let mut extra_insumo_list: Vec<ExtraInsumoMovRow> = Vec::new();
    match client.query(query_extra_insumo, &[]).await {
        Ok(stream) => {
            if let Ok(rows) = stream.into_first_result().await {
                for row in rows {
                    let ref_code: &str = row.get(0).unwrap_or("");
                    let d_mov: Option<&str> = row.get(2);
                    let c_tipo: &str = row.get(3).unwrap_or("");
                    if ref_code.is_empty() || d_mov.is_none() || c_tipo.is_empty() {
                        continue;
                    }
                    let mut mov_type = c_tipo.trim().to_lowercase();
                    if mov_type.contains("acerto") && mov_type.contains("entrada") {
                        mov_type = "acerto_entrada".into();
                    } else if mov_type.contains("acerto") {
                        mov_type = "acerto_saida".into();
                    } else if mov_type.contains("invent") && mov_type.contains("entrada") {
                        mov_type = "inventario_entrada".into();
                    } else if mov_type.contains("invent") {
                        mov_type = "inventario_saida".into();
                    } else if mov_type.contains("entrada") {
                        mov_type = "entrada".into();
                    } else {
                        mov_type = "saida".into();
                    }
                    extra_insumo_list.push(ExtraInsumoMovRow {
                        ref_code: ref_code.trim().to_string(),
                        qty: row.get(1).unwrap_or(0.0),
                        date_str: d_mov.unwrap().to_string(),
                        mov_type,
                        document: row.get::<&str, _>(4).unwrap_or("").trim().to_string(),
                        details: row
                            .get::<&str, _>(5)
                            .unwrap_or("")
                            .trim()
                            .to_string(),
                    });
                }
            }
        }
        Err(e) => {
            eprintln!("[ERP Sync] Step O skipped (esperado até mapear tabela): {e}");
        }
    }

    // J. Query Vendas (full desde 2024; incremental desde watermark)
    let query_vendas = format!(
        "
SELECT 
    v2.nRegistro,
    v2.nVenda,
    v2.cCodProd COLLATE Latin1_General_CI_AS as cCodProd,
    CAST(v2.nQtde AS FLOAT) as nQtde,
    CONVERT(varchar, v2.dVenda, 120) COLLATE Latin1_General_CI_AS as dVenda,
    v1.cNome COLLATE Latin1_General_CI_AS as cNome,
    v2.nNotaFiscal
FROM VENDAS2 v2 WITH (NOLOCK)
INNER JOIN VENDAS1 v1 WITH (NOLOCK) ON v2.nVenda = v1.nVenda AND CAST(v2.dVenda AS DATE) = CAST(v1.dVenda AS DATE)
WHERE v2.dVenda >= '{since_dt}'
  AND v2.cCodProd IS NOT NULL AND v2.cCodProd <> '';
"
    );
    println!("Step J: Querying Vendas (since {since})");
    let stream = client.query(query_vendas, &[]).await?;
    let db_rows_vendas = stream.into_first_result().await?;
    let mut vendas_list = Vec::new();
    for row in db_rows_vendas {
        let registro: i32 = row.get(0).unwrap_or(0);
        let prod_code: &str = row.get(2).unwrap_or("");
        let d_venda: Option<&str> = row.get(4);
        if registro == 0 || prod_code.is_empty() || d_venda.is_none() { continue; }
        vendas_list.push(VendaRow {
            venda: row.get(1).unwrap_or(0),
            prod_code: prod_code.trim().to_string(),
            qty: row.get(3).unwrap_or(0.0),
            date_str: d_venda.unwrap().to_string(),
            client_name: row.get(5).map(|s: &str| s.trim().to_string()),
            nota_fiscal: row.get(6),
        });
    }

    // K. Query PedidoCpa1 (Purchase Orders Header) — piso histórico + pedidos abertos
    let po_date_filter =
        format!("dPedido >= '{since_dt}' OR (cStatus <> 'T' AND cStatus IS NOT NULL)");
    let query_pedido_cpa1 = format!(
        "
SELECT 
    nRegistro,
    nPedido,
    CONVERT(varchar, dPedido, 120) COLLATE Latin1_General_CI_AS as dPedido,
    nCodFornec,
    cNomeF COLLATE Latin1_General_CI_AS as cNomeF,
    cUsuario COLLATE Latin1_General_CI_AS as cUsuario,
    cStatus COLLATE Latin1_General_CI_AS as cStatus,
    cPrazoPgto COLLATE Latin1_General_CI_AS as cPrazoPgto,
    cPrevEntrega COLLATE Latin1_General_CI_AS as cPrevEntrega,
    CAST(nValor AS FLOAT) as nValor,
    CONVERT(varchar, dPrevisao, 120) COLLATE Latin1_General_CI_AS as dPrevisao,
    cEmail COLLATE Latin1_General_CI_AS as cEmail,
    CAST(mObservac AS NVARCHAR(MAX)) COLLATE Latin1_General_CI_AS as mObservac
FROM PedidoCpa1 WITH (NOLOCK)
WHERE {po_date_filter};
"
    );
    println!("Step K: Querying PedidoCpa1 (since {since})");
    let stream = client.query(query_pedido_cpa1, &[]).await?;
    let db_rows_pedido_cpa1 = stream.into_first_result().await?;
    let mut pedido_cpa1_list = Vec::new();
    for row in db_rows_pedido_cpa1 {
        let n_registro: i32 = row.get(0).unwrap_or(0);
        let n_pedido: i32 = row.get(1).unwrap_or(0);
        if n_registro == 0 || n_pedido == 0 { continue; }
        pedido_cpa1_list.push(PedidoCpa1Row {
            n_registro,
            n_pedido,
            d_pedido: row.get(2).map(|s: &str| s.trim().to_string()),
            n_cod_fornec: row.get(3),
            c_nome_f: row.get(4).map(|s: &str| s.trim().to_string()),
            c_usuario: row.get(5).map(|s: &str| s.trim().to_string()),
            c_status: row.get(6).map(|s: &str| s.trim().to_string()),
            c_prazo_pgto: row.get(7).map(|s: &str| s.trim().to_string()),
            c_prev_entrega: row.get(8).map(|s: &str| s.trim().to_string()),
            n_valor: row.get(9).unwrap_or(0.0),
            d_previsao: row.get(10).map(|s: &str| s.trim().to_string()),
            c_email: row.get(11).map(|s: &str| s.trim().to_string()),
            m_observac: row.get(12).map(|s: &str| s.trim().to_string()),
        });
    }

    let po2_date_filter =
        format!("p1.dPedido >= '{since_dt}' OR (p1.cStatus <> 'T' AND p1.cStatus IS NOT NULL)");
    // PedidoCpa2.nRegistro = PedidoCpa1.nRegistro (FK do cabeçalho).
    // NÃO juntar por nPedido+dPedido: o número do pedido se repete entre fornecedores
    // no mesmo dia e multiplica itens (fan-out) — ex.: 9.15.003 com 3 POs fantasma.
    let query_pedido_cpa2 = format!(
        "
SELECT 
    p1.nRegistro as nPedidoRegistro,
    c2.nPedido,
    c2.cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    CAST(c2.nQtde AS FLOAT) as nQtde,
    CAST(c2.nPreco AS FLOAT) as nPreco,
    CAST(c2.nChegou AS FLOAT) as nChegou,
    c2.cDescricao COLLATE Latin1_General_CI_AS as cDescricao,
    c2.cUnidade COLLATE Latin1_General_CI_AS as cUnidade,
    CAST(c2.VALOR_TOTAL AS FLOAT) as VALOR_TOTAL,
    c2.nRegistro,
    c2.cChegada COLLATE Latin1_General_CI_AS as cChegada
FROM PedidoCpa2 c2 WITH (NOLOCK)
INNER JOIN PedidoCpa1 p1 WITH (NOLOCK) ON p1.nRegistro = c2.nRegistro
WHERE ({po2_date_filter});
"
    );
    println!("Step L: Querying PedidoCpa2 (since {since})");
    let stream = client.query(query_pedido_cpa2, &[]).await?;
    let db_rows_pedido_cpa2 = stream.into_first_result().await?;
    let mut pedido_cpa2_list = Vec::new();
    for row in db_rows_pedido_cpa2 {
        let n_pedido_registro: i32 = row.get(0).unwrap_or(0);
        let n_pedido: i32 = row.get(1).unwrap_or(0);
        let c_referencia: &str = row.get(2).unwrap_or("");
        let n_registro: i32 = row.get(9).unwrap_or(0);
        if n_pedido_registro == 0 || n_pedido == 0 || c_referencia.is_empty() || n_registro == 0 { continue; }
        pedido_cpa2_list.push(PedidoCpa2Row {
            n_pedido_registro,
            n_pedido,
            c_referencia: c_referencia.trim().to_string(),
            n_qtde: row.get(3).unwrap_or(0.0),
            n_preco: row.get(4).unwrap_or(0.0),
            n_chegou: row.get(5).unwrap_or(0.0),
            c_descricao: row.get(6).map(|s: &str| s.trim().to_string()),
            c_unidade: row.get(7).map(|s: &str| s.trim().to_string()),
            n_valor_total: row.get(8).unwrap_or(0.0),
            n_registro,
            c_chegada: row.get(10).map(|s: &str| s.trim().to_string()),
        });
    }

    // M. Query Sales Orders Header (Pedidos1) — piso histórico + pedidos abertos
    let so_date_filter = format!(
        "dPedido >= '{since_dt}' OR (CSTATUS NOT IN ('FT', 'CA') AND CSTATUS IS NOT NULL)"
    );
    let query_sales_order1 = format!(
        "
SELECT 
    nPedido,
    CONVERT(varchar, dPedido, 120) COLLATE Latin1_General_CI_AS as dPedido,
    nCodigo,
    cNome COLLATE Latin1_General_CI_AS as cNome,
    CAST(nValorTot AS FLOAT) as nValorTot,
    CSTATUS COLLATE Latin1_General_CI_AS as CSTATUS,
    NNOTAFISCAL,
    CONVERT(varchar, dPrevisaoDespacho, 120) COLLATE Latin1_General_CI_AS as dPrevisao,
    CONVERT(varchar, dEntrega, 120) COLLATE Latin1_General_CI_AS as dEntrega,
    CAST(mObservac AS NVARCHAR(MAX)) COLLATE Latin1_General_CI_AS as mObservac
FROM Pedidos1 WITH (NOLOCK)
WHERE {so_date_filter};
"
    );
    println!("Step M: Querying Pedidos1 (since {since})");
    let stream = client.query(query_sales_order1, &[]).await?;
    let db_rows_pedidos1 = stream.into_first_result().await?;
    let mut sales_orders_list = Vec::new();
    for row in db_rows_pedidos1 {
        let n_pedido: i32 = row.get(0).unwrap_or(0);
        let d_pedido: &str = row.get(1).unwrap_or("");
        if n_pedido == 0 || d_pedido.is_empty() { continue; }
        sales_orders_list.push(SalesOrderRow {
            n_pedido,
            d_pedido: d_pedido.trim().to_string(),
            n_codigo: row.get(2),
            c_nome: row.get(3).map(|s: &str| s.trim().to_string()),
            n_valor_tot: row.get(4).unwrap_or(0.0),
            c_status: row.get(5).map(|s: &str| s.trim().to_string()),
            n_nota_fiscal: row.get(6).unwrap_or(0),
            d_previsao: row.get(7).map(|s: &str| s.trim().to_string()),
            d_entrega: row.get(8).map(|s: &str| s.trim().to_string()),
            m_observac: row.get(9).map(|s: &str| s.trim().to_string()),
        });
    }

    // N. Query Sales Order Items (Pedidos2)
    let so2_date_filter = format!(
        "p1.dPedido >= '{since_dt}' OR (p1.CSTATUS NOT IN ('FT', 'CA') AND p1.CSTATUS IS NOT NULL)"
    );
    let query_sales_order2 = format!(
        "
SELECT 
    p2.nPedido,
    CONVERT(varchar, p2.dPedido, 120) COLLATE Latin1_General_CI_AS as dPedido,
    p2.nRegistro,
    p2.cCodProd COLLATE Latin1_General_CI_AS as cCodProd,
    CAST(p2.nQtde AS INT) as nQtde,
    CAST(p2.nQtdeFat AS INT) as nQtdeFat,
    CAST(p2.nPreco AS FLOAT) as nPreco,
    p2.cLote COLLATE Latin1_General_CI_AS as cLote
FROM Pedidos2 p2 WITH (NOLOCK)
INNER JOIN Pedidos1 p1 WITH (NOLOCK) ON p1.nPedido = p2.nPedido AND p1.dPedido = p2.dPedido
WHERE {so2_date_filter};
"
    );
    println!("Step N: Querying Pedidos2 (since {since})");
    let stream = client.query(query_sales_order2, &[]).await?;
    let db_rows_pedidos2 = stream.into_first_result().await?;
    let mut sales_order_items_list = Vec::new();
    for row in db_rows_pedidos2 {
        let n_pedido: i32 = row.get(0).unwrap_or(0);
        let d_pedido: &str = row.get(1).unwrap_or("");
        let c_cod_prod: &str = row.get(3).unwrap_or("");
        if n_pedido == 0 || d_pedido.is_empty() || c_cod_prod.is_empty() { continue; }
        sales_order_items_list.push(SalesOrderItemRow {
            n_pedido,
            d_pedido: d_pedido.trim().to_string(),
            n_registro: row.get(2),
            c_cod_prod: c_cod_prod.trim().to_string(),
            n_qtde: row.get(4).unwrap_or(0),
            n_qtde_fat: row.get(5).unwrap_or(0),
            n_preco: row.get(6).unwrap_or(0.0),
            c_lote: row.get(7).map(|s: &str| s.trim().to_string()),
        });
    }

    // Reconciliação: pedidos abertos no Hub mas fora do filtro incremental (ex.: viraram FT no ERP).
    // Se o ERP não devolver a chave, o pedido sumiu (apagado/renumerado) → marcar CA no Hub.
    let main_so_keys: HashSet<(i32, String)> = sales_orders_list
        .iter()
        .map(|s| (s.n_pedido, normalize_pedido_date(&s.d_pedido)))
        .collect();
    let reconcile_keys: Vec<(i32, String)> = hub_open_keys
        .into_iter()
        .filter(|k| !main_so_keys.contains(k))
        .collect();
    let mut orphan_so_keys: Vec<(i32, String)> = Vec::new();
    if !reconcile_keys.is_empty() {
        eprintln!(
            "[ERP Sync] Reconciliando {} pedido(s) abertos no Hub (fora da janela since={since})...",
            reconcile_keys.len()
        );
        let mut found_keys: HashSet<(i32, String)> = HashSet::new();
        const RECONCILE_CHUNK: usize = 80;
        for chunk_start in (0..reconcile_keys.len()).step_by(RECONCILE_CHUNK) {
            let end = (chunk_start + RECONCILE_CHUNK).min(reconcile_keys.len());
            let chunk = &reconcile_keys[chunk_start..end];
            let so_chunk = fetch_sales_orders_reconcile(&mut client, chunk).await?;
            for so in &so_chunk {
                found_keys.insert((so.n_pedido, normalize_pedido_date(&so.d_pedido)));
            }
            merge_sales_orders(&mut sales_orders_list, so_chunk);
            let soi_chunk = fetch_sales_order_items_reconcile(&mut client, chunk).await?;
            merge_sales_order_items(&mut sales_order_items_list, soi_chunk);
        }
        orphan_so_keys = reconcile_keys
            .into_iter()
            .filter(|k| !found_keys.contains(k))
            .collect();
        if !orphan_so_keys.is_empty() {
            eprintln!(
                "[ERP Sync] {} pedido(s) abertos no Hub não existem mais no ERP — marcando CA.",
                orphan_so_keys.len()
            );
        }
        eprintln!(
            "[ERP Sync] Reconciliação M/N concluída — SO total={} itens={} órfãos={}",
            sales_orders_list.len(),
            sales_order_items_list.len(),
            orphan_so_keys.len()
        );
    }

    // ==========================================
    // 2. WRITE TO POSTGRESQL (commits por domínio — evita tx gigante no pooler)
    // ==========================================
    eprintln!(
        "[ERP Sync] SQL Server OK — gravando Postgres: produtos={} fornec={} items={} invoices={} lotes={} baixas={} vendas={} PO={} SO={}",
        products_list.len(),
        suppliers_list.len(),
        insumos_list.len() + materiais_list.len(),
        invoices_list.len(),
        lotes_list.len(),
        lotes_baixas_list.len(),
        vendas_list.len(),
        pedido_cpa1_list.len(),
        sales_orders_list.len(),
    );

    let mut tx = pool.begin().await?;

    // Write Products — lotes UNNEST (evita ~14 round-trips/produto no pooler)
    eprintln!(
        "[ERP Sync] Gravando produtos em lote ({})...",
        products_list.len()
    );
    let count_prod = products_list.len();
    let mut synced_prod_codes = HashSet::new();

    let mut codigos: Vec<String> = Vec::with_capacity(count_prod);
    let mut descricoes: Vec<String> = Vec::with_capacity(count_prod);
    let mut prefixes: Vec<String> = Vec::with_capacity(count_prod);
    let mut bases: Vec<Option<String>> = Vec::with_capacity(count_prod);
    let mut medias: Vec<f64> = Vec::with_capacity(count_prod);
    let mut estoques: Vec<f64> = Vec::with_capacity(count_prod);
    let mut producoes: Vec<f64> = Vec::with_capacity(count_prod);
    let mut pedidos: Vec<f64> = Vec::with_capacity(count_prod);
    let mut fases: Vec<Option<String>> = Vec::with_capacity(count_prod);
    let mut hist_codigos: Vec<String> = Vec::with_capacity(count_prod * 12);
    let mut hist_meses: Vec<i32> = Vec::with_capacity(count_prod * 12);
    let mut hist_qtds: Vec<i32> = Vec::with_capacity(count_prod * 12);
    let mut codigos_barras: Vec<Option<String>> = Vec::with_capacity(count_prod);

    for p in &products_list {
        let prefix = get_linha_prefix(&p.codigo).to_string();
        codigos.push(p.codigo.clone());
        descricoes.push(p.descricao.clone());
        prefixes.push(prefix);
        bases.push(p.base.clone());
        medias.push(p.media_lev());
        codigos_barras.push(p.codigo_barras.clone());
        estoques.push(p.estoque);
        producoes.push(p.producao);
        pedidos.push(p.pedidos);
        fases.push(p.fase.clone());
        for mes in 1..=12 {
            hist_codigos.push(p.codigo.clone());
            hist_meses.push(mes);
            hist_qtds.push(p.m_sales[mes as usize - 1]);
        }
        synced_prod_codes.insert(p.codigo.clone());
    }

    // Upsert produtos em chunks
    const PROD_CHUNK: usize = 400;
    for chunk_start in (0..codigos.len()).step_by(PROD_CHUNK) {
        let end = (chunk_start + PROD_CHUNK).min(codigos.len());
        sqlx::query(
            r#"
            INSERT INTO produtos (codigo, descricao, linha_prefix, base, media_levantamento, codigo_barras)
            SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::float8[], $6::text[])
            ON CONFLICT (codigo) DO UPDATE SET
                descricao = EXCLUDED.descricao,
                linha_prefix = EXCLUDED.linha_prefix,
                base = EXCLUDED.base,
                media_levantamento = EXCLUDED.media_levantamento,
                codigo_barras = EXCLUDED.codigo_barras
            "#,
        )
        .bind(&codigos[chunk_start..end])
        .bind(&descricoes[chunk_start..end])
        .bind(&prefixes[chunk_start..end])
        .bind(&bases[chunk_start..end])
        .bind(&medias[chunk_start..end])
        .bind(&codigos_barras[chunk_start..end])
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            INSERT INTO estoque_atual (codigo, estoque, producao, pedidos_aberto, fase)
            SELECT * FROM UNNEST($1::text[], $2::float8[], $3::float8[], $4::float8[], $5::text[])
            ON CONFLICT (codigo) DO UPDATE SET
                estoque = EXCLUDED.estoque,
                producao = EXCLUDED.producao,
                pedidos_aberto = EXCLUDED.pedidos_aberto,
                fase = EXCLUDED.fase
            "#,
        )
        .bind(&codigos[chunk_start..end])
        .bind(&estoques[chunk_start..end])
        .bind(&producoes[chunk_start..end])
        .bind(&pedidos[chunk_start..end])
        .bind(&fases[chunk_start..end])
        .execute(&mut *tx)
        .await?;

        eprintln!("[ERP Sync]   produtos upsert {}/{}", end, count_prod);
    }

    // Histórico: delete dos códigos sincronizados + insert em lote
    sqlx::query("DELETE FROM historico_faturamento WHERE codigo = ANY($1)")
        .bind(&codigos)
        .execute(&mut *tx)
        .await?;

    const HIST_CHUNK: usize = 2000;
    for chunk_start in (0..hist_codigos.len()).step_by(HIST_CHUNK) {
        let end = (chunk_start + HIST_CHUNK).min(hist_codigos.len());
        sqlx::query(
            r#"
            INSERT INTO historico_faturamento (codigo, mes, quantidade)
            SELECT * FROM UNNEST($1::text[], $2::int4[], $3::int4[])
            "#,
        )
        .bind(&hist_codigos[chunk_start..end])
        .bind(&hist_meses[chunk_start..end])
        .bind(&hist_qtds[chunk_start..end])
        .execute(&mut *tx)
        .await?;
    }
    eprintln!(
        "[ERP Sync]   historico_faturamento {} linhas",
        hist_codigos.len()
    );

    // Zera estoque de produtos que sumiram do ERP (1 query)
    let synced_vec: Vec<String> = synced_prod_codes.into_iter().collect();
    sqlx::query(
        "UPDATE estoque_atual SET estoque = 0, producao = 0, pedidos_aberto = 0
         WHERE NOT (codigo = ANY($1))",
    )
    .bind(&synced_vec)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    eprintln!("[ERP Sync] Fase produtos commitada ({count_prod}).");
    let mut tx = pool.begin().await?;

    // Write Suppliers
    eprintln!("[ERP Sync] Gravando fornecedores ({})...", suppliers_list.len());
    let mut count_fornec = 0;
    let mut existing_suppliers = HashMap::new();
    {
        let rows = sqlx::query("SELECT id, name FROM suppliers")
            .fetch_all(&mut *tx)
            .await?;
        for r in rows {
            let id: String = r.get(0);
            let name: String = r.get(1);
            existing_suppliers.insert(name, id);
        }
    }

    let mut current_names = HashSet::new();
    let mut s_ids: Vec<String> = Vec::new();
    let mut s_names: Vec<String> = Vec::new();
    let mut s_contacts: Vec<Option<String>> = Vec::new();
    let mut s_emails: Vec<Option<String>> = Vec::new();
    let mut s_notes: Vec<Option<String>> = Vec::new();

    for s in &suppliers_list {
        let id_str = s.cod_fornec.to_string();
        let mut unique_name = s.nome.clone();

        while (existing_suppliers.contains_key(&unique_name)
            && existing_suppliers.get(&unique_name) != Some(&id_str))
            || current_names.contains(&unique_name)
        {
            unique_name = format!("{} (ID: {})", s.nome, id_str);
            if current_names.contains(&unique_name)
                || (existing_suppliers.contains_key(&unique_name)
                    && existing_suppliers.get(&unique_name) != Some(&id_str))
            {
                unique_name = format!("{} (ID: {}-dup)", s.nome, id_str);
                break;
            }
        }

        existing_suppliers.insert(unique_name.clone(), id_str.clone());
        current_names.insert(unique_name.clone());
        s_ids.push(id_str);
        s_names.push(unique_name);
        s_contacts.push(s.contato.clone());
        s_emails.push(s.email.clone());
        s_notes.push(s.obs.clone());
        count_fornec += 1;
    }

    for chunk_start in (0..s_ids.len()).step_by(PROD_CHUNK) {
        let end = (chunk_start + PROD_CHUNK).min(s_ids.len());
        sqlx::query(
            r#"
            INSERT INTO suppliers (id, name, contact, email, notes)
            SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                contact = EXCLUDED.contact,
                email = EXCLUDED.email,
                notes = EXCLUDED.notes
            "#,
        )
        .bind(&s_ids[chunk_start..end])
        .bind(&s_names[chunk_start..end])
        .bind(&s_contacts[chunk_start..end])
        .bind(&s_emails[chunk_start..end])
        .bind(&s_notes[chunk_start..end])
        .execute(&mut *tx)
        .await?;
    }

    // Write Items (insumos + materiais) em lote
    eprintln!(
        "[ERP Sync] Gravando items ({})...",
        insumos_list.len() + materiais_list.len()
    );
    let mut count_items = 0;
    let mut i_codes: Vec<String> = Vec::new();
    let mut i_descs: Vec<String> = Vec::new();
    let mut i_units: Vec<String> = Vec::new();
    let mut i_cats: Vec<String> = Vec::new();
    let mut i_lines: Vec<Option<String>> = Vec::new();
    let mut i_types: Vec<Option<String>> = Vec::new();
    let mut i_ignored: Vec<i32> = Vec::new();

    for item in &insumos_list {
        let category_id = if item.code.starts_with("9.15.") {
            "cat_mp"
        } else {
            "cat_emb"
        };
        i_codes.push(item.code.clone());
        i_descs.push(item.desc.clone());
        i_units.push(item.unit.clone());
        i_cats.push(category_id.to_string());
        i_lines.push(item.line.clone());
        i_types.push(item.type_code.clone());
        i_ignored.push(item.is_ignored);
        count_items += 1;
    }
    for item in &materiais_list {
        i_codes.push(item.code.clone());
        i_descs.push(item.desc.clone());
        i_units.push(item.unit.clone());
        i_cats.push("cat_mat".to_string());
        i_lines.push(item.line.clone());
        i_types.push(item.type_code.clone());
        i_ignored.push(item.is_ignored);
        count_items += 1;
    }

    for chunk_start in (0..i_codes.len()).step_by(PROD_CHUNK) {
        let end = (chunk_start + PROD_CHUNK).min(i_codes.len());
        sqlx::query(
            r#"
            INSERT INTO items (code, description, unit, category_id, line, type, is_ignored)
            SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::int4[])
            ON CONFLICT (code) DO UPDATE SET
                description = EXCLUDED.description,
                unit = EXCLUDED.unit,
                category_id = CASE
                    WHEN items.category_id IS NOT NULL AND items.category_id NOT IN ('cat_mp', 'cat_emb', 'cat_mat') THEN items.category_id
                    ELSE EXCLUDED.category_id
                END,
                line = EXCLUDED.line,
                type = EXCLUDED.type,
                is_ignored = CASE
                    WHEN EXCLUDED.is_ignored = 1 THEN 1
                    ELSE items.is_ignored
                END,
                updated_at = CURRENT_TIMESTAMP
            "#,
        )
        .bind(&i_codes[chunk_start..end])
        .bind(&i_descs[chunk_start..end])
        .bind(&i_units[chunk_start..end])
        .bind(&i_cats[chunk_start..end])
        .bind(&i_lines[chunk_start..end])
        .bind(&i_types[chunk_start..end])
        .bind(&i_ignored[chunk_start..end])
        .execute(&mut *tx)
        .await?;
        eprintln!("[ERP Sync]   items upsert {}/{}", end, count_items);
    }

    tx.commit().await?;
    eprintln!("[ERP Sync] Fase fornecedores/itens commitada.");
    let mut tx = pool.begin().await?;

    // Re-lê D1/D2 imediatamente antes de gravar (D1 limpo, sem NOLOCK).
    eprintln!("[ERP Sync] Reconsultando D1/D2 imediatamente antes dos snapshots...");
    {
        let stream = client.query(query_stocks_clean, &[]).await?;
        let db_rows_stocks = stream.into_first_result().await?;
        stocks_list.clear();
        for row in db_rows_stocks {
            let code: &str = row.get(0).unwrap_or("");
            if code.is_empty() {
                continue;
            }
            stocks_list.push(StockRow {
                code: code.trim().to_string(),
                stock_qty: mssql_f64(&row, 1),
                reserved_qty: mssql_f64(&row, 2),
                in_prod: mssql_f64(&row, 3),
                in_orders: mssql_f64(&row, 4),
            });
        }
        let stream = client.query(D2_MATERIAIS_STOCKS_SQL_CLEAN, &[]).await?;
        let db_rows_mat_stocks = stream.into_first_result().await?;
        mat_stocks_list.clear();
        for row in db_rows_mat_stocks {
            let code: &str = row.get(0).unwrap_or("");
            if code.is_empty() {
                continue;
            }
            mat_stocks_list.push(StockRow {
                code: code.trim().to_string(),
                stock_qty: mssql_f64(&row, 1),
                reserved_qty: mssql_f64(&row, 2),
                in_prod: mssql_f64(&row, 3),
                in_orders: mssql_f64(&row, 4),
            });
        }
    }

    // Write Stock Snapshots (Insumos + Materiais) — delete + insert em lote.
    // Insumos ganha de Materiais no mesmo código (evita sobrescrever nQtdeEstoque da tela).
    let mut merged_stocks: std::collections::HashMap<String, StockRow> =
        std::collections::HashMap::with_capacity(stocks_list.len() + mat_stocks_list.len());
    for stk in &mat_stocks_list {
        merged_stocks.insert(stk.code.clone(), stk.clone());
    }
    for stk in &stocks_list {
        merged_stocks.insert(stk.code.clone(), stk.clone());
    }
    let merged_list: Vec<StockRow> = merged_stocks.into_values().collect();

    let mut count_snapshots = 0;
    let total_snapshots = merged_list.len();
    if total_snapshots > 0 {
        eprintln!("[ERP Sync] Gravando snapshots ({total_snapshots})...");
        let stock_import_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO stock_imports (id, filename, source, item_count)
             VALUES ($1, 'SQL Server Sync', 'ERP', $2)",
        )
        .bind(&stock_import_id)
        .bind(total_snapshots as i32)
        .execute(&mut *tx)
        .await?;

        let all_stock_codes: Vec<String> = merged_list.iter().map(|s| s.code.clone()).collect();
        // TRIM: remove órfãos com whitespace que o join da grade de Compras ignoraria.
        sqlx::query("DELETE FROM stock_snapshots WHERE TRIM(item_code) = ANY($1)")
            .bind(&all_stock_codes)
            .execute(&mut *tx)
            .await?;

        let mut snap_ids: Vec<String> = Vec::new();
        let mut snap_imports: Vec<String> = Vec::new();
        let mut snap_codes: Vec<String> = Vec::new();
        let mut snap_stock: Vec<f64> = Vec::new();
        let mut snap_reserved: Vec<f64> = Vec::new();
        let mut snap_prod: Vec<f64> = Vec::new();
        let mut snap_orders: Vec<f64> = Vec::new();

        for stk in &merged_list {
            snap_ids.push(Uuid::new_v4().to_string());
            snap_imports.push(stock_import_id.clone());
            snap_codes.push(stk.code.clone());
            snap_stock.push(stk.stock_qty);
            snap_reserved.push(stk.reserved_qty);
            snap_prod.push(stk.in_prod);
            snap_orders.push(stk.in_orders);
            count_snapshots += 1;
        }

        for chunk_start in (0..snap_ids.len()).step_by(PROD_CHUNK) {
            let end = (chunk_start + PROD_CHUNK).min(snap_ids.len());
            sqlx::query(
                r#"
                INSERT INTO stock_snapshots (id, import_id, item_code, stock_qty, reserved_qty, in_production, in_orders)
                SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::float8[], $5::float8[], $6::float8[], $7::float8[])
                "#,
            )
            .bind(&snap_ids[chunk_start..end])
            .bind(&snap_imports[chunk_start..end])
            .bind(&snap_codes[chunk_start..end])
            .bind(&snap_stock[chunk_start..end])
            .bind(&snap_reserved[chunk_start..end])
            .bind(&snap_prod[chunk_start..end])
            .bind(&snap_orders[chunk_start..end])
            .execute(&mut *tx)
            .await?;
        }
        eprintln!(
            "[ERP Sync] Snapshots gravados: {count_snapshots} (insumos via nQtdeEstoque)"
        );
    }

    // Write Invoices em lote
    eprintln!("[ERP Sync] Gravando invoices ({})...", invoices_list.len());
    let mut count_invoices = 0;
    sqlx::query(
        "DELETE FROM invoices WHERE COALESCE(invoice_date, '') >= $1",
    )
    .bind(&since)
    .execute(&mut *tx)
    .await?;

    {
        let mut inv_ids: Vec<String> = Vec::new();
        let mut inv_nums: Vec<String> = Vec::new();
        let mut inv_codes: Vec<String> = Vec::new();
        let mut inv_descs: Vec<Option<String>> = Vec::new();
        let mut inv_units: Vec<Option<String>> = Vec::new();
        let mut inv_qtys: Vec<f64> = Vec::new();
        let mut inv_prices: Vec<f64> = Vec::new();
        let mut inv_totals: Vec<f64> = Vec::new();
        let mut inv_sup_names: Vec<Option<String>> = Vec::new();
        let mut inv_sup_ids: Vec<Option<String>> = Vec::new();
        let mut inv_dates: Vec<Option<String>> = Vec::new();
        let mut inv_cfops: Vec<Option<String>> = Vec::new();
        let mut inv_icms_values: Vec<f64> = Vec::new();
        let mut inv_ipi_values: Vec<f64> = Vec::new();
        let mut inv_freight_values: Vec<f64> = Vec::new();
        let mut inv_entry_dates: Vec<Option<String>> = Vec::new();
        let mut inv_carrier_names: Vec<Option<String>> = Vec::new();
        let mut inv_supplier_cnpjs: Vec<Option<String>> = Vec::new();
        let mut inv_payment_installments: Vec<Option<String>> = Vec::new();
        let mut inv_fte_numbers: Vec<Option<String>> = Vec::new();
        let mut inv_fte_values: Vec<f64> = Vec::new();
        let mut inv_fte_carrier_names: Vec<Option<String>> = Vec::new();
        let mut inv_fte_carrier_cnpjs: Vec<Option<String>> = Vec::new();
        let mut inv_fte_issue_dates: Vec<Option<String>> = Vec::new();
        let mut inv_fte_entry_dates: Vec<Option<String>> = Vec::new();
        let mut inv_fte_cif_fobs: Vec<Option<String>> = Vec::new();
        let mut inv_fte_series: Vec<Option<String>> = Vec::new();
        let mut inv_fte_cfops: Vec<Option<String>> = Vec::new();
        let mut inv_fte_naturezas: Vec<Option<String>> = Vec::new();
        let mut inv_fte_icms_values: Vec<f64> = Vec::new();

        for inv in &invoices_list {
            inv_ids.push(Uuid::new_v4().to_string());
            inv_nums.push(inv.nota.to_string());
            inv_codes.push(inv.code.clone());
            inv_descs.push(inv.desc.clone());
            inv_units.push(inv.unit.clone());
            inv_qtys.push(inv.quantity);
            inv_prices.push(inv.unit_price);
            inv_totals.push(inv.total_value);
            inv_sup_names.push(inv.fornec_name.clone());
            inv_sup_ids.push(inv.supplier_id.clone());
            inv_dates.push(inv.date_str.clone());
            inv_cfops.push(inv.cfop.clone());
            inv_icms_values.push(inv.icms_value);
            inv_ipi_values.push(inv.ipi_value);
            inv_freight_values.push(inv.freight_value);
            inv_entry_dates.push(inv.entry_date.clone());
            inv_carrier_names.push(inv.carrier_name.clone());
            inv_supplier_cnpjs.push(inv.supplier_cnpj.clone());
            inv_payment_installments.push(inv.payment_installments.clone());
            inv_fte_numbers.push(inv.fte_number.clone());
            inv_fte_values.push(inv.fte_value);
            inv_fte_carrier_names.push(inv.fte_carrier_name.clone());
            inv_fte_carrier_cnpjs.push(inv.fte_carrier_cnpj.clone());
            inv_fte_issue_dates.push(inv.fte_issue_date.clone());
            inv_fte_entry_dates.push(inv.fte_entry_date.clone());
            inv_fte_cif_fobs.push(inv.fte_cif_fob.clone());
            inv_fte_series.push(inv.fte_serie.clone());
            inv_fte_cfops.push(inv.fte_cfop.clone());
            inv_fte_naturezas.push(inv.fte_natureza.clone());
            inv_fte_icms_values.push(inv.fte_icms_value);
            count_invoices += 1;
        }

        for chunk_start in (0..inv_ids.len()).step_by(PROD_CHUNK) {
            let end = (chunk_start + PROD_CHUNK).min(inv_ids.len());
            sqlx::query(
                r#"
                INSERT INTO invoices (
                    id, invoice_number, item_code, description, unit, quantity, unit_price, total_value, 
                    supplier_name, supplier_id, invoice_date,
                    cfop, icms_value, ipi_value, freight_value, entry_date, carrier_name, supplier_cnpj, payment_installments,
                    fte_number, fte_value, fte_carrier_name, fte_carrier_cnpj, fte_issue_date, fte_entry_date, fte_cif_fob,
                    fte_serie, fte_cfop, fte_natureza, fte_icms_value
                )
                SELECT * FROM UNNEST(
                    $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
                    $6::float8[], $7::float8[], $8::float8[], $9::text[], $10::text[], $11::text[],
                    $12::text[], $13::float8[], $14::float8[], $15::float8[], $16::text[], $17::text[], $18::text[], $19::text[],
                    $20::text[], $21::float8[], $22::text[], $23::text[], $24::text[], $25::text[], $26::text[],
                    $27::text[], $28::text[], $29::text[], $30::float8[]
                )
                "#,
            )
            .bind(&inv_ids[chunk_start..end])
            .bind(&inv_nums[chunk_start..end])
            .bind(&inv_codes[chunk_start..end])
            .bind(&inv_descs[chunk_start..end])
            .bind(&inv_units[chunk_start..end])
            .bind(&inv_qtys[chunk_start..end])
            .bind(&inv_prices[chunk_start..end])
            .bind(&inv_totals[chunk_start..end])
            .bind(&inv_sup_names[chunk_start..end])
            .bind(&inv_sup_ids[chunk_start..end])
            .bind(&inv_dates[chunk_start..end])
            .bind(&inv_cfops[chunk_start..end])
            .bind(&inv_icms_values[chunk_start..end])
            .bind(&inv_ipi_values[chunk_start..end])
            .bind(&inv_freight_values[chunk_start..end])
            .bind(&inv_entry_dates[chunk_start..end])
            .bind(&inv_carrier_names[chunk_start..end])
            .bind(&inv_supplier_cnpjs[chunk_start..end])
            .bind(&inv_payment_installments[chunk_start..end])
            .bind(&inv_fte_numbers[chunk_start..end])
            .bind(&inv_fte_values[chunk_start..end])
            .bind(&inv_fte_carrier_names[chunk_start..end])
            .bind(&inv_fte_carrier_cnpjs[chunk_start..end])
            .bind(&inv_fte_issue_dates[chunk_start..end])
            .bind(&inv_fte_entry_dates[chunk_start..end])
            .bind(&inv_fte_cif_fobs[chunk_start..end])
            .bind(&inv_fte_series[chunk_start..end])
            .bind(&inv_fte_cfops[chunk_start..end])
            .bind(&inv_fte_naturezas[chunk_start..end])
            .bind(&inv_fte_icms_values[chunk_start..end])
            .execute(&mut *tx)
            .await?;
            if end % 800 == 0 || end == inv_ids.len() {
                eprintln!("[ERP Sync]   invoices {end}/{}", inv_ids.len());
            }
        }

        // Preenche CNPJ dos fornecedores a partir das notas fiscais inseridas
        let _ = sqlx::query(
            "UPDATE suppliers s
             SET cnpj = inv.supplier_cnpj
             FROM (
                 SELECT DISTINCT ON (supplier_id) supplier_id, supplier_cnpj
                 FROM invoices
                 WHERE supplier_id IS NOT NULL 
                   AND supplier_cnpj IS NOT NULL 
                   AND TRIM(supplier_cnpj) <> ''
                 ORDER BY supplier_id, invoice_date DESC
             ) inv
             WHERE s.id = inv.supplier_id AND (s.cnpj IS NULL OR TRIM(s.cnpj) = '')"
        )
        .execute(&mut *tx)
        .await;
    }

    eprintln!("[ERP Sync] Invoices OK — gravando consumption...");
    // Write Consumption em lote
    let mut count_consumption = 0;
    {
        let mut c_ids: Vec<String> = Vec::new();
        let mut c_codes: Vec<String> = Vec::new();
        let mut c_years: Vec<i32> = Vec::new();
        let mut c_totals: Vec<f64> = Vec::new();
        let mut c_avgs: Vec<f64> = Vec::new();
        for c in &consumption_list {
            c_ids.push(Uuid::new_v4().to_string());
            c_codes.push(c.code.clone());
            c_years.push(c.year);
            c_totals.push(c.total_qty);
            c_avgs.push(c.monthly_avg);
            count_consumption += 1;
        }
        eprintln!("[ERP Sync] Gravando consumption ({count_consumption})...");
        const C_CHUNK: usize = 500;
        for chunk_start in (0..c_ids.len()).step_by(C_CHUNK) {
            let end = (chunk_start + C_CHUNK).min(c_ids.len());
            sqlx::query(
                r#"
                INSERT INTO consumption (id, item_code, year, total_qty, monthly_avg)
                SELECT * FROM UNNEST($1::text[], $2::text[], $3::int4[], $4::float8[], $5::float8[])
                ON CONFLICT (item_code, year) DO UPDATE SET
                    total_qty = EXCLUDED.total_qty,
                    monthly_avg = EXCLUDED.monthly_avg,
                    imported_at = CURRENT_TIMESTAMP
                "#,
            )
            .bind(&c_ids[chunk_start..end])
            .bind(&c_codes[chunk_start..end])
            .bind(&c_years[chunk_start..end])
            .bind(&c_totals[chunk_start..end])
            .bind(&c_avgs[chunk_start..end])
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;
    eprintln!("[ERP Sync] Fase NF/consumo/snapshots commitada.");
    let mut tx = pool.begin().await?;

    // Write Formulations em lote
    eprintln!(
        "[ERP Sync] Gravando formulações ({})...",
        formulations_list.len()
    );
    let mut count_formulations = 0;
    sqlx::query("DELETE FROM formulations")
        .execute(&mut *tx)
        .await?;
    {
        let mut f_prod: Vec<String> = Vec::new();
        let mut f_ing: Vec<String> = Vec::new();
        let mut f_desc: Vec<Option<String>> = Vec::new();
        let mut f_qty: Vec<f64> = Vec::new();
        let mut f_pct: Vec<Option<f64>> = Vec::new();
        for f in &formulations_list {
            f_prod.push(f.product_code.clone());
            f_ing.push(f.ingredient_code.clone());
            f_desc.push(f.description.clone());
            f_qty.push(f.quantity);
            f_pct.push(f.percentage);
            count_formulations += 1;
        }
        const F_CHUNK: usize = 500;
        for chunk_start in (0..f_prod.len()).step_by(F_CHUNK) {
            let end = (chunk_start + F_CHUNK).min(f_prod.len());
            // Skip orphan FKs: only insert when product+ingredient exist
            sqlx::query(
                r#"
                INSERT INTO formulations (product_code, ingredient_code, description, quantity, percentage)
                SELECT v.product_code, v.ingredient_code, v.description, v.quantity, v.percentage
                FROM UNNEST($1::text[], $2::text[], $3::text[], $4::float8[], $5::float8[])
                    AS v(product_code, ingredient_code, description, quantity, percentage)
                WHERE EXISTS (SELECT 1 FROM produtos p WHERE p.codigo = v.product_code)
                  AND EXISTS (SELECT 1 FROM items i WHERE i.code = v.ingredient_code)
                "#,
            )
            .bind(&f_prod[chunk_start..end])
            .bind(&f_ing[chunk_start..end])
            .bind(&f_desc[chunk_start..end])
            .bind(&f_qty[chunk_start..end])
            .bind(&f_pct[chunk_start..end])
            .execute(&mut *tx)
            .await?;
            if end % 2000 == 0 || end == f_prod.len() {
                eprintln!("[ERP Sync]   formulations {end}/{}", f_prod.len());
            }
        }
    }

    tx.commit().await?;
    eprintln!("[ERP Sync] Fase formulações commitada ({count_formulations}).");
    let mut tx = pool.begin().await?;

    // Write kit_composicao (Passo P) — só origem=erp; manuais preservadas
    eprintln!(
        "[ERP Sync] Gravando composição de kits ({})...",
        kit_composicao_list.len()
    );
    let mut count_kit_composicao = 0;
    sqlx::query("DELETE FROM kit_composicao WHERE COALESCE(origem, 'manual') = 'erp'")
        .execute(&mut *tx)
        .await?;
    {
        let mut k_kit: Vec<String> = Vec::new();
        let mut k_comp: Vec<String> = Vec::new();
        let mut k_qty: Vec<f64> = Vec::new();
        let mut k_fat_qtd: Vec<f64> = Vec::new();
        let mut k_fat_kits: Vec<i32> = Vec::new();
        for k in &kit_composicao_list {
            k_kit.push(k.kit_codigo.clone());
            k_comp.push(k.componente_codigo.clone());
            k_qty.push(k.quantidade);
            k_fat_qtd.push(k.fator_proporcao_qtd);
            k_fat_kits.push(k.fator_proporcao_kits);
        }
        const K_CHUNK: usize = 500;
        for chunk_start in (0..k_kit.len()).step_by(K_CHUNK) {
            let end = (chunk_start + K_CHUNK).min(k_kit.len());
            // Kit precisa existir em produtos; componente em produtos OU items
            let res = sqlx::query(
                r#"
                INSERT INTO kit_composicao (
                    kit_codigo, componente_codigo, quantidade,
                    fator_proporcao_qtd, fator_proporcao_kits, origem
                )
                SELECT v.kit_codigo, v.componente_codigo, v.quantidade::numeric,
                       v.fator_proporcao_qtd::numeric, v.fator_proporcao_kits, 'erp'
                FROM UNNEST($1::text[], $2::text[], $3::float8[], $4::float8[], $5::int4[])
                    AS v(kit_codigo, componente_codigo, quantidade, fator_proporcao_qtd, fator_proporcao_kits)
                WHERE EXISTS (SELECT 1 FROM produtos p WHERE p.codigo = v.kit_codigo)
                  AND (
                    EXISTS (SELECT 1 FROM produtos p2 WHERE p2.codigo = v.componente_codigo)
                    OR EXISTS (SELECT 1 FROM items i WHERE i.code = v.componente_codigo)
                  )
                ON CONFLICT (kit_codigo, componente_codigo) DO UPDATE SET
                    quantidade = EXCLUDED.quantidade,
                    fator_proporcao_qtd = EXCLUDED.fator_proporcao_qtd,
                    fator_proporcao_kits = EXCLUDED.fator_proporcao_kits,
                    origem = 'erp'
                "#,
            )
            .bind(&k_kit[chunk_start..end])
            .bind(&k_comp[chunk_start..end])
            .bind(&k_qty[chunk_start..end])
            .bind(&k_fat_qtd[chunk_start..end])
            .bind(&k_fat_kits[chunk_start..end])
            .execute(&mut *tx)
            .await?;
            count_kit_composicao += res.rows_affected() as usize;
            if end % 2000 == 0 || end == k_kit.len() {
                eprintln!("[ERP Sync]   kit_composicao {end}/{}", k_kit.len());
            }
        }
    }

    tx.commit().await?;
    eprintln!("[ERP Sync] Fase kit_composicao commitada ({count_kit_composicao}).");
    let mut tx = pool.begin().await?;

    // Write Stock Movements (Unified) — TRUNCATE/janela + INSERT em lote (UNNEST)
    let mut count_movements = 0;
    let mov_total_est = invoices_list.len()
        + lotes_baixas_list.len()
        + lotes_list.len()
        + vendas_list.len()
        + extra_insumo_list.len();
    eprintln!(
        "[ERP Sync] Gravando movimentações (~{mov_total_est} linhas, mode={})...",
        mode.as_str()
    );

    if mode == SyncMode::Full {
        // TRUNCATE fora de tx longa: commit atual, truncate, nova tx
        tx.commit().await?;
        eprintln!("[ERP Sync]   TRUNCATE stock_movements (pode levar alguns segundos)...");
        let t0 = std::time::Instant::now();
        sqlx::query("TRUNCATE TABLE stock_movements")
            .execute(pool)
            .await?;
        eprintln!(
            "[ERP Sync]   TRUNCATE concluído em {:.1}s",
            t0.elapsed().as_secs_f64()
        );
        tx = pool.begin().await?;
    } else {
        eprintln!("[ERP Sync]   DELETE stock_movements desde {since}...");
        sqlx::query("DELETE FROM stock_movements WHERE COALESCE(date, '') >= $1")
            .bind(&since)
            .execute(&mut *tx)
            .await?;
    }

    let mut mov_batch: Vec<MovInsert> = Vec::with_capacity(MOV_BATCH);

    for inv in &invoices_list {
        let item_type = if inv.code.starts_with("9.15.") {
            "insumo"
        } else {
            "material"
        };
        mov_batch.push(MovInsert {
            id: Uuid::new_v4().to_string(),
            item_code: inv.code.clone(),
            item_type: item_type.to_string(),
            movement_type: "entrada".to_string(),
            quantity: inv.quantity,
            date: inv.date_str.clone().unwrap_or_default(),
            document_number: inv.nota.to_string(),
            details: inv.fornec_name.clone().unwrap_or_default(),
        });
        count_movements += 1;
        if mov_batch.len() >= MOV_BATCH {
            flush_stock_movements(&mut tx, &mut mov_batch).await?;
            if count_movements % 2000 == 0 {
                eprintln!("[ERP Sync]   movimentos (NF) {count_movements}/{mov_total_est}");
            }
        }
    }

    // lotes_baixas: schema em supabase/001 (role natum_app não tem CREATE no public)
    if mode == SyncMode::Full {
        sqlx::query("TRUNCATE lotes_baixas")
            .execute(&mut *tx)
            .await?;
    } else {
        sqlx::query("DELETE FROM lotes_baixas WHERE COALESCE(dlog, '') >= $1")
            .bind(&since)
            .execute(&mut *tx)
            .await?;
    }

    let mut lb_reg: Vec<i32> = Vec::new();
    let mut lb_lote: Vec<i32> = Vec::new();
    let mut lb_ref: Vec<String> = Vec::new();
    let mut lb_qty: Vec<f64> = Vec::new();
    let mut lb_dlog: Vec<String> = Vec::new();
    let mut lb_user: Vec<Option<String>> = Vec::new();
    let mut lb_just: Vec<Option<String>> = Vec::new();
    let mut lb_prod: Vec<Option<String>> = Vec::new();
    let mut lb_qref: Vec<f64> = Vec::new();

    for b in &lotes_baixas_list {
        let just = b.just.as_deref().unwrap_or("");
        let just_l = just.to_lowercase();
        let is_acerto = just_l.contains("acerto")
            || just_l.contains("ajuste")
            || just_l.contains("invent");
        let details = format!(
            "OP: {} | Usuário: {} | Justificativa: {}",
            b.lote,
            b.user.as_deref().unwrap_or(""),
            just
        );
        let movement_type = if is_acerto {
            "acerto_saida".to_string()
        } else {
            "saida".to_string()
        };
        mov_batch.push(MovInsert {
            id: Uuid::new_v4().to_string(),
            item_code: b.ref_code.clone(),
            item_type: "insumo".to_string(),
            movement_type,
            quantity: b.qty,
            date: b.date_str.clone(),
            document_number: b.lote.to_string(),
            details,
        });
        count_movements += 1;
        if mov_batch.len() >= MOV_BATCH {
            flush_stock_movements(&mut tx, &mut mov_batch).await?;
            if count_movements % 2000 == 0 {
                eprintln!("[ERP Sync]   movimentos (baixas) {count_movements}/{mov_total_est}");
            }
        }

        lb_reg.push(b.registro);
        lb_lote.push(b.lote);
        lb_ref.push(b.ref_code.clone());
        lb_qty.push(b.qty);
        lb_dlog.push(b.date_str.clone());
        lb_user.push(b.user.clone());
        lb_just.push(b.just.clone());
        lb_prod.push(b.prod_code.clone());
        lb_qref.push(b.n_qtde_ref);
    }

    for x in &extra_insumo_list {
        let item_type = if x.ref_code.starts_with("9.15.") {
            "insumo"
        } else {
            "material"
        };
        let details = if x.details.is_empty() {
            format!("[ERP-O] {}", x.mov_type)
        } else {
            format!("[ERP-O] {} | {}", x.mov_type, x.details)
        };
        mov_batch.push(MovInsert {
            id: Uuid::new_v4().to_string(),
            item_code: x.ref_code.clone(),
            item_type: item_type.to_string(),
            movement_type: x.mov_type.clone(),
            quantity: x.qty,
            date: x.date_str.clone(),
            document_number: x.document.clone(),
            details,
        });
        count_movements += 1;
        if mov_batch.len() >= MOV_BATCH {
            flush_stock_movements(&mut tx, &mut mov_batch).await?;
        }
    }

    const LB_CHUNK: usize = 500;
    for chunk_start in (0..lb_reg.len()).step_by(LB_CHUNK) {
        let end = (chunk_start + LB_CHUNK).min(lb_reg.len());
        sqlx::query(
            r#"
            INSERT INTO lotes_baixas (registro, nlote, creferencia, nqtde, dlog, cusuario, cjustificativa, ccodprod, nqtderef)
            SELECT * FROM UNNEST(
                $1::int4[], $2::int4[], $3::text[], $4::float8[], $5::text[],
                $6::text[], $7::text[], $8::text[], $9::float8[]
            )
            ON CONFLICT (registro) DO UPDATE SET
                nlote = EXCLUDED.nlote,
                creferencia = EXCLUDED.creferencia,
                nqtde = EXCLUDED.nqtde,
                dlog = EXCLUDED.dlog,
                cusuario = EXCLUDED.cusuario,
                cjustificativa = EXCLUDED.cjustificativa,
                ccodprod = EXCLUDED.ccodprod,
                nqtderef = EXCLUDED.nqtderef
            "#,
        )
        .bind(&lb_reg[chunk_start..end])
        .bind(&lb_lote[chunk_start..end])
        .bind(&lb_ref[chunk_start..end])
        .bind(&lb_qty[chunk_start..end])
        .bind(&lb_dlog[chunk_start..end])
        .bind(&lb_user[chunk_start..end])
        .bind(&lb_just[chunk_start..end])
        .bind(&lb_prod[chunk_start..end])
        .bind(&lb_qref[chunk_start..end])
        .execute(&mut *tx)
        .await?;
        if end % 5000 == 0 || end == lb_reg.len() {
            eprintln!("[ERP Sync]   lotes_baixas {end}/{}", lb_reg.len());
        }
    }

    // Criar e atualizar erp_lotes_laudos
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS erp_lotes_laudos (
            lote TEXT NOT NULL,
            product_code TEXT NOT NULL,
            ph FLOAT8,
            viscosidade FLOAT8,
            densidade FLOAT8,
            viscosidade_24h FLOAT8,
            fabricado_por TEXT,
            autorizado_por TEXT,
            responsavel TEXT,
            resultado TEXT,
            data_inspecao TEXT,
            data_lote TEXT,
            data_pesado TEXT,
            data_envase TEXT,
            quantidade_kg FLOAT8,
            unidades FLOAT8,
            observacoes TEXT,
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (lote, product_code)
        )
        "#
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_erp_lotes_laudos_lote ON erp_lotes_laudos(lote)")
        .execute(&mut *tx)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_erp_lotes_laudos_prod ON erp_lotes_laudos(product_code)")
        .execute(&mut *tx)
        .await?;

    let mut laudos_dedup: HashMap<(String, String), &LoteRow> = HashMap::new();
    for l in &lotes_list {
        laudos_dedup.insert((l.lote.to_string(), l.product_code.clone()), l);
    }
    let laudos_records: Vec<&LoteRow> = laudos_dedup.into_values().collect();
    for chunk in laudos_records.chunks(3000) {
        let lotes: Vec<String> = chunk.iter().map(|r| r.lote.to_string()).collect();
        let prods: Vec<String> = chunk.iter().map(|r| r.product_code.clone()).collect();
        let phs: Vec<Option<f64>> = chunk.iter().map(|r| r.ph).collect();
        let viscs: Vec<Option<f64>> = chunk.iter().map(|r| r.viscosidade).collect();
        let denss: Vec<Option<f64>> = chunk.iter().map(|r| r.densidade).collect();
        let visc24s: Vec<Option<f64>> = chunk.iter().map(|r| r.viscosidade_24h).collect();
        let fabs: Vec<Option<String>> = chunk.iter().map(|r| r.fab.clone()).collect();
        let auts: Vec<Option<String>> = chunk.iter().map(|r| r.aut.clone()).collect();
        let resps: Vec<Option<String>> = chunk.iter().map(|r| r.responsavel.clone()).collect();
        let ress: Vec<Option<String>> = chunk.iter().map(|r| r.resultado.clone()).collect();
        let dinsp_arr: Vec<Option<String>> = chunk.iter().map(|r| r.data_inspecao.clone()).collect();
        let dlote_arr: Vec<Option<String>> = chunk.iter().map(|r| Some(r.date_str.clone())).collect();
        let dpesado_arr: Vec<Option<String>> = chunk.iter().map(|r| r.d_pesado.clone()).collect();
        let denvase_arr: Vec<Option<String>> = chunk.iter().map(|r| r.d_envase.clone()).collect();
        let qtd_arr: Vec<f64> = chunk.iter().map(|r| r.qty).collect();
        let un_arr: Vec<f64> = chunk.iter().map(|r| r.unidades.unwrap_or(0.0)).collect();
        let obs_arr: Vec<Option<String>> = chunk.iter().map(|r| r.observacoes.clone()).collect();

        sqlx::query(
            r#"
            INSERT INTO erp_lotes_laudos (
                lote, product_code, ph, viscosidade, densidade, viscosidade_24h,
                fabricado_por, autorizado_por, responsavel, resultado,
                data_inspecao, data_lote, data_pesado, data_envase,
                quantidade_kg, unidades, observacoes, updated_at
            )
            SELECT 
                u.lote, u.product_code, u.ph, u.viscosidade, u.densidade, u.viscosidade_24h,
                u.fabricado_por, u.autorizado_por, u.responsavel, u.resultado,
                u.data_inspecao, u.data_lote, u.data_pesado, u.data_envase,
                u.quantidade_kg, u.unidades, u.observacoes, NOW()
            FROM UNNEST(
                $1::text[], $2::text[], $3::float8[], $4::float8[], $5::float8[], $6::float8[],
                $7::text[], $8::text[], $9::text[], $10::text[],
                $11::text[], $12::text[], $13::text[], $14::text[],
                $15::float8[], $16::float8[], $17::text[]
            ) AS u(
                lote, product_code, ph, viscosidade, densidade, viscosidade_24h,
                fabricado_por, autorizado_por, responsavel, resultado,
                data_inspecao, data_lote, data_pesado, data_envase,
                quantidade_kg, unidades, observacoes
            )
            ON CONFLICT (lote, product_code) DO UPDATE SET
                ph = EXCLUDED.ph,
                viscosidade = EXCLUDED.viscosidade,
                densidade = EXCLUDED.densidade,
                viscosidade_24h = EXCLUDED.viscosidade_24h,
                fabricado_por = EXCLUDED.fabricado_por,
                autorizado_por = EXCLUDED.autorizado_por,
                responsavel = EXCLUDED.responsavel,
                resultado = EXCLUDED.resultado,
                data_inspecao = EXCLUDED.data_inspecao,
                data_lote = EXCLUDED.data_lote,
                data_pesado = EXCLUDED.data_pesado,
                data_envase = EXCLUDED.data_envase,
                quantidade_kg = EXCLUDED.quantidade_kg,
                unidades = EXCLUDED.unidades,
                observacoes = EXCLUDED.observacoes,
                updated_at = NOW();
            "#,
        )
        .bind(&lotes)
        .bind(&prods)
        .bind(&phs)
        .bind(&viscs)
        .bind(&denss)
        .bind(&visc24s)
        .bind(&fabs)
        .bind(&auts)
        .bind(&resps)
        .bind(&ress)
        .bind(&dinsp_arr)
        .bind(&dlote_arr)
        .bind(&dpesado_arr)
        .bind(&denvase_arr)
        .bind(&qtd_arr)
        .bind(&un_arr)
        .bind(&obs_arr)
        .execute(&mut *tx)
        .await?;
    }

    // Garante que lotes em stock_movements sejam limpos antes da reinserção/atualização
    let lote_numbers: Vec<String> = lotes_list.iter().map(|l| l.lote.to_string()).collect();
    for chunk in lote_numbers.chunks(2000) {
        sqlx::query(
            "DELETE FROM stock_movements
             WHERE item_type = 'produto' AND movement_type = 'entrada'
               AND document_number = ANY($1)"
        )
        .bind(chunk)
        .execute(&mut *tx)
        .await?;
    }

    // Se havia lotes que o Hub considerava abertos mas que não vieram do ERP (foram cancelados/deletados), limpa-os
    let returned_lote_set: std::collections::HashSet<i32> = lotes_list.iter().map(|l| l.lote).collect();
    let orphan_lotes: Vec<String> = hub_open_lotes
        .iter()
        .filter(|id| !returned_lote_set.contains(id))
        .map(|id| id.to_string())
        .collect();
    if !orphan_lotes.is_empty() {
        eprintln!(
            "[ERP Sync] Removendo {} lote(s) órfão(s) que não existem mais no ERP: {:?}",
            orphan_lotes.len(),
            orphan_lotes
        );
        for chunk in orphan_lotes.chunks(500) {
            sqlx::query(
                "DELETE FROM stock_movements
                 WHERE item_type = 'produto' AND movement_type = 'entrada'
                   AND document_number = ANY($1)"
            )
            .bind(chunk)
            .execute(&mut *tx)
            .await?;
        }
    }

    let mut seen_lote_prods = std::collections::HashSet::new();
    for l in &lotes_list {
        if !seen_lote_prods.insert((l.lote, l.product_code.clone())) {
            continue;
        }
        let details = format!(
            "Status: {} | Fab: {} | Aut: {} | Unidades: {} | dPesado: {} | dEnvase: {}",
            l.status.as_deref().unwrap_or(""),
            l.fab.as_deref().unwrap_or(""),
            l.aut.as_deref().unwrap_or(""),
            l.unidades.unwrap_or(0.0),
            l.d_pesado.as_deref().unwrap_or(""),
            l.d_envase.as_deref().unwrap_or("")
        );
        mov_batch.push(MovInsert {
            id: format!("lote_{}_{}", l.lote, l.product_code.trim()),
            item_code: l.product_code.clone(),
            item_type: "produto".to_string(),
            movement_type: "entrada".to_string(),
            quantity: l.qty,
            date: l.date_str.clone(),
            document_number: l.lote.to_string(),
            details,
        });
        count_movements += 1;
        if mov_batch.len() >= MOV_BATCH {
            flush_stock_movements(&mut tx, &mut mov_batch).await?;
            if count_movements % 2000 == 0 {
                eprintln!("[ERP Sync]   movimentos (lotes) {count_movements}/{mov_total_est}");
            }
        }
    }

    for v in &vendas_list {
        let doc_str = v
            .nota_fiscal
            .map(|n| n.to_string())
            .unwrap_or_else(|| format!("Pedido: {}", v.venda));
        mov_batch.push(MovInsert {
            id: Uuid::new_v4().to_string(),
            item_code: v.prod_code.clone(),
            item_type: "produto".to_string(),
            movement_type: "saida".to_string(),
            quantity: v.qty,
            date: v.date_str.clone(),
            document_number: doc_str,
            details: v.client_name.clone().unwrap_or_default(),
        });
        count_movements += 1;
        if mov_batch.len() >= MOV_BATCH {
            flush_stock_movements(&mut tx, &mut mov_batch).await?;
            if count_movements % 5000 == 0 {
                eprintln!("[ERP Sync]   movimentos (vendas) {count_movements}/{mov_total_est}");
            }
        }
    }

    flush_stock_movements(&mut tx, &mut mov_batch).await?;

    tx.commit().await?;
    eprintln!("[ERP Sync] Fase movimentações commitada ({count_movements} linhas).");
    let mut tx = pool.begin().await?;

    // Write Purchase Orders + Sales Orders (UNNEST em lote)
    eprintln!(
        "[ERP Sync] Gravando pedidos: PO={} itens_PO={} SO={} itens_SO={}...",
        pedido_cpa1_list.len(),
        pedido_cpa2_list.len(),
        sales_orders_list.len(),
        sales_order_items_list.len()
    );
    let mut count_pos = 0;
    let registros: Vec<i32> = pedido_cpa1_list.iter().map(|p| p.n_registro).collect();
    if !registros.is_empty() {
        sqlx::query(
            "DELETE FROM purchase_order_items WHERE n_pedido_registro = ANY($1)",
        )
        .bind(&registros)
        .execute(&mut *tx)
        .await?;
    }

    {
        let mut po_reg: Vec<i32> = Vec::new();
        let mut po_ped: Vec<i32> = Vec::new();
        let mut po_dp: Vec<Option<String>> = Vec::new();
        let mut po_forn: Vec<Option<i32>> = Vec::new();
        let mut po_nome: Vec<Option<String>> = Vec::new();
        let mut po_user: Vec<Option<String>> = Vec::new();
        let mut po_st: Vec<Option<String>> = Vec::new();
        let mut po_prazo: Vec<Option<String>> = Vec::new();
        let mut po_prev: Vec<Option<String>> = Vec::new();
        let mut po_val: Vec<f64> = Vec::new();
        let mut po_dprev: Vec<Option<String>> = Vec::new();
        let mut po_email: Vec<Option<String>> = Vec::new();
        let mut po_obs: Vec<Option<String>> = Vec::new();
        for po in &pedido_cpa1_list {
            po_reg.push(po.n_registro);
            po_ped.push(po.n_pedido);
            po_dp.push(po.d_pedido.clone());
            po_forn.push(po.n_cod_fornec);
            po_nome.push(po.c_nome_f.clone());
            po_user.push(po.c_usuario.clone());
            po_st.push(po.c_status.clone());
            po_prazo.push(po.c_prazo_pgto.clone());
            po_prev.push(po.c_prev_entrega.clone());
            po_val.push(po.n_valor);
            po_dprev.push(po.d_previsao.clone());
            po_email.push(po.c_email.clone());
            po_obs.push(po.m_observac.clone());
            count_pos += 1;
        }
        const PO_CHUNK: usize = 200;
        for chunk_start in (0..po_reg.len()).step_by(PO_CHUNK) {
            let end = (chunk_start + PO_CHUNK).min(po_reg.len());
            sqlx::query(
                r#"
                INSERT INTO purchase_orders (
                    n_registro, n_pedido, d_pedido, n_cod_fornec, c_nome_f, c_usuario, c_status,
                    c_prazo_pgto, c_prev_entrega, n_valor, d_previsao, c_email, m_observac
                )
                SELECT * FROM UNNEST(
                    $1::int4[], $2::int4[], $3::text[], $4::int4[], $5::text[], $6::text[], $7::text[],
                    $8::text[], $9::text[], $10::float8[], $11::text[], $12::text[], $13::text[]
                )
                ON CONFLICT (n_registro) DO UPDATE SET
                    n_pedido = EXCLUDED.n_pedido,
                    d_pedido = EXCLUDED.d_pedido,
                    n_cod_fornec = EXCLUDED.n_cod_fornec,
                    c_nome_f = EXCLUDED.c_nome_f,
                    c_usuario = EXCLUDED.c_usuario,
                    c_status = EXCLUDED.c_status,
                    c_prazo_pgto = EXCLUDED.c_prazo_pgto,
                    c_prev_entrega = EXCLUDED.c_prev_entrega,
                    n_valor = EXCLUDED.n_valor,
                    d_previsao = EXCLUDED.d_previsao,
                    c_email = EXCLUDED.c_email,
                    m_observac = EXCLUDED.m_observac
                "#,
            )
            .bind(&po_reg[chunk_start..end])
            .bind(&po_ped[chunk_start..end])
            .bind(&po_dp[chunk_start..end])
            .bind(&po_forn[chunk_start..end])
            .bind(&po_nome[chunk_start..end])
            .bind(&po_user[chunk_start..end])
            .bind(&po_st[chunk_start..end])
            .bind(&po_prazo[chunk_start..end])
            .bind(&po_prev[chunk_start..end])
            .bind(&po_val[chunk_start..end])
            .bind(&po_dprev[chunk_start..end])
            .bind(&po_email[chunk_start..end])
            .bind(&po_obs[chunk_start..end])
            .execute(&mut *tx)
            .await?;
        }
        eprintln!("[ERP Sync]   purchase_orders {count_pos}");
    }

    // Fecha no Hub pedidos que ainda estão "abertos" mas não vieram do ERP como abertos
    // (cabeçalhos apagados / fantasma de join antigo nPedido+dPedido).
    let open_regs: Vec<i32> = pedido_cpa1_list
        .iter()
        .filter(|p| p.c_status.as_deref() != Some("T"))
        .map(|p| p.n_registro)
        .collect();
    if !open_regs.is_empty() {
        let closed = sqlx::query(
            r#"
            UPDATE purchase_orders
            SET c_status = 'T'
            WHERE COALESCE(c_status, '') <> 'T'
              AND NOT (n_registro = ANY($1))
            "#,
        )
        .bind(&open_regs)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if closed > 0 {
            eprintln!(
                "[ERP Sync]   purchase_orders: {closed} cabeçalhos órfãos marcados como T"
            );
        }
    }

    {
        let mut poi_preg: Vec<i32> = Vec::new();
        let mut poi_ped: Vec<i32> = Vec::new();
        let mut poi_ref: Vec<String> = Vec::new();
        let mut poi_qty: Vec<f64> = Vec::new();
        let mut poi_preco: Vec<f64> = Vec::new();
        let mut poi_cheg: Vec<f64> = Vec::new();
        let mut poi_desc: Vec<Option<String>> = Vec::new();
        let mut poi_un: Vec<Option<String>> = Vec::new();
        let mut poi_tot: Vec<f64> = Vec::new();
        let mut poi_reg: Vec<i32> = Vec::new();
        let mut poi_ccheg: Vec<Option<String>> = Vec::new();
        for poi in &pedido_cpa2_list {
            poi_preg.push(poi.n_pedido_registro);
            poi_ped.push(poi.n_pedido);
            poi_ref.push(poi.c_referencia.clone());
            poi_qty.push(poi.n_qtde);
            poi_preco.push(poi.n_preco);
            poi_cheg.push(poi.n_chegou);
            poi_desc.push(poi.c_descricao.clone());
            poi_un.push(poi.c_unidade.clone());
            poi_tot.push(poi.n_valor_total);
            poi_reg.push(poi.n_registro);
            poi_ccheg.push(poi.c_chegada.clone());
        }
        const POI_CHUNK: usize = 500;
        for chunk_start in (0..poi_preg.len()).step_by(POI_CHUNK) {
            let end = (chunk_start + POI_CHUNK).min(poi_preg.len());
            sqlx::query(
                r#"
                INSERT INTO purchase_order_items (
                    n_pedido_registro, n_pedido, c_referencia, n_qtde, n_preco, n_chegou,
                    c_descricao, c_unidade, n_valor_total, n_registro, c_chegada
                )
                SELECT * FROM UNNEST(
                    $1::int4[], $2::int4[], $3::text[], $4::float8[], $5::float8[], $6::float8[],
                    $7::text[], $8::text[], $9::float8[], $10::int4[], $11::text[]
                )
                "#,
            )
            .bind(&poi_preg[chunk_start..end])
            .bind(&poi_ped[chunk_start..end])
            .bind(&poi_ref[chunk_start..end])
            .bind(&poi_qty[chunk_start..end])
            .bind(&poi_preco[chunk_start..end])
            .bind(&poi_cheg[chunk_start..end])
            .bind(&poi_desc[chunk_start..end])
            .bind(&poi_un[chunk_start..end])
            .bind(&poi_tot[chunk_start..end])
            .bind(&poi_reg[chunk_start..end])
            .bind(&poi_ccheg[chunk_start..end])
            .execute(&mut *tx)
            .await?;
            if end % 1000 == 0 || end == poi_preg.len() {
                eprintln!("[ERP Sync]   purchase_order_items {end}/{}", poi_preg.len());
            }
        }
    }

    let mut count_sales_orders = 0;
    if !sales_orders_list.is_empty() {
        let so_ped: Vec<i32> = sales_orders_list.iter().map(|s| s.n_pedido).collect();
        let so_dp: Vec<String> = sales_orders_list.iter().map(|s| s.d_pedido.clone()).collect();
        sqlx::query(
            r#"
            DELETE FROM sales_order_items soi
            USING UNNEST($1::int4[], $2::text[]) AS v(n_pedido, d_pedido)
            WHERE soi.n_pedido = v.n_pedido AND soi.d_pedido = v.d_pedido
            "#,
        )
        .bind(&so_ped)
        .bind(&so_dp)
        .execute(&mut *tx)
        .await?;
    }

    {
        let mut so_ped: Vec<i32> = Vec::new();
        let mut so_dp: Vec<String> = Vec::new();
        let mut so_cod: Vec<Option<i32>> = Vec::new();
        let mut so_nome: Vec<Option<String>> = Vec::new();
        let mut so_val: Vec<f64> = Vec::new();
        let mut so_st: Vec<Option<String>> = Vec::new();
        let mut so_nf: Vec<i32> = Vec::new();
        let mut so_prev: Vec<Option<String>> = Vec::new();
        let mut so_ent: Vec<Option<String>> = Vec::new();
        let mut so_obs: Vec<Option<String>> = Vec::new();
        for so in &sales_orders_list {
            so_ped.push(so.n_pedido);
            so_dp.push(so.d_pedido.clone());
            so_cod.push(so.n_codigo);
            so_nome.push(so.c_nome.clone());
            so_val.push(so.n_valor_tot);
            so_st.push(so.c_status.clone());
            so_nf.push(so.n_nota_fiscal);
            so_prev.push(so.d_previsao.clone());
            so_ent.push(so.d_entrega.clone());
            so_obs.push(so.m_observac.clone());
            count_sales_orders += 1;
        }
        const SO_CHUNK: usize = 400;
        for chunk_start in (0..so_ped.len()).step_by(SO_CHUNK) {
            let end = (chunk_start + SO_CHUNK).min(so_ped.len());
            sqlx::query(
                r#"
                INSERT INTO sales_orders (
                    n_pedido, d_pedido, n_codigo, c_nome, n_valor_tot, c_status,
                    n_nota_fiscal, d_previsao, d_entrega, m_observac
                )
                SELECT * FROM UNNEST(
                    $1::int4[], $2::text[], $3::int4[], $4::text[], $5::float8[], $6::text[],
                    $7::int4[], $8::text[], $9::text[], $10::text[]
                )
                ON CONFLICT (n_pedido, d_pedido) DO UPDATE SET
                    n_codigo = EXCLUDED.n_codigo,
                    c_nome = EXCLUDED.c_nome,
                    n_valor_tot = EXCLUDED.n_valor_tot,
                    c_status = EXCLUDED.c_status,
                    n_nota_fiscal = EXCLUDED.n_nota_fiscal,
                    d_previsao = EXCLUDED.d_previsao,
                    d_entrega = EXCLUDED.d_entrega,
                    m_observac = EXCLUDED.m_observac
                "#,
            )
            .bind(&so_ped[chunk_start..end])
            .bind(&so_dp[chunk_start..end])
            .bind(&so_cod[chunk_start..end])
            .bind(&so_nome[chunk_start..end])
            .bind(&so_val[chunk_start..end])
            .bind(&so_st[chunk_start..end])
            .bind(&so_nf[chunk_start..end])
            .bind(&so_prev[chunk_start..end])
            .bind(&so_ent[chunk_start..end])
            .bind(&so_obs[chunk_start..end])
            .execute(&mut *tx)
            .await?;
            if end % 800 == 0 || end == so_ped.len() {
                eprintln!("[ERP Sync]   sales_orders {end}/{}", so_ped.len());
            }
        }
    }

    if !orphan_so_keys.is_empty() {
        let orphan_ped: Vec<i32> = orphan_so_keys.iter().map(|(n, _)| *n).collect();
        let orphan_dp: Vec<String> = orphan_so_keys.iter().map(|(_, d)| d.clone()).collect();
        let closed = sqlx::query(
            r#"
            UPDATE sales_orders so
            SET c_status = 'CA'
            FROM UNNEST($1::int4[], $2::text[]) AS v(n_pedido, d_ymd)
            WHERE so.n_pedido = v.n_pedido
              AND so.d_pedido::date = v.d_ymd::date
              AND TRIM(COALESCE(so.c_status, '')) NOT IN ('FT', 'CA')
            "#,
        )
        .bind(&orphan_ped)
        .bind(&orphan_dp)
        .execute(&mut *tx)
        .await?;
        eprintln!(
            "[ERP Sync] Órfãos M/N marcados CA: {} (chaves={})",
            closed.rows_affected(),
            orphan_so_keys.len()
        );
    }

    {
        let mut soi_ped: Vec<i32> = Vec::new();
        let mut soi_dp: Vec<String> = Vec::new();
        let mut soi_reg: Vec<Option<i32>> = Vec::new();
        let mut soi_cod: Vec<String> = Vec::new();
        let mut soi_qty: Vec<i32> = Vec::new();
        let mut soi_fat: Vec<i32> = Vec::new();
        let mut soi_preco: Vec<Option<f64>> = Vec::new();
        let mut soi_lote: Vec<Option<String>> = Vec::new();
        for soi in &sales_order_items_list {
            soi_ped.push(soi.n_pedido);
            soi_dp.push(soi.d_pedido.clone());
            soi_reg.push(soi.n_registro);
            soi_cod.push(soi.c_cod_prod.clone());
            soi_qty.push(soi.n_qtde);
            soi_fat.push(soi.n_qtde_fat);
            soi_preco.push(Some(soi.n_preco));
            soi_lote.push(soi.c_lote.clone());
        }
        const SOI_CHUNK: usize = 500;
        for chunk_start in (0..soi_ped.len()).step_by(SOI_CHUNK) {
            let end = (chunk_start + SOI_CHUNK).min(soi_ped.len());
            sqlx::query(
                r#"
                INSERT INTO sales_order_items (
                    n_pedido, d_pedido, n_registro, c_cod_prod, n_qtde, n_qtde_fat, n_preco, c_lote
                )
                SELECT * FROM UNNEST(
                    $1::int4[], $2::text[], $3::int4[], $4::text[], $5::int4[], $6::int4[],
                    $7::float8[], $8::text[]
                )
                "#,
            )
            .bind(&soi_ped[chunk_start..end])
            .bind(&soi_dp[chunk_start..end])
            .bind(&soi_reg[chunk_start..end])
            .bind(&soi_cod[chunk_start..end])
            .bind(&soi_qty[chunk_start..end])
            .bind(&soi_fat[chunk_start..end])
            .bind(&soi_preco[chunk_start..end])
            .bind(&soi_lote[chunk_start..end])
            .execute(&mut *tx)
            .await?;
            if end % 2000 == 0 || end == soi_ped.len() {
                eprintln!("[ERP Sync]   sales_order_items {end}/{}", soi_ped.len());
            }
        }
    }

    tx.commit().await?;
    eprintln!(
        "[ERP Sync] Fase pedidos commitada (PO={count_pos} SO={count_sales_orders})."
    );

    // Reaplica regras de subcategoria de todos os módulos (main/coloração/apoio).
    crate::modules::compras::planejamento::commands::reapply_all_compras_auto_subcategories(pool)
        .await;

    let now_iso = Utc::now().to_rfc3339();
    let today = Local::now().date_naive().format("%Y-%m-%d").to_string();
    let mut next_wm = wm;
    next_wm.version = 1;
    next_wm.cursor = Some(today.clone());
    match mode {
        SyncMode::Full => next_wm.last_full_at = Some(now_iso),
        SyncMode::Incremental => next_wm.last_incremental_at = Some(now_iso),
    }
    if let Err(e) = save_watermark(pool, &next_wm).await {
        eprintln!("[ERP Sync] Aviso: falha ao gravar watermark: {e}");
    } else {
        eprintln!(
            "[ERP Sync] Watermark atualizado cursor={} mode={}",
            today,
            mode.as_str()
        );
    }

    // Sempre conferir tela ERP (nQtdeEstoque) após gravar — insumos + materiais + produtos.
    let (stock_verified, stock_repaired) = match verify_and_repair_all_stocks(pool, None).await {
        Ok(vr) => {
            eprintln!(
                "[ERP Sync] Pós-sync estoque: checked={} repaired={} (I={} M={} P={})",
                vr.checked,
                vr.repaired,
                vr.by_source.insumos,
                vr.by_source.materiais,
                vr.by_source.produtos
            );
            (vr.checked, vr.repaired)
        }
        Err(e) => {
            eprintln!("[ERP Sync] Verificação de estoque falhou após sync: {e}");
            (0, 0)
        }
    };

    Ok(SyncResult {
        products: count_prod,
        suppliers: count_fornec,
        items: count_items,
        snapshots: count_snapshots,
        invoices: count_invoices,
        consumption: count_consumption,
        formulations: count_formulations,
        kit_composicao: count_kit_composicao,
        movements: count_movements,
        purchase_orders: count_pos,
        sales_orders: count_sales_orders,
        mode: mode.as_str(),
        since,
        stock_verified,
        stock_repaired,
    })
}

impl ProductRow {
    fn media_lev(&self) -> f64 {
        let total: i32 = self.m_sales.iter().sum();
        (total as f64) / 12.0
    }
}

// ==========================================
// 3. ERP ROW COUNT SUMMARY (replaces SQLite dump)
// ==========================================
pub async fn create_database_dump(pool: &PgPool) -> anyhow::Result<crate::models::DbDumpResult> {
    let start_time = std::time::Instant::now();
    let mut client = connect_sql_server(pool).await?;

    let table_queries: &[(&str, &str)] = &[
        ("Insumos", "SELECT COUNT(*) FROM Insumos WITH (NOLOCK)"),
        ("Produtos", "SELECT COUNT(*) FROM Produtos WITH (NOLOCK)"),
        ("Materiais", "SELECT COUNT(*) FROM Materiais WITH (NOLOCK)"),
        ("Composicao", "SELECT COUNT(*) FROM Composicao WITH (NOLOCK)"),
        ("Fornecedores", "SELECT COUNT(*) FROM Fornecedores WITH (NOLOCK)"),
        ("Clientes", "SELECT COUNT(*) FROM Clientes WITH (NOLOCK)"),
        ("Lotes", "SELECT COUNT(*) FROM Lotes WITH (NOLOCK)"),
        ("Lotes_Baixas", "SELECT COUNT(*) FROM Lotes_Baixas WITH (NOLOCK)"),
        ("COMPRAS1", "SELECT COUNT(*) FROM COMPRAS1 WITH (NOLOCK)"),
        ("COMPRAS2", "SELECT COUNT(*) FROM COMPRAS2 WITH (NOLOCK)"),
        ("VENDAS1", "SELECT COUNT(*) FROM VENDAS1 WITH (NOLOCK)"),
        ("VENDAS2", "SELECT COUNT(*) FROM VENDAS2 WITH (NOLOCK)"),
    ];

    let mut table_row_counts = HashMap::new();
    let mut tables_copied = Vec::new();
    let mut total_rows: u64 = 0;

    for (name, query) in table_queries {
        let stream = client.query(*query, &[]).await?;
        let rows = stream.into_first_result().await?;
        let count: i32 = rows.first().and_then(|r| r.get(0)).unwrap_or(0);
        table_row_counts.insert(name.to_string(), count as i64);
        tables_copied.push(format!("{}: {}", name, count));
        total_rows += count.max(0) as u64;
    }

    Ok(crate::models::DbDumpResult {
        filename: "erp_row_summary".to_string(),
        size_bytes: total_rows,
        tables_copied,
        elapsed_ms: start_time.elapsed().as_millis() as u64,
        table_row_counts,
    })
}

/// Posição de estoque lida ao vivo do ERP (Insumos → Materiais → Produtos).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErpStockLive {
    pub source: String,
    pub code: String,
    /// Campo da tela ERP usado pelo Hub (insumos: `nQtdeEstoque`).
    pub stock_qty: f64,
    pub reserved_qty: f64,
    pub in_production: f64,
    pub in_orders: f64,
    /// Só insumos: `nQtdeEstoque` (igual a `stock_qty` na regra atual).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stock_qty_raw: Option<f64>,
    /// Só insumos: `nQtdeEstoqueA` (diagnóstico; pode divergir da tela).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stock_qty_a: Option<f64>,
}

pub async fn fetch_erp_stock_live(pool: &PgPool, code: &str) -> anyhow::Result<Option<ErpStockLive>> {
    let code = code.trim();
    if code.is_empty() {
        return Ok(None);
    }
    let mut client = connect_sql_server(pool).await?;

    // Query limpa (sem NOLOCK); ORDER BY estabiliza TOP 1 se houver duplicata.
    // Lê estoque da tela do ERP (nQtdeEstoque).
    let query_insumo = "
SELECT TOP 1
    CAST(nQtdeEstoque AS FLOAT),
    CAST(nqtdeReserva AS FLOAT),
    CAST(nQtdeProducao AS FLOAT),
    CAST(nQtdePedidos AS FLOAT),
    CAST(nQtdeEstoque AS FLOAT),
    CAST(nQtdeEstoqueA AS FLOAT)
FROM Insumos
WHERE LTRIM(RTRIM(cReferencia)) = @P1
ORDER BY cReferencia
";
    let stream = client.query(query_insumo, &[&code]).await?;
    let rows = stream.into_first_result().await?;
    if let Some(row) = rows.first() {
        return Ok(Some(ErpStockLive {
            source: "Insumos".into(),
            code: code.to_string(),
            stock_qty: mssql_f64(row, 0),
            reserved_qty: mssql_f64(row, 1),
            in_production: mssql_f64(row, 2),
            in_orders: mssql_f64(row, 3),
            stock_qty_raw: Some(mssql_f64(row, 4)),
            stock_qty_a: Some(mssql_f64(row, 5)),
        }));
    }

    let query_mat = "
SELECT TOP 1
    CAST(nQtdeEstoque AS FLOAT),
    CAST(0.0 AS FLOAT),
    CAST(nQtdeProducao AS FLOAT),
    CAST(nQtdePedidos AS FLOAT)
FROM Materiais
WHERE LTRIM(RTRIM(cReferencia)) = @P1
ORDER BY cReferencia
";
    let stream = client.query(query_mat, &[&code]).await?;
    let rows = stream.into_first_result().await?;
    if let Some(row) = rows.first() {
        return Ok(Some(ErpStockLive {
            source: "Materiais".into(),
            code: code.to_string(),
            stock_qty: mssql_f64(row, 0),
            reserved_qty: 0.0,
            in_production: mssql_f64(row, 2),
            in_orders: mssql_f64(row, 3),
            stock_qty_raw: None,
            stock_qty_a: None,
        }));
    }

    let query_prod = "
SELECT TOP 1
    CAST(nQtdeEstoque AS FLOAT),
    CAST(0.0 AS FLOAT),
    CAST(nQtdeProducao AS FLOAT),
    CAST(nPedidos AS FLOAT)
FROM Produtos
WHERE LTRIM(RTRIM(cCodProd)) = @P1
ORDER BY cCodProd
";
    let stream = client.query(query_prod, &[&code]).await?;
    let rows = stream.into_first_result().await?;
    if let Some(row) = rows.first() {
        return Ok(Some(ErpStockLive {
            source: "Produtos".into(),
            code: code.to_string(),
            stock_qty: mssql_f64(row, 0),
            reserved_qty: 0.0,
            in_production: mssql_f64(row, 2),
            in_orders: mssql_f64(row, 3),
            stock_qty_raw: None,
            stock_qty_a: None,
        }));
    }

    Ok(None)
}

/// Substitui todos os snapshots do código pelo valor vivo do ERP (insumos/materiais).
async fn replace_item_stock_snapshot(
    pool: &PgPool,
    code: &str,
    stock_qty: f64,
    reserved_qty: f64,
    in_production: f64,
    in_orders: f64,
    source_label: &str,
) -> anyhow::Result<()> {
    let code = code.trim();
    sqlx::query("DELETE FROM stock_snapshots WHERE TRIM(item_code) = $1")
        .bind(code)
        .execute(pool)
        .await?;

    let import_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO stock_imports (id, filename, source, item_count) VALUES ($1, $2, $3, 1)",
    )
    .bind(&import_id)
    .bind(format!("{source_label}_{code}"))
    .bind(source_label)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO stock_snapshots (
            id, import_id, item_code, stock_qty, reserved_qty, in_production, in_orders, snapshot_date
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&import_id)
    .bind(code)
    .bind(stock_qty)
    .bind(reserved_qty)
    .bind(in_production)
    .bind(in_orders)
    .execute(pool)
    .await?;
    Ok(())
}

/// Atualiza o snapshot mais recente do código com valores lidos do ERP (D1/D2/A pontual).
pub async fn refresh_stock_snapshot_from_erp(
    pool: &PgPool,
    code: &str,
) -> anyhow::Result<ErpStockLive> {
    let live = fetch_erp_stock_live(pool, code)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Código {code} não encontrado no ERP"))?;

    if live.source == "Produtos" {
        sqlx::query(
            r#"
            INSERT INTO estoque_atual (codigo, estoque, producao, pedidos_aberto)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (codigo) DO UPDATE SET
                estoque = EXCLUDED.estoque,
                producao = EXCLUDED.producao,
                pedidos_aberto = EXCLUDED.pedidos_aberto
            "#,
        )
        .bind(&live.code)
        .bind(live.stock_qty)
        .bind(live.in_production)
        .bind(live.in_orders)
        .execute(pool)
        .await?;
        return Ok(live);
    }

    replace_item_stock_snapshot(
        pool,
        &live.code,
        live.stock_qty,
        live.reserved_qty,
        live.in_production,
        live.in_orders,
        "audit_refresh",
    )
    .await?;

    Ok(live)
}

/// ε unificado Hub × ERP (stock / reserva / produção / pedidos).
pub const STOCK_VERIFY_EPS: f64 = 0.01;

/// Query D1 limpa (sem NOLOCK) — reconsulta final do sync e verificação pós-sync.
/// Lê estoque da tela do ERP (nQtdeEstoque).
const D1_INSUMOS_STOCKS_SQL_CLEAN: &str = r#"
SELECT 
    cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    CAST(nQtdeEstoque AS FLOAT) as nQtdeEstoque,
    CAST(nqtdeReserva AS FLOAT) as nqtdeReserva,
    CAST(nQtdeProducao AS FLOAT) as nQtdeProducao,
    CAST(nQtdePedidos AS FLOAT) as nQtdePedidos
FROM Insumos
WHERE cReferencia IS NOT NULL AND cReferencia <> '' AND (cInativo = 'N' OR cInativo IS NULL)
"#;

const D2_MATERIAIS_STOCKS_SQL_CLEAN: &str = r#"
SELECT 
    cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    CAST(nQtdeEstoque AS FLOAT) as nQtdeEstoque,
    CAST(0.0 AS FLOAT) as nqtdeReserva,
    CAST(nQtdeProducao AS FLOAT) as nQtdeProducao,
    CAST(nQtdePedidos AS FLOAT) as nQtdePedidos
FROM Materiais
WHERE cReferencia IS NOT NULL AND cReferencia <> '' AND (cInativo = 'N' OR cInativo IS NULL)
"#;

const PRODUTOS_STOCKS_SQL_CLEAN: &str = r#"
SELECT 
    RTRIM(cCodProd) COLLATE Latin1_General_CI_AS as cCodProd,
    CAST(nQtdeEstoque AS FLOAT) as nQtdeEstoque,
    CAST(nQtdeProducao AS FLOAT) as nQtdeProducao,
    CAST(nPedidos AS FLOAT) as nPedidos
FROM Produtos
WHERE cCodProd IS NOT NULL AND cCodProd <> '' AND (cInativo = 'N' OR cInativo IS NULL)
"#;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockVerifySample {
    pub code: String,
    pub hub: f64,
    pub erp: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VerifyRepairBySource {
    pub insumos: usize,
    pub materiais: usize,
    pub produtos: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyRepairResult {
    pub checked: usize,
    pub repaired: usize,
    pub samples: Vec<StockVerifySample>,
    pub by_source: VerifyRepairBySource,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockVerifyProgressEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub processed: usize,
    pub total: usize,
    pub repaired: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
}

fn stock_fields_diverge(
    hub: Option<(f64, f64, f64, f64)>,
    erp_stock: f64,
    erp_res: f64,
    erp_prod: f64,
    erp_ord: f64,
) -> bool {
    match hub {
        None => true,
        Some((h_stock, h_res, h_prod, h_ord)) => {
            (h_stock - erp_stock).abs() > STOCK_VERIFY_EPS
                || (h_res - erp_res).abs() > STOCK_VERIFY_EPS
                || (h_prod - erp_prod).abs() > STOCK_VERIFY_EPS
                || (h_ord - erp_ord).abs() > STOCK_VERIFY_EPS
        }
    }
}

fn collect_stock_rows(
    rows: Vec<tiberius::Row>,
) -> std::collections::HashMap<String, StockRow> {
    let mut map = std::collections::HashMap::with_capacity(rows.len());
    for row in rows {
        let code: &str = row.get(0).unwrap_or("");
        let code = code.trim();
        if code.is_empty() {
            continue;
        }
        map.insert(
            code.to_string(),
            StockRow {
                code: code.to_string(),
                stock_qty: mssql_f64(&row, 1),
                reserved_qty: mssql_f64(&row, 2),
                in_prod: mssql_f64(&row, 3),
                in_orders: mssql_f64(&row, 4),
            },
        );
    }
    map
}

/// Alias compatível — mesma lógica completa (I+M+P).
pub async fn verify_and_repair_insumo_stocks(pool: &PgPool) -> anyhow::Result<VerifyRepairResult> {
    verify_and_repair_all_stocks(pool, None).await
}

/// Re-lê Insumos + Materiais + Produtos no ERP e corrige Hub divergente.
/// `progress_tx` opcional: eventos NDJSON (`progress` / caller envia `done`).
pub async fn verify_and_repair_all_stocks(
    pool: &PgPool,
    progress_tx: Option<tokio::sync::mpsc::Sender<StockVerifyProgressEvent>>,
) -> anyhow::Result<VerifyRepairResult> {
    async fn emit(
        tx: &Option<tokio::sync::mpsc::Sender<StockVerifyProgressEvent>>,
        ev: StockVerifyProgressEvent,
    ) {
        if let Some(tx) = tx {
            let _ = tx.send(ev).await;
        }
    }

    let mut client = connect_sql_server(pool).await?;

    let stream = client.query(D1_INSUMOS_STOCKS_SQL_CLEAN, &[]).await?;
    let insumos_map = collect_stock_rows(stream.into_first_result().await?);

    let stream = client.query(D2_MATERIAIS_STOCKS_SQL_CLEAN, &[]).await?;
    let mut materiais_map = collect_stock_rows(stream.into_first_result().await?);
    // Insumos ganha de Materiais no mesmo código (regra do sync D1/D2).
    materiais_map.retain(|code, _| !insumos_map.contains_key(code));

    let stream = client.query(PRODUTOS_STOCKS_SQL_CLEAN, &[]).await?;
    let prod_rows = stream.into_first_result().await?;
    let mut produtos: Vec<(String, f64, f64, f64)> = Vec::with_capacity(prod_rows.len());
    let mut prod_seen = std::collections::HashSet::new();
    for row in prod_rows {
        let code: &str = row.get(0).unwrap_or("");
        let code = code.trim();
        if code.is_empty() || !prod_seen.insert(code.to_string()) {
            continue;
        }
        produtos.push((
            code.to_string(),
            mssql_f64(&row, 1),
            mssql_f64(&row, 2),
            mssql_f64(&row, 3),
        ));
    }

    let total = insumos_map.len() + materiais_map.len() + produtos.len();
    let mut processed = 0usize;
    let mut repaired = 0usize;
    let mut samples: Vec<StockVerifySample> = Vec::new();
    let mut by_source = VerifyRepairBySource::default();

    emit(
        &progress_tx,
        StockVerifyProgressEvent {
            event_type: "progress".into(),
            processed: 0,
            total,
            repaired: 0,
            current_code: None,
            phase: Some("insumos".into()),
        },
    )
    .await;

    let hub_rows = sqlx::query(
        r#"
        SELECT DISTINCT ON (TRIM(item_code))
            TRIM(item_code), stock_qty, reserved_qty, in_production, in_orders
        FROM stock_snapshots
        ORDER BY TRIM(item_code), snapshot_date DESC NULLS LAST, id DESC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut hub_snap: std::collections::HashMap<String, (f64, f64, f64, f64)> =
        std::collections::HashMap::with_capacity(hub_rows.len());
    for r in hub_rows {
        let code: String = r.get(0);
        hub_snap.insert(
            code.trim().to_string(),
            (
                r.get::<f64, _>(1),
                r.get::<f64, _>(2),
                r.get::<f64, _>(3),
                r.get::<f64, _>(4),
            ),
        );
    }

    let mut canonical_items: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT TRIM(code), code FROM items WHERE code IS NOT NULL AND TRIM(code) <> ''",
    )
    .fetch_all(pool)
    .await
    {
        for r in rows {
            let trimmed: String = r.get(0);
            let raw: String = r.get(1);
            canonical_items
                .entry(trimmed.trim().to_string())
                .or_insert(raw.trim().to_string());
        }
    }

    let mut canonical_prod: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT TRIM(codigo), codigo FROM produtos WHERE codigo IS NOT NULL AND TRIM(codigo) <> ''",
    )
    .fetch_all(pool)
    .await
    {
        for r in rows {
            let trimmed: String = r.get(0);
            let raw: String = r.get(1);
            canonical_prod
                .entry(trimmed.trim().to_string())
                .or_insert(raw.trim().to_string());
        }
    }

    let hub_prod_rows = sqlx::query(
        "SELECT TRIM(codigo), estoque, producao, pedidos_aberto FROM estoque_atual",
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    let mut hub_prod: std::collections::HashMap<String, (f64, f64, f64)> =
        std::collections::HashMap::with_capacity(hub_prod_rows.len());
    for r in hub_prod_rows {
        let code: String = r.get(0);
        hub_prod.insert(
            code.trim().to_string(),
            (r.get::<f64, _>(1), r.get::<f64, _>(2), r.get::<f64, _>(3)),
        );
    }

    let progress_every = if total < 200 { 1 } else { 25 };

    // --- Insumos ---
    for erp in insumos_map.values() {
        processed += 1;
        let hub = hub_snap.get(&erp.code).copied();
        let needs = stock_fields_diverge(
            hub,
            erp.stock_qty,
            erp.reserved_qty,
            erp.in_prod,
            erp.in_orders,
        );
        if needs {
            let hub_stock = hub.map(|(s, _, _, _)| s).unwrap_or(0.0);
            let write_code = canonical_items
                .get(&erp.code)
                .cloned()
                .unwrap_or_else(|| erp.code.clone());
            replace_item_stock_snapshot(
                pool,
                &write_code,
                erp.stock_qty,
                erp.reserved_qty,
                erp.in_prod,
                erp.in_orders,
                "stock_verify",
            )
            .await?;
            repaired += 1;
            by_source.insumos += 1;
            if samples.len() < 200 {
                samples.push(StockVerifySample {
                    code: write_code,
                    hub: hub_stock,
                    erp: erp.stock_qty,
                    source: Some("insumos".into()),
                });
            }
        }
        if processed % progress_every == 0 || processed == total {
            emit(
                &progress_tx,
                StockVerifyProgressEvent {
                    event_type: "progress".into(),
                    processed,
                    total,
                    repaired,
                    current_code: Some(erp.code.clone()),
                    phase: Some("insumos".into()),
                },
            )
            .await;
        }
    }

    // --- Materiais (só códigos sem insumo) ---
    emit(
        &progress_tx,
        StockVerifyProgressEvent {
            event_type: "progress".into(),
            processed,
            total,
            repaired,
            current_code: None,
            phase: Some("materiais".into()),
        },
    )
    .await;

    for erp in materiais_map.values() {
        processed += 1;
        let hub = hub_snap.get(&erp.code).copied();
        let needs = stock_fields_diverge(
            hub,
            erp.stock_qty,
            erp.reserved_qty,
            erp.in_prod,
            erp.in_orders,
        );
        if needs {
            let hub_stock = hub.map(|(s, _, _, _)| s).unwrap_or(0.0);
            let write_code = canonical_items
                .get(&erp.code)
                .cloned()
                .unwrap_or_else(|| erp.code.clone());
            replace_item_stock_snapshot(
                pool,
                &write_code,
                erp.stock_qty,
                erp.reserved_qty,
                erp.in_prod,
                erp.in_orders,
                "stock_verify",
            )
            .await?;
            repaired += 1;
            by_source.materiais += 1;
            if samples.len() < 200 {
                samples.push(StockVerifySample {
                    code: write_code,
                    hub: hub_stock,
                    erp: erp.stock_qty,
                    source: Some("materiais".into()),
                });
            }
        }
        if processed % progress_every == 0 || processed == total {
            emit(
                &progress_tx,
                StockVerifyProgressEvent {
                    event_type: "progress".into(),
                    processed,
                    total,
                    repaired,
                    current_code: Some(erp.code.clone()),
                    phase: Some("materiais".into()),
                },
            )
            .await;
        }
    }

    // --- Produtos → estoque_atual ---
    emit(
        &progress_tx,
        StockVerifyProgressEvent {
            event_type: "progress".into(),
            processed,
            total,
            repaired,
            current_code: None,
            phase: Some("produtos".into()),
        },
    )
    .await;

    for (code, stock, prod, ped) in &produtos {
        processed += 1;
        let hub = hub_prod.get(code).copied();
        let needs = match hub {
            None => true,
            Some((h_s, h_p, h_ped)) => {
                (h_s - stock).abs() > STOCK_VERIFY_EPS
                    || (h_p - prod).abs() > STOCK_VERIFY_EPS
                    || (h_ped - ped).abs() > STOCK_VERIFY_EPS
            }
        };
        if needs {
            let hub_stock = hub.map(|(s, _, _)| s).unwrap_or(0.0);
            let write_code = canonical_prod
                .get(code)
                .cloned()
                .unwrap_or_else(|| code.clone());
            let res = sqlx::query(
                r#"
                INSERT INTO estoque_atual (codigo, estoque, producao, pedidos_aberto)
                SELECT p.codigo, $2, $3, $4
                FROM produtos p
                WHERE p.codigo = $1 OR TRIM(p.codigo) = TRIM($1)
                ON CONFLICT (codigo) DO UPDATE SET
                    estoque = EXCLUDED.estoque,
                    producao = EXCLUDED.producao,
                    pedidos_aberto = EXCLUDED.pedidos_aberto
                "#,
            )
            .bind(&write_code)
            .bind(stock)
            .bind(prod)
            .bind(ped)
            .execute(pool)
            .await?;
            if res.rows_affected() > 0 {
                repaired += 1;
                by_source.produtos += 1;
                if samples.len() < 200 {
                    samples.push(StockVerifySample {
                        code: write_code,
                        hub: hub_stock,
                        erp: *stock,
                        source: Some("produtos".into()),
                    });
                }
            }
        }
        if processed % progress_every == 0 || processed == total {
            emit(
                &progress_tx,
                StockVerifyProgressEvent {
                    event_type: "progress".into(),
                    processed,
                    total,
                    repaired,
                    current_code: Some(code.clone()),
                    phase: Some("produtos".into()),
                },
            )
            .await;
        }
    }

    eprintln!(
        "[ERP Sync] Verificação estoque I+M+P: checked={total} repaired={repaired} (I={} M={} P={})",
        by_source.insumos, by_source.materiais, by_source.produtos
    );

    Ok(VerifyRepairResult {
        checked: total,
        repaired,
        samples,
        by_source,
    })
}

/// Regrava todos os snapshots de insumos a partir de nQtdeEstoque (D1).
pub async fn resync_all_insumo_snapshots_from_erp(pool: &PgPool) -> anyhow::Result<usize> {
    let mut client = connect_sql_server(pool).await?;
    let query = "
SELECT 
    cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    CAST(nQtdeEstoque AS FLOAT) as nQtdeEstoque,
    CAST(nqtdeReserva AS FLOAT) as nqtdeReserva,
    CAST(nQtdeProducao AS FLOAT) as nQtdeProducao,
    CAST(nQtdePedidos AS FLOAT) as nQtdePedidos
FROM Insumos
WHERE cReferencia IS NOT NULL AND cReferencia <> '' AND (cInativo = 'N' OR cInativo IS NULL);
";
    let stream = client.query(query, &[]).await?;
    let rows = stream.into_first_result().await?;
    let mut list = Vec::new();
    for row in rows {
        let code: &str = row.get(0).unwrap_or("");
        if code.is_empty() {
            continue;
        }
        list.push(StockRow {
            code: code.trim().to_string(),
            stock_qty: mssql_f64(&row, 1),
            reserved_qty: mssql_f64(&row, 2),
            in_prod: mssql_f64(&row, 3),
            in_orders: mssql_f64(&row, 4),
        });
    }

    let import_id = Uuid::new_v4().to_string();
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO stock_imports (id, filename, source, item_count) VALUES ($1, $2, $3, $4)",
    )
    .bind(&import_id)
    .bind("D1 nQtdeEstoqueA resync")
    .bind("ERP")
    .bind(list.len() as i32)
    .execute(&mut *tx)
    .await?;

    let codes: Vec<String> = list.iter().map(|s| s.code.clone()).collect();
    sqlx::query("DELETE FROM stock_snapshots WHERE TRIM(item_code) = ANY($1)")
        .bind(&codes)
        .execute(&mut *tx)
        .await?;

    const CHUNK: usize = 400;
    let mut ids = Vec::new();
    let mut imports = Vec::new();
    let mut snap_codes = Vec::new();
    let mut stocks = Vec::new();
    let mut reserved = Vec::new();
    let mut prods = Vec::new();
    let mut orders = Vec::new();
    for stk in &list {
        ids.push(Uuid::new_v4().to_string());
        imports.push(import_id.clone());
        snap_codes.push(stk.code.clone());
        stocks.push(stk.stock_qty);
        reserved.push(stk.reserved_qty);
        prods.push(stk.in_prod);
        orders.push(stk.in_orders);
    }
    for start in (0..ids.len()).step_by(CHUNK) {
        let end = (start + CHUNK).min(ids.len());
        sqlx::query(
            r#"
            INSERT INTO stock_snapshots (id, import_id, item_code, stock_qty, reserved_qty, in_production, in_orders)
            SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::float8[], $5::float8[], $6::float8[], $7::float8[])
            "#,
        )
        .bind(&ids[start..end])
        .bind(&imports[start..end])
        .bind(&snap_codes[start..end])
        .bind(&stocks[start..end])
        .bind(&reserved[start..end])
        .bind(&prods[start..end])
        .bind(&orders[start..end])
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(list.len())
}

/// Resultado do resync em massa de estoque de produtos (passo A).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProdutoStockResyncResult {
    pub updated: usize,
    pub still_negative_from_erp: usize,
    pub sample_before_after: Vec<serde_json::Value>,
}

/// Regrava estoque_atual a partir de Produtos.nQtdeEstoque (espelho passo A).
pub async fn resync_all_produto_stocks_from_erp(
    pool: &PgPool,
) -> anyhow::Result<ProdutoStockResyncResult> {
    let mut client = connect_sql_server(pool).await?;
    let query = "
SELECT 
    RTRIM(cCodProd) COLLATE Latin1_General_CI_AS as cCodProd,
    CAST(nQtdeEstoque AS FLOAT) as nQtdeEstoque,
    CAST(nQtdeProducao AS FLOAT) as nQtdeProducao,
    CAST(nPedidos AS FLOAT) as nPedidos,
    cNomeTipo COLLATE Latin1_General_CI_AS as cNomeTipo
FROM Produtos WITH (NOLOCK)
WHERE cCodProd IS NOT NULL AND cCodProd <> '' AND (cInativo = 'N' OR cInativo IS NULL);
";
    let stream = client.query(query, &[]).await?;
    let rows = stream.into_first_result().await?;

    let mut codes: Vec<String> = Vec::new();
    let mut stocks: Vec<f64> = Vec::new();
    let mut prods: Vec<f64> = Vec::new();
    let mut orders: Vec<f64> = Vec::new();
    let mut fases: Vec<Option<String>> = Vec::new();
    let mut still_negative = 0usize;

    for row in rows {
        let code: &str = row.get(0).unwrap_or("");
        if code.is_empty() {
            continue;
        }
        let stock: f64 = row.get(1).unwrap_or(0.0);
        if stock < 0.0 {
            still_negative += 1;
        }
        codes.push(code.trim().to_string());
        stocks.push(stock);
        prods.push(row.get(2).unwrap_or(0.0));
        orders.push(row.get(3).unwrap_or(0.0));
        fases.push(
            row.get(4)
                .map(|s: &str| s.trim().to_string())
                .filter(|s| !s.is_empty()),
        );
    }

    // Amostra de divergências antes do UPSERT (para o relatório).
    let mut sample: Vec<serde_json::Value> = Vec::new();
    if !codes.is_empty() {
        let before = sqlx::query(
            r#"
            SELECT e.codigo, e.estoque
            FROM estoque_atual e
            INNER JOIN UNNEST($1::text[], $2::float8[]) AS v(codigo, erp_estoque)
              ON e.codigo = v.codigo
            WHERE ABS(e.estoque - v.erp_estoque) > 0.5
            ORDER BY ABS(e.estoque - v.erp_estoque) DESC
            LIMIT 20
            "#,
        )
        .bind(&codes)
        .bind(&stocks)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        let erp_map: HashMap<String, f64> = codes
            .iter()
            .cloned()
            .zip(stocks.iter().copied())
            .collect();
        for row in before {
            let codigo: String = row.get(0);
            let hub: f64 = row.get(1);
            let erp = *erp_map.get(&codigo).unwrap_or(&0.0);
            sample.push(serde_json::json!({
                "codigo": codigo,
                "hubBefore": hub,
                "erp": erp,
                "delta": hub - erp,
            }));
        }
    }

    let mut tx = pool.begin().await?;
    const CHUNK: usize = 400;
    for start in (0..codes.len()).step_by(CHUNK) {
        let end = (start + CHUNK).min(codes.len());
        sqlx::query(
            r#"
            INSERT INTO estoque_atual (codigo, estoque, producao, pedidos_aberto, fase)
            SELECT * FROM UNNEST($1::text[], $2::float8[], $3::float8[], $4::float8[], $5::text[])
            ON CONFLICT (codigo) DO UPDATE SET
                estoque = EXCLUDED.estoque,
                producao = EXCLUDED.producao,
                pedidos_aberto = EXCLUDED.pedidos_aberto,
                fase = COALESCE(EXCLUDED.fase, estoque_atual.fase)
            "#,
        )
        .bind(&codes[start..end])
        .bind(&stocks[start..end])
        .bind(&prods[start..end])
        .bind(&orders[start..end])
        .bind(&fases[start..end])
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    Ok(ProdutoStockResyncResult {
        updated: codes.len(),
        still_negative_from_erp: still_negative,
        sample_before_after: sample,
    })
}


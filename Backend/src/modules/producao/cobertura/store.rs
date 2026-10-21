//! Leitura do banco para a cobertura de insumo. Poucas consultas em lote (nunca uma por produto);
//! a regra de negócio está em `calc.rs` (pura e testada).

use chrono::{Datelike, Duration, FixedOffset, NaiveDate, Utc, Weekday};
use serde::Serialize;
use sqlx::{PgPool, Row};
use std::collections::{BTreeMap, HashMap, HashSet};

use super::calc::{
    alocar_nfs, necessidades_do_produto, BaseFonte, BaseRef, Chegada, EntradaSimulacao, EstoqueItem, LinhaFormula,
    LinhaPedido, LoteErp, Manual, Necessidade, OrdemEntrada, FRACAO_RECEBIDO,
};

// ---------------------------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------------------------

/// Código como o ERP/`items` guardam: sem aspas e sem espaços nas pontas.
pub fn canon(c: &str) -> String {
    c.trim().replace('"', "")
}

pub fn sem_pontos(c: &str) -> String {
    canon(c).replace('.', "")
}

/// Datas do ERP vêm como `YYYY-MM-DD HH:MM:SS`; só os 10 primeiros caracteres interessam.
pub fn parse_data(s: &str) -> Option<NaiveDate> {
    let t = s.trim();
    if t.len() < 10 {
        return None;
    }
    NaiveDate::parse_from_str(&t[..10], "%Y-%m-%d").ok()
}

/// "Hoje" no fuso de Brasília (o container roda em UTC).
pub fn hoje_brasil() -> NaiveDate {
    let fuso = FixedOffset::west_opt(3 * 3600).expect("fuso válido");
    Utc::now().with_timezone(&fuso).date_naive()
}

/// `YYYY-Www` (semana ISO) -> segunda e domingo.
pub fn intervalo_semana(week: &str) -> Option<(NaiveDate, NaiveDate)> {
    let (ano, sem) = week.trim().split_once("-W")?;
    let ano: i32 = ano.parse().ok()?;
    let sem: u32 = sem.parse().ok()?;
    let seg = NaiveDate::from_isoywd_opt(ano, sem, Weekday::Mon)?;
    Some((seg, seg + Duration::days(6)))
}

pub fn semana_de(d: NaiveDate) -> String {
    let iso = d.iso_week();
    format!("{}-W{:02}", iso.year(), iso.week())
}

fn status_do_lote(details: &str) -> String {
    details
        .split('|')
        .find_map(|p| p.trim().strip_prefix("Status:").map(|s| s.trim().to_string()))
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------------------------
// Fórmulas
// ---------------------------------------------------------------------------------------------

pub struct Formulas {
    /// código do produto (como pedido) -> linhas da fórmula
    pub por_produto: HashMap<String, Vec<LinhaFormula>>,
    /// código de ingrediente que tem fórmula própria (base) -> linhas
    pub bases: HashMap<String, Vec<LinhaFormula>>,
    /// código canônico do insumo -> (descrição, unidade)
    pub itens: HashMap<String, (String, Option<String>)>,
}

fn variantes_codigo(c: &str) -> Vec<String> {
    let c = canon(c);
    let mut v = vec![c.clone(), format!("0{c}")];
    let sem_zero = c.trim_start_matches('0').to_string();
    if !sem_zero.is_empty() && sem_zero != c {
        v.push(sem_zero);
    }
    v
}

async fn linhas_formula(pool: &PgPool, produtos: &[String]) -> Result<HashMap<String, Vec<LinhaFormula>>, String> {
    if produtos.is_empty() {
        return Ok(HashMap::new());
    }
    let rows = sqlx::query(
        r#"
        SELECT TRIM(f.product_code) AS produto,
               TRIM(REPLACE(f.ingredient_code, '"', '')) AS ingrediente,
               COALESCE(f.description, i.description, '') AS descricao,
               f.quantity::float8 AS quantidade,
               i.unit AS unidade
        FROM formulations f
        LEFT JOIN items i ON TRIM(REPLACE(i.code, '"', '')) = TRIM(REPLACE(f.ingredient_code, '"', ''))
        WHERE TRIM(f.product_code) = ANY($1)
        "#,
    )
    .bind(produtos)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler fórmulas: {e}"))?;
    let mut m: HashMap<String, Vec<LinhaFormula>> = HashMap::new();
    for r in rows {
        let produto: String = r.get::<Option<String>, _>("produto").unwrap_or_default();
        m.entry(produto).or_default().push(LinhaFormula {
            codigo: r.get::<Option<String>, _>("ingrediente").unwrap_or_default(),
            descricao: r.get::<Option<String>, _>("descricao").unwrap_or_default(),
            unidade: r.get::<Option<String>, _>("unidade"),
            quantidade: r.get::<Option<f64>, _>("quantidade").unwrap_or(0.0),
        });
    }
    Ok(m)
}

pub async fn carregar_formulas(pool: &PgPool, produtos: &[String]) -> Result<Formulas, String> {
    let mut pedidos: Vec<String> = Vec::new();
    for p in produtos {
        pedidos.extend(variantes_codigo(p));
    }
    pedidos.sort();
    pedidos.dedup();
    let brutas = linhas_formula(pool, &pedidos).await?;

    let mut por_produto: HashMap<String, Vec<LinhaFormula>> = HashMap::new();
    for p in produtos {
        let chave = canon(p);
        for v in variantes_codigo(p) {
            if let Some(l) = brutas.get(&v) {
                por_produto.insert(chave.clone(), l.clone());
                break;
            }
        }
    }

    // Ingredientes que têm fórmula própria são bases.
    let mut ingredientes: Vec<String> = por_produto
        .values()
        .flat_map(|v| v.iter().map(|l| l.codigo.clone()))
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    ingredientes.sort();
    let mut bases = linhas_formula(pool, &ingredientes).await?;
    bases.retain(|_, v| !v.is_empty());

    // Descrição/unidade de todos os insumos finais.
    let mut codigos: HashSet<String> = HashSet::new();
    for l in por_produto.values().flatten() {
        if !bases.contains_key(&l.codigo) {
            codigos.insert(l.codigo.clone());
        }
    }
    for l in bases.values().flatten() {
        codigos.insert(l.codigo.clone());
    }
    let codigos: Vec<String> = codigos.into_iter().collect();
    let mut itens: HashMap<String, (String, Option<String>)> = HashMap::new();
    if !codigos.is_empty() {
        let rows = sqlx::query(
            "SELECT TRIM(REPLACE(code, '\"', '')) AS code, COALESCE(description, '') AS description, unit FROM items \
             WHERE TRIM(REPLACE(code, '\"', '')) = ANY($1)",
        )
        .bind(&codigos)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Erro ao ler itens: {e}"))?;
        for r in rows {
            itens.insert(
                r.get::<Option<String>, _>("code").unwrap_or_default(),
                (r.get::<Option<String>, _>("description").unwrap_or_default(), r.get::<Option<String>, _>("unit")),
            );
        }
    }
    Ok(Formulas { por_produto, bases, itens })
}

impl Formulas {
    /// Necessidade com a base explodida em matérias-primas (como o ERP reserva).
    pub fn necessidades(&self, produto: &str, kg: f64) -> Option<Vec<Necessidade>> {
        self.necessidades_com(produto, kg, BaseFonte::Explodir)
    }

    /// Necessidade respeitando a origem declarada da base (estoque/ordem da base não baixam os insumos dela).
    pub fn necessidades_com(&self, produto: &str, kg: f64, fonte: BaseFonte) -> Option<Vec<Necessidade>> {
        let f = self.por_produto.get(&canon(produto))?;
        let mut n = necessidades_do_produto(f, kg, &self.bases, fonte)?;
        for x in n.iter_mut() {
            if x.descricao.is_empty() {
                if let Some((d, u)) = self.itens.get(&x.codigo) {
                    x.descricao = d.clone();
                    if x.unidade.is_none() {
                        x.unidade = u.clone();
                    }
                }
            }
        }
        Some(n)
    }

    pub fn bases_usadas(&self, produto: &str) -> Vec<BaseRef> {
        self.por_produto
            .get(&canon(produto))
            .map(|f| {
                f.iter()
                    .filter(|l| self.bases.contains_key(&l.codigo))
                    .map(|l| BaseRef { codigo: l.codigo.clone(), descricao: l.descricao.clone() })
                    .collect()
            })
            .unwrap_or_default()
    }
}

// ---------------------------------------------------------------------------------------------
// Ordens do planejamento
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct OrdemBanco {
    pub id: String,
    pub data: NaiveDate,
    pub sequencia: i32,
    pub codigo: String,
    pub descricao: Option<String>,
    pub kg: f64,
    pub lote_erp: Option<String>,
    pub batch_id: Option<String>,
    pub base_fonte: BaseFonte,
}

pub async fn carregar_ordens(pool: &PgPool, ini: NaiveDate, fim: NaiveDate) -> Result<Vec<OrdemBanco>, String> {
    let rows = sqlx::query(
        r#"
        SELECT id, to_char(data_planejada, 'YYYY-MM-DD') AS data, COALESCE(ordem_sequencia, 1) AS seq,
               codigo_produto, descricao, quantidade_planejada::float8 AS kg,
               NULLIF(TRIM(COALESCE(lote_erp, '')), '') AS lote_erp,
               NULLIF(TRIM(COALESCE(batch_id, '')), '') AS batch_id,
               COALESCE(NULLIF(TRIM(base_fonte), ''), 'explodir') AS base_fonte
        FROM producao_planejamento_semanal
        WHERE (ordem_status IS NULL OR ordem_status <> 'cancelado')
          AND data_planejada >= $1 AND data_planejada <= $2
        "#,
    )
    .bind(ini)
    .bind(fim)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler o planejamento: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        let Some(data) = r.get::<Option<String>, _>("data").and_then(|s| parse_data(&s)) else { continue };
        out.push(OrdemBanco {
            id: r.get::<String, _>("id"),
            data,
            sequencia: r.get::<i32, _>("seq"),
            codigo: canon(&r.get::<Option<String>, _>("codigo_produto").unwrap_or_default()),
            descricao: r.get::<Option<String>, _>("descricao"),
            kg: r.get::<Option<f64>, _>("kg").unwrap_or(0.0),
            lote_erp: r.get::<Option<String>, _>("lote_erp"),
            batch_id: r.get::<Option<String>, _>("batch_id"),
            base_fonte: r
                .get::<Option<String>, _>("base_fonte")
                .and_then(|f| BaseFonte::parse(&f))
                .unwrap_or_default(),
        });
    }
    Ok(out)
}

// ---------------------------------------------------------------------------------------------
// Estoque, reserva, calibração
// ---------------------------------------------------------------------------------------------

async fn carregar_estoque(
    pool: &PgPool,
    codigos: &[String],
    formulas: &Formulas,
) -> Result<HashMap<String, EstoqueItem>, String> {
    let mut out: HashMap<String, EstoqueItem> = HashMap::new();
    if codigos.is_empty() {
        return Ok(out);
    }
    let rows = sqlx::query(
        r#"
        SELECT DISTINCT ON (TRIM(REPLACE(item_code, '"', '')))
               TRIM(REPLACE(item_code, '"', '')) AS code,
               COALESCE(stock_qty, 0)::float8 AS estoque,
               COALESCE(reserved_qty, 0)::float8 AS reserva
        FROM stock_snapshots
        WHERE TRIM(REPLACE(item_code, '"', '')) = ANY($1)
        ORDER BY TRIM(REPLACE(item_code, '"', '')), snapshot_date DESC, id DESC
        "#,
    )
    .bind(codigos)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler o estoque: {e}"))?;
    for r in rows {
        let code: String = r.get::<Option<String>, _>("code").unwrap_or_default();
        let (descricao, unidade) = formulas.itens.get(&code).cloned().unwrap_or_default();
        out.insert(
            code,
            EstoqueItem {
                descricao,
                unidade,
                estoque: r.get::<Option<f64>, _>("estoque").unwrap_or(0.0),
                reserva: r.get::<Option<f64>, _>("reserva").unwrap_or(0.0),
                calibrado: false,
            },
        );
    }
    // Calibração manual (a tabela só existe depois do primeiro uso do módulo de compras).
    if let Ok(rows) = sqlx::query(
        "SELECT TRIM(item_code) AS code, stock::float8 AS stock FROM item_stock_calibrations WHERE TRIM(item_code) = ANY($1)",
    )
    .bind(codigos)
    .fetch_all(pool)
    .await
    {
        for r in rows {
            let code: String = r.get::<Option<String>, _>("code").unwrap_or_default();
            if let Some(stock) = r.get::<Option<f64>, _>("stock") {
                let (descricao, unidade) = formulas.itens.get(&code).cloned().unwrap_or_default();
                let e = out.entry(code).or_insert(EstoqueItem { descricao, unidade, estoque: 0.0, reserva: 0.0, calibrado: false });
                e.estoque = stock;
                e.calibrado = true;
            }
        }
    }
    // Insumo sem snapshot nenhum: aparece com estoque 0 (e descrição do cadastro).
    for c in codigos {
        out.entry(c.clone()).or_insert_with(|| {
            let (descricao, unidade) = formulas.itens.get(c).cloned().unwrap_or_default();
            EstoqueItem { descricao, unidade, estoque: 0.0, reserva: 0.0, calibrado: false }
        });
    }
    Ok(out)
}

// ---------------------------------------------------------------------------------------------
// Chegadas (pedidos de compra abatidos pelas NFs) e ordens manuais
// ---------------------------------------------------------------------------------------------

struct LinhaPo {
    id: i32,
    pedido: i32,
    fornecedor_id: String,
    fornecedor: String,
    data_pedido: Option<NaiveDate>,
    data_previsao: Option<NaiveDate>,
    ref_sem_pontos: String,
    pendente: f64,
}

async fn carregar_chegadas(
    pool: &PgPool,
    codigos: &[String],
) -> Result<HashMap<String, Vec<Chegada>>, String> {
    let mut mapa_codigo: HashMap<String, String> = HashMap::new();
    for c in codigos {
        mapa_codigo.insert(sem_pontos(c), c.clone());
    }
    let sem: Vec<String> = mapa_codigo.keys().cloned().collect();
    if sem.is_empty() {
        return Ok(HashMap::new());
    }

    let rows = sqlx::query(
        r#"
        SELECT poi.id, po.n_pedido, po.n_cod_fornec, COALESCE(po.c_nome_f, '') AS fornecedor,
               po.d_pedido, po.d_previsao, REPLACE(TRIM(COALESCE(poi.c_referencia, '')), '.', '') AS ref,
               COALESCE(poi.n_qtde, 0)::float8 AS qtde, COALESCE(poi.n_chegou, 0)::float8 AS chegou
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
        WHERE COALESCE(po.c_status, '') <> 'T'
          AND COALESCE(poi.n_qtde, 0) > COALESCE(poi.n_chegou, 0)
          AND REPLACE(TRIM(COALESCE(poi.c_referencia, '')), '.', '') = ANY($1)
        "#,
    )
    .bind(&sem)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler pedidos de compra: {e}"))?;

    let mut linhas: Vec<LinhaPo> = Vec::new();
    for r in rows {
        let qtde = r.get::<Option<f64>, _>("qtde").unwrap_or(0.0);
        let chegou = r.get::<Option<f64>, _>("chegou").unwrap_or(0.0);
        linhas.push(LinhaPo {
            id: r.get::<i32, _>("id"),
            pedido: r.get::<Option<i32>, _>("n_pedido").unwrap_or(0),
            fornecedor_id: r.get::<Option<i32>, _>("n_cod_fornec").map(|v| v.to_string()).unwrap_or_default(),
            fornecedor: r.get::<Option<String>, _>("fornecedor").unwrap_or_default(),
            data_pedido: r.get::<Option<String>, _>("d_pedido").and_then(|s| parse_data(&s)),
            data_previsao: r.get::<Option<String>, _>("d_previsao").and_then(|s| parse_data(&s)),
            ref_sem_pontos: r.get::<Option<String>, _>("ref").unwrap_or_default(),
            pendente: (qtde - chegou).max(0.0),
        });
    }
    if linhas.is_empty() {
        return Ok(HashMap::new());
    }

    // Janela dos recebimentos: do pedido aberto mais antigo em diante.
    let inicio_global = linhas
        .iter()
        .filter_map(|l| l.data_pedido)
        .min()
        .unwrap_or_else(|| hoje_brasil() - Duration::days(120));
    let inicio_txt = inicio_global.format("%Y-%m-%d").to_string();

    // Recebimentos já registrados em pedidos (abertos e fechados) do mesmo insumo.
    let reg_rows = sqlx::query(
        r#"
        SELECT po.n_cod_fornec, REPLACE(TRIM(COALESCE(poi.c_referencia, '')), '.', '') AS ref,
               po.d_pedido, COALESCE(poi.n_chegou, 0)::float8 AS chegou
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
        WHERE REPLACE(TRIM(COALESCE(poi.c_referencia, '')), '.', '') = ANY($1)
          AND SUBSTRING(COALESCE(po.d_pedido, '') FROM 1 FOR 10) >= $2
        "#,
    )
    .bind(&sem)
    .bind(&inicio_txt)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler recebimentos registrados: {e}"))?;
    // (fornecedor, ref) -> [(data do pedido, chegou)]
    let mut registrado: HashMap<(String, String), Vec<(Option<NaiveDate>, f64)>> = HashMap::new();
    for r in reg_rows {
        let forn = r.get::<Option<i32>, _>("n_cod_fornec").map(|v| v.to_string()).unwrap_or_default();
        let rf = r.get::<Option<String>, _>("ref").unwrap_or_default();
        registrado.entry((forn, rf)).or_default().push((
            r.get::<Option<String>, _>("d_pedido").and_then(|s| parse_data(&s)),
            r.get::<Option<f64>, _>("chegou").unwrap_or(0.0),
        ));
    }

    // Notas fiscais de entrada do mesmo insumo.
    let nf_rows = sqlx::query(
        r#"
        SELECT invoice_number, REPLACE(TRIM(item_code), '.', '') AS ref, COALESCE(quantity, 0)::float8 AS qtde,
               COALESCE(supplier_id, '') AS fornecedor, SUBSTRING(COALESCE(invoice_date, '') FROM 1 FOR 10) AS data
        FROM invoices
        WHERE REPLACE(TRIM(item_code), '.', '') = ANY($1)
          AND SUBSTRING(COALESCE(invoice_date, '') FROM 1 FOR 10) >= $2
        "#,
    )
    .bind(&sem)
    .bind(&inicio_txt)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler notas fiscais: {e}"))?;
    // (fornecedor, ref) -> [(data, numero, qtde)]
    let mut notas: HashMap<(String, String), Vec<(NaiveDate, String, f64)>> = HashMap::new();
    for r in nf_rows {
        let Some(data) = r.get::<Option<String>, _>("data").and_then(|s| parse_data(&s)) else { continue };
        let forn = r.get::<Option<String>, _>("fornecedor").unwrap_or_default();
        let rf = r.get::<Option<String>, _>("ref").unwrap_or_default();
        notas.entry((forn, rf)).or_default().push((
            data,
            r.get::<Option<String>, _>("invoice_number").unwrap_or_default(),
            r.get::<Option<f64>, _>("qtde").unwrap_or(0.0),
        ));
    }

    // Por (fornecedor, insumo): aloca o recebimento não registrado em pedido, uma única vez.
    let mut por_par: BTreeMap<(String, String), Vec<&LinhaPo>> = BTreeMap::new();
    for l in &linhas {
        por_par.entry((l.fornecedor_id.clone(), l.ref_sem_pontos.clone())).or_default().push(l);
    }
    let mut out: HashMap<String, Vec<Chegada>> = HashMap::new();
    for (par, ls) in por_par {
        let inicio_par = ls.iter().filter_map(|l| l.data_pedido).min();
        let nfs_par: Vec<&(NaiveDate, String, f64)> = notas
            .get(&par)
            .map(|v| v.iter().filter(|n| inicio_par.map(|i| n.0 >= i).unwrap_or(true)).collect())
            .unwrap_or_default();
        let nf_total: f64 = nfs_par.iter().map(|n| n.2).sum();
        let reg_total: f64 = registrado
            .get(&par)
            .map(|v| v.iter().filter(|x| match (inicio_par, x.0) { (Some(i), Some(d)) => d >= i, _ => true }).map(|x| x.1).sum())
            .unwrap_or(0.0);
        let entrada: Vec<LinhaPedido> = ls
            .iter()
            .map(|l| LinhaPedido { id: l.id, pedido: l.pedido, data_pedido: l.data_pedido, pendente: l.pendente })
            .collect();
        let aloc: HashMap<i32, f64> = alocar_nfs(&entrada, nf_total, reg_total).into_iter().map(|a| (a.id, a.abatido)).collect();
        let mut numeros: Vec<String> = nfs_par.iter().map(|n| n.1.clone()).collect();
        numeros.sort();
        numeros.dedup();
        numeros.truncate(5);

        let Some(codigo) = mapa_codigo.get(&par.1) else { continue };
        for l in ls {
            let abatido = aloc.get(&l.id).copied().unwrap_or(0.0);
            let efetiva = if abatido >= l.pendente * FRACAO_RECEBIDO { 0.0 } else { l.pendente - abatido };
            out.entry(codigo.clone()).or_default().push(Chegada {
                pedido: l.pedido,
                fornecedor: l.fornecedor.clone(),
                data: l.data_previsao,
                quantidade: efetiva,
                quantidade_pedido: l.pendente,
                nfs: if abatido > 0.0 { numeros.clone() } else { Vec::new() },
            });
        }
    }
    Ok(out)
}

async fn carregar_manuais(pool: &PgPool, codigos: &[String]) -> Result<HashMap<String, Vec<Manual>>, String> {
    let mut mapa: HashMap<String, String> = HashMap::new();
    for c in codigos {
        mapa.insert(sem_pontos(c), c.clone());
    }
    let sem: Vec<String> = mapa.keys().cloned().collect();
    if sem.is_empty() {
        return Ok(HashMap::new());
    }
    let rows = sqlx::query(
        r#"
        SELECT o.order_number, o.kind, to_char(o.order_date, 'YYYY-MM-DD') AS data,
               REPLACE(TRIM(i.item_code), '.', '') AS ref, i.qty::float8 AS qtde
        FROM manual_stock_orders o
        JOIN manual_stock_order_items i ON i.order_id = o.id
        WHERE o.status = 'OPEN' AND REPLACE(TRIM(i.item_code), '.', '') = ANY($1)
        "#,
    )
    .bind(&sem)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler ordens manuais: {e}"))?;
    let mut out: HashMap<String, Vec<Manual>> = HashMap::new();
    for r in rows {
        let Some(data) = r.get::<Option<String>, _>("data").and_then(|s| parse_data(&s)) else { continue };
        let Some(codigo) = mapa.get(&r.get::<Option<String>, _>("ref").unwrap_or_default()) else { continue };
        let sinal = if r.get::<Option<String>, _>("kind").as_deref() == Some("saida") { -1.0 } else { 1.0 };
        out.entry(codigo.clone()).or_default().push(Manual {
            numero: r.get::<Option<String>, _>("order_number").unwrap_or_default(),
            data,
            delta: sinal * r.get::<Option<f64>, _>("qtde").unwrap_or(0.0),
        });
    }
    Ok(out)
}

// ---------------------------------------------------------------------------------------------
// Lotes do ERP
// ---------------------------------------------------------------------------------------------

struct LoteBruto {
    numero: String,
    data: NaiveDate,
    produtos: Vec<(String, f64)>,
}

/// Lotes abertos no ERP (sem baixa, fora de CA/EA) que nenhuma ordem do Nexus vincula.
async fn carregar_lotes_abertos_sem_vinculo(
    pool: &PgPool,
    ini: NaiveDate,
    fim: NaiveDate,
) -> Result<Vec<LoteBruto>, String> {
    let rows = sqlx::query(
        r#"
        SELECT sm.document_number AS lote, TRIM(sm.item_code) AS produto, COALESCE(sm.quantity, 0)::float8 AS kg,
               SUBSTRING(COALESCE(sm.date, '') FROM 1 FOR 10) AS data, COALESCE(sm.details, '') AS details
        FROM stock_movements sm
        WHERE sm.item_type = 'produto' AND sm.movement_type = 'entrada'
          AND COALESCE(sm.document_number, '') ~ '^[0-9]{1,9}$'
          AND SUBSTRING(COALESCE(sm.date, '') FROM 1 FOR 10) >= $1
          AND SUBSTRING(COALESCE(sm.date, '') FROM 1 FOR 10) <= $2
          AND NOT EXISTS (
              SELECT 1 FROM lotes_baixas lb
              WHERE lb.nlote = (CASE WHEN sm.document_number ~ '^[0-9]{1,9}$' THEN sm.document_number::int END)
          )
          AND NOT EXISTS (
              SELECT 1 FROM producao_planejamento_semanal pp
              WHERE TRIM(COALESCE(pp.lote_erp, '')) = sm.document_number
          )
        "#,
    )
    .bind(ini.format("%Y-%m-%d").to_string())
    .bind(fim.format("%Y-%m-%d").to_string())
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler lotes do ERP: {e}"))?;
    let mut m: BTreeMap<String, LoteBruto> = BTreeMap::new();
    for r in rows {
        let status = status_do_lote(&r.get::<Option<String>, _>("details").unwrap_or_default());
        if status == "CA" || status == "EA" {
            continue;
        }
        let Some(data) = r.get::<Option<String>, _>("data").and_then(|s| parse_data(&s)) else { continue };
        let numero = r.get::<Option<String>, _>("lote").unwrap_or_default();
        let e = m.entry(numero.clone()).or_insert(LoteBruto { numero, data, produtos: Vec::new() });
        e.data = e.data.min(data);
        e.produtos.push((canon(&r.get::<Option<String>, _>("produto").unwrap_or_default()), r.get::<Option<f64>, _>("kg").unwrap_or(0.0)));
    }
    Ok(m.into_values().collect())
}

async fn lotes_existentes_no_erp(pool: &PgPool, numeros: &[String]) -> Result<HashSet<String>, String> {
    if numeros.is_empty() {
        return Ok(HashSet::new());
    }
    let rows = sqlx::query(
        "SELECT DISTINCT document_number FROM stock_movements \
         WHERE item_type = 'produto' AND movement_type = 'entrada' AND document_number = ANY($1)",
    )
    .bind(numeros)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao conferir lotes do ERP: {e}"))?;
    Ok(rows.into_iter().filter_map(|r| r.get::<Option<String>, _>("document_number")).collect())
}

// ---------------------------------------------------------------------------------------------
// Montagem da entrada
// ---------------------------------------------------------------------------------------------

/// Última escolha do Edson sobre a origem da base, por produto (código canônico).
pub async fn carregar_decisoes_base(pool: &PgPool) -> Result<HashMap<String, BaseFonte>, String> {
    Ok(crate::modules::producao::decisoes::listar(pool, crate::modules::producao::decisoes::TIPO_BASE_FONTE)
        .await?
        .into_iter()
        .filter_map(|d| BaseFonte::parse(&d.valor).map(|f| (canon(&d.chave), f)))
        .collect())
}

pub struct Contexto {
    pub entrada: EntradaSimulacao,
    pub formulas: Formulas,
    pub decisoes_base: HashMap<String, BaseFonte>,
    pub inicio_semana: NaiveDate,
    pub fim_semana: NaiveDate,
}

fn chave_grupo(o: &OrdemBanco) -> String {
    if let Some(b) = &o.batch_id {
        return format!("BATCH_{b}");
    }
    if let Some(l) = &o.lote_erp {
        let up = l.to_uppercase();
        if !up.starts_with("PLAN_") && !up.starts_with("PL-") {
            return format!("LOTE_{l}");
        }
    }
    format!("ITEM_{}", o.id)
}

/// Carrega tudo o que a simulação precisa para a semana pedida. `extras` = códigos de produto adicionais
/// (candidatos da fila) cujas fórmulas também precisam ser lidas.
pub async fn montar_contexto(pool: &PgPool, semana: &str, extras: &[String]) -> Result<Contexto, String> {
    let hoje = hoje_brasil();
    let (seg, dom) = intervalo_semana(semana).ok_or_else(|| format!("Semana inválida: {semana}"))?;
    let ini = seg.min(hoje - Duration::days(14));
    let fim = dom;

    let ordens_banco = carregar_ordens(pool, ini, fim).await?;
    let mut produtos: Vec<String> = ordens_banco.iter().map(|o| o.codigo.clone()).collect();
    produtos.extend(extras.iter().map(|c| canon(c)));

    let lotes_brutos = carregar_lotes_abertos_sem_vinculo(pool, ini - Duration::days(7), fim + Duration::days(7)).await?;
    produtos.extend(lotes_brutos.iter().flat_map(|l| l.produtos.iter().map(|p| p.0.clone())));
    produtos.sort();
    produtos.dedup();

    let formulas = carregar_formulas(pool, &produtos).await?;

    // Insumos envolvidos (depois da explosão).
    let mut insumos: HashSet<String> = HashSet::new();
    for p in &produtos {
        if let Some(n) = formulas.necessidades(p, 1.0) {
            insumos.extend(n.into_iter().map(|x| x.codigo));
        }
    }
    let insumos: Vec<String> = insumos.into_iter().collect();

    let estoque = carregar_estoque(pool, &insumos, &formulas).await?;
    let chegadas = carregar_chegadas(pool, &insumos).await?;
    let manuais = carregar_manuais(pool, &insumos).await?;

    let digitados: Vec<String> = ordens_banco.iter().filter_map(|o| o.lote_erp.clone()).collect();
    let existentes = lotes_existentes_no_erp(pool, &digitados).await?;

    let decisoes_base = carregar_decisoes_base(pool).await?;
    let ordens: Vec<OrdemEntrada> = ordens_banco
        .iter()
        .map(|o| OrdemEntrada {
            id: o.id.clone(),
            data: o.data,
            sequencia: o.sequencia,
            codigo_produto: o.codigo.clone(),
            descricao: o.descricao.clone(),
            kg: o.kg,
            lote_erp: o.lote_erp.clone(),
            lote_no_erp: o.lote_erp.as_ref().map(|l| existentes.contains(l)).unwrap_or(false),
            grupo: chave_grupo(o),
            necessidades: formulas.necessidades_com(&o.codigo, o.kg, o.base_fonte),
            bases_usadas: formulas.bases_usadas(&o.codigo),
            base_fonte: o.base_fonte,
            sugestao_base: decisoes_base.get(&o.codigo).copied().filter(|d| *d != o.base_fonte),
            da_semana: o.data >= seg && o.data <= dom,
        })
        .collect();

    let lotes_erp: Vec<LoteErp> = lotes_brutos
        .into_iter()
        .map(|l| {
            let mut reserva: HashMap<String, f64> = HashMap::new();
            for (prod, kg) in &l.produtos {
                if let Some(n) = formulas.necessidades(prod, *kg) {
                    for x in n {
                        *reserva.entry(x.codigo).or_insert(0.0) += x.quantidade;
                    }
                }
            }
            LoteErp { numero: l.numero, data: l.data, produtos: l.produtos, reserva }
        })
        .collect();

    Ok(Contexto {
        entrada: EntradaSimulacao { hoje, estoque, chegadas, manuais, ordens, lotes_erp },
        formulas,
        decisoes_base,
        inicio_semana: seg,
        fim_semana: dom,
    })
}

// ---------------------------------------------------------------------------------------------
// Validação (backtest): fórmula x baixa real dos lotes já fechados
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesvioItem {
    pub lote: String,
    pub insumo: String,
    pub descricao: String,
    pub previsto: f64,
    pub baixado: f64,
    pub razao: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Validacao {
    pub lotes_analisados: usize,
    pub itens_comparados: usize,
    pub dentro_de_10pct: usize,
    pub desvio_mediano: Option<f64>,
    pub desvio_p90: Option<f64>,
    pub baixado_sem_previsao: usize,
    pub previsto_sem_baixa: usize,
    pub lotes_sem_formula: Vec<String>,
    pub piores: Vec<DesvioItem>,
}

fn percentil(v: &[f64], p: f64) -> Option<f64> {
    if v.is_empty() {
        return None;
    }
    let mut s = v.to_vec();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let idx = ((s.len() - 1) as f64 * p).round() as usize;
    Some(s[idx])
}

pub async fn validar(pool: &PgPool, limite: i64) -> Result<Validacao, String> {
    let limite = limite.clamp(1, 200);
    let lotes: Vec<i32> = sqlx::query(
        "SELECT nlote FROM lotes_baixas WHERE nlote IS NOT NULL GROUP BY nlote ORDER BY MAX(dlog) DESC LIMIT $1",
    )
    .bind(limite)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler lotes fechados: {e}"))?
    .into_iter()
    .filter_map(|r| r.get::<Option<i32>, _>("nlote"))
    .collect();
    if lotes.is_empty() {
        return Ok(Validacao {
            lotes_analisados: 0,
            itens_comparados: 0,
            dentro_de_10pct: 0,
            desvio_mediano: None,
            desvio_p90: None,
            baixado_sem_previsao: 0,
            previsto_sem_baixa: 0,
            lotes_sem_formula: Vec::new(),
            piores: Vec::new(),
        });
    }
    let lotes_txt: Vec<String> = lotes.iter().map(|n| n.to_string()).collect();

    // baixado: (lote, insumo) -> qtde
    let baixas = sqlx::query(
        "SELECT nlote, TRIM(REPLACE(creferencia, '\"', '')) AS ref, SUM(COALESCE(nqtde, 0))::float8 AS qtde \
         FROM lotes_baixas WHERE nlote = ANY($1) GROUP BY nlote, TRIM(REPLACE(creferencia, '\"', ''))",
    )
    .bind(&lotes)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler baixas: {e}"))?;
    let mut baixado: BTreeMap<(String, String), f64> = BTreeMap::new();
    for r in baixas {
        let lote = r.get::<Option<i32>, _>("nlote").map(|n| n.to_string()).unwrap_or_default();
        baixado.insert((lote, r.get::<Option<String>, _>("ref").unwrap_or_default()), r.get::<Option<f64>, _>("qtde").unwrap_or(0.0));
    }

    // produtos de cada lote
    let prod_rows = sqlx::query(
        "SELECT document_number, TRIM(item_code) AS produto, COALESCE(quantity, 0)::float8 AS kg FROM stock_movements \
         WHERE item_type = 'produto' AND movement_type = 'entrada' AND document_number = ANY($1)",
    )
    .bind(&lotes_txt)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler produtos dos lotes: {e}"))?;
    let mut produtos_do_lote: BTreeMap<String, Vec<(String, f64)>> = BTreeMap::new();
    for r in prod_rows {
        produtos_do_lote
            .entry(r.get::<Option<String>, _>("document_number").unwrap_or_default())
            .or_default()
            .push((canon(&r.get::<Option<String>, _>("produto").unwrap_or_default()), r.get::<Option<f64>, _>("kg").unwrap_or(0.0)));
    }
    let mut todos: Vec<String> = produtos_do_lote.values().flatten().map(|p| p.0.clone()).collect();
    todos.sort();
    todos.dedup();
    let formulas = carregar_formulas(pool, &todos).await?;

    // previsto: (lote, insumo) -> qtde
    let mut previsto: BTreeMap<(String, String), f64> = BTreeMap::new();
    let mut sem_formula: Vec<String> = Vec::new();
    for (lote, prods) in &produtos_do_lote {
        let mut algum = false;
        for (p, kg) in prods {
            if let Some(n) = formulas.necessidades(p, *kg) {
                algum = true;
                for x in n {
                    *previsto.entry((lote.clone(), x.codigo)).or_insert(0.0) += x.quantidade;
                }
            }
        }
        if !algum {
            sem_formula.push(lote.clone());
        }
    }

    let chaves: HashSet<(String, String)> = previsto.keys().chain(baixado.keys()).cloned().collect();
    let mut desvios: Vec<f64> = Vec::new();
    let mut piores: Vec<DesvioItem> = Vec::new();
    let (mut dentro, mut so_baixa, mut so_previsto) = (0usize, 0usize, 0usize);
    for k in chaves {
        if sem_formula.contains(&k.0) {
            continue;
        }
        let p = previsto.get(&k).copied().unwrap_or(0.0);
        let b = baixado.get(&k).copied().unwrap_or(0.0);
        if p > 0.0 && b > 0.0 {
            let razao = b / p;
            let desvio = (razao - 1.0).abs();
            desvios.push(desvio);
            if desvio <= 0.10 {
                dentro += 1;
            }
            piores.push(DesvioItem {
                lote: k.0.clone(),
                insumo: k.1.clone(),
                descricao: formulas.itens.get(&k.1).map(|x| x.0.clone()).unwrap_or_default(),
                previsto: p,
                baixado: b,
                razao: Some(razao),
            });
        } else if b > 0.0 {
            so_baixa += 1;
        } else if p > 0.0 {
            so_previsto += 1;
        }
    }
    piores.sort_by(|a, b| {
        let da = a.razao.map(|r| (r - 1.0).abs()).unwrap_or(0.0);
        let db = b.razao.map(|r| (r - 1.0).abs()).unwrap_or(0.0);
        db.partial_cmp(&da).unwrap_or(std::cmp::Ordering::Equal)
    });
    piores.truncate(25);

    Ok(Validacao {
        lotes_analisados: lotes.len(),
        itens_comparados: desvios.len(),
        dentro_de_10pct: dentro,
        desvio_mediano: percentil(&desvios, 0.5),
        desvio_p90: percentil(&desvios, 0.9),
        baixado_sem_previsao: so_baixa,
        previsto_sem_baixa: so_previsto,
        lotes_sem_formula: sem_formula,
        piores,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_do_erp_usa_os_dez_primeiros_caracteres() {
        assert_eq!(parse_data("2026-10-21 08:30:00"), NaiveDate::from_ymd_opt(2026, 10, 21));
        assert_eq!(parse_data("2026-10-21"), NaiveDate::from_ymd_opt(2026, 10, 21));
        assert_eq!(parse_data(""), None);
        assert_eq!(parse_data("21/10/2026"), None);
    }

    #[test]
    fn semana_iso_vai_de_segunda_a_domingo() {
        let (seg, dom) = intervalo_semana("2026-W43").unwrap();
        assert_eq!(seg, NaiveDate::from_ymd_opt(2026, 10, 19).unwrap());
        assert_eq!(dom, NaiveDate::from_ymd_opt(2026, 10, 25).unwrap());
        assert_eq!(semana_de(seg), "2026-W43");
        assert!(intervalo_semana("lixo").is_none());
    }

    #[test]
    fn status_do_lote_le_o_campo_dos_details() {
        assert_eq!(status_do_lote("Status: PG | Fab: x | Unidades: 3"), "PG");
        assert_eq!(status_do_lote("sem status"), "");
    }

    #[test]
    fn variantes_do_codigo_incluem_zero_a_esquerda() {
        let v = variantes_codigo("1.01.005");
        assert!(v.contains(&"01.01.005".to_string()));
        let v2 = variantes_codigo("01.01.005");
        assert!(v2.contains(&"1.01.005".to_string()));
    }

    #[test]
    fn percentil_basico() {
        assert_eq!(percentil(&[], 0.5), None);
        assert_eq!(percentil(&[1.0, 2.0, 3.0], 0.5), Some(2.0));
        assert_eq!(percentil(&[0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], 0.9), Some(0.8));
    }

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn base_fonte_da_ordem_muda_as_necessidades_no_banco() {
        use super::super::calc::simular;
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let limpar = || async {
            sqlx::query("DELETE FROM producao_planejamento_semanal WHERE id = 'T-ORD-1'").execute(&pool).await.unwrap();
            sqlx::query("DELETE FROM formulations WHERE product_code IN ('T-PROD', 'T-BASE')").execute(&pool).await.unwrap();
            sqlx::query("DELETE FROM items WHERE code LIKE 'T-%'").execute(&pool).await.unwrap();
            sqlx::query("DELETE FROM produtos WHERE codigo LIKE 'T-%'").execute(&pool).await.unwrap();
            sqlx::query("DELETE FROM config_linhas WHERE linha_prefix = 'T-LINHA'").execute(&pool).await.unwrap();
            sqlx::query("DELETE FROM producao_decisoes WHERE chave = 'T-PROD'").execute(&pool).await.unwrap();
        };
        limpar().await;
        for (code, desc) in [("T-AGUA", "AGUA"), ("T-TENSO", "TENSO"), ("T-FRAG", "FRAGRANCIA"), ("T-BASE", "BASE PEROLADA")] {
            sqlx::query("INSERT INTO items (code, description, unit) VALUES ($1, $2, 'kg')")
                .bind(code)
                .bind(desc)
                .execute(&pool)
                .await
                .unwrap();
        }
        sqlx::query("INSERT INTO config_linhas (linha_prefix, nome_linha) VALUES ('T-LINHA', 'TESTE')")
            .execute(&pool)
            .await
            .unwrap();
        for codigo in ["T-PROD", "T-BASE"] {
            sqlx::query("INSERT INTO produtos (codigo, descricao, linha_prefix) VALUES ($1, 'TESTE', 'T-LINHA')")
                .bind(codigo)
                .execute(&pool)
                .await
                .unwrap();
        }
        for (prod, ing, q) in [
            ("T-PROD", "T-BASE", 80.0),
            ("T-PROD", "T-FRAG", 20.0),
            ("T-BASE", "T-AGUA", 0.7),
            ("T-BASE", "T-TENSO", 0.3),
        ] {
            sqlx::query("INSERT INTO formulations (product_code, ingredient_code, quantity) VALUES ($1, $2, $3)")
                .bind(prod)
                .bind(ing)
                .bind(q)
                .execute(&pool)
                .await
                .unwrap();
        }
        let hoje = hoje_brasil();
        sqlx::query(
            "INSERT INTO producao_planejamento_semanal (id, week_key, data_planejada, reator_id, codigo_produto, quantidade_planejada, base_fonte) \
             VALUES ('T-ORD-1', $1, $2, 'R_500', 'T-PROD', 100, 'estoque')",
        )
        .bind(semana_de(hoje))
        .bind(hoje)
        .execute(&pool)
        .await
        .unwrap();
        crate::modules::producao::decisoes::registrar(&pool, "base_fonte", "T-PROD", "ordem_base", "teste").await.unwrap();

        let ctx = montar_contexto(&pool, &semana_de(hoje), &[]).await.unwrap();
        let o = ctx.entrada.ordens.iter().find(|o| o.id == "T-ORD-1").expect("ordem carregada");
        assert_eq!(o.base_fonte, BaseFonte::Estoque);
        let cods: Vec<&str> = o.necessidades.as_ref().unwrap().iter().map(|n| n.codigo.as_str()).collect();
        assert_eq!(cods, vec!["T-FRAG"], "base de estoque não baixa água nem tensoativo");
        assert_eq!(o.bases_usadas.len(), 1);
        assert_eq!(o.sugestao_base, Some(BaseFonte::OrdemBase), "a memória difere da escolha atual");
        let saida = simular(&ctx.entrada);
        assert!(saida.ordens.iter().any(|r| r.id == "T-ORD-1" && r.base_fonte == BaseFonte::Estoque));

        sqlx::query("UPDATE producao_planejamento_semanal SET base_fonte = 'explodir' WHERE id = 'T-ORD-1'")
            .execute(&pool)
            .await
            .unwrap();
        let ctx = montar_contexto(&pool, &semana_de(hoje), &[]).await.unwrap();
        let o = ctx.entrada.ordens.iter().find(|o| o.id == "T-ORD-1").unwrap();
        let mut cods: Vec<&str> = o.necessidades.as_ref().unwrap().iter().map(|n| n.codigo.as_str()).collect();
        cods.sort();
        assert_eq!(cods, vec!["T-AGUA", "T-FRAG", "T-TENSO"], "explodir volta a baixar a base");
        limpar().await;
    }
}

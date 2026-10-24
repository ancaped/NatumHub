//! Saúde dos dados importados do ERP. Depois de cada sync (e sob demanda) confere o que foi importado,
//! guarda o resultado em `erp_saude_execucoes` e avisa no sino quando algo é crítico.
//!
//! Só leitura sobre os dados importados: nada é corrigido automaticamente. A checagem manual
//! (`POST /api/import/saude/checar`) não usa `confirmar`: não altera dados de negócio, só grava o
//! registro da própria execução.

use std::{collections::BTreeMap, sync::Arc};

use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::{PgPool, Row};

use crate::core::acao::ErroApi;
use crate::handlers::AppState;
use crate::modules::producao::cobertura::store::comparar_lotes;

/// Tabelas principais conferidas (contagem e variação contra a execução anterior).
const TABELAS: &[&str] = &[
    "produtos",
    "items",
    "stock_snapshots",
    "invoices",
    "formulations",
    "stock_movements",
    "lotes_baixas",
    "purchase_orders",
    "purchase_order_items",
    "sales_orders",
    "sales_order_items",
    "kit_composicao",
];

/// Quantidade acima da qual um número de estoque/movimento é considerado absurdo.
const QTDE_ABSURDA: f64 = 1e7;
/// Queda de contagem (contra a execução anterior) a partir da qual vira crítico.
const QUEDA_CRITICA: f64 = 0.20;
/// Quantos lotes recentes entram nas checagens de baixa x fórmula.
const LOTES_RECENTES: i64 = 30;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Regra {
    Critica,
    Aviso,
}

/// Severidade de uma checagem de contagem de problemas: zero é "ok".
pub fn severidade(regra: Regra, quantidade: i64) -> &'static str {
    if quantidade <= 0 {
        "ok"
    } else if regra == Regra::Critica {
        "critico"
    } else {
        "aviso"
    }
}

/// Queda de mais de 20% da contagem de uma tabela contra a execução anterior.
pub fn queda_critica(atual: i64, anterior: Option<i64>) -> bool {
    match anterior {
        Some(a) if a > 0 => (atual as f64) < (a as f64) * (1.0 - QUEDA_CRITICA),
        _ => false,
    }
}

/// Razão (baixado/previsto) que quase todos os insumos de um lote têm em comum, longe de 1.
/// Sinal de quantidade produzida registrada em outra unidade. Exige 3 insumos ou mais, desvio
/// de mais de 50% e pelo menos 80% dos insumos dentro de ±5% da mediana.
pub fn razao_comum(razoes: &[f64]) -> Option<f64> {
    if razoes.len() < 3 {
        return None;
    }
    let mut s = razoes.to_vec();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mediana = s[s.len() / 2];
    if mediana <= 0.0 || (mediana - 1.0).abs() <= 0.5 {
        return None;
    }
    let iguais = razoes.iter().filter(|r| (**r / mediana - 1.0).abs() <= 0.05).count();
    ((iguais as f64) / (razoes.len() as f64) >= 0.8).then_some(mediana)
}

#[derive(Debug, Serialize)]
pub struct Checagem {
    pub chave: String,
    pub titulo: String,
    pub severidade: &'static str,
    pub quantidade: i64,
    pub exemplos: Vec<String>,
    pub explicacao: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Relatorio {
    pub checagens: Vec<Checagem>,
    pub contagens: BTreeMap<String, i64>,
    pub criticos: i32,
    pub avisos: i32,
}

fn checagem(chave: &str, titulo: &str, regra: Regra, explicacao: &str, total: i64, mut exemplos: Vec<String>) -> Checagem {
    exemplos.truncate(10);
    Checagem {
        chave: chave.to_string(),
        titulo: titulo.to_string(),
        severidade: severidade(regra, total),
        quantidade: total,
        exemplos,
        explicacao: explicacao.to_string(),
    }
}

/// Checagem que não pôde rodar (tabela/coluna ausente, erro de leitura): vira aviso, nunca quebra o relatório.
fn indisponivel(chave: &str, titulo: &str, motivo: &str) -> Checagem {
    Checagem {
        chave: chave.to_string(),
        titulo: titulo.to_string(),
        severidade: "aviso",
        quantidade: 0,
        exemplos: vec![motivo.chars().take(200).collect()],
        explicacao: "Não disponível: a consulta não pôde ser executada neste banco.".to_string(),
    }
}

/// Roda uma consulta que devolve uma linha de texto por problema e conta o total (antes do limite de 10).
async fn rodar(pool: &PgPool, chave: &str, titulo: &str, regra: Regra, explicacao: &str, sql: &str) -> Checagem {
    let consulta = format!(
        "SELECT (COUNT(*) OVER ())::bigint AS total, exemplo FROM ({sql}) q ORDER BY exemplo LIMIT 10"
    );
    match sqlx::query(&consulta).fetch_all(pool).await {
        Ok(rows) => {
            let total = rows.first().map(|r| r.get::<i64, _>("total")).unwrap_or(0);
            let exemplos = rows.iter().map(|r| r.get::<Option<String>, _>("exemplo").unwrap_or_default()).collect();
            checagem(chave, titulo, regra, explicacao, total, exemplos)
        }
        Err(e) => indisponivel(chave, titulo, &e.to_string()),
    }
}

/// Código como o ERP/`items` guardam: sem aspas e sem espaços nas pontas.
fn canon(col: &str) -> String {
    format!("TRIM(REPLACE({col}, '\"', ''))")
}

async fn contagens_anteriores(pool: &PgPool) -> BTreeMap<String, i64> {
    let valor: Option<Value> =
        sqlx::query_scalar("SELECT resultado->'contagens' FROM erp_saude_execucoes ORDER BY id DESC LIMIT 1")
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();
    valor
        .and_then(|v| serde_json::from_value::<BTreeMap<String, i64>>(v).ok())
        .unwrap_or_default()
}

pub async fn checar(pool: &PgPool) -> Result<Relatorio, ErroApi> {
    sqlx::query("SELECT 1").execute(pool).await?;
    let mut checagens: Vec<Checagem> = Vec::new();

    // a. contagem por tabela e variação contra a execução anterior
    let anteriores = contagens_anteriores(pool).await;
    let mut contagens: BTreeMap<String, i64> = BTreeMap::new();
    let mut linhas_queda: Vec<String> = Vec::new();
    let mut linhas_ok: Vec<String> = Vec::new();
    let mut indisponiveis: Vec<String> = Vec::new();
    for t in TABELAS {
        match sqlx::query_scalar::<_, i64>(&format!("SELECT COUNT(*)::bigint FROM {t}")).fetch_one(pool).await {
            Ok(n) => {
                let antes = anteriores.get(*t).copied();
                if queda_critica(n, antes) {
                    linhas_queda.push(format!("{t}: {} → {n}", antes.unwrap_or(0)));
                } else {
                    linhas_ok.push(format!("{t}: {n}"));
                }
                contagens.insert((*t).to_string(), n);
            }
            Err(e) => indisponiveis.push(format!("{t}: {e}")),
        }
    }
    let mut exemplos = linhas_queda.clone();
    exemplos.extend(linhas_ok);
    exemplos.extend(indisponiveis.iter().cloned());
    let mut c = checagem(
        "contagens",
        "Quantidade de registros por tabela",
        Regra::Critica,
        "Compara o total de cada tabela importada com a checagem anterior. Queda de mais de 20% costuma indicar import incompleto ou tabela apagada no ERP. Os exemplos listam primeiro as tabelas que caíram.",
        linhas_queda.len() as i64,
        exemplos,
    );
    if !indisponiveis.is_empty() && c.severidade == "ok" {
        c.severidade = "aviso";
    }
    checagens.push(c);

    // b. duplicados
    let (c_it, c_pr) = (canon("code"), canon("codigo"));
    checagens.push(
        rodar(
            pool, "duplicados_produtos", "Produtos duplicados por código", Regra::Aviso,
            "Códigos de produto que só diferem por maiúsculas, espaços ou aspas. Podem somar estoque ou fórmula duas vezes.",
            &format!("SELECT UPPER({c_pr}) || ' (' || COUNT(*) || 'x)' AS exemplo FROM produtos GROUP BY UPPER({c_pr}) HAVING COUNT(*) > 1"),
        )
        .await,
    );
    checagens.push(
        rodar(
            pool, "duplicados_items", "Itens duplicados por código", Regra::Aviso,
            "Códigos de insumo/material que só diferem por maiúsculas, espaços ou aspas. Podem dividir o estoque entre dois cadastros.",
            &format!("SELECT UPPER({c_it}) || ' (' || COUNT(*) || 'x)' AS exemplo FROM items GROUP BY UPPER({c_it}) HAVING COUNT(*) > 1"),
        )
        .await,
    );
    checagens.push(
        rodar(
            pool, "duplicados_baixas", "Baixas de lote repetidas", Regra::Aviso,
            "Mesmo lote, insumo, quantidade e data aparecendo em mais de um registro de Lotes_Baixas: o insumo seria baixado em dobro.",
            "SELECT 'lote ' || nlote || ': ' || TRIM(REPLACE(creferencia, '\"', '')) || ' ' || nqtde || ' (' || COUNT(*) || 'x)' AS exemplo \
             FROM lotes_baixas WHERE nlote IS NOT NULL GROUP BY nlote, TRIM(REPLACE(creferencia, '\"', '')), nqtde, dlog HAVING COUNT(*) > 1",
        )
        .await,
    );
    checagens.push(
        rodar(
            pool, "duplicados_itens_venda", "Itens de pedido de venda repetidos", Regra::Aviso,
            "Mesmo registro do ERP (pedido + nº do registro) gravado mais de uma vez em sales_order_items.",
            "SELECT 'pedido ' || n_pedido || ' reg ' || n_registro || ' (' || COUNT(*) || 'x)' AS exemplo \
             FROM sales_order_items WHERE n_registro IS NOT NULL GROUP BY n_pedido, d_pedido, n_registro HAVING COUNT(*) > 1",
        )
        .await,
    );
    checagens.push(
        rodar(
            pool, "duplicados_itens_compra", "Itens de pedido de compra repetidos", Regra::Aviso,
            "Mesmo registro do ERP (pedido + nº do registro) gravado mais de uma vez em purchase_order_items.",
            "SELECT 'pedido ' || n_pedido || ' reg ' || n_registro || ' (' || COUNT(*) || 'x)' AS exemplo \
             FROM purchase_order_items WHERE n_registro IS NOT NULL GROUP BY n_pedido_registro, n_pedido, n_registro HAVING COUNT(*) > 1",
        )
        .await,
    );

    // c. códigos órfãos
    let cadastro = format!("SELECT {c_it} FROM items UNION SELECT {c_pr} FROM produtos");
    checagens.push(
        rodar(
            pool, "orfaos_formula", "Fórmulas com insumo fora do cadastro", Regra::Critica,
            "Ingrediente de fórmula cujo código não existe em items. A necessidade desse insumo some do planejamento.",
            &format!(
                "SELECT {i} || ' (produto ' || TRIM(product_code) || ')' AS exemplo FROM formulations \
                 WHERE {i} NOT IN (SELECT {c_it} FROM items)",
                i = canon("ingredient_code")
            ),
        )
        .await,
    );
    checagens.push(
        rodar(
            pool, "orfaos_kit", "Kits com componente fora do cadastro", Regra::Critica,
            "Componente de kit cujo código não existe nem em produtos nem em items.",
            &format!(
                "SELECT {c} || ' (kit ' || TRIM(kit_codigo) || ')' AS exemplo FROM kit_composicao \
                 WHERE {c} NOT IN ({cadastro})",
                c = canon("componente_codigo")
            ),
        )
        .await,
    );
    checagens.push(
        rodar(
            pool, "orfaos_pedido_venda", "Pedidos de venda com produto fora do cadastro", Regra::Critica,
            "Item de pedido de venda cujo código não existe em produtos nem em items. A demanda não entra no cálculo.",
            &format!(
                "SELECT {c} || ' (' || COUNT(*) || ' itens)' AS exemplo FROM sales_order_items \
                 WHERE {c} <> '' AND {c} NOT IN ({cadastro}) GROUP BY {c}",
                c = canon("c_cod_prod")
            ),
        )
        .await,
    );
    checagens.push(
        rodar(
            pool, "orfaos_pedido_compra", "Pedidos de compra com item fora do cadastro", Regra::Critica,
            "Item de pedido de compra cuja referência não existe em items. A chegada prevista não entra no MRP.",
            &format!(
                "SELECT {c} || ' (' || COUNT(*) || ' itens)' AS exemplo FROM purchase_order_items \
                 WHERE {c} <> '' AND {c} NOT IN (SELECT {c_it} FROM items) GROUP BY {c}",
                c = canon("c_referencia")
            ),
        )
        .await,
    );
    checagens.push(
        rodar(
            pool, "orfaos_baixas", "Baixas de lote com insumo fora do cadastro", Regra::Critica,
            "Baixa de Lotes_Baixas cuja referência não existe em items. O consumo desse insumo fica sem cadastro.",
            &format!(
                "SELECT {c} || ' (' || COUNT(*) || ' baixas)' AS exemplo FROM lotes_baixas \
                 WHERE {c} <> '' AND {c} NOT IN (SELECT {c_it} FROM items) GROUP BY {c}",
                c = canon("creferencia")
            ),
        )
        .await,
    );

    // d. estoque negativo e quantidades absurdas
    checagens.push(
        rodar(
            pool, "estoque_negativo", "Estoque negativo", Regra::Critica,
            "Último snapshot de estoque do item com saldo abaixo de zero.",
            "SELECT item_code || ': ' || stock_qty AS exemplo FROM ( \
                 SELECT DISTINCT ON (TRIM(item_code)) TRIM(item_code) AS item_code, stock_qty \
                 FROM stock_snapshots ORDER BY TRIM(item_code), snapshot_date DESC, id DESC \
             ) s WHERE stock_qty < 0",
        )
        .await,
    );
    checagens.push(
        rodar(
            pool, "quantidades_absurdas", "Quantidades absurdas", Regra::Critica,
            "Estoque, movimento ou baixa com módulo acima de 10 milhões: quase sempre unidade errada ou dado corrompido.",
            &format!(
                "SELECT 'estoque ' || TRIM(item_code) || ': ' || stock_qty AS exemplo FROM stock_snapshots WHERE ABS(stock_qty) > {QTDE_ABSURDA} \
                 UNION ALL SELECT 'movimento ' || TRIM(item_code) || ': ' || quantity FROM stock_movements WHERE ABS(quantity) > {QTDE_ABSURDA} \
                 UNION ALL SELECT 'baixa lote ' || nlote || ' ' || TRIM(creferencia) || ': ' || nqtde FROM lotes_baixas WHERE ABS(nqtde) > {QTDE_ABSURDA}"
            ),
        )
        .await,
    );

    // e. datas no futuro (colunas de data do ERP são texto `YYYY-MM-DD ...`)
    let amanha = "to_char(CURRENT_DATE + 1, 'YYYY-MM-DD')";
    checagens.push(
        rodar(
            pool, "futuro_baixas", "Baixas de lote com data no futuro", Regra::Critica,
            "Lotes_Baixas.dLog depois de amanhã (o ERP já teve anos 2708 e 2244). Atrapalha a ordem dos lotes recentes.",
            &format!("SELECT 'lote ' || nlote || ': ' || dlog AS exemplo FROM lotes_baixas WHERE LEFT(dlog, 10) > {amanha}"),
        )
        .await,
    );
    checagens.push(
        rodar(
            pool, "futuro_movimentos", "Movimentos de estoque com data no futuro", Regra::Critica,
            "Movimento de estoque datado depois de amanhã.",
            &format!("SELECT TRIM(item_code) || ': ' || date AS exemplo FROM stock_movements WHERE LEFT(date, 10) > {amanha}"),
        )
        .await,
    );
    checagens.push(
        rodar(
            pool, "futuro_notas", "Notas fiscais com data no futuro", Regra::Critica,
            "Nota fiscal de entrada datada depois de amanhã.",
            &format!("SELECT 'NF ' || invoice_number || ': ' || invoice_date AS exemplo FROM invoices WHERE LEFT(invoice_date, 10) > {amanha}"),
        )
        .await,
    );

    // f. campos obrigatórios vazios
    checagens.push(
        rodar(
            pool, "vazios_produtos", "Produtos sem código ou descrição", Regra::Aviso,
            "Produto com código ou descrição em branco.",
            "SELECT 'cód ' || COALESCE(NULLIF(TRIM(codigo), ''), '(vazio)') || ' / desc ' || COALESCE(NULLIF(TRIM(descricao), ''), '(vazia)') AS exemplo \
             FROM produtos WHERE TRIM(COALESCE(codigo, '')) = '' OR TRIM(COALESCE(descricao, '')) = ''",
        )
        .await,
    );
    checagens.push(
        rodar(
            pool, "vazios_items", "Itens sem código ou descrição", Regra::Aviso,
            "Insumo/material com código ou descrição em branco.",
            "SELECT 'cód ' || COALESCE(NULLIF(TRIM(code), ''), '(vazio)') || ' / desc ' || COALESCE(NULLIF(TRIM(description), ''), '(vazia)') AS exemplo \
             FROM items WHERE TRIM(COALESCE(code, '')) = '' OR TRIM(COALESCE(description, '')) = ''",
        )
        .await,
    );
    checagens.push(
        rodar(
            pool, "vazios_baixas", "Baixas de lote sem insumo", Regra::Aviso,
            "Registro de Lotes_Baixas sem referência (código do insumo).",
            "SELECT 'lote ' || COALESCE(nlote::text, '?') || ' registro ' || registro AS exemplo \
             FROM lotes_baixas WHERE TRIM(COALESCE(creferencia, '')) = ''",
        )
        .await,
    );

    // g e h. baixa x fórmula nos lotes recentes (mesma comparação da validação de cobertura)
    match comparar_lotes(pool, LOTES_RECENTES).await {
        Ok(cmp) => {
            let mut multiplos: Vec<(i32, f64, usize, usize)> = Vec::new();
            for lote in &cmp.lotes {
                let l = lote.to_string();
                if cmp.sem_formula.contains(&l) {
                    continue;
                }
                let razoes: Vec<f64> = cmp
                    .previsto
                    .iter()
                    .filter(|((lt, _), p)| *lt == l && **p > 0.0)
                    .filter_map(|(k, p)| cmp.baixado.get(k).filter(|b| **b > 0.0).map(|b| b / p))
                    .collect();
                if let Some(r) = razao_comum(&razoes) {
                    multiplos.push((*lote, r, razoes.iter().filter(|x| (**x / r - 1.0).abs() <= 0.05).count(), razoes.len()));
                }
            }
            let linhas = multiplos
                .iter()
                .map(|(l, r, n, t)| format!("lote {l}: {r:.1}× o previsto em {n} de {t} insumos"))
                .collect();
            checagens.push(checagem(
                "lotes_mesmo_multiplo", "Lotes com todos os insumos no mesmo múltiplo do previsto", Regra::Aviso,
                "Nos últimos 30 lotes, quase todos os insumos foram baixados na mesma proporção (longe de 1× o previsto pela fórmula). Sinal de quantidade produzida registrada em outra unidade.",
                multiplos.len() as i64, linhas,
            ));

            let mut fora: Vec<String> = Vec::new();
            for ((lote, insumo), b) in cmp.baixado.iter().rev() {
                if *b <= 0.0 || cmp.sem_formula.contains(lote) {
                    continue;
                }
                if cmp.previsto.get(&(lote.clone(), insumo.clone())).copied().unwrap_or(0.0) <= 0.0 {
                    let desc = cmp.descricoes.get(insumo).map(|d| format!(" {d}")).unwrap_or_default();
                    fora.push(format!("lote {lote}: {insumo}{desc} baixou {b:.3}"));
                }
            }
            checagens.push(checagem(
                "baixado_fora_formula", "Insumos baixados fora da fórmula", Regra::Aviso,
                "Nos últimos 30 lotes, insumo baixado que a fórmula do produto não prevê: troca de insumo não registrada ou fórmula desatualizada.",
                fora.len() as i64, fora,
            ));
        }
        Err(e) => {
            checagens.push(indisponivel("lotes_mesmo_multiplo", "Lotes com todos os insumos no mesmo múltiplo do previsto", &e));
            checagens.push(indisponivel("baixado_fora_formula", "Insumos baixados fora da fórmula", &e));
        }
    }

    let criticos = checagens.iter().filter(|c| c.severidade == "critico").count() as i32;
    let avisos = checagens.iter().filter(|c| c.severidade == "aviso").count() as i32;
    Ok(Relatorio { checagens, contagens, criticos, avisos })
}

/// Roda a checagem, grava a execução e avisa no sino se houver crítico.
pub async fn checar_e_gravar(pool: &PgPool, origem: &str) -> Result<Relatorio, ErroApi> {
    let rel = checar(pool).await?;
    let resultado = serde_json::to_value(&rel).map_err(|e| ErroApi::interno(e.to_string()))?;
    sqlx::query("INSERT INTO erp_saude_execucoes (origem, resultado, criticos, avisos) VALUES ($1, $2, $3, $4)")
        .bind(origem)
        .bind(&resultado)
        .bind(rel.criticos)
        .bind(rel.avisos)
        .execute(pool)
        .await?;
    if rel.criticos > 0 {
        crate::modules::geral::alertas::alertar(
            pool,
            "saude_dados",
            "Dados do ERP com problemas",
            &format!(
                "{} checagens críticas no último sync — veja Configurações → Gestão de Importações → Saúde dos dados",
                rel.criticos
            ),
        )
        .await;
    }
    Ok(rel)
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/import/saude", get(get_saude))
        .route("/api/import/saude/checar", post(post_checar))
}

/// Última execução completa + as 10 anteriores resumidas.
async fn get_saude(State(state): State<Arc<AppState>>) -> Result<Json<Value>, ErroApi> {
    let rows = sqlx::query(
        "SELECT id, executado_em::text AS executado_em, origem, resultado, criticos, avisos \
         FROM erp_saude_execucoes ORDER BY id DESC LIMIT 11",
    )
    .fetch_all(state.db.pool())
    .await?;
    let mut ultima = Value::Null;
    let mut anteriores: Vec<Value> = Vec::new();
    for (i, r) in rows.iter().enumerate() {
        let base = json!({
            "id": r.get::<i64, _>("id"),
            "executadoEm": r.get::<String, _>("executado_em"),
            "origem": r.get::<String, _>("origem"),
            "criticos": r.get::<i32, _>("criticos"),
            "avisos": r.get::<i32, _>("avisos"),
        });
        if i == 0 {
            let mut o = base;
            o["resultado"] = r.get::<Value, _>("resultado");
            ultima = o;
        } else {
            anteriores.push(base);
        }
    }
    Ok(Json(json!({ "ultima": ultima, "anteriores": anteriores })))
}

async fn post_checar(State(state): State<Arc<AppState>>) -> Result<Json<Value>, ErroApi> {
    let rel = checar_e_gravar(state.db.pool(), "manual").await?;
    Ok(Json(json!({ "ok": true, "criticos": rel.criticos, "avisos": rel.avisos })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn severidade_por_regra() {
        assert_eq!(severidade(Regra::Critica, 0), "ok");
        assert_eq!(severidade(Regra::Critica, 3), "critico");
        assert_eq!(severidade(Regra::Aviso, 0), "ok");
        assert_eq!(severidade(Regra::Aviso, 1), "aviso");
    }

    #[test]
    fn queda_acima_de_20pct_e_critica() {
        assert!(queda_critica(79, Some(100)));
        assert!(!queda_critica(80, Some(100)));
        assert!(!queda_critica(10, None));
        assert!(!queda_critica(0, Some(0)));
        assert!(!queda_critica(150, Some(100)));
    }

    #[test]
    fn mesmo_multiplo_do_previsto() {
        // lote 15834: quase todos 17,7x
        let r = razao_comum(&[17.7, 17.6, 17.8, 17.7, 1.0]).expect("deveria marcar");
        assert!((r - 17.7).abs() < 0.2);
        // lote normal
        assert_eq!(razao_comum(&[1.0, 1.02, 0.98, 1.01]), None);
        // razões espalhadas
        assert_eq!(razao_comum(&[2.0, 5.0, 9.0, 14.0]), None);
        // poucos insumos
        assert_eq!(razao_comum(&[17.7, 17.7]), None);
        // só 60% iguais
        assert_eq!(razao_comum(&[3.0, 3.0, 3.0, 1.0, 1.0]), None);
    }

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn checar_marca_duplicado_e_data_futura() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        sqlx::query("DELETE FROM items WHERE code IN ('ZZSAUDE1', ' ZZSAUDE1')").execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM lotes_baixas WHERE registro = 2147000001").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO items (code, description, unit) VALUES ('ZZSAUDE1', 'teste', 'KG'), (' ZZSAUDE1', 'teste', 'KG')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO lotes_baixas (registro, nlote, creferencia, nqtde, dlog) VALUES (2147000001, 99999999, 'ZZSAUDE1', 1, '2708-01-01 00:00:00')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let rel = checar(&pool).await;

        sqlx::query("DELETE FROM lotes_baixas WHERE registro = 2147000001").execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM items WHERE code IN ('ZZSAUDE1', ' ZZSAUDE1')").execute(&pool).await.unwrap();

        let rel = rel.unwrap();
        let por = |k: &str| rel.checagens.iter().find(|c| c.chave == k).unwrap();
        let dup = por("duplicados_items");
        assert_eq!(dup.severidade, "aviso");
        assert!(dup.exemplos.iter().any(|e| e.contains("ZZSAUDE1")));
        let fut = por("futuro_baixas");
        assert_eq!(fut.severidade, "critico");
        assert!(fut.exemplos.iter().any(|e| e.contains("2708")));
        assert!(rel.criticos >= 1);
    }
}

//! Resumo de uma linha (só leitura): vendas em unidades por mês, estoque e faltas, produção e planejado.
//! Não calcula nada novo: junta o que já existe (`historico_faturamento`, a lista da Demanda de Produção,
//! `historico_producao`, planejamento semanal e fila de demandas), sempre pela linha efetiva do produto.
use chrono::{Datelike, Local, NaiveDate};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};

use crate::core::acao::ErroApi;
use crate::core::db::Db;
use crate::core::regras_produto::LINHA_EFETIVA_SQL;
use crate::models::QueryParams;

const NOMES_MES: [&str; 12] = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_PRODUCAO: i64 = 6;
const TOP_PRODUTOS: i64 = 10;
const LIMITE_LISTA: usize = 15;

/// Os 12 meses fechados antes de `hoje` (a janela do sync do ERP: em novembro, nov/25 a out/26), do mais antigo ao mais novo.
pub fn ultimos_12_meses(hoje: NaiveDate) -> Vec<(i32, u32)> {
    let (mut a, mut m) = (hoje.year(), hoje.month());
    let mut v = Vec::with_capacity(12);
    for _ in 0..12 {
        if m == 1 {
            a -= 1;
            m = 12;
        } else {
            m -= 1;
        }
        v.push((a, m));
    }
    v.reverse();
    v
}

fn num(v: &Value, k: &str) -> i64 {
    v.get(k).and_then(Value::as_i64).unwrap_or(0)
}

fn texto(v: &Value, k: &str) -> String {
    v.get(k).and_then(Value::as_str).unwrap_or("").to_string()
}

/// Serviço: resumo da linha `prefixo`. `Err(nao_encontrado)` se a linha não existe.
pub async fn resumo_da_linha(db: &Db, prefixo: &str) -> Result<Value, ErroApi> {
    let pool: &PgPool = db.pool();
    let nome: Option<String> = sqlx::query_scalar("SELECT nome_linha FROM config_linhas WHERE linha_prefix = $1")
        .bind(prefixo)
        .fetch_optional(pool)
        .await?;
    let nome = nome.ok_or_else(|| ErroApi::nao_encontrado(format!("Linha {prefixo} não existe.")))?;
    let hoje = Local::now().date_naive();

    // (a) Vendas: o ERP traz 12 meses por número de mês (sem ano); o ano sai do calendário dos últimos 12 meses.
    let linhas_venda = sqlx::query(&format!(
        "SELECT f.mes, COALESCE(SUM(f.quantidade), 0)::bigint FROM historico_faturamento f \
         JOIN produtos p ON p.codigo = f.codigo LEFT JOIN overrides_produtos o ON o.codigo = p.codigo \
         WHERE {LINHA_EFETIVA_SQL} = $1 GROUP BY f.mes"
    ))
    .bind(prefixo)
    .fetch_all(pool)
    .await?;
    let mut por_mes = [0i64; 12];
    for r in &linhas_venda {
        let mes: i32 = r.get(0);
        if (1..=12).contains(&mes) {
            por_mes[(mes - 1) as usize] = r.get::<i64, _>(1);
        }
    }
    let vendas_mensais: Vec<Value> = ultimos_12_meses(hoje)
        .into_iter()
        .map(|(a, m)| json!({ "mes": format!("{:04}-{:02}", a, m), "rotulo": format!("{}/{:02}", NOMES_MES[(m - 1) as usize], a % 100), "unidades": por_mes[(m - 1) as usize] }))
        .collect();
    let total_12m: i64 = por_mes.iter().sum();
    let mais_vendem: Vec<Value> = sqlx::query(&format!(
        "SELECT p.codigo, p.descricao, COALESCE(SUM(f.quantidade), 0)::bigint AS un FROM historico_faturamento f \
         JOIN produtos p ON p.codigo = f.codigo LEFT JOIN overrides_produtos o ON o.codigo = p.codigo \
         WHERE {LINHA_EFETIVA_SQL} = $1 GROUP BY p.codigo, p.descricao HAVING SUM(f.quantidade) > 0 \
         ORDER BY un DESC, p.codigo LIMIT $2"
    ))
    .bind(prefixo)
    .bind(TOP_PRODUTOS)
    .fetch_all(pool)
    .await?
    .iter()
    .map(|r| json!({ "codigo": r.get::<String, _>(0), "descricao": r.get::<String, _>(1), "unidades12m": r.get::<i64, _>(2) }))
    .collect();

    // (b) Estoque, gatilho e faltas: a mesma lista da Demanda de Produção, filtrada pela linha.
    let params = QueryParams {
        linha: Some(prefixo.to_string()),
        page: Some(1),
        limit: Some(100_000),
        include_all_regimes: Some(true),
        include_programadas: Some(true),
        ..Default::default()
    };
    let demanda = crate::modules::producao::calculo::listar_produtos(db, &params).await.map_err(ErroApi::interno)?;
    let itens: Vec<Value> = demanda.get("items").and_then(Value::as_array).cloned().unwrap_or_default();
    let estoque_total: i64 = itens.iter().map(|i| num(i, "estoque")).sum();
    let em_producao: i64 = itens.iter().map(|i| num(i, "producao")).sum();
    let ordem = |s: &str| if s == "critico" { 0 } else { 1 };
    let mut abaixo: Vec<&Value> = itens.iter().filter(|i| matches!(texto(i, "status").as_str(), "critico" | "ordem")).collect();
    abaixo.sort_by_key(|i| (ordem(&texto(i, "status")), num(i, "estoque_futuro_com_producao")));
    let mut faltas: Vec<&Value> = itens.iter().filter(|i| num(i, "faltas_ativas") > 0).collect();
    faltas.sort_by_key(|i| -num(i, "faltas_ativas"));
    let faltas_total: i64 = faltas.iter().map(|i| num(i, "faltas_ativas")).sum();
    let linha_item = |i: &Value| {
        json!({
            "codigo": texto(i, "codigo"), "descricao": texto(i, "descricao"), "estoque": num(i, "estoque"),
            "emProducao": num(i, "producao"), "faltas": num(i, "faltas_ativas"), "status": texto(i, "status"),
            "statusRotulo": texto(i, "status_label"), "produzir": num(i, "producao_recomendada"),
        })
    };

    // (c) Produção: lançamentos dos últimos meses e o que está planejado / na fila.
    let desde = {
        let (mut a, mut m) = (hoje.year(), hoje.month() as i64 - (MESES_PRODUCAO - 1));
        while m < 1 {
            m += 12;
            a -= 1;
        }
        format!("{:04}-{:02}-01", a, m)
    };
    let produzido: Vec<Value> = sqlx::query(&format!(
        "SELECT substr(h.data_producao, 1, 7) AS mes, COALESCE(SUM(h.quantidade), 0)::bigint, COUNT(DISTINCT h.codigo)::bigint \
         FROM historico_producao h JOIN produtos p ON p.codigo = h.codigo LEFT JOIN overrides_produtos o ON o.codigo = p.codigo \
         WHERE {LINHA_EFETIVA_SQL} = $1 AND h.data_producao >= $2 GROUP BY 1 ORDER BY 1"
    ))
    .bind(prefixo)
    .bind(&desde)
    .fetch_all(pool)
    .await?
    .iter()
    .map(|r| json!({ "mes": r.get::<String, _>(0), "unidades": r.get::<i64, _>(1), "produtos": r.get::<i64, _>(2) }))
    .collect();
    let planejado: Vec<Value> = sqlx::query(&format!(
        "SELECT pp.codigo_produto, COALESCE(p.descricao, pp.descricao, ''), pp.data_planejada::text, pp.quantidade_planejada::float8, \
                COALESCE(pp.unidade, 'kg'), pp.ordem_status \
         FROM producao_planejamento_semanal pp JOIN produtos p ON p.codigo = TRIM(pp.codigo_produto) \
         LEFT JOIN overrides_produtos o ON o.codigo = p.codigo \
         WHERE {LINHA_EFETIVA_SQL} = $1 AND pp.ordem_status IN ('planejado', 'aprovado') AND pp.data_planejada >= CURRENT_DATE \
         ORDER BY pp.data_planejada, pp.codigo_produto LIMIT 200"
    ))
    .bind(prefixo)
    .fetch_all(pool)
    .await?
    .iter()
    .map(|r| json!({ "codigo": r.get::<String, _>(0), "descricao": r.get::<String, _>(1), "data": r.get::<String, _>(2), "quantidade": r.get::<f64, _>(3), "unidade": r.get::<String, _>(4), "situacao": r.get::<String, _>(5) }))
    .collect();
    let na_fila: Vec<Value> = sqlx::query(&format!(
        "SELECT f.codigo_produto, COALESCE(p.descricao, f.descricao), f.quantidade::float8, f.unidade, f.origem_demanda \
         FROM producao_fila_demandas f JOIN produtos p ON p.codigo = TRIM(f.codigo_produto) \
         LEFT JOIN overrides_produtos o ON o.codigo = p.codigo WHERE {LINHA_EFETIVA_SQL} = $1 \
         ORDER BY f.prioridade, f.codigo_produto LIMIT 200"
    ))
    .bind(prefixo)
    .fetch_all(pool)
    .await?
    .iter()
    .map(|r| json!({ "codigo": r.get::<String, _>(0), "descricao": r.get::<String, _>(1), "quantidade": r.get::<f64, _>(2), "unidade": r.get::<String, _>(3), "origem": r.get::<String, _>(4) }))
    .collect();

    Ok(json!({
        "prefixo": prefixo,
        "nomeLinha": nome,
        "vendas": { "porMes": vendas_mensais, "total12m": total_12m, "maisVendem": mais_vendem },
        "estoque": {
            "produtosNaDemanda": itens.len(), "estoqueTotal": estoque_total, "emProducao": em_producao,
            "abaixoDoGatilho": abaixo.len(), "faltasTotal": faltas_total,
            "listaAbaixoDoGatilho": abaixo.iter().take(LIMITE_LISTA).map(|i| linha_item(i)).collect::<Vec<_>>(),
            "listaFaltas": faltas.iter().take(LIMITE_LISTA).map(|i| linha_item(i)).collect::<Vec<_>>(),
        },
        "producao": {
            "porMes": produzido,
            "planejado": planejado,
            "naFila": na_fila,
        },
        "observacoes": [
            "Vendas: unidades vendidas no ERP nos últimos 12 meses fechados (o mês corrente fica de fora); o Nexus guarda só o número do mês, não o ano.",
            "Estoque, gatilho e faltas seguem a Demanda de Produção: não entram kits, bases, coloração, apoio, produtos ocultos nem descontinuados/terceirizados.",
            "Abaixo do gatilho = situação Produzir Urgente ou Abrir Ordem na Demanda.",
        ],
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn doze_meses_cruzam_o_ano() {
        let v = ultimos_12_meses(NaiveDate::from_ymd_opt(2026, 2, 10).unwrap());
        assert_eq!(v.len(), 12);
        // em fevereiro/2026: fev/25 a jan/26 (mês corrente fica de fora, como no ERP)
        assert_eq!(v[0], (2025, 2));
        assert_eq!(v[11], (2026, 1));
        assert_eq!(v[10], (2025, 12));
    }
}

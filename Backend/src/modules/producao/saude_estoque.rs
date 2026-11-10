//! Saúde do Estoque (só leitura): classifica cada produto acabado e kit em Ruptura, Baixo, Adequado, Excesso
//! ou Sem giro. Plano em `decisions/plano-saude-do-estoque.md` (ai-memory).
//!
//! Não calcula número novo: estoque, média de vendas, ideal e "abaixo do gatilho" vêm da Demanda de Produção
//! (`calculo::listar_produtos`). Aqui só entram o que a Demanda não olha: o lado do excesso (acima de 2× o ideal)
//! e o movimento (vendas de 3 e 12 meses, última venda, última produção).
//! Decisões do Edson (2026-11-10): excesso = acima de 2× o ideal; sem giro = 180 dias sem venda.

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use chrono::{Datelike, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;

use crate::core::catalogo::{param, Acao};
use crate::core::db::Db;
use crate::core::regras_produto::{atendimento_efetivo, carregar_pais_categorias, categoria_raiz, e_base, gera_demanda};
use crate::handlers::imports::clean_product_code;
use crate::handlers::AppState;
use crate::models::{ProductCalculationResult, QueryParams};

/// Excesso: estoque acima de N vezes o estoque ideal.
pub const FATOR_EXCESSO: f64 = 2.0;
/// Sem giro: dias seguidos sem nenhuma venda (180 dias exatos já contam).
pub const DIAS_SEM_GIRO: i64 = 180;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/producao/saude-estoque", get(get_saude_estoque))
}

pub fn acoes() -> Vec<Acao> {
    vec![Acao::leitura(
        "classificar_saude_estoque",
        "producao",
        "Classifica cada produto acabado e kit em ruptura, baixo, adequado, excesso ou sem giro (sem giro = 180 dias sem venda; excesso = acima de 2x o estoque ideal), com cobertura em dias, excedente, vendas de 3 e 12 meses, última venda e última produção. Usa a mesma base da Demanda de Produção. Só leitura.",
        "/api/producao/saude-estoque",
        vec![
            param("situacao", "query", "texto", false, "ruptura, baixo, adequado, excesso, sem_giro ou especial (lançamento/encomenda/terceirizado)."),
            param("search", "query", "texto", false, "Busca por código ou descrição."),
        ],
    )]
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Situacao {
    Ruptura,
    Baixo,
    Adequado,
    Excesso,
    SemGiro,
    /// Lançamento, encomenda ou terceirizado: não geram demanda normal, aparecem só com o selo.
    Especial,
}

impl Situacao {
    pub fn chave(self) -> &'static str {
        match self {
            Situacao::Ruptura => "ruptura",
            Situacao::Baixo => "baixo",
            Situacao::Adequado => "adequado",
            Situacao::Excesso => "excesso",
            Situacao::SemGiro => "sem_giro",
            Situacao::Especial => "especial",
        }
    }
}

/// O que a classificação precisa saber de um produto (tudo já calculado pela Demanda ou pelo movimento).
#[derive(Debug, Clone)]
pub struct Entrada {
    /// Estoque da Demanda: estoque + em produção − pedidos em aberto (EFP).
    pub efp: f64,
    /// Estoque físico (ERP).
    pub estoque: f64,
    pub pedidos_aberto: f64,
    /// Estoque ideal da Demanda, em unidades.
    pub ideal: f64,
    /// A Demanda marcou o produto como "abrir ordem" ou "produzir urgente" (abaixo do gatilho).
    pub abaixo_do_gatilho: bool,
    /// Tem venda: média > 0, vendas nos 12 meses ou pedidos em aberto.
    pub tem_venda: bool,
    /// Dias desde a última venda; `None` = nunca vendeu.
    pub dias_sem_venda: Option<i64>,
    /// Dias desde a última entrada de produção; vale só para quem nunca vendeu (produto novo ainda sem venda).
    pub dias_desde_producao: Option<i64>,
    /// Lançamento, encomenda ou terceirizado.
    pub com_selo: bool,
}

/// Quanto o pedido em aberto passa do estoque físico (venda que hoje não se atende).
pub fn faltas_de_venda(estoque: f64, pedidos_aberto: f64) -> f64 {
    (pedidos_aberto - estoque.max(0.0)).max(0.0)
}

/// Ordem: selo, sem giro, ruptura, baixo, excesso, adequado.
pub fn classificar(e: &Entrada) -> Situacao {
    if e.com_selo {
        return Situacao::Especial;
    }
    // Nunca vendeu: conta desde a última produção (produto produzido há pouco não é parado); sem produção, é parado.
    let parado = e.dias_sem_venda.or(e.dias_desde_producao).map_or(true, |d| d >= DIAS_SEM_GIRO);
    if parado {
        return Situacao::SemGiro;
    }
    if e.tem_venda && (e.estoque <= 0.0 || faltas_de_venda(e.estoque, e.pedidos_aberto) > 0.0) {
        return Situacao::Ruptura;
    }
    if e.abaixo_do_gatilho {
        return Situacao::Baixo;
    }
    // Ideal zero (sem média de vendas e sem ideal manual): qualquer estoque positivo é excesso.
    let teto = e.ideal.max(0.0) * FATOR_EXCESSO;
    if e.efp > teto && e.efp > 0.0 {
        return Situacao::Excesso;
    }
    Situacao::Adequado
}

/// Janelas de vendas a partir do histórico de 12 meses fechados indexado pelo mês do calendário (1..12).
/// Devolve (últimos 3 meses fechados, últimos 12). Em novembro, os 3 são out, set e ago.
pub fn vendas_3_e_12_meses(por_mes: &[i64], mes_atual: u32) -> (i64, i64) {
    let valor = |m: u32| por_mes.get((m as usize).wrapping_sub(1)).copied().unwrap_or(0);
    let total12: i64 = (1..=12).map(valor).sum();
    let mut m3 = 0;
    for i in 1..=3u32 {
        let m = ((mes_atual + 12 - 1 - i) % 12) + 1;
        m3 += valor(m);
    }
    (m3, total12)
}

/// Tendência em %: média mensal dos últimos 3 meses contra a dos 12. `None` sem venda nos 12 meses.
pub fn tendencia_pct(vendas_3m: i64, vendas_12m: i64) -> Option<f64> {
    if vendas_12m <= 0 {
        return None;
    }
    let media3 = vendas_3m as f64 / 3.0;
    let media12 = vendas_12m as f64 / 12.0;
    Some(((media3 - media12) / media12 * 100.0 * 10.0).round() / 10.0)
}

/// Cobertura em dias (sem teto): estoque ÷ venda diária (média mensal ÷ 30). `None` sem média de vendas.
pub fn cobertura_dias(efp: f64, media_mensal: f64) -> Option<f64> {
    if media_mensal <= 0.0001 {
        return None;
    }
    Some((efp.max(0.0) / (media_mensal / 30.0) * 10.0).round() / 10.0)
}

#[derive(Debug, Serialize)]
pub struct ItemSaude {
    pub codigo: String,
    pub descricao: String,
    pub linha_prefix: String,
    pub nome_linha: String,
    /// "produto" ou "kit".
    pub tipo: &'static str,
    pub situacao: Situacao,
    /// "lancamento", "encomenda" ou "terceirizado" (quando aplicável).
    pub selo: Option<&'static str>,
    /// Situação cadastrada do produto (ativo, saindo_de_linha...).
    pub situacao_produto: Option<String>,
    pub estoque: i64,
    pub em_producao: i64,
    pub pedidos_aberto: i64,
    /// Estoque da Demanda (estoque + em produção − pedidos): a base da classificação.
    pub estoque_demanda: i64,
    pub ideal: i64,
    pub gatilho: i64,
    pub media_mensal: f64,
    pub cobertura_dias: Option<f64>,
    pub excedente: i64,
    pub vendas_3m: i64,
    pub vendas_12m: i64,
    pub tendencia_pct: Option<f64>,
    pub ultima_venda: Option<String>,
    pub dias_sem_venda: Option<i64>,
    pub ultima_producao: Option<String>,
    pub planejado: bool,
    pub na_fila: bool,
    pub faltas_venda: i64,
    pub status_demanda: String,
    pub producao_recomendada: i64,
}

#[derive(Debug, Default, Serialize)]
pub struct Contagens {
    pub ruptura: usize,
    pub baixo: usize,
    pub adequado: usize,
    pub excesso: usize,
    pub sem_giro: usize,
    pub especial: usize,
    pub total: usize,
}

impl Contagens {
    fn somar(&mut self, s: Situacao) {
        self.total += 1;
        match s {
            Situacao::Ruptura => self.ruptura += 1,
            Situacao::Baixo => self.baixo += 1,
            Situacao::Adequado => self.adequado += 1,
            Situacao::Excesso => self.excesso += 1,
            Situacao::SemGiro => self.sem_giro += 1,
            Situacao::Especial => self.especial += 1,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
pub struct Filtro {
    pub situacao: Option<String>,
    pub search: Option<String>,
}

/// Gatilho em unidades, no mesmo critério da Demanda: ideal manual (ou sem média) abre ordem abaixo do ideal;
/// os demais, no ponto de "abrir ordem" da linha.
pub fn gatilho_qtd(p: &ProductCalculationResult) -> f64 {
    let ideal_fixo = p.estoque_ideal_manual.is_some() || (p.media_vendas <= 0.001 && p.estoque_ideal_qtd > 0.0);
    if ideal_fixo { p.estoque_ideal_qtd } else { p.abrir_ordem_qtd }
}

struct Movimento {
    vendas_mes: HashMap<String, Vec<i64>>,
    ultima_venda: HashMap<String, NaiveDate>,
    ultima_producao: HashMap<String, String>,
    atendimento: HashMap<String, String>,
}

async fn carregar_movimento(db: &Db) -> Result<Movimento, String> {
    let pool = db.pool();
    let e = |m: &str, err: sqlx::Error| format!("Erro ao ler {m}: {err}");

    let mut vendas_mes: HashMap<String, Vec<i64>> = HashMap::new();
    let rows: Vec<(String, i32, i64)> = sqlx::query_as("SELECT codigo, mes, quantidade::bigint FROM historico_faturamento")
        .fetch_all(pool)
        .await
        .map_err(|x| e("vendas por mês", x))?;
    for (codigo, mes, qtd) in rows {
        if (1..=12).contains(&mes) {
            vendas_mes.entry(clean_product_code(&codigo)).or_insert_with(|| vec![0; 12])[(mes - 1) as usize] = qtd;
        }
    }

    // Última venda = pedido mais recente que não foi cancelado (em aberto ou faturado).
    let rows: Vec<(String, NaiveDate)> = sqlx::query_as(
        "SELECT soi.c_cod_prod, MAX(so.d_pedido::date) \
         FROM sales_order_items soi \
         JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido \
         WHERE TRIM(COALESCE(so.c_status, '')) NOT IN ('CA', '') AND soi.n_qtde > 0 \
         GROUP BY soi.c_cod_prod",
    )
    .fetch_all(pool)
    .await
    .map_err(|x| e("última venda", x))?;
    let mut ultima_venda = HashMap::new();
    for (codigo, data) in rows {
        let k = clean_product_code(&codigo);
        let atual = ultima_venda.entry(k).or_insert(data);
        if data > *atual {
            *atual = data;
        }
    }

    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT item_code, MAX(LEFT(date, 10)) FROM stock_movements \
         WHERE item_type = 'produto' AND movement_type = 'entrada' GROUP BY item_code",
    )
    .fetch_all(pool)
    .await
    .map_err(|x| e("última produção", x))?;
    let ultima_producao = rows.into_iter().map(|(c, d)| (clean_product_code(&c), d)).collect();

    let rows: Vec<(String, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT p.codigo, o.atendimento, cl.atendimento \
         FROM produtos p \
         LEFT JOIN overrides_produtos o ON o.codigo = p.codigo \
         LEFT JOIN config_linhas cl ON cl.linha_prefix = COALESCE(NULLIF(o.linha_prefix_manual, ''), p.linha_prefix)",
    )
    .fetch_all(pool)
    .await
    .map_err(|x| e("atendimento", x))?;
    let atendimento = rows
        .into_iter()
        .map(|(c, prod, linha)| (clean_product_code(&c), atendimento_efetivo(prod.as_deref(), linha.as_deref()).to_string()))
        .collect();

    Ok(Movimento { vendas_mes, ultima_venda, ultima_producao, atendimento })
}

/// Serviço: classifica os produtos acabados e kits (sem base, coloração, apoio nem inativos) na data `hoje`.
pub async fn classificar_saude(db: &Db, filtro: &Filtro, hoje: NaiveDate) -> Result<serde_json::Value, String> {
    // Mesma lista da Demanda de Produção, sem os filtros de tela: todos os regimes, kits e ocultos.
    let params = QueryParams {
        include_kits: Some(true),
        include_programadas: Some(true),
        show_hidden: Some(true),
        page: Some(1),
        limit: Some(1_000_000),
        ..Default::default()
    };
    let lista = crate::modules::producao::calculo::listar_produtos(db, &params).await?;
    let produtos: Vec<ProductCalculationResult> =
        serde_json::from_value(lista.get("items").cloned().unwrap_or_else(|| json!([]))).map_err(|e| format!("Lista da Demanda inesperada: {e}"))?;

    let mov = carregar_movimento(db).await?;
    let pais = carregar_pais_categorias(db.pool()).await.map_err(|e| format!("Erro ao ler categorias: {e}"))?;

    let termo = filtro.search.as_deref().map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty());
    let mut contagens = Contagens::default();
    let mut itens = Vec::new();

    for p in &produtos {
        let categoria = categoria_raiz(p.categoria_produto.as_deref().unwrap_or(""), &pais);
        let status_produto = p.status_produto.as_deref().unwrap_or("ativo");
        // Fora do escopo: base, coloração, apoio (depois) e o que já saiu do catálogo ou está escondido.
        if e_base(&p.codigo, &categoria, status_produto)
            || categoria == "cat_coloracao"
            || categoria == "cat_apoio"
            || p.status == "descontinuado"
            || status_produto == "descontinuado"
            || (p.visivel == Some(0) && status_produto != "terceirizado")
        {
            continue;
        }

        let chave = clean_product_code(&p.codigo);
        let atendimento = mov.atendimento.get(&chave).map(String::as_str).unwrap_or("estoque");
        let selo = if p.is_lancamento {
            Some("lancamento")
        } else if !gera_demanda(atendimento) {
            Some(if atendimento == "encomenda" { "encomenda" } else { "terceirizado" })
        } else if status_produto == "terceirizado" {
            Some("terceirizado")
        } else {
            None
        };

        let meses = mov.vendas_mes.get(&chave).map(Vec::as_slice).unwrap_or(&[]);
        let (vendas_3m, vendas_12m) = vendas_3_e_12_meses(meses, hoje.month());
        let ultima_venda = mov.ultima_venda.get(&chave).copied();
        let dias_sem_venda = ultima_venda.map(|d| (hoje - d).num_days().max(0));
        let ultima_producao = mov.ultima_producao.get(&chave).cloned();
        let faltas = faltas_de_venda(p.estoque as f64, p.pedidos_aberto as f64);
        let gatilho = gatilho_qtd(p);
        let efp = p.estoque_futuro_com_producao as f64;

        let situacao = classificar(&Entrada {
            efp,
            estoque: p.estoque as f64,
            pedidos_aberto: p.pedidos_aberto as f64,
            ideal: p.estoque_ideal_qtd,
            abaixo_do_gatilho: p.status == "critico" || p.status == "ordem",
            tem_venda: p.media_vendas > 0.0 || vendas_12m > 0 || p.pedidos_aberto > 0,
            dias_sem_venda,
            dias_desde_producao: ultima_producao.as_deref().and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok()).map(|d| (hoje - d).num_days().max(0)),
            com_selo: selo.is_some(),
        });

        if let Some(t) = &termo {
            if !p.codigo.to_lowercase().contains(t) && !p.descricao.to_lowercase().contains(t) {
                continue;
            }
        }
        // As contagens respeitam a busca, mas não o filtro de situação (as abas mostram todas).
        contagens.somar(situacao);
        if let Some(s) = filtro.situacao.as_deref().filter(|s| !s.is_empty() && *s != "todos") {
            if s != situacao.chave() {
                continue;
            }
        }

        let excedente = (efp - p.estoque_ideal_qtd.max(0.0) * FATOR_EXCESSO).max(0.0).round() as i64;
        itens.push(ItemSaude {
            codigo: p.codigo.clone(),
            descricao: p.descricao.clone(),
            linha_prefix: p.linha_prefix.clone(),
            nome_linha: p.nome_linha.clone(),
            tipo: if p.is_kit == Some(true) { "kit" } else { "produto" },
            situacao,
            selo,
            situacao_produto: p.status_produto.clone(),
            estoque: p.estoque,
            em_producao: p.producao,
            pedidos_aberto: p.pedidos_aberto,
            estoque_demanda: p.estoque_futuro_com_producao,
            ideal: p.estoque_ideal_qtd.round() as i64,
            gatilho: gatilho.round() as i64,
            media_mensal: (p.media_vendas * 10.0).round() / 10.0,
            cobertura_dias: cobertura_dias(efp, p.media_vendas),
            excedente: if situacao == Situacao::Excesso { excedente } else { 0 },
            vendas_3m,
            vendas_12m,
            tendencia_pct: tendencia_pct(vendas_3m, vendas_12m),
            ultima_venda: ultima_venda.map(|d| d.to_string()),
            dias_sem_venda,
            ultima_producao,
            planejado: p.planejado_semana == Some(true),
            na_fila: p.na_fila == Some(true),
            faltas_venda: faltas.round() as i64,
            status_demanda: p.status.clone(),
            producao_recomendada: p.producao_recomendada,
        });
    }

    Ok(json!({
        "gerado_em": hoje.to_string(),
        "regras": { "fator_excesso": FATOR_EXCESSO, "dias_sem_giro": DIAS_SEM_GIRO },
        "contagens": contagens,
        "itens": itens,
    }))
}

async fn get_saude_estoque(State(state): State<Arc<AppState>>, Query(filtro): Query<Filtro>) -> impl IntoResponse {
    let hoje = chrono::Local::now().date_naive();
    match classificar_saude(&state.db, &filtro, hoje).await {
        Ok(corpo) => (StatusCode::OK, Json(corpo)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> Entrada {
        Entrada {
            efp: 100.0,
            estoque: 100.0,
            pedidos_aberto: 0.0,
            ideal: 100.0,
            abaixo_do_gatilho: false,
            tem_venda: true,
            dias_sem_venda: Some(10),
            dias_desde_producao: None,
            com_selo: false,
        }
    }

    #[test]
    fn adequado_no_ideal() {
        assert_eq!(classificar(&base()), Situacao::Adequado);
    }

    #[test]
    fn excesso_so_acima_de_2x_o_ideal() {
        let mut e = base();
        e.efp = 200.0;
        assert_eq!(classificar(&e), Situacao::Adequado, "exatamente 2x ainda é adequado");
        e.efp = 201.0;
        assert_eq!(classificar(&e), Situacao::Excesso);
    }

    #[test]
    fn sem_giro_com_180_dias_exatos() {
        let mut e = base();
        e.dias_sem_venda = Some(179);
        assert_eq!(classificar(&e), Situacao::Adequado);
        e.dias_sem_venda = Some(180);
        assert_eq!(classificar(&e), Situacao::SemGiro);
    }

    #[test]
    fn nunca_vendeu_e_sem_giro() {
        let mut e = base();
        e.dias_sem_venda = None;
        e.tem_venda = false;
        assert_eq!(classificar(&e), Situacao::SemGiro);
        e.estoque = 0.0;
        e.efp = 0.0;
        assert_eq!(classificar(&e), Situacao::SemGiro, "sem estoque também: candidato a inativar");
    }

    #[test]
    fn nunca_vendeu_mas_produzido_ha_pouco_nao_e_parado() {
        let mut e = base();
        e.dias_sem_venda = None;
        e.tem_venda = false;
        e.dias_desde_producao = Some(30);
        assert_eq!(classificar(&e), Situacao::Adequado);
        e.dias_desde_producao = Some(180);
        assert_eq!(classificar(&e), Situacao::SemGiro);
        e.dias_desde_producao = None;
        assert_eq!(classificar(&e), Situacao::SemGiro, "nunca vendeu e nunca produziu");
    }

    #[test]
    fn sem_giro_vence_excesso_e_ruptura() {
        let mut e = base();
        e.dias_sem_venda = Some(400);
        e.efp = 1000.0;
        assert_eq!(classificar(&e), Situacao::SemGiro);
        e.estoque = 0.0;
        e.efp = 0.0;
        assert_eq!(classificar(&e), Situacao::SemGiro);
    }

    #[test]
    fn ruptura_com_estoque_zero_e_venda() {
        let mut e = base();
        e.estoque = 0.0;
        e.efp = 0.0;
        e.abaixo_do_gatilho = true;
        assert_eq!(classificar(&e), Situacao::Ruptura);
    }

    #[test]
    fn ruptura_por_falta_de_venda_mesmo_com_estoque() {
        let mut e = base();
        e.estoque = 50.0;
        e.pedidos_aberto = 80.0;
        e.efp = -30.0;
        assert_eq!(classificar(&e), Situacao::Ruptura);
        assert_eq!(faltas_de_venda(50.0, 80.0), 30.0);
    }

    #[test]
    fn estoque_zero_sem_venda_nao_e_ruptura() {
        let mut e = base();
        e.estoque = 0.0;
        e.efp = 0.0;
        e.tem_venda = false;
        e.ideal = 0.0;
        assert_eq!(classificar(&e), Situacao::Adequado);
    }

    #[test]
    fn baixo_vem_da_demanda() {
        let mut e = base();
        e.efp = 40.0;
        e.estoque = 40.0;
        e.abaixo_do_gatilho = true;
        assert_eq!(classificar(&e), Situacao::Baixo);
    }

    #[test]
    fn ideal_zero_com_estoque_e_excesso() {
        let mut e = base();
        e.ideal = 0.0;
        e.efp = 5.0;
        e.tem_venda = false;
        e.dias_sem_venda = Some(30);
        assert_eq!(classificar(&e), Situacao::Excesso);
        e.efp = 0.0;
        assert_eq!(classificar(&e), Situacao::Adequado);
    }

    #[test]
    fn media_zero_com_venda_recente_nao_trava() {
        let mut e = base();
        e.ideal = 0.0;
        e.efp = 0.0;
        e.estoque = 0.0;
        e.tem_venda = true;
        // vendeu há pouco, estoque zero: é ruptura, não erro
        assert_eq!(classificar(&e), Situacao::Ruptura);
    }

    #[test]
    fn selo_tira_de_ruptura_baixo_e_sem_giro() {
        let mut e = base();
        e.com_selo = true;
        e.estoque = 0.0;
        e.efp = 0.0;
        e.dias_sem_venda = None;
        e.abaixo_do_gatilho = true;
        assert_eq!(classificar(&e), Situacao::Especial);
    }

    #[test]
    fn janelas_de_vendas_em_novembro() {
        // meses 1..12 valem 1..12; em novembro (11) os 3 últimos fechados são out(10), set(9), ago(8)
        let v: Vec<i64> = (1..=12).collect();
        assert_eq!(vendas_3_e_12_meses(&v, 11), (10 + 9 + 8, 78));
        // em janeiro (1) são dez, nov, out
        assert_eq!(vendas_3_e_12_meses(&v, 1), (12 + 11 + 10, 78));
        // em fevereiro (2): jan, dez, nov
        assert_eq!(vendas_3_e_12_meses(&v, 2), (1 + 12 + 11, 78));
        assert_eq!(vendas_3_e_12_meses(&[], 5), (0, 0));
    }

    #[test]
    fn tendencia_e_cobertura() {
        assert_eq!(tendencia_pct(0, 0), None);
        assert_eq!(tendencia_pct(300, 1200), Some(0.0));
        assert_eq!(tendencia_pct(600, 1200), Some(100.0));
        assert_eq!(cobertura_dias(300.0, 0.0), None);
        assert_eq!(cobertura_dias(300.0, 100.0), Some(90.0));
        assert_eq!(cobertura_dias(-5.0, 100.0), Some(0.0));
    }
}

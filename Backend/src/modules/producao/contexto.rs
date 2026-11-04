//! Contexto do produto numa chamada só, para o agente do planejamento e para a tela: cadastro, estoque, vendas,
//! histórico de produção, o que já está na fila e no quadro, regras e anotações que valem e decisões lembradas.
//!
//! Não recalcula nada à parte: reusa o cálculo do Gerenciamento (`calculate_products`), os lotes abertos
//! (`production_reserve`), a listagem de lotes (`lotes::listar_lotes`), as regras (`regras`) e as decisões (`decisoes`).

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::core::acao::ErroApi;
use crate::core::catalogo::{param, Acao};
use crate::core::db::Db;
use crate::core::regras_produto::{e_base, peso_unitario_kg, unidades_do_lote};
use crate::handlers::imports::clean_product_code;
use crate::handlers::AppState;
use crate::models::{ProductCalculationResult, QueryParams};
use crate::modules::producao::calculo::{fetch_calculation_data, post_process_kit_only_production};
use crate::modules::producao::cobertura::store::{canon, hoje_brasil, intervalo_semana, semana_de};
use crate::modules::producao::gerenciamento::calculations::calculate_products;
use crate::modules::producao::{decisoes, lotes, regras};

/// Quantos lotes passados entram no contexto.
const ULTIMOS_LOTES: usize = 10;
/// Teto de ordens planejadas e de itens da fila por produto (a lista é curta por natureza).
const TETO_LISTA: i64 = 20;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/producao/produtos/:codigo/contexto", get(contexto_rota))
}

/// Ações do contexto do produto descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<Acao> {
    vec![Acao::leitura(
        "contexto_produto_producao",
        "producao",
        "Tudo o que o planejamento precisa saber de um produto numa chamada: cadastro (linha, base, peso unitário, produção recomendada, estoque ideal, lote mínimo, programada/fixa), estoque (atual, em produção, pedidos em aberto, EFP e dias de cobertura), vendas (média e últimos 12 meses), produção (últimos 10 lotes com rendimento, ordens da semana e das próximas, itens na fila), as regras e anotações que valem para ele e as decisões lembradas.",
        "/api/producao/produtos/:codigo/contexto",
        vec![param("codigo", "caminho", "texto", true, "Código do produto.")],
    )]
}

fn mesmo_codigo(a: &str, b: &str) -> bool {
    let (a, b) = (canon(a), canon(b));
    a == b || a.trim_start_matches('0') == b.trim_start_matches('0')
}

fn arredonda(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

/// Cadastro, estoque e vendas do produto a partir do cálculo do Gerenciamento.
fn dados_do_calculo(p: &ProductCalculationResult, vendas: &[i64], peso: Option<f64>) -> (Value, Value, Value) {
    let fixa = p.is_lancamento || p.lancamento_gatilho.is_some() || p.lancamento_estoque_maximo.is_some();
    // Oculto (produto ou linha oculta, ou status ignorado) não se produz: o cálculo cru ainda o marca como "Produzir Urgente".
    let oculto = p.visivel == Some(0);
    let cadastro = json!({
        "codigo": p.codigo,
        "descricao": p.descricao,
        "status": p.status_produto,
        "linha": { "prefixo": p.linha_prefix, "nome": p.nome_linha },
        "base": { "codigo": p.base_codigo, "nome": p.base },
        "pesoUnitarioKg": peso,
        "oculto": oculto,
        "producaoRecomendada": if oculto { 0 } else { p.producao_recomendada },
        "estoqueIdeal": arredonda(p.estoque_ideal_qtd),
        "loteMinimoKg": p.producao_minima_kg,
        "programada": {
            "ativa": p.is_producao_programada == Some(1),
            "disparo": p.producao_programada_disparo,
            "objetivo": p.producao_programada_objetivo,
        },
        "fixa": { "ativa": fixa, "gatilho": p.lancamento_gatilho, "estoqueMaximo": p.lancamento_estoque_maximo },
        "planejamento": {
            "processoTermico": p.processo_termico,
            "exclusivoNoDia": p.exclusivo_no_dia,
            "permiteBombona": p.permite_bombona,
            "diasAteEnvase": p.dias_ate_envase,
        },
    });
    let estoque = json!({
        "estoque": p.estoque,
        "emProducao": p.producao,
        "pedidosEmAberto": p.pedidos_aberto,
        "efp": p.estoque_futuro_com_producao,
        "diasCobertura": arredonda(p.duracao_dias),
        "situacao": if oculto { "Oculto" } else { p.status_label.as_str() },
    });
    let vendas = json!({
        "mediaMensal": arredonda(p.media_vendas),
        "desvioPadrao": arredonda(p.desvio_padrao),
        "ultimos12Meses": vendas,
    });
    (cadastro, estoque, vendas)
}

/// Lotes abertos do produto (em produção agora), pela regra de unidades dos lotes.
async fn lotes_abertos(pool: &PgPool, codigo: &str) -> Vec<Value> {
    crate::core::production_reserve::fetch_open_lotes_por_produto(pool)
        .await
        .into_iter()
        .filter(|l| mesmo_codigo(&l.item_code, codigo))
        .map(|l| json!({ "lote": l.lote, "data": l.data, "unidades": l.unidades }))
        .collect()
}

/// Últimos lotes produzidos do produto, com kg, unidades e se o rendimento deu desvio.
async fn ultimos_lotes(db: &Db, codigo: &str, peso: Option<f64>) -> Result<Vec<Value>, ErroApi> {
    let params = QueryParams { search: Some(codigo.to_string()), limit: Some(300), ..Default::default() };
    let todos = lotes::listar_lotes(db, &params).await.map_err(ErroApi::interno)?;
    Ok(todos
        .into_iter()
        .filter(|l| l.product_code.split(" / ").any(|c| mesmo_codigo(c, codigo)))
        .take(ULTIMOS_LOTES)
        .map(|l| {
            let (un, peso_desconhecido) = unidades_do_lote(None, l.quantity, peso);
            json!({
                "lote": l.lote_number,
                "data": l.date.split(['T', ' ']).next().unwrap_or(&l.date),
                "kg": arredonda(l.quantity),
                "unidades": (!peso_desconhecido).then_some(un),
                "status": l.custom_status.clone().unwrap_or(l.status),
                // true = a saída de insumos fugiu da fórmula (desvio); false = dentro da tolerância; ausente = sem dados
                "rendimentoComDesvio": l.yield_error,
            })
        })
        .collect())
}

/// Ordens do quadro da semana atual em diante (sem as canceladas).
async fn ordens_planejadas(pool: &PgPool, codigos: &[String]) -> Result<Vec<Value>, ErroApi> {
    let inicio = intervalo_semana(&semana_de(hoje_brasil())).map(|(ini, _)| ini).unwrap_or_else(hoje_brasil);
    let rows = sqlx::query(
        "SELECT id, to_char(data_planejada, 'YYYY-MM-DD') AS data, reator_id, quantidade_planejada::float8 AS kg, \
                COALESCE(ordem_status, 'planejado') AS status, NULLIF(TRIM(COALESCE(lote_erp, '')), '') AS lote_erp \
         FROM producao_planejamento_semanal \
         WHERE codigo_produto = ANY($1) AND data_planejada >= $2 AND COALESCE(ordem_status, 'planejado') <> 'cancelado' \
         ORDER BY data_planejada, COALESCE(ordem_sequencia, 1) LIMIT $3",
    )
    .bind(codigos)
    .bind(inicio)
    .bind(TETO_LISTA)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<String, _>("id"),
                "data": r.get::<Option<String>, _>("data"),
                "reator": r.get::<String, _>("reator_id"),
                "kg": r.get::<Option<f64>, _>("kg").map(arredonda),
                "status": r.get::<String, _>("status"),
                "loteErp": r.get::<Option<String>, _>("lote_erp"),
            })
        })
        .collect())
}

/// Itens do produto na Fila de Demandas.
async fn itens_na_fila(pool: &PgPool, codigos: &[String]) -> Result<Vec<Value>, ErroApi> {
    let rows = sqlx::query(
        "SELECT id, quantidade::float8 AS qtd, unidade, quantidade_kg::float8 AS kg, origem_demanda, prioridade, observacoes \
         FROM producao_fila_demandas WHERE codigo_produto = ANY($1) \
         ORDER BY COALESCE(prioridade, 1), created_at LIMIT $2",
    )
    .bind(codigos)
    .bind(TETO_LISTA)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<String, _>("id"),
                "quantidade": r.get::<Option<f64>, _>("qtd"),
                "unidade": r.get::<Option<String>, _>("unidade"),
                "kg": r.get::<Option<f64>, _>("kg").map(arredonda),
                "origem": r.get::<Option<String>, _>("origem_demanda"),
                "prioridade": r.get::<Option<i32>, _>("prioridade"),
                "observacoes": r.get::<Option<String>, _>("observacoes"),
            })
        })
        .collect())
}

/// Decisões lembradas do produto (de onde vem a base; por que saiu da fila).
async fn decisoes_do_produto(pool: &PgPool, codigos: &[String]) -> Vec<Value> {
    let mut out = Vec::new();
    for tipo in [decisoes::TIPO_BASE_FONTE, decisoes::TIPO_FILA_DESCARTADA] {
        for c in codigos {
            if let Ok(Some((valor, vezes))) = decisoes::atual(pool, tipo, c).await {
                out.push(json!({ "tipo": tipo, "chave": c, "valor": valor, "vezes": vezes }));
                break;
            }
        }
    }
    out
}

/// Serviço: o contexto do produto. A rota só repassa.
pub async fn contexto_produto(db: &Db, codigo: &str) -> Result<Value, ErroApi> {
    let pool = db.pool();
    let (products, stocks, fat_map, configs, overrides, _faltas) = fetch_calculation_data(db)
        .await
        .map_err(|e| ErroApi::interno(format!("Erro ao ler dados para cálculos: {e}")))?;
    let mut calculados = calculate_products(&products, &stocks, &fat_map, &configs, &overrides);
    let kits = db.get_kit_composition().await.unwrap_or_default();
    post_process_kit_only_production(&mut calculados, &kits);
    let p = calculados
        .iter()
        .find(|p| mesmo_codigo(&p.codigo, codigo))
        .ok_or_else(|| ErroApi::nao_encontrado(format!("Produto {codigo} não encontrado.")))?;

    let eh_base = e_base(&p.codigo, p.categoria_produto.as_deref().unwrap_or(""), p.status_produto.as_deref().unwrap_or(""));
    let peso = peso_unitario_kg(&p.descricao, eh_base);
    let vendas: Vec<i64> = fat_map.get(&p.codigo).cloned().unwrap_or_else(|| vec![0; 12]);
    let (cadastro, mut estoque, vendas) = dados_do_calculo(p, &vendas, peso);

    let mut codigos = vec![p.codigo.trim().to_string(), canon(&p.codigo), clean_product_code(codigo)];
    codigos.sort();
    codigos.dedup();

    estoque["lotesAbertos"] = json!(lotes_abertos(pool, &p.codigo).await);
    let producao = json!({
        "ultimosLotes": ultimos_lotes(db, &p.codigo, peso).await?,
        "ordensPlanejadas": ordens_planejadas(pool, &codigos).await?,
        "fila": itens_na_fila(pool, &codigos).await?,
    });
    let regras_que_valem = regras::regras_que_valem(pool, &p.codigo).await?;
    Ok(json!({
        "cadastro": cadastro,
        "estoque": estoque,
        "vendas": vendas,
        "producao": producao,
        "regras": regras_que_valem,
        "decisoes": decisoes_do_produto(pool, &codigos).await,
    }))
}

async fn contexto_rota(State(state): State<Arc<AppState>>, Path(codigo): Path<String>) -> Result<Response, ErroApi> {
    let v = contexto_produto(&state.db, codigo.trim()).await?;
    Ok((StatusCode::OK, Json(v)).into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codigo_casa_com_aspas_e_zeros() {
        assert!(mesmo_codigo("\"3.14.001\"", "3.14.001"));
        assert!(mesmo_codigo(" 03.14.001", "3.14.001"));
        assert!(!mesmo_codigo("3.14.001", "3.14.002"));
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn contexto_traz_cadastro_estoque_vendas_producao_e_regras() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        sqlx::raw_sql(include_str!("../../../supabase/078_producao_regras.sql")).execute(&pool).await.unwrap();
        let marca = format!("TCTX-{}", uuid::Uuid::new_v4().simple());
        let cod = format!("{marca}.001");
        sqlx::query("INSERT INTO produtos (codigo, descricao, linha_prefix, base, base_codigo, media_levantamento) VALUES ($1, 'SHAMPOO TESTE 500 ML', 'DEFAULT', 'BASE T', $2, 100)")
            .bind(&cod)
            .bind(format!("{marca}.B"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO estoque_atual (codigo, estoque, producao, pedidos_aberto) VALUES ($1, 40, 10, 0)").bind(&cod).execute(&pool).await.unwrap();
        for mes in 1..=12 {
            sqlx::query("INSERT INTO historico_faturamento (codigo, mes, quantidade) VALUES ($1, $2, $3)").bind(&cod).bind(mes).bind(mes * 10).execute(&pool).await.unwrap();
        }
        sqlx::query("INSERT INTO producao_fila_demandas (id, codigo_produto, descricao, quantidade, unidade, quantidade_kg, origem_demanda) VALUES ($1, $2, 'SHAMPOO TESTE', 100, 'un', 50, 'manual')")
            .bind(format!("{marca}-fila"))
            .bind(&cod)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO producao_regras (escopo, alvo, tipo, texto) VALUES ('produto', $1, 'anotacao', $2)")
            .bind(&cod)
            .bind(format!("{marca} nota"))
            .execute(&pool)
            .await
            .unwrap();

        let db = Db::new(pool.clone());
        let v = contexto_produto(&db, &cod).await.unwrap();
        assert_eq!(v["cadastro"]["codigo"], cod);
        assert_eq!(v["cadastro"]["base"]["codigo"], format!("{marca}.B"));
        assert_eq!(v["cadastro"]["pesoUnitarioKg"], 0.5, "500 ML = 0,5 kg");
        assert_eq!(v["estoque"]["estoque"], 40);
        assert_eq!(v["estoque"]["emProducao"], 10);
        assert_eq!(v["vendas"]["ultimos12Meses"].as_array().unwrap().len(), 12);
        assert_eq!(v["vendas"]["ultimos12Meses"][11], 120);
        assert_eq!(v["producao"]["fila"].as_array().unwrap().len(), 1);
        assert_eq!(v["producao"]["fila"][0]["origem"], "manual");
        let regras = v["regras"].as_array().unwrap();
        assert!(regras.iter().any(|r| r["texto"] == format!("{marca} nota") && r["escopo"] == "produto"));
        assert_eq!(regras[0]["escopo"], "geral", "as gerais vêm primeiro");

        sqlx::query("INSERT INTO overrides_produtos (codigo, visivel) VALUES ($1, 0)").bind(&cod).execute(&pool).await.unwrap();
        let oculto = contexto_produto(&db, &cod).await.unwrap();
        assert_eq!(oculto["cadastro"]["oculto"], true);
        assert_eq!(oculto["cadastro"]["producaoRecomendada"], 0, "oculto não se produz");
        assert_eq!(oculto["estoque"]["situacao"], "Oculto");
        sqlx::query("DELETE FROM overrides_produtos WHERE codigo = $1").bind(&cod).execute(&pool).await.unwrap();

        assert_eq!(contexto_produto(&db, &format!("{marca}.NAO")).await.unwrap_err().codigo, "nao_encontrado");

        sqlx::query("DELETE FROM producao_fila_demandas WHERE id = $1").bind(format!("{marca}-fila")).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM producao_regras WHERE texto LIKE $1").bind(format!("{marca}%")).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM historico_faturamento WHERE codigo = $1").bind(&cod).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM produtos WHERE codigo = $1").bind(&cod).execute(&pool).await.unwrap();
    }
}

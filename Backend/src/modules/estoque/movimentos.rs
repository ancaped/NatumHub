//! Histórico de movimentação de um insumo: junta as 3 fontes que a tela do ERP mostra
//! (ENTDEVINS = acertos/ajustes, Lotes_Baixas = reservas por lote, Recebe_Insumos = entrada por NF)
//! e confere acertos suspeitos. Serviço reutilizável (tela e agentes); o handler só valida e chama.

use std::collections::HashMap;
use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use chrono::{Duration, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};

use crate::core::acao::ErroApi;
use crate::handlers::AppState;

/// Acerto/ajuste com |qtde| a partir deste valor é "grande" mesmo sem estoque de referência.
const LIMITE_ACERTO_GRANDE: f64 = 100.0;
/// ... ou a partir desta fração do estoque atual.
const FRACAO_ACERTO_GRANDE: f64 = 0.20;
const DIAS_PADRAO: i64 = 90;

// ---------------------------------------------------------------- funções puras

fn sem_acentos(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'Á' | 'À' | 'Â' | 'Ã' | 'á' | 'à' | 'â' | 'ã' => 'A',
            'É' | 'Ê' | 'é' | 'ê' => 'E',
            'Í' | 'í' => 'I',
            'Ó' | 'Ô' | 'Õ' | 'ó' | 'ô' | 'õ' => 'O',
            'Ú' | 'ú' => 'U',
            'Ç' | 'ç' => 'C',
            c => c.to_ascii_uppercase(),
        })
        .collect()
}

/// Classifica o motivo (texto livre da ENTDEVINS) em um tipo fixo.
pub fn normalizar_tipo(motivo: &str, _es: &str) -> &'static str {
    let m = sem_acentos(motivo);
    if m.contains("INVENTARIO") {
        "inventario"
    } else if m.contains("ACERTO") {
        "acerto"
    } else if m.contains("AJUSTE") {
        "ajuste"
    } else if m.contains("AMOSTRA") {
        "amostra"
    } else if m.contains("MONTAGEM") && m.contains("KIT") {
        "montagem_kit"
    } else if m.contains("RECEB") && m.contains("PRODUCAO") {
        "producao_interna"
    } else {
        "outro"
    }
}

/// `dRegistro` do ERP (aaaammdd). Descarta data inválida ou posterior a `hoje`.
pub fn converter_data_registro(s: &str, hoje: NaiveDate) -> Option<NaiveDate> {
    let s = s.trim();
    if s.len() != 8 || !s.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let d = NaiveDate::parse_from_str(s, "%Y%m%d").ok()?;
    (d <= hoje).then_some(d)
}

fn motivo_generico(motivo: &str) -> bool {
    let m = sem_acentos(motivo);
    matches!(
        m.trim(),
        "" | "ACERTO" | "AJUSTE" | "ACERTO DE ESTOQUE" | "AJUSTE DE ESTOQUE" | "AJUSTE ESTOQUE"
    )
}

fn tipo_de_acerto(tipo: &str) -> bool {
    matches!(tipo, "acerto" | "ajuste" | "inventario")
}

pub fn acerto_grande(qtde: f64, estoque_atual: Option<f64>) -> bool {
    let q = qtde.abs();
    if q >= LIMITE_ACERTO_GRANDE {
        return true;
    }
    matches!(estoque_atual, Some(e) if e > 0.0 && q >= e * FRACAO_ACERTO_GRANDE)
}

// ---------------------------------------------------------------- tipos

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Movimento {
    pub data: String,
    pub hora: String,
    /// "ajuste" (ENTDEVINS) | "lote" (Lotes_Baixas) | "nf" (Recebe_Insumos)
    pub origem: &'static str,
    pub es: String,
    pub tipo: String,
    pub qtde: f64,
    pub lote: Option<String>,
    pub lote_fornecedor: Option<String>,
    pub documento: Option<String>,
    pub usuario: Option<String>,
    pub motivo: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resumo {
    pub entradas: f64,
    pub saidas: f64,
    pub saldo_movimentos: f64,
    /// O Nexus guarda só o último estoque do item (stock_snapshots é substituído a cada leitura),
    /// então não há estoque por data: início e diferença ficam nulos.
    pub estoque_inicio: Option<f64>,
    pub estoque_fim: Option<f64>,
    pub diferenca: Option<f64>,
    pub estoque_atual: Option<f64>,
    pub acertos_sem_motivo: usize,
    pub acertos_grandes: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RespostaMovimentos {
    pub codigo: String,
    pub desde: String,
    pub ate: String,
    pub movimentos: Vec<Movimento>,
    pub resumo: Resumo,
}

fn montar_resumo(movs: &[Movimento], estoque_atual: Option<f64>, fim_hoje: bool) -> Resumo {
    let entradas: f64 = movs.iter().filter(|m| m.es == "E").map(|m| m.qtde).sum();
    let saidas: f64 = movs.iter().filter(|m| m.es == "S").map(|m| m.qtde).sum();
    let acertos = movs.iter().filter(|m| m.origem == "ajuste" && tipo_de_acerto(&m.tipo));
    let acertos_sem_motivo = acertos
        .clone()
        .filter(|m| m.tipo != "inventario" && motivo_generico(m.motivo.as_deref().unwrap_or("")))
        .count();
    let acertos_grandes = acertos.filter(|m| acerto_grande(m.qtde, estoque_atual)).count();
    Resumo {
        entradas,
        saidas,
        saldo_movimentos: entradas - saidas,
        estoque_inicio: None,
        estoque_fim: if fim_hoje { estoque_atual } else { None },
        diferenca: None,
        estoque_atual,
        acertos_sem_motivo,
        acertos_grandes,
    }
}

// ---------------------------------------------------------------- consulta

fn parse_data(campo: &str, v: &str) -> Result<NaiveDate, ErroApi> {
    NaiveDate::parse_from_str(v.trim(), "%Y-%m-%d")
        .map_err(|_| ErroApi::invalido(format!("'{campo}' deve estar no formato AAAA-MM-DD")))
}

fn erro_db(e: sqlx::Error) -> ErroApi {
    ErroApi::interno(format!("Falha ao consultar movimentos: {e}"))
}

pub async fn consultar_movimentos(
    pool: &PgPool,
    codigo: &str,
    desde: Option<&str>,
    ate: Option<&str>,
) -> Result<RespostaMovimentos, ErroApi> {
    let codigo = codigo.trim();
    if codigo.is_empty() {
        return Err(ErroApi::invalido("Código do insumo vazio"));
    }
    let hoje = Local::now().date_naive();
    let ate_d = match ate.filter(|s| !s.trim().is_empty()) {
        Some(v) => parse_data("ate", v)?,
        None => hoje,
    };
    let desde_d = match desde.filter(|s| !s.trim().is_empty()) {
        Some(v) => parse_data("desde", v)?,
        None => ate_d - Duration::days(DIAS_PADRAO),
    };
    if desde_d > ate_d {
        return Err(ErroApi::invalido("'desde' não pode ser depois de 'ate'"));
    }
    let (ds, as_) = (desde_d.format("%Y-%m-%d").to_string(), ate_d.format("%Y-%m-%d").to_string());
    // dLog do ERP tem lixo no futuro (anos 2708/2244): nada depois de hoje.
    let limite_baixas = as_.as_str().min(hoje.format("%Y-%m-%d").to_string().as_str()).to_string();

    let mut movs: Vec<Movimento> = Vec::new();

    let rows = sqlx::query(
        "SELECT data_mov::text, COALESCE(hora,''), COALESCE(es::text,''), tipo, qtde::float8, motivo, operador, lote_fornecedor, n_registro
         FROM erp_movimentos_insumos
         WHERE TRIM(referencia) = $1 AND data_mov BETWEEN $2::date AND $3::date",
    )
    .bind(codigo)
    .bind(&ds)
    .bind(&as_)
    .fetch_all(pool)
    .await
    .map_err(erro_db)?;
    for r in rows {
        let n: i64 = r.get(8);
        movs.push(Movimento {
            data: r.get(0),
            hora: r.get(1),
            origem: "ajuste",
            es: r.get(2),
            tipo: r.get(3),
            qtde: r.get(4),
            lote: None,
            lote_fornecedor: r.get(7),
            documento: Some(format!("Reg. {n}")),
            usuario: r.get(6),
            motivo: r.get(5),
        });
    }

    let rows = sqlx::query(
        "SELECT LEFT(dlog,10), COALESCE(SUBSTRING(dlog FROM 12 FOR 5),''), nlote, COALESCE(nqtde,0)::float8, cusuario, cjustificativa
         FROM lotes_baixas
         WHERE TRIM(creferencia) = $1 AND LEFT(dlog,10) BETWEEN $2 AND $3",
    )
    .bind(codigo)
    .bind(&ds)
    .bind(&limite_baixas)
    .fetch_all(pool)
    .await
    .map_err(erro_db)?;
    for r in rows {
        let lote: Option<i32> = r.get(2);
        movs.push(Movimento {
            data: r.get(0),
            hora: r.get(1),
            origem: "lote",
            es: "S".into(),
            tipo: "reserva_lote".into(),
            qtde: r.get(3),
            lote: lote.map(|l| l.to_string()),
            lote_fornecedor: None,
            documento: lote.map(|l| format!("Lote {l}")),
            usuario: r.get(4),
            motivo: r.get(5),
        });
    }

    let rows = sqlx::query(
        "SELECT data_entrada::text, quantidade::float8, nota_fiscal, fornecedor, lote_fornecedor, usuario
         FROM erp_recebimentos_insumos
         WHERE TRIM(codigo_insumo) = $1 AND data_entrada BETWEEN $2::date AND $3::date
           AND COALESCE(status_erp,'') <> 'CA'",
    )
    .bind(codigo)
    .bind(&ds)
    .bind(&as_)
    .fetch_all(pool)
    .await
    .map_err(erro_db)?;
    for r in rows {
        let nf: Option<i32> = r.get(2);
        movs.push(Movimento {
            data: r.get(0),
            hora: String::new(),
            origem: "nf",
            es: "E".into(),
            tipo: "entrada_nf".into(),
            qtde: r.get(1),
            lote: None,
            lote_fornecedor: r.get(4),
            documento: nf.map(|n| format!("NF {n}")),
            usuario: r.get(5),
            motivo: r.get(3),
        });
    }

    movs.sort_by(|a, b| (&b.data, &b.hora).cmp(&(&a.data, &a.hora)));

    let estoque_atual: Option<f64> = sqlx::query_scalar(
        "SELECT COALESCE(
            (SELECT stock_qty FROM stock_snapshots WHERE TRIM(item_code) = $1 ORDER BY snapshot_date DESC, id DESC LIMIT 1),
            (SELECT estoque::float8 FROM estoque_atual WHERE TRIM(codigo) = $1 LIMIT 1)
         )::float8",
    )
    .bind(codigo)
    .fetch_one(pool)
    .await
    .map_err(erro_db)?;

    let resumo = montar_resumo(&movs, estoque_atual, ate_d >= hoje);
    Ok(RespostaMovimentos { codigo: codigo.to_string(), desde: ds, ate: as_, movimentos: movs, resumo })
}

// ---------------------------------------------------------------- gravação (passo O do sync)

pub struct MovimentoErp {
    pub n_registro: i64,
    pub referencia: String,
    pub data_mov: NaiveDate,
    pub hora: String,
    pub es: String,
    pub qtde: f64,
    pub motivo: String,
    pub operador: String,
    pub lote_fornecedor: String,
}

/// Grava (upsert) os movimentos lidos da ENTDEVINS. Devolve quantas linhas distintas foram gravadas.
pub async fn gravar_movimentos(pool: &PgPool, lista: Vec<MovimentoErp>) -> Result<usize, sqlx::Error> {
    let mut unicos: HashMap<(i64, String), MovimentoErp> = HashMap::new();
    for m in lista {
        unicos.insert((m.n_registro, m.referencia.clone()), m);
    }
    let linhas: Vec<MovimentoErp> = unicos.into_values().collect();
    for chunk in linhas.chunks(1000) {
        let nulo = |s: &str| (!s.is_empty()).then(|| s.to_string());
        let reg: Vec<i64> = chunk.iter().map(|m| m.n_registro).collect();
        let refs: Vec<String> = chunk.iter().map(|m| m.referencia.clone()).collect();
        let datas: Vec<NaiveDate> = chunk.iter().map(|m| m.data_mov).collect();
        let horas: Vec<Option<String>> = chunk.iter().map(|m| nulo(&m.hora)).collect();
        let es: Vec<String> = chunk.iter().map(|m| m.es.clone()).collect();
        let qtdes: Vec<f64> = chunk.iter().map(|m| m.qtde).collect();
        let tipos: Vec<String> = chunk.iter().map(|m| normalizar_tipo(&m.motivo, &m.es).to_string()).collect();
        let motivos: Vec<Option<String>> = chunk.iter().map(|m| nulo(&m.motivo)).collect();
        let ops: Vec<Option<String>> = chunk.iter().map(|m| nulo(&m.operador)).collect();
        let lotes: Vec<Option<String>> = chunk.iter().map(|m| nulo(&m.lote_fornecedor)).collect();
        sqlx::query(
            "INSERT INTO erp_movimentos_insumos (n_registro, referencia, data_mov, hora, es, qtde, tipo, motivo, operador, lote_fornecedor)
             SELECT * FROM UNNEST($1::bigint[], $2::text[], $3::date[], $4::text[], $5::text[], $6::float8[], $7::text[], $8::text[], $9::text[], $10::text[])
             ON CONFLICT (n_registro, referencia) DO UPDATE SET
               data_mov = EXCLUDED.data_mov, hora = EXCLUDED.hora, es = EXCLUDED.es, qtde = EXCLUDED.qtde,
               tipo = EXCLUDED.tipo, motivo = EXCLUDED.motivo, operador = EXCLUDED.operador,
               lote_fornecedor = EXCLUDED.lote_fornecedor, importado_em = NOW()",
        )
        .bind(reg).bind(refs).bind(datas).bind(horas).bind(es).bind(qtdes).bind(tipos).bind(motivos).bind(ops).bind(lotes)
        .execute(pool)
        .await?;
    }
    Ok(linhas.len())
}

// ---------------------------------------------------------------- rota

#[derive(Deserialize)]
pub struct FiltroMovimentos {
    pub desde: Option<String>,
    pub ate: Option<String>,
}

async fn movimentos_do_insumo(
    State(state): State<Arc<AppState>>,
    Path(codigo): Path<String>,
    Query(f): Query<FiltroMovimentos>,
) -> Result<Json<RespostaMovimentos>, ErroApi> {
    consultar_movimentos(state.db.pool(), &codigo, f.desde.as_deref(), f.ate.as_deref())
        .await
        .map(Json)
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/estoque/insumos/:codigo/movimentos", get(movimentos_do_insumo))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tipos_normalizados() {
        assert_eq!(normalizar_tipo("ACERTO DE ESTOQUE", "E"), "acerto");
        assert_eq!(normalizar_tipo("AJUSTE ESTOQUE", "S"), "ajuste");
        assert_eq!(normalizar_tipo("ACERTO DE ESTOQUE - INVENTARIO", "E"), "inventario");
        assert_eq!(normalizar_tipo("Inventário geral", "E"), "inventario");
        assert_eq!(normalizar_tipo("AMOSTRA PARA RETEM", "S"), "amostra");
        assert_eq!(normalizar_tipo("MONTAGEM DO KIT 12", "S"), "montagem_kit");
        assert_eq!(normalizar_tipo("RECEB. PRODUCAO INTERNA", "E"), "producao_interna");
        assert_eq!(normalizar_tipo("Receb. Produção Interna", "E"), "producao_interna");
        assert_eq!(normalizar_tipo("", "S"), "outro");
        assert_eq!(normalizar_tipo("DEVOLUCAO", "E"), "outro");
    }

    #[test]
    fn data_do_registro() {
        let hoje = NaiveDate::from_ymd_opt(2026, 10, 24).unwrap();
        assert_eq!(converter_data_registro("20261024", hoje), NaiveDate::from_ymd_opt(2026, 10, 24));
        assert_eq!(converter_data_registro(" 20250301 ", hoje), NaiveDate::from_ymd_opt(2025, 3, 1));
        assert_eq!(converter_data_registro("20261025", hoje), None);
        assert_eq!(converter_data_registro("27080101", hoje), None);
        assert_eq!(converter_data_registro("20261340", hoje), None);
        assert_eq!(converter_data_registro("2026-10-1", hoje), None);
        assert_eq!(converter_data_registro("", hoje), None);
    }

    #[test]
    fn acerto_grande_e_motivo() {
        assert!(acerto_grande(150.0, None));
        assert!(acerto_grande(25.0, Some(100.0)));
        assert!(!acerto_grande(10.0, Some(100.0)));
        assert!(!acerto_grande(5.0, Some(0.0)));
        assert!(motivo_generico(""));
        assert!(motivo_generico("Acerto de Estoque"));
        assert!(!motivo_generico("contagem errada do dia 10"));
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn junta_tres_fontes_e_resume() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let limpar = |p: PgPool| async move {
            sqlx::query("DELETE FROM erp_movimentos_insumos WHERE referencia = 'TESTE.H1'").execute(&p).await.unwrap();
            sqlx::query("DELETE FROM lotes_baixas WHERE registro = 2147000101").execute(&p).await.unwrap();
            sqlx::query("DELETE FROM erp_recebimentos_insumos WHERE registro = 2147000102").execute(&p).await.unwrap();
        };
        limpar(pool.clone()).await;

        let hoje = Local::now().date_naive();
        let d = |n: i64| hoje - Duration::days(n);
        gravar_movimentos(
            &pool,
            vec![
                MovimentoErp { n_registro: 900001, referencia: "TESTE.H1".into(), data_mov: d(5), hora: "10:00".into(), es: "S".into(), qtde: 30.0, motivo: "ACERTO DE ESTOQUE".into(), operador: "ana".into(), lote_fornecedor: String::new() },
                MovimentoErp { n_registro: 900002, referencia: "TESTE.H1".into(), data_mov: d(2), hora: "08:30".into(), es: "E".into(), qtde: 200.0, motivo: "ajuste: contagem refeita".into(), operador: "bia".into(), lote_fornecedor: "LF1".into() },
            ],
        )
        .await
        .unwrap();
        sqlx::query("INSERT INTO lotes_baixas (registro, nlote, creferencia, nqtde, dlog, cusuario) VALUES (2147000101, 777, 'TESTE.H1', 40, $1, 'cid')")
            .bind(format!("{} 14:00:00", d(3)))
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO erp_recebimentos_insumos (registro, nota_fiscal, fornecedor, codigo_insumo, descricao_insumo, quantidade, data_entrada) VALUES (2147000102, 4321, 'Forn X', 'TESTE.H1', 'teste', 500, $1)")
            .bind(d(10))
            .execute(&pool).await.unwrap();

        let r = consultar_movimentos(&pool, "TESTE.H1", None, None).await;
        limpar(pool.clone()).await;
        let r = r.unwrap();

        let origens: Vec<&str> = r.movimentos.iter().map(|m| m.origem).collect();
        assert_eq!(origens, vec!["ajuste", "lote", "ajuste", "nf"]);
        assert_eq!(r.resumo.entradas, 700.0);
        assert_eq!(r.resumo.saidas, 70.0);
        assert_eq!(r.resumo.saldo_movimentos, 630.0);
        assert_eq!(r.resumo.acertos_sem_motivo, 1);
        assert_eq!(r.resumo.acertos_grandes, 1);
        assert!(r.resumo.estoque_inicio.is_none() && r.resumo.diferenca.is_none());
    }
}

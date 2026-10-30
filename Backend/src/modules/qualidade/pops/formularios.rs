//! Catálogo dos formulários da fase 1 (decisão de 2026-10-29).
//! Entra sozinho na primeira leitura. Código já existente não é regravado.

use std::sync::atomic::{AtomicBool, Ordering};

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{PgConnection, PgPool, Row};

use super::{eventos, store};
use crate::core::acao::ErroApi;
use crate::modules::estoque::escrita::{gravar_auditado, Resp};

static SEMEADO: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Formulario {
    pub code: String,
    pub pop_code: String,
    /// Título do POP vinculado (vazio se o POP ainda não existe).
    pub pop_title: Option<String>,
    pub title: String,
    pub previous_code: String,
    pub periodicity: String,
    pub areas: Vec<String>,
    pub fields: Vec<Campo>,
    pub limits: Option<String>,
    pub note: Option<String>,
    pub status: String,
    /// Revisão vigente (ou a última publicada). Formulário nunca publicado fica em 0.
    pub revision: i32,
    /// Número que a próxima publicação vai receber.
    pub next_revision: i32,
    /// Já teve alguma publicação (existe cópia em `pop_formulario_revisoes`).
    pub ja_publicado: bool,
    /// Publicado antes e hoje em rascunho/aprovação de uma nova revisão: a vigente continua valendo.
    pub em_revisao: bool,
    /// `portrait` ou `landscape`. Só o FOR-CQL-048 nasce deitado, como o Word de origem.
    pub orientation: String,
    /// Linhas em branco por folha; vazio = padrão da orientação (14 em pé, 8 deitado).
    pub rows_per_sheet: Option<i32>,
    pub effective_date: Option<String>,
    pub next_review_date: Option<String>,
    pub days_to_review: Option<i64>,
    pub elaborated_by: Option<String>,
    pub approved_by: Option<String>,
    pub approved_at: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Campo {
    pub label: String,
    pub kind: String,
    #[serde(default)]
    pub limit: Option<String>,
}

struct Seed {
    code: &'static str,
    pop: &'static str,
    title: &'static str,
    anterior: &'static str,
    per: &'static str,
    areas: &'static [&'static str],
    limits: Option<&'static str>,
    note: Option<&'static str>,
    campos: &'static [(&'static str, &'static str, Option<&'static str>)],
}

const SEED: &[Seed] = &[
    Seed { code: "FOR-CQL-012-01", pop: "POP-CQL-012", title: "Calibração do pHmetro", anterior: "FOR-CQL-012 v.01", per: "Por uso", areas: &[], limits: None, note: None,
        campos: &[("Data","data",None),("Hora","hora",None),("Slope (%)","número",Some("95–105 %")),("Conforme?","S/N",None),("Executado por","rubrica",None),("Verificado (CQ)","rubrica",None)] },
    Seed { code: "FOR-CQL-015-01", pop: "POP-CQL-015", title: "Registro de limpeza das áreas", anterior: "FOR-CQL-015 V.01 a V.11", per: "Diária",
        areas: &["Setor de embalagem","Salas de matérias-primas","Laboratório de pesagem e medidas","Laboratórios físico-químico e microbiológico","Área de produção","Setor de envase","Expedição","Escritório e sala de vendas","Banheiros e cozinha","Corredores, escadas e divisórias","Áreas externas"],
        limits: None, note: None,
        campos: &[("Data","data",None),("Superfície ou equipamento","texto",None),("Material utilizado","texto",None),("Executado por","rubrica",None),("Verificado (CQ)","rubrica",None)] },
    Seed { code: "FOR-CQL-017-01", pop: "POP-CQL-017", title: "Verificação diária de balança", anterior: "FOR-CQL-017 v.01", per: "Diária",
        areas: &["Pesagem","Físico-químico","Microbiológico","Envase"], limits: None, note: None,
        campos: &[("Dia","data",None),("Hora","hora",None),("Peso padrão (g)","número",None),("Resultado (g)","número",Some("± tolerância do POP")),("Conforme?","S/N",None),("Executado por","rubrica",None)] },
    Seed { code: "FOR-CQL-023-01", pop: "POP-CQL-023", title: "Condutividade da água deionizada", anterior: "FOR-CQL-023 v.01", per: "Diária", areas: &[], limits: None, note: None,
        campos: &[("Data","data",None),("Hora","hora",None),("Condutividade entrada","número",None),("Condutividade saída","número",Some("limite do POP")),("Conforme?","S/N",None),("Executado por","rubrica",None)] },
    Seed { code: "FOR-CQL-023-02", pop: "POP-CQL-023", title: "pH da água", anterior: "FOR-CQL-023 v.02", per: "Diária", areas: &[], limits: None, note: None,
        campos: &[("Data","data",None),("pH água deionizada","número",None),("pH água potável","número",None),("Conforme?","S/N",None),("Visto analista","rubrica",None)] },
    Seed { code: "FOR-CQL-035-01", pop: "POP-CQL-035", title: "Limpeza e sanitização – Balanças", anterior: "FOR-CQL-035 v.01", per: "Por uso",
        areas: &["Lab. pesagens e medidas","Lab. microbiológico","Lab. físico-químico","Envase"], limits: None, note: None,
        campos: &[("Data","data",None),("Material utilizado","texto",None),("Executado por","rubrica",None),("Verificado (CQ)","rubrica",None)] },
    Seed { code: "FOR-CQL-035-02", pop: "POP-CQL-035", title: "Limpeza e sanitização – pHmetro, viscosímetro e termômetro", anterior: "FOR-CQL-035 v.02", per: "Por uso", areas: &[], limits: None, note: None,
        campos: &[("Data","data",None),("Material utilizado","texto",None),("Executado por","rubrica",None),("Verificado (CQ)","rubrica",None)] },
    Seed { code: "FOR-CQL-035-03", pop: "POP-CQL-035", title: "Limpeza e sanitização – Ar-condicionado", anterior: "FOR-CQL-035 v.03 + v.06", per: "Mensal",
        areas: &["Lab. físico-químico","Lab. microbiológico","Lab. pesagens e medidas","Quarentena","Expedição"], limits: None,
        note: Some("Une v.03 e v.06, que eram o mesmo formulário."),
        campos: &[("Data","data",None),("Material utilizado","texto",None),("Executado por","rubrica",None),("Verificado (CQ)","rubrica",None)] },
    Seed { code: "FOR-CQL-035-04", pop: "POP-CQL-035", title: "Limpeza de autoclave", anterior: "FOR-CQL-035 v.04", per: "Por uso", areas: &[], limits: None, note: None,
        campos: &[("Data","data",None),("Material utilizado","texto",None),("Executado por","rubrica",None),("Verificado (CQ)","rubrica",None)] },
    Seed { code: "FOR-CQL-035-05", pop: "POP-CQL-035", title: "Limpeza e sanitização – Estufa bacteriológica (interna e externa)", anterior: "FOR-CQL-035 v.05", per: "Semanal", areas: &[], limits: None, note: None,
        campos: &[("Data","data",None),("Material utilizado","texto",None),("Executado por","rubrica",None),("Verificado (CQ)","rubrica",None)] },
    Seed { code: "FOR-CQL-035-06", pop: "POP-CQL-035", title: "Limpeza da caixa d'água e tubulações", anterior: "FOR-CQL-035 v.07", per: "Semestral", areas: &[], limits: None,
        note: Some("Vínculo com o POP-CQL-008 fica para uma revisão do POP. Por ora permanece no 035."),
        campos: &[("Data","data",None),("Material utilizado","texto",None),("Executado por","rubrica",None),("Verificado (CQ)","rubrica",None)] },
    Seed { code: "FOR-CQL-035-07", pop: "POP-CQL-035", title: "Limpeza e sanitização – Refrigerador (interno e externo)", anterior: "FOR-CQL-035 v.08", per: "Mensal", areas: &[], limits: None, note: None,
        campos: &[("Data","data",None),("Material utilizado","texto",None),("Executado por","rubrica",None),("Verificado (CQ)","rubrica",None)] },
    Seed { code: "FOR-CQL-048-01", pop: "POP-CQL-048", title: "Registro de temperatura e umidade", anterior: "FOR-CQL-048 v.01", per: "Diária", areas: &[],
        limits: Some("Temperatura: 20 a 35 °C · Umidade: 45 a 70 % · Geladeira: 4 a 8 °C"),
        note: Some("Umidade em %. O arquivo de origem escrevia ºc."),
        campos: &[("Dia","data",None),("Horário","hora",None),("Temp. momento","número",Some("20–35 °C")),("Temp. máx.","número",None),("Temp. mín.","número",None),("Umid. momento","número",Some("45–70 %")),("Umid. máx.","número",None),("Umid. mín.","número",None),("Conforme?","S/N",None),("Executado por","rubrica",None),("Verificado (CQ)","rubrica",None)] },
    Seed { code: "FOR-CQL-074-01", pop: "POP-CQL-074", title: "Troca de filtros – Exaustores", anterior: "FOR-CQL-076 v.01", per: "Por uso",
        areas: &["Setor a preencher na folha"], limits: None,
        note: Some("Era FOR-CQL-076; passa ao POP 074."),
        campos: &[("Data da troca","data",None),("Filtro","texto",None),("Executado por","rubrica",None),("Verificado (CQ)","rubrica",None)] },
    Seed { code: "FOR-CQL-029-01", pop: "POP-CQL-029", title: "Limpeza do reservatório de água deionizada", anterior: "FOR-CQL-083 v.0", per: "Semestral", areas: &[], limits: None,
        note: Some("Era FOR-CQL-083. O POP 083 não existe; fica no POP 029."),
        campos: &[("Data","data",None),("Material utilizado","texto",None),("Executado por","rubrica",None),("Verificado (CQ)","rubrica",None)] },
    Seed { code: "FOR-PRD-047-01", pop: "POP-PRD-047", title: "Limpeza e sanitização – Reatores/tanques de produção", anterior: "FOR-PRD-047 v.01/v.02 (reatores)", per: "Por uso", areas: &[],
        limits: Some("Limpeza comum: glutaraldeído 2% · Produtos coloridos: lauril 5% + Microstat 0,1% + água qsp · Produtos com odor forte: conforme POP"),
        note: None,
        campos: &[("Data","data",None),("Reator/tanque","texto",None),("Lote","texto",None),("Executado por","rubrica",None),("Verificado (CQ)","rubrica",None)] },
    Seed { code: "FOR-PRD-047-02", pop: "POP-PRD-047", title: "Limpeza e sanitização – Reservatórios", anterior: "FOR-PRD-047 v.01/v.03 (reservatórios)", per: "Por uso", areas: &[],
        limits: Some("Limpeza comum: glutaraldeído 2% · Produtos coloridos: lauril 5% + Microstat 0,1% + água qsp"),
        note: Some("Editável e Imprimir tinham colunas diferentes; aqui juntas."),
        campos: &[("Data","data",None),("Hora","hora",None),("Reservatório","texto",None),("Procedimento / produto anterior","texto",None),("Lote","texto",None),("Executado por","rubrica",None),("Verificado (CQ)","rubrica",None)] },
    Seed { code: "FOR-PRD-058-01", pop: "POP-PRD-058", title: "Limpeza da bomba de transferência", anterior: "FOR-PRD-058 v.01", per: "Por uso", areas: &[], limits: None,
        note: Some("Editável e Imprimir tinham colunas diferentes; aqui juntas."),
        campos: &[("Data","data",None),("Bomba","texto",None),("Procedimento","texto",None),("Lote","texto",None),("Executado por","rubrica",None),("Verificado (CQ)","rubrica",None)] },
    Seed { code: "FOR-PRD-058-02", pop: "POP-PRD-058", title: "Limpeza e sanitização – Tanques pulmão de acúmulo", anterior: "FOR-PRD-058 v.02", per: "Por uso", areas: &[], limits: None, note: None,
        campos: &[("Data","data",None),("Tanque pulmão nº","texto",None),("Procedimento","texto",None),("Executado por","rubrica",None),("Verificado (CQ)","rubrica",None)] },
];

/// FOR-CQL-048 é diário: o mês inteiro (31 linhas) numa folha em pé (decisão do Edson, 2026-10-30; deitada daria linhas de ~4 mm).
fn linhas_do_seed(code: &str) -> Option<i32> {
    if code == "FOR-CQL-048-01" { Some(31) } else { None }
}

fn campos_json(seed: &Seed) -> Value {
    json!(seed.campos.iter().map(|(label, kind, limit)| json!({
        "label": label, "kind": normalizar_tipo(kind), "limit": limit,
    })).collect::<Vec<_>>())
}

// ───────────────────────── regras puras ─────────────────────────

pub const TIPOS_COLUNA: &[&str] = &["data", "hora", "numero", "texto", "sim_nao", "rubrica"];
const MAX_COLUNAS: usize = 14;
const MAX_LINHAS_POR_FOLHA: i32 = 60;

/// Os tipos antigos do seed ("número", "S/N") passam aos nomes do editor.
pub fn normalizar_tipo(k: &str) -> String {
    match k.trim() {
        "número" => "numero".into(),
        "S/N" => "sim_nao".into(),
        outro => outro.to_string(),
    }
}

/// Rascunho → em aprovação → vigente → obsoleto; em aprovação volta a rascunho. Igual aos POPs.
pub fn transicao_permitida(de: &str, para: &str) -> bool {
    matches!(
        (de, para),
        ("draft", "in_review") | ("in_review", "draft") | ("published", "obsolete") | ("in_review", "obsolete")
    )
}

/// A primeira publicação é a Rev. 00; cada publicação seguinte (depois de "Nova revisão") soma 1.
pub fn revisao_ao_publicar(ja_publicado: bool, revisao_atual: i32) -> i32 {
    if ja_publicado {
        revisao_atual + 1
    } else {
        0
    }
}

/// Nome do evento na trilha para o status de destino.
pub fn evento_do_destino(destino: &str) -> &'static str {
    match destino {
        "in_review" => "enviado_aprovacao",
        "draft" => "devolvido",
        "obsolete" => "obsoleto",
        _ => "editado",
    }
}

/// Confere as colunas do editor: 1 a 14, rótulo preenchido, tipo conhecido.
pub fn validar_colunas(colunas: Vec<Campo>) -> Result<Vec<Campo>, String> {
    if colunas.is_empty() {
        return Err("O formulário precisa de pelo menos uma coluna.".into());
    }
    if colunas.len() > MAX_COLUNAS {
        return Err(format!("No máximo {MAX_COLUNAS} colunas por folha."));
    }
    let mut out = Vec::with_capacity(colunas.len());
    for c in colunas {
        let label = c.label.trim().to_string();
        if label.is_empty() {
            return Err("Toda coluna precisa de um rótulo.".into());
        }
        let kind = normalizar_tipo(&c.kind);
        if !TIPOS_COLUNA.contains(&kind.as_str()) {
            return Err(format!("Tipo de coluna inválido: {}.", c.kind));
        }
        let limit = c.limit.map(|l| l.trim().to_string()).filter(|l| !l.is_empty());
        out.push(Campo { label, kind, limit });
    }
    Ok(out)
}

/// 0 ou vazio = padrão da orientação; senão 1 a 60.
pub fn validar_linhas(v: Option<i32>) -> Result<Option<i32>, String> {
    match v {
        None | Some(0) => Ok(None),
        Some(n) if (1..=MAX_LINHAS_POR_FOLHA).contains(&n) => Ok(Some(n)),
        Some(_) => Err(format!("Linhas por folha: de 1 a {MAX_LINHAS_POR_FOLHA}.")),
    }
}

fn orientacao_valida(v: &str) -> Result<&'static str, ErroApi> {
    match v {
        "landscape" => Ok("landscape"),
        "portrait" | "" => Ok("portrait"),
        _ => Err(ErroApi::invalido("Orientação deve ser portrait ou landscape.")),
    }
}

pub(super) fn exigir_motivo(m: &str) -> Result<String, ErroApi> {
    let m = m.trim();
    if m.is_empty() {
        Err(ErroApi::invalido("Informe o motivo."))
    } else {
        Ok(m.to_string())
    }
}

// ───────────────────────── leitura ─────────────────────────

pub(super) async fn ensure(pool: &PgPool) -> Result<(), String> {
    if SEMEADO.load(Ordering::Relaxed) {
        return Ok(());
    }
    super::store::ensure_tables(pool).await?;
    eventos::garantir(pool).await?;

    for s in SEED {
        sqlx::query(
            r#"
            INSERT INTO pop_formularios
                (code, pop_code, title, previous_code, periodicity, areas, fields, limits, note, orientation, rows_per_sheet)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'portrait', $10)
            ON CONFLICT (code) DO NOTHING
            "#,
        )
        .bind(s.code)
        .bind(s.pop)
        .bind(s.title)
        .bind(s.anterior)
        .bind(s.per)
        .bind(json!(s.areas))
        .bind(campos_json(s))
        .bind(s.limits)
        .bind(s.note)
        .bind(linhas_do_seed(s.code))
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    SEMEADO.store(true, Ordering::Relaxed);
    Ok(())
}

const SELECT_FORM: &str = r#"
    SELECT f.*,
           (SELECT d.title FROM pop_documents d WHERE d.code = f.pop_code LIMIT 1) AS pop_title,
           EXISTS (SELECT 1 FROM pop_formulario_revisoes r WHERE r.code = f.code AND r.snapshot IS NOT NULL) AS ja_publicado
      FROM pop_formularios f
"#;

fn data_iso(d: Option<NaiveDate>) -> Option<String> {
    d.map(|d| d.format("%Y-%m-%d").to_string())
}

fn map_row(row: &sqlx::postgres::PgRow) -> Formulario {
    let areas: Value = row.try_get("areas").unwrap_or(json!([]));
    let fields: Value = row.try_get("fields").unwrap_or(json!([]));
    let status: String = row.get("status");
    let revision: i32 = row.get("revision");
    let ja_publicado: bool = row.try_get("ja_publicado").unwrap_or(false);
    let proxima: Option<NaiveDate> = row.try_get("next_review_date").unwrap_or(None);
    Formulario {
        code: row.get("code"),
        pop_code: row.get("pop_code"),
        pop_title: row.try_get("pop_title").unwrap_or(None),
        title: row.get("title"),
        previous_code: row.try_get("previous_code").unwrap_or_default(),
        periodicity: row.get("periodicity"),
        areas: areas.as_array().map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default(),
        fields: fields.as_array().map(|a| {
            a.iter().map(|v| Campo {
                label: v.get("label").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                kind: normalizar_tipo(v.get("kind").and_then(|x| x.as_str()).unwrap_or("texto")),
                limit: v.get("limit").and_then(|x| x.as_str()).map(str::to_string),
            }).collect()
        }).unwrap_or_default(),
        limits: row.try_get("limits").unwrap_or(None),
        note: row.try_get("note").unwrap_or(None),
        em_revisao: ja_publicado && matches!(status.as_str(), "draft" | "in_review"),
        next_revision: revisao_ao_publicar(ja_publicado, revision),
        ja_publicado,
        status,
        revision,
        orientation: row.try_get("orientation").unwrap_or_else(|_| "portrait".into()),
        rows_per_sheet: row.try_get("rows_per_sheet").unwrap_or(None),
        effective_date: data_iso(row.try_get("effective_date").unwrap_or(None)),
        next_review_date: data_iso(proxima),
        days_to_review: proxima.map(|d| (d - store::today()).num_days()),
        elaborated_by: row.try_get("elaborated_by").unwrap_or(None),
        approved_by: row.try_get("approved_by").unwrap_or(None),
        approved_at: row
            .try_get::<Option<DateTime<Utc>>, _>("approved_at")
            .unwrap_or(None)
            .map(|d| d.to_rfc3339()),
        updated_at: row
            .try_get::<DateTime<Utc>, _>("updated_at")
            .map(|d| d.to_rfc3339())
            .unwrap_or_default(),
    }
}

/// Lê um formulário; `travar` segura a linha até o fim da transação (mudança de status concorrente).
pub(super) async fn buscar(conn: &mut PgConnection, code: &str, travar: bool) -> Result<Formulario, ErroApi> {
    let sql = format!("{SELECT_FORM} WHERE f.code = $1{}", if travar { " FOR UPDATE OF f" } else { "" });
    let row = sqlx::query(&sql)
        .bind(code)
        .fetch_optional(&mut *conn)
        .await?
        .ok_or_else(|| ErroApi::nao_encontrado("Formulário não encontrado."))?;
    Ok(map_row(&row))
}

pub async fn listar(pool: &PgPool) -> Result<Vec<Formulario>, String> {
    ensure(pool).await?;
    let rows = sqlx::query(&format!("{SELECT_FORM} ORDER BY f.code"))
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(map_row).collect())
}

/// Formulário + histórico de revisões (com a cópia de cada publicação) + trilha de eventos.
pub async fn detalhar(pool: &PgPool, code: &str) -> Result<Value, ErroApi> {
    ensure(pool).await.map_err(ErroApi::interno)?;
    let mut conn = pool.acquire().await?;
    let f = buscar(&mut conn, code, false).await?;
    let rows = sqlx::query(
        r#"
        SELECT id, revision, pop_code, title, orientation, motivo, created_by, created_at, snapshot
          FROM pop_formulario_revisoes WHERE code = $1
         ORDER BY revision DESC, created_at DESC
        "#,
    )
    .bind(code)
    .fetch_all(&mut *conn)
    .await?;
    let revisoes: Vec<Value> = rows
        .iter()
        .map(|r| {
            let snapshot: Option<Value> = r.try_get("snapshot").unwrap_or(None);
            json!({
                "id": r.get::<String, _>("id"),
                "revision": r.get::<i32, _>("revision"),
                "popCode": r.get::<String, _>("pop_code"),
                "title": r.get::<String, _>("title"),
                "orientation": r.get::<String, _>("orientation"),
                "motivo": r.get::<String, _>("motivo"),
                "createdBy": r.try_get::<Option<String>, _>("created_by").unwrap_or(None),
                "createdAt": r.get::<DateTime<Utc>, _>("created_at").to_rfc3339(),
                "temCopia": snapshot.is_some(),
                "snapshot": snapshot,
            })
        })
        .collect();
    let trilha = eventos::listar(pool, "formulario", code).await.map_err(ErroApi::interno)?;
    let mut v = serde_json::to_value(&f).map_err(|e| ErroApi::interno(e.to_string()))?;
    v["revisoes"] = json!(revisoes);
    v["eventos"] = json!(trilha);
    Ok(v)
}

// ───────────────────────── escritas (2 passos + auditoria + evento) ─────────────────────────

pub(super) fn para_json(f: &Formulario) -> Result<Value, ErroApi> {
    serde_json::to_value(f).map_err(|e| ErroApi::interno(e.to_string()))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NovoFormulario {
    pub code: String,
    pub pop_code: String,
    pub title: String,
    pub periodicity: String,
    pub orientation: Option<String>,
    /// Alternativa ao `?confirmar=true` (tela antiga).
    pub confirmar: Option<bool>,
}

/// Cria o rascunho (Rev. 00 quando for publicado). Evento `criado`.
pub async fn criar(pool: &PgPool, input: NovoFormulario, autor: &str, confirmar: bool) -> Resp {
    ensure(pool).await.map_err(ErroApi::interno)?;
    let code = input.code.trim().to_uppercase();
    let pop = input.pop_code.trim().to_uppercase();
    let title = input.title.trim().to_string();
    if code.is_empty() || pop.is_empty() || title.is_empty() {
        return Err(ErroApi::invalido("Informe código, POP vinculado e título."));
    }
    if !code.starts_with("FOR-") || !pop.starts_with("POP-") {
        return Err(ErroApi::invalido("Código FOR-… vinculado a um POP-…"));
    }
    let orientation = orientacao_valida(input.orientation.as_deref().unwrap_or("portrait"))?;
    let per = if input.periodicity.trim().is_empty() {
        "Por uso".to_string()
    } else {
        input.periodicity.trim().to_string()
    };
    let entrada = json!({ "code": code, "popCode": pop, "title": title, "orientation": orientation, "periodicity": per });
    let quem = autor.to_string();
    let alvo = code.clone();
    gravar_auditado(pool, "criar_formulario_pop", autor, &alvo, entrada, confirmar, move |c| {
        Box::pin(async move {
            let existe: Option<String> = sqlx::query_scalar("SELECT code FROM pop_formularios WHERE code = $1")
                .bind(&code)
                .fetch_optional(&mut *c)
                .await?;
            if existe.is_some() {
                return Err(ErroApi::conflito("Já existe formulário com esse código. Abra uma nova revisão dele."));
            }
            let campos = json!([
                {"label": "Data", "kind": "data", "limit": null},
                {"label": "Executado por", "kind": "rubrica", "limit": null},
                {"label": "Verificado (CQ)", "kind": "rubrica", "limit": null},
            ]);
            sqlx::query(
                r#"
                INSERT INTO pop_formularios
                    (code, pop_code, title, previous_code, periodicity, areas, fields, orientation, status, revision)
                VALUES ($1, $2, $3, '', $4, '[]', $5, $6, 'draft', 0)
                "#,
            )
            .bind(&code)
            .bind(&pop)
            .bind(&title)
            .bind(&per)
            .bind(campos)
            .bind(orientation)
            .execute(&mut *c)
            .await?;
            eventos::registrar(&mut *c, "formulario", &code, "criado", None, Some("draft"), None, &quem).await?;
            para_json(&buscar(&mut *c, &code, false).await?)
        })
    })
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditarFormulario {
    pub title: Option<String>,
    pub pop_code: Option<String>,
    pub periodicity: Option<String>,
    pub orientation: Option<String>,
    pub areas: Option<Vec<String>>,
    /// Texto dos limites de aceitação; vazio apaga.
    pub limits: Option<String>,
    pub columns: Option<Vec<Campo>>,
    /// 0 volta ao padrão da orientação.
    pub rows_per_sheet: Option<i32>,
}

/// Edita o rascunho (formulário vigente só muda por "Nova revisão"). Evento `editado`.
pub async fn editar(pool: &PgPool, code: &str, input: EditarFormulario, autor: &str, confirmar: bool) -> Resp {
    ensure(pool).await.map_err(ErroApi::interno)?;
    let code = code.to_string();
    let colunas = input
        .columns
        .map(validar_colunas)
        .transpose()
        .map_err(ErroApi::invalido)?;
    let linhas = validar_linhas(input.rows_per_sheet).map_err(ErroApi::invalido)?;
    let orientacao = input.orientation.as_deref().map(orientacao_valida).transpose()?;
    let areas: Option<Vec<String>> = input
        .areas
        .map(|a| a.into_iter().map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect());
    if areas.as_ref().is_some_and(|a| a.len() > 30) {
        return Err(ErroApi::invalido("No máximo 30 áreas (uma folha por área)."));
    }
    let titulo = input.title.map(|t| t.trim().to_string());
    if titulo.as_deref() == Some("") {
        return Err(ErroApi::invalido("O título não pode ficar vazio."));
    }
    let pop = input.pop_code.map(|p| p.trim().to_uppercase());
    if let Some(p) = &pop {
        if !p.starts_with("POP-") {
            return Err(ErroApi::invalido("O vínculo precisa ser um código POP-…"));
        }
    }
    let periodicidade = input.periodicity.map(|p| p.trim().to_string()).filter(|p| !p.is_empty());
    let limites = input.limits.map(|l| l.trim().to_string());
    let reescrever_linhas = input.rows_per_sheet.is_some();
    let entrada = json!({ "code": code, "title": titulo, "popCode": pop, "orientation": orientacao, "linhasPorFolha": linhas });
    let quem = autor.to_string();
    let alvo = code.clone();
    gravar_auditado(pool, "editar_formulario_pop", autor, &alvo, entrada, confirmar, move |c| {
        Box::pin(async move {
            let atual = buscar(&mut *c, &code, true).await?;
            if atual.status != "draft" {
                return Err(ErroApi::regra(
                    "Só rascunho se edita. Formulário vigente muda por «Nova revisão»; em aprovação, devolva ao rascunho antes.",
                ));
            }
            if let Some(p) = &pop {
                if *p != atual.pop_code {
                    let existe: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM pop_documents WHERE code = $1)")
                        .bind(p)
                        .fetch_one(&mut *c)
                        .await?;
                    if !existe {
                        return Err(ErroApi::invalido(format!("POP não encontrado: {p}.")));
                    }
                }
            }
            sqlx::query(
                r#"
                UPDATE pop_formularios SET
                    title = COALESCE($2, title),
                    pop_code = COALESCE($3, pop_code),
                    periodicity = COALESCE($4, periodicity),
                    orientation = COALESCE($5, orientation),
                    areas = COALESCE($6, areas),
                    fields = COALESCE($7, fields),
                    limits = CASE WHEN $8::text IS NULL THEN limits ELSE NULLIF($8, '') END,
                    rows_per_sheet = CASE WHEN $9 THEN $10 ELSE rows_per_sheet END,
                    updated_at = NOW()
                WHERE code = $1
                "#,
            )
            .bind(&code)
            .bind(&titulo)
            .bind(&pop)
            .bind(&periodicidade)
            .bind(orientacao)
            .bind(areas.as_ref().map(|a| json!(a)))
            .bind(colunas.as_ref().map(|c| json!(c)))
            .bind(&limites)
            .bind(reescrever_linhas)
            .bind(linhas)
            .execute(&mut *c)
            .await?;
            eventos::registrar(&mut *c, "formulario", &code, "editado", Some("draft"), Some("draft"), None, &quem).await?;
            para_json(&buscar(&mut *c, &code, false).await?)
        })
    })
    .await
}

/// Envia para aprovação, devolve ao rascunho ou torna obsoleto. Motivo obrigatório. Publicar é a rota própria.
pub async fn mover_status(pool: &PgPool, code: &str, destino: &str, motivo: &str, autor: &str, confirmar: bool) -> Resp {
    ensure(pool).await.map_err(ErroApi::interno)?;
    let motivo = exigir_motivo(motivo)?;
    if destino == "published" {
        return Err(ErroApi::regra("Para aprovar e tornar vigente use «publicar»."));
    }
    let destino_s = destino.to_string();
    let code = code.to_string();
    let quem = autor.to_string();
    let entrada = json!({ "code": code, "destino": destino, "motivo": motivo });
    let alvo = code.clone();
    gravar_auditado(pool, "mover_status_formulario_pop", autor, &alvo, entrada, confirmar, move |c| {
        Box::pin(async move { mover_status_tx(&mut *c, &code, &destino_s, &motivo, &quem).await })
    })
    .await
}

/// Troca o status (na transação do 2 passos): valida a transição, grava e acrescenta o evento. `motivo` já validado.
pub(super) async fn mover_status_tx(c: &mut PgConnection, code: &str, destino: &str, motivo: &str, quem: &str) -> Result<Value, ErroApi> {
    let atual = buscar(&mut *c, code, true).await?;
    if !transicao_permitida(&atual.status, destino) {
        return Err(ErroApi::regra(format!("Não dá para ir de {} para {destino}.", atual.status)));
    }
    sqlx::query(
        "UPDATE pop_formularios SET status = $2, elaborated_by = CASE WHEN $2 = 'in_review' THEN $3 ELSE elaborated_by END, updated_at = NOW() WHERE code = $1",
    )
    .bind(code)
    .bind(destino)
    .bind(quem)
    .execute(&mut *c)
    .await?;
    eventos::registrar(&mut *c, "formulario", code, evento_do_destino(destino), Some(&atual.status), Some(destino), Some(motivo), quem).await?;
    para_json(&buscar(&mut *c, code, false).await?)
}

/// Aprova (só de «em aprovação»): vira vigente, grava vigência/próxima revisão/aprovador e a cópia no histórico.
pub async fn publicar(pool: &PgPool, code: &str, motivo: &str, autor: &str, confirmar: bool) -> Resp {
    ensure(pool).await.map_err(ErroApi::interno)?;
    let motivo = exigir_motivo(motivo)?;
    let code = code.to_string();
    let quem = autor.to_string();
    let entrada = json!({ "code": code, "motivo": motivo });
    let alvo = code.clone();
    gravar_auditado(pool, "publicar_formulario_pop", autor, &alvo, entrada, confirmar, move |c| {
        Box::pin(async move { publicar_tx(&mut *c, &code, &motivo, &quem).await })
    })
    .await
}

/// Publica na transação do 2 passos (só de «em aprovação»). `motivo` já validado.
pub(super) async fn publicar_tx(c: &mut PgConnection, code: &str, motivo: &str, quem: &str) -> Result<Value, ErroApi> {
    let atual = buscar(&mut *c, code, true).await?;
    if atual.status != "in_review" {
        return Err(ErroApi::regra("Só formulário «em aprovação» pode ser publicado. Envie para aprovação antes."));
    }
    let nova = revisao_ao_publicar(atual.ja_publicado, atual.revision);
    let vigencia = store::today();
    let proxima = store::proxima_revisao(vigencia);
    sqlx::query(
        r#"
        UPDATE pop_formularios SET
            status = 'published', revision = $2, effective_date = $3, next_review_date = $4,
            approved_by = $5, approved_at = NOW(), elaborated_by = COALESCE(elaborated_by, $5), updated_at = NOW()
        WHERE code = $1
        "#,
    )
    .bind(code)
    .bind(nova)
    .bind(vigencia)
    .bind(proxima)
    .bind(quem)
    .execute(&mut *c)
    .await?;
    let publicado = buscar(&mut *c, code, false).await?;
    sqlx::query(
        r#"
        INSERT INTO pop_formulario_revisoes (id, code, revision, pop_code, title, orientation, motivo, snapshot, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(code)
    .bind(nova)
    .bind(&publicado.pop_code)
    .bind(&publicado.title)
    .bind(&publicado.orientation)
    .bind(motivo)
    .bind(para_json(&publicado)?)
    .bind(quem)
    .execute(&mut *c)
    .await?;
    eventos::registrar(&mut *c, "formulario", code, "publicado", Some("in_review"), Some("published"), Some(motivo), quem).await?;
    para_json(&publicado)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisaoFormulario {
    pub pop_code: Option<String>,
    pub title: Option<String>,
    pub orientation: Option<String>,
    pub motivo: String,
    /// Alternativa ao `?confirmar=true` (tela antiga).
    pub confirmar: Option<bool>,
}

/// Abre o rascunho da próxima revisão a partir do vigente. A vigente segue valendo (e imprimindo) até publicar.
pub async fn nova_revisao(pool: &PgPool, code: &str, input: RevisaoFormulario, autor: &str, confirmar: bool) -> Resp {
    ensure(pool).await.map_err(ErroApi::interno)?;
    let motivo = exigir_motivo(&input.motivo)?;
    let pop = input.pop_code.map(|p| p.trim().to_uppercase()).filter(|p| !p.is_empty());
    if pop.as_deref().is_some_and(|p| !p.starts_with("POP-")) {
        return Err(ErroApi::invalido("O vínculo precisa ser um código POP-…"));
    }
    let titulo = input.title.map(|t| t.trim().to_string()).filter(|t| !t.is_empty());
    let orientacao = input.orientation.as_deref().map(orientacao_valida).transpose()?;
    let code = code.to_string();
    let quem = autor.to_string();
    let entrada = json!({ "code": code, "motivo": motivo });
    let alvo = code.clone();
    gravar_auditado(pool, "nova_revisao_formulario_pop", autor, &alvo, entrada, confirmar, move |c| {
        Box::pin(async move {
            let atual = buscar(&mut *c, &code, true).await?;
            if atual.status != "published" {
                return Err(ErroApi::regra("Só formulário vigente abre nova revisão."));
            }
            sqlx::query(
                r#"
                UPDATE pop_formularios SET status = 'draft',
                    pop_code = COALESCE($2, pop_code), title = COALESCE($3, title), orientation = COALESCE($4, orientation),
                    updated_at = NOW()
                WHERE code = $1
                "#,
            )
            .bind(&code)
            .bind(&pop)
            .bind(&titulo)
            .bind(orientacao)
            .execute(&mut *c)
            .await?;
            eventos::registrar(&mut *c, "formulario", &code, "nova_revisao", Some("published"), Some("draft"), Some(&motivo), &quem).await?;
            para_json(&buscar(&mut *c, &code, false).await?)
        })
    })
    .await
}

//! Catálogo dos formulários da fase 1 (decisão de 2026-10-29).
//! Entra sozinho na primeira leitura. Código já existente não é regravado.

use serde::Serialize;
use serde_json::{json, Value};
use sqlx::{PgPool, Row};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Formulario {
    pub code: String,
    pub pop_code: String,
    pub title: String,
    pub previous_code: String,
    pub periodicity: String,
    pub areas: Vec<String>,
    pub fields: Vec<Campo>,
    pub limits: Option<String>,
    pub note: Option<String>,
    pub status: String,
    pub revision: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Campo {
    pub label: String,
    pub kind: String,
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

fn campos_json(seed: &Seed) -> Value {
    json!(seed.campos.iter().map(|(label, kind, limit)| json!({
        "label": label, "kind": kind, "limit": limit,
    })).collect::<Vec<_>>())
}

async fn ensure(pool: &PgPool) -> Result<(), String> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS pop_formularios (
            code TEXT PRIMARY KEY,
            pop_code TEXT NOT NULL,
            title TEXT NOT NULL,
            previous_code TEXT,
            periodicity TEXT NOT NULL,
            areas JSONB NOT NULL DEFAULT '[]',
            fields JSONB NOT NULL DEFAULT '[]',
            limits TEXT,
            note TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            revision INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    for s in SEED {
        sqlx::query(
            r#"
            INSERT INTO pop_formularios
                (code, pop_code, title, previous_code, periodicity, areas, fields, limits, note)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn map_row(row: &sqlx::postgres::PgRow) -> Formulario {
    let areas: Value = row.try_get("areas").unwrap_or(json!([]));
    let fields: Value = row.try_get("fields").unwrap_or(json!([]));
    Formulario {
        code: row.get("code"),
        pop_code: row.get("pop_code"),
        title: row.get("title"),
        previous_code: row.try_get("previous_code").unwrap_or_default(),
        periodicity: row.get("periodicity"),
        areas: areas.as_array().map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default(),
        fields: fields.as_array().map(|a| {
            a.iter().map(|v| Campo {
                label: v.get("label").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                kind: v.get("kind").and_then(|x| x.as_str()).unwrap_or("texto").to_string(),
                limit: v.get("limit").and_then(|x| x.as_str()).map(str::to_string),
            }).collect()
        }).unwrap_or_default(),
        limits: row.try_get("limits").unwrap_or(None),
        note: row.try_get("note").unwrap_or(None),
        status: row.get("status"),
        revision: row.get("revision"),
    }
}

pub async fn listar(pool: &PgPool) -> Result<Vec<Formulario>, String> {
    ensure(pool).await?;
    let rows = sqlx::query("SELECT * FROM pop_formularios ORDER BY code")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(map_row).collect())
}

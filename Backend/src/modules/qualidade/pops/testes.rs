//! Testes do controle de documentos (formulários e trilha). Os com banco só rodam com
//! `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.

use sqlx::PgPool;

use super::formularios::{self, Campo, EditarFormulario, NovoFormulario};
use super::models::{DocumentInput, PublishInput};
use super::lote::{self, LoteFormularios, LotePops};
use super::{eventos, servicos, store};
use chrono::NaiveDate;

#[test]
fn transicoes_do_formulario_seguem_as_do_pop() {
    assert!(formularios::transicao_permitida("draft", "in_review"));
    assert!(formularios::transicao_permitida("in_review", "draft"));
    assert!(formularios::transicao_permitida("published", "obsolete"));
    assert!(formularios::transicao_permitida("in_review", "obsolete"));
    assert!(!formularios::transicao_permitida("draft", "published"));
    assert!(!formularios::transicao_permitida("draft", "obsolete"));
    assert!(!formularios::transicao_permitida("obsolete", "draft"));
    assert!(!formularios::transicao_permitida("published", "draft"));
    for (de, para) in [("draft", "in_review"), ("in_review", "draft"), ("published", "obsolete"), ("published", "published")] {
        assert_eq!(formularios::transicao_permitida(de, para), super::store::transicao_permitida(de, para), "{de}->{para}");
    }
}

#[test]
fn revisao_ao_publicar_comeca_em_00_e_soma_1() {
    assert_eq!(formularios::revisao_ao_publicar(false, 0), 0);
    assert_eq!(formularios::revisao_ao_publicar(true, 0), 1);
    assert_eq!(formularios::revisao_ao_publicar(true, 4), 5);
}

#[test]
fn evento_do_destino_nomeia_a_acao() {
    assert_eq!(formularios::evento_do_destino("in_review"), "enviado_aprovacao");
    assert_eq!(formularios::evento_do_destino("draft"), "devolvido");
    assert_eq!(formularios::evento_do_destino("obsolete"), "obsoleto");
    assert_eq!(super::store::evento_do_destino("obsolete"), "obsoleto");
}

fn col(label: &str, kind: &str) -> Campo {
    Campo { label: label.into(), kind: kind.into(), limit: None }
}

#[test]
fn colunas_validas_normalizam_tipo_e_recusam_vazio() {
    let ok = formularios::validar_colunas(vec![col(" Data ", "data"), col("Valor", "número"), col("Conf.", "S/N")]).unwrap();
    assert_eq!(ok[0].label, "Data");
    assert_eq!(ok[1].kind, "numero");
    assert_eq!(ok[2].kind, "sim_nao");
    assert!(formularios::validar_colunas(vec![]).is_err());
    assert!(formularios::validar_colunas(vec![col("  ", "texto")]).is_err());
    assert!(formularios::validar_colunas(vec![col("X", "inexistente")]).is_err());
    assert!(formularios::validar_colunas((0..15).map(|i| col(&format!("c{i}"), "texto")).collect()).is_err());
}

#[test]
fn linhas_por_folha_zero_volta_ao_padrao() {
    assert_eq!(formularios::validar_linhas(None), Ok(None));
    assert_eq!(formularios::validar_linhas(Some(0)), Ok(None));
    assert_eq!(formularios::validar_linhas(Some(27)), Ok(Some(27)));
    assert!(formularios::validar_linhas(Some(61)).is_err());
    assert!(formularios::validar_linhas(Some(-1)).is_err());
}

async fn pool_de_teste() -> PgPool {
    let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
    PgPool::connect(&url).await.unwrap()
}

fn sufixo() -> String {
    uuid::Uuid::new_v4().simple().to_string()[..8].to_uppercase()
}

fn acoes(trilha: &[eventos::Evento]) -> Vec<String> {
    // a trilha vem do mais novo ao mais antigo
    trilha.iter().rev().map(|e| e.acao.clone()).collect()
}

#[tokio::test]
#[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
async fn formulario_do_rascunho_ao_obsoleto_com_historico_e_trilha() {
    let pool = pool_de_teste().await;
    formularios::listar(&pool).await.unwrap();
    let n = sufixo();
    let (pop, code) = (format!("POP-ZZT-{n}"), format!("FOR-ZZT-{n}-01"));
    let quem = "Teste Automatizado";

    servicos::criar_documento(
        &pool,
        DocumentInput { code: pop.clone(), title: "POP de teste".into(), sector_id: "adm".into(), content: None, elaborated_by: None, reviewed_by: None, approved_by: None },
        quem,
        true,
    )
    .await
    .unwrap();

    let novo = || NovoFormulario { code: code.clone(), pop_code: pop.clone(), title: "Form de teste".into(), periodicity: "Diária".into(), orientation: None, confirmar: None };
    // prévia não grava
    let previa = formularios::criar(&pool, novo(), quem, false).await.unwrap();
    assert!(previa.previa);
    let existe: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pop_formularios WHERE code = $1").bind(&code).fetch_one(&pool).await.unwrap();
    assert_eq!(existe, 0);
    formularios::criar(&pool, novo(), quem, true).await.unwrap();
    assert!(formularios::criar(&pool, novo(), quem, true).await.is_err(), "código repetido");

    // editar: POP inexistente é recusado; colunas e linhas por folha entram
    let edicao = |pop_code: Option<String>, colunas: Vec<Campo>| EditarFormulario {
        title: None, pop_code, periodicity: None, orientation: None, areas: Some(vec!["A".into(), " ".into(), "B".into()]),
        limits: Some("pH 5 a 7".into()), columns: Some(colunas), rows_per_sheet: Some(27),
    };
    let tres = vec![col("Data", "data"), col("Valor", "numero"), col("Rubrica", "rubrica")];
    assert!(formularios::editar(&pool, &code, edicao(Some("POP-NAO-EXISTE-999".into()), tres.clone()), quem, true).await.is_err());
    let r = formularios::editar(&pool, &code, edicao(Some(pop.clone()), tres.clone()), quem, true).await.unwrap();
    assert_eq!(r.resultado["areas"].as_array().unwrap().len(), 2);
    assert_eq!(r.resultado["rowsPerSheet"], 27);

    // aprovação: motivo obrigatório; em aprovação não edita; publicar só de em aprovação
    assert!(formularios::mover_status(&pool, &code, "in_review", " ", quem, true).await.is_err());
    assert!(formularios::publicar(&pool, &code, "ok", quem, true).await.is_err(), "rascunho não publica");
    formularios::mover_status(&pool, &code, "in_review", "Pronto para aprovar", quem, true).await.unwrap();
    assert!(formularios::editar(&pool, &code, edicao(None, tres.clone()), quem, true).await.is_err());

    // prévia da publicação não grava
    let p = formularios::publicar(&pool, &code, "Primeira versão", quem, false).await.unwrap();
    assert!(p.previa);
    assert_eq!(p.resultado["revision"], 0);
    let d = formularios::detalhar(&pool, &code).await.unwrap();
    assert_eq!(d["status"], "in_review");
    assert_eq!(d["revisoes"].as_array().unwrap().len(), 0);

    // Rev. 00 vigente
    let p = formularios::publicar(&pool, &code, "Primeira versão", quem, true).await.unwrap();
    assert_eq!(p.resultado["revision"], 0);
    assert_eq!(p.resultado["status"], "published");
    assert_eq!(p.resultado["approvedBy"], quem);
    assert_eq!(p.resultado["effectiveDate"], super::store::today().format("%Y-%m-%d").to_string());
    assert_eq!(p.resultado["nextReviewDate"], super::store::proxima_revisao(super::store::today()).format("%Y-%m-%d").to_string());

    // nova revisão: rascunho; a vigente fica no histórico; edita colunas; publica Rev. 01
    let nr = formularios::nova_revisao(
        &pool, &code,
        formularios::RevisaoFormulario { pop_code: None, title: None, orientation: None, motivo: "Incluir coluna".into(), confirmar: None },
        quem, true,
    )
    .await
    .unwrap();
    assert_eq!(nr.resultado["status"], "draft");
    assert_eq!(nr.resultado["emRevisao"], true);
    assert_eq!(nr.resultado["nextRevision"], 1);
    let mut quatro = tres.clone();
    quatro.push(col("Obs.", "texto"));
    formularios::editar(&pool, &code, edicao(None, quatro), quem, true).await.unwrap();
    formularios::mover_status(&pool, &code, "in_review", "Revisão pronta", quem, true).await.unwrap();
    let p = formularios::publicar(&pool, &code, "Coluna de observação", quem, true).await.unwrap();
    assert_eq!(p.resultado["revision"], 1);

    // histórico: 2 cópias; a Rev. 00 ainda tem 3 colunas e a 01 tem 4
    let d = formularios::detalhar(&pool, &code).await.unwrap();
    let revs = d["revisoes"].as_array().unwrap();
    assert_eq!(revs.len(), 2);
    assert_eq!(revs[0]["revision"], 1);
    assert_eq!(revs[0]["snapshot"]["fields"].as_array().unwrap().len(), 4);
    assert_eq!(revs[1]["revision"], 0);
    assert_eq!(revs[1]["snapshot"]["fields"].as_array().unwrap().len(), 3);
    assert_eq!(revs[1]["snapshot"]["rowsPerSheet"], 27);

    // obsoleto
    formularios::mover_status(&pool, &code, "obsolete", "Substituído", quem, true).await.unwrap();
    let d = formularios::detalhar(&pool, &code).await.unwrap();
    assert_eq!(d["status"], "obsolete");
    assert!(formularios::mover_status(&pool, &code, "draft", "volta", quem, true).await.is_err());

    // trilha completa e imutável
    let trilha = eventos::listar(&pool, "formulario", &code).await.unwrap();
    assert_eq!(
        acoes(&trilha),
        ["criado", "editado", "enviado_aprovacao", "publicado", "nova_revisao", "editado", "enviado_aprovacao", "publicado", "obsoleto"]
    );
    assert_eq!(trilha[0].motivo.as_deref(), Some("Substituído"));
    assert!(trilha.iter().all(|e| e.usuario == quem));
    let apagar = sqlx::query("DELETE FROM pop_eventos WHERE tipo = 'formulario' AND ref = $1").bind(&code).execute(&pool).await;
    assert!(apagar.is_err(), "a trilha não se apaga");

    // limpeza do que o teste criou (a trilha fica)
    sqlx::query("DELETE FROM pop_formulario_revisoes WHERE code = $1").bind(&code).execute(&pool).await.unwrap();
    sqlx::query("DELETE FROM pop_formularios WHERE code = $1").bind(&code).execute(&pool).await.unwrap();
    sqlx::query("DELETE FROM pop_documents WHERE code = $1").bind(&pop).execute(&pool).await.unwrap();
}

#[tokio::test]
#[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
async fn pop_enviar_devolver_enviar_aprovar_preserva_os_motivos() {
    let pool = pool_de_teste().await;
    let n = sufixo();
    let pop = format!("POP-ZZT-{n}");
    let quem = "Teste Automatizado";

    let criado = servicos::criar_documento(
        &pool,
        DocumentInput { code: pop.clone(), title: "POP de teste".into(), sector_id: "adm".into(), content: None, elaborated_by: None, reviewed_by: None, approved_by: None },
        quem,
        false,
    )
    .await
    .unwrap();
    assert!(criado.previa);
    let existe: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pop_documents WHERE code = $1").bind(&pop).fetch_one(&pool).await.unwrap();
    assert_eq!(existe, 0, "a prévia não grava");

    let criado = servicos::criar_documento(
        &pool,
        DocumentInput { code: pop.clone(), title: "POP de teste".into(), sector_id: "adm".into(), content: None, elaborated_by: None, reviewed_by: None, approved_by: None },
        quem,
        true,
    )
    .await
    .unwrap();
    let id = criado.resultado["id"].as_str().unwrap().to_string();

    assert!(servicos::mover_status(&pool, &id, "in_review", "", quem, true).await.is_err(), "motivo obrigatório");
    servicos::mover_status(&pool, &id, "in_review", "m1 enviar", quem, true).await.unwrap();
    servicos::mover_status(&pool, &id, "draft", "m2 devolver", quem, true).await.unwrap();
    servicos::mover_status(&pool, &id, "in_review", "m3 enviar de novo", quem, true).await.unwrap();
    let r = servicos::publicar_documento(
        &pool, &id,
        PublishInput { effective_date: None, change_summary: Some("m4 aprovar".into()), content: None, elaborated_by: None, reviewed_by: None, approved_by: None },
        quem, true,
    )
    .await
    .unwrap();
    assert_eq!(r.resultado["status"], "published");

    let trilha = eventos::listar(&pool, "pop", &id).await.unwrap();
    assert_eq!(acoes(&trilha), ["criado", "enviado_aprovacao", "devolvido", "enviado_aprovacao", "publicado"]);
    let motivos: Vec<_> = trilha.iter().rev().map(|e| e.motivo.clone().unwrap_or_default()).collect();
    assert_eq!(motivos, ["", "m1 enviar", "m2 devolver", "m3 enviar de novo", "m4 aprovar"]);

    // o motivo não sobrescreve mais o resumo da versão em rascunho (rev. 0)
    let resumo: String = sqlx::query_scalar("SELECT change_summary FROM pop_versions WHERE document_id = $1 AND revision = 0")
        .bind(&id).fetch_one(&pool).await.unwrap();
    assert_eq!(resumo, "Rascunho inicial");

    sqlx::query("DELETE FROM pop_documents WHERE id = $1").bind(&id).execute(&pool).await.unwrap();
}

fn dia(a: i32, m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(a, m, d).unwrap()
}

#[test]
fn lote_so_aceita_rascunho_e_em_aprovacao() {
    assert!(lote::classificar_emissao("draft").is_ok());
    assert!(lote::classificar_emissao("in_review").is_ok());
    assert_eq!(lote::classificar_emissao("published"), Err("já vigente"));
    assert_eq!(lote::classificar_emissao("obsolete"), Err("obsoleto"));
    assert!(lote::classificar_emissao("xyz").is_err());
}

#[test]
fn emissao_inicial_mantem_revisao_e_vigencia_e_revisao_nova_soma_1() {
    let hoje = dia(2026, 10, 30);
    // inicial: Rev 08 e vigência do Word mantidas; próxima = +2 anos (já passou: não se inventa data)
    let d = store::decidir_publicacao(false, 8, Some(dia(2025, 9, 2)), None, hoje);
    assert_eq!((d.revisao, d.vigencia, d.proxima, d.inicial), (8, dia(2025, 9, 2), dia(2027, 9, 2), true));
    let d = store::decidir_publicacao(false, 2, Some(dia(2023, 1, 10)), None, hoje);
    assert!(d.proxima < hoje, "fica no passado e aparece como vencida");
    // sem vigência gravada: hoje; revisão 0 vira 1
    let d = store::decidir_publicacao(false, 0, None, None, hoje);
    assert_eq!((d.revisao, d.vigencia), (1, hoje));
    // vigência informada vence a gravada
    assert_eq!(store::decidir_publicacao(false, 8, Some(dia(2025, 9, 2)), Some(hoje), hoje).vigencia, hoje);
    // já publicado: +1 e vigência informada (ou hoje)
    let d = store::decidir_publicacao(true, 8, Some(dia(2025, 9, 2)), None, hoje);
    assert_eq!((d.revisao, d.vigencia, d.proxima, d.inicial), (9, hoje, dia(2028, 10, 29), false));
}

async fn novo_pop(pool: &PgPool, code: &str) -> String {
    let r = servicos::criar_documento(
        pool,
        DocumentInput { code: code.into(), title: "POP de lote".into(), sector_id: "adm".into(), content: None, elaborated_by: None, reviewed_by: None, approved_by: None },
        "Teste Automatizado",
        true,
    )
    .await
    .unwrap();
    r.resultado["id"].as_str().unwrap().to_string()
}

#[tokio::test]
#[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
async fn emitir_lote_de_pops_mantem_revisao_do_word_e_ignora_vigente() {
    let pool = pool_de_teste().await;
    let n = sufixo();
    let quem = "Teste Automatizado";
    let (c1, c2, c3) = (format!("POP-ZZL-{n}-1"), format!("POP-ZZL-{n}-2"), format!("POP-ZZL-{n}-3"));
    let (id1, id2, id3) = (novo_pop(&pool, &c1).await, novo_pop(&pool, &c2).await, novo_pop(&pool, &c3).await);

    // 1: veio do Word com Rev 08 e vigência 2025-09-02 (como a importação grava); 2: sem vigência; 3: já vigente
    sqlx::query("UPDATE pop_versions SET revision = 8, effective_date = '2025-09-02', next_review_date = '2027-09-02' WHERE document_id = $1").bind(&id1).execute(&pool).await.unwrap();
    sqlx::query("UPDATE pop_documents SET current_revision = 8, effective_date = '2025-09-02', next_review_date = '2027-09-02' WHERE id = $1").bind(&id1).execute(&pool).await.unwrap();
    servicos::mover_status(&pool, &id3, "in_review", "enviar", quem, true).await.unwrap();
    servicos::publicar_documento(
        &pool, &id3,
        PublishInput { effective_date: None, change_summary: Some("ok".into()), content: None, elaborated_by: None, reviewed_by: None, approved_by: None },
        quem, true,
    )
    .await
    .unwrap();

    let lote_de = |confirmar: bool, motivo: &str| {
        lote::emitir_pops(&pool, LotePops { ids: vec![id1.clone(), id2.clone(), id3.clone(), "nao-existe".into()], setor: None, motivo: motivo.into() }, quem, confirmar)
    };
    assert!(lote_de(true, " ").await.is_err(), "motivo obrigatório");
    let previa = lote_de(false, "Emissão inicial na codificação nova").await.unwrap();
    assert!(previa.previa);
    assert_eq!(previa.resultado["total"], 2);
    assert_eq!(previa.resultado["ignorados"].as_array().unwrap().len(), 2);
    let status: String = sqlx::query_scalar("SELECT status FROM pop_documents WHERE id = $1").bind(&id1).fetch_one(&pool).await.unwrap();
    assert_eq!(status, "draft", "a prévia não grava");

    let r = lote_de(true, "Emissão inicial na codificação nova").await.unwrap();
    assert_eq!(r.resultado["total"], 2);
    assert_eq!(r.resultado["vencidos"], 0);
    let e1 = &r.resultado["emitidos"][0];
    assert_eq!(e1["code"], c1.as_str());
    assert_eq!(e1["revisao"], 8);
    assert_eq!(e1["vigencia"], "2025-09-02");
    assert_eq!(e1["proximaRevisao"], "2027-09-02");
    let motivos: Vec<_> = r.resultado["ignorados"].as_array().unwrap().iter().map(|i| i["motivo"].as_str().unwrap().to_string()).collect();
    assert!(motivos.contains(&"já vigente".to_string()) && motivos.contains(&"não encontrado".to_string()));

    for id in [&id1, &id2] {
        let t = eventos::listar(&pool, "pop", id).await.unwrap();
        assert_eq!(acoes(&t), ["criado", "enviado_aprovacao", "publicado"]);
        assert!(t.iter().all(|e| e.usuario == quem));
    }
    // o vigente não ganhou eventos nem revisão
    assert_eq!(eventos::listar(&pool, "pop", &id3).await.unwrap().len(), 3);
    let (rev, eff, aprovador): (i32, String, Option<String>) = sqlx::query_as("SELECT current_revision, effective_date::text, approved_by FROM pop_documents WHERE id = $1").bind(&id1).fetch_one(&pool).await.unwrap();
    assert_eq!((rev, eff.as_str(), aprovador.as_deref()), (8, "2025-09-02", Some(quem)));
    let versoes: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pop_versions WHERE document_id = $1").bind(&id1).fetch_one(&pool).await.unwrap();
    assert_eq!(versoes, 1, "a versão do Word é atualizada no lugar");
    // sem vigência do Word: hoje, revisão mínima 1
    let (rev2, eff2): (i32, String) = sqlx::query_as("SELECT current_revision, effective_date::text FROM pop_documents WHERE id = $1").bind(&id2).fetch_one(&pool).await.unwrap();
    assert_eq!((rev2, eff2), (1, store::today().format("%Y-%m-%d").to_string()));

    for id in [&id1, &id2, &id3] {
        sqlx::query("DELETE FROM pop_documents WHERE id = $1").bind(id).execute(&pool).await.unwrap();
    }
}

#[tokio::test]
#[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
async fn emitir_lote_de_formularios_publica_rev_00_com_snapshot() {
    let pool = pool_de_teste().await;
    formularios::listar(&pool).await.unwrap();
    let n = sufixo();
    let quem = "Teste Automatizado";
    let pop = format!("POP-ZZF-{n}");
    novo_pop(&pool, &pop).await;
    let codes = [format!("FOR-ZZF-{n}-01"), format!("FOR-ZZF-{n}-02")];
    for c in &codes {
        formularios::criar(&pool, NovoFormulario { code: c.clone(), pop_code: pop.clone(), title: "Form de lote".into(), periodicity: "Diária".into(), orientation: None, confirmar: None }, quem, true)
            .await
            .unwrap();
    }
    // um deles já em aprovação: entra do mesmo jeito (um evento só a mais)
    formularios::mover_status(&pool, &codes[1], "in_review", "enviar", quem, true).await.unwrap();

    let entrada = |setor: Option<&str>| LoteFormularios { codes: if setor.is_some() { vec![] } else { codes.to_vec() }, setor: setor.map(String::from), motivo: "Emissão inicial".into() };
    let previa = lote::emitir_formularios(&pool, entrada(None), quem, false).await.unwrap();
    assert!(previa.previa);
    assert_eq!(previa.resultado["total"], 2);
    let r = lote::emitir_formularios(&pool, entrada(Some("zzf")), quem, true).await.unwrap();
    assert_eq!(r.resultado["total"], 2);
    for e in r.resultado["emitidos"].as_array().unwrap() {
        assert_eq!(e["revisao"], 0);
        assert_eq!(e["vigencia"], store::today().format("%Y-%m-%d").to_string());
    }
    // repetir: agora ambos são ignorados como já vigentes
    let de_novo = lote::emitir_formularios(&pool, entrada(None), quem, true).await.unwrap();
    assert_eq!(de_novo.resultado["total"], 0);
    assert_eq!(de_novo.resultado["ignorados"].as_array().unwrap().len(), 2);

    let t0 = eventos::listar(&pool, "formulario", &codes[0]).await.unwrap();
    assert_eq!(acoes(&t0), ["criado", "enviado_aprovacao", "publicado"]);
    let d = formularios::detalhar(&pool, &codes[1]).await.unwrap();
    assert_eq!(d["status"], "published");
    assert_eq!(d["revisoes"].as_array().unwrap().len(), 1);
    assert!(d["revisoes"][0]["snapshot"]["fields"].as_array().unwrap().len() >= 3);

    for c in &codes {
        sqlx::query("DELETE FROM pop_formulario_revisoes WHERE code = $1").bind(c).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM pop_formularios WHERE code = $1").bind(c).execute(&pool).await.unwrap();
    }
    sqlx::query("DELETE FROM pop_documents WHERE code = $1").bind(&pop).execute(&pool).await.unwrap();
}

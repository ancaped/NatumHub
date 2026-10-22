//! Carga da balança Toledo Prix 4 Due (MGV 7) a partir das matérias-primas (9.15.%) do Nexus.
//!
//! Substitui o `Gerar-Carga-Balanca.bat` + `export_balanca_toledo.js` do PC Qualidade: a tela de Ferramentas
//! mostra os itens, confirma os códigos rápidos novos e baixa o `ITENSMGV.TXT` para importar no MGV 7.
//! O código rápido (1..N) é permanente (`balanca_codigos`); item novo recebe o próximo só depois da confirmação.

pub mod mgv;
mod store;

use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::producao::auditoria;
use mgv::Grupo;
use store::ItemInsumo;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/ferramentas/balanca/itens", get(listar_rota))
        .route("/api/ferramentas/balanca/codigos", post(codigos_rota))
        .route("/api/ferramentas/balanca/itensmgv", get(itensmgv_rota))
}

fn erro(status: StatusCode, msg: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({ "error": msg.into() }))).into_response()
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ItemCarga {
    pub codigo_erp: String,
    pub codigo_sistema: String,
    pub codigo_rapido: i32,
    /// Ainda sem código rápido gravado: o número mostrado é o que será atribuído ao confirmar.
    pub novo: bool,
    pub nome_balanca: String,
    pub nome_completo: String,
    pub unidade: String,
    pub grupo: Grupo,
    #[serde(skip)]
    pub unidade_un: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NovoCodigo {
    pub codigo_erp: String,
    pub codigo_rapido: i32,
    pub nome: String,
}

pub struct Plano {
    /// Na ordem do código ERP, como sai na carga.
    pub itens: Vec<ItemCarga>,
    pub novos: Vec<NovoCodigo>,
}

/// Serviço puro: junta os itens do cadastro com os códigos rápidos já gravados e propõe os próximos.
pub fn planejar(itens: &[ItemInsumo], codigos: &HashMap<String, i32>) -> Plano {
    let mut ordenados: Vec<&ItemInsumo> = itens.iter().collect();
    ordenados.sort_by(|a, b| a.codigo.cmp(&b.codigo));
    let mut proximo = codigos.values().copied().max().unwrap_or(0) + 1;
    let mut out = Vec::with_capacity(ordenados.len());
    let mut novos = Vec::new();
    for it in ordenados {
        let nome = mgv::simplificar(&it.descricao, it.categoria.as_deref());
        let (codigo_rapido, novo) = match codigos.get(&it.codigo) {
            Some(c) => (*c, false),
            None => {
                let c = proximo;
                proximo += 1;
                novos.push(NovoCodigo { codigo_erp: it.codigo.clone(), codigo_rapido: c, nome: nome.clone() });
                (c, true)
            }
        };
        out.push(ItemCarga {
            codigo_erp: it.codigo.clone(),
            codigo_sistema: mgv::plu_sistema(&it.codigo),
            codigo_rapido,
            novo,
            nome_balanca: nome,
            nome_completo: it.descricao.clone(),
            unidade: if it.unidade.trim().is_empty() { "KG".into() } else { it.unidade.trim().to_uppercase() },
            grupo: mgv::classificar(&it.descricao, it.categoria.as_deref(), it.ignorado, &it.produtos_suspensos),
            unidade_un: it.unidade.trim().eq_ignore_ascii_case("UN"),
        });
    }
    Plano { itens: out, novos }
}

/// Conteúdo do ITENSMGV.TXT: 2 PLUs por item (código rápido e código do sistema), CRLF.
pub fn itensmgv(plano: &Plano) -> String {
    let mut s = String::new();
    for i in &plano.itens {
        s.push_str(&mgv::linha_mgv(i.unidade_un, &i.codigo_rapido.to_string(), &i.nome_balanca));
        s.push_str("\r\n");
        s.push_str(&mgv::linha_mgv(i.unidade_un, &i.codigo_sistema, &i.nome_balanca));
        s.push_str("\r\n");
    }
    s
}

fn chave_alfabetica(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ã' | 'Á' | 'À' | 'Â' | 'Ã' => 'a',
            'é' | 'ê' | 'É' | 'Ê' => 'e',
            'í' | 'Í' => 'i',
            'ó' | 'ô' | 'õ' | 'Ó' | 'Ô' | 'Õ' => 'o',
            'ú' | 'Ú' => 'u',
            'ç' | 'Ç' => 'c',
            _ => c.to_ascii_lowercase(),
        })
        .collect()
}

async fn plano_atual(pool: &sqlx::PgPool) -> Result<Plano, String> {
    let itens = store::carregar_itens(pool).await?;
    let codigos = store::carregar_codigos(pool).await?;
    Ok(planejar(&itens, &codigos))
}

async fn listar_rota(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let plano = match plano_atual(state.db.pool()).await {
        Ok(p) => p,
        Err(e) => return erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    };
    let grupo = |g: Grupo| {
        let mut v: Vec<&ItemCarga> = plano.itens.iter().filter(|i| i.grupo == g).collect();
        v.sort_by_key(|i| chave_alfabetica(&i.nome_balanca));
        v
    };
    (
        StatusCode::OK,
        Json(json!({
            "total": plano.itens.len(),
            "novosCodigos": plano.novos.len(),
            "grupos": {
                "ativos": grupo(Grupo::Ativos),
                "terceirizados": grupo(Grupo::Terceirizados),
                "inativos": grupo(Grupo::Inativos),
                "fragrancias": grupo(Grupo::Fragrancias),
            }
        })),
    )
        .into_response()
}

#[derive(Debug, Deserialize)]
pub struct CodigosBody {
    /// Sem `true` só devolve a prévia dos códigos que seriam atribuídos.
    #[serde(default)]
    pub confirmar: bool,
}

async fn codigos_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(b): Json<CodigosBody>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let plano = match plano_atual(pool).await {
        Ok(p) => p,
        Err(e) => return erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    };
    if !b.confirmar {
        return (
            StatusCode::OK,
            Json(json!({
                "previa": true, "acao": "atribuir_codigos_balanca", "novos": plano.novos,
                "confirmar": "repita com confirmar=true para gravar os códigos"
            })),
        )
            .into_response();
    }
    if plano.novos.is_empty() {
        return (StatusCode::OK, Json(json!({ "ok": true, "atribuidos": 0 }))).into_response();
    }
    match store::gravar_codigos(pool, &plano.novos).await {
        Ok(n) => {
            auditoria::registrar(
                pool,
                &ctx.display_name,
                "atribuir_codigos_balanca",
                &format!("{n} códigos"),
                json!({ "novos": plano.novos }),
            )
            .await;
            (StatusCode::OK, Json(json!({ "ok": true, "atribuidos": n }))).into_response()
        }
        Err(e) => erro(StatusCode::CONFLICT, e),
    }
}

#[derive(Debug, Deserialize)]
pub struct DownloadQuery {
    pub nome: Option<String>,
}

async fn itensmgv_rota(State(state): State<Arc<AppState>>, Query(_q): Query<DownloadQuery>) -> impl IntoResponse {
    let plano = match plano_atual(state.db.pool()).await {
        Ok(p) => p,
        Err(e) => return erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    };
    if !plano.novos.is_empty() {
        return erro(
            StatusCode::CONFLICT,
            format!("Há {} item(ns) sem código rápido. Confirme os códigos novos antes de baixar a carga.", plano.novos.len()),
        );
    }
    // todos os caracteres já são ASCII (o nome passa por `sanitizar`), então latin1 = bytes do texto
    let corpo = itensmgv(&plano).into_bytes();
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/plain; charset=iso-8859-1".to_string()),
            (header::CONTENT_DISPOSITION, "attachment; filename=\"ITENSMGV.TXT\"".to_string()),
        ],
        corpo,
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(codigo: &str, desc: &str, un: &str) -> ItemInsumo {
        ItemInsumo {
            codigo: codigo.into(),
            descricao: desc.into(),
            unidade: un.into(),
            categoria: None,
            ignorado: false,
            produtos_suspensos: Vec::new(),
        }
    }

    #[test]
    fn item_novo_recebe_o_proximo_codigo_sem_reaproveitar_buracos() {
        let mut codigos = HashMap::new();
        codigos.insert("9.15.001".to_string(), 1);
        codigos.insert("9.15.003".to_string(), 7); // 2..6 ficam livres e NÃO são reaproveitados
        let itens = vec![item("9.15.001", "AGUA", "KG"), item("9.15.002", "LAURIL", "KG"), item("9.15.004", "ATIVO", "KG")];
        let p = planejar(&itens, &codigos);
        assert_eq!(p.novos.len(), 2);
        assert_eq!((p.novos[0].codigo_erp.as_str(), p.novos[0].codigo_rapido), ("9.15.002", 8));
        assert_eq!((p.novos[1].codigo_erp.as_str(), p.novos[1].codigo_rapido), ("9.15.004", 9));
        assert!(p.itens.iter().find(|i| i.codigo_erp == "9.15.001").is_some_and(|i| !i.novo && i.codigo_rapido == 1));
    }

    #[test]
    fn carga_tem_dois_plus_por_item_e_unidade_define_o_tipo() {
        let mut codigos = HashMap::new();
        codigos.insert("9.15.001".to_string(), 1);
        codigos.insert("9.15.002".to_string(), 2);
        let p = planejar(&[item("9.15.001", "AGUA", "KG"), item("9.15.002", "FRASCO", "UN")], &codigos);
        let txt = itensmgv(&p);
        let linhas: Vec<&str> = txt.split("\r\n").filter(|l| !l.is_empty()).collect();
        assert_eq!(linhas.len(), 4);
        assert!(linhas.iter().all(|l| l.len() == 111));
        assert_eq!(&linhas[0][3..9], "000001");
        assert_eq!(&linhas[1][3..9], "915001");
        assert_eq!(&linhas[2][2..3], "1", "UN sai como unidade");
        assert!(txt.ends_with("\r\n"));
    }

    #[test]
    fn item_sem_unidade_vira_kg() {
        let p = planejar(&[item("9.15.001", "AGUA", " ")], &HashMap::new());
        assert_eq!(p.itens[0].unidade, "KG");
        assert!(!p.itens[0].unidade_un);
    }

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn plano_e_codigos_no_banco() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = sqlx::PgPool::connect(&url).await.unwrap();
        let limpar = || async {
            for q in [
                "DELETE FROM balanca_codigos WHERE codigo_erp LIKE '9.15.ZT%'",
                "DELETE FROM formulations WHERE product_code = 'ZT-PROD'",
                "DELETE FROM produtos WHERE codigo = 'ZT-PROD'",
                "DELETE FROM config_linhas WHERE linha_prefix = 'ZT-LINHA'",
                "DELETE FROM items WHERE code LIKE '9.15.ZT%'",
            ] {
                sqlx::query(q).execute(&pool).await.unwrap();
            }
        };
        limpar().await;
        for (c, d, u, ign) in [
            ("9.15.ZT1", "LAURIL LIQ CORROSIVO 25 KG", "KG", 0),
            ("9.15.ZT2", "ATIVO TERCEIRIZADO", "KG", 0),
            ("9.15.ZT3", "ATIVO INATIVO", "KG", 1),
        ] {
            sqlx::query("INSERT INTO items (code, description, unit, is_ignored) VALUES ($1, $2, $3, $4)")
                .bind(c)
                .bind(d)
                .bind(u)
                .bind(ign)
                .execute(&pool)
                .await
                .unwrap();
        }
        sqlx::query("INSERT INTO config_linhas (linha_prefix, nome_linha, visivel) VALUES ('ZT-LINHA', 'LINHA SUSPENSA', 0)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO produtos (codigo, descricao, linha_prefix) VALUES ('ZT-PROD', 'PRODUTO', 'ZT-LINHA')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO formulations (product_code, ingredient_code, quantity) VALUES ('ZT-PROD', '9.15.ZT2', 1)")
            .execute(&pool)
            .await
            .unwrap();

        let p = plano_atual(&pool).await.unwrap();
        let por = |c: &str| p.itens.iter().find(|i| i.codigo_erp == c).unwrap().clone();
        assert_eq!(por("9.15.ZT1").grupo, Grupo::Ativos);
        assert_eq!(por("9.15.ZT2").grupo, Grupo::Terceirizados, "só é usado por linha suspensa");
        assert_eq!(por("9.15.ZT3").grupo, Grupo::Inativos);
        assert!(p.novos.iter().any(|n| n.codigo_erp == "9.15.ZT1"), "item novo propõe código");
        assert_eq!(por("9.15.ZT1").nome_balanca, "LAURIL", "ruído técnico fora do nome");
        let max_antes = p.novos.iter().map(|n| n.codigo_rapido).min().unwrap();
        assert!(max_antes > 445, "os 434 códigos já em uso não são reaproveitados");

        // grava os novos; a segunda gravação do mesmo número é barrada pelo UNIQUE
        let novos: Vec<NovoCodigo> = p.novos.iter().filter(|n| n.codigo_erp.starts_with("9.15.ZT")).cloned().collect();
        assert_eq!(store::gravar_codigos(&pool, &novos).await.unwrap(), 3);
        assert!(store::gravar_codigos(&pool, &novos).await.is_err());
        let depois = plano_atual(&pool).await.unwrap();
        assert!(depois.itens.iter().filter(|i| i.codigo_erp.starts_with("9.15.ZT")).all(|i| !i.novo));
        limpar().await;
    }

    /// Teste de ouro, byte a byte: a carga real que já está na balança (434 itens, 2 PLUs cada, 868 linhas)
    /// tem de sair IDÊNTICA do código, a partir do mapeamento de códigos e das descrições do cadastro.
    #[test]
    fn carga_real_da_balanca_sai_identica_byte_a_byte() {
        let csv = include_str!("testdata/de_para_pesagem.csv");
        let ouro = include_str!("testdata/ITENSMGV.TXT").replace("\r\n", "\n");
        // tipo (0 = kg, 1 = un) gravado na carga real, por PLU
        let tipo_por_plu: HashMap<String, char> =
            ouro.lines().map(|l| (l[3..9].to_string(), l.chars().nth(2).unwrap())).collect();

        let mut itens = Vec::new();
        let mut codigos = HashMap::new();
        for l in csv.lines().skip(1) {
            let p: Vec<&str> = l.splitn(3, ',').collect();
            let (rapido, erp) = (p[0].trim(), p[1].trim());
            // 9.15.057 e 9.15.133 são entradas velhas (itens que não existem mais) que repetiam o código de outros
            if p.len() < 3 || p[2].trim().is_empty() {
                continue;
            }
            // o CSV antigo trocou por espaço a vírgula do nome deste item (o cadastro real tem a vírgula)
            let descricao = if erp == "9.15.292" { p[2].replace("1 4", "1,4") } else { p[2].to_string() };
            let un = tipo_por_plu[&format!("{:0>6}", rapido)] == '1';
            codigos.insert(erp.to_string(), rapido.parse::<i32>().unwrap());
            itens.push(ItemInsumo {
                codigo: erp.to_string(),
                descricao,
                unidade: if un { "UN".into() } else { "KG".into() },
                categoria: None,
                ignorado: false,
                produtos_suspensos: Vec::new(),
            });
        }
        assert_eq!(itens.len(), 434, "o cadastro de teste tem os 434 insumos da balança");

        let plano = planejar(&itens, &codigos);
        assert!(plano.novos.is_empty(), "todos já têm código rápido: nada novo para atribuir");
        let gerado = itensmgv(&plano).replace("\r\n", "\n");
        let esperado_linhas: Vec<&str> = ouro.lines().collect();
        let gerado_linhas: Vec<&str> = gerado.lines().collect();
        assert_eq!(gerado_linhas.len(), esperado_linhas.len(), "mesmo número de linhas (868)");
        // PLU -> linha, para comparar sem depender da ordem dos itens
        let por_plu = |ls: &[&str]| ls.iter().map(|l| (l[3..9].to_string(), l.to_string())).collect::<HashMap<_, _>>();
        let (g, o) = (por_plu(&gerado_linhas), por_plu(&esperado_linhas));
        let diferentes: Vec<String> = o.iter().filter(|(k, v)| g.get(*k) != Some(*v)).map(|(k, v)| format!("{k}: esperado {v:?} obtido {:?}", g.get(k))).collect();
        assert!(diferentes.is_empty(), "{} linhas diferentes:\n{}", diferentes.len(), diferentes.iter().take(5).cloned().collect::<Vec<_>>().join("\n"));
        // e o arquivo todo, na mesma ordem (itens por código do ERP, 2 PLUs cada), tem de bater byte a byte
        assert_eq!(gerado, ouro, "arquivo idêntico ao da balança");
    }
}

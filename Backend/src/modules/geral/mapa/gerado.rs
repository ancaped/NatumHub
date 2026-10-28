//! Ficha gerada do código: junta o que o `build.rs` extraiu (`extracao::Codigo`) com os módulos do mapa
//! (`frontend_path`, `backend_path`, `router_prefix`) e devolve, por módulo, telas, rotas, tabelas e
//! chamadas tela → rota; as chamadas entre módulos viram arestas automáticas (`auto: true`).

use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use super::extracao::{casa_rota, Codigo, Tela};
use super::models::MapaEdge;

const CODIGO_JSON: &str = include_str!(concat!(env!("OUT_DIR"), "/mapa_codigo.json"));

/// Mapa do código deste build (embutido no binário).
pub fn codigo() -> &'static Codigo {
    static C: OnceLock<Codigo> = OnceLock::new();
    C.get_or_init(|| serde_json::from_str(CODIGO_JSON).unwrap_or_default())
}

#[derive(Debug, Clone, Copy)]
pub struct ModuloRef<'a> {
    pub key: &'a str,
    pub frontend_path: Option<&'a str>,
    pub backend_path: Option<&'a str>,
    pub router_prefix: Option<&'a str>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RotaGerada {
    pub metodos: Vec<String>,
    pub caminho: String,
    pub arquivo: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabelasGeradas {
    pub le: Vec<String>,
    pub grava: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChamadaGerada {
    pub tela: String,
    pub rota: String,
    pub modulo_dono: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UsadoPor {
    pub modulo: String,
    pub tela: String,
    pub rota: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Gerado {
    pub rotas: Vec<RotaGerada>,
    pub tabelas: TabelasGeradas,
    pub telas: Vec<Tela>,
    pub chamadas: Vec<ChamadaGerada>,
    pub usado_por: Vec<UsadoPor>,
}

fn limpa(p: &str) -> String {
    p.trim().trim_start_matches("./").to_string()
}

fn e_arquivo(p: &str) -> bool {
    p.rsplit('/').next().map_or(false, |u| u.contains('.'))
}

/// Diretório com barra no fim, ou o próprio arquivo.
fn alvo_caminho(p: &str) -> String {
    let p = limpa(p);
    if e_arquivo(&p) || p.ends_with('/') {
        p
    } else {
        format!("{p}/")
    }
}

fn contem(alvo: &str, arquivo: &str) -> bool {
    if alvo.ends_with('/') {
        arquivo.starts_with(alvo)
    } else {
        arquivo == alvo
    }
}

/// Módulos "donos" de um arquivo do front: os de `frontend_path` mais específico (empate: todos).
fn donos_front<'a>(arquivo: &str, mods: &[ModuloRef<'a>]) -> Vec<&'a str> {
    let mut melhor = 0usize;
    let mut v: Vec<&str> = Vec::new();
    for m in mods {
        let Some(fp) = m.frontend_path.filter(|s| !s.trim().is_empty()) else { continue };
        let a = alvo_caminho(fp);
        if !contem(&a, arquivo) {
            continue;
        }
        if a.len() > melhor {
            melhor = a.len();
            v.clear();
        }
        if a.len() == melhor {
            v.push(m.key);
        }
    }
    v
}

/// Dono de uma rota. Vence quem tem o arquivo da rota como `backend_path` (e, se tiver prefixo, ele casa); depois, o maior
/// `router_prefix` que a contém (empate: `backend_path` mais específico); sem prefixo, o `backend_path` mais específico.
fn dono_da_rota<'a>(caminho: &str, arquivo: &str, mods: &[ModuloRef<'a>]) -> Option<&'a str> {
    let mut melhor: Option<((bool, usize, usize), &str)> = None;
    for m in mods {
        let prefixo = m.router_prefix.map(|s| s.trim().trim_end_matches('/')).filter(|s| !s.is_empty());
        let casa_prefixo = prefixo.map(|p| caminho == p || caminho.starts_with(&format!("{p}/")));
        let alvo_be = m.backend_path.filter(|s| !s.trim().is_empty()).map(alvo_caminho);
        let arquivo_exato = alvo_be.as_deref().map_or(false, |a| !a.ends_with('/') && a == arquivo);
        let pontua = match (casa_prefixo, arquivo_exato) {
            (Some(false), _) => continue,
            (Some(true), exato) => (exato, prefixo.map_or(0, str::len), alvo_be.filter(|a| contem(a, arquivo)).map_or(0, |a| a.len())),
            (None, true) => (true, 0, 0),
            (None, false) => continue,
        };
        if melhor.map_or(true, |(s, _)| pontua > s) {
            melhor = Some((pontua, m.key));
        }
    }
    if let Some((_, k)) = melhor {
        return Some(k);
    }
    let mut melhor: Option<(usize, &str)> = None;
    for m in mods {
        let Some(b) = m.backend_path.filter(|s| !s.trim().is_empty()) else { continue };
        let a = alvo_caminho(b);
        if contem(&a, arquivo) && melhor.map_or(true, |(l, _)| a.len() > l) {
            melhor = Some((a.len(), m.key));
        }
    }
    melhor.map(|(_, k)| k)
}

/// O arquivo e, se for `mod.rs`, o diretório dele; senão, o diretório irmão de mesmo nome (`planejamento.rs` → `planejamento/`).
fn expandir_arquivo(arquivo: &str) -> Vec<String> {
    let mut v = vec![arquivo.to_string()];
    if let Some(dir) = arquivo.strip_suffix("mod.rs") {
        v.push(dir.to_string());
    } else if let Some(stem) = arquivo.strip_suffix(".rs") {
        v.push(format!("{stem}/"));
    }
    v
}

fn nome_arquivo(p: &str) -> String {
    p.rsplit('/').next().unwrap_or(p).to_string()
}

pub struct Montado {
    pub por_modulo: BTreeMap<String, Gerado>,
    pub arestas: Vec<MapaEdge>,
}

pub fn montar(cod: &Codigo, mods: &[ModuloRef]) -> Montado {
    let mut por_modulo: BTreeMap<String, Gerado> = mods.iter().map(|m| (m.key.to_string(), Gerado::default())).collect();

    // Rotas e seus donos
    let donos_rota: Vec<Option<&str>> = cod.rotas.iter().map(|r| dono_da_rota(&r.caminho, &r.arquivo, mods)).collect();
    for (r, dono) in cod.rotas.iter().zip(&donos_rota) {
        if let Some(g) = dono.and_then(|d| por_modulo.get_mut(d)) {
            g.rotas.push(RotaGerada { metodos: r.metodos.clone(), caminho: r.caminho.clone(), arquivo: r.arquivo.clone() });
        }
    }

    // Tabelas: diretório exclusivo do módulo + arquivos que registram as rotas dele
    for m in mods {
        let mut escopo: BTreeSet<String> = BTreeSet::new();
        if let Some(b) = m.backend_path.filter(|s| !s.trim().is_empty()) {
            let a = alvo_caminho(b);
            let exclusivo = !mods
                .iter()
                .any(|o| o.key != m.key && o.backend_path.map_or(false, |ob| alvo_caminho(ob) == a));
            if a.ends_with('/') {
                if exclusivo {
                    escopo.insert(a);
                }
            } else {
                escopo.extend(expandir_arquivo(&a));
            }
        }
        for (r, dono) in cod.rotas.iter().zip(&donos_rota) {
            if *dono == Some(m.key) {
                escopo.extend(expandir_arquivo(&r.arquivo));
            }
        }
        let mut le = BTreeSet::new();
        let mut grava = BTreeSet::new();
        for f in &cod.sql {
            if escopo.iter().any(|a| contem(a, &f.arquivo)) {
                le.extend(f.le.iter().cloned());
                grava.extend(f.grava.iter().cloned());
            }
        }
        // o que o módulo grava não precisa aparecer também em "lê"
        let le: Vec<String> = le.into_iter().filter(|t| !grava.contains(t)).collect();
        if let Some(g) = por_modulo.get_mut(m.key) {
            g.tabelas = TabelasGeradas { le, grava: grava.into_iter().collect() };
        }
    }

    // Telas
    for t in &cod.telas {
        for d in donos_front(&t.arquivo, mods) {
            if let Some(g) = por_modulo.get_mut(d) {
                g.telas.push(t.clone());
            }
        }
    }

    // Chamadas tela → rota
    let mut pares: BTreeMap<(String, String), BTreeSet<String>> = BTreeMap::new();
    for c in &cod.chamadas {
        let melhor = cod
            .rotas
            .iter()
            .enumerate()
            .filter_map(|(i, r)| casa_rota(&c.caminho, &r.caminho).map(|n| (n, i)))
            .min();
        let Some((_, idx)) = melhor else { continue };
        let rota = &cod.rotas[idx];
        let dono = donos_rota[idx];
        for a in donos_front(&c.arquivo, mods) {
            let tela = nome_arquivo(&c.arquivo);
            if let Some(g) = por_modulo.get_mut(a) {
                let item = ChamadaGerada { tela: tela.clone(), rota: rota.caminho.clone(), modulo_dono: dono.map(str::to_string) };
                if !g.chamadas.contains(&item) {
                    g.chamadas.push(item);
                }
            }
            if let Some(b) = dono.filter(|b| *b != a) {
                if let Some(g) = por_modulo.get_mut(b) {
                    let item = UsadoPor { modulo: a.to_string(), tela, rota: rota.caminho.clone() };
                    if !g.usado_por.contains(&item) {
                        g.usado_por.push(item);
                    }
                }
                pares.entry((a.to_string(), b.to_string())).or_default().insert(rota.caminho.clone());
            }
        }
    }

    for g in por_modulo.values_mut() {
        g.rotas.sort_by(|a, b| (&a.caminho, &a.arquivo).cmp(&(&b.caminho, &b.arquivo)));
        g.telas.sort_by(|a, b| a.arquivo.cmp(&b.arquivo));
        g.chamadas.sort_by(|a, b| (&a.tela, &a.rota).cmp(&(&b.tela, &b.rota)));
        g.usado_por.sort_by(|a, b| (&a.modulo, &a.tela, &a.rota).cmp(&(&b.modulo, &b.tela, &b.rota)));
    }

    let arestas = pares
        .into_iter()
        .map(|((de, para), rotas)| {
            let total = rotas.len();
            let mut nota: Vec<String> = rotas.into_iter().take(4).collect();
            if total > nota.len() {
                nota.push(format!("(+{})", total - nota.len()));
            }
            MapaEdge { id: format!("auto:{de}->{para}"), from_key: de, to_key: para, kind: "chama".into(), note: nota.join(", "), auto: true }
        })
        .collect();

    Montado { por_modulo, arestas }
}

#[cfg(test)]
mod tests {
    use super::super::extracao::{ArquivoSql, Chamada, Rota};
    use super::*;

    fn rota(m: &str, c: &str, a: &str) -> Rota {
        Rota { metodos: vec![m.into()], caminho: c.into(), arquivo: a.into() }
    }

    fn mods() -> Vec<ModuloRef<'static>> {
        vec![
            ModuloRef { key: "compras", frontend_path: Some("Frontend/src/modules/compras/"), backend_path: Some("Backend/src/modules/compras/"), router_prefix: Some("/api/compras") },
            ModuloRef { key: "estoque", frontend_path: Some("Frontend/src/modules/estoque/"), backend_path: Some("Backend/src/modules/estoque/"), router_prefix: Some("/api/estoque") },
            ModuloRef { key: "producao_a", frontend_path: Some("Frontend/src/modules/producao/a/"), backend_path: Some("Backend/src/modules/producao/"), router_prefix: Some("/api/producao") },
            ModuloRef { key: "producao_b", frontend_path: Some("Frontend/src/modules/producao/b/"), backend_path: Some("Backend/src/modules/producao/"), router_prefix: Some("/api/producao/b") },
        ]
    }

    #[test]
    fn tela_que_chama_rota_de_outro_modulo_vira_aresta() {
        let cod = Codigo {
            rotas: vec![
                rota("GET", "/api/estoque/saldo/:codigo", "Backend/src/modules/estoque/mod.rs"),
                rota("GET", "/api/compras/pedidos", "Backend/src/modules/compras/mod.rs"),
            ],
            sql: vec![ArquivoSql {
                arquivo: "Backend/src/modules/estoque/store.rs".into(),
                le: vec!["estoque_saldo".into()],
                grava: vec!["movimentos".into()],
            }],
            telas: vec![Tela { nome: "PedidosView".into(), arquivo: "Frontend/src/modules/compras/PedidosView.tsx".into() }],
            chamadas: vec![
                Chamada { arquivo: "Frontend/src/modules/compras/PedidosView.tsx".into(), caminho: "/api/estoque/saldo/:param".into() },
                Chamada { arquivo: "Frontend/src/modules/compras/PedidosView.tsx".into(), caminho: "/api/compras/pedidos".into() },
            ],
        };
        let m = montar(&cod, &mods());
        let compras = &m.por_modulo["compras"];
        assert_eq!(compras.telas.len(), 1);
        assert_eq!(compras.rotas.len(), 1);
        assert_eq!(compras.chamadas.len(), 2);
        let estoque = &m.por_modulo["estoque"];
        assert_eq!(estoque.tabelas.le, vec!["estoque_saldo"]);
        assert_eq!(estoque.tabelas.grava, vec!["movimentos"]);
        assert_eq!(estoque.usado_por, vec![UsadoPor { modulo: "compras".into(), tela: "PedidosView.tsx".into(), rota: "/api/estoque/saldo/:codigo".into() }]);
        assert_eq!(m.arestas.len(), 1);
        assert_eq!((m.arestas[0].from_key.as_str(), m.arestas[0].to_key.as_str()), ("compras", "estoque"));
        assert!(m.arestas[0].auto);
    }

    #[test]
    fn prefixo_mais_longo_e_diretorio_compartilhado() {
        let cod = Codigo {
            rotas: vec![
                rota("GET", "/api/producao/fila", "Backend/src/modules/producao/fila.rs"),
                rota("GET", "/api/producao/b/itens", "Backend/src/modules/producao/b.rs"),
            ],
            sql: vec![
                ArquivoSql { arquivo: "Backend/src/modules/producao/fila.rs".into(), le: vec!["fila".into()], grava: vec![] },
                ArquivoSql { arquivo: "Backend/src/modules/producao/b.rs".into(), le: vec!["itens".into()], grava: vec![] },
            ],
            ..Default::default()
        };
        let m = montar(&cod, &mods());
        assert_eq!(m.por_modulo["producao_a"].rotas.len(), 1);
        assert_eq!(m.por_modulo["producao_b"].rotas.len(), 1);
        // diretório compartilhado: cada módulo só enxerga as tabelas dos arquivos das próprias rotas
        assert_eq!(m.por_modulo["producao_a"].tabelas.le, vec!["fila"]);
        assert_eq!(m.por_modulo["producao_b"].tabelas.le, vec!["itens"]);
    }

    /// Com o banco de teste (seed + migrações do mapa): o snapshot traz a ficha gerada do código deste build.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn snapshot_traz_ficha_gerada_do_codigo() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = sqlx::PgPool::connect(&url).await.unwrap();
        let s = super::super::store::snapshot(&pool).await.unwrap();
        let cod = codigo();
        println!("RESUMO rotas={} arquivos_sql={} telas={} chamadas={}", cod.rotas.len(), cod.sql.len(), cod.telas.len(), cod.chamadas.len());
        assert!(cod.rotas.len() > 100, "rotas varridas: {}", cod.rotas.len());
        assert!(!cod.telas.is_empty() && !cod.chamadas.is_empty());
        let mut sem_dono = 0;
        for m in &s.modules {
            let g = m.gerado.as_ref().expect("módulo sem ficha gerada");
            println!(
                "MOD {} fe={:?} be={:?} px={:?} rotas={} tabs(le/grava)={}/{} telas={} chamadas={} usadoPor={}",
                m.module_key, m.frontend_path, m.backend_path, m.router_prefix, g.rotas.len(), g.tabelas.le.len(), g.tabelas.grava.len(), g.telas.len(), g.chamadas.len(), g.usado_por.len()
            );
            if g.rotas.is_empty() && g.telas.is_empty() {
                sem_dono += 1;
            }
        }
        let autos: Vec<_> = s.edges.iter().filter(|e| e.auto).collect();
        for e in &autos {
            println!("EDGE {} -> {}: {}", e.from_key, e.to_key, e.note);
        }
        println!("RESUMO modulos={} sem_nada={} arestas_auto={} arestas_total={}", s.modules.len(), sem_dono, autos.len(), s.edges.len());
        let com_rota: usize = s.modules.iter().map(|m| m.gerado.as_ref().map_or(0, |g| g.rotas.len())).sum();
        println!("RESUMO rotas_atribuidas={com_rota}");
    }
}

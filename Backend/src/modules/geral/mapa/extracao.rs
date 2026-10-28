#![allow(dead_code)]
//! Extração do "mapa gerado do código" (rotas, tabelas, telas, chamadas tela → rota).
//!
//! Só funções puras sobre texto, sem dependência do resto do servidor: o `build.rs` inclui este arquivo
//! (`#[path]`) para varrer o código-fonte no build e embutir o resultado no binário; o servidor em
//! produção não tem o código-fonte, então a ficha nunca fica velha em relação à versão que está rodando.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Rota {
    pub metodos: Vec<String>,
    pub caminho: String,
    /// Arquivo do servidor que registra a rota (relativo à raiz do repositório).
    pub arquivo: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct ArquivoSql {
    pub arquivo: String,
    pub le: Vec<String>,
    pub grava: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Tela {
    pub nome: String,
    pub arquivo: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Chamada {
    /// Arquivo do front que faz a chamada.
    pub arquivo: String,
    /// Caminho normalizado (`/api/...`, `${x}` virou `:param`).
    pub caminho: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Codigo {
    pub rotas: Vec<Rota>,
    pub sql: Vec<ArquivoSql>,
    pub telas: Vec<Tela>,
    pub chamadas: Vec<Chamada>,
}

// ---------------------------------------------------------------------------------------------
// Comentários
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Linguagem {
    Rust,
    Ts,
}

/// Troca comentários por espaços (mantém quebras de linha e o conteúdo das strings).
pub fn sem_comentarios(src: &str, lang: Linguagem) -> String {
    let c: Vec<char> = src.chars().collect();
    let mut out = String::with_capacity(src.len());
    let mut i = 0;
    while i < c.len() {
        let ch = c[i];
        let prox = c.get(i + 1).copied().unwrap_or('\0');
        if ch == '/' && prox == '/' {
            while i < c.len() && c[i] != '\n' {
                out.push(' ');
                i += 1;
            }
            continue;
        }
        if ch == '/' && prox == '*' {
            out.push_str("  ");
            i += 2;
            while i < c.len() && !(c[i] == '*' && c.get(i + 1) == Some(&'/')) {
                out.push(if c[i] == '\n' { '\n' } else { ' ' });
                i += 1;
            }
            if i < c.len() {
                out.push_str("  ");
                i += 2;
            }
            continue;
        }
        match lang {
            Linguagem::Rust => {
                // string crua r#"..."#
                if ch == 'r' && (prox == '"' || prox == '#') && (i == 0 || !eh_ident(c[i - 1])) {
                    let mut j = i + 1;
                    let mut hashes = 0;
                    while c.get(j) == Some(&'#') {
                        hashes += 1;
                        j += 1;
                    }
                    if c.get(j) == Some(&'"') {
                        let inicio = i;
                        j += 1;
                        loop {
                            if j >= c.len() {
                                break;
                            }
                            if c[j] == '"' && (0..hashes).all(|k| c.get(j + 1 + k) == Some(&'#')) {
                                j += 1 + hashes;
                                break;
                            }
                            j += 1;
                        }
                        out.extend(c[inicio..j.min(c.len())].iter());
                        i = j;
                        continue;
                    }
                }
                if ch == '"' {
                    let fim = fim_string_aspas(&c, i, '"', false);
                    out.extend(c[i..fim].iter());
                    i = fim;
                    continue;
                }
                if ch == '\'' {
                    // literal de char ('x', '\n', '"') ou lifetime ('a)
                    let fim = if prox == '\\' {
                        (i + 2..c.len().min(i + 12)).find(|&k| c[k] == '\'').map(|k| k + 1)
                    } else if c.get(i + 2) == Some(&'\'') {
                        Some(i + 3)
                    } else {
                        None
                    };
                    if let Some(f) = fim {
                        out.extend(c[i..f].iter());
                        i = f;
                        continue;
                    }
                }
            }
            Linguagem::Ts => {
                if ch == '"' || ch == '\'' {
                    let fim = fim_string_aspas(&c, i, ch, true);
                    out.extend(c[i..fim].iter());
                    i = fim;
                    continue;
                }
                if ch == '`' {
                    let fim = fim_template(&c, i);
                    out.extend(c[i..fim].iter());
                    i = fim;
                    continue;
                }
            }
        }
        out.push(ch);
        i += 1;
    }
    out
}

fn eh_ident(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

/// Índice logo depois do fecho da string que começa em `i` (aspas `q`). `ate_quebra`: string de uma linha só.
fn fim_string_aspas(c: &[char], i: usize, q: char, ate_quebra: bool) -> usize {
    let mut j = i + 1;
    while j < c.len() {
        if c[j] == '\\' {
            j += 2;
            continue;
        }
        if c[j] == q {
            return j + 1;
        }
        if ate_quebra && c[j] == '\n' {
            return j;
        }
        j += 1;
    }
    c.len()
}

/// Fim de um template literal do TypeScript (acompanha `${ ... }` aninhados).
fn fim_template(c: &[char], i: usize) -> usize {
    let mut j = i + 1;
    while j < c.len() {
        match c[j] {
            '\\' => j += 2,
            '`' => return j + 1,
            '$' if c.get(j + 1) == Some(&'{') => {
                let mut prof = 0;
                while j < c.len() {
                    match c[j] {
                        '{' => prof += 1,
                        '}' => {
                            prof -= 1;
                            if prof == 0 {
                                j += 1;
                                break;
                            }
                        }
                        '`' => {
                            j = fim_template(c, j);
                            continue;
                        }
                        _ => {}
                    }
                    j += 1;
                }
            }
            _ => j += 1,
        }
    }
    c.len()
}

// ---------------------------------------------------------------------------------------------
// Rotas do servidor
// ---------------------------------------------------------------------------------------------

const METODOS_HTTP: [&str; 5] = ["get", "post", "put", "delete", "patch"];

/// `.route("/api/x", get(h).post(h2))` → rotas com os métodos. `arquivo` só é copiado para o resultado.
pub fn rotas_do_fonte(src: &str, arquivo: &str) -> Vec<Rota> {
    let limpo = sem_comentarios(src, Linguagem::Rust);
    let c: Vec<char> = limpo.chars().collect();
    let alvo: Vec<char> = ".route(".chars().collect();
    let mut rotas: Vec<Rota> = Vec::new();
    let mut i = 0;
    while i + alvo.len() <= c.len() {
        if c[i..i + alvo.len()] != alvo[..] {
            i += 1;
            continue;
        }
        let mut j = i + alvo.len();
        i = j;
        while j < c.len() && c[j].is_whitespace() {
            j += 1;
        }
        if c.get(j) != Some(&'"') {
            continue;
        }
        let fim = fim_string_aspas(&c, j, '"', false);
        let caminho: String = c[j + 1..fim.saturating_sub(1).max(j + 1)].iter().collect();
        // expressão do handler até o ')' que fecha .route(
        let mut k = fim;
        let mut prof = 0i32;
        let mut ident = String::new();
        let mut metodos: Vec<String> = Vec::new();
        while k < c.len() {
            let ch = c[k];
            if ch == '"' {
                k = fim_string_aspas(&c, k, '"', false);
                ident.clear();
                continue;
            }
            if eh_ident(ch) {
                ident.push(ch);
                k += 1;
                continue;
            }
            if ch == '(' && prof == 0 && METODOS_HTTP.contains(&ident.as_str()) {
                let m = ident.to_uppercase();
                if !metodos.contains(&m) {
                    metodos.push(m);
                }
            }
            ident.clear();
            match ch {
                '(' | '[' | '{' => prof += 1,
                ')' | ']' | '}' => {
                    if prof == 0 {
                        break;
                    }
                    prof -= 1;
                }
                _ => {}
            }
            k += 1;
        }
        if metodos.is_empty() {
            metodos.push("ANY".into());
        }
        let r = Rota { metodos, caminho, arquivo: arquivo.to_string() };
        if !rotas.contains(&r) {
            rotas.push(r);
        }
        i = k.max(i);
    }
    rotas
}

// ---------------------------------------------------------------------------------------------
// Tabelas (SQL dentro do Rust)
// ---------------------------------------------------------------------------------------------

#[derive(Debug, PartialEq)]
enum Tok {
    Palavra(String),
    Outro(char),
}

fn tokens_sql(src: &str) -> Vec<Tok> {
    let c: Vec<char> = src.chars().collect();
    let mut v = Vec::new();
    let mut i = 0;
    while i < c.len() {
        let ch = c[i];
        if ch.is_whitespace() {
            i += 1;
        } else if ch.is_alphabetic() || ch == '_' {
            let mut p = String::new();
            while i < c.len() && (c[i].is_alphanumeric() || c[i] == '_' || (c[i] == '.' && c.get(i + 1).map_or(false, |n| n.is_alphabetic() || *n == '_'))) {
                p.push(c[i].to_ascii_lowercase());
                i += 1;
            }
            v.push(Tok::Palavra(p));
        } else {
            v.push(Tok::Outro(ch));
            i += 1;
        }
    }
    v
}

const NAO_TABELA: [&str; 22] = [
    "select", "set", "of", "nowait", "skip", "only", "lateral", "unnest", "values", "generate_series", "where", "as", "on", "using",
    "if", "not", "exists", "table", "temp", "temporary", "the", "a",
];

fn palavra(t: &[Tok], i: usize) -> Option<&str> {
    match t.get(i) {
        Some(Tok::Palavra(p)) => Some(p.as_str()),
        _ => None,
    }
}

/// Nome da tabela na posição `i` (aceita `schema.tabela`), se for mesmo um nome de tabela (não função, não palavra-chave).
fn nome_tabela(t: &[Tok], i: usize, ctes: &BTreeSet<String>, aceita_parenteses: bool) -> Option<String> {
    let p = palavra(t, i)?;
    if NAO_TABELA.contains(&p) || p.chars().next().map_or(true, |c| c.is_ascii_digit()) {
        return None;
    }
    if !aceita_parenteses && matches!(t.get(i + 1), Some(Tok::Outro('('))) {
        return None; // função (ex.: unnest(...), jsonb_to_recordset(...))
    }
    let nome = p.rsplit('.').next().unwrap_or(p).to_string();
    if ctes.contains(&nome) {
        return None;
    }
    Some(nome)
}

/// Tabelas lidas (`FROM`, `JOIN`) e gravadas (`INSERT INTO`, `UPDATE`, `DELETE FROM`) pelo texto SQL.
pub fn tabelas_do_sql(src: &str) -> (BTreeSet<String>, BTreeSet<String>) {
    let t = tokens_sql(src);
    // CTEs: `nome AS (` / `nome AS MATERIALIZED (`
    let mut ctes = BTreeSet::new();
    for i in 0..t.len() {
        if let (Some(n), Some("as")) = (palavra(&t, i), palavra(&t, i + 1)) {
            let abre = matches!(t.get(i + 2), Some(Tok::Outro('(')))
                || matches!(palavra(&t, i + 2), Some("materialized"))
                || (matches!(palavra(&t, i + 2), Some("not")) && matches!(palavra(&t, i + 3), Some("materialized")));
            if abre {
                ctes.insert(n.to_string());
            }
        }
    }
    let mut le = BTreeSet::new();
    let mut grava = BTreeSet::new();
    for i in 0..t.len() {
        let p = match palavra(&t, i) {
            Some(p) => p,
            None => continue,
        };
        let anterior = if i > 0 { palavra(&t, i - 1) } else { None };
        match p {
            "from" if anterior == Some("delete") => {
                if let Some(n) = nome_tabela(&t, i + 1, &ctes, false) {
                    grava.insert(n);
                }
            }
            "from" | "join" => {
                if let Some(n) = nome_tabela(&t, i + 1, &ctes, false) {
                    le.insert(n);
                }
            }
            "into" if anterior == Some("insert") => {
                if let Some(n) = nome_tabela(&t, i + 1, &ctes, true) {
                    grava.insert(n);
                }
            }
            "update" => {
                // `DO UPDATE SET` e `FOR UPDATE` não são tabela (nome_tabela rejeita `set`/`of`/`nowait`/`skip`)
                if anterior == Some("for") {
                    continue;
                }
                if let Some(n) = nome_tabela(&t, i + 1, &ctes, false) {
                    grava.insert(n);
                }
            }
            _ => {}
        }
    }
    (le, grava)
}

/// Tabelas e views criadas por `CREATE TABLE [IF NOT EXISTS] x` / `CREATE [OR REPLACE] [MATERIALIZED] VIEW x`.
pub fn tabelas_criadas(src: &str) -> BTreeSet<String> {
    let t = tokens_sql(src);
    let mut r = BTreeSet::new();
    for i in 0..t.len() {
        if palavra(&t, i) != Some("create") {
            continue;
        }
        let mut j = i + 1;
        while matches!(palavra(&t, j), Some("or") | Some("replace") | Some("materialized") | Some("temp") | Some("temporary") | Some("unlogged")) {
            j += 1;
        }
        if !matches!(palavra(&t, j), Some("table") | Some("view")) {
            continue;
        }
        j += 1;
        if palavra(&t, j) == Some("if") && palavra(&t, j + 1) == Some("not") && palavra(&t, j + 2) == Some("exists") {
            j += 3;
        }
        if let Some(p) = palavra(&t, j) {
            r.insert(p.rsplit('.').next().unwrap_or(p).to_string());
        }
    }
    r
}

// ---------------------------------------------------------------------------------------------
// Front: chamadas à API
// ---------------------------------------------------------------------------------------------

const FUNCOES_API: [&str; 2] = ["apiFetch", "apiJson"];

/// Caminhos (normalizados, sem repetição) passados como literal a `apiFetch`/`apiJson`.
pub fn chamadas_do_front(src: &str) -> Vec<String> {
    let limpo = sem_comentarios(src, Linguagem::Ts);
    let c: Vec<char> = limpo.chars().collect();
    let mut out: Vec<String> = Vec::new();
    let mut i = 0;
    while i < c.len() {
        if !(c[i].is_alphabetic() || c[i] == '_' || c[i] == '$') {
            i += 1;
            continue;
        }
        let ini = i;
        while i < c.len() && (eh_ident(c[i]) || c[i] == '$') {
            i += 1;
        }
        let nome: String = c[ini..i].iter().collect();
        if !FUNCOES_API.contains(&nome.as_str()) || (ini > 0 && c[ini - 1] == '.') {
            continue;
        }
        let mut j = i;
        while j < c.len() && c[j].is_whitespace() {
            j += 1;
        }
        // genérico <T> (acompanha <> aninhados; "=>" não fecha)
        if c.get(j) == Some(&'<') {
            let mut prof = 0;
            while j < c.len() {
                match c[j] {
                    '<' => prof += 1,
                    '>' if j > 0 && c[j - 1] != '=' => {
                        prof -= 1;
                        if prof == 0 {
                            j += 1;
                            break;
                        }
                    }
                    _ => {}
                }
                j += 1;
            }
            while j < c.len() && c[j].is_whitespace() {
                j += 1;
            }
        }
        if c.get(j) != Some(&'(') {
            continue;
        }
        j += 1;
        while j < c.len() && c[j].is_whitespace() {
            j += 1;
        }
        let q = match c.get(j) {
            Some(&q) if q == '\'' || q == '"' || q == '`' => q,
            _ => continue,
        };
        let fim = if q == '`' { fim_template(&c, j) } else { fim_string_aspas(&c, j, q, true) };
        if fim < j + 2 {
            continue;
        }
        let literal: String = c[j + 1..fim - 1].iter().collect();
        if let Some(p) = normalizar_chamada(&literal) {
            if !out.contains(&p) {
                out.push(p);
            }
        }
        i = fim;
    }
    out
}

/// `/compras/x/${id}?a=1` → `/api/compras/x/:param`. `None` se o caminho não dá para resolver (ex.: começa por `${...}`).
pub fn normalizar_chamada(literal: &str) -> Option<String> {
    let c: Vec<char> = literal.chars().collect();
    let mut s = String::new();
    let mut i = 0;
    while i < c.len() {
        if c[i] == '$' && c.get(i + 1) == Some(&'{') {
            let mut prof = 0;
            while i < c.len() {
                match c[i] {
                    '{' => prof += 1,
                    '}' => {
                        prof -= 1;
                        if prof == 0 {
                            i += 1;
                            break;
                        }
                    }
                    _ => {}
                }
                i += 1;
            }
            // `${x}` depois de `/` é um parâmetro de caminho; colado a outro texto é sufixo (query, extensão).
            if s.ends_with('/') {
                s.push_str(":param");
            } else if s.is_empty() {
                return None;
            }
            continue;
        }
        if c[i] == '?' || c[i] == '#' {
            break;
        }
        s.push(c[i]);
        i += 1;
    }
    let s = s.trim_end_matches('/').to_string();
    if s.is_empty() || s.starts_with("http") || s.starts_with(":param") {
        return None;
    }
    let com_barra = if s.starts_with('/') { s } else { format!("/{s}") };
    Some(if com_barra == "/api" || com_barra.starts_with("/api/") { com_barra } else { format!("/api{com_barra}") })
}

/// Compara o caminho chamado pelo front com o padrão de uma rota. Devolve quantos segmentos casaram só por serem
/// parâmetro (menor = mais específico), ou `None` se não casa.
pub fn casa_rota(chamada: &str, rota: &str) -> Option<usize> {
    let a: Vec<&str> = chamada.trim_matches('/').split('/').collect();
    let b: Vec<&str> = rota.trim_matches('/').split('/').collect();
    if a.len() != b.len() {
        return None;
    }
    let mut curingas = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        if x == y {
            continue;
        }
        if x.starts_with(':') || y.starts_with(':') {
            curingas += 1;
            continue;
        }
        return None;
    }
    Some(curingas)
}

/// Arquivo que é uma tela: `*View.tsx`, `*Tab.tsx`, `*Drawer.tsx`, `*Painel.tsx`, `*Panel.tsx`.
pub fn e_tela(nome_arquivo: &str) -> bool {
    ["View.tsx", "Tab.tsx", "Drawer.tsx", "Painel.tsx", "Panel.tsx"].iter().any(|s| nome_arquivo.ends_with(s))
}

// ---------------------------------------------------------------------------------------------
// Varredura de disco (usada pelo build.rs)
// ---------------------------------------------------------------------------------------------

fn listar(dir: &Path, ext: &[&str], out: &mut Vec<std::path::PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut itens: Vec<_> = rd.flatten().map(|e| e.path()).collect();
    itens.sort();
    for p in itens {
        if p.is_dir() {
            let nome = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if nome == "node_modules" || nome == "target" || nome == "dist" {
                continue;
            }
            listar(&p, ext, out);
        } else if p.extension().and_then(|e| e.to_str()).map_or(false, |e| ext.contains(&e)) {
            out.push(p);
        }
    }
}

fn relativo(raiz: &Path, p: &Path) -> String {
    p.strip_prefix(raiz).unwrap_or(p).to_string_lossy().replace('\\', "/")
}

/// Varre `Backend/src`, `Backend/supabase` e `Frontend/src` a partir da raiz do repositório.
pub fn varrer(raiz: &Path) -> Codigo {
    let mut cod = Codigo::default();

    // Servidor
    let mut rs = Vec::new();
    listar(&raiz.join("Backend/src"), &["rs"], &mut rs);
    let mut conhecidas: BTreeSet<String> = BTreeSet::new();
    let mut textos: BTreeMap<String, String> = BTreeMap::new();
    for p in &rs {
        let rel = relativo(raiz, p);
        if rel.starts_with("Backend/src/bin/") {
            continue;
        }
        let Ok(src) = std::fs::read_to_string(p) else { continue };
        conhecidas.extend(tabelas_criadas(&src));
        cod.rotas.extend(rotas_do_fonte(&src, &rel));
        textos.insert(rel, src);
    }
    let mut sqls = Vec::new();
    listar(&raiz.join("Backend/supabase"), &["sql"], &mut sqls);
    for p in &sqls {
        if let Ok(src) = std::fs::read_to_string(p) {
            conhecidas.extend(tabelas_criadas(&src));
        }
    }
    for (rel, src) in &textos {
        let (le, grava) = tabelas_do_sql(&sem_comentarios(src, Linguagem::Rust));
        let le: Vec<String> = le.into_iter().filter(|t| conhecidas.contains(t)).collect();
        let grava: Vec<String> = grava.into_iter().filter(|t| conhecidas.contains(t)).collect();
        if !le.is_empty() || !grava.is_empty() {
            cod.sql.push(ArquivoSql { arquivo: rel.clone(), le, grava });
        }
    }

    // Front
    let mut fe = Vec::new();
    listar(&raiz.join("Frontend/src"), &["ts", "tsx"], &mut fe);
    for p in &fe {
        let rel = relativo(raiz, p);
        let nome = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        if e_tela(&nome) {
            cod.telas.push(Tela { nome: nome.trim_end_matches(".tsx").to_string(), arquivo: rel.clone() });
        }
        let Ok(src) = std::fs::read_to_string(p) else { continue };
        for caminho in chamadas_do_front(&src) {
            cod.chamadas.push(Chamada { arquivo: rel.clone(), caminho });
        }
    }
    cod
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rota_com_varios_metodos_e_multilinha() {
        let src = r#"
            Router::new()
                .route("/api/a", get(h::lista).post(h::cria))
                .route(
                    "/api/a/:id",
                    put(h::edita).delete(h::apaga),
                )
                .route("/api/b", axum::routing::post(h::b))
                // .route("/api/comentada", get(x))
                .route("/api/get_x", get(handlers::get_x))
        "#;
        let r = rotas_do_fonte(src, "Backend/src/x.rs");
        assert_eq!(r.len(), 4);
        assert_eq!(r[0].caminho, "/api/a");
        assert_eq!(r[0].metodos, vec!["GET", "POST"]);
        assert_eq!(r[1].caminho, "/api/a/:id");
        assert_eq!(r[1].metodos, vec!["PUT", "DELETE"]);
        assert_eq!(r[2].metodos, vec!["POST"]);
        assert_eq!(r[3].metodos, vec!["GET"]);
        assert!(r.iter().all(|x| x.arquivo == "Backend/src/x.rs"));
    }

    #[test]
    fn tabelas_com_join_alias_cte_e_funcao() {
        let sql = r#"
            WITH base AS (SELECT * FROM producao_lotes pl),
                 outra AS MATERIALIZED (SELECT 1)
            SELECT b.x FROM base b
              JOIN public.produtos p ON p.id = b.id
              LEFT JOIN LATERAL unnest(b.arr) u ON true
              JOIN outra o ON true;
            INSERT INTO historico (a) SELECT a FROM fonte f ON CONFLICT (a) DO UPDATE SET a = 1;
            UPDATE estoque e SET q = 1 FROM movimentos m WHERE m.id = e.id;
            DELETE FROM lixo WHERE id = 1;
            SELECT * FROM fila FOR UPDATE SKIP LOCKED;
        "#;
        let (le, grava) = tabelas_do_sql(sql);
        let le: Vec<_> = le.into_iter().collect();
        let grava: Vec<_> = grava.into_iter().collect();
        assert_eq!(le, vec!["fila", "fonte", "movimentos", "producao_lotes", "produtos"]);
        assert_eq!(grava, vec!["estoque", "historico", "lixo"]);
    }

    #[test]
    fn tabelas_criadas_incluem_views() {
        let sql = "CREATE TABLE IF NOT EXISTS a (x int); create or replace view v_b as select 1; CREATE TABLE public.c (y int);";
        let t: Vec<_> = tabelas_criadas(sql).into_iter().collect();
        assert_eq!(t, vec!["a", "c", "v_b"]);
    }

    #[test]
    fn chamadas_param_template_e_query() {
        let src = r#"
            // apiJson('/comentado')
            const a = await apiJson<Foo[]>(`/api/lotes/${id}/itens?x=${y}`);
            const b = await apiFetch('/kits/composicao');
            const c = await apiJson<{ f: () => void }>(
              "/compras/insumos/" + code
            );
            const d = await apiFetch(`/products?${params.toString()}`);
            const e = await apiFetch(url);
            const f = await apiFetch(`${base}/x`);
            obj.apiFetch('/nao');
        "#;
        let c = chamadas_do_front(src);
        assert_eq!(
            c,
            vec!["/api/lotes/:param/itens", "/api/kits/composicao", "/api/compras/insumos", "/api/products"]
        );
    }

    #[test]
    fn normaliza_e_casa_rotas() {
        assert_eq!(normalizar_chamada("/mapa/snapshot").as_deref(), Some("/api/mapa/snapshot"));
        assert_eq!(normalizar_chamada("/api/x/").as_deref(), Some("/api/x"));
        assert_eq!(normalizar_chamada("kits/${a}/${b}").as_deref(), Some("/api/kits/:param/:param"));
        assert_eq!(normalizar_chamada("${a}/x"), None);
        assert_eq!(casa_rota("/api/kits/:param/itens", "/api/kits/:id/itens"), Some(1));
        assert_eq!(casa_rota("/api/kits/novo", "/api/kits/:id"), Some(1));
        assert_eq!(casa_rota("/api/kits/novo", "/api/kits/novo"), Some(0));
        assert_eq!(casa_rota("/api/kits", "/api/kits/:id"), None);
    }

    #[test]
    fn reconhece_telas() {
        assert!(e_tela("DesenvolvimentoView.tsx"));
        assert!(e_tela("DemandasQueueTab.tsx"));
        assert!(e_tela("DemandaDetailDrawer.tsx"));
        assert!(!e_tela("http.ts"));
        assert!(!e_tela("ViewModel.tsx"));
    }

    #[test]
    fn comentarios_nao_atrapalham_strings_nem_chars() {
        let src = "let a = '\"'; let b = \"// nao e comentario\"; // fim\nlet c = r#\"/* ok */\"#;";
        let l = sem_comentarios(src, Linguagem::Rust);
        assert!(l.contains("// nao e comentario"));
        assert!(l.contains("/* ok */"));
        assert!(!l.contains("fim"));
    }
}

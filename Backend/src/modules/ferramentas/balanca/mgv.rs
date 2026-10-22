//! Regras puras da carga da balança Toledo Prix 4 Due (MGV 7): nomes, registros de 111 caracteres e grupos.
//! Sem banco: o teste de ouro compara com a carga real que já está na balança (`testdata/ITENSMGV.TXT`).

use regex::Regex;
use std::sync::OnceLock;

/// Substituições da simplificação do nome, na ordem em que valem (ordem importa).
fn regras() -> &'static Vec<(Regex, &'static str)> {
    static R: OnceLock<Vec<(Regex, &'static str)>> = OnceLock::new();
    R.get_or_init(|| {
        let r = |p: &str, to: &'static str| (Regex::new(&format!("(?i){p}")).expect("regex da balança"), to);
        vec![
            // 1. transporte / produtos perigosos
            r(r"LIQ\s+CORROSIVO\s+TOXICO\s+NE\s*", ""),
            r(r"LIQ\s+CORROSIVO\s+ACIDO\s+ORGANICO\s*", ""),
            r(r"LIQ\s+CORROSIVO\s*", ""),
            r(r"\(UN\s*\d+\)", ""),
            // 2. CAS
            r(r"[-–]?\s*CAS:?\s*[\d\-]+", ""),
            // 3. unidades / embalagens / pesos
            r(r"\b\d+\s*(?:KG|LT|L)\s*(?:LT|KG)?\b", ""),
            r(r"\bKG\s*LT\b", ""),
            r(r"\s+KG\b", ""),
            r(r"SH\s+GAL[AÃ]O\s*\d*L?", ""),
            r(r"GAL[AÃ]O\s*\d*L?", ""),
            // 4. nomes comerciais e marcas alternativas entre parênteses
            r(r"\(LAURIL/[^)]+\)", "(LAURIL)"),
            r(r"\(METHILAN[^)]+\)", ""),
            r(r"\(QUATERCAP[^)]+\)", ""),
            r(r"\(MICROCARE[^)]+\)", ""),
            r(r"\(ELEMENT\s*\d+\)", ""),
            r(r"\(PMX\s*\d+\)", ""),
            r(r"\(MEM\s*\d+\)", ""),
            r(r"\(COSMOSEQ\s*\d+\)", ""),
            r(r"\(SEQUESTRANTE[^)]+\)", ""),
            r(r"\(JAUNE[^)]+\)", ""),
            r(r"\(CUTINA[^)]+\)", ""),
            r(r"\(CHEMYPROTEIN[^)]+\)", ""),
            r(r"\(MACKPRO[^)]+\)", ""),
            r(r"\(COSMOGEN[^)]+\)", ""),
        ]
    })
}

fn re(p: &'static str, flags: &str) -> Regex {
    Regex::new(&format!("{flags}{p}")).expect("regex da balança")
}

/// Descrição curta para o visor/etiqueta (até 50 caracteres = 2 linhas de 25), sem cortar palavras.
pub fn simplificar(desc: &str, categoria: Option<&str>) -> String {
    if desc.trim().is_empty() {
        return String::new();
    }
    let mut s = desc.trim().to_string();
    for (r, to) in regras() {
        s = r.replace_all(&s, *to).into_owned();
    }

    // 5. nomes INCI longos depois do hífen
    static INCI: OnceLock<Regex> = OnceLock::new();
    let inci = INCI.get_or_init(|| re(r"STEARAMIDOPROPYL|ALKONAT|WASHINGTON", "(?i)"));
    if s.contains(" - ") && inci.is_match(&s) {
        s = s.split(" - ").next().unwrap_or("").to_string();
    }

    // 6. fragrâncias e bouquets: tira códigos e nomes repetidos depois de barras
    let up = s.to_uppercase();
    let frag = categoria == Some("Frangancias") || up.contains("BOUQUET") || up.starts_with("FRAG");
    if frag {
        static F1: OnceLock<Regex> = OnceLock::new();
        static F2: OnceLock<Regex> = OnceLock::new();
        static F3: OnceLock<Regex> = OnceLock::new();
        static F4: OnceLock<Regex> = OnceLock::new();
        let f1 = F1.get_or_init(|| re(r"\(\s*(?:SCE|IFR|LPV|VOLLMENS|ELEMENT)?\s*[\d\s/-]+\s*\)", "(?i)"));
        let f2 = F2.get_or_init(|| re(r"\b(?:SCE|IFR|LPV)\s*\d+\b", "(?i)"));
        let f3 = F3.get_or_init(|| re(r"\b(?:IAA|IBB)/\d+\b", "(?i)"));
        let f4 = F4.get_or_init(|| re(r"/\s*[A-Z0-9\s-]+(?:\d{4,})", "(?i)"));
        if s.contains("//") {
            s = s.split("//").next().unwrap_or("").to_string();
        }
        s = f1.replace_all(&s, "").into_owned();
        s = f2.replace_all(&s, "").into_owned();
        s = f3.replace_all(&s, "").into_owned();
        if s.contains('/') && f4.is_match(&s) {
            s = s.split('/').next().unwrap_or("").to_string();
        }
        if s.starts_with("BOUQUET SEDAR/") {
            s = "BOUQUET SEDAR".to_string();
        }
    }

    // pontuação e espaços
    static L1: OnceLock<Regex> = OnceLock::new();
    static L2: OnceLock<Regex> = OnceLock::new();
    static L3: OnceLock<Regex> = OnceLock::new();
    let l1 = L1.get_or_init(|| re(r"\(\s*\)", ""));
    let l2 = L2.get_or_init(|| re(r"\s+", ""));
    let l3 = L3.get_or_init(|| re(r"\s*[-–/]\s*$", ""));
    s = l1.replace_all(&s, "").into_owned();
    s = l2.replace_all(&s, " ").into_owned();
    s = l3.replace_all(&s, "").into_owned();
    let mut s: Vec<char> = s.trim().chars().collect();

    // no máximo 50 caracteres, cortando no último espaço quando ele não estiver cedo demais
    if s.len() > 50 {
        let ultimo_espaco = s[..=50.min(s.len() - 1)].iter().rposition(|c| *c == ' ');
        match ultimo_espaco {
            Some(i) if i > 30 => s.truncate(i),
            _ => s.truncate(50),
        }
    }
    s.into_iter().collect::<String>().trim().to_string()
}

fn sem_acento(c: char) -> char {
    match c {
        'á' | 'à' | 'â' | 'ã' | 'ä' | 'Á' | 'À' | 'Â' | 'Ã' | 'Ä' => 'A',
        'é' | 'è' | 'ê' | 'ë' | 'É' | 'È' | 'Ê' | 'Ë' => 'E',
        'í' | 'ì' | 'î' | 'ï' | 'Í' | 'Ì' | 'Î' | 'Ï' => 'I',
        'ó' | 'ò' | 'ô' | 'õ' | 'ö' | 'Ó' | 'Ò' | 'Ô' | 'Õ' | 'Ö' => 'O',
        'ú' | 'ù' | 'û' | 'ü' | 'Ú' | 'Ù' | 'Û' | 'Ü' => 'U',
        'ç' | 'Ç' => 'C',
        'ñ' | 'Ñ' => 'N',
        _ => c,
    }
}

/// Texto que a balança aceita: sem acento, maiúsculo, só letras, números e `space - / . , ( ) %`.
pub fn sanitizar(texto: &str) -> String {
    texto
        .chars()
        .map(sem_acento)
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, ' ' | '-' | '/' | '.' | ',' | '(' | ')' | '%'))
        .collect::<String>()
        .to_uppercase()
        .trim()
        .to_string()
}

/// Duas linhas de 25 caracteres, quebrando entre palavras.
pub fn dividir(texto: &str) -> (String, String) {
    let t: Vec<char> = texto.trim().chars().collect();
    let pad = |s: String| format!("{s:<25}");
    if t.len() <= 25 {
        return (pad(t.iter().collect()), " ".repeat(25));
    }
    let mut corte = t[..=25].iter().rposition(|c| *c == ' ').filter(|i| *i >= 10).unwrap_or(25);
    if corte == 0 {
        corte = 25;
    }
    let l1: String = t[..corte].iter().collect::<String>().trim().to_string();
    let l2: String = t[corte..].iter().collect::<String>().trim().chars().take(25).collect();
    (pad(l1), pad(l2))
}

/// Registro do MGV 7 (ITENSMGV.TXT, 111 caracteres): depto 01, tipo (0 = kg, 1 = un), PLU de 6 dígitos,
/// preço 0, sem validade, descrição em 2 linhas de 25, imprime a data atual (embalagem) e não a de validade.
pub fn linha_mgv(unidade_un: bool, plu: &str, nome_simplificado: &str) -> String {
    let tipo = if unidade_un { '1' } else { '0' };
    let plu: String = format!("{plu:0>6}").chars().take(6).collect();
    let (l1, l2) = dividir(&sanitizar(nome_simplificado));
    // preço 000000 + validade 000 | nomes | extra 000000, imagem 000, nutricional 0000, imprime validade 0,
    // imprime data de embalagem 1 | fornecedor 0000, lote 12×0, código especial 11×0, indicador de uso 0
    format!(
        "01{tipo}{plu}{preco}{validade}{l1}{l2}{extra}{imagem}{nutricional}{imp_validade}{imp_embalagem}{fornecedor}{lote}{especial}{uso}",
        preco = "000000",
        validade = "000",
        extra = "000000",
        imagem = "000",
        nutricional = "0000",
        imp_validade = "0",
        imp_embalagem = "1",
        fornecedor = "0000",
        lote = "000000000000",
        especial = "00000000000",
        uso = "0",
    )
}

/// PLU de 6 dígitos do código do sistema (`9.15.020` → `915020`).
pub fn plu_sistema(codigo_erp: &str) -> String {
    let digitos: String = codigo_erp.chars().filter(|c| c.is_ascii_digit()).collect();
    format!("{digitos:0>6}")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Grupo {
    Ativos,
    Terceirizados,
    Inativos,
    Fragrancias,
}

/// Estado do produto que usa a matéria-prima (para decidir se ela é "terceirizada / linha suspensa").
pub fn produto_suspenso(status_produto: &str, linha_visivel: i32) -> bool {
    linha_visivel == 0 || matches!(status_produto, "descontinuado" | "terceirizado")
}

pub fn classificar(descricao: &str, categoria: Option<&str>, ignorado: bool, produtos_suspensos: &[bool]) -> Grupo {
    let up = descricao.to_uppercase();
    if categoria == Some("Frangancias") || up.contains("BOUQUET") || up.starts_with("FRAG") {
        Grupo::Fragrancias
    } else if ignorado {
        Grupo::Inativos
    } else if !produtos_suspensos.is_empty() && produtos_suspensos.iter().all(|s| *s) {
        Grupo::Terceirizados
    } else {
        Grupo::Ativos
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registro_tem_111_caracteres_e_campos_nos_lugares() {
        let l = linha_mgv(false, "000014", "SINTEPON LESS 27% (LAURIL)");
        assert_eq!(l.len(), 111);
        assert_eq!(&l[0..2], "01");
        assert_eq!(&l[2..3], "0");
        assert_eq!(&l[3..9], "000014");
        assert_eq!(l[18..43].trim(), "SINTEPON LESS 27%");
        assert_eq!(l[43..68].trim(), "(LAURIL)", "quebra entre palavras, como na carga real");
        assert_eq!(linha_mgv(true, "915020", "X").chars().nth(2), Some('1'));
    }

    #[test]
    fn plu_do_sistema_tira_os_pontos() {
        assert_eq!(plu_sistema("9.15.020"), "915020");
    }

    #[test]
    fn sanitiza_acentos_e_simbolos() {
        assert_eq!(sanitizar("Água Dessalinizada ® 5%"), "AGUA DESSALINIZADA  5%");
    }

    #[test]
    fn divide_entre_palavras() {
        let (a, b) = dividir("BOUQUET CAMOMILA COM MEL E ALGO MAIS");
        assert_eq!(a.trim(), "BOUQUET CAMOMILA COM MEL");
        assert_eq!(b.trim(), "E ALGO MAIS");
        assert_eq!(a.len(), 25);
        assert_eq!(b.len(), 25);
    }

    #[test]
    fn classifica_os_quatro_grupos() {
        assert_eq!(classificar("FRAGRANCIA X", None, false, &[]), Grupo::Fragrancias);
        assert_eq!(classificar("BOUQUET Y", None, true, &[]), Grupo::Fragrancias, "fragrância vence inativo");
        assert_eq!(classificar("LAURIL", None, true, &[false]), Grupo::Inativos);
        assert_eq!(classificar("LAURIL", None, false, &[true, true]), Grupo::Terceirizados);
        assert_eq!(classificar("LAURIL", None, false, &[true, false]), Grupo::Ativos, "um produto ativo basta");
        assert_eq!(classificar("LAURIL", None, false, &[]), Grupo::Ativos);
        assert!(produto_suspenso("ativo", 0));
        assert!(produto_suspenso("terceirizado", 1));
        assert!(!produto_suspenso("ativo", 1));
    }

    /// Teste de ouro: a carga real da balança (434 itens, 2 PLUs cada) tem de sair igual do código.
    #[test]
    fn carga_real_da_balanca_sai_igual() {
        let csv = include_str!("testdata/de_para_pesagem.csv");
        let ouro = include_str!("testdata/ITENSMGV.TXT");
        // PLU -> nome gravado na balança (posições 18..68, duas linhas de 25)
        let mut nome_por_plu = std::collections::HashMap::new();
        for l in ouro.lines().filter(|l| l.len() >= 68) {
            nome_por_plu.insert(l[3..9].to_string(), l[18..68].to_string());
        }
        let (mut comparados, mut diferentes) = (0usize, Vec::new());
        for l in csv.lines().skip(1) {
            let p: Vec<&str> = l.splitn(3, ',').collect();
            if p.len() < 3 || p[2].trim().is_empty() {
                continue;
            }
            let plu_rapido = format!("{:0>6}", p[0].trim());
            let Some(esperado) = nome_por_plu.get(&plu_rapido) else { continue };
            let (l1, l2) = dividir(&sanitizar(&simplificar(p[2], None)));
            comparados += 1;
            if &format!("{l1}{l2}") != esperado {
                diferentes.push(format!("{}: obtido {:?} / esperado {:?}", p[1], format!("{l1}{l2}"), esperado));
            }
        }
        assert!(comparados > 400, "comparou só {comparados} itens");
        // 433 de 434 saem idênticos; o 434º (9.15.292) difere só porque o CSV trocou a vírgula do nome por espaço
        assert!(diferentes.len() <= 1, "{} diferenças em {comparados}:\n{}", diferentes.len(), diferentes.join("\n"));
    }
}

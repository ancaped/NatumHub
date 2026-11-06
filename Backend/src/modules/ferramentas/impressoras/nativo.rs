//! Etiqueta com texto e código de barras **nativos** da Zebra (fontes e barras gravadas na impressora),
//! mais uma imagem só para os gráficos (caixas, linhas, QR, logos). Fica bem mais nítido que mandar tudo
//! como imagem. Só para impressora remota (ZPL ou EPL); o caminho por imagem continua como reserva.

use serde::Deserialize;

use super::raw_label::Bitmap;

#[derive(Debug, Clone, Deserialize)]
pub struct TextoNativo {
    pub x_mm: f64,
    pub y_mm: f64,
    pub width_mm: f64,
    pub height_mm: f64,
    pub texto: String,
    /// Tamanho da fonte em pontos (o mesmo do modelo).
    pub pt: f64,
    #[serde(default)]
    pub negrito: bool,
    /// `left`, `center` ou `right`.
    #[serde(default)]
    pub alinhamento: String,
    #[serde(default)]
    pub multilinha: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BarraNativa {
    pub x_mm: f64,
    pub y_mm: f64,
    pub width_mm: f64,
    pub height_mm: f64,
    pub valor: String,
    /// `code128`, `ean13` ou `code39`.
    pub formato: String,
    /// Módulos do código (para a largura da barra fina ser um número inteiro de pontos).
    pub modulos: u32,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct PaginaNativa {
    #[serde(default)]
    pub textos: Vec<TextoNativo>,
    #[serde(default)]
    pub barras: Vec<BarraNativa>,
    /// PNG só com os gráficos, no tamanho da etiqueta (pode vir ampliado; o servidor reduz).
    #[serde(default)]
    pub imagem_png_base64: Option<String>,
}

fn pontos(mm: f64, dpi: f64) -> i32 {
    ((mm / 25.4) * dpi).round() as i32
}

/// ZPL e EPL tratam `^`, `~`, aspas e barra como comando: troca por espaço/caractere seguro.
fn limpar_zpl(t: &str) -> String {
    t.chars().map(|c| if c == '^' || c == '~' || c == '\\' || c.is_control() { ' ' } else { c }).collect()
}

fn cp850(texto: &str) -> Vec<u8> {
    texto
        .chars()
        .map(|c| match c {
            'á' => 0xA0, 'é' => 0x82, 'í' => 0xA1, 'ó' => 0xA2, 'ú' => 0xA3, 'ã' => 0xC6, 'õ' => 0xE4, 'ç' => 0x87,
            'â' => 0x83, 'ê' => 0x88, 'ô' => 0x93, 'à' => 0x85, 'Á' => 0xB5, 'É' => 0x90, 'Ç' => 0x80, 'º' => 0xA7,
            'Í' => 0xD6, 'Ó' => 0xE0, 'Ú' => 0xE9, 'Ã' => 0xC7, 'Õ' => 0xE5, 'Â' => 0xB6, 'Ê' => 0xD2, 'Ô' => 0xE2,
            c if c.is_ascii() && !c.is_control() => c as u8,
            _ => b'?',
        })
        .collect()
}

/// Fontes bitmap do EPL (largura × altura em pontos, a 203 dpi).
const FONTES_EPL: [(u32, i32, i32); 4] = [(1, 8, 12), (2, 10, 16), (3, 12, 20), (4, 14, 24)];

/// Escolhe fonte e multiplicador do EPL cuja altura fica mais perto da pedida (preferindo as maiores).
fn fonte_epl(altura: i32, largura_max: i32, nchars: usize) -> (u32, i32, i32, i32) {
    let mut melhor = (4u32, 14, 24, 1i32);
    let mut melhor_dif = i32::MAX;
    for &(f, w, h) in FONTES_EPL.iter() {
        for m in 1..=6 {
            let (cw, ch) = (w * m, h * m);
            if nchars as i32 * cw > largura_max.max(cw) && m > 1 {
                continue;
            }
            let dif = (ch - altura).abs();
            if dif < melhor_dif || (dif == melhor_dif && f > melhor.0) {
                melhor_dif = dif;
                melhor = (f, w, h, m);
            }
        }
    }
    melhor
}

fn altura_texto(pt: f64, dpi: f64) -> i32 {
    ((pt * dpi / 72.0) * 1.05).round().max(8.0) as i32
}

pub fn montar_pagina(epl: bool, dpi: f64, largura: u32, altura: u32, pag: &PaginaNativa, imagem: Option<&Bitmap>, copias: u32, dx: i32) -> Vec<u8> {
    if epl {
        montar_epl(dpi, largura, altura, pag, imagem, copias, dx)
    } else {
        montar_zpl(dpi, largura, altura, pag, imagem, copias, dx)
    }
}

fn montar_zpl(dpi: f64, largura: u32, altura: u32, pag: &PaginaNativa, imagem: Option<&Bitmap>, copias: u32, dx: i32) -> Vec<u8> {
    let mut s = format!("^XA^CI28^PW{largura}^LL{altura}^LH0,0");
    if let Some(b) = imagem {
        let total = b.linhas.len();
        s.push_str(&format!("^FO0,0^GFA,{total},{total},{},", b.bytes_por_linha()));
        for byte in &b.linhas {
            s.push_str(&format!("{byte:02X}"));
        }
        s.push_str("^FS");
    }
    for t in &pag.textos {
        let hd = altura_texto(t.pt, dpi);
        let x = (pontos(t.x_mm, dpi) + dx).max(0);
        let caixa_h = pontos(t.height_mm, dpi);
        let largura_caixa = pontos(t.width_mm, dpi).max(1);
        let (linhas, y) = if t.multilinha {
            (((caixa_h as f64) / (hd as f64 * 1.2)).floor().max(1.0) as i32, pontos(t.y_mm, dpi))
        } else {
            (1, pontos(t.y_mm, dpi) + ((caixa_h - hd) / 2).max(0))
        };
        let j = match t.alinhamento.as_str() {
            "center" => 'C',
            "right" => 'R',
            _ => 'L',
        };
        let texto = limpar_zpl(&t.texto);
        // A fonte 0 da Zebra já é encorpada: o negrito por impressão dupla deixava o traço grosso demais.
        s.push_str(&format!("^FO{x},{y}^FB{largura_caixa},{linhas},0,{j},0^A0N,{hd}^FD{texto}^FS"));
    }
    for b in &pag.barras {
        let larg_caixa = pontos(b.width_mm, dpi).max(1);
        let modulo = (larg_caixa / b.modulos.max(1) as i32).max(1);
        let larg = modulo * b.modulos.max(1) as i32;
        let x = (pontos(b.x_mm, dpi) + dx + (larg_caixa - larg) / 2).max(0);
        let y = pontos(b.y_mm, dpi);
        let h = pontos(b.height_mm, dpi).max(10);
        let valor = limpar_zpl(&b.valor);
        match b.formato.as_str() {
            "ean13" => {
                let digitos: String = valor.chars().filter(|c| c.is_ascii_digit()).take(13).collect();
                s.push_str(&format!("^FO{x},{y}^BY{modulo}^BEN,{h},N,N^FD{digitos}^FS"));
            }
            "code39" => s.push_str(&format!("^FO{x},{y}^BY{modulo},3,{h}^B3N,N,{h},N,N^FD{valor}^FS")),
            _ => s.push_str(&format!("^FO{x},{y}^BY{modulo},3,{h}^BCN,{h},N,N,N,A^FD{valor}^FS")),
        }
    }
    s.push_str(&format!("^PQ{}^XZ", copias.max(1)));
    s.into_bytes()
}

fn montar_epl(dpi: f64, largura: u32, altura: u32, pag: &PaginaNativa, imagem: Option<&Bitmap>, copias: u32, dx: i32) -> Vec<u8> {
    let mut out: Vec<u8> = format!("\nN\nq{largura}\nQ{altura},24\nI8,1,001\n").into_bytes();
    if let Some(b) = imagem {
        out.extend(format!("GW0,0,{},{},", b.bytes_por_linha(), b.altura).into_bytes());
        out.extend(b.linhas.iter().map(|x| !x));
        out.extend(b"\n");
    }
    for t in &pag.textos {
        let hd = altura_texto(t.pt, dpi);
        let caixa_w = pontos(t.width_mm, dpi).max(1);
        let caixa_h = pontos(t.height_mm, dpi);
        let nchars = t.texto.chars().count();
        let (fonte, fw, fh, m) = fonte_epl(hd, caixa_w, nchars);
        let larg_texto = nchars as i32 * fw * m;
        let x0 = pontos(t.x_mm, dpi) + dx;
        let x = match t.alinhamento.as_str() {
            "center" => x0 + ((caixa_w - larg_texto) / 2).max(0),
            "right" => x0 + (caixa_w - larg_texto).max(0),
            _ => x0,
        }
        .max(0);
        let y = pontos(t.y_mm, dpi) + if t.multilinha { 0 } else { ((caixa_h - fh * m) / 2).max(0) };
        let corpo = cp850(&t.texto.replace('\\', " ").replace('"', "'"));
        for extra in 0..(if t.negrito { 2 } else { 1 }) {
            out.extend(format!("A{},{y},0,{fonte},{m},{m},N,\"", x + extra).into_bytes());
            out.extend(&corpo);
            out.extend(b"\"\n");
        }
    }
    for b in &pag.barras {
        let larg_caixa = pontos(b.width_mm, dpi).max(1);
        let modulo = (larg_caixa / b.modulos.max(1) as i32).max(1);
        let larg = modulo * b.modulos.max(1) as i32;
        let x = (pontos(b.x_mm, dpi) + dx + (larg_caixa - larg) / 2).max(0);
        let y = pontos(b.y_mm, dpi);
        let h = pontos(b.height_mm, dpi).max(10);
        let valor = b.valor.replace('"', "").replace('\\', "");
        let (tipo, dado) = match b.formato.as_str() {
            "ean13" => ("E30", valor.chars().filter(|c| c.is_ascii_digit()).take(12).collect::<String>()),
            "code39" => ("3", valor.to_uppercase()),
            _ => ("1", valor),
        };
        out.extend(format!("B{x},{y},0,{tipo},{modulo},{},{h},N,\"{dado}\"\n", modulo * 2).into_bytes());
    }
    out.extend(format!("P{}\n", copias.max(1)).into_bytes());
    out
}

#[cfg(test)]
mod testes {
    use super::*;

    fn pagina() -> PaginaNativa {
        PaginaNativa {
            textos: vec![TextoNativo {
                x_mm: 5.0, y_mm: 17.0, width_mm: 42.0, height_mm: 5.0, texto: "Nº Lote: 202611".into(), pt: 9.0,
                negrito: true, alinhamento: "center".into(), multilinha: false,
            }],
            barras: vec![BarraNativa { x_mm: 53.0, y_mm: 28.0, width_mm: 42.0, height_mm: 9.0, valor: "202611".into(), formato: "code128".into(), modulos: 68 }],
            imagem_png_base64: None,
        }
    }

    #[test]
    fn zpl_tem_texto_centralizado_negrito_e_barra() {
        let z = String::from_utf8(montar_pagina(false, 203.0, 800, 400, &pagina(), None, 2, 0)).unwrap();
        assert!(z.starts_with("^XA^CI28^PW800^LL400"));
        assert_eq!(z.matches("^FB").count(), 1, "ZPL não imprime em dobro no negrito");
        assert!(z.contains(",C,0^A0N,"));
        assert!(z.contains("^BY4,3,") && z.contains("^BCN,"));
        assert!(z.ends_with("^PQ2^XZ"));
    }

    #[test]
    fn epl_escolhe_fonte_e_acentua_em_cp850() {
        let mut p = pagina();
        p.textos[0].texto = "Contém".into();
        let e = montar_pagina(true, 203.0, 800, 400, &p, None, 1, 0);
        assert!(e.starts_with(b"\nN\nq800"));
        assert!(e.windows(1).any(|w| w[0] == 0x82), "é em CP850");
        let s = String::from_utf8_lossy(&e);
        assert!(s.contains("B") && s.ends_with("P1\n"));
    }

    #[test]
    fn deslocamento_move_o_texto() {
        let a = String::from_utf8(montar_pagina(false, 203.0, 800, 400, &pagina(), None, 1, 0)).unwrap();
        let b = String::from_utf8(montar_pagina(false, 203.0, 800, 400, &pagina(), None, 1, 8)).unwrap();
        assert_ne!(a, b);
    }
}

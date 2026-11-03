//! Conversão da etiqueta (PNG já renderizado na DPI da impressora) em comandos ZPL/EPL.
//! Funções puras, sem rede nem banco.

use std::io::Cursor;

/// Imagem monocromática: 1 bit por ponto (1 = preto), linhas alinhadas em bytes, bit mais
/// significativo à esquerda.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Bitmap {
    pub largura: u32,
    pub altura: u32,
    pub linhas: Vec<u8>,
}

impl Bitmap {
    pub fn branco(largura: u32, altura: u32) -> Self {
        let bpl = ((largura + 7) / 8) as usize;
        Self {
            largura,
            altura,
            linhas: vec![0; bpl * altura as usize],
        }
    }

    pub fn bytes_por_linha(&self) -> usize {
        ((self.largura + 7) / 8) as usize
    }

    pub fn ponto(&self, x: u32, y: u32) -> bool {
        if x >= self.largura || y >= self.altura {
            return false;
        }
        let i = y as usize * self.bytes_por_linha() + (x / 8) as usize;
        self.linhas[i] & (0x80 >> (x % 8)) != 0
    }

    pub fn definir(&mut self, x: u32, y: u32, preto: bool) {
        if x >= self.largura || y >= self.altura {
            return;
        }
        let i = y as usize * self.bytes_por_linha() + (x / 8) as usize;
        let m = 0x80u8 >> (x % 8);
        if preto {
            self.linhas[i] |= m;
        } else {
            self.linhas[i] &= !m;
        }
    }
}

/// Decodifica um PNG (RGBA, RGB, cinza, paleta) para preto e branco.
/// Transparente conta como branco; limiar de luminância 128.
/// Luminância (0 = preto, 255 = branco) de cada ponto do PNG, com o alfa transparente contando como branco.
fn png_para_luminancia(bytes: &[u8]) -> Result<(u32, u32, Vec<u8>), String> {
    let invalida = || "Imagem da etiqueta inválida.".to_string();
    let mut decoder = png::Decoder::new(Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info().map_err(|_| invalida())?;
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).map_err(|_| invalida())?;
    if info.width == 0 || info.height == 0 || info.width > 8000 || info.height > 8000 {
        return Err("Imagem da etiqueta fora do tamanho suportado.".into());
    }
    let passo = match info.color_type {
        png::ColorType::Grayscale => 1,
        png::ColorType::GrayscaleAlpha => 2,
        png::ColorType::Rgb => 3,
        png::ColorType::Rgba => 4,
        png::ColorType::Indexed => return Err(invalida()),
    };
    if info.bit_depth != png::BitDepth::Eight {
        return Err(invalida());
    }
    let mut lum = vec![255u8; info.width as usize * info.height as usize];
    let linha_bytes = info.line_size;
    for y in 0..info.height as usize {
        let linha = &buf[y * linha_bytes..(y + 1) * linha_bytes];
        for x in 0..info.width as usize {
            let p = &linha[x * passo..(x + 1) * passo];
            let (r, g, b, a) = match passo {
                1 => (p[0], p[0], p[0], 255),
                2 => (p[0], p[0], p[0], p[1]),
                3 => (p[0], p[1], p[2], 255),
                _ => (p[0], p[1], p[2], p[3]),
            };
            let sobre_branco = |c: u8| (c as u32 * a as u32 + 255 * (255 - a as u32)) / 255;
            lum[y * info.width as usize + x] =
                ((299 * sobre_branco(r) + 587 * sobre_branco(g) + 114 * sobre_branco(b)) / 1000) as u8;
        }
    }
    Ok((info.width, info.height, lum))
}

fn limiar(largura: u32, altura: u32, lum: &[u8]) -> Bitmap {
    let mut bm = Bitmap::branco(largura, altura);
    for y in 0..altura {
        for x in 0..largura {
            if lum[(y * largura + x) as usize] < 128 {
                bm.definir(x, y, true);
            }
        }
    }
    bm
}

pub fn png_para_bitmap(bytes: &[u8]) -> Result<Bitmap, String> {
    let (w, h, lum) = png_para_luminancia(bytes)?;
    Ok(limiar(w, h, &lum))
}

/// Igual a `png_para_bitmap`, mas redimensiona para `largura`×`altura` pontos (média da área, antes do preto/branco).
/// A tela pode desenhar numa DPI diferente da impressora (ex.: 300 numa Zebra de 203): sem isso a etiqueta sai maior
/// que o papel, porque o envio direto (ZPL/EPL) não passa pelo driver, que é quem ajustava o tamanho.
pub fn png_para_bitmap_no_tamanho(bytes: &[u8], largura: u32, altura: u32) -> Result<Bitmap, String> {
    let (w, h, lum) = png_para_luminancia(bytes)?;
    if (w, h) == (largura, altura) || largura == 0 || altura == 0 {
        return Ok(limiar(w, h, &lum));
    }
    let mut out = vec![255u8; largura as usize * altura as usize];
    let (fx, fy) = (w as f64 / largura as f64, h as f64 / altura as f64);
    for ny in 0..altura {
        let y0 = (ny as f64 * fy) as u32;
        let y1 = (((ny + 1) as f64 * fy).ceil() as u32).clamp(y0 + 1, h);
        for nx in 0..largura {
            let x0 = (nx as f64 * fx) as u32;
            let x1 = (((nx + 1) as f64 * fx).ceil() as u32).clamp(x0 + 1, w);
            let (mut soma, mut n) = (0u64, 0u64);
            for y in y0..y1 {
                for x in x0..x1 {
                    soma += lum[(y * w + x) as usize] as u64;
                    n += 1;
                }
            }
            out[(ny * largura + nx) as usize] = (soma / n.max(1)) as u8;
        }
    }
    Ok(limiar(largura, altura, &out))
}

/// Gira 90° no sentido horário quando `landscape` (mesmo sentido do `Landscape` do spooler do
/// Windows usado no caminho local) e aplica `fill` (0,85–1,2; fora disso 1,0): escala em volta do
/// centro mantendo o tamanho final, como o script PowerShell faz.
pub fn preparar(bitmap: Bitmap, landscape: bool, fill: f64) -> Bitmap {
    let mut bm = if landscape { girar_horario(&bitmap) } else { bitmap };
    let fill = if (0.85..=1.2).contains(&fill) { fill } else { 1.0 };
    if (fill - 1.0).abs() > 1e-9 {
        bm = escalar_centro(&bm, fill);
    }
    bm
}

fn girar_horario(b: &Bitmap) -> Bitmap {
    let mut out = Bitmap::branco(b.altura, b.largura);
    for ny in 0..out.altura {
        for nx in 0..out.largura {
            // ponto antigo (x, y) vai para (altura-1-y, x)
            if b.ponto(ny, b.altura - 1 - nx) {
                out.definir(nx, ny, true);
            }
        }
    }
    out
}

fn escalar_centro(b: &Bitmap, fill: f64) -> Bitmap {
    let mut out = Bitmap::branco(b.largura, b.altura);
    let cx = b.largura as f64 / 2.0;
    let cy = b.altura as f64 / 2.0;
    for y in 0..b.altura {
        for x in 0..b.largura {
            let sx = cx + (x as f64 + 0.5 - cx) / fill;
            let sy = cy + (y as f64 + 0.5 - cy) / fill;
            if sx >= 0.0 && sy >= 0.0 && b.ponto(sx as u32, sy as u32) {
                out.definir(x, y, true);
            }
        }
    }
    out
}

/// ZPL com a imagem em `^GFA` (hexadecimal).
pub fn zpl(b: &Bitmap, copias: u32) -> Vec<u8> {
    let total = b.linhas.len();
    let mut s = format!(
        "^XA^PW{}^LL{}^LH0,0^FO0,0^GFA,{total},{total},{},",
        b.largura,
        b.altura,
        b.bytes_por_linha()
    );
    for byte in &b.linhas {
        s.push_str(&format!("{byte:02X}"));
    }
    s.push_str(&format!("^FS^PQ{}^XZ", copias.max(1)));
    s.into_bytes()
}

/// EPL2 com a imagem em `GW` (binário). No EPL o bit 0 imprime preto: os bits são invertidos.
pub fn epl(b: &Bitmap, copias: u32) -> Vec<u8> {
    let mut out = format!(
        "\nN\nq{}\nQ{},24\nGW0,0,{},{},",
        b.largura,
        b.altura,
        b.bytes_por_linha(),
        b.altura
    )
    .into_bytes();
    out.extend(b.linhas.iter().map(|x| !x));
    out.extend(format!("\nP{}\n", copias.max(1)).into_bytes());
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redimensiona_300_para_203_dpi() {
        // 100×50 mm desenhado a 300 dpi (1181×591) vira 203 dpi (799×400), mantendo o preto.
        let (w, h) = (1181u32, 591u32);
        let mut png_bytes = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut png_bytes, w, h);
            enc.set_color(png::ColorType::Grayscale);
            enc.set_depth(png::BitDepth::Eight);
            let mut wr = enc.write_header().unwrap();
            let dados: Vec<u8> = (0..h).flat_map(|_| (0..w).map(|x| if x < w / 2 { 0 } else { 255 })).collect();
            wr.write_image_data(&dados).unwrap();
        }
        let bm = png_para_bitmap_no_tamanho(&png_bytes, 799, 400).unwrap();
        assert_eq!((bm.largura, bm.altura), (799, 400));
        assert!(bm.ponto(10, 200));
        assert!(!bm.ponto(790, 200));
    }

    fn bm_16x2() -> Bitmap {
        Bitmap {
            largura: 16,
            altura: 2,
            linhas: vec![0xFF, 0x00, 0x0F, 0xF0],
        }
    }

    #[test]
    fn zpl_esperado() {
        let z = String::from_utf8(zpl(&bm_16x2(), 3)).unwrap();
        assert_eq!(z, "^XA^PW16^LL2^LH0,0^FO0,0^GFA,4,4,2,FF000FF0^FS^PQ3^XZ");
    }

    #[test]
    fn epl_esperado_com_bits_invertidos() {
        let e = epl(&bm_16x2(), 2);
        let mut esperado = b"\nN\nq16\nQ2,24\nGW0,0,2,2,".to_vec();
        esperado.extend([0x00, 0xFF, 0xF0, 0x0F]);
        esperado.extend(b"\nP2\n");
        assert_eq!(e, esperado);
    }

    #[test]
    fn rotacao_horaria() {
        // 3x2: linha 0 = ponto em x=0; gira para 2x3: ponto vai para (altura-1-0, 0) = (1, 0)
        let mut b = Bitmap::branco(3, 2);
        b.definir(0, 0, true);
        let g = preparar(b, true, 1.0);
        assert_eq!((g.largura, g.altura), (2, 3));
        assert!(g.ponto(1, 0));
        let pretos = (0..3).flat_map(|y| (0..2).map(move |x| (x, y))).filter(|&(x, y)| g.ponto(x, y)).count();
        assert_eq!(pretos, 1);
    }

    #[test]
    fn fill_fora_da_faixa_nao_muda() {
        let b = bm_16x2();
        assert_eq!(preparar(b.clone(), false, 3.0), b);
    }

    #[test]
    fn fill_reduz_em_volta_do_centro() {
        let mut b = Bitmap::branco(20, 20);
        for y in 0..20 {
            for x in 0..20 {
                b.definir(x, y, true);
            }
        }
        let r = preparar(b, false, 0.9);
        assert!(!r.ponto(0, 0));
        assert!(r.ponto(10, 10));
    }

    fn codificar(w: u32, h: u32, cor: png::ColorType, dados: &[u8]) -> Vec<u8> {
        let mut saida = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut saida, w, h);
            enc.set_color(cor);
            enc.set_depth(png::BitDepth::Eight);
            let mut wr = enc.write_header().unwrap();
            wr.write_image_data(dados).unwrap();
        }
        saida
    }

    #[test]
    fn png_rgba_transparente_vira_branco() {
        // 2x1: preto opaco, preto transparente
        let png = codificar(2, 1, png::ColorType::Rgba, &[0, 0, 0, 255, 0, 0, 0, 0]);
        let b = png_para_bitmap(&png).unwrap();
        assert!(b.ponto(0, 0));
        assert!(!b.ponto(1, 0));
    }

    #[test]
    fn png_cinza_e_rgb() {
        let g = png_para_bitmap(&codificar(2, 1, png::ColorType::Grayscale, &[10, 200])).unwrap();
        assert!(g.ponto(0, 0) && !g.ponto(1, 0));
        let c = png_para_bitmap(&codificar(2, 1, png::ColorType::Rgb, &[0, 0, 0, 255, 255, 255])).unwrap();
        assert!(c.ponto(0, 0) && !c.ponto(1, 0));
    }

    #[test]
    fn png_invalido() {
        assert!(png_para_bitmap(b"nao e png").is_err());
    }
}

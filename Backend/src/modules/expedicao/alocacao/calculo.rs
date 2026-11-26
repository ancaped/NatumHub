use std::collections::{BTreeMap, HashMap, HashSet};

use chrono::{Datelike, NaiveDate};

use super::models::{
    AlocacaoItemView, AlocacaoLoteView, Atacadista, Caixa, Posicao, PosicaoComItens,
    ProdutoDimensao, SugestaoNaoAlocado, SugestaoProposta, SugestaoResultado, SugestaoResumo,
    TarefaReposicaoFefo,
};

const EPS: f64 = 1e-6;

/// Remove acentos básicos PT-BR e normaliza em maiúsculas para comparação insensível a acento/caixa.
pub fn normalizar_texto(s: &str) -> String {
    s.trim()
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' | 'Á' | 'À' | 'Â' | 'Ã' | 'Ä' => 'A',
            'é' | 'è' | 'ê' | 'ë' | 'É' | 'È' | 'Ê' | 'Ë' => 'E',
            'í' | 'ì' | 'î' | 'ï' | 'Í' | 'Ì' | 'Î' | 'Ï' => 'I',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' | 'Ó' | 'Ò' | 'Ô' | 'Õ' | 'Ö' => 'O',
            'ú' | 'ù' | 'û' | 'ü' | 'Ú' | 'Ù' | 'Û' | 'Ü' => 'U',
            'ç' | 'Ç' => 'C',
            other => other.to_ascii_uppercase(),
        })
        .collect()
}

/// Verifica se `nome` contém `termo` como palavra inteira (evita "DAC" casar em "SOCIEDADE").
pub fn contem_palavra_inteira(nome: &str, termo: &str) -> bool {
    let feno = normalizar_texto(nome);
    let agulha = normalizar_texto(termo);
    if agulha.is_empty() || feno.len() < agulha.len() {
        return false;
    }
    let bytes = feno.as_bytes();
    let mut inicio = 0;
    while let Some(rel) = feno[inicio..].find(&agulha) {
        let pos = inicio + rel;
        let fim = pos + agulha.len();
        let antes_ok = pos == 0
            || !feno[..pos]
                .chars()
                .next_back()
                .is_some_and(char::is_alphanumeric);
        let depois_ok = fim == bytes.len()
            || !feno[fim..]
                .chars()
                .next()
                .is_some_and(char::is_alphanumeric);
        if antes_ok && depois_ok {
            return true;
        }
        if let Some(next_ch) = feno[pos..].chars().next() {
            inicio = pos + next_ch.len_utf8();
        } else {
            break;
        }
    }
    false
}

/// Determina se um pedido pertence a um cliente atacadista (por código exato ou termo de palavra inteira).
pub fn e_cliente_atacadista(
    n_codigo: Option<i32>,
    c_nome: Option<&str>,
    regras: &[Atacadista],
) -> Option<String> {
    let nome = c_nome.unwrap_or("");
    for r in regras.iter().filter(|r| r.ativo) {
        if let Some(cod_regra) = r.cliente_codigo {
            if n_codigo == Some(cod_regra) {
                return Some(r.id.clone());
            }
        }
        if !r.termo_busca.trim().is_empty() && contem_palavra_inteira(nome, &r.termo_busca) {
            return Some(r.id.clone());
        }
    }
    None
}

/// Quantas caixas cabem na profundidade (`comprimento_vao_cm / caixa_comprimento_cm`).
pub fn caixas_comprimento(comprimento_vao_cm: f64, caixa_comprimento_cm: f64) -> i32 {
    if comprimento_vao_cm <= 0.0 || caixa_comprimento_cm <= 0.0 {
        return 0;
    }
    ((comprimento_vao_cm + EPS) / caixa_comprimento_cm).floor() as i32
}

/// Quantas camadas cabem na altura livre do vão, respeitando `empilhamento_max`.
pub fn max_camadas(altura_vao_cm: f64, caixa_altura_cm: f64, empilhamento_max: i32) -> i32 {
    if altura_vao_cm <= 0.0 || caixa_altura_cm <= 0.0 {
        return 0;
    }
    let cabem = ((altura_vao_cm + EPS) / caixa_altura_cm).floor() as i32;
    cabem.min(empilhamento_max.max(1)).max(0)
}

/// Calcula camadas compatíveis com o vão ao mover/importar um item para uma posição.
pub fn calcular_camadas_compat_vao(
    altura_vao_cm: f64,
    caixa: Option<&Caixa>,
    camadas_solicitada: Option<i32>,
    fallback_atual: i32,
) -> i32 {
    if let Some(c) = camadas_solicitada.filter(|&v| v > 0) {
        return c;
    }
    if let Some(cx) = caixa {
        let max_c = max_camadas(altura_vao_cm, cx.altura_cm, cx.empilhamento_max);
        return max_c.max(1);
    }
    fallback_atual.max(1)
}

pub fn arred4(v: f64) -> f64 {
    (v * 10_000.0).round() / 10_000.0
}

pub fn normalizar_orientacao_modo(raw: Option<&str>) -> String {
    match raw.unwrap_or("auto").trim().to_ascii_lowercase().as_str() {
        "normal" | "0" => "normal".into(),
        "rotacionado" | "90" => "rotacionado".into(),
        "amarracao" | "amarrado" => "amarracao".into(),
        _ => "auto".into(),
    }
}

#[derive(Debug, Clone)]
struct Rect2d {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

fn layouts_diferentes(a: &[Rect2d], b: &[Rect2d]) -> bool {
    if a.len() != b.len() {
        return true;
    }
    let sort_key = |r: &Rect2d| (
        (r.x * 100.0).round() as i64,
        (r.y * 100.0).round() as i64,
        (r.w * 100.0).round() as i64,
        (r.h * 100.0).round() as i64,
    );
    let mut sa: Vec<&Rect2d> = a.iter().collect();
    let mut sb: Vec<&Rect2d> = b.iter().collect();
    sa.sort_by_key(|r| sort_key(r));
    sb.sort_by_key(|r| sort_key(r));
    sa.iter().zip(sb.iter()).any(|(u, v)| {
        (u.x - v.x).abs() > 0.2
            || (u.y - v.y).abs() > 0.2
            || (u.w - v.w).abs() > 0.2
            || (u.h - v.h).abs() > 0.2
    })
}

fn verificar_apoio_camada(base: &[Rect2d], topo: &[Rect2d], min_apoio: f64) -> bool {
    if base.is_empty() || topo.is_empty() {
        return false;
    }
    let base_min_x = base.iter().map(|r| r.x).fold(f64::INFINITY, f64::min);
    let base_max_x = base.iter().map(|r| r.x + r.w).fold(f64::NEG_INFINITY, f64::max);
    let base_min_y = base.iter().map(|r| r.y).fold(f64::INFINITY, f64::min);
    let base_max_y = base.iter().map(|r| r.y + r.h).fold(f64::NEG_INFINITY, f64::max);

    for t in topo {
        let balanco_x = (t.w * 0.25).max(1.5);
        let balanco_y = (t.h * 0.25).max(1.5);
        if t.x < base_min_x - balanco_x
            || t.x + t.w > base_max_x + balanco_x
            || t.y < base_min_y - balanco_y
            || t.y + t.h > base_max_y + balanco_y
        {
            return false;
        }
        let area_t = t.w * t.h;
        if area_t <= EPS {
            return false;
        }
        let mut overlap = 0.0;
        for b in base {
            let ix = (t.x + t.w).min(b.x + b.w) - t.x.max(b.x);
            if ix <= 0.0 {
                continue;
            }
            let iy = (t.y + t.h).min(b.y + b.h) - t.y.max(b.y);
            if iy <= 0.0 {
                continue;
            }
            overlap += ix * iy;
        }
        if overlap / area_t < min_apoio - 1e-6 {
            return false;
        }
    }
    true
}

fn espelhar_eixo_rect(rects: &[Rect2d], max_x: f64, max_y: f64, mirror_x: bool, mirror_y: bool) -> Vec<Rect2d> {
    rects
        .iter()
        .map(|r| Rect2d {
            x: if mirror_x { (max_x - (r.x + r.w)).max(0.0) } else { r.x },
            y: if mirror_y { (max_y - (r.y + r.h)).max(0.0) } else { r.y },
            w: r.w,
            h: r.h,
        })
        .collect()
}

fn apoio_espelhado_retangulos(rects: &[Rect2d]) -> bool {
    if rects.is_empty() {
        return false;
    }
    let max_x = rects.iter().map(|r| r.x + r.w).fold(0.0_f64, f64::max);
    let max_y = rects.iter().map(|r| r.y + r.h).fold(0.0_f64, f64::max);
    if max_x <= EPS || max_y <= EPS {
        return false;
    }
    for &(mx, my) in &[(true, true), (true, false), (false, true)] {
        let par = espelhar_eixo_rect(rects, max_x, max_y, mx, my);
        if layouts_diferentes(rects, &par)
            && verificar_apoio_camada(rects, &par, 0.75)
            && verificar_apoio_camada(&par, rects, 0.75)
        {
            return true;
        }
    }
    false
}

fn centralizar_grade_sobre(rects: &[Rect2d], ref_max_x: f64, ref_max_y: f64, lim_w: f64, lim_d: f64) -> Option<Vec<Rect2d>> {
    if rects.is_empty() {
        return None;
    }
    let m_max_x = rects.iter().map(|r| r.x + r.w).fold(0.0_f64, f64::max);
    let m_max_y = rects.iter().map(|r| r.y + r.h).fold(0.0_f64, f64::max);
    let dx = ((ref_max_x - m_max_x) / 2.0).min(lim_w - m_max_x).max(0.0);
    let dy = ((ref_max_y - m_max_y) / 2.0).min(lim_d - m_max_y).max(0.0);
    let out: Vec<Rect2d> = rects
        .iter()
        .map(|r| Rect2d {
            x: r.x + dx,
            y: r.y + dy,
            w: r.w,
            h: r.h,
        })
        .collect();
    if out.iter().all(|r| r.x >= -EPS && r.x + r.w <= lim_w + EPS && r.y >= -EPS && r.y + r.h <= lim_d + EPS) {
        Some(out)
    } else {
        None
    }
}

#[derive(Debug, Clone)]
pub struct MelhorLastro {
    pub orientacao_efetiva: String,
    pub caixas_por_lastro: i32,
    pub caixas_comp: i32,
    pub largura_caixa_efetiva_cm: f64,
    pub profundidade_caixa_efetiva_cm: f64,
    pub amarrado: bool,
}

/// Avalia orientações (0°, 90° e amarração mista em faixas / alternância 0°-90°) dentro da largura e profundidade do vão.
/// Em modo `"auto"`, NUNCA promove silenciosamente `"normal"` para `"rotacionado"` (evita estouro em vãos multi-produto).
pub fn calcular_melhor_lastro_faixa(
    largura_disponivel_cm: f64,
    profundidade_vao_cm: f64,
    cx: &Caixa,
    fileiras_largura: i32,
    orientacao_modo: &str,
    palete_inteiro: bool,
) -> MelhorLastro {
    let fil = fileiras_largura.max(1);
    let comp_norm = caixas_comprimento(profundidade_vao_cm, cx.comprimento_cm);
    let cap_norm = fil * comp_norm.max(0);
    let modo = normalizar_orientacao_modo(Some(orientacao_modo));

    let comp_rot = if cx.pode_girar {
        caixas_comprimento(profundidade_vao_cm, cx.largura_cm)
    } else {
        0
    };
    let larg_rot_cabe = if cx.pode_girar && cx.comprimento_cm > EPS {
        ((largura_disponivel_cm + EPS) / cx.comprimento_cm).floor() as i32
    } else {
        0
    };
    let cap_rot = if larg_rot_cabe >= fil {
        fil * comp_rot.max(0)
    } else {
        0
    };

    // Partições de amarração em faixas (centralizadas e validadas em torno do bounding box real) + alternância 0°/90°
    let mut best_amar_qtd = 0i32;
    let mut best_amar_mista = false;
    if cx.pode_girar && (palete_inteiro || modo == "amarracao") && largura_disponivel_cm > EPS && profundidade_vao_cm > EPS {
        let max_nx_norm = ((largura_disponivel_cm + EPS) / cx.largura_cm.max(EPS)).floor() as i32;
        let max_ny_norm = ((profundidade_vao_cm + EPS) / cx.comprimento_cm.max(EPS)).floor() as i32;
        let ny_rot_full = ((profundidade_vao_cm + EPS) / cx.largura_cm.max(EPS)).floor() as i32;
        let nx_rot_full = ((largura_disponivel_cm + EPS) / cx.comprimento_cm.max(EPS)).floor() as i32;

        // 1) Faixas verticais (k colunas normal + resto girado 90°), centralizadas em Y
        for nx_n in 1..max_nx_norm.max(0) {
            let x_base = (nx_n as f64) * cx.largura_cm;
            let nx_r = (((largura_disponivel_cm - x_base) + EPS) / cx.comprimento_cm.max(EPS)).floor() as i32;
            if nx_r <= 0 || max_ny_norm <= 0 || ny_rot_full <= 0 {
                continue;
            }
            let d_norm = (max_ny_norm as f64) * cx.comprimento_cm;
            let d_rot = (ny_rot_full as f64) * cx.largura_cm;
            let max_d = d_norm.max(d_rot);
            let dy_norm = ((max_d - d_norm) / 2.0).max(0.0);
            let dy_rot = ((max_d - d_rot) / 2.0).max(0.0);

            let mut rects = Vec::new();
            for ix in 0..nx_n {
                for iy in 0..max_ny_norm {
                    rects.push(Rect2d {
                        x: (ix as f64) * cx.largura_cm,
                        y: dy_norm + (iy as f64) * cx.comprimento_cm,
                        w: cx.largura_cm,
                        h: cx.comprimento_cm,
                    });
                }
            }
            for rx in 0..nx_r {
                for ry in 0..ny_rot_full {
                    rects.push(Rect2d {
                        x: x_base + (rx as f64) * cx.comprimento_cm,
                        y: dy_rot + (ry as f64) * cx.largura_cm,
                        w: cx.comprimento_cm,
                        h: cx.largura_cm,
                    });
                }
            }
            let q = rects.len() as i32;
            if q > 0 && apoio_espelhado_retangulos(&rects) {
                if q > best_amar_qtd || (q == best_amar_qtd && !best_amar_mista) {
                    best_amar_qtd = q;
                    best_amar_mista = true;
                }
            }
        }

        // 2) Faixas horizontais (k fileiras em Y normal + resto girado 90°), centralizadas em X
        for ny_n in 1..max_ny_norm.max(0) {
            let y_base = (ny_n as f64) * cx.comprimento_cm;
            let ny_r = (((profundidade_vao_cm - y_base) + EPS) / cx.largura_cm.max(EPS)).floor() as i32;
            if ny_r <= 0 || max_nx_norm <= 0 || nx_rot_full <= 0 {
                continue;
            }
            let w_norm = (max_nx_norm as f64) * cx.largura_cm;
            let w_rot = (nx_rot_full as f64) * cx.comprimento_cm;
            let max_w = w_norm.max(w_rot);
            let dx_norm = ((max_w - w_norm) / 2.0).max(0.0);
            let dx_rot = ((max_w - w_rot) / 2.0).max(0.0);

            let mut rects = Vec::new();
            for iy in 0..ny_n {
                for ix in 0..max_nx_norm {
                    rects.push(Rect2d {
                        x: dx_norm + (ix as f64) * cx.largura_cm,
                        y: (iy as f64) * cx.comprimento_cm,
                        w: cx.largura_cm,
                        h: cx.comprimento_cm,
                    });
                }
            }
            for ry in 0..ny_r {
                for rx in 0..nx_rot_full {
                    rects.push(Rect2d {
                        x: dx_rot + (rx as f64) * cx.comprimento_cm,
                        y: y_base + (ry as f64) * cx.largura_cm,
                        w: cx.comprimento_cm,
                        h: cx.largura_cm,
                    });
                }
            }
            let q = rects.len() as i32;
            if q > 0 && apoio_espelhado_retangulos(&rects) {
                if q > best_amar_qtd || (q == best_amar_qtd && !best_amar_mista) {
                    best_amar_qtd = q;
                    best_amar_mista = true;
                }
            }
        }

        // 3) Alternância clássica camada ímpar 0° × camada par 90° (para caixas retangulares)
        if (cx.comprimento_cm - cx.largura_cm).abs() > 0.5 && max_nx_norm > 0 && max_ny_norm > 0 && nx_rot_full > 0 && ny_rot_full > 0 {
            let cap_n_full = max_nx_norm * max_ny_norm;
            let cap_r_full = nx_rot_full * ny_rot_full;
            let cap_alt = cap_n_full.min(cap_r_full);
            if cap_alt > best_amar_qtd {
                let mut norm_rects = Vec::new();
                for ix in 0..max_nx_norm {
                    for iy in 0..max_ny_norm {
                        norm_rects.push(Rect2d {
                            x: (ix as f64) * cx.largura_cm,
                            y: (iy as f64) * cx.comprimento_cm,
                            w: cx.largura_cm,
                            h: cx.comprimento_cm,
                        });
                    }
                }
                let mut rot_rects = Vec::new();
                for rx in 0..nx_rot_full {
                    for ry in 0..ny_rot_full {
                        rot_rects.push(Rect2d {
                            x: (rx as f64) * cx.comprimento_cm,
                            y: (ry as f64) * cx.largura_cm,
                            w: cx.comprimento_cm,
                            h: cx.largura_cm,
                        });
                    }
                }
                let n_max_x = (max_nx_norm as f64) * cx.largura_cm;
                let n_max_y = (max_ny_norm as f64) * cx.comprimento_cm;
                if let Some(rot_cent) = centralizar_grade_sobre(&rot_rects, n_max_x, n_max_y, largura_disponivel_cm, profundidade_vao_cm) {
                    if verificar_apoio_camada(&norm_rects, &rot_cent, 0.75) && verificar_apoio_camada(&rot_cent, &norm_rects, 0.75) {
                        best_amar_qtd = cap_alt;
                        best_amar_mista = true;
                    }
                }
            }
        }
    }

    let escolhido = match modo.as_str() {
        "normal" => "normal",
        "rotacionado" if cx.pode_girar && cap_rot > 0 => "rotacionado",
        "amarracao" if cx.pode_girar && best_amar_qtd > 0 => "amarracao",
        _ => {
            let piso_auto = ((cap_norm.max(cap_rot) as f64) * 0.85).floor() as i32;
            if palete_inteiro && cx.pode_girar && best_amar_qtd > 0 && best_amar_qtd >= piso_auto {
                "amarracao"
            } else {
                "normal"
            }
        }
    };

    match escolhido {
        "amarracao" => MelhorLastro {
            orientacao_efetiva: "amarracao".into(),
            caixas_por_lastro: best_amar_qtd.max(1),
            caixas_comp: (best_amar_qtd.max(1) / fil).max(1),
            largura_caixa_efetiva_cm: cx.largura_cm,
            profundidade_caixa_efetiva_cm: cx.comprimento_cm,
            amarrado: best_amar_mista,
        },
        "rotacionado" => MelhorLastro {
            orientacao_efetiva: "rotacionado".into(),
            caixas_por_lastro: cap_rot.max(0),
            caixas_comp: comp_rot.max(0),
            largura_caixa_efetiva_cm: cx.comprimento_cm,
            profundidade_caixa_efetiva_cm: cx.largura_cm,
            amarrado: false,
        },
        _ => MelhorLastro {
            orientacao_efetiva: "normal".into(),
            caixas_por_lastro: cap_norm.max(0),
            caixas_comp: comp_norm.max(0),
            largura_caixa_efetiva_cm: cx.largura_cm,
            profundidade_caixa_efetiva_cm: cx.comprimento_cm,
            amarrado: false,
        },
    }
}

#[derive(Debug, Clone)]
pub struct GeometriaAlocacao {
    pub caixas_comp: i32,
    pub max_cam: i32,
    pub total_caixas: i32,
    pub total_unidades: i32,
    pub largura_ocupada_cm: f64,
    pub altura_ocupada_cm: f64,
    pub estouro_altura: bool,
    pub cobertura_meses: Option<f64>,
    pub orientacao_efetiva: String,
    pub amarrado: bool,
    pub volume_ocupado_m3: f64,
}

pub fn calcular_geometria_alocacao_com_modo(
    pos: &Posicao,
    caixa: Option<&Caixa>,
    fileiras_largura: i32,
    camadas_altura: i32,
    qtde_cx: Option<i32>,
    media_mensal_total: f64,
    orientacao_modo: &str,
    palete_inteiro: bool,
) -> GeometriaAlocacao {
    let Some(cx) = caixa else {
        return GeometriaAlocacao {
            caixas_comp: 0,
            max_cam: 0,
            total_caixas: 0,
            total_unidades: 0,
            largura_ocupada_cm: 0.0,
            altura_ocupada_cm: 0.0,
            estouro_altura: false,
            cobertura_meses: None,
            orientacao_efetiva: "normal".into(),
            amarrado: false,
            volume_ocupado_m3: 0.0,
        };
    };
    let fileiras_eff = fileiras_largura.max(1);
    let max_cam = max_camadas(pos.altura_cm, cx.altura_cm, cx.empilhamento_max);
    let camadas_eff = camadas_altura.max(1);
    let modo_norm = normalizar_orientacao_modo(Some(orientacao_modo));
    let largura_para_lastro = if !palete_inteiro && modo_norm == "amarracao" {
        ((fileiras_eff as f64) * cx.largura_cm).min(pos.largura_cm)
    } else {
        pos.largura_cm
    };
    let lastro = calcular_melhor_lastro_faixa(
        largura_para_lastro,
        pos.comprimento_cm,
        cx,
        fileiras_eff,
        orientacao_modo,
        palete_inteiro,
    );
    let total_caixas = if lastro.orientacao_efetiva == "amarracao" {
        lastro.caixas_por_lastro * camadas_eff
    } else {
        fileiras_eff * lastro.caixas_comp.max(0) * camadas_eff
    };
    let total_unidades = qtde_cx.filter(|&q| q > 0).map(|q| total_caixas * q).unwrap_or(0);
    let largura_ocupada_cm = if lastro.orientacao_efetiva == "amarracao" {
        if palete_inteiro {
            pos.largura_cm
        } else {
            ((fileiras_eff as f64) * cx.largura_cm).min(pos.largura_cm)
        }
    } else {
        (fileiras_eff as f64) * lastro.largura_caixa_efetiva_cm
    };
    let altura_ocupada_cm = (camadas_eff as f64) * cx.altura_cm;
    let estouro_altura = altura_ocupada_cm > pos.altura_cm + EPS;
    let cobertura_meses = if media_mensal_total > 0.0 && total_unidades > 0 {
        Some(total_unidades as f64 / media_mensal_total)
    } else {
        None
    };
    let volume_unitario_m3 = (cx.altura_cm * cx.comprimento_cm * cx.largura_cm) / 1_000_000.0;
    let volume_ocupado_m3 = arred4((total_caixas.max(0) as f64) * volume_unitario_m3);

    GeometriaAlocacao {
        caixas_comp: lastro.caixas_comp,
        max_cam,
        total_caixas,
        total_unidades,
        largura_ocupada_cm,
        altura_ocupada_cm,
        estouro_altura,
        cobertura_meses,
        orientacao_efetiva: lastro.orientacao_efetiva,
        amarrado: lastro.amarrado && camadas_eff >= 2,
        volume_ocupado_m3,
    }
}

pub fn calcular_geometria_alocacao(
    pos: &Posicao,
    caixa: Option<&Caixa>,
    fileiras_largura: i32,
    camadas_altura: i32,
    qtde_cx: Option<i32>,
    media_mensal_total: f64,
) -> GeometriaAlocacao {
    calcular_geometria_alocacao_com_modo(
        pos,
        caixa,
        fileiras_largura,
        camadas_altura,
        qtde_cx,
        media_mensal_total,
        "normal",
        false,
    )
}

/// Validação física para empilhar uma pilha de caixas (`topo`) diretamente sobre outra (`base`) no mesmo palete.
/// Exige: caber na altura livre, peso/classe não crescente (pesada embaixo, leve/kit em cima) e apoio ≥ 80%.
pub fn validar_empilhamento_misto(
    base_w: f64,
    base_d: f64,
    base_h: f64,
    base_peso_cx: Option<f64>,
    base_classe: &str,
    topo_w: f64,
    topo_d: f64,
    topo_h: f64,
    topo_peso_cx: Option<f64>,
    topo_classe: &str,
    altura_vao_cm: f64,
) -> (bool, f64, Option<String>) {
    if base_w <= EPS || base_d <= EPS || topo_w <= EPS || topo_d <= EPS {
        return (false, 0.0, Some("Dimensões da caixa insuficientes para apoio".into()));
    }
    if base_h + topo_h > altura_vao_cm + EPS {
        return (
            false,
            0.0,
            Some(format!(
                "Estouro na altura do vão ({:.1} + {:.1} > {:.1} cm)",
                base_h, topo_h, altura_vao_cm
            )),
        );
    }
    if base_classe == "topo" {
        return (
            false,
            0.0,
            Some("Caixa frágil/kit na base: não suporta outra pilha em cima".into()),
        );
    }
    if topo_classe == "base" && base_classe != "base" {
        return (
            false,
            0.0,
            Some("Caixa pesada em cima de caixa padrão: risco de esmagamento".into()),
        );
    }
    if let (Some(pb), Some(pt)) = (base_peso_cx, topo_peso_cx) {
        if pt > pb * 1.05 {
            return (
                false,
                0.0,
                Some(format!(
                    "Caixa superior ({:.1} kg) é mais pesada que a base ({:.1} kg)",
                    pt, pb
                )),
            );
        }
    }
    let area_topo = topo_w * topo_d;
    let inter_w = base_w.min(topo_w);
    let inter_d = base_d.min(topo_d);
    let apoio_pct = ((inter_w * inter_d) / area_topo * 100.0).min(100.0);
    if topo_w > base_w + 3.0 || topo_d > base_d + 3.0 {
        return (
            false,
            arred2(apoio_pct),
            Some(format!(
                "Balanço lateral excessivo (apoio {:.0}% < 80% / sobra > 1,5 cm)",
                apoio_pct
            )),
        );
    }
    if apoio_pct < 80.0 - EPS {
        return (
            false,
            arred2(apoio_pct),
            Some(format!("Apoio insuficiente ({:.0}% < 80% mínimo)", apoio_pct)),
        );
    }
    (true, arred2(apoio_pct), None)
}

/// Consolida cubagem real (`m³` e `%`), área de lastro (`%`), coordenadas verticais (`z_base_cm`)
/// e estabilidade física (amarração / empilhamento misto / esbeltez) do vão.
pub fn avaliar_estabilidade_vao(
    pos: &Posicao,
    itens: &mut [AlocacaoItemView],
    peso_cx_por_prod: &HashMap<String, f64>,
    classe_por_prod: &HashMap<String, String>,
) -> (f64, f64, f64, f64, String, String) {
    let volume_vao_m3 = arred4((pos.largura_cm * pos.comprimento_cm * pos.altura_cm) / 1_000_000.0);
    if itens.is_empty() {
        return (volume_vao_m3, 0.0, 0.0, 0.0, "vazio".into(), "Vão livre".into());
    }

    struct BaseGeo {
        w: f64,
        d: f64,
        h: f64,
        peso_cx: Option<f64>,
        classe: String,
    }

    let mut bases_geo: HashMap<String, BaseGeo> = HashMap::new();
    let mut area_base_cm2 = 0.0;
    let area_vao_cm2 = (pos.largura_cm * pos.comprimento_cm).max(1.0);

    for it in itens.iter() {
        if it.empilhado_sobre.is_none() {
            let prof_cx = match it.orientacao_efetiva.as_str() {
                "rotacionado" => it.caixa_largura_cm.unwrap_or(20.0),
                _ => it.caixa_comprimento_cm.unwrap_or(20.0),
            };
            let d = (it.caixas_comprimento.max(1) as f64) * prof_cx;
            let d_eff = d.min(pos.comprimento_cm);
            area_base_cm2 += it.largura_ocupada_cm * d_eff;
            bases_geo.insert(
                it.produto_codigo.clone(),
                BaseGeo {
                    w: it.largura_ocupada_cm,
                    d: d_eff,
                    h: it.altura_ocupada_cm,
                    peso_cx: peso_cx_por_prod.get(&it.produto_codigo).copied(),
                    classe: classe_por_prod
                        .get(&it.produto_codigo)
                        .cloned()
                        .unwrap_or_else(|| "padrao".into()),
                },
            );
        }
    }

    let mut volume_ocupado_m3 = 0.0;
    let mut tem_misto = false;
    let mut tem_amarrado = false;
    let mut primeiro_alerta: Option<String> = None;

    for it in itens.iter_mut() {
        volume_ocupado_m3 += it.volume_ocupado_m3;
        if let Some(ref base_cod) = it.empilhado_sobre {
            tem_misto = true;
            if let Some(base) = bases_geo.get(base_cod) {
                it.z_base_cm = base.h;
                it.estouro_altura = (base.h + it.altura_ocupada_cm) > pos.altura_cm + EPS;
                let prof_topo = match it.orientacao_efetiva.as_str() {
                    "rotacionado" => it.caixa_largura_cm.unwrap_or(20.0),
                    _ => it.caixa_comprimento_cm.unwrap_or(20.0),
                };
                let d_topo = ((it.caixas_comprimento.max(1) as f64) * prof_topo).min(pos.comprimento_cm);
                let topo_peso = peso_cx_por_prod.get(&it.produto_codigo).copied();
                let topo_classe = classe_por_prod
                    .get(&it.produto_codigo)
                    .map(String::as_str)
                    .unwrap_or("padrao");
                let (ok, apoio, alerta) = validar_empilhamento_misto(
                    base.w,
                    base.d,
                    base.h,
                    base.peso_cx,
                    &base.classe,
                    it.largura_ocupada_cm,
                    d_topo,
                    it.altura_ocupada_cm,
                    topo_peso,
                    topo_classe,
                    pos.altura_cm,
                );
                it.apoio_pct = Some(apoio);
                if !ok {
                    it.alerta_estabilidade = alerta.clone();
                    if primeiro_alerta.is_none() {
                        primeiro_alerta = alerta;
                    }
                }
            } else {
                it.z_base_cm = 0.0;
                let msg = format!("Base {} ausente neste vão", base_cod);
                it.alerta_estabilidade = Some(msg.clone());
                if primeiro_alerta.is_none() {
                    primeiro_alerta = Some(msg);
                }
            }
        } else {
            it.z_base_cm = 0.0;
            it.apoio_pct = None;
            if it.amarrado {
                tem_amarrado = true;
            } else if it.camadas_altura >= 3 {
                let prof_cx = match it.orientacao_efetiva.as_str() {
                    "rotacionado" => it.caixa_largura_cm.unwrap_or(20.0),
                    _ => it.caixa_comprimento_cm.unwrap_or(20.0),
                };
                let d = ((it.caixas_comprimento.max(1) as f64) * prof_cx).max(1.0);
                let menor_lado = it.largura_ocupada_cm.min(d).max(1.0);
                if it.altura_ocupada_cm / menor_lado > 2.3 {
                    let msg = "Pilha estreita sem amarração (esbeltez > 2,3x)".to_string();
                    it.alerta_estabilidade = Some(msg.clone());
                    if primeiro_alerta.is_none() {
                        primeiro_alerta = Some(msg);
                    }
                }
            }
            if it.estouro_altura && it.alerta_estabilidade.is_none() {
                let msg = format!(
                    "Estouro de altura ({:.1} > {:.1} cm)",
                    it.altura_ocupada_cm, pos.altura_cm
                );
                it.alerta_estabilidade = Some(msg.clone());
                if primeiro_alerta.is_none() {
                    primeiro_alerta = Some(msg);
                }
            }
        }
    }

    let volume_ocupado_m3 = arred4(volume_ocupado_m3);
    let cubagem_pct = if volume_vao_m3 > EPS {
        arred2(((volume_ocupado_m3 / volume_vao_m3) * 100.0).min(150.0))
    } else {
        0.0
    };
    let area_ocupada_pct = arred2(((area_base_cm2 / area_vao_cm2) * 100.0).min(150.0));

    let (status, resumo) = if let Some(alerta) = primeiro_alerta {
        ("alerta".into(), alerta)
    } else if tem_misto {
        (
            "misto_estavel".into(),
            "Empilhamento misto seguro (apoio ≥ 80%, peso decrescente)".into(),
        )
    } else if tem_amarrado {
        (
            "amarrado".into(),
            "Palete com amarração cruzada entre camadas".into(),
        )
    } else {
        (
            "coluna_estavel".into(),
            "Empilhamento em coluna estável".into(),
        )
    };

    (
        volume_vao_m3,
        volume_ocupado_m3,
        cubagem_pct,
        area_ocupada_pct,
        status,
        resumo,
    )
}

pub const TARA_CAIXA_PADRAO_KG: f64 = 0.4;
pub const TARA_PALETE_PBR_KG: f64 = 25.0;
pub const ALTURA_LIMITE_ACESSO_MANUAL_CM: f64 = 120.0;

pub fn arred2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

pub fn calcular_peso_caixa_estimado_kg(
    peso_bruto_manual_kg: Option<f64>,
    peso_unitario_kg: Option<f64>,
    qtde_cx: Option<i32>,
) -> Option<f64> {
    if let Some(v) = peso_bruto_manual_kg.filter(|v| v.is_finite() && *v > 0.0) {
        return Some(arred2(v));
    }
    let u = peso_unitario_kg.filter(|v| v.is_finite() && *v > 0.0)?;
    let q = qtde_cx.filter(|&q| q > 0)?;
    Some(arred2(u * (q as f64) + TARA_CAIXA_PADRAO_KG))
}

pub fn classificar_empilhamento(
    peso_caixa_kg: Option<f64>,
    empilhamento_max: Option<i32>,
    eh_kit: bool,
) -> &'static str {
    if empilhamento_max.is_some_and(|e| e <= 2) || peso_caixa_kg.is_some_and(|p| p >= 12.0) {
        return "base";
    }
    if eh_kit || peso_caixa_kg.is_some_and(|p| p <= 3.0) {
        return "topo";
    }
    "padrao"
}

pub fn acesso_equipamento_por_cota(cota_base_cm: f64) -> &'static str {
    if cota_base_cm < ALTURA_LIMITE_ACESSO_MANUAL_CM - EPS {
        "manual"
    } else {
        "empilhadeira"
    }
}

pub fn calcular_cotas_base_andares(posicoes: &[Posicao]) -> HashMap<i32, f64> {
    let mut alt_por_andar: BTreeMap<i32, f64> = BTreeMap::new();
    for p in posicoes {
        alt_por_andar.entry(p.andar).or_insert(p.altura_cm);
    }
    let mut cotas = HashMap::new();
    let mut acum = 0.0;
    for (andar, h) in alt_por_andar {
        cotas.insert(andar, arred2(acum));
        acum += if h > 0.0 { h } else { 74.0 };
    }
    cotas
}

const TERMOS_APOIO_BRINDE: &[&str] = &[
    "SACOLA",
    "SACOLAS",
    "BRINDE",
    "BRINDES",
    "AMOSTRA",
    "AMOSTRAS",
    "DISPLAY",
    "DISPLAYS",
    "CATALOGO",
    "CATALOGOS",
    "FOLDER",
    "FOLDERS",
    "PANFLETO",
    "PANFLETOS",
    "TESTER",
    "TESTERS",
    "PROVADOR",
    "PROVADORES",
    "EXPOSITOR",
    "EXPOSITORES",
    "CARTAZ",
    "CARTAZES",
    "BANNER",
    "BANNERS",
    "NECESSAIRE",
    "NECESSAIRES",
    "BOLSA",
    "BOLSAS",
];

/// Identifica itens de apoio, material promocional ou brindes que não devem poluir a Curva ABC.
pub fn eh_item_apoio_ou_brinde(descricao: &str) -> bool {
    TERMOS_APOIO_BRINDE
        .iter()
        .any(|t| contem_palavra_inteira(descricao, t))
}

/// Determina a elegibilidade efetiva do produto para entrar no cálculo da Curva ABC.
pub fn elegibilidade_abc_efetiva(
    incluir_override: Option<bool>,
    descricao: &str,
    vendas_total: f64,
    situacao: &str,
) -> (bool, Option<String>) {
    match incluir_override {
        Some(true) => (true, None),
        Some(false) => (false, Some("Excluído manualmente da ABC".into())),
        None => {
            if eh_item_apoio_ou_brinde(descricao) {
                (false, Some("Item de apoio / brinde".into()))
            } else if vendas_total <= 0.0 {
                (false, Some("Sem vendas no período".into()))
            } else if situacao == "descontinuado" {
                (false, Some("Produto descontinuado".into()))
            } else {
                (true, None)
            }
        }
    }
}

/// Define o grupo de Curva ABC e dedicação de prateleira:
/// - Coloração (`cat_coloracao`) fica isolada no grupo `"coloracao"`.
/// - Kits ficam separados em `"kits:<linha_base>"` (próximos à sua linha principal).
/// - Demais produtos usam sua linha principal (`linha_principal ?? linha_prefix`).
pub fn definir_grupo_alocacao(
    eh_coloracao: bool,
    eh_kit: bool,
    linha_prefix: &str,
    linha_principal: Option<&str>,
    nome_linha_principal: &str,
) -> (String, String) {
    if eh_coloracao {
        return ("coloracao".to_string(), "Coloração".to_string());
    }
    let base = linha_principal
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(linha_prefix);
    let nome_base = if nome_linha_principal.trim().is_empty() {
        base
    } else {
        nome_linha_principal.trim()
    };
    if eh_kit {
        (format!("kits:{base}"), format!("Kits — {nome_base}"))
    } else {
        (base.to_string(), nome_base.to_string())
    }
}

/// Verifica se o produto pertence aos grupos/linhas permitidos em uma prateleira (vazio = livre para todas).
/// Coloração só entra em estantes com `"coloracao"`; Kits só entram com `"kits:<linha>"` ou `"kits"`.
pub fn produto_pertence_a_linhas(prod: &ProdutoDimensao, linhas_permitidas: &[String]) -> bool {
    if linhas_permitidas.is_empty() {
        return true;
    }
    if prod.eh_coloracao {
        return linhas_permitidas.iter().any(|allowed| allowed.trim() == "coloracao");
    }
    if prod.eh_kit {
        return linhas_permitidas.iter().any(|allowed| {
            let a = allowed.trim();
            a == "kits" || (!prod.grupo_alocacao.is_empty() && a == prod.grupo_alocacao)
        });
    }
    linhas_permitidas.iter().any(|allowed| {
        let a = allowed.trim();
        !a.is_empty()
            && (a == prod.grupo_alocacao
                || prod.linha_prefix == a
                || prod.linha_principal.as_deref() == Some(a)
                || prod.linha_prefix.starts_with(&format!("{a}.")))
    })
}

/// Classifica os produtos elegíveis por Curva ABC (80% A, 95% B, 100% C) separadamente por `grupo_alocacao`
/// (Linha Principal, Kits da Linha ou Coloração). Itens com `incluir_abc_efetivo == false` recebem `"FORA"`.
pub fn aplicar_curva_abc(produtos: &mut [ProdutoDimensao]) {
    produtos.sort_by(|a, b| {
        b.incluir_abc_efetivo
            .cmp(&a.incluir_abc_efetivo)
            .then_with(|| {
                b.vendas_total
                    .partial_cmp(&a.vendas_total)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| a.codigo.cmp(&b.codigo))
    });

    let mut grupos: BTreeMap<String, Vec<usize>> = BTreeMap::new();
    for (idx, p) in produtos.iter_mut().enumerate() {
        if !p.incluir_abc_efetivo {
            p.percentual_abc = 0.0;
            p.acumulado_abc = 0.0;
            p.curva_abc = "FORA".to_string();
            continue;
        }
        let lg = if !p.grupo_alocacao.trim().is_empty() {
            p.grupo_alocacao.trim().to_string()
        } else {
            p.linha_principal
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or(&p.linha_prefix)
                .to_string()
        };
        grupos.entry(lg).or_default().push(idx);
    }

    for (_linha, indices) in grupos {
        let soma_total: f64 = indices
            .iter()
            .map(|&i| produtos[i].vendas_total.max(0.0))
            .sum();
        if soma_total <= 0.0 {
            for i in indices {
                produtos[i].percentual_abc = 0.0;
                produtos[i].acumulado_abc = 0.0;
                produtos[i].curva_abc = "C".to_string();
            }
            continue;
        }
        let mut acumulado = 0.0;
        for (pos, &i) in indices.iter().enumerate() {
            let v = produtos[i].vendas_total.max(0.0);
            let pct = (v / soma_total) * 100.0;
            acumulado = (acumulado + pct).min(100.0);
            produtos[i].percentual_abc = pct;
            produtos[i].acumulado_abc = acumulado;
            produtos[i].curva_abc = if v <= 0.0 {
                "C".to_string()
            } else if pos == 0 || acumulado <= 80.0 + EPS {
                "A".to_string()
            } else if acumulado <= 95.0 + EPS {
                "B".to_string()
            } else {
                "C".to_string()
            };
        }
    }
}

pub fn calcular_necessidades_caixas(
    media_varejo: f64,
    media_atacado: f64,
    media_total: f64,
    meta_meses: f64,
    qtde_cx: Option<i32>,
) -> (i32, i32, i32) {
    let Some(q) = qtde_cx.filter(|&q| q > 0) else {
        return (0, 0, 0);
    };
    let qf = q as f64;
    let picking = if media_varejo > 0.0 {
        ((media_varejo * meta_meses) / qf).ceil().max(1.0) as i32
    } else if media_atacado > 0.0 {
        // Item 100% atacado vai direto para o Pulmão sem ocupar andares manuais de varejo
        0
    } else if media_total > 0.0 {
        1
    } else {
        0
    };
    let pulmao = if media_atacado > 0.0 {
        ((media_atacado * meta_meses) / qf).ceil().max(1.0) as i32
    } else {
        0
    };
    (picking, pulmao, picking + pulmao)
}

#[derive(Debug, Clone)]
pub struct AlocacaoExistente {
    pub id: String,
    pub posicao_id: String,
    pub produto_codigo: String,
    pub fileiras_largura: i32,
    pub camadas_altura: i32,
    pub fixado: bool,
    pub largura_ocupada_cm: f64,
    pub orientacao_modo: String,
    pub empilhado_sobre: Option<String>,
}

/// Extrai o valor de um campo `"Chave: Valor"` dentro de `stock_movements.details` separado por `|`.
pub fn extrair_campo_details_erp(details: &str, chave: &str) -> Option<String> {
    let prefixo = format!("{}:", chave.trim()).to_ascii_lowercase();
    for part in details.split('|') {
        let p = part.trim();
        let p_low = p.to_ascii_lowercase();
        if p_low.starts_with(&prefixo) {
            let val = p[prefixo.len()..].trim();
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

/// Lê `"Unidades: N"` de `stock_movements.details`, aceitando apenas `N > 1` (regra canônica: `1` é placeholder do ERP).
pub fn parse_unidades_details_erp(details: &str) -> Option<f64> {
    let raw = extrair_campo_details_erp(details, "Unidades")?;
    let val = raw.replace(',', ".").parse::<f64>().ok()?;
    if val.is_finite() && val > 1.0 {
        Some(val)
    } else {
        None
    }
}

/// Retorna true apenas para ordens ainda em aberto no ERP (`EN`, `PR`, `PP`, `PG`).
/// Exclui `EA` (finalizada/estoque atualizado), `CA` (cancelada), `FI`, `FP`, `CF`, `RP`, `LF`.
pub fn status_erp_op_aberto(status_erp: &str) -> bool {
    matches!(
        status_erp.trim().to_ascii_uppercase().as_str(),
        "EN" | "PR" | "PP" | "PG"
    )
}

/// Converte o código oficial de status do ERP em rótulo amigável e prioridade (1 = mais próxima da expedição).
pub fn rotulo_e_ordem_status_erp(status_erp: &str) -> (&'static str, i32) {
    match status_erp.trim().to_ascii_uppercase().as_str() {
        "EN" => ("Em Envase (EN)", 1),
        "PR" => ("Em Produção (PR)", 2),
        "PP" => ("Pré-Produção (PP)", 3),
        "PG" => ("Em Pesagem (PG)", 3),
        _ => ("Em Aberto", 9),
    }
}

/// Prioridade da etapa da OP para ordenação na Expedição (1 = mais próxima de chegar).
pub fn prioridade_etapa_op(etapa: &str) -> i32 {
    let s = etapa.trim();
    match s.to_ascii_uppercase().as_str() {
        "EN" => 1,
        "PR" => 2,
        "PP" | "PG" => 3,
        _ => match s {
            "Em Envase (EN)" | "Em Envase" | "Envase" | "Ordem Parcial" | "Rotulagem" => 1,
            "Em Produção (PR)" | "Em Produção" | "Liberado para Envase" => 2,
            "Pré-Produção (PP)" | "Pré-Produção" | "Em Pesagem (PG)" | "Em Pesagem" | "Produzido" => 3,
            _ => 9,
        },
    }
}

/// Converte o lote em unidades pendentes: prioriza quantidade programada em envase (> 1 un) ou kg / peso unitário.
pub fn calcular_unidades_op(
    kg: f64,
    prog_envase_un: Option<f64>,
    peso_unit_kg: Option<f64>,
    envasado_parcial: f64,
) -> i32 {
    let bruto = if let Some(u) = prog_envase_un.filter(|&v| v.is_finite() && v > 1.0) {
        u.round()
    } else if let Some(pu) = peso_unit_kg.filter(|&v| v.is_finite() && v > 0.0) {
        (kg.max(0.0) / pu).round()
    } else {
        0.0
    };
    (bruto - envasado_parcial.max(0.0)).max(0.0).round() as i32
}

/// Avalia se o endereço atual comporta o estoque + caixas chegando de OP.
pub fn classificar_espaco_op(
    qtde_cx: Option<i32>,
    estoque_cx: Option<i32>,
    op_cx: i32,
    cap_alocada_cx: i32,
    tem_endereco: bool,
) -> (String, i32) {
    if qtde_cx.unwrap_or(0) <= 0 {
        return ("sem_qtde_cx".into(), 0);
    }
    if !tem_endereco {
        return ("sem_endereco".into(), op_cx.max(1));
    }
    let necessidade = estoque_cx.unwrap_or(0).max(0) + op_cx.max(0);
    let deficit = (necessidade - cap_alocada_cx.max(0)).max(0);
    if deficit > 0 {
        ("falta_espaco".into(), deficit)
    } else {
        ("ok".into(), 0)
    }
}

fn score_ergonomia_paleteira(prod: &ProdutoDimensao, cota_base_cm: f64, papel_alvo: &str) -> i32 {
    let eh_chao = cota_base_cm <= 1.0;
    let eh_manual = acesso_equipamento_por_cota(cota_base_cm) == "manual";
    if papel_alvo == "picking" {
        if prod.classe_empilhamento == "base" {
            if eh_chao {
                0
            } else if eh_manual {
                2
            } else {
                8
            }
        } else if prod.curva_abc == "A" {
            if eh_manual { 0 } else { 6 }
        } else if prod.curva_abc == "B" {
            if eh_manual { 0 } else { 3 }
        } else if eh_manual {
            0
        } else {
            1
        }
    } else if prod.classe_empilhamento == "base" && !eh_manual {
        2
    } else {
        0
    }
}

fn descrever_motivo_escolha(
    prod: &ProdutoDimensao,
    pos: &Posicao,
    acesso: &str,
    papel_alvo: &str,
    considerar_ops: bool,
) -> String {
    if papel_alvo == "pulmao" {
        if considerar_ops && prod.op_pendente_caixas > 0 {
            return format!("Pulmão + OP (+{} cx)", prod.op_pendente_caixas);
        }
        return if pos.compartilhado_fracionado {
            "Pulmão compartilhado".into()
        } else {
            "Pulmão · excedente".into()
        };
    }
    if prod.classe_empilhamento == "base" && acesso == "manual" {
        return "Caixa pesada · acesso chão/manual".into();
    }
    if pos.compartilhado_fracionado && (prod.curva_abc == "C" || prod.eh_coloracao) {
        return format!("Curva {} · vão compartilhado", prod.curva_abc);
    }
    if acesso == "manual" {
        return format!("Curva {} · acesso manual", prod.curva_abc);
    }
    format!("Curva {} · picking", prod.curva_abc)
}

fn vao_elegivel_sugestao(pos: &Posicao, papel: &str) -> bool {
    let tipo = pos.tipo_ocupacao.trim();
    pos.ativo && pos.papel == papel && (tipo.is_empty() || tipo == "padrao")
}

/// Ajusta o score do vão conforme o perfil Curva A/C e o marcador `compartilhado_fracionado`.
fn score_compartilhado(prod: &ProdutoDimensao, pos: &Posicao) -> i32 {
    if pos.compartilhado_fracionado {
        if !prod.eh_coloracao && prod.curva_abc == "A" {
            4
        } else {
            0
        }
    } else if !prod.eh_coloracao && prod.curva_abc == "C" {
        2
    } else if prod.eh_coloracao {
        1
    } else {
        0
    }
}

#[derive(Debug, Clone)]
struct BasePilhaSnapshot {
    produto_codigo: String,
    grupo_alocacao: String,
    peso_caixa_kg: Option<f64>,
    classe_empilhamento: String,
    w_cm: f64,
    d_cm: f64,
    h_ocupada_cm: f64,
    ja_tem_topo: bool,
}

#[derive(Debug, Clone)]
struct EscolhaLastroVao {
    orientacao_modo: String,
    fileiras: i32,
    camadas: i32,
    total_caixas: i32,
    largura_ocupada_cm: f64,
    profundidade_ocupada_cm: f64,
    altura_ocupada_cm: f64,
    amarrado: bool,
    volume_ocupado_m3: f64,
}

fn escolher_melhor_encaixe_lastro(
    pos: &Posicao,
    livre_cm: f64,
    usada_cm: f64,
    cx: &Caixa,
    camadas_override: Option<i32>,
    qtd_desejada: i32,
    papel: &str,
) -> Option<EscolhaLastroVao> {
    let max_cam = max_camadas(pos.altura_cm, cx.altura_cm, cx.empilhamento_max);
    let cam = camadas_override
        .map(|ov| ov.clamp(1, max_cam.max(1)))
        .unwrap_or(max_cam);
    if max_cam <= 0 || cam <= 0 {
        return None;
    }

    let mut opcoes: Vec<EscolhaLastroVao> = Vec::new();
    let orientations: &[&str] = if cx.pode_girar {
        &["normal", "rotacionado"]
    } else {
        &["normal"]
    };
    let vol_un = (cx.altura_cm * cx.comprimento_cm * cx.largura_cm) / 1_000_000.0;

    for &ori in orientations {
        let (w_cx, d_cx) = if ori == "rotacionado" {
            (cx.comprimento_cm, cx.largura_cm)
        } else {
            (cx.largura_cm, cx.comprimento_cm)
        };
        if w_cx <= EPS || d_cx <= EPS || livre_cm + EPS < w_cx {
            continue;
        }
        let comp = caixas_comprimento(pos.comprimento_cm, d_cx);
        if comp <= 0 {
            continue;
        }
        let max_fil = ((livre_cm + EPS) / w_cx).floor() as i32;
        if max_fil <= 0 {
            continue;
        }
        let cap_fil = comp * cam;
        let desejadas = ((qtd_desejada.max(1) as f64) / (cap_fil as f64))
            .ceil()
            .max(1.0) as i32;
        let mut fil = desejadas.min(max_fil).max(1);
        let mut larg_add = (fil as f64) * w_cx;

        // Amarração de palete inteiro (somente quando o vão está vazio na base e tem >= 2 camadas)
        if ori == "normal" && usada_cm <= EPS && cam >= 2 && cx.pode_girar {
            let max_fil_full = ((pos.largura_cm + EPS) / cx.largura_cm.max(EPS)).floor() as i32;
            let lastro_amar = calcular_melhor_lastro_faixa(
                pos.largura_cm,
                pos.comprimento_cm,
                cx,
                max_fil_full.max(1),
                "amarracao",
                true,
            );
            let tot_amar = lastro_amar.caixas_por_lastro * cam;
            let cap_norm_full = max_fil_full.max(1) * comp;
            let min_lastro_aceitavel = ((cap_norm_full as f64) * 0.80).floor() as i32;
            let vai_palete_inteiro = (larg_add >= pos.largura_cm * 0.65)
                || (papel == "pulmao" && desejadas >= max_fil)
                || (qtd_desejada >= lastro_amar.caixas_por_lastro * 2
                    && (larg_add >= pos.largura_cm * 0.60 || papel == "pulmao"));

            if vai_palete_inteiro
                && lastro_amar.amarrado
                && lastro_amar.caixas_por_lastro >= min_lastro_aceitavel.max(1)
            {
                opcoes.push(EscolhaLastroVao {
                    orientacao_modo: "amarracao".into(),
                    fileiras: max_fil_full.max(1),
                    camadas: cam,
                    total_caixas: tot_amar,
                    // Palete amarrado ocupa a largura inteira do vão para nenhum outro produto invadir e estourar 100 cm.
                    largura_ocupada_cm: pos.largura_cm,
                    profundidade_ocupada_cm: pos.comprimento_cm,
                    altura_ocupada_cm: arred2((cam as f64) * cx.altura_cm),
                    amarrado: true,
                    volume_ocupado_m3: arred4((tot_amar as f64) * vol_un),
                });
            }
        }

        // Previne alerta de esbeltez (cam >= 3 e altura / menor_lado > 2,3x sem amarração)
        let d_occ = (comp as f64) * d_cx;
        let mut cam_eff = cam;
        if cam_eff >= 3 {
            let menor_atual = larg_add.min(d_occ).max(1.0);
            if ((cam_eff as f64) * cx.altura_cm) / menor_atual > 2.3 {
                if let Some(f2) = (fil + 1..=max_fil).find(|&f| {
                    let w2 = (f as f64) * w_cx;
                    w2 <= livre_cm + EPS
                        && ((cam_eff as f64) * cx.altura_cm) / w2.min(d_occ).max(1.0) <= 2.3
                }) {
                    fil = f2;
                    larg_add = (fil as f64) * w_cx;
                } else {
                    while cam_eff >= 3
                        && ((cam_eff as f64) * cx.altura_cm) / larg_add.min(d_occ).max(1.0) > 2.3
                    {
                        cam_eff -= 1;
                    }
                }
            }
        }

        if larg_add > livre_cm + EPS {
            continue;
        }
        let tot = fil * comp * cam_eff;
        let modo_salvo = if ori == "normal" { "auto" } else { "rotacionado" };
        opcoes.push(EscolhaLastroVao {
            orientacao_modo: modo_salvo.into(),
            fileiras: fil,
            camadas: cam_eff,
            total_caixas: tot,
            largura_ocupada_cm: arred2(larg_add).min(livre_cm),
            profundidade_ocupada_cm: arred2(d_occ),
            altura_ocupada_cm: arred2((cam_eff as f64) * cx.altura_cm),
            amarrado: false,
            volume_ocupado_m3: arred4((tot as f64) * vol_un),
        });
    }

    opcoes.into_iter().max_by(|a, b| {
        let a_atende = a.total_caixas >= qtd_desejada;
        let b_atende = b.total_caixas >= qtd_desejada;
        a_atende
            .cmp(&b_atende)
            .then_with(|| a.amarrado.cmp(&b.amarrado))
            .then_with(|| {
                if a_atende && b_atende {
                    // Se ambos atendem, prefere ocupar menos largura para deixar espaço livre no palete
                    b.largura_ocupada_cm
                        .partial_cmp(&a.largura_ocupada_cm)
                        .unwrap_or(std::cmp::Ordering::Equal)
                        .then_with(|| a.total_caixas.cmp(&b.total_caixas))
                } else {
                    a.total_caixas.cmp(&b.total_caixas)
                }
            })
    })
}

/// Motor de sugestão híbrida: zona por linha (principal) + Curva ABC + Varejo (manuais) × Pulmão (atacadistas) +
/// orientação/amarração + empilhamento misto seguro (peso decrescente, apoio ≥ 80%) + OPs chegando.
pub fn sugerir_alocacao(
    estrutura_id: &str,
    posicoes: &[Posicao],
    caixas: &[Caixa],
    existentes: &[AlocacaoExistente],
    produtos: &[ProdutoDimensao],
    linhas_permitidas: &[String],
    manter_fixados: bool,
    limpar_nao_fixados: bool,
    considerar_ops_chegando: bool,
) -> SugestaoResultado {
    let caixa_map: HashMap<&str, &Caixa> = caixas.iter().map(|c| (c.id.as_str(), c)).collect();
    let cotas_base = calcular_cotas_base_andares(posicoes);

    let mut removidas_count = 0usize;
    let mut largura_usada: HashMap<String, f64> = HashMap::new();
    let mut volume_usado_pos: HashMap<String, f64> = HashMap::new();
    let mut linhas_na_posicao: HashMap<String, HashSet<String>> = HashMap::new();
    let mut caixas_na_posicao: HashMap<String, HashSet<String>> = HashMap::new();
    let mut pares_ocupados: HashSet<(String, String)> = HashSet::new();
    let mut picking_fixo_caixas: HashMap<String, i32> = HashMap::new();
    let mut pulmao_fixo_caixas: HashMap<String, i32> = HashMap::new();
    let mut produtos_ja_alocados: HashSet<String> = HashSet::new();
    let mut bases_por_posicao: HashMap<String, Vec<BasePilhaSnapshot>> = HashMap::new();

    let prod_map: HashMap<&str, &ProdutoDimensao> =
        produtos.iter().map(|p| (p.codigo.as_str(), p)).collect();
    let pos_map: HashMap<&str, &Posicao> =
        posicoes.iter().map(|p| (p.id.as_str(), p)).collect();

    let mut base_count_ex: HashMap<String, usize> = HashMap::new();
    for ex in existentes {
        let manter = if ex.fixado { manter_fixados } else { !limpar_nao_fixados };
        if manter && ex.empilhado_sobre.is_none() {
            *base_count_ex.entry(ex.posicao_id.clone()).or_insert(0) += 1;
        }
    }

    for ex in existentes {
        let manter = if ex.fixado {
            manter_fixados
        } else {
            !limpar_nao_fixados
        };
        if !manter {
            removidas_count += 1;
            continue;
        }
        if ex.empilhado_sobre.is_none() {
            *largura_usada.entry(ex.posicao_id.clone()).or_insert(0.0) += ex.largura_ocupada_cm;
        }
        pares_ocupados.insert((ex.posicao_id.clone(), ex.produto_codigo.clone()));
        produtos_ja_alocados.insert(ex.produto_codigo.clone());

        if let Some(prod) = prod_map.get(ex.produto_codigo.as_str()) {
            let lg = prod
                .linha_principal
                .clone()
                .unwrap_or_else(|| prod.linha_prefix.clone());
            linhas_na_posicao
                .entry(ex.posicao_id.clone())
                .or_default()
                .insert(lg);
            if let Some(cid) = &prod.caixa_id {
                caixas_na_posicao
                    .entry(ex.posicao_id.clone())
                    .or_default()
                    .insert(cid.clone());
            }
            if let Some(pos) = pos_map.get(ex.posicao_id.as_str()) {
                if let Some(cid) = &prod.caixa_id {
                    if let Some(cx) = caixa_map.get(cid.as_str()) {
                        let unico_ex = ex.empilhado_sobre.is_none()
                            && base_count_ex.get(&ex.posicao_id).copied().unwrap_or(0) == 1
                            && ex.orientacao_modo == "amarracao";
                        let g = calcular_geometria_alocacao_com_modo(
                            pos,
                            Some(cx),
                            ex.fileiras_largura,
                            ex.camadas_altura,
                            prod.qtde_cx_efetiva,
                            prod.media_total,
                            &ex.orientacao_modo,
                            unico_ex,
                        );
                        *volume_usado_pos.entry(pos.id.clone()).or_insert(0.0) += g.volume_ocupado_m3;
                        if pos.papel == "picking" {
                            *picking_fixo_caixas
                                .entry(prod.codigo.clone())
                                .or_insert(0) += g.total_caixas;
                        } else {
                            *pulmao_fixo_caixas
                                .entry(prod.codigo.clone())
                                .or_insert(0) += g.total_caixas;
                        }
                        if ex.empilhado_sobre.is_none() {
                            let prof_cx = if g.orientacao_efetiva == "rotacionado" {
                                cx.largura_cm
                            } else {
                                cx.comprimento_cm
                            };
                            let base_d = if unico_ex && g.amarrado {
                                pos.comprimento_cm
                            } else {
                                ((g.caixas_comp.max(1) as f64) * prof_cx).min(pos.comprimento_cm)
                            };
                            bases_por_posicao.entry(pos.id.clone()).or_default().push(BasePilhaSnapshot {
                                produto_codigo: prod.codigo.clone(),
                                grupo_alocacao: prod.grupo_alocacao.clone(),
                                peso_caixa_kg: prod.peso_caixa_estimado_kg,
                                classe_empilhamento: prod.classe_empilhamento.clone(),
                                w_cm: g.largura_ocupada_cm.min(pos.largura_cm),
                                d_cm: base_d,
                                h_ocupada_cm: g.altura_ocupada_cm,
                                ja_tem_topo: false,
                            });
                        }
                    }
                }
            }
        }
    }
    // Marcar bases que já possuem topo dentre os existentes mantidos
    for ex in existentes {
        let manter = if ex.fixado { manter_fixados } else { !limpar_nao_fixados };
        if !manter {
            continue;
        }
        if let Some(ref base_cod) = ex.empilhado_sobre {
            if let Some(lista) = bases_por_posicao.get_mut(&ex.posicao_id) {
                for b in lista.iter_mut() {
                    if &b.produto_codigo == base_cod {
                        b.ja_tem_topo = true;
                    }
                }
            }
        }
    }

    // Demanda total por grupo de linha para ordenar linhas de maior giro na frente (colunas A, B...)
    let mut demanda_linha: HashMap<String, f64> = HashMap::new();
    for p in produtos {
        let lg = p
            .linha_principal
            .clone()
            .unwrap_or_else(|| p.linha_prefix.clone());
        *demanda_linha.entry(lg).or_insert(0.0) += p.media_total;
    }

    let mut candidatos: Vec<&ProdutoDimensao> = Vec::new();
    let mut nao_alocados: Vec<SugestaoNaoAlocado> = Vec::new();

    for p in produtos {
        if !p.incluir_abc_efetivo || !produto_pertence_a_linhas(p, linhas_permitidas) {
            continue;
        }
        if !limpar_nao_fixados && produtos_ja_alocados.contains(&p.codigo) {
            continue;
        }
        let Some(cid) = &p.caixa_id else {
            nao_alocados.push(SugestaoNaoAlocado {
                produto_codigo: p.codigo.clone(),
                produto_descricao: p.descricao.clone(),
                curva_abc: p.curva_abc.clone(),
                motivo: "Sem caixa vinculada".into(),
            });
            continue;
        };
        if !caixa_map.contains_key(cid.as_str()) {
            nao_alocados.push(SugestaoNaoAlocado {
                produto_codigo: p.codigo.clone(),
                produto_descricao: p.descricao.clone(),
                curva_abc: p.curva_abc.clone(),
                motivo: "Caixa vinculada inativa ou ausente".into(),
            });
            continue;
        }
        if p.qtde_cx_efetiva.unwrap_or(0) <= 0 {
            nao_alocados.push(SugestaoNaoAlocado {
                produto_codigo: p.codigo.clone(),
                produto_descricao: p.descricao.clone(),
                curva_abc: p.curva_abc.clone(),
                motivo: "Sem qtde/caixa (nQtdeCx)".into(),
            });
            continue;
        }
        candidatos.push(p);
    }

    let abc_rank = |c: &str| match c {
        "A" => 0,
        "B" => 1,
        _ => 2,
    };

    candidatos.sort_by(|a, b| {
        let base_a = if a.eh_coloracao {
            "coloracao"
        } else {
            a.linha_principal.as_deref().unwrap_or(&a.linha_prefix)
        };
        let base_b = if b.eh_coloracao {
            "coloracao"
        } else {
            b.linha_principal.as_deref().unwrap_or(&b.linha_prefix)
        };
        let da = demanda_linha.get(base_a).copied().unwrap_or(0.0);
        let db = demanda_linha.get(base_b).copied().unwrap_or(0.0);
        db.partial_cmp(&da)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| base_a.cmp(base_b))
            // Linha principal vem primeiro; Kits da mesma linha vêm logo em seguida (próximos)
            .then_with(|| a.eh_kit.cmp(&b.eh_kit))
            .then_with(|| abc_rank(&a.curva_abc).cmp(&abc_rank(&b.curva_abc)))
            .then_with(|| {
                b.media_total
                    .partial_cmp(&a.media_total)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| {
                b.caixa_altura_cm
                    .unwrap_or(0.0)
                    .partial_cmp(&a.caixa_altura_cm.unwrap_or(0.0))
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| a.codigo.cmp(&b.codigo))
    });

    // Picking (Varejo): prioriza vãos com acesso manual (< 120 cm) antes de qualquer outro
    let mut picking_pos: Vec<&Posicao> = posicoes
        .iter()
        .filter(|p| vao_elegivel_sugestao(p, "picking"))
        .collect();
    picking_pos.sort_by_key(|p| {
        let cota = cotas_base.get(&p.andar).copied().unwrap_or(0.0);
        let nao_manual = acesso_equipamento_por_cota(cota) != "manual";
        (nao_manual, p.andar, p.coluna_ordem, p.lado, p.nivel)
    });

    let mut pulmao_pos: Vec<&Posicao> = posicoes
        .iter()
        .filter(|p| vao_elegivel_sugestao(p, "pulmao"))
        .collect();
    pulmao_pos.sort_by_key(|p| (p.andar, p.coluna_ordem, p.lado, p.nivel));

    let mut propostas: Vec<SugestaoProposta> = Vec::new();
    let mut produtos_com_proposta: HashSet<String> = HashSet::new();
    let mut itens_so_atacado_no_pulmao = 0usize;

    for prod in candidatos {
        let cid = prod.caixa_id.as_ref().unwrap();
        let cx = caixa_map[cid.as_str()];
        let qtde_cx = prod.qtde_cx_efetiva.unwrap_or(1).max(1);
        let lg = prod
            .linha_principal
            .clone()
            .unwrap_or_else(|| prod.linha_prefix.clone());

        let fix_pick = picking_fixo_caixas.get(&prod.codigo).copied().unwrap_or(0);
        let fix_pulm = pulmao_fixo_caixas.get(&prod.codigo).copied().unwrap_or(0);

        // Se caixas_necessarias_picking == 0 (100% atacado), não ocupa andares manuais de varejo
        let precisa_varejo = prod.caixas_necessarias_picking > 0 || prod.media_atacado <= 0.0;
        let min_pick = if precisa_varejo {
            prod.caixas_necessarias_picking.max(1)
        } else {
            0
        };
        let rest_pick = (min_pick - fix_pick).max(0);

        let mut rest_pulm = (prod.caixas_necessarias_pulmao - fix_pulm).max(0);
        if considerar_ops_chegando && prod.op_pendente_caixas > 0 {
            let pico_total = prod.estoque_caixas.unwrap_or(0).max(0) + prod.op_pendente_caixas;
            let meta_planejada = min_pick + prod.caixas_necessarias_pulmao;
            let excedente_op = (pico_total - meta_planejada).max(0);
            rest_pulm += excedente_op;
        }
        if !precisa_varejo && fix_pick == 0 && (rest_pulm > 0 || fix_pulm > 0) {
            itens_so_atacado_no_pulmao += 1;
        }
        let mut precisa_picking = precisa_varejo && (fix_pick == 0 || rest_pick > 0);

        // 1) Picking (Varejo / andares manuais): primeiro lado a lado/frente-fundo; só empilha sobre outra caixa se faltar lastro
        if precisa_picking && !picking_pos.is_empty() {
            let mut melhor_lastro: Option<(i32, usize, EscolhaLastroVao)> = None;
            for (idx, pos) in picking_pos.iter().enumerate() {
                if pares_ocupados.contains(&(pos.id.clone(), prod.codigo.clone())) {
                    continue;
                }
                let usada = largura_usada.get(&pos.id).copied().unwrap_or(0.0);
                let livre = (pos.largura_cm - usada).max(0.0);
                let Some(encaixe) = escolher_melhor_encaixe_lastro(
                    pos,
                    livre,
                    usada,
                    cx,
                    prod.camadas_override,
                    rest_pick.max(1),
                    "picking",
                ) else {
                    continue;
                };
                let max_fil_v = ((livre + EPS) / cx.largura_cm.min(cx.comprimento_cm).max(1.0)).floor() as i32;
                let cabe_tudo = encaixe.total_caixas >= rest_pick.max(1) || max_fil_v >= encaixe.fileiras;
                let mesma_linha = linhas_na_posicao.get(&pos.id).is_some_and(|s| s.contains(&lg));
                let mesma_caixa = caixas_na_posicao.get(&pos.id).is_some_and(|s| s.contains(cid));
                let vazio = usada <= EPS;
                let cota = cotas_base.get(&pos.andar).copied().unwrap_or(0.0);

                let base_prio = if mesma_linha && mesma_caixa {
                    0
                } else if mesma_linha {
                    1
                } else if vazio || mesma_caixa {
                    2
                } else {
                    3
                } + score_compartilhado(prod, pos)
                    + score_ergonomia_paleteira(prod, cota, "picking");
                let prio = if cabe_tudo { base_prio } else { base_prio + 10 };
                let melhor = melhor_lastro
                    .as_ref()
                    .map_or(true, |m| (prio, idx) < (m.0, m.1));
                if melhor {
                    melhor_lastro = Some((prio, idx, encaixe));
                }
            }

            if let Some((_, idx, enc)) = melhor_lastro {
                let pos = picking_pos[idx];
                *largura_usada.entry(pos.id.clone()).or_insert(0.0) += enc.largura_ocupada_cm;
                *volume_usado_pos.entry(pos.id.clone()).or_insert(0.0) += enc.volume_ocupado_m3;
                linhas_na_posicao.entry(pos.id.clone()).or_default().insert(lg.clone());
                caixas_na_posicao.entry(pos.id.clone()).or_default().insert(cid.clone());
                pares_ocupados.insert((pos.id.clone(), prod.codigo.clone()));
                bases_por_posicao.entry(pos.id.clone()).or_default().push(BasePilhaSnapshot {
                    produto_codigo: prod.codigo.clone(),
                    grupo_alocacao: prod.grupo_alocacao.clone(),
                    peso_caixa_kg: prod.peso_caixa_estimado_kg,
                    classe_empilhamento: prod.classe_empilhamento.clone(),
                    w_cm: enc.largura_ocupada_cm,
                    d_cm: enc.profundidade_ocupada_cm.min(pos.comprimento_cm),
                    h_ocupada_cm: enc.altura_ocupada_cm,
                    ja_tem_topo: false,
                });

                let cota = cotas_base.get(&pos.andar).copied().unwrap_or(0.0);
                let acesso = acesso_equipamento_por_cota(cota).to_string();
                let mut motivo = descrever_motivo_escolha(prod, pos, &acesso, "picking", considerar_ops_chegando);
                if enc.amarrado {
                    motivo = format!("{motivo} · amarrado");
                }
                let tot_un = enc.total_caixas * qtde_cx;
                propostas.push(SugestaoProposta {
                    produto_codigo: prod.codigo.clone(),
                    produto_descricao: prod.descricao.clone(),
                    curva_abc: prod.curva_abc.clone(),
                    linha_prefix: prod.linha_prefix.clone(),
                    posicao_id: pos.id.clone(),
                    posicao_codigo: pos.codigo.clone(),
                    papel: pos.papel.clone(),
                    acesso_equipamento: acesso,
                    motivo_escolha: motivo,
                    fileiras_largura: enc.fileiras,
                    camadas_altura: enc.camadas,
                    total_caixas: enc.total_caixas,
                    total_unidades: tot_un,
                    largura_ocupada_cm: enc.largura_ocupada_cm,
                    orientacao_modo: enc.orientacao_modo,
                    empilhado_sobre: None,
                    amarrado: enc.amarrado,
                    volume_ocupado_m3: enc.volume_ocupado_m3,
                });
                produtos_com_proposta.insert(prod.codigo.clone());
                let faltou_pick = (rest_pick - enc.total_caixas).max(0);
                rest_pulm += faltou_pick;
                precisa_picking = false;
            } else {
                // Fallback no Varejo: não coube no lastro -> tenta empilhamento misto seguro sobre base existente
                let mut melhor_topo: Option<(i32, usize, usize, EscolhaLastroVao)> = None;
                for (pos_idx, pos) in picking_pos.iter().enumerate() {
                    if pares_ocupados.contains(&(pos.id.clone(), prod.codigo.clone())) {
                        continue;
                    }
                    let Some(bases) = bases_por_posicao.get(&pos.id) else {
                        continue;
                    };
                    for (b_idx, base) in bases.iter().enumerate() {
                        if base.ja_tem_topo || base.produto_codigo == prod.codigo {
                            continue;
                        }
                        let h_livre = pos.altura_cm - base.h_ocupada_cm - 0.05;
                        if h_livre + EPS < cx.altura_cm {
                            continue;
                        }
                        let max_cam_top = max_camadas(h_livre, cx.altura_cm, cx.empilhamento_max);
                        if max_cam_top <= 0 {
                            continue;
                        }
                        for &ori in if cx.pode_girar { &["normal", "rotacionado"][..] } else { &["normal"][..] } {
                            let (tw_cx, td_cx) = if ori == "rotacionado" {
                                (cx.comprimento_cm, cx.largura_cm)
                            } else {
                                (cx.largura_cm, cx.comprimento_cm)
                            };
                            if tw_cx <= EPS || td_cx <= EPS || tw_cx > base.w_cm + EPS {
                                continue;
                            }
                            let max_fil_top = ((base.w_cm + EPS) / tw_cx).floor() as i32;
                            let comp_top = caixas_comprimento(base.d_cm, td_cx);
                            if max_fil_top <= 0 || comp_top <= 0 {
                                continue;
                            }
                            let fil_top = max_fil_top.min(
                                ((rest_pick.max(1) as f64) / ((comp_top * max_cam_top) as f64))
                                    .ceil()
                                    .max(1.0) as i32,
                            );
                            let tw = (fil_top as f64) * tw_cx;
                            let td = (comp_top as f64) * td_cx;
                            let th = (max_cam_top as f64) * cx.altura_cm;
                            if tw > base.w_cm + EPS || td > base.d_cm + EPS || base.h_ocupada_cm + th > pos.altura_cm - 0.01 {
                                continue;
                            }
                            let (ok, _apoio, _) = validar_empilhamento_misto(
                                base.w_cm,
                                base.d_cm,
                                base.h_ocupada_cm,
                                base.peso_caixa_kg,
                                &base.classe_empilhamento,
                                tw,
                                td,
                                th,
                                prod.peso_caixa_estimado_kg,
                                &prod.classe_empilhamento,
                                pos.altura_cm,
                            );
                            if !ok {
                                continue;
                            }
                            let mesmo_grupo = if base.grupo_alocacao == prod.grupo_alocacao { 0 } else { 2 };
                            let prio = mesmo_grupo + (pos_idx as i32);
                            let tot_cx = fil_top * comp_top * max_cam_top;
                            let vol_un = (cx.altura_cm * cx.comprimento_cm * cx.largura_cm) / 1_000_000.0;
                            let modo_salvo = if ori == "normal" { "auto" } else { "rotacionado" };
                            let enc = EscolhaLastroVao {
                                orientacao_modo: modo_salvo.into(),
                                fileiras: fil_top,
                                camadas: max_cam_top,
                                total_caixas: tot_cx,
                                largura_ocupada_cm: arred2(tw).min(base.w_cm),
                                profundidade_ocupada_cm: arred2(td).min(base.d_cm),
                                altura_ocupada_cm: arred2(th),
                                amarrado: false,
                                volume_ocupado_m3: arred4((tot_cx as f64) * vol_un),
                            };
                            if melhor_topo.as_ref().map_or(true, |m| prio < m.0) {
                                melhor_topo = Some((prio, pos_idx, b_idx, enc));
                            }
                        }
                    }
                }

                if let Some((_, pos_idx, b_idx, enc)) = melhor_topo {
                    let pos = picking_pos[pos_idx];
                    let base_cod = bases_por_posicao[&pos.id][b_idx].produto_codigo.clone();
                    bases_por_posicao.get_mut(&pos.id).unwrap()[b_idx].ja_tem_topo = true;
                    *volume_usado_pos.entry(pos.id.clone()).or_insert(0.0) += enc.volume_ocupado_m3;
                    pares_ocupados.insert((pos.id.clone(), prod.codigo.clone()));
                    let cota = cotas_base.get(&pos.andar).copied().unwrap_or(0.0);
                    let acesso = acesso_equipamento_por_cota(cota).to_string();
                    let tot_un = enc.total_caixas * qtde_cx;
                    propostas.push(SugestaoProposta {
                        produto_codigo: prod.codigo.clone(),
                        produto_descricao: prod.descricao.clone(),
                        curva_abc: prod.curva_abc.clone(),
                        linha_prefix: prod.linha_prefix.clone(),
                        posicao_id: pos.id.clone(),
                        posicao_codigo: pos.codigo.clone(),
                        papel: pos.papel.clone(),
                        acesso_equipamento: acesso,
                        motivo_escolha: format!("Empilhado sobre {base_cod} (manual)"),
                        fileiras_largura: enc.fileiras,
                        camadas_altura: enc.camadas,
                        total_caixas: enc.total_caixas,
                        total_unidades: tot_un,
                        largura_ocupada_cm: enc.largura_ocupada_cm,
                        orientacao_modo: enc.orientacao_modo,
                        empilhado_sobre: Some(base_cod),
                        amarrado: false,
                        volume_ocupado_m3: enc.volume_ocupado_m3,
                    });
                    produtos_com_proposta.insert(prod.codigo.clone());
                    let faltou_pick = (rest_pick - enc.total_caixas).max(0);
                    rest_pulm += faltou_pick;
                    precisa_picking = false;
                }
            }
        }

        // 2) Pulmão (atacadistas, excedentes e OPs chegando): busca palete fechado amarrado p/ Curva A/B grande ou combina/empilha misto
        let mut faltou_pulmao = false;
        if rest_pulm > 0 {
            let mut rem = rest_pulm;
            while rem > 0 {
                let mut escolhido: Option<(i32, usize, EscolhaLastroVao)> = None;
                for (idx, pos) in pulmao_pos.iter().enumerate() {
                    if pares_ocupados.contains(&(pos.id.clone(), prod.codigo.clone())) {
                        continue;
                    }
                    let usada = largura_usada.get(&pos.id).copied().unwrap_or(0.0);
                    let livre = (pos.largura_cm - usada).max(0.0);
                    let Some(encaixe) = escolher_melhor_encaixe_lastro(
                        pos,
                        livre,
                        usada,
                        cx,
                        prod.camadas_override,
                        rem,
                        "pulmao",
                    ) else {
                        continue;
                    };
                    let cabe_tudo = encaixe.total_caixas >= rem;
                    let mesma_linha = linhas_na_posicao.get(&pos.id).is_some_and(|s| s.contains(&lg));
                    let mesma_caixa = caixas_na_posicao.get(&pos.id).is_some_and(|s| s.contains(cid));
                    let vazio = usada <= EPS;
                    let cota = cotas_base.get(&pos.andar).copied().unwrap_or(0.0);

                    // Curva A/B com grande volume prefere palete vazio fechado com amarração
                    let pref_palete_fechado = (prod.curva_abc == "A" || prod.curva_abc == "B")
                        && encaixe.largura_ocupada_cm >= pos.largura_cm * 0.65;
                    let base_prio = if pref_palete_fechado {
                        if vazio { 0 } else if mesma_linha { 2 } else { 4 }
                    } else if mesma_linha && mesma_caixa {
                        0
                    } else if mesma_linha {
                        1
                    } else if vazio || mesma_caixa {
                        2
                    } else {
                        3
                    } + score_compartilhado(prod, pos)
                        + score_ergonomia_paleteira(prod, cota, "pulmao");
                    let prio = if cabe_tudo { base_prio } else { base_prio + 10 };
                    if escolhido.as_ref().map_or(true, |m| (prio, idx) < (m.0, m.1)) {
                        escolhido = Some((prio, idx, encaixe));
                    }
                }

                if let Some((_, idx, enc)) = escolhido {
                    let pos = pulmao_pos[idx];
                    *largura_usada.entry(pos.id.clone()).or_insert(0.0) += enc.largura_ocupada_cm;
                    *volume_usado_pos.entry(pos.id.clone()).or_insert(0.0) += enc.volume_ocupado_m3;
                    linhas_na_posicao.entry(pos.id.clone()).or_default().insert(lg.clone());
                    caixas_na_posicao.entry(pos.id.clone()).or_default().insert(cid.clone());
                    pares_ocupados.insert((pos.id.clone(), prod.codigo.clone()));
                    bases_por_posicao.entry(pos.id.clone()).or_default().push(BasePilhaSnapshot {
                        produto_codigo: prod.codigo.clone(),
                        grupo_alocacao: prod.grupo_alocacao.clone(),
                        peso_caixa_kg: prod.peso_caixa_estimado_kg,
                        classe_empilhamento: prod.classe_empilhamento.clone(),
                        w_cm: enc.largura_ocupada_cm,
                        d_cm: enc.profundidade_ocupada_cm.min(pos.comprimento_cm),
                        h_ocupada_cm: enc.altura_ocupada_cm,
                        ja_tem_topo: false,
                    });

                    let cota = cotas_base.get(&pos.andar).copied().unwrap_or(0.0);
                    let acesso = acesso_equipamento_por_cota(cota).to_string();
                    let mut motivo = descrever_motivo_escolha(prod, pos, &acesso, "pulmao", considerar_ops_chegando);
                    if enc.amarrado {
                        motivo = format!("{motivo} · amarrado");
                    }
                    let tot_un = enc.total_caixas * qtde_cx;
                    propostas.push(SugestaoProposta {
                        produto_codigo: prod.codigo.clone(),
                        produto_descricao: prod.descricao.clone(),
                        curva_abc: prod.curva_abc.clone(),
                        linha_prefix: prod.linha_prefix.clone(),
                        posicao_id: pos.id.clone(),
                        posicao_codigo: pos.codigo.clone(),
                        papel: pos.papel.clone(),
                        acesso_equipamento: acesso,
                        motivo_escolha: motivo,
                        fileiras_largura: enc.fileiras,
                        camadas_altura: enc.camadas,
                        total_caixas: enc.total_caixas,
                        total_unidades: tot_un,
                        largura_ocupada_cm: enc.largura_ocupada_cm,
                        orientacao_modo: enc.orientacao_modo,
                        empilhado_sobre: None,
                        amarrado: enc.amarrado,
                        volume_ocupado_m3: enc.volume_ocupado_m3,
                    });
                    produtos_com_proposta.insert(prod.codigo.clone());
                    rem = (rem - enc.total_caixas).max(0);
                    continue;
                }

                // Tenta empilhar em cima de uma base no Pulmão se sobrou altura e o apoio é seguro
                let mut melhor_topo_pulm: Option<(i32, usize, usize, EscolhaLastroVao)> = None;
                for (pos_idx, pos) in pulmao_pos.iter().enumerate() {
                    if pares_ocupados.contains(&(pos.id.clone(), prod.codigo.clone())) {
                        continue;
                    }
                    let Some(bases) = bases_por_posicao.get(&pos.id) else {
                        continue;
                    };
                    for (b_idx, base) in bases.iter().enumerate() {
                        if base.ja_tem_topo || base.produto_codigo == prod.codigo {
                            continue;
                        }
                        let h_livre = pos.altura_cm - base.h_ocupada_cm - 0.05;
                        if h_livre + EPS < cx.altura_cm {
                            continue;
                        }
                        let max_cam_top = max_camadas(h_livre, cx.altura_cm, cx.empilhamento_max);
                        if max_cam_top <= 0 {
                            continue;
                        }
                        for &ori in if cx.pode_girar { &["normal", "rotacionado"][..] } else { &["normal"][..] } {
                            let (tw_cx, td_cx) = if ori == "rotacionado" {
                                (cx.comprimento_cm, cx.largura_cm)
                            } else {
                                (cx.largura_cm, cx.comprimento_cm)
                            };
                            if tw_cx <= EPS || td_cx <= EPS || tw_cx > base.w_cm + EPS {
                                continue;
                            }
                            let max_fil_top = ((base.w_cm + EPS) / tw_cx).floor() as i32;
                            let comp_top = caixas_comprimento(base.d_cm, td_cx);
                            if max_fil_top <= 0 || comp_top <= 0 {
                                continue;
                            }
                            let fil_top = max_fil_top.min(
                                ((rem as f64) / ((comp_top * max_cam_top) as f64))
                                    .ceil()
                                    .max(1.0) as i32,
                            );
                            let tw = (fil_top as f64) * tw_cx;
                            let td = (comp_top as f64) * td_cx;
                            let th = (max_cam_top as f64) * cx.altura_cm;
                            if tw > base.w_cm + EPS || td > base.d_cm + EPS || base.h_ocupada_cm + th > pos.altura_cm - 0.01 {
                                continue;
                            }
                            let (ok, _apoio, _) = validar_empilhamento_misto(
                                base.w_cm,
                                base.d_cm,
                                base.h_ocupada_cm,
                                base.peso_caixa_kg,
                                &base.classe_empilhamento,
                                tw,
                                td,
                                th,
                                prod.peso_caixa_estimado_kg,
                                &prod.classe_empilhamento,
                                pos.altura_cm,
                            );
                            if !ok {
                                continue;
                            }
                            let mesmo_grupo = if base.grupo_alocacao == prod.grupo_alocacao { 0 } else { 2 };
                            let prio = mesmo_grupo + (pos_idx as i32);
                            let tot_cx = fil_top * comp_top * max_cam_top;
                            let vol_un = (cx.altura_cm * cx.comprimento_cm * cx.largura_cm) / 1_000_000.0;
                            let modo_salvo = if ori == "normal" { "auto" } else { "rotacionado" };
                            let enc = EscolhaLastroVao {
                                orientacao_modo: modo_salvo.into(),
                                fileiras: fil_top,
                                camadas: max_cam_top,
                                total_caixas: tot_cx,
                                largura_ocupada_cm: arred2(tw).min(base.w_cm),
                                profundidade_ocupada_cm: arred2(td).min(base.d_cm),
                                altura_ocupada_cm: arred2(th),
                                amarrado: false,
                                volume_ocupado_m3: arred4((tot_cx as f64) * vol_un),
                            };
                            if melhor_topo_pulm.as_ref().map_or(true, |m| prio < m.0) {
                                melhor_topo_pulm = Some((prio, pos_idx, b_idx, enc));
                            }
                        }
                    }
                }

                if let Some((_, pos_idx, b_idx, enc)) = melhor_topo_pulm {
                    let pos = pulmao_pos[pos_idx];
                    let base_cod = bases_por_posicao[&pos.id][b_idx].produto_codigo.clone();
                    bases_por_posicao.get_mut(&pos.id).unwrap()[b_idx].ja_tem_topo = true;
                    *volume_usado_pos.entry(pos.id.clone()).or_insert(0.0) += enc.volume_ocupado_m3;
                    pares_ocupados.insert((pos.id.clone(), prod.codigo.clone()));
                    let cota = cotas_base.get(&pos.andar).copied().unwrap_or(0.0);
                    let acesso = acesso_equipamento_por_cota(cota).to_string();
                    let tot_un = enc.total_caixas * qtde_cx;
                    propostas.push(SugestaoProposta {
                        produto_codigo: prod.codigo.clone(),
                        produto_descricao: prod.descricao.clone(),
                        curva_abc: prod.curva_abc.clone(),
                        linha_prefix: prod.linha_prefix.clone(),
                        posicao_id: pos.id.clone(),
                        posicao_codigo: pos.codigo.clone(),
                        papel: pos.papel.clone(),
                        acesso_equipamento: acesso,
                        motivo_escolha: format!("Pulmão · sobre {base_cod}"),
                        fileiras_largura: enc.fileiras,
                        camadas_altura: enc.camadas,
                        total_caixas: enc.total_caixas,
                        total_unidades: tot_un,
                        largura_ocupada_cm: enc.largura_ocupada_cm,
                        orientacao_modo: enc.orientacao_modo,
                        empilhado_sobre: Some(base_cod),
                        amarrado: false,
                        volume_ocupado_m3: enc.volume_ocupado_m3,
                    });
                    produtos_com_proposta.insert(prod.codigo.clone());
                    rem = (rem - enc.total_caixas).max(0);
                } else {
                    faltou_pulmao = true;
                    break;
                }
            }
        }

        if precisa_picking && !produtos_com_proposta.contains(&prod.codigo) {
            nao_alocados.push(SugestaoNaoAlocado {
                produto_codigo: prod.codigo.clone(),
                produto_descricao: prod.descricao.clone(),
                curva_abc: prod.curva_abc.clone(),
                motivo: "Sem espaço livre compatível na estrutura (altura/largura)".into(),
            });
        } else if faltou_pulmao && !produtos_com_proposta.contains(&prod.codigo) {
            nao_alocados.push(SugestaoNaoAlocado {
                produto_codigo: prod.codigo.clone(),
                produto_descricao: prod.descricao.clone(),
                curva_abc: prod.curva_abc.clone(),
                motivo: "Sem espaço livre no Pulmão".into(),
            });
        }
    }

    let mut posicoes_usadas = 0usize;
    let mut soma_pct = 0.0;
    let mut soma_cub_pct = 0.0;
    let ativas: Vec<&Posicao> = posicoes.iter().filter(|p| p.ativo).collect();
    for pos in &ativas {
        let u = largura_usada.get(&pos.id).copied().unwrap_or(0.0);
        let vol_usado = volume_usado_pos.get(&pos.id).copied().unwrap_or(0.0);
        if u > EPS || vol_usado > EPS {
            posicoes_usadas += 1;
        }
        if pos.largura_cm > 0.0 {
            soma_pct += ((u / pos.largura_cm) * 100.0).min(100.0);
        }
        let vol_vao = (pos.largura_cm * pos.comprimento_cm * pos.altura_cm) / 1_000_000.0;
        if vol_vao > EPS && vol_usado > EPS {
            soma_cub_pct += ((vol_usado / vol_vao) * 100.0).min(100.0);
        }
    }
    let ocupacao_media_pct = if ativas.is_empty() {
        0.0
    } else {
        soma_pct / (ativas.len() as f64)
    };
    let cubagem_media_pct = if posicoes_usadas == 0 {
        0.0
    } else {
        arred2(soma_cub_pct / (posicoes_usadas as f64))
    };

    let propostas_manual_count = propostas
        .iter()
        .filter(|p| p.acesso_equipamento == "manual")
        .count();
    let propostas_empilhadeira_count = propostas
        .iter()
        .filter(|p| p.acesso_equipamento == "empilhadeira")
        .count();
    let paletes_amarrados_count = propostas.iter().filter(|p| p.amarrado).count();
    let itens_empilhados_mistos_count = propostas
        .iter()
        .filter(|p| p.empilhado_sobre.is_some())
        .count();
    let produtos_com_op_cobertos = produtos_com_proposta
        .iter()
        .filter(|cod| prod_map.get(cod.as_str()).is_some_and(|p| p.op_pendente_caixas > 0))
        .count();

    let resumo = SugestaoResumo {
        estrutura_id: estrutura_id.to_string(),
        removidas_count,
        propostas_count: propostas.len(),
        produtos_alocados: produtos_com_proposta.len(),
        posicoes_usadas,
        nao_alocados_count: nao_alocados.len(),
        ocupacao_media_pct,
        propostas_manual_count,
        propostas_empilhadeira_count,
        produtos_com_op_cobertos,
        cubagem_media_pct,
        paletes_amarrados_count,
        itens_empilhados_mistos_count,
        itens_so_atacado_no_pulmao,
    };

    SugestaoResultado {
        propostas,
        nao_alocados,
        resumo,
    }
}

/// Helper para classificar situação final de alocação de um produto.
pub fn situacao_alocacao_produto(
    caixa_id: &Option<String>,
    qtde_cx: Option<i32>,
    alocacoes: &[AlocacaoItemView],
    estoque_caixas: Option<i32>,
    total_caixas_alocadas: i32,
) -> String {
    if caixa_id.is_none() {
        return "sem_caixa".into();
    }
    if qtde_cx.unwrap_or(0) <= 0 {
        return "sem_qtde_cx".into();
    }
    if alocacoes.iter().any(|a| a.estouro_altura) {
        return "estouro_vao".into();
    }
    if alocacoes.is_empty() {
        return "sem_endereco".into();
    }
    if let Some(est_cx) = estoque_caixas {
        if est_cx > total_caixas_alocadas {
            return "estoque_acima_capacidade".into();
        }
    }
    "ok".into()
}

/// Agrupa sugestões de insumos tipo caixa por código para o painel de conferência ERP.
pub fn agrupar_insumos_caixa_nao_vinculados(
    rows: Vec<(String, String, String)>, // (ingredient_code, description, product_code)
) -> BTreeMap<String, (String, Vec<String>)> {
    let mut mapa: BTreeMap<String, (String, Vec<String>)> = BTreeMap::new();
    for (ing, desc, prod) in rows {
        let entry = mapa.entry(ing).or_insert_with(|| (desc, Vec::new()));
        if !entry.1.contains(&prod) {
            entry.1.push(prod);
        }
    }
    mapa
}

/// Classifica dias para vencer e status de validade FEFO em relação à data de referência `hoje`.
pub fn classificar_validade_fefo(
    data_validade: Option<NaiveDate>,
    hoje: NaiveDate,
) -> (Option<i64>, String) {
    let Some(val) = data_validade else {
        return (None, "sem_data".into());
    };
    let dias = (val - hoje).num_days();
    let status = if dias < 0 {
        "vencido"
    } else if dias <= 90 {
        "critico_90d"
    } else if dias <= 180 {
        "atencao_180d"
    } else {
        "ok"
    };
    (Some(dias), status.into())
}

/// Sugere validade padrão de +24 meses sobre a data de fabricação/envase.
pub fn sugerir_validade_padrao_24m(data_fab: Option<NaiveDate>) -> Option<NaiveDate> {
    let d = data_fab?;
    let novo_ano = d.year() + 2;
    NaiveDate::from_ymd_opt(novo_ano, d.month(), d.day())
        .or_else(|| NaiveDate::from_ymd_opt(novo_ano, d.month(), 28))
}

/// Detecta violações FEFO (lote mais antigo no Pulmão que no Picking) e necessidade de reposição Pulmão → Picking.
pub fn calcular_tarefas_reposicao_fefo(
    lotes: &[AlocacaoLoteView],
    posicoes: &[PosicaoComItens],
) -> Vec<TarefaReposicaoFefo> {
    let mut lotes_por_prod: HashMap<&str, Vec<&AlocacaoLoteView>> = HashMap::new();
    for l in lotes {
        if l.caixas > 0 {
            lotes_por_prod.entry(l.produto_codigo.as_str()).or_default().push(l);
        }
    }

    // Mapeia destinos Picking disponíveis por produto: (posicao_id, posicao_codigo, andar, capacidade_caixas)
    let mut pick_por_prod: HashMap<&str, Vec<(&str, &str, i32, i32)>> = HashMap::new();
    for pos in posicoes {
        if !pos.posicao.ativo || pos.posicao.papel != "picking" {
            continue;
        }
        for it in &pos.itens {
            pick_por_prod
                .entry(it.produto_codigo.as_str())
                .or_default()
                .push((
                    pos.posicao.id.as_str(),
                    pos.posicao.codigo.as_str(),
                    pos.posicao.andar,
                    it.total_caixas,
                ));
        }
    }

    let mut tarefas = Vec::new();

    for (prod_cod, lista) in lotes_por_prod {
        let mut pulmao: Vec<&AlocacaoLoteView> =
            lista.iter().copied().filter(|l| l.papel == "pulmao").collect();
        if pulmao.is_empty() {
            continue;
        }
        pulmao.sort_by(|a, b| {
            let va = a.data_validade.as_deref().unwrap_or("9999-12-31");
            let vb = b.data_validade.as_deref().unwrap_or("9999-12-31");
            va.cmp(vb).then_with(|| a.lote.cmp(&b.lote))
        });

        let picking: Vec<&AlocacaoLoteView> =
            lista.iter().copied().filter(|l| l.papel == "picking").collect();

        // Destino picking prioritário: onde já existe alocação no mapa ou onde já há lote no picking
        let destino_info = pick_por_prod
            .get(prod_cod)
            .and_then(|v| v.iter().min_by_key(|x| x.2).copied())
            .or_else(|| {
                picking.first().map(|l| {
                    (
                        l.posicao_id.as_str(),
                        l.posicao_codigo.as_str(),
                        l.andar,
                        l.caixas,
                    )
                })
            });

        let Some((dest_id, dest_cod, _andar, cap_picking)) = destino_info else {
            continue;
        };

        let mais_antigo_pulmao = pulmao[0];
        let mais_antigo_pick_val = picking
            .iter()
            .filter_map(|l| l.data_validade.as_deref())
            .min();

        let violacao_fefo = match (
            mais_antigo_pulmao.data_validade.as_deref(),
            mais_antigo_pick_val,
        ) {
            (Some(val_pulm), Some(val_pick)) => val_pulm < val_pick,
            _ => false,
        };

        let caixas_no_picking: i32 = picking.iter().map(|l| l.caixas).sum();
        let meta_reposicao = (cap_picking / 2).max(1);
        let precisa_repor = caixas_no_picking == 0 || caixas_no_picking < meta_reposicao;

        if violacao_fefo {
            let sugeridas = if cap_picking > 0 {
                mais_antigo_pulmao.caixas.min(cap_picking.max(1))
            } else {
                mais_antigo_pulmao.caixas
            };
            tarefas.push(TarefaReposicaoFefo {
                tipo: "violacao_fefo".into(),
                prioridade: 1,
                produto_codigo: prod_cod.to_string(),
                produto_descricao: mais_antigo_pulmao.produto_descricao.clone(),
                lote_id: mais_antigo_pulmao.id.clone(),
                lote: mais_antigo_pulmao.lote.clone(),
                data_validade: mais_antigo_pulmao.data_validade.clone(),
                dias_para_vencer: mais_antigo_pulmao.dias_para_vencer,
                origem_posicao_id: mais_antigo_pulmao.posicao_id.clone(),
                origem_posicao_codigo: mais_antigo_pulmao.posicao_codigo.clone(),
                destino_posicao_id: dest_id.to_string(),
                destino_posicao_codigo: dest_cod.to_string(),
                caixas_disponiveis: mais_antigo_pulmao.caixas,
                caixas_sugeridas: sugeridas.max(1),
                motivo: format!(
                    "Pulmão {} vence antes do Picking {} (FEFO)",
                    mais_antigo_pulmao.posicao_codigo, dest_cod
                ),
            });
        } else if precisa_repor {
            let alvo = (cap_picking - caixas_no_picking).max(1);
            let sugeridas = mais_antigo_pulmao.caixas.min(alvo).max(1);
            tarefas.push(TarefaReposicaoFefo {
                tipo: "reposicao_picking".into(),
                prioridade: 2,
                produto_codigo: prod_cod.to_string(),
                produto_descricao: mais_antigo_pulmao.produto_descricao.clone(),
                lote_id: mais_antigo_pulmao.id.clone(),
                lote: mais_antigo_pulmao.lote.clone(),
                data_validade: mais_antigo_pulmao.data_validade.clone(),
                dias_para_vencer: mais_antigo_pulmao.dias_para_vencer,
                origem_posicao_id: mais_antigo_pulmao.posicao_id.clone(),
                origem_posicao_codigo: mais_antigo_pulmao.posicao_codigo.clone(),
                destino_posicao_id: dest_id.to_string(),
                destino_posicao_codigo: dest_cod.to_string(),
                caixas_disponiveis: mais_antigo_pulmao.caixas,
                caixas_sugeridas: sugeridas,
                motivo: if caixas_no_picking == 0 {
                    format!("Picking {} sem lote ativo; descer do Pulmão", dest_cod)
                } else {
                    format!(
                        "Picking {} com {} cx (abaixo de 50% de {} cx)",
                        dest_cod, caixas_no_picking, cap_picking
                    )
                },
            });
        }
    }

    tarefas.sort_by(|a, b| {
        a.prioridade
            .cmp(&b.prioridade)
            .then_with(|| {
                a.dias_para_vencer
                    .unwrap_or(i64::MAX)
                    .cmp(&b.dias_para_vencer.unwrap_or(i64::MAX))
            })
            .then_with(|| a.produto_codigo.cmp(&b.produto_codigo))
    });

    tarefas
}

#[cfg(test)]
mod tests {
    use super::*;

    fn caixa_exemplo(id: &str, a: f64, c: f64, l: f64, emp: i32) -> Caixa {
        Caixa {
            id: id.into(),
            codigo: id.into(),
            nome: id.into(),
            altura_cm: a,
            comprimento_cm: c,
            largura_cm: l,
            empilhamento_max: emp,
            insumo_erp_codigo: None,
            pode_girar: true,
            peso_bruto_kg: None,
            ativo: true,
            observacoes: None,
        }
    }

    fn pos_exemplo(codigo: &str, coluna_ordem: i32, nivel: i32, papel: &str, altura_cm: f64) -> Posicao {
        Posicao {
            id: format!("est:{codigo}"),
            estrutura_id: "est".into(),
            codigo: codigo.into(),
            coluna: codigo[..1].to_string(),
            coluna_ordem,
            nivel,
            andar: ((nivel - 1) / 2) + 1,
            lado: if nivel % 2 == 1 { 1 } else { 2 },
            papel: papel.into(),
            largura_cm: 100.0,
            comprimento_cm: 120.0,
            altura_cm,
            ativo: true,
            observacoes: None,
            tipo_ocupacao: "padrao".into(),
            ocupacao_manual_pct: None,
            etiqueta_livre: None,
            reserva_motivo: None,
            reserva_ate: None,
            compartilhado_fracionado: false,
        }
    }

    #[test]
    fn palavra_inteira_atacadista_nao_da_falso_positivo_em_dac() {
        let regras = vec![
            Atacadista {
                id: "1".into(),
                nome_exibicao: "DAC".into(),
                termo_busca: "DAC".into(),
                cliente_codigo: None,
                ativo: true,
                pedidos_encontrados: 0,
            },
            Atacadista {
                id: "2".into(),
                nome_exibicao: "Lojas Santa Lucia".into(),
                termo_busca: "SANTA LUCIA".into(),
                cliente_codigo: None,
                ativo: true,
                pedidos_encontrados: 0,
            },
        ];
        assert!(e_cliente_atacadista(None, Some("DAC DISTRIBUIDORA LTDA"), &regras).is_some());
        assert!(e_cliente_atacadista(None, Some("COMERCIAL DAC-BA"), &regras).is_some());
        assert!(e_cliente_atacadista(None, Some("SOCIEDADE BELEZA LTDA"), &regras).is_none());
        assert!(e_cliente_atacadista(None, Some("ATIVIDADE COSMETICOS"), &regras).is_none());
        assert!(e_cliente_atacadista(None, Some("LOJAS SANTA LÚCIA LTDA"), &regras).is_some());
    }

    #[test]
    fn geometria_caixa_24_em_vao_74_1_cm_fecha_com_planilha() {
        let cx24 = caixa_exemplo("24", 24.7, 26.8, 15.8, 4);
        let a2 = pos_exemplo("A2", 1, 2, "picking", 74.1);
        let g = calcular_geometria_alocacao(&a2, Some(&cx24), 3, 3, Some(12), 500.0);
        assert_eq!(g.caixas_comp, 4);
        assert_eq!(g.max_cam, 3);
        assert_eq!(g.total_caixas, 36);
        assert_eq!(g.total_unidades, 432);
        assert!(!g.estouro_altura);
        assert!((g.largura_ocupada_cm - 47.4).abs() < 1e-6);
    }

    #[test]
    fn curva_abc_classifica_80_95_100() {
        let mk = |cod: &str, v: f64| ProdutoDimensao {
            codigo: cod.into(),
            descricao: cod.into(),
            codigo_barras: None,
            linha_prefix: "2.11".into(),
            nome_linha: "Hair".into(),
            linha_principal: None,
            situacao: "ativo".into(),
            incluir_abc_override: None,
            incluir_abc_efetivo: true,
            motivo_fora_abc: None,
            atendimento: "estoque".into(),
            eh_kit: false,
            eh_coloracao: false,
            grupo_alocacao: "2.11".into(),
            grupo_alocacao_nome: "Hair".into(),
            estoque_atual: 0.0,
            estoque_caixas: None,
            qtde_cx_erp: Some(12),
            qtde_cx_efetiva: Some(12),
            qtde_cx_origem: "erp".into(),
            caixa_id: Some("9".into()),
            caixa_codigo: Some("9".into()),
            caixa_nome: Some("9".into()),
            caixa_origem: "manual".into(),
            caixa_altura_cm: Some(22.5),
            caixa_comprimento_cm: Some(19.5),
            caixa_largura_cm: Some(14.7),
            empilhamento_max: Some(4),
            peso_unitario_kg: None,
            peso_caixa_estimado_kg: None,
            classe_empilhamento: "padrao".into(),
            insumo_caixa_erp: None,
            insumo_caixa_erp_desc: None,
            camadas_override: None,
            vendas_varejo: v,
            media_varejo: v / 12.0,
            vendas_atacado: 0.0,
            media_atacado: 0.0,
            vendas_total: v,
            media_total: v / 12.0,
            percentual_abc: 0.0,
            acumulado_abc: 0.0,
            curva_abc: String::new(),
            meta_meses_efetiva: 2.0,
            caixas_necessarias_picking: 1,
            caixas_necessarias_pulmao: 0,
            caixas_necessarias_total: 1,
            alocacoes: vec![],
            enderecos_picking: vec![],
            enderecos_pulmao: vec![],
            total_caixas_alocadas: 0,
            total_unidades_alocadas: 0,
            cobertura_meses_alocada: None,
            situacao_alocacao: "sem_endereco".into(),
            op_pendente_unidades: 0,
            op_pendente_caixas: 0,
            op_pendente_lotes: 0,
            op_proxima_etapa: None,
        };
        let mut prods = vec![mk("p1", 700.0), mk("p2", 200.0), mk("p3", 100.0)];
        aplicar_curva_abc(&mut prods);
        assert_eq!(prods[0].curva_abc, "A");
        assert_eq!(prods[1].curva_abc, "B");
        assert_eq!(prods[2].curva_abc, "C");
    }

    #[test]
    fn sugestao_respeita_fixado_e_separa_picking_e_pulmao() {
        let cx9 = caixa_exemplo("9", 22.5, 19.5, 14.7, 4);
        let cx132 = caixa_exemplo("132", 17.6, 26.4, 26.4, 4);
        let posicoes = vec![
            pos_exemplo("A1", 1, 1, "picking", 74.1),
            pos_exemplo("A9", 1, 9, "pulmao", 74.0),
            pos_exemplo("B9", 2, 9, "pulmao", 74.0),
        ];
        let existentes = vec![AlocacaoExistente {
            id: "fix1".into(),
            posicao_id: "est:A1".into(),
            produto_codigo: "2.11.001".into(),
            fileiras_largura: 2,
            camadas_altura: 3,
            fixado: true,
            largura_ocupada_cm: 29.4,
            orientacao_modo: "auto".into(),
            empilhado_sobre: None,
        }];
        let p_varejo = ProdutoDimensao {
            codigo: "2.11.001".into(),
            descricao: "Shampoo".into(),
            codigo_barras: None,
            linha_prefix: "2.11".into(),
            nome_linha: "Hair".into(),
            linha_principal: None,
            situacao: "ativo".into(),
            incluir_abc_override: None,
            incluir_abc_efetivo: true,
            motivo_fora_abc: None,
            atendimento: "estoque".into(),
            eh_kit: false,
            eh_coloracao: false,
            grupo_alocacao: "2.11".into(),
            grupo_alocacao_nome: "Hair".into(),
            estoque_atual: 100.0,
            estoque_caixas: Some(9),
            qtde_cx_erp: Some(12),
            qtde_cx_efetiva: Some(12),
            qtde_cx_origem: "erp".into(),
            caixa_id: Some("9".into()),
            caixa_codigo: Some("9".into()),
            caixa_nome: Some("9".into()),
            caixa_origem: "manual".into(),
            caixa_altura_cm: Some(22.5),
            caixa_comprimento_cm: Some(19.5),
            caixa_largura_cm: Some(14.7),
            empilhamento_max: Some(4),
            peso_unitario_kg: None,
            peso_caixa_estimado_kg: None,
            classe_empilhamento: "padrao".into(),
            insumo_caixa_erp: None,
            insumo_caixa_erp_desc: None,
            camadas_override: None,
            vendas_varejo: 1200.0,
            media_varejo: 100.0,
            vendas_atacado: 0.0,
            media_atacado: 0.0,
            vendas_total: 1200.0,
            media_total: 100.0,
            percentual_abc: 20.0,
            acumulado_abc: 20.0,
            curva_abc: "A".into(),
            meta_meses_efetiva: 2.0,
            caixas_necessarias_picking: 17, // já tem 2*6*3 = 36 fixadas em A1
            caixas_necessarias_pulmao: 0,
            caixas_necessarias_total: 17,
            alocacoes: vec![],
            enderecos_picking: vec!["A1".into()],
            enderecos_pulmao: vec![],
            total_caixas_alocadas: 36,
            total_unidades_alocadas: 432,
            cobertura_meses_alocada: Some(4.32),
            situacao_alocacao: "ok".into(),
            op_pendente_unidades: 0,
            op_pendente_caixas: 0,
            op_pendente_lotes: 0,
            op_proxima_etapa: None,
        };
        let p_kit = ProdutoDimensao {
            codigo: "2.12.052".into(),
            descricao: "Kit Mais Liso".into(),
            codigo_barras: None,
            linha_prefix: "2.12".into(),
            nome_linha: "Hair".into(),
            linha_principal: None,
            situacao: "ativo".into(),
            incluir_abc_override: None,
            incluir_abc_efetivo: true,
            motivo_fora_abc: None,
            atendimento: "estoque".into(),
            eh_kit: true,
            eh_coloracao: false,
            grupo_alocacao: "kits:2.12".into(),
            grupo_alocacao_nome: "Kits — Hair".into(),
            estoque_atual: 300.0,
            estoque_caixas: Some(100),
            qtde_cx_erp: Some(3),
            qtde_cx_efetiva: Some(3),
            qtde_cx_origem: "erp".into(),
            caixa_id: Some("132".into()),
            caixa_codigo: Some("132".into()),
            caixa_nome: Some("132".into()),
            caixa_origem: "manual".into(),
            caixa_altura_cm: Some(17.6),
            caixa_comprimento_cm: Some(26.4),
            caixa_largura_cm: Some(26.4),
            empilhamento_max: Some(4),
            peso_unitario_kg: None,
            peso_caixa_estimado_kg: None,
            classe_empilhamento: "padrao".into(),
            insumo_caixa_erp: None,
            insumo_caixa_erp_desc: None,
            camadas_override: None,
            vendas_varejo: 360.0,
            media_varejo: 30.0,
            vendas_atacado: 1800.0,
            media_atacado: 150.0,
            vendas_total: 2160.0,
            media_total: 180.0,
            percentual_abc: 80.0,
            acumulado_abc: 100.0,
            curva_abc: "A".into(),
            meta_meses_efetiva: 2.0,
            caixas_necessarias_picking: 20, // 1 fileira em A1 = 4*4 = 16 -> excedente 4 + 100 vai pro pulmão
            caixas_necessarias_pulmao: 100,
            caixas_necessarias_total: 120,
            alocacoes: vec![],
            enderecos_picking: vec![],
            enderecos_pulmao: vec![],
            total_caixas_alocadas: 0,
            total_unidades_alocadas: 0,
            cobertura_meses_alocada: None,
            situacao_alocacao: "sem_endereco".into(),
            op_pendente_unidades: 0,
            op_pendente_caixas: 0,
            op_pendente_lotes: 0,
            op_proxima_etapa: None,
        };
        let res = sugerir_alocacao(
            "est",
            &posicoes,
            &[cx9, cx132],
            &existentes,
            &[p_varejo, p_kit],
            &[],
            true,
            true,
            true,
        );
        // 2.11.001 já está fixado e coberto -> nenhuma nova proposta pra ele
        assert!(res.propostas.iter().all(|p| p.produto_codigo == "2.12.052"));
        assert!(res.propostas.iter().any(|p| p.posicao_codigo == "A1" && p.papel == "picking"));
        assert!(res.propostas.iter().any(|p| p.papel == "pulmao"));
    }

    #[test]
    fn mover_para_vao_menor_reduz_camadas_e_vao_maior_expande_ate_limite() {
        let cx24 = Caixa {
            id: "cx_24".into(),
            codigo: "24".into(),
            nome: "CX 24".into(),
            altura_cm: 24.7,
            comprimento_cm: 26.8,
            largura_cm: 15.8,
            empilhamento_max: 4,
            insumo_erp_codigo: None,
            pode_girar: true,
            peso_bruto_kg: None,
            ativo: true,
            observacoes: None,
        };
        // De 100cm (4 camadas) para 74.0cm -> cabe apenas 2 (24.7*3=74.1 > 74.0)
        assert_eq!(calcular_camadas_compat_vao(74.0, Some(&cx24), None, 4), 2);
        // Para 74.1cm exato -> cabe 3
        assert_eq!(calcular_camadas_compat_vao(74.1, Some(&cx24), None, 2), 3);
        // Para 100.0cm -> expande até empilhamento_max = 4
        assert_eq!(calcular_camadas_compat_vao(100.0, Some(&cx24), None, 2), 4);
    }

    #[test]
    fn mover_respeita_override_explicito_e_fallback_sem_caixa() {
        assert_eq!(calcular_camadas_compat_vao(74.0, None, None, 3), 3);
        assert_eq!(calcular_camadas_compat_vao(74.0, None, None, 0), 1);
        assert_eq!(calcular_camadas_compat_vao(74.0, None, Some(2), 5), 2);
    }

    fn prod_teste_abc(
        codigo: &str,
        descricao: &str,
        linha_prefix: &str,
        linha_principal: Option<&str>,
        vendas: f64,
        incluir_override: Option<bool>,
    ) -> ProdutoDimensao {
        let (efetivo, motivo) = elegibilidade_abc_efetiva(incluir_override, descricao, vendas, "ativo");
        let (grupo_alocacao, grupo_alocacao_nome) =
            definir_grupo_alocacao(false, false, linha_prefix, linha_principal, linha_prefix);
        ProdutoDimensao {
            codigo: codigo.into(),
            descricao: descricao.into(),
            codigo_barras: None,
            linha_prefix: linha_prefix.into(),
            nome_linha: linha_prefix.into(),
            linha_principal: linha_principal.map(str::to_string),
            situacao: "ativo".into(),
            incluir_abc_override: incluir_override,
            incluir_abc_efetivo: efetivo,
            motivo_fora_abc: motivo,
            atendimento: "estoque".into(),
            eh_kit: false,
            eh_coloracao: false,
            grupo_alocacao,
            grupo_alocacao_nome,
            estoque_atual: 50.0,
            estoque_caixas: Some(5),
            qtde_cx_erp: Some(12),
            qtde_cx_efetiva: Some(12),
            qtde_cx_origem: "erp".into(),
            caixa_id: Some("9".into()),
            caixa_codigo: Some("9".into()),
            caixa_nome: Some("9".into()),
            caixa_origem: "manual".into(),
            caixa_altura_cm: Some(22.5),
            caixa_comprimento_cm: Some(19.5),
            caixa_largura_cm: Some(14.7),
            empilhamento_max: Some(4),
            peso_unitario_kg: None,
            peso_caixa_estimado_kg: None,
            classe_empilhamento: "padrao".into(),
            insumo_caixa_erp: None,
            insumo_caixa_erp_desc: None,
            camadas_override: None,
            vendas_varejo: vendas,
            media_varejo: vendas / 12.0,
            vendas_atacado: 0.0,
            media_atacado: 0.0,
            vendas_total: vendas,
            media_total: vendas / 12.0,
            percentual_abc: 0.0,
            acumulado_abc: 0.0,
            curva_abc: String::new(),
            meta_meses_efetiva: 2.0,
            caixas_necessarias_picking: 2,
            caixas_necessarias_pulmao: 0,
            caixas_necessarias_total: 2,
            alocacoes: vec![],
            enderecos_picking: vec![],
            enderecos_pulmao: vec![],
            total_caixas_alocadas: 0,
            total_unidades_alocadas: 0,
            cobertura_meses_alocada: None,
            situacao_alocacao: "sem_endereco".into(),
            op_pendente_unidades: 0,
            op_pendente_caixas: 0,
            op_pendente_lotes: 0,
            op_proxima_etapa: None,
        }
    }

    #[test]
    fn curva_abc_separa_hair_e_natum_e_exclui_itens_apoio() {
        let mut prods = vec![
            prod_teste_abc("2.11.001", "Shampoo Hair", "2.11", Some("2"), 900.0, None),
            prod_teste_abc("2.11.002", "Condicionador Hair", "2.11", Some("2"), 100.0, None),
            prod_teste_abc("2.99.001", "Sacola Personalizada Hair", "2.15", Some("2"), 5000.0, None),
            prod_teste_abc("1.01.001", "Sabonete Natum", "1.01", Some("1"), 80.0, None),
            prod_teste_abc("1.01.002", "Oleo Natum Sem Giro", "1.01", Some("1"), 0.0, None),
        ];
        aplicar_curva_abc(&mut prods);
        let by = |cod: &str| prods.iter().find(|p| p.codigo == cod).unwrap().clone();
        // Hair calcula só dentro da linha 2 (900 + 100 = 1000) -> 2.11.001 = 90%, A; sacola = FORA
        assert_eq!(by("2.11.001").curva_abc, "A");
        assert!((by("2.11.001").percentual_abc - 90.0).abs() < 1e-6);
        assert_eq!(by("2.99.001").curva_abc, "FORA");
        // Natum calcula só dentro da linha 1 (80 = 100% da Natum), nunca é ofuscado por Hair
        assert_eq!(by("1.01.001").curva_abc, "A");
        assert!((by("1.01.001").percentual_abc - 100.0).abs() < 1e-6);
        assert_eq!(by("1.01.002").curva_abc, "FORA");
    }

    #[test]
    fn elegibilidade_abc_respeita_override_manual() {
        let (ef_auto_sacola, mot1) = elegibilidade_abc_efetiva(None, "Brinde Necessaire", 500.0, "ativo");
        assert!(!ef_auto_sacola);
        assert!(mot1.is_some());

        let (ef_forcado, mot2) = elegibilidade_abc_efetiva(Some(true), "Brinde Necessaire", 0.0, "ativo");
        assert!(ef_forcado);
        assert!(mot2.is_none());

        let (ef_removido, mot3) = elegibilidade_abc_efetiva(Some(false), "Shampoo Top", 1000.0, "ativo");
        assert!(!ef_removido);
        assert!(mot3.is_some());
    }

    #[test]
    fn sugestao_respeita_linhas_permitidas_da_prateleira() {
        let cx9 = caixa_exemplo("9", 22.5, 19.5, 14.7, 4);
        let posicoes = vec![pos_exemplo("A1", 1, 1, "picking", 74.1)];
        let hair = prod_teste_abc("2.11.001", "Shampoo Hair", "2.11", Some("2"), 500.0, None);
        let natum = prod_teste_abc("1.01.001", "Sabonete Natum", "1.01", Some("1"), 500.0, None);
        let mut prods = vec![hair, natum];
        aplicar_curva_abc(&mut prods);

        let res = sugerir_alocacao(
            "estante_principal",
            &posicoes,
            &[cx9],
            &[],
            &prods,
            &["2".to_string()],
            true,
            true,
            true,
        );
        assert_eq!(res.propostas.len(), 1);
        assert_eq!(res.propostas[0].produto_codigo, "2.11.001");
    }

    #[test]
    fn coloracao_e_kits_tem_curva_abc_e_regra_de_prateleira_separados() {
        let mut t1 = prod_teste_abc("1.34.001", "TIN PRETO NATUM", "1", Some("1"), 800.0, None);
        t1.eh_coloracao = true;
        (t1.grupo_alocacao, t1.grupo_alocacao_nome) =
            definir_grupo_alocacao(true, false, "1", Some("1"), "Natum");

        let aox = prod_teste_abc("1.33.001", "AOX 20 VOL NATUM", "1", Some("1"), 200.0, None);

        let mut kit_hair = prod_teste_abc("2.12.052", "KIT MAIS LISO", "2.12", Some("2"), 500.0, None);
        kit_hair.eh_kit = true;
        (kit_hair.grupo_alocacao, kit_hair.grupo_alocacao_nome) =
            definir_grupo_alocacao(false, true, "2.12", Some("2"), "Hair Extrattus");

        let hair = prod_teste_abc("2.11.001", "SHAMPOO HAIR", "2.11", Some("2"), 1000.0, None);

        let mut prods = vec![t1, aox, kit_hair, hair];
        aplicar_curva_abc(&mut prods);

        let by = |cod: &str| prods.iter().find(|p| p.codigo == cod).unwrap().clone();
        // Coloração calcula só dentro de "coloracao" -> 100% A, sem misturar com AOX da linha 1
        assert_eq!(by("1.34.001").grupo_alocacao, "coloracao");
        assert!((by("1.34.001").percentual_abc - 100.0).abs() < 1e-6);
        assert_eq!(by("1.33.001").grupo_alocacao, "1");
        assert!((by("1.33.001").percentual_abc - 100.0).abs() < 1e-6);
        // Kit calcula separado da linha 2
        assert_eq!(by("2.12.052").grupo_alocacao, "kits:2");
        assert!((by("2.12.052").percentual_abc - 100.0).abs() < 1e-6);
        assert!((by("2.11.001").percentual_abc - 100.0).abs() < 1e-6);

        // Regra de prateleira: só ["1"] NÃO aceita Coloração nem Kit Natum
        assert!(!produto_pertence_a_linhas(&by("1.34.001"), &["1".into()]));
        assert!(produto_pertence_a_linhas(&by("1.33.001"), &["1".into()]));
        assert!(produto_pertence_a_linhas(&by("1.34.001"), &["coloracao".into()]));
        assert!(!produto_pertence_a_linhas(&by("2.12.052"), &["2".into()]));
        assert!(produto_pertence_a_linhas(
            &by("2.12.052"),
            &["2".into(), "kits:2".into()],
        ));
    }

    #[test]
    fn sugestao_mantem_kits_proximos_da_linha_principal() {
        let cx9 = caixa_exemplo("9", 22.5, 19.5, 14.7, 4);
        let posicoes = vec![
            pos_exemplo("A1", 1, 1, "picking", 74.1),
            pos_exemplo("B1", 2, 1, "picking", 74.1),
        ];
        let mut hair = prod_teste_abc("2.11.001", "SHAMPOO HAIR", "2.11", Some("2"), 600.0, None);
        hair.media_total = 50.0;
        let mut kit_hair = prod_teste_abc("2.12.052", "KIT HAIR", "2.12", Some("2"), 900.0, None);
        kit_hair.eh_kit = true;
        kit_hair.media_total = 75.0;
        (kit_hair.grupo_alocacao, kit_hair.grupo_alocacao_nome) =
            definir_grupo_alocacao(false, true, "2.12", Some("2"), "Hair Extrattus");

        let mut prods = vec![hair, kit_hair];
        aplicar_curva_abc(&mut prods);

        let res = sugerir_alocacao(
            "est",
            &posicoes,
            &[cx9],
            &[],
            &prods,
            &["2".into(), "kits:2".into()],
            true,
            true,
            true,
        );
        assert_eq!(res.propostas.len(), 2);
        assert_eq!(res.propostas[0].produto_codigo, "2.11.001");
        assert_eq!(res.propostas[1].produto_codigo, "2.12.052");
    }

    #[test]
    fn peso_caixa_classe_empilhamento_e_acesso_por_cota_funcionam() {
        // Override manual prevalece
        assert_eq!(
            calcular_peso_caixa_estimado_kg(Some(14.5), Some(0.5), Some(12)),
            Some(14.5)
        );
        // Cálculo automático: 0.5 kg * 12 un + 0.4 tara caixa = 6.4 kg
        assert_eq!(
            calcular_peso_caixa_estimado_kg(None, Some(0.5), Some(12)),
            Some(6.4)
        );
        assert_eq!(calcular_peso_caixa_estimado_kg(None, None, Some(12)), None);

        assert_eq!(classificar_empilhamento(Some(14.0), Some(4), false), "base");
        assert_eq!(classificar_empilhamento(Some(6.0), Some(2), false), "base");
        assert_eq!(classificar_empilhamento(Some(2.5), Some(4), false), "topo");
        assert_eq!(classificar_empilhamento(Some(6.0), Some(4), true), "topo");
        assert_eq!(classificar_empilhamento(Some(6.0), Some(4), false), "padrao");

        let posicoes = vec![
            pos_exemplo("A1", 1, 1, "picking", 74.1),
            Posicao { andar: 2, ..pos_exemplo("A3", 1, 3, "picking", 74.0) },
            Posicao { andar: 3, ..pos_exemplo("A5", 1, 5, "pulmao", 74.0) },
        ];
        let cotas = calcular_cotas_base_andares(&posicoes);
        assert_eq!(cotas.get(&1).copied(), Some(0.0));
        assert_eq!(cotas.get(&2).copied(), Some(74.1));
        assert_eq!(cotas.get(&3).copied(), Some(148.1));
        assert_eq!(acesso_equipamento_por_cota(0.0), "manual");
        assert_eq!(acesso_equipamento_por_cota(74.1), "manual");
        assert_eq!(acesso_equipamento_por_cota(148.1), "empilhadeira");
    }

    #[test]
    fn sugestao_ignora_vaos_mistos_e_reservados() {
        let cx9 = caixa_exemplo("9", 22.5, 19.5, 14.7, 4);
        let mut misto = pos_exemplo("A1", 1, 1, "picking", 74.1);
        misto.tipo_ocupacao = "misto".into();
        let mut reservado = pos_exemplo("B1", 2, 1, "picking", 74.1);
        reservado.tipo_ocupacao = "reservado".into();
        let padrao = pos_exemplo("C1", 3, 1, "picking", 74.1);

        let mut prods = vec![prod_teste_abc("2.11.001", "SHAMPOO HAIR", "2.11", Some("2"), 600.0, None)];
        aplicar_curva_abc(&mut prods);

        let res = sugerir_alocacao(
            "est",
            &[misto, reservado, padrao],
            &[cx9],
            &[],
            &prods,
            &[],
            true,
            true,
            true,
        );
        assert_eq!(res.propostas.len(), 1);
        assert_eq!(res.propostas[0].posicao_codigo, "C1");
    }

    #[test]
    fn sugestao_prioriza_dedicado_para_curva_a_e_compartilhado_para_curva_c() {
        let cx9 = caixa_exemplo("9", 22.5, 19.5, 14.7, 4);
        let mut comp = pos_exemplo("A1", 1, 1, "picking", 74.1);
        comp.compartilhado_fracionado = true;
        let dedicado = pos_exemplo("B1", 2, 1, "picking", 74.1);

        let mut prods = vec![
            prod_teste_abc("2.11.001", "SHAMPOO CURVA A", "2.11", Some("2"), 850.0, None),
            prod_teste_abc("2.11.002", "COND CURVA B", "2.11", Some("2"), 120.0, None),
            prod_teste_abc("2.11.003", "SERUM CURVA C", "2.11", Some("2"), 30.0, None),
        ];
        aplicar_curva_abc(&mut prods);
        assert_eq!(prods[0].curva_abc, "A");
        assert_eq!(prods[2].curva_abc, "C");

        let posicoes = vec![comp, dedicado];
        let res_a = sugerir_alocacao(
            "est",
            &posicoes,
            &[cx9.clone()],
            &[],
            &[prods[0].clone()],
            &[],
            true,
            true,
            true,
        );
        assert_eq!(res_a.propostas[0].posicao_codigo, "B1");

        let res_c = sugerir_alocacao(
            "est",
            &posicoes,
            &[cx9],
            &[],
            &[prods[2].clone()],
            &[],
            true,
            true,
            true,
        );
        assert_eq!(res_c.propostas[0].posicao_codigo, "A1");
    }

    #[test]
    fn conversao_op_kg_para_unidades_e_classificacao_espaco() {
        assert_eq!(prioridade_etapa_op("Envase"), 1);
        assert_eq!(prioridade_etapa_op("Liberado para Envase"), 2);
        assert_eq!(prioridade_etapa_op("Produzido"), 3);

        assert_eq!(calcular_unidades_op(140.0, None, Some(0.25), 0.0), 560);
        assert_eq!(calcular_unidades_op(100.0, Some(500.0), Some(0.25), 120.0), 380);
        assert_eq!(calcular_unidades_op(1000.0, Some(200.0), Some(5.0), 0.0), 200);

        assert_eq!(
            classificar_espaco_op(None, Some(10), 5, 20, true),
            ("sem_qtde_cx".into(), 0)
        );
        assert_eq!(
            classificar_espaco_op(Some(12), Some(10), 5, 0, false),
            ("sem_endereco".into(), 5)
        );
        assert_eq!(
            classificar_espaco_op(Some(12), Some(20), 15, 24, true),
            ("falta_espaco".into(), 11)
        );
        assert_eq!(
            classificar_espaco_op(Some(12), Some(10), 10, 24, true),
            ("ok".into(), 0)
        );
    }

    #[test]
    fn sugestao_prioriza_chao_para_pesados_e_manual_para_curva_a() {
        let cx9 = caixa_exemplo("9", 22.5, 19.5, 14.7, 4);
        let mut alt_emp = pos_exemplo("A5", 1, 5, "picking", 74.0);
        alt_emp.andar = 3;
        let mut alt_man = pos_exemplo("B3", 2, 3, "picking", 74.0);
        alt_man.andar = 2;
        let mut chao = pos_exemplo("C1", 3, 1, "picking", 74.0);
        chao.andar = 1;

        let mut pesado = prod_teste_abc("2.11.001", "SHAMPOO 5L PESADO", "2.11", Some("2"), 900.0, None);
        pesado.classe_empilhamento = "base".into();
        aplicar_curva_abc(std::slice::from_mut(&mut pesado));

        let res = sugerir_alocacao(
            "est",
            &[alt_emp, alt_man, chao],
            &[cx9],
            &[],
            &[pesado],
            &[],
            true,
            true,
            true,
        );
        assert_eq!(res.propostas.len(), 1);
        assert_eq!(res.propostas[0].posicao_codigo, "C1");
        assert_eq!(res.propostas[0].acesso_equipamento, "manual");
        assert_eq!(res.resumo.propostas_manual_count, 1);
        assert_eq!(res.resumo.propostas_empilhadeira_count, 0);
    }

    #[test]
    fn sugestao_reserva_pulmao_quando_considerar_ops_chegando_ativo() {
        let cx9 = caixa_exemplo("9", 22.5, 19.5, 14.7, 4);
        let p_pick = pos_exemplo("A1", 1, 1, "picking", 74.1);
        let p_pulm = pos_exemplo("A9", 1, 9, "pulmao", 74.0);

        let mut p = prod_teste_abc("2.11.001", "SHAMPOO COM OP", "2.11", Some("2"), 600.0, None);
        p.estoque_caixas = Some(40);
        p.caixas_necessarias_picking = 2;
        p.caixas_necessarias_pulmao = 0;
        p.op_pendente_caixas = 30;
        aplicar_curva_abc(std::slice::from_mut(&mut p));

        let sem_op = sugerir_alocacao(
            "est",
            &[p_pick.clone(), p_pulm.clone()],
            &[cx9.clone()],
            &[],
            &[p.clone()],
            &[],
            true,
            true,
            false,
        );
        assert!(sem_op.propostas.iter().all(|pr| pr.papel == "picking"));

        let com_op = sugerir_alocacao(
            "est",
            &[p_pick, p_pulm],
            &[cx9],
            &[],
            &[p],
            &[],
            true,
            true,
            true,
        );
        assert!(com_op.propostas.iter().any(|pr| pr.papel == "pulmao"));
        assert_eq!(com_op.resumo.produtos_com_op_cobertos, 1);
    }

    #[test]
    fn classificacao_validade_fefo_e_sugestao_24m() {
        let hoje = NaiveDate::from_ymd_opt(2026, 11, 25).unwrap();
        assert_eq!(classificar_validade_fefo(None, hoje), (None, "sem_data".into()));
        assert_eq!(
            classificar_validade_fefo(NaiveDate::from_ymd_opt(2026, 11, 20), hoje),
            (Some(-5), "vencido".into())
        );
        assert_eq!(
            classificar_validade_fefo(NaiveDate::from_ymd_opt(2026, 12, 25), hoje),
            (Some(30), "critico_90d".into())
        );
        assert_eq!(
            classificar_validade_fefo(NaiveDate::from_ymd_opt(2027, 4, 10), hoje),
            (Some(136), "atencao_180d".into())
        );
        assert_eq!(
            classificar_validade_fefo(NaiveDate::from_ymd_opt(2028, 11, 25), hoje),
            (Some(731), "ok".into())
        );
        assert_eq!(
            sugerir_validade_padrao_24m(NaiveDate::from_ymd_opt(2024, 2, 29)),
            NaiveDate::from_ymd_opt(2026, 2, 28)
        );
    }

    #[test]
    fn reposicao_fefo_detecta_violacao_e_ruptura_picking() {
        let mut p_pick = pos_exemplo("A1", 1, 1, "picking", 74.1);
        p_pick.id = "pos_pick".into();
        let pos_com_itens = vec![PosicaoComItens {
            posicao: p_pick,
            itens: vec![AlocacaoItemView {
                id: "al1".into(),
                posicao_id: "pos_pick".into(),
                posicao_codigo: "A1".into(),
                estrutura_id: "est".into(),
                papel: "picking".into(),
                andar: 1,
                nivel: 1,
                produto_codigo: "2.13.036".into(),
                produto_descricao: "BOTTOX 100G".into(),
                linha_prefix: "2.13".into(),
                nome_linha: "Hair".into(),
                fileiras_largura: 2,
                camadas_altura: 3,
                fixado: true,
                observacoes: None,
                caixa_id: None,
                caixa_codigo: None,
                caixa_altura_cm: None,
                caixa_comprimento_cm: None,
                caixa_largura_cm: None,
                caixas_comprimento: 4,
                max_camadas: 3,
                total_caixas: 24,
                qtde_cx: Some(12),
                total_unidades: 288,
                largura_ocupada_cm: 30.0,
                altura_ocupada_cm: 60.0,
                altura_vao_cm: 74.1,
                estouro_altura: false,
                cobertura_meses: Some(1.0),
                peso_estimado_kg: None,
                orientacao_modo: "auto".into(),
                orientacao_efetiva: "normal".into(),
                empilhado_sobre: None,
                z_base_cm: 0.0,
                volume_ocupado_m3: 0.1,
                amarrado: false,
                apoio_pct: None,
                alerta_estabilidade: None,
            }],
            lotes: vec![],
            largura_ocupada_cm: 30.0,
            largura_livre_cm: 70.0,
            ocupacao_pct: 30.0,
            tem_estouro: false,
            total_caixas: 24,
            total_unidades: 288,
            peso_carga_kg: 0.0,
            peso_total_com_palete_kg: 0.0,
            cota_base_cm: 0.0,
            acesso_equipamento: "manual".into(),
            volume_vao_m3: 0.89,
            volume_ocupado_m3: 0.1,
            cubagem_pct: 11.2,
            area_ocupada_pct: 25.0,
            estabilidade_status: "coluna_estavel".into(),
            estabilidade_resumo: "Estável".into(),
        }];

        let lotes = vec![
            AlocacaoLoteView {
                id: "l_pick".into(),
                posicao_id: "pos_pick".into(),
                posicao_codigo: "A1".into(),
                papel: "picking".into(),
                andar: 1,
                produto_codigo: "2.13.036".into(),
                produto_descricao: "BOTTOX 100G".into(),
                lote: "15900".into(),
                caixas: 20,
                data_fabricacao: Some("2026-10-01".into()),
                data_validade: Some("2028-10-01".into()),
                dias_para_vencer: Some(676),
                status_validade: "ok".into(),
                observacoes: None,
            },
            AlocacaoLoteView {
                id: "l_pulm".into(),
                posicao_id: "pos_pulm".into(),
                posicao_codigo: "A7".into(),
                papel: "pulmao".into(),
                andar: 4,
                produto_codigo: "2.13.036".into(),
                produto_descricao: "BOTTOX 100G".into(),
                lote: "15500".into(),
                caixas: 10,
                data_fabricacao: Some("2024-12-01".into()),
                data_validade: Some("2026-12-15".into()),
                dias_para_vencer: Some(20),
                status_validade: "critico_90d".into(),
                observacoes: None,
            },
        ];

        let tarefas = calcular_tarefas_reposicao_fefo(&lotes, &pos_com_itens);
        assert_eq!(tarefas.len(), 1);
        assert_eq!(tarefas[0].tipo, "violacao_fefo");
        assert_eq!(tarefas[0].lote, "15500");
        assert_eq!(tarefas[0].origem_posicao_codigo, "A7");
        assert_eq!(tarefas[0].destino_posicao_codigo, "A1");
    }

    #[test]
    fn produto_so_atacado_nao_ocupa_andar_manual() {
        let (pick, pulm, tot) = calcular_necessidades_caixas(0.0, 100.0, 100.0, 2.0, Some(10));
        assert_eq!(pick, 0);
        assert_eq!(pulm, 20);
        assert_eq!(tot, 20);

        let cx9 = caixa_exemplo("9", 22.5, 19.5, 14.7, 4);
        let p_pick = pos_exemplo("A1", 1, 1, "picking", 74.1);
        let p_pulm = pos_exemplo("A9", 1, 9, "pulmao", 74.0);

        let mut p_atac = prod_teste_abc("2.11.090", "PRODUTO SO ATACADO", "2.11", Some("2"), 1200.0, None);
        p_atac.vendas_varejo = 0.0;
        p_atac.media_varejo = 0.0;
        p_atac.vendas_atacado = 1200.0;
        p_atac.media_atacado = 100.0;
        p_atac.caixas_necessarias_picking = pick;
        p_atac.caixas_necessarias_pulmao = pulm;
        p_atac.caixas_necessarias_total = tot;
        aplicar_curva_abc(std::slice::from_mut(&mut p_atac));

        let res = sugerir_alocacao(
            "est",
            &[p_pick, p_pulm],
            &[cx9],
            &[],
            &[p_atac],
            &[],
            true,
            true,
            true,
        );
        assert!(!res.propostas.is_empty());
        assert!(res.propostas.iter().all(|pr| pr.papel == "pulmao"));
        assert_eq!(res.resumo.itens_so_atacado_no_pulmao, 1);
    }

    #[test]
    fn validacao_empilhamento_misto_peso_apoio_altura() {
        // Leve sobre pesado com apoio 100% dentro da altura -> OK
        let (ok, apoio, alerta) = validar_empilhamento_misto(
            50.0, 80.0, 30.0, Some(15.0), "base",
            45.0, 75.0, 30.0, Some(4.0), "topo",
            74.1,
        );
        assert!(ok, "alerta inesperado: {:?}", alerta);
        assert!((apoio - 100.0).abs() < 1e-6);

        // Pesado sobre leve -> reprova
        let (ok_peso, _, alerta_peso) = validar_empilhamento_misto(
            50.0, 80.0, 30.0, Some(3.0), "topo",
            40.0, 60.0, 25.0, Some(14.0), "base",
            74.1,
        );
        assert!(!ok_peso);
        assert!(alerta_peso.is_some());

        // Apoio < 80% -> reprova
        let (ok_apoio, _, alerta_apoio) = validar_empilhamento_misto(
            40.0, 60.0, 30.0, Some(12.0), "base",
            50.0, 80.0, 20.0, Some(4.0), "padrao",
            74.1,
        );
        assert!(!ok_apoio);
        assert!(alerta_apoio.is_some());

        // Estouro de altura -> reprova
        let (ok_alt, _, _) = validar_empilhamento_misto(
            50.0, 80.0, 50.0, Some(12.0), "base",
            45.0, 75.0, 35.0, Some(4.0), "padrao",
            74.1,
        );
        assert!(!ok_alt);
    }

    #[test]
    fn melhor_lastro_escolhe_amarracao_e_rotacao_90() {
        let cx_rot = caixa_exemplo("ret", 20.0, 40.0, 30.0, 4);
        // Em 100x120 com palete_inteiro=true, 30x40 aceita amarração mista com bom apoio
        let l_amar = calcular_melhor_lastro_faixa(100.0, 120.0, &cx_rot, 3, "auto", true);
        assert_eq!(l_amar.orientacao_efetiva, "amarracao");
        assert!(l_amar.amarrado);
        assert_eq!(l_amar.caixas_por_lastro, 10); // 6 normais + 4 rotacionadas (ganha do normal = 9)

        // Em fileira única onde girado 90° cabe melhor ou sem giro fica normal
        let mut cx_fixa = cx_rot.clone();
        cx_fixa.pode_girar = false;
        let l_norm = calcular_melhor_lastro_faixa(100.0, 120.0, &cx_fixa, 3, "auto", true);
        assert_eq!(l_norm.orientacao_efetiva, "normal");
        assert!(!l_norm.amarrado);
    }

    #[test]
    fn sugestao_empilha_misto_quando_falta_largura_no_manual() {
        // Base pesada ocupa 60 cm de um único vão de 100 cm; topo leve ocupa 55 cm (não cabe lado a lado pois 60+55=115 > 100),
        // mas cabe perfeitamente empilhado em cima com apoio 100% e altura 25+25=50 <= 74.1 cm!
        let mut cx_base = caixa_exemplo("cx_b", 25.0, 40.0, 60.0, 1);
        cx_base.pode_girar = false;
        let mut cx_topo = caixa_exemplo("cx_t", 25.0, 35.0, 55.0, 1);
        cx_topo.pode_girar = false;

        let pos_unico = pos_exemplo("A1", 1, 1, "picking", 74.1);

        let mut p_base = prod_teste_abc("2.11.100", "BASE PESADA 15KG", "2.11", Some("2"), 900.0, None);
        p_base.caixa_id = Some("cx_b".into());
        p_base.caixa_codigo = Some("cx_b".into());
        p_base.caixa_altura_cm = Some(25.0);
        p_base.caixa_comprimento_cm = Some(40.0);
        p_base.caixa_largura_cm = Some(60.0);
        p_base.empilhamento_max = Some(1);
        p_base.peso_caixa_estimado_kg = Some(15.0);
        p_base.classe_empilhamento = "base".into();
        p_base.caixas_necessarias_picking = 3;
        p_base.caixas_necessarias_pulmao = 0;

        let mut p_topo = prod_teste_abc("2.11.101", "TOPO LEVE 3KG", "2.11", Some("2"), 300.0, None);
        p_topo.caixa_id = Some("cx_t".into());
        p_topo.caixa_codigo = Some("cx_t".into());
        p_topo.caixa_altura_cm = Some(25.0);
        p_topo.caixa_comprimento_cm = Some(35.0);
        p_topo.caixa_largura_cm = Some(55.0);
        p_topo.empilhamento_max = Some(1);
        p_topo.peso_caixa_estimado_kg = Some(3.0);
        p_topo.classe_empilhamento = "topo".into();
        p_topo.caixas_necessarias_picking = 3;
        p_topo.caixas_necessarias_pulmao = 0;

        let mut prods = vec![p_base, p_topo];
        aplicar_curva_abc(&mut prods);

        let res = sugerir_alocacao(
            "est",
            &[pos_unico],
            &[cx_base, cx_topo],
            &[],
            &prods,
            &[],
            true,
            true,
            true,
        );
        assert_eq!(res.propostas.len(), 2);
        let prop_topo = res
            .propostas
            .iter()
            .find(|p| p.produto_codigo == "2.11.101")
            .unwrap();
        assert_eq!(prop_topo.empilhado_sobre.as_deref(), Some("2.11.100"));
        assert_eq!(res.resumo.itens_empilhados_mistos_count, 1);
    }

    #[test]
    fn auto_nao_estoura_vao_multi_produto_por_rotacao() {
        // Caixa 24 real: 15.8 x 26.8 x 24.7 cm. Em vão de 100 cm com 2 produtos de 3 fileiras cada:
        // 3 * 15.8 = 47.4 cm por produto -> 94.8 cm total (cabe com folga!).
        // Antes do fix, modo "auto" rotacionava silenciosamente para 3 * 26.8 = 80.4 cm cada -> 160.8 cm (estouro!).
        let cx24 = caixa_exemplo("cx24", 24.7, 26.8, 15.8, 4);
        let pos = pos_exemplo("A1", 1, 1, "picking", 74.1);
        let g1 = calcular_geometria_alocacao_com_modo(&pos, Some(&cx24), 3, 3, Some(12), 100.0, "auto", false);
        let g2 = calcular_geometria_alocacao_com_modo(&pos, Some(&cx24), 3, 3, Some(12), 100.0, "auto", false);
        assert_eq!(g1.orientacao_efetiva, "normal");
        assert_eq!(g2.orientacao_efetiva, "normal");
        let soma_larg = g1.largura_ocupada_cm + g2.largura_ocupada_cm;
        assert!(soma_larg <= pos.largura_cm + EPS, "soma_larg={soma_larg}");
    }

    #[test]
    fn sugerir_alocacao_garante_zero_estouros_e_amarracao_real() {
        let cx14 = caixa_exemplo("cx14", 24.0, 27.0, 19.0, 4);
        let cx16 = caixa_exemplo("cx16", 24.0, 30.0, 19.5, 4);
        let cx19 = caixa_exemplo("cx19", 24.0, 36.0, 26.0, 4);
        let cx24 = caixa_exemplo("cx24", 24.7, 26.8, 15.8, 4);
        let cx01 = caixa_exemplo("cx01", 26.0, 48.0, 32.0, 4);
        let caixas = vec![cx14.clone(), cx16.clone(), cx19.clone(), cx24.clone(), cx01.clone()];

        let mut posicoes = Vec::new();
        for c in 1..=6 {
            posicoes.push(pos_exemplo(&format!("{}1", (b'A' + (c as u8 - 1)) as char), c, 1, "picking", 74.1));
            posicoes.push(pos_exemplo(&format!("{}3", (b'A' + (c as u8 - 1)) as char), c, 3, "picking", 74.1));
            let mut pulm = pos_exemplo(&format!("{}5", (b'A' + (c as u8 - 1)) as char), c, 5, "pulmao", 115.0);
            pulm.andar = 3;
            posicoes.push(pulm);
        }

        let specs = [
            ("2.11.001", "PRODUTO ATACADO GRANDE", &cx14, 1500.0, 2200.0, 18, 90),
            ("2.11.002", "PRODUTO MEDIO A", &cx16, 800.0, 1400.0, 16, 65),
            ("2.11.003", "PRODUTO MEDIO B", &cx19, 500.0, 900.0, 12, 48),
            ("2.11.004", "PRODUTO VAREJO A", &cx24, 900.0, 100.0, 30, 8),
            ("2.11.005", "PRODUTO VAREJO B", &cx24, 600.0, 50.0, 22, 4),
            ("2.11.006", "PRODUTO PESADO C", &cx01, 200.0, 400.0, 8, 25),
            ("2.11.007", "PRODUTO PEQUENO", &cx24, 80.0, 0.0, 6, 0),
        ];

        let mut prods = Vec::new();
        for (cod, desc, cx, v_var, v_ata, pick_cx, pulm_cx) in specs {
            let mut p = prod_teste_abc(cod, desc, "2.11", Some("2"), v_var + v_ata, None);
            p.caixa_id = Some(cx.id.clone());
            p.caixa_codigo = Some(cx.codigo.clone());
            p.caixa_altura_cm = Some(cx.altura_cm);
            p.caixa_comprimento_cm = Some(cx.comprimento_cm);
            p.caixa_largura_cm = Some(cx.largura_cm);
            p.empilhamento_max = Some(cx.empilhamento_max);
            p.vendas_varejo = v_var;
            p.media_varejo = v_var / 12.0;
            p.vendas_atacado = v_ata;
            p.media_atacado = v_ata / 12.0;
            p.caixas_necessarias_picking = pick_cx;
            p.caixas_necessarias_pulmao = pulm_cx;
            p.caixas_necessarias_total = pick_cx + pulm_cx;
            prods.push(p);
        }
        aplicar_curva_abc(&mut prods);

        let res = sugerir_alocacao("est", &posicoes, &caixas, &[], &prods, &[], false, true, true);
        assert!(res.resumo.paletes_amarrados_count > 0, "deve gerar paletes amarrados");

        let pos_map: HashMap<&str, &Posicao> = posicoes.iter().map(|p| (p.id.as_str(), p)).collect();
        let cx_map: HashMap<&str, &Caixa> = caixas.iter().map(|c| (c.id.as_str(), c)).collect();
        let prod_map: HashMap<&str, &ProdutoDimensao> = prods.iter().map(|p| (p.codigo.as_str(), p)).collect();

        let mut por_pos: HashMap<&str, Vec<&SugestaoProposta>> = HashMap::new();
        for pr in &res.propostas {
            por_pos.entry(pr.posicao_id.as_str()).or_default().push(pr);
        }

        for (pid, list) in por_pos {
            let pos = pos_map[pid];
            let base_count = list.iter().filter(|p| p.empilhado_sobre.is_none()).count();
            let mut soma_larg = 0.0;
            let mut views = Vec::new();
            let mut bases_dim: HashMap<&str, (f64, f64)> = HashMap::new();

            for pr in list.iter().filter(|p| p.empilhado_sobre.is_none()) {
                let prod = prod_map[pr.produto_codigo.as_str()];
                let cx = cx_map[prod.caixa_id.as_deref().unwrap()];
                let pal_int = base_count == 1 && (pr.orientacao_modo == "amarracao" || pr.largura_ocupada_cm >= pos.largura_cm * 0.65);
                let g = calcular_geometria_alocacao_com_modo(pos, Some(cx), pr.fileiras_largura, pr.camadas_altura, prod.qtde_cx_efetiva, prod.media_total, &pr.orientacao_modo, pal_int);
                soma_larg += g.largura_ocupada_cm;
                let prof_cx = if g.orientacao_efetiva == "rotacionado" { cx.largura_cm } else { cx.comprimento_cm };
                let bd = if pal_int && g.amarrado { pos.comprimento_cm } else { ((g.caixas_comp.max(1) as f64) * prof_cx).min(pos.comprimento_cm) };
                bases_dim.insert(pr.produto_codigo.as_str(), (g.largura_ocupada_cm, bd));
                views.push(AlocacaoItemView {
                    id: pr.produto_codigo.clone(),
                    posicao_id: pos.id.clone(),
                    posicao_codigo: pos.codigo.clone(),
                    estrutura_id: pos.estrutura_id.clone(),
                    papel: pos.papel.clone(),
                    andar: pos.andar,
                    nivel: pos.nivel,
                    produto_codigo: pr.produto_codigo.clone(),
                    produto_descricao: pr.produto_descricao.clone(),
                    linha_prefix: pr.linha_prefix.clone(),
                    nome_linha: "".into(),
                    fileiras_largura: pr.fileiras_largura,
                    camadas_altura: pr.camadas_altura,
                    fixado: false,
                    observacoes: None,
                    caixa_id: Some(cx.id.clone()),
                    caixa_codigo: Some(cx.codigo.clone()),
                    caixa_altura_cm: Some(cx.altura_cm),
                    caixa_comprimento_cm: Some(cx.comprimento_cm),
                    caixa_largura_cm: Some(cx.largura_cm),
                    caixas_comprimento: g.caixas_comp,
                    max_camadas: g.max_cam,
                    total_caixas: g.total_caixas,
                    qtde_cx: prod.qtde_cx_efetiva,
                    total_unidades: g.total_unidades,
                    largura_ocupada_cm: g.largura_ocupada_cm,
                    altura_ocupada_cm: g.altura_ocupada_cm,
                    altura_vao_cm: pos.altura_cm,
                    estouro_altura: g.estouro_altura,
                    cobertura_meses: g.cobertura_meses,
                    peso_estimado_kg: None,
                    orientacao_modo: pr.orientacao_modo.clone(),
                    orientacao_efetiva: g.orientacao_efetiva,
                    empilhado_sobre: None,
                    z_base_cm: 0.0,
                    volume_ocupado_m3: g.volume_ocupado_m3,
                    amarrado: g.amarrado,
                    apoio_pct: None,
                    alerta_estabilidade: None,
                });
            }
            for pr in list.iter().filter(|p| p.empilhado_sobre.is_some()) {
                let prod = prod_map[pr.produto_codigo.as_str()];
                let cx = cx_map[prod.caixa_id.as_deref().unwrap()];
                let (bw, bd) = bases_dim[pr.empilhado_sobre.as_deref().unwrap()];
                let pos_topo = Posicao { largura_cm: pos.largura_cm.min(bw), comprimento_cm: pos.comprimento_cm.min(bd), ..pos.clone() };
                let g = calcular_geometria_alocacao_com_modo(&pos_topo, Some(cx), pr.fileiras_largura, pr.camadas_altura, prod.qtde_cx_efetiva, prod.media_total, &pr.orientacao_modo, false);
                views.push(AlocacaoItemView {
                    id: pr.produto_codigo.clone(),
                    posicao_id: pos.id.clone(),
                    posicao_codigo: pos.codigo.clone(),
                    estrutura_id: pos.estrutura_id.clone(),
                    papel: pos.papel.clone(),
                    andar: pos.andar,
                    nivel: pos.nivel,
                    produto_codigo: pr.produto_codigo.clone(),
                    produto_descricao: pr.produto_descricao.clone(),
                    linha_prefix: pr.linha_prefix.clone(),
                    nome_linha: "".into(),
                    fileiras_largura: pr.fileiras_largura,
                    camadas_altura: pr.camadas_altura,
                    fixado: false,
                    observacoes: None,
                    caixa_id: Some(cx.id.clone()),
                    caixa_codigo: Some(cx.codigo.clone()),
                    caixa_altura_cm: Some(cx.altura_cm),
                    caixa_comprimento_cm: Some(cx.comprimento_cm),
                    caixa_largura_cm: Some(cx.largura_cm),
                    caixas_comprimento: g.caixas_comp,
                    max_camadas: g.max_cam,
                    total_caixas: g.total_caixas,
                    qtde_cx: prod.qtde_cx_efetiva,
                    total_unidades: g.total_unidades,
                    largura_ocupada_cm: g.largura_ocupada_cm,
                    altura_ocupada_cm: g.altura_ocupada_cm,
                    altura_vao_cm: pos.altura_cm,
                    estouro_altura: g.estouro_altura,
                    cobertura_meses: g.cobertura_meses,
                    peso_estimado_kg: None,
                    orientacao_modo: pr.orientacao_modo.clone(),
                    orientacao_efetiva: g.orientacao_efetiva,
                    empilhado_sobre: pr.empilhado_sobre.clone(),
                    z_base_cm: 0.0,
                    volume_ocupado_m3: g.volume_ocupado_m3,
                    amarrado: g.amarrado,
                    apoio_pct: None,
                    alerta_estabilidade: None,
                });
            }

            assert!(soma_larg <= pos.largura_cm + 0.05, "estouro de largura em {}: {}", pos.codigo, soma_larg);
            let peso_m = HashMap::new();
            let classe_m = HashMap::new();
            let (_, _, _, _, status, resumo_est) = avaliar_estabilidade_vao(pos, &mut views, &peso_m, &classe_m);
            assert!(views.iter().all(|v| !v.estouro_altura), "estouro de altura em {}", pos.codigo);
            assert_ne!(status, "alerta", "alerta em {}: {}", pos.codigo, resumo_est);
        }
    }

    #[test]
    fn extrair_status_e_unidades_details_erp_exclui_ea_e_ca() {
        assert_eq!(
            extrair_campo_details_erp("Status: EA | Fab: JOAO | Unidades: 1500", "Status").as_deref(),
            Some("EA")
        );
        assert_eq!(
            extrair_campo_details_erp("Status: EN | Fab:  | Unidades: 1", "Status").as_deref(),
            Some("EN")
        );
        assert!(!status_erp_op_aberto("EA"));
        assert!(!status_erp_op_aberto("CA"));
        assert!(!status_erp_op_aberto("FI"));
        assert!(status_erp_op_aberto("EN"));
        assert!(status_erp_op_aberto("PR"));
        assert!(status_erp_op_aberto("PP"));
        assert!(status_erp_op_aberto("PG"));

        assert_eq!(parse_unidades_details_erp("Status: EN | Unidades: 1"), None);
        assert_eq!(parse_unidades_details_erp("Status: PG | Unidades: 200"), Some(200.0));
        assert_eq!(rotulo_e_ordem_status_erp("EN"), ("Em Envase (EN)", 1));
        assert_eq!(rotulo_e_ordem_status_erp("PR"), ("Em Produção (PR)", 2));
        assert_eq!(rotulo_e_ordem_status_erp("PG"), ("Em Pesagem (PG)", 3));
    }
}

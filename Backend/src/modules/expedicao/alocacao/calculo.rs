use std::collections::{BTreeMap, HashMap, HashSet};

use super::models::{
    AlocacaoItemView, Atacadista, Caixa, Posicao, ProdutoDimensao, SugestaoNaoAlocado,
    SugestaoProposta, SugestaoResultado, SugestaoResumo,
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
}

pub fn calcular_geometria_alocacao(
    pos: &Posicao,
    caixa: Option<&Caixa>,
    fileiras_largura: i32,
    camadas_altura: i32,
    qtde_cx: Option<i32>,
    media_mensal_total: f64,
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
        };
    };
    let comp = caixas_comprimento(pos.comprimento_cm, cx.comprimento_cm);
    let max_cam = max_camadas(pos.altura_cm, cx.altura_cm, cx.empilhamento_max);
    let camadas_eff = camadas_altura.max(1);
    let fileiras_eff = fileiras_largura.max(1);
    let total_caixas = fileiras_eff * comp.max(0) * camadas_eff;
    let total_unidades = qtde_cx.filter(|&q| q > 0).map(|q| total_caixas * q).unwrap_or(0);
    let largura_ocupada_cm = (fileiras_eff as f64) * cx.largura_cm;
    let altura_ocupada_cm = (camadas_eff as f64) * cx.altura_cm;
    let estouro_altura = altura_ocupada_cm > pos.altura_cm + EPS;
    let cobertura_meses = if media_mensal_total > 0.0 && total_unidades > 0 {
        Some(total_unidades as f64 / media_mensal_total)
    } else {
        None
    };
    GeometriaAlocacao {
        caixas_comp: comp,
        max_cam,
        total_caixas,
        total_unidades,
        largura_ocupada_cm,
        altura_ocupada_cm,
        estouro_altura,
        cobertura_meses,
    }
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

/// Motor de sugestão híbrida: zona por linha (principal) + Curva ABC + Picking (níveis baixos) / Pulmão (níveis altos).
pub fn sugerir_alocacao(
    estrutura_id: &str,
    posicoes: &[Posicao],
    caixas: &[Caixa],
    existentes: &[AlocacaoExistente],
    produtos: &[ProdutoDimensao],
    linhas_permitidas: &[String],
    manter_fixados: bool,
    limpar_nao_fixados: bool,
) -> SugestaoResultado {
    let caixa_map: HashMap<&str, &Caixa> = caixas.iter().map(|c| (c.id.as_str(), c)).collect();

    let mut removidas_count = 0usize;
    let mut largura_usada: HashMap<String, f64> = HashMap::new();
    let mut linhas_na_posicao: HashMap<String, HashSet<String>> = HashMap::new();
    let mut caixas_na_posicao: HashMap<String, HashSet<String>> = HashMap::new();
    let mut pares_ocupados: HashSet<(String, String)> = HashSet::new();
    let mut picking_fixo_caixas: HashMap<String, i32> = HashMap::new();
    let mut pulmao_fixo_caixas: HashMap<String, i32> = HashMap::new();
    let mut produtos_ja_alocados: HashSet<String> = HashSet::new();

    let prod_map: HashMap<&str, &ProdutoDimensao> =
        produtos.iter().map(|p| (p.codigo.as_str(), p)).collect();
    let pos_map: HashMap<&str, &Posicao> =
        posicoes.iter().map(|p| (p.id.as_str(), p)).collect();

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
        *largura_usada.entry(ex.posicao_id.clone()).or_insert(0.0) += ex.largura_ocupada_cm;
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
                        let comp = caixas_comprimento(pos.comprimento_cm, cx.comprimento_cm);
                        let cap = ex.fileiras_largura * comp * ex.camadas_altura;
                        if pos.papel == "picking" {
                            *picking_fixo_caixas
                                .entry(prod.codigo.clone())
                                .or_insert(0) += cap;
                        } else {
                            *pulmao_fixo_caixas
                                .entry(prod.codigo.clone())
                                .or_insert(0) += cap;
                        }
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

    let mut picking_pos: Vec<&Posicao> = posicoes
        .iter()
        .filter(|p| vao_elegivel_sugestao(p, "picking"))
        .collect();
    picking_pos.sort_by_key(|p| (p.andar, p.coluna_ordem, p.lado, p.nivel));

    let mut pulmao_pos: Vec<&Posicao> = posicoes
        .iter()
        .filter(|p| vao_elegivel_sugestao(p, "pulmao"))
        .collect();
    pulmao_pos.sort_by_key(|p| (p.andar, p.coluna_ordem, p.lado, p.nivel));

    let mut propostas: Vec<SugestaoProposta> = Vec::new();
    let mut produtos_com_proposta: HashSet<String> = HashSet::new();

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

        let min_pick = prod.caixas_necessarias_picking.max(1);
        let mut rest_pick = (min_pick - fix_pick).max(0);
        if fix_pick > 0 {
            rest_pick = (prod.caixas_necessarias_picking - fix_pick).max(0);
        }
        let mut rest_pulm = (prod.caixas_necessarias_pulmao - fix_pulm).max(0);
        let mut precisa_picking = fix_pick == 0 || rest_pick > 0;

        // 1) Picking: tenta alocar 1 endereço (nível baixo) para o varejo / acesso rápido
        if precisa_picking && !picking_pos.is_empty() {
            let mut melhor_idx: Option<(i32, usize, i32, i32, i32)> = None;
            // Tuple score (menor vence): (prioridade_compatibilidade, ordem_posicao, fileiras_a_alocar, camadas, comp)
            for (idx, pos) in picking_pos.iter().enumerate() {
                if pares_ocupados.contains(&(pos.id.clone(), prod.codigo.clone())) {
                    continue;
                }
                let usada = largura_usada.get(&pos.id).copied().unwrap_or(0.0);
                let livre = (pos.largura_cm - usada).max(0.0);
                let comp = caixas_comprimento(pos.comprimento_cm, cx.comprimento_cm);
                let max_cam = max_camadas(pos.altura_cm, cx.altura_cm, cx.empilhamento_max);
                let cam = prod
                    .camadas_override
                    .map(|ov| ov.clamp(1, max_cam.max(1)))
                    .unwrap_or(max_cam);
                if comp <= 0 || max_cam <= 0 || cam <= 0 || livre + EPS < cx.largura_cm {
                    continue;
                }
                let cap_fileira = comp * cam;
                let max_fil = ((livre + EPS) / cx.largura_cm).floor() as i32;
                let desejadas = ((rest_pick.max(1) as f64) / (cap_fileira as f64))
                    .ceil()
                    .max(1.0) as i32;
                let cabe_tudo = max_fil >= desejadas;
                let mesma_linha = linhas_na_posicao
                    .get(&pos.id)
                    .is_some_and(|s| s.contains(&lg));
                let mesma_caixa = caixas_na_posicao
                    .get(&pos.id)
                    .is_some_and(|s| s.contains(cid));
                let vazio = usada <= EPS;

                // Prioridade:
                // 0: cabe tudo + mesma linha + mesma caixa
                // 1: cabe tudo + mesma linha
                // 2: cabe tudo + vazio (novo vão) ou mesma caixa
                // 3: cabe tudo + outro
                // 4..7: parcial (pelo menos 1 fileira)
                let base_prio = if mesma_linha && mesma_caixa {
                    0
                } else if mesma_linha {
                    1
                } else if vazio || mesma_caixa {
                    2
                } else {
                    3
                } + score_compartilhado(prod, pos);
                let prio = if cabe_tudo { base_prio } else { base_prio + 10 };
                let fil_escolhidas = desejadas.min(max_fil).max(1);
                let cand = (prio, idx, fil_escolhidas, cam, comp);
                if melhor_idx.as_ref().map_or(true, |m| (cand.0, cand.1) < (m.0, m.1)) {
                    melhor_idx = Some(cand);
                }
            }

            if let Some((_, idx, fil, cam, comp)) = melhor_idx {
                let pos = picking_pos[idx];
                let larg_add = (fil as f64) * cx.largura_cm;
                *largura_usada.entry(pos.id.clone()).or_insert(0.0) += larg_add;
                linhas_na_posicao
                    .entry(pos.id.clone())
                    .or_default()
                    .insert(lg.clone());
                caixas_na_posicao
                    .entry(pos.id.clone())
                    .or_default()
                    .insert(cid.clone());
                pares_ocupados.insert((pos.id.clone(), prod.codigo.clone()));

                let tot_cx = fil * comp * cam;
                let tot_un = tot_cx * qtde_cx;
                propostas.push(SugestaoProposta {
                    produto_codigo: prod.codigo.clone(),
                    produto_descricao: prod.descricao.clone(),
                    curva_abc: prod.curva_abc.clone(),
                    linha_prefix: prod.linha_prefix.clone(),
                    posicao_id: pos.id.clone(),
                    posicao_codigo: pos.codigo.clone(),
                    papel: pos.papel.clone(),
                    fileiras_largura: fil,
                    camadas_altura: cam,
                    total_caixas: tot_cx,
                    total_unidades: tot_un,
                    largura_ocupada_cm: larg_add,
                });
                produtos_com_proposta.insert(prod.codigo.clone());
                let faltou_pick = (rest_pick - tot_cx).max(0);
                rest_pulm += faltou_pick;
                precisa_picking = false;
            }
        }

        // 2) Pulmão: aloca excedente ou demanda atacadista nos níveis altos
        let mut faltou_pulmao = false;
        if rest_pulm > 0 {
            let mut rem = rest_pulm;
            // Ordena posições compatíveis tentando agrupar mesma linha/caixa antes de abrir novas
            while rem > 0 {
                let mut escolhido: Option<(i32, usize, i32, i32, i32)> = None;
                for (idx, pos) in pulmao_pos.iter().enumerate() {
                    if pares_ocupados.contains(&(pos.id.clone(), prod.codigo.clone())) {
                        continue;
                    }
                    let usada = largura_usada.get(&pos.id).copied().unwrap_or(0.0);
                    let livre = (pos.largura_cm - usada).max(0.0);
                    let comp = caixas_comprimento(pos.comprimento_cm, cx.comprimento_cm);
                    let max_cam = max_camadas(pos.altura_cm, cx.altura_cm, cx.empilhamento_max);
                    let cam = prod
                        .camadas_override
                        .map(|ov| ov.clamp(1, max_cam.max(1)))
                        .unwrap_or(max_cam);
                    if comp <= 0 || max_cam <= 0 || cam <= 0 || livre + EPS < cx.largura_cm {
                        continue;
                    }
                    let cap_fileira = comp * cam;
                    let max_fil = ((livre + EPS) / cx.largura_cm).floor() as i32;
                    let desejadas = ((rem as f64) / (cap_fileira as f64)).ceil().max(1.0) as i32;
                    let cabe_tudo = max_fil >= desejadas;
                    let mesma_linha = linhas_na_posicao
                        .get(&pos.id)
                        .is_some_and(|s| s.contains(&lg));
                    let mesma_caixa = caixas_na_posicao
                        .get(&pos.id)
                        .is_some_and(|s| s.contains(cid));
                    let vazio = usada <= EPS;

                    let base_prio = if mesma_linha && mesma_caixa {
                        0
                    } else if mesma_linha {
                        1
                    } else if vazio || mesma_caixa {
                        2
                    } else {
                        3
                    } + score_compartilhado(prod, pos);
                    let prio = if cabe_tudo { base_prio } else { base_prio + 10 };
                    let fil = desejadas.min(max_fil).max(1);
                    let cand = (prio, idx, fil, cam, comp);
                    if escolhido.as_ref().map_or(true, |m| (cand.0, cand.1) < (m.0, m.1)) {
                        escolhido = Some(cand);
                    }
                }

                let Some((_, idx, fil, cam, comp)) = escolhido else {
                    faltou_pulmao = true;
                    break;
                };
                let pos = pulmao_pos[idx];
                let larg_add = (fil as f64) * cx.largura_cm;
                *largura_usada.entry(pos.id.clone()).or_insert(0.0) += larg_add;
                linhas_na_posicao
                    .entry(pos.id.clone())
                    .or_default()
                    .insert(lg.clone());
                caixas_na_posicao
                    .entry(pos.id.clone())
                    .or_default()
                    .insert(cid.clone());
                pares_ocupados.insert((pos.id.clone(), prod.codigo.clone()));

                let tot_cx = fil * comp * cam;
                let tot_un = tot_cx * qtde_cx;
                propostas.push(SugestaoProposta {
                    produto_codigo: prod.codigo.clone(),
                    produto_descricao: prod.descricao.clone(),
                    curva_abc: prod.curva_abc.clone(),
                    linha_prefix: prod.linha_prefix.clone(),
                    posicao_id: pos.id.clone(),
                    posicao_codigo: pos.codigo.clone(),
                    papel: pos.papel.clone(),
                    fileiras_largura: fil,
                    camadas_altura: cam,
                    total_caixas: tot_cx,
                    total_unidades: tot_un,
                    largura_ocupada_cm: larg_add,
                });
                produtos_com_proposta.insert(prod.codigo.clone());
                rem = (rem - tot_cx).max(0);
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
    let ativas: Vec<&Posicao> = posicoes.iter().filter(|p| p.ativo).collect();
    for pos in &ativas {
        let u = largura_usada.get(&pos.id).copied().unwrap_or(0.0);
        if u > EPS {
            posicoes_usadas += 1;
        }
        if pos.largura_cm > 0.0 {
            soma_pct += ((u / pos.largura_cm) * 100.0).min(100.0);
        }
    }
    let ocupacao_media_pct = if ativas.is_empty() {
        0.0
    } else {
        soma_pct / (ativas.len() as f64)
    };

    let resumo = SugestaoResumo {
        estrutura_id: estrutura_id.to_string(),
        removidas_count,
        propostas_count: propostas.len(),
        produtos_alocados: produtos_com_proposta.len(),
        posicoes_usadas,
        nao_alocados_count: nao_alocados.len(),
        ocupacao_media_pct,
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
        );
        assert_eq!(res_c.propostas[0].posicao_codigo, "A1");
    }
}

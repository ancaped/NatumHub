use std::collections::HashMap;
use crate::models::{LineConfig, Product, ProductCalculationResult, ProductOverride, Stock};

fn normalize_code(code: &str) -> String {
    let mut s = code.trim().to_string();
    if s.starts_with('"') && s.ends_with('"') && s.len() >= 2 {
        s.remove(0);
        s.pop();
    }
    if s.starts_with('\'') && s.ends_with('\'') && s.len() >= 2 {
        s.remove(0);
        s.pop();
    }
    s.replace('.', "").trim().to_lowercase()
}

pub fn calculate_products(
    products: &[Product],
    stocks: &[Stock],
    faturamento_map: &HashMap<String, Vec<i64>>, // Product code -> 12 monthly sales values
    configs: &[LineConfig],
    overrides: &[ProductOverride],
) -> Vec<ProductCalculationResult> {
    // Index config by prefix
    let config_map: HashMap<String, &LineConfig> = configs
        .iter()
        .map(|c| (c.linha_prefix.clone(), c))
        .collect();

    // Default configuration if not found
    let default_config = LineConfig {
        linha_prefix: "DEFAULT".to_string(),
        nome_linha: "Outros/Geral".to_string(),
        estoque_ideal_mult: 3.2,
        abrir_ordem_mult: 1.6,
        abrir_prod_mult: 1.2,
        fator_seguranca_z: 0.0,
        visivel: Some(1),
    };

    // Index overrides by product code (raw, trimmed, and normalized)
    let mut overrides_map: HashMap<String, &ProductOverride> = HashMap::new();
    for o in overrides {
        overrides_map.insert(o.codigo.clone(), o);
        overrides_map.insert(o.codigo.trim().to_string(), o);
        overrides_map.insert(normalize_code(&o.codigo), o);
    }

    // Index stock by product code (raw, trimmed, and normalized)
    let mut stock_map: HashMap<String, &Stock> = HashMap::new();
    for s in stocks {
        stock_map.insert(s.codigo.clone(), s);
        stock_map.insert(s.codigo.trim().to_string(), s);
        stock_map.insert(normalize_code(&s.codigo), s);
    }

    // Index faturamento by normalized code as well
    let mut fat_lookup: HashMap<String, &Vec<i64>> = HashMap::new();
    for (code, vals) in faturamento_map {
        fat_lookup.insert(code.clone(), vals);
        fat_lookup.insert(code.trim().to_string(), vals);
        fat_lookup.insert(normalize_code(code), vals);
    }

    let mut results = Vec::new();

    for prod in products {
        let norm_prod_code = normalize_code(&prod.codigo);
        // Get stock
        let default_stock = Stock {
            codigo: prod.codigo.clone(),
            estoque: 0,
            producao: 0,
            pedidos_aberto: 0,
            fase: None,
        };
        let stock = stock_map.get(&prod.codigo)
            .or_else(|| stock_map.get(prod.codigo.trim()))
            .or_else(|| stock_map.get(&norm_prod_code))
            .copied()
            .unwrap_or(&default_stock);

        // Get overrides
        let ovr = overrides_map.get(&prod.codigo)
            .or_else(|| overrides_map.get(prod.codigo.trim()))
            .or_else(|| overrides_map.get(&norm_prod_code))
            .copied();

        // Determine Line Prefix (with manual override)
        let resolved_linha_prefix = if let Some(o) = ovr {
            o.linha_prefix_manual.as_ref().unwrap_or(&prod.linha_prefix).clone()
        } else {
            prod.linha_prefix.clone()
        };

        let resolved_status_produto = if let Some(o) = ovr {
            o.status_produto.clone().unwrap_or_else(|| "ativo".to_string())
        } else {
            "ativo".to_string()
        };

        let resolved_categoria_produto = if let Some(o) = ovr {
            o.categoria_produto.clone().or_else(|| {
                if prod.codigo.starts_with("1.34.") {
                    Some("cat_coloracao".to_string())
                } else if prod.codigo.starts_with("1.30.") {
                    Some("cat_apoio".to_string())
                } else {
                    None
                }
            })
        } else {
            if prod.codigo.starts_with("1.34.") {
                Some("cat_coloracao".to_string())
            } else if prod.codigo.starts_with("1.30.") {
                Some("cat_apoio".to_string())
            } else {
                None
            }
        };

        // Get config
        let config = config_map.get(&resolved_linha_prefix).copied().unwrap_or(&default_config);

        let resolved_visivel = if config.visivel == Some(0) || resolved_status_produto == "terceirizado" || resolved_status_produto == "descontinuado" {
            Some(0)
        } else {
            ovr.and_then(|o| o.visivel)
        };

        // 1. Determine Média de Vendas
        let base_media = if let Some(o) = ovr {
            if let Some(m) = o.media_manual {
                m
            } else {
                prod.media_levantamento
            }
        } else {
            prod.media_levantamento
        };
        // 2. Calculate Standard Deviation and Launch status (incorporating manual overrides)
        let monthly_sales = fat_lookup.get(&prod.codigo)
            .or_else(|| fat_lookup.get(prod.codigo.trim()))
            .or_else(|| fat_lookup.get(&norm_prod_code))
            .copied();
        let (desvio_padrao, is_lancamento) = {
            let manual_launch = ovr.and_then(|o| o.is_lancamento_manual);
            if let Some(l_manual) = manual_launch {
                let is_l = l_manual == 1;
                let std_dev = if is_l {
                    0.0
                } else if let Some(sales) = monthly_sales {
                    if sales.is_empty() || sales.iter().all(|&x| x == 0) {
                        0.0
                    } else {
                        let n = sales.len() as f64;
                        let mean = sales.iter().sum::<i64>() as f64 / n;
                        let variance = if n > 1.0 {
                            sales.iter().map(|&x| {
                                let diff = x as f64 - mean;
                                diff * diff
                            }).sum::<f64>() / (n - 1.0)
                        } else {
                            0.0
                        };
                        variance.sqrt()
                    }
                } else {
                    0.0
                };
                (std_dev, is_l)
            } else {
                if let Some(sales) = monthly_sales {
                    if sales.is_empty() || sales.iter().all(|&x| x == 0) {
                        (0.0, true)
                    } else {
                        let n = sales.len() as f64;
                        let mean = sales.iter().sum::<i64>() as f64 / n;
                        let variance = if n > 1.0 {
                            sales.iter().map(|&x| {
                                let diff = x as f64 - mean;
                                diff * diff
                            }).sum::<f64>() / (n - 1.0)
                        } else {
                            0.0
                        };
                        (variance.sqrt(), false)
                    }
                } else {
                    (0.0, true)
                }
            }
        };

        // 3. Demanda Mensal Ajustada (DA) = Média + Z * StdDev
        let z = config.fator_seguranca_z;
        let demanda_ajustada = base_media + (z * desvio_padrao);

        // Avoid division by zero by setting a small floor if demand is zero
        let da_for_division = if demanda_ajustada <= 0.0001 { 0.0001 } else { demanda_ajustada };

        // 4. Stock values (with manual override of open orders if present)
        let raw_estoque = stock.estoque;
        let raw_producao = stock.producao;
        let raw_pedidos = if let Some(o) = ovr {
            o.pedidos_manual.unwrap_or(stock.pedidos_aberto)
        } else {
            stock.pedidos_aberto
        };

        let estoque_futuro = raw_estoque - raw_pedidos;
        let estoque_futuro_com_producao = raw_estoque + raw_producao - raw_pedidos;

        // 5. Durations (Months & Days)
        let duracao_meses = estoque_futuro_com_producao as f64 / da_for_division;
        let duracao_dias = duracao_meses * 30.0; // Fixed 30 days as aligned

        // 6. Config thresholds
        let config_ideal = config.estoque_ideal_mult;
        let config_ordem = config.abrir_ordem_mult;
        let config_prod = config.abrir_prod_mult;

        // 7. Thresholds in product units
        let raw_estoque_ideal_qtd = config_ideal * da_for_division;
        // Apply manual override for estoque ideal quantity if configured
        let estoque_ideal_qtd = if let Some(o) = ovr {
            o.estoque_ideal_manual.map(|val| val as f64).unwrap_or(raw_estoque_ideal_qtd)
        } else {
            raw_estoque_ideal_qtd
        };

        let abrir_ordem_qtd = config_ordem * da_for_division;
        let abrir_prod_qtd = config_prod * da_for_division;

        let is_programada = ovr.and_then(|o| o.is_producao_programada).unwrap_or(0) == 1;
        let disparo = ovr.and_then(|o| o.producao_programada_disparo);
        let objetivo = ovr.and_then(|o| o.producao_programada_objetivo);

        // 8. Status decision & Recommended Production Quantity
        let (status, status_label, producao_recomendada) = if resolved_status_produto == "descontinuado" || config.visivel == Some(0) {
            ("descontinuado".to_string(), if config.visivel == Some(0) { "Linha Inativa".to_string() } else { "Saiu de Linha".to_string() }, 0)
        } else if resolved_status_produto == "terceirizado" {
            ("terceirizado".to_string(), "Terceirizado".to_string(), 0)
        } else if is_programada {
            let disparo_val = disparo.unwrap_or(0);
            let objetivo_val = objetivo.unwrap_or(0);
            if estoque_futuro_com_producao <= disparo_val {
                let rec = if objetivo_val > 0 {
                    objetivo_val
                } else {
                    (estoque_ideal_qtd - estoque_futuro_com_producao as f64).max(0.0).round() as i64
                };
                ("critico".to_string(), "Disparar Produção".to_string(), rec)
            } else {
                ("saudavel".to_string(), "Estoque OK (Programado)".to_string(), 0)
            }
        } else if resolved_status_produto == "saindo_de_linha" {
            let (st, _lbl) = if duracao_meses <= config_prod {
                ("critico", "Produzir Urgente (Saindo de Linha)")
            } else if duracao_meses <= config_ordem {
                ("ordem", "Abrir Ordem (Saindo de Linha)")
            } else if duracao_meses <= config_ideal {
                ("saudavel", "Estoque OK (Saindo de Linha)")
            } else {
                ("abundante", "Abundante (Saindo de Linha)")
            };
            let rec = if st == "critico" || st == "ordem" {
                if let Some(manual_val) = ovr.and_then(|o| o.estoque_ideal_manual) {
                    manual_val as i64
                } else {
                    let needed = (estoque_ideal_qtd - estoque_futuro_com_producao as f64).round() as i64;
                    if needed > 0 { needed } else { 0 }
                }
            } else {
                0
            };
            ("saindo_de_linha".to_string(), "Saindo de Linha".to_string(), rec)
        } else if resolved_categoria_produto.as_deref() == Some("cat_base")
            || resolved_status_produto == "bases"
        {
            ("bases".to_string(), "Base de produção".to_string(), 0)
        } else {
            let has_manual_ideal = ovr.and_then(|o| o.estoque_ideal_manual).is_some()
                || (base_media <= 0.001 && estoque_ideal_qtd > 0.0);

            let (st, lbl) = if has_manual_ideal {
                if (estoque_futuro_com_producao as f64) < estoque_ideal_qtd {
                    let threshold_critico = estoque_ideal_qtd * (config_prod / config_ideal).min(0.75);
                    if (estoque_futuro_com_producao as f64) <= threshold_critico {
                        ("critico", "Produzir Urgente")
                    } else {
                        ("ordem", "Abrir Ordem")
                    }
                } else {
                    ("saudavel", "Estoque OK")
                }
            } else if duracao_meses <= config_prod {
                ("critico", "Produzir Urgente")
            } else if duracao_meses <= config_ordem {
                ("ordem", "Abrir Ordem")
            } else if duracao_meses <= config_ideal {
                ("saudavel", "Estoque OK")
            } else {
                ("abundante", "Abundante")
            };
            let rec = if st == "critico" || st == "ordem" {
                if let Some(manual_val) = ovr.and_then(|o| o.estoque_ideal_manual) {
                    manual_val as i64
                } else {
                    let needed = (estoque_ideal_qtd - estoque_futuro_com_producao as f64).round() as i64;
                    if needed > 0 { needed } else { 0 }
                }
            } else {
                0
            };
            (st.to_string(), lbl.to_string(), rec)
        };

        results.push(ProductCalculationResult {
            codigo: prod.codigo.clone(),
            descricao: prod.descricao.clone(),
            linha_prefix: resolved_linha_prefix,
            nome_linha: config.nome_linha.clone(),
            base: prod.base.clone(),
            base_codigo: prod.base_codigo.clone(),
            fase: stock.fase.clone(),
            estoque: raw_estoque,
            producao: raw_producao,
            pedidos_aberto: raw_pedidos,
            estoque_futuro,
            estoque_futuro_com_producao,
            estoque_ideal_manual: ovr.and_then(|o| o.estoque_ideal_manual),
            pedidos_manual: ovr.and_then(|o| o.pedidos_manual),
            media_manual: ovr.and_then(|o| o.media_manual),
            is_lancamento_manual: ovr.and_then(|o| o.is_lancamento_manual),
            visivel: resolved_visivel,
            observacao: ovr.and_then(|o| o.observacao.clone()),
            linha_prefix_manual: ovr.and_then(|o| o.linha_prefix_manual.clone()),
            status_produto: Some(resolved_status_produto),
            categoria_produto: resolved_categoria_produto,
            produzir_apenas_kit: ovr.and_then(|o| o.produzir_apenas_kit),
            lancamento_meta_meses: ovr.and_then(|o| o.lancamento_meta_meses),
            lancamento_data_inicio: ovr.and_then(|o| o.lancamento_data_inicio.clone()),
            terceirizado_modo: ovr.and_then(|o| o.terceirizado_modo.clone()),
            is_kit_component: None,
            is_producao_programada: ovr.and_then(|o| o.is_producao_programada),
            producao_programada_disparo: disparo,
            producao_programada_objetivo: objetivo,
            media_vendas: base_media,
            desvio_padrao,
            demanda_ajustada,
            is_lancamento,
            estoque_ideal_meses: config_ideal,
            abrir_ordem_meses: config_ordem,
            abrir_prod_meses: config_prod,
            estoque_ideal_qtd,
            abrir_ordem_qtd,
            abrir_prod_qtd,
            duracao_meses,
            duracao_dias,
            status,
            status_label,
            producao_recomendada,
            has_formulation: true,
            missing_ingredients: Vec::new(),
            faltas_ativas: None,
            pedidos_compra_aberto: None,
            sugestao_compra: None,
            is_kit: None,
            parent_kits: None,
        });
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_standard_deviation_calculation() {
        let p = Product {
            codigo: "1.01.001".to_string(),
            descricao: "Test Prod".to_string(),
            linha_prefix: "1".to_string(),
            base: None,
            base_codigo: None,
            media_levantamento: 100.0,
        };
        let s = Stock {
            codigo: "1.01.001".to_string(),
            estoque: 120,
            producao: 50,
            pedidos_aberto: 20,
            fase: None,
        };
        let mut fat = HashMap::new();
        fat.insert("1.01.001".to_string(), vec![80, 90, 100, 110, 120, 80, 90, 100, 110, 120, 100, 100]); // 12 elements

        let configs = vec![LineConfig {
            linha_prefix: "1".to_string(),
            nome_linha: "Natum".to_string(),
            estoque_ideal_mult: 3.0,
            abrir_ordem_mult: 1.5,
            abrir_prod_mult: 1.0,
            fator_seguranca_z: 1.0, // Z = 1.0
            visivel: Some(1),
        }];

        let results = calculate_products(&[p], &[s], &fat, &configs, &[]);
        assert_eq!(results.len(), 1);
        let res = &results[0];

        // Mean of sales = 100.0 (using base_media which defaults to media_levantamento = 100.0)
        // StdDev of [80, 90, 100, 110, 120, 80, 90, 100, 110, 120, 100, 100]:
        // mean is 100.0. Variance = ((20^2)*4 + (10^2)*4 + 0) / 11 = (1600 + 400) / 11 = 2000 / 11 = 181.818. StdDev = sqrt(181.818) = 13.48399
        // Demanda Ajustada = 100.0 + 1.0 * 13.48399 = 113.48399
        assert!(res.desvio_padrao > 13.0 && res.desvio_padrao < 14.0);
        assert!(res.demanda_ajustada > 113.0 && res.demanda_ajustada < 114.0);
        
        // EFP = 120 + 50 - 20 = 150
        // Duração = 150 / 113.48 = 1.32 months
        // Configs: Ideal = 3.0, Ordem = 1.5, Prod = 1.0
        // 1.0 < 1.32 <= 1.5 -> status should be "ordem"
        assert_eq!(res.status, "ordem");
    }
}


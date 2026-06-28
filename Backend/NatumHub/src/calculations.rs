use std::collections::HashMap;
use crate::models::{LineConfig, Product, ProductCalculationResult, ProductOverride, Stock};

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

    // Index overrides by product code
    let overrides_map: HashMap<String, &ProductOverride> = overrides
        .iter()
        .map(|o| (o.codigo.clone(), o))
        .collect();

    // Index stock by product code
    let stock_map: HashMap<String, &Stock> = stocks
        .iter()
        .map(|s| (s.codigo.clone(), s))
        .collect();

    let mut results = Vec::new();

    for prod in products {
        // Get stock
        let default_stock = Stock {
            codigo: prod.codigo.clone(),
            estoque: 0,
            producao: 0,
            pedidos_aberto: 0,
            fase: None,
        };
        let stock = stock_map.get(&prod.codigo).copied().unwrap_or(&default_stock);

        // Get overrides
        let ovr = overrides_map.get(&prod.codigo).copied();

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

        let resolved_visivel = if config.visivel == Some(0) {
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
        let monthly_sales = faturamento_map.get(&prod.codigo);
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

        // 8. Status decision & Recommended Production Quantity
        let (status, status_label, producao_recomendada) = if resolved_status_produto == "descontinuado" || config.visivel == Some(0) {
            ("descontinuado".to_string(), if config.visivel == Some(0) { "Linha Inativa".to_string() } else { "Saiu de Linha".to_string() }, 0)
        } else if resolved_status_produto == "saindo_de_linha" {
            let (st, lbl) = if duracao_meses <= config_prod {
                ("critico", "Produzir Urgente (Saindo de Linha)")
            } else if duracao_meses <= config_ordem {
                ("ordem", "Abrir Ordem (Saindo de Linha)")
            } else if duracao_meses <= config_ideal {
                ("saudavel", "Estoque OK (Saindo de Linha)")
            } else {
                ("abundante", "Abundante (Saindo de Linha)")
            };
            let rec = if st == "critico" || st == "ordem" {
                let needed = (estoque_ideal_qtd - estoque_futuro_com_producao as f64).round() as i64;
                if needed > 0 { needed } else { 0 }
            } else {
                0
            };
            ("saindo_de_linha".to_string(), "Saindo de Linha".to_string(), rec)
        } else if resolved_status_produto == "bases" {
            ("bases".to_string(), "Bases".to_string(), 0)
        } else {
            let (st, lbl) = if duracao_meses <= config_prod {
                ("critico", "Produzir Urgente")
            } else if duracao_meses <= config_ordem {
                ("ordem", "Abrir Ordem")
            } else if duracao_meses <= config_ideal {
                ("saudavel", "Estoque OK")
            } else {
                ("abundante", "Abundante")
            };
            let rec = if st == "critico" || st == "ordem" {
                let needed = (estoque_ideal_qtd - estoque_futuro_com_producao as f64).round() as i64;
                if needed > 0 { needed } else { 0 }
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
            is_kit_component: None,
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

    #[test]
    fn debug_db_query() {
        let conn = rusqlite::Connection::open("../data.db").unwrap();
        println!("--- DEBUG SQLITE DATABASE ---");
        
        let mut stmt = conn.prepare("SELECT code, description FROM items WHERE description LIKE '%citri%' OR description LIKE '%cítri%'").unwrap();
        let items: Vec<(String, String)> = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap()
            .map(|r| r.unwrap()).collect();
        println!("Items matching 'citri': {:?}", items);

        let mut stmt = conn.prepare("SELECT codigo, descricao FROM produtos WHERE descricao LIKE '%citri%' OR descricao LIKE '%cítri%'").unwrap();
        let prods: Vec<(String, String)> = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap()
            .map(|r| r.unwrap()).collect();
        println!("Products matching 'citri': {:?}", prods);

        for (code, desc) in &items {
            let cons: Vec<(i64, f64, f64)> = conn.prepare(&format!("SELECT year, total_qty, monthly_avg FROM consumption WHERE item_code = '{}'", code)).unwrap()
                .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, f64>(1)?, r.get::<_, f64>(2)?))).unwrap()
                .map(|r| r.unwrap()).collect();
            println!("Consumption YoY for '{}' ({}): {:?}", code, desc, cons);

            let monthly_cons: Vec<(String, f64)> = conn.prepare(&format!("SELECT strftime('%Y-%m', date) as ym, SUM(quantity) FROM stock_movements WHERE item_code = '{}' AND movement_type = 'saida' AND item_type = 'insumo' AND date <= datetime('now', 'localtime') GROUP BY ym ORDER BY ym ASC", code)).unwrap()
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap()
                .map(|r| r.unwrap()).collect();
            println!("Monthly consumption for '{}': {:?}", code, monthly_cons);

            let invs: Vec<(String, f64, String)> = conn.prepare(&format!("SELECT invoice_date, quantity, invoice_number FROM invoices WHERE item_code = '{}' LIMIT 5", code)).unwrap()
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap()
                .map(|r| r.unwrap()).collect();
            println!("Invoices for '{}': {:?}", code, invs);
        }
    }
}


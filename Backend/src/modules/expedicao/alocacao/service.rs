use std::collections::{HashMap, HashSet};

use serde_json::{json, Value};
use sqlx::{PgConnection, PgPool, Row};

use crate::core::acao::{corpo_acao, executar_em_2_passos, exigir_motivo, ErroApi, RespostaAcao};
use crate::core::regras_produto::{
    atendimento_efetivo, carregar_pais_categorias, categoria_raiz, e_base, situacao_do_status_legado,
};
use crate::modules::geral::audit;
use crate::modules::geral::auth::models::AuthContext;

use super::calculo::{
    agrupar_insumos_caixa_nao_vinculados, aplicar_curva_abc, calcular_camadas_compat_vao,
    calcular_geometria_alocacao, calcular_necessidades_caixas, e_cliente_atacadista,
    situacao_alocacao_produto, sugerir_alocacao, AlocacaoExistente,
};
use super::models::*;

fn str_trim(s: Option<&str>) -> Option<String> {
    s.map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
}

fn validar_papel(papel: &str) -> Result<String, ErroApi> {
    let p = papel.trim().to_ascii_lowercase();
    match p.as_str() {
        "picking" | "pulmao" => Ok(p),
        _ => Err(ErroApi::invalido("Papel da posição deve ser 'picking' ou 'pulmao'.")),
    }
}

fn slug_id(prefix: &str) -> String {
    format!("{prefix}_{}", uuid::Uuid::new_v4().simple())
}

async fn registrar_auditoria(
    pool: &PgPool,
    ctx: &AuthContext,
    acao: &str,
    entidade: &str,
    entidade_id: &str,
    resumo: &str,
    antes: Option<Value>,
    depois: Option<Value>,
) {
    audit::record_domain(
        pool,
        Some(ctx),
        "expedicao_alocacao",
        acao,
        entidade,
        entidade_id,
        resumo,
        antes,
        depois,
    )
    .await;
}

/// Helper genérico para exclusão em 2 passos: prévia sem exigir motivo; confirmação exige motivo, apaga e audita cópia completa.
async fn excluir_em_2_passos(
    pool: &PgPool,
    ctx: &AuthContext,
    acao: &'static str,
    entidade: &str,
    o_que: &str,
    resumo: &str,
    id: &str,
    copia_sql: &'static str,
    delete_sql: &'static str,
    motivo: Option<&str>,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let motivo_limpo = exigir_motivo(confirmar, motivo, o_que)?;
    let id_owned = id.to_string();
    let o_que_owned = o_que.to_string();

    let r = executar_em_2_passos(pool, acao, confirmar, move |tx| {
        Box::pin(async move {
            let copia: Option<Value> = sqlx::query_scalar(copia_sql)
                .bind(&id_owned)
                .fetch_optional(&mut **tx)
                .await?
                .flatten();
            let Some(copia) = copia else {
                return Err(ErroApi::nao_encontrado(format!("Não encontrei {o_que_owned}.")));
            };
            sqlx::query(delete_sql).bind(&id_owned).execute(&mut **tx).await?;
            Ok(json!({ "id": id_owned, "item": copia }))
        })
    })
    .await?;

    if confirmar {
        registrar_auditoria(
            pool,
            ctx,
            acao,
            entidade,
            id,
            &format!("{resumo}: {motivo_limpo}"),
            Some(json!({ "motivo": motivo_limpo, "copia": r.resultado["item"] })),
            None,
        )
        .await;
    }
    Ok(r)
}

async fn carregar_estruturas(pool: &PgPool) -> Result<Vec<Estrutura>, ErroApi> {
    let rows = sqlx::query(
        "SELECT id, nome, descricao, estrado_largura_cm, estrado_comprimento_cm, ordem, ativo \
         FROM expedicao_estruturas ORDER BY ordem ASC, nome ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| Estrutura {
            id: r.get("id"),
            nome: r.get("nome"),
            descricao: r.get("descricao"),
            estrado_largura_cm: r.get("estrado_largura_cm"),
            estrado_comprimento_cm: r.get("estrado_comprimento_cm"),
            ordem: r.get("ordem"),
            ativo: r.get("ativo"),
        })
        .collect())
}

async fn carregar_posicoes(pool: &PgPool, estrutura_id: &str) -> Result<Vec<Posicao>, ErroApi> {
    let rows = sqlx::query(
        "SELECT id, estrutura_id, codigo, coluna, coluna_ordem, nivel, andar, lado, papel, \
                largura_cm, comprimento_cm, altura_cm, ativo, observacoes \
         FROM expedicao_posicoes WHERE estrutura_id = $1 \
         ORDER BY andar ASC, coluna_ordem ASC, lado ASC, nivel ASC",
    )
    .bind(estrutura_id)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| Posicao {
            id: r.get("id"),
            estrutura_id: r.get("estrutura_id"),
            codigo: r.get("codigo"),
            coluna: r.get("coluna"),
            coluna_ordem: r.get("coluna_ordem"),
            nivel: r.get("nivel"),
            andar: r.get("andar"),
            lado: r.get("lado"),
            papel: r.get("papel"),
            largura_cm: r.get("largura_cm"),
            comprimento_cm: r.get("comprimento_cm"),
            altura_cm: r.get("altura_cm"),
            ativo: r.get("ativo"),
            observacoes: r.get("observacoes"),
        })
        .collect())
}

async fn carregar_caixas(pool: &PgPool) -> Result<Vec<Caixa>, ErroApi> {
    let rows = sqlx::query(
        "SELECT id, codigo, nome, altura_cm, comprimento_cm, largura_cm, empilhamento_max, insumo_erp_codigo, ativo, observacoes \
         FROM expedicao_caixas ORDER BY codigo ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| Caixa {
            id: r.get("id"),
            codigo: r.get("codigo"),
            nome: r.get("nome"),
            altura_cm: r.get("altura_cm"),
            comprimento_cm: r.get("comprimento_cm"),
            largura_cm: r.get("largura_cm"),
            empilhamento_max: r.get("empilhamento_max"),
            insumo_erp_codigo: r.get("insumo_erp_codigo"),
            ativo: r.get("ativo"),
            observacoes: r.get("observacoes"),
        })
        .collect())
}

async fn carregar_atacadistas(pool: &PgPool) -> Result<Vec<Atacadista>, ErroApi> {
    let rows = sqlx::query(
        "SELECT id, nome_exibicao, termo_busca, cliente_codigo, ativo \
         FROM expedicao_atacadistas ORDER BY nome_exibicao ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| Atacadista {
            id: r.get("id"),
            nome_exibicao: r.get("nome_exibicao"),
            termo_busca: r.get("termo_busca"),
            cliente_codigo: r.get("cliente_codigo"),
            ativo: r.get("ativo"),
            pedidos_encontrados: 0,
        })
        .collect())
}

pub async fn carregar_painel(pool: &PgPool, q: &PainelQuery) -> Result<PainelAlocacaoResponse, ErroApi> {
    let janela_meses = q.janela_meses.unwrap_or(12).clamp(1, 36);
    let meta_meses = q.meta_meses.unwrap_or(2.0).clamp(0.25, 24.0);
    let usar_meta_linha = q.usar_meta_linha.unwrap_or(false);
    let incluir_inativos = q.incluir_inativos.unwrap_or(false);

    let estruturas = carregar_estruturas(pool).await?;
    let estrutura_ativa_id = q
        .estrutura_id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty() && estruturas.iter().any(|e| e.id == *id))
        .map(str::to_string)
        .or_else(|| estruturas.iter().find(|e| e.ativo).map(|e| e.id.clone()))
        .or_else(|| estruturas.first().map(|e| e.id.clone()))
        .unwrap_or_default();

    let posicoes = if estrutura_ativa_id.is_empty() {
        Vec::new()
    } else {
        carregar_posicoes(pool, &estrutura_ativa_id).await?
    };
    let caixas = carregar_caixas(pool).await?;
    let mut atacadistas = carregar_atacadistas(pool).await?;

    // Mapa código de insumo ERP -> caixa_id (aceita múltiplos códigos separados por vírgula)
    let mut insumo_para_caixa: HashMap<String, String> = HashMap::new();
    for cx in caixas.iter().filter(|c| c.ativo) {
        if let Some(raw) = &cx.insumo_erp_codigo {
            for part in raw.split([',', ';']) {
                let k = part.trim().to_ascii_uppercase();
                if !k.is_empty() {
                    insumo_para_caixa.entry(k).or_insert_with(|| cx.id.clone());
                }
            }
        }
    }
    let caixa_por_id: HashMap<String, &Caixa> = caixas.iter().map(|c| (c.id.clone(), c)).collect();

    // Kits existentes
    let kits_vec: Vec<String> = sqlx::query_scalar("SELECT DISTINCT kit_codigo FROM kit_composicao")
        .fetch_all(pool)
        .await?;
    let kits_set: HashSet<String> = kits_vec.into_iter().collect();

    // Formulações para inferência automática de caixa e diagnóstico ERP
    let form_rows = sqlx::query(
        "SELECT f.product_code, TRIM(f.ingredient_code) AS ing_code, \
                COALESCE(NULLIF(TRIM(i.description), ''), NULLIF(TRIM(f.description), ''), TRIM(f.ingredient_code)) AS ing_desc \
         FROM formulations f \
         LEFT JOIN items i ON i.code = f.ingredient_code",
    )
    .fetch_all(pool)
    .await?;

    let mut caixa_por_formula: HashMap<String, String> = HashMap::new();
    let mut insumo_caixa_por_prod: HashMap<String, (String, String)> = HashMap::new();
    let mut insumos_nao_vinculados: Vec<(String, String, String)> = Vec::new();

    for r in form_rows {
        let p_code: String = r.get("product_code");
        let ing_code: String = r.get("ing_code");
        let ing_desc: String = r.get("ing_desc");
        let ing_up = ing_code.to_ascii_uppercase();
        let desc_up = ing_desc.to_ascii_uppercase();

        if let Some(cid) = insumo_para_caixa.get(&ing_up) {
            caixa_por_formula.entry(p_code.clone()).or_insert_with(|| cid.clone());
            insumo_caixa_por_prod
                .entry(p_code)
                .or_insert((ing_code, ing_desc));
        } else if ing_up.starts_with("9.04.") || desc_up.contains("CAIXA") || desc_up.starts_with("CX ") {
            insumo_caixa_por_prod
                .entry(p_code.clone())
                .or_insert_with(|| (ing_code.clone(), ing_desc.clone()));
            insumos_nao_vinculados.push((ing_code, ing_desc, p_code));
        }
    }

    // Demanda Varejo × Atacado a partir de sales_orders + sales_order_items
    let vendas_rows = sqlx::query(
        "SELECT so.n_pedido, so.d_pedido, so.n_codigo, so.c_nome, soi.c_cod_prod, \
                SUM(CASE WHEN soi.n_qtde_fat > 0 THEN soi.n_qtde_fat ELSE soi.n_qtde END)::double precision AS qtd \
         FROM sales_order_items soi \
         JOIN sales_orders so ON so.n_pedido = soi.n_pedido AND so.d_pedido = soi.d_pedido \
         WHERE COALESCE(so.c_status, '') <> 'CA' \
           AND LEFT(so.d_pedido, 10) >= to_char(CURRENT_DATE - ($1::int * INTERVAL '1 month'), 'YYYY-MM-DD') \
         GROUP BY so.n_pedido, so.d_pedido, so.n_codigo, so.c_nome, soi.c_cod_prod",
    )
    .bind(janela_meses)
    .fetch_all(pool)
    .await?;

    let mut vendas_varejo_map: HashMap<String, f64> = HashMap::new();
    let mut vendas_atacado_map: HashMap<String, f64> = HashMap::new();
    let mut pedidos_por_regra: HashMap<String, HashSet<(i32, String)>> = HashMap::new();

    for r in vendas_rows {
        let n_ped: i32 = r.get("n_pedido");
        let d_ped: String = r.get("d_pedido");
        let n_cod: Option<i32> = r.get("n_codigo");
        let c_nome: Option<String> = r.get("c_nome");
        let prod_cod: String = r.get("c_cod_prod");
        let qtd: f64 = r.get::<Option<f64>, _>("qtd").unwrap_or(0.0).max(0.0);

        if let Some(regra_id) = e_cliente_atacadista(n_cod, c_nome.as_deref(), &atacadistas) {
            *vendas_atacado_map.entry(prod_cod).or_insert(0.0) += qtd;
            pedidos_por_regra
                .entry(regra_id)
                .or_default()
                .insert((n_ped, d_ped));
        } else {
            *vendas_varejo_map.entry(prod_cod).or_insert(0.0) += qtd;
        }
    }

    for a in &mut atacadistas {
        a.pedidos_encontrados = pedidos_por_regra.get(&a.id).map_or(0, |s| s.len() as i64);
    }

    // Produtos, linhas, estoque e overrides
    let pais_cat = carregar_pais_categorias(pool).await?;
    let prod_rows = sqlx::query(
        "SELECT p.codigo, p.descricao, p.codigo_barras, \
                COALESCE(NULLIF(o.linha_prefix_manual, ''), p.linha_prefix) AS linha_efetiva, \
                COALESCE(cl.nome_linha, 'Outros') AS nome_linha, \
                cl.linha_principal, \
                COALESCE(cl.estoque_ideal_mult, 2.0) AS estoque_ideal_mult, \
                COALESCE(cl.visivel, 1) AS linha_visivel, \
                cl.atendimento AS linha_atendimento, \
                o.visivel AS prod_visivel, \
                o.status_produto, \
                o.categoria_produto, \
                o.situacao, \
                o.atendimento AS prod_atendimento, \
                p.qtde_cx, \
                COALESCE(ea.estoque, 0.0) AS estoque_atual, \
                epc.caixa_id, \
                epc.qtde_cx_manual, \
                epc.camadas_override \
         FROM produtos p \
         LEFT JOIN overrides_produtos o ON o.codigo = p.codigo \
         LEFT JOIN config_linhas cl ON cl.linha_prefix = COALESCE(NULLIF(o.linha_prefix_manual, ''), p.linha_prefix) \
         LEFT JOIN estoque_atual ea ON ea.codigo = p.codigo \
         LEFT JOIN expedicao_produto_caixa epc ON epc.produto_codigo = p.codigo \
         ORDER BY p.codigo ASC",
    )
    .fetch_all(pool)
    .await?;

    struct ProdMetaFallback {
        descricao: String,
        linha_prefix: String,
        nome_linha: String,
        qtde_cx: Option<i32>,
        caixa_id: Option<String>,
        media_total: f64,
    }
    let mut fallback_map: HashMap<String, ProdMetaFallback> = HashMap::new();
    let mut produtos: Vec<ProdutoDimensao> = Vec::new();
    let janela_f = janela_meses as f64;

    for r in prod_rows {
        let codigo: String = r.get("codigo");
        let descricao: String = r.get("descricao");
        let codigo_barras: Option<String> = r.get("codigo_barras");
        let linha_prefix: String = r.get("linha_efetiva");
        let nome_linha: String = r.get("nome_linha");
        let linha_principal: Option<String> = r.get("linha_principal");
        let estoque_ideal_mult: f64 = r.get("estoque_ideal_mult");
        let linha_visivel: i32 = r.get("linha_visivel");
        let linha_atendimento: Option<String> = r.get("linha_atendimento");
        let prod_visivel: Option<i32> = r.get("prod_visivel");
        let status_produto: Option<String> = r.get("status_produto");
        let categoria_produto: Option<String> = r.get("categoria_produto");
        let situacao_raw: Option<String> = r.get("situacao");
        let prod_atendimento: Option<String> = r.get("prod_atendimento");
        let qtde_cx_erp: Option<i32> = r.get::<Option<i32>, _>("qtde_cx").filter(|&q| q > 0);
        let estoque_atual: f64 = r.get("estoque_atual");
        let caixa_id_manual: Option<String> = r.get("caixa_id");
        let qtde_cx_manual: Option<i32> = r.get::<Option<i32>, _>("qtde_cx_manual").filter(|&q| q > 0);
        let camadas_override: Option<i32> = r.get::<Option<i32>, _>("camadas_override").filter(|&c| c > 0);

        let cat_raiz = categoria_raiz(categoria_produto.as_deref().unwrap_or(""), &pais_cat);
        let eh_base = e_base(&codigo, &cat_raiz, status_produto.as_deref().unwrap_or(""));

        let situacao = situacao_raw
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| situacao_do_status_legado(status_produto.as_deref()).0);

        let prod_atend_compat = prod_atendimento.as_deref().or_else(|| {
            if status_produto.as_deref() == Some("terceirizado") {
                Some("terceirizado")
            } else {
                None
            }
        });
        let atendimento = atendimento_efetivo(prod_atend_compat, linha_atendimento.as_deref()).to_string();

        let (qtde_cx_efetiva, qtde_cx_origem) = if let Some(m) = qtde_cx_manual {
            (Some(m), "manual".to_string())
        } else if let Some(e) = qtde_cx_erp {
            (Some(e), "erp".to_string())
        } else {
            (None, "ausente".to_string())
        };

        let (caixa_id_eff, caixa_origem) = if let Some(cid) = caixa_id_manual.filter(|id| caixa_por_id.contains_key(id)) {
            (Some(cid), "manual".to_string())
        } else if let Some(cid) = caixa_por_formula.get(&codigo) {
            (Some(cid.clone()), "erp_formula".to_string())
        } else {
            (None, "ausente".to_string())
        };

        let vendas_varejo = vendas_varejo_map.get(&codigo).copied().unwrap_or(0.0);
        let vendas_atacado = vendas_atacado_map.get(&codigo).copied().unwrap_or(0.0);
        let vendas_total = vendas_varejo + vendas_atacado;
        let media_varejo = vendas_varejo / janela_f;
        let media_atacado = vendas_atacado / janela_f;
        let media_total = vendas_total / janela_f;

        fallback_map.insert(
            codigo.clone(),
            ProdMetaFallback {
                descricao: descricao.clone(),
                linha_prefix: linha_prefix.clone(),
                nome_linha: nome_linha.clone(),
                qtde_cx: qtde_cx_efetiva,
                caixa_id: caixa_id_eff.clone(),
                media_total,
            },
        );

        if eh_base {
            continue;
        }
        let inativo = prod_visivel == Some(0) || linha_visivel == 0 || situacao == "descontinuado";
        if !incluir_inativos && inativo {
            continue;
        }

        let cx_ref = caixa_id_eff.as_ref().and_then(|id| caixa_por_id.get(id)).copied();
        let meta_meses_efetiva = if usar_meta_linha && estoque_ideal_mult > 0.0 {
            estoque_ideal_mult
        } else {
            meta_meses
        };
        let (nec_pick, nec_pulm, nec_tot) = calcular_necessidades_caixas(
            media_varejo,
            media_atacado,
            media_total,
            meta_meses_efetiva,
            qtde_cx_efetiva,
        );
        let estoque_caixas = qtde_cx_efetiva.filter(|&q| q > 0).map(|q| {
            if estoque_atual <= 0.0 {
                0
            } else {
                (estoque_atual / (q as f64)).ceil() as i32
            }
        });
        let (ins_cod, ins_desc) = match insumo_caixa_por_prod.get(&codigo) {
            Some((c, d)) => (Some(c.clone()), Some(d.clone())),
            None => (None, None),
        };

        produtos.push(ProdutoDimensao {
            codigo: codigo.clone(),
            descricao,
            codigo_barras,
            linha_prefix,
            nome_linha,
            linha_principal,
            situacao,
            atendimento,
            eh_kit: kits_set.contains(&codigo),
            estoque_atual,
            estoque_caixas,
            qtde_cx_erp,
            qtde_cx_efetiva,
            qtde_cx_origem,
            caixa_id: caixa_id_eff,
            caixa_codigo: cx_ref.map(|c| c.codigo.clone()),
            caixa_nome: cx_ref.map(|c| c.nome.clone()),
            caixa_origem,
            caixa_altura_cm: cx_ref.map(|c| c.altura_cm),
            caixa_comprimento_cm: cx_ref.map(|c| c.comprimento_cm),
            caixa_largura_cm: cx_ref.map(|c| c.largura_cm),
            empilhamento_max: cx_ref.map(|c| c.empilhamento_max),
            insumo_caixa_erp: ins_cod,
            insumo_caixa_erp_desc: ins_desc,
            camadas_override,
            vendas_varejo,
            media_varejo,
            vendas_atacado,
            media_atacado,
            vendas_total,
            media_total,
            percentual_abc: 0.0,
            acumulado_abc: 0.0,
            curva_abc: "C".into(),
            meta_meses_efetiva,
            caixas_necessarias_picking: nec_pick,
            caixas_necessarias_pulmao: nec_pulm,
            caixas_necessarias_total: nec_tot,
            alocacoes: Vec::new(),
            enderecos_picking: Vec::new(),
            enderecos_pulmao: Vec::new(),
            total_caixas_alocadas: 0,
            total_unidades_alocadas: 0,
            cobertura_meses_alocada: None,
            situacao_alocacao: "sem_endereco".into(),
        });
    }

    aplicar_curva_abc(&mut produtos);

    // Carregar alocações da estrutura ativa
    let pos_por_id: HashMap<String, &Posicao> = posicoes.iter().map(|p| (p.id.clone(), p)).collect();
    let aloc_rows = if estrutura_ativa_id.is_empty() {
        Vec::new()
    } else {
        sqlx::query(
            "SELECT a.id, a.posicao_id, a.produto_codigo, a.fileiras_largura, a.camadas_altura, a.fixado, a.observacoes \
             FROM expedicao_alocacoes a \
             JOIN expedicao_posicoes pos ON pos.id = a.posicao_id \
             WHERE pos.estrutura_id = $1 \
             ORDER BY pos.andar ASC, pos.coluna_ordem ASC, pos.lado ASC, a.produto_codigo ASC",
        )
        .bind(&estrutura_ativa_id)
        .fetch_all(pool)
        .await?
    };

    let mut itens_por_pos: HashMap<String, Vec<AlocacaoItemView>> = HashMap::new();
    let mut itens_por_prod: HashMap<String, Vec<AlocacaoItemView>> = HashMap::new();

    for r in aloc_rows {
        let id: String = r.get("id");
        let posicao_id: String = r.get("posicao_id");
        let produto_codigo: String = r.get("produto_codigo");
        let fileiras_largura: i32 = r.get("fileiras_largura");
        let camadas_altura: i32 = r.get("camadas_altura");
        let fixado: bool = r.get("fixado");
        let observacoes: Option<String> = r.get("observacoes");

        let Some(pos) = pos_por_id.get(&posicao_id).copied() else {
            continue;
        };
        let Some(fb) = fallback_map.get(&produto_codigo) else {
            continue;
        };
        let cx_ref = fb.caixa_id.as_ref().and_then(|cid| caixa_por_id.get(cid)).copied();
        let geom = calcular_geometria_alocacao(
            pos,
            cx_ref,
            fileiras_largura,
            camadas_altura,
            fb.qtde_cx,
            fb.media_total,
        );

        let view = AlocacaoItemView {
            id,
            posicao_id: posicao_id.clone(),
            posicao_codigo: pos.codigo.clone(),
            estrutura_id: pos.estrutura_id.clone(),
            papel: pos.papel.clone(),
            andar: pos.andar,
            nivel: pos.nivel,
            produto_codigo: produto_codigo.clone(),
            produto_descricao: fb.descricao.clone(),
            linha_prefix: fb.linha_prefix.clone(),
            nome_linha: fb.nome_linha.clone(),
            fileiras_largura,
            camadas_altura,
            fixado,
            observacoes,
            caixa_id: cx_ref.map(|c| c.id.clone()),
            caixa_codigo: cx_ref.map(|c| c.codigo.clone()),
            caixa_altura_cm: cx_ref.map(|c| c.altura_cm),
            caixa_comprimento_cm: cx_ref.map(|c| c.comprimento_cm),
            caixa_largura_cm: cx_ref.map(|c| c.largura_cm),
            caixas_comprimento: geom.caixas_comp,
            max_camadas: geom.max_cam,
            total_caixas: geom.total_caixas,
            qtde_cx: fb.qtde_cx,
            total_unidades: geom.total_unidades,
            largura_ocupada_cm: geom.largura_ocupada_cm,
            altura_ocupada_cm: geom.altura_ocupada_cm,
            altura_vao_cm: pos.altura_cm,
            estouro_altura: geom.estouro_altura,
            cobertura_meses: geom.cobertura_meses,
        };
        itens_por_pos.entry(posicao_id).or_default().push(view.clone());
        itens_por_prod.entry(produto_codigo).or_default().push(view);
    }

    let mut posicoes_com_itens: Vec<PosicaoComItens> = Vec::with_capacity(posicoes.len());
    let mut posicoes_ocupadas = 0usize;
    let mut soma_pct = 0.0;
    let mut ativas_count = 0usize;

    for pos in posicoes {
        let itens = itens_por_pos.remove(&pos.id).unwrap_or_default();
        let largura_ocupada_cm: f64 = itens.iter().map(|i| i.largura_ocupada_cm).sum();
        let largura_livre_cm = (pos.largura_cm - largura_ocupada_cm).max(0.0);
        let ocupacao_pct = if pos.largura_cm > 0.0 {
            (largura_ocupada_cm / pos.largura_cm) * 100.0
        } else {
            0.0
        };
        let tem_estouro = largura_ocupada_cm > pos.largura_cm + 1e-6 || itens.iter().any(|i| i.estouro_altura);
        let total_caixas: i32 = itens.iter().map(|i| i.total_caixas).sum();
        let total_unidades: i32 = itens.iter().map(|i| i.total_unidades).sum();
        if pos.ativo {
            ativas_count += 1;
            if !itens.is_empty() {
                posicoes_ocupadas += 1;
            }
            soma_pct += ocupacao_pct.min(100.0);
        }
        posicoes_com_itens.push(PosicaoComItens {
            posicao: pos,
            itens,
            largura_ocupada_cm,
            largura_livre_cm,
            ocupacao_pct,
            tem_estouro,
            total_caixas,
            total_unidades,
        });
    }

    let mut alocados = 0usize;
    let mut sem_endereco = 0usize;
    let mut sem_caixa = 0usize;
    let mut sem_qtde_cx = 0usize;
    let mut estoque_acima_capacidade = 0usize;

    for p in &mut produtos {
        let alocs = itens_por_prod.remove(&p.codigo).unwrap_or_default();
        p.enderecos_picking = alocs
            .iter()
            .filter(|a| a.papel == "picking")
            .map(|a| a.posicao_codigo.clone())
            .collect();
        p.enderecos_pulmao = alocs
            .iter()
            .filter(|a| a.papel == "pulmao")
            .map(|a| a.posicao_codigo.clone())
            .collect();
        p.total_caixas_alocadas = alocs.iter().map(|a| a.total_caixas).sum();
        p.total_unidades_alocadas = alocs.iter().map(|a| a.total_unidades).sum();
        p.cobertura_meses_alocada = if p.media_total > 0.0 && p.total_unidades_alocadas > 0 {
            Some((p.total_unidades_alocadas as f64) / p.media_total)
        } else {
            None
        };
        p.situacao_alocacao = situacao_alocacao_produto(
            &p.caixa_id,
            p.qtde_cx_efetiva,
            &alocs,
            p.estoque_caixas,
            p.total_caixas_alocadas,
        );
        p.alocacoes = alocs;

        if !p.alocacoes.is_empty() {
            alocados += 1;
        }
        match p.situacao_alocacao.as_str() {
            "sem_caixa" => sem_caixa += 1,
            "sem_qtde_cx" => sem_qtde_cx += 1,
            "sem_endereco" => sem_endereco += 1,
            "estoque_acima_capacidade" => estoque_acima_capacidade += 1,
            _ => {}
        }
    }

    let agrupados_insumos = agrupar_insumos_caixa_nao_vinculados(insumos_nao_vinculados);
    let insumos_caixa_erp: Vec<InsumoCaixaErpNaoVinculado> = agrupados_insumos
        .into_iter()
        .map(|(ingredient_code, (description, mut prods))| {
            let qtd_produtos = prods.len() as i64;
            prods.truncate(5);
            InsumoCaixaErpNaoVinculado {
                ingredient_code,
                description,
                qtd_produtos,
                exemplos_produtos: prods,
            }
        })
        .collect();

    let resumo = PainelResumo {
        total_produtos: produtos.len(),
        alocados,
        sem_endereco,
        sem_caixa,
        sem_qtde_cx,
        estoque_acima_capacidade,
        total_posicoes: posicoes_com_itens.len(),
        posicoes_ocupadas,
        ocupacao_media_pct: if ativas_count == 0 {
            0.0
        } else {
            soma_pct / (ativas_count as f64)
        },
    };

    Ok(PainelAlocacaoResponse {
        janela_meses,
        meta_meses,
        usar_meta_linha,
        estrutura_ativa_id,
        estruturas,
        posicoes: posicoes_com_itens,
        caixas,
        atacadistas,
        produtos,
        insumos_caixa_erp,
        resumo,
    })
}

pub async fn listar_clientes_sugestao(
    pool: &PgPool,
    q: &ClientesSugestaoQuery,
) -> Result<Vec<ClienteSugestao>, ErroApi> {
    let janela_meses = q.janela_meses.unwrap_or(12).clamp(1, 36);
    let search = str_trim(q.search.as_deref());
    let atacadistas = carregar_atacadistas(pool).await?;

    let mut qb = sqlx::QueryBuilder::new(
        "SELECT so.n_codigo, COALESCE(NULLIF(TRIM(so.c_nome), ''), 'SEM NOME') AS c_nome, \
                COUNT(DISTINCT (so.n_pedido, so.d_pedido))::bigint AS pedidos, \
                COALESCE(SUM(CASE WHEN soi.n_qtde_fat > 0 THEN soi.n_qtde_fat ELSE soi.n_qtde END), 0)::bigint AS unidades \
         FROM sales_orders so \
         JOIN sales_order_items soi ON so.n_pedido = soi.n_pedido AND so.d_pedido = soi.d_pedido \
         WHERE COALESCE(so.c_status, '') <> 'CA' \
           AND LEFT(so.d_pedido, 10) >= to_char(CURRENT_DATE - (",
    );
    qb.push_bind(janela_meses);
    qb.push("::int * INTERVAL '1 month'), 'YYYY-MM-DD')");

    if let Some(s) = &search {
        let pat = format!("%{s}%");
        qb.push(" AND (so.c_nome ILIKE ");
        qb.push_bind(pat.clone());
        qb.push(" OR CAST(COALESCE(so.n_codigo, 0) AS TEXT) LIKE ");
        qb.push_bind(pat);
        qb.push(")");
    }
    qb.push(" GROUP BY so.n_codigo, COALESCE(NULLIF(TRIM(so.c_nome), ''), 'SEM NOME') ORDER BY unidades DESC LIMIT 80");

    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows
        .into_iter()
        .map(|r| {
            let codigo: Option<i32> = r.get("n_codigo");
            let nome: String = r.get("c_nome");
            let pedidos: i64 = r.get("pedidos");
            let unidades: i64 = r.get("unidades");
            let ja_atacadista = e_cliente_atacadista(codigo, Some(&nome), &atacadistas).is_some();
            ClienteSugestao {
                codigo,
                nome,
                pedidos,
                unidades,
                ja_atacadista,
            }
        })
        .collect())
}

// --- Estruturas ---

pub async fn criar_estrutura(
    pool: &PgPool,
    ctx: &AuthContext,
    input: EstruturaInput,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let nome = str_trim(Some(&input.nome)).ok_or_else(|| ErroApi::invalido("Informe o nome da estrutura."))?;
    let largura = input.estrado_largura_cm.unwrap_or(100.0);
    let comp = input.estrado_comprimento_cm.unwrap_or(120.0);
    if largura <= 0.0 || comp <= 0.0 {
        return Err(ErroApi::invalido("Largura e comprimento do estrado devem ser positivos."));
    }
    let desc = str_trim(input.descricao.as_deref());
    let ordem = input.ordem.unwrap_or(10);
    let ativo = input.ativo.unwrap_or(true);
    let id = slug_id("est");

    let id_c = id.clone();
    let nome_c = nome.clone();
    let desc_c = desc.clone();
    let r = executar_em_2_passos(pool, "criar_estrutura_expedicao", confirmar, move |tx| {
        Box::pin(async move {
            sqlx::query(
                "INSERT INTO expedicao_estruturas (id, nome, descricao, estrado_largura_cm, estrado_comprimento_cm, ordem, ativo) \
                 VALUES ($1, $2, $3, $4, $5, $6, $7)",
            )
            .bind(&id_c)
            .bind(&nome_c)
            .bind(&desc_c)
            .bind(largura)
            .bind(comp)
            .bind(ordem)
            .bind(ativo)
            .execute(&mut **tx)
            .await?;
            Ok(json!({
                "id": id_c,
                "nome": nome_c,
                "estradoLarguraCm": largura,
                "estradoComprimentoCm": comp,
            }))
        })
    })
    .await?;

    if confirmar {
        registrar_auditoria(
            pool,
            ctx,
            "criar_estrutura_expedicao",
            "expedicao_estrutura",
            &id,
            &format!("Estrutura '{nome}' criada"),
            None,
            Some(r.resultado.clone()),
        )
        .await;
    }
    Ok(r)
}

pub async fn atualizar_estrutura(
    pool: &PgPool,
    ctx: &AuthContext,
    id: &str,
    input: EstruturaInput,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let nome = str_trim(Some(&input.nome)).ok_or_else(|| ErroApi::invalido("Informe o nome da estrutura."))?;
    let largura = input.estrado_largura_cm.unwrap_or(100.0);
    let comp = input.estrado_comprimento_cm.unwrap_or(120.0);
    if largura <= 0.0 || comp <= 0.0 {
        return Err(ErroApi::invalido("Largura e comprimento do estrado devem ser positivos."));
    }
    let desc = str_trim(input.descricao.as_deref());
    let ordem = input.ordem.unwrap_or(1);
    let ativo = input.ativo.unwrap_or(true);
    let id_c = id.to_string();
    let nome_c = nome.clone();

    let r = executar_em_2_passos(pool, "atualizar_estrutura_expedicao", confirmar, move |tx| {
        Box::pin(async move {
            let antes: Option<Value> = sqlx::query_scalar(
                "SELECT to_jsonb(e) FROM expedicao_estruturas e WHERE e.id = $1 FOR UPDATE",
            )
            .bind(&id_c)
            .fetch_optional(&mut **tx)
            .await?
            .flatten();
            let Some(antes) = antes else {
                return Err(ErroApi::nao_encontrado("Estrutura não encontrada."));
            };
            sqlx::query(
                "UPDATE expedicao_estruturas \
                 SET nome = $2, descricao = $3, estrado_largura_cm = $4, estrado_comprimento_cm = $5, ordem = $6, ativo = $7, updated_at = NOW() \
                 WHERE id = $1",
            )
            .bind(&id_c)
            .bind(&nome_c)
            .bind(&desc)
            .bind(largura)
            .bind(comp)
            .bind(ordem)
            .bind(ativo)
            .execute(&mut **tx)
            .await?;
            Ok(json!({
                "id": id_c,
                "antes": antes,
                "depois": {
                    "nome": nome_c,
                    "descricao": desc,
                    "estradoLarguraCm": largura,
                    "estradoComprimentoCm": comp,
                    "ordem": ordem,
                    "ativo": ativo,
                }
            }))
        })
    })
    .await?;

    if confirmar {
        registrar_auditoria(
            pool,
            ctx,
            "atualizar_estrutura_expedicao",
            "expedicao_estrutura",
            id,
            &format!("Estrutura '{nome}' atualizada"),
            Some(r.resultado["antes"].clone()),
            Some(r.resultado["depois"].clone()),
        )
        .await;
    }
    Ok(r)
}

pub async fn excluir_estrutura(
    pool: &PgPool,
    ctx: &AuthContext,
    id: &str,
    motivo: Option<&str>,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    if id == "estante_principal" {
        return Err(ErroApi::regra(
            "A estrutura principal não pode ser removida (edite suas prateleiras ou crie outra estante).",
        ));
    }
    excluir_em_2_passos(
        pool,
        ctx,
        "excluir_estrutura_expedicao",
        "expedicao_estrutura",
        "a estrutura",
        "Estrutura de expedição excluída",
        id,
        "SELECT to_jsonb(e) || jsonb_build_object('posicoesCount', (SELECT COUNT(*) FROM expedicao_posicoes p WHERE p.estrutura_id = e.id)) \
         FROM expedicao_estruturas e WHERE e.id = $1 FOR UPDATE",
        "DELETE FROM expedicao_estruturas WHERE id = $1",
        motivo,
        confirmar,
    )
    .await
}

pub async fn gerar_grade_estrutura(
    pool: &PgPool,
    ctx: &AuthContext,
    estrutura_id: &str,
    input: GerarGradeInput,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let cols: Vec<String> = input
        .colunas
        .iter()
        .map(|c| c.trim().to_ascii_uppercase())
        .filter(|c| !c.is_empty())
        .collect();
    if cols.is_empty() || input.andares.is_empty() {
        return Err(ErroApi::invalido("Informe pelo menos 1 coluna e 1 prateleira."));
    }
    for a in &input.andares {
        if a.andar <= 0 || a.altura_cm <= 0.0 {
            return Err(ErroApi::invalido("Prateleira e altura (cm) devem ser positivos."));
        }
        validar_papel(&a.papel)?;
    }

    let est_id = estrutura_id.to_string();
    let substituir = input.substituir_nao_fixadas.unwrap_or(false);
    let r = executar_em_2_passos(pool, "gerar_grade_expedicao", confirmar, move |tx| {
        Box::pin(async move {
            let row = sqlx::query(
                "SELECT estrado_largura_cm, estrado_comprimento_cm FROM expedicao_estruturas WHERE id = $1",
            )
            .bind(&est_id)
            .fetch_optional(&mut **tx)
            .await?
            .ok_or_else(|| ErroApi::nao_encontrado("Estrutura não encontrada."))?;

            let larg = input.largura_cm.unwrap_or_else(|| row.get("estrado_largura_cm"));
            let comp = input.comprimento_cm.unwrap_or_else(|| row.get("estrado_comprimento_cm"));
            if larg <= 0.0 || comp <= 0.0 {
                return Err(ErroApi::invalido("Dimensões da posição devem ser positivas."));
            }

            let mut criadas = 0usize;
            let mut atualizadas = 0usize;
            let mut codigos_ativos: HashSet<String> = HashSet::new();

            for a in &input.andares {
                let lados = a.lados.unwrap_or(2).clamp(1, 2);
                let papel = validar_papel(&a.papel)?;
                for lado in 1..=lados {
                    let nivel = if lados == 1 { a.andar } else { (a.andar - 1) * 2 + lado };
                    for (col_idx, col) in cols.iter().enumerate() {
                        let codigo = format!("{col}{nivel}");
                        codigos_ativos.insert(codigo.clone());
                        let existe: Option<String> = sqlx::query_scalar(
                            "SELECT id FROM expedicao_posicoes WHERE estrutura_id = $1 AND codigo = $2",
                        )
                        .bind(&est_id)
                        .bind(&codigo)
                        .fetch_optional(&mut **tx)
                        .await?;

                        if let Some(pos_id) = existe {
                            sqlx::query(
                                "UPDATE expedicao_posicoes \
                                 SET coluna = $2, coluna_ordem = $3, nivel = $4, andar = $5, lado = $6, \
                                     papel = $7, largura_cm = $8, comprimento_cm = $9, altura_cm = $10, ativo = TRUE \
                                 WHERE id = $1",
                            )
                            .bind(&pos_id)
                            .bind(col)
                            .bind((col_idx + 1) as i32)
                            .bind(nivel)
                            .bind(a.andar)
                            .bind(lado)
                            .bind(&papel)
                            .bind(larg)
                            .bind(comp)
                            .bind(a.altura_cm)
                            .execute(&mut **tx)
                            .await?;
                            atualizadas += 1;
                        } else {
                            let pos_id = format!("{est_id}:{codigo}");
                            sqlx::query(
                                "INSERT INTO expedicao_posicoes \
                                 (id, estrutura_id, codigo, coluna, coluna_ordem, nivel, andar, lado, papel, largura_cm, comprimento_cm, altura_cm, ativo) \
                                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE)",
                            )
                            .bind(&pos_id)
                            .bind(&est_id)
                            .bind(&codigo)
                            .bind(col)
                            .bind((col_idx + 1) as i32)
                            .bind(nivel)
                            .bind(a.andar)
                            .bind(lado)
                            .bind(&papel)
                            .bind(larg)
                            .bind(comp)
                            .bind(a.altura_cm)
                            .execute(&mut **tx)
                            .await?;
                            criadas += 1;
                        }
                    }
                }
            }

            let mut desativadas = 0usize;
            if substituir {
                let existentes: Vec<(String, String)> = sqlx::query_as(
                    "SELECT id, codigo FROM expedicao_posicoes WHERE estrutura_id = $1 AND ativo = TRUE",
                )
                .bind(&est_id)
                .fetch_all(&mut **tx)
                .await?;
                for (pid, pcod) in existentes {
                    if !codigos_ativos.contains(&pcod) {
                        sqlx::query("UPDATE expedicao_posicoes SET ativo = FALSE WHERE id = $1")
                            .bind(&pid)
                            .execute(&mut **tx)
                            .await?;
                        desativadas += 1;
                    }
                }
            }

            Ok(json!({
                "estruturaId": est_id,
                "criadas": criadas,
                "atualizadas": atualizadas,
                "desativadas": desativadas,
                "totalPosicoesGrade": codigos_ativos.len(),
            }))
        })
    })
    .await?;

    if confirmar {
        registrar_auditoria(
            pool,
            ctx,
            "gerar_grade_expedicao",
            "expedicao_estrutura",
            estrutura_id,
            "Grade de posições da estrutura gerada/atualizada",
            None,
            Some(r.resultado.clone()),
        )
        .await;
    }
    Ok(r)
}

// --- Posições ---

pub async fn atualizar_posicao(
    pool: &PgPool,
    ctx: &AuthContext,
    id: &str,
    input: PosicaoUpdateInput,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    if let Some(a) = input.altura_cm {
        if a <= 0.0 {
            return Err(ErroApi::invalido("Altura do vão deve ser positiva."));
        }
    }
    if let Some(l) = input.largura_cm {
        if l <= 0.0 {
            return Err(ErroApi::invalido("Largura deve ser positiva."));
        }
    }
    if let Some(c) = input.comprimento_cm {
        if c <= 0.0 {
            return Err(ErroApi::invalido("Comprimento deve ser positivo."));
        }
    }
    let papel_opt = match input.papel.as_deref() {
        Some(p) => Some(validar_papel(p)?),
        None => None,
    };

    let id_c = id.to_string();
    let r = executar_em_2_passos(pool, "atualizar_posicao_expedicao", confirmar, move |tx| {
        Box::pin(async move {
            let row = sqlx::query(
                "SELECT id, estrutura_id, codigo, andar, papel, largura_cm, comprimento_cm, altura_cm, ativo, observacoes \
                 FROM expedicao_posicoes WHERE id = $1 FOR UPDATE",
            )
            .bind(&id_c)
            .fetch_optional(&mut **tx)
            .await?
            .ok_or_else(|| ErroApi::nao_encontrado("Posição não encontrada."))?;

            let estrutura_id: String = row.get("estrutura_id");
            let codigo: String = row.get("codigo");
            let andar: i32 = row.get("andar");
            let antes_altura: f64 = row.get("altura_cm");
            let antes_largura: f64 = row.get("largura_cm");
            let antes_comp: f64 = row.get("comprimento_cm");
            let antes_papel: String = row.get("papel");
            let antes_ativo: bool = row.get("ativo");
            let antes_obs: Option<String> = row.get("observacoes");

            let nova_altura = input.altura_cm.unwrap_or(antes_altura);
            let nova_largura = input.largura_cm.unwrap_or(antes_largura);
            let novo_comp = input.comprimento_cm.unwrap_or(antes_comp);
            let novo_papel = papel_opt.unwrap_or_else(|| antes_papel.clone());
            let novo_ativo = input.ativo.unwrap_or(antes_ativo);
            let nova_obs = if input.observacoes.is_some() {
                str_trim(input.observacoes.as_deref())
            } else {
                antes_obs.clone()
            };

            let afetadas = if input.aplicar_ao_andar.unwrap_or(false) {
                sqlx::query(
                    "UPDATE expedicao_posicoes \
                     SET altura_cm = $3, largura_cm = $4, comprimento_cm = $5, papel = $6 \
                     WHERE estrutura_id = $1 AND andar = $2",
                )
                .bind(&estrutura_id)
                .bind(andar)
                .bind(nova_altura)
                .bind(nova_largura)
                .bind(novo_comp)
                .bind(&novo_papel)
                .execute(&mut **tx)
                .await?
                .rows_affected()
            } else {
                sqlx::query(
                    "UPDATE expedicao_posicoes \
                     SET altura_cm = $2, largura_cm = $3, comprimento_cm = $4, papel = $5, ativo = $6, observacoes = $7 \
                     WHERE id = $1",
                )
                .bind(&id_c)
                .bind(nova_altura)
                .bind(nova_largura)
                .bind(novo_comp)
                .bind(&novo_papel)
                .bind(novo_ativo)
                .bind(&nova_obs)
                .execute(&mut **tx)
                .await?
                .rows_affected()
            };

            Ok(json!({
                "id": id_c,
                "codigo": codigo,
                "andar": andar,
                "aplicarAoAndar": input.aplicar_ao_andar.unwrap_or(false),
                "posicoesAfetadas": afetadas,
                "antes": { "alturaCm": antes_altura, "larguraCm": antes_largura, "comprimentoCm": antes_comp, "papel": antes_papel, "ativo": antes_ativo },
                "depois": { "alturaCm": nova_altura, "larguraCm": nova_largura, "comprimentoCm": novo_comp, "papel": novo_papel, "ativo": novo_ativo }
            }))
        })
    })
    .await?;

    if confirmar {
        registrar_auditoria(
            pool,
            ctx,
            "atualizar_posicao_expedicao",
            "expedicao_posicao",
            id,
            &format!("Posição {} atualizada", r.resultado["codigo"].as_str().unwrap_or(id)),
            Some(r.resultado["antes"].clone()),
            Some(r.resultado["depois"].clone()),
        )
        .await;
    }
    Ok(r)
}

pub async fn excluir_posicao(
    pool: &PgPool,
    ctx: &AuthContext,
    id: &str,
    motivo: Option<&str>,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    excluir_em_2_passos(
        pool,
        ctx,
        "excluir_posicao_expedicao",
        "expedicao_posicao",
        "a posição",
        "Posição de expedição excluída",
        id,
        "SELECT to_jsonb(p) FROM expedicao_posicoes p WHERE p.id = $1 FOR UPDATE",
        "DELETE FROM expedicao_posicoes WHERE id = $1",
        motivo,
        confirmar,
    )
    .await
}

// --- Caixas ---

fn validar_caixa_input(input: &CaixaInput) -> Result<(String, String, i32), ErroApi> {
    let codigo = str_trim(Some(&input.codigo)).ok_or_else(|| ErroApi::invalido("Informe o código da caixa."))?;
    let nome = str_trim(Some(&input.nome)).ok_or_else(|| ErroApi::invalido("Informe o nome da caixa."))?;
    if input.altura_cm <= 0.0 || input.comprimento_cm <= 0.0 || input.largura_cm <= 0.0 {
        return Err(ErroApi::invalido("Altura, comprimento e largura da caixa devem ser maiores que zero."));
    }
    let emp = input.empilhamento_max.unwrap_or(4);
    if emp <= 0 {
        return Err(ErroApi::invalido("Empilhamento máximo deve ser pelo menos 1."));
    }
    Ok((codigo, nome, emp))
}

pub async fn criar_caixa(
    pool: &PgPool,
    ctx: &AuthContext,
    input: CaixaInput,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let (codigo, nome, emp) = validar_caixa_input(&input)?;
    let insumo_erp = str_trim(input.insumo_erp_codigo.as_deref());
    let obs = str_trim(input.observacoes.as_deref());
    let ativo = input.ativo.unwrap_or(true);
    let id = slug_id("cx");

    let id_c = id.clone();
    let cod_c = codigo.clone();
    let nome_c = nome.clone();
    let r = executar_em_2_passos(pool, "criar_caixa_expedicao", confirmar, move |tx| {
        Box::pin(async move {
            let dup: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM expedicao_caixas WHERE codigo = $1)")
                .bind(&cod_c)
                .fetch_one(&mut **tx)
                .await?;
            if dup {
                return Err(ErroApi::conflito(format!("Já existe uma caixa com código '{cod_c}'.")));
            }
            sqlx::query(
                "INSERT INTO expedicao_caixas \
                 (id, codigo, nome, altura_cm, comprimento_cm, largura_cm, empilhamento_max, insumo_erp_codigo, ativo, observacoes) \
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
            )
            .bind(&id_c)
            .bind(&cod_c)
            .bind(&nome_c)
            .bind(input.altura_cm)
            .bind(input.comprimento_cm)
            .bind(input.largura_cm)
            .bind(emp)
            .bind(&insumo_erp)
            .bind(ativo)
            .bind(&obs)
            .execute(&mut **tx)
            .await?;
            Ok(json!({
                "id": id_c,
                "codigo": cod_c,
                "nome": nome_c,
                "alturaCm": input.altura_cm,
                "comprimentoCm": input.comprimento_cm,
                "larguraCm": input.largura_cm,
                "empilhamentoMax": emp,
                "insumoErpCodigo": insumo_erp,
            }))
        })
    })
    .await?;

    if confirmar {
        registrar_auditoria(
            pool,
            ctx,
            "criar_caixa_expedicao",
            "expedicao_caixa",
            &id,
            &format!("Caixa '{codigo}' cadastrada"),
            None,
            Some(r.resultado.clone()),
        )
        .await;
    }
    Ok(r)
}

pub async fn atualizar_caixa(
    pool: &PgPool,
    ctx: &AuthContext,
    id: &str,
    input: CaixaInput,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let (codigo, nome, emp) = validar_caixa_input(&input)?;
    let insumo_erp = str_trim(input.insumo_erp_codigo.as_deref());
    let obs = str_trim(input.observacoes.as_deref());
    let ativo = input.ativo.unwrap_or(true);
    let id_c = id.to_string();
    let cod_c = codigo.clone();
    let nome_c = nome.clone();

    let r = executar_em_2_passos(pool, "atualizar_caixa_expedicao", confirmar, move |tx| {
        Box::pin(async move {
            let antes: Option<Value> =
                sqlx::query_scalar("SELECT to_jsonb(c) FROM expedicao_caixas c WHERE c.id = $1 FOR UPDATE")
                    .bind(&id_c)
                    .fetch_optional(&mut **tx)
                    .await?
                    .flatten();
            let Some(antes) = antes else {
                return Err(ErroApi::nao_encontrado("Caixa não encontrada."));
            };
            let dup: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM expedicao_caixas WHERE codigo = $1 AND id <> $2)",
            )
            .bind(&cod_c)
            .bind(&id_c)
            .fetch_one(&mut **tx)
            .await?;
            if dup {
                return Err(ErroApi::conflito(format!("Já existe outra caixa com código '{cod_c}'.")));
            }
            sqlx::query(
                "UPDATE expedicao_caixas \
                 SET codigo = $2, nome = $3, altura_cm = $4, comprimento_cm = $5, largura_cm = $6, \
                     empilhamento_max = $7, insumo_erp_codigo = $8, ativo = $9, observacoes = $10, updated_at = NOW() \
                 WHERE id = $1",
            )
            .bind(&id_c)
            .bind(&cod_c)
            .bind(&nome_c)
            .bind(input.altura_cm)
            .bind(input.comprimento_cm)
            .bind(input.largura_cm)
            .bind(emp)
            .bind(&insumo_erp)
            .bind(ativo)
            .bind(&obs)
            .execute(&mut **tx)
            .await?;
            Ok(json!({
                "id": id_c,
                "antes": antes,
                "depois": {
                    "codigo": cod_c,
                    "nome": nome_c,
                    "alturaCm": input.altura_cm,
                    "comprimentoCm": input.comprimento_cm,
                    "larguraCm": input.largura_cm,
                    "empilhamentoMax": emp,
                    "insumoErpCodigo": insumo_erp,
                    "ativo": ativo,
                }
            }))
        })
    })
    .await?;

    if confirmar {
        registrar_auditoria(
            pool,
            ctx,
            "atualizar_caixa_expedicao",
            "expedicao_caixa",
            id,
            &format!("Caixa '{codigo}' atualizada"),
            Some(r.resultado["antes"].clone()),
            Some(r.resultado["depois"].clone()),
        )
        .await;
    }
    Ok(r)
}

pub async fn excluir_caixa(
    pool: &PgPool,
    ctx: &AuthContext,
    id: &str,
    motivo: Option<&str>,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    excluir_em_2_passos(
        pool,
        ctx,
        "excluir_caixa_expedicao",
        "expedicao_caixa",
        "a caixa",
        "Caixa de expedição excluída",
        id,
        "SELECT to_jsonb(c) FROM expedicao_caixas c WHERE c.id = $1 FOR UPDATE",
        "DELETE FROM expedicao_caixas WHERE id = $1",
        motivo,
        confirmar,
    )
    .await
}

// --- Vínculo Produto -> Caixa ---

pub async fn vincular_produto_caixa(
    pool: &PgPool,
    ctx: &AuthContext,
    produto_codigo: &str,
    input: ProdutoCaixaInput,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let cod = produto_codigo.trim().to_string();
    if cod.is_empty() {
        return Err(ErroApi::invalido("Informe o código do produto."));
    }
    if let Some(q) = input.qtde_cx_manual {
        if q <= 0 {
            return Err(ErroApi::invalido("Qtde/caixa manual deve ser maior que zero."));
        }
    }
    if let Some(c) = input.camadas_override {
        if c <= 0 {
            return Err(ErroApi::invalido("Camadas por pilha deve ser maior que zero."));
        }
    }

    let caixa_id = str_trim(input.caixa_id.as_deref());
    let obs = str_trim(input.observacoes.as_deref());
    let cod_c = cod.clone();
    let cx_c = caixa_id.clone();

    let r = executar_em_2_passos(pool, "vincular_caixa_produto_expedicao", confirmar, move |tx| {
        Box::pin(async move {
            let prod_desc: Option<String> =
                sqlx::query_scalar("SELECT descricao FROM produtos WHERE codigo = $1")
                    .bind(&cod_c)
                    .fetch_optional(&mut **tx)
                    .await?;
            let Some(prod_desc) = prod_desc else {
                return Err(ErroApi::nao_encontrado(format!("Produto '{cod_c}' não encontrado.")));
            };
            if let Some(ref cid) = cx_c {
                let cx_ok: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM expedicao_caixas WHERE id = $1)")
                    .bind(cid)
                    .fetch_one(&mut **tx)
                    .await?;
                if !cx_ok {
                    return Err(ErroApi::nao_encontrado("Caixa selecionada não encontrada."));
                }
            }
            let antes: Option<Value> = sqlx::query_scalar(
                "SELECT to_jsonb(epc) FROM expedicao_produto_caixa epc WHERE epc.produto_codigo = $1 FOR UPDATE",
            )
            .bind(&cod_c)
            .fetch_optional(&mut **tx)
            .await?
            .flatten();

            sqlx::query(
                "INSERT INTO expedicao_produto_caixa (produto_codigo, caixa_id, qtde_cx_manual, camadas_override, observacoes, updated_at) \
                 VALUES ($1, $2, $3, $4, $5, NOW()) \
                 ON CONFLICT (produto_codigo) DO UPDATE SET \
                    caixa_id = EXCLUDED.caixa_id, \
                    qtde_cx_manual = EXCLUDED.qtde_cx_manual, \
                    camadas_override = EXCLUDED.camadas_override, \
                    observacoes = EXCLUDED.observacoes, \
                    updated_at = NOW()",
            )
            .bind(&cod_c)
            .bind(&cx_c)
            .bind(input.qtde_cx_manual)
            .bind(input.camadas_override)
            .bind(&obs)
            .execute(&mut **tx)
            .await?;

            Ok(json!({
                "produtoCodigo": cod_c,
                "produtoDescricao": prod_desc,
                "antes": antes,
                "depois": {
                    "caixaId": cx_c,
                    "qtdeCxManual": input.qtde_cx_manual,
                    "camadasOverride": input.camadas_override,
                    "observacoes": obs,
                }
            }))
        })
    })
    .await?;

    if confirmar {
        registrar_auditoria(
            pool,
            ctx,
            "vincular_caixa_produto_expedicao",
            "expedicao_produto_caixa",
            &cod,
            &format!("Vínculo de caixa atualizado para {cod}"),
            r.resultado.get("antes").cloned(),
            Some(r.resultado["depois"].clone()),
        )
        .await;
    }
    Ok(r)
}

// --- Atacadistas ---

pub async fn criar_atacadista(
    pool: &PgPool,
    ctx: &AuthContext,
    input: AtacadistaInput,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let nome = str_trim(Some(&input.nome_exibicao))
        .ok_or_else(|| ErroApi::invalido("Informe o nome do cliente atacadista."))?;
    let termo = str_trim(Some(&input.termo_busca))
        .ok_or_else(|| ErroApi::invalido("Informe o termo de busca (como aparece no ERP)."))?
        .to_ascii_uppercase();
    let ativo = input.ativo.unwrap_or(true);
    let id = slug_id("atac");

    let id_c = id.clone();
    let nome_c = nome.clone();
    let termo_c = termo.clone();
    let r = executar_em_2_passos(pool, "criar_atacadista_expedicao", confirmar, move |tx| {
        Box::pin(async move {
            let dup: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM expedicao_atacadistas WHERE UPPER(termo_busca) = $1)",
            )
            .bind(&termo_c)
            .fetch_one(&mut **tx)
            .await?;
            if dup {
                return Err(ErroApi::conflito(format!("Já existe regra de atacadista com termo '{termo_c}'.")));
            }
            sqlx::query(
                "INSERT INTO expedicao_atacadistas (id, nome_exibicao, termo_busca, cliente_codigo, ativo) \
                 VALUES ($1,$2,$3,$4,$5)",
            )
            .bind(&id_c)
            .bind(&nome_c)
            .bind(&termo_c)
            .bind(input.cliente_codigo)
            .bind(ativo)
            .execute(&mut **tx)
            .await?;
            Ok(json!({
                "id": id_c,
                "nomeExibicao": nome_c,
                "termoBusca": termo_c,
                "clienteCodigo": input.cliente_codigo,
                "ativo": ativo,
            }))
        })
    })
    .await?;

    if confirmar {
        registrar_auditoria(
            pool,
            ctx,
            "criar_atacadista_expedicao",
            "expedicao_atacadista",
            &id,
            &format!("Atacadista '{nome}' cadastrado"),
            None,
            Some(r.resultado.clone()),
        )
        .await;
    }
    Ok(r)
}

pub async fn atualizar_atacadista(
    pool: &PgPool,
    ctx: &AuthContext,
    id: &str,
    input: AtacadistaInput,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let nome = str_trim(Some(&input.nome_exibicao))
        .ok_or_else(|| ErroApi::invalido("Informe o nome do cliente atacadista."))?;
    let termo = str_trim(Some(&input.termo_busca))
        .ok_or_else(|| ErroApi::invalido("Informe o termo de busca."))?
        .to_ascii_uppercase();
    let ativo = input.ativo.unwrap_or(true);
    let id_c = id.to_string();
    let nome_c = nome.clone();
    let termo_c = termo.clone();

    let r = executar_em_2_passos(pool, "atualizar_atacadista_expedicao", confirmar, move |tx| {
        Box::pin(async move {
            let antes: Option<Value> = sqlx::query_scalar(
                "SELECT to_jsonb(a) FROM expedicao_atacadistas a WHERE a.id = $1 FOR UPDATE",
            )
            .bind(&id_c)
            .fetch_optional(&mut **tx)
            .await?
            .flatten();
            let Some(antes) = antes else {
                return Err(ErroApi::nao_encontrado("Cliente atacadista não encontrado."));
            };
            sqlx::query(
                "UPDATE expedicao_atacadistas \
                 SET nome_exibicao = $2, termo_busca = $3, cliente_codigo = $4, ativo = $5 \
                 WHERE id = $1",
            )
            .bind(&id_c)
            .bind(&nome_c)
            .bind(&termo_c)
            .bind(input.cliente_codigo)
            .bind(ativo)
            .execute(&mut **tx)
            .await?;
            Ok(json!({
                "id": id_c,
                "antes": antes,
                "depois": {
                    "nomeExibicao": nome_c,
                    "termoBusca": termo_c,
                    "clienteCodigo": input.cliente_codigo,
                    "ativo": ativo,
                }
            }))
        })
    })
    .await?;

    if confirmar {
        registrar_auditoria(
            pool,
            ctx,
            "atualizar_atacadista_expedicao",
            "expedicao_atacadista",
            id,
            &format!("Atacadista '{nome}' atualizado"),
            Some(r.resultado["antes"].clone()),
            Some(r.resultado["depois"].clone()),
        )
        .await;
    }
    Ok(r)
}

pub async fn excluir_atacadista(
    pool: &PgPool,
    ctx: &AuthContext,
    id: &str,
    motivo: Option<&str>,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    excluir_em_2_passos(
        pool,
        ctx,
        "excluir_atacadista_expedicao",
        "expedicao_atacadista",
        "o cliente atacadista",
        "Regra de cliente atacadista excluída",
        id,
        "SELECT to_jsonb(a) FROM expedicao_atacadistas a WHERE a.id = $1 FOR UPDATE",
        "DELETE FROM expedicao_atacadistas WHERE id = $1",
        motivo,
        confirmar,
    )
    .await
}

// --- Alocações ---

pub async fn salvar_alocacao(
    pool: &PgPool,
    ctx: &AuthContext,
    input: AlocacaoUpsertInput,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let posicao_id = str_trim(Some(&input.posicao_id))
        .ok_or_else(|| ErroApi::invalido("Informe a posição."))?;
    let produto_codigo = str_trim(Some(&input.produto_codigo))
        .ok_or_else(|| ErroApi::invalido("Informe o produto."))?;
    if input.fileiras_largura < 1 || input.camadas_altura < 1 {
        return Err(ErroApi::invalido("Fileiras na largura e camadas devem ser pelo menos 1."));
    }
    let fixado = input.fixado.unwrap_or(true);
    let obs = str_trim(input.observacoes.as_deref());

    let pos_c = posicao_id.clone();
    let prod_c = produto_codigo.clone();
    let r = executar_em_2_passos(pool, "salvar_alocacao_expedicao", confirmar, move |tx| {
        Box::pin(async move {
            let pos_cod: Option<String> =
                sqlx::query_scalar("SELECT codigo FROM expedicao_posicoes WHERE id = $1")
                    .bind(&pos_c)
                    .fetch_optional(&mut **tx)
                    .await?;
            let Some(pos_cod) = pos_cod else {
                return Err(ErroApi::nao_encontrado("Posição não encontrada."));
            };
            let prod_desc: Option<String> =
                sqlx::query_scalar("SELECT descricao FROM produtos WHERE codigo = $1")
                    .bind(&prod_c)
                    .fetch_optional(&mut **tx)
                    .await?;
            let Some(prod_desc) = prod_desc else {
                return Err(ErroApi::nao_encontrado(format!("Produto '{prod_c}' não encontrado.")));
            };

            let antes: Option<Value> = sqlx::query_scalar(
                "SELECT to_jsonb(a) FROM expedicao_alocacoes a WHERE a.posicao_id = $1 AND a.produto_codigo = $2 FOR UPDATE",
            )
            .bind(&pos_c)
            .bind(&prod_c)
            .fetch_optional(&mut **tx)
            .await?
            .flatten();

            let aloc_id = antes
                .as_ref()
                .and_then(|v| v.get("id").and_then(|x| x.as_str()).map(str::to_string))
                .unwrap_or_else(|| slug_id("aloc"));

            sqlx::query(
                "INSERT INTO expedicao_alocacoes (id, posicao_id, produto_codigo, fileiras_largura, camadas_altura, fixado, observacoes, updated_at) \
                 VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) \
                 ON CONFLICT (posicao_id, produto_codigo) DO UPDATE SET \
                    fileiras_largura = EXCLUDED.fileiras_largura, \
                    camadas_altura = EXCLUDED.camadas_altura, \
                    fixado = EXCLUDED.fixado, \
                    observacoes = EXCLUDED.observacoes, \
                    updated_at = NOW()",
            )
            .bind(&aloc_id)
            .bind(&pos_c)
            .bind(&prod_c)
            .bind(input.fileiras_largura)
            .bind(input.camadas_altura)
            .bind(fixado)
            .bind(&obs)
            .execute(&mut **tx)
            .await?;

            Ok(json!({
                "id": aloc_id,
                "posicaoId": pos_c,
                "posicaoCodigo": pos_cod,
                "produtoCodigo": prod_c,
                "produtoDescricao": prod_desc,
                "antes": antes,
                "depois": {
                    "fileirasLargura": input.fileiras_largura,
                    "camadasAltura": input.camadas_altura,
                    "fixado": fixado,
                    "observacoes": obs,
                }
            }))
        })
    })
    .await?;

    if confirmar {
        let pos_cod = r.resultado["posicaoCodigo"].as_str().unwrap_or(&posicao_id);
        registrar_auditoria(
            pool,
            ctx,
            "salvar_alocacao_expedicao",
            "expedicao_alocacao",
            r.resultado["id"].as_str().unwrap_or(""),
            &format!("Alocação de {produto_codigo} em {pos_cod} salva"),
            r.resultado.get("antes").cloned(),
            Some(r.resultado["depois"].clone()),
        )
        .await;
    }
    Ok(r)
}

pub async fn excluir_alocacao(
    pool: &PgPool,
    ctx: &AuthContext,
    id: &str,
    motivo: Option<&str>,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    excluir_em_2_passos(
        pool,
        ctx,
        "excluir_alocacao_expedicao",
        "expedicao_alocacao",
        "a alocação",
        "Alocação removida da posição",
        id,
        "SELECT to_jsonb(a) FROM expedicao_alocacoes a WHERE a.id = $1 FOR UPDATE",
        "DELETE FROM expedicao_alocacoes WHERE id = $1",
        motivo,
        confirmar,
    )
    .await
}

// --- Sugestão Automática ---

async fn gravar_sugestao_tx(
    tx: &mut PgConnection,
    estrutura_id: &str,
    manter_fixados: bool,
    limpar_nao_fixados: bool,
    propostas: &[SugestaoProposta],
) -> Result<(), ErroApi> {
    if !manter_fixados {
        sqlx::query(
            "DELETE FROM expedicao_alocacoes a \
             USING expedicao_posicoes p \
             WHERE a.posicao_id = p.id AND p.estrutura_id = $1",
        )
        .bind(estrutura_id)
        .execute(&mut *tx)
        .await?;
    } else if limpar_nao_fixados {
        sqlx::query(
            "DELETE FROM expedicao_alocacoes a \
             USING expedicao_posicoes p \
             WHERE a.posicao_id = p.id AND p.estrutura_id = $1 AND a.fixado = FALSE",
        )
        .bind(estrutura_id)
        .execute(&mut *tx)
        .await?;
    }

    for prop in propostas {
        let id = slug_id("aloc");
        sqlx::query(
            "INSERT INTO expedicao_alocacoes (id, posicao_id, produto_codigo, fileiras_largura, camadas_altura, fixado, updated_at) \
             VALUES ($1,$2,$3,$4,$5,FALSE,NOW()) \
             ON CONFLICT (posicao_id, produto_codigo) DO UPDATE SET \
                fileiras_largura = EXCLUDED.fileiras_largura, \
                camadas_altura = EXCLUDED.camadas_altura, \
                updated_at = NOW()",
        )
        .bind(&id)
        .bind(&prop.posicao_id)
        .bind(&prop.produto_codigo)
        .bind(prop.fileiras_largura)
        .bind(prop.camadas_altura)
        .execute(&mut *tx)
        .await?;
    }
    Ok(())
}

pub async fn aplicar_sugestao(
    pool: &PgPool,
    ctx: &AuthContext,
    input: SugerirInput,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let painel = carregar_painel(
        pool,
        &PainelQuery {
            estrutura_id: input.estrutura_id.clone(),
            janela_meses: input.janela_meses,
            meta_meses: input.meta_meses,
            usar_meta_linha: input.usar_meta_linha,
            incluir_inativos: Some(false),
        },
    )
    .await?;

    if painel.estrutura_ativa_id.is_empty() {
        return Err(ErroApi::regra("Nenhuma estrutura cadastrada para sugerir alocação."));
    }

    let manter_fixados = input.manter_fixados.unwrap_or(true);
    let limpar_nao_fixados = input.limpar_nao_fixados.unwrap_or(true);
    let incluir_saindo = input.incluir_saindo_de_linha.unwrap_or(true);
    let filtro_linha = str_trim(input.linha_prefix.as_deref());

    let posicoes_raw: Vec<Posicao> = painel.posicoes.iter().map(|p| p.posicao.clone()).collect();
    let existentes: Vec<AlocacaoExistente> = painel
        .posicoes
        .iter()
        .flat_map(|p| p.itens.iter())
        .map(|i| AlocacaoExistente {
            id: i.id.clone(),
            posicao_id: i.posicao_id.clone(),
            produto_codigo: i.produto_codigo.clone(),
            fileiras_largura: i.fileiras_largura,
            camadas_altura: i.camadas_altura,
            fixado: i.fixado,
            largura_ocupada_cm: i.largura_ocupada_cm,
        })
        .collect();

    let candidatos: Vec<ProdutoDimensao> = painel
        .produtos
        .into_iter()
        .filter(|p| {
            if !incluir_saindo && p.situacao == "saindo_de_linha" {
                return false;
            }
            if let Some(ref lp) = filtro_linha {
                if lp != "ALL" && p.linha_prefix != *lp && p.linha_principal.as_deref() != Some(lp.as_str()) {
                    return false;
                }
            }
            true
        })
        .collect();

    let res_sug = sugerir_alocacao(
        &painel.estrutura_ativa_id,
        &posicoes_raw,
        &painel.caixas,
        &existentes,
        &candidatos,
        manter_fixados,
        limpar_nao_fixados,
    );

    let est_id = painel.estrutura_ativa_id.clone();
    let res_clone = res_sug.clone();
    let r = executar_em_2_passos(pool, "sugerir_alocacao_expedicao", confirmar, move |tx| {
        Box::pin(async move {
            gravar_sugestao_tx(
                &mut **tx,
                &est_id,
                manter_fixados,
                limpar_nao_fixados,
                &res_clone.propostas,
            )
            .await?;
            Ok(serde_json::to_value(&res_clone).map_err(|e| ErroApi::interno(e.to_string()))?)
        })
    })
    .await?;

    if confirmar {
        registrar_auditoria(
            pool,
            ctx,
            "sugerir_alocacao_expedicao",
            "expedicao_estrutura",
            &painel.estrutura_ativa_id,
            &format!(
                "Sugestão aplicada: {} alocações ({} produtos, {} posições)",
                res_sug.resumo.propostas_count,
                res_sug.resumo.produtos_alocados,
                res_sug.resumo.posicoes_usadas
            ),
            None,
            Some(serde_json::to_value(&res_sug.resumo).unwrap_or(Value::Null)),
        )
        .await;
    }

    Ok(r)
}

async fn carregar_mapa_caixas_produtos_tx(
    tx: &mut PgConnection,
    codigos: &[String],
) -> Result<HashMap<String, Caixa>, ErroApi> {
    if codigos.is_empty() {
        return Ok(HashMap::new());
    }
    let rows = sqlx::query(
        "SELECT id, codigo, nome, altura_cm, comprimento_cm, largura_cm, empilhamento_max, insumo_erp_codigo, ativo, observacoes \
         FROM expedicao_caixas WHERE ativo = TRUE",
    )
    .fetch_all(&mut *tx)
    .await?;

    let caixas: Vec<Caixa> = rows
        .into_iter()
        .map(|r| Caixa {
            id: r.get("id"),
            codigo: r.get("codigo"),
            nome: r.get("nome"),
            altura_cm: r.get("altura_cm"),
            comprimento_cm: r.get("comprimento_cm"),
            largura_cm: r.get("largura_cm"),
            empilhamento_max: r.get("empilhamento_max"),
            insumo_erp_codigo: r.get("insumo_erp_codigo"),
            ativo: r.get("ativo"),
            observacoes: r.get("observacoes"),
        })
        .collect();

    let mut caixa_por_id: HashMap<String, Caixa> = HashMap::new();
    let mut insumo_para_caixa: HashMap<String, Caixa> = HashMap::new();
    for cx in caixas {
        if let Some(ref raw) = cx.insumo_erp_codigo {
            for part in raw.split([',', ';']) {
                let k = part.trim().to_ascii_uppercase();
                if !k.is_empty() {
                    insumo_para_caixa.entry(k).or_insert_with(|| cx.clone());
                }
            }
        }
        caixa_por_id.insert(cx.id.clone(), cx);
    }

    let mut out: HashMap<String, Caixa> = HashMap::new();
    let manuais: Vec<(String, Option<String>)> = sqlx::query_as(
        "SELECT produto_codigo, caixa_id FROM expedicao_produto_caixa WHERE produto_codigo = ANY($1)",
    )
    .bind(codigos)
    .fetch_all(&mut *tx)
    .await?;
    for (prod_cod, cx_opt) in manuais {
        if let Some(cid) = cx_opt {
            if let Some(cx) = caixa_por_id.get(&cid) {
                out.insert(prod_cod, cx.clone());
            }
        }
    }

    let form_rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT product_code, TRIM(ingredient_code) FROM formulations WHERE product_code = ANY($1)",
    )
    .bind(codigos)
    .fetch_all(&mut *tx)
    .await?;
    for (prod_cod, ing_code) in form_rows {
        if out.contains_key(&prod_cod) {
            continue;
        }
        if let Some(cx) = insumo_para_caixa.get(&ing_code.to_ascii_uppercase()) {
            out.insert(prod_cod, cx.clone());
        }
    }
    Ok(out)
}

pub async fn mover_alocacao(
    pool: &PgPool,
    ctx: &AuthContext,
    input: MoverAlocacaoInput,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let aloc_id = str_trim(Some(&input.alocacao_id))
        .ok_or_else(|| ErroApi::invalido("Informe a alocação de origem."))?;
    let destino_id = str_trim(Some(&input.destino_posicao_id))
        .ok_or_else(|| ErroApi::invalido("Informe a posição de destino."))?;
    if let Some(f) = input.fileiras_largura {
        if f < 1 {
            return Err(ErroApi::invalido("Fileiras na largura devem ser pelo menos 1."));
        }
    }
    if let Some(c) = input.camadas_altura {
        if c < 1 {
            return Err(ErroApi::invalido("Camadas na altura devem ser pelo menos 1."));
        }
    }

    let aloc_c = aloc_id.clone();
    let dest_c = destino_id.clone();
    let copiar = input.copiar;
    let fil_opt = input.fileiras_largura;
    let cam_opt = input.camadas_altura;

    let r = executar_em_2_passos(pool, "mover_alocacao_expedicao", confirmar, move |tx| {
        Box::pin(async move {
            let orig = sqlx::query(
                "SELECT a.id, a.posicao_id, a.produto_codigo, a.fileiras_largura, a.camadas_altura, a.fixado, a.observacoes, \
                        p.codigo AS pos_codigo, prod.descricao AS prod_desc \
                 FROM expedicao_alocacoes a \
                 JOIN expedicao_posicoes p ON p.id = a.posicao_id \
                 JOIN produtos prod ON prod.codigo = a.produto_codigo \
                 WHERE a.id = $1 FOR UPDATE OF a",
            )
            .bind(&aloc_c)
            .fetch_optional(&mut **tx)
            .await?
            .ok_or_else(|| ErroApi::nao_encontrado("Alocação de origem não encontrada."))?;

            let orig_pos_id: String = orig.get("posicao_id");
            if orig_pos_id == dest_c {
                return Err(ErroApi::invalido("Origem e destino são a mesma posição."));
            }
            let orig_pos_cod: String = orig.get("pos_codigo");
            let prod_cod: String = orig.get("produto_codigo");
            let prod_desc: String = orig.get("prod_desc");
            let orig_fil: i32 = orig.get("fileiras_largura");
            let orig_cam: i32 = orig.get("camadas_altura");
            let orig_fixado: bool = orig.get("fixado");
            let orig_obs: Option<String> = orig.get("observacoes");

            let dest = sqlx::query(
                "SELECT id, codigo, altura_cm FROM expedicao_posicoes WHERE id = $1",
            )
            .bind(&dest_c)
            .fetch_optional(&mut **tx)
            .await?
            .ok_or_else(|| ErroApi::nao_encontrado("Posição de destino não encontrada."))?;
            let dest_cod: String = dest.get("codigo");
            let dest_altura: f64 = dest.get("altura_cm");

            let caixas_map =
                carregar_mapa_caixas_produtos_tx(&mut **tx, std::slice::from_ref(&prod_cod)).await?;
            let fileiras = fil_opt.unwrap_or(orig_fil).max(1);
            let camadas = calcular_camadas_compat_vao(
                dest_altura,
                caixas_map.get(&prod_cod),
                cam_opt,
                orig_cam,
            );

            let existente_dest: Option<(String, i32)> = sqlx::query_as(
                "SELECT id, fileiras_largura FROM expedicao_alocacoes \
                 WHERE posicao_id = $1 AND produto_codigo = $2 FOR UPDATE",
            )
            .bind(&dest_c)
            .bind(&prod_cod)
            .fetch_optional(&mut **tx)
            .await?;

            let dest_aloc_id = if let Some((id_ex, fil_ex)) = &existente_dest {
                let soma_fil = fil_ex + fileiras;
                sqlx::query(
                    "UPDATE expedicao_alocacoes SET fileiras_largura = $2, camadas_altura = $3, updated_at = NOW() WHERE id = $1",
                )
                .bind(id_ex)
                .bind(soma_fil)
                .bind(camadas)
                .execute(&mut **tx)
                .await?;
                id_ex.clone()
            } else {
                let novo_id = slug_id("aloc");
                sqlx::query(
                    "INSERT INTO expedicao_alocacoes \
                     (id, posicao_id, produto_codigo, fileiras_largura, camadas_altura, fixado, observacoes, updated_at) \
                     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())",
                )
                .bind(&novo_id)
                .bind(&dest_c)
                .bind(&prod_cod)
                .bind(fileiras)
                .bind(camadas)
                .bind(orig_fixado)
                .bind(&orig_obs)
                .execute(&mut **tx)
                .await?;
                novo_id
            };

            if !copiar {
                sqlx::query("DELETE FROM expedicao_alocacoes WHERE id = $1")
                    .bind(&aloc_c)
                    .execute(&mut **tx)
                    .await?;
            }

            Ok(json!({
                "id": dest_aloc_id,
                "alocacaoOrigemId": aloc_c,
                "origemPosicaoCodigo": orig_pos_cod,
                "destinoPosicaoId": dest_c,
                "destinoPosicaoCodigo": dest_cod,
                "produtoCodigo": prod_cod,
                "produtoDescricao": prod_desc,
                "copiar": copiar,
                "fileirasLargura": existente_dest.as_ref().map(|(_, f)| f + fileiras).unwrap_or(fileiras),
                "camadasAltura": camadas,
                "somadoNoDestino": existente_dest.is_some(),
            }))
        })
    })
    .await?;

    if confirmar {
        let acao_txt = if input.copiar { "copiado" } else { "movido" };
        let prod = r.resultado["produtoCodigo"].as_str().unwrap_or("");
        let orig_cod = r.resultado["origemPosicaoCodigo"].as_str().unwrap_or("");
        let dest_cod = r.resultado["destinoPosicaoCodigo"].as_str().unwrap_or("");
        registrar_auditoria(
            pool,
            ctx,
            "mover_alocacao_expedicao",
            "expedicao_alocacao",
            r.resultado["id"].as_str().unwrap_or(""),
            &format!("Produto {prod} {acao_txt} de {orig_cod} para {dest_cod}"),
            None,
            Some(r.resultado.clone()),
        )
        .await;
    }

    Ok(r)
}

pub async fn vincular_produtos_caixa_lote(
    pool: &PgPool,
    ctx: &AuthContext,
    input: ProdutoCaixaLoteInput,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let mut codigos: Vec<String> = Vec::new();
    let mut vistos: HashSet<String> = HashSet::new();
    for raw in &input.produto_codigos {
        let t = raw.trim().to_string();
        if !t.is_empty() && vistos.insert(t.clone()) {
            codigos.push(t);
        }
    }
    if codigos.is_empty() || codigos.len() > 500 {
        return Err(ErroApi::invalido("Selecione entre 1 e 500 produtos para editar em lote."));
    }
    if let Some(q) = input.qtde_cx_manual {
        if q <= 0 {
            return Err(ErroApi::invalido("Qtde/Cx manual deve ser maior que zero."));
        }
    }
    let caixa_id_trim = str_trim(input.caixa_id.as_deref());
    if caixa_id_trim.is_none()
        && !input.limpar_caixa
        && input.qtde_cx_manual.is_none()
        && !input.limpar_qtde_cx
    {
        return Err(ErroApi::invalido(
            "Informe uma caixa de embarque ou Qtde/Cx para aplicar em lote.",
        ));
    }

    let codigos_c = codigos.clone();
    let cx_c = caixa_id_trim.clone();
    let limpar_caixa = input.limpar_caixa;
    let qtde_opt = input.qtde_cx_manual;
    let limpar_qtde = input.limpar_qtde_cx;

    let r = executar_em_2_passos(
        pool,
        "vincular_produtos_caixa_lote_expedicao",
        confirmar,
        move |tx| {
            Box::pin(async move {
                if let Some(ref cid) = cx_c {
                    let ok: bool = sqlx::query_scalar(
                        "SELECT EXISTS(SELECT 1 FROM expedicao_caixas WHERE id = $1)",
                    )
                    .bind(cid)
                    .fetch_one(&mut **tx)
                    .await?;
                    if !ok {
                        return Err(ErroApi::nao_encontrado("Caixa selecionada não encontrada."));
                    }
                }

                let existentes: Vec<String> = sqlx::query_scalar(
                    "SELECT codigo FROM produtos WHERE codigo = ANY($1) ORDER BY codigo ASC",
                )
                .bind(&codigos_c)
                .fetch_all(&mut **tx)
                .await?;
                if existentes.is_empty() {
                    return Err(ErroApi::nao_encontrado(
                        "Nenhum dos produtos selecionados foi encontrado no catálogo.",
                    ));
                }

                let atuais_rows = sqlx::query(
                    "SELECT produto_codigo, caixa_id, qtde_cx_manual, camadas_override, observacoes \
                     FROM expedicao_produto_caixa WHERE produto_codigo = ANY($1) FOR UPDATE",
                )
                .bind(&existentes)
                .fetch_all(&mut **tx)
                .await?;
                let mut atuais: HashMap<String, (Option<String>, Option<i32>, Option<i32>, Option<String>)> =
                    HashMap::new();
                for row in atuais_rows {
                    atuais.insert(
                        row.get("produto_codigo"),
                        (
                            row.get("caixa_id"),
                            row.get("qtde_cx_manual"),
                            row.get("camadas_override"),
                            row.get("observacoes"),
                        ),
                    );
                }

                for cod in &existentes {
                    let prev = atuais.get(cod);
                    let prox_cx = if limpar_caixa {
                        None
                    } else if let Some(ref cid) = cx_c {
                        Some(cid.clone())
                    } else {
                        prev.and_then(|p| p.0.clone())
                    };
                    let prox_qtde = if limpar_qtde {
                        None
                    } else if qtde_opt.is_some() {
                        qtde_opt
                    } else {
                        prev.and_then(|p| p.1)
                    };
                    let prox_cam = prev.and_then(|p| p.2);
                    let prox_obs = prev.and_then(|p| p.3.clone());

                    sqlx::query(
                        "INSERT INTO expedicao_produto_caixa (produto_codigo, caixa_id, qtde_cx_manual, camadas_override, observacoes, updated_at) \
                         VALUES ($1,$2,$3,$4,$5,NOW()) \
                         ON CONFLICT (produto_codigo) DO UPDATE SET \
                            caixa_id = EXCLUDED.caixa_id, \
                            qtde_cx_manual = EXCLUDED.qtde_cx_manual, \
                            camadas_override = EXCLUDED.camadas_override, \
                            observacoes = EXCLUDED.observacoes, \
                            updated_at = NOW()",
                    )
                    .bind(cod)
                    .bind(&prox_cx)
                    .bind(prox_qtde)
                    .bind(prox_cam)
                    .bind(&prox_obs)
                    .execute(&mut **tx)
                    .await?;
                }

                Ok(json!({
                    "atualizadosCount": existentes.len(),
                    "ignoradosCount": codigos_c.len().saturating_sub(existentes.len()),
                    "caixaId": cx_c,
                    "qtdeCxManual": qtde_opt,
                    "limparCaixa": limpar_caixa,
                    "limparQtdeCx": limpar_qtde,
                }))
            })
        },
    )
    .await?;

    if confirmar {
        registrar_auditoria(
            pool,
            ctx,
            "vincular_produtos_caixa_lote_expedicao",
            "expedicao_produto_caixa",
            "lote",
            &format!(
                "Conferência em lote aplicada em {} produtos",
                r.resultado["atualizadosCount"].as_u64().unwrap_or(0)
            ),
            None,
            Some(r.resultado.clone()),
        )
        .await;
    }

    Ok(r)
}

pub async fn importar_mapa_lote(
    pool: &PgPool,
    ctx: &AuthContext,
    input: ImportarMapaLoteInput,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let estrutura_id = str_trim(Some(&input.estrutura_id))
        .ok_or_else(|| ErroApi::invalido("Informe a estrutura de destino."))?;
    if input.itens.is_empty() || input.itens.len() > 2000 {
        return Err(ErroApi::invalido("Envie entre 1 e 2000 itens para importar no mapa."));
    }

    let est_c = estrutura_id.clone();
    let substituir = input.substituir_estrutura;
    let itens_raw = input.itens;

    let r = executar_em_2_passos(pool, "importar_mapa_lote_expedicao", confirmar, move |tx| {
        Box::pin(async move {
            let est_ok: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM expedicao_estruturas WHERE id = $1)",
            )
            .bind(&est_c)
            .fetch_one(&mut **tx)
            .await?;
            if !est_ok {
                return Err(ErroApi::nao_encontrado("Estrutura de destino não encontrada."));
            }

            let pos_rows: Vec<(String, String, f64)> = sqlx::query_as(
                "SELECT id, codigo, altura_cm FROM expedicao_posicoes WHERE estrutura_id = $1",
            )
            .bind(&est_c)
            .fetch_all(&mut **tx)
            .await?;
            let pos_por_cod: HashMap<String, (String, f64)> = pos_rows
                .into_iter()
                .map(|(id, cod, alt)| (cod.trim().to_ascii_uppercase(), (id, alt)))
                .collect();

            let prod_cands: Vec<String> = itens_raw
                .iter()
                .map(|i| i.produto_codigo.trim().to_string())
                .filter(|c| !c.is_empty())
                .collect::<HashSet<_>>()
                .into_iter()
                .collect();
            let prods_existentes: HashSet<String> = sqlx::query_scalar::<_, String>(
                "SELECT codigo FROM produtos WHERE codigo = ANY($1)",
            )
            .bind(&prod_cands)
            .fetch_all(&mut **tx)
            .await?
            .into_iter()
            .collect();

            let mut ignorados_posicao = 0usize;
            let mut ignorados_produto = 0usize;
            let mut exemplos_ignorados: Vec<String> = Vec::new();

            struct ItemMesclado {
                posicao_id: String,
                altura_cm: f64,
                produto_codigo: String,
                fileiras_largura: i32,
                camadas_altura: Option<i32>,
                fixado: bool,
            }
            let mut mapa_itens: HashMap<(String, String), ItemMesclado> = HashMap::new();
            let mut prods_validos_set: HashSet<String> = HashSet::new();

            for it in &itens_raw {
                let p_cod = it.posicao_codigo.trim().to_ascii_uppercase();
                let prod_cod = it.produto_codigo.trim().to_string();
                let Some((pos_id, pos_alt)) = pos_por_cod.get(&p_cod) else {
                    ignorados_posicao += 1;
                    if exemplos_ignorados.len() < 15 {
                        exemplos_ignorados.push(format!("Posição '{p_cod}' não encontrada ({prod_cod})"));
                    }
                    continue;
                };
                if !prods_existentes.contains(&prod_cod) {
                    ignorados_produto += 1;
                    if exemplos_ignorados.len() < 15 {
                        exemplos_ignorados.push(format!("Produto '{prod_cod}' não existe no ERP ({p_cod})"));
                    }
                    continue;
                }
                let fil = it.fileiras_largura.max(1);
                prods_validos_set.insert(prod_cod.clone());
                let key = (pos_id.clone(), prod_cod.clone());
                mapa_itens
                    .entry(key)
                    .and_modify(|cur| {
                        cur.fileiras_largura += fil;
                        if it.camadas_altura.is_some() {
                            cur.camadas_altura = it.camadas_altura;
                        }
                        cur.fixado = cur.fixado || it.fixado;
                    })
                    .or_insert(ItemMesclado {
                        posicao_id: pos_id.clone(),
                        altura_cm: *pos_alt,
                        produto_codigo: prod_cod,
                        fileiras_largura: fil,
                        camadas_altura: it.camadas_altura,
                        fixado: it.fixado,
                    });
            }

            let removidos_atuais: i64 = if substituir {
                sqlx::query_scalar(
                    "SELECT COUNT(*) FROM expedicao_alocacoes a \
                     JOIN expedicao_posicoes p ON p.id = a.posicao_id WHERE p.estrutura_id = $1",
                )
                .bind(&est_c)
                .fetch_one(&mut **tx)
                .await?
            } else {
                0
            };

            if substituir && removidos_atuais > 0 {
                sqlx::query(
                    "DELETE FROM expedicao_alocacoes WHERE posicao_id IN \
                     (SELECT id FROM expedicao_posicoes WHERE estrutura_id = $1)",
                )
                .bind(&est_c)
                .execute(&mut **tx)
                .await?;
            }

            let validos_cods: Vec<String> = prods_validos_set.into_iter().collect();
            let caixas_map = carregar_mapa_caixas_produtos_tx(&mut **tx, &validos_cods).await?;

            let mut validos = 0usize;
            for item in mapa_itens.into_values() {
                let camadas = calcular_camadas_compat_vao(
                    item.altura_cm,
                    caixas_map.get(&item.produto_codigo),
                    item.camadas_altura,
                    3,
                );
                let aloc_id = slug_id("imp");
                sqlx::query(
                    "INSERT INTO expedicao_alocacoes \
                     (id, posicao_id, produto_codigo, fileiras_largura, camadas_altura, fixado, observacoes, updated_at) \
                     VALUES ($1,$2,$3,$4,$5,$6,'Importação planilha .xlsx',NOW()) \
                     ON CONFLICT (posicao_id, produto_codigo) DO UPDATE SET \
                        fileiras_largura = EXCLUDED.fileiras_largura, \
                        camadas_altura = EXCLUDED.camadas_altura, \
                        fixado = EXCLUDED.fixado, \
                        observacoes = EXCLUDED.observacoes, \
                        updated_at = NOW()",
                )
                .bind(&aloc_id)
                .bind(&item.posicao_id)
                .bind(&item.produto_codigo)
                .bind(item.fileiras_largura)
                .bind(camadas)
                .bind(item.fixado)
                .execute(&mut **tx)
                .await?;
                validos += 1;
            }

            Ok(json!({
                "estruturaId": est_c,
                "substituirEstrutura": substituir,
                "validos": validos,
                "ignoradosPosicao": ignorados_posicao,
                "ignoradosProduto": ignorados_produto,
                "removidosAtuais": removidos_atuais,
                "exemplosIgnorados": exemplos_ignorados,
            }))
        })
    })
    .await?;

    if confirmar {
        registrar_auditoria(
            pool,
            ctx,
            "importar_mapa_lote_expedicao",
            "expedicao_estrutura",
            &estrutura_id,
            &format!(
                "Importação de mapa aplicada: {} alocações gravadas",
                r.resultado["validos"].as_u64().unwrap_or(0)
            ),
            None,
            Some(r.resultado.clone()),
        )
        .await;
    }

    Ok(r)
}

pub fn resposta_json(r: RespostaAcao<Value>) -> Value {
    corpo_acao(&r)
}

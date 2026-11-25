use std::collections::{HashMap, HashSet};

use serde_json::{json, Value};
use sqlx::{PgConnection, PgPool, Row};

use crate::core::acao::{corpo_acao, executar_em_2_passos, exigir_motivo, ErroApi, RespostaAcao};
use crate::core::regras_produto::{
    atendimento_efetivo, carregar_pais_categorias, categoria_raiz, e_base, peso_unitario_kg,
    situacao_do_status_legado,
};
use crate::modules::geral::audit;
use crate::modules::geral::auth::models::AuthContext;

use super::calculo::{
    acesso_equipamento_por_cota, agrupar_insumos_caixa_nao_vinculados, aplicar_curva_abc, arred2,
    calcular_camadas_compat_vao, calcular_cotas_base_andares, calcular_geometria_alocacao,
    calcular_necessidades_caixas, calcular_peso_caixa_estimado_kg, calcular_unidades_op,
    classificar_espaco_op, classificar_empilhamento, definir_grupo_alocacao,
    e_cliente_atacadista, elegibilidade_abc_efetiva, prioridade_etapa_op,
    situacao_alocacao_produto, sugerir_alocacao, AlocacaoExistente, TARA_PALETE_PBR_KG,
};
use super::models::*;

fn normalizar_zona(raw: Option<&str>) -> String {
    match raw.map(str::trim).map(str::to_ascii_lowercase).as_deref() {
        Some("afastado") | Some("secundario") | Some("secundário") => "afastado".to_string(),
        _ => "nobre".to_string(),
    }
}

fn normalizar_linhas_permitidas(raw: Option<Vec<String>>) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for item in raw.unwrap_or_default() {
        let t = item.trim().to_string();
        if !t.is_empty() && seen.insert(t.clone()) {
            out.push(t);
        }
    }
    out
}

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

fn validar_tipo_ocupacao(raw: &str) -> Result<String, ErroApi> {
    let t = raw.trim().to_ascii_lowercase();
    match t.as_str() {
        "padrao" | "misto" | "reservado" => Ok(t),
        _ => Err(ErroApi::invalido(
            "Tipo do vão deve ser 'padrao', 'misto' ou 'reservado'.",
        )),
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
        "SELECT id, nome, descricao, galpao, zona, linhas_permitidas, \
                estrado_largura_cm, estrado_comprimento_cm, ordem, ativo \
         FROM expedicao_estruturas ORDER BY ordem ASC, nome ASC",
    )
    .fetch_all(pool)
    .await?;

    let pos_metric_rows = sqlx::query(
        "SELECT p.estrutura_id, p.largura_cm, \
                COALESCE(p.tipo_ocupacao, 'padrao') AS tipo_ocupacao, \
                p.ocupacao_manual_pct, \
                COALESCE(SUM(a.fileiras_largura::double precision * COALESCE(c.largura_cm, 0)), 0)::double precision AS larg_ocupada, \
                COUNT(a.id)::bigint AS itens_count \
         FROM expedicao_posicoes p \
         LEFT JOIN expedicao_alocacoes a ON a.posicao_id = p.id \
         LEFT JOIN expedicao_produto_caixa epc ON epc.produto_codigo = a.produto_codigo \
         LEFT JOIN expedicao_caixas c ON c.id = epc.caixa_id \
         WHERE p.ativo = TRUE \
         GROUP BY p.id, p.estrutura_id, p.largura_cm, p.tipo_ocupacao, p.ocupacao_manual_pct",
    )
    .fetch_all(pool)
    .await?;

    let mut stats: HashMap<String, (usize, usize, f64)> = HashMap::new();
    for mr in pos_metric_rows {
        let est_id: String = mr.get("estrutura_id");
        let larg_vao: f64 = mr.get("largura_cm");
        let tipo_ocupacao: String = mr.get("tipo_ocupacao");
        let ocupacao_manual_pct: Option<f64> = mr.get("ocupacao_manual_pct");
        let larg_ocupada: f64 = mr.get("larg_ocupada");
        let itens_count: i64 = mr.get("itens_count");
        let pct = if itens_count == 0 && tipo_ocupacao == "misto" {
            ocupacao_manual_pct.unwrap_or(50.0).clamp(0.0, 100.0)
        } else if itens_count == 0 && tipo_ocupacao == "reservado" {
            0.0
        } else if larg_vao > 0.0 {
            ((larg_ocupada / larg_vao) * 100.0).min(100.0)
        } else {
            0.0
        };
        let entry = stats.entry(est_id).or_insert((0, 0, 0.0));
        entry.0 += 1;
        if itens_count > 0 || tipo_ocupacao == "misto" || tipo_ocupacao == "reservado" {
            entry.1 += 1;
        }
        entry.2 += pct;
    }

    Ok(rows
        .into_iter()
        .map(|r| {
            let id: String = r.get("id");
            let (total_posicoes, posicoes_ocupadas, soma_pct) =
                stats.get(&id).copied().unwrap_or((0, 0, 0.0));
            let ocupacao_media_pct = if total_posicoes > 0 {
                soma_pct / (total_posicoes as f64)
            } else {
                0.0
            };
            Estrutura {
                id,
                nome: r.get("nome"),
                descricao: r.get("descricao"),
                galpao: r.get("galpao"),
                zona: r.get("zona"),
                linhas_permitidas: r.get::<Option<Vec<String>>, _>("linhas_permitidas").unwrap_or_default(),
                estrado_largura_cm: r.get("estrado_largura_cm"),
                estrado_comprimento_cm: r.get("estrado_comprimento_cm"),
                ordem: r.get("ordem"),
                ativo: r.get("ativo"),
                total_posicoes,
                posicoes_ocupadas,
                ocupacao_media_pct,
            }
        })
        .collect())
}

async fn carregar_posicoes(pool: &PgPool, estrutura_id: &str) -> Result<Vec<Posicao>, ErroApi> {
    let rows = sqlx::query(
        "SELECT id, estrutura_id, codigo, coluna, coluna_ordem, nivel, andar, lado, papel, \
                largura_cm, comprimento_cm, altura_cm, ativo, observacoes, \
                COALESCE(tipo_ocupacao, 'padrao') AS tipo_ocupacao, \
                ocupacao_manual_pct, etiqueta_livre, reserva_motivo, reserva_ate, \
                COALESCE(compartilhado_fracionado, FALSE) AS compartilhado_fracionado \
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
            tipo_ocupacao: r.get("tipo_ocupacao"),
            ocupacao_manual_pct: r.get("ocupacao_manual_pct"),
            etiqueta_livre: r.get("etiqueta_livre"),
            reserva_motivo: r.get("reserva_motivo"),
            reserva_ate: r.get("reserva_ate"),
            compartilhado_fracionado: r.get("compartilhado_fracionado"),
        })
        .collect())
}

async fn carregar_caixas(pool: &PgPool) -> Result<Vec<Caixa>, ErroApi> {
    let rows = sqlx::query(
        "SELECT id, codigo, nome, altura_cm, comprimento_cm, largura_cm, empilhamento_max, insumo_erp_codigo, pode_girar, peso_bruto_kg, ativo, observacoes \
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
            pode_girar: r.get("pode_girar"),
            peso_bruto_kg: r.get("peso_bruto_kg"),
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

#[derive(Debug, Clone)]
struct OpBrutaRow {
    lote_number: String,
    etapa: String,
    etapa_ordem: i32,
    produto_codigo: String,
    produto_descricao: String,
    quantidade_kg: f64,
    prog_envase_un: Option<f64>,
    envasado_parcial: f64,
    data_previsao: Option<String>,
    motivo_espera: Option<String>,
}

async fn carregar_ops_ativas_brutas(pool: &PgPool) -> Result<Vec<OpBrutaRow>, ErroApi> {
    let rows = sqlx::query(
        "SELECT lcs.lote_number, lcs.custom_status, sm.item_code, \
                COALESCE(NULLIF(TRIM(p.descricao), ''), sm.item_code) AS prod_desc, \
                COALESCE(sm.quantity, 0)::double precision AS quantidade_kg, \
                pe.pe_qty::double precision AS prog_envase_un, \
                COALESCE(lcs.quantidade_envasada_parcial, 0)::double precision AS envasado_parcial, \
                to_char(lcs.data_previsao AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') AS data_prev, \
                NULLIF(TRIM(lcs.motivo_espera), '') AS motivo_espera \
         FROM lote_custom_status lcs \
         JOIN stock_movements sm \
           ON sm.document_number = lcs.lote_number \
          AND sm.item_type = 'produto' \
          AND sm.movement_type = 'entrada' \
         LEFT JOIN produtos p ON p.codigo = sm.item_code \
         LEFT JOIN ( \
             SELECT lote_number, product_code, MAX(quantity) AS pe_qty \
             FROM programacao_envase \
             WHERE status_envase <> 'CONCLUIDO' \
             GROUP BY lote_number, product_code \
         ) pe ON pe.lote_number = lcs.lote_number AND pe.product_code = sm.item_code \
         WHERE lcs.custom_status IN ('Envase', 'Ordem Parcial', 'Rotulagem', 'Liberado para Envase', 'Produzido') \
           AND sm.quantity > 0",
    )
    .fetch_all(pool)
    .await?;

    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
        let etapa: String = r.get("custom_status");
        let etapa_ordem = prioridade_etapa_op(&etapa);
        out.push(OpBrutaRow {
            lote_number: r.get("lote_number"),
            etapa,
            etapa_ordem,
            produto_codigo: r.get("item_code"),
            produto_descricao: r.get("prod_desc"),
            quantidade_kg: r.get("quantidade_kg"),
            prog_envase_un: r.get("prog_envase_un"),
            envasado_parcial: r.get("envasado_parcial"),
            data_previsao: r.get("data_prev"),
            motivo_espera: r.get("motivo_espera"),
        });
    }
    Ok(out)
}

pub async fn carregar_painel(pool: &PgPool, q: &PainelQuery) -> Result<PainelAlocacaoResponse, ErroApi> {
    let janela_meses = q.janela_meses.unwrap_or(12).clamp(1, 36);
    let meta_meses = q.meta_meses.unwrap_or(2.0).clamp(0.25, 24.0);
    let usar_meta_linha = q.usar_meta_linha.unwrap_or(true);
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
    let ops_brutas = carregar_ops_ativas_brutas(pool).await?;
    let mut ops_por_prod: HashMap<String, Vec<&OpBrutaRow>> = HashMap::new();
    for op in &ops_brutas {
        ops_por_prod.entry(op.produto_codigo.clone()).or_default().push(op);
    }

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

    // Kits existentes e mapa de nomes das linhas principais
    let kits_vec: Vec<String> = sqlx::query_scalar("SELECT DISTINCT kit_codigo FROM kit_composicao")
        .fetch_all(pool)
        .await?;
    let kits_set: HashSet<String> = kits_vec.into_iter().collect();

    let linhas_rows: Vec<(String, String)> =
        sqlx::query_as("SELECT linha_prefix, nome_linha FROM config_linhas")
            .fetch_all(pool)
            .await?;
    let nome_por_prefix: HashMap<String, String> = linhas_rows.into_iter().collect();

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

    // Composição de kits (kit_composicao): fonte automática complementar para kits sem caixa na fórmula e peso automático
    let kit_rows = sqlx::query(
        "SELECT kc.kit_codigo, TRIM(kc.componente_codigo) AS ing_code, \
                COALESCE(kc.quantidade, 1.0)::double precision AS comp_qtd, \
                p_comp.descricao AS comp_desc, \
                COALESCE(NULLIF(TRIM(i.description), ''), NULLIF(TRIM(f_desc.description), ''), TRIM(kc.componente_codigo)) AS ing_desc \
         FROM kit_composicao kc \
         LEFT JOIN produtos p_comp ON p_comp.codigo = kc.componente_codigo \
         LEFT JOIN items i ON i.code = kc.componente_codigo \
         LEFT JOIN LATERAL (SELECT description FROM formulations WHERE ingredient_code = kc.componente_codigo LIMIT 1) f_desc ON TRUE",
    )
    .fetch_all(pool)
    .await?;

    let mut caixa_por_kit_comp: HashMap<String, String> = HashMap::new();
    let mut peso_kit_map: HashMap<String, f64> = HashMap::new();
    for r in kit_rows {
        let k_code: String = r.get("kit_codigo");
        let ing_code: String = r.get("ing_code");
        let ing_desc: String = r.get("ing_desc");
        let comp_qtd: f64 = r.get::<Option<f64>, _>("comp_qtd").unwrap_or(1.0).max(0.0);
        let comp_desc: Option<String> = r.get("comp_desc");
        if let Some(ref desc) = comp_desc {
            if let Some(p_comp) = peso_unitario_kg(desc, false) {
                *peso_kit_map.entry(k_code.clone()).or_insert(0.0) += p_comp * comp_qtd;
            }
        }
        let ing_up = ing_code.to_ascii_uppercase();
        let desc_up = ing_desc.to_ascii_uppercase();

        if let Some(cid) = insumo_para_caixa.get(&ing_up) {
            caixa_por_kit_comp.entry(k_code.clone()).or_insert_with(|| cid.clone());
            insumo_caixa_por_prod
                .entry(k_code)
                .or_insert((ing_code, ing_desc));
        } else if ing_up.starts_with("9.04.") || desc_up.contains("CAIXA") || desc_up.starts_with("CX ") {
            insumo_caixa_por_prod
                .entry(k_code.clone())
                .or_insert_with(|| (ing_code.clone(), ing_desc.clone()));
            if !caixa_por_formula.contains_key(&k_code) && !caixa_por_kit_comp.contains_key(&k_code) {
                insumos_nao_vinculados.push((ing_code, ing_desc, k_code));
            }
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
                epc.camadas_override, \
                epc.incluir_abc \
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
        peso_caixa_estimado_kg: Option<f64>,
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
        let incluir_abc_override: Option<bool> = r.get("incluir_abc");

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
        } else if let Some(cid) = caixa_por_kit_comp.get(&codigo) {
            (Some(cid.clone()), "kit_composicao".to_string())
        } else {
            (None, "ausente".to_string())
        };

        let vendas_varejo = vendas_varejo_map.get(&codigo).copied().unwrap_or(0.0);
        let vendas_atacado = vendas_atacado_map.get(&codigo).copied().unwrap_or(0.0);
        let vendas_total = vendas_varejo + vendas_atacado;
        let media_varejo = vendas_varejo / janela_f;
        let media_atacado = vendas_atacado / janela_f;
        let media_total = vendas_total / janela_f;

        let cx_ref = caixa_id_eff.as_ref().and_then(|id| caixa_por_id.get(id)).copied();
        let eh_kit = kits_set.contains(&codigo);
        let peso_unitario = peso_unitario_kg(&descricao, false).or_else(|| {
            if eh_kit {
                peso_kit_map
                    .get(&codigo)
                    .copied()
                    .filter(|&v| v > 0.0)
                    .map(arred2)
            } else {
                None
            }
        });
        let peso_caixa_est = calcular_peso_caixa_estimado_kg(
            cx_ref.and_then(|c| c.peso_bruto_kg),
            peso_unitario,
            qtde_cx_efetiva,
        );
        let classe_emp =
            classificar_empilhamento(peso_caixa_est, cx_ref.map(|c| c.empilhamento_max), eh_kit)
                .to_string();

        fallback_map.insert(
            codigo.clone(),
            ProdMetaFallback {
                descricao: descricao.clone(),
                linha_prefix: linha_prefix.clone(),
                nome_linha: nome_linha.clone(),
                qtde_cx: qtde_cx_efetiva,
                caixa_id: caixa_id_eff.clone(),
                media_total,
                peso_caixa_estimado_kg: peso_caixa_est,
            },
        );

        if eh_base {
            continue;
        }
        let inativo = prod_visivel == Some(0) || linha_visivel == 0 || situacao == "descontinuado";
        if !incluir_inativos && inativo {
            continue;
        }
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

        let (incluir_abc_efetivo, motivo_fora_abc) =
            elegibilidade_abc_efetiva(incluir_abc_override, &descricao, vendas_total, &situacao);

        let eh_coloracao = cat_raiz == "cat_coloracao";
        let nome_principal = linha_principal
            .as_deref()
            .and_then(|lp| nome_por_prefix.get(lp))
            .map(String::as_str)
            .unwrap_or(&nome_linha);
        let (grupo_alocacao, grupo_alocacao_nome) = definir_grupo_alocacao(
            eh_coloracao,
            eh_kit,
            &linha_prefix,
            linha_principal.as_deref(),
            nome_principal,
        );

        let (op_pendente_unidades, op_pendente_caixas, op_pendente_lotes, op_proxima_etapa) =
            if let Some(lista_ops) = ops_por_prod.get(&codigo) {
                let mut soma_un = 0i32;
                let mut melhor_ordem = i32::MAX;
                let mut melhor_etapa: Option<String> = None;
                for op in lista_ops {
                    let un = calcular_unidades_op(
                        op.quantidade_kg,
                        op.prog_envase_un,
                        peso_unitario,
                        op.envasado_parcial,
                    );
                    soma_un += un;
                    if op.etapa_ordem < melhor_ordem {
                        melhor_ordem = op.etapa_ordem;
                        melhor_etapa = Some(op.etapa.clone());
                    }
                }
                let cx = qtde_cx_efetiva
                    .filter(|&q| q > 0 && soma_un > 0)
                    .map(|q| ((soma_un as f64) / (q as f64)).ceil() as i32)
                    .unwrap_or(0);
                (soma_un, cx, lista_ops.len(), melhor_etapa)
            } else {
                (0, 0, 0, None)
            };

        produtos.push(ProdutoDimensao {
            codigo: codigo.clone(),
            descricao,
            codigo_barras,
            linha_prefix,
            nome_linha,
            linha_principal,
            situacao,
            incluir_abc_override,
            incluir_abc_efetivo,
            motivo_fora_abc,
            atendimento,
            eh_kit,
            eh_coloracao,
            grupo_alocacao,
            grupo_alocacao_nome,
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
            peso_unitario_kg: peso_unitario,
            peso_caixa_estimado_kg: peso_caixa_est,
            classe_empilhamento: classe_emp,
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
            op_pendente_unidades,
            op_pendente_caixas,
            op_pendente_lotes,
            op_proxima_etapa,
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

        let peso_estimado_kg = fb
            .peso_caixa_estimado_kg
            .map(|p| arred2(p * (geom.total_caixas as f64)));

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
            peso_estimado_kg,
        };
        itens_por_pos.entry(posicao_id).or_default().push(view.clone());
        itens_por_prod.entry(produto_codigo).or_default().push(view);
    }

    let cotas_base = calcular_cotas_base_andares(&posicoes);
    let mut posicoes_com_itens: Vec<PosicaoComItens> = Vec::with_capacity(posicoes.len());
    let mut posicoes_ocupadas = 0usize;
    let mut soma_pct = 0.0;
    let mut ativas_count = 0usize;

    for pos in posicoes {
        let itens = itens_por_pos.remove(&pos.id).unwrap_or_default();
        let larg_itens_cm: f64 = itens.iter().map(|i| i.largura_ocupada_cm).sum();
        let (largura_ocupada_cm, ocupacao_pct, tem_estouro) =
            if itens.is_empty() && pos.tipo_ocupacao == "misto" {
                let pct = pos.ocupacao_manual_pct.unwrap_or(50.0).clamp(0.0, 100.0);
                let larg = arred2(pos.largura_cm * (pct / 100.0));
                (larg, pct, false)
            } else if itens.is_empty() && pos.tipo_ocupacao == "reservado" {
                (0.0, 0.0, false)
            } else {
                let pct = if pos.largura_cm > 0.0 {
                    (larg_itens_cm / pos.largura_cm) * 100.0
                } else {
                    0.0
                };
                let estouro_larg =
                    !pos.compartilhado_fracionado && larg_itens_cm > pos.largura_cm + 1e-6;
                let estouro_alt = itens.iter().any(|i| i.estouro_altura);
                (larg_itens_cm, pct, estouro_larg || estouro_alt)
            };
        let largura_livre_cm = (pos.largura_cm - largura_ocupada_cm).max(0.0);
        let total_caixas: i32 = itens.iter().map(|i| i.total_caixas).sum();
        let total_unidades: i32 = itens.iter().map(|i| i.total_unidades).sum();
        let cota_base_cm = cotas_base.get(&pos.andar).copied().unwrap_or(0.0);
        let acesso_equipamento = acesso_equipamento_por_cota(cota_base_cm).to_string();
        let peso_carga_kg = arred2(itens.iter().filter_map(|i| i.peso_estimado_kg).sum());
        let peso_total_com_palete_kg = if !itens.is_empty() && peso_carga_kg > 0.0 {
            arred2(peso_carga_kg + TARA_PALETE_PBR_KG)
        } else {
            0.0
        };
        if pos.ativo {
            ativas_count += 1;
            if !itens.is_empty()
                || pos.tipo_ocupacao == "misto"
                || pos.tipo_ocupacao == "reservado"
            {
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
            peso_carga_kg,
            peso_total_com_palete_kg,
            cota_base_cm,
            acesso_equipamento,
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

    let mut ops_com_alerta_espaco = 0usize;
    let prod_por_cod_resumo: HashMap<&str, &ProdutoDimensao> =
        produtos.iter().map(|p| (p.codigo.as_str(), p)).collect();
    for op in &ops_brutas {
        if let Some(p) = prod_por_cod_resumo.get(op.produto_codigo.as_str()) {
            let un = calcular_unidades_op(
                op.quantidade_kg,
                op.prog_envase_un,
                p.peso_unitario_kg,
                op.envasado_parcial,
            );
            let op_cx = p
                .qtde_cx_efetiva
                .filter(|&q| q > 0 && un > 0)
                .map(|q| ((un as f64) / (q as f64)).ceil() as i32)
                .unwrap_or(0);
            let (sit, _) = classificar_espaco_op(
                p.qtde_cx_efetiva,
                p.estoque_caixas,
                op_cx,
                p.total_caixas_alocadas,
                !p.alocacoes.is_empty(),
            );
            if sit != "ok" {
                ops_com_alerta_espaco += 1;
            }
        }
    }

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
        ops_chegando_count: ops_brutas.len(),
        ops_com_alerta_espaco,
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

pub async fn listar_ops_chegando(
    pool: &PgPool,
    q: &OpsChegandoQuery,
) -> Result<OpsChegandoResponse, ErroApi> {
    let painel = carregar_painel(
        pool,
        &PainelQuery {
            estrutura_id: q.estrutura_id.clone(),
            janela_meses: Some(12),
            meta_meses: Some(2.0),
            usar_meta_linha: Some(true),
            incluir_inativos: Some(false),
        },
    )
    .await?;
    let ops_brutas = carregar_ops_ativas_brutas(pool).await?;
    let prod_map: HashMap<&str, &ProdutoDimensao> = painel
        .produtos
        .iter()
        .map(|p| (p.codigo.as_str(), p))
        .collect();

    let etapa_filtro = str_trim(q.etapa.as_deref()).map(|s| s.to_ascii_lowercase());
    let apenas_alertas = q.apenas_alertas.unwrap_or(false);

    let mut itens: Vec<OpChegandoItem> = Vec::new();
    let mut em_envase_rotulagem = 0usize;
    let mut liberado_envase = 0usize;
    let mut produzido = 0usize;
    let mut sem_endereco = 0usize;
    let mut falta_espaco = 0usize;
    let mut total_caixas_chegando = 0i32;

    for op in ops_brutas {
        let prod = prod_map.get(op.produto_codigo.as_str()).copied();
        let peso_unit = prod
            .and_then(|p| p.peso_unitario_kg)
            .or_else(|| peso_unitario_kg(&op.produto_descricao, false));
        let un = calcular_unidades_op(
            op.quantidade_kg,
            op.prog_envase_un,
            peso_unit,
            op.envasado_parcial,
        );
        let qtde_cx = prod.and_then(|p| p.qtde_cx_efetiva);
        let caixas_chegando = qtde_cx
            .filter(|&c| c > 0 && un > 0)
            .map(|c| ((un as f64) / (c as f64)).ceil() as i32)
            .unwrap_or(0);
        let estoque_caixas = prod.and_then(|p| p.estoque_caixas);
        let cap_alocada = prod.map(|p| p.total_caixas_alocadas).unwrap_or(0);
        let tem_end = prod.is_some_and(|p| !p.alocacoes.is_empty());

        let (situacao_espaco, deficit_caixas) =
            classificar_espaco_op(qtde_cx, estoque_caixas, caixas_chegando, cap_alocada, tem_end);

        match op.etapa_ordem {
            1 => em_envase_rotulagem += 1,
            2 => liberado_envase += 1,
            3 => produzido += 1,
            _ => {}
        }
        if situacao_espaco == "sem_endereco" {
            sem_endereco += 1;
        } else if situacao_espaco == "falta_espaco" {
            falta_espaco += 1;
        }
        total_caixas_chegando += caixas_chegando;

        if let Some(ref ef) = etapa_filtro {
            if op.etapa.to_ascii_lowercase() != *ef {
                continue;
            }
        }
        if apenas_alertas && situacao_espaco == "ok" {
            continue;
        }

        itens.push(OpChegandoItem {
            lote_number: op.lote_number,
            etapa: op.etapa,
            etapa_ordem: op.etapa_ordem,
            produto_codigo: op.produto_codigo,
            produto_descricao: prod
                .map(|p| p.descricao.clone())
                .unwrap_or(op.produto_descricao),
            grupo_alocacao: prod
                .map(|p| p.grupo_alocacao.clone())
                .unwrap_or_default(),
            grupo_alocacao_nome: prod
                .map(|p| p.grupo_alocacao_nome.clone())
                .unwrap_or_default(),
            quantidade_kg: op.quantidade_kg,
            unidades_estimadas: un,
            caixas_chegando,
            qtde_cx_efetiva: qtde_cx,
            estoque_caixas,
            capacidade_alocada_caixas: cap_alocada,
            deficit_caixas,
            situacao_espaco,
            enderecos_picking: prod.map(|p| p.enderecos_picking.clone()).unwrap_or_default(),
            enderecos_pulmao: prod.map(|p| p.enderecos_pulmao.clone()).unwrap_or_default(),
            data_previsao: op.data_previsao,
            motivo_espera: op.motivo_espera,
        });
    }

    itens.sort_by(|a, b| {
        a.etapa_ordem
            .cmp(&b.etapa_ordem)
            .then_with(|| b.deficit_caixas.cmp(&a.deficit_caixas))
            .then_with(|| b.caixas_chegando.cmp(&a.caixas_chegando))
            .then_with(|| a.lote_number.cmp(&b.lote_number))
    });

    Ok(OpsChegandoResponse {
        estrutura_ativa_id: painel.estrutura_ativa_id,
        resumo: OpsChegandoResumo {
            total_ops: em_envase_rotulagem + liberado_envase + produzido,
            em_envase_rotulagem,
            liberado_envase,
            produzido,
            sem_endereco,
            falta_espaco,
            total_caixas_chegando,
        },
        itens,
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
    let zona = normalizar_zona(input.zona.as_deref());
    let galpao = str_trim(input.galpao.as_deref()).unwrap_or_else(|| {
        if zona == "afastado" {
            "Galpão 2 (Área Secundária)".to_string()
        } else {
            "Galpão 1 (Área Nobre)".to_string()
        }
    });
    let linhas_permitidas = normalizar_linhas_permitidas(input.linhas_permitidas);
    let ordem = input.ordem.unwrap_or(10);
    let ativo = input.ativo.unwrap_or(true);
    let id = slug_id("est");

    let id_c = id.clone();
    let nome_c = nome.clone();
    let desc_c = desc.clone();
    let galpao_c = galpao.clone();
    let zona_c = zona.clone();
    let linhas_c = linhas_permitidas.clone();
    let r = executar_em_2_passos(pool, "criar_estrutura_expedicao", confirmar, move |tx| {
        Box::pin(async move {
            sqlx::query(
                "INSERT INTO expedicao_estruturas \
                 (id, nome, descricao, galpao, zona, linhas_permitidas, estrado_largura_cm, estrado_comprimento_cm, ordem, ativo) \
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
            )
            .bind(&id_c)
            .bind(&nome_c)
            .bind(&desc_c)
            .bind(&galpao_c)
            .bind(&zona_c)
            .bind(&linhas_c)
            .bind(largura)
            .bind(comp)
            .bind(ordem)
            .bind(ativo)
            .execute(&mut **tx)
            .await?;
            Ok(json!({
                "id": id_c,
                "nome": nome_c,
                "galpao": galpao_c,
                "zona": zona_c,
                "linhasPermitidas": linhas_c,
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
    let zona = normalizar_zona(input.zona.as_deref());
    let galpao = str_trim(input.galpao.as_deref()).unwrap_or_else(|| {
        if zona == "afastado" {
            "Galpão 2 (Área Secundária)".to_string()
        } else {
            "Galpão 1 (Área Nobre)".to_string()
        }
    });
    let linhas_permitidas = normalizar_linhas_permitidas(input.linhas_permitidas);
    let ordem = input.ordem.unwrap_or(1);
    let ativo = input.ativo.unwrap_or(true);
    let id_c = id.to_string();
    let nome_c = nome.clone();
    let galpao_c = galpao.clone();
    let zona_c = zona.clone();
    let linhas_c = linhas_permitidas.clone();

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
                 SET nome = $2, descricao = $3, galpao = $4, zona = $5, linhas_permitidas = $6, \
                     estrado_largura_cm = $7, estrado_comprimento_cm = $8, ordem = $9, ativo = $10, updated_at = NOW() \
                 WHERE id = $1",
            )
            .bind(&id_c)
            .bind(&nome_c)
            .bind(&desc)
            .bind(&galpao_c)
            .bind(&zona_c)
            .bind(&linhas_c)
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
                    "galpao": galpao_c,
                    "zona": zona_c,
                    "linhasPermitidas": linhas_c,
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
        return Err(ErroApi::invalido("Informe pelo menos 1 coluna e 1 andar."));
    }
    for a in &input.andares {
        if a.andar <= 0 || a.altura_cm <= 0.0 {
            return Err(ErroApi::invalido("Andar e altura (cm) devem ser positivos."));
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
    let tipo_opt = match input.tipo_ocupacao.as_deref() {
        Some(t) => Some(validar_tipo_ocupacao(t)?),
        None => None,
    };
    if let Some(pct) = input.ocupacao_manual_pct {
        if !pct.is_finite() || !(0.0..=100.0).contains(&pct) {
            return Err(ErroApi::invalido("Ocupação estimada deve estar entre 0% e 100%."));
        }
    }

    let id_c = id.to_string();
    let r = executar_em_2_passos(pool, "atualizar_posicao_expedicao", confirmar, move |tx| {
        Box::pin(async move {
            let row = sqlx::query(
                "SELECT id, estrutura_id, codigo, andar, papel, largura_cm, comprimento_cm, altura_cm, ativo, observacoes, \
                        COALESCE(tipo_ocupacao, 'padrao') AS tipo_ocupacao, \
                        ocupacao_manual_pct, etiqueta_livre, reserva_motivo, reserva_ate, \
                        COALESCE(compartilhado_fracionado, FALSE) AS compartilhado_fracionado \
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
            let antes_tipo: String = row.get("tipo_ocupacao");
            let antes_ocup_pct: Option<f64> = row.get("ocupacao_manual_pct");
            let antes_etiqueta: Option<String> = row.get("etiqueta_livre");
            let antes_res_motivo: Option<String> = row.get("reserva_motivo");
            let antes_res_ate: Option<String> = row.get("reserva_ate");
            let antes_compart: bool = row.get("compartilhado_fracionado");

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
            let novo_tipo = tipo_opt.unwrap_or_else(|| antes_tipo.clone());
            let nova_ocup_pct = if input.ocupacao_manual_pct.is_some() {
                input.ocupacao_manual_pct
            } else if novo_tipo == "misto" {
                antes_ocup_pct.or(Some(50.0))
            } else {
                antes_ocup_pct
            };
            let nova_etiqueta = if input.etiqueta_livre.is_some() {
                str_trim(input.etiqueta_livre.as_deref())
            } else {
                antes_etiqueta.clone()
            };
            let novo_res_motivo = if input.reserva_motivo.is_some() {
                str_trim(input.reserva_motivo.as_deref())
            } else {
                antes_res_motivo.clone()
            };
            let novo_res_ate = if input.reserva_ate.is_some() {
                str_trim(input.reserva_ate.as_deref())
            } else {
                antes_res_ate.clone()
            };
            let novo_compart = input.compartilhado_fracionado.unwrap_or(antes_compart);

            let afetadas = if input.aplicar_ao_andar.unwrap_or(false) {
                sqlx::query(
                    "UPDATE expedicao_posicoes \
                     SET altura_cm = $3, largura_cm = $4, comprimento_cm = $5, papel = $6, compartilhado_fracionado = $7 \
                     WHERE estrutura_id = $1 AND andar = $2",
                )
                .bind(&estrutura_id)
                .bind(andar)
                .bind(nova_altura)
                .bind(nova_largura)
                .bind(novo_comp)
                .bind(&novo_papel)
                .bind(novo_compart)
                .execute(&mut **tx)
                .await?
                .rows_affected()
            } else {
                sqlx::query(
                    "UPDATE expedicao_posicoes \
                     SET altura_cm = $2, largura_cm = $3, comprimento_cm = $4, papel = $5, ativo = $6, observacoes = $7, \
                         tipo_ocupacao = $8, ocupacao_manual_pct = $9, etiqueta_livre = $10, \
                         reserva_motivo = $11, reserva_ate = $12, compartilhado_fracionado = $13 \
                     WHERE id = $1",
                )
                .bind(&id_c)
                .bind(nova_altura)
                .bind(nova_largura)
                .bind(novo_comp)
                .bind(&novo_papel)
                .bind(novo_ativo)
                .bind(&nova_obs)
                .bind(&novo_tipo)
                .bind(nova_ocup_pct)
                .bind(&nova_etiqueta)
                .bind(&novo_res_motivo)
                .bind(&novo_res_ate)
                .bind(novo_compart)
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
                "antes": {
                    "alturaCm": antes_altura,
                    "larguraCm": antes_largura,
                    "comprimentoCm": antes_comp,
                    "papel": antes_papel,
                    "ativo": antes_ativo,
                    "tipoOcupacao": antes_tipo,
                    "ocupacaoManualPct": antes_ocup_pct,
                    "etiquetaLivre": antes_etiqueta,
                    "reservaMotivo": antes_res_motivo,
                    "reservaAte": antes_res_ate,
                    "compartilhadoFracionado": antes_compart
                },
                "depois": {
                    "alturaCm": nova_altura,
                    "larguraCm": nova_largura,
                    "comprimentoCm": novo_comp,
                    "papel": novo_papel,
                    "ativo": novo_ativo,
                    "tipoOcupacao": novo_tipo,
                    "ocupacaoManualPct": nova_ocup_pct,
                    "etiquetaLivre": nova_etiqueta,
                    "reservaMotivo": novo_res_motivo,
                    "reservaAte": novo_res_ate,
                    "compartilhadoFracionado": novo_compart
                }
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

fn validar_caixa_input(input: &CaixaInput) -> Result<(String, String, i32, bool, Option<f64>), ErroApi> {
    let codigo = str_trim(Some(&input.codigo)).ok_or_else(|| ErroApi::invalido("Informe o código da caixa."))?;
    let nome = str_trim(Some(&input.nome)).ok_or_else(|| ErroApi::invalido("Informe o nome da caixa."))?;
    if input.altura_cm <= 0.0 || input.comprimento_cm <= 0.0 || input.largura_cm <= 0.0 {
        return Err(ErroApi::invalido("Altura, comprimento e largura da caixa devem ser maiores que zero."));
    }
    let emp = input.empilhamento_max.unwrap_or(4);
    if emp <= 0 {
        return Err(ErroApi::invalido("Empilhamento máximo deve ser pelo menos 1."));
    }
    let pode_girar = input.pode_girar.unwrap_or(true);
    let peso_bruto = input.peso_bruto_kg.filter(|p| p.is_finite());
    if let Some(p) = peso_bruto {
        if p <= 0.0 {
            return Err(ErroApi::invalido("Peso bruto (kg) deve ser maior que zero quando informado."));
        }
    }
    Ok((codigo, nome, emp, pode_girar, peso_bruto))
}

pub async fn criar_caixa(
    pool: &PgPool,
    ctx: &AuthContext,
    input: CaixaInput,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let (codigo, nome, emp, pode_girar, peso_bruto) = validar_caixa_input(&input)?;
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
                 (id, codigo, nome, altura_cm, comprimento_cm, largura_cm, empilhamento_max, insumo_erp_codigo, pode_girar, peso_bruto_kg, ativo, observacoes) \
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
            )
            .bind(&id_c)
            .bind(&cod_c)
            .bind(&nome_c)
            .bind(input.altura_cm)
            .bind(input.comprimento_cm)
            .bind(input.largura_cm)
            .bind(emp)
            .bind(&insumo_erp)
            .bind(pode_girar)
            .bind(peso_bruto)
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
                "podeGirar": pode_girar,
                "pesoBrutoKg": peso_bruto,
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
    let (codigo, nome, emp, pode_girar, peso_bruto) = validar_caixa_input(&input)?;
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
                     empilhamento_max = $7, insumo_erp_codigo = $8, pode_girar = $9, peso_bruto_kg = $10, \
                     ativo = $11, observacoes = $12, updated_at = NOW() \
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
            .bind(pode_girar)
            .bind(peso_bruto)
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
                    "podeGirar": pode_girar,
                    "pesoBrutoKg": peso_bruto,
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
             WHERE a.posicao_id = p.id AND p.estrutura_id = $1 AND COALESCE(p.tipo_ocupacao, 'padrao') = 'padrao'",
        )
        .bind(estrutura_id)
        .execute(&mut *tx)
        .await?;
    } else if limpar_nao_fixados {
        sqlx::query(
            "DELETE FROM expedicao_alocacoes a \
             USING expedicao_posicoes p \
             WHERE a.posicao_id = p.id AND p.estrutura_id = $1 AND a.fixado = FALSE AND COALESCE(p.tipo_ocupacao, 'padrao') = 'padrao'",
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
    let considerar_ops_chegando = input.considerar_ops_chegando.unwrap_or(true);
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
                if lp != "ALL" {
                    if lp == "coloracao" {
                        if !p.eh_coloracao {
                            return false;
                        }
                    } else if lp.starts_with("kits:") {
                        if p.grupo_alocacao != *lp {
                            return false;
                        }
                    } else if lp == "kits" {
                        if !p.eh_kit {
                            return false;
                        }
                    } else if p.eh_coloracao
                        || (p.linha_prefix != *lp && p.linha_principal.as_deref() != Some(lp.as_str()))
                    {
                        return false;
                    }
                }
            }
            true
        })
        .collect();

    let linhas_permitidas: Vec<String> = painel
        .estruturas
        .iter()
        .find(|e| e.id == painel.estrutura_ativa_id)
        .map(|e| e.linhas_permitidas.clone())
        .unwrap_or_default();

    let res_sug = sugerir_alocacao(
        &painel.estrutura_ativa_id,
        &posicoes_raw,
        &painel.caixas,
        &existentes,
        &candidatos,
        &linhas_permitidas,
        manter_fixados,
        limpar_nao_fixados,
        considerar_ops_chegando,
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
        "SELECT id, codigo, nome, altura_cm, comprimento_cm, largura_cm, empilhamento_max, insumo_erp_codigo, pode_girar, peso_bruto_kg, ativo, observacoes \
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
            pode_girar: r.get("pode_girar"),
            peso_bruto_kg: r.get("peso_bruto_kg"),
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

    let kit_rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT kit_codigo, TRIM(componente_codigo) FROM kit_composicao WHERE kit_codigo = ANY($1)",
    )
    .bind(codigos)
    .fetch_all(&mut *tx)
    .await?;
    for (kit_cod, comp_code) in kit_rows {
        if out.contains_key(&kit_cod) {
            continue;
        }
        if let Some(cx) = insumo_para_caixa.get(&comp_code.to_ascii_uppercase()) {
            out.insert(kit_cod, cx.clone());
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

pub async fn atualizar_elegibilidade_abc_lote(
    pool: &PgPool,
    ctx: &AuthContext,
    input: AbcElegibilidadeLoteInput,
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
        return Err(ErroApi::invalido(
            "Selecione entre 1 e 500 produtos para alterar a elegibilidade da Curva ABC.",
        ));
    }

    let codigos_c = codigos.clone();
    let incluir_opt = input.incluir_abc;
    let r = executar_em_2_passos(pool, "atualizar_abc_lote_expedicao", confirmar, move |tx| {
        Box::pin(async move {
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

            for cod in &existentes {
                sqlx::query(
                    "INSERT INTO expedicao_produto_caixa (produto_codigo, incluir_abc, updated_at) \
                     VALUES ($1, $2, NOW()) \
                     ON CONFLICT (produto_codigo) DO UPDATE SET \
                        incluir_abc = EXCLUDED.incluir_abc, \
                        updated_at = NOW()",
                )
                .bind(cod)
                .bind(incluir_opt)
                .execute(&mut **tx)
                .await?;
            }

            Ok(json!({
                "atualizadosCount": existentes.len(),
                "ignoradosCount": codigos_c.len().saturating_sub(existentes.len()),
                "incluirAbc": incluir_opt,
            }))
        })
    })
    .await?;

    if confirmar {
        let desc = match input.incluir_abc {
            Some(true) => "incluídos na Curva ABC",
            Some(false) => "retirados da Curva ABC",
            None => "restaurados para regra automática da Curva ABC",
        };
        registrar_auditoria(
            pool,
            ctx,
            "atualizar_abc_lote_expedicao",
            "expedicao_produto_caixa",
            "abc_lote",
            &format!(
                "{} produtos {desc}",
                r.resultado["atualizadosCount"].as_u64().unwrap_or(0)
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

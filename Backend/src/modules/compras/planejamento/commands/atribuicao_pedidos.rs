//! Como os itens das listas de compra casam com os pedidos do ERP.
//!
//! Regras (um lugar só, usado pelo Acompanhamento e pelos selos das tabelas de Compras):
//! - só vale pedido com data >= dia da lista (o dia da lista conta);
//! - cada item de pedido do ERP vai para listas diferentes só por sobra: ele é atribuído à lista
//!   mais antiga ainda não atendida que pediu o insumo (FIFO por insumo); o que passar da
//!   quantidade pedida na lista vai para a próxima lista;
//! - o número do pedido mostrado é o `n_registro` do ERP.

use std::collections::HashMap;

use sqlx::{PgPool, Row};

use crate::modules::compras::planejamento::models::ErpPedidoAtribuido;

const FOLGA: f64 = 1e-9;

/// Item de uma lista de compra, para um insumo.
#[derive(Clone, Debug)]
pub struct ListaDoInsumo {
    pub item_id: String,
    /// Dia da lista (AAAA-MM-DD ou mais longo; só os 10 primeiros caracteres contam).
    pub data: String,
    pub qtd: f64,
}

/// Item de pedido do ERP, para um insumo.
#[derive(Clone, Debug)]
pub struct PedidoDoInsumo {
    pub id: i64,
    pub numero: i32,
    pub data: String,
    pub fornecedor: Option<String>,
    pub qtd: f64,
    pub chegou: f64,
    pub previsao: Option<String>,
    pub aberto: bool,
}

/// Parte do pedido `pedido` (índice em `pedidos`) que coube ao item de lista `item_id`.
#[derive(Clone, Debug, PartialEq)]
pub struct Atribuicao {
    pub item_id: String,
    pub pedido: usize,
    pub qtd: f64,
}

fn dia(s: &str) -> &str {
    s.get(..10).unwrap_or(s)
}

/// Função pura: distribui os pedidos de UM insumo entre as listas que o pediram.
pub fn atribuir(listas: &[ListaDoInsumo], pedidos: &[PedidoDoInsumo]) -> Vec<Atribuicao> {
    let mut ordem_listas: Vec<usize> = (0..listas.len()).collect();
    ordem_listas.sort_by(|&a, &b| {
        (dia(&listas[a].data), &listas[a].item_id).cmp(&(dia(&listas[b].data), &listas[b].item_id))
    });
    let mut falta: Vec<f64> = listas.iter().map(|l| l.qtd.max(FOLGA)).collect();

    let mut ordem_pedidos: Vec<usize> = (0..pedidos.len()).collect();
    ordem_pedidos.sort_by(|&a, &b| {
        (dia(&pedidos[a].data), pedidos[a].numero, pedidos[a].id)
            .cmp(&(dia(&pedidos[b].data), pedidos[b].numero, pedidos[b].id))
    });

    let mut saida = Vec::new();
    for p in ordem_pedidos {
        let ped = &pedidos[p];
        if ped.data.len() < 10 || ped.qtd <= 0.0 {
            continue;
        }
        let mut resta = ped.qtd;
        for &l in &ordem_listas {
            if resta <= FOLGA {
                break;
            }
            if falta[l] <= FOLGA || dia(&listas[l].data) > dia(&ped.data) {
                continue;
            }
            let t = resta.min(falta[l]);
            falta[l] -= t;
            resta -= t;
            saida.push(Atribuicao { item_id: listas[l].item_id.clone(), pedido: p, qtd: t });
        }
    }
    saida
}

/// `entregue` quando o que chegou cobre o pedido da lista (ou todos os pedidos atribuídos
/// chegaram por inteiro); `pedido_gerado` caso contrário.
pub fn situacao_do_item(qtd_pedida: f64, pedidos: &[ErpPedidoAtribuido]) -> &'static str {
    if pedidos.is_empty() {
        return "solicitado";
    }
    let chegou: f64 = pedidos
        .iter()
        .map(|p| if p.qtd > 0.0 { p.chegou * (p.qtd_atribuida / p.qtd).min(1.0) } else { 0.0 })
        .sum();
    let todos_chegaram = pedidos.iter().all(|p| p.qtd > 0.0 && p.chegou >= p.qtd);
    if chegou >= qtd_pedida || todos_chegaram {
        "entregue"
    } else {
        "pedido_gerado"
    }
}

fn codigo_limpo(c: &str) -> String {
    c.replace('.', "").trim().to_string()
}

/// Carrega todas as listas (menos canceladas) e os pedidos do ERP dos insumos delas e devolve,
/// por id de item de lista, os pedidos atribuídos (mais antigo primeiro).
pub async fn carregar(pool: &PgPool) -> Result<HashMap<String, Vec<ErpPedidoAtribuido>>, String> {
    let itens = sqlx::query(
        "SELECT i.id, i.item_code, i.quantity_requested, b.created_at::text AS criado
         FROM purchase_request_items i
         JOIN purchase_request_batches b ON i.batch_id = b.id
         WHERE b.status <> 'cancelado'",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao buscar itens das listas: {e}"))?;

    let mut listas: HashMap<String, Vec<ListaDoInsumo>> = HashMap::new();
    for r in itens {
        let cod = codigo_limpo(&r.get::<String, _>("item_code"));
        listas.entry(cod).or_default().push(ListaDoInsumo {
            item_id: r.get("id"),
            data: r.get("criado"),
            qtd: r.try_get::<f64, _>("quantity_requested").unwrap_or(0.0),
        });
    }
    if listas.is_empty() {
        return Ok(HashMap::new());
    }
    let codigos: Vec<String> = listas.keys().cloned().collect();

    // Nº do pedido no ERP = n_registro (n_pedido é só a sequência do dia).
    let linhas = sqlx::query(
        "SELECT poi.id, TRIM(REPLACE(poi.c_referencia, '.', '')) AS cod, po.n_registro, po.d_pedido,
                po.c_nome_f, COALESCE(poi.n_qtde, 0) AS qtde, COALESCE(poi.n_chegou, 0) AS chegou,
                po.d_previsao, TRIM(COALESCE(po.c_status, '')) AS status
         FROM purchase_order_items poi
         JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
         WHERE TRIM(REPLACE(poi.c_referencia, '.', '')) = ANY($1)
           AND TRIM(COALESCE(po.c_status, '')) <> 'C'",
    )
    .bind(&codigos)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao buscar pedidos do ERP: {e}"))?;

    let mut pedidos: HashMap<String, Vec<PedidoDoInsumo>> = HashMap::new();
    for r in linhas {
        let qtd: f64 = r.get("qtde");
        let chegou: f64 = r.get("chegou");
        let status: String = r.get("status");
        pedidos.entry(r.get::<String, _>("cod")).or_default().push(PedidoDoInsumo {
            id: r.get::<i32, _>("id") as i64,
            numero: r.get("n_registro"),
            data: r.try_get::<Option<String>, _>("d_pedido").ok().flatten().unwrap_or_default(),
            fornecedor: r.try_get("c_nome_f").ok().flatten(),
            qtd,
            chegou,
            previsao: r.try_get("d_previsao").ok().flatten(),
            aberto: status != "T" && qtd > chegou,
        });
    }

    let mut saida: HashMap<String, Vec<ErpPedidoAtribuido>> = HashMap::new();
    for (cod, ls) in &listas {
        let Some(ps) = pedidos.get(cod) else { continue };
        let mut atribs = atribuir(ls, ps);
        // Ordem de exibição: pedido mais antigo primeiro.
        atribs.sort_by(|a, b| {
            let (pa, pb) = (&ps[a.pedido], &ps[b.pedido]);
            (dia(&pa.data), pa.numero, pa.id).cmp(&(dia(&pb.data), pb.numero, pb.id))
        });
        for a in atribs {
            let p = &ps[a.pedido];
            saida.entry(a.item_id).or_default().push(ErpPedidoAtribuido {
                numero: p.numero,
                data: if p.data.is_empty() { None } else { Some(p.data.clone()) },
                fornecedor: p.fornecedor.clone(),
                qtd: p.qtd,
                qtd_atribuida: a.qtd,
                chegou: p.chegou,
                previsao: p.previsao.clone(),
                aberto: p.aberto,
            });
        }
    }
    Ok(saida)
}

#[cfg(test)]
mod testes {
    use super::*;

    fn lista(id: &str, data: &str, qtd: f64) -> ListaDoInsumo {
        ListaDoInsumo { item_id: id.into(), data: data.into(), qtd }
    }
    fn pedido(id: i64, numero: i32, data: &str, qtd: f64) -> PedidoDoInsumo {
        PedidoDoInsumo { id, numero, data: data.into(), fornecedor: None, qtd, chegou: 0.0, previsao: None, aberto: true }
    }

    #[test]
    fn duas_listas_do_mesmo_insumo_cada_uma_com_seu_pedido() {
        let ls = vec![lista("A", "2026-10-01 08:00", 100.0), lista("B", "2026-10-10 09:00", 50.0)];
        let ps = vec![pedido(1, 900, "2026-10-12", 100.0), pedido(2, 901, "2026-10-15", 50.0)];
        let r = atribuir(&ls, &ps);
        assert_eq!(r, vec![
            Atribuicao { item_id: "A".into(), pedido: 0, qtd: 100.0 },
            Atribuicao { item_id: "B".into(), pedido: 1, qtd: 50.0 },
        ]);
    }

    #[test]
    fn pedido_anterior_a_lista_nao_conta() {
        let ls = vec![lista("A", "2026-10-10", 100.0)];
        let ps = vec![pedido(1, 900, "2026-10-09", 100.0), pedido(2, 901, "2026-10-10", 100.0)];
        let r = atribuir(&ls, &ps);
        assert_eq!(r, vec![Atribuicao { item_id: "A".into(), pedido: 1, qtd: 100.0 }], "o dia da lista conta; o dia anterior não");
    }

    #[test]
    fn um_pedido_para_duas_listas_a_sobra_vai_para_a_proxima() {
        let ls = vec![lista("A", "2026-10-01", 60.0), lista("B", "2026-10-05", 60.0)];
        let ps = vec![pedido(1, 900, "2026-10-20", 100.0)];
        let r = atribuir(&ls, &ps);
        assert_eq!(r.len(), 2);
        assert_eq!((r[0].item_id.as_str(), r[0].qtd), ("A", 60.0));
        assert_eq!((r[1].item_id.as_str(), r[1].qtd), ("B", 40.0));
    }

    #[test]
    fn lista_posterior_ao_pedido_nao_recebe() {
        let ls = vec![lista("A", "2026-10-01", 10.0), lista("B", "2026-10-30", 10.0)];
        let ps = vec![pedido(1, 900, "2026-10-20", 100.0)];
        let r = atribuir(&ls, &ps);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].item_id, "A");
    }

    #[test]
    fn situacao_do_item_por_chegada() {
        let p = |qtd, atrib, chegou| ErpPedidoAtribuido {
            numero: 1, data: None, fornecedor: None, qtd, qtd_atribuida: atrib, chegou, previsao: None, aberto: true,
        };
        assert_eq!(situacao_do_item(10.0, &[]), "solicitado");
        assert_eq!(situacao_do_item(10.0, &[p(10.0, 10.0, 0.0)]), "pedido_gerado");
        assert_eq!(situacao_do_item(10.0, &[p(10.0, 10.0, 10.0)]), "entregue");
        assert_eq!(situacao_do_item(100.0, &[p(100.0, 60.0, 50.0)]), "pedido_gerado");
    }
}

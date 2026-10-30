//! "Pedido atendível": quanto do estoque atual cobre cada pedido de venda em aberto.
//!
//! O estoque é dividido entre os pedidos do mais antigo ao mais novo (data, depois número):
//! o pedido antigo pega primeiro. Fonte única da tela de Pedidos (aba "Prontos p/ faturar",
//! coluna "Atende") e do detalhe do pedido.

use std::collections::HashMap;

use sqlx::PgPool;

pub const COMPLETO: &str = "completo";
pub const PARCIAL: &str = "parcial";
pub const SEM_ESTOQUE: &str = "sem_estoque";

/// Pedido em aberto com os residuais por item (`n_qtde - n_qtde_fat`, só > 0).
#[derive(Debug, Clone)]
pub struct PedidoParaAtender {
    pub n_pedido: i32,
    pub d_pedido: String,
    pub itens: Vec<(String, f64)>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Atendimento {
    /// `completo`, `parcial` ou `sem_estoque`.
    pub situacao: &'static str,
    /// Quanto do estoque fica para o pedido, por código de produto (soma se o código repete).
    pub itens: HashMap<String, f64>,
}

/// Divide o estoque entre os pedidos (mais antigo primeiro). Pedido sem residual fica fora do resultado.
pub fn atender_pedidos(
    pedidos: &[PedidoParaAtender],
    estoque: &HashMap<String, f64>,
) -> HashMap<(i32, String), Atendimento> {
    let mut disponivel: HashMap<String, f64> = HashMap::new();
    for (codigo, qtd) in estoque {
        *disponivel.entry(codigo.trim().to_string()).or_insert(0.0) += qtd.max(0.0);
    }

    let mut ordem: Vec<&PedidoParaAtender> = pedidos.iter().collect();
    ordem.sort_by(|a, b| (&a.d_pedido, a.n_pedido).cmp(&(&b.d_pedido, b.n_pedido)));

    let mut out = HashMap::new();
    for pedido in ordem {
        let mut itens: HashMap<String, f64> = HashMap::new();
        let mut total_residual = 0.0;
        let mut total_alocado = 0.0;
        for (codigo, residual) in &pedido.itens {
            if *residual <= 0.0 {
                continue;
            }
            let codigo = codigo.trim().to_string();
            let saldo = disponivel.entry(codigo.clone()).or_insert(0.0);
            let alocado = residual.min(*saldo);
            *saldo -= alocado;
            total_residual += residual;
            total_alocado += alocado;
            *itens.entry(codigo).or_insert(0.0) += alocado;
        }
        if total_residual <= 0.0 {
            continue;
        }
        let situacao = if total_alocado >= total_residual {
            COMPLETO
        } else if total_alocado <= 0.0 {
            SEM_ESTOQUE
        } else {
            PARCIAL
        };
        out.insert((pedido.n_pedido, pedido.d_pedido.clone()), Atendimento { situacao, itens });
    }
    out
}

/// Calcula o atendimento dos pedidos abertos dentro da janela de faltas (`days`; 0 = sem limite),
/// contra o saldo de `estoque_atual` (ERP). Mesmo critério de pedido aberto e de janela da Demanda de Produção.
pub async fn calcular_atendimento(
    pool: &PgPool,
    days: i32,
) -> Result<HashMap<(i32, String), Atendimento>, sqlx::Error> {
    let date_filter = crate::core::sales_open::days_filter_sql(days);
    let open_st = crate::core::sales_open::OPEN_STATUS_SQL;
    let sql = format!(
        "SELECT soi.n_pedido, soi.d_pedido, soi.c_cod_prod, (soi.n_qtde - soi.n_qtde_fat)::float8
         FROM sales_order_items soi
         JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
         WHERE {open_st} AND soi.n_qtde > soi.n_qtde_fat
         {date_filter}"
    );
    let mut por_pedido: HashMap<(i32, String), Vec<(String, f64)>> = HashMap::new();
    for row in sqlx::query(&sql).fetch_all(pool).await? {
        let n_pedido = crate::core::pg_row::pg_i32(&row, 0);
        let d_pedido: String = sqlx::Row::get(&row, 1);
        let codigo: String = sqlx::Row::get(&row, 2);
        let residual = crate::core::pg_row::pg_f64(&row, 3);
        por_pedido.entry((n_pedido, d_pedido)).or_default().push((codigo, residual));
    }
    let pedidos: Vec<PedidoParaAtender> = por_pedido
        .into_iter()
        .map(|((n_pedido, d_pedido), itens)| PedidoParaAtender { n_pedido, d_pedido, itens })
        .collect();

    let mut estoque: HashMap<String, f64> = HashMap::new();
    for row in sqlx::query("SELECT codigo, estoque FROM estoque_atual").fetch_all(pool).await? {
        let codigo: String = sqlx::Row::get(&row, 0);
        estoque.insert(codigo, crate::core::pg_row::pg_f64(&row, 1));
    }
    Ok(atender_pedidos(&pedidos, &estoque))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ped(n: i32, d: &str, itens: &[(&str, f64)]) -> PedidoParaAtender {
        PedidoParaAtender {
            n_pedido: n,
            d_pedido: d.to_string(),
            itens: itens.iter().map(|(c, q)| (c.to_string(), *q)).collect(),
        }
    }

    fn est(v: &[(&str, f64)]) -> HashMap<String, f64> {
        v.iter().map(|(c, q)| (c.to_string(), *q)).collect()
    }

    #[test]
    fn pedido_antigo_leva_o_estoque() {
        let pedidos = [ped(2, "2026-10-02", &[("A", 10.0)]), ped(1, "2026-10-01", &[("A", 10.0)])];
        let r = atender_pedidos(&pedidos, &est(&[("A", 10.0)]));
        assert_eq!(r[&(1, "2026-10-01".into())].situacao, COMPLETO);
        assert_eq!(r[&(2, "2026-10-02".into())].situacao, SEM_ESTOQUE);
    }

    #[test]
    fn parcial_aloca_o_que_tem() {
        let pedidos = [ped(1, "2026-10-01", &[("A", 10.0), ("B", 5.0)])];
        let r = atender_pedidos(&pedidos, &est(&[("A", 4.0), ("B", 5.0)]));
        let a = &r[&(1, "2026-10-01".into())];
        assert_eq!(a.situacao, PARCIAL);
        assert_eq!(a.itens["A"], 4.0);
        assert_eq!(a.itens["B"], 5.0);
    }

    #[test]
    fn sem_estoque_e_estoque_negativo() {
        let pedidos = [ped(1, "2026-10-01", &[("A", 3.0)]), ped(2, "2026-10-01", &[("Z", 1.0)])];
        let r = atender_pedidos(&pedidos, &est(&[("A", -5.0)]));
        assert_eq!(r[&(1, "2026-10-01".into())].situacao, SEM_ESTOQUE);
        assert_eq!(r[&(2, "2026-10-01".into())].situacao, SEM_ESTOQUE);
    }

    #[test]
    fn codigo_repetido_no_mesmo_pedido_soma() {
        let pedidos = [ped(1, "2026-10-01", &[("A", 4.0), ("A ", 4.0)])];
        let r = atender_pedidos(&pedidos, &est(&[("A", 6.0)]));
        let a = &r[&(1, "2026-10-01".into())];
        assert_eq!(a.situacao, PARCIAL);
        assert_eq!(a.itens["A"], 6.0);
    }

    #[test]
    fn mesma_data_desempata_pelo_numero_e_sem_residual_fica_fora() {
        let pedidos = [
            ped(5, "2026-10-01", &[("A", 2.0)]),
            ped(4, "2026-10-01", &[("A", 2.0)]),
            ped(6, "2026-10-01", &[("A", 0.0)]),
        ];
        let r = atender_pedidos(&pedidos, &est(&[("A", 2.0)]));
        assert_eq!(r[&(4, "2026-10-01".into())].situacao, COMPLETO);
        assert_eq!(r[&(5, "2026-10-01".into())].situacao, SEM_ESTOQUE);
        assert!(!r.contains_key(&(6, "2026-10-01".into())));
    }
}

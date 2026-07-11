-- Passo L: Pedidos de compra (itens)
-- Destino: purchase_order_items

SELECT 
    p1.nRegistro as nPedidoRegistro,
    c2.nPedido,
    c2.cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    CAST(c2.nQtde AS FLOAT) as nQtde,
    CAST(c2.nPreco AS FLOAT) as nPreco,
    CAST(c2.nChegou AS FLOAT) as nChegou,
    c2.cDescricao COLLATE Latin1_General_CI_AS as cDescricao,
    c2.cUnidade COLLATE Latin1_General_CI_AS as cUnidade,
    CAST(c2.VALOR_TOTAL AS FLOAT) as VALOR_TOTAL,
    c2.nRegistro,
    c2.cChegada COLLATE Latin1_General_CI_AS as cChegada
FROM PedidoCpa2 c2 WITH (NOLOCK)
INNER JOIN PedidoCpa1 p1 WITH (NOLOCK) ON p1.nPedido = c2.nPedido AND p1.dPedido = c2.dPedido
WHERE (p1.dPedido >= DATEADD(month, -12, GETDATE()) OR (p1.cStatus <> 'T' AND p1.cStatus IS NOT NULL));

-- Passo N: Pedidos de venda (itens)
-- Destino: sales_order_items

SELECT 
    p2.nPedido,
    CONVERT(varchar, p2.dPedido, 120) COLLATE Latin1_General_CI_AS as dPedido,
    p2.nRegistro,
    p2.cCodProd COLLATE Latin1_General_CI_AS as cCodProd,
    CAST(p2.nQtde AS INT) as nQtde,
    CAST(p2.nQtdeFat AS INT) as nQtdeFat,
    CAST(p2.nPreco AS FLOAT) as nPreco,
    p2.cLote COLLATE Latin1_General_CI_AS as cLote
FROM Pedidos2 p2 WITH (NOLOCK)
INNER JOIN Pedidos1 p1 WITH (NOLOCK) ON p1.nPedido = p2.nPedido AND p1.dPedido = p2.dPedido
WHERE p1.dPedido >= DATEADD(month, -6, GETDATE()) OR (p1.CSTATUS NOT IN ('FT', 'CA') AND p1.CSTATUS IS NOT NULL);

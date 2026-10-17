-- Passo M: Pedidos de venda (cabeçalho)
-- Destino: sales_orders

SELECT 
    nPedido,
    CONVERT(varchar, dPedido, 120) COLLATE Latin1_General_CI_AS as dPedido,
    nCodigo,
    cNome COLLATE Latin1_General_CI_AS as cNome,
    CAST(nValorTot AS FLOAT) as nValorTot,
    CSTATUS COLLATE Latin1_General_CI_AS as CSTATUS,
    NNOTAFISCAL,
    CONVERT(varchar, dPrevisaoDespacho, 120) COLLATE Latin1_General_CI_AS as dPrevisao,
    CONVERT(varchar, dEntrega, 120) COLLATE Latin1_General_CI_AS as dEntrega,
    CAST(mObservac AS NVARCHAR(MAX)) COLLATE Latin1_General_CI_AS as mObservac
FROM Pedidos1 WITH (NOLOCK)
-- Janela incremental + abertos no ERP.
-- Pedidos abertos só no Hub: reconciliados em legacy_db.rs; se sumirem do ERP → CA.
WHERE dPedido >= DATEADD(month, -6, GETDATE()) OR (CSTATUS NOT IN ('FT', 'CA') AND CSTATUS IS NOT NULL);

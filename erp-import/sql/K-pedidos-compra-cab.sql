-- Passo K: Pedidos de compra (cabeçalho)
-- Destino: purchase_orders

SELECT 
    nRegistro,
    nPedido,
    CONVERT(varchar, dPedido, 120) COLLATE Latin1_General_CI_AS as dPedido,
    nCodFornec,
    cNomeF COLLATE Latin1_General_CI_AS as cNomeF,
    cUsuario COLLATE Latin1_General_CI_AS as cUsuario,
    cStatus COLLATE Latin1_General_CI_AS as cStatus,
    cPrazoPgto COLLATE Latin1_General_CI_AS as cPrazoPgto,
    cPrevEntrega COLLATE Latin1_General_CI_AS as cPrevEntrega,
    CAST(nValor AS FLOAT) as nValor,
    CONVERT(varchar, dPrevisao, 120) COLLATE Latin1_General_CI_AS as dPrevisao,
    cEmail COLLATE Latin1_General_CI_AS as cEmail,
    CAST(mObservac AS NVARCHAR(MAX)) COLLATE Latin1_General_CI_AS as mObservac
FROM PedidoCpa1 WITH (NOLOCK)
WHERE dPedido >= DATEADD(month, -12, GETDATE()) OR (cStatus <> 'T' AND cStatus IS NOT NULL);

-- Passo D1: Posição de estoque — insumos
-- Destino: item_stock_snapshots

SELECT 
    cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    CAST(nQtdeEstoque AS FLOAT) as nQtdeEstoque,
    CAST(nqtdeReserva AS FLOAT) as nqtdeReserva,
    CAST(nQtdeProducao AS FLOAT) as nQtdeProducao,
    CAST(nQtdePedidos AS FLOAT) as nQtdePedidos
FROM Insumos WITH (NOLOCK)
WHERE cReferencia IS NOT NULL AND cReferencia <> '' AND (cInativo = 'N' OR cInativo IS NULL);

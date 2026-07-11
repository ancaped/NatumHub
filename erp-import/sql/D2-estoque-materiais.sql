-- Passo D2: Posição de estoque — materiais
-- Destino: item_stock_snapshots

SELECT 
    cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    CAST(nQtdeEstoque AS FLOAT) as nQtdeEstoque,
    CAST(0.0 AS FLOAT) as nqtdeReserva,
    CAST(nQtdeProducao AS FLOAT) as nQtdeProducao,
    CAST(nQtdePedidos AS FLOAT) as nQtdePedidos
FROM Materiais WITH (NOLOCK)
WHERE cReferencia IS NOT NULL AND cReferencia <> '' AND (cInativo = 'N' OR cInativo IS NULL);

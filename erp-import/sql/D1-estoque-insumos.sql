-- Passo D1: Posição de estoque — insumos
-- Destino: stock_snapshots
-- Estoque canônico da tela ERP = nQtdeEstoqueA (fallback nQtdeEstoque se A for NULL)

SELECT 
    cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    CAST(COALESCE(nQtdeEstoqueA, nQtdeEstoque) AS FLOAT) as nQtdeEstoque,
    CAST(nqtdeReserva AS FLOAT) as nqtdeReserva,
    CAST(nQtdeProducao AS FLOAT) as nQtdeProducao,
    CAST(nQtdePedidos AS FLOAT) as nQtdePedidos
FROM Insumos WITH (NOLOCK)
WHERE cReferencia IS NOT NULL AND cReferencia <> '' AND (cInativo = 'N' OR cInativo IS NULL);

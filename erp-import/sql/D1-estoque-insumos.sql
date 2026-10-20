-- Passo D1: posição de estoque dos insumos.
-- Destino: stock_snapshots
-- Saldo da tela do ERP = nQtdeEstoque. nQtdeEstoqueA é diagnóstico e não entra no saldo.
-- Índices lidos pelo sync: 0 código, 1 saldo, 2 reserva, 3 produção, 4 pedidos,
-- 5 cache nQtdeEstoque, 6 nQtdeEstoqueA.
-- /*FILTRO_CODIGO*/ fica vazio no lote. Na consulta de um código vira
-- AND LTRIM(RTRIM(cReferencia)) = @P1.

SELECT
    cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    CAST(nQtdeEstoque AS FLOAT) as nQtdeEstoque,
    CAST(nqtdeReserva AS FLOAT) as nqtdeReserva,
    CAST(nQtdeProducao AS FLOAT) as nQtdeProducao,
    CAST(nQtdePedidos AS FLOAT) as nQtdePedidos,
    CAST(nQtdeEstoque AS FLOAT) as nQtdeEstoqueCache,
    CAST(nQtdeEstoqueA AS FLOAT) as nQtdeEstoqueA
FROM Insumos
WHERE cReferencia IS NOT NULL AND LTRIM(RTRIM(cReferencia)) <> ''
  AND (cInativo = 'N' OR cInativo IS NULL)
  /*FILTRO_CODIGO*/

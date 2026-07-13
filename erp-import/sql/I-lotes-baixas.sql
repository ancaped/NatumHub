-- Passo I: Baixas de insumo em ordens de produção
-- Destino: lotes_baixas, stock_movements (saída insumo)
-- Full/incremental: dLog >= since (floor 2024-01-01 no full; watermark−2d no incremental)

SELECT 
    b.Registro,
    b.nLote,
    b.cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    CAST(b.nQtde AS FLOAT) as nQtde,
    CONVERT(varchar, b.dLog, 120) COLLATE Latin1_General_CI_AS as dLog,
    b.cUsuario COLLATE Latin1_General_CI_AS as cUsuario,
    b.cJustificativa COLLATE Latin1_General_CI_AS as cJustificativa,
    b.cCodProd COLLATE Latin1_General_CI_AS as cCodProd,
    CAST(b.nQtdeRef AS FLOAT) as nQtdeRef
FROM Lotes_Baixas b WITH (NOLOCK)
WHERE b.dLog >= '2024-01-01 00:00:00'
  AND b.cReferencia IS NOT NULL AND b.cReferencia <> '';

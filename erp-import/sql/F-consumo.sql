-- Passo F: Consumo médio por insumo (baixas de lote)
-- Destino: consumption_stats

SELECT 
    b.cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    YEAR(b.dLog) as Ano,
    CAST(SUM(b.nQtde) AS FLOAT) as TotalQtd,
    CAST(SUM(b.nQtde) / 12.0 AS FLOAT) as MediaMensal
FROM Lotes_Baixas b WITH (NOLOCK)
WHERE YEAR(b.dLog) IN (2024, 2025, 2026)
  AND b.cReferencia IS NOT NULL AND b.cReferencia <> ''
GROUP BY b.cReferencia, YEAR(b.dLog);

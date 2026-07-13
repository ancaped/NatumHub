-- Passo H: Lotes de produção (produto acabado)
-- Destino: stock_movements (entrada produto)
-- Full/incremental: dLote >= since (floor 2024-01-01 no full; watermark−2d no incremental)

SELECT 
    l.nLote,
    l.cCodProd COLLATE Latin1_General_CI_AS as cCodProd,
    l.cCodProd2 COLLATE Latin1_General_CI_AS as cCodProd2,
    l.cCodProd3 COLLATE Latin1_General_CI_AS as cCodProd3,
    l.cCodProd4 COLLATE Latin1_General_CI_AS as cCodProd4,
    CAST(l.nQtde AS FLOAT) as nQtde,
    CAST(l.nQtde1 AS FLOAT) as nQtde1,
    CAST(l.nQtde2 AS FLOAT) as nQtde2,
    CAST(l.nQtde3 AS FLOAT) as nQtde3,
    CAST(l.nQtde4 AS FLOAT) as nQtde4,
    CONVERT(varchar, l.dLote, 120) COLLATE Latin1_General_CI_AS as dLote,
    l.cStatus COLLATE Latin1_General_CI_AS as cStatus,
    l.cFabricadopor COLLATE Latin1_General_CI_AS as cFabricadopor,
    l.cAutorizadopor COLLATE Latin1_General_CI_AS as cAutorizadopor,
    CAST(l.nUnidades AS FLOAT) as nUnidades,
    CAST(l.nUnidades1 AS FLOAT) as nUnidades1,
    CAST(l.nUnidades2 AS FLOAT) as nUnidades2,
    CAST(l.nUnidades3 AS FLOAT) as nUnidades3,
    CAST(l.nUnidades4 AS FLOAT) as nUnidades4,
    CAST(l.nUnidadesReais1 AS FLOAT) as nUnidadesReais1,
    CAST(l.nUnidadesReais2 AS FLOAT) as nUnidadesReais2,
    CAST(l.nUnidadesReais3 AS FLOAT) as nUnidadesReais3,
    CAST(l.nUnidadesReais4 AS FLOAT) as nUnidadesReais4,
    CONVERT(varchar, l.dPesado, 120) COLLATE Latin1_General_CI_AS as dPesado
FROM Lotes l WITH (NOLOCK)
WHERE l.dLote >= '2024-01-01 00:00:00'
  AND (
    (l.cCodProd IS NOT NULL AND l.cCodProd <> '') OR
    (l.cCodProd2 IS NOT NULL AND l.cCodProd2 <> '') OR
    (l.cCodProd3 IS NOT NULL AND l.cCodProd3 <> '') OR
    (l.cCodProd4 IS NOT NULL AND l.cCodProd4 <> '')
  );

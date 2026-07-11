-- Passo G: Fórmulas / BOM (bill of materials)
-- Destino: formulacoes

SELECT 
    c.cCodProd COLLATE Latin1_General_CI_AS as cCodProd,
    c.cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    c.cDescricao COLLATE Latin1_General_CI_AS as cDescricao,
    CAST(c.nQuantidade AS FLOAT) as nQuantidade,
    CAST(c.NPERCENTUAL AS FLOAT) as NPERCENTUAL
FROM Composicao c WITH (NOLOCK)
WHERE c.cCodProd IS NOT NULL AND c.cReferencia IS NOT NULL;

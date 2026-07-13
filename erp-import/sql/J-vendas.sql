-- Passo J: Histórico de vendas (linhas de NF/pedido)
-- Destino: stock_movements (saída produto) — módulo Vendas
-- Full: desde 2024-01-01 | Incremental: desde watermark − 2 dias (ver legacy_db.rs)

SELECT 
    v2.nRegistro,
    v2.nVenda,
    v2.cCodProd COLLATE Latin1_General_CI_AS as cCodProd,
    CAST(v2.nQtde AS FLOAT) as nQtde,
    CONVERT(varchar, v2.dVenda, 120) COLLATE Latin1_General_CI_AS as dVenda,
    v1.cNome COLLATE Latin1_General_CI_AS as cNome,
    v2.nNotaFiscal
FROM VENDAS2 v2 WITH (NOLOCK)
INNER JOIN VENDAS1 v1 WITH (NOLOCK) ON v2.nVenda = v1.nVenda AND CAST(v2.dVenda AS DATE) = CAST(v1.dVenda AS DATE)
WHERE v2.dVenda >= '2024-01-01 00:00:00'
  AND v2.cCodProd IS NOT NULL AND v2.cCodProd <> '';

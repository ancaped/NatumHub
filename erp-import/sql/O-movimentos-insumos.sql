-- Passo O: movimentos extras de insumos (acertos / inventário / etc.)
-- PLACEHOLDER — preencher após O-discover-movimentos-insumos.sql no SQL Server.
--
-- Formato esperado pelo sync Hub (legacy_db / stock_movements):
--   cReferencia, nQtde, dMov, cTipo (entrada|saida|acerto_entrada|acerto_saida|inventario_entrada|inventario_saida),
--   cDocumento, cDetalhes
--
-- Exemplo (comentar/adaptar quando a tabela real for conhecida):
/*
SELECT
    LTRIM(RTRIM(cReferencia)) AS cReferencia,
    CAST(nQtde AS FLOAT) AS nQtde,
    CONVERT(varchar, dMovimento, 120) AS dMov,
    LTRIM(RTRIM(cTipoMov)) AS cTipo,
    LTRIM(RTRIM(CAST(nDocumento AS varchar(40)))) AS cDocumento,
    LTRIM(RTRIM(CAST(cHistorico AS nvarchar(200)))) AS cDetalhes
FROM <TabelaKardexInsumos> WITH (NOLOCK)
WHERE dMovimento >= @since
  AND cReferencia IS NOT NULL AND cReferencia <> '';
*/

SELECT
    CAST(NULL AS varchar(40)) AS cReferencia,
    CAST(0 AS FLOAT) AS nQtde,
    CAST(NULL AS varchar(30)) AS dMov,
    CAST(NULL AS varchar(40)) AS cTipo,
    CAST(NULL AS varchar(40)) AS cDocumento,
    CAST(NULL AS nvarchar(200)) AS cDetalhes
WHERE 1 = 0;

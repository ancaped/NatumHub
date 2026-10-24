-- Passo O: acertos / ajustes / saídas manuais de insumos (ERP ENTDEVINS) -> Postgres erp_movimentos_insumos.
-- O sync (legacy_db.rs) usa esta mesma consulta, com @since = data de início da janela (aaaammdd).
-- As baixas por lote (Lotes_Baixas) já vêm no passo I e as entradas por NF no passo Q (Recebe_Insumos).
-- Histórico por item: GET /api/estoque/insumos/:codigo/movimentos. Consulta de conferência: O-movimentacao-insumo-dgi.sql.
DECLARE @since varchar(8) = '20260101';
SELECT
    CAST(e.nRegistro AS BIGINT) AS nRegistro,
    CAST(LTRIM(RTRIM(e.cReferencia)) AS NVARCHAR(60)) AS cReferencia,
    CONVERT(VARCHAR(8), TRY_CONVERT(date, e.dRegistro), 112) AS dRegistro,
    CAST(e.cHora AS NVARCHAR(10)) AS cHora,
    CAST(e.cTipoES AS NVARCHAR(2)) AS cTipoES,
    CAST(e.nQtde AS FLOAT) AS nQtde,
    CAST(e.mObservac AS NVARCHAR(500)) AS mObservac,
    CAST(e.cOperador AS NVARCHAR(60)) AS cOperador,
    CAST(e.cLoteFornec AS NVARCHAR(100)) AS cLoteFornec
FROM ENTDEVINS e WITH (NOLOCK)
WHERE e.dRegistro >= @since
  AND e.cReferencia IS NOT NULL AND e.cReferencia <> '';

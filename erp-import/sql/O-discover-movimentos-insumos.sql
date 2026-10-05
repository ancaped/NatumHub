-- Discovery: movimentos / kardex de insumos no SQL Server (ERP legado)
-- Rodar no master com leitura. Não altera dados.
-- Objetivo: achar tabelas/colunas dos textos tipo
--   (saida - acerto de estoque), (entrada - Acerto Manual), inventário, etc.

-- 1) Tabelas cujo nome sugere estoque/movimento/histórico/inventário/acerto
SELECT TABLE_SCHEMA, TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
  AND (
    TABLE_NAME LIKE '%Estoque%'
    OR TABLE_NAME LIKE '%Mov%'
    OR TABLE_NAME LIKE '%Hist%'
    OR TABLE_NAME LIKE '%Invent%'
    OR TABLE_NAME LIKE '%Acerto%'
    OR TABLE_NAME LIKE '%Ajuste%'
    OR TABLE_NAME LIKE '%Kardex%'
    OR TABLE_NAME LIKE '%Insumo%'
  )
ORDER BY TABLE_NAME;

-- 2) Colunas texto que podem trazer o tipo de operação
SELECT c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_NAME IN (
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
      AND (
        TABLE_NAME LIKE '%Estoque%'
        OR TABLE_NAME LIKE '%Mov%'
        OR TABLE_NAME LIKE '%Hist%'
        OR TABLE_NAME LIKE '%Invent%'
        OR TABLE_NAME LIKE '%Acerto%'
        OR TABLE_NAME LIKE '%Ajuste%'
      )
  )
  AND (
    c.COLUMN_NAME LIKE '%Tipo%'
    OR c.COLUMN_NAME LIKE '%Oper%'
    OR c.COLUMN_NAME LIKE '%Desc%'
    OR c.COLUMN_NAME LIKE '%Hist%'
    OR c.COLUMN_NAME LIKE '%Observ%'
    OR c.COLUMN_NAME LIKE '%Justific%'
    OR c.COLUMN_NAME LIKE '%Doc%'
  )
ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION;

-- 3) Amostra Lotes_Baixas — justificativas “acerto/ajuste/invent”
SELECT TOP 50
  cJustificativa,
  COUNT(*) AS qtd
FROM Lotes_Baixas WITH (NOLOCK)
WHERE cJustificativa IS NOT NULL
  AND (
    cJustificativa LIKE '%acerto%'
    OR cJustificativa LIKE '%ajuste%'
    OR cJustificativa LIKE '%invent%'
    OR cJustificativa LIKE '%manual%'
  )
GROUP BY cJustificativa
ORDER BY qtd DESC;

-- 4) Após achar a tabela de kardex, adaptar amostras:
-- SELECT TOP 100 * FROM <TabelaDescoberta> WITH (NOLOCK) ORDER BY 1 DESC;
-- SELECT DISTINCT <ColunaTipo> FROM <TabelaDescoberta> WITH (NOLOCK);

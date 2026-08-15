-- Discovery: tabelas/colunas de kits no ERP (histórico / diagnóstico)
-- Canônico confirmado: dbo.Kits (Manutenção de Kits). Produtos_Kits costuma estar vazia.

SELECT TABLE_SCHEMA, TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME LIKE '%Kit%'
ORDER BY TABLE_SCHEMA, TABLE_NAME;

SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Kits'
ORDER BY ORDINAL_POSITION;

-- Amostra: componentes (S) vs entrada do kit (E)
SELECT TOP 20
    LTRIM(RTRIM(cKit)) AS cKit,
    LTRIM(RTRIM(cCodProd)) AS cCodProd,
    nQtde,
    nAcada,
    cEntSaiEstoque
FROM Kits WITH (NOLOCK)
ORDER BY cKit, cEntSaiEstoque, cCodProd;

SELECT
    cEntSaiEstoque,
    COUNT(*) AS linhas,
    COUNT(DISTINCT LTRIM(RTRIM(cKit))) AS kits
FROM Kits WITH (NOLOCK)
GROUP BY cEntSaiEstoque;

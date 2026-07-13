-- Passo A: Produtos acabados + médias mensais de venda (ano corrente)
-- Destino: produtos, estoque_atual
-- Estoque: nQtdeEstoque / nQtdeProducao / nPedidos como FLOAT (não truncar decimais)

SELECT 
    p.cCodProd COLLATE Latin1_General_CI_AS as cCodProd,
    p.cNomeProd COLLATE Latin1_General_CI_AS as cNomeProd,
    CAST(p.nQtdeEstoque AS FLOAT) as nQtdeEstoque,
    CAST(p.nQtdeProducao AS FLOAT) as nQtdeProducao,
    CAST(p.nPedidos AS FLOAT) as nPedidos,
    p.cBase COLLATE Latin1_General_CI_AS as cBase,
    p.cNomeTipo COLLATE Latin1_General_CI_AS as cNomeTipo,
    CAST(ISNULL(v.M1, 0) AS INT) as M1,
    CAST(ISNULL(v.M2, 0) AS INT) as M2,
    CAST(ISNULL(v.M3, 0) AS INT) as M3,
    CAST(ISNULL(v.M4, 0) AS INT) as M4,
    CAST(ISNULL(v.M5, 0) AS INT) as M5,
    CAST(ISNULL(v.M6, 0) AS INT) as M6,
    CAST(ISNULL(v.M7, 0) AS INT) as M7,
    CAST(ISNULL(v.M8, 0) AS INT) as M8,
    CAST(ISNULL(v.M9, 0) AS INT) as M9,
    CAST(ISNULL(v.M10, 0) AS INT) as M10,
    CAST(ISNULL(v.M11, 0) AS INT) as M11,
    CAST(ISNULL(v.M12, 0) AS INT) as M12
FROM Produtos p WITH (NOLOCK)
LEFT JOIN (
    SELECT 
        cCodProd,
        SUM(CASE WHEN MONTH(dVenda) = 1 THEN nQtde ELSE 0 END) as M1,
        SUM(CASE WHEN MONTH(dVenda) = 2 THEN nQtde ELSE 0 END) as M2,
        SUM(CASE WHEN MONTH(dVenda) = 3 THEN nQtde ELSE 0 END) as M3,
        SUM(CASE WHEN MONTH(dVenda) = 4 THEN nQtde ELSE 0 END) as M4,
        SUM(CASE WHEN MONTH(dVenda) = 5 THEN nQtde ELSE 0 END) as M5,
        SUM(CASE WHEN MONTH(dVenda) = 6 THEN nQtde ELSE 0 END) as M6,
        SUM(CASE WHEN MONTH(dVenda) = 7 THEN nQtde ELSE 0 END) as M7,
        SUM(CASE WHEN MONTH(dVenda) = 8 THEN nQtde ELSE 0 END) as M8,
        SUM(CASE WHEN MONTH(dVenda) = 9 THEN nQtde ELSE 0 END) as M9,
        SUM(CASE WHEN MONTH(dVenda) = 10 THEN nQtde ELSE 0 END) as M10,
        SUM(CASE WHEN MONTH(dVenda) = 11 THEN nQtde ELSE 0 END) as M11,
        SUM(CASE WHEN MONTH(dVenda) = 12 THEN nQtde ELSE 0 END) as M12
    FROM VENDAS2 WITH (NOLOCK)
    WHERE YEAR(dVenda) = YEAR(GETDATE())
    GROUP BY cCodProd
) v ON p.cCodProd = v.cCodProd
WHERE p.cInativo = 'N' OR p.cInativo IS NULL;

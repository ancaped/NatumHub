-- Passo D7: posição de estoque dos produtos acabados (kits, coloração e apoio inclusos).
-- Destino: estoque_atual
-- Saldo = RECÁLCULO dos movimentos desde Produtos.dEstoque, no mesmo espírito do D1 dos insumos.
-- O cache Produtos.nQtdeEstoque só é igual a isso depois que o ERP reprocessa; entre reprocessamentos
-- fica velho (caso 2.11.055, 18/11/2026: o Nexus lançou a montagem de 48 kits em ENTDEV às 03:01 e o
-- ERP só atualizou o cache às ~10:40; os syncs do intervalo copiavam -48). O cache vem na coluna 4 só
-- como diagnóstico (cache_erp_desatualizado).
-- Fórmula (conferida em 18/11/2026 contra os 1591 produtos ativos: 1559 iguais ao cache; dos 32
-- diferentes, 31 são a montagem de kits de 18/11 às 03:00 que o cache ainda não tinha, com
-- quantidade e horário idênticos em ENTDEV; sobra o 1.13.085 (cache 12 abaixo, sem movimento que
-- explique), caso isolado do cache do ERP):
--   nQtdeInicial
--   + ENTDEV entrada (cTipoES 'E')  - ENTDEV saída ('S')      [dRegistro >= dEstoque; kits entram aqui]
--   - VENDAS2 (nQtde)                                         [dVenda >= dEstoque; VENDAS1.CSTATUS 'CA' não conta]
--   + lotes de produção: nUnidadesReais1..4 dos slots com AtualizaEstoque = 'S', cStatus <> 'CA' e
--     dinspecao preenchida (a entrada é na inspeção; sem ela o ERP ainda não creditou) [dinspecao >= dEstoque]
-- Produto sem dEstoque: o ERP só considera nQtdeInicial (nenhum movimento).
-- Fora da fórmula (conferido, sem linhas ou sem efeito): Devolve2, Kit_Mov2, Balanco2, Caderneta,
-- Produtos_Entradas (tabelas vazias), Produtos_Acerto (sem data), Pedidos2 (pedido não é saída).
-- Colunas lidas pelo sync (por posição): 0 código, 1 saldo calculado, 2 produção (nQtdeProducao),
-- 3 pedidos (nPedidos), 4 cache nQtdeEstoque (diagnóstico), 5 cNomeTipo (fase). Saída em FLOAT
-- (o leitor mssql_f64 devolve 0 para DECIMAL).
-- O marcador de filtro (dentro do CTE prod) vira, no lote, o filtro de produto ativo
-- (inativo continua fora) e, na consulta de um código, um filtro em LTRIM(RTRIM(cCodProd))
-- com parâmetro, sem o filtro de inativo.

WITH prod AS (
    SELECT cCodProd, dEstoque, ISNULL(nQtdeInicial, 0) AS nQtdeInicial,
           nQtdeProducao, nPedidos, nQtdeEstoque, cNomeTipo
    FROM Produtos
    WHERE cCodProd IS NOT NULL AND cCodProd <> ''
      /*FILTRO_CODIGO*/
),
es AS (
    SELECT e.nCodProd AS cCodProd,
           SUM(CASE WHEN e.cTipoES = 'E' THEN e.nQtde ELSE 0 END) AS ent,
           SUM(CASE WHEN e.cTipoES = 'S' THEN e.nQtde ELSE 0 END) AS sai
    FROM ENTDEV e JOIN prod ON prod.cCodProd = e.nCodProd
    WHERE prod.dEstoque IS NOT NULL AND e.dRegistro >= CONVERT(VARCHAR(8), prod.dEstoque, 112)
    GROUP BY e.nCodProd
),
ven AS (
    SELECT v.cCodProd, SUM(v.nQtde) AS q
    FROM VENDAS2 v
    JOIN VENDAS1 v1 ON v1.nVenda = v.nVenda AND v1.dVenda = v.dVenda
    JOIN prod ON prod.cCodProd = v.cCodProd
    WHERE prod.dEstoque IS NOT NULL AND v.dVenda >= prod.dEstoque AND ISNULL(v1.CSTATUS, '') <> 'CA'
    GROUP BY v.cCodProd
),
slots AS (
    SELECT cStatus, cCodProd, nUnidadesReais1 AS r, AtualizaEstoque1 AS atualiza, dinspecao1 AS dInsp FROM Lotes WHERE cCodProd <> ''
    UNION ALL SELECT cStatus, cCodProd2, nUnidadesReais2, AtualizaEstoque2, dinspecao2 FROM Lotes WHERE cCodProd2 <> ''
    UNION ALL SELECT cStatus, cCodProd3, nUnidadesReais3, AtualizaEstoque3, dinspecao3 FROM Lotes WHERE cCodProd3 <> ''
    UNION ALL SELECT cStatus, cCodProd4, nUnidadesReais4, AtualizaEstoque4, dinspecao4 FROM Lotes WHERE cCodProd4 <> ''
),
lot AS (
    SELECT s.cCodProd, SUM(s.r) AS q
    FROM slots s JOIN prod ON prod.cCodProd = s.cCodProd
    WHERE prod.dEstoque IS NOT NULL AND s.atualiza = 'S' AND s.cStatus <> 'CA'
      AND s.dInsp IS NOT NULL AND s.dInsp >= prod.dEstoque
    GROUP BY s.cCodProd
)
SELECT
    RTRIM(prod.cCodProd) COLLATE Latin1_General_CI_AS AS cCodProd,
    CAST(CASE WHEN prod.dEstoque IS NULL THEN prod.nQtdeInicial
         ELSE prod.nQtdeInicial + ISNULL(es.ent, 0) - ISNULL(es.sai, 0) - ISNULL(ven.q, 0) + ISNULL(lot.q, 0)
         END AS FLOAT) AS nQtdeEstoque,
    CAST(prod.nQtdeProducao AS FLOAT) AS nQtdeProducao,
    CAST(prod.nPedidos AS FLOAT) AS nPedidos,
    CAST(prod.nQtdeEstoque AS FLOAT) AS nQtdeEstoqueCache,
    prod.cNomeTipo COLLATE Latin1_General_CI_AS AS cNomeTipo
FROM prod
LEFT JOIN es  ON es.cCodProd  = prod.cCodProd
LEFT JOIN ven ON ven.cCodProd = prod.cCodProd
LEFT JOIN lot ON lot.cCodProd = prod.cCodProd

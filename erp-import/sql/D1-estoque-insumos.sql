-- Passo D1: posição de estoque dos insumos.
-- Destino: stock_snapshots
-- Saldo = RECÁLCULO dos movimentos desde Insumos.dEstoque (é o que a tela do DGI mostra; conferido
-- pelo Edson em 2026-11-04 nos itens negativados 9.15.064, 9.38.009, 9.31.005). O cache
-- Insumos.nQtdeEstoque só é igual a isso depois que o ERP reprocessa; entre reprocessamentos fica velho
-- (ex.: 9.15.117 ficou 15 kg abaixo por causa de um lote cancelado). O cache vem na coluna 5 só como
-- diagnóstico (erp_cache_drift). nQtdeEstoqueA também é só diagnóstico.
-- A reserva aberta JÁ está descontada do saldo calculado: não subtrair de novo.
-- Colunas lidas pelo sync (por posição): 0 código, 1 saldo calculado, 2 reserva do ERP (informativa),
-- 3 produção, 4 pedidos, 5 cache nQtdeEstoque, 6 nQtdeEstoqueA. Saída em FLOAT (o leitor mssql_f64
-- devolve 0 para DECIMAL).
-- Origem da fórmula: script do agente conectado ao SQL Server (2026-11-04), isolamento READ COMMITTED.
-- O marcador de filtro por código (dentro do CTE ins) fica vazio no lote; na consulta de um
-- código o Rust troca por um filtro em LTRIM(RTRIM(cReferencia)) com parâmetro.

WITH ins AS (
    SELECT cReferencia, dEstoque, ISNULL(nQtdeInicial, 0) AS nQtdeInicial,
           nqtdeReserva, nQtdeProducao, nQtdePedidos, nQtdeEstoque, nQtdeEstoqueA,
           CASE WHEN cReferencia LIKE '%.15.%' THEN 1 ELSE 0 END AS is_mp
    FROM Insumos
    WHERE cReferencia IS NOT NULL AND LTRIM(RTRIM(cReferencia)) <> ''
      AND (cInativo = 'N' OR cInativo IS NULL)
      /*FILTRO_CODIGO*/
),
rec AS (
    SELECT r.cReferencia, SUM(r.quantidade) AS q
    FROM Recebe_Insumos r JOIN ins ON ins.cReferencia = r.cReferencia
    WHERE r.cStatus = 'AP' AND r.dEntrada >= ins.dEstoque
    GROUP BY r.cReferencia
),
es AS (
    SELECT e.cReferencia,
           SUM(CASE WHEN e.cTipoES = 'E' THEN e.nQtde ELSE 0 END) AS ent,
           SUM(CASE WHEN e.cTipoES = 'S' THEN e.nQtde ELSE 0 END) AS sai
    FROM EntDevIns e JOIN ins ON ins.cReferencia = e.cReferencia
    WHERE e.dRegistro >= ins.dEstoque
    GROUP BY e.cReferencia
),
perd AS (
    SELECT p.cReferencia, SUM(p.nQtde) AS q
    FROM Lotes_Perdas p JOIN ins ON ins.cReferencia = p.cReferencia
    WHERE p.cAtualizaEstoque = 'S' AND p.dLog >= ins.dEstoque
    GROUP BY p.cReferencia
),
lb AS (
    SELECT lb.cReferencia,
           SUM(CASE WHEN (ins.is_mp = 1 AND l.dPesado   >= ins.dEstoque)
                      OR (ins.is_mp = 0 AND l.dEnvasado >= ins.dEstoque) THEN lb.nQtde ELSE 0 END) AS usado,
           SUM(CASE WHEN (ins.is_mp = 1 AND l.dReservaP >= ins.dEstoque)
                      OR (ins.is_mp = 0 AND l.dReservaE >= ins.dEstoque) THEN lb.nQtde ELSE 0 END) AS res_all,
           SUM(CASE WHEN (ins.is_mp = 1 AND l.dPesado   >= ins.dEstoque AND l.dReservaP IS NOT NULL)
                      OR (ins.is_mp = 0 AND l.dEnvasado >= ins.dEstoque AND l.dReservaE IS NOT NULL) THEN lb.nQtde ELSE 0 END) AS res_usada
    FROM Lotes_Baixas lb
    JOIN Lotes l ON l.nLote = lb.nLote
    JOIN ins ON ins.cReferencia = lb.cReferencia
    WHERE l.cStatus <> 'CA'
    GROUP BY lb.cReferencia
),
rot_add AS (
    SELECT r.cReferencia, SUM(r.nQtdeRotulada) AS q
    FROM Rotulagem r JOIN ins ON ins.cReferencia = r.cReferencia
    WHERE r.dRotulagem >= ins.dEstoque
    GROUP BY r.cReferencia
),
rot_uso AS (
    SELECT c.cReferenciaUsada AS cReferencia, SUM(r.nQtdeRotulada * c.nQuantidade) AS q
    FROM Rotulagem r
    JOIN Composicao_Insumos c ON c.cReferencia = r.cReferencia
    JOIN ins ON ins.cReferencia = c.cReferenciaUsada
    WHERE r.dRotulagem >= ins.dEstoque
    GROUP BY c.cReferenciaUsada
),
kit AS (
    SELECT k.cCodProd AS cReferencia,
           SUM(CASE WHEN k.cEntSai = 'S' THEN k.nQtde ELSE 0 END) AS kit_s,
           SUM(CASE WHEN k.cEntSai = 'E' THEN k.nQtde ELSE 0 END) AS kit_e
    FROM Kit_Mov2 k JOIN ins ON ins.cReferencia = k.cCodProd
    WHERE k.dKit >= ins.dEstoque
    GROUP BY k.cCodProd
),
bal AS (
    SELECT x.cCodigo AS cReferencia, SUM(x.q) AS q
    FROM (SELECT cCodigo, SUM(nQtdeContada) - nQtdeAtualT AS q
          FROM Balanco4 GROUP BY cCodigo, dBalanco, nQtdeAtualT) x
    GROUP BY x.cCodigo
)
SELECT
    ins.cReferencia COLLATE Latin1_General_CI_AS AS cReferencia,
    CAST(CAST(CASE WHEN ins.dEstoque IS NULL THEN ins.nQtdeInicial + ISNULL(bal.q, 0)
         ELSE ins.nQtdeInicial + ISNULL(rec.q, 0) - ISNULL(kit.kit_s, 0) + ISNULL(kit.kit_e, 0)
              - ISNULL(lb.usado, 0) - ISNULL(lb.res_all, 0) + ISNULL(lb.res_usada, 0)
              + ISNULL(es.ent, 0) - ISNULL(es.sai, 0) + ISNULL(rot_add.q, 0) - ISNULL(rot_uso.q, 0)
              + ISNULL(bal.q, 0) - ISNULL(perd.q, 0) END AS DECIMAL(18,6)) AS FLOAT) AS nQtdeEstoque,
    CAST(ins.nqtdeReserva AS FLOAT) AS nqtdeReserva,
    CAST(ins.nQtdeProducao AS FLOAT) AS nQtdeProducao,
    CAST(ins.nQtdePedidos AS FLOAT) AS nQtdePedidos,
    CAST(ins.nQtdeEstoque AS FLOAT) AS nQtdeEstoqueCache,
    CAST(ins.nQtdeEstoqueA AS FLOAT) AS nQtdeEstoqueA
FROM ins
LEFT JOIN rec     ON rec.cReferencia     = ins.cReferencia
LEFT JOIN es      ON es.cReferencia      = ins.cReferencia
LEFT JOIN perd    ON perd.cReferencia    = ins.cReferencia
LEFT JOIN lb      ON lb.cReferencia      = ins.cReferencia
LEFT JOIN rot_add ON rot_add.cReferencia = ins.cReferencia
LEFT JOIN rot_uso ON rot_uso.cReferencia = ins.cReferencia
LEFT JOIN kit     ON kit.cReferencia     = ins.cReferencia
LEFT JOIN bal     ON bal.cReferencia     = ins.cReferencia

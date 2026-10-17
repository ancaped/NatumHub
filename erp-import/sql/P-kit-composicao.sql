-- Passo P: Composição de kits (Manutenção de Kits)
-- Destino: kit_composicao (origem = 'erp')
--
-- cEntSaiEstoque = 'S' → componente (saída de estoque na montagem)
-- cEntSaiEstoque = 'E' → o próprio kit (entrada) — ignorar no sync
-- quantidade Hub = nQtde / nAcada; fator_proporcao_kits = nAcada
-- Dedupe: ERP pode repetir (cKit, cCodProd); agrega nQtde e usa MAX(nAcada).

SELECT
    LTRIM(RTRIM(k.cKit)) COLLATE Latin1_General_CI_AS AS kit_codigo,
    LTRIM(RTRIM(k.cCodProd)) COLLATE Latin1_General_CI_AS AS componente_codigo,
    MAX(CAST(k.nQtde AS FLOAT)) / NULLIF(MAX(CAST(k.nAcada AS FLOAT)), 0) AS quantidade,
    CAST(1.0 AS FLOAT) AS fator_proporcao_qtd,
    CAST(MAX(k.nAcada) AS INT) AS fator_proporcao_kits
FROM Kits k WITH (NOLOCK)
WHERE k.cEntSaiEstoque = 'S'
  AND k.cKit IS NOT NULL
  AND k.cCodProd IS NOT NULL
  AND LTRIM(RTRIM(k.cKit)) <> ''
  AND LTRIM(RTRIM(k.cCodProd)) <> ''
  AND NULLIF(CAST(k.nAcada AS FLOAT), 0) IS NOT NULL
GROUP BY LTRIM(RTRIM(k.cKit)), LTRIM(RTRIM(k.cCodProd));

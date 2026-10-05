-- Passo E: Notas fiscais de compra (itens)
-- Destino: invoices
-- Full: últimos 48 meses | Incremental: desde watermark − 2 dias
-- Inclui impostos do item, frete da NF, duplicatas (DUP1..4) e conhecimento de frete (CTe / F_*)

SELECT 
    c.NOTA,
    c.CODIGO_PRODUTO COLLATE Latin1_General_CI_AS as CODIGO_PRODUTO,
    c.DESCRICAO_PRODUTO COLLATE Latin1_General_CI_AS as DESCRICAO_PRODUTO,
    c.UNIDADE COLLATE Latin1_General_CI_AS as UNIDADE,
    CAST(c.QUANTIDADE AS FLOAT) as QUANTIDADE,
    CAST(c.VALOR_UNITARIO AS FLOAT) as VALOR_UNITARIO,
    CAST(c.VALOR_TOTAL AS FLOAT) as VALOR_TOTAL,
    f.RAZAO_SOCIAL COLLATE Latin1_General_CI_AS as RAZAO_SOCIAL,
    c.nCodFornec,
    f.DATA_EMISSAO,
    c.CFOP COLLATE Latin1_General_CI_AS as CFOP,
    CAST(c.VALOR_ICMS_PROD AS FLOAT) as VALOR_ICMS,
    CAST(c.VALOR_IPI AS FLOAT) as VALOR_IPI,
    CAST(f.VALOR_FRETE AS FLOAT) as VALOR_FRETE,
    f.T_RAZAO_SOCIAL COLLATE Latin1_General_CI_AS as TRANSPORTADORA,
    f.CNPJ_CPF COLLATE Latin1_General_CI_AS as CNPJ_FORNEC,
    f.DATA_SAIDA as DATA_ENTRADA,
    f.DUP1_NUMERO COLLATE Latin1_General_CI_AS as D1_NUM,
    f.DUP1_VENC as D1_VENC,
    CAST(f.DUP1_VALOR AS FLOAT) as D1_VAL,
    f.DUP2_NUMERO COLLATE Latin1_General_CI_AS as D2_NUM,
    f.DUP2_VENC as D2_VENC,
    CAST(f.DUP2_VALOR AS FLOAT) as D2_VAL,
    f.DUP3_NUMERO COLLATE Latin1_General_CI_AS as D3_NUM,
    f.DUP3_VENC as D3_VENC,
    CAST(f.DUP3_VALOR AS FLOAT) as D3_VAL,
    f.DUP4_NUMERO COLLATE Latin1_General_CI_AS as D4_NUM,
    f.DUP4_VENC as D4_VENC,
    CAST(f.DUP4_VALOR AS FLOAT) as D4_VAL,
    f.F_Conhecimento COLLATE Latin1_General_CI_AS as FTE_NUM,
    CAST(f.F_Valor_Doc_Fiscal AS FLOAT) as FTE_VALOR,
    f.F_Transportadora COLLATE Latin1_General_CI_AS as FTE_CARRIER_NAME,
    f.F_CNPJ COLLATE Latin1_General_CI_AS as FTE_CARRIER_CNPJ,
    f.F_Data_Emissao as FTE_ISSUE_DATE,
    f.F_Data_Entrada as FTE_ENTRY_DATE,
    f.F_CIF_FOB COLLATE Latin1_General_CI_AS as FTE_CIF_FOB,
    f.F_Serie COLLATE Latin1_General_CI_AS as FTE_SERIE,
    f.F_CFOP COLLATE Latin1_General_CI_AS as FTE_CFOP,
    f.F_Natureza COLLATE Latin1_General_CI_AS as FTE_NATUREZA,
    CAST(f.F_Valor_ICMS AS FLOAT) as FTE_ICMS
FROM COMPRAS2 c WITH (NOLOCK)
LEFT JOIN COMPRAS1 f WITH (NOLOCK) ON c.nCodFornec = f.nCodFornec AND c.NOTA = f.NOTA
WHERE f.DATA_EMISSAO >= DATEADD(month, -48, GETDATE())
  AND c.CODIGO_PRODUTO IS NOT NULL AND c.CODIGO_PRODUTO <> '';

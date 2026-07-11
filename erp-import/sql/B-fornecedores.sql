-- Passo B: Fornecedores
-- Destino: suppliers

SELECT 
    nCodFornec,
    cNomeF COLLATE Latin1_General_CI_AS as cNomeF,
    cContatoF COLLATE Latin1_General_CI_AS as cContatoF,
    cEmail COLLATE Latin1_General_CI_AS as cEmail,
    mObservacF COLLATE Latin1_General_CI_AS as mObservacF
FROM Fornecedores WITH (NOLOCK)
WHERE cNomeF IS NOT NULL AND cNomeF <> '';

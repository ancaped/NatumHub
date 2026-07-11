-- Passo D: Cadastro de materiais (embalagens, apoio, etc.)
-- Destino: items (categoria material)

SELECT 
    cReferencia COLLATE Latin1_General_CI_AS as cReferencia,
    cDescricao COLLATE Latin1_General_CI_AS as cDescricao,
    cUnidade COLLATE Latin1_General_CI_AS as cUnidade,
    cReferenciaNova COLLATE Latin1_General_CI_AS as cReferenciaNova,
    cCF COLLATE Latin1_General_CI_AS as cCF,
    cInativo COLLATE Latin1_General_CI_AS as cInativo
FROM Materiais WITH (NOLOCK)
WHERE cReferencia IS NOT NULL AND cReferencia <> '';

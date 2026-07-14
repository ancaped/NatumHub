-- Quantidades fracionárias e fator de proporção em kit_composicao
ALTER TABLE kit_composicao
  ALTER COLUMN quantidade TYPE NUMERIC(12,4)
  USING COALESCE(quantidade, 1)::numeric(12,4);

ALTER TABLE kit_composicao
  ADD COLUMN IF NOT EXISTS fator_proporcao_qtd NUMERIC(12,4) DEFAULT 1.0;

ALTER TABLE kit_composicao
  ADD COLUMN IF NOT EXISTS fator_proporcao_kits INTEGER DEFAULT 1;

UPDATE kit_composicao
SET fator_proporcao_qtd = COALESCE(fator_proporcao_qtd, 1.0),
    fator_proporcao_kits = COALESCE(fator_proporcao_kits, 1)
WHERE fator_proporcao_qtd IS NULL OR fator_proporcao_kits IS NULL;

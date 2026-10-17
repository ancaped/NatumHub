-- Origem da linha de composição de kit: sync ERP vs cadastro manual/Excel.
-- Sync (Passo P) só apaga/regrava origem = 'erp'; linhas 'manual' são preservadas.

ALTER TABLE kit_composicao
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'manual';

UPDATE kit_composicao
SET origem = 'manual'
WHERE origem IS NULL OR TRIM(origem) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kit_composicao_origem_check'
  ) THEN
    ALTER TABLE kit_composicao
      ADD CONSTRAINT kit_composicao_origem_check
      CHECK (origem IN ('erp', 'manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_kit_composicao_origem ON kit_composicao (origem);

-- Embalagens e motivo nas ordens de reembalagem (vira_ordens)
ALTER TABLE vira_ordens
  ADD COLUMN IF NOT EXISTS packaging_deductions TEXT;

ALTER TABLE vira_ordens
  ADD COLUMN IF NOT EXISTS motivo TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'natum_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON vira_ordens TO natum_app;
  END IF;
END $$;

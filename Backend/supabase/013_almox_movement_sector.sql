-- Setor na saída de almox + sequência de código curto local (APP_####)
-- Depende de 002_almoxarifado.sql / 004_almox_erp_super.sql

ALTER TABLE almox_movements
  ADD COLUMN IF NOT EXISTS sector TEXT;

CREATE TABLE IF NOT EXISTS almox_local_code_seq (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  next_val INT NOT NULL DEFAULT 1
);

INSERT INTO almox_local_code_seq (id, next_val)
VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'natum_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      almox_movements, almox_local_code_seq
      TO natum_app;
  END IF;
END $$;

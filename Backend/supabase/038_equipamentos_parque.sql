-- Parque de equipamentos: ficha (marca/modelo/ano), peças por OS e associação com vida útil.
-- Depende de 003_estoque_ops.sql

ALTER TABLE estoque_equipamentos
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS manufacture_year INTEGER,
  ADD COLUMN IF NOT EXISTS serial_number TEXT;

ALTER TABLE estoque_manutencoes
  ADD COLUMN IF NOT EXISTS scheduled_at TEXT;

ALTER TABLE estoque_equipamento_pecas
  ADD COLUMN IF NOT EXISTS installed_at TEXT,
  ADD COLUMN IF NOT EXISTS expected_lifespan_days INTEGER,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS estoque_manutencao_pecas (
    id TEXT PRIMARY KEY,
    maintenance_id TEXT NOT NULL REFERENCES estoque_manutencoes(id) ON DELETE CASCADE,
    item_code TEXT NOT NULL REFERENCES items(code),
    quantity DOUBLE PRECISION NOT NULL DEFAULT 1,
    replaced BOOLEAN NOT NULL DEFAULT TRUE,
    unit_cost DOUBLE PRECISION,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_estoque_manut_pecas_maint
  ON estoque_manutencao_pecas(maintenance_id);
CREATE INDEX IF NOT EXISTS idx_estoque_manut_pecas_item
  ON estoque_manutencao_pecas(item_code);
CREATE INDEX IF NOT EXISTS idx_estoque_manut_scheduled
  ON estoque_manutencoes(scheduled_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'natum_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON estoque_manutencao_pecas TO natum_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'natum') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON estoque_manutencao_pecas TO natum;
  END IF;
END $$;

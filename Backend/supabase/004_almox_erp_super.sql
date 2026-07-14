-- Campos ERP editáveis + movimentos detalhados do supermercado
-- Depende de 002_almoxarifado.sql / 003_estoque_ops.sql

ALTER TABLE almox_item_config
  ADD COLUMN IF NOT EXISTS erp_description TEXT;

ALTER TABLE almox_item_config
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE almox_item_config
  ADD COLUMN IF NOT EXISTS unit TEXT;

ALTER TABLE almox_movements
  ADD COLUMN IF NOT EXISTS variant_label TEXT;

ALTER TABLE almox_movements
  ADD COLUMN IF NOT EXISTS pack_label TEXT;

ALTER TABLE almox_movements
  ADD COLUMN IF NOT EXISTS pack_count DOUBLE PRECISION;

ALTER TABLE almox_movements
  ADD COLUMN IF NOT EXISTS content_per_pack DOUBLE PRECISION;

ALTER TABLE almox_movements
  ADD COLUMN IF NOT EXISTS total_paid DOUBLE PRECISION;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'natum_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      almox_item_config, almox_balances, almox_movements
      TO natum_app;
  END IF;
END $$;

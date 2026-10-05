-- Migração 012: detalhes adicionais do conhecimento de frete (CTe) em COMPRAS1
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fte_serie TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fte_cfop TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fte_natureza TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fte_icms_value DOUBLE PRECISION DEFAULT 0;

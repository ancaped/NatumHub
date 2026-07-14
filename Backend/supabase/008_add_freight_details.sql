-- Migração 008: Adiciona colunas para detalhamento de pagamento do frete (CTe)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fte_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fte_value DOUBLE PRECISION DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fte_carrier_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fte_carrier_cnpj TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fte_issue_date TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fte_entry_date TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fte_cif_fob TEXT;

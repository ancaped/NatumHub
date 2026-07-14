-- Migração para estender a tabela invoices com detalhes extras de frete, impostos e contas a pagar do ERP.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cfop TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS icms_value DOUBLE PRECISION DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ipi_value DOUBLE PRECISION DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS freight_value DOUBLE PRECISION DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS entry_date TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS carrier_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS supplier_cnpj TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_installments TEXT;

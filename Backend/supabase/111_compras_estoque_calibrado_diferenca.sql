-- Estoque real digitado (calibração) passa a valer como DIFERENÇA sobre o ERP: estoque = ERP agora + (real - ERP no dia).
-- `erp_base` = estoque do ERP no momento da calibração. Linha antiga (erp_base NULL) segue como valor fixo até alguém remover.
CREATE TABLE IF NOT EXISTS item_stock_calibrations (
    item_code TEXT PRIMARY KEY,
    stock DOUBLE PRECISION NOT NULL,
    updated_at TEXT NOT NULL,
    erp_base DOUBLE PRECISION
);
ALTER TABLE item_stock_calibrations ADD COLUMN IF NOT EXISTS erp_base DOUBLE PRECISION;

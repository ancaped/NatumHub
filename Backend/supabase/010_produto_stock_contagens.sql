-- Resoluções de contagem física de estoque de produtos acabados (auditoria Hub)
CREATE TABLE IF NOT EXISTS produto_stock_contagens (
    id TEXT PRIMARY KEY,
    product_code TEXT NOT NULL,
    recorded_qty DOUBLE PRECISION NOT NULL,
    counted_qty DOUBLE PRECISION NOT NULL,
    delta DOUBLE PRECISION NOT NULL,
    counted_by TEXT,
    counted_at TEXT NOT NULL,
    observations TEXT
);

CREATE INDEX IF NOT EXISTS idx_prod_stock_cont_code
    ON produto_stock_contagens (product_code);

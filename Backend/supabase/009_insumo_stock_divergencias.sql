-- Resoluções de divergências de estoque de insumos (auditoria Hub)
CREATE TABLE IF NOT EXISTS insumo_stock_error_resolutions (
    id TEXT PRIMARY KEY,
    item_code TEXT NOT NULL,
    error_type TEXT NOT NULL,
    is_resolved INTEGER DEFAULT 1,
    resolved_by TEXT,
    resolved_at TEXT,
    observations TEXT,
    UNIQUE (item_code, error_type)
);

CREATE INDEX IF NOT EXISTS idx_insumo_stock_err_code
    ON insumo_stock_error_resolutions (item_code);

-- Tipos de registro cadastráveis (Venda, Uso/Interno, …) + coluna na ordem.

CREATE TABLE IF NOT EXISTS manual_stock_record_types (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT manual_stock_record_types_name_uq UNIQUE (name)
);

ALTER TABLE manual_stock_orders
    ADD COLUMN IF NOT EXISTS record_type TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_manual_stock_orders_record_type
    ON manual_stock_orders (record_type)
    WHERE record_type <> '';

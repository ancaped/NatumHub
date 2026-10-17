-- Ordens Manuais (entrada/saída de insumos) — controle Hub sem alterar stock_snapshots.
-- Ordens OPEN afetam Prev. Futura em Compras; POSTED = lançado no ERP.

CREATE TABLE IF NOT EXISTS manual_stock_orders (
    id BIGSERIAL PRIMARY KEY,
    order_number TEXT UNIQUE NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('entrada', 'saida')),
    partner_name TEXT NOT NULL DEFAULT '',
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'POSTED')),
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    posted_by TEXT,
    posted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_manual_stock_orders_status_kind
    ON manual_stock_orders (status, kind);

CREATE INDEX IF NOT EXISTS idx_manual_stock_orders_order_date
    ON manual_stock_orders (order_date DESC);

CREATE TABLE IF NOT EXISTS manual_stock_order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES manual_stock_orders(id) ON DELETE CASCADE,
    item_code TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    unit TEXT NOT NULL DEFAULT 'UN',
    qty DOUBLE PRECISION NOT NULL CHECK (qty > 0),
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_manual_stock_order_items_order
    ON manual_stock_order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_manual_stock_order_items_code
    ON manual_stock_order_items (item_code);

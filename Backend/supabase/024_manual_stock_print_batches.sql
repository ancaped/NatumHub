-- Lotes de impressão (folha A4) para Ordens Manuais — arquivo físico guardado/pendente.

CREATE TABLE IF NOT EXISTS manual_stock_print_batches (
    id BIGSERIAL PRIMARY KEY,
    batch_code TEXT UNIQUE NOT NULL,
    order_id BIGINT NOT NULL REFERENCES manual_stock_orders(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('entrada', 'saida')),
    sheet_index INT NOT NULL CHECK (sheet_index >= 1),
    item_offset INT NOT NULL DEFAULT 0 CHECK (item_offset >= 0),
    item_count INT NOT NULL CHECK (item_count > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'guardado')),
    guarded_by TEXT,
    guarded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT manual_stock_print_batches_order_sheet_uq UNIQUE (order_id, sheet_index)
);

CREATE INDEX IF NOT EXISTS idx_manual_stock_print_batches_status
    ON manual_stock_print_batches (status);

CREATE INDEX IF NOT EXISTS idx_manual_stock_print_batches_kind
    ON manual_stock_print_batches (kind);

CREATE INDEX IF NOT EXISTS idx_manual_stock_print_batches_order
    ON manual_stock_print_batches (order_id);

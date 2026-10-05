-- Folhas manuais de preenchimento (Controle Entrada/Saída de Insumo) — sem vínculo com ordens.

CREATE TABLE IF NOT EXISTS manual_stock_sheet_registers (
    id BIGSERIAL PRIMARY KEY,
    register_number TEXT UNIQUE NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('entrada', 'saida')),
    status TEXT NOT NULL DEFAULT 'retirada' CHECK (status IN ('retirada', 'conferida')),
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    conferred_by TEXT,
    conferred_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_manual_stock_sheet_registers_status
    ON manual_stock_sheet_registers (status);

CREATE INDEX IF NOT EXISTS idx_manual_stock_sheet_registers_kind
    ON manual_stock_sheet_registers (kind);

CREATE INDEX IF NOT EXISTS idx_manual_stock_sheet_registers_created
    ON manual_stock_sheet_registers (created_at DESC);

-- 036_compras_listas_solicitacao.sql
-- Controle de lotes de listas de compras e correlação com pedidos do ERP

CREATE TABLE IF NOT EXISTS purchase_request_batches (
    id TEXT PRIMARY KEY,
    lote_numero TEXT NOT NULL UNIQUE,
    modulo TEXT NOT NULL DEFAULT 'geral',
    titulo TEXT,
    observacoes TEXT,
    created_by TEXT,
    status TEXT NOT NULL DEFAULT 'pendente',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_request_batches_status ON purchase_request_batches(status);
CREATE INDEX IF NOT EXISTS idx_purchase_request_batches_modulo ON purchase_request_batches(modulo);
CREATE INDEX IF NOT EXISTS idx_purchase_request_batches_created_at ON purchase_request_batches(created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_request_items (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES purchase_request_batches(id) ON DELETE CASCADE,
    item_code TEXT NOT NULL,
    item_description TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'UN',
    quantity_requested DOUBLE PRECISION NOT NULL,
    current_stock_at_time DOUBLE PRECISION DEFAULT 0,
    overall_avg_at_time DOUBLE PRECISION DEFAULT 0,
    sim_producao_at_time DOUBLE PRECISION DEFAULT 0,
    future_stock_at_time DOUBLE PRECISION DEFAULT 0,
    target_days_at_time INTEGER DEFAULT 90,
    trigger_days_at_time INTEGER DEFAULT 30,
    supplier_name TEXT,
    observacao TEXT,
    status TEXT NOT NULL DEFAULT 'solicitado',
    erp_pedido_numero INTEGER,
    erp_pedido_data TEXT,
    erp_fornecedor TEXT,
    erp_pedido_qtd DOUBLE PRECISION,
    erp_pedido_chegou DOUBLE PRECISION,
    erp_previsao_entrega TEXT,
    erp_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_request_items_batch_id ON purchase_request_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_request_items_item_code ON purchase_request_items(item_code);
CREATE INDEX IF NOT EXISTS idx_purchase_request_items_status ON purchase_request_items(status);

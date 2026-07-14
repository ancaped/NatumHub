-- Almoxarifado: ledger local (não é truncado pelo sync ERP)
-- Ver: ContextoIA/modulos/almoxarifado.md

CREATE TABLE IF NOT EXISTS almox_item_config (
    item_code TEXT PRIMARY KEY REFERENCES items(code),
    active INTEGER NOT NULL DEFAULT 1,
    min_qty DOUBLE PRECISION NOT NULL DEFAULT 0,
    ideal_qty DOUBLE PRECISION NOT NULL DEFAULT 0,
    location TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS almox_balances (
    item_code TEXT PRIMARY KEY REFERENCES items(code),
    qty_on_hand DOUBLE PRECISION NOT NULL DEFAULT 0,
    avg_unit_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS almox_movements (
    id TEXT PRIMARY KEY,
    item_code TEXT NOT NULL REFERENCES items(code),
    movement_type TEXT NOT NULL CHECK (movement_type IN ('entrada', 'saida', 'ajuste')),
    quantity DOUBLE PRECISION NOT NULL,
    unit_cost DOUBLE PRECISION,
    reason TEXT,
    document_ref TEXT,
    operator_id TEXT,
    occurred_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT,
    demand_id TEXT
);

CREATE TABLE IF NOT EXISTS almox_purchase_demands (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'aberta'
        CHECK (status IN ('aberta', 'pedida', 'recebida', 'cancelada')),
    title TEXT,
    notes TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT,
    received_at TEXT
);

CREATE TABLE IF NOT EXISTS almox_purchase_demand_items (
    id TEXT PRIMARY KEY,
    demand_id TEXT NOT NULL REFERENCES almox_purchase_demands(id) ON DELETE CASCADE,
    item_code TEXT NOT NULL REFERENCES items(code),
    qty_requested DOUBLE PRECISION NOT NULL DEFAULT 0,
    qty_received DOUBLE PRECISION NOT NULL DEFAULT 0,
    unit_cost DOUBLE PRECISION,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_almox_movements_item ON almox_movements(item_code);
CREATE INDEX IF NOT EXISTS idx_almox_movements_date ON almox_movements(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_almox_movements_type ON almox_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_almox_config_active ON almox_item_config(active);
CREATE INDEX IF NOT EXISTS idx_almox_demand_status ON almox_purchase_demands(status);
CREATE INDEX IF NOT EXISTS idx_almox_demand_items_demand ON almox_purchase_demand_items(demand_id);

-- Role da API (Saves/postgres.env). Ajuste o nome se o usuário local for outro.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'natum_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      almox_item_config, almox_balances, almox_movements,
      almox_purchase_demands, almox_purchase_demand_items
      TO natum_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'natum') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      almox_item_config, almox_balances, almox_movements,
      almox_purchase_demands, almox_purchase_demand_items
      TO natum;
  END IF;
END $$;

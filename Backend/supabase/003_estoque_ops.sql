-- Estoque ops: seções (almox/supermercado/peças) + equipamentos + manutenções
-- Depende de 002_almoxarifado.sql

ALTER TABLE almox_item_config
  ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'almoxarifado';

ALTER TABLE almox_item_config
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'erp';

-- Garante índice por seção
CREATE INDEX IF NOT EXISTS idx_almox_config_section ON almox_item_config(section);

CREATE TABLE IF NOT EXISTS estoque_peca_meta (
    item_code TEXT PRIMARY KEY REFERENCES items(code) ON DELETE CASCADE,
    lifespan_days INTEGER,
    installed_at TEXT,
    expires_at TEXT,
    next_exchange_at TEXT,
    notes TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS estoque_equipamentos (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    sector TEXT,
    status TEXT NOT NULL DEFAULT 'em_operacao'
        CHECK (status IN ('em_operacao', 'em_manutencao', 'parado')),
    maintenance_interval_days INTEGER,
    last_maintenance_at TEXT,
    next_maintenance_at TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS estoque_equipamento_pecas (
    equipment_id TEXT NOT NULL REFERENCES estoque_equipamentos(id) ON DELETE CASCADE,
    item_code TEXT NOT NULL REFERENCES items(code),
    PRIMARY KEY (equipment_id, item_code)
);

CREATE TABLE IF NOT EXISTS estoque_manutencoes (
    id TEXT PRIMARY KEY,
    equipment_id TEXT NOT NULL REFERENCES estoque_equipamentos(id),
    kind TEXT NOT NULL DEFAULT 'corretiva'
        CHECK (kind IN ('preventiva', 'corretiva', 'preditiva')),
    status TEXT NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'em_andamento', 'concluida')),
    item_code TEXT REFERENCES items(code),
    quantity DOUBLE PRECISION DEFAULT 0,
    technician TEXT,
    cost DOUBLE PRECISION,
    notes TEXT,
    occurred_at TEXT NOT NULL,
    completed_at TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE INDEX IF NOT EXISTS idx_estoque_manut_equip ON estoque_manutencoes(equipment_id);
CREATE INDEX IF NOT EXISTS idx_estoque_manut_status ON estoque_manutencoes(status);
CREATE INDEX IF NOT EXISTS idx_estoque_equip_status ON estoque_equipamentos(status);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'natum_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      estoque_peca_meta, estoque_equipamentos, estoque_equipamento_pecas, estoque_manutencoes
      TO natum_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'natum') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      estoque_peca_meta, estoque_equipamentos, estoque_equipamento_pecas, estoque_manutencoes
      TO natum;
  END IF;
END $$;

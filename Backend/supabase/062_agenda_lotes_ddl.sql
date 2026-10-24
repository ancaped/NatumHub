-- Agenda dos lotes (acompanhamento de produção): DDL que antes só nascia em runtime (store.rs::ensure_schema).
-- Aditiva e idempotente.
CREATE TABLE IF NOT EXISTS lote_custom_status (
    lote_number      TEXT PRIMARY KEY,
    custom_status    TEXT NOT NULL,
    category         TEXT,
    updated_by       TEXT,
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    notes            TEXT,
    data_pesagem     TIMESTAMPTZ,
    data_producao    TIMESTAMPTZ,
    data_envase      TIMESTAMPTZ,
    data_rotulagem   TIMESTAMPTZ,
    data_finalizada  TIMESTAMPTZ,
    data_em_espera   TIMESTAMPTZ,
    data_previsao    TIMESTAMPTZ,
    motivo_espera    TEXT,
    is_terceirizado  BOOLEAN DEFAULT FALSE
);

-- Tabela pode já existir com menos colunas (criada por versões antigas): garante todas antes dos índices.
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS data_pesagem TIMESTAMPTZ;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS data_producao TIMESTAMPTZ;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS data_envase TIMESTAMPTZ;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS data_rotulagem TIMESTAMPTZ;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS data_finalizada TIMESTAMPTZ;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS data_em_espera TIMESTAMPTZ;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS motivo_espera TEXT;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS is_terceirizado BOOLEAN DEFAULT FALSE;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS data_previsao TIMESTAMPTZ;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS data_liberado_envase TIMESTAMPTZ;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS ficha_ordem JSONB DEFAULT '{}'::jsonb;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS quantidade_envasada_parcial NUMERIC(15, 4) DEFAULT 0;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS historico_reagendamentos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS quadros_ocultos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS etapas_status JSONB DEFAULT '{}'::jsonb;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS insumo_faltante_codigo TEXT;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS insumo_faltante_descricao TEXT;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS fornecedor_terceirizado TEXT;
ALTER TABLE lote_custom_status ADD COLUMN IF NOT EXISTS adicionado_manualmente_em DATE;

CREATE INDEX IF NOT EXISTS idx_lote_custom_status ON lote_custom_status(custom_status);
CREATE INDEX IF NOT EXISTS idx_lote_custom_terceirizado ON lote_custom_status(is_terceirizado);

CREATE TABLE IF NOT EXISTS lote_status_history (
    id            BIGSERIAL PRIMARY KEY,
    lote_number   TEXT NOT NULL,
    status        TEXT NOT NULL,
    category      TEXT,
    changed_by    TEXT,
    changed_at    TIMESTAMPTZ DEFAULT NOW(),
    notes         TEXT
);
ALTER TABLE lote_status_history ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE lote_status_history ADD COLUMN IF NOT EXISTS changed_by TEXT;
ALTER TABLE lote_status_history ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE lote_status_history ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_lote_status_history_lote ON lote_status_history(lote_number);

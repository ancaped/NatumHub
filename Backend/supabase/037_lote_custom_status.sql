-- Submódulo de Acompanhamento de Produção: Status Nosso customizado por lote e histórico
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
    motivo_espera    TEXT,
    is_terceirizado  BOOLEAN DEFAULT FALSE
);

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

CREATE INDEX IF NOT EXISTS idx_lote_status_history_lote ON lote_status_history(lote_number);

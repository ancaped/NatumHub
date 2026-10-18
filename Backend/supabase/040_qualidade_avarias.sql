-- Avarias internas (Qualidade): produto encontrado fora do fluxo, com destino CQ.

CREATE TABLE IF NOT EXISTS qualidade_avarias (
    id BIGSERIAL PRIMARY KEY,
    register_number TEXT UNIQUE NOT NULL,
    item_code TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    lote TEXT NOT NULL DEFAULT '',
    qty DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK (qty > 0),
    location TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'em_analise'
        CHECK (status IN (
            'em_analise', 'retorno_estoque', 'reparo', 'embalagem', 'descarte', 'outro'
        )),
    notes TEXT,
    foto_path TEXT,
    created_by TEXT,
    decided_by TEXT,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qualidade_avarias_status
    ON qualidade_avarias (status);

CREATE INDEX IF NOT EXISTS idx_qualidade_avarias_item
    ON qualidade_avarias (item_code);

CREATE INDEX IF NOT EXISTS idx_qualidade_avarias_lote
    ON qualidade_avarias (lote);

-- Quem já acessa CQ ou Devoluções passa a ver Avarias.
INSERT INTO hub_operator_modules (operator_id, module_key, access_level)
SELECT operator_id, 'qualidade_avarias', access_level
FROM hub_operator_modules
WHERE module_key IN ('controle_qualidade', 'qualidade_devolucoes')
ON CONFLICT (operator_id, module_key) DO NOTHING;

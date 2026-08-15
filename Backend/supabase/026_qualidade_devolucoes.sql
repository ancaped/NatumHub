-- Devoluções de cliente (Qualidade) — sem vínculo obrigatório a pedido/NF ERP.

CREATE TABLE IF NOT EXISTS qualidade_devolucoes (
    id BIGSERIAL PRIMARY KEY,
    register_number TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'rascunho'
        CHECK (status IN (
            'rascunho', 'recebido', 'em_conferencia', 'disposto',
            'parcialmente_lancado', 'finalizado'
        )),
    client_code TEXT NOT NULL DEFAULT '',
    client_name TEXT NOT NULL DEFAULT '',
    return_date DATE NOT NULL DEFAULT CURRENT_DATE,
    nf_number TEXT NOT NULL DEFAULT '',
    receiver_name TEXT NOT NULL DEFAULT '',
    carrier_name TEXT NOT NULL DEFAULT '',
    notes TEXT,
    received_by TEXT,
    received_at TIMESTAMPTZ,
    cq_by TEXT,
    cq_at TIMESTAMPTZ,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qualidade_devolucoes_status
    ON qualidade_devolucoes (status);

CREATE INDEX IF NOT EXISTS idx_qualidade_devolucoes_return_date
    ON qualidade_devolucoes (return_date DESC);

CREATE TABLE IF NOT EXISTS qualidade_devolucao_itens (
    id BIGSERIAL PRIMARY KEY,
    devolucao_id BIGINT NOT NULL REFERENCES qualidade_devolucoes(id) ON DELETE CASCADE,
    item_code TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    qty DOUBLE PRECISION NOT NULL CHECK (qty > 0),
    lotes TEXT NOT NULL DEFAULT '',
    qty_conferida DOUBLE PRECISION,
    analise_obs TEXT,
    disposicao TEXT
        CHECK (disposicao IS NULL OR disposicao IN (
            'retornar_estoque', 'trocar_embalagem', 'trocar_rotulo',
            'descartar', 'quarentena', 'outro'
        )),
    disposicao_obs TEXT,
    erp_status TEXT NOT NULL DEFAULT 'em_processo'
        CHECK (erp_status IN ('em_processo', 'lancado')),
    erp_by TEXT,
    erp_at TIMESTAMPTZ,
    sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_qualidade_devolucao_itens_dev
    ON qualidade_devolucao_itens (devolucao_id);

CREATE INDEX IF NOT EXISTS idx_qualidade_devolucao_itens_erp
    ON qualidade_devolucao_itens (erp_status);

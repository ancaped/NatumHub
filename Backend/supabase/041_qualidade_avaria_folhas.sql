-- Folha de controle das avarias. Não lança estoque: a entrada continua manual no ERP.
-- Quando a área devolve o papel, a folha é marcada como devolvida.

CREATE TABLE IF NOT EXISTS qualidade_avaria_folhas (
    id BIGSERIAL PRIMARY KEY,
    sheet_number TEXT UNIQUE NOT NULL,
    destination TEXT NOT NULL
        CHECK (destination IN ('expedicao', 'embalagem', 'reparo')),
    status TEXT NOT NULL DEFAULT 'aberta'
        CHECK (status IN ('aberta', 'devolvida', 'cancelada')),
    created_by TEXT,
    returned_by TEXT,
    returned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qualidade_avaria_folha_itens (
    id BIGSERIAL PRIMARY KEY,
    folha_id BIGINT NOT NULL REFERENCES qualidade_avaria_folhas(id) ON DELETE CASCADE,
    avaria_id BIGINT NOT NULL REFERENCES qualidade_avarias(id),
    UNIQUE (folha_id, avaria_id)
);

CREATE INDEX IF NOT EXISTS idx_qualidade_avaria_folhas_status
    ON qualidade_avaria_folhas (status);

CREATE INDEX IF NOT EXISTS idx_qualidade_avaria_folha_itens_avaria
    ON qualidade_avaria_folha_itens (avaria_id);

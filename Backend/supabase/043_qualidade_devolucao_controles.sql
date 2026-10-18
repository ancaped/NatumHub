-- Volumes na devolução e controle que agrupa várias devoluções menores.

ALTER TABLE qualidade_devolucoes
    ADD COLUMN IF NOT EXISTS volume_count INT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS qualidade_devolucao_controles (
    id BIGSERIAL PRIMARY KEY,
    sheet_number TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'aberta'
        CHECK (status IN ('aberta', 'devolvida', 'cancelada')),
    volume_count INT NOT NULL DEFAULT 1,
    created_by TEXT,
    returned_by TEXT,
    returned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qualidade_devolucao_controle_itens (
    controle_id BIGINT NOT NULL REFERENCES qualidade_devolucao_controles(id) ON DELETE CASCADE,
    devolucao_id BIGINT NOT NULL REFERENCES qualidade_devolucoes(id),
    PRIMARY KEY (controle_id, devolucao_id)
);

CREATE INDEX IF NOT EXISTS idx_qualidade_devolucao_controle_itens_dev
    ON qualidade_devolucao_controle_itens (devolucao_id);

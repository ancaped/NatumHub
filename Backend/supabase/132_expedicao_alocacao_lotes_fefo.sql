-- 132: Expedição — Lotes e datas de validade por vão (FEFO e operação diária Pulmão -> Picking)
CREATE TABLE IF NOT EXISTS expedicao_alocacao_lotes (
    id TEXT PRIMARY KEY,
    posicao_id TEXT NOT NULL REFERENCES expedicao_posicoes(id) ON DELETE CASCADE,
    produto_codigo TEXT NOT NULL REFERENCES produtos(codigo) ON DELETE CASCADE,
    lote TEXT NOT NULL,
    caixas INTEGER NOT NULL DEFAULT 0 CHECK (caixas >= 0),
    data_fabricacao DATE,
    data_validade DATE,
    observacoes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (posicao_id, produto_codigo, lote)
);

CREATE INDEX IF NOT EXISTS idx_exp_aloc_lotes_posicao ON expedicao_alocacao_lotes(posicao_id);
CREATE INDEX IF NOT EXISTS idx_exp_aloc_lotes_produto ON expedicao_alocacao_lotes(produto_codigo);
CREATE INDEX IF NOT EXISTS idx_exp_aloc_lotes_validade ON expedicao_alocacao_lotes(data_validade);

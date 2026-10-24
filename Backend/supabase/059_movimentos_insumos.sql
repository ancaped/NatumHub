-- 059_movimentos_insumos.sql
-- Passo O do sync: acertos/ajustes/saídas manuais de insumos (ERP ENTDEVINS), base do histórico por item.
-- Aditiva. A chave é (n_registro, referencia): o ERP guarda uma linha por item dentro do mesmo registro.

CREATE TABLE IF NOT EXISTS erp_movimentos_insumos (
    n_registro BIGINT NOT NULL,
    referencia TEXT NOT NULL,
    data_mov DATE NOT NULL,
    hora TEXT,
    es CHAR(1),
    qtde NUMERIC(16, 4) NOT NULL DEFAULT 0,
    tipo TEXT NOT NULL DEFAULT 'outro',
    motivo TEXT,
    operador TEXT,
    lote_fornecedor TEXT,
    importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (n_registro, referencia)
);

CREATE INDEX IF NOT EXISTS idx_erp_mov_insumos_ref_data ON erp_movimentos_insumos (referencia, data_mov DESC);

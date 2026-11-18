-- 123_erp_acertos_insumos.sql
-- Passo O do sync: acertos/ajustes/saídas manuais de insumos (ERP ENTDEVINS).
-- ENTDEVINS.nRegistro NÃO é único (70 valores distintos em 8.364 linhas), então a PK (n_registro, referencia)
-- de erp_movimentos_insumos (059) sobrescrevia ~49% das linhas. Tabela nova, sem chave de negócio:
-- o sync espelha a janela (apaga data_mov >= início da janela e regrava tudo o que o ERP devolveu).
-- Aditiva. A tabela antiga fica como está (sem uso).

CREATE TABLE IF NOT EXISTS erp_acertos_insumos (
    id BIGSERIAL PRIMARY KEY,
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
    importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_acertos_insumos_ref_data ON erp_acertos_insumos (referencia, data_mov DESC);
CREATE INDEX IF NOT EXISTS idx_erp_acertos_insumos_data ON erp_acertos_insumos (data_mov);

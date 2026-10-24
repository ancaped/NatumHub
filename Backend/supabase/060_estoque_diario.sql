-- Foto diária do estoque por item (insumo ou produto), gravada no fim do sync do ERP.
-- Permite calcular o estoque no início/fim de um período (movimentação de insumos).
CREATE TABLE IF NOT EXISTS estoque_diario (
    codigo TEXT NOT NULL,
    dia DATE NOT NULL,
    estoque DOUBLE PRECISION NOT NULL,
    origem TEXT NOT NULL,
    gravado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (codigo, dia)
);

CREATE INDEX IF NOT EXISTS idx_estoque_diario_dia ON estoque_diario (dia);

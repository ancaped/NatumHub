-- Foto diária da duração estimada de cada item de Compras, para medir depois o erro da previsão (fase 1 do plano
-- decisions/plano-duracao-estimada-compras). Não muda nenhum número na tela.
CREATE TABLE IF NOT EXISTS compras_duracao_snapshots (
    data DATE NOT NULL,
    item_code TEXT NOT NULL,
    familia TEXT NOT NULL,
    duracao_prevista_dias DOUBLE PRECISION,
    consumo_diario_previsto DOUBLE PRECISION NOT NULL DEFAULT 0,
    estoque_previsto DOUBLE PRECISION NOT NULL DEFAULT 0,
    sem_controle BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (data, item_code)
);
CREATE INDEX IF NOT EXISTS idx_compras_duracao_snapshots_item ON compras_duracao_snapshots (item_code, data);

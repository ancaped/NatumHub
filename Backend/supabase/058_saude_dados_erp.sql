-- Saúde dos dados importados do ERP: resultado de cada checagem (depois do sync ou manual).
CREATE TABLE IF NOT EXISTS erp_saude_execucoes (
    id BIGSERIAL PRIMARY KEY,
    executado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    origem TEXT NOT NULL DEFAULT 'sync',
    resultado JSONB NOT NULL DEFAULT '{}'::jsonb,
    criticos INTEGER NOT NULL DEFAULT 0,
    avisos INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_erp_saude_execucoes_em ON erp_saude_execucoes (executado_em DESC);

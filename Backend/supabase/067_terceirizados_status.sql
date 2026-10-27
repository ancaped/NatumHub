-- Terceirizados: ciclo de status no servidor (SOLICITADO -> APROVADO -> VINCULADO -> EM_FABRICACAO -> ENTREGUE -> FINALIZADO, e CANCELADO)
-- e vínculo da solicitação com o item da fila do Planejamento.
ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS status_em TIMESTAMPTZ;
ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ;
ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS cancelado_por TEXT;
ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS finalizado_em TIMESTAMPTZ;

-- A fila é criada na 045; o IF NOT EXISTS garante a ordem mesmo se a tabela ainda não existir.
CREATE TABLE IF NOT EXISTS producao_fila_demandas (
    id TEXT PRIMARY KEY,
    codigo_produto TEXT NOT NULL,
    descricao TEXT NOT NULL,
    quantidade NUMERIC(12, 3) NOT NULL,
    unidade TEXT NOT NULL DEFAULT 'un',
    quantidade_kg NUMERIC(12, 3),
    origem_demanda TEXT NOT NULL,
    linha_envase TEXT,
    base_codigo TEXT,
    base_nome TEXT,
    observacoes TEXT,
    prioridade INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE producao_fila_demandas ADD COLUMN IF NOT EXISTS terceirizado_solicitacao_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_fila_demandas_terceirizado ON producao_fila_demandas (terceirizado_solicitacao_id);

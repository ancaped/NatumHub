-- 045_producao_fila_demandas.sql
-- Fila de demandas unificada integrada entre Gerenciamento de Produção e Planejamento Semanal (PCP)
CREATE TABLE IF NOT EXISTS producao_fila_demandas (
    id TEXT PRIMARY KEY,
    codigo_produto TEXT NOT NULL,
    descricao TEXT NOT NULL,
    quantidade NUMERIC(12, 3) NOT NULL,
    unidade TEXT NOT NULL DEFAULT 'un',
    quantidade_kg NUMERIC(12, 3),
    origem_demanda TEXT NOT NULL, -- 'sugestao_estoque', 'programada', 'fixa', 'manual', 'kit'
    linha_envase TEXT,
    base_codigo TEXT,
    base_nome TEXT,
    observacoes TEXT,
    prioridade INTEGER DEFAULT 1, -- 1=alta, 2=média, 3=baixa
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fila_demandas_codigo ON producao_fila_demandas (codigo_produto);
CREATE INDEX IF NOT EXISTS idx_fila_demandas_prioridade ON producao_fila_demandas (prioridade, created_at);

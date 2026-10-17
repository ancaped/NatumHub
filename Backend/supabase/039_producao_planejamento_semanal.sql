-- 039_producao_planejamento_semanal.sql
-- Tabela para configuração de reatores fabris
CREATE TABLE IF NOT EXISTS producao_reatores_config (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    capacidade_kg NUMERIC(10, 2) NOT NULL,
    tipo TEXT DEFAULT 'geral',
    ordem INTEGER DEFAULT 0,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de itens do planejamento semanal de ordens
CREATE TABLE IF NOT EXISTS producao_planejamento_semanal (
    id TEXT PRIMARY KEY,
    week_key TEXT NOT NULL,
    data_planejada DATE NOT NULL,
    reator_id TEXT NOT NULL,
    codigo_produto TEXT NOT NULL,
    descricao TEXT,
    quantidade_planejada NUMERIC(12, 3) NOT NULL,
    unidade TEXT DEFAULT 'kg',
    base_codigo TEXT,
    base_nome TEXT,
    linha_envase TEXT,
    observacoes TEXT,
    ordem_status TEXT DEFAULT 'planejado',
    lote_erp TEXT,
    fisico_confirmado_massa BOOLEAN DEFAULT FALSE,
    fisico_confirmado_embalagem BOOLEAN DEFAULT FALSE,
    fisico_confirmado_rotulo BOOLEAN DEFAULT FALSE,
    recipiente_detalhe TEXT DEFAULT 'Reator',
    cor_tag TEXT,
    ordem_sequencia INTEGER DEFAULT 1,
    processo_termico TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Colunas complementares se a tabela já existia
ALTER TABLE producao_planejamento_semanal ADD COLUMN IF NOT EXISTS recipiente_detalhe TEXT DEFAULT 'Reator';
ALTER TABLE producao_planejamento_semanal ADD COLUMN IF NOT EXISTS cor_tag TEXT;
ALTER TABLE producao_planejamento_semanal ADD COLUMN IF NOT EXISTS ordem_sequencia INTEGER DEFAULT 1;
ALTER TABLE producao_planejamento_semanal ADD COLUMN IF NOT EXISTS processo_termico TEXT;

CREATE INDEX IF NOT EXISTS idx_planejamento_week ON producao_planejamento_semanal (week_key);
CREATE INDEX IF NOT EXISTS idx_planejamento_data ON producao_planejamento_semanal (data_planejada);
CREATE INDEX IF NOT EXISTS idx_planejamento_reator ON producao_planejamento_semanal (reator_id);

-- Carga e atualização de reatores e bombonas oficiais da fábrica
DELETE FROM producao_reatores_config WHERE id IN ('R_250', 'R_1000');

INSERT INTO producao_reatores_config (id, nome, capacidade_kg, tipo, ordem, ativo) VALUES
    ('R_1000_SHAMPOO', 'Reator 1000kg (Caldeira - Exclusivo Shampoo)', 1000.0, 'caldeira_shampoo', 1, TRUE),
    ('R_1000_MISTO', 'Reator 1000kg (Caldeira - Produção Mista)', 1000.0, 'caldeira', 2, TRUE),
    ('R_500', 'Reator 500kg (Caldeira - Quente/Frio)', 500.0, 'caldeira', 3, TRUE),
    ('R_200', 'Reator 200kg (Caldeira - Quente/Frio)', 200.0, 'caldeira', 4, TRUE),
    ('R_100', 'Reator 100kg (Resistência - Máx 1/dia)', 100.0, 'resistencia', 5, TRUE),
    ('R_40', 'Reator 40kg (Produção Quente)', 40.0, 'quente', 6, TRUE),
    ('BOMBONAS', 'Bombonas (50kg, 100kg, 200kg)', 200.0, 'bombona', 7, TRUE)
ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    capacidade_kg = EXCLUDED.capacidade_kg,
    tipo = EXCLUDED.tipo,
    ordem = EXCLUDED.ordem,
    ativo = EXCLUDED.ativo;


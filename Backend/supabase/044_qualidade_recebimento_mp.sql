-- 044_qualidade_recebimento_mp.sql
-- Tabelas do módulo Recebimento de Matéria-Prima (Insumos) / Controle de Qualidade

CREATE TABLE IF NOT EXISTS erp_recebimentos_insumos (
    registro INT PRIMARY KEY,
    cod_fornecedor INT,
    fornecedor TEXT,
    nota_fiscal INT,
    data_emissao TIMESTAMPTZ,
    codigo_insumo TEXT NOT NULL,
    descricao_insumo TEXT NOT NULL,
    unidade TEXT,
    quantidade NUMERIC(14, 4) NOT NULL DEFAULT 0,
    valor_unitario NUMERIC(14, 4),
    valor_total NUMERIC(14, 4),
    data_entrada DATE,
    lote_fornecedor TEXT,
    data_validade DATE,
    tipo_recebimento TEXT,
    codigo_recebimento TEXT, -- ex: MP001852
    observacoes TEXT,
    status_erp TEXT, -- ex: AP
    usuario TEXT,
    num_registro INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_receb_insumo_code ON erp_recebimentos_insumos(codigo_insumo);
CREATE INDEX IF NOT EXISTS idx_erp_receb_lote ON erp_recebimentos_insumos(lote_fornecedor);
CREATE INDEX IF NOT EXISTS idx_erp_receb_cod_rec ON erp_recebimentos_insumos(codigo_recebimento);
CREATE INDEX IF NOT EXISTS idx_erp_receb_nf ON erp_recebimentos_insumos(nota_fiscal);
CREATE INDEX IF NOT EXISTS idx_erp_receb_data ON erp_recebimentos_insumos(data_entrada DESC);

CREATE TABLE IF NOT EXISTS recebimento_mp_laudos (
    id SERIAL PRIMARY KEY,
    codigo_laudo TEXT UNIQUE NOT NULL, -- ex: LAU-MP-2026-0001
    registro_erp INT, -- Referência ao registro em erp_recebimentos_insumos
    codigo_recebimento TEXT, -- MP001852
    codigo_insumo TEXT NOT NULL,
    descricao_insumo TEXT NOT NULL,
    fornecedor TEXT NOT NULL,
    nota_fiscal INT,
    lote_fornecedor TEXT NOT NULL,
    quantidade NUMERIC(14, 4) NOT NULL,
    unidade TEXT NOT NULL DEFAULT 'KG',
    data_entrada DATE NOT NULL,
    data_validade DATE,
    data_laudo DATE NOT NULL DEFAULT CURRENT_DATE,
    parecer TEXT NOT NULL DEFAULT 'APROVADO', -- APROVADO, REPROVADO, QUARENTENA
    responsavel_cq TEXT NOT NULL,
    testes JSONB NOT NULL DEFAULT '[]'::jsonb,
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_mp_laudo_cod ON recebimento_mp_laudos(codigo_laudo);
CREATE INDEX IF NOT EXISTS idx_rec_mp_laudo_reg ON recebimento_mp_laudos(registro_erp);
CREATE INDEX IF NOT EXISTS idx_rec_mp_laudo_lote ON recebimento_mp_laudos(lote_fornecedor);

CREATE TABLE IF NOT EXISTS recebimento_mp_amostras (
    id SERIAL PRIMARY KEY,
    codigo_amostra TEXT UNIQUE NOT NULL, -- ex: AMO-MP-2026-0001
    codigo_laudo TEXT,
    registro_erp INT,
    codigo_insumo TEXT NOT NULL,
    descricao_insumo TEXT NOT NULL,
    fornecedor TEXT NOT NULL,
    lote_fornecedor TEXT NOT NULL,
    data_entrada DATE NOT NULL,
    data_validade DATE,
    quantidade_retida TEXT NOT NULL, -- ex: 100g, 250ml
    local_armazenamento TEXT, -- Armário A, Prateleira 2
    status TEXT NOT NULL DEFAULT 'RETIDA', -- RETIDA, EM_ANALISE, DESCARTADA
    responsavel TEXT NOT NULL,
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_mp_amostra_cod ON recebimento_mp_amostras(codigo_amostra);
CREATE INDEX IF NOT EXISTS idx_rec_mp_amostra_lote ON recebimento_mp_amostras(lote_fornecedor);

-- Migration: 031_procs_produtos.sql
-- Tabela para armazenamento e gestão de PROCs de Produtos (Processos ANVISA / Processos de Fabricação)

CREATE TABLE IF NOT EXISTS procs_produtos (
    id VARCHAR(64) PRIMARY KEY,
    codigo_produto VARCHAR(64),
    descricao TEXT NOT NULL,
    proc VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'EM_BRANCO', -- 'ATIVO', 'EM_BRANCO', 'CANCELADO', 'VENCIDO'
    observacoes TEXT,
    categoria_familia VARCHAR(64),
    processo_instrucoes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_procs_produtos_codigo ON procs_produtos(codigo_produto);
CREATE INDEX IF NOT EXISTS idx_procs_produtos_status ON procs_produtos(status);
CREATE INDEX IF NOT EXISTS idx_procs_produtos_proc ON procs_produtos(proc);
CREATE INDEX IF NOT EXISTS idx_procs_produtos_categoria ON procs_produtos(categoria_familia);

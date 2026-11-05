-- Agente não cria subcategoria direto: propõe, e o supervisor aprova na tela Organização (decisão do Edson, 2026-11-04).
CREATE TABLE IF NOT EXISTS compras_subcategoria_propostas (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    parent_id TEXT NOT NULL REFERENCES categories(id),
    periodo INTEGER,
    motivo TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'recusada')),
    proposto_por TEXT NOT NULL,
    proposto_por_nome TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decidido_por TEXT,
    decidido_em TIMESTAMPTZ,
    motivo_decisao TEXT,
    categoria_id TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_compras_subcat_proposta_pendente
    ON compras_subcategoria_propostas (parent_id, lower(btrim(nome))) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_compras_subcat_proposta_status ON compras_subcategoria_propostas (status, created_at DESC);

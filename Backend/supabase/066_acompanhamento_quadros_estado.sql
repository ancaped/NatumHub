-- Estado dos quadros do Acompanhamento de Produção (ordem manual, concluídos, liberados, filas manuais, caldeira...).
-- Antes vivia no localStorage de cada navegador; agora é do servidor, igual para todos os operadores.
CREATE TABLE IF NOT EXISTS acompanhamento_quadros_estado (
    chave TEXT PRIMARY KEY,
    valor JSONB NOT NULL DEFAULT 'null'::jsonb,
    atualizado_por TEXT,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quem mudou o quê (inclui a migração única do que já estava nos navegadores: origem = 'migrado do navegador').
CREATE TABLE IF NOT EXISTS acompanhamento_quadros_estado_historico (
    id BIGSERIAL PRIMARY KEY,
    chave TEXT NOT NULL,
    valor_anterior JSONB,
    valor_novo JSONB,
    origem TEXT NOT NULL DEFAULT 'tela',
    autor TEXT,
    em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_acomp_quadros_hist_chave_em ON acompanhamento_quadros_estado_historico (chave, em DESC);

-- 091_avarias_catalogos.sql
-- Locais e motivos das Avarias passam do localStorage de cada navegador para o banco (lista única).
-- Os valores abaixo eram os padrões da tela; o que cada máquina tinha a mais é enviado pela própria tela na primeira abertura.
-- Aditiva e idempotente.
CREATE TABLE IF NOT EXISTS qualidade_avaria_catalogo (
    id BIGSERIAL PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('local', 'motivo')),
    nome TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_qualidade_avaria_catalogo ON qualidade_avaria_catalogo (kind, lower(nome));

INSERT INTO qualidade_avaria_catalogo (kind, nome, sort_order, created_by)
SELECT v.kind, v.nome, v.ord, 'sistema (migração 091)'
FROM (VALUES
    ('local', 'Corredor da produção', 1),
    ('local', 'Doca expedição', 2),
    ('local', 'Bancada CQ', 3),
    ('local', 'Quarentena', 4),
    ('local', 'Armazém geral', 5),
    ('local', 'Triagem devolução', 6),
    ('local', 'Estoque produtos acabados', 7),
    ('motivo', 'Troca de lote', 1),
    ('motivo', 'Remarcar lote', 2),
    ('motivo', 'Troca de embalagem / frasco', 3),
    ('motivo', 'Troca de tampa / lacre', 4),
    ('motivo', 'Rótulo danificado', 5),
    ('motivo', 'Vazamento', 6),
    ('motivo', 'Devolução de cliente', 7),
    ('motivo', 'Pendente de análise CQ', 8),
    ('motivo', 'Produto vencido / validade', 9),
    ('motivo', 'Sobra de processo', 10)
) AS v(kind, nome, ord)
ON CONFLICT (kind, lower(nome)) DO NOTHING;

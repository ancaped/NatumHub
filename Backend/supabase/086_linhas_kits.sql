-- 086_linhas_kits.sql
-- Linhas de kits: classificação própria dos kits (Kits Natum, Kits Hair...), separada das linhas de produto.
-- Cada linha lista os prefixos de código (1º segmento) que a sugerem; `kits_linha` guarda a correção manual por kit.
-- A composição do kit continua só no ERP: aqui só se liga o kit a uma linha.
-- Idempotente: este arquivo roda em todo boot (SCHEMA_FILES).
CREATE TABLE IF NOT EXISTS linhas_kits (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    prefixos TEXT[] NOT NULL DEFAULT '{}',
    ordem INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS kits_linha (
    kit_codigo TEXT PRIMARY KEY,
    linha_kit_id TEXT NOT NULL REFERENCES linhas_kits(id) ON DELETE CASCADE,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::TEXT
);

INSERT INTO linhas_kits (id, nome, prefixos, ordem) VALUES
('natum', 'Kits Natum', ARRAY['1'], 1),
('hair', 'Kits Hair', ARRAY['2'], 2),
('liss_shine', 'Kits Liss Shine', ARRAY['10'], 3),
('salon_fine', 'Kits Salon Fine', ARRAY['62'], 4),
('consultoras', 'Kits Consultoras', ARRAY['19'], 5)
ON CONFLICT (id) DO NOTHING;

-- 075_pops_controle_documentos.sql
-- POPs fase 2b: controle de documentos dos formulários (aprovação, vigência, histórico completo) e trilha de eventos.
-- Só aditiva: nada é apagado nem sobrescrito. Idempotente (IF NOT EXISTS).

-- As duas tabelas dos formulários também nascem aqui (em produção já existem, criadas pelo serviço).
CREATE TABLE IF NOT EXISTS pop_formularios (
    code TEXT PRIMARY KEY,
    pop_code TEXT NOT NULL,
    title TEXT NOT NULL,
    previous_code TEXT,
    periodicity TEXT NOT NULL,
    areas JSONB NOT NULL DEFAULT '[]',
    fields JSONB NOT NULL DEFAULT '[]',
    limits TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    revision INTEGER NOT NULL DEFAULT 0,
    orientation TEXT NOT NULL DEFAULT 'portrait',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pop_formulario_revisoes (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    revision INTEGER NOT NULL,
    pop_code TEXT NOT NULL,
    title TEXT NOT NULL,
    orientation TEXT NOT NULL,
    motivo TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pop_formularios ADD COLUMN IF NOT EXISTS orientation TEXT NOT NULL DEFAULT 'portrait';
ALTER TABLE pop_formularios ADD COLUMN IF NOT EXISTS effective_date DATE;
ALTER TABLE pop_formularios ADD COLUMN IF NOT EXISTS next_review_date DATE;
ALTER TABLE pop_formularios ADD COLUMN IF NOT EXISTS elaborated_by TEXT;
ALTER TABLE pop_formularios ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE pop_formularios ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE pop_formularios ADD COLUMN IF NOT EXISTS rows_per_sheet INTEGER;
ALTER TABLE pop_formularios ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Cada publicação guarda o formulário inteiro (colunas, áreas, limites, vigência, quem aprovou).
ALTER TABLE pop_formulario_revisoes ADD COLUMN IF NOT EXISTS snapshot JSONB;
ALTER TABLE pop_formulario_revisoes ADD COLUMN IF NOT EXISTS created_by TEXT;
CREATE INDEX IF NOT EXISTS idx_pop_formulario_revisoes_code ON pop_formulario_revisoes (code, revision DESC);

-- Trilha de eventos dos POPs e dos formulários. Nunca se apaga nem se altera.
CREATE TABLE IF NOT EXISTS pop_eventos (
    id BIGSERIAL PRIMARY KEY,
    tipo TEXT NOT NULL CHECK (tipo IN ('pop', 'formulario')),
    ref TEXT NOT NULL,
    acao TEXT NOT NULL,
    de_status TEXT,
    para_status TEXT,
    motivo TEXT,
    usuario TEXT NOT NULL DEFAULT '',
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pop_eventos_ref ON pop_eventos (tipo, ref, criado_em DESC);

CREATE OR REPLACE FUNCTION pop_eventos_imutavel() RETURNS trigger AS $f$
BEGIN
    RAISE EXCEPTION 'pop_eventos é uma trilha: não se altera nem se apaga';
END;
$f$ LANGUAGE plpgsql;

DO $t$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pop_eventos_imutavel') THEN
        CREATE TRIGGER trg_pop_eventos_imutavel
            BEFORE UPDATE OR DELETE ON pop_eventos
            FOR EACH ROW EXECUTE FUNCTION pop_eventos_imutavel();
    END IF;
END
$t$;

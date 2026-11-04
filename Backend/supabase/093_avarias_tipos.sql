-- 093_avarias_tipos.sql
-- Avarias passam a ter tipo: produto acabado (todos os registros atuais), matéria-prima, embalagem e material de processo.
-- Aditiva e idempotente.
ALTER TABLE qualidade_avarias ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'produto_acabado';
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qualidade_avarias_tipo_check') THEN
        ALTER TABLE qualidade_avarias ADD CONSTRAINT qualidade_avarias_tipo_check
            CHECK (tipo IN ('produto_acabado', 'materia_prima', 'embalagem', 'material_processo'));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_qualidade_avarias_tipo ON qualidade_avarias (tipo);

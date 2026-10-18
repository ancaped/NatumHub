-- Análise do que ficou sem destino na coleta, e quantas caixas saem na folha.

ALTER TABLE qualidade_avarias ADD COLUMN IF NOT EXISTS repair_type TEXT;
ALTER TABLE qualidade_avarias ADD COLUMN IF NOT EXISTS problema TEXT;
ALTER TABLE qualidade_avarias ADD COLUMN IF NOT EXISTS encaminhamento TEXT;
ALTER TABLE qualidade_avarias ADD COLUMN IF NOT EXISTS fq_necessaria BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE qualidade_avarias ADD COLUMN IF NOT EXISTS fq_resultado TEXT;
ALTER TABLE qualidade_avarias ADD COLUMN IF NOT EXISTS fq_observacao TEXT;

ALTER TABLE qualidade_avaria_folhas ADD COLUMN IF NOT EXISTS box_count INTEGER NOT NULL DEFAULT 1;

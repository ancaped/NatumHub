-- Regras de planejamento por produto (P6). NULL = comportamento automático de sempre.
ALTER TABLE overrides_produtos ADD COLUMN IF NOT EXISTS processo_termico TEXT;
ALTER TABLE overrides_produtos ADD COLUMN IF NOT EXISTS exclusivo_no_dia BOOLEAN;
ALTER TABLE overrides_produtos ADD COLUMN IF NOT EXISTS permite_bombona BOOLEAN;
ALTER TABLE overrides_produtos ADD COLUMN IF NOT EXISTS dias_ate_envase INTEGER;
ALTER TABLE overrides_produtos ADD COLUMN IF NOT EXISTS producao_minima_kg DOUBLE PRECISION;

-- Colunas que até aqui só nasciam em runtime (auth/store.rs::migrate_overrides_programadas_schema);
-- declaradas também na migração para um banco novo (CI) ter o mesmo esquema da produção.
ALTER TABLE overrides_produtos ADD COLUMN IF NOT EXISTS lancamento_gatilho BIGINT;
ALTER TABLE overrides_produtos ADD COLUMN IF NOT EXISTS lancamento_estoque_maximo BIGINT;
ALTER TABLE overrides_produtos ADD COLUMN IF NOT EXISTS familia_produto TEXT;

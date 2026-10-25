-- kg efetivamente descontados da base no lançamento (NULL = lançamento antigo, que descontou a quantidade em unidades).
ALTER TABLE historico_producao ADD COLUMN IF NOT EXISTS base_consumida_kg DOUBLE PRECISION;

-- A foto diária da duração passa a guardar também o consumo projetado pela produção planejada (Cobertura, próximas
-- 4 semanas), para comparar com a média histórica quando as fotos vencerem. NULL = não foi possível calcular o plano.
ALTER TABLE compras_duracao_snapshots ADD COLUMN IF NOT EXISTS consumo_projetado_28d DOUBLE PRECISION;

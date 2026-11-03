-- Bombonas: cada tamanho é um reator próprio, com id claro. Aditiva e idempotente (sem DROP/DELETE).
-- Renomeia em lugar os ids criados pela tela (R_NOVO_<timestamp>) e acerta o recipiente das ordens desses reatores.

UPDATE producao_reatores_config
SET id = 'BOMBONA_100'
WHERE id = 'R_NOVO_1792643467336'
  AND NOT EXISTS (SELECT 1 FROM producao_reatores_config WHERE id = 'BOMBONA_100');

UPDATE producao_reatores_config
SET id = 'BOMBONA_200'
WHERE id = 'R_NOVO_1792643468545'
  AND NOT EXISTS (SELECT 1 FROM producao_reatores_config WHERE id = 'BOMBONA_200');

UPDATE producao_planejamento_semanal
SET reator_id = 'BOMBONA_100'
WHERE reator_id = 'R_NOVO_1792643467336'
  AND EXISTS (SELECT 1 FROM producao_reatores_config WHERE id = 'BOMBONA_100');

UPDATE producao_planejamento_semanal
SET reator_id = 'BOMBONA_200'
WHERE reator_id = 'R_NOVO_1792643468545'
  AND EXISTS (SELECT 1 FROM producao_reatores_config WHERE id = 'BOMBONA_200');

-- Ordens antigas de BOMBONAS ficam como estão (histórico); só os reatores de bombona novos levam o nome do reator.
UPDATE producao_planejamento_semanal p
SET recipiente_detalhe = r.nome
FROM producao_reatores_config r
WHERE p.reator_id = r.id
  AND r.tipo = 'bombona'
  AND p.reator_id <> 'BOMBONAS'
  AND p.recipiente_detalhe IS DISTINCT FROM r.nome;

-- 068_reatores_sem_limite_diario.sql
-- Decisão do Edson (2026-10-27): a capacidade do reator limita só o tamanho de cada batelada (ordem), nunca o total do dia.
-- Sai o "Máx 1/dia" do Reator 100kg e o texto fixo "50kg, 100kg e 200kg" das Bombonas.
-- Aditivo e idempotente (roda em todo boot): só ajusta nomes ainda no texto de fábrica; não mexe nos reatores cadastrados
-- (as linhas de bombona que o Edson criou continuam).

UPDATE producao_reatores_config
SET nome = 'Reator 100kg (Resistência)'
WHERE id = 'R_100' AND nome = 'Reator 100kg (Resistência - Máx 1/dia)';

UPDATE producao_reatores_config
SET nome = 'Bombonas'
WHERE id = 'BOMBONAS' AND nome = 'Bombonas (50kg, 100kg, 200kg)';

-- Ficha técnica: regra de capacidade por batelada, sem limite diário.
UPDATE mapa_modules
SET detail = jsonb_set(
        COALESCE(detail, '{}'::jsonb),
        '{rules}',
        COALESCE((
            SELECT jsonb_agg(r) FROM jsonb_array_elements(COALESCE(detail->'rules', '[]'::jsonb)) AS r
            WHERE r::text NOT LIKE '%Reator 100kg: no máximo%'
              AND r::text NOT LIKE '%Bombona: até 200 kg%'
              AND r::text NOT LIKE '%Sugestão da semana parte%'
        ), '[]'::jsonb)
        || jsonb_build_array(
            'A capacidade do reator limita só o tamanho de cada batelada; o mesmo reator pode ter várias produções no dia (sem limite diário, inclusive Reator 100kg e Bombonas)',
            'Sugestão da semana parte da lista "Tudo p/ Produzir Hoje" do Gerenciamento, por urgência, sem limite de envase; divide em bateladas quando o kg passa da capacidade do reator compatível'
        )
    ),
    updated_at = NOW()
WHERE module_key = 'planejamento_producao';

UPDATE mapa_modules
SET detail = jsonb_set(
        detail,
        '{notes}',
        to_jsonb(replace(detail->>'notes', ' e Reator 100kg com no máximo 1 produção por dia', ' (sem limite de produções por dia no mesmo reator)')),
        false
    ),
    updated_at = NOW()
WHERE module_key = 'planejamento_producao' AND detail ? 'notes' AND detail->>'notes' LIKE '%Reator 100kg com no máximo 1 produção por dia%';

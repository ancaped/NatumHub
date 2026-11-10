-- 110_ficha_producao_sugestao_reator.sql
-- Ficha do Planejamento de Produção: sugestão pelo menor reator que cabe e regras de reator por produto (etapa C2 do plano de fluxo).
-- Aditiva e idempotente: acrescenta um ponto de atenção só se ainda não existir.

UPDATE mapa_modules SET
    detail = jsonb_set(
        detail,
        '{attention}',
        COALESCE(detail->'attention', '[]'::jsonb) || to_jsonb('Sugestão do Planejamento (Seguir sequência, etapa C2): cada batelada vai para o menor reator ativo em que a massa caiba (empate pela ordem do reator); só passando do maior reator compatível o produto é dividido em bateladas iguais e a prévia avisa. Usa as regras de reator do cadastro, inclusive para item da fila ou ordem do quadro de produto fora da Demanda: exclusivo_no_dia deixa o produto sozinho no dia (ordem exclusiva já no quadro também toma o dia; sem regra, AOX na descrição); permite_bombona libera a bombona (até 150 kg se quente, 200 kg se frio). A capacidade é validada por uma regra só no servidor (validar_capacidade), a mesma na gravação do modal, do arraste e da sugestão; o front só espelha para avisar na hora. Sem limite de ordens por dia no mesmo reator (decisão do Edson, 2026-10-27)'::text)
    ),
    updated_at = NOW()
WHERE module_key = 'planejamento_producao'
  AND NOT (COALESCE(detail->'attention', '[]'::jsonb) @> to_jsonb('Sugestão do Planejamento (Seguir sequência, etapa C2): cada batelada vai para o menor reator ativo em que a massa caiba (empate pela ordem do reator); só passando do maior reator compatível o produto é dividido em bateladas iguais e a prévia avisa. Usa as regras de reator do cadastro, inclusive para item da fila ou ordem do quadro de produto fora da Demanda: exclusivo_no_dia deixa o produto sozinho no dia (ordem exclusiva já no quadro também toma o dia; sem regra, AOX na descrição); permite_bombona libera a bombona (até 150 kg se quente, 200 kg se frio). A capacidade é validada por uma regra só no servidor (validar_capacidade), a mesma na gravação do modal, do arraste e da sugestão; o front só espelha para avisar na hora. Sem limite de ordens por dia no mesmo reator (decisão do Edson, 2026-10-27)'::text));

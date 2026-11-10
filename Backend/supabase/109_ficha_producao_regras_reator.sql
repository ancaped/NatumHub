-- 109_ficha_producao_regras_reator.sql
-- Ficha do Planejamento de Produção: regras de reator como dados, com dono e endpoint próprio (etapa C1 do plano de fluxo).
-- Aditiva e idempotente: acrescenta um ponto de atenção só se ainda não existir.

UPDATE mapa_modules SET
    detail = jsonb_set(
        detail,
        '{attention}',
        COALESCE(detail->'attention', '[]'::jsonb) || to_jsonb(
            'Dono das regras de reator por produto: processo_termico (quente/frio), exclusivo_no_dia, permite_bombona e dias_ate_envase (vazio = automático) são alterados só pela ação definir_regras_reator_produto (POST /api/producao/produtos/regras-reator, corpo com codigo + os campos desejados, null limpa; 2 passos com confirmar=true; auditoria com antes e depois em producao_auditoria). Valores são sempre do Edson, nunca preenchidos por agente. O drawer Regras & Parâmetros PCP grava esses quatro campos por essa ação e não mais pelo POST /api/overrides. A sugestão e a validação de alocação ainda não usam os campos novos além do que já usavam (etapa C2)'::text
        )
    ),
    updated_at = NOW()
WHERE module_key = 'planejamento_producao'
  AND NOT (COALESCE(detail->'attention', '[]'::jsonb) @> to_jsonb('Dono das regras de reator por produto: processo_termico (quente/frio), exclusivo_no_dia, permite_bombona e dias_ate_envase (vazio = automático) são alterados só pela ação definir_regras_reator_produto (POST /api/producao/produtos/regras-reator, corpo com codigo + os campos desejados, null limpa; 2 passos com confirmar=true; auditoria com antes e depois em producao_auditoria). Valores são sempre do Edson, nunca preenchidos por agente. O drawer Regras & Parâmetros PCP grava esses quatro campos por essa ação e não mais pelo POST /api/overrides. A sugestão e a validação de alocação ainda não usam os campos novos além do que já usavam (etapa C2)'::text));

-- 090_ficha_administrativo_atualiza.sql
-- Atualiza dois pontos de atenção da ficha da Linha de Produtos que ficaram velhos: a aba Configurações foi
-- revista e virou componente próprio, e o arquivo grande caiu de tamanho. Idempotente: só age sobre o texto antigo.

UPDATE mapa_modules SET
    detail = jsonb_set(
        detail,
        '{attention}',
        jsonb_build_array(
            'ActiveProductsView.tsx tem cerca de 2.500 linhas; as demais abas ainda moram nele (Configurações já é componente próprio)',
            'Lista de kits só traz kits ativos: kit oculto não aparece até ser reativado',
            'Decisões 11 a 16 da revisão R1 (produto ativo e base com definição única, graduação, dias comerciais, quem edita) aguardam o Edson'
        )
    ),
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND detail->'attention'->>0 = 'ActiveProductsView.tsx passa de 2.600 linhas; quebrar por aba';

UPDATE mapa_modules SET
    detail = jsonb_set(
        detail,
        '{notes}',
        to_jsonb(replace(
            detail->>'notes',
            E'- ActiveProductsView.tsx passa de 2.600 linhas; quebrar por aba.\n- Aba Configurações ainda não foi revista.\n',
            E'- ActiveProductsView.tsx tem cerca de 2.500 linhas; as demais abas ainda moram nele (Configurações já é componente próprio).\n'
        ))
    ),
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND detail->>'notes' LIKE '%Aba Configurações ainda não foi revista%';

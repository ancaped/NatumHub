-- 092_ficha_administrativo_atualiza2.sql
-- Ponto de atenção da ficha da Linha de Produtos depois de extrair as abas Configurações, Audit, Kits e Definição
-- de Linhas do arquivo grande. Idempotente: só age sobre o texto da migração 090.

UPDATE mapa_modules SET
    detail = jsonb_set(
        detail,
        '{attention}',
        jsonb_build_array(
            'ActiveProductsView.tsx (cerca de 1.500 linhas) guarda a aba Status dos Produtos e os painéis de produto e de novo kit; as outras abas são componentes próprios (ConfiguracoesTab, AuditOverridesTab, KitsTab, LinhasTab)',
            'Lista de kits só traz kits ativos: kit oculto não aparece até ser reativado',
            'Decisões 11 a 16 da revisão R1 (produto ativo e base com definição única, graduação, dias comerciais, quem edita) aguardam o Edson'
        )
    ),
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND detail->'attention'->>0 = 'ActiveProductsView.tsx tem cerca de 2.500 linhas; as demais abas ainda moram nele (Configurações já é componente próprio)';

UPDATE mapa_modules SET
    detail = jsonb_set(
        detail,
        '{notes}',
        to_jsonb(replace(
            detail->>'notes',
            E'- ActiveProductsView.tsx tem cerca de 2.500 linhas; as demais abas ainda moram nele (Configurações já é componente próprio).\n',
            E'- ActiveProductsView.tsx (cerca de 1.500 linhas) guarda a aba Status dos Produtos e os painéis de produto e de novo kit; as outras abas são componentes próprios.\n'
        ))
    ),
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND detail->>'notes' LIKE '%tem cerca de 2.500 linhas%';

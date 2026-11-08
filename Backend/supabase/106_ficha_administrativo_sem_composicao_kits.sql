-- 106_ficha_administrativo_sem_composicao_kits.sql
-- Ficha da Linha de Produtos depois de tirar a aba Composição de Kits: a composição (ver, importar do Excel,
-- compor kit novo) fica só em Produção > Kits; o Administrativo mantém a Linha de Kits e um atalho.
-- Idempotente: só age sobre o texto anterior.

UPDATE mapa_modules SET
    detail = jsonb_set(
        detail,
        '{tabs}',
        (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
           FROM jsonb_array_elements(detail->'tabs') AS t
          WHERE t->>'id' <> 'kits')
    ),
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(detail->'tabs') AS t WHERE t->>'id' = 'kits');

UPDATE mapa_modules SET
    detail = jsonb_set(
        detail,
        '{attention}',
        jsonb_build_array(
            'Cada seção é um componente (StatusTab, LinhasTab, LinhasKitsTab, AuditOverridesTab, ConfiguracoesTab); ActiveProductsView.tsx guarda o menu retrátil (no celular vira uma faixa de abas), a leitura dos dados e a prévia das ações',
            'A composição dos kits NÃO é editada aqui: ver, importar do Excel e compor kit novo ficam em Produção > Kits; o Administrativo só mostra o atalho (kit na lista de Produtos e painel da Linha de Kits), escondido para quem não tem acesso a Produção > Kits',
            'Lista de kits só traz kits ativos: kit oculto não aparece até ser reativado',
            'Decisões 11 a 16 da revisão R1 (produto ativo e base com definição única, graduação, dias comerciais, quem edita) aguardam o Edson'
        )
    ),
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND detail->'attention'->>0 LIKE 'Cada seção é um componente (StatusTab, LinhasTab, LinhasKitsTab, KitsTab%';

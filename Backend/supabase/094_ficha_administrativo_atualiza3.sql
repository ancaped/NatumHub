-- 094_ficha_administrativo_atualiza3.sql
-- Ponto de atenção da ficha da Linha de Produtos depois de extrair também a aba Status dos Produtos:
-- ActiveProductsView.tsx virou só o menu e a leitura dos dados. Idempotente: só age sobre o texto da migração 092.

UPDATE mapa_modules SET
    detail = jsonb_set(
        detail,
        '{attention}',
        jsonb_build_array(
            'Cada aba é um componente (StatusTab, LinhasTab, KitsTab, AuditOverridesTab, ConfiguracoesTab); ActiveProductsView.tsx guarda só o menu, a leitura dos dados e os painéis de composição e novo kit',
            'Lista de kits só traz kits ativos: kit oculto não aparece até ser reativado',
            'Decisões 11 a 16 da revisão R1 (produto ativo e base com definição única, graduação, dias comerciais, quem edita) aguardam o Edson'
        )
    ),
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND detail->'attention'->>0 LIKE 'ActiveProductsView.tsx (cerca de 1.500 linhas)%';

UPDATE mapa_modules SET
    detail = jsonb_set(
        detail,
        '{notes}',
        to_jsonb(replace(
            detail->>'notes',
            E'- ActiveProductsView.tsx (cerca de 1.500 linhas) guarda a aba Status dos Produtos e os painéis de produto e de novo kit; as outras abas são componentes próprios.\n',
            E'- Cada aba é um componente próprio; ActiveProductsView.tsx guarda só o menu, a leitura dos dados e os painéis de composição e novo kit.\n'
        ))
    ),
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND detail->>'notes' LIKE '%cerca de 1.500 linhas%';

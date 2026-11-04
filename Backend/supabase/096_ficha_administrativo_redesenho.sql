-- 096_ficha_administrativo_redesenho.sql
-- Ficha da Linha de Produtos depois do redesenho: seis seções (a nova é Linhas de Kits), edição em lote
-- em Produtos e painel da linha com seus produtos. Idempotente: só age sobre o texto anterior.

UPDATE mapa_modules SET
    detail = jsonb_set(
        detail,
        '{tabs}',
        jsonb_build_array(
            jsonb_build_object('id', 'status', 'label', 'Produtos', 'desc', 'Catálogo com visões (Todos, Ativos, Kits, Bases, Terceirizados, Sem linha, Ajuste manual), filtros e edição em lote de status, linha e categoria/subcategoria com prévia.'),
            jsonb_build_object('id', 'linhas', 'label', 'Linhas', 'desc', 'Linhas de produto por prefixo; o painel da linha lista os produtos dela (mover de linha e mudar status em lote) e os parâmetros; aviso de prefixos sem linha.'),
            jsonb_build_object('id', 'linhaskits', 'label', 'Linhas de Kits', 'desc', 'Mesmo desenho das linhas de produto: tabela e painel com as abas Kits (mover kits de linha em lote) e Configuração (nome e prefixos).'),
            jsonb_build_object('id', 'kits', 'label', 'Composição de Kits', 'desc', 'Kits ativos com a linha de kits e a composição vinda do ERP.'),
            jsonb_build_object('id', 'overrides', 'label', 'Audit de Overrides', 'desc', 'Ajustes manuais por produto, filtro por tipo de ajuste e limpeza do status redundante.'),
            jsonb_build_object('id', 'configuracoes', 'label', 'Configurações', 'desc', 'Parâmetros globais, status ignorados (com prévia) e subcategorias.')
        )
    ),
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND detail->'tabs'->0->>'label' = 'Status dos Produtos';

UPDATE mapa_modules SET
    detail = jsonb_set(
        detail,
        '{attention}',
        jsonb_build_array(
            'Cada seção é um componente (StatusTab, LinhasTab, LinhasKitsTab, KitsTab, AuditOverridesTab, ConfiguracoesTab); ActiveProductsView.tsx guarda o menu retrátil (modo mini), a leitura dos dados e os painéis de composição e novo kit',
            'Lista de kits só traz kits ativos: kit oculto não aparece até ser reativado',
            'Decisões 11 a 16 da revisão R1 (produto ativo e base com definição única, graduação, dias comerciais, quem edita) aguardam o Edson'
        )
    ),
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND detail->'attention'->>0 LIKE 'Cada aba é um componente (StatusTab, LinhasTab, KitsTab%';

UPDATE mapa_modules SET
    detail = jsonb_set(
        detail,
        '{notes}',
        to_jsonb(replace(
            detail->>'notes',
            E'- Cada aba é um componente próprio; ActiveProductsView.tsx guarda só o menu, a leitura dos dados e os painéis de composição e novo kit.\n',
            E'- Cada seção é um componente próprio; ActiveProductsView.tsx guarda o menu retrátil, a leitura dos dados e os painéis de composição e novo kit.\n- Edição em lote (Produtos, painel da Linha e painel da Linha de Kits) é sempre em 2 passos: escolher o novo valor, ver a prévia antes e depois e só então gravar.\n'
        ))
    ),
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND detail->>'notes' LIKE '%- Cada aba é um componente próprio; ActiveProductsView.tsx guarda só o menu%';

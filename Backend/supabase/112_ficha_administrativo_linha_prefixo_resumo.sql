-- 112_ficha_administrativo_linha_prefixo_resumo.sql
-- Ficha da Linha de Produtos: troca de prefixo em 2 passos e aba Resumo da linha.
-- Aditiva e idempotente: acrescenta pontos de atenção só se ainda não existirem.

UPDATE mapa_modules SET
    detail = jsonb_set(
        detail,
        '{attention}',
        COALESCE(detail->'attention', '[]'::jsonb) || to_jsonb('Troca de prefixo da linha (aba Parâmetros do painel): ação renomear_prefixo_linha (POST /api/admin/produtos-ativos/linhas/prefixo, 2 passos com confirmar=true, auditoria com antes e depois). A prévia lista quem entra e quem sai da linha com o prefixo novo e quantos ajustes manuais de linha e regras de produção da linha acompanham; grava numa transação só. Recusa prefixo vazio, DEFAULT e prefixo já usado por outra linha (09.15 e 9.15 contam como o mesmo)'::text)
    ),
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND NOT (COALESCE(detail->'attention', '[]'::jsonb) @> to_jsonb('Troca de prefixo da linha (aba Parâmetros do painel): ação renomear_prefixo_linha (POST /api/admin/produtos-ativos/linhas/prefixo, 2 passos com confirmar=true, auditoria com antes e depois). A prévia lista quem entra e quem sai da linha com o prefixo novo e quantos ajustes manuais de linha e regras de produção da linha acompanham; grava numa transação só. Recusa prefixo vazio, DEFAULT e prefixo já usado por outra linha (09.15 e 9.15 contam como o mesmo)'::text));

UPDATE mapa_modules SET
    detail = jsonb_set(
        detail,
        '{attention}',
        COALESCE(detail->'attention', '[]'::jsonb) || to_jsonb('Aba Resumo do painel da linha (só leitura): GET /api/admin/produtos-ativos/linhas/:prefixo/resumo. Vendas em unidades dos 12 meses fechados (historico_faturamento guarda só o número do mês, sem ano) e produtos que mais vendem; estoque, abaixo do gatilho e faltas de venda vindos da lista da Demanda de Produção (sem kits, bases, coloração, apoio, ocultos, descontinuados e terceirizados); produção lançada dos últimos 6 meses (historico_producao), planejado do Planejamento Semanal e fila de demandas. Sem faturamento em R$'::text)
    ),
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND NOT (COALESCE(detail->'attention', '[]'::jsonb) @> to_jsonb('Aba Resumo do painel da linha (só leitura): GET /api/admin/produtos-ativos/linhas/:prefixo/resumo. Vendas em unidades dos 12 meses fechados (historico_faturamento guarda só o número do mês, sem ano) e produtos que mais vendem; estoque, abaixo do gatilho e faltas de venda vindos da lista da Demanda de Produção (sem kits, bases, coloração, apoio, ocultos, descontinuados e terceirizados); produção lançada dos últimos 6 meses (historico_producao), planejado do Planejamento Semanal e fila de demandas. Sem faturamento em R$'::text));

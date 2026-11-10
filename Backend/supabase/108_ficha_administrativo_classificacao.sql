-- 108_ficha_administrativo_classificacao.sql
-- Ficha da Linha de Produtos: a classificação do produto (status, categoria, base, linha) tem dono e endpoint próprio.
-- Aditiva e idempotente: acrescenta um ponto de atenção só se ainda não existir.

UPDATE mapa_modules SET
    detail = jsonb_set(
        detail,
        '{attention}',
        COALESCE(detail->'attention', '[]'::jsonb) || to_jsonb(
            'Dono da classificação do produto: status, categoria, base e linha são alterados só aqui (Linha de Produtos), pela ação classificar_produto (POST /api/admin/produtos-ativos/classificacao, 2 passos com confirmar=true, auditoria com antes e depois). Produção e Compras mostram esses campos só para leitura (etapas B2 e B3 do plano de fluxo); o POST /api/overrides genérico ainda os aceita até a etapa B4'::text
        )
    ),
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND NOT (COALESCE(detail->'attention', '[]'::jsonb) @> to_jsonb('Dono da classificação do produto: status, categoria, base e linha são alterados só aqui (Linha de Produtos), pela ação classificar_produto (POST /api/admin/produtos-ativos/classificacao, 2 passos com confirmar=true, auditoria com antes e depois). Produção e Compras mostram esses campos só para leitura (etapas B2 e B3 do plano de fluxo); o POST /api/overrides genérico ainda os aceita até a etapa B4'::text));

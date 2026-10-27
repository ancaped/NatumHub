-- 069_mapa_ordens_manuais.sql
-- Ficha do módulo Ordens Manuais no mapa (o catálogo de ações já cita estoque_ordens_manuais; o seed do mapa só roda em banco vazio).
-- Aditivo e idempotente: só insere se ainda não existir.
INSERT INTO mapa_modules (module_key, group_key, label, purpose, status, sort_order, pos_x, pos_y, frontend_path, backend_path, router_prefix, ai_hints, detail)
SELECT
    'estoque_ordens_manuais',
    'estoque',
    'Ordens Manuais',
    'Saídas e entradas manuais de insumos (CSI/CEI) que ajustam a previsão até serem lançadas no ERP, e o registro das folhas físicas.',
    'live',
    60,
    760.0, 520.0,
    'Frontend/src/modules/estoque/ordens_manuais/',
    'Backend/src/modules/estoque/ordens_manuais/',
    '/api/estoque/ordens-manuais',
    '["ordem manual", "CSI", "CEI", "folhas físicas", "previsão futura"]'::jsonb,
    '{
        "notes": "Ordem manual OPEN entra na Previsão Futura do MRP; ao ser lançada no ERP (POSTED) sai da conta, porque o próximo sync já traz o estoque.",
        "regras": [
            "Toda gravação em 2 passos (sem confirmar=true devolve a prévia) e auditada",
            "Postar e reabrir ordem mostram a prévia do servidor antes de gravar"
        ]
    }'::jsonb
WHERE EXISTS (SELECT 1 FROM mapa_groups WHERE key = 'estoque')
  AND NOT EXISTS (SELECT 1 FROM mapa_modules WHERE module_key = 'estoque_ordens_manuais');

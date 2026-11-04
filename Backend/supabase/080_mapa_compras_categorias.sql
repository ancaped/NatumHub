-- 080_mapa_compras_categorias.sql
-- Módulo de permissão compras_categorias no mapa (o catálogo de ações já o cita; o seed do mapa só roda em banco vazio).
-- Aditivo e idempotente: só insere se ainda não existir.
INSERT INTO mapa_modules (module_key, group_key, label, purpose, status, sort_order, frontend_path, backend_path, router_prefix)
SELECT
    'compras_categorias',
    'compras',
    'Categorias',
    'Permissão sem tela: libera ao agente de IA criar e renomear subcategorias de Compras, em 2 passos e auditado.',
    'live',
    90,
    NULL,
    'Backend/src/modules/compras/planejamento/commands/',
    '/api/hub/compras/categorias'
WHERE EXISTS (SELECT 1 FROM mapa_groups WHERE key = 'compras')
  AND NOT EXISTS (SELECT 1 FROM mapa_modules WHERE module_key = 'compras_categorias');

-- 104_mapa_rotas_sem_dono.sql
-- A ficha gerada do código (central Desenvolvimento) liga cada rota a um módulo pelo router_prefix. ~90 rotas ficavam
-- sem dono porque o módulo que as atende já tinha outro prefixo. router_prefix agora aceita vários, separados por
-- vírgula (mapa/gerado.rs: vale o maior que casa). Esta migração só ACRESCENTA prefixos: nunca apaga nem troca o que
-- já existe, e não repete um prefixo que o módulo já tem (idempotente).
-- Fica sem dono de propósito: /api/produtos/* (usada por Compras, Estoque, Produção e Vendas) e /api/*resto (reserva).

-- Compras: rotas do hub em hub_api/compras.rs (fornecedores, cotações, listas, demandas, itens...)
UPDATE mapa_modules
SET router_prefix = CASE WHEN COALESCE(router_prefix, '') = '' THEN '/api/hub/compras' ELSE router_prefix || ', /api/hub/compras' END,
    updated_at = NOW()
WHERE module_key = 'compras'
  AND COALESCE(router_prefix, '') NOT LIKE '%/api/hub/compras%';

-- Categorias de compras: o prefixo gravado na 080 era '/api/hub/compras/categorias', mas as rotas são '/categories'
UPDATE mapa_modules
SET router_prefix = CASE WHEN COALESCE(router_prefix, '') = '' THEN '/api/hub/compras/categories' ELSE router_prefix || ', /api/hub/compras/categories' END,
    updated_at = NOW()
WHERE module_key = 'compras_categorias'
  AND COALESCE(router_prefix, '') NOT LIKE '%/api/hub/compras/categories%';

-- Montagem de Kits: ordens e fórmulas de conversão
UPDATE mapa_modules
SET router_prefix = CASE WHEN COALESCE(router_prefix, '') = '' THEN '/api/turnovers' ELSE router_prefix || ', /api/turnovers' END,
    updated_at = NOW()
WHERE module_key = 'montagem_kits'
  AND COALESCE(router_prefix, '') NOT LIKE '%/api/turnovers%';

-- Linha de Produtos: configuração das linhas, overrides por produto e checagem de graduação
UPDATE mapa_modules
SET router_prefix = CASE WHEN COALESCE(router_prefix, '') = '' THEN '/api/configs' ELSE router_prefix || ', /api/configs' END,
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND COALESCE(router_prefix, '') NOT LIKE '%/api/configs%';
UPDATE mapa_modules
SET router_prefix = CASE WHEN COALESCE(router_prefix, '') = '' THEN '/api/overrides' ELSE router_prefix || ', /api/overrides' END,
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND COALESCE(router_prefix, '') NOT LIKE '%/api/overrides%';
UPDATE mapa_modules
SET router_prefix = CASE WHEN COALESCE(router_prefix, '') = '' THEN '/api/lancamento' ELSE router_prefix || ', /api/lancamento' END,
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND COALESCE(router_prefix, '') NOT LIKE '%/api/lancamento%';

-- Configurações: importação do ERP e controle do servidor
UPDATE mapa_modules
SET router_prefix = CASE WHEN COALESCE(router_prefix, '') = '' THEN '/api/import' ELSE router_prefix || ', /api/import' END,
    updated_at = NOW()
WHERE module_key = 'hub_settings'
  AND COALESCE(router_prefix, '') NOT LIKE '%/api/import%';
UPDATE mapa_modules
SET router_prefix = CASE WHEN COALESCE(router_prefix, '') = '' THEN '/api/server-manager' ELSE router_prefix || ', /api/server-manager' END,
    updated_at = NOW()
WHERE module_key = 'hub_settings'
  AND COALESCE(router_prefix, '') NOT LIKE '%/api/server-manager%';
UPDATE mapa_modules
SET router_prefix = CASE WHEN COALESCE(router_prefix, '') = '' THEN '/server-control' ELSE router_prefix || ', /server-control' END,
    updated_at = NOW()
WHERE module_key = 'hub_settings'
  AND COALESCE(router_prefix, '') NOT LIKE '%/server-control%';

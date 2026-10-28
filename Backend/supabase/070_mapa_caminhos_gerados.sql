-- 070_mapa_caminhos_gerados.sql
-- A ficha da central Desenvolvimento agora é gerada do código (telas, rotas, tabelas, chamadas): ela liga o código ao módulo
-- pelo frontend_path / backend_path / router_prefix de mapa_modules. Esta migração só PREENCHE caminhos vazios e corrige
-- dois prefixos sabidamente errados. Aditiva e idempotente: nunca sobrescreve um caminho já preenchido com outro valor.

-- Módulos que existiam no mapa sem nenhum caminho
UPDATE mapa_modules SET
    frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/estoque/ordens_manuais/'),
    backend_path  = COALESCE(backend_path,  'Backend/src/modules/estoque/ordens_manuais/'),
    router_prefix = COALESCE(router_prefix, '/api/estoque/ordens-manuais')
WHERE module_key = 'estoque_ordens_manuais';

UPDATE mapa_modules SET
    frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/financeiro/'),
    backend_path  = COALESCE(backend_path,  'Backend/src/modules/financeiro/'),
    router_prefix = COALESCE(router_prefix, '/api/financeiro')
WHERE module_key = 'financeiro';

UPDATE mapa_modules SET
    frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/producao/proc/'),
    backend_path  = COALESCE(backend_path,  'Backend/src/modules/producao/proc/'),
    router_prefix = COALESCE(router_prefix, '/api/producao/proc')
WHERE module_key = 'producao_proc';

UPDATE mapa_modules SET
    frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/producao/bases/'),
    backend_path  = COALESCE(backend_path,  'Backend/src/modules/producao/bases.rs')
WHERE module_key = 'producao_bases';

UPDATE mapa_modules SET
    frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/vendas/vendas_geral/'),
    router_prefix = COALESCE(router_prefix, '/api/vendas')
WHERE module_key = 'vendas';

UPDATE mapa_modules SET
    frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/vendas/vendas_online/')
WHERE module_key = 'vendas_online';

UPDATE mapa_modules SET frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/qualidade/controle/')      WHERE module_key = 'controle_qualidade';
UPDATE mapa_modules SET frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/qualidade/treinamentos/')  WHERE module_key = 'qualidade_treinamentos';
UPDATE mapa_modules SET frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/qualidade/temperatura/')   WHERE module_key = 'qualidade_temperatura';
UPDATE mapa_modules SET frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/qualidade/limpeza/')       WHERE module_key = 'qualidade_limpeza';

-- Prefixos que não existem no servidor (as rotas reais são /api/kits, /api/hub/fisco e /api/hub/microbio)
UPDATE mapa_modules SET
    router_prefix = '/api/kits',
    backend_path  = 'Backend/src/modules/producao/kits.rs'
WHERE module_key = 'montagem_kits' AND router_prefix = '/api/producao/montagem-kits';

UPDATE mapa_modules SET
    router_prefix = '/api/hub/fisco',
    backend_path  = 'Backend/src/modules/hub_api/fisco.rs'
WHERE module_key = 'fisco_quimica' AND router_prefix = '/api/producao/fisco-quimica';

UPDATE mapa_modules SET
    router_prefix = '/api/hub/microbio',
    backend_path  = 'Backend/src/modules/hub_api/microbio.rs'
WHERE module_key = 'microbiologia' AND router_prefix = '/api/producao/microbiologia';

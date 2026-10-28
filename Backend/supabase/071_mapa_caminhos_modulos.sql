-- 071_mapa_caminhos_modulos.sql
-- A ficha gerada do código (D1) liga telas e rotas ao módulo pelos caminhos de mapa_modules. Em produção vários módulos estavam
-- sem nenhum caminho (Produção, Kits, Compras, Estoque, POPs, Recebimento MP, Microbiologia, Físico-Química, Expedição…).
-- Aditiva e idempotente: só PREENCHE caminhos vazios (COALESCE); nunca troca um caminho já preenchido.
UPDATE mapa_modules SET frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/producao/gerenciamento/'),
    backend_path = COALESCE(backend_path, 'Backend/src/modules/producao/'), router_prefix = COALESCE(router_prefix, '/api/producao')
WHERE module_key = 'producao';
UPDATE mapa_modules SET frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/producao/lotes/'),
    backend_path = COALESCE(backend_path, 'Backend/src/modules/producao/lotes.rs'), router_prefix = COALESCE(router_prefix, '/api/producao/lotes')
WHERE module_key = 'producao_lotes';
UPDATE mapa_modules SET frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/producao/montagem_kits/'),
    backend_path = COALESCE(backend_path, 'Backend/src/modules/producao/kits.rs'), router_prefix = COALESCE(router_prefix, '/api/kits')
WHERE module_key = 'montagem_kits';
UPDATE mapa_modules SET frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/producao/microbiologia/'),
    backend_path = COALESCE(backend_path, 'Backend/src/modules/hub_api/microbio.rs'), router_prefix = COALESCE(router_prefix, '/api/hub/microbio')
WHERE module_key = 'microbiologia';
UPDATE mapa_modules SET frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/producao/fisco_quimica/'),
    backend_path = COALESCE(backend_path, 'Backend/src/modules/hub_api/fisco.rs'), router_prefix = COALESCE(router_prefix, '/api/hub/fisco')
WHERE module_key = 'fisco_quimica';
UPDATE mapa_modules SET frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/qualidade/pops/'),
    backend_path = COALESCE(backend_path, 'Backend/src/modules/qualidade/pops/'), router_prefix = COALESCE(router_prefix, '/api/qualidade/pops')
WHERE module_key = 'qualidade_pops';
UPDATE mapa_modules SET frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/qualidade/recebimento_mp/'),
    backend_path = COALESCE(backend_path, 'Backend/src/modules/qualidade/recebimento_mp/'), router_prefix = COALESCE(router_prefix, '/api/qualidade/recebimento-mp')
WHERE module_key = 'qualidade_recebimento_mp';
UPDATE mapa_modules SET frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/compras/planejamento/'),
    backend_path = COALESCE(backend_path, 'Backend/src/modules/compras/planejamento/'), router_prefix = COALESCE(router_prefix, '/api/compras')
WHERE module_key = 'compras_materia_prima';
UPDATE mapa_modules SET frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/compras/controle_pedidos/'),
    router_prefix = COALESCE(router_prefix, '/api/compras/pedidos')
WHERE module_key = 'compras_pedidos';
UPDATE mapa_modules SET frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/compras/notas_fiscais/'),
    router_prefix = COALESCE(router_prefix, '/api/compras/notas')
WHERE module_key = 'compras_notas';
UPDATE mapa_modules SET frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/estoque/estoque_geral/'),
    backend_path = COALESCE(backend_path, 'Backend/src/modules/estoque/estoque_geral/'), router_prefix = COALESCE(router_prefix, '/api/estoque')
WHERE module_key = 'estoque_materia_prima';
UPDATE mapa_modules SET frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/estoque/equipamentos/')
WHERE module_key = 'estoque_equipamentos';
UPDATE mapa_modules SET frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/estoque/manutencoes/')
WHERE module_key = 'estoque_manutencoes';
UPDATE mapa_modules SET frontend_path = COALESCE(frontend_path, 'Frontend/src/modules/expedicao/'),
    backend_path = COALESCE(backend_path, 'Backend/src/modules/expedicao/'), router_prefix = COALESCE(router_prefix, '/api/expedicao')
WHERE module_key = 'expedicao_ecommerce';

-- 048_quadros_confiaveis_ficha.sql
-- Ficha técnica dos quadros de produção (Acompanhamento) e conexão com o Planejamento.
-- Idempotente: este arquivo roda em todo boot (SCHEMA_FILES).

INSERT INTO mapa_modules (
    module_key, group_key, label, purpose, status, sort_order,
    frontend_path, backend_path, router_prefix, detail
)
SELECT
    'admin_acompanhamento_producao',
    'administrativo',
    'Acompanhamento de Produção',
    'Quadros de Pesagem, Produção, Rotulagem, Envase, Ordens e Terceirizados. Lê as ordens do Planejamento Semanal e o andamento de cada lote.',
    'live',
    20,
    'Frontend/src/modules/administrativo/acompanhamento_producao/',
    'Backend/src/modules/administrativo/acompanhamento_producao/',
    '/api/administrativo',
    jsonb_build_object(
        'notes', 'O lote é identificado por COALESCE(lote_erp, id da ordem): enquanto o lote ERP não é vinculado, a ordem aparece como PLAN_x. Lotes em espera não aparecem nos quadros diários; vão para a aba Em Espera do Banco de Demandas (Planejamento). A busca remota de lotes (3+ caracteres) traz lotes do ERP que ainda não estão nos quadros. A tela Auditoria de lotes (GET /api/administrativo/acompanhamento-producao/auditoria, somente leitura) lista possíveis duplicatas: ordem do planejamento sem lote ERP perto de um lote ERP já mexido, lote ERP digitado que não existe e o mesmo lote + produto em mais de uma ordem.',
        'tables', jsonb_build_array('lote_custom_status', 'producao_planejamento_semanal', 'programacao_envase', 'programacao_rotulagem', 'stock_movements', 'erp_lotes_laudos'),
        'rules', jsonb_build_array(
            'Em espera sai dos quadros diários e vai para o Banco de Demandas',
            'Ordem planejada aparece em Pesagem e Produção sem aprovação prévia',
            'O andamento por etapa fica em etapas_status; custom_status é só o rótulo grosso',
            'Auto-OK às 18h roda no navegador (isPastEndOfDay) e não grava no banco'
        )
    )
WHERE EXISTS (SELECT 1 FROM mapa_groups WHERE key = 'administrativo')
ON CONFLICT (module_key) DO UPDATE SET
    purpose = EXCLUDED.purpose,
    frontend_path = EXCLUDED.frontend_path,
    backend_path = EXCLUDED.backend_path,
    router_prefix = EXCLUDED.router_prefix,
    detail = mapa_modules.detail || EXCLUDED.detail,
    updated_at = NOW();

INSERT INTO mapa_edges (id, from_key, to_key, kind, note) VALUES
('edge_planejamento_quadros', 'planejamento_producao', 'admin_acompanhamento_producao', 'flow', 'Ordem planejada entra nos quadros de Pesagem e Produção')
ON CONFLICT (from_key, to_key, kind) DO NOTHING;

-- 046_planejamento_semanal_integridade.sql
-- Identificador estável da batelada conjunta e ficha do módulo de planejamento.

ALTER TABLE producao_planejamento_semanal ADD COLUMN IF NOT EXISTS batch_id TEXT;
CREATE INDEX IF NOT EXISTS idx_planejamento_batch ON producao_planejamento_semanal (batch_id);

UPDATE producao_planejamento_semanal
SET batch_id = substring(observacoes from '\[batch:([^\]]+)\]')
WHERE batch_id IS NULL
  AND observacoes ~ '\[batch:';

-- Espelha a ficha técnica. O quadro semanal vive só em Planejamento de Produção.
INSERT INTO mapa_modules (
    module_key, group_key, label, purpose, status, sort_order,
    frontend_path, backend_path, router_prefix, detail
)
SELECT
    'planejamento_producao',
    group_key,
    'Planejamento de Produção',
    'Quadro semanal de reatores. Toda ordem planejada entra automaticamente em Pesagem e Produção. Envase e rotulagem são programados à parte.',
    'live',
    15,
    'Frontend/src/modules/producao/planejamento/',
    'Backend/src/handlers/producao.rs',
    '/api/producao',
    jsonb_build_object(
        'notes', 'Status da ordem: planejado, aprovado ou cancelado. Aprovar é só o OK do PCP e não tira a ordem dos quadros. O lote ERP é digitado ou buscado; não há lançamento automático no histórico. Produção de segunda a sexta. Sábado é só envase. Uma demanda por SKU: devolução soma o saldo e agendamento parcial deixa o restante na fila. Excluir é bloqueado se a ordem já está em envase, rotulagem ou avançou além da pesagem.',
        'tabs', jsonb_build_array(
            jsonb_build_object('id', 'planejamento_semanal', 'label', 'Planejamento Semanal', 'desc', 'Reatores por dia, fila de demandas e sugestão'),
            jsonb_build_object('id', 'quadro_pesagem', 'label', 'Quadro de Pesagem'),
            jsonb_build_object('id', 'quadro_producao', 'label', 'Quadro de Produção'),
            jsonb_build_object('id', 'quadro_rotulagem', 'label', 'Quadro de Rotulagem'),
            jsonb_build_object('id', 'quadro_envase', 'label', 'Quadro de Envase'),
            jsonb_build_object('id', 'quadro_ordens', 'label', 'Quadro de Ordens')
        ),
        'tables', jsonb_build_array('producao_planejamento_semanal', 'producao_fila_demandas', 'producao_reatores_config', 'lote_custom_status'),
        'rules', jsonb_build_array(
            'Item planejado aparece em Pesagem e Produção sem aprovação prévia',
            'Reator 100kg: no máximo 1 ordem por dia',
            'Bombona: até 200 kg',
            'Sem ordenação automática por cor',
            'Os quadros leem reatorId do planejamento'
        )
    )
FROM mapa_modules
WHERE module_key = 'producao'
ON CONFLICT (module_key) DO UPDATE SET
    purpose = EXCLUDED.purpose,
    frontend_path = EXCLUDED.frontend_path,
    backend_path = EXCLUDED.backend_path,
    router_prefix = EXCLUDED.router_prefix,
    detail = mapa_modules.detail || EXCLUDED.detail,
    updated_at = NOW();

UPDATE mapa_modules
SET detail = jsonb_set(
        COALESCE(detail, '{}'::jsonb),
        '{notes}',
        to_jsonb('Gerenciamento de demandas, bases e kits. O quadro semanal ficou apenas no módulo Planejamento de Produção.'::text),
        true
    ),
    updated_at = NOW()
WHERE module_key = 'producao';

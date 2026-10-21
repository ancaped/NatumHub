-- 047_planejamento_integridade_ficha.sql
-- Ficha técnica do Planejamento de Produção após o ciclo de integridade e conexões arquiteturais.
-- Idempotente: este arquivo roda em todo boot (SCHEMA_FILES).

UPDATE mapa_modules
SET detail = COALESCE(detail, '{}'::jsonb) || jsonb_build_object(
        'notes', 'Status da ordem: planejado, aprovado ou cancelado (cancelado não ocupa reator). Aprovar é só o OK do PCP e não tira a ordem dos quadros. O servidor valida a alocação (HTTP 422): capacidade do reator pela massa da batelada e Reator 100kg com no máximo 1 produção por dia; a semana ISO (week_key) é calculada no servidor a partir da data. Salvar uma ou várias ordens roda em uma transação. Os flags físicos só mudam quando enviados. O usuário logado é gravado no histórico de reagendamento. Os reatores editados na tela não são sobrescritos no boot. Excluir é bloqueado (HTTP 409) se a ordem está em envase, rotulagem ou avançou além da pesagem. A demanda da fila só é consumida depois que a ordem gravou, sempre pelo id da fila; agendamento parcial deixa o saldo.',
        'rules', jsonb_build_array(
            'Item planejado aparece em Pesagem e Produção sem aprovação prévia',
            'Reator 100kg: no máximo 1 produção por dia (batelada conjunta conta como uma)',
            'A massa da batelada não pode passar da capacidade do reator; Bombona usa a capacidade configurada (200 kg)',
            'Gravação em lote (PUT /bulk) é atômica: entram todas as ordens ou nenhuma',
            'PATCH e DELETE da fila de demandas usam só o id e respondem 404 se ele não existe',
            'Sem ordenação automática por cor',
            'Os quadros leem reatorId do planejamento'
        )
    ),
    updated_at = NOW()
WHERE module_key = 'planejamento_producao';

INSERT INTO mapa_edges (id, from_key, to_key, kind, note) VALUES
('edge_prod_planejamento', 'producao', 'planejamento_producao', 'data', 'Fila de demandas do Gerenciamento alimenta o quadro semanal de reatores'),
('edge_planejamento_lotes', 'planejamento_producao', 'producao_lotes', 'flow', 'Ordem planejada vira lote nos quadros de Pesagem e Produção')
ON CONFLICT (from_key, to_key, kind) DO NOTHING;

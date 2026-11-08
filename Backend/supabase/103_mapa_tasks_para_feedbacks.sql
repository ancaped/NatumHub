-- Fila única (Desenvolvimento, decisão do Edson 2026-11-08): as tarefas abertas da fila do mapa (mapa_tasks)
-- passam para a fila de feedbacks, na triagem, ligadas ao módulo quando a tarefa o informa. A tarefa original
-- fica no banco marcada como concluída, com a observação de para onde foi. Idempotente: na segunda vez não há
-- tarefa aberta, e o id 'mapa_<id>' não duplica.
INSERT INTO feedbacks (id, "type", description, page, logs, screenshot, status, "createdAt", requested_by, priority, module_key)
SELECT
    'mapa_' || t.id,
    'feedback',
    t.title
        || CASE WHEN COALESCE(t.notes, '') <> '' THEN E'\n\n' || t.notes ELSE '' END
        || CASE WHEN t.targets <> '[]'::jsonb THEN E'\n\nArquivos: ' || t.targets::text ELSE '' END
        || CASE WHEN t.acceptance <> '[]'::jsonb THEN E'\nPronto quando: ' || t.acceptance::text ELSE '' END
        || E'\n\n(veio da fila do mapa, tipo ' || t.type || ')',
    'Desenvolvimento',
    '',
    '',
    'pending',
    t.created_at::text,
    COALESCE(t.created_by, 'mapa'),
    100,
    NULLIF(t.payload #>> '{module,key}', '')
FROM mapa_tasks t
WHERE t.status = 'open'
ON CONFLICT (id) DO NOTHING;

UPDATE mapa_tasks
SET status = 'done',
    done_at = NOW(),
    notes = COALESCE(notes, '') || ' [movida para feedbacks como mapa_' || id || ']'
WHERE status = 'open';

-- 054_producao_insumos_sem_controle.sql
-- Insumos que o Edson marcou como "sem controle de estoque" (ex.: o que a fábrica produz e o ERP nunca recebe).
-- SÓ ele decide quais: nada é marcado por regra ou heurística. Marcado = a cobertura não acusa falta dele
-- (Compras/MRP não mudam). Idempotente: roda em todo boot (SCHEMA_FILES).

CREATE TABLE IF NOT EXISTS producao_insumos_sem_controle (
    codigo TEXT PRIMARY KEY,
    marcado_por TEXT,
    marcado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

UPDATE mapa_modules
SET detail = COALESCE(detail, '{}'::jsonb) || jsonb_build_object(
        'insumos_sem_controle', jsonb_build_object(
            'rotas', jsonb_build_array(
                'GET /api/producao/insumos-sem-controle',
                'PUT /api/producao/insumos-sem-controle (sem confirmar=true só devolve a prévia)'
            ),
            'regras', jsonb_build_array(
                'Só o Edson marca ou desmarca; nunca automático nem por heurística',
                'Marcado: a cobertura e o relatório de faltas não mostram falta desse insumo; Compras/MRP continuam iguais',
                'Toda marcação/desmarcação é auditada (producao_auditoria)'
            ),
            'arquivos', jsonb_build_array('Backend/src/modules/producao/insumos_sem_controle.rs')
        )
    ),
    updated_at = NOW()
WHERE module_key = 'planejamento_producao';

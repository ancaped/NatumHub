-- 055_producao_insumos_classificacao.sql
-- Classificação de insumos decidida SÓ pelo Edson (nunca automática): OK (padrão, sem linha), Sem controle,
-- Não usado mais e Trocado (a troca vive em producao_trocas_insumo). Idempotente (roda em todo boot).

ALTER TABLE producao_insumos_sem_controle ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'sem_controle';

UPDATE mapa_modules
SET detail = COALESCE(detail, '{}'::jsonb) || jsonb_build_object(
        'insumos_classificacao', jsonb_build_object(
            'rotas', jsonb_build_array(
                'GET /api/producao/insumos-classificacao',
                'PUT /api/producao/insumos-classificacao (sem confirmar=true só devolve a prévia)',
                'GET /api/producao/insumos-classificacao/buscar?q='
            ),
            'regras', jsonb_build_array(
                'Classes: OK (padrão), Sem controle, Não usado mais, Trocado; só o Edson classifica',
                'Sem controle e Não usado mais: a cobertura não acusa falta e Compras não recomenda compra (continua visível com etiqueta)',
                'Trocado exige o insumo substituto e o escopo (todos os produtos ou só um produto); usa producao_trocas_insumo',
                'Voltar a OK remove a classificação e as trocas do insumo; tudo auditado em producao_auditoria'
            ),
            'arquivos', jsonb_build_array('Backend/src/modules/producao/insumos_classificacao.rs')
        )
    ),
    updated_at = NOW()
WHERE module_key = 'planejamento_producao';

-- 050_producao_decisoes.sql
-- Memória das decisões do Edson no Gerenciamento de Produção (só sugere; nunca escreve no ERP nem na fórmula)
-- e origem da base em cada ordem do planejamento. Idempotente: roda em todo boot (SCHEMA_FILES).

CREATE TABLE IF NOT EXISTS producao_decisoes (
    tipo TEXT NOT NULL,
    chave TEXT NOT NULL,
    valor TEXT NOT NULL DEFAULT '',
    vezes INTEGER NOT NULL DEFAULT 1,
    atualizado_por TEXT,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tipo, chave)
);

-- 'explodir' (padrão: a base vira matérias-primas) | 'estoque' (base pronta) | 'ordem_base' (há ordem da base)
ALTER TABLE producao_planejamento_semanal ADD COLUMN IF NOT EXISTS base_fonte TEXT NOT NULL DEFAULT 'explodir';

UPDATE mapa_modules
SET detail = COALESCE(detail, '{}'::jsonb) || jsonb_build_object(
        'decisoes', jsonb_build_object(
            'rotas', jsonb_build_array(
                'PUT /api/producao/cobertura/ordens/:id/base-fonte',
                'GET /api/producao/decisoes?tipo=',
                'PUT /api/producao/decisoes',
                'DELETE /api/producao/decisoes?tipo=&chave='
            ),
            'regras', jsonb_build_array(
                'base_fonte por ordem: explodir (padrão), estoque (base pronta) ou ordem_base (a ordem da base baixa os insumos); estoque e ordem_base não explodem a base',
                'A base é reconhecida pela fórmula (ingrediente com fórmula própria); o nome (ex.: base nh12) é só complemento',
                'producao_decisoes(tipo, chave) guarda a última escolha do Edson; só sugere, ele confirma sempre; sem expiração'
            ),
            'arquivos', jsonb_build_array(
                'Backend/src/modules/producao/decisoes.rs',
                'Backend/src/modules/producao/cobertura/calc.rs (base_fonte)'
            )
        )
    ),
    updated_at = NOW()
WHERE module_key = 'planejamento_producao';

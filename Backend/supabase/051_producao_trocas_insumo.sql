-- 051_producao_trocas_insumo.sql
-- Trocas de insumo decididas pelo Edson (ex.: DC 245 -> DC 242). Não alteram o ERP nem a fórmula:
-- só mudam a previsão de consumo (Cobertura de Insumos e, depois, Compras/MRP) e geram o aviso persistente
-- para corrigir a composição. produto_codigo NULL = vale para todos os produtos. Idempotente (roda em todo boot).

CREATE TABLE IF NOT EXISTS producao_trocas_insumo (
    id BIGSERIAL PRIMARY KEY,
    insumo_de TEXT NOT NULL,
    insumo_para TEXT NOT NULL,
    produto_codigo TEXT,
    criado_por TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (insumo_de <> insumo_para)
);

-- uma troca por insumo e escopo (todos os produtos ou um produto)
CREATE UNIQUE INDEX IF NOT EXISTS ux_producao_trocas_insumo_escopo
    ON producao_trocas_insumo (insumo_de, COALESCE(produto_codigo, ''));

UPDATE mapa_modules
SET detail = COALESCE(detail, '{}'::jsonb) || jsonb_build_object(
        'trocas_insumo', jsonb_build_object(
            'rotas', jsonb_build_array(
                'GET /api/producao/trocas',
                'POST /api/producao/trocas',
                'DELETE /api/producao/trocas/:id'
            ),
            'regras', jsonb_build_array(
                'Troca de insumo NÃO altera o ERP nem a fórmula: muda a previsão de consumo (Cobertura e Compras/MRP)',
                'Vale para todos os produtos por padrão; pode ser limitada a um produto (a troca do produto vence a geral)',
                'Aviso persistente enquanto alguma composição ainda usa o insumo trocado: corrigir a fórmula (trocar o insumo, ou excluir e adicionar o correto)',
                'Equivalentes vêm de similar_items; a troca é uma só etapa (X->Y, sem encadear)',
                'Compras/MRP lê as mesmas trocas: collect_sim_producao_contributions troca o insumo da previsão de consumo (demands.rs)'
            ),
            'arquivos', jsonb_build_array(
                'Backend/src/modules/producao/trocas.rs',
                'Backend/src/modules/producao/cobertura/calc.rs (aplicar_trocas, codigo_trocado, equivalentes)',
                'Backend/src/modules/compras/planejamento/commands/demands.rs (aplicar_trocas_contribuicoes)'
            )
        )
    ),
    updated_at = NOW()
WHERE module_key = 'planejamento_producao';

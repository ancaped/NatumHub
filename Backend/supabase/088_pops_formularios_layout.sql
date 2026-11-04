-- 088_pops_formularios_layout.sql
-- Cabeçalho da folha configurável pelo editor (Setor/Área e Equipamento/ID ligados ou desligados), em vez de regra no código.
-- Largura de coluna fica dentro de `fields` (chave `width`), sem coluna nova. Aditiva e idempotente.
ALTER TABLE pop_formularios ADD COLUMN IF NOT EXISTS layout JSONB NOT NULL DEFAULT '{}';

-- FOR-PRD-047 já imprimia só o Mês/Ano (regra fixa no código, decisão do Edson de 2026-11-04). Passa a ser dado, na tabela
-- e na cópia de cada revisão publicada, para a impressão continuar igual. Só onde ainda não há layout definido.
UPDATE pop_formularios SET layout = '{"showArea": false, "showEquip": false}'::jsonb
 WHERE code IN ('FOR-PRD-047-01', 'FOR-PRD-047-02') AND layout = '{}'::jsonb;
UPDATE pop_formulario_revisoes SET snapshot = jsonb_set(snapshot, '{layout}', '{"showArea": false, "showEquip": false}'::jsonb)
 WHERE code IN ('FOR-PRD-047-01', 'FOR-PRD-047-02') AND snapshot IS NOT NULL AND NOT (snapshot ? 'layout');

-- 085_for_prd_047_colunas.sql
-- FOR-PRD-047 (reatores e reservatórios): as duas folhas passam a ter as colunas do laudo em papel — Data, Reator/tanque, Lote,
-- Responsável, Controle de Qualidade (decisão do Edson, 2026-11-04). Aplica UMA vez, só em rascunho, e registra na trilha.
-- Formulário já aprovado não é reescrito aqui: documento controlado só muda por revisão nova, pelo editor.
DO $$
DECLARE
    r RECORD;
    v_campos CONSTANT JSONB := '[
        {"label":"Data","kind":"data","limit":null},
        {"label":"Reator/tanque","kind":"texto","limit":null},
        {"label":"Lote","kind":"texto","limit":null},
        {"label":"Responsável","kind":"rubrica","limit":null},
        {"label":"Controle de Qualidade","kind":"rubrica","limit":null}
    ]'::jsonb;
BEGIN
    FOR r IN SELECT code FROM pop_formularios WHERE code IN ('FOR-PRD-047-01', 'FOR-PRD-047-02') AND status = 'draft' LOOP
        IF NOT EXISTS (SELECT 1 FROM pop_eventos WHERE tipo = 'formulario' AND ref = r.code AND acao = 'ajuste_migracao_085') THEN
            UPDATE pop_formularios SET fields = v_campos, updated_at = NOW() WHERE code = r.code;
            INSERT INTO pop_eventos (tipo, ref, acao, de_status, para_status, motivo, usuario)
            VALUES ('formulario', r.code, 'ajuste_migracao_085', 'draft', 'draft',
                    'Colunas do laudo em papel: Data, Reator/tanque, Lote, Responsável, Controle de Qualidade — decisão do Edson em 04/11/2026', 'sistema (migração 085)');
        END IF;
    END LOOP;
END $$;

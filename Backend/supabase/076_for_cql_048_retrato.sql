-- 076_for_cql_048_retrato.sql
-- FOR-CQL-048 (temperatura e umidade, diário): o mês inteiro numa folha — em pé com 31 linhas (decisão do Edson, 2026-10-30;
-- deitada, 31 linhas ficariam com ~4 mm). Aplica UMA vez, só em rascunho, e registra na trilha; edição posterior pelo editor prevalece.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pop_formularios WHERE code = 'FOR-CQL-048-01' AND status = 'draft')
       AND NOT EXISTS (SELECT 1 FROM pop_eventos WHERE tipo = 'formulario' AND ref = 'FOR-CQL-048-01' AND acao = 'ajuste_migracao_076') THEN
        UPDATE pop_formularios SET orientation = 'portrait', rows_per_sheet = 31, updated_at = NOW()
        WHERE code = 'FOR-CQL-048-01';
        INSERT INTO pop_eventos (tipo, ref, acao, de_status, para_status, motivo, usuario)
        VALUES ('formulario', 'FOR-CQL-048-01', 'ajuste_migracao_076', 'draft', 'draft',
                'Folha em pé com 31 linhas (mês inteiro numa folha) — decisão do Edson em 30/10/2026', 'sistema (migração 076)');
    END IF;
END $$;

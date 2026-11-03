-- 077_pops_formularios_especificacoes.sql
-- Especificações do formulário: o texto fixo que o Word original traz abaixo da tabela de registro (soluções de limpeza,
-- frequência, orientação) e que faltou na importação. Aditiva e idempotente.
ALTER TABLE pop_formularios ADD COLUMN IF NOT EXISTS specifications TEXT;

-- Correção de importação (não é revisão nova): preenche uma vez, só onde ainda está vazio, e grava um evento por formulário.
-- Textos extraídos dos .docx originais por scripts/extrair_especificacoes_formularios.py (uma especificação por linha).
-- Não repete se o evento já existe (quem apagar o texto depois pelo editor não o vê voltar).
DO $$
DECLARE
    glut CONSTANT TEXT := $t$Limpeza Comum: Solução de Glutaraldeído 2%
Limpeza para produtos Coloridos: Lauril 5%, Microstat 0,1%, Água Qsp.
Limpeza para produtos com fortes Odores: Quaternario de Amônio 0,5%, Ácido Cítrico 0,1% Água Qsp$t$;
    v_motivo CONSTANT TEXT := 'Especificações do formulário original (Word) que faltaram na importação';
    r RECORD;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('FOR-PRD-047-01', glut),
            ('FOR-PRD-047-02', glut),
            ('FOR-PRD-058-01', glut),
            ('FOR-CQL-035-07', $t$Limpeza quinzenal: Material utilizado: Descongelamento / Limpeza interna e Externa: água e sabão neutro (quando necessario) e solução de álcool 70ºc$t$),
            ('FOR-CQL-074-01', $t$Troca Semanal: Pré-Filtro (F6 Cinza)
Troca Quinzenal: Filtro (G3 Branco)$t$),
            ('FOR-CQL-029-01', $t$Observações/Anormalidades: No caso de haver incrustações resistentes ao procedimento de limpeza padrão, Deixar em imersão em água com detergente a 3% e água sanitária a 5%, por 30 minutos ou mais, se necessário.$t$)
        ) AS v(code, texto)
    LOOP
        IF EXISTS (SELECT 1 FROM pop_formularios WHERE code = r.code AND specifications IS NULL)
           AND NOT EXISTS (SELECT 1 FROM pop_eventos WHERE tipo = 'formulario' AND ref = r.code
                              AND acao = 'correcao_importacao' AND motivo = v_motivo) THEN
            UPDATE pop_formularios SET specifications = r.texto WHERE code = r.code;
            -- a cópia da revisão vigente (última publicada) também recebe o texto, se a chave ainda não existe
            UPDATE pop_formulario_revisoes SET snapshot = jsonb_set(snapshot, '{specifications}', to_jsonb(r.texto::text))
             WHERE code = r.code AND snapshot IS NOT NULL AND NOT (snapshot ? 'specifications')
               AND revision = (SELECT MAX(revision) FROM pop_formulario_revisoes WHERE code = r.code AND snapshot IS NOT NULL);
            INSERT INTO pop_eventos (tipo, ref, acao, de_status, para_status, motivo, usuario)
            SELECT 'formulario', f.code, 'correcao_importacao', f.status, f.status, v_motivo, 'sistema'
              FROM pop_formularios f WHERE f.code = r.code;
        END IF;
    END LOOP;
END $$;

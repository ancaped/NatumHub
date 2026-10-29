-- 072_pops_codigos.sql
-- Padroniza os códigos dos POPs: POP-<SETOR>-<NNN> (decisão do Edson, 2026-10-29).
-- Aditiva e idempotente: só renomeia quando o código novo ainda não existe; nunca apaga.
INSERT INTO pop_sectors (id, name, sort_order)
SELECT 'cql', 'Controle de Qualidade', 70
WHERE NOT EXISTS (SELECT 1 FROM pop_sectors WHERE id = 'cql' OR lower(trim(name)) = lower('Controle de Qualidade'));

-- POP 001 e 002 (Elaboração e Revalidação do POP) passam para o setor ADM.
UPDATE pop_documents SET code = 'POP-ADM-001', sector_id = 'adm', updated_at = NOW()
WHERE code = 'POP-001' AND EXISTS (SELECT 1 FROM pop_sectors WHERE id = 'adm')
  AND NOT EXISTS (SELECT 1 FROM pop_documents d2 WHERE d2.code = 'POP-ADM-001');
UPDATE pop_documents SET code = 'POP-ADM-002', sector_id = 'adm', updated_at = NOW()
WHERE code = 'POP-002' AND EXISTS (SELECT 1 FROM pop_sectors WHERE id = 'adm')
  AND NOT EXISTS (SELECT 1 FROM pop_documents d2 WHERE d2.code = 'POP-ADM-002');

-- POP 043 (Rastreabilidade) existe em PRD e EXP: fica o de PRD; o de EXP vira obsoleto (não se apaga).
UPDATE pop_documents SET status = 'obsolete', updated_at = NOW()
WHERE code = 'POP-EXP-043' AND status <> 'obsolete';

-- Qualquer outro código fora do padrão POP-<SETOR>-<NNN> com número de 1 ou 2 dígitos: completa com zeros.
UPDATE pop_documents SET code = regexp_replace(code, '^(POP-[A-Z]{3})-(\d{1,2})$', '\1-') || lpad(substring(code from '(\d{1,2})$'), 3, '0'),
    updated_at = NOW()
WHERE code ~ '^POP-[A-Z]{3}-\d{1,2}$'
  AND NOT EXISTS (
      SELECT 1 FROM pop_documents d2
      WHERE d2.code = regexp_replace(pop_documents.code, '^(POP-[A-Z]{3})-(\d{1,2})$', '\1-') || lpad(substring(pop_documents.code from '(\d{1,2})$'), 3, '0')
  );

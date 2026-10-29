-- 073_pops_codigos_antigos.sql
-- A importação criou POP-ADM-001/002 enquanto POP-001/002 (setor Elaboração) continuavam.
-- O texto é o mesmo. O código canônico é o de ADM (decisão de 2026-10-29). O antigo fica obsoleto, sem apagar.
UPDATE pop_documents SET status = 'obsolete', updated_at = NOW()
WHERE code = 'POP-001' AND status <> 'obsolete'
  AND EXISTS (SELECT 1 FROM pop_documents d2 WHERE d2.code = 'POP-ADM-001');

UPDATE pop_documents SET status = 'obsolete', updated_at = NOW()
WHERE code = 'POP-002' AND status <> 'obsolete'
  AND EXISTS (SELECT 1 FROM pop_documents d2 WHERE d2.code = 'POP-ADM-002');

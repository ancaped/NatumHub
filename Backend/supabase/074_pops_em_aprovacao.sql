-- 074_pops_em_aprovacao.sql
-- Fase 3: rascunho → em aprovação → vigente → obsoleto.
ALTER TABLE pop_documents DROP CONSTRAINT IF EXISTS pop_documents_status_check;
ALTER TABLE pop_documents
    ADD CONSTRAINT pop_documents_status_check
    CHECK (status IN ('draft', 'in_review', 'published', 'obsolete'));

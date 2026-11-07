-- Os lançamentos de conversão (vira) também são guardados em kit_erp_lancamentos, com tipo conversao/reversao.
-- Só troca a regra de validação do campo `tipo`; nenhum dado é apagado ou alterado. Idempotente.
ALTER TABLE kit_erp_lancamentos DROP CONSTRAINT IF EXISTS kit_erp_lancamentos_tipo_check;
ALTER TABLE kit_erp_lancamentos
    ADD CONSTRAINT kit_erp_lancamentos_tipo_check
    CHECK (tipo IN ('montagem', 'desmontagem', 'conversao', 'reversao'));

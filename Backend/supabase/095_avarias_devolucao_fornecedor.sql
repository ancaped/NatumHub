-- 095_avarias_devolucao_fornecedor.sql
-- Avarias de matéria-prima/embalagem: novo destino "devolução ao fornecedor" e campos fornecedor e NF de entrada.
-- Aditiva e idempotente.
ALTER TABLE qualidade_avarias ADD COLUMN IF NOT EXISTS fornecedor TEXT;
ALTER TABLE qualidade_avarias ADD COLUMN IF NOT EXISTS nf_entrada TEXT;
ALTER TABLE qualidade_avarias DROP CONSTRAINT IF EXISTS qualidade_avarias_status_check;
ALTER TABLE qualidade_avarias ADD CONSTRAINT qualidade_avarias_status_check
    CHECK (status IN ('em_analise', 'retorno_estoque', 'reparo', 'embalagem', 'descarte', 'devolucao_fornecedor', 'outro'));

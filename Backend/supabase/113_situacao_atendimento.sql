-- 113_situacao_atendimento.sql
-- L1 do plano da Linha de Produtos (decisão do Edson, 2026-11-10): Situação e Atendimento viram dois campos.
-- Situação: ativo, lançamento, saindo de linha, inativo (guardado como "descontinuado", um valor só).
-- Atendimento: estoque (gera demanda), encomenda e terceirizado (não geram demanda automática). Padrão na linha, exceção no produto.
-- Aditiva e idempotente: só colunas novas e UPDATE de quem ainda não foi convertido. `status_produto` NÃO muda:
-- Produção e Compras seguem lendo esse campo, que passa a ser mantido como espelho da regra (core/regras_produto.rs).
ALTER TABLE config_linhas ADD COLUMN IF NOT EXISTS atendimento TEXT NOT NULL DEFAULT 'estoque';
ALTER TABLE overrides_produtos ADD COLUMN IF NOT EXISTS situacao TEXT;
ALTER TABLE overrides_produtos ADD COLUMN IF NOT EXISTS atendimento TEXT;

-- Quem hoje é "terceirizado" passa a situação ativo + atendimento terceirizado; o status espelho continua "terceirizado".
UPDATE overrides_produtos
SET situacao = CASE WHEN status_produto = 'terceirizado' THEN 'ativo' ELSE COALESCE(NULLIF(BTRIM(status_produto), ''), 'ativo') END,
    atendimento = CASE WHEN status_produto = 'terceirizado' THEN COALESCE(atendimento, 'terceirizado') ELSE atendimento END
WHERE situacao IS NULL;

-- 133_expedicao_alocacao_cubagem_amarracao.sql
-- Suporte a orientação/amarração por alocação e empilhamento misto (caixa diferente sobre outra no mesmo palete).

ALTER TABLE expedicao_alocacoes
    ADD COLUMN IF NOT EXISTS orientacao_modo TEXT NOT NULL DEFAULT 'auto'
        CHECK (orientacao_modo IN ('auto', 'normal', 'rotacionado', 'amarracao')),
    ADD COLUMN IF NOT EXISTS empilhado_sobre TEXT;

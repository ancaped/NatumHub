-- Lançamentos de montagem/desmontagem de kit gravados no ERP (ENTDEV / ENTDEVINS).
-- `backup_antes` guarda o saldo em cache (Produtos/Insumos.nQtdeEstoque) dos itens tocados ANTES de gravar,
-- e `linhas` o que foi inserido: dá para conferir ou desfazer à mão. Aditiva e idempotente.
CREATE TABLE IF NOT EXISTS kit_erp_lancamentos (
    id BIGSERIAL PRIMARY KEY,
    ordem_id BIGINT NOT NULL,
    ordem_numero TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('montagem', 'desmontagem')),
    kit_codigo TEXT NOT NULL,
    data_registro TEXT,
    n_registro INTEGER,
    observacao TEXT NOT NULL,
    linhas JSONB NOT NULL,
    backup_antes JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'preparando' CHECK (status IN ('preparando', 'gravado', 'erro')),
    erro TEXT,
    criado_por TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kit_erp_lancamentos_gravado_uq
    ON kit_erp_lancamentos (ordem_id, tipo) WHERE status = 'gravado';

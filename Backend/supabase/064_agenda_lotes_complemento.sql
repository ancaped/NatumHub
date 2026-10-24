-- Complemento da 062: tabelas da agenda que ainda nasciam só em runtime (store.rs::ensure_schema).
-- Aditiva e idempotente.
CREATE TABLE IF NOT EXISTS terceirizados_solicitacoes (
    id                  BIGSERIAL PRIMARY KEY,
    product_code        TEXT NOT NULL,
    product_description TEXT,
    quantity            NUMERIC NOT NULL,
    unit                TEXT DEFAULT 'UN',
    status              TEXT NOT NULL DEFAULT 'SOLICITADO',
    lote_number         TEXT,
    fornecedor          TEXT,
    previsao_entrega    DATE,
    observacoes         TEXT,
    solicitado_por      TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    vinculado_em        TIMESTAMPTZ
);
ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS quantity_kg NUMERIC;
ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS quantity_un NUMERIC;
ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS aprovacao_embalagem BOOLEAN DEFAULT FALSE;
ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS aprovacao_embalagem_por TEXT;
ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS aprovacao_embalagem_em TIMESTAMPTZ;
ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS aprovacao_materia_prima BOOLEAN DEFAULT FALSE;
ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS aprovacao_materia_prima_por TEXT;
ALTER TABLE terceirizados_solicitacoes ADD COLUMN IF NOT EXISTS aprovacao_materia_prima_em TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_terceirizados_solicitacoes_prod ON terceirizados_solicitacoes(product_code);
CREATE INDEX IF NOT EXISTS idx_terceirizados_solicitacoes_status ON terceirizados_solicitacoes(status);
CREATE INDEX IF NOT EXISTS idx_terceirizados_solicitacoes_lote ON terceirizados_solicitacoes(lote_number);

CREATE TABLE IF NOT EXISTS programacao_envase (
    id BIGSERIAL PRIMARY KEY,
    data_programada DATE NOT NULL,
    linha VARCHAR(20) NOT NULL,
    ordem INT NOT NULL DEFAULT 1,
    lote_number VARCHAR(100) NOT NULL,
    product_code VARCHAR(100) NOT NULL,
    product_description TEXT NOT NULL,
    quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
    quantity_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
    categoria_envase VARCHAR(50) NOT NULL,
    status_envase VARCHAR(50) NOT NULL DEFAULT 'PROGRAMADO',
    observacoes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Tabela pode existir com menos colunas: garante todas antes dos índices.
ALTER TABLE programacao_envase ADD COLUMN IF NOT EXISTS data_programada DATE;
ALTER TABLE programacao_envase ADD COLUMN IF NOT EXISTS linha VARCHAR(20);
ALTER TABLE programacao_envase ADD COLUMN IF NOT EXISTS ordem INT DEFAULT 1;
ALTER TABLE programacao_envase ADD COLUMN IF NOT EXISTS product_code VARCHAR(100);
ALTER TABLE programacao_envase ADD COLUMN IF NOT EXISTS product_description TEXT;
ALTER TABLE programacao_envase ADD COLUMN IF NOT EXISTS quantity DOUBLE PRECISION DEFAULT 0;
ALTER TABLE programacao_envase ADD COLUMN IF NOT EXISTS quantity_kg DOUBLE PRECISION DEFAULT 0;
ALTER TABLE programacao_envase ADD COLUMN IF NOT EXISTS categoria_envase VARCHAR(50);
ALTER TABLE programacao_envase ADD COLUMN IF NOT EXISTS status_envase VARCHAR(50) DEFAULT 'PROGRAMADO';
ALTER TABLE programacao_envase ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE programacao_envase ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE programacao_envase ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE programacao_envase ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE programacao_envase ADD COLUMN IF NOT EXISTS is_colorido BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE programacao_envase ADD COLUMN IF NOT EXISTS cor VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_programacao_envase_data ON programacao_envase(data_programada);
CREATE INDEX IF NOT EXISTS idx_programacao_envase_lote ON programacao_envase(lote_number);

CREATE TABLE IF NOT EXISTS programacao_rotulagem (
    id BIGSERIAL PRIMARY KEY,
    data_programada DATE NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    ordem INT NOT NULL DEFAULT 1,
    lote_number VARCHAR(100) NOT NULL,
    product_code VARCHAR(100) NOT NULL,
    product_description TEXT NOT NULL,
    quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
    quantity_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
    status_rotulagem VARCHAR(50) NOT NULL DEFAULT 'PROGRAMADO',
    observacoes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE programacao_rotulagem ADD COLUMN IF NOT EXISTS data_programada DATE;
ALTER TABLE programacao_rotulagem ADD COLUMN IF NOT EXISTS tipo VARCHAR(20);
ALTER TABLE programacao_rotulagem ADD COLUMN IF NOT EXISTS ordem INT DEFAULT 1;
ALTER TABLE programacao_rotulagem ADD COLUMN IF NOT EXISTS product_code VARCHAR(100);
ALTER TABLE programacao_rotulagem ADD COLUMN IF NOT EXISTS product_description TEXT;
ALTER TABLE programacao_rotulagem ADD COLUMN IF NOT EXISTS quantity DOUBLE PRECISION DEFAULT 0;
ALTER TABLE programacao_rotulagem ADD COLUMN IF NOT EXISTS quantity_kg DOUBLE PRECISION DEFAULT 0;
ALTER TABLE programacao_rotulagem ADD COLUMN IF NOT EXISTS status_rotulagem VARCHAR(50) DEFAULT 'PROGRAMADO';
ALTER TABLE programacao_rotulagem ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE programacao_rotulagem ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE programacao_rotulagem ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE programacao_rotulagem ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_programacao_rotulagem_data ON programacao_rotulagem(data_programada);
CREATE INDEX IF NOT EXISTS idx_programacao_rotulagem_lote ON programacao_rotulagem(lote_number);
CREATE INDEX IF NOT EXISTS idx_programacao_rotulagem_tipo ON programacao_rotulagem(tipo);

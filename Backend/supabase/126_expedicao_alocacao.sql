-- 126_expedicao_alocacao.sql
-- Módulo Expedição > Alocação e Endereços (Fase 1): estruturas/posições físicas, caixas de embarque,
-- vínculo produto->caixa, clientes atacadistas e alocação por endereço. Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS expedicao_estruturas (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    descricao TEXT,
    estrado_largura_cm DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    estrado_comprimento_cm DOUBLE PRECISION NOT NULL DEFAULT 120.0,
    ordem INTEGER NOT NULL DEFAULT 1,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expedicao_posicoes (
    id TEXT PRIMARY KEY,
    estrutura_id TEXT NOT NULL REFERENCES expedicao_estruturas(id) ON DELETE CASCADE,
    codigo TEXT NOT NULL,
    coluna TEXT NOT NULL,
    coluna_ordem INTEGER NOT NULL DEFAULT 1,
    nivel INTEGER NOT NULL,
    andar INTEGER NOT NULL,
    lado INTEGER NOT NULL DEFAULT 1,
    papel TEXT NOT NULL DEFAULT 'picking' CHECK (papel IN ('picking', 'pulmao')),
    largura_cm DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    comprimento_cm DOUBLE PRECISION NOT NULL DEFAULT 120.0,
    altura_cm DOUBLE PRECISION NOT NULL DEFAULT 74.0,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    observacoes TEXT,
    UNIQUE (estrutura_id, codigo)
);
CREATE INDEX IF NOT EXISTS idx_exp_posicoes_estrutura ON expedicao_posicoes(estrutura_id);

CREATE TABLE IF NOT EXISTS expedicao_caixas (
    id TEXT PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    altura_cm DOUBLE PRECISION NOT NULL,
    comprimento_cm DOUBLE PRECISION NOT NULL,
    largura_cm DOUBLE PRECISION NOT NULL,
    empilhamento_max INTEGER NOT NULL DEFAULT 4,
    insumo_erp_codigo TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    observacoes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expedicao_produto_caixa (
    produto_codigo TEXT PRIMARY KEY REFERENCES produtos(codigo) ON DELETE CASCADE,
    caixa_id TEXT REFERENCES expedicao_caixas(id) ON DELETE SET NULL,
    qtde_cx_manual INTEGER,
    camadas_override INTEGER,
    observacoes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expedicao_atacadistas (
    id TEXT PRIMARY KEY,
    nome_exibicao TEXT NOT NULL,
    termo_busca TEXT NOT NULL UNIQUE,
    cliente_codigo INTEGER,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expedicao_alocacoes (
    id TEXT PRIMARY KEY,
    posicao_id TEXT NOT NULL REFERENCES expedicao_posicoes(id) ON DELETE CASCADE,
    produto_codigo TEXT NOT NULL REFERENCES produtos(codigo) ON DELETE CASCADE,
    fileiras_largura INTEGER NOT NULL DEFAULT 1 CHECK (fileiras_largura >= 1),
    camadas_altura INTEGER NOT NULL DEFAULT 1 CHECK (camadas_altura >= 1),
    fixado BOOLEAN NOT NULL DEFAULT FALSE,
    observacoes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (posicao_id, produto_codigo)
);
CREATE INDEX IF NOT EXISTS idx_exp_alocacoes_posicao ON expedicao_alocacoes(posicao_id);
CREATE INDEX IF NOT EXISTS idx_exp_alocacoes_produto ON expedicao_alocacoes(produto_codigo);

-- Seed idempotente: Estante Principal (A–G, 6 andares = 12 níveis, estrados 100x120 cm, alturas de vão da planilha expedição_0309)
INSERT INTO expedicao_estruturas (id, nome, descricao, estrado_largura_cm, estrado_comprimento_cm, ordem, ativo)
VALUES (
    'estante_principal',
    'Estante Principal (A–G)',
    'Porta-paletes principal da expedição (estrados 100×120 cm, 6 andares)',
    100.0,
    120.0,
    1,
    TRUE
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO expedicao_posicoes (
    id, estrutura_id, codigo, coluna, coluna_ordem, nivel, andar, lado, papel,
    largura_cm, comprimento_cm, altura_cm, ativo
)
SELECT
    'estante_principal:' || col || nv::text,
    'estante_principal',
    col || nv::text,
    col,
    col_ord,
    nv,
    ((nv - 1) / 2) + 1,
    CASE WHEN nv % 2 = 1 THEN 1 ELSE 2 END,
    CASE WHEN nv <= 4 THEN 'picking' ELSE 'pulmao' END,
    100.0,
    120.0,
    CASE ((nv - 1) / 2) + 1
        WHEN 1 THEN 74.1
        WHEN 4 THEN 100.0
        ELSE 74.0
    END,
    TRUE
FROM (VALUES ('A', 1), ('B', 2), ('C', 3), ('D', 4), ('E', 5), ('F', 6), ('G', 7)) AS cols(col, col_ord)
CROSS JOIN generate_series(1, 12) AS nv
ON CONFLICT (estrutura_id, codigo) DO NOTHING;

-- Seed idempotente: Caixas padrão da planilha expedição_0309 + ERP (formulations)
INSERT INTO expedicao_caixas (id, codigo, nome, altura_cm, comprimento_cm, largura_cm, empilhamento_max, insumo_erp_codigo, ativo)
VALUES
    ('cx_01', '01', 'Caixa 01 (37×48×32)', 37.0, 48.0, 32.0, 2, '9.04.002', TRUE),
    ('cx_7', '7', 'Caixa 07 (17,7×14,7×13)', 17.7, 14.7, 13.0, 5, '9.04.012', TRUE),
    ('cx_08', '08', 'Caixa 08 (29×48×32)', 29.0, 48.0, 32.0, 3, '9.04.019', TRUE),
    ('cx_9', '9', 'Caixa 09 (22,5×19,5×14,7)', 22.5, 19.5, 14.7, 4, '9.04.004', TRUE),
    ('cx_10', '10', 'Caixa 10 (21,5×12×7,5)', 21.5, 12.0, 7.5, 4, '9.04.024', TRUE),
    ('cx_12', '12', 'Caixa 12 / 9.04.063 (32,3×30,3×20,3)', 32.3, 30.3, 20.3, 3, '9.04.063', TRUE),
    ('cx_13', '13', 'Caixa 13 (36×48×32)', 36.0, 48.0, 32.0, 2, '9.04.025', TRUE),
    ('cx_14', '14', 'Caixa 14 (34×27×19)', 34.0, 27.0, 19.0, 2, '9.04.028', TRUE),
    ('cx_16', '16', 'Caixa 16 (12×30×19,5)', 12.0, 30.0, 19.5, 4, '9.04.035', TRUE),
    ('cx_19', '19', 'Caixa 19 (29×36×26)', 29.0, 36.0, 26.0, 3, '9.04.031', TRUE),
    ('cx_23', '23', 'Caixa 23 (33×27×18)', 33.0, 27.0, 18.0, 3, '9.04.041', TRUE),
    ('cx_24', '24', 'Caixa 24 (24,7×26,8×15,8)', 24.7, 26.8, 15.8, 4, '9.04.042', TRUE),
    ('cx_29', '29', 'Caixa 29 (20×23×15)', 20.0, 23.0, 15.0, 4, '9.04.048', TRUE),
    ('cx_38', '38', 'Caixa 38 (33×22,5×17)', 33.0, 22.5, 17.0, 3, '9.04.055', TRUE),
    ('cx_132', '132', 'Caixa 132 Kits (17,6×26,4×26,4)', 17.6, 26.4, 26.4, 4, '9.04.064', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Seed idempotente: Clientes atacadistas definidos pelo Edson (códigos ERP em sales_orders)
INSERT INTO expedicao_atacadistas (id, nome_exibicao, termo_busca, cliente_codigo, ativo)
VALUES
    ('atac_casa_aladim', 'Casa Aladim', 'CASA ALADIM', '1161', TRUE),
    ('atac_dac', 'DAC', 'DAC', '2512', TRUE),
    ('atac_dca_feira', 'DCA Distribuidora (Feira)', 'DCA DISTRIBUIDORA', '2620', TRUE),
    ('atac_santa_lucia', 'Lojas Santa Lucia', 'LOJAS SANTA LUCIA', '2413', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Ficha técnica na central Desenvolvimento
INSERT INTO mapa_modules (module_key, group_key, label, purpose, status, sort_order, pos_x, pos_y, frontend_path, backend_path, router_prefix, ai_hints, detail)
SELECT
    'expedicao_alocacao',
    'expedicao',
    'Alocação e Endereços',
    'Planejamento dinâmico de endereçamento e capacidade física das estantes da expedição para todas as linhas, separando demanda Varejo × Atacado, conferência de caixas do ERP e exportação em planilha .xlsx.',
    'live',
    20,
    1580.0,
    220.0,
    'Frontend/src/modules/expedicao/alocacao/',
    'Backend/src/modules/expedicao/alocacao/',
    '/api/expedicao/alocacao',
    '["alocação", "endereços", "estantes", "curva abc", "picking", "pulmão", "atacado", "varejo", "caixas", "xlsx"]'::jsonb,
    '{
        "notes": "Substitui a planilha estática de alocação da expedição por motor dinâmico conectado ao ERP (produtos, qtde_cx, formulations, estoque_atual, sales_orders). Fase 1 cobre mapa visual das estantes, Curva ABC Varejo × Atacado, sugestão híbrida de endereçamento e exportação multi-aba .xlsx.",
        "regras": [
            "Picking nos níveis baixos (1–4, varejo) e Pulmão nos níveis altos (5–12, atacado/excedente)",
            "Clientes atacadistas configuráveis (Casa Aladim, DAC, DCA Feira, Lojas Santa Lucia); match de termo respeita palavra inteira",
            "Posições travadas (fixado=true) não são movidas pela sugestão automática",
            "Toda gravação e exclusão usa 2 passos (prévia sem confirmar=true) e auditoria em hub_audit_events"
        ]
    }'::jsonb
WHERE EXISTS (SELECT 1 FROM mapa_groups WHERE key = 'expedicao')
ON CONFLICT (module_key) DO UPDATE SET
    label = EXCLUDED.label,
    purpose = EXCLUDED.purpose,
    status = EXCLUDED.status,
    frontend_path = EXCLUDED.frontend_path,
    backend_path = EXCLUDED.backend_path,
    router_prefix = EXCLUDED.router_prefix,
    ai_hints = EXCLUDED.ai_hints,
    detail = EXCLUDED.detail,
    updated_at = NOW();

INSERT INTO mapa_edges (id, from_key, to_key, kind, note) VALUES
    ('edge_vendas_exp_alocacao', 'vendas', 'expedicao_alocacao', 'data', 'Histórico de pedidos Varejo × Atacado orienta Curva ABC e dimensionamento'),
    ('edge_lotes_exp_alocacao', 'producao_lotes', 'expedicao_alocacao', 'flow', 'Lotes liberados seguem para os endereços planejados de Picking e Pulmão')
ON CONFLICT (from_key, to_key, kind) DO NOTHING;

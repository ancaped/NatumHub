-- Configuração por Linha de Produto (Z e multiplicadores de estoque em meses)
CREATE TABLE IF NOT EXISTS config_linhas (
    linha_prefix TEXT PRIMARY KEY,
    nome_linha TEXT NOT NULL,
    estoque_ideal_mult REAL NOT NULL DEFAULT 3.2,
    abrir_ordem_mult REAL NOT NULL DEFAULT 1.6,
    abrir_prod_mult REAL NOT NULL DEFAULT 1.2,
    fator_seguranca_z REAL NOT NULL DEFAULT 0.0,
    visivel INTEGER NOT NULL DEFAULT 1
);

-- Tabela de Produtos
CREATE TABLE IF NOT EXISTS produtos (
    codigo TEXT PRIMARY KEY,
    descricao TEXT NOT NULL,
    linha_prefix TEXT NOT NULL,
    base TEXT,
    media_levantamento REAL NOT NULL DEFAULT 0.0,
    FOREIGN KEY(linha_prefix) REFERENCES config_linhas(linha_prefix)
);

-- Estado Atual do Estoque (importado do Levantamento de Produção)
CREATE TABLE IF NOT EXISTS estoque_atual (
    codigo TEXT PRIMARY KEY,
    estoque INTEGER NOT NULL DEFAULT 0,
    producao INTEGER NOT NULL DEFAULT 0,
    pedidos_aberto INTEGER NOT NULL DEFAULT 0,
    fase TEXT,
    FOREIGN KEY(codigo) REFERENCES produtos(codigo) ON DELETE CASCADE
);

-- Histórico de Faturamento Mensal (importado do Faturamento Anual)
CREATE TABLE IF NOT EXISTS historico_faturamento (
    codigo TEXT NOT NULL,
    mes INTEGER NOT NULL CHECK(mes BETWEEN 1 AND 12),
    quantidade INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(codigo, mes),
    FOREIGN KEY(codigo) REFERENCES produtos(codigo) ON DELETE CASCADE
);

-- Overrides Manuais por Produto
CREATE TABLE IF NOT EXISTS overrides_produtos (
    codigo TEXT PRIMARY KEY,
    estoque_ideal_manual INTEGER, -- Sobrescreve o cálculo automático do estoque ideal em quantidade
    pedidos_manual INTEGER, -- Sobrescreve a quantidade de pedidos em aberto
    media_manual REAL, -- Sobrescreve a média mensal de vendas
    is_lancamento_manual INTEGER, -- NULL, 0 = não, 1 = sim
    visivel INTEGER DEFAULT 1, -- 0 = oculto, 1 = visível
    observacao TEXT, -- Campo de observações (ex: produzir apenas com pedido)
    linha_prefix_manual TEXT, -- Sobrescreve a linha de produto
    FOREIGN KEY(codigo) REFERENCES produtos(codigo) ON DELETE CASCADE
);

-- Inserir configurações padrão para as linhas principais conhecidas
INSERT OR IGNORE INTO config_linhas (linha_prefix, nome_linha, estoque_ideal_mult, abrir_ordem_mult, abrir_prod_mult, fator_seguranca_z, visivel)
VALUES 
('1', 'Natum', 3.2, 1.6, 1.2, 0.0, 1),
('2', 'Hair Extrattus', 3.2, 1.6, 1.2, 0.0, 1),
('3', 'Pierre Capelli', 3.2, 1.6, 1.2, 0.0, 1),
('5', 'Bio Ozônio', 3.2, 1.6, 1.2, 0.0, 1),
('6', 'Sachês Natum', 3.2, 1.6, 1.2, 0.0, 1),
('10', 'Liss Shine', 3.2, 1.6, 1.2, 0.0, 1),
('14', 'Perfect Curls', 3.2, 1.6, 1.2, 0.0, 1),
('17', 'Hummer/Beautiful', 3.2, 1.6, 1.2, 0.0, 1),
('20', 'Pietree Professional', 3.2, 1.6, 1.2, 0.0, 1),
('70', 'Vita Brasil', 3.2, 1.6, 1.2, 0.0, 1),
('DEFAULT', 'Outros/Geral', 3.2, 1.6, 1.2, 0.0, 1);

-- Tabela de Configurações Gerais (ex: credenciais do Google, tokens, etc.)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- Tabela de Composição de Kits
CREATE TABLE IF NOT EXISTS kit_composicao (
    kit_codigo TEXT,
    componente_codigo TEXT,
    PRIMARY KEY (kit_codigo, componente_codigo),
    FOREIGN KEY (kit_codigo) REFERENCES produtos(codigo) ON DELETE CASCADE,
    FOREIGN KEY (componente_codigo) REFERENCES produtos(codigo) ON DELETE CASCADE
);

-- Tabela de Histórico de Produção Lançada
CREATE TABLE IF NOT EXISTS historico_producao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data_producao TEXT NOT NULL, -- formato YYYY-MM-DD
    codigo TEXT NOT NULL,
    quantidade INTEGER NOT NULL,
    observacoes TEXT,
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
    -- Snapshot do produto no momento do lançamento
    snap_estoque INTEGER,
    snap_producao INTEGER,
    snap_pedidos INTEGER,
    snap_efp INTEGER,
    snap_media_vendas REAL,
    snap_duracao_meses REAL,
    snap_status TEXT,
    snap_status_label TEXT,
    snap_producao_recomendada INTEGER,
    snap_estoque_ideal_qtd REAL,
    snap_demanda_ajustada REAL,
    FOREIGN KEY(codigo) REFERENCES produtos(codigo) ON DELETE CASCADE
);

-- Histórico de Importações de Planilhas
CREATE TABLE IF NOT EXISTS historico_importacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL, -- 'levantamento' | 'faturamento' | 'kits'
    nome_arquivo TEXT NOT NULL,
    importado_em TEXT DEFAULT CURRENT_TIMESTAMP,
    registros INTEGER DEFAULT 0,
    status TEXT DEFAULT 'success', -- 'success' | 'error'
    mensagem TEXT
);

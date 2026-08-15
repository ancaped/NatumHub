-- NatumHub — schema PostgreSQL (espelho de Saves/data.db)
-- Aplicado via Supabase migration; não editar manualmente em produção.

-- === Produção ===
CREATE TABLE IF NOT EXISTS config_linhas (
    linha_prefix TEXT PRIMARY KEY,
    nome_linha TEXT NOT NULL,
    estoque_ideal_mult DOUBLE PRECISION NOT NULL DEFAULT 3.2,
    abrir_ordem_mult DOUBLE PRECISION NOT NULL DEFAULT 1.6,
    abrir_prod_mult DOUBLE PRECISION NOT NULL DEFAULT 1.2,
    fator_seguranca_z DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    visivel INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS produtos (
    codigo TEXT PRIMARY KEY,
    descricao TEXT NOT NULL,
    linha_prefix TEXT NOT NULL REFERENCES config_linhas(linha_prefix),
    base TEXT,
    base_codigo TEXT,
    media_levantamento DOUBLE PRECISION NOT NULL DEFAULT 0.0
);

CREATE TABLE IF NOT EXISTS estoque_atual (
    codigo TEXT PRIMARY KEY REFERENCES produtos(codigo) ON DELETE CASCADE,
    estoque DOUBLE PRECISION NOT NULL DEFAULT 0,
    producao DOUBLE PRECISION NOT NULL DEFAULT 0,
    pedidos_aberto DOUBLE PRECISION NOT NULL DEFAULT 0,
    fase TEXT
);

CREATE TABLE IF NOT EXISTS historico_faturamento (
    codigo TEXT NOT NULL REFERENCES produtos(codigo) ON DELETE CASCADE,
    mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
    quantidade INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (codigo, mes)
);

CREATE TABLE IF NOT EXISTS overrides_produtos (
    codigo TEXT PRIMARY KEY REFERENCES produtos(codigo) ON DELETE CASCADE,
    estoque_ideal_manual INTEGER,
    pedidos_manual INTEGER,
    media_manual DOUBLE PRECISION,
    is_lancamento_manual INTEGER,
    visivel INTEGER DEFAULT 1,
    observacao TEXT,
    linha_prefix_manual TEXT,
    status_produto TEXT DEFAULT 'ativo',
    categoria_produto TEXT,
    produzir_apenas_kit INTEGER DEFAULT 0,
    lancamento_meta_meses INTEGER DEFAULT 6,
    lancamento_data_inicio TEXT,
    terceirizado_modo TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS kit_composicao (
    kit_codigo TEXT NOT NULL REFERENCES produtos(codigo) ON DELETE CASCADE,
    -- componente: produto acabado ou item ERP (embalagem/insumo) — sem FK só em produtos
    componente_codigo TEXT NOT NULL,
    quantidade NUMERIC(12,4) NOT NULL DEFAULT 1.0,
    fator_proporcao_qtd NUMERIC(12,4) DEFAULT 1.0,
    fator_proporcao_kits INTEGER DEFAULT 1,
    -- erp = Passo P (sync); manual = CRUD/Excel (preservado no sync)
    origem TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('erp', 'manual')),
    PRIMARY KEY (kit_codigo, componente_codigo)
);

CREATE TABLE IF NOT EXISTS historico_producao (
    id SERIAL PRIMARY KEY,
    data_producao TEXT NOT NULL,
    codigo TEXT NOT NULL REFERENCES produtos(codigo) ON DELETE CASCADE,
    quantidade INTEGER NOT NULL,
    observacoes TEXT,
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP::TEXT,
    snap_estoque INTEGER,
    snap_producao INTEGER,
    snap_pedidos INTEGER,
    snap_efp INTEGER,
    snap_media_vendas DOUBLE PRECISION,
    snap_duracao_meses DOUBLE PRECISION,
    snap_status TEXT,
    snap_status_label TEXT,
    snap_producao_recomendada INTEGER,
    snap_estoque_ideal_qtd DOUBLE PRECISION,
    snap_demanda_ajustada DOUBLE PRECISION,
    consume_base INTEGER DEFAULT 0,
    base_code TEXT,
    lote_erp TEXT
);

CREATE TABLE IF NOT EXISTS historico_importacoes (
    id SERIAL PRIMARY KEY,
    tipo TEXT NOT NULL,
    nome_arquivo TEXT NOT NULL,
    importado_em TEXT DEFAULT CURRENT_TIMESTAMP::TEXT,
    registros INTEGER DEFAULT 0,
    status TEXT DEFAULT 'success',
    mensagem TEXT
);

CREATE TABLE IF NOT EXISTS vira_composicao (
    de_produto_codigo TEXT NOT NULL,
    para_produto_codigo TEXT NOT NULL,
    quantidade DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    PRIMARY KEY (de_produto_codigo, para_produto_codigo)
);

CREATE TABLE IF NOT EXISTS vira_ordens (
    id SERIAL PRIMARY KEY,
    order_number TEXT UNIQUE NOT NULL,
    de_produto_codigo TEXT NOT NULL,
    de_produto_descricao TEXT NOT NULL,
    para_produto_codigo TEXT NOT NULL,
    para_produto_descricao TEXT NOT NULL,
    quantity DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TEXT NOT NULL,
    completed_at TEXT,
    assembled_by TEXT,
    checked_by TEXT,
    observations TEXT,
    erp_launched INTEGER DEFAULT 0,
    quantity_assembled DOUBLE PRECISION
);

-- === Compras ===
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES categories(id),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    contact TEXT,
    email TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS items (
    code TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    unit TEXT NOT NULL,
    category_id TEXT REFERENCES categories(id),
    line TEXT,
    "type" TEXT,
    notes TEXT,
    is_ignored INTEGER DEFAULT 0,
    manual_category INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS stock_imports (
    id TEXT PRIMARY KEY,
    filename TEXT,
    source TEXT DEFAULT 'ERP',
    imported_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT,
    item_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stock_snapshots (
    id TEXT PRIMARY KEY,
    import_id TEXT NOT NULL REFERENCES stock_imports(id),
    item_code TEXT NOT NULL REFERENCES items(code),
    stock_qty DOUBLE PRECISION DEFAULT 0,
    reserved_qty DOUBLE PRECISION DEFAULT 0,
    in_production DOUBLE PRECISION DEFAULT 0,
    in_orders DOUBLE PRECISION DEFAULT 0,
    snapshot_date TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS consumption (
    id TEXT PRIMARY KEY,
    item_code TEXT NOT NULL REFERENCES items(code),
    year INTEGER NOT NULL,
    total_qty DOUBLE PRECISION DEFAULT 0,
    monthly_avg DOUBLE PRECISION DEFAULT 0,
    imported_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT,
    UNIQUE (item_code, year)
);

CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT NOT NULL,
    item_code TEXT NOT NULL REFERENCES items(code),
    description TEXT,
    unit TEXT,
    quantity DOUBLE PRECISION DEFAULT 0,
    unit_price DOUBLE PRECISION DEFAULT 0,
    total_value DOUBLE PRECISION DEFAULT 0,
    supplier_name TEXT,
    supplier_id TEXT REFERENCES suppliers(id),
    invoice_date TEXT,
    imported_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS nf_import_control (
    id TEXT PRIMARY KEY,
    last_period_end TEXT NOT NULL,
    imported_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS quotations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'draft',
    target_days INTEGER DEFAULT 90,
    notes TEXT,
    director_demand_notes TEXT,
    director_final_notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT,
    demand_approved_at TEXT,
    final_approved_at TEXT,
    ordered_at TEXT
);

CREATE TABLE IF NOT EXISTS quotation_items (
    id TEXT PRIMARY KEY,
    quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    item_code TEXT NOT NULL,
    recommended_qty DOUBLE PRECISION DEFAULT 0,
    approved_qty DOUBLE PRECISION,
    final_qty DOUBLE PRECISION,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS quotation_prices (
    id TEXT PRIMARY KEY,
    quotation_item_id TEXT NOT NULL REFERENCES quotation_items(id) ON DELETE CASCADE,
    supplier_id TEXT NOT NULL REFERENCES suppliers(id),
    unit_price DOUBLE PRECISION,
    delivery_days INTEGER,
    min_qty DOUBLE PRECISION,
    payment_terms TEXT,
    notes TEXT,
    is_selected INTEGER DEFAULT 0,
    quoted_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS compras_config_personalizado (
    level TEXT NOT NULL,
    target_id TEXT NOT NULL,
    dias_start INTEGER,
    dias_target INTEGER,
    use_lead_time INTEGER DEFAULT 0,
    safety_days INTEGER DEFAULT 0,
    objetivo_tipo TEXT DEFAULT 'padrao',
    objetivo_valor DOUBLE PRECISION DEFAULT 0.0,
    periodo_media INTEGER,
    PRIMARY KEY (level, target_id)
);

CREATE TABLE IF NOT EXISTS tiny_contas_pagar (
    id INTEGER PRIMARY KEY,
    nome_cliente TEXT NOT NULL,
    historico TEXT,
    numero_doc TEXT,
    data_emissao TEXT,
    data_vencimento TEXT,
    valor DOUBLE PRECISION NOT NULL,
    saldo DOUBLE PRECISION NOT NULL,
    situacao TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tiny_contas_receber (
    id INTEGER PRIMARY KEY,
    nome_cliente TEXT NOT NULL,
    historico TEXT,
    numero_doc TEXT,
    data_emissao TEXT,
    data_vencimento TEXT,
    valor DOUBLE PRECISION NOT NULL,
    saldo DOUBLE PRECISION NOT NULL,
    situacao TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedbacks (
    id TEXT PRIMARY KEY,
    type TEXT,
    description TEXT,
    page TEXT,
    logs TEXT,
    screenshot TEXT,
    status TEXT DEFAULT 'pending',
    "createdAt" TEXT DEFAULT CURRENT_TIMESTAMP::TEXT,
    "resolvedAt" TEXT,
    requested_by TEXT,
    priority INTEGER NOT NULL DEFAULT 100,
    admin_notes TEXT
);

CREATE TABLE IF NOT EXISTS feedback_notes (
    id TEXT PRIMARY KEY,
    feedback_id TEXT NOT NULL REFERENCES feedbacks(id),
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS online_stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    url TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS online_orders (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    item_code TEXT REFERENCES items(code),
    store_name TEXT,
    purchase_url TEXT,
    purchase_date TEXT NOT NULL,
    unit_price DOUBLE PRECISION DEFAULT 0,
    quantity INTEGER DEFAULT 1,
    shipping_cost DOUBLE PRECISION DEFAULT 0,
    total_price DOUBLE PRECISION DEFAULT 0,
    payment_method TEXT,
    tracking_code TEXT,
    tracking_url TEXT,
    status TEXT DEFAULT 'preparing',
    estimated_delivery TEXT,
    receipt_path TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT,
    is_return INTEGER DEFAULT 0,
    return_deadline TEXT,
    return_status TEXT,
    return_notes TEXT
);

-- === Microbiologia ===
CREATE TABLE IF NOT EXISTS products (
    code TEXT PRIMARY KEY,
    name TEXT,
    packaging TEXT,
    validity TEXT
);

CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    "reportId" TEXT,
    "reportRawNum" INTEGER,
    "productCode" TEXT,
    "productName" TEXT,
    batch TEXT,
    "collectionDate" TEXT,
    technician TEXT,
    "createdAt" TEXT
);

-- === Físico-Química ===
CREATE TABLE IF NOT EXISTS fisco_quimica_patterns (
    product_code TEXT PRIMARY KEY,
    ph_min DOUBLE PRECISION NOT NULL,
    ph_max DOUBLE PRECISION NOT NULL,
    viscosity_min DOUBLE PRECISION NOT NULL,
    viscosity_max DOUBLE PRECISION NOT NULL,
    density_target DOUBLE PRECISION NOT NULL,
    density_tolerance DOUBLE PRECISION DEFAULT 0.02,
    package_volume DOUBLE PRECISION DEFAULT 1000,
    package_unit TEXT DEFAULT 'mL'
);

CREATE TABLE IF NOT EXISTS fisco_quimica_corrective_agents (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS fisco_quimica_analyses (
    id TEXT PRIMARY KEY,
    product_code TEXT NOT NULL,
    product_name TEXT NOT NULL,
    batch TEXT NOT NULL,
    analysis_date TEXT NOT NULL,
    technician TEXT NOT NULL,
    ph_measured DOUBLE PRECISION NOT NULL,
    viscosity_measured DOUBLE PRECISION NOT NULL,
    density_measured DOUBLE PRECISION NOT NULL,
    fraction_weight DOUBLE PRECISION NOT NULL,
    envase_target_weight DOUBLE PRECISION NOT NULL,
    envase_target_unit TEXT DEFAULT 'g',
    has_adjustment INTEGER DEFAULT 0,
    corrective_agent_id TEXT REFERENCES fisco_quimica_corrective_agents(id),
    initial_viscosity DOUBLE PRECISION,
    trial_agent_qty DOUBLE PRECISION,
    trial_viscosity DOUBLE PRECISION,
    agent_qty_per_liter DOUBLE PRECISION,
    batch_size DOUBLE PRECISION,
    total_agent_required DOUBLE PRECISION,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS fisco_quimica_product_agents (
    product_code TEXT NOT NULL REFERENCES fisco_quimica_patterns(product_code) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES fisco_quimica_corrective_agents(id) ON DELETE CASCADE,
    PRIMARY KEY (product_code, agent_id)
);

-- === ERP sync destino ===
CREATE TABLE IF NOT EXISTS formulations (
    id SERIAL PRIMARY KEY,
    product_code TEXT NOT NULL REFERENCES produtos(codigo) ON DELETE CASCADE,
    ingredient_code TEXT NOT NULL REFERENCES items(code) ON DELETE CASCADE,
    description TEXT,
    quantity DOUBLE PRECISION NOT NULL,
    percentage DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY,
    item_code TEXT NOT NULL,
    item_type TEXT NOT NULL,
    movement_type TEXT NOT NULL,
    quantity DOUBLE PRECISION NOT NULL,
    date TEXT NOT NULL,
    document_number TEXT,
    details TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

-- Passo I: baixas de lote (ERP Lotes_Baixas)
CREATE TABLE IF NOT EXISTS lotes_baixas (
    registro INTEGER PRIMARY KEY,
    nlote INTEGER,
    creferencia TEXT,
    nqtde DOUBLE PRECISION,
    dlog TEXT,
    cusuario TEXT,
    cjustificativa TEXT,
    ccodprod TEXT,
    nqtderef DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_lotes_baixas_lote_ref ON lotes_baixas(nlote, creferencia);

CREATE TABLE IF NOT EXISTS purchase_orders (
    n_registro INTEGER PRIMARY KEY,
    n_pedido INTEGER NOT NULL,
    d_pedido TEXT,
    n_cod_fornec INTEGER,
    c_nome_f TEXT,
    c_usuario TEXT,
    c_status TEXT,
    c_prazo_pgto TEXT,
    c_prev_entrega TEXT,
    n_valor DOUBLE PRECISION,
    d_previsao TEXT,
    c_email TEXT,
    m_observac TEXT
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id SERIAL PRIMARY KEY,
    n_pedido_registro INTEGER REFERENCES purchase_orders(n_registro) ON DELETE CASCADE,
    n_pedido INTEGER,
    c_referencia TEXT,
    n_qtde DOUBLE PRECISION,
    n_preco DOUBLE PRECISION,
    n_chegou DOUBLE PRECISION,
    c_descricao TEXT,
    c_unidade TEXT,
    n_valor_total DOUBLE PRECISION,
    n_registro INTEGER,
    c_chegada TEXT
);

CREATE TABLE IF NOT EXISTS sales_orders (
    n_pedido INTEGER NOT NULL,
    d_pedido TEXT NOT NULL,
    n_codigo INTEGER,
    c_nome TEXT,
    n_valor_tot DOUBLE PRECISION,
    c_status TEXT,
    n_nota_fiscal INTEGER,
    d_previsao TEXT,
    d_entrega TEXT,
    m_observac TEXT,
    PRIMARY KEY (n_pedido, d_pedido)
);

CREATE TABLE IF NOT EXISTS sales_order_items (
    id SERIAL PRIMARY KEY,
    n_pedido INTEGER NOT NULL,
    d_pedido TEXT NOT NULL,
    n_registro INTEGER,
    c_cod_prod TEXT NOT NULL,
    n_qtde INTEGER NOT NULL,
    n_qtde_fat INTEGER NOT NULL,
    n_preco DOUBLE PRECISION,
    c_lote TEXT,
    FOREIGN KEY (n_pedido, d_pedido) REFERENCES sales_orders(n_pedido, d_pedido) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS similar_items (
    item_code_a TEXT NOT NULL REFERENCES items(code) ON DELETE CASCADE,
    item_code_b TEXT NOT NULL REFERENCES items(code) ON DELETE CASCADE,
    PRIMARY KEY (item_code_a, item_code_b)
);

CREATE TABLE IF NOT EXISTS lote_error_resolutions (
    lote_number TEXT PRIMARY KEY,
    is_resolved INTEGER DEFAULT 0,
    resolved_by TEXT,
    resolved_at TEXT,
    observations TEXT,
    base_code TEXT,
    base_quantity DOUBLE PRECISION,
    substitutions_json TEXT,
    baixa_generated INTEGER DEFAULT 0,
    baixa_movement_id TEXT
);

CREATE TABLE IF NOT EXISTS kit_assembly_orders (
    id SERIAL PRIMARY KEY,
    order_number TEXT UNIQUE NOT NULL,
    kit_product_code TEXT NOT NULL,
    kit_product_description TEXT NOT NULL,
    quantity DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TEXT NOT NULL,
    completed_at TEXT,
    assembled_by TEXT,
    checked_by TEXT,
    observations TEXT,
    erp_launched INTEGER DEFAULT 0,
    components_lotes TEXT,
    quantity_assembled DOUBLE PRECISION
);

-- === Hub auth / notificações ===
CREATE TABLE IF NOT EXISTS hub_operators (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'operador',
    active INTEGER NOT NULL DEFAULT 1,
    update_channel TEXT NOT NULL DEFAULT 'stable',
    password_hash TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS hub_operator_modules (
    operator_id TEXT NOT NULL REFERENCES hub_operators(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL,
    PRIMARY KEY (operator_id, module_key)
);

CREATE TABLE IF NOT EXISTS hub_sessions (
    token TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL REFERENCES hub_operators(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS hub_audit_log (
    id SERIAL PRIMARY KEY,
    operator_id TEXT,
    operator_name TEXT,
    method TEXT,
    path TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS hub_devices (
    device_id TEXT PRIMARY KEY,
    label TEXT NOT NULL DEFAULT '',
    update_channel TEXT NOT NULL DEFAULT 'stable',
    last_ip TEXT,
    last_seen TEXT,
    registered_by TEXT REFERENCES hub_operators(id) ON DELETE SET NULL,
    registered_at TEXT DEFAULT CURRENT_TIMESTAMP::TEXT
);

CREATE TABLE IF NOT EXISTS hub_notifications (
    id TEXT PRIMARY KEY,
    module_key TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'info',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::TEXT,
    metadata TEXT
);

CREATE TABLE IF NOT EXISTS hub_notification_reads (
    notification_id TEXT NOT NULL REFERENCES hub_notifications(id) ON DELETE CASCADE,
    operator_id TEXT NOT NULL REFERENCES hub_operators(id) ON DELETE CASCADE,
    read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::TEXT,
    PRIMARY KEY (notification_id, operator_id)
);

-- === Seeds mínimos ===
INSERT INTO config_linhas (linha_prefix, nome_linha, estoque_ideal_mult, abrir_ordem_mult, abrir_prod_mult, fator_seguranca_z, visivel) VALUES
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
('DEFAULT', 'Outros/Geral', 3.2, 1.6, 1.2, 0.0, 1)
ON CONFLICT (linha_prefix) DO NOTHING;

INSERT INTO categories (id, name, parent_id) VALUES
('cat_mp', 'Matéria Prima', NULL),
('cat_emb', 'Embalagem', NULL),
('cat_mat', 'Materiais', NULL),
('cat_coloracao', 'Coloração', NULL),
('cat_apoio', 'Material de Apoio', NULL),
('cat_base', 'Base de Produção', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO online_stores (id, name, url, notes) VALUES
('store_ml', 'Mercado Livre', 'https://www.mercadolivre.com.br', 'Mercado Livre Brasil'),
('store_shopee', 'Shopee', 'https://shopee.com.br', 'Shopee Brasil'),
('store_amazon', 'Amazon', 'https://www.amazon.com.br', 'Amazon Brasil')
ON CONFLICT (id) DO NOTHING;

-- === Índices ===
CREATE INDEX IF NOT EXISTS idx_formulations_product ON formulations(product_code);
CREATE INDEX IF NOT EXISTS idx_formulations_ingredient ON formulations(ingredient_code);
CREATE INDEX IF NOT EXISTS idx_movements_item ON stock_movements(item_code);
CREATE INDEX IF NOT EXISTS idx_movements_date ON stock_movements(date);
CREATE INDEX IF NOT EXISTS idx_movements_doc ON stock_movements(document_number);
CREATE INDEX IF NOT EXISTS idx_movements_saida_insumo_date ON stock_movements(movement_type, item_type, date, item_code, quantity);
CREATE INDEX IF NOT EXISTS idx_poi_pedido_reg ON purchase_order_items(n_pedido_registro);
CREATE INDEX IF NOT EXISTS idx_poi_pedido ON purchase_order_items(n_pedido);
CREATE INDEX IF NOT EXISTS idx_poi_ref ON purchase_order_items(c_referencia);
CREATE INDEX IF NOT EXISTS idx_soi_pedido ON sales_order_items(n_pedido, d_pedido);
CREATE INDEX IF NOT EXISTS idx_soi_prod ON sales_order_items(c_cod_prod);
CREATE INDEX IF NOT EXISTS idx_stock_item ON stock_snapshots(item_code);
CREATE INDEX IF NOT EXISTS idx_stock_item_date ON stock_snapshots(item_code, snapshot_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_consumption_item ON consumption(item_code);
CREATE INDEX IF NOT EXISTS idx_invoices_item ON invoices(item_code);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_name);
CREATE INDEX IF NOT EXISTS idx_qi_quotation ON quotation_items(quotation_id);
CREATE INDEX IF NOT EXISTS idx_qp_item ON quotation_prices(quotation_item_id);
CREATE INDEX IF NOT EXISTS idx_tiny_receber_venc ON tiny_contas_receber(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_tiny_receber_sit ON tiny_contas_receber(situacao);
CREATE INDEX IF NOT EXISTS idx_tiny_receber_nome ON tiny_contas_receber(nome_cliente);
CREATE INDEX IF NOT EXISTS idx_tiny_pagar_venc ON tiny_contas_pagar(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_tiny_pagar_sit ON tiny_contas_pagar(situacao);
CREATE INDEX IF NOT EXISTS idx_tiny_pagar_nome ON tiny_contas_pagar(nome_cliente);
CREATE INDEX IF NOT EXISTS idx_feedback_notes_fid ON feedback_notes(feedback_id);
CREATE INDEX IF NOT EXISTS idx_hub_sessions_operator ON hub_sessions(operator_id);
CREATE INDEX IF NOT EXISTS idx_hub_sessions_expires ON hub_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_hub_operator_modules_op ON hub_operator_modules(operator_id);
CREATE INDEX IF NOT EXISTS idx_hub_notifications_created ON hub_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hub_notifications_module ON hub_notifications(module_key);

-- RLS: backend usa DATABASE_URL (service role via postgres), não anon key.
ALTER TABLE sync_status ENABLE ROW LEVEL SECURITY;

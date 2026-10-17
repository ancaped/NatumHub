CREATE TABLE IF NOT EXISTS ecommerce_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_emissao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    numero_nf VARCHAR(50) NOT NULL UNIQUE,
    nome_cliente VARCHAR(255) NOT NULL,
    observacoes TEXT,
    plataforma VARCHAR(100) NOT NULL,
    plataforma_envio VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pendente', -- 'Pendente', 'Enviado', 'Cancelado'
    quem_separou VARCHAR(100),
    pagamento_ok BOOLEAN NOT NULL DEFAULT FALSE,
    frete_ok BOOLEAN NOT NULL DEFAULT FALSE,
    data_envio TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for searching and filtering
CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_status ON ecommerce_orders(status);
CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_numero_nf ON ecommerce_orders(numero_nf);

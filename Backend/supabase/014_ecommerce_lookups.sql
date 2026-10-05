-- Cadastros auxiliares para pedidos e-commerce (plataformas, envio, clientes)

CREATE TABLE IF NOT EXISTS ecommerce_platforms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(100) NOT NULL UNIQUE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ecommerce_shipping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(100) NOT NULL UNIQUE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ecommerce_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL UNIQUE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Valores iniciais comuns
INSERT INTO ecommerce_platforms (nome) VALUES ('Ecommerce'), ('Mercado Livre'), ('Shopee')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO ecommerce_shipping (nome) VALUES ('Total Express'), ('Correios'), ('Jadlog')
ON CONFLICT (nome) DO NOTHING;

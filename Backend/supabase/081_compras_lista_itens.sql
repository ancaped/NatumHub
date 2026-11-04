-- 081_compras_lista_itens.sql
-- Lista de Compra no servidor: os itens separados para o próximo lote de solicitação, uma lista por módulo de Compras.
-- Antes ficava só no navegador de quem montava. Aditivo e idempotente.
CREATE TABLE IF NOT EXISTS compras_lista_itens (
    modulo TEXT NOT NULL CHECK (modulo IN ('materia_prima', 'embalagens', 'coloracao', 'apoio')),
    item_chave TEXT NOT NULL,
    item_code TEXT NOT NULL,
    quantidade_manual DOUBLE PRECISION,
    media_manual DOUBLE PRECISION,
    adicionado_por TEXT,
    adicionado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (modulo, item_chave)
);

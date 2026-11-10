-- O sync do ERP grava as entradas de produto (lotes) com ON CONFLICT (document_number, item_code) sobre este
-- índice. Ele já existia em produção, criado fora do repositório; sem ele, um banco novo ou restaurado
-- faria o sync de lotes falhar com "no unique or exclusion constraint matching the ON CONFLICT specification".
-- Aditivo e idempotente: onde o índice já existe, não faz nada.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_lote_produto_entrada
    ON stock_movements (document_number, item_code)
    WHERE item_type = 'produto' AND movement_type = 'entrada' AND COALESCE(document_number, '') <> '';

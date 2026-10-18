-- Unidades por caixa do ERP (Produtos.nQtdeCx), usadas na etiqueta de lote.
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS qtde_cx INTEGER;

-- Código de barras (EAN) sincronizado do ERP SQL Server (Produtos.cCodBarras)
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS codigo_barras TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'natum_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON produtos TO natum_app;
  END IF;
END $$;

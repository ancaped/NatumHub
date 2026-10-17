-- Colunas de controle de impressão para laudos de microbiologia
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS printed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "printedAt" TEXT;

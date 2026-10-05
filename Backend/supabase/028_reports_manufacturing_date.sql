-- Coluna de data de fabricação para laudos de microbiologia
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS "manufacturingDate" TEXT;

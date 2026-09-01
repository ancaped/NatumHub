-- 031_hub_operator_modules_access_level.sql
-- Permissões granulares de módulo: 'view' (apenas leitura) ou 'edit' (leitura e escrita)

ALTER TABLE hub_operator_modules 
ADD COLUMN IF NOT EXISTS access_level VARCHAR(20) NOT NULL DEFAULT 'edit';


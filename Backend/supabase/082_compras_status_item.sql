-- Status de compra do insumo: ativo entra na demanda; suspenso e ignorado saem, sem apagar o cadastro.
ALTER TABLE items ADD COLUMN IF NOT EXISTS status_compra TEXT NOT NULL DEFAULT 'ativo';
ALTER TABLE overrides_produtos ADD COLUMN IF NOT EXISTS status_compra TEXT;

UPDATE items
SET status_compra = 'suspenso'
WHERE COALESCE(is_ignored, 0) = 1 AND status_compra = 'ativo';

UPDATE overrides_produtos
SET status_compra = 'suspenso'
WHERE COALESCE(visivel, 1) = 0 AND status_compra IS NULL;

-- Subcategoria arquivada some das listas e não recebe itens; nada é apagado (reversível).
ALTER TABLE categories ADD COLUMN IF NOT EXISTS arquivada_em TEXT;

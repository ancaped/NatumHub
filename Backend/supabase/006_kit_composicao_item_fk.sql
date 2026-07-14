-- Componentes de kit podem ser embalagens/insumos (items), não só produtos.
ALTER TABLE kit_composicao
  DROP CONSTRAINT IF EXISTS kit_composicao_componente_codigo_fkey;

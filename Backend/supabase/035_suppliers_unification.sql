-- 035_suppliers_unification.sql
-- Adiciona suporte a agrupamento/unificação de fornecedores e campo CNPJ

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS cnpj TEXT;

CREATE INDEX IF NOT EXISTS idx_suppliers_parent_id ON suppliers(parent_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_cnpj ON suppliers(cnpj);

-- Preenche CNPJ dos fornecedores a partir das notas fiscais já registradas, caso ainda esteja nulo
UPDATE suppliers s
SET cnpj = inv.supplier_cnpj
FROM (
    SELECT DISTINCT ON (supplier_id) supplier_id, supplier_cnpj
    FROM invoices
    WHERE supplier_id IS NOT NULL 
      AND supplier_cnpj IS NOT NULL 
      AND TRIM(supplier_cnpj) <> ''
    ORDER BY supplier_id, invoice_date DESC
) inv
WHERE s.id = inv.supplier_id AND (s.cnpj IS NULL OR TRIM(s.cnpj) = '');

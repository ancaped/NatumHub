-- Perfil RH dos operadores (1:1 com hub_operators)
CREATE TABLE IF NOT EXISTS hub_operator_profiles (
    operator_id TEXT PRIMARY KEY REFERENCES hub_operators(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT '',
    cpf TEXT,
    phone TEXT,
    email TEXT,
    birth_date DATE,
    hire_date DATE,
    address_street TEXT,
    address_number TEXT,
    address_complement TEXT,
    address_neighborhood TEXT,
    address_city TEXT,
    address_state TEXT,
    address_zip TEXT,
    notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_operator_profiles_cpf
    ON hub_operator_profiles (cpf)
    WHERE cpf IS NOT NULL AND cpf <> '';

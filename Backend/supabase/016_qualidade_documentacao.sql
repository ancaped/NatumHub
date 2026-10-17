-- Qualidade → Documentação (famílias, tipos, documentos, arquivos PDF)
CREATE TABLE IF NOT EXISTS doc_families (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT,
    warn_days INTEGER[] NOT NULL DEFAULT ARRAY[30, 15, 7],
    requires_payment BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_families_code
    ON doc_families (code) WHERE code IS NOT NULL AND code <> '';

CREATE TABLE IF NOT EXISTS doc_types (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES doc_families(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_types_family ON doc_types (family_id);

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES doc_families(id) ON DELETE RESTRICT,
    type_id TEXT REFERENCES doc_types(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    physical_location TEXT,
    physical_tag TEXT,
    issued_at DATE,
    valid_until DATE,
    payment_status TEXT NOT NULL DEFAULT 'nao_aplica'
        CHECK (payment_status IN ('nao_aplica', 'pendente', 'pago')),
    payment_amount DOUBLE PRECISION,
    payment_due_at DATE,
    payment_method TEXT,
    payment_paid_at DATE,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_valid_until ON documents (valid_until);
CREATE INDEX IF NOT EXISTS idx_documents_payment_status ON documents (payment_status);
CREATE INDEX IF NOT EXISTS idx_documents_family ON documents (family_id);

CREATE TABLE IF NOT EXISTS document_files (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('documento', 'comprovante')),
    original_name TEXT NOT NULL,
    rel_path TEXT NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_files_doc ON document_files (document_id);

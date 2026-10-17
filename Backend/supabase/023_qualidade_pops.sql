-- POPs Qualidade: setores, documentos versionados, validade anual.

CREATE TABLE IF NOT EXISTS pop_sectors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pop_documents (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    sector_id TEXT NOT NULL REFERENCES pop_sectors(id),
    current_revision INTEGER NOT NULL DEFAULT 0,
    effective_date DATE,
    next_review_date DATE,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'obsolete')),
    elaborated_by TEXT,
    reviewed_by TEXT,
    approved_by TEXT,
    current_version_id TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pop_documents_sector ON pop_documents (sector_id);
CREATE INDEX IF NOT EXISTS idx_pop_documents_status ON pop_documents (status);
CREATE INDEX IF NOT EXISTS idx_pop_documents_next_review ON pop_documents (next_review_date);

CREATE TABLE IF NOT EXISTS pop_versions (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES pop_documents(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    effective_date DATE NOT NULL,
    next_review_date DATE NOT NULL,
    change_kind TEXT NOT NULL
        CHECK (change_kind IN ('initial', 'revalidate', 'content')),
    change_summary TEXT,
    content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    elaborated_by TEXT,
    reviewed_by TEXT,
    approved_by TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (document_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_pop_versions_document ON pop_versions (document_id, revision DESC);

-- Soft FK current_version_id (evita ciclo na criação)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pop_documents_current_version_fk'
  ) THEN
    ALTER TABLE pop_documents
      ADD CONSTRAINT pop_documents_current_version_fk
      FOREIGN KEY (current_version_id) REFERENCES pop_versions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

INSERT INTO pop_sectors (id, name, sort_order) VALUES
    ('adm', 'Administração', 10),
    ('almox', 'Almoxarifado', 20),
    ('atd', 'Atendimento', 30),
    ('elab', 'Elaboração de POPs', 40),
    ('exp', 'Expedição', 50),
    ('prd', 'Produção', 60)
ON CONFLICT (id) DO NOTHING;

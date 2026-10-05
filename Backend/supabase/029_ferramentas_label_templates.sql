-- 029_ferramentas_label_templates.sql
-- Tabela para armazenar modelos de etiquetas personalizadas (ex: 100x50mm)

CREATE TABLE IF NOT EXISTS hub_label_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'custom',
    width_mm NUMERIC NOT NULL DEFAULT 100.0,
    height_mm NUMERIC NOT NULL DEFAULT 50.0,
    orientation TEXT NOT NULL DEFAULT 'landscape',
    elements_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_label_templates_category ON hub_label_templates(category);
CREATE INDEX IF NOT EXISTS idx_hub_label_templates_is_default ON hub_label_templates(is_default);

-- Trilha de auditoria app-wide (eventos de domínio + HTTP write)
CREATE TABLE IF NOT EXISTS hub_audit_events (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_id TEXT,
    actor_name TEXT,
    device_id TEXT,
    module_key TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    summary TEXT NOT NULL DEFAULT '',
    before_json JSONB,
    after_json JSONB,
    request_method TEXT,
    request_path TEXT,
    provenance TEXT NOT NULL DEFAULT 'human'
        CHECK (provenance IN ('human', 'system', 'http'))
);

CREATE INDEX IF NOT EXISTS idx_hub_audit_events_created
    ON hub_audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hub_audit_events_module
    ON hub_audit_events (module_key);
CREATE INDEX IF NOT EXISTS idx_hub_audit_events_actor
    ON hub_audit_events (actor_id);
CREATE INDEX IF NOT EXISTS idx_hub_audit_events_entity
    ON hub_audit_events (entity_type, entity_id);

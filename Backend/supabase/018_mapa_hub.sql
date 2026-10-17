-- Mapa operacional NatumHub (organograma, tasks, activity)
CREATE TABLE IF NOT EXISTS mapa_groups (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    hub_view TEXT NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 100,
    color TEXT
);

CREATE TABLE IF NOT EXISTS mapa_modules (
    module_key TEXT PRIMARY KEY,
    group_key TEXT NOT NULL REFERENCES mapa_groups(key) ON DELETE CASCADE,
    label TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'stub',
    sort_order INT NOT NULL DEFAULT 100,
    pos_x DOUBLE PRECISION NOT NULL DEFAULT 0,
    pos_y DOUBLE PRECISION NOT NULL DEFAULT 0,
    frontend_path TEXT,
    backend_path TEXT,
    router_prefix TEXT,
    ai_hints JSONB NOT NULL DEFAULT '[]'::jsonb,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mapa_modules_group ON mapa_modules(group_key);

CREATE TABLE IF NOT EXISTS mapa_edges (
    id TEXT PRIMARY KEY,
    from_key TEXT NOT NULL,
    to_key TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'related',
    note TEXT NOT NULL DEFAULT '',
    UNIQUE (from_key, to_key, kind)
);

CREATE TABLE IF NOT EXISTS mapa_routes (
    id TEXT PRIMARY KEY,
    module_key TEXT REFERENCES mapa_modules(module_key) ON DELETE SET NULL,
    methods TEXT[] NOT NULL DEFAULT '{}',
    path TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    auth TEXT NOT NULL DEFAULT 'module',
    source TEXT
);

CREATE INDEX IF NOT EXISTS idx_mapa_routes_module ON mapa_routes(module_key);
CREATE INDEX IF NOT EXISTS idx_mapa_routes_path ON mapa_routes(path);

CREATE TABLE IF NOT EXISTS mapa_tasks (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    targets JSONB NOT NULL DEFAULT '[]'::jsonb,
    acceptance JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'done')),
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    done_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mapa_tasks_status ON mapa_tasks(status, created_at DESC);

CREATE TABLE IF NOT EXISTS mapa_activity (
    id TEXT PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor TEXT,
    action TEXT NOT NULL,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_mapa_activity_at ON mapa_activity(at DESC);

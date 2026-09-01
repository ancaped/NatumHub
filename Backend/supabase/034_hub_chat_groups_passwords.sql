-- 034_hub_chat_groups_passwords.sql
-- Suporte a grupos personalizados e canais protegidos por senha no chat

CREATE TABLE IF NOT EXISTS hub_chat_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_by TEXT NOT NULL,
    password_hash TEXT,
    is_protected BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hub_chat_group_members (
    group_id TEXT NOT NULL REFERENCES hub_chat_groups(id) ON DELETE CASCADE,
    operator_id TEXT NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, operator_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_chat_groups_created ON hub_chat_groups(created_at);

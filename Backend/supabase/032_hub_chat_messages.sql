-- 032_hub_chat_messages.sql
-- Tabela para mensagens de chat / bate-papo interno criptografado entre usuários e grupos

CREATE TABLE IF NOT EXISTS hub_chat_messages (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL DEFAULT 'geral',
    sender_id TEXT,
    sender_name TEXT NOT NULL,
    sender_role TEXT,
    content_encrypted TEXT NOT NULL,
    is_encrypted BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hub_chat_messages_channel ON hub_chat_messages(channel);
CREATE INDEX IF NOT EXISTS idx_hub_chat_messages_created ON hub_chat_messages(created_at);

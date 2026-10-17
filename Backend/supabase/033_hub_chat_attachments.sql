-- 033_hub_chat_attachments.sql
-- Adiciona suporte a tipos de mensagem (texto, imagem, audio de voz, documento) e dados de anexos

ALTER TABLE hub_chat_messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) NOT NULL DEFAULT 'text';
ALTER TABLE hub_chat_messages ADD COLUMN IF NOT EXISTS attachment_data TEXT;
ALTER TABLE hub_chat_messages ADD COLUMN IF NOT EXISTS attachment_name TEXT;

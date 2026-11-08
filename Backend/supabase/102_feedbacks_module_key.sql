-- Feedback ligado ao módulo (module_key). Antes a coluna só nascia no primeiro envio pelo widget;
-- banco novo (ou de teste) quebrava a lista da fila até alguém enviar um feedback.
ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS module_key TEXT;
CREATE INDEX IF NOT EXISTS idx_feedbacks_status_module ON feedbacks(status, module_key);

-- 131: Expedição — Tipos de ocupação do vão (Padrão, Palete Misto, Reservado) e flag Compartilhado/Fracionado
ALTER TABLE expedicao_posicoes
    ADD COLUMN IF NOT EXISTS tipo_ocupacao TEXT NOT NULL DEFAULT 'padrao',
    ADD COLUMN IF NOT EXISTS ocupacao_manual_pct DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS etiqueta_livre TEXT,
    ADD COLUMN IF NOT EXISTS reserva_motivo TEXT,
    ADD COLUMN IF NOT EXISTS reserva_ate TEXT,
    ADD COLUMN IF NOT EXISTS compartilhado_fracionado BOOLEAN NOT NULL DEFAULT FALSE;

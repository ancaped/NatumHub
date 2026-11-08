-- Conversão com vínculo fixo (ex.: shampoo 5 L Natum vendido como Liss Shine 5 L):
-- quando marcado, a venda do destino baixa a origem no planejamento de produção.
-- Só acrescenta a coluna (padrão FALSE: nada muda até alguém marcar o par). Idempotente.
ALTER TABLE vira_composicao ADD COLUMN IF NOT EXISTS baixa_origem_na_venda BOOLEAN NOT NULL DEFAULT FALSE;

-- 121_linhas_sublinhas.sql
-- Sublinhas da Linha de Produtos (decisão do Edson, 2026-11-14). Aditiva e idempotente; com os padrões abaixo nada muda.
-- linha_principal: prefixo da linha pai (nulo = linha própria). Um nível só (validado no serviço).
-- herda_*: o parâmetro da sublinha acompanha o da principal. As colunas de valor (estoque_ideal_mult etc.) continuam
-- guardando o valor EFETIVO (próprio, ou copiado da principal quando herda), por isso Produção e Compras seguem lendo
-- config_linhas sem mudar. O serviço administrativo/linhas/heranca.rs mantém essa cópia.
-- visivel_proprio: a escolha de ativa/inativa da própria linha; `visivel` = visivel_proprio E principal ativa.
ALTER TABLE config_linhas ADD COLUMN IF NOT EXISTS linha_principal TEXT;
ALTER TABLE config_linhas ADD COLUMN IF NOT EXISTS herda_estoque_ideal BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE config_linhas ADD COLUMN IF NOT EXISTS herda_abrir_ordem BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE config_linhas ADD COLUMN IF NOT EXISTS herda_abrir_prod BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE config_linhas ADD COLUMN IF NOT EXISTS herda_fator_z BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE config_linhas ADD COLUMN IF NOT EXISTS herda_atendimento BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE config_linhas ADD COLUMN IF NOT EXISTS visivel_proprio INTEGER NOT NULL DEFAULT 1;
UPDATE config_linhas SET visivel_proprio = visivel WHERE linha_principal IS NULL AND visivel_proprio <> visivel;

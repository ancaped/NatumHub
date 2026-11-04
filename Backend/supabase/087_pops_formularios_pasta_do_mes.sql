-- 087_pops_formularios_pasta_do_mes.sql
-- «Pasta do mês»: marca por formulário dos que a fábrica preenche todo mês, para imprimir o mês do setor de uma vez
-- (decisão do Edson, 2026-11-04). Aditiva e idempotente; nasce tudo desligado.
ALTER TABLE pop_formularios ADD COLUMN IF NOT EXISTS monthly_pack BOOLEAN NOT NULL DEFAULT FALSE;

-- 119_ficha_producao_saude_estoque_futuro.sql
-- Ficha do Gerenciamento de Produção: Saúde do Estoque pelo estoque futuro. Aditiva e idempotente.

UPDATE mapa_modules SET
    detail = jsonb_set(detail, '{attention}', COALESCE(detail->'attention', '[]'::jsonb) || to_jsonb('Saúde do Estoque olha o estoque futuro: Ruptura, Baixo, Excesso e a cobertura em dias usam o EFP da Demanda (estoque + produção − pedidos; nos comprados prontos, estoque + trânsito − pedidos). Ruptura = com venda e estoque futuro zerado ou negativo; produção ou pedido de compra que cobre a falta não é ruptura. A linha mostra estoque atual e futuro e marca discretamente quando falta hoje (zerado ou abaixo do gatilho) mas o futuro cobre. Sem giro continua pela venda'::text)),
    updated_at = NOW()
WHERE module_key = 'producao'
  AND NOT (COALESCE(detail->'attention', '[]'::jsonb) @> to_jsonb('Saúde do Estoque olha o estoque futuro: Ruptura, Baixo, Excesso e a cobertura em dias usam o EFP da Demanda (estoque + produção − pedidos; nos comprados prontos, estoque + trânsito − pedidos). Ruptura = com venda e estoque futuro zerado ou negativo; produção ou pedido de compra que cobre a falta não é ruptura. A linha mostra estoque atual e futuro e marca discretamente quando falta hoje (zerado ou abaixo do gatilho) mas o futuro cobre. Sem giro continua pela venda'::text));

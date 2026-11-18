-- 125_atendimento_sem_encomenda.sql
-- Atendimento perde "por encomenda" (Edson, 2026-11-18: "por encomenda é basicamente terceirizado"). Aditiva e idempotente:
-- só converte valores por UPDATE, nenhuma coluna é apagada. O status espelho (overrides_produtos.status_produto) já
-- lia "terceirizado" para encomenda, então Demanda de Produção e MRP do Compras não mudam.
UPDATE overrides_produtos SET atendimento = 'terceirizado' WHERE atendimento = 'encomenda';
UPDATE config_linhas SET atendimento = 'terceirizado' WHERE atendimento = 'encomenda';

-- Ficha da Linha de Produtos: o atendimento tem só duas opções agora.
UPDATE mapa_modules SET
    detail = jsonb_set(detail, '{attention}', COALESCE(detail->'attention', '[]'::jsonb) || to_jsonb('Atendimento só tem duas opções (2026-11-18, migração 125): fabricado para estoque (gera demanda de produção e de insumo) e terceirizado (não gera). "Por encomenda" foi removido porque na prática é terceirizado; quem estava assim virou terceirizado por UPDATE e a API recusa "encomenda" com mensagem clara. O que ficar gravado como encomenda lê terceirizado. Vale onde a ficha acima ainda cita "por encomenda".'::text)),
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND NOT (COALESCE(detail->'attention', '[]'::jsonb) @> to_jsonb('Atendimento só tem duas opções (2026-11-18, migração 125): fabricado para estoque (gera demanda de produção e de insumo) e terceirizado (não gera). "Por encomenda" foi removido porque na prática é terceirizado; quem estava assim virou terceirizado por UPDATE e a API recusa "encomenda" com mensagem clara. O que ficar gravado como encomenda lê terceirizado. Vale onde a ficha acima ainda cita "por encomenda".'::text));

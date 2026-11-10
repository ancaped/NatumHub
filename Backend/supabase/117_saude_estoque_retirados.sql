-- 117_saude_estoque_retirados.sql
-- Itens que o operador tirou do relatório Saúde do Estoque (antes ficavam só no navegador). Aditiva e idempotente.
CREATE TABLE IF NOT EXISTS saude_estoque_retirados (
    codigo TEXT PRIMARY KEY,
    motivo TEXT,
    retirado_por TEXT NOT NULL DEFAULT '',
    retirado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

UPDATE mapa_modules SET
    detail = jsonb_set(detail, '{attention}', COALESCE(detail->'attention', '[]'::jsonb) || to_jsonb('Escopo da Saúde do Estoque (decisão do Edson, 2026-11-10): só entra produto que gera demanda (atendimento efetivo estoque, core/regras_produto.rs); terceirizado e por encomenda ficam fora das listas e das contagens, sem selo; linha inativa (visivel = 0) também. Só lançamento aparece com selo. O operador pode tirar produtos do relatório (tabela saude_estoque_retirados, migração 117; ações retirar_item_saude_estoque e restaurar_item_saude_estoque, 2 passos e auditoria); a aba Retirados mostra e restaura. Tirar não muda o produto nem a Demanda'::text)),
    updated_at = NOW()
WHERE module_key = 'producao'
  AND NOT (COALESCE(detail->'attention', '[]'::jsonb) @> to_jsonb('Escopo da Saúde do Estoque (decisão do Edson, 2026-11-10): só entra produto que gera demanda (atendimento efetivo estoque, core/regras_produto.rs); terceirizado e por encomenda ficam fora das listas e das contagens, sem selo; linha inativa (visivel = 0) também. Só lançamento aparece com selo. O operador pode tirar produtos do relatório (tabela saude_estoque_retirados, migração 117; ações retirar_item_saude_estoque e restaurar_item_saude_estoque, 2 passos e auditoria); a aba Retirados mostra e restaura. Tirar não muda o produto nem a Demanda'::text));

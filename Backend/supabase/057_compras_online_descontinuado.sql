-- Compras Online descontinuado (item D3): a tela nunca foi ligada e não há pedidos.
-- Só marca o módulo no mapa; as tabelas online_orders/online_stores e os dados permanecem.
UPDATE mapa_modules
SET status = 'descontinuado',
    detail = detail || '{"notes": "Módulo descontinuado e removido do Nexus (item D3). As tabelas online_orders e online_stores permanecem no banco sem uso."}'::jsonb,
    updated_at = NOW()
WHERE module_key = 'compras_online';

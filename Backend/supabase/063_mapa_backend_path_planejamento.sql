-- handlers/producao.rs foi apagado no item 3e; o Planejamento vive em modules/producao/planejamento.rs.
UPDATE mapa_modules
SET backend_path = 'Backend/src/modules/producao/planejamento.rs'
WHERE module_key = 'planejamento_producao'
  AND backend_path = 'Backend/src/handlers/producao.rs';

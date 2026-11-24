-- Fase 1.10 Expedição: Paletização (giro 90° / peso bruto) e terminologia Prateleira -> Andar -> Vão

ALTER TABLE expedicao_caixas
  ADD COLUMN IF NOT EXISTS pode_girar BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS peso_bruto_kg DOUBLE PRECISION;

UPDATE mapa_modules
SET detail = COALESCE(detail, '{}'::jsonb) || jsonb_build_object(
  'summary',
  'Mapa 2D de galpões e prateleiras (andares e vãos de palete), desenhos proporcionais de caixas/palete com cálculo de lastro e amarração, curva ABC separada por grupo e conferência de embalagens do ERP.',
  'regras',
  jsonb_build_array(
    'Hierarquia física: Galpão -> Prateleira (gôndola completa) -> Andar (níveis verticais 1..N ou Pátio) -> Vão (localização onde cabem os paletes).',
    'Curva ABC (80/95/100) calculada separadamente por grupo: Linha Principal, Kits da Linha (kits:<prefixo>) e Coloração (cat_coloracao, sem AOX/pó).',
    'Caixas de embarque (9.04.xxx) inferidas automaticamente por overrides manuais, fórmulas (formulations) e composição de kits (kit_composicao).',
    'Paletização geométrica: cada caixa guarda dimensões (A×C×L cm), empilhamento máximo, permissão de giro 90° (pode_girar) e peso bruto opcional (kg), gerando lastro normal, girado 90° e amarração (camada ímpar/par espelhada) como base para alocação automática FEFO.',
    'Toda gravação e exclusão usa 2 passos (prévia sem confirmar=true) e auditoria em hub_audit_events.'
  )
)
WHERE module_key = 'expedicao_alocacao';

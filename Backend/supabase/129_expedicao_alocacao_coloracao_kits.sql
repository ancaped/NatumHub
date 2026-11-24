-- 129_expedicao_alocacao_coloracao_kits.sql
-- Separação de Coloração (apenas cat_coloracao, sem AOX/pó), grupo de Kits por linha principal
-- (sempre próximos da linha principal) e atualização da ficha técnica do módulo. Aditiva e idempotente.

UPDATE expedicao_estruturas
SET linhas_permitidas = ARRAY['2', 'kits:2']::TEXT[]
WHERE id = 'estante_principal'
  AND linhas_permitidas = ARRAY['2']::TEXT[];

UPDATE expedicao_estruturas
SET linhas_permitidas = ARRAY['1', 'kits:1']::TEXT[]
WHERE id = 'g1_prateleira_2'
  AND linhas_permitidas = ARRAY['1']::TEXT[];

UPDATE mapa_modules
SET detail = COALESCE(detail, '{}'::jsonb) || jsonb_build_object(
    'summary', 'Mapa 2D multi-galpão HSL Zinc, Curva ABC separada por grupo (Linha / Kits / Coloração) e caixas automáticas do ERP e kits',
    'regras', jsonb_build_array(
        'Curva ABC (80/95/100) calculada separadamente por grupo: Linha Principal, Kits da Linha (kits:<prefixo>) e Coloração (cat_coloracao, sem AOX/pó)',
        'Caixas de embarque (9.04.xxx) inferidas automaticamente por overrides manuais, fórmulas (formulations) e composição de kits (kit_composicao)',
        'Prateleiras possuem galpão, zona (nobre/afastado) e linhas_permitidas; kits permanecem próximos da linha principal e Coloração isolada',
        'Picking nos níveis baixos (1–4, varejo) e Pulmão nos níveis altos (5–12, atacado/excedente)',
        'Toda gravação e exclusão usa 2 passos (prévia sem confirmar=true) e auditoria em hub_audit_events'
    )
)
WHERE module_key = 'expedicao_alocacao';

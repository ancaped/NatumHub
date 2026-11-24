-- 128_expedicao_alocacao_galpoes_abc.sql
-- Evolução do módulo Expedição > Alocação: múltiplos galpões/áreas (nobre x afastado),
-- dedicação de prateleiras por linha principal, elegibilidade Curva ABC por linha e seed
-- das 3 prateleiras do Galpão 1 + área inicial do Galpão 2. Aditiva e idempotente.

ALTER TABLE expedicao_estruturas
    ADD COLUMN IF NOT EXISTS galpao TEXT NOT NULL DEFAULT 'Galpão 1 (Área Nobre)',
    ADD COLUMN IF NOT EXISTS zona TEXT NOT NULL DEFAULT 'nobre',
    ADD COLUMN IF NOT EXISTS linhas_permitidas TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE expedicao_produto_caixa
    ADD COLUMN IF NOT EXISTS incluir_abc BOOLEAN;

UPDATE expedicao_estruturas
SET nome = 'Prateleira 1 — Hair Extrattus',
    galpao = 'Galpão 1 (Área Nobre)',
    zona = 'nobre',
    linhas_permitidas = ARRAY['2']::TEXT[]
WHERE id = 'estante_principal'
  AND COALESCE(array_length(linhas_permitidas, 1), 0) = 0;

INSERT INTO expedicao_estruturas (
    id, nome, descricao, galpao, zona, linhas_permitidas,
    estrado_largura_cm, estrado_comprimento_cm, ordem, ativo
)
VALUES
    (
        'g1_prateleira_2',
        'Prateleira 2 — Natum',
        'Porta-paletes dedicado à linha Natum no Galpão 1 (6 prateleiras × 7 colunas A–G)',
        'Galpão 1 (Área Nobre)',
        'nobre',
        ARRAY['1']::TEXT[],
        100.0,
        120.0,
        2,
        TRUE
    ),
    (
        'g1_prateleira_3',
        'Prateleira 3 — Apoio Nobre',
        'Terceira prateleira do Galpão 1 para linhas complementares ou expansão (A–G)',
        'Galpão 1 (Área Nobre)',
        'nobre',
        '{}'::TEXT[],
        100.0,
        120.0,
        3,
        TRUE
    ),
    (
        'g2_area_1',
        'Galpão 2 — Pátio / Estante',
        'Área secundária para volumes altos, estoque pulmão e itens sazonais (P1–P6)',
        'Galpão 2 (Área Secundária)',
        'afastado',
        '{}'::TEXT[],
        100.0,
        120.0,
        4,
        TRUE
    )
ON CONFLICT (id) DO NOTHING;

INSERT INTO expedicao_posicoes (
    id, estrutura_id, codigo, coluna, coluna_ordem, nivel, andar, lado, papel,
    largura_cm, comprimento_cm, altura_cm, ativo
)
SELECT
    est_id || ':' || col || nv::text,
    est_id,
    col || nv::text,
    col,
    col_ord,
    nv,
    ((nv - 1) / 2) + 1,
    CASE WHEN nv % 2 = 1 THEN 1 ELSE 2 END,
    CASE WHEN nv <= 4 THEN 'picking' ELSE 'pulmao' END,
    100.0,
    120.0,
    CASE ((nv - 1) / 2) + 1
        WHEN 1 THEN 74.1
        WHEN 4 THEN 100.0
        ELSE 74.0
    END,
    TRUE
FROM (VALUES ('g1_prateleira_2'), ('g1_prateleira_3')) AS ests(est_id)
CROSS JOIN (VALUES ('A', 1), ('B', 2), ('C', 3), ('D', 4), ('E', 5), ('F', 6), ('G', 7)) AS cols(col, col_ord)
CROSS JOIN generate_series(1, 12) AS nv
ON CONFLICT (estrutura_id, codigo) DO NOTHING;

INSERT INTO expedicao_posicoes (
    id, estrutura_id, codigo, coluna, coluna_ordem, nivel, andar, lado, papel,
    largura_cm, comprimento_cm, altura_cm, ativo
)
SELECT
    'g2_area_1:' || col,
    'g2_area_1',
    col,
    col,
    col_ord,
    1,
    1,
    1,
    'pulmao',
    100.0,
    120.0,
    180.0,
    TRUE
FROM (VALUES ('P1', 1), ('P2', 2), ('P3', 3), ('P4', 4), ('P5', 5), ('P6', 6)) AS cols(col, col_ord)
ON CONFLICT (estrutura_id, codigo) DO NOTHING;

UPDATE mapa_modules
SET detail = COALESCE(detail, '{}'::jsonb) || jsonb_build_object(
    'summary', 'Mapa 2D proporcional multi-galpão, Curva ABC separada por linha principal, caixas e gestão de atacado',
    'regras', jsonb_build_array(
        'Curva ABC (80/95/100) calculada separadamente por linha_principal (Hair Extrattus, Natum, Liss Shine, etc.)',
        'Itens sem giro ou de apoio (sacola, brinde, amostra, display, folder) saem da ABC por padrão, com alternância manual em 1 clique',
        'Prateleiras possuem galpão, zona (nobre/afastado) e linhas_permitidas: sugestão nunca mistura Hair e Natum na mesma estante dedicada',
        'Picking nos níveis baixos (1–4, varejo) e Pulmão nos níveis altos (5–12, atacado/excedente)',
        'Toda gravação e exclusão usa 2 passos (prévia sem confirmar=true) e auditoria em hub_audit_events'
    )
)
WHERE module_key = 'expedicao_alocacao';

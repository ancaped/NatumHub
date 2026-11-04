-- 089_ficha_administrativo.sql
-- Ficha técnica do Administrativo (Linha de Produtos e Funcionários) e conexões com Produção.
-- Só a parte escrita (telas, regras, pontos de atenção); rotas, arquivos e tabelas a ficha gera do código.
-- Roda em todo boot (SCHEMA_FILES), então aplica uma vez só: a chave `attention` marca que já foi aplicada
-- e as edições feitas depois na tela de Desenvolvimento (notes) não são sobrescritas.

UPDATE mapa_modules SET
    purpose = 'Catálogo mestre dos produtos acabados: linhas, status de ciclo de vida, categorias, kits e ajustes manuais (overrides). O que define o que é produto ativo para Produção, Compras, Estoque e Vendas.',
    detail = detail || jsonb_build_object(
        'notes', E'Linha do produto é identificada pelo prefixo do código (config_linhas); sem prefixo cadastrado o produto cai em Outros/Geral. Terceirizado é status do produto, não linha. Base é tipo de produto próprio (fórmula interna), independente de ativo/inativo e de linha. Linhas de kits são um cadastro à parte, só para kits, separado das linhas de produto.\n\nRegras:\n- Produto ativo: status fora dos status ignorados (padrão descontinuado e terceirizado) e visível.\n- Base: categoria cat_base, status bases ou código com segmento .36.; pode estar ativa ou inativa e em várias linhas.\n- Um prefixo de código só pode estar em uma linha.\n- Linha de kits: o prefixo do código sugere; correção manual por kit (kits_linha), também para kit sem composição no ERP.\n- A composição do kit continua só no ERP; o Nexus liga o kit a uma linha, não edita a composição.\n- Escritas em lote, exclusão de linha e atribuição de linha de kits são em 2 passos (prévia, depois confirmar) e auditadas.\n\nPontos de atenção:\n- ActiveProductsView.tsx passa de 2.600 linhas; quebrar por aba.\n- Aba Configurações ainda não foi revista.\n- A lista de kits só traz kits ativos: kit oculto não aparece até ser reativado.\n- Decisões 11 a 16 da revisão R1 (produto ativo e base com definição única, graduação, dias comerciais, quem edita) aguardam o Edson.\n\nHistórico e decisões no ai-memory: concepts/modulo-administrativo e decisions/administrativo-base-terceirizado-linhas-de-kits.',
        'tabs', jsonb_build_array(
            jsonb_build_object('id', 'status', 'label', 'Status dos Produtos', 'desc', 'Tabela paginada com tipo (Produto, Base, Kit), linha, status e categoria; filtros e ações em lote com prévia.'),
            jsonb_build_object('id', 'linhas', 'label', 'Definição de Linhas', 'desc', 'Linhas de produto por prefixo e multiplicadores de estoque; aviso de prefixos com produtos ativos sem linha (cadastrar linha ou marcar terceirizado).'),
            jsonb_build_object('id', 'kits', 'label', 'Composição de Kits', 'desc', 'Kits ativos com linha de kits (sugerida pelo prefixo, correção manual) e composição vinda do ERP; painel Linhas de kits.'),
            jsonb_build_object('id', 'overrides', 'label', 'Audit de Overrides', 'desc', 'Ajustes manuais por produto, filtro por tipo de ajuste e limpeza do status redundante (Ativa repete o padrão).'),
            jsonb_build_object('id', 'configuracoes', 'label', 'Configurações', 'desc', 'Parâmetros globais, status ignorados e subcategorias.')
        ),
        'rules', jsonb_build_array(
            'Produto ativo: status fora dos status ignorados (padrão descontinuado e terceirizado) e visível',
            'Base: categoria cat_base, status bases ou código com segmento .36.; pode estar ativa ou inativa e em várias linhas',
            'Um prefixo de código só pode estar em uma linha; sem linha cadastrada o produto fica em Outros/Geral',
            'Linha de kits: prefixo do código sugere, correção manual por kit em kits_linha; vale também para kit sem composição no ERP',
            'A composição do kit continua só no ERP; o Nexus liga o kit a uma linha, não edita a composição',
            'Escritas em lote, exclusão de linha e atribuição de linha de kits são em 2 passos (prévia, depois confirmar) e auditadas'
        ),
        'attention', jsonb_build_array(
            'ActiveProductsView.tsx passa de 2.600 linhas; quebrar por aba',
            'Aba Configurações ainda não foi revista',
            'Lista de kits só traz kits ativos: kit oculto não aparece até ser reativado',
            'Decisões 11 a 16 da revisão R1 (produto ativo e base com definição única, graduação, dias comerciais, quem edita) aguardam o Edson'
        ),
        'functions', '[]'::jsonb,
        'codeRefs', '[]'::jsonb
    ),
    backend_path = 'Backend/src/modules/administrativo/',
    updated_at = NOW()
WHERE module_key = 'admin_linha_produtos'
  AND NOT (detail ? 'attention');

INSERT INTO mapa_modules (
    module_key, group_key, label, purpose, status, sort_order,
    frontend_path, backend_path, router_prefix, detail
)
SELECT
    'admin_funcionarios',
    'administrativo',
    'Funcionários',
    'Cadastro de RH dos colaboradores (dados pessoais, admissão, endereço) sobre o operador do sistema, com sessão ativa e atividade recente.',
    'live',
    30,
    'Frontend/src/modules/administrativo/funcionarios/',
    'Backend/src/modules/administrativo/funcionarios/',
    '/api/administrativo/funcionarios',
    jsonb_build_object(
        'notes', E'A ficha do colaborador abre no Drawer canônico. O perfil mora em hub_operator_profiles, ligado ao operador; login, nível e permissões de módulos são do módulo de operadores.\n\nRegras:\n- Funcionário é o perfil de RH de um operador; excluir operador não é feito aqui.\n- A atividade recente vem da auditoria do sistema.',
        'rules', jsonb_build_array(
            'Funcionário é o perfil de RH de um operador; excluir operador não é feito aqui',
            'Atividade recente vem da auditoria do sistema'
        )
    )
WHERE EXISTS (SELECT 1 FROM mapa_groups WHERE key = 'administrativo')
ON CONFLICT (module_key) DO NOTHING;

INSERT INTO mapa_edges (id, from_key, to_key, kind, note) VALUES
('edge_linha_kits_montagem', 'admin_linha_produtos', 'montagem_kits', 'data', 'Linha de kits de cada kit (campo linha em linhas-kits) para agrupar Gerenciamento e Central de Kits'),
('edge_linha_planejamento', 'admin_linha_produtos', 'planejamento_producao', 'data', 'Produto ativo e tipo (base) definem o que entra na fila de demandas; aba Base só com bases ativas')
ON CONFLICT (from_key, to_key, kind) DO NOTHING;

-- Migration: 032_update_mapa_canonical.sql
-- Atualiza mapa_modules, documentação técnica, detalhamento e conexões arquiteturais (mapa_edges)
-- Remove módulos descontinuados ou incorretos (compras_almoxarifado)

-- 1. Remoção de compras_almoxarifado (Almoxarifado é grupo próprio de 1º nível)
DELETE FROM mapa_edges WHERE from_key = 'compras_almoxarifado' OR to_key = 'compras_almoxarifado';
DELETE FROM mapa_routes WHERE module_key = 'compras_almoxarifado';
DELETE FROM mapa_modules WHERE module_key = 'compras_almoxarifado';

-- 2. Depreciação oficial de módulos descontinuados (ADR decisions/modulos-descontinuados.md)
DELETE FROM mapa_edges WHERE from_key = 'producao_bases' OR to_key = 'producao_bases';
UPDATE mapa_modules SET 
    status = 'deprecated',
    label = 'Gestão de Bases (Descontinuado)',
    purpose = 'Descontinuado: controle de bases unificado ao fluxo de Lotes de Produção.',
    detail = '{"notes": "Módulo descontinuado e unificado em Lotes de Produção e Linha de Produtos (ADR decisions/modulos-descontinuados.md).", "tabs": [], "functions": []}'::jsonb
WHERE module_key = 'producao_bases';

DELETE FROM mapa_edges WHERE from_key = 'estoque_previsao_uso' OR to_key = 'estoque_previsao_uso';
UPDATE mapa_modules SET 
    status = 'deprecated',
    label = 'Previsão de Uso (Descontinuado)',
    purpose = 'Descontinuado: previsão e consumo projetado unificados no Simulador de Compras (MRP).',
    detail = '{"notes": "Módulo descontinuado e unificado no Simulador de Compras MRP (ADR decisions/modulos-descontinuados.md).", "tabs": [], "functions": []}'::jsonb
WHERE module_key = 'estoque_previsao_uso';

-- 3. Upsert de novos módulos do ecossistema Nexus
INSERT INTO mapa_modules (module_key, group_key, label, purpose, status, sort_order, pos_x, pos_y, frontend_path, backend_path, router_prefix, ai_hints, detail)
VALUES
(
    'desenvolvimento',
    'sistema',
    'Desenvolvimento',
    'Central de arquitetura, mapa de módulos, rotas da API, fila de demandas e homologação de IA.',
    'live',
    10,
    920.0, 300.0,
    'Frontend/src/modules/geral/desenvolvimento/',
    'Backend/src/modules/geral/mapa/',
    '/api/mapa',
    '["Central de Engenharia", "Fonte da Verdade", "ai-memory"]'::jsonb,
    '{
        "notes": "Central oficial de engenharia do Nexus. Reúne o mapa vivo do sistema, rotas Axum, conexões arquiteturais e histórico unificado de demandas por módulo.",
        "tabs": [
            {"id": "arquitetura", "label": "Mapa & Arquitetura", "desc": "Visão gráfica e organograma de módulos"},
            {"id": "demandas", "label": "Fila de Demandas", "desc": "Feedbacks, bugs e melhorias vinculados a module_key"},
            {"id": "auditoria", "label": "Trilha de Auditoria", "desc": "Eventos estruturados de sistema (hub_audit_events)"},
            {"id": "novo_modulo", "label": "Novo Módulo", "desc": "Assistente guiado de scaffold arquitetural"}
        ],
        "functions": [
            {"name": "snapshot", "desc": "Consolida visão completa de grupos, módulos, rotas e conexões"},
            {"name": "update_module", "desc": "Atualiza metadados e documentação técnica do módulo"},
            {"name": "create_task", "desc": "Registra demanda técnica no fluxo de desenvolvimento"}
        ],
        "tables": ["mapa_groups", "mapa_modules", "mapa_edges", "mapa_routes", "mapa_tasks", "feedbacks"]
    }'::jsonb
),
(
    'ferramentas_editor',
    'sistema',
    'Editor de Etiquetas',
    'Central de design de etiquetas térmicas, templates ZPL, impressão direta e geração de QR Codes.',
    'live',
    20,
    920.0, 380.0,
    'Frontend/src/modules/ferramentas/etiquetas/',
    'Backend/src/modules/ferramentas/etiquetas/',
    '/api/ferramentas/etiquetas',
    '["Impressoras Térmicas", "ZPL", "Zebra", "Argox"]'::jsonb,
    '{
        "notes": "Motor de geração e formatação de etiquetas industriais. Suporta templates salvos no banco, substituição de variáveis de lote e código de barras/QR Code.",
        "tabs": [
            {"id": "editor", "label": "Design & Variáveis", "desc": "Pré-visualização e edição de layout"},
            {"id": "templates", "label": "Modelos Salvos", "desc": "Templates corporativos cadastrados"}
        ],
        "functions": [
            {"name": "render_zpl", "desc": "Compila layout visual para comandos de impressão ZPL/EPL"},
            {"name": "generate_qr", "desc": "Gera matriz de QR Code otimizada para leitura fabril"}
        ],
        "tables": ["hub_label_templates"]
    }'::jsonb
),
(
    'ferramentas_impressoras',
    'sistema',
    'Impressoras',
    'Spooler e controle de impressão direta em impressoras térmicas locais e de rede.',
    'live',
    30,
    920.0, 460.0,
    'Frontend/src/modules/ferramentas/impressoras/',
    'Backend/src/modules/ferramentas/impressoras/',
    '/api/ferramentas/impressoras',
    '["Spooler", "TCP Socket", "Direct Print"]'::jsonb,
    '{
        "notes": "Gerencia impressoras Zebra/Argox conectadas via rede (RAW socket porta 9100) ou spooler do sistema operacional.",
        "tabs": [
            {"id": "impressoras", "label": "Dispositivos", "desc": "Lista de impressoras cadastradas e status"}
        ],
        "functions": [
            {"name": "print_raw", "desc": "Envia payload ZPL direto para o socket TCP da impressora"}
        ]
    }'::jsonb
),
(
    'qualidade_avarias',
    'qualidade',
    'Avarias',
    'Registro e controle de avarias de transporte e avarias internas com fotos e descarte.',
    'live',
    40,
    700.0, 380.0,
    'Frontend/src/modules/qualidade/avarias/',
    'Backend/src/modules/qualidade/avarias/',
    '/api/qualidade/avarias',
    '["RNC", "Fotos Comprobatórias", "Descarte"]'::jsonb,
    '{
        "notes": "Registra e documenta produtos danificados no transporte ou chão de fábrica. Permite anexar fotos, calcular prejuízo e encaminhar para descarte.",
        "tabs": [
            {"id": "registro", "label": "Nova Avaria", "desc": "Formulário de cadastro com fotos"},
            {"id": "historico", "label": "Histórico", "desc": "Relatório de perdas por período e causa"}
        ],
        "tables": ["avarias"]
    }'::jsonb
),
(
    'qualidade_devolucoes',
    'qualidade',
    'Devoluções',
    'Triagem de mercadorias devolvidas, laudo de avaria e destinação final do produto.',
    'live',
    50,
    700.0, 460.0,
    'Frontend/src/modules/qualidade/devolucoes/',
    'Backend/src/modules/qualidade/devolucoes/',
    '/api/qualidade/devolucoes',
    '["Logística Reversa", "Triagem", "RNC"]'::jsonb,
    '{
        "notes": "Controla devoluções recebidas de clientes e plataformas online. Define se o produto retorna ao estoque, segue para reprocesso ou descarte.",
        "tabs": [
            {"id": "triagem", "label": "Triagem de Devoluções", "desc": "Conferência física e motivo de devolução"}
        ],
        "tables": ["devolucoes"]
    }'::jsonb
)
ON CONFLICT (module_key) DO UPDATE SET
    label = EXCLUDED.label,
    group_key = EXCLUDED.group_key,
    purpose = EXCLUDED.purpose,
    status = EXCLUDED.status,
    frontend_path = EXCLUDED.frontend_path,
    backend_path = EXCLUDED.backend_path,
    router_prefix = EXCLUDED.router_prefix,
    ai_hints = EXCLUDED.ai_hints,
    detail = EXCLUDED.detail;

-- 4. Atualização e enriquecimento de documentação dos módulos ativos

-- Produção (Gerenciamento)
UPDATE mapa_modules SET
    status = 'live',
    purpose = 'Planejamento semanal de produção, sequenciamento de reatores (manipulação) e linhas de envase.',
    frontend_path = 'Frontend/src/modules/producao/gerenciamento/',
    backend_path = 'Backend/src/modules/producao/',
    router_prefix = '/api/producao',
    detail = '{
        "notes": "Sequenciador industrial da fábrica. Controla a divisão física entre Reatores (500kg, 1.000kg, 2.000kg) e Linhas de Envase. Monitora gatilhos automáticos de produção programada e estoque mínimo.",
        "tabs": [
            {"id": "semanal", "label": "Quadro Semanal", "desc": "Programação de fabricação por dia e turno"},
            {"id": "reatores", "label": "Manipulação / Reatores", "desc": "Alocação de bateladas por capacidade de tanque"},
            {"id": "envase", "label": "Linhas de Envase", "desc": "Sequenciamento de envase, rotulagem e encaixotamento"},
            {"id": "historico", "label": "Histórico", "desc": "Ordens concluídas e apontamentos fabris"}
        ],
        "functions": [
            {"name": "calcular_gatilhos", "desc": "Verifica produtos com estoque projetado abaixo do ponto de disparo"},
            {"name": "alocar_reator", "desc": "Designa reator ideal conforme volume da batelada"},
            {"name": "conciliar_batelada", "desc": "Vincula batelada de semi-elaborado ao lote acabado envasado"}
        ],
        "tables": ["producao_ordens", "producao_bateladas", "overrides_produtos"]
    }'::jsonb
WHERE module_key = 'producao';

-- Produção Lotes
UPDATE mapa_modules SET
    status = 'live',
    purpose = 'Geração, conciliação e rastreabilidade ponta a ponta de lotes de fabricação com vínculo a laudos.',
    frontend_path = 'Frontend/src/modules/producao/lotes/',
    backend_path = 'Backend/src/modules/producao/',
    router_prefix = '/api/producao/lotes',
    detail = '{
        "notes": "Gera código identificador único de lote industrial no padrão YYMMDD-seq. Rastreia matérias-primas utilizadas, laudos analíticos emitidos e caixas produzidas.",
        "tabs": [
            {"id": "ativos", "label": "Lotes Ativos", "desc": "Lotes em processo de fabricação ou envase"},
            {"id": "quarentena", "label": "Quarentena", "desc": "Lotes aguardando laudo físico-químico e microbiológico"},
            {"id": "liberados", "label": "Lotes Liberados", "desc": "Lotes aprovados pela Qualidade prontos para expedição"}
        ],
        "functions": [
            {"name": "gerar_lote", "desc": "Cria identificador sequencial com data de fabricação e validade"},
            {"name": "rastrear_insumos", "desc": "Recupera lotes de matérias-primas e embalagens consumidos na batelada"}
        ],
        "tables": ["reports", "lotes_producao"]
    }'::jsonb
WHERE module_key = 'producao_lotes';

-- Físico-Química
UPDATE mapa_modules SET
    status = 'live',
    purpose = 'Ensaios de bancada (pH, viscosidade, densidade, aspecto e cor) para liberação de lotes cosméticos.',
    frontend_path = 'Frontend/src/modules/producao/fisco_quimica/',
    backend_path = 'Backend/src/modules/producao/',
    router_prefix = '/api/producao/fisco-quimica',
    detail = '{
        "notes": "Compara os resultados físico-químicos obtidos em laboratório com as especificações da ANVISA e do cadastro de fórmulas para emitir laudo de aprovação ou quarentena.",
        "tabs": [
            {"id": "ensaios", "label": "Ensaios", "desc": "Fila de análises pendentes de medição"},
            {"id": "laudos", "label": "Laudos Aprovados", "desc": "Histórico de certificados analíticos emitidos"}
        ],
        "tables": ["laudos_laboratorio"]
    }'::jsonb
WHERE module_key = 'fisco_quimica';

-- Microbiologia
UPDATE mapa_modules SET
    status = 'live',
    purpose = 'Controle microbiológico de lotes e matérias-primas (mesófilos, fungos e patógenos) com tempo de incubação.',
    frontend_path = 'Frontend/src/modules/producao/microbiologia/',
    backend_path = 'Backend/src/modules/producao/',
    router_prefix = '/api/producao/microbiologia',
    detail = '{
        "notes": "Acompanha o período de incubação das placas microbiológicas (24h a 72h). Apenas lotes com laudo micro aprovado podem ser liberados para faturamento.",
        "tabs": [
            {"id": "incubacao", "label": "Incubação", "desc": "Placas em estufa com contador de tempo"},
            {"id": "leitura", "label": "Leitura e Laudo", "desc": "Contagem de UFC e emissão de laudo"}
        ],
        "tables": ["laudos_microbiologia"]
    }'::jsonb
WHERE module_key = 'microbiologia';

-- Montagem de Kits
UPDATE mapa_modules SET
    status = 'live',
    purpose = 'Composição e desdobramento de kits promocionais com baixa atômica de produtos componentes.',
    frontend_path = 'Frontend/src/modules/producao/montagem_kits/',
    backend_path = 'Backend/src/modules/producao/',
    router_prefix = '/api/producao/montagem-kits',
    detail = '{
        "notes": "Controla a estrutura de kits. Ao apontar montagem de kit, dá baixa automática nos produtos acabados componentes e incrementa o saldo do kit.",
        "tabs": [
            {"id": "montagem", "label": "Ordens de Montagem", "desc": "Fila de caixas de kits a montar"},
            {"id": "estruturas", "label": "Composição de Kits", "desc": "Estrutura e proporções de componentes"}
        ],
        "tables": ["kit_composicao"]
    }'::jsonb
WHERE module_key = 'montagem_kits';

-- POPs (Qualidade)
UPDATE mapa_modules SET
    status = 'live',
    purpose = 'Procedimentos Operacionais Padrão (POPs) versionados em HTML/PDF, revisões anuais e catálogo setorial.',
    frontend_path = 'Frontend/src/modules/qualidade/pops/',
    backend_path = 'Backend/src/modules/qualidade/pops/',
    router_prefix = '/api/qualidade/pops',
    detail = '{
        "notes": "Centraliza os POPs industriais da empresa. Controla status de validade anual (vigente, a expirar, vencido), histórico de revisões com controle de autoria e leitor embutido.",
        "tabs": [
            {"id": "procedimentos", "label": "POPs Vigentes", "desc": "Catálogo de documentos ativos por setor"},
            {"id": "setores", "label": "Setores", "desc": "Agrupamento por setor fabril (Manipulação, Envase, Almoxarifado, etc.)"},
            {"id": "config", "label": "Configurações", "desc": "Parâmetros de alerta de revisão e logotipo corporativo"}
        ],
        "tables": ["pop_documents", "pop_sectors", "pop_versions"]
    }'::jsonb
WHERE module_key = 'qualidade_pops';

-- Recebimento MP (Qualidade)
UPDATE mapa_modules SET
    status = 'live',
    purpose = 'Conferência física, quarentena e laudo de entrada de matérias-primas e embalagens de fornecedores.',
    frontend_path = 'Frontend/src/modules/qualidade/recebimento_mp/',
    backend_path = 'Backend/src/modules/qualidade/recebimento_mp/',
    router_prefix = '/api/qualidade/recebimento-mp',
    detail = '{
        "notes": "Primeiro filtro de qualidade na chegada de cargas. Confere laudo do fabricante, peso, lacre e estado de conservação antes de liberar para o estoque.",
        "tabs": [
            {"id": "inspecao", "label": "Inspeção de Entrada", "desc": "Fila de notas recebidas aguardando laudo"},
            {"id": "historico", "label": "Laudos Emitidos", "desc": "Histórico de liberações e recusas de carga"}
        ],
        "tables": ["recebimento_mp", "erp_recebimentos_insumos"]
    }'::jsonb
WHERE module_key = 'qualidade_recebimento_mp';

-- Documentação (Qualidade)
UPDATE mapa_modules SET
    status = 'live',
    purpose = 'Certificados, alvarás da fábrica, licenças sanitárias e controle de vencimentos para auditorias BPF.',
    frontend_path = 'Frontend/src/modules/qualidade/documentacao/',
    backend_path = 'Backend/src/modules/qualidade/documentacao/',
    router_prefix = '/api/qualidade/documentacao',
    detail = '{
        "notes": "Repositório seguro de arquivos de conformidade regulatória. Alerta operadores e supervisor sobre licenças e laudos próximos do vencimento.",
        "tabs": [
            {"id": "documentos", "label": "Documentos Ativos", "desc": "Alvarás, licenças e laudos de calibração"},
            {"id": "alertas", "label": "Alertas de Vencimento", "desc": "Documentos com renovação necessária"}
        ],
        "tables": ["documents", "document_files", "doc_families"]
    }'::jsonb
WHERE module_key = 'qualidade_documentacao';

-- Simulador MRP (Compras)
UPDATE mapa_modules SET
    status = 'live',
    purpose = 'Simulador MRP: cálculo de necessidade líquida de compras considerando estoque atual, ordens em trânsito e consumo projetado.',
    frontend_path = 'Frontend/src/modules/compras/planejamento/',
    backend_path = 'Backend/src/modules/compras/planejamento/',
    router_prefix = '/api/compras/simulation',
    detail = '{
        "notes": "Motor analítico de suprimentos. Aplica a Regra Canônica de Estoque: Necessidade = (Consumo Projetado + Estoque Mínimo) - (Estoque Físico + Pedidos Aprovados). Agrupa insumos semelhantes para atingir lote econômico.",
        "tabs": [
            {"id": "simulador", "label": "Simulador MRP", "desc": "Tabela interativa de cálculo de necessidades e sugestão de compra"},
            {"id": "semelhantes", "label": "Itens Semelhantes", "desc": "Agrupamento de compras para negociação em escala"}
        ],
        "functions": [
            {"name": "calcular_necessidade", "desc": "Calcula compra sugerida subtraindo pedidos em trânsito e adicionando reserva técnica"}
        ],
        "tables": ["stock_snapshots", "compras_config_personalizado"]
    }'::jsonb
WHERE module_key = 'compras_simulation';

-- Pedidos de Compra
UPDATE mapa_modules SET
    status = 'live',
    purpose = 'Acompanhamento de pedidos de compra emitidos, previsão de entrega e conciliação com notas.',
    frontend_path = 'Frontend/src/modules/compras/controle_pedidos/',
    backend_path = 'Backend/src/modules/compras/',
    router_prefix = '/api/compras/pedidos',
    detail = '{
        "notes": "Controla os pedidos de compra fechados com fornecedores. Impede duplicidade de compra e avisa quando o prazo de entrega foi superado.",
        "tabs": [
            {"id": "abertos", "label": "Pedidos Abertos", "desc": "Aguardando envio pelo fornecedor"},
            {"id": "historico", "label": "Histórico", "desc": "Pedidos entregues e faturados"}
        ]
    }'::jsonb
WHERE module_key = 'compras_pedidos';

-- Notas Fiscais de Compra
UPDATE mapa_modules SET
    status = 'live',
    purpose = 'Entrada e conferência de notas fiscais de fornecedores com importação de XML/DANFE e conciliação de pedido.',
    frontend_path = 'Frontend/src/modules/compras/notas_fiscais/',
    backend_path = 'Backend/src/modules/compras/',
    router_prefix = '/api/compras/notas',
    detail = '{
        "notes": "Realiza a conferência entre o que foi faturado na NF e o pedido aprovado de compra, identificando variações de preço ou quantidade.",
        "tabs": [
            {"id": "notas", "label": "Notas Fiscais", "desc": "Listagem de XMLs importados e status de conciliação"}
        ]
    }'::jsonb
WHERE module_key = 'compras_notas';

-- Almoxarifado Geral
UPDATE mapa_modules SET
    status = 'live',
    purpose = 'Gestão de consumíveis fabris, peças de reposição, ferramentas, EPIs e compras locais APP_*.',
    frontend_path = 'Frontend/src/modules/estoque/almoxarifado/',
    backend_path = 'Backend/src/modules/estoque/almoxarifado/',
    router_prefix = '/api/almox',
    detail = '{
        "notes": "Controla os itens consumíveis que mantêm a operação fabril em funcionamento (óleo, EPIs, fita adesiva, mangueiras, solventes de limpeza). Controla compras locais e saldos por prateleira.",
        "tabs": [
            {"id": "itens", "label": "Catálogo de Itens", "desc": "Cadastro de consumíveis e saldo atual"},
            {"id": "movimentos", "label": "Movimentações", "desc": "Registro de requisições de saída por operador"},
            {"id": "demandas", "label": "Requisições de Compra", "desc": "Solicitações de compra local geradas pelo chão de fábrica"}
        ],
        "tables": ["almox_balances", "almox_movements", "almox_purchase_demands"]
    }'::jsonb
WHERE module_key = 'estoque_almoxarifado';

-- Almoxarifado Equipamentos
UPDATE mapa_modules SET
    status = 'live',
    purpose = 'Ficha cadastral de máquinas fabris, reatores, envasadoras, rotuladoras e histórico de peças.',
    frontend_path = 'Frontend/src/modules/estoque/equipamentos/',
    backend_path = 'Backend/src/modules/estoque/almoxarifado/',
    router_prefix = '/api/almox/equipamentos',
    detail = '{
        "notes": "Prontuário técnico de cada ativo da fábrica. Rastreia manual técnico, peças sobressalentes vinculadas e periodicidade de preventiva.",
        "tabs": [
            {"id": "maquinas", "label": "Máquinas", "desc": "Fichas técnicas e ativos industriais"}
        ],
        "tables": ["estoque_equipamentos"]
    }'::jsonb
WHERE module_key = 'estoque_equipamentos';

-- Almoxarifado Manutenções
UPDATE mapa_modules SET
    status = 'live',
    purpose = 'Controle de ordens de manutenção preventiva e corretiva com baixa de peças de reposição do almoxarifado.',
    frontend_path = 'Frontend/src/modules/estoque/manutencoes/',
    backend_path = 'Backend/src/modules/estoque/almoxarifado/',
    router_prefix = '/api/almox/manutencoes',
    detail = '{
        "notes": "Emissão de ordens de serviço para mecânica e elétrica fabril. Ao concluir a manutenção, dá baixa automática nas peças utilizadas no saldo do almoxarifado.",
        "tabs": [
            {"id": "preventiva", "label": "Preventivas", "desc": "Cronograma de paradas programadas"},
            {"id": "corretiva", "label": "Corretivas", "desc": "Ordens emergenciais abertas"}
        ],
        "tables": ["estoque_manutencoes", "estoque_manutencao_pecas"]
    }'::jsonb
WHERE module_key = 'estoque_manutencoes';

-- Estoque Produtos Acabados
UPDATE mapa_modules SET
    status = 'live',
    purpose = 'Consulta de saldos físicos de produtos acabados, conciliação com ERP e lotes em estoque.',
    frontend_path = 'Frontend/src/modules/estoque/estoque_geral/',
    backend_path = 'Backend/src/modules/estoque/estoque_geral/',
    router_prefix = '/api/estoque',
    detail = '{
        "notes": "Visão consolidada de saldo disponível para faturamento, saldo reservado e lotes em armazém.",
        "tabs": [
            {"id": "produtos", "label": "Produtos Acabados", "desc": "Saldo físico, empenhos e localização"}
        ],
        "tables": ["estoque_atual"]
    }'::jsonb
WHERE module_key = 'estoque_produtos';

-- Estoque Matéria-Prima
UPDATE mapa_modules SET
    status = 'live',
    purpose = 'Consulta de matérias-primas fracionadas e granel com localização física e validade.',
    frontend_path = 'Frontend/src/modules/estoque/estoque_geral/',
    backend_path = 'Backend/src/modules/estoque/estoque_geral/',
    router_prefix = '/api/estoque',
    detail = '{
        "notes": "Armazena matérias-primas aprovadas pela Qualidade para uso na manipulação de cosméticos.",
        "tabs": [
            {"id": "mp", "label": "Matéria-Prima", "desc": "Saldos por lote do fornecedor e validade"}
        ]
    }'::jsonb
WHERE module_key = 'estoque_materia_prima';

-- Expedição E-commerce
UPDATE mapa_modules SET
    status = 'live',
    purpose = 'Fila de pedidos faturados para separação (picking), conferência (packing) e despacho de pacotes.',
    frontend_path = 'Frontend/src/modules/expedicao/',
    backend_path = 'Backend/src/modules/expedicao/',
    router_prefix = '/api/expedicao',
    detail = '{
        "notes": "Módulo de expedição rápida. Lê código de barras dos produtos ao empacotar, valida itens contra o pedido e imprime etiqueta de transporte.",
        "tabs": [
            {"id": "fila", "label": "Fila de Despacho", "desc": "Pedidos prontos para embalagem"},
            {"id": "conferidos", "label": "Conferidos", "desc": "Pacotes etiquetados aguardando coleta"}
        ],
        "tables": ["ecommerce_orders", "ecommerce_shipping"]
    }'::jsonb
WHERE module_key = 'expedicao_ecommerce';

-- 5. Reconstrução completa e canônica das Conexões Arquiteturais (mapa_edges)
DELETE FROM mapa_edges;

INSERT INTO mapa_edges (id, from_key, to_key, kind, note) VALUES
-- Administrativo -> Produção, Estoque e Compras
('edge_linha_prod', 'admin_linha_produtos', 'producao', 'data', 'Eixo central define fórmulas, rendimento e grade a fabricar'),
('edge_linha_est', 'admin_linha_produtos', 'estoque_produtos', 'data', 'Catálogo de acabados, códigos ERP e saldo de segurança'),
('edge_linha_mrp', 'admin_linha_produtos', 'compras_simulation', 'data', 'Estrutura técnica de consumo de insumos para explosão MRP'),
('edge_linha_vendas', 'admin_linha_produtos', 'vendas', 'feeds', 'Produtos ativos disponíveis na tabela comercial'),

-- Compras e Suprimentos
('edge_sim_pedidos', 'compras_simulation', 'compras_pedidos', 'flow', 'Necessidade líquida convertida em ordens de compra'),
('edge_ped_notas', 'compras_pedidos', 'compras_notas', 'flow', 'Conciliação fiscal de XMLs contra pedidos aprovados'),
('edge_notas_rec', 'compras_notas', 'qualidade_recebimento_mp', 'events', 'Entrada física de carga gera lote para quarentena'),
('edge_sim_prod', 'compras_simulation', 'producao', 'feeds', 'Chegada de insumos libera ordens travadas no planejamento'),

-- Qualidade
('edge_rec_est_mp', 'qualidade_recebimento_mp', 'estoque_materia_prima', 'flow', 'Insumos aprovados em laudo liberados para saldo ativo'),
('edge_pops_prod', 'qualidade_pops', 'producao', 'data', 'Procedimentos Operacionais Padrão e instruções técnicas BPF'),
('edge_pops_doc', 'qualidade_pops', 'qualidade_documentacao', 'data', 'Histórico regulatório de revisões e auditoria ANVISA'),
('edge_avarias_est', 'qualidade_avarias', 'estoque_produtos', 'events', 'Baixa de estoque por quebra ou dano no processo'),
('edge_devol_vendas', 'qualidade_devolucoes', 'vendas', 'events', 'Triagem de logística reversa e retorno ao armazém'),

-- Produção Industrial
('edge_prod_lotes', 'producao', 'producao_lotes', 'flow', 'Ordens de batelada convertidas em lotes rastreáveis'),
('edge_lotes_fq', 'producao_lotes', 'fisco_quimica', 'events', 'Amostragem de tanque para ensaios de pH, viscosidade e densidade'),
('edge_lotes_micro', 'producao_lotes', 'microbiologia', 'events', 'Amostragem para incubação de mesófilos e fungos'),
('edge_lotes_kits', 'producao_lotes', 'montagem_kits', 'flow', 'Lotes aprovados liberados para composição de kits'),
('edge_lotes_acabados', 'producao_lotes', 'estoque_produtos', 'flow', 'Lotes liberados entram no saldo disponível de vendas'),
('edge_lotes_etiquetas', 'producao_lotes', 'ferramentas_editor', 'data', 'Impressão de etiquetas térmicas de lote e caixas'),

-- Almoxarifado e Manutenção
('edge_almox_manut', 'estoque_almoxarifado', 'estoque_manutencoes', 'flow', 'Atendimento de peças e consumíveis para manutenção'),
('edge_almox_prod', 'estoque_almoxarifado', 'producao', 'data', 'Fornecimento de EPIs e materiais de apoio operacional'),
('edge_equip_manut', 'estoque_equipamentos', 'estoque_manutencoes', 'data', 'Prontuário de máquinas orienta ordens preventivas'),

-- Vendas e Expedição
('edge_vendas_exp', 'vendas', 'expedicao_ecommerce', 'flow', 'Pedidos faturados liberados para separação e despacho'),
('edge_exp_est', 'expedicao_ecommerce', 'estoque_produtos', 'flow', 'Baixa de estoque por conferência no empacotamento'),
('edge_exp_etiquetas', 'expedicao_ecommerce', 'ferramentas_editor', 'data', 'Emissão de etiquetas de envio e declaração de conteúdo'),

-- Sistema e Governança
('edge_desenv_settings', 'desenvolvimento', 'hub_settings', 'data', 'Governança arquitetural, trilha de auditoria e configurações'),
('edge_settings_operadores', 'hub_settings', 'hub_operadores', 'data', 'Controle de acesso granular baseado em module_keys'),
('edge_settings_audit', 'hub_settings', 'audit', 'audit', 'Trilha estruturada de eventos (hub_audit_events)');

pub mod handlers;
pub mod models;
pub mod servicos;
pub mod store;

use std::sync::Arc;
use axum::{
    routing::{get, post, put, delete},
    Router,
};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/almox/dashboard/stats", get(handlers::get_dashboard_stats))
        .route("/api/almox/items", get(handlers::list_items))
        .route("/api/almox/items/search", get(handlers::search_catalog))
        .route("/api/almox/items/local", post(handlers::create_local_item))
        .route("/api/almox/items/:code", get(handlers::get_item).delete(handlers::delete_item))
        .route(
            "/api/almox/items/:code/config",
            put(handlers::upsert_item_config),
        )
        .route(
            "/api/almox/items/:code/stats",
            get(handlers::get_item_stats),
        )
        .route(
            "/api/almox/items/:code/consumption",
            get(handlers::get_item_consumption),
        )
        .route(
            "/api/almox/fotos/:entity_type/:entity_id",
            get(handlers::list_fotos).post(handlers::add_foto),
        )
        .route(
            "/api/almox/fotos/:id",
            delete(handlers::delete_foto),
        )
        .route(
            "/api/almox/familias",
            get(handlers::list_familias).post(handlers::upsert_familia),
        )
        .route(
            "/api/almox/familias/:id",
            delete(handlers::delete_familia),
        )
        .route(
            "/api/almox/movements",
            get(handlers::list_movements).post(handlers::create_movement),
        )
        .route("/api/almox/counts/latest", get(handlers::latest_stock_count))
        .route("/api/almox/counts", post(handlers::apply_stock_count))
        .route("/api/almox/replenishment", get(handlers::list_replenishment))
        .route(
            "/api/almox/demands",
            get(handlers::list_demands).post(handlers::create_demand),
        )
        .route(
            "/api/almox/print-sequence",
            get(handlers::get_print_sequence),
        )
        .route(
            "/api/almox/demands/history",
            get(handlers::get_item_purchase_history),
        )
        .route(
            "/api/almox/demands/from-min",
            post(handlers::create_demand_from_min),
        )
        .route(
            "/api/almox/equipments",
            get(handlers::list_equipments).post(handlers::create_equipment),
        )
        .route(
            "/api/almox/equipments/:id",
            get(handlers::get_equipment).put(handlers::update_equipment),
        )
        .route(
            "/api/almox/maintenances",
            get(handlers::list_maintenances).post(handlers::create_maintenance),
        )
        .route(
            "/api/almox/maintenances/:id",
            put(handlers::update_maintenance),
        )
}

/// Ações do Almoxarifado descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<crate::core::catalogo::Acao> {
    use crate::core::catalogo::{param, Acao};
    vec![
        Acao::leitura(
            "obter_painel_almox",
            "estoque_almoxarifado",
            "Indicadores gerais do almoxarifado: totais de itens por seção (almoxarifado, supermercado, peças), quantos estão abaixo do mínimo, peças vencidas ou a vencer, equipamentos (total, em operação, em manutenção, parados) e manutenções abertas. Use como visão inicial antes de `listar_reposicao_almox`.",
            "/api/almox/dashboard/stats",
            vec![],
        ),
        Acao::leitura(
            "listar_itens_almox",
            "estoque_almoxarifado",
            "Lista os itens do almoxarifado por descrição, com unidade, seção, saldo (`qtyOnHand`), mínimo, ideal, local, custo médio, saldo no ERP e se está abaixo do mínimo (`belowMin`). Filtre por seção e `onlyActive`. Para um item só use `detalhar_item_almox`.",
            "/api/almox/items",
            vec![
                param("onlyActive", "query", "booleano", false, "Só itens ativos."),
                param("section", "query", "texto", false, "Filtra por seção."),
            ],
        ),
        Acao::leitura(
            "buscar_catalogo_almox",
            "estoque_itens",
            "Busca itens do catálogo do ERP por código ou descrição para vincular ao almoxarifado (padrão 40, ignora os marcados como ignorados). Sem texto devolve lista vazia. Devolve código, descrição, unidade e categoria.",
            "/api/almox/items/search",
            vec![
                param("q", "query", "texto", true, "Texto da busca."),
                param("limit", "query", "inteiro", false, "Máximo de resultados (40 por padrão)."),
            ],
        ),
        Acao::leitura(
            "detalhar_item_almox",
            "estoque_almoxarifado",
            "Um item do almoxarifado pelo código (dentro de `item`): descrição, unidade, seção, saldo, mínimo, ideal, local, custo médio, saldo no ERP e configuração de vida útil/troca. Dá 404 se o item não está no catálogo operacional.",
            "/api/almox/items/:code",
            vec![
                param("code", "caminho", "texto", true, "Código do item."),
            ],
        ),
        Acao::leitura(
            "obter_estatisticas_item_almox",
            "estoque_almoxarifado",
            "Estatísticas de um item: saldo, mínimo e ideal, saída média diária nos últimos 30 e 90 dias, custo médio dos últimos 30 dias, quantidade de compra sugerida (`suggestedBuyQty`) e se está abaixo do mínimo. Use para decidir quanto comprar.",
            "/api/almox/items/:code/stats",
            vec![
                param("code", "caminho", "texto", true, "Código do item."),
            ],
        ),
        Acao::leitura(
            "obter_consumo_item_almox",
            "estoque_almoxarifado",
            "Consumo histórico de um item (saídas do almoxarifado somadas ao consumo do ERP): `consumptionYoy` (total por ano) e `monthlyConsumption` (por mês, até 24 meses). Use para ver sazonalidade antes de definir o mínimo.",
            "/api/almox/items/:code/consumption",
            vec![
                param("code", "caminho", "texto", true, "Código do item."),
            ],
        ),
        Acao::leitura(
            "listar_familias_almox",
            "estoque_almoxarifado",
            "Lista as famílias (seções) de itens do almoxarifado em `familias`: id, nome, ícone, cor e ordem. Use para obter o id da seção ao criar ou configurar itens.",
            "/api/almox/familias",
            vec![],
        ),
        Acao::leitura(
            "listar_movimentos_almox",
            "estoque_almoxarifado",
            "Lista as movimentações do almoxarifado (mais novas primeiro, padrão 200): item, tipo (entrada, saída ou ajuste), quantidade, custo unitário, motivo, documento, quem lançou, data e setor. Filtre por item e período. Para lançar use `lancar_movimento_almox`.",
            "/api/almox/movements",
            vec![
                param("itemCode", "query", "texto", false, "Só movimentos deste item."),
                param("from", "query", "data", false, "Data inicial (AAAA-MM-DD)."),
                param("to", "query", "data", false, "Data final (AAAA-MM-DD)."),
                param("limit", "query", "inteiro", false, "Máximo de linhas (200 por padrão)."),
            ],
        ),
        Acao::leitura(
            "obter_ultima_contagem_almox",
            "estoque_almoxarifado",
            "Situação da contagem de estoque: data da última contagem aplicada, data da próxima (7 dias depois; hoje se nunca houve) e se está vencida (`due`). Use antes de `aplicar_contagem_almox`.",
            "/api/almox/counts/latest",
            vec![],
        ),
        Acao::leitura(
            "listar_reposicao_almox",
            "estoque_almoxarifado",
            "Itens ativos abaixo do mínimo que precisam de reposição, com as estatísticas de cada um (saldo, mínimo, ideal, saída média e quantidade sugerida), da maior sugestão de compra para a menor. Para gerar a demanda de uma vez use `criar_demanda_do_minimo_almox`.",
            "/api/almox/replenishment",
            vec![],
        ),
        Acao::leitura(
            "listar_demandas_almox",
            "estoque_almoxarifado",
            "Lista as demandas de compra do almoxarifado (até 300, da mais nova): título, status, quem pediu, origem, valor cotado e comprado, loja, código de rastreio, datas de compra e recebimento, e os itens (pedida x recebida). Para o histórico de um item use `consultar_historico_compra_almox`.",
            "/api/almox/demands",
            vec![],
        ),
        Acao::leitura(
            "consultar_historico_compra_almox",
            "estoque_almoxarifado",
            "Histórico de compras de um item (ou busca por texto): demanda, título, loja, data da compra, valor comprado e cotado, custo unitário, quantidade e cotações. Use para saber onde e por quanto foi comprado antes.",
            "/api/almox/demands/history",
            vec![
                param("itemCode", "query", "texto", false, "Código do item."),
                param("q", "query", "texto", false, "Texto de busca."),
            ],
        ),
        Acao::leitura(
            "listar_equipamentos_almox",
            "estoque_equipamentos",
            "Lista os equipamentos e peças do parque por nome: código, setor, status, marca, modelo, tipo, local, intervalo e datas de manutenção (última e próxima), peças vinculadas, total gasto e manutenções abertas.",
            "/api/almox/equipments",
            vec![],
        ),
        Acao::leitura(
            "detalhar_equipamento_almox",
            "estoque_equipamentos",
            "Um equipamento pelo id, com cadastro completo (código, nome, setor, status, marca, modelo, série, local, fornecedor, aquisição, valor, intervalo e datas de manutenção, peças, total gasto). Para as manutenções use `listar_manutencoes_almox`.",
            "/api/almox/equipments/:id",
            vec![
                param("id", "caminho", "texto", true, "Id do equipamento."),
            ],
        ),
        Acao::leitura(
            "listar_manutencoes_almox",
            "estoque_manutencoes",
            "Lista as manutenções de equipamentos: equipamento, tipo, status, rotina, peça, técnico, custo, datas (ocorrência, agendada, conclusão) e recorrência. Filtre por `equipmentId`.",
            "/api/almox/maintenances",
            vec![
                param("equipmentId", "query", "texto", false, "Só manutenções deste equipamento."),
            ],
        ),
        // ---- Escritas: todas em 2 passos (sem `confirmar=true` só devolvem a prévia) e auditadas com o autor.
        Acao::gravacao(
            "criar_item_local_almox",
            "estoque_almoxarifado",
            "Cadastra um item local do Supermercado (fora do ERP): descrição, unidade, seção e, opcionalmente, código, mínimo, ideal, local e validade. Devolve o item criado. Vai para a auditoria. Sem `confirmar=true` mostra só a prévia.",
            "POST",
            "/api/almox/items/local",
            true,
            vec![
                param("section", "corpo", "texto", true, "Seção; só 'supermercado'."),
                param("description", "corpo", "texto", true, "Descrição do item."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "salvar_config_item_almox",
            "estoque_almoxarifado",
            "Salva a configuração de um item do almoxarifado: seção, mínimo, ideal, local, ativo, observações, vida útil e datas de troca, embalagem padrão e foto. Campos omitidos ficam como estão. Vai para a auditoria. Sem `confirmar=true` mostra só a prévia.",
            "PUT",
            "/api/almox/items/:code/config",
            true,
            vec![
                param("code", "caminho", "texto", true, "Código do item."),
                param("section", "corpo", "texto", false, "Seção do item."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::exclusao(
            "excluir_item_almox",
            "estoque_almoxarifado",
            "Remove um item do almoxarifado: apaga a configuração, o saldo, os movimentos, as contagens, as fotos e o cadastro do item. Vai para a auditoria. Exige `motivo` ao confirmar; a cópia do que foi apagado fica na auditoria; agentes não podem usar. Sem `confirmar=true` mostra só a prévia do que seria apagado.",
            "DELETE",
            "/api/almox/items/:code",
            vec![
                param("code", "caminho", "texto", true, "Código do item."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "salvar_familia_almox",
            "estoque_almoxarifado",
            "Cria ou atualiza uma família (seção) de itens do almoxarifado pelo `id`, com nome e, opcionalmente, ícone, cor e ordem. Vai para a auditoria. Sem `confirmar=true` mostra só a prévia.",
            "POST",
            "/api/almox/familias",
            true,
            vec![
                param("id", "corpo", "texto", true, "Identificador da família."),
                param("label", "corpo", "texto", true, "Nome da família."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::exclusao(
            "excluir_familia_almox",
            "estoque_almoxarifado",
            "Remove uma família (seção); os itens dela passam para 'outros'. Vai para a auditoria. Exige `motivo` ao confirmar; a cópia do que foi apagado fica na auditoria; agentes não podem usar. Sem `confirmar=true` mostra só a prévia.",
            "DELETE",
            "/api/almox/familias/:id",
            vec![
                param("id", "caminho", "texto", true, "Identificador da família."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "lancar_movimento_almox",
            "estoque_almoxarifado",
            "Lança entrada, saída ou ajuste de saldo de um item do almoxarifado. A prévia mostra o movimento sem gravar.",
            "POST",
            "/api/almox/movements",
            true,
            vec![
                param("itemCode", "corpo", "texto", true, "Código do item."),
                param("movementType", "corpo", "texto", true, "entrada, saida ou ajuste (ajuste só supervisor)."),
                param("quantity", "corpo", "numero", true, "Quantidade (no ajuste, o saldo novo)."),
                param("reason", "corpo", "texto", false, "Motivo."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "aplicar_contagem_almox",
            "estoque_almoxarifado",
            "Aplica uma contagem de estoque: ajusta o saldo dos itens contados. A prévia mostra entradas e saídas geradas.",
            "POST",
            "/api/almox/counts",
            true,
            vec![
                param("lines", "corpo", "lista", true, "Itens contados (código e quantidade)."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "criar_demanda_almox",
            "estoque_almoxarifado",
            "Cria uma demanda de compra do almoxarifado com título, observações, origem, setor, urgência, equipamento e os itens a comprar (código, descrição, quantidade). Devolve a demanda criada. Para incluir todos os itens abaixo do mínimo use `criar_demanda_do_minimo_almox`. Sem `confirmar=true` mostra só a prévia.",
            "POST",
            "/api/almox/demands",
            true,
            vec![
                param("title", "corpo", "texto", false, "Título da demanda."),
                param("items", "corpo", "lista", false, "Itens a comprar."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "criar_demanda_do_minimo_almox",
            "estoque_almoxarifado",
            "Cria uma demanda de compra com todos os itens ativos abaixo do mínimo, na quantidade sugerida de cada um (a mesma lista de `listar_reposicao_almox`). Sem `confirmar=true` mostra só a prévia com os itens.",
            "POST",
            "/api/almox/demands/from-min",
            true,
            vec![param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia.")],
        ),
        Acao::gravacao(
            "adicionar_foto_almox",
            "estoque_almoxarifado",
            "Anexa uma foto (data URL) a um item (`entity_type`=item, com o código) ou a um equipamento (`equipment`, com o id). Devolve a foto gravada. Vai para a auditoria. Sem `confirmar=true` mostra só a prévia.",
            "POST",
            "/api/almox/fotos/:entity_type/:entity_id",
            true,
            vec![
                param("entity_type", "caminho", "texto", true, "item ou equipment."),
                param("entity_id", "caminho", "texto", true, "Código do item ou id do equipamento."),
                param("photoData", "corpo", "texto", true, "Foto em data URL."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::exclusao(
            "excluir_foto_almox",
            "estoque_almoxarifado",
            "Remove uma foto anexada a item ou equipamento pelo id. Vai para a auditoria. Exige `motivo` ao confirmar; a cópia do que foi apagado fica na auditoria; agentes não podem usar. Sem `confirmar=true` mostra só a prévia.",
            "DELETE",
            "/api/almox/fotos/:id",
            vec![
                param("id", "caminho", "texto", true, "Id da foto."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "criar_equipamento_almox",
            "estoque_equipamentos",
            "Cadastra um equipamento do parque: código e nome obrigatórios; opcionais setor, status, marca, modelo, série, local, fornecedor, aquisição, valor, intervalo de manutenção e peças. Devolve o equipamento criado. Vai para a auditoria. Sem `confirmar=true` mostra só a prévia.",
            "POST",
            "/api/almox/equipments",
            true,
            vec![
                param("code", "corpo", "texto", true, "Código do equipamento."),
                param("name", "corpo", "texto", true, "Nome."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "atualizar_equipamento_almox",
            "estoque_equipamentos",
            "Atualiza o cadastro de um equipamento (mesmos campos de `criar_equipamento_almox`; código e nome são obrigatórios). Devolve o equipamento atualizado. Vai para a auditoria. Sem `confirmar=true` mostra só a prévia.",
            "PUT",
            "/api/almox/equipments/:id",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id do equipamento."),
                param("code", "corpo", "texto", true, "Código do equipamento."),
                param("name", "corpo", "texto", true, "Nome."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "criar_manutencao_almox",
            "estoque_manutencoes",
            "Registra uma manutenção de equipamento (tipo obrigatório; opcionais rotina, peça, técnico, custo, datas e recorrência em dias); se for recorrente, cria também a próxima. Devolve a manutenção criada. Sem `confirmar=true` mostra só a prévia.",
            "POST",
            "/api/almox/maintenances",
            true,
            vec![
                param("equipmentId", "corpo", "texto", true, "Id do equipamento."),
                param("kind", "corpo", "texto", true, "Tipo da manutenção."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
        Acao::gravacao(
            "atualizar_manutencao_almox",
            "estoque_manutencoes",
            "Atualiza uma manutenção: status, datas (ocorrência, agendada, conclusão), técnico, custo, observações e as peças usadas. Devolve a manutenção atualizada. Vai para a auditoria. Sem `confirmar=true` mostra só a prévia.",
            "PUT",
            "/api/almox/maintenances/:id",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id da manutenção."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
    ]
}

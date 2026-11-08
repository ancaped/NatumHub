use chrono::Utc;
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use super::gerado;
use super::models::*;

pub async fn log_activity(
    pool: &PgPool,
    actor: Option<&str>,
    action: &str,
    meta: Value,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO mapa_activity (id, actor, action, meta) VALUES ($1, $2, $3, $4)",
    )
    .bind(&id)
    .bind(actor)
    .bind(action)
    .bind(meta)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn groups_count(pool: &PgPool) -> Result<i64, String> {
    let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*)::bigint FROM mapa_groups")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(n)
}

fn priority_detail_linha() -> Value {
    json!({
        "tabs": [
            {"id": "ativos", "label": "Produtos ativos", "desc": "Linha oficial de produtos e status de ativação."},
            {"id": "overrides", "label": "Audit de Overrides", "desc": "Overrides de produção/estoque aplicados sobre o ERP."},
            {"id": "bases", "label": "Bases / formulação", "desc": "Ligações com bases e composição."}
        ],
        "functions": [
            {"name": "list_products", "desc": "Lista catálogo / ativos via API products."},
            {"name": "save_override", "desc": "Persiste override de produto."},
            {"name": "graduation_check", "desc": "Candidatos a graduação de linha."}
        ],
        "notes": "Eixo do app: define o que existe como produto acabado e propaga para produção, estoque, vendas e qualidade. Prioridade visual #1 no organograma.",
        "codeRefs": [
            "Frontend/src/modules/administrativo/linha_produtos/ActiveProductsView.tsx",
            "Backend/src/lib.rs (/api/products, /api/overrides)"
        ]
    })
}

fn priority_detail_doc() -> Value {
    json!({
        "tabs": [
            {"id": "documentos", "label": "Documentos", "desc": "Lista + drawer de cadastro/PDF."},
            {"id": "pendencias", "label": "Pendências", "desc": "Vencidos / a vencer / pagamento."},
            {"id": "familias", "label": "Famílias", "desc": "CRUD famílias/tipos e warn_days."}
        ],
        "functions": [
            {"name": "check_alerts", "desc": "Gera hub_notifications por validade/pagamento."},
            {"name": "upload_file", "desc": "PDF em Saves/documentacao/{id}/."}
        ],
        "notes": "Qualidade documental BPF: metadados no Postgres, arquivos no disco do master.",
        "codeRefs": [
            "Frontend/src/modules/qualidade/documentacao/",
            "Backend/src/modules/qualidade/documentacao/"
        ]
    })
}

fn priority_detail_almox() -> Value {
    json!({
        "tabs": [
            {"id": "itens", "label": "Itens", "desc": "Catálogo ERP/local e saldos."},
            {"id": "movimentos", "label": "Movimentações", "desc": "Entradas/saídas/trocas."},
            {"id": "equipamentos", "label": "Equipamentos", "desc": "Cadastro e manutenções."}
        ],
        "functions": [
            {"name": "create_movement", "desc": "Lança movimento de almox."},
            {"name": "seed_from_erp", "desc": "Importa item do ERP."}
        ],
        "notes": "Operação local de almoxarifado com vínculo ERP.",
        "codeRefs": ["Frontend/src/modules/estoque/", "Backend/src/modules/estoque/almoxarifado/"]
    })
}

fn priority_detail_settings() -> Value {
    json!({
        "tabs": [
            {"id": "conexao", "label": "Conexão", "desc": "Master/client e origem da API."},
            {"id": "postgres", "label": "Postgres / backup", "desc": "Uso e backup local."},
            {"id": "operadores", "label": "Operadores", "desc": "CRUD e permissões."},
            {"id": "auditoria", "label": "Auditoria", "desc": "hub_audit_events."}
        ],
        "functions": [
            {"name": "erp_sync", "desc": "Dispara sync SQL Server → Postgres."},
            {"name": "pg_backup", "desc": "Backup agendado/manual."}
        ],
        "notes": "Painel supervisor do sistema.",
        "codeRefs": ["Frontend/src/modules/geral/configuracoes/"]
    })
}

pub async fn ensure_seeded(pool: &PgPool) -> Result<(), String> {
    if groups_count(pool).await? > 0 {
        return Ok(());
    }

    let groups: Vec<(&str, &str, &str, i32)> = vec![
        ("administrativo", "Administrativo", "administrativo", 0),
        ("producao", "Produção", "producao_hub", 10),
        ("estoque", "Estoque", "estoque_hub", 20),
        ("almoxarifado", "Almoxarifado", "almoxarifado_hub", 30),
        ("compras", "Compras", "compras_hub", 40),
        ("vendas", "Vendas", "vendas_hub", 50),
        ("qualidade", "Qualidade", "qualidade_hub", 60),
        ("expedicao", "Expedição", "expedicao_hub", 70),
        ("financeiro", "Financeiro", "financeiro", 80),
        ("sistema", "Sistema", "hub", 90),
    ];

    for (key, label, hub, sort) in &groups {
        sqlx::query(
            "INSERT INTO mapa_groups (key, label, hub_view, sort_order) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        )
        .bind(key)
        .bind(label)
        .bind(hub)
        .bind(sort)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    // module_key, group, label, status, purpose, detail, fe, be, prefix, gx index, leaf index
    struct SeedMod {
        key: &'static str,
        group: &'static str,
        label: &'static str,
        status: &'static str,
        purpose: &'static str,
        fe: Option<&'static str>,
        be: Option<&'static str>,
        prefix: Option<&'static str>,
        gi: i32,
        li: i32,
        detail: Value,
        hints: Value,
    }

    let seeds = vec![
        SeedMod {
            key: "admin_linha_produtos",
            group: "administrativo",
            label: "Linha de Produtos",
            status: "live",
            purpose: "Eixo do app: produtos ativos, overrides e o que define várias áreas (produção, estoque, vendas).",
            fe: Some("Frontend/src/modules/administrativo/linha_produtos/"),
            be: Some("Backend/src/lib.rs"),
            prefix: Some("/api/products"),
            gi: 0,
            li: 0,
            detail: priority_detail_linha(),
            hints: json!(["Prioridade #1 no organograma", "ActiveProductsView"]),
        },
        SeedMod {
            key: "qualidade_documentacao",
            group: "qualidade",
            label: "Documentação",
            status: "live",
            purpose: "Documentos PDF, validade, pagamento e alertas de qualidade.",
            fe: Some("Frontend/src/modules/qualidade/documentacao/"),
            be: Some("Backend/src/modules/qualidade/documentacao/"),
            prefix: Some("/api/qualidade/documentacao"),
            gi: 6,
            li: 0,
            detail: priority_detail_doc(),
            hints: json!(["AppLayout sem h1", "Saves/documentacao"]),
        },
        SeedMod {
            key: "qualidade_pops",
            group: "qualidade",
            label: "POPs",
            status: "live",
            purpose: "POPs HTML/PDF por setor, validade anual, revisões e logo.",
            fe: Some("Frontend/src/modules/qualidade/pops/"),
            be: Some("Backend/src/modules/qualidade/pops/"),
            prefix: Some("/api/qualidade/pops"),
            gi: 6,
            li: 1,
            detail: json!({"fase": "v1", "doc": "ContextoIA/modulos/qualidade_pops.md"}),
            hints: json!(["AppLayout POPs/Setores/Config", "Saves/pops", "revalidar vs publicar"]),
        },
        SeedMod {
            key: "estoque_almoxarifado",
            group: "almoxarifado",
            label: "Almoxarifado",
            status: "live",
            purpose: "Itens, movimentos, equipamentos e demandas de almox.",
            fe: Some("Frontend/src/modules/estoque/"),
            be: Some("Backend/src/modules/estoque/almoxarifado/"),
            prefix: Some("/api/almox"),
            gi: 3,
            li: 0,
            detail: priority_detail_almox(),
            hints: json!(["EstoqueOpsView", "ContextoIA/modulos/almoxarifado.md"]),
        },
        SeedMod {
            key: "hub_settings",
            group: "sistema",
            label: "Configurações",
            status: "live",
            purpose: "Conexão, Postgres, backup, sync ERP, operadores, auditoria.",
            fe: Some("Frontend/src/modules/geral/configuracoes/"),
            be: Some("Backend/src/modules/geral/"),
            prefix: Some("/api/admin"),
            gi: 9,
            li: 0,
            detail: priority_detail_settings(),
            hints: json!(["Supervisor only"]),
        },
        SeedMod {
            key: "hub_operadores",
            group: "sistema",
            label: "Operadores",
            status: "live",
            purpose: "Gestão de operadores e module_keys.",
            fe: Some("Frontend/src/modules/geral/configuracoes/OperadoresPanel.tsx"),
            be: Some("Backend/src/modules/geral/auth/"),
            prefix: Some("/api/auth"),
            gi: 9,
            li: 1,
            detail: json!({"tabs":[{"id":"ops","label":"Operadores","desc":"CRUD e permissões"}],"functions":[],"notes":"Supervisor."}),
            hints: json!([]),
        },
    ];

    // remaining stubs by group
    let stubs: Vec<(&str, &str, &str)> = vec![
        ("producao", "producao", "Gerenciamento"),
        ("producao", "producao_bases", "Gestão de Bases"),
        ("producao", "producao_proc", "Processos (PROC)"),
        ("producao", "montagem_kits", "Kits"),
        ("producao", "microbiologia", "Microbiologia"),
        ("producao", "fisco_quimica", "Físico-Química"),
        ("estoque", "estoque_materia_prima", "Matéria-Prima"),
        ("estoque", "estoque_embalagens", "Embalagens"),
        ("estoque", "estoque_coloracao", "Coloração"),
        ("estoque", "estoque_apoio", "Material de Apoio"),
        ("estoque", "estoque_produtos", "Produtos Acabados"),
        ("estoque", "estoque_previsao_uso", "Previsão de Uso"),
        ("estoque", "estoque_ordens_manuais", "Ordens Manuais"),
        ("almoxarifado", "estoque_itens", "Itens"),
        ("almoxarifado", "estoque_supermercado", "Supermercado"),
        ("almoxarifado", "estoque_pecas", "Peças"),
        ("almoxarifado", "estoque_equipamentos", "Equipamentos"),
        ("almoxarifado", "estoque_manutencoes", "Manutenções"),
        ("almoxarifado", "estoque_movimentacoes", "Movimentações"),
        ("compras", "compras_materia_prima", "Matéria-Prima"),
        ("compras", "compras_embalagens", "Embalagens"),
        ("compras", "compras_coloracao", "Coloração"),
        ("compras", "compras_apoio", "Apoio"),
        ("compras", "compras_quotations", "Cotações"),
        ("compras", "compras_pedidos", "Pedidos"),
        ("compras", "compras_notas", "Notas"),
        ("compras", "compras_simulation", "Simulador"),
        ("compras", "compras_categorias", "Categorias"),
        ("vendas", "vendas", "Vendas Geral"),
        ("vendas", "vendas_online", "Vendas Online"),
        ("qualidade", "controle_qualidade", "Controle de Qualidade"),
        ("qualidade", "qualidade_pops", "POPs"),
        ("qualidade", "qualidade_treinamentos", "Treinamentos"),
        ("qualidade", "qualidade_temperatura", "Temperatura"),
        ("qualidade", "qualidade_limpeza", "Limpeza"),
        ("qualidade", "qualidade_recebimento_mp", "Recebimento MP"),
        ("expedicao", "expedicao_ecommerce", "E-commerce"),
        ("financeiro", "financeiro", "Financeiro"),
    ];

    let group_index: std::collections::HashMap<&str, i32> = groups
        .iter()
        .enumerate()
        .map(|(i, g)| (g.0, i as i32))
        .collect();

    for s in &seeds {
        let x = 40.0 + (s.gi as f64) * 220.0;
        let y = 140.0 + (s.li as f64) * 80.0;
        insert_module(
            pool,
            s.key,
            s.group,
            s.label,
            s.purpose,
            s.status,
            x,
            y,
            s.fe,
            s.be,
            s.prefix,
            &s.hints,
            &s.detail,
            0,
        )
        .await?;
    }

    let mut leaf_counters: std::collections::HashMap<&str, i32> = std::collections::HashMap::new();
    for (group, key, label) in &stubs {
        if seeds.iter().any(|s| s.key == *key) {
            continue;
        }
        let gi = *group_index.get(group).unwrap_or(&5);
        let li = leaf_counters.entry(group).or_insert(0);
        // offset if priority already took slot 0 in same group
        let y_off = if seeds.iter().any(|s| s.group == *group) {
            *li + 1
        } else {
            *li
        };
        let x = 40.0 + (gi as f64) * 220.0;
        let y = 140.0 + (y_off as f64) * 80.0;
        insert_module(
            pool,
            key,
            group,
            label,
            &format!("Submódulo {label} do grupo {group}."),
            "stub",
            x,
            y,
            None,
            None,
            None,
            &json!([]),
            &json!({"tabs":[],"functions":[],"notes":"Detalhamento pendente — edite no mapa."}),
            *li,
        )
        .await?;
        *li += 1;
    }

    // canonical architectural edges (28)
    let edges = [
        ("admin_linha_produtos", "compras_simulation", "data", "Estrutura técnica de consumo de insumos para explosão MRP"),
        ("admin_linha_produtos", "estoque_produtos", "data", "Catálogo de acabados, códigos ERP e saldo de segurança"),
        ("admin_linha_produtos", "producao", "data", "Eixo central define fórmulas, rendimento e grade a fabricar"),
        ("admin_linha_produtos", "vendas", "feeds", "Produtos ativos disponíveis na tabela comercial"),
        ("compras_notas", "qualidade_recebimento_mp", "events", "Entrada física de carga gera lote para quarentena"),
        ("compras_pedidos", "compras_notas", "flow", "Conciliação fiscal de XMLs contra pedidos aprovados"),
        ("compras_simulation", "compras_pedidos", "flow", "Necessidade líquida convertida em ordens de compra"),
        ("compras_simulation", "producao", "feeds", "Chegada de insumos libera ordens travadas no planejamento"),
        ("desenvolvimento", "hub_settings", "data", "Governança arquitetural, trilha de auditoria e configurações"),
        ("estoque_almoxarifado", "estoque_manutencoes", "flow", "Atendimento de peças e consumíveis para manutenção"),
        ("estoque_almoxarifado", "producao", "data", "Fornecimento de EPIs e materiais de apoio operacional"),
        ("estoque_equipamentos", "estoque_manutencoes", "data", "Prontuário de máquinas orienta ordens preventivas"),
        ("expedicao_ecommerce", "estoque_produtos", "flow", "Baixa de estoque por conferência no empacotamento"),
        ("expedicao_ecommerce", "ferramentas_editor", "data", "Emissão de etiquetas de envio e declaração de conteúdo"),
        ("hub_settings", "audit", "audit", "Trilha estruturada de eventos (hub_audit_events)"),
        ("hub_settings", "hub_operadores", "data", "Controle de acesso granular baseado em module_keys"),
        ("producao", "producao_lotes", "flow", "Ordens de batelada convertidas em lotes rastreáveis"),
        ("producao_lotes", "estoque_produtos", "flow", "Lotes liberados entram no saldo disponível de vendas"),
        ("producao_lotes", "ferramentas_editor", "data", "Impressão de etiquetas térmicas de lote e caixas"),
        ("producao_lotes", "fisco_quimica", "events", "Amostragem de tanque para ensaios de pH, viscosidade e densidade"),
        ("producao_lotes", "microbiologia", "events", "Amostragem para incubação de mesófilos e fungos"),
        ("producao_lotes", "montagem_kits", "flow", "Lotes aprovados liberados para composição de kits"),
        ("qualidade_avarias", "estoque_produtos", "events", "Baixa de estoque por quebra ou dano no processo"),
        ("qualidade_devolucoes", "vendas", "events", "Triagem de logística reversa e retorno ao armazém"),
        ("qualidade_pops", "producao", "data", "Procedimentos Operacionais Padrão e instruções técnicas BPF"),
        ("qualidade_pops", "qualidade_documentacao", "data", "Histórico regulatório de revisões e auditoria ANVISA"),
        ("qualidade_recebimento_mp", "estoque_materia_prima", "flow", "Insumos aprovados em laudo liberados para saldo ativo"),
        ("vendas", "expedicao_ecommerce", "flow", "Pedidos faturados liberados para separação e despacho"),
    ];
    for (from, to, kind, note) in edges {
        let id = Uuid::new_v4().to_string();
        let _ = sqlx::query(
            "INSERT INTO mapa_edges (id, from_key, to_key, kind, note) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        )
        .bind(&id)
        .bind(from)
        .bind(to)
        .bind(kind)
        .bind(note)
        .execute(pool)
        .await;
    }

    log_activity(pool, Some("system"), "seed", json!({ "ok": true })).await?;
    Ok(())
}

async fn insert_module(
    pool: &PgPool,
    key: &str,
    group: &str,
    label: &str,
    purpose: &str,
    status: &str,
    x: f64,
    y: f64,
    fe: Option<&str>,
    be: Option<&str>,
    prefix: Option<&str>,
    hints: &Value,
    detail: &Value,
    sort: i32,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO mapa_modules (
            module_key, group_key, label, purpose, status, sort_order, pos_x, pos_y,
            frontend_path, backend_path, router_prefix, ai_hints, detail
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (module_key) DO NOTHING",
    )
    .bind(key)
    .bind(group)
    .bind(label)
    .bind(purpose)
    .bind(status)
    .bind(sort)
    .bind(x)
    .bind(y)
    .bind(fe)
    .bind(be)
    .bind(prefix)
    .bind(hints)
    .bind(detail)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn snapshot(pool: &PgPool) -> Result<MapaSnapshot, String> {
    ensure_seeded(pool).await?;

    let groups = sqlx::query_as::<_, (String, String, String, i32, Option<String>)>(
        "SELECT key, label, hub_view, sort_order, color FROM mapa_groups ORDER BY sort_order, label",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?
    .into_iter()
    .map(|(key, label, hub_view, sort_order, color)| MapaGroup {
        key,
        label,
        hub_view,
        sort_order,
        color,
    })
    .collect();

    let module_rows = sqlx::query_as::<_, (String, String, String, String, String, i32, f64, f64, Option<String>, Option<String>, Option<String>, Value, Value)>(
        "SELECT module_key, group_key, label, purpose, status, sort_order, pos_x, pos_y,
                frontend_path, backend_path, router_prefix, ai_hints, detail
         FROM mapa_modules ORDER BY group_key, sort_order, label",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut modules: Vec<MapaModule> = module_rows
        .into_iter()
        .map(
            |(
                module_key,
                group_key,
                label,
                purpose,
                status,
                sort_order,
                pos_x,
                pos_y,
                frontend_path,
                backend_path,
                router_prefix,
                ai_hints,
                detail,
            )| MapaModule {
                module_key,
                group_key,
                label,
                purpose,
                status,
                sort_order,
                pos_x,
                pos_y,
                frontend_path,
                backend_path,
                router_prefix,
                ai_hints,
                detail,
                gerado: None,
            },
        )
        .collect();

    let mut edges: Vec<MapaEdge> = sqlx::query_as::<_, (String, String, String, String, String)>(
        "SELECT id, from_key, to_key, kind, note FROM mapa_edges ORDER BY from_key",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?
    .into_iter()
    .map(|(id, from_key, to_key, kind, note)| MapaEdge {
        id,
        from_key,
        to_key,
        kind,
        note,
        auto: false,
    })
    .collect();

    // Ficha gerada do código deste build: telas, rotas, tabelas e chamadas por módulo; as chamadas entre
    // módulos viram arestas automáticas (somam-se às escritas à mão).
    let refs: Vec<gerado::ModuloRef> = modules
        .iter()
        .map(|m| gerado::ModuloRef {
            key: &m.module_key,
            frontend_path: m.frontend_path.as_deref(),
            backend_path: m.backend_path.as_deref(),
            router_prefix: m.router_prefix.as_deref(),
        })
        .collect();
    let montado = gerado::montar(gerado::codigo(), &refs);
    drop(refs);
    for m in modules.iter_mut() {
        m.gerado = montado.por_modulo.get(&m.module_key).cloned();
    }
    edges.extend(montado.arestas);

    let activity = list_activity(pool, 80).await?;

    Ok(MapaSnapshot {
        groups,
        modules,
        edges,
        activity,
        acoes: crate::core::catalogo::todas(),
    })
}

pub async fn update_layout(
    pool: &PgPool,
    actor: Option<&str>,
    items: &[LayoutItem],
) -> Result<(), String> {
    for it in items {
        sqlx::query(
            "UPDATE mapa_modules SET pos_x = $2, pos_y = $3, updated_at = NOW() WHERE module_key = $1",
        )
        .bind(&it.module_key)
        .bind(it.pos_x)
        .bind(it.pos_y)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    log_activity(
        pool,
        actor,
        "module_moved",
        json!({ "count": items.len(), "keys": items.iter().map(|i| &i.module_key).collect::<Vec<_>>() }),
    )
    .await?;
    Ok(())
}

pub async fn get_module(pool: &PgPool, key: &str) -> Result<MapaModule, String> {
    let row = sqlx::query_as::<_, (String, String, String, String, String, i32, f64, f64, Option<String>, Option<String>, Option<String>, Value, Value)>(
        "SELECT module_key, group_key, label, purpose, status, sort_order, pos_x, pos_y,
                frontend_path, backend_path, router_prefix, ai_hints, detail
         FROM mapa_modules WHERE module_key = $1",
    )
    .bind(key)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Módulo não encontrado".to_string())?;

    Ok(MapaModule {
        module_key: row.0,
        group_key: row.1,
        label: row.2,
        purpose: row.3,
        status: row.4,
        sort_order: row.5,
        pos_x: row.6,
        pos_y: row.7,
        frontend_path: row.8,
        backend_path: row.9,
        router_prefix: row.10,
        ai_hints: row.11,
        detail: row.12,
        gerado: None,
    })
}

pub async fn create_module(
    pool: &PgPool,
    actor: Option<&str>,
    input: ModuleCreate,
) -> Result<MapaModule, String> {
    let key = input.module_key.trim().to_string();
    if key.is_empty() || !key.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_') {
        return Err("module_key inválido".into());
    }
    let x = input.pos_x.unwrap_or(80.0);
    let y = input.pos_y.unwrap_or(200.0);
    let purpose = input.purpose.unwrap_or_else(|| "Novo módulo (planned).".into());
    insert_module(
        pool,
        &key,
        input.group_key.trim(),
        input.label.trim(),
        &purpose,
        "planned",
        x,
        y,
        None,
        None,
        None,
        &json!([]),
        &json!({"tabs":[],"functions":[],"notes":"Criado pelo mapa. Complete o detalhe."}),
        0,
    )
    .await?;

    // Fila única: o módulo novo vira um chamado na triagem do Desenvolvimento (tabela feedbacks).
    let chamado = crate::modules::geral::feedbacks::models::FeedbackSubmitInput {
        id: Uuid::new_v4().to_string(),
        feedback_type: "feedback".into(),
        description: format!(
            "Implementar módulo {key} ({}): registrar no front e no back, tela e rotas. Finalidade: {purpose}",
            input.label.trim()
        ),
        page: "Desenvolvimento".into(),
        module_key: Some(key.clone()),
        logs: String::new(),
        screenshot: String::new(),
    };
    crate::modules::geral::feedbacks::commands::save_feedback_from_user_query(
        pool.clone(),
        &chamado,
        actor.unwrap_or("mapa"),
    )
    .await?;

    log_activity(
        pool,
        actor,
        "module_created",
        json!({ "moduleKey": key, "feedbackId": chamado.id }),
    )
    .await?;
    get_module(pool, &key).await
}

pub async fn create_edge(
    pool: &PgPool,
    actor: Option<&str>,
    input: EdgeCreate,
) -> Result<MapaEdge, String> {
    let id = Uuid::new_v4().to_string();
    let kind = input.kind.unwrap_or_else(|| "related".into());
    let note = input.note.unwrap_or_default();
    sqlx::query(
        "INSERT INTO mapa_edges (id, from_key, to_key, kind, note) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (from_key, to_key, kind) DO UPDATE SET note = EXCLUDED.note",
    )
    .bind(&id)
    .bind(input.from_key.trim())
    .bind(input.to_key.trim())
    .bind(&kind)
    .bind(&note)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    log_activity(
        pool,
        actor,
        "edge_created",
        json!({ "from": input.from_key, "to": input.to_key, "kind": kind }),
    )
    .await?;
    Ok(MapaEdge {
        id,
        from_key: input.from_key,
        to_key: input.to_key,
        kind,
        note,
        auto: false,
    })
}

pub async fn list_activity(pool: &PgPool, limit: i64) -> Result<Vec<MapaActivity>, String> {
    let limit = limit.clamp(1, 500);
    let rows = sqlx::query_as::<_, (String, chrono::DateTime<Utc>, Option<String>, String, Value)>(
        "SELECT id, at, actor, action, meta FROM mapa_activity ORDER BY at DESC LIMIT $1",
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|(id, at, actor, action, meta)| MapaActivity {
            id,
            at: at.to_rfc3339(),
            actor,
            action,
            meta,
        })
        .collect())
}

#[cfg(test)]
mod tests {
    /// Fontes que criam módulos do mapa: o seed de `ensure_seeded` e os INSERTs das migrações.
    const FONTES_DO_MAPA: &[&str] = &[
        include_str!("store.rs"),
        include_str!("../../../../supabase/032_update_mapa_canonical.sql"),
        include_str!("../../../../supabase/046_planejamento_semanal_integridade.sql"),
        include_str!("../../../../supabase/048_quadros_confiaveis_ficha.sql"),
        include_str!("../../../../supabase/053_ferramentas_balanca.sql"),
    ];

    #[test]
    fn modulos_do_catalogo_existem_no_mapa() {
        for a in crate::core::catalogo::todas() {
            let aspas_simples = format!("'{}'", a.modulo);
            let aspas_duplas = format!("\"{}\"", a.modulo);
            assert!(
                FONTES_DO_MAPA.iter().any(|f| f.contains(&aspas_simples) || f.contains(&aspas_duplas)),
                "{}: módulo {} não é criado no mapa (seed nem migração)",
                a.nome,
                a.modulo
            );
        }
    }
}

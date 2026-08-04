use chrono::Utc;
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

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

/// Garante schema 018 em bancos anteriores ao bootstrap embutido.
pub async fn ensure_schema(pool: &PgPool) -> Result<(), String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS mapa_groups (
            key TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            hub_view TEXT NOT NULL DEFAULT '',
            sort_order INT NOT NULL DEFAULT 100,
            color TEXT
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS mapa_modules (
            module_key TEXT PRIMARY KEY,
            group_key TEXT NOT NULL REFERENCES mapa_groups(key) ON DELETE CASCADE,
            label TEXT NOT NULL,
            purpose TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'stub',
            sort_order INT NOT NULL DEFAULT 100,
            pos_x DOUBLE PRECISION NOT NULL DEFAULT 0,
            pos_y DOUBLE PRECISION NOT NULL DEFAULT 0,
            frontend_path TEXT,
            backend_path TEXT,
            router_prefix TEXT,
            ai_hints JSONB NOT NULL DEFAULT '[]'::jsonb,
            detail JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_mapa_modules_group ON mapa_modules(group_key)")
        .execute(pool)
        .await;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS mapa_edges (
            id TEXT PRIMARY KEY,
            from_key TEXT NOT NULL,
            to_key TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'related',
            note TEXT NOT NULL DEFAULT '',
            UNIQUE (from_key, to_key, kind)
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS mapa_routes (
            id TEXT PRIMARY KEY,
            module_key TEXT REFERENCES mapa_modules(module_key) ON DELETE SET NULL,
            methods TEXT[] NOT NULL DEFAULT '{}',
            path TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            auth TEXT NOT NULL DEFAULT 'module',
            source TEXT
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_mapa_routes_module ON mapa_routes(module_key)")
        .execute(pool)
        .await;
    let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_mapa_routes_path ON mapa_routes(path)")
        .execute(pool)
        .await;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS mapa_tasks (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            targets JSONB NOT NULL DEFAULT '[]'::jsonb,
            acceptance JSONB NOT NULL DEFAULT '[]'::jsonb,
            notes TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'done')),
            created_by TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            done_at TIMESTAMPTZ
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_mapa_tasks_status ON mapa_tasks(status, created_at DESC)")
        .execute(pool)
        .await;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS mapa_activity (
            id TEXT PRIMARY KEY,
            at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            actor TEXT,
            action TEXT NOT NULL,
            meta JSONB NOT NULL DEFAULT '{}'::jsonb
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_mapa_activity_at ON mapa_activity(at DESC)")
        .execute(pool)
        .await;

    Ok(())
}

pub async fn ensure_seeded(pool: &PgPool) -> Result<(), String> {
    ensure_schema(pool).await?;
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
        ("producao", "producao_lotes", "Lotes"),
        ("producao", "montagem_kits", "Kits"),
        ("producao", "microbiologia", "Microbiologia"),
        ("producao", "fisco_quimica", "Físico-Química"),
        ("estoque", "estoque_materia_prima", "Matéria-Prima"),
        ("estoque", "estoque_embalagens", "Embalagens"),
        ("estoque", "estoque_coloracao", "Coloração"),
        ("estoque", "estoque_apoio", "Material de Apoio"),
        ("estoque", "estoque_produtos", "Produtos Acabados"),
        ("estoque", "estoque_previsao_uso", "Previsão de Uso"),
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
        ("compras", "compras_online", "Online"),
        ("compras", "compras_pedidos", "Pedidos"),
        ("compras", "compras_notas", "Notas"),
        ("compras", "compras_almoxarifado", "Almox"),
        ("compras", "compras_simulation", "Simulador"),
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

    // edges for priority modules
    let edges = [
        ("admin_linha_produtos", "producao", "feeds", "Produtos da linha alimentam produção"),
        ("admin_linha_produtos", "estoque_produtos", "feeds", "Catálogo → estoque produtos"),
        ("admin_linha_produtos", "vendas", "feeds", "Linha disponível para vendas"),
        ("qualidade_documentacao", "notifications", "notify", "check-alerts"),
        ("qualidade_documentacao", "auth", "guard", "module_key"),
        ("estoque_almoxarifado", "erp", "sync", "seed/link ERP"),
        ("hub_settings", "erp", "sync", "agenda sync"),
        ("hub_settings", "audit", "audit", "hub_audit_events"),
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

    let modules = module_rows
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
            },
        )
        .collect();

    let edges = sqlx::query_as::<_, (String, String, String, String, String)>(
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
    })
    .collect();

    let routes = sqlx::query_as::<_, (String, Option<String>, Vec<String>, String, String, String, Option<String>)>(
        "SELECT id, module_key, methods, path, summary, auth, source FROM mapa_routes ORDER BY path",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?
    .into_iter()
    .map(|(id, module_key, methods, path, summary, auth, source)| MapaRoute {
        id,
        module_key,
        methods,
        path,
        summary,
        auth,
        source,
    })
    .collect();

    let tasks_open = list_tasks(pool, Some("open"), 100).await?;
    let activity = list_activity(pool, 80).await?;

    Ok(MapaSnapshot {
        groups,
        modules,
        edges,
        routes,
        tasks_open,
        activity,
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

pub async fn update_module(
    pool: &PgPool,
    actor: Option<&str>,
    key: &str,
    u: ModuleUpdate,
) -> Result<MapaModule, String> {
    let cur = get_module(pool, key).await?;
    let purpose = u.purpose.unwrap_or(cur.purpose);
    let status = u.status.unwrap_or(cur.status);
    let group_key = u.group_key.unwrap_or(cur.group_key);
    let label = u.label.unwrap_or(cur.label);
    let ai_hints = u.ai_hints.unwrap_or(cur.ai_hints);
    let detail = u.detail.unwrap_or(cur.detail);
    let frontend_path = u.frontend_path.or(cur.frontend_path);
    let backend_path = u.backend_path.or(cur.backend_path);
    let router_prefix = u.router_prefix.or(cur.router_prefix);
    let sort_order = u.sort_order.unwrap_or(cur.sort_order);

    sqlx::query(
        "UPDATE mapa_modules SET group_key=$2, label=$3, purpose=$4, status=$5, sort_order=$6,
         frontend_path=$7, backend_path=$8, router_prefix=$9, ai_hints=$10, detail=$11, updated_at=NOW()
         WHERE module_key=$1",
    )
    .bind(key)
    .bind(&group_key)
    .bind(&label)
    .bind(&purpose)
    .bind(&status)
    .bind(sort_order)
    .bind(&frontend_path)
    .bind(&backend_path)
    .bind(&router_prefix)
    .bind(&ai_hints)
    .bind(&detail)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    log_activity(
        pool,
        actor,
        "module_updated",
        json!({ "moduleKey": key }),
    )
    .await?;
    get_module(pool, key).await
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

    // auto task module_spec
    let task_id = format!("task_{}", Uuid::new_v4());
    let payload = json!({
        "schemaVersion": 1,
        "kind": "natumhub-module-spec",
        "module": {
            "key": key,
            "label": input.label,
            "group": input.group_key,
            "purpose": purpose,
            "status": "planned"
        }
    });
    sqlx::query(
        "INSERT INTO mapa_tasks (id, type, title, payload, targets, acceptance, notes, created_by)
         VALUES ($1,'module_spec',$2,$3,$4,$5,$6,$7)",
    )
    .bind(&task_id)
    .bind(format!("Implementar módulo {key}"))
    .bind(&payload)
    .bind(json!([
        "Frontend/src/modules/geral/lib/modules/registry.ts",
        "Backend/src/modules/geral/auth/modules_registry.rs",
        "Frontend/src/App.tsx"
    ]))
    .bind(json!(["Registrar FE/BE", "View + rotas", "npm run map:arch"]))
    .bind("auto ao adicionar no mapa")
    .bind(actor)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    log_activity(
        pool,
        actor,
        "module_created",
        json!({ "moduleKey": key, "taskId": task_id }),
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
    })
}

pub async fn list_tasks(
    pool: &PgPool,
    status: Option<&str>,
    limit: i64,
) -> Result<Vec<MapaTask>, String> {
    let limit = limit.clamp(1, 500);
    let rows = if let Some(st) = status.filter(|s| !s.is_empty()) {
        sqlx::query_as::<_, (String, String, String, Value, Value, Value, String, String, Option<String>, chrono::DateTime<Utc>, Option<chrono::DateTime<Utc>>)>(
            "SELECT id, type, title, payload, targets, acceptance, notes, status, created_by, created_at, done_at
             FROM mapa_tasks WHERE status = $1 ORDER BY created_at DESC LIMIT $2",
        )
        .bind(st)
        .bind(limit)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as::<_, (String, String, String, Value, Value, Value, String, String, Option<String>, chrono::DateTime<Utc>, Option<chrono::DateTime<Utc>>)>(
            "SELECT id, type, title, payload, targets, acceptance, notes, status, created_by, created_at, done_at
             FROM mapa_tasks ORDER BY created_at DESC LIMIT $1",
        )
        .bind(limit)
        .fetch_all(pool)
        .await
    }
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(
            |(
                id,
                type_,
                title,
                payload,
                targets,
                acceptance,
                notes,
                status,
                created_by,
                created_at,
                done_at,
            )| MapaTask {
                id,
                type_,
                title,
                payload,
                targets,
                acceptance,
                notes,
                status,
                created_by,
                created_at: created_at.to_rfc3339(),
                done_at: done_at.map(|d| d.to_rfc3339()),
            },
        )
        .collect())
}

pub async fn get_task(pool: &PgPool, id: &str) -> Result<MapaTask, String> {
    list_tasks(pool, None, 500)
        .await?
        .into_iter()
        .find(|t| t.id == id)
        .ok_or_else(|| "Task não encontrada".into())
}

pub async fn create_task(
    pool: &PgPool,
    actor: Option<&str>,
    input: TaskCreate,
) -> Result<MapaTask, String> {
    let id = format!("task_{}", Uuid::new_v4());
    sqlx::query(
        "INSERT INTO mapa_tasks (id, type, title, payload, targets, acceptance, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    )
    .bind(&id)
    .bind(&input.type_)
    .bind(input.title.trim())
    .bind(input.payload.unwrap_or(json!({})))
    .bind(input.targets.unwrap_or(json!([])))
    .bind(input.acceptance.unwrap_or(json!([])))
    .bind(input.notes.unwrap_or_default())
    .bind(actor)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    log_activity(
        pool,
        actor,
        "task_created",
        json!({ "taskId": id, "type": input.type_ }),
    )
    .await?;
    get_task(pool, &id).await
}

pub async fn patch_task(
    pool: &PgPool,
    actor: Option<&str>,
    id: &str,
    patch: TaskPatch,
) -> Result<MapaTask, String> {
    let status = patch.status.as_deref();
    if let Some("done") = status {
        sqlx::query(
            "UPDATE mapa_tasks SET status = 'done', done_at = NOW(), notes = COALESCE($2, notes) WHERE id = $1",
        )
        .bind(id)
        .bind(patch.notes.as_deref())
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        log_activity(
            pool,
            actor,
            "ai_implemented",
            json!({ "taskId": id }),
        )
        .await?;
    } else if let Some(st) = status {
        sqlx::query("UPDATE mapa_tasks SET status = $2, notes = COALESCE($3, notes) WHERE id = $1")
            .bind(id)
            .bind(st)
            .bind(patch.notes.as_deref())
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    get_task(pool, id).await
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

pub async fn export_task_md(pool: &PgPool) -> Result<String, String> {
    let open = list_tasks(pool, Some("open"), 200).await?;
    let done = list_tasks(pool, Some("done"), 100).await?;
    let mut out = String::from(
        "# NatumHub — Task queue\n\n> Exportado de Postgres (`mapa_tasks`). Skill: `natumhub-tasks`.\n\n## Open\n\n",
    );
    if open.is_empty() {
        out.push_str("_(nenhuma task aberta)_\n\n");
    } else {
        for t in &open {
            out.push_str(&format_task_md(t));
        }
    }
    out.push_str("## Done\n\n");
    if done.is_empty() {
        out.push_str("_(vazio)_\n");
    } else {
        for t in &done {
            out.push_str(&format_task_md(t));
        }
    }
    Ok(out)
}

fn format_task_md(t: &MapaTask) -> String {
    format!(
        "### {} — {}\n- **Status:** {}\n- **Title:** {}\n- **Type:** {}\n- **Payload:** `{}`\n- **Targets:** {}\n- **Notes:** {}\n{}\n",
        t.id,
        t.type_,
        t.status,
        t.title,
        t.type_,
        t.payload,
        t.targets,
        t.notes,
        t.done_at
            .as_ref()
            .map(|d| format!("- **Done at:** {d}\n"))
            .unwrap_or_default()
    )
}

/// Lê `routeCatalog` (ou `routes`) de `ContextoIA/arquitetura/mapa-app.json`.
pub fn load_routes_from_mapa_json() -> Result<Vec<Value>, String> {
    let root = crate::core::app_config::resolve_repo_root()
        .ok_or_else(|| "Repo root não encontrado".to_string())?;
    let path = root.join("ContextoIA/arquitetura/mapa-app.json");
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    let v: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let arr = v
        .get("routeCatalog")
        .or_else(|| v.get("routes"))
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(arr)
}

/// Importa rotas a partir de lista JSON (path, methods, moduleKey, summary, auth, source).
pub async fn resync_routes(pool: &PgPool, actor: Option<&str>, routes: &[Value]) -> Result<i32, String> {
    ensure_seeded(pool).await?;
    let known: std::collections::HashSet<String> = sqlx::query_as::<_, (String,)>(
        "SELECT module_key FROM mapa_modules",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?
    .into_iter()
    .map(|(k,)| k)
    .collect();

    sqlx::query("DELETE FROM mapa_routes")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    let mut n = 0i32;
    for r in routes {
        let path = r.get("path").and_then(|v| v.as_str()).unwrap_or("");
        if path.is_empty() {
            continue;
        }
        let id = Uuid::new_v4().to_string();
        let methods: Vec<String> = r
            .get("methods")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        let mut module_key = r
            .get("moduleKey")
            .or_else(|| r.get("module_key"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        if let Some(ref k) = module_key {
            if !known.contains(k) {
                module_key = None;
            }
        }
        let summary = r
            .get("summary")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let auth = r
            .get("auth")
            .and_then(|v| v.as_str())
            .unwrap_or("module")
            .to_string();
        let source = r.get("source").and_then(|v| v.as_str()).map(|s| s.to_string());
        sqlx::query(
            "INSERT INTO mapa_routes (id, module_key, methods, path, summary, auth, source)
             VALUES ($1,$2,$3,$4,$5,$6,$7)",
        )
        .bind(&id)
        .bind(&module_key)
        .bind(&methods)
        .bind(path)
        .bind(&summary)
        .bind(&auth)
        .bind(&source)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        n += 1;
    }
    log_activity(pool, actor, "resync_scan", json!({ "routes": n })).await?;
    Ok(n)
}

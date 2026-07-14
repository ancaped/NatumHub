use serde::{Deserialize, Serialize};

/// Chaves de submódulos (views folha) — espelham HubView do frontend.
/// Legado — use [`MODULE_ESTOQUE_MP`] + [`MODULE_ESTOQUE_EMB`].
pub const MODULE_ESTOQUE_INSUMOS: &str = "estoque_insumos";
/// Legado — use [`MODULE_ESTOQUE_COLOR`] + [`MODULE_ESTOQUE_APOIO`].
pub const MODULE_ESTOQUE_PRODUTOS: &str = "estoque_produtos";
pub const MODULE_ESTOQUE_MP: &str = "estoque_materia_prima";
pub const MODULE_ESTOQUE_EMB: &str = "estoque_embalagens";
pub const MODULE_ESTOQUE_COLOR: &str = "estoque_coloracao";
pub const MODULE_ESTOQUE_APOIO: &str = "estoque_apoio";
pub const MODULE_ESTOQUE_ITENS: &str = "estoque_itens";
pub const MODULE_ESTOQUE_ALMOX: &str = "estoque_almoxarifado";
pub const MODULE_ESTOQUE_SUPERMERCADO: &str = "estoque_supermercado";
pub const MODULE_ESTOQUE_PECAS: &str = "estoque_pecas";
pub const MODULE_ESTOQUE_EQUIPAMENTOS: &str = "estoque_equipamentos";
pub const MODULE_ESTOQUE_MANUTENCOES: &str = "estoque_manutencoes";
/// Legado — use [`MODULE_ADMIN_LINHA_PRODUTOS`].
pub const MODULE_ESTOQUE_ATIVOS: &str = "estoque_ativos";
pub const MODULE_ADMIN_LINHA_PRODUTOS: &str = "admin_linha_produtos";

pub const MODULE_PRODUCAO: &str = "producao";
pub const MODULE_PRODUCAO_BASES: &str = "producao_bases";
pub const MODULE_PRODUCAO_LOTES: &str = "producao_lotes";
pub const MODULE_MONTAGEM_KITS: &str = "montagem_kits";
pub const MODULE_MICROBIOLOGIA: &str = "microbiologia";
pub const MODULE_FISCO_QUIMICA: &str = "fisco_quimica";

/// Legado — Planejamento Geral removido; use MP/EMB/COLOR/APOIO.
pub const MODULE_COMPRAS: &str = "compras";
pub const MODULE_COMPRAS_MP: &str = "compras_materia_prima";
pub const MODULE_COMPRAS_EMB: &str = "compras_embalagens";
pub const MODULE_COMPRAS_COLOR: &str = "compras_coloracao";
pub const MODULE_COMPRAS_APOIO: &str = "compras_apoio";
pub const MODULE_COMPRAS_COT: &str = "compras_quotations";
pub const MODULE_COMPRAS_ONLINE: &str = "compras_online";
pub const MODULE_COMPRAS_PEDIDOS: &str = "compras_pedidos";
pub const MODULE_COMPRAS_NOTAS: &str = "compras_notas";
pub const MODULE_COMPRAS_ALMOX: &str = "compras_almoxarifado";
pub const MODULE_COMPRAS_SIMULATION: &str = "compras_simulation";

pub const MODULE_VENDAS: &str = "vendas";
pub const MODULE_VENDAS_ONLINE: &str = "vendas_online";
pub const MODULE_CONTROLE_QUALIDADE: &str = "controle_qualidade";
/// Placeholder legado — hub Administrativo usa filhos (`admin_linha_produtos`, …).
pub const MODULE_ADMINISTRATIVO: &str = "administrativo";
pub const MODULE_EXPEDICAO: &str = "expedicao";
pub const MODULE_FINANCEIRO: &str = "financeiro";
pub const MODULE_CONFIGURACOES: &str = "hub_settings";
pub const MODULE_OPERADORES: &str = "hub_operadores";

pub const ALL_MODULE_KEYS: &[&str] = &[
    MODULE_ESTOQUE_INSUMOS,
    MODULE_ESTOQUE_PRODUTOS,
    MODULE_ESTOQUE_MP,
    MODULE_ESTOQUE_EMB,
    MODULE_ESTOQUE_COLOR,
    MODULE_ESTOQUE_APOIO,
    MODULE_ESTOQUE_ITENS,
    MODULE_ESTOQUE_ALMOX,
    MODULE_ESTOQUE_SUPERMERCADO,
    MODULE_ESTOQUE_PECAS,
    MODULE_ESTOQUE_EQUIPAMENTOS,
    MODULE_ESTOQUE_MANUTENCOES,
    MODULE_ADMIN_LINHA_PRODUTOS,
    MODULE_PRODUCAO,
    MODULE_PRODUCAO_BASES,
    MODULE_PRODUCAO_LOTES,
    MODULE_MONTAGEM_KITS,
    MODULE_MICROBIOLOGIA,
    MODULE_FISCO_QUIMICA,
    MODULE_COMPRAS_MP,
    MODULE_COMPRAS_EMB,
    MODULE_COMPRAS_COLOR,
    MODULE_COMPRAS_APOIO,
    MODULE_COMPRAS_COT,
    MODULE_COMPRAS_ONLINE,
    MODULE_COMPRAS_PEDIDOS,
    MODULE_COMPRAS_NOTAS,
    MODULE_COMPRAS_ALMOX,
    MODULE_COMPRAS_SIMULATION,
    MODULE_VENDAS,
    MODULE_VENDAS_ONLINE,
    MODULE_CONTROLE_QUALIDADE,
    MODULE_ADMINISTRATIVO,
    MODULE_EXPEDICAO,
    MODULE_FINANCEIRO,
    MODULE_CONFIGURACOES,
    MODULE_OPERADORES,
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleLeaf {
    pub key: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleGroup {
    pub key: String,
    pub label: String,
    pub hub_view: String,
    pub children: Vec<ModuleLeaf>,
}

pub fn module_registry() -> Vec<ModuleGroup> {
    vec![
        ModuleGroup {
            key: "estoque".into(),
            label: "Estoque".into(),
            hub_view: "estoque_hub".into(),
            children: vec![
                leaf(MODULE_ESTOQUE_MP, "Matéria-Prima"),
                leaf(MODULE_ESTOQUE_EMB, "Embalagens"),
                leaf(MODULE_ESTOQUE_COLOR, "Coloração"),
                leaf(MODULE_ESTOQUE_APOIO, "Material de Apoio"),
            ],
        },
        ModuleGroup {
            key: "almoxarifado".into(),
            label: "Almoxarifado".into(),
            hub_view: "almoxarifado_hub".into(),
            children: vec![
                leaf(MODULE_ESTOQUE_ITENS, "Itens"),
                leaf(MODULE_ESTOQUE_ALMOX, "Almoxarifado"),
                leaf(MODULE_ESTOQUE_SUPERMERCADO, "Supermercado"),
                leaf(MODULE_ESTOQUE_PECAS, "Peças de Reposição"),
                leaf(MODULE_ESTOQUE_EQUIPAMENTOS, "Equipamentos"),
                leaf(MODULE_ESTOQUE_MANUTENCOES, "Manutenções"),
            ],
        },
        ModuleGroup {
            key: "producao".into(),
            label: "Produção".into(),
            hub_view: "producao_hub".into(),
            children: vec![
                leaf(MODULE_PRODUCAO, "Gerenciamento"),
                leaf(MODULE_PRODUCAO_BASES, "Gestão de Bases"),
                leaf(MODULE_PRODUCAO_LOTES, "Lotes de Produção"),
                leaf(MODULE_MONTAGEM_KITS, "Montagem de Kits"),
                leaf(MODULE_MICROBIOLOGIA, "Microbiologia"),
                leaf(MODULE_FISCO_QUIMICA, "Físico-Química"),
            ],
        },
        ModuleGroup {
            key: "compras".into(),
            label: "Compras".into(),
            hub_view: "compras_hub".into(),
            children: vec![
                leaf(MODULE_COMPRAS_MP, "Matéria-Prima"),
                leaf(MODULE_COMPRAS_EMB, "Embalagens"),
                leaf(MODULE_COMPRAS_COLOR, "Coloração"),
                leaf(MODULE_COMPRAS_APOIO, "Material de Apoio"),
                leaf(MODULE_COMPRAS_COT, "Cotações"),
                leaf(MODULE_COMPRAS_ONLINE, "Compras Online"),
                leaf(MODULE_COMPRAS_PEDIDOS, "Pedidos"),
                leaf(MODULE_COMPRAS_NOTAS, "Notas Fiscais"),
                leaf(MODULE_COMPRAS_ALMOX, "Almoxarifado"),
                leaf(MODULE_COMPRAS_SIMULATION, "Simulador"),
            ],
        },
        ModuleGroup {
            key: "vendas".into(),
            label: "Vendas".into(),
            hub_view: "vendas_hub".into(),
            children: vec![
                leaf(MODULE_VENDAS, "Vendas Geral"),
                leaf(MODULE_VENDAS_ONLINE, "Vendas Online"),
            ],
        },
        ModuleGroup {
            key: "qualidade".into(),
            label: "Qualidade".into(),
            hub_view: "controle_qualidade".into(),
            children: vec![leaf(MODULE_CONTROLE_QUALIDADE, "Controle de Qualidade")],
        },
        ModuleGroup {
            key: "administrativo".into(),
            label: "Administrativo".into(),
            hub_view: "administrativo".into(),
            children: vec![leaf(MODULE_ADMIN_LINHA_PRODUTOS, "Linha de Produtos")],
        },
        ModuleGroup {
            key: "expedicao".into(),
            label: "Expedição".into(),
            hub_view: "expedicao".into(),
            children: vec![leaf(MODULE_EXPEDICAO, "Expedição")],
        },
        ModuleGroup {
            key: "financeiro".into(),
            label: "Financeiro".into(),
            hub_view: "financeiro".into(),
            children: vec![leaf(MODULE_FINANCEIRO, "Financeiro")],
        },
        ModuleGroup {
            key: "sistema".into(),
            label: "Sistema".into(),
            hub_view: "hub".into(),
            children: vec![
                leaf(MODULE_CONFIGURACOES, "Configurações"),
                leaf(MODULE_OPERADORES, "Gestão de Operadores"),
            ],
        },
    ]
}

fn leaf(key: &str, label: &str) -> ModuleLeaf {
    ModuleLeaf {
        key: key.to_string(),
        label: label.to_string(),
    }
}

pub fn all_module_keys_vec() -> Vec<String> {
    ALL_MODULE_KEYS.iter().map(|s| s.to_string()).collect()
}

pub fn default_modules_for_role(role: &str) -> Vec<String> {
    match role.to_lowercase().as_str() {
        "supervisor" | "admin" => all_module_keys_vec(),
        "estoque" => vec![
            MODULE_ESTOQUE_MP,
            MODULE_ESTOQUE_EMB,
            MODULE_ESTOQUE_COLOR,
            MODULE_ESTOQUE_APOIO,
            MODULE_ESTOQUE_ITENS,
            MODULE_ESTOQUE_ALMOX,
            MODULE_ESTOQUE_SUPERMERCADO,
            MODULE_ESTOQUE_PECAS,
            MODULE_ESTOQUE_EQUIPAMENTOS,
            MODULE_ESTOQUE_MANUTENCOES,
        ]
        .into_iter()
        .map(String::from)
        .collect(),
        "producao" | "produção" => vec![
            MODULE_PRODUCAO,
            MODULE_PRODUCAO_BASES,
            MODULE_PRODUCAO_LOTES,
            MODULE_MONTAGEM_KITS,
        ]
        .into_iter()
        .map(String::from)
        .collect(),
        "micro" | "microbiologia" => vec![MODULE_MICROBIOLOGIA.to_string()],
        "fisco" | "fisico-quimica" | "físico-química" => vec![MODULE_FISCO_QUIMICA.to_string()],
        "compras" => vec![
            MODULE_COMPRAS_MP,
            MODULE_COMPRAS_EMB,
            MODULE_COMPRAS_COLOR,
            MODULE_COMPRAS_APOIO,
            MODULE_COMPRAS_COT,
            MODULE_COMPRAS_ONLINE,
            MODULE_COMPRAS_PEDIDOS,
            MODULE_COMPRAS_NOTAS,
            MODULE_COMPRAS_ALMOX,
        ]
        .into_iter()
        .map(String::from)
        .collect(),
        "financeiro" => vec![MODULE_FINANCEIRO.to_string()],
        "vendas" => vec![MODULE_VENDAS, MODULE_VENDAS_ONLINE]
            .into_iter()
            .map(String::from)
            .collect(),
        "qualidade" => vec![MODULE_CONTROLE_QUALIDADE.to_string()],
        "administrativo" => vec![MODULE_ADMIN_LINHA_PRODUTOS.to_string()],
        "expedicao" => vec![MODULE_EXPEDICAO.to_string()],
        _ => vec![],
    }
}

/// Resolve view (inclui hubs) para verificação de acesso.
pub fn view_to_module_key(view: &str) -> Option<&str> {
    match view {
        "hub" => None,
        "estoque_hub" => None,
        "almoxarifado_hub" => None,
        "producao_hub" => None,
        "compras_hub" => None,
        "vendas_hub" => None,
        "linha_produtos" | "estoque_ativos" => Some(MODULE_ADMIN_LINHA_PRODUTOS),
        other => {
            if ALL_MODULE_KEYS.contains(&other) {
                Some(other)
            } else {
                None
            }
        }
    }
}

pub fn hub_visible_if_any_child(modules: &[String], hub_view: &str) -> bool {
    for group in module_registry() {
        if group.hub_view == hub_view {
            return group.children.iter().any(|c| modules.contains(&c.key));
        }
    }
    false
}

pub fn can_access_view(modules: &[String], view: &str, is_admin: bool) -> bool {
    if is_admin {
        return true;
    }
    if view == "hub" {
        return true;
    }
    if let Some(key) = view_to_module_key(view) {
        return module_grants_view(modules, key);
    }
    hub_visible_if_any_child(modules, view)
}

pub fn normalize_modules(modules: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for m in modules {
        if m == MODULE_ESTOQUE_ATIVOS {
            out.push(MODULE_ADMIN_LINHA_PRODUTOS.to_string());
        } else if m == MODULE_ESTOQUE_INSUMOS {
            out.push(MODULE_ESTOQUE_MP.to_string());
            out.push(MODULE_ESTOQUE_EMB.to_string());
        } else if m == MODULE_ESTOQUE_PRODUTOS {
            out.push(MODULE_ESTOQUE_COLOR.to_string());
            out.push(MODULE_ESTOQUE_APOIO.to_string());
        } else if ALL_MODULE_KEYS.contains(&m.as_str()) {
            out.push(m.clone());
        }
    }
    out.sort();
    out.dedup();
    out
}

fn module_grants_view(modules: &[String], key: &str) -> bool {
    match key {
        MODULE_ESTOQUE_INSUMOS => modules.iter().any(|m| {
            m == MODULE_ESTOQUE_INSUMOS || m == MODULE_ESTOQUE_MP || m == MODULE_ESTOQUE_EMB
        }),
        MODULE_ESTOQUE_PRODUTOS => modules.iter().any(|m| {
            m == MODULE_ESTOQUE_PRODUTOS || m == MODULE_ESTOQUE_COLOR || m == MODULE_ESTOQUE_APOIO
        }),
        other => modules.iter().any(|m| m == other),
    }
}

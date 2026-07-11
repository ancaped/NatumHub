use serde::{Deserialize, Serialize};

/// Chaves de submódulos (views folha) — espelham HubView do frontend.
pub const MODULE_ESTOQUE_INSUMOS: &str = "estoque_insumos";
pub const MODULE_ESTOQUE_PRODUTOS: &str = "estoque_produtos";
pub const MODULE_ESTOQUE_ATIVOS: &str = "estoque_ativos";

pub const MODULE_PRODUCAO: &str = "producao";
pub const MODULE_MONTAGEM_KITS: &str = "montagem_kits";
pub const MODULE_MICROBIOLOGIA: &str = "microbiologia";
pub const MODULE_FISCO_QUIMICA: &str = "fisco_quimica";

pub const MODULE_COMPRAS: &str = "compras";
pub const MODULE_COMPRAS_MP: &str = "compras_materia_prima";
pub const MODULE_COMPRAS_EMB: &str = "compras_embalagens";
pub const MODULE_COMPRAS_COLOR: &str = "compras_coloracao";
pub const MODULE_COMPRAS_APOIO: &str = "compras_apoio";
pub const MODULE_COMPRAS_COT: &str = "compras_quotations";
pub const MODULE_COMPRAS_ONLINE: &str = "compras_online";
pub const MODULE_COMPRAS_PEDIDOS: &str = "compras_pedidos";
pub const MODULE_COMPRAS_NOTAS: &str = "compras_notas";

pub const MODULE_VENDAS: &str = "vendas";
pub const MODULE_FINANCEIRO: &str = "financeiro";
pub const MODULE_CONFIGURACOES: &str = "hub_settings";
pub const MODULE_OPERADORES: &str = "hub_operadores";

pub const ALL_MODULE_KEYS: &[&str] = &[
    MODULE_ESTOQUE_INSUMOS,
    MODULE_ESTOQUE_PRODUTOS,
    MODULE_ESTOQUE_ATIVOS,
    MODULE_PRODUCAO,
    MODULE_MONTAGEM_KITS,
    MODULE_MICROBIOLOGIA,
    MODULE_FISCO_QUIMICA,
    MODULE_COMPRAS,
    MODULE_COMPRAS_MP,
    MODULE_COMPRAS_EMB,
    MODULE_COMPRAS_COLOR,
    MODULE_COMPRAS_APOIO,
    MODULE_COMPRAS_COT,
    MODULE_COMPRAS_ONLINE,
    MODULE_COMPRAS_PEDIDOS,
    MODULE_COMPRAS_NOTAS,
    MODULE_VENDAS,
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
                leaf(MODULE_ESTOQUE_INSUMOS, "Insumos"),
                leaf(MODULE_ESTOQUE_PRODUTOS, "Produtos"),
                leaf(MODULE_ESTOQUE_ATIVOS, "Linha de Produtos"),
            ],
        },
        ModuleGroup {
            key: "producao".into(),
            label: "Produção".into(),
            hub_view: "producao_hub".into(),
            children: vec![
                leaf(MODULE_PRODUCAO, "Gerenciamento"),
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
                leaf(MODULE_COMPRAS, "Planejamento Geral"),
                leaf(MODULE_COMPRAS_MP, "Matéria-Prima"),
                leaf(MODULE_COMPRAS_EMB, "Embalagens"),
                leaf(MODULE_COMPRAS_COLOR, "Coloração"),
                leaf(MODULE_COMPRAS_APOIO, "Material de Apoio"),
                leaf(MODULE_COMPRAS_COT, "Cotações"),
                leaf(MODULE_COMPRAS_ONLINE, "Compras Online"),
                leaf(MODULE_COMPRAS_PEDIDOS, "Pedidos"),
                leaf(MODULE_COMPRAS_NOTAS, "Notas Fiscais"),
            ],
        },
        ModuleGroup {
            key: "vendas".into(),
            label: "Vendas".into(),
            hub_view: "vendas".into(),
            children: vec![leaf(MODULE_VENDAS, "Vendas Geral")],
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
        "admin" => all_module_keys_vec(),
        "estoque" => vec![
            MODULE_ESTOQUE_INSUMOS,
            MODULE_ESTOQUE_PRODUTOS,
            MODULE_ESTOQUE_ATIVOS,
        ]
        .into_iter()
        .map(String::from)
        .collect(),
        "producao" | "produção" => vec![
            MODULE_PRODUCAO,
            MODULE_MONTAGEM_KITS,
        ]
        .into_iter()
        .map(String::from)
        .collect(),
        "micro" | "microbiologia" => vec![MODULE_MICROBIOLOGIA.to_string()],
        "fisco" | "fisico-quimica" | "físico-química" => vec![MODULE_FISCO_QUIMICA.to_string()],
        "compras" => vec![
            MODULE_COMPRAS,
            MODULE_COMPRAS_MP,
            MODULE_COMPRAS_EMB,
            MODULE_COMPRAS_COLOR,
            MODULE_COMPRAS_APOIO,
            MODULE_COMPRAS_COT,
            MODULE_COMPRAS_ONLINE,
            MODULE_COMPRAS_PEDIDOS,
            MODULE_COMPRAS_NOTAS,
        ]
        .into_iter()
        .map(String::from)
        .collect(),
        "financeiro" => vec![MODULE_FINANCEIRO.to_string()],
        "vendas" => vec![MODULE_VENDAS.to_string()],
        _ => vec![],
    }
}

/// Resolve view (inclui hubs) para verificação de acesso.
pub fn view_to_module_key(view: &str) -> Option<&str> {
    match view {
        "hub" => None,
        "estoque_hub" => None,
        "producao_hub" => None,
        "compras_hub" => None,
        "linha_produtos" => Some(MODULE_ESTOQUE_ATIVOS),
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
        return modules.iter().any(|m| m == key);
    }
    hub_visible_if_any_child(modules, view)
}

pub fn normalize_modules(modules: &[String]) -> Vec<String> {
    let mut out: Vec<String> = modules
        .iter()
        .filter(|m| ALL_MODULE_KEYS.contains(&m.as_str()))
        .cloned()
        .collect();
    out.sort();
    out.dedup();
    out
}

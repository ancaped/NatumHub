use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapaGroup {
    pub key: String,
    pub label: String,
    pub hub_view: String,
    pub sort_order: i32,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapaModule {
    pub module_key: String,
    pub group_key: String,
    pub label: String,
    pub purpose: String,
    pub status: String,
    pub sort_order: i32,
    pub pos_x: f64,
    pub pos_y: f64,
    pub frontend_path: Option<String>,
    pub backend_path: Option<String>,
    pub router_prefix: Option<String>,
    pub ai_hints: Value,
    pub detail: Value,
    /// Telas, rotas, tabelas e chamadas gerados do código deste build (só no snapshot).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gerado: Option<super::gerado::Gerado>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapaEdge {
    pub id: String,
    pub from_key: String,
    pub to_key: String,
    pub kind: String,
    pub note: String,
    /// Conexão gerada do código (tela de um módulo chama rota de outro), não escrita à mão.
    #[serde(default)]
    pub auto: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapaActivity {
    pub id: String,
    pub at: String,
    pub actor: Option<String>,
    pub action: String,
    pub meta: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapaSnapshot {
    pub groups: Vec<MapaGroup>,
    pub modules: Vec<MapaModule>,
    pub edges: Vec<MapaEdge>,
    pub activity: Vec<MapaActivity>,
    /// Ações geradas do código (catálogo `core::catalogo`), só leitura.
    pub acoes: Vec<crate::core::catalogo::Acao>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutItem {
    pub module_key: String,
    pub pos_x: f64,
    pub pos_y: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutUpdate {
    pub items: Vec<LayoutItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleCreate {
    pub module_key: String,
    pub group_key: String,
    pub label: String,
    pub purpose: Option<String>,
    pub pos_x: Option<f64>,
    pub pos_y: Option<f64>,
    /// Caminhos que ligam o código ao módulo (a ficha se gera deles). Vazio = sem caminho.
    #[serde(default)]
    pub frontend_path: Option<String>,
    #[serde(default)]
    pub backend_path: Option<String>,
    #[serde(default)]
    pub router_prefix: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeCreate {
    pub from_key: String,
    pub to_key: String,
    pub kind: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ActivityQuery {
    pub limit: Option<i64>,
}

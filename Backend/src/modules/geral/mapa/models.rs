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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapaEdge {
    pub id: String,
    pub from_key: String,
    pub to_key: String,
    pub kind: String,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapaRoute {
    pub id: String,
    pub module_key: Option<String>,
    pub methods: Vec<String>,
    pub path: String,
    pub summary: String,
    pub auth: String,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapaTask {
    pub id: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub title: String,
    pub payload: Value,
    pub targets: Value,
    pub acceptance: Value,
    pub notes: String,
    pub status: String,
    pub created_by: Option<String>,
    pub created_at: String,
    pub done_at: Option<String>,
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
    pub routes: Vec<MapaRoute>,
    pub tasks_open: Vec<MapaTask>,
    pub activity: Vec<MapaActivity>,
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
pub struct ModuleUpdate {
    pub purpose: Option<String>,
    pub status: Option<String>,
    pub group_key: Option<String>,
    pub label: Option<String>,
    pub ai_hints: Option<Value>,
    pub detail: Option<Value>,
    pub frontend_path: Option<String>,
    pub backend_path: Option<String>,
    pub router_prefix: Option<String>,
    pub sort_order: Option<i32>,
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
#[serde(rename_all = "camelCase")]
pub struct TaskCreate {
    #[serde(rename = "type")]
    pub type_: String,
    pub title: String,
    pub payload: Option<Value>,
    pub targets: Option<Value>,
    pub acceptance: Option<Value>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPatch {
    pub status: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TasksQuery {
    pub status: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct ActivityQuery {
    pub limit: Option<i64>,
}

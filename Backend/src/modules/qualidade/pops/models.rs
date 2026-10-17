use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PopSector {
    pub id: String,
    pub name: String,
    pub sort_order: i32,
    pub active: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SectorInput {
    pub name: String,
    pub sort_order: Option<i32>,
    pub active: Option<bool>,
}

/// Corpo contínuo do POP (layout 3 barras). Aceita JSON legado com seções.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PopContent {
    pub body: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub elaborated_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reviewed_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<String>,
}

impl PopContent {
    pub fn from_value(v: &Value) -> Self {
        if let Some(body) = v.get("body").and_then(|x| x.as_str()) {
            return Self {
                body: body.to_string(),
                elaborated_at: v
                    .get("elaboratedAt")
                    .or_else(|| v.get("elaborated_at"))
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string()),
                reviewed_at: v
                    .get("reviewedAt")
                    .or_else(|| v.get("reviewed_at"))
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string()),
                approved_at: v
                    .get("approvedAt")
                    .or_else(|| v.get("approved_at"))
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string()),
            };
        }

        // Formato antigo (8 seções) → concatena em body
        let sections: &[(&str, &str)] = &[
            ("objetivo", "Objetivo"),
            ("condicoes", "Condições necessárias"),
            ("responsabilidades", "Responsabilidades"),
            ("procedimento", "Procedimento / Atividades"),
            ("formasControle", "Formas de controle"),
            ("formas_controle", "Formas de controle"),
            ("observacoes", "Observações / Anormalidades"),
            ("registros", "Registros"),
            ("referencia", "Referência"),
        ];
        let mut parts: Vec<String> = Vec::new();
        let mut seen_controle = false;
        for (key, label) in sections {
            if *key == "formas_controle" && seen_controle {
                continue;
            }
            if *key == "formasControle" {
                seen_controle = true;
            }
            let text = v
                .get(key)
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .trim();
            if text.is_empty() {
                continue;
            }
            parts.push(format!("{label}\n{text}"));
        }
        Self {
            body: parts.join("\n\n"),
            elaborated_at: None,
            reviewed_at: None,
            approved_at: None,
        }
    }

    pub fn to_value(&self) -> Value {
        let mut obj = json!({ "body": self.body });
        if let Some(ref d) = self.elaborated_at {
            obj["elaboratedAt"] = json!(d);
        }
        if let Some(ref d) = self.reviewed_at {
            obj["reviewedAt"] = json!(d);
        }
        if let Some(ref d) = self.approved_at {
            obj["approvedAt"] = json!(d);
        }
        obj
    }

    pub fn is_body_empty(&self) -> bool {
        self.body.trim().is_empty()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PopVersion {
    pub id: String,
    pub document_id: String,
    pub revision: i32,
    pub effective_date: String,
    pub next_review_date: String,
    pub change_kind: String,
    pub change_summary: Option<String>,
    pub content: PopContent,
    pub elaborated_by: Option<String>,
    pub reviewed_by: Option<String>,
    pub approved_by: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PopDocument {
    pub id: String,
    pub code: String,
    pub title: String,
    pub sector_id: String,
    pub sector_name: Option<String>,
    pub current_revision: i32,
    pub effective_date: Option<String>,
    pub next_review_date: Option<String>,
    pub status: String,
    pub elaborated_by: Option<String>,
    pub reviewed_by: Option<String>,
    pub approved_by: Option<String>,
    pub current_version_id: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub current_version: Option<PopVersion>,
    /// days until next_review_date (negative = overdue)
    pub days_to_review: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentInput {
    pub code: String,
    pub title: String,
    pub sector_id: String,
    pub content: Option<PopContent>,
    pub elaborated_by: Option<String>,
    pub reviewed_by: Option<String>,
    pub approved_by: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentUpdateInput {
    pub title: Option<String>,
    pub sector_id: Option<String>,
    pub content: Option<PopContent>,
    pub elaborated_by: Option<String>,
    pub reviewed_by: Option<String>,
    pub approved_by: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishInput {
    pub effective_date: Option<String>,
    pub change_summary: Option<String>,
    pub content: Option<PopContent>,
    pub elaborated_by: Option<String>,
    pub reviewed_by: Option<String>,
    pub approved_by: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevalidateInput {
    pub effective_date: Option<String>,
    pub change_summary: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentsQuery {
    pub sector_id: Option<String>,
    pub status: Option<String>,
    pub q: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedInventoryInput {
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PopSettings {
    pub logo_url: Option<String>,
    pub logo_rel_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckAlertsResult {
    pub notified: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedResult {
    pub sectors: usize,
    pub created: usize,
    pub skipped: usize,
    pub bodies_filled: usize,
}

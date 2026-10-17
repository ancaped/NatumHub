use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OperatorRole {
    Supervisor,
    Admin,
    Producao,
    Compras,
    Micro,
    Fisco,
    Financeiro,
    Estoque,
    Vendas,
    Operador,
}

impl OperatorRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Supervisor => "supervisor",
            Self::Admin => "admin",
            Self::Producao => "producao",
            Self::Compras => "compras",
            Self::Micro => "micro",
            Self::Fisco => "fisco",
            Self::Financeiro => "financeiro",
            Self::Estoque => "estoque",
            Self::Vendas => "vendas",
            Self::Operador => "operador",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "supervisor" => Self::Supervisor,
            "admin" => Self::Admin,
            "producao" | "produção" => Self::Producao,
            "compras" => Self::Compras,
            "micro" | "microbiologia" => Self::Micro,
            "fisco" | "fisico-quimica" | "físico-química" => Self::Fisco,
            "financeiro" => Self::Financeiro,
            "estoque" => Self::Estoque,
            "vendas" => Self::Vendas,
            _ => Self::Operador,
        }
    }

    /// Conta master — supervisor ou admin legado.
    pub fn is_supervisor(&self) -> bool {
        matches!(self, Self::Supervisor | Self::Admin)
    }

    pub fn is_admin(&self) -> bool {
        self.is_supervisor()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Operator {
    pub id: String,
    pub display_name: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperatorPublic {
    pub display_name: String,
    pub role: String,
}

use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModulePermission {
    pub module_key: String,
    pub access_level: String, // "view" | "edit"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperatorDetail {
    pub id: String,
    pub display_name: String,
    pub role: String,
    pub active: bool,
    pub modules: Vec<String>,
    #[serde(default)]
    pub permissions: HashMap<String, String>,
    pub update_channel: String,
    pub has_password: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveOperatorRequest {
    pub display_name: String,
    pub role: String,
    pub active: Option<bool>,
    pub modules: Vec<String>,
    #[serde(default)]
    pub permissions: Option<HashMap<String, String>>,
    #[serde(default)]
    pub update_channel: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub supervisor_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub display_name: String,
    pub password: String,
    #[serde(default)]
    pub device_id: Option<String>,
    #[serde(default)]
    pub device_label: Option<String>,
    #[serde(default)]
    pub client_ip: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupSupervisorRequest {
    pub display_name: String,
    pub password: String,
    #[serde(default)]
    pub device_id: Option<String>,
    #[serde(default)]
    pub device_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatusResponse {
    pub needs_supervisor_setup: bool,
    pub has_supervisor: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HubDevice {
    pub device_id: String,
    pub label: String,
    pub update_channel: String,
    pub last_ip: Option<String>,
    pub last_seen: Option<String>,
    pub registered_by: Option<String>,
    pub registered_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDeviceRequest {
    pub label: Option<String>,
    pub update_channel: Option<String>,
    #[serde(default)]
    pub supervisor_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
    pub id: String,
    pub display_name: String,
    pub role: String,
    pub photo_url: String,
    pub modules: Vec<String>,
    #[serde(default)]
    pub permissions: HashMap<String, String>,
    pub update_channel: String,
    pub user_update_channel: String,
    pub device_update_channel: String,
    pub effective_update_channel: String,
    pub is_supervisor: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    pub token: String,
    pub user: AuthUser,
    pub expires_at: String,
}

#[derive(Debug, Clone)]
pub struct AuthContext {
    pub operator_id: String,
    pub display_name: String,
    pub role: OperatorRole,
    pub modules: Vec<String>,
    pub permissions: HashMap<String, String>,
}

impl AuthContext {
    pub fn avatar_url(&self) -> String {
        let encoded: String = self
            .display_name
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '+' })
            .collect();
        format!(
            "https://ui-avatars.com/api/?name={}&background=18181b&color=fff",
            encoded
        )
    }

    pub fn has_module(&self, key: &str) -> bool {
        self.role.is_supervisor() || self.modules.iter().any(|m| m == key)
    }

    pub fn can_view_module(&self, key: &str) -> bool {
        self.has_module(key)
    }

    pub fn can_edit_module(&self, key: &str) -> bool {
        if self.role.is_supervisor() {
            return true;
        }
        if !self.modules.iter().any(|m| m == key) {
            return false;
        }
        // If not explicitly "view", defaults to "edit"
        self.permissions.get(key).map(|lvl| lvl != "view").unwrap_or(true)
    }
}

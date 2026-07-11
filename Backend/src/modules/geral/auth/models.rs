use serde::{Deserialize, Serialize};



#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]

#[serde(rename_all = "lowercase")]

pub enum OperatorRole {

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



    pub fn is_admin(&self) -> bool {

        matches!(self, Self::Admin)

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



#[derive(Debug, Clone, Serialize, Deserialize)]

#[serde(rename_all = "camelCase")]

pub struct OperatorDetail {

    pub id: String,

    pub display_name: String,

    pub role: String,

    pub active: bool,

    pub modules: Vec<String>,

    pub update_channel: String,

}



#[derive(Debug, Clone, Serialize, Deserialize)]

#[serde(rename_all = "camelCase")]

pub struct SaveOperatorRequest {

    pub display_name: String,

    pub role: String,

    pub active: Option<bool>,

    pub modules: Vec<String>,

    #[serde(default)]
    pub update_channel: Option<String>,

}



#[derive(Debug, Clone, Serialize, Deserialize)]

#[serde(rename_all = "camelCase")]

pub struct LoginRequest {

    pub display_name: String,

}



#[derive(Debug, Clone, Serialize, Deserialize)]

#[serde(rename_all = "camelCase")]

pub struct AuthUser {

    pub id: String,

    pub display_name: String,

    pub role: String,

    pub photo_url: String,

    pub modules: Vec<String>,

    pub update_channel: String,

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

        self.role.is_admin() || self.modules.iter().any(|m| m == key)

    }

}


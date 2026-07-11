use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OnlineOrder {
    pub id: String,
    pub description: String,
    pub item_code: Option<String>,
    pub store_name: Option<String>,
    pub purchase_url: Option<String>,
    pub purchase_date: String,
    pub unit_price: Option<f64>,
    pub quantity: Option<i32>,
    pub shipping_cost: Option<f64>,
    pub total_price: Option<f64>,
    pub payment_method: Option<String>,
    pub tracking_code: Option<String>,
    pub tracking_url: Option<String>,
    pub status: String,
    pub estimated_delivery: Option<String>,
    pub receipt_path: Option<String>,
    pub notes: Option<String>,
    pub created_at: Option<String>,
    pub is_return: Option<bool>,
    pub return_deadline: Option<String>,
    pub return_status: Option<String>,
    pub return_notes: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OnlineStore {
    pub id: String,
    pub name: String,
    pub url: Option<String>,
    pub notes: Option<String>,
    pub created_at: Option<String>,
}

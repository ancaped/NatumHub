use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HubPrinter {
    pub id: String,
    pub name: String,
    pub system_printer_name: Option<String>,
    pub printer_type: String, // "thermal_label", "laser_a4", "inkjet", "network_raw", "other"
    pub connection_type: String, // "local_spooler", "network_tcp", "usb_direct", "server_shared"
    pub ip_address: Option<String>, // e.g. "192.168.1.150:9100"
    pub default_width_mm: f64,
    pub default_height_mm: f64,
    pub default_orientation: String, // "landscape", "portrait"
    pub dpi: i32, // 203, 300, 600
    pub location: Option<String>, // "Almoxarifado", "Produção", "Expedição", "Laboratório"
    pub status: String, // "online", "offline", "busy", "error"
    pub is_default: bool,
    pub raw_protocol: String, // "zpl", "tspl", "esc_pos", "spooler_native", "none"
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreatePrinterRequest {
    pub name: String,
    pub system_printer_name: Option<String>,
    pub printer_type: Option<String>,
    pub connection_type: Option<String>,
    pub ip_address: Option<String>,
    pub default_width_mm: Option<f64>,
    pub default_height_mm: Option<f64>,
    pub default_orientation: Option<String>,
    pub dpi: Option<i32>,
    pub location: Option<String>,
    pub is_default: Option<bool>,
    pub raw_protocol: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePrinterRequest {
    pub name: Option<String>,
    pub system_printer_name: Option<String>,
    pub printer_type: Option<String>,
    pub connection_type: Option<String>,
    pub ip_address: Option<String>,
    pub default_width_mm: Option<f64>,
    pub default_height_mm: Option<f64>,
    pub default_orientation: Option<String>,
    pub dpi: Option<i32>,
    pub location: Option<String>,
    pub status: Option<String>,
    pub is_default: Option<bool>,
    pub raw_protocol: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemPrinterInfo {
    pub name: String,
    pub driver_name: Option<String>,
    pub port_name: Option<String>,
    pub is_default: bool,
    pub is_network: bool,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HubPrintJob {
    pub id: String,
    pub printer_id: String,
    pub printer_name: String,
    pub operator_id: Option<String>,
    pub operator_name: Option<String>,
    pub title: String,
    pub template_id: Option<String>,
    pub payload_type: String, // "label_canvas_json", "pdf", "raw_svg", "image_png", "zpl", "tspl"
    pub payload_data: String,
    pub copies: i32,
    pub status: String, // "pending", "printing", "completed", "failed", "cancelled"
    pub error_message: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreatePrintJobRequest {
    pub printer_id: String,
    pub title: String,
    pub template_id: Option<String>,
    pub payload_type: Option<String>,
    pub payload_data: String,
    pub copies: Option<i32>,
}

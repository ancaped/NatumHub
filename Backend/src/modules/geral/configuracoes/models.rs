use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WatchConfig {
    pub pasta: String,
    pub threshold_levantamento_dias: i64,
    pub threshold_faturamento_dias: i64,
    pub ativo: bool,
}

/// Horários diários (HH:MM) para sync automático ERP → SQLite no master.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ErpSyncScheduleConfig {
    pub ativo: bool,
    pub horarios: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ErpSyncScheduleResponse {
    pub ativo: bool,
    pub horarios: Vec<String>,
    pub ultima_execucao: Option<String>,
    pub proxima_execucao: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct SaveSettingInput {
    pub value: String,
}

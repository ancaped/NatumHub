use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WatchConfig {
    pub pasta: String,
    pub threshold_levantamento_dias: i64,
    pub threshold_faturamento_dias: i64,
    pub ativo: bool,
}

fn default_audit_interval() -> u64 {
    15
}

/// Horários diários (HH:MM) para sync automático ERP → PostgreSQL no master.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ErpSyncScheduleConfig {
    pub ativo: bool,
    pub horarios: Vec<String>,
    #[serde(default = "default_audit_interval")]
    pub auto_audit_interval_minutes: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ErpSyncScheduleResponse {
    pub ativo: bool,
    pub horarios: Vec<String>,
    pub ultima_execucao: Option<String>,
    pub proxima_execucao: Option<String>,
    pub auto_audit_interval_minutes: u64,
}

#[derive(serde::Deserialize)]
pub struct SaveSettingInput {
    pub value: String,
}

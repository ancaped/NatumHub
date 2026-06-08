use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LineConfig {
    pub linha_prefix: String,
    pub nome_linha: String,
    pub estoque_ideal_mult: f64,
    pub abrir_ordem_mult: f64,
    pub abrir_prod_mult: f64,
    pub fator_seguranca_z: f64,
    pub visivel: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Product {
    pub codigo: String,
    pub descricao: String,
    pub linha_prefix: String,
    pub base: Option<String>,
    pub media_levantamento: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Stock {
    pub codigo: String,
    pub estoque: i64,
    pub producao: i64,
    pub pedidos_aberto: i64,
    pub fase: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FaturamentoRecord {
    pub codigo: String,
    pub mes: i32,
    pub quantidade: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProductOverride {
    pub codigo: String,
    pub estoque_ideal_manual: Option<i64>,
    pub pedidos_manual: Option<i64>,
    pub media_manual: Option<f64>,
    pub is_lancamento_manual: Option<i32>,
    pub visivel: Option<i32>,
    pub observacao: Option<String>,
    pub linha_prefix_manual: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProductCalculationResult {
    // Basic fields
    pub codigo: String,
    pub descricao: String,
    pub linha_prefix: String,
    pub nome_linha: String,
    pub base: Option<String>,
    pub fase: Option<String>,

    // Stock fields
    pub estoque: i64,
    pub producao: i64,
    pub pedidos_aberto: i64,
    pub estoque_futuro: i64,
    pub estoque_futuro_com_producao: i64,

    // Overrides Indicator
    pub estoque_ideal_manual: Option<i64>,
    pub pedidos_manual: Option<i64>,
    pub media_manual: Option<f64>,
    pub is_lancamento_manual: Option<i32>,
    pub visivel: Option<i32>,
    pub observacao: Option<String>,
    pub linha_prefix_manual: Option<String>,

    // Sales Statistics
    pub media_vendas: f64,          // Mean of sales
    pub desvio_padrao: f64,         // Standard deviation of sales
    pub demanda_ajustada: f64,      // Media + Z * StdDev
    pub is_lancamento: bool,        // True if no historical sales in faturamento

    // Config thresholds
    pub estoque_ideal_meses: f64,
    pub abrir_ordem_meses: f64,
    pub abrir_prod_meses: f64,

    pub estoque_ideal_qtd: f64,
    pub abrir_ordem_qtd: f64,
    pub abrir_prod_qtd: f64,

    // Computed Durations
    pub duracao_meses: f64,
    pub duracao_dias: f64,

    // Recommendations & Status
    pub status: String,             // Alert levels: "critico", "ordem", "saudavel", "abundante"
    pub status_label: String,       // User friendly Portuguese text
    pub producao_recomendada: i64,  // Units to produce

    pub has_formulation: bool,
    pub missing_ingredients: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct QueryParams {
    pub search: Option<String>,
    pub linha: Option<String>,
    pub status: Option<String>,
    pub base: Option<String>,
    pub page: Option<usize>,
    pub limit: Option<usize>,
    pub show_hidden: Option<bool>,
    pub sort: Option<String>,
    pub order: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PaginatedResponse<T> {
    pub items: Vec<T>,
    pub total: usize,
    pub page: usize,
    pub limit: usize,
    pub total_pages: usize,
}

#[derive(Debug, Deserialize, Clone)]
pub struct BulkOverrideRequest {
    pub codigos: Vec<String>,
    pub action: String,
    pub value_str: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct KitComponentDetail {
    pub codigo: String,
    pub descricao: String,
    pub estoque: i64,
    pub producao: i64,
    pub pedidos_aberto: i64,
    pub estoque_futuro_com_producao: i64,
    pub producao_recomendada: i64,
    pub status: String,
    pub status_label: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct KitCalculationResult {
    #[serde(flatten)]
    pub kit_detalhes: ProductCalculationResult,
    pub componentes: Vec<KitComponentDetail>,
    pub max_montavel: i64,
    pub componentes_criticos: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NewProducaoEntry {
    pub data_producao: String,
    pub codigo: String,
    pub quantidade: i64,
    pub observacoes: Option<String>,
    // Snapshot do produto no momento do lançamento
    pub snap_estoque: Option<i64>,
    pub snap_producao: Option<i64>,
    pub snap_pedidos: Option<i64>,
    pub snap_efp: Option<i64>,
    pub snap_media_vendas: Option<f64>,
    pub snap_duracao_meses: Option<f64>,
    pub snap_status: Option<String>,
    pub snap_status_label: Option<String>,
    pub snap_producao_recomendada: Option<i64>,
    pub snap_estoque_ideal_qtd: Option<f64>,
    pub snap_demanda_ajustada: Option<f64>,

    // Base control fields
    pub consume_base: Option<bool>,
    pub base_code: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProducaoHistoryRecord {
    pub id: i64,
    pub data_producao: String,
    pub codigo: String,
    pub descricao: String,
    pub linha_prefix: String,
    pub nome_linha: String,
    pub quantidade: i64,
    pub observacoes: Option<String>,
    pub criado_em: String,
    // Snapshot
    pub snap_estoque: Option<i64>,
    pub snap_producao: Option<i64>,
    pub snap_pedidos: Option<i64>,
    pub snap_efp: Option<i64>,
    pub snap_media_vendas: Option<f64>,
    pub snap_duracao_meses: Option<f64>,
    pub snap_status: Option<String>,
    pub snap_status_label: Option<String>,
    pub snap_producao_recomendada: Option<i64>,
    pub snap_estoque_ideal_qtd: Option<f64>,
    pub snap_demanda_ajustada: Option<f64>,

    // Base control fields
    pub consume_base: Option<bool>,
    pub base_code: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct HistoryQueryParams {
    pub search: Option<String>,
    pub linha: Option<String>,
    pub data: Option<String>,
    pub sort: Option<String>,
    pub order: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImportRecord {
    pub id: i64,
    pub tipo: String,
    pub nome_arquivo: String,
    pub importado_em: String,
    pub registros: i64,
    pub status: String,
    pub mensagem: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImportStatus {
    pub tipo: String,
    pub ultimo_arquivo: Option<String>,
    pub importado_em: Option<String>,
    pub dias_sem_importar: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WatchConfig {
    pub pasta: String,
    pub threshold_levantamento_dias: i64,
    pub threshold_faturamento_dias: i64,
    pub ativo: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KitComposicaoRow {
    pub kit_codigo: String,
    pub kit_descricao: String,
    pub componente_codigo: String,
    pub componente_descricao: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NewKitComposicao {
    pub kit_codigo: String,
    pub componente_codigo: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FormulationLine {
    pub product_code: String,
    pub ingredient_code: String,
    pub description: Option<String>,
    pub quantity: f64,
    pub percentage: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StockMovement {
    pub id: String,
    pub item_code: String,
    pub item_type: String,         // 'insumo' | 'produto' | 'material'
    pub movement_type: String,     // 'entrada' | 'saida'
    pub quantity: f64,
    pub date: String,              // YYYY-MM-DD HH:MM:SS
    pub document_number: Option<String>,
    pub details: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DbDumpResult {
    pub filename: String,
    pub size_bytes: u64,
    pub tables_copied: Vec<String>,
    pub elapsed_ms: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SimilarProductResult {
    pub product: ProductCalculationResult,
    pub similarity: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecalculationPreviewResponse {
    pub product_code: String,
    pub product_description: String,
    pub ingredient_code: String,
    pub ingredient_description: String,
    pub total_produced: i64,
    pub qty_per_unit: f64,
    pub total_consumption: f64,
    pub current_stock: f64,
    pub expected_stock: f64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct RecalculationAdjustmentRequest {
    pub ingredient_code: String,
    pub adjustment_qty: f64,
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InsumoDetalhesResponse {
    pub code: String,
    pub description: String,
    pub unit: String,
    pub notes: Option<String>,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub current_stock: f64,
    pub consumption_yoy: Vec<ConsumptionYoYItem>,
    pub monthly_purchases: Vec<MonthlyPurchaseItem>,
    pub recent_invoices: Vec<InsumoInvoiceItem>,
    pub last_used_date: Option<String>,
    pub last_used_lote: Option<String>,
    pub last_received_date: Option<String>,
    pub last_received_doc: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConsumptionYoYItem {
    pub year: i32,
    pub total_qty: f64,
    pub monthly_avg: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyPurchaseItem {
    pub month: String,
    pub qty: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InsumoInvoiceItem {
    pub invoice_number: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub total_value: f64,
    pub supplier_name: String,
    pub invoice_date: String,
}



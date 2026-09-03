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
    pub status_produto: Option<String>,
    pub categoria_produto: Option<String>,
    pub produzir_apenas_kit: Option<i32>,
    pub lancamento_meta_meses: Option<i64>,
    pub lancamento_data_inicio: Option<String>,
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
    pub status_produto: Option<String>,
    pub categoria_produto: Option<String>,
    pub produzir_apenas_kit: Option<i32>,
    pub lancamento_meta_meses: Option<i64>,
    pub lancamento_data_inicio: Option<String>,
    pub is_kit_component: Option<bool>,

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

    pub faltas_ativas: Option<i64>,
    pub pedidos_compra_aberto: Option<i64>,
    pub sugestao_compra: Option<i64>,
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
    pub suspended_only: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SalesOrderItem {
    pub id: i64,
    pub n_pedido: i32,
    pub d_pedido: String,
    pub n_registro: Option<i32>,
    pub c_cod_prod: String,
    pub n_qtde: i32,
    pub n_qtde_fat: i32,
    pub n_preco: f64,
    pub c_lote: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SalesOrder {
    pub n_pedido: i32,
    pub d_pedido: String,
    pub n_codigo: Option<i32>,
    pub c_nome: Option<String>,
    pub n_valor_tot: f64,
    pub c_status: Option<String>,
    pub n_nota_fiscal: i32,
    pub d_previsao: Option<String>,
    pub d_entrega: Option<String>,
    pub m_observac: Option<String>,
    pub items: Vec<SalesOrderItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProductFaltaItem {
    pub n_pedido: i32,
    pub d_pedido: String,
    pub c_nome: Option<String>,
    pub c_status: Option<String>,
    pub n_qtde: i32,
    pub n_qtde_fat: i32,
    pub falta: i32,
    pub d_previsao: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProductFaltaGroup {
    pub c_cod_prod: String,
    pub c_nome_prod: String,
    pub c_nome_linha: String,
    pub total_falta: i32,
    pub pedidos_afetados: Vec<ProductFaltaItem>,
    pub estoque: i64,
    pub producao: i64,
    pub transit_purchase: i64,
    pub falta_net: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PendingOrdersResponse {
    pub pending_sales_orders: Vec<ProductFaltaItem>,
    pub in_transit_purchase_orders: Vec<PendingPurchaseOrderItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PendingPurchaseOrderItem {
    pub n_pedido: i32,
    pub c_nome_f: Option<String>,
    pub d_previsao: Option<String>,
    pub n_qtde: f64,
    pub n_chegou: f64,
    pub n_pendente: f64,
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
    pub quantidade: i64,
    pub necessita_producao: bool,
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
    pub lote_erp: Option<String>,
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
    pub lote_erp: Option<String>,
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
    pub quantidade: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NewKitComposicao {
    pub kit_codigo: String,
    pub componente_codigo: String,
    #[serde(default = "default_quantidade")]
    pub quantidade: i64,
}

fn default_quantidade() -> i64 { 1 }

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
pub struct PendingPurchaseOrderInfo {
    pub n_pedido: i32,
    pub d_pedido: Option<String>,
    pub c_nome_f: Option<String>,
    pub n_qtde: f64,
    pub n_chegou: f64,
    pub n_preco: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InsumoQuotationItem {
    pub id: String,
    pub title: String,
    pub status: String,
    pub recommended_qty: f64,
    pub approved_qty: Option<f64>,
    pub final_qty: Option<f64>,
    pub created_at: String,
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
    pub monthly_consumption: Vec<MonthlyConsumptionItem>,
    pub recent_invoices: Vec<InsumoInvoiceItem>,
    pub last_used_date: Option<String>,
    pub last_used_lote: Option<String>,
    pub last_received_date: Option<String>,
    pub last_received_doc: Option<String>,
    pub products_used_in: Vec<InsumoUsedInProductItem>,
    pub pending_orders: Vec<PendingPurchaseOrderInfo>,
    pub quotations: Vec<InsumoQuotationItem>,
    pub open_production_orders: Vec<OpenProductionOrderItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InsumoUsedInProductItem {
    pub product_code: String,
    pub description: String,
    pub quantity: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenProductionOrderItem {
    pub product_code: String,
    pub product_description: String,
    pub production_date: String,
    pub quantity_produced: f64,
    pub insumo_qty_per_unit: f64,
    pub insumo_qty_needed: f64,
    pub observations: Option<String>,
    pub lote_number: String,
    pub status: String,
    pub status_label: String,
    pub insumo_qty_weighed: f64,
    pub pesagem_completed: bool,
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
pub struct MonthlyConsumptionItem {
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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProductDetalhesResponse {
    pub code: String,
    pub description: String,
    pub unit: String,
    pub current_stock: f64,
    pub formulation: Vec<ProductFormulationLine>,
    pub sales_yoy: Vec<SalesYoYItem>,
    pub monthly_sales: Vec<MonthlySalesItem>,
    pub recent_invoices: Vec<InsumoInvoiceItem>,
    pub last_production_date: Option<String>,
    pub last_production_qty: Option<f64>,
    pub last_lots: Vec<ProductionLote>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProductFormulationLine {
    pub product_code: String,
    pub ingredient_code: String,
    pub description: String,
    pub quantity: f64,
    pub percentage: Option<f64>,
    pub current_stock: f64,
    pub category_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SalesYoYItem {
    pub year: i32,
    pub total_qty: f64,
    pub monthly_avg: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MonthlySalesItem {
    pub month: String,
    pub qty: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProductionLote {
    pub id: String,
    pub lote_number: String,
    pub product_code: String,
    pub product_description: String,
    pub quantity: f64,
    pub date: String,
    pub status: String,
    pub fabricated_by: String,
    pub authorized_by: String,
    pub yield_error: Option<bool>,
    pub pesagem_error: Option<bool>,
    pub envase_error: Option<bool>,
    pub conferencia_error: Option<bool>,
    pub is_resolved: Option<bool>,
    pub resolution_obs: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LoteErrorResolution {
    pub lote_number: String,
    pub is_resolved: bool,
    pub resolved_by: Option<String>,
    pub resolved_at: Option<String>,
    pub observations: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KitAssemblyOrder {
    pub id: i64,
    pub order_number: String,
    pub kit_product_code: String,
    pub kit_product_description: String,
    pub quantity: f64,
    pub status: String,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub assembled_by: Option<String>,
    pub checked_by: Option<String>,
    pub observations: Option<String>,
    pub erp_launched: i32,
    pub components_lotes: Option<String>,
    pub quantity_assembled: Option<f64>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateKitOrderRequest {
    pub order_number: String,
    pub kit_product_code: String,
    pub kit_product_description: String,
    pub quantity: f64,
    pub status: Option<String>,
    pub assembled_by: Option<String>,
    pub checked_by: Option<String>,
    pub observations: Option<String>,
    pub components_lotes: Option<String>,
    pub quantity_assembled: Option<f64>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateKitOrderRequest {
    pub status: Option<String>,
    pub completed_at: Option<String>,
    pub assembled_by: Option<String>,
    pub checked_by: Option<String>,
    pub observations: Option<String>,
    pub erp_launched: Option<i32>,
    pub components_lotes: Option<String>,
    pub quantity_assembled: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ViraComposicaoRow {
    pub de_produto_codigo: String,
    pub de_produto_descricao: String,
    pub para_produto_codigo: String,
    pub para_produto_descricao: String,
    pub quantidade: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NewViraComposicao {
    pub de_produto_codigo: String,
    pub para_produto_codigo: String,
    pub quantidade: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ViraOrder {
    pub id: i64,
    pub order_number: String,
    pub de_produto_codigo: String,
    pub de_produto_descricao: String,
    pub para_produto_codigo: String,
    pub para_produto_descricao: String,
    pub quantity: f64,
    pub status: String,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub assembled_by: Option<String>,
    pub checked_by: Option<String>,
    pub observations: Option<String>,
    pub erp_launched: i32,
    pub quantity_assembled: Option<f64>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateViraOrderRequest {
    pub order_number: String,
    pub de_produto_codigo: String,
    pub para_produto_codigo: String,
    pub quantity: f64,
    pub status: Option<String>,
    pub assembled_by: Option<String>,
    pub checked_by: Option<String>,
    pub observations: Option<String>,
    pub quantity_assembled: Option<f64>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateViraOrderRequest {
    pub status: Option<String>,
    pub completed_at: Option<String>,
    pub assembled_by: Option<String>,
    pub checked_by: Option<String>,
    pub observations: Option<String>,
    pub erp_launched: Option<i32>,
    pub quantity_assembled: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AcompanhamentoLoteItem {
    pub lote_number: String,
    pub product_code: String,
    pub product_description: String,
    pub quantity: f64,
    pub date: String,
    pub erp_status: String,
    pub erp_status_label: String,
    pub custom_status: Option<String>,
    pub category: Option<String>,
    pub updated_by: Option<String>,
    pub updated_at: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SaveLoteCustomStatusPayload {
    pub lote_number: String,
    pub custom_status: String,
    pub category: Option<String>,
    pub updated_by: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
pub struct AcompanhamentoQueryParams {
    pub search: Option<String>,
    pub erp_status: Option<String>,
    pub custom_status: Option<String>,
    pub category: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub limit: Option<usize>,
}



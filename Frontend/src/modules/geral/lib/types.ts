// === COMMON TYPES ===
export interface Feedback {
  id: string;
  feedbackType: string;
  description: string;
  page: string;
  logs: string;
  screenshot: string;
  status: string;
  createdAt?: string;
  resolvedAt?: string;
  requestedBy?: string;
  priority?: number;
  adminNotes?: string;
  hasLogs?: boolean;
  hasScreenshot?: boolean;
  notesCount?: number;
}

export interface FeedbackNote {
  id: string;
  feedbackId: string;
  author: string;
  body: string;
  createdAt?: string;
}

export interface FeedbackDetail extends Feedback {
  notes: FeedbackNote[];
}

export interface FeedbackSubmitInput {
  id: string;
  feedbackType: string;
  description: string;
  page: string;
  logs: string;
  screenshot?: string;
}

export interface FeedbackAdminUpdate {
  status?: string;
  priority?: number;
  adminNotes?: string;
}

// === COMPRAS TYPES ===
export interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

export interface SupplierSummary {
  id: string;
  name: string;
  cnpj?: string | null;
  contact?: string | null;
  email?: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  email: string;
  notes: string;
  cnpj?: string | null;
  parentId?: string | null;
  parentName?: string | null;
  linkedSuppliers?: SupplierSummary[] | null;
  linkedCount?: number | null;
}

export interface Item {
  code: string;
  description: string;
  unit: string;
  categoryId: string | null;
  line: string;
  typeCode: string;
  notes: string | null;
  isIgnored: boolean;
  isAutoIgnored?: boolean;
  ignoredReason?: string | null;
}

// === LINHA DE PRODUTOS TYPES ===
export type ProductLineStatus = 'ativo' | 'lancamento' | 'saindo_de_linha' | 'descontinuado' | 'terceirizado';

export interface ProductLineStatusConfig {
  value: ProductLineStatus;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
}

export const PRODUCT_LINE_STATUSES: ProductLineStatusConfig[] = [
  { value: 'ativo', label: 'Ativa', description: 'Produção e compras normais com cálculos automáticos', color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200', icon: '✅' },
  { value: 'lancamento', label: 'Lançamento', description: 'Estoque definido manualmente até criar histórico de giro', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', icon: '🚀' },
  { value: 'saindo_de_linha', label: 'Saindo de Linha', description: 'Produção usa insumos restantes, compras exclusivas bloqueadas', color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200', icon: '⚠️' },
  { value: 'descontinuado', label: 'Saiu de Linha', description: 'Produção e compras completamente paralisadas', color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200', icon: '🚫' },
  { value: 'terceirizado', label: 'Terceirizado', description: 'Produção terceirizada, sem compras ou produção automática', color: 'text-purple-700', bgColor: 'bg-purple-50', borderColor: 'border-purple-200', icon: '🏭' },
];

/** Categorias de roteamento (não confundir com status de ciclo de vida). */
export const PRODUCT_ROUTING_CATEGORIES = [
  { id: 'cat_base', label: 'Base de produção', description: 'Fórmula intermediária — Gestão de Bases e consumo em lotes' },
  { id: 'cat_coloracao', label: 'Coloração', description: 'Compras > Coloração' },
  { id: 'cat_apoio', label: 'Material de Apoio', description: 'Compras > Material de Apoio' },
] as const;

export interface GraduationCandidate {
  codigo: string;
  descricao: string;
  nome_linha: string;
  meses_com_historico: number;
  meta_meses: number;
  lancamento_data_inicio: string | null;
}

export interface StockSnapshot {
  itemCode: string;
  stockQty: number;
  reservedQty: number;
  inProduction: number;
  inOrders: number;
}

export interface Consumption {
  itemCode: string;
  year: number;
  totalQty: number;
  monthlyAvg: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  itemCode: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  supplierName: string;
  supplierId: string | null;
  invoiceDate: string;
}

export interface CustomPurchaseConfigRow {
  level: 'subcategoria' | 'item';
  targetId: string;
  diasStart: number | null;
  diasTarget: number | null;
  useLeadTime: number; // 0 or 1
  safetyDays: number;
  objetivoTipo: 'padrao' | 'porcentagem' | 'desvio_padrao' | 'multiplicador';
  objetivoValor: number;
  targetName?: string;
  periodoMedia?: number | null;
}

export interface DemandResult {
  itemCode: string;
  description: string;
  unit: string;
  categoryId: string | null;
  categoryName: string;
  currentStock: number;
  reservedQty: number;
  /** Reserva espelhada do ERP (tooltip). */
  reservedQtyErp?: number | null;
  inProduction: number;
  inOrders: number;
  /** Consumo se produzir produtos em Produzir Urgente / Abrir Ordem. */
  simProducao?: number;
  avg2024: number;
  avg2025: number;
  avg2026: number;
  overallAvg: number;
  futureStockForecast: number;
  estimatedDurationDays: number;
  recommendedQty: number;
  urgency: 'critical' | 'warning' | 'ok';
  notes: string | null;
  lastSupplierInvoice?: string;
  lastSupplierOrder?: string;
  triggerPoint?: number;
  targetStock?: number;
  triggerDays?: number;
  targetDays?: number;
  configLevel?: 'item' | 'subcategoria' | 'default';
}

export type QuotationStatus = 'draft' | 'pending_demand_approval' | 'quoting' | 'quoted' | 'pending_final_approval' | 'approved' | 'ordered';

export interface Quotation {
  id: string;
  title: string;
  status: QuotationStatus;
  targetDays: number;
  notes: string;
  directorDemandNotes: string;
  directorFinalNotes: string;
  createdAt: string;
  demandApprovedAt: string | null;
  finalApprovedAt: string | null;
  orderedAt: string | null;
  itemCount?: number;
  totalValue?: number;
  quotationType?: string | null;
}

export interface QuotationItem {
  id: string;
  quotationId: string;
  itemCode: string;
  description?: string;
  unit?: string;
  recommendedQty: number;
  approvedQty: number | null;
  finalQty: number | null;
  notes: string;
  prices?: QuotationPrice[];
}

export interface QuotationPrice {
  id: string;
  quotationItemId: string;
  supplierId: string;
  supplierName?: string | null;
  unitPrice: number;
  deliveryDays?: number | null;
  minQty?: number | null;
  paymentTerms?: string | null;
  notes?: string | null;
  isSelected: boolean;
}

export interface ImportResult {
  totalRows: number;
  newItems: number;
  updatedItems: number;
  skippedDuplicates: number;
  errors: string[];
}

export interface StockImport {
  id: string;
  filename: string;
  source: string;
  importedAt: string;
  itemCount: number;
}

export interface PricePoint {
  date: string;
  unitPrice: number;
  supplierName: string;
  invoiceNumber: string;
}

export interface SupplierSpend {
  supplierId: string;
  supplierName: string;
  totalValue: number;
  invoiceCount: number;
}

export interface CategorySpend {
  categoryId: string;
  categoryName: string;
  totalValue: number;
  itemCount: number;
}

export interface PurchaseRequestBatchItem {
  id: string;
  batchId: string;
  itemCode: string;
  itemDescription: string;
  unit: string;
  quantityRequested: number;
  currentStockAtTime: number;
  overallAvgAtTime: number;
  simProducaoAtTime: number;
  futureStockAtTime: number;
  targetDaysAtTime: number;
  triggerDaysAtTime: number;
  supplierName?: string | null;
  observacao?: string | null;
  status: 'solicitado' | 'pedido_gerado' | 'entregue' | 'cancelado' | string;
  erpPedidoNumero?: number | null;
  erpPedidoData?: string | null;
  erpFornecedor?: string | null;
  erpPedidoQtd?: number | null;
  erpPedidoChegou?: number | null;
  erpPrevisaoEntrega?: string | null;
  erpSyncedAt?: string | null;
  createdAt: string;
}

export interface PurchaseRequestBatch {
  id: string;
  loteNumero: string;
  modulo: string;
  titulo?: string | null;
  observacoes?: string | null;
  createdBy?: string | null;
  status: 'pendente' | 'parcial' | 'atendido' | 'concluido' | 'cancelado' | string;
  totalItems: number;
  itemsWithOrder: number;
  itemsCompleted: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseRequestBatchDetail {
  batch: PurchaseRequestBatch;
  items: PurchaseRequestBatchItem[];
}

export interface CreatePurchaseRequestItemInput {
  itemCode: string;
  itemDescription: string;
  unit?: string;
  quantityRequested: number;
  currentStockAtTime?: number;
  overallAvgAtTime?: number;
  simProducaoAtTime?: number;
  futureStockAtTime?: number;
  targetDaysAtTime?: number;
  triggerDaysAtTime?: number;
  supplierName?: string | null;
  observacao?: string | null;
}

export interface CreatePurchaseRequestBatchInput {
  modulo: string;
  titulo?: string | null;
  observacoes?: string | null;
  createdBy?: string | null;
  items: CreatePurchaseRequestItemInput[];
}

export interface ActiveRequestedItemSummary {
  itemCode: string;
  itemDescription: string;
  batchId: string;
  loteNumero: string;
  modulo: string;
  createdAt: string;
  daysAgo: number;
  quantityRequested: number;
  status: string;
  erpPedidoNumero?: number | null;
  erpPedidoData?: string | null;
  erpFornecedor?: string | null;
  erpPedidoQtd?: number | null;
  erpPedidoChegou?: number | null;
  erpPrevisaoEntrega?: string | null;
}


export interface ComprasAppConfig {
  targetDays: number;
  itemOverrides: Record<string, number>;
  autoSubcategories?: {
    subcategoryId: string;
    prefix: string;
  }[];
  averagePeriodMonths?: number;
}

// === MICROBIOLOGIA TYPES ===
export interface Product {
  id?: string;
  code: string;
  name: string;
  packaging: string;
  validity: string;
  isEa?: boolean;
}

export interface Report {
  id?: string;
  reportId: string;
  reportRawNum: number;
  productCode: string;
  productName: string;
  batch: string;
  collectionDate: string;
  technician: string;
  createdAt: any;
  manufacturingDate?: string;
  printed?: boolean;
  printedAt?: string;
}

export interface TestDefinition {
  name: string;
  result: string;
  unit: string;
  limit: string;
  lq: string;
  method: string;
}

export interface TemplateConfig {
  labName: string;
  deptName: string;
  companyName: string;
  companyAddress: string;
  companyEmail: string;
  companyContact: string;
  sampleType: string;
  technicianSignName: string;
  technicianSignTitle: string;
  defaultTechnician?: string;
  defaultTests: TestDefinition[];
}

export interface MicrobioAppConfig {
  nextReportNumber: number;
  currentYear: number;
  template?: TemplateConfig;
}

export interface OnlineOrder {
  id: string;
  description: string;
  itemCode: string | null;
  storeName: string | null;
  purchaseUrl: string | null;
  purchaseDate: string;
  unitPrice: number | null;
  quantity: number | null;
  shippingCost: number | null;
  totalPrice: number | null;
  paymentMethod: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  status: 'preparing' | 'shipped' | 'delivered' | 'cancelled';
  estimatedDelivery?: string | null;
  receiptPath: string | null;
  notes: string | null;
  createdAt?: string;
  isReturn?: boolean | null;
  returnDeadline?: string | null;
  returnStatus?: 'pending' | 'sent' | 'refunded' | 'resolved' | null;
  returnNotes?: string | null;
}

export interface OnlineStore {
  id: string;
  name: string;
  url?: string | null;
  notes?: string | null;
  createdAt?: string;
}

export interface FiscoTemplateConfig {
  labName: string;
  deptName: string;
  companyName: string;
  companyAddress: string;
  companyEmail: string;
  companyContact: string;
  sampleType: string;
  technicianSignName: string;
  technicianSignTitle: string;
  defaultTechnician?: string;
  defaultFabricatedBy?: string;
  defaultAuthorizedBy?: string;
  defaultAspect?: string;
  defaultColorOdor?: string;
}

export interface FiscoAppConfig {
  template?: FiscoTemplateConfig;
}

export interface FiscoQuimicaPattern {
  productCode: string;
  phMin: number;
  phMax: number;
  viscosityMin: number;
  viscosityMax: number;
  densityTarget: number;
  densityTolerance: number;
  packageVolume: number;
  packageUnit: 'mL' | 'L' | 'g' | 'kg';
  allowedAgents?: string[];
  aspect?: string;
  color?: string;
  odor?: string;
  imageUrl?: string;
}

export interface FiscoQuimicaAgent {
  id: string;
  name: string;
  category?: 'VISCOSIDADE' | 'PH' | 'OUTROS' | string;
  createdAt?: string;
}

export interface FiscoQuimicaAnalysis {
  id: string;
  productCode: string;
  productName: string;
  batch: string;
  analysisDate: string;
  technician: string;
  phMeasured: number;
  viscosityMeasured: number;
  densityMeasured: number;
  fractionWeight: number;
  envaseTargetWeight: number;
  envaseTargetUnit: 'g' | 'kg';
  hasAdjustment: boolean;
  correctiveAgentId: string | null;
  initialViscosity: number | null;
  trialAgentQty: number | null;
  trialViscosity: number | null;
  agentQtyPerLiter: number | null;
  batchSize: number | null;
  totalAgentRequired?: number | null;
  notes: string | null;
  fabricatedBy?: string | null;
  authorizedBy?: string | null;
  syncedToErp?: boolean | null;
  erpSyncedAt?: string | null;
  createdAt?: string;
  status?: 'CONFORME' | 'EM_CORRECAO' | 'AJUSTADO' | 'FORA_PADRAO' | string;
  mediaUrl?: string;
  aspectOk?: boolean | null;
  aspectResult?: string | null;
  colorOk?: boolean | null;
  colorResult?: string | null;
  odorOk?: boolean | null;
  odorResult?: string | null;
}

export interface CorrectiveBatchItem {
  analysis_id: string;
  batch: string;
  product_code: string;
  product_name: string;
  analysis_date: string;
  agent_name: string;
  agent_category: string;
  trial_qty_g_per_l?: number | null;
  batch_size_kg?: number | null;
  total_agent_kg: number;
  notes?: string | null;
}

export interface CorrectiveWeekSummary {
  week_key: string;
  label: string;
  year: number;
  week_num: number;
  is_baixa_realizada: boolean;
  baixa_data?: string | null;
  baixa_usuario?: string | null;
  observacoes?: string | null;
  total_agents_kg: number;
  agent_totals: Record<string, number>;
  items: CorrectiveBatchItem[];
}

export interface LoteProductLine {
  productCode: string;
  productDescription: string;
  quantity: number;
  unitWeightKg: number;
}

export interface LoteLookup {
  loteNumber: string;
  productCode: string;
  productDescription: string;
  quantity: number;
  date: string;
  dLote?: string;
  dPesado?: string;
  dEnvase?: string;
  status: string;
  statusLabel: string;
  fabricatedBy: string;
  authorizedBy: string;
  products: LoteProductLine[];
}

export interface FiscoErpLoteItem {
  lote: string;
  product_code: string;
  product_name: string;
  qty_kg: number;
  date_erp: string;
  status_erp: string;
  fabricated_by: string;
  authorized_by: string;
  unidades: number;
  d_pesado?: string | null;
  d_envase?: string | null;
  ph_erp?: number | null;
  viscosidade_erp?: number | null;
  densidade_erp?: number | null;
  viscosidade_24h_erp?: number | null;
  responsavel_cq_erp?: string | null;
  resultado_cq_erp?: string | null;
  data_inspecao_erp?: string | null;
  observacoes_erp?: string | null;
  has_laudo_erp: boolean;
  has_laudo_hub: boolean;
  has_laudo: boolean;
  laudo_id?: string | null;
  laudo_date?: string | null;
  technician?: string | null;
  ph_measured?: number | null;
  viscosity_measured?: number | null;
  density_measured?: number | null;
  fraction_weight?: number | null;
  has_adjustment?: boolean | null;
}

export interface FiscoErpLoteInsumo {
  item_code: string;
  item_description: string;
  unit?: string | null;
  quantity: number;
  date: string;
  user?: string | null;
  justificativa?: string | null;
}

export interface ProductionLote {
  id: string;
  loteNumber: string;
  productCode: string;
  productDescription: string;
  quantity: number;
  date: string;
  status: string;
  fabricatedBy: string;
  authorizedBy: string;
  yieldError?: boolean;
  pesagemError?: boolean;
  envaseError?: boolean;
  conferenciaError?: boolean;
}


// === ESTOQUE / DUMP TYPES ===
export interface StockMovement {
  id: string;
  itemCode: string;
  itemType: string; // 'insumo' | 'produto' | 'material'
  movementType: string; // 'entrada' | 'saida'
  quantity: number;
  date: string;
  documentNumber: string | null;
  details: string | null;
  createdAt: string;
}

export interface FormulationLine {
  productCode: string;
  ingredientCode: string;
  description: string | null;
  quantity: number;
  percentage: number | null;
}

export interface DbDumpResult {
  filename: string;
  sizeBytes: number;
  tablesCopied: string[];
  elapsedMs: number;
}

// === FINANCEIRO TYPES ===
export interface FinancialAccount {
  id: number;
  nomeCliente: string;
  historico: string | null;
  numeroDoc: string | null;
  dataEmissao: string;      // YYYY-MM-DD
  dataVencimento: string;   // YYYY-MM-DD
  valor: number;
  saldo: number;
  situacao: string;
}

export interface FinancialStatus {
  isConfigured: boolean;
  lastSync: string | null;
  receivablesCount: number;
  payablesCount: number;
}

export interface FinancialSyncResult {
  status: string;
  lastSync: string;
  receivablesUpserted: number;
  payablesUpserted: number;
  receivablesRemoved: number;
  payablesRemoved: number;
  elapsedMs: number;
  startDate: string;
  endDate: string;
}

export interface AccountsPage {
  items: FinancialAccount[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  totalValor: number;
  totalSaldo: number;
}

export interface MonthlyFlow {
  period: string; // YYYY-MM
  entradaTotal: number;
  entradaPaga: number;
  saidaTotal: number;
  saidaPaga: number;
  saldoPeriodo: number;
}

export interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
  count: number;
  saldo: number;
}

export interface PartyBalance {
  nome: string;
  count: number;
  saldo: number;
}

export interface WeeklyProjection {
  weekStart: string;
  weekEnd: string;
  label: string;
  entradas: number;
  saidas: number;
  saldo: number;
  acumulado: number;
}

export interface FlowSummary {
  totalReceberAberto: number;
  totalReceberAtrasado: number;
  totalReceberPago: number;
  totalPagarAberto: number;
  totalPagarAtrasado: number;
  totalPagarPago: number;
  posicaoLiquida: number;
  riscoLiquido: number;
  receberVencendo7d: number;
  receberVencendo30d: number;
  pagarVencendo7d: number;
  pagarVencendo30d: number;
  qtdReceberAberto: number;
  qtdReceberAtrasado: number;
  qtdPagarAberto: number;
  qtdPagarAtrasado: number;
  recebidoMesAtual: number;
  pagoMesAtual: number;
  agingReceber: AgingBucket[];
  agingPagar: AgingBucket[];
  topClientes: PartyBalance[];
  topFornecedores: PartyBalance[];
  weeklyProjection: WeeklyProjection[];
  flow: MonthlyFlow[];
}

// === PROC / PROCESSOS ANVISA TYPES ===
export interface ProcItem {
  id: string;
  codigoProduto: string | null;
  descricao: string;
  proc: string | null;
  status: 'ATIVO' | 'EM_BRANCO' | 'CANCELADO' | 'VENCIDO' | string;
  observacoes: string | null;
  categoriaFamilia: string | null;
  processoInstrucoes: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ProcSummaryMetrics {
  total: number;
  ativos: number;
  emBranco: number;
  familias: number;
}

export interface ProcMapResponse {
  byCode: Record<string, ProcItem>;
  byDescription: Record<string, ProcItem>;
  list: ProcItem[];
}

export interface ListProcsResponse {
  items: ProcItem[];
  total: number;
  metrics: ProcSummaryMetrics;
}

export interface ProcStep {
  ordem: number;
  titulo: string;
  descricao: string;
  temperatura?: string | null;
  agitacao?: string | null;
  tempo?: string | null;
}

export interface ProcGenerateResponse {
  descricao: string;
  codigoProduto?: string | null;
  categoriaFamilia: string;
  categoriaLabel: string;
  sugeridoProcBase?: string | null;
  similaresReferencia: ProcItem[];
  phFaixaSugerida: string;
  viscosidadeFaixaSugerida: string;
  densidadeFaixaSugerida: string;
  aspectoSugerido: string;
  corSugerida: string;
  odorSugerido: string;
  equipamentosRecomendados: string[];
  episRecomendados: string[];
  etapas: ProcStep[];
  processoTextoFormatado: string;
}


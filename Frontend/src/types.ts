// === COMMON TYPES ===
export interface Feedback {
  id: string;
  feedbackType: string;
  description: string;
  page: string;
  logs: string;
  screenshot: string;
  status: string;
  createdAt: string;
  resolvedAt?: string;
}

// === COMPRAS TYPES ===
export interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  email: string;
  notes: string;
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

export interface DemandResult {
  itemCode: string;
  description: string;
  unit: string;
  categoryId: string | null;
  categoryName: string;
  currentStock: number;
  reservedQty: number;
  inProduction: number;
  inOrders: number;
  avg2024: number;
  avg2025: number;
  avg2026: number;
  overallAvg: number;
  futureStockForecast: number;
  estimatedDurationDays: number;
  recommendedQty: number;
  urgency: 'critical' | 'warning' | 'ok';
  notes: string | null;
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
  supplierName?: string;
  unitPrice: number;
  deliveryDays: number;
  minQty: number;
  paymentTerms: string;
  notes: string;
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

export interface ComprasAppConfig {
  targetDays: number;
  itemOverrides: Record<string, number>;
}

// === MICROBIOLOGIA TYPES ===
export interface Product {
  id?: string;
  code: string;
  name: string;
  packaging: string;
  validity: string;
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
}

export interface FiscoQuimicaAgent {
  id: string;
  name: string;
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
  correctiveAgentId?: string | null;
  initialViscosity?: number | null;
  trialAgentQty?: number | null;
  trialViscosity?: number | null;
  agentQtyPerLiter?: number | null;
  batchSize?: number | null;
  totalAgentRequired?: number | null;
  notes?: string | null;
  createdAt?: string;
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

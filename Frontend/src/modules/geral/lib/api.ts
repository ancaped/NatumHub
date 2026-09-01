import { invoke } from '@tauri-apps/api/core';
import { hubJson, ApiError, apiJson } from './http';
import type {
  Category, Supplier, Item, Invoice,
  DemandResult, Quotation, QuotationItem, QuotationPrice,
  ImportResult, StockImport, PricePoint, SupplierSpend, CategorySpend,
  ComprasAppConfig, MicrobioAppConfig, FiscoAppConfig, Feedback, Product, Report, OnlineOrder, OnlineStore,
  FiscoQuimicaPattern, FiscoQuimicaAgent, FiscoQuimicaAnalysis, LoteLookup,
  FiscoErpLoteItem, FiscoErpLoteInsumo,
  CustomPurchaseConfigRow,
  PurchaseRequestBatch, PurchaseRequestBatchDetail, CreatePurchaseRequestBatchInput, ActiveRequestedItemSummary
} from './types';
import type { FeedbackSubmitInput, FeedbackAdminUpdate, FeedbackNote, FeedbackDetail } from './types';

function qs(params: Record<string, string | number | undefined | null>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

function modeToQuery(mode?: string) {
  if (mode === 'embalagens') return 'embalagens';
  if (mode === 'materia_prima') return 'materia_prima';
  if (mode === 'coloracao') return 'coloracao';
  if (mode === 'apoio') return 'apoio';
  return undefined;
}

export const api = {
  // === COMPRAS: IMPORTAÇÃO ===
  importStock(rows: any[], filename: string): Promise<ImportResult> {
    return hubJson('compras/imports/stock', { method: 'POST', body: JSON.stringify({ rows, filename }) });
  },
  importConsumption(rows: any[], year: number, filename: string): Promise<ImportResult> {
    return hubJson('compras/imports/consumption', { method: 'POST', body: JSON.stringify({ rows, year, filename }) });
  },
  importInvoices(rows: any[], filename: string): Promise<ImportResult> {
    return hubJson('compras/imports/invoices', { method: 'POST', body: JSON.stringify({ rows, filename }) });
  },
  getImportHistory(): Promise<StockImport[]> {
    return hubJson('compras/imports/history');
  },
  getNfImportControl(): Promise<{ lastPeriodEnd: string } | null> {
    return hubJson('compras/imports/nf-control');
  },

  // === COMPRAS: ITENS ===
  getItems(categoryId?: string): Promise<Item[]> {
    return hubJson(`compras/items${qs({ categoryId })}`);
  },
  updateItemDetails(code: string, notes: string | null, isIgnored: boolean): Promise<void> {
    return hubJson('compras/items/details', { method: 'POST', body: JSON.stringify({ code, notes, isIgnored }) });
  },
  getSimilarItems(code: string): Promise<Item[]> {
    return hubJson(`compras/items/similar${qs({ code })}`);
  },
  addSimilarItem(codeA: string, codeB: string): Promise<void> {
    return hubJson('compras/items/similar', { method: 'POST', body: JSON.stringify({ codeA, codeB }) });
  },
  removeSimilarItem(codeA: string, codeB: string): Promise<void> {
    return hubJson(`compras/items/similar${qs({ codeA, codeB })}`, { method: 'DELETE' });
  },
  updateItemsCategory(codes: string[], categoryId: string | null): Promise<void> {
    return hubJson('compras/items/category', { method: 'POST', body: JSON.stringify({ codes, categoryId }) });
  },
  importItemObservations(observations: { code: string; notes: string }[]): Promise<void> {
    return hubJson('compras/items/observations', { method: 'POST', body: JSON.stringify({ observations }) });
  },

  // === COMPRAS: DEMANDAS ===
  getDemands(categoryId?: string, targetDays?: number): Promise<DemandResult[]> {
    return hubJson(`compras/demands${qs({ categoryId, targetDays: targetDays || 90 })}`);
  },
  getCustomPurchaseConfigs(): Promise<CustomPurchaseConfigRow[]> {
    return hubJson('compras/custom-configs');
  },
  saveCustomPurchaseConfig(row: CustomPurchaseConfigRow): Promise<void> {
    return hubJson('compras/custom-configs', { method: 'POST', body: JSON.stringify({ row }) });
  },
  deleteCustomPurchaseConfig(level: string, targetId: string): Promise<void> {
    return hubJson(`compras/custom-configs${qs({ level, targetId })}`, { method: 'DELETE' });
  },

  // === COMPRAS: LOTES DE SOLICITAÇÃO & LISTAS ===
  getPurchaseLists(params?: { modulo?: string; status?: string; search?: string }): Promise<PurchaseRequestBatch[]> {
    return hubJson(`compras/listas${qs({ modulo: params?.modulo, status: params?.status, search: params?.search })}`);
  },
  getPurchaseListDetail(id: string): Promise<PurchaseRequestBatchDetail> {
    return hubJson(`compras/listas/${encodeURIComponent(id)}`);
  },
  createPurchaseList(payload: CreatePurchaseRequestBatchInput): Promise<PurchaseRequestBatchDetail> {
    return hubJson('compras/listas', { method: 'POST', body: JSON.stringify(payload) });
  },
  updatePurchaseList(id: string, payload: { status?: string; observacoes?: string }): Promise<void> {
    return hubJson(`compras/listas/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },
  deletePurchaseList(id: string): Promise<void> {
    return hubJson(`compras/listas/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  getActiveRequestedItems(): Promise<ActiveRequestedItemSummary[]> {
    return hubJson('compras/itens-solicitados');
  },


  // === COMPRAS: COTAÇÕES ===
  createQuotation(title: string, itemCodes: string[], recommendedQtys: number[]): Promise<string> {
    return hubJson('compras/quotations', { method: 'POST', body: JSON.stringify({ title, itemCodes, recommendedQtys }) });
  },
  getQuotations(status?: string): Promise<Quotation[]> {
    return hubJson(`compras/quotations${qs({ status })}`);
  },
  getQuotationDetail(id: string): Promise<{ quotation: Quotation; items: QuotationItem[] }> {
    return hubJson(`compras/quotations/${encodeURIComponent(id)}`);
  },
  updateQuotationStatus(id: string, status: string, notes?: string): Promise<void> {
    return hubJson(`compras/quotations/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, notes: notes || null }),
    });
  },
  addQuotationPrice(price: Omit<QuotationPrice, 'id' | 'supplierName' | 'isSelected'>): Promise<void> {
    return hubJson('compras/quotations/prices', { method: 'POST', body: JSON.stringify({ price }) });
  },
  selectSupplier(quotationItemId: string, priceId: string): Promise<void> {
    return hubJson('compras/quotations/select-supplier', {
      method: 'POST',
      body: JSON.stringify({ quotationItemId, priceId }),
    });
  },
  deleteQuotation(id: string): Promise<void> {
    return hubJson(`compras/quotations/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  updateQuotationItemQty(id: string, field: 'approved' | 'final', qty: number): Promise<void> {
    return hubJson(`compras/quotations/${encodeURIComponent(id)}/qty`, {
      method: 'POST',
      body: JSON.stringify({ field, qty }),
    });
  },

  // === COMPRAS: FORNECEDORES ===
  getSuppliers(mode?: string): Promise<Supplier[]> {
    return hubJson(`compras/suppliers${qs({ mode: modeToQuery(mode) })}`);
  },
  saveSupplier(supplier: Supplier): Promise<void> {
    return hubJson('compras/suppliers', { method: 'POST', body: JSON.stringify(supplier) });
  },
  unifySuppliers(parentId: string, childIds: string[]): Promise<void> {
    return hubJson('compras/suppliers/unify', { method: 'POST', body: JSON.stringify({ parentId, childIds }) });
  },
  unlinkSupplier(supplierId: string): Promise<void> {
    return hubJson('compras/suppliers/unlink', { method: 'POST', body: JSON.stringify({ supplierId }) });
  },
  getSupplierHistory(id: string): Promise<{ invoices: Invoice[]; pricePoints: PricePoint[] }> {
    return hubJson(`compras/suppliers/${encodeURIComponent(id)}/history`);
  },

  // === COMPRAS: RELATÓRIOS ===
  getPriceEvolution(itemCode: string): Promise<PricePoint[]> {
    return hubJson(`compras/price-evolution${qs({ itemCode })}`);
  },
  getSpendingBySupplier(start: string, end: string, mode?: string): Promise<SupplierSpend[]> {
    return hubJson(`compras/spending/supplier${qs({ start, end, mode: modeToQuery(mode) })}`);
  },
  getSpendingByCategory(start: string, end: string, mode?: string): Promise<CategorySpend[]> {
    return hubJson(`compras/spending/category${qs({ start, end, mode: modeToQuery(mode) })}`);
  },

  // === COMPRAS: CATEGORIAS ===
  getCategories(): Promise<Category[]> {
    return hubJson('compras/categories');
  },
  saveCategory(category: Category): Promise<void> {
    return hubJson('compras/categories', { method: 'POST', body: JSON.stringify(category) });
  },
  deleteCategory(id: string): Promise<void> {
    return hubJson(`compras/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  getPinnedSubcategories(): Promise<string[]> {
    return hubJson('compras/pinned-subcategories');
  },
  savePinnedSubcategories(ids: string[]): Promise<void> {
    return hubJson('compras/pinned-subcategories', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  // === COMPRAS: CONFIG ===
  getComprasConfig(key?: string): Promise<ComprasAppConfig | null> {
    return hubJson(`compras/config${qs({ key })}`);
  },
  saveComprasConfig(config: ComprasAppConfig, key?: string): Promise<void> {
    return hubJson(`compras/config${qs({ key })}`, { method: 'POST', body: JSON.stringify({ config, key }) });
  },

  // === MICROBIOLOGIA ===
  getProducts(): Promise<Product[]> {
    return hubJson('microbio/products');
  },
  saveProduct(product: Product): Promise<void> {
    return hubJson('microbio/products', { method: 'POST', body: JSON.stringify(product) });
  },
  deleteProduct(code: string): Promise<void> {
    return hubJson(`microbio/products/${encodeURIComponent(code)}`, { method: 'DELETE' });
  },
  deleteAllProducts(): Promise<void> {
    return hubJson('microbio/products', { method: 'DELETE' });
  },
  getReports(): Promise<Report[]> {
    return hubJson('microbio/reports');
  },
  saveReports(reports: Report | Report[]): Promise<void> {
    const list = Array.isArray(reports) ? reports : [reports];
    return hubJson('microbio/reports', { method: 'POST', body: JSON.stringify({ reports: list }) });
  },
  markReportsPrinted(ids: string[], printed: boolean = true): Promise<void> {
    return hubJson('microbio/reports/printed', {
      method: 'POST',
      body: JSON.stringify({ ids, printed }),
    });
  },
  deleteReport(id: string): Promise<void> {
    return hubJson(`microbio/reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  getMicrobioConfig(): Promise<MicrobioAppConfig | null> {
    return hubJson('microbio/config');
  },
  saveMicrobioConfig(config: MicrobioAppConfig): Promise<void> {
    return hubJson('microbio/config', { method: 'POST', body: JSON.stringify(config) });
  },

  // === ADMIN (PostgreSQL via REST) ===
  resetOperationalData(): Promise<{ status: string; message: string }> {
    return hubJson('admin/db-reset', { method: 'POST' });
  },

  // === FEEDBACKS ===
  submitFeedback(input: FeedbackSubmitInput): Promise<void> {
    return hubJson('feedbacks', { method: 'POST', body: JSON.stringify(input) });
  },
  getFeedbacksManage(): Promise<Feedback[]> {
    return hubJson('feedbacks/manage');
  },
  getFeedbackDetail(id: string): Promise<FeedbackDetail> {
    return hubJson(`feedbacks/${encodeURIComponent(id)}`);
  },
  addFeedbackNote(id: string, body: string): Promise<FeedbackNote> {
    return hubJson(`feedbacks/${encodeURIComponent(id)}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  },
  updateFeedback(id: string, update: FeedbackAdminUpdate): Promise<void> {
    return hubJson(`feedbacks/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(update) });
  },
  reorderFeedbacks(items: { id: string; priority: number }[]): Promise<void> {
    return hubJson('feedbacks/reorder', { method: 'POST', body: JSON.stringify({ items }) });
  },

  // === COMPRAS ONLINE ===
  getOnlineOrders(): Promise<OnlineOrder[]> {
    return hubJson('compras/online-orders');
  },
  saveOnlineOrder(order: OnlineOrder): Promise<void> {
    return hubJson('compras/online-orders', { method: 'POST', body: JSON.stringify(order) });
  },
  deleteOnlineOrder(id: string): Promise<void> {
    return hubJson(`compras/online-orders/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  uploadOrderReceipt(id: string, filename: string, data: number[]): Promise<string> {
    return invoke('upload_order_receipt', { id, filename, data });
  },
  openReceiptFile(path: string): Promise<void> {
    return invoke('open_receipt_file', { path });
  },
  getOnlineStores(): Promise<OnlineStore[]> {
    return hubJson('compras/online-stores');
  },
  saveOnlineStore(store: OnlineStore): Promise<void> {
    return hubJson('compras/online-stores', { method: 'POST', body: JSON.stringify(store) });
  },
  deleteOnlineStore(id: string): Promise<void> {
    return hubJson(`compras/online-stores/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // === FÍSICO-QUÍMICA ===
  getFiscoConfig(): Promise<FiscoAppConfig | null> {
    return hubJson('fisco/config');
  },
  saveFiscoConfig(config: FiscoAppConfig): Promise<void> {
    return hubJson('fisco/config', { method: 'POST', body: JSON.stringify(config) });
  },
  getFiscoQuimicaPatterns(): Promise<FiscoQuimicaPattern[]> {
    return hubJson('fisco/patterns');
  },
  saveFiscoQuimicaPattern(pattern: FiscoQuimicaPattern): Promise<void> {
    return hubJson('fisco/patterns', { method: 'POST', body: JSON.stringify(pattern) });
  },
  deleteFiscoQuimicaPattern(code: string): Promise<void> {
    return hubJson(`fisco/patterns/${encodeURIComponent(code)}`, { method: 'DELETE' });
  },
  getFiscoQuimicaAgents(): Promise<FiscoQuimicaAgent[]> {
    return hubJson('fisco/agents');
  },
  saveFiscoQuimicaAgent(agent: FiscoQuimicaAgent): Promise<void> {
    return hubJson('fisco/agents', { method: 'POST', body: JSON.stringify(agent) });
  },
  deleteFiscoQuimicaAgent(id: string): Promise<void> {
    return hubJson(`fisco/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  getFiscoQuimicaAnalyses(): Promise<FiscoQuimicaAnalysis[]> {
    return hubJson('fisco/analyses');
  },
  saveFiscoQuimicaAnalysis(analysis: FiscoQuimicaAnalysis): Promise<void> {
    return hubJson('fisco/analyses', { method: 'POST', body: JSON.stringify(analysis) });
  },
  deleteFiscoQuimicaAnalysis(id: string): Promise<void> {
    return hubJson(`fisco/analyses/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  getFiscoErpLotes(params?: {
    search?: string;
    status_laudo?: string;
    status_erp?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: FiscoErpLoteItem[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
    stats: {
      total_lotes: number;
      com_laudo: number;
      sem_laudo: number;
      total_kg: number;
    };
  }> {
    return hubJson(`fisco/erp-lotes${qs(params || {})}`);
  },
  getFiscoErpLoteInsumos(lote: string): Promise<FiscoErpLoteInsumo[]> {
    return hubJson(`fisco/erp-lotes/${encodeURIComponent(lote)}/insumos`);
  },
  pushFiscoLaudosToErp(analysisIds?: string[], allPending?: boolean): Promise<{ success: boolean; updated_count: number; errors?: string[] }> {
    return hubJson('fisco/push-to-erp', {
      method: 'POST',
      body: JSON.stringify({ analysis_ids: analysisIds, all_pending: allPending }),
    });
  },
  getFiscoCorrectiveBatches(): Promise<import('./types').CorrectiveWeekSummary[]> {
    return hubJson('fisco/corrective-batches');
  },
  toggleFiscoCorrectiveBaixa(data: { week_key: string; is_baixa: boolean; usuario?: string; observacoes?: string }): Promise<void> {
    return hubJson('fisco/corrective-batches/toggle-baixa', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  migrateErpHistoricalAnalyses(): Promise<{ success: boolean; migrated_count: number }> {
    return hubJson('fisco/migrate-erp-history', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async getLoteByNumber(loteNumber: string): Promise<LoteLookup | null> {
    const trimmed = loteNumber.trim();
    if (trimmed.length < 1) return null;
    try {
      return await apiJson<LoteLookup>(`/producao/lotes/${encodeURIComponent(trimmed)}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  },

  createFeedback(data: { type: string; description: string; page: string; logs?: string; screenshot?: string }): Promise<void> {
    return apiJson('/api/hub/feedbacks', {
      method: 'POST',
      body: JSON.stringify({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        feedbackType: data.type,
        description: data.description,
        page: data.page,
        logs: data.logs || '',
        screenshot: data.screenshot || '',
      }),
    });
  },

  // === PRODUÇÃO: PROCS (Processos ANVISA / Fabricação) ===
  getProcs(params?: { search?: string; status?: string; categoria?: string; limit?: number; offset?: number }): Promise<import('./types').ListProcsResponse> {
    return apiJson('/api/producao/proc' + qs(params || {}));
  },
  getProcSummary(): Promise<import('./types').ProcSummaryMetrics> {
    return apiJson('/api/producao/proc/summary');
  },
  getProcMap(): Promise<import('./types').ProcMapResponse> {
    return apiJson('/api/producao/proc/map');
  },
  getProcById(id: string): Promise<import('./types').ProcItem> {
    return apiJson(`/api/producao/proc/${encodeURIComponent(id)}`);
  },
  createProc(payload: Partial<import('./types').ProcItem>): Promise<import('./types').ProcItem> {
    return apiJson('/api/producao/proc', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateProc(id: string, payload: Partial<import('./types').ProcItem>): Promise<import('./types').ProcItem> {
    return apiJson(`/api/producao/proc/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  deleteProc(id: string): Promise<{ success: boolean; message: string }> {
    return apiJson(`/api/producao/proc/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  generateProc(payload: { descricao: string; codigoProduto?: string; categoriaFamilia?: string }): Promise<import('./types').ProcGenerateResponse> {
    return apiJson('/api/producao/proc/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  refreshItemStockLive(code: string): Promise<{ status: string; code: string; stockQty: number; reservedQty: number; inProduction: number; inOrders: number }> {
    return apiJson(`/admin/audit/stock/${encodeURIComponent(code)}/refresh`, {
      method: 'POST',
    });
  },
};


import {
  getAuthUser,
  loginOperator,
  logoutOperator,
  validateSession,
  type AuthUser,
} from './auth';

export const localAuth = {
  getUser(): AuthUser | null {
    return getAuthUser();
  },
  async signIn(displayName: string): Promise<AuthUser> {
    const result = await loginOperator(displayName);
    return result.user;
  },
  async signOut(): Promise<void> {
    await logoutOperator();
    window.location.reload();
  },
  async refresh(): Promise<AuthUser | null> {
    return validateSession();
  },
};

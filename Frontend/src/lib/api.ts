import { invoke } from '@tauri-apps/api/core';
import type { 
  Category, Supplier, Item, StockSnapshot, Consumption, Invoice, 
  DemandResult, Quotation, QuotationItem, QuotationPrice, 
  ImportResult, StockImport, PricePoint, SupplierSpend, CategorySpend, 
  ComprasAppConfig, MicrobioAppConfig, Feedback, Product, Report, OnlineOrder, OnlineStore,
  FiscoQuimicaPattern, FiscoQuimicaAgent, FiscoQuimicaAnalysis, ProductionLote
} from '../types';

export const api = {
  // === COMPRAS: IMPORTAÇÃO ===
  importStock(rows: any[], filename: string): Promise<ImportResult> {
    return invoke('import_stock', { rows, filename });
  },
  importConsumption(rows: any[], year: number, filename: string): Promise<ImportResult> {
    return invoke('import_consumption', { rows, year, filename });
  },
  importInvoices(rows: any[], filename: string): Promise<ImportResult> {
    return invoke('import_invoices', { rows, filename });
  },
  getImportHistory(): Promise<StockImport[]> {
    return invoke('get_import_history');
  },
  getNfImportControl(): Promise<{ lastPeriodEnd: string } | null> {
    return invoke('get_nf_import_control');
  },

  // === COMPRAS: ITENS ===
  getItems(categoryId?: string): Promise<Item[]> {
    return invoke('get_items', { categoryId: categoryId || null });
  },
  updateItemDetails(code: string, notes: string | null, isIgnored: boolean): Promise<void> {
    return invoke('update_item_details', { code, notes, isIgnored });
  },
  getSimilarItems(code: string): Promise<Item[]> {
    return invoke('get_similar_items', { code });
  },
  addSimilarItem(codeA: string, codeB: string): Promise<void> {
    return invoke('add_similar_item', { codeA, codeB });
  },
  removeSimilarItem(codeA: string, codeB: string): Promise<void> {
    return invoke('remove_similar_item', { codeA, codeB });
  },
  updateItemsCategory(codes: string[], categoryId: string | null): Promise<void> {
    return invoke('update_items_category', { codes, categoryId: categoryId || null });
  },
  importItemObservations(observations: { code: string; notes: string }[]): Promise<void> {
    return invoke('import_item_observations', { observations });
  },

  // === COMPRAS: DEMANDAS ===
  getDemands(categoryId?: string, targetDays?: number): Promise<DemandResult[]> {
    return invoke('get_demands', { categoryId: categoryId || null, targetDays: targetDays || 90 });
  },

  // === COMPRAS: COTAÇÕES ===
  createQuotation(title: string, itemCodes: string[], recommendedQtys: number[]): Promise<string> {
    return invoke('create_quotation', { title, itemCodes, recommendedQtys });
  },
  getQuotations(status?: string): Promise<Quotation[]> {
    return invoke('get_quotations', { status: status || null });
  },
  getQuotationDetail(id: string): Promise<{ quotation: Quotation; items: QuotationItem[] }> {
    return invoke('get_quotation_detail', { id });
  },
  updateQuotationStatus(id: string, status: string, notes?: string): Promise<void> {
    return invoke('update_quotation_status', { id, status, notes: notes || null });
  },
  addQuotationPrice(price: Omit<QuotationPrice, 'id' | 'supplierName' | 'isSelected'>): Promise<void> {
    return invoke('add_quotation_price', { price });
  },
  selectSupplier(quotationItemId: string, priceId: string): Promise<void> {
    return invoke('select_supplier', { quotationItemId, priceId });
  },
  deleteQuotation(id: string): Promise<void> {
    return invoke('delete_quotation', { id });
  },
  updateQuotationItemQty(id: string, field: 'approved' | 'final', qty: number): Promise<void> {
    return invoke('update_quotation_item_qty', { id, field, qty });
  },

  // === COMPRAS: FORNECEDORES ===
  getSuppliers(mode?: string): Promise<Supplier[]> {
    let parentCategoryId: string | null = null;
    if (mode === 'embalagens') parentCategoryId = 'cat_emb';
    else if (mode === 'materia_prima') parentCategoryId = 'cat_mp';
    else if (mode === 'coloracao') parentCategoryId = 'coloracao';
    else if (mode === 'apoio') parentCategoryId = 'apoio';
    return invoke('get_suppliers', { parentCategoryId });
  },
  saveSupplier(supplier: Supplier): Promise<void> {
    return invoke('save_supplier', { supplier });
  },
  getSupplierHistory(id: string): Promise<{ invoices: Invoice[]; pricePoints: PricePoint[] }> {
    return invoke('get_supplier_history', { id });
  },

  // === COMPRAS: RELATÓRIOS ===
  getPriceEvolution(itemCode: string): Promise<PricePoint[]> {
    return invoke('get_price_evolution', { itemCode });
  },
  getSpendingBySupplier(start: string, end: string, mode?: string): Promise<SupplierSpend[]> {
    let parentCategoryId: string | null = null;
    if (mode === 'embalagens') parentCategoryId = 'cat_emb';
    else if (mode === 'materia_prima') parentCategoryId = 'cat_mp';
    else if (mode === 'coloracao') parentCategoryId = 'coloracao';
    else if (mode === 'apoio') parentCategoryId = 'apoio';
    return invoke('get_spending_by_supplier', { start, end, parentCategoryId });
  },
  getSpendingByCategory(start: string, end: string, mode?: string): Promise<CategorySpend[]> {
    let parentCategoryId: string | null = null;
    if (mode === 'embalagens') parentCategoryId = 'cat_emb';
    else if (mode === 'materia_prima') parentCategoryId = 'cat_mp';
    else if (mode === 'coloracao') parentCategoryId = 'coloracao';
    else if (mode === 'apoio') parentCategoryId = 'apoio';
    return invoke('get_spending_by_category', { start, end, parentCategoryId });
  },

  // === COMPRAS: CATEGORIAS ===
  getCategories(): Promise<Category[]> {
    return invoke('get_categories');
  },
  saveCategory(category: Category): Promise<void> {
    return invoke('save_category', { category });
  },
  deleteCategory(id: string): Promise<void> {
    return invoke('delete_category', { id });
  },

  // === COMPRAS: CONFIG ===
  getComprasConfig(key?: string): Promise<ComprasAppConfig | null> {
    return invoke('get_compras_config', { key });
  },
  saveComprasConfig(config: ComprasAppConfig, key?: string): Promise<void> {
    return invoke('save_compras_config', { config, key });
  },

  // === MICROBIOLOGIA: PRODUTOS ===
  getProducts(): Promise<Product[]> {
    return invoke<Product[]>('get_products');
  },
  saveProduct(product: Product): Promise<void> {
    return invoke('save_product', { product });
  },
  deleteProduct(code: string): Promise<void> {
    return invoke('delete_product', { code });
  },
  deleteAllProducts(): Promise<void> {
    return invoke('delete_all_products');
  },

  // === MICROBIOLOGIA: LAUDOS ===
  getReports(): Promise<Report[]> {
    return invoke<Report[]>('get_reports');
  },
  saveReports(reports: Report | Report[]): Promise<void> {
    const list = Array.isArray(reports) ? reports : [reports];
    return invoke('save_reports', { reports: list });
  },
  deleteReport(id: string): Promise<void> {
    return invoke('delete_report', { id });
  },

  // === MICROBIOLOGIA: CONFIG ===
  getMicrobioConfig(): Promise<MicrobioAppConfig | null> {
    return invoke<MicrobioAppConfig | null>('get_microbio_config');
  },
  saveMicrobioConfig(config: MicrobioAppConfig): Promise<void> {
    return invoke('save_config_microbio', { config });
  },

  // === COMMON: BACKUP ===
  getBackup(): Promise<number[]> {
    return invoke('get_backup');
  },
  restoreBackup(data: number[]): Promise<void> {
    return invoke('restore_backup', { data });
  },
  getCompressedBackup(): Promise<number[]> {
    return invoke('get_compressed_backup');
  },

  getHubToken(): Promise<string> {
    return invoke('get_hub_token');
  },
  restoreCompressedBackup(data: number[]): Promise<void> {
    return invoke('restore_compressed_backup', { data });
  },

  // === COMMON: FEEDBACK ===
  getFeedbacks(): Promise<Feedback[]> {
    return invoke('get_feedbacks');
  },
  saveFeedback(feedback: Feedback): Promise<void> {
    return invoke('save_feedback', { feedback });
  },
  resolveFeedback(id: string): Promise<void> {
    return invoke('resolve_feedback', { id });
  },
  resetDb(): Promise<void> {
    return invoke('reset_db');
  },

  // === COMPRAS: COMPRAS ONLINE ===
  getOnlineOrders(): Promise<OnlineOrder[]> {
    return invoke('get_online_orders');
  },
  saveOnlineOrder(order: OnlineOrder): Promise<void> {
    return invoke('save_online_order', { order });
  },
  deleteOnlineOrder(id: string): Promise<void> {
    return invoke('delete_online_order', { id });
  },
  uploadOrderReceipt(id: string, filename: string, data: number[]): Promise<string> {
    return invoke('upload_order_receipt', { id, filename, data });
  },
  openReceiptFile(path: string): Promise<void> {
    return invoke('open_receipt_file', { path });
  },
  getOnlineStores(): Promise<OnlineStore[]> {
    return invoke('get_online_stores');
  },
  saveOnlineStore(store: OnlineStore): Promise<void> {
    return invoke('save_online_store', { store });
  },
  deleteOnlineStore(id: string): Promise<void> {
    return invoke('delete_online_store', { id });
  },

  // === PRODUÇÃO: ANÁLISE FÍSICO-QUÍMICA ===
  getFiscoQuimicaPatterns(): Promise<FiscoQuimicaPattern[]> {
    return invoke('get_fisco_quimica_patterns');
  },
  saveFiscoQuimicaPattern(pattern: FiscoQuimicaPattern): Promise<void> {
    return invoke('save_fisco_quimica_pattern', { pattern });
  },
  deleteFiscoQuimicaPattern(code: string): Promise<void> {
    return invoke('delete_fisco_quimica_pattern', { code });
  },
  getFiscoQuimicaAgents(): Promise<FiscoQuimicaAgent[]> {
    return invoke('get_fisco_quimica_agents');
  },
  saveFiscoQuimicaAgent(agent: FiscoQuimicaAgent): Promise<void> {
    return invoke('save_fisco_quimica_agent', { agent });
  },
  deleteFiscoQuimicaAgent(id: string): Promise<void> {
    return invoke('delete_fisco_quimica_agent', { id });
  },
  getFiscoQuimicaAnalyses(): Promise<FiscoQuimicaAnalysis[]> {
    return invoke('get_fisco_quimica_analyses');
  },
  saveFiscoQuimicaAnalysis(analysis: FiscoQuimicaAnalysis): Promise<void> {
    return invoke('save_fisco_quimica_analysis', { analysis });
  },
  deleteFiscoQuimicaAnalysis(id: string): Promise<void> {
    return invoke('delete_fisco_quimica_analysis', { id });
  },

  // === GENERIC LOTE FETCHING ===
  getLoteByNumber(loteNumber: string): Promise<ProductionLote | null> {
    return invoke<ProductionLote | null>('get_lote_by_number', { loteNumber });
  }
  };


// Simple local auth
export const localAuth = {
  getUser() {
    const user = localStorage.getItem('localUser');
    return user ? JSON.parse(user) : null;
  },
  signIn(displayName: string) {
    const user = { displayName, photoURL: 'https://ui-avatars.com/api/?name=' + displayName };
    localStorage.setItem('localUser', JSON.stringify(user));
    window.location.reload();
  },
  signOut() {
    localStorage.removeItem('localUser');
    window.location.reload();
  }
};

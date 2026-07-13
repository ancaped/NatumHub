# Schema & Backend — App Compras

## 1. Schema SQLite Completo

```sql
-- ═══════════════════════════════════════════════════════════
-- CATEGORIAS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE categories (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    parent_id   TEXT,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories(id)
);

-- Seed inicial
INSERT INTO categories (id, name, parent_id) VALUES ('cat_mp', 'Matéria Prima', NULL);
INSERT INTO categories (id, name, parent_id) VALUES ('cat_emb', 'Embalagem', NULL);

-- ═══════════════════════════════════════════════════════════
-- FORNECEDORES
-- ═══════════════════════════════════════════════════════════
CREATE TABLE suppliers (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    contact     TEXT,
    email       TEXT,
    notes       TEXT,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════
-- ITENS (DADOS MESTRES DO ERP)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE items (
    code        TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    unit        TEXT NOT NULL,
    category_id TEXT,
    line        TEXT,
    type        TEXT,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- ═══════════════════════════════════════════════════════════
-- IMPORTAÇÕES
-- ═══════════════════════════════════════════════════════════
CREATE TABLE stock_imports (
    id          TEXT PRIMARY KEY,
    filename    TEXT,
    source      TEXT DEFAULT 'ERP',
    imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
    item_count  INTEGER DEFAULT 0
);

CREATE TABLE stock_snapshots (
    id              TEXT PRIMARY KEY,
    import_id       TEXT NOT NULL,
    item_code       TEXT NOT NULL,
    stock_qty       REAL DEFAULT 0,
    reserved_qty    REAL DEFAULT 0,
    in_production   REAL DEFAULT 0,
    in_orders       REAL DEFAULT 0,
    snapshot_date   TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (import_id) REFERENCES stock_imports(id),
    FOREIGN KEY (item_code) REFERENCES items(code)
);

-- ═══════════════════════════════════════════════════════════
-- CONSUMO HISTÓRICO
-- ═══════════════════════════════════════════════════════════
CREATE TABLE consumption (
    id              TEXT PRIMARY KEY,
    item_code       TEXT NOT NULL,
    year            INTEGER NOT NULL,
    total_qty       REAL DEFAULT 0,
    monthly_avg     REAL DEFAULT 0,
    imported_at     TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_code) REFERENCES items(code),
    UNIQUE(item_code, year)
);

-- ═══════════════════════════════════════════════════════════
-- NOTAS FISCAIS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE invoices (
    id              TEXT PRIMARY KEY,
    invoice_number  TEXT NOT NULL,
    item_code       TEXT NOT NULL,
    description     TEXT,
    unit            TEXT,
    quantity        REAL DEFAULT 0,
    unit_price      REAL DEFAULT 0,
    total_value     REAL DEFAULT 0,
    supplier_name   TEXT,
    supplier_id     TEXT,
    invoice_date    TEXT,
    imported_at     TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_code) REFERENCES items(code),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    UNIQUE(invoice_number, item_code)
);

CREATE TABLE nf_import_control (
    id              TEXT PRIMARY KEY,
    last_period_end TEXT NOT NULL,
    imported_at     TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════
-- COTAÇÕES
-- ═══════════════════════════════════════════════════════════
CREATE TABLE quotations (
    id                      TEXT PRIMARY KEY,
    title                   TEXT NOT NULL,
    status                  TEXT DEFAULT 'draft',
    target_days             INTEGER DEFAULT 90,
    notes                   TEXT,
    director_demand_notes   TEXT,
    director_final_notes    TEXT,
    created_at              TEXT DEFAULT CURRENT_TIMESTAMP,
    demand_approved_at      TEXT,
    final_approved_at       TEXT,
    ordered_at              TEXT
);

CREATE TABLE quotation_items (
    id              TEXT PRIMARY KEY,
    quotation_id    TEXT NOT NULL,
    item_code       TEXT NOT NULL,
    recommended_qty REAL DEFAULT 0,
    approved_qty    REAL,
    final_qty       REAL,
    notes           TEXT,
    FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
    FOREIGN KEY (item_code) REFERENCES items(code)
);

CREATE TABLE quotation_prices (
    id                  TEXT PRIMARY KEY,
    quotation_item_id   TEXT NOT NULL,
    supplier_id         TEXT NOT NULL,
    unit_price          REAL,
    delivery_days       INTEGER,
    min_qty             REAL,
    payment_terms       TEXT,
    notes               TEXT,
    is_selected         INTEGER DEFAULT 0,
    quoted_at           TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quotation_item_id) REFERENCES quotation_items(id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

-- ═══════════════════════════════════════════════════════════
-- CONFIG & FEEDBACK
-- ═══════════════════════════════════════════════════════════
CREATE TABLE config (
    key   TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE feedbacks (
    id          TEXT PRIMARY KEY,
    type        TEXT,
    description TEXT,
    page        TEXT,
    logs        TEXT,
    screenshot  TEXT,
    status      TEXT DEFAULT 'open',
    createdAt   TEXT DEFAULT CURRENT_TIMESTAMP,
    resolvedAt  TEXT
);

-- ═══════════════════════════════════════════════════════════
-- ÍNDICES
-- ═══════════════════════════════════════════════════════════
CREATE INDEX idx_stock_item ON stock_snapshots(item_code);
CREATE INDEX idx_consumption_item ON consumption(item_code);
CREATE INDEX idx_invoices_item ON invoices(item_code);
CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_supplier ON invoices(supplier_name);
CREATE INDEX idx_qi_quotation ON quotation_items(quotation_id);
CREATE INDEX idx_qp_item ON quotation_prices(quotation_item_id);
```

## 2. Fluxo de Status das Cotações

```
draft → pending_demand_approval → quoting → quoted → pending_final_approval → approved → ordered
                ↓ (rejeitado)                               ↓ (renegociar)
              draft                                       quoting
```

| Status | Significado | Ação Seguinte |
|--------|-------------|---------------|
| `draft` | Rascunho, itens sendo selecionados | Enviar para aprovação |
| `pending_demand_approval` | Aguardando OK do diretor sobre demanda | Diretor aprova + notas |
| `quoting` | Em cotação com fornecedores | Registrar preços |
| `quoted` | Todos os preços preenchidos | Enviar para aprovação final |
| `pending_final_approval` | Diretor analisa cotação | Diretor aprova + exigências |
| `approved` | Aprovado para compra | Marcar pedido feito |
| `ordered` | Pedido realizado | Fim do fluxo |

## 3. TypeScript Types

```typescript
// types.ts

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
  type: string;
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

export interface AppConfig {
  targetDays: number;
  itemOverrides: Record<string, number>; // itemCode -> custom targetDays
}

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
```

## 4. API Layer (lib/api.ts)

```typescript
import { invoke } from '@tauri-apps/api/core';
import type { * } from '../types';

export const api = {
  // === IMPORTAÇÃO ===
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

  // === ITENS ===
  getItems(categoryId?: string): Promise<Item[]> {
    return invoke('get_items', { categoryId: categoryId || null });
  },
  updateItemCategory(code: string, categoryId: string): Promise<void> {
    return invoke('update_item_category', { code, categoryId });
  },

  // === DEMANDAS ===
  getDemands(categoryId?: string, targetDays?: number): Promise<DemandResult[]> {
    return invoke('get_demands', { categoryId: categoryId || null, targetDays: targetDays || 90 });
  },

  // === COTAÇÕES ===
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

  // === FORNECEDORES ===
  getSuppliers(): Promise<Supplier[]> {
    return invoke('get_suppliers');
  },
  saveSupplier(supplier: Supplier): Promise<void> {
    return invoke('save_supplier', { supplier });
  },
  getSupplierHistory(id: string): Promise<{ invoices: Invoice[]; pricePoints: PricePoint[] }> {
    return invoke('get_supplier_history', { id });
  },

  // === RELATÓRIOS ===
  getPriceEvolution(itemCode: string): Promise<PricePoint[]> {
    return invoke('get_price_evolution', { itemCode });
  },
  getSpendingBySupplier(start: string, end: string): Promise<SupplierSpend[]> {
    return invoke('get_spending_by_supplier', { start, end });
  },
  getSpendingByCategory(start: string, end: string): Promise<CategorySpend[]> {
    return invoke('get_spending_by_category', { start, end });
  },

  // === CATEGORIAS ===
  getCategories(): Promise<Category[]> {
    return invoke('get_categories');
  },
  saveCategory(category: Category): Promise<void> {
    return invoke('save_category', { category });
  },
  deleteCategory(id: string): Promise<void> {
    return invoke('delete_category', { id });
  },

  // === CONFIG ===
  getConfig(): Promise<AppConfig | null> {
    return invoke('get_config');
  },
  saveConfig(config: AppConfig): Promise<void> {
    return invoke('save_config', { config });
  },

  // === BACKUP ===
  getBackup(): Promise<number[]> {
    return invoke('get_backup');
  },
  restoreBackup(data: number[]): Promise<void> {
    return invoke('restore_backup', { data });
  },

  // === FEEDBACK ===
  getFeedbacks(): Promise<Feedback[]> {
    return invoke('get_feedbacks');
  },
  saveFeedback(feedback: Feedback): Promise<void> {
    return invoke('save_feedback', { feedback });
  },
  resolveFeedback(id: string): Promise<void> {
    return invoke('resolve_feedback', { id });
  },
};
```

## 5. Ordem de Implementação

| Fase | O que | Prioridade |
|------|-------|------------|
| 1 | Scaffold: criar todas as pastas, configs, package.json, Cargo.toml, tauri.conf.json | 🔴 |
| 2 | lib.rs: Schema SQLite + create tables + comandos de feedback/config/backup | 🔴 |
| 3 | App.tsx com sidebar navegável + layout base + FeedbackWidget | 🔴 |
| 4 | ImportWizard: importação de CSV (estoque + consumo + NFs) com preview + validação | 🔴 |
| 5 | lib.rs: comandos de importação (import_stock, import_consumption, import_invoices) | 🔴 |
| 6 | DemandTable: tabela de demandas com cálculos, filtros, ordenação, seleção múltipla | 🔴 |
| 7 | lib.rs: get_demands (query SQL que faz os cálculos e retorna DemandResult[]) | 🔴 |
| 8 | QuotationManager + QuotationDetail: CRUD cotações, workflow de status | 🟡 |
| 9 | lib.rs: todos os comandos de cotação | 🟡 |
| 10 | QuotationReport: versão imprimível/PDF da cotação | 🟡 |
| 11 | SupplierManager: cadastro e histórico de fornecedores | 🟢 |
| 12 | ReportDashboard: evolução de preço, gastos por fornecedor/categoria | 🟢 |
| 13 | SettingsPanel: config de targetDays, categorias, backup | 🟢 |

## 6. Notas Críticas para a IA Implementadora

1. **NUNCA** alterar a paleta visual. Usar SOMENTE zinc-50 a zinc-900.
2. **Porta 5174** para dev server (5173 já é do AnaliseMicrobiologica).
3. **Separador CSV = `;`** (ponto-e-vírgula). Números em formato BR com `,` decimal.
4. **UUID** para todos os IDs: usar `crypto.randomUUID()` no frontend.
5. **Cálculos de demanda** podem ser feitos no Rust (SQL query) OU no TypeScript — preferencialmente no Rust via SQL JOIN para performance.
6. **A aba "nf"** da planilha está ORDENADA por quantidade total. No app, a tabela de NFs deve permitir ordenação por qualquer coluna.
7. **Duplicatas de NF**: usar `UNIQUE(invoice_number, item_code)` + `INSERT OR IGNORE` para prevenir.
8. **FeedbackWidget**: copiar integralmente de `AnaliseMicrobiologica/src/components/FeedbackWidget.tsx`.
9. **O campo `Quantidade Recomendada` na cotação é inicialmente calculado**, mas o usuário pode editar manualmente (campo `approved_qty`).
10. **Responsividade**: sidebar colapsável em telas menores. Tabelas com scroll horizontal.

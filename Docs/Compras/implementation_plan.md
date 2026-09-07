> [!WARNING]
> **HISTÓRICO / legado (pré-unificação)**  
> Este plano descreve o app desktop isolado `Natum/Compras` + `Natum/Backend/Compras` **antes** do NatumHub.  
> Código canônico hoje: `Frontend/` + `Backend/NatumHub/` (v0.0.11-alpha). Rotas, comandos e schema atuais: `ARCHITECTURE.md` e `.ai_context/`.  
> Regras de negócio, fluxo de aprovação e fórmulas abaixo **continuam úteis**. Pastas, portas e crates isolados estão obsoletos.

# App Natum — Compras: Matéria Prima

Aplicativo desktop para gestão de compras de matérias-primas, substituindo o fluxo atual baseado em Google Sheets + scripts por uma solução local com persistência, histórico e relatórios.

## Contexto e Problema

Hoje o fluxo de compras opera por planilhas Google Sheets com dados exportados manualmente do ERP (DGI Sistemas). Problemas identificados:

- **Importação 100% manual** — Exportar CSV do ERP, fazer upload no Drive, rodar scripts
- **Sem histórico de cotações** — Cada cotação é sobrescrita; não há registro do que foi comprado, quando, e por quanto
- **Sem controle de notas fiscais** — Períodos perdidos, dados duplicados por não saber o último corte temporal
- **Relatórios inexistentes** — Nenhuma visão consolidada de gastos, evolução de preço, comparativo de fornecedores
- **Duas aprovações sem suporte** — Aprovação de demandas e aprovação pós-cotação feitas informalmente

## User Review Required

### Decisões Confirmadas ✅

| Decisão | Resultado |
|---------|----------|
| **Um app ou dois?** | ✅ App único "Compras" com filtros por categoria (Matéria Prima, Embalagem) e subcategorias livres |
| **Meta de estoque** | ✅ Valor global editável (padrão 90 dias). Override por item individual como funcionalidade futura |
| **Subcategorias** | ✅ Criação livre pelo usuário (CRUD). Exemplos: Fragrâncias, Corantes, Óleos, Silicones, etc. |
| **Relatórios** | ✅ PDFs exportáveis agora. Links editáveis como funcionalidade futura |
| **Integração ERP** | ✅ Importação via CSV (DGI Sistemas não tem API). App valida formato, detecta duplicatas, controla períodos |

> [!NOTE]
> **Sobre NFs e períodos:** O app registra a data da última NF importada. Ao importar novamente, sugere o período correto e detecta duplicatas pelo número da NF. Isso resolve o problema de "esquecer o último período selecionado".

### Fluxo de Aprovação (Detalhado)

Duas aprovações pelo diretor, com possibilidade de anotações/exigências:

```mermaid
graph LR
    A["Rascunho"] --> B["Aguard. Aprovacao Demanda"]
    B -->|"Aprovado + Notas"| C["Em Cotacao"]
    B -->|"Rejeitado"| A
    C --> D["Cotada"]
    D --> E["Aguard. Aprovacao Final"]
    E -->|"Aprovado + Exigencias"| F["Pedido Feito"]
    E -->|"Renegociar"| C
```

**Campos de aprovação:**
- **Aprovação de Demanda:** Notas do diretor (ex: "reduzir qty do item X", "não precisa do item Y agora")
- **Aprovação de Cotação:** Exigências (ex: "negociar prazo 30/60/90", "tentar R$X no item Y", "trocar fornecedor Z")

### Open Questions (Pendente para implementação)

1. **Formato do CSV do DGI:** Os formatos de exportação de Consumo e NFs são iguais ao que vi no `import_dados`? → Resolveremos na prática: o wizard de importação terá mapeamento flexível de colunas.

---

## Proposed Changes

### Arquitetura Geral

Segue exatamente o blueprint do AnaliseMicrobiologica:

```
Natum/
├── Compras/                          # [NEW] Frontend (React + Vite + TailwindCSS)
│   ├── src/
│   │   ├── App.tsx                   # Roteador principal (tabs/páginas)
│   │   ├── main.tsx
│   │   ├── index.css                 # Design system (clone do AnaliseMicrobiologica)
│   │   ├── types.ts                  # Tipos TypeScript
│   │   ├── lib/
│   │   │   ├── db.ts                 # Camada de abstração Tauri invoke
│   │   │   ├── csv-parser.ts         # Parser de CSVs do DGI
│   │   │   └── calculations.ts       # Motor de cálculos (médias, recomendações)
│   │   └── components/
│   │       ├── FeedbackWidget.tsx     # Clone do AnaliseMicrobiologica
│   │       ├── ImportWizard.tsx       # Wizard de importação CSV
│   │       ├── DemandTable.tsx        # Tabela de demandas calculadas
│   │       ├── QuotationManager.tsx   # Gestão de cotações
│   │       ├── QuotationReport.tsx    # Relatório de cotação para aprovação
│   │       ├── SupplierManager.tsx    # Cadastro de fornecedores
│   │       ├── ReportDashboard.tsx    # Dashboard de relatórios
│   │       └── SettingsPanel.tsx      # Configurações (meses-alvo, categorias)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
├── Backend/
│   └── Compras/                      # [NEW] Backend Tauri (Rust + SQLite)
│       ├── src/
│       │   └── lib.rs                # Comandos IPC + setup DB
│       ├── Cargo.toml
│       ├── tauri.conf.json
│       ├── data.db                   # SQLite (auto-criado)
│       └── ...
│
└── Docs/
    └── Compras/                      # [NEW] Documentação
        └── projeto_compras.md
```

---

### Banco de Dados SQLite — Schema

O coração do sistema. Projetado para manter **todo o histórico** e permitir relatórios retroativos.

```sql
-- ═══════════════════════════════════════════════════════════
-- TABELAS DE REFERÊNCIA (DADOS MESTRES)
-- ═══════════════════════════════════════════════════════════

-- Categorias e subcategorias
CREATE TABLE categories (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,           -- "Matéria Prima", "Embalagem"
    parent_id   TEXT,                    -- NULL = categoria raiz
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories(id)
);

-- Cadastro de fornecedores
CREATE TABLE suppliers (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    contact     TEXT,                    -- Telefone/WhatsApp
    email       TEXT,
    notes       TEXT,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Cadastro de insumos (dados mestres do ERP)
CREATE TABLE items (
    code        TEXT PRIMARY KEY,        -- "9.15.062"
    description TEXT NOT NULL,           -- "ACIDO CITRICO"
    unit        TEXT NOT NULL,           -- "KG", "UN", "L"
    category_id TEXT,                    -- FK para categories
    line        TEXT,                    -- "9" (linha do ERP)
    type        TEXT,                    -- "15" (tipo do ERP)
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- ═══════════════════════════════════════════════════════════
-- SNAPSHOTS DE ESTOQUE (Importações do ERP)
-- ═══════════════════════════════════════════════════════════

-- Cada importação gera um registro aqui
CREATE TABLE stock_imports (
    id          TEXT PRIMARY KEY,
    filename    TEXT,                     -- Nome do arquivo importado
    source      TEXT DEFAULT 'ERP',       -- 'ERP', 'NF', 'CONSUMO'
    imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
    item_count  INTEGER DEFAULT 0
);

-- Snapshot de estoque por item (vinculado a uma importação)
CREATE TABLE stock_snapshots (
    id              TEXT PRIMARY KEY,
    import_id       TEXT NOT NULL,
    item_code       TEXT NOT NULL,
    stock_qty       REAL DEFAULT 0,      -- Estoque atual
    reserved_qty    REAL DEFAULT 0,      -- Reservado
    in_production   REAL DEFAULT 0,      -- Em produção
    in_orders       REAL DEFAULT 0,      -- Em pedidos
    snapshot_date   TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (import_id) REFERENCES stock_imports(id),
    FOREIGN KEY (item_code) REFERENCES items(code)
);

-- ═══════════════════════════════════════════════════════════
-- CONSUMO HISTÓRICO (Dados anuais do ERP)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE consumption (
    id              TEXT PRIMARY KEY,
    item_code       TEXT NOT NULL,
    year            INTEGER NOT NULL,    -- 2024, 2025, 2026
    total_qty       REAL DEFAULT 0,      -- Quantidade total consumida no ano
    monthly_avg     REAL DEFAULT 0,      -- Média mensal (total / 12)
    imported_at     TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_code) REFERENCES items(code),
    UNIQUE(item_code, year)
);

-- ═══════════════════════════════════════════════════════════
-- NOTAS FISCAIS (Histórico de compras)
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
    supplier_name   TEXT,                -- Nome do fornecedor como veio do ERP
    supplier_id     TEXT,                -- FK opcional (vinculação manual)
    invoice_date    TEXT,
    imported_at     TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_code) REFERENCES items(code),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    UNIQUE(invoice_number, item_code)    -- Evita duplicatas!
);

-- Controle de última importação de NFs
CREATE TABLE nf_import_control (
    id              TEXT PRIMARY KEY,
    last_period_end TEXT NOT NULL,        -- "2026-05-01" — fim do último período importado
    imported_at     TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════
-- COTAÇÕES E COMPRAS (O Novo!)
-- ═══════════════════════════════════════════════════════════

-- Uma cotação agrupa vários itens para solicitar preços
CREATE TABLE quotations (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,       -- "Cotação MP - Maio/2026"
    status          TEXT DEFAULT 'draft',-- draft → pending_demand_approval → quoting → quoted → pending_final_approval → approved → ordered
    target_days     INTEGER DEFAULT 90,  -- Meta de estoque em dias
    notes           TEXT,
    director_demand_notes TEXT,           -- Notas do diretor na aprovação de demanda
    director_final_notes  TEXT,           -- Exigências do diretor na aprovação de cotação (prazo pgto, etc)
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
    approved_at     TEXT,                -- Aprovação de demanda
    ordered_at      TEXT                 -- Aprovação pós-cotação (pedido feito)
);

-- Itens dentro de uma cotação
CREATE TABLE quotation_items (
    id              TEXT PRIMARY KEY,
    quotation_id    TEXT NOT NULL,
    item_code       TEXT NOT NULL,
    recommended_qty REAL DEFAULT 0,      -- Qtd calculada pelo motor
    approved_qty    REAL,                -- Qtd ajustada na aprovação
    final_qty       REAL,                -- Qtd final no pedido
    notes           TEXT,
    FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
    FOREIGN KEY (item_code) REFERENCES items(code)
);

-- Preços recebidos dos fornecedores por item da cotação
CREATE TABLE quotation_prices (
    id              TEXT PRIMARY KEY,
    quotation_item_id TEXT NOT NULL,
    supplier_id     TEXT NOT NULL,
    unit_price      REAL,
    delivery_days   INTEGER,             -- Prazo de entrega em dias
    min_qty         REAL,                -- Quantidade mínima
    notes           TEXT,
    is_selected     INTEGER DEFAULT 0,   -- 1 = fornecedor escolhido
    quoted_at       TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quotation_item_id) REFERENCES quotation_items(id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

-- ═══════════════════════════════════════════════════════════
-- CONFIGURAÇÕES E FEEDBACK
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
-- ÍNDICES PARA PERFORMANCE
-- ═══════════════════════════════════════════════════════════

CREATE INDEX idx_stock_snapshots_item ON stock_snapshots(item_code);
CREATE INDEX idx_consumption_item ON consumption(item_code);
CREATE INDEX idx_invoices_item ON invoices(item_code);
CREATE INDEX idx_invoices_supplier ON invoices(supplier_name);
CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_quotation_items_quotation ON quotation_items(quotation_id);
CREATE INDEX idx_quotation_prices_item ON quotation_prices(quotation_item_id);
```

---

### Frontend — Módulos e Telas

#### Navegação Principal (Tabs/Sidebar)

```
┌─────────────────────────────────────────────────────────────────┐
│  NATUM · Compras                                    [📦] [⚙️]  │
├──────────┬──────────────────────────────────────────────────────┤
│          │                                                      │
│ 📥 Import│  Conteúdo dinâmico baseado na tab selecionada        │
│          │                                                      │
│ 📊 Demand│                                                      │
│          │                                                      │
│ 💰 Cotaç │                                                      │
│          │                                                      │
│ 🏢 Fornec│                                                      │
│          │                                                      │
│ 📈 Relat │                                                      │
│          │                                                      │
│ ⚙️ Config│                                                      │
│          │                                                      │
└──────────┴──────────────────────────────────────────────────────┘
```

---

#### 1. Módulo de Importação (`ImportWizard.tsx`)

**Função:** Substituir o fluxo manual de "exportar do ERP → fazer upload no Google Drive → rodar script"

**3 tipos de importação:**

| Tipo | Dados | Formato CSV Esperado |
|------|-------|---------------------|
| **Estoque** | Posição atual de estoque | Código, Descrição, Unidade, Estoque, Reservado, Em Produção, Em Pedidos |
| **Consumo** | Consumo anual por item | Código, Descrição(?), Quantidade Total, Ano |
| **Notas Fiscais** | Histórico de compras | Código Produto, Nº NF, Descrição, Unidade, Quantidade, Valor Unitário, Valor Total, Fornecedor |

**Fluxo UX:**
1. Selecionar tipo de importação (Estoque / Consumo / NFs)
2. Arrastar ou selecionar arquivo CSV
3. Preview com mapeamento automático de colunas (com opção de ajustar manualmente se o formato mudar)
4. Validação: mostra novos itens, atualizados, e erros
5. Para NFs: mostra "Última importação: até 01/04/2026 — Novas NFs encontradas: 47 — Duplicatas ignoradas: 312"
6. Confirmar importação → salva no SQLite com timestamp

---

#### 2. Módulo de Demandas (`DemandTable.tsx`)

**Função:** Replicar a aba "Demandas" da planilha com cálculos automáticos

**Motor de cálculo (`calculations.ts`):**

```typescript
interface DemandCalc {
  itemCode: string;
  category: string;
  description: string;
  unit: string;
  
  // Do estoque (último snapshot)
  currentStock: number;
  reservedQty: number;
  inProduction: number;
  inOrders: number;
  
  // Médias de consumo (da tabela consumption)
  avgConsumption2024: number;
  avgConsumption2025: number;
  avgConsumption2026: number;
  
  // Calculados
  avgConsumptionOverall: number;     // Média das 3 médias
  futureStockForecast: number;       // inOrders + currentStock - reservedQty
  estimatedDurationDays: number;     // futureStockForecast / avgConsumptionOverall * 30
  recommendedQty: number;            // MAX(0, (targetDays * avgConsumptionOverall / 30) - MAX(0, futureStockForecast))
}
```

**Features da tabela:**
- Filtros por: Categoria, Subcategoria, Status (precisa comprar / estoque OK)
- Ordenação por qualquer coluna
- Busca por código ou descrição
- Coluna "Duração Estimada" com cores: 🔴 <30 dias | 🟡 30-60 dias | 🟢 >60 dias
- Seleção múltipla de itens para criar cotação
- Botão "Criar Cotação com Selecionados" → vai para o módulo Cotações
- **Export PDF** — Relatório de demandas para aprovação

---

#### 3. Módulo de Cotações (`QuotationManager.tsx`)

**Função:** Substituir a aba "MateriaPrima" da planilha + adicionar histórico

**Fluxo de cotação:**

```mermaid
graph LR
    A[Rascunho] --> B[Aguardando Aprovação]
    B --> C[Em Cotação]
    C --> D[Cotada]
    D --> E[Aprovada]
    E --> F[Pedido Feito]
```

**Tela principal — Lista de cotações:**
- Cards com: Título, Data, Status, Nº de itens, Valor total estimado
- Filtro por status
- Botão "Nova Cotação"

**Tela de cotação individual:**

| Ref | Descrição | Tipo | Méd. 24 | Méd. 25 | Méd. 26 | Previsão Estoque | Qtd Recomendada | Forn. 1 | Forn. 2 | Forn. 3 | Escolhido |
|-----|-----------|------|---------|---------|---------|------------------|-----------------|---------|---------|---------|-----------|
| 9.15.062 | ACIDO CITRICO | KG | 8,17 | 6,42 | 6,86 | 15,62 | 10 | R$ 12,50 | R$ 11,80 | R$ 13,00 | ✅ Forn.2 |

- Para cada item, adicionar preços de até N fornecedores (mín. 3)
- Selecionar fornecedor vencedor com um clique
- Campos: preço unitário, prazo de entrega, quantidade mínima
- Notas por item
- Resumo financeiro no rodapé: total por fornecedor, total geral

**Relatório de cotação (`QuotationReport.tsx`):**
- Versão imprimível/PDF da cotação
- Comparativo lado a lado dos fornecedores
- Resumo com economia em relação ao mais caro
- Dados para aprovação: quem é o fornecedor, quanto custa, prazo

---

#### 4. Módulo de Fornecedores (`SupplierManager.tsx`)

**Função:** Cadastro simples de fornecedores com histórico automático

- Lista de fornecedores com: Nome, Contato, Email, Total de compras, Última compra
- Ao importar NFs, fornecedores são criados automaticamente (pelo nome)
- Tela de detalhe do fornecedor: últimas NFs, itens mais comprados, evolução de preço

---

#### 5. Módulo de Relatórios (`ReportDashboard.tsx`)

**Função:** Dashboards e relatórios que hoje são impossíveis

**Relatórios disponíveis:**

| Relatório | Descrição |
|-----------|-----------|
| **Evolução de Preço** | Gráfico de linha mostrando preço unitário de um insumo ao longo do tempo (baseado em NFs) |
| **Gasto por Fornecedor** | Ranking de fornecedores por valor total comprado (período selecionável) |
| **Gasto por Categoria** | Quanto foi gasto em cada categoria/subcategoria |
| **Itens Críticos** | Itens com estoque abaixo de 30 dias de duração |
| **Histórico de Cotações** | Todas as cotações passadas com valores, fornecedores escolhidos, e economia |
| **Comparativo Período** | Consumo e gasto entre dois períodos (ex: Jan-Abr 2025 vs Jan-Abr 2026) |

Todos os relatórios exportáveis em **PDF** para compartilhamento.

---

#### 6. Configurações (`SettingsPanel.tsx`)

- **Meta de estoque:** Dias-alvo (padrão: 90, configurável globalmente e por categoria)
- **Categorias:** CRUD de categorias e subcategorias
- **Mapeamento de colunas CSV:** Perfis salvos para cada tipo de importação
- **Backup/Restore:** Exportar e importar data.db

---

### Backend Rust (Tauri)

#### [NEW] `Natum/Backend/Compras/src/lib.rs`

Seguindo exatamente o padrão do AnaliseMicrobiologica:

**Comandos IPC planejados:**

```rust
// Importação
fn import_stock_csv(data: Vec<StockRow>) -> Result<ImportResult, String>
fn import_consumption_csv(data: Vec<ConsumptionRow>, year: i32) -> Result<ImportResult, String>
fn import_invoices_csv(data: Vec<InvoiceRow>) -> Result<ImportResult, String>
fn get_import_history() -> Result<Vec<StockImport>, String>
fn get_nf_import_control() -> Result<Option<NfImportControl>, String>

// Itens
fn get_items(category: Option<String>) -> Result<Vec<Item>, String>
fn update_item_category(code: String, category_id: String) -> Result<(), String>

// Demandas (calculadas)
fn get_demands(category: Option<String>, target_days: i32) -> Result<Vec<DemandCalc>, String>

// Cotações
fn create_quotation(title: String, items: Vec<QuotationItemInput>) -> Result<String, String>
fn get_quotations(status: Option<String>) -> Result<Vec<Quotation>, String>
fn get_quotation_detail(id: String) -> Result<QuotationDetail, String>
fn update_quotation_status(id: String, status: String) -> Result<(), String>
fn add_quotation_price(price: QuotationPriceInput) -> Result<(), String>
fn select_supplier(quotation_item_id: String, price_id: String) -> Result<(), String>
fn delete_quotation(id: String) -> Result<(), String>

// Fornecedores
fn get_suppliers() -> Result<Vec<Supplier>, String>
fn save_supplier(supplier: Supplier) -> Result<(), String>
fn get_supplier_history(id: String) -> Result<SupplierHistory, String>

// Relatórios
fn get_price_evolution(item_code: String) -> Result<Vec<PricePoint>, String>
fn get_spending_by_supplier(start: String, end: String) -> Result<Vec<SupplierSpend>, String>
fn get_spending_by_category(start: String, end: String) -> Result<Vec<CategorySpend>, String>
fn get_critical_items(threshold_days: i32) -> Result<Vec<DemandCalc>, String>

// Config & Feedback (clone do AnaliseMicrobiologica)
fn get_config() -> Result<Option<serde_json::Value>, String>
fn save_config(config: serde_json::Value) -> Result<(), String>
fn get_backup() -> Result<Vec<u8>, String>
fn restore_backup(data: Vec<u8>) -> Result<(), String>
fn get_feedbacks() -> Result<Vec<Feedback>, String>
fn save_feedback(feedback: Feedback) -> Result<(), String>
fn resolve_feedback(id: String) -> Result<(), String>

// Categorias
fn get_categories() -> Result<Vec<Category>, String>
fn save_category(category: Category) -> Result<(), String>
fn delete_category(id: String) -> Result<(), String>
```

---

### Identidade Visual

Segue **exatamente** o blueprint do AnaliseMicrobiologica:
- Paleta: `zinc-50` a `zinc-900` (minimalista, tons de cinza)
- Fonts: `Inter` (sans) + `JetBrains Mono` (mono)
- TailwindCSS v4
- Componentes responsivos
- FeedbackWidget flutuante no canto inferior direito

---

## Verification Plan

### Automated Tests

```bash
# Build do frontend
cd Natum/Compras && npm run build

# Build do backend Tauri
cd Natum/Backend/Compras && cargo build

# Verificação de tipos
cd Natum/Compras && npx tsc --noEmit
```

### Manual Verification

1. **Importação:** Importar os 3 CSVs reais do DGI e validar que os dados coincidem com a planilha
2. **Cálculos:** Comparar Qtd Recomendada e Previsão de Estoque do app vs planilha para os 5 primeiros itens
3. **Cotação:** Criar uma cotação, adicionar 3 fornecedores, selecionar vencedor, gerar relatório PDF
4. **Relatórios:** Verificar evolução de preço com dados reais de NFs

### Browser Tests
- Navegar por todas as telas e verificar que a estética é consistente com o AnaliseMicrobiologica
- Testar importação drag-and-drop
- Testar fluxo completo: importar → demandas → criar cotação → aprovar → relatório

---

## Ordem de Implementação Sugerida

| Fase | Módulo | Prioridade |
|------|--------|------------|
| **1** | Schema SQLite + Backend Rust (lib.rs) | 🔴 Crítica |
| **2** | Importação de CSVs (Estoque + Consumo + NFs) | 🔴 Crítica |
| **3** | Motor de Cálculo de Demandas + Tabela | 🔴 Crítica |
| **4** | Gestão de Cotações (CRUD + preços) | 🟡 Alta |
| **5** | Relatório de Cotação (PDF) | 🟡 Alta |
| **6** | Cadastro de Fornecedores | 🟢 Média |
| **7** | Dashboard de Relatórios | 🟢 Média |
| **8** | Configurações e FeedbackWidget | 🟢 Média |

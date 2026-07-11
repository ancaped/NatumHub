# Referência Técnica — Blueprint para App Compras

Este documento contém TODOS os arquivos de referência, configs e fórmulas que a IA implementadora precisa replicar.

## 1. Estrutura de Pastas (OBRIGATÓRIA)

```
Natum/
├── Compras/                          # Frontend React+Vite+TailwindCSS
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── index.css
│       ├── App.tsx
│       ├── types.ts
│       ├── lib/
│       │   ├── api.ts                # Tauri invoke abstraction
│       │   ├── logInterceptor.ts     # Console log capture (50 últimos)
│       │   ├── utils.ts             # cn() helper + constants
│       │   ├── csvParser.ts         # CSV import/parse logic
│       │   └── calculations.ts      # Demand calculation engine
│       └── components/
│           ├── FeedbackWidget.tsx    # Clone EXATO do AnaliseMicrobiologica
│           ├── Sidebar.tsx
│           ├── ImportWizard.tsx
│           ├── DemandTable.tsx
│           ├── QuotationManager.tsx
│           ├── QuotationDetail.tsx
│           ├── QuotationReport.tsx
│           ├── SupplierManager.tsx
│           ├── ReportDashboard.tsx
│           └── SettingsPanel.tsx
│
├── Backend/
│   └── Compras/                      # Backend Tauri (Rust+SQLite)
│       ├── Cargo.toml
│       ├── build.rs
│       ├── package.json
│       ├── tauri.conf.json
│       ├── capabilities/default.json
│       └── src/
│           ├── main.rs
│           └── lib.rs
│
└── Docs/
    └── Compras/
        └── projeto_compras.md
```

## 2. Configs Exatas (copiar e adaptar)

### package.json (Frontend - Natum/Compras/)
```json
{
  "name": "compras",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "tauri": "cd ../Backend/Compras && npm run tauri",
    "tauri:dev": "cd ../Backend/Compras && npm run tauri:dev",
    "tauri:build": "cd ../Backend/Compras && npm run tauri:build"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.1.14",
    "@tauri-apps/api": "^2.11.0",
    "@vitejs/plugin-react": "^5.0.4",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0",
    "html2canvas": "^1.4.1",
    "lucide-react": "^0.546.0",
    "motion": "^12.23.24",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-merge": "^3.5.0",
    "vite": "^6.2.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.11.1",
    "@types/node": "^22.14.0",
    "autoprefixer": "^10.4.21",
    "tailwindcss": "^4.1.14",
    "typescript": "~5.8.2"
  }
}
```

### vite.config.ts
```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  clearScreen: false,
  server: { port: 5174, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_'],
});
```
> **NOTA:** Porta 5174 (não 5173) para não conflitar com AnaliseMicrobiologica.

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "moduleDetection": "force",
    "allowJs": true,
    "jsx": "react-jsx",
    "paths": { "@/*": ["./*"] },
    "allowImportingTsExtensions": true,
    "noEmit": true
  }
}
```

### Cargo.toml (Backend/Compras/)
```toml
[package]
name = "compras-app"
version = "0.1.0"
description = "Natum Compras"
authors = ["Natum"]
edition = "2021"
rust-version = "1.77.2"

[lib]
name = "app_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2.6.1", features = [] }

[dependencies]
serde_json = "1.0"
serde = { version = "1.0", features = ["derive"] }
tauri = { version = "2.11.1", features = [] }
rusqlite = { version = "0.31.0", features = ["bundled"] }
csv = "1.3"
```
> **NOTA:** Adicionada crate `csv` para parsing de CSV no Rust.

### tauri.conf.json
```json
{
  "$schema": "../node_modules/@tauri-apps/cli/config.schema.json",
  "productName": "NatumCompras",
  "version": "0.1.0",
  "identifier": "com.natum.compras",
  "build": {
    "frontendDist": "../../Compras/dist",
    "devUrl": "http://localhost:5174",
    "beforeDevCommand": "npm --prefix ../../Compras run dev",
    "beforeBuildCommand": "npm --prefix ../../Compras run build"
  },
  "app": {
    "windows": [{ "title": "Natum · Compras", "width": 1200, "height": 800, "resizable": true, "fullscreen": false }],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/32x32.png","icons/128x128.png","icons/128x128@2x.png","icons/icon.icns","icons/icon.ico"]
  }
}
```

### build.rs
```rust
fn main() {
  tauri_build::build()
}
```

### main.rs
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
  app_lib::run();
}
```

### capabilities/default.json
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "enables the default permissions",
  "windows": ["main"],
  "permissions": ["core:default"]
}
```

### Backend/Compras/package.json
```json
{
  "name": "compras-desktop",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  }
}
```

## 3. Design System (OBRIGATÓRIO — Clone do AnaliseMicrobiologica)

### index.css
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
@import "tailwindcss";

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
}

@layer base {
  body {
    @apply antialiased text-zinc-900 bg-zinc-50 font-sans;
  }
}

@media print {
  @page { margin: 5mm; size: A4 portrait; }
  body { background: white; }
  .no-print { display: none !important; }
  .print-only { display: block !important; }
  .page-break { break-after: page; page-break-after: always; }
}

.print-only { display: none; }
```

### Paleta: zinc-50 → zinc-900 (minimalista, tons de cinza)
### Fontes: Inter (sans) + JetBrains Mono (mono)
### Botões primários: bg-zinc-900, hover:bg-zinc-800, text-white
### Borders: border-zinc-200
### Background cards: bg-white
### Background page: bg-zinc-50
### Acentos de status: red-500 (crítico), amber-500 (atenção), emerald-500 (ok)

## 4. Arquivos Utilitários (COPIAR INTEGRALMENTE)

### lib/logInterceptor.ts
```ts
export const capturedLogs: string[] = [];

export function initLogInterceptor() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  const pushLog = (type: string, ...args: any[]) => {
    const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    capturedLogs.push(`[${new Date().toISOString()}] [${type}] ${message}`);
    if (capturedLogs.length > 50) capturedLogs.shift();
  };

  console.log = (...args) => { pushLog('LOG', ...args); originalLog(...args); };
  console.error = (...args) => { pushLog('ERROR', ...args); originalError(...args); };
  console.warn = (...args) => { pushLog('WARN', ...args); originalWarn(...args); };
}

export function getLogs() { return capturedLogs.join('\n'); }
```

### lib/utils.ts
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const APP_NAME = "NATUM · COMPRAS";
export const COMPANY_INFO = {
  name: "NÁTUM BIO COSMÉTICOS LTDA",
  address: "RUA LUIS BELLETI, 78, SANTA MARIA, CARANGOLA-MG",
  email: "rafael@natumcosmeticos.com.br",
  contact: "(32) 3741-1773",
};
```

### main.tsx
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initLogInterceptor } from './lib/logInterceptor';

initLogInterceptor();

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
```

## 5. Fórmulas da Planilha (Lógica de Negócio a Replicar)

### Aba "Demandas" — Colunas e Fórmulas

| Coluna | Header | Fórmula/Origem |
|--------|--------|---------------|
| A | CATEGORIA | `=IF(LEFT(B2;5)="9.15.";"Matéria Prima";IFERROR(VLOOKUP(B2;Mapeamento_Categorias!$A:$B;2;FALSE);"EMBALAGEM"))` |
| B | Ref | Código do item (de import_dados) |
| C | Descrição | VLOOKUP de import_dados |
| D | Tipo | Unidade (KG/UN/L) — de import_dados |
| E | Quantidade Recomendada | `=ROUND((média_geral * meses_alvo) - MAX(0; previsão_estoque_futuro); 2)` |
| F | Duração Estimada | `=IF(média_geral>0; ROUND(previsão_estoque_futuro / média_geral; 0) & " Dias"; "∞")` — em dias |
| G | Duração Estimada do Estoque | Similar a F mas baseada em estoque bruto |
| H | Previsão de Estoque Futuro | `= Estoque_Atual - Qtd_Reservada + Qtd_Pedidos` (valor que será consumido projetado) |
| I | Estoque Atual | VLOOKUP de import_dados coluna "Quantidade em Estoque" |
| J | Qtd Reservada | VLOOKUP de import_dados coluna "Quantidade Reservada" |
| K | Qtd em Produção | VLOOKUP de import_dados |
| L | Qtd em Pedidos | VLOOKUP de import_dados |
| M | Media Mes Consumo 2024 | `=IFERROR(VLOOKUP(B2;'2024'!A:D;4;0);"")` — média mensal do ano |

### Aba "MateriaPrima" — Colunas

| Coluna | Header | Conteúdo |
|--------|--------|----------|
| A | Ref | Código do item (selecionado manualmente de Demandas) |
| B | Descrição | Nome do insumo |
| C | Tipo | Unidade (KG/UN/L) |
| D | Media Mes Consumo 2024 | `=IFERROR(VLOOKUP(A2;'2024'!A:D;4;0);"")` |
| E | Media Mes Consumo 2025 | `=IFERROR(VLOOKUP(A2;'2025'!A:D;4;0);"")` |
| F | Media Mes Consumo 2026 | `=IFERROR(VLOOKUP(A2;'2026'!A:D;4;0);"")` |
| G | Previsao de Estoque Futuro | `=IFERROR(VLOOKUP(A2;Demandas!B:H;7;0);"")` |
| L | Quantidade Recomendada | Valor manual (ajustado pelo comprador) |
| M | Data NF | `=IFERROR(VLOOKUP(A2;nf!A:E;5;0);"")` — data da última NF |
| N | Numero da Nota | `=IFERROR(VLOOKUP(A2;nf!A:B;2;0);"")` — número da NF |
| O | Ultimo Fornecedor | `=IFERROR(VLOOKUP(A2;nf!A:I;9;0);"")` — nome do fornecedor |

### Aba "2024/2025/2026" — Consumo Anual

| Coluna | Header | Conteúdo |
|--------|--------|----------|
| A | Código | Referência do item |
| B | Fornecedor/Descrição | Nome do item |
| C | Quantidade | Total consumido no ano (soma) |
| D | Media Mensal | `= C2 / 12` (ou meses transcorridos) |

### Aba "nf" — Notas Fiscais

Colunas: Código Produto | Nº NF | Descrição | Unidade | Data Emissão | Quantidade | Valor Unitário | Valor Total | Fornecedor

### Motor de Cálculos — Implementação no Backend (Rust)

Os cálculos de demanda foram migrados para o backend em Rust (função `get_demands` em `lib.rs`) para maior eficiência. O cálculo da **Média Mês** (`overall_avg`) e demais variáveis segue a lógica descrita abaixo:

#### 1. Média Mensal (Média Mês / `overallAvg`)
Calculada preferencialmente com base nas saídas reais de estoque dos últimos 12 meses. Caso não existam movimentações, utiliza-se a mediana das médias de consumo anuais.

$$overall\_avg = \begin{cases} 
\frac{\sum \text{saidas\_12m}}{12}, & \text{se } \sum \text{saidas\_12m} > 0 \\
\text{mediana}(avg_{2024}, avg_{2025}, avg_{2026}), & \text{caso contrário}
\end{cases}$$

> [!NOTE]
> As médias anuais ($avg_{year}$) para o ano corrente são corrigidas proporcionalmente de acordo com a quantidade de meses transcorridos no ano.

#### 2. Previsão de Estoque Futuro (`futureStockForecast`)
Calcula o estoque projetado considerando estoque atual, reservas e pedidos em trânsito (ordens de compra pendentes e ordens em produção):
$$future\_stock\_forecast = current\_stock - reserved\_qty + in\_orders + in\_production$$
$$max\_forecast = \max(0, future\_stock\_forecast)$$

#### 3. Duração Estimada do Estoque (`estimatedDurationDays`)
Calcula em quantos dias o estoque atual/futuro vai durar com base na média diária de consumo ($daily\_avg = \frac{overall\_avg}{30}$):
$$estimated\_duration\_days = \begin{cases} 
\text{round}\left(\frac{max\_forecast}{daily\_avg}\right), & \text{se } daily\_avg > 0 \\
9999, & \text{se } daily\_avg = 0
\end{cases}$$

#### 4. Quantidade Recomendada de Compra (`recommendedQty`)
Quantidade sugerida para atingir a meta de dias de cobertura configurada ($target\_days$):
$$target\_stock = target\_days \times daily\_avg$$
$$recommended\_qty = \max(0, \text{round}(target\_stock - max\_forecast))$$

#### 5. Nível de Urgência (`urgency`)
- **Crítico** (`critical`): $\text{duração} < 30 \text{ dias}$
- **Atenção** (`warning`): $30 \le \text{duração} < 60 \text{ dias}$
- **Normal** (`ok`): $\text{duração} \ge 60 \text{ dias}$


## 6. Categorização Automática

Regra de categorização do item pelo código:
```typescript
function categorizeItem(code: string): string {
  if (code.startsWith('9.15.')) return 'Matéria Prima';
  // Para outros, buscar na tabela de mapeamento ou default "Embalagem"
  return 'Embalagem';
}
```

> A tabela `categories` permite subcategorias livres criadas pelo usuário.
> A categorização automática `9.15.* = Matéria Prima` é apenas o default inicial.

## 7. FeedbackWidget

O componente `FeedbackWidget.tsx` deve ser COPIADO INTEGRALMENTE do AnaliseMicrobiologica.
Caminho fonte: `Natum/AnaliseMicrobiologica/src/components/FeedbackWidget.tsx`
- Botão fixo no canto inferior direito (fixed bottom-6 right-6)
- Modal com abas "Novo Report" e "Lista"
- Captura de tela via html2canvas
- Upload de imagem ou Ctrl+V
- Envia logs do console (50 últimos) + rota atual
- Salva via invoke('save_feedback')

## 8. CSV Parser — Formato DGI Sistemas

O ERP DGI exporta CSVs com separador `;` (ponto-e-vírgula) e números com `,` como decimal (formato BR).

```typescript
// csvParser.ts
export function parseBrazilianNumber(value: string): number {
  if (!value || value.trim() === '') return 0;
  // Remove pontos de milhar, troca vírgula por ponto
  return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
}

export function parseCSVLine(line: string): string[] {
  // Handle quoted fields with internal separators
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ';' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += char; }
  }
  result.push(current.trim());
  return result;
}
```

### Formato Import Estoque (aba import_dados):
```
Referência;Descrição;Unidade;Quantidade em Estoque;Quantidade Reservada;Quantidade em Produção;Linha;Tipo;Quantidade nos Pedidos
9.15.062;ACIDO CITRICO;KG;27,367468;11,75053;0;9;15;0
```

### Formato Import Consumo (abas 2024/2025/2026):
```
Código;Fornecedor;Quantidade;Media Mensal
9.15.064;AGUA DESMINERALIZADA;173.408;14451
```

### Formato Import NF:
```
Código Produto;Nº NF;Descrição;Unidade;Data Emissão;Quantidade;Valor Unitário;Valor Total;Fornecedor
```
> Formatos podem variar ligeiramente — o wizard de importação deve permitir mapeamento manual de colunas.

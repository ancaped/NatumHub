# Esquema SQLite (`Backend/data.db`)

Arquivo do banco: **`Backend/data.db`** (fora do crate Tauri, para não forçar rebuild). Caminhos relativos à raiz do repo.

O schema efetivo é a **união** de:

1. `Backend/NatumHub/schema.sql` — aplicado em `Backend/NatumHub/src/db.rs` (`include_str!` + `execute_batch`)
2. `initialize_hub_db` em `Backend/NatumHub/src/lib.rs` — Compras, micro, FQ, feedback, online
3. Migrations incrementais em `db.rs` e no final de `initialize_hub_db` (`ALTER TABLE`, `vira_*`, wipe de senha vazada, etc.)

Tabelas ERP espelhadas em `legacy_db.rs` (sync SQL Server) alimentam várias destas; mapeamento: `Docs/DATABASE_SCHEMA_MAPPING.md`.

---

## 1. Produção / estoque (`schema.sql`)

### `config_linhas`
Multiplicadores de estoque por linha.
- `linha_prefix` TEXT PK (`1`, `2`, `DEFAULT`, …)
- `nome_linha` TEXT NOT NULL
- `estoque_ideal_mult` REAL DEFAULT 3.2
- `abrir_ordem_mult` REAL DEFAULT 1.6
- `abrir_prod_mult` REAL DEFAULT 1.2
- `fator_seguranca_z` REAL DEFAULT 0.0
- `visivel` INTEGER DEFAULT 1

### `produtos`
Cadastro de acabados.
- `codigo` TEXT PK
- `descricao` TEXT NOT NULL
- `linha_prefix` TEXT NOT NULL → `config_linhas`
- `base` TEXT
- `media_levantamento` REAL DEFAULT 0.0

### `estoque_atual`
Posição sincronizada pelo watcher / levantamento.
- `codigo` TEXT PK → `produtos`
- `estoque` INTEGER, `producao` INTEGER, `pedidos_aberto` INTEGER, `fase` TEXT

### `historico_faturamento`
Vendas mensais importadas.
- PK (`codigo`, `mes` 1–12), `quantidade` INTEGER

### `overrides_produtos`
Ajustes manuais de alerta. Colunas do SQL + migrations `db.rs`:
- `codigo` TEXT PK
- `estoque_ideal_manual`, `pedidos_manual`, `media_manual`
- `is_lancamento_manual`, `visivel`, `observacao`, `linha_prefix_manual`
- `status_produto` DEFAULT `'ativo'`
- `categoria_produto`, `produzir_apenas_kit`
- `lancamento_meta_meses` DEFAULT 6, `lancamento_data_inicio`

### `kit_composicao`
- PK (`kit_codigo`, `componente_codigo`) → `produtos`
- `quantidade` INTEGER DEFAULT 1 (migration)

### `historico_producao`
Ordens lançadas + snapshot de decisão (`snap_*`), `consume_base`, `base_code`, `lote_erp`.

### `historico_importacoes`
Planilhas: `tipo` (`levantamento` | `faturamento` | `kits`), arquivo, status.

### `formulations`
Receita do acabado (mesmo insumo em várias fases → PK `id` AUTOINCREMENT).
- `product_code` → `produtos`, `ingredient_code` → `items`

### `stock_movements`
Entradas/saídas unificadas (`insumo` | `produto` | `material`).

### `purchase_orders` / `purchase_order_items`
Pedidos de compra do ERP (`n_registro` PK).

### `sales_orders` / `sales_order_items`
Pedidos de venda sincronizados. PK (`n_pedido`, `d_pedido`). Status: FT, FP, EX, PP, CF, LB, AL, CA.

### `similar_items`
Pares de insumos semelhantes. PK (`item_code_a`, `item_code_b`) → `items`.

### `lote_error_resolutions`
Resolução manual de divergência de lote.

### `kit_assembly_orders`
Ordens de montagem de kits (`PENDING` / concluída). `quantity_assembled` via migration.

### `lote_custom_status`
Status operacional do Acompanhamento (`custom_status`, `category`, `notes`).

### `settings`
Chave/valor (SQL, Firebase, watcher, flags de migration). Segredos: ver [security.md](security.md).

### Só em `db.rs` (não no `schema.sql` inicial)

### `vira_composicao` / `vira_ordens`
Troca de SKU (de → para) e ordens de vira.

---

## 2. Compras (`initialize_hub_db`)

### `categories`
Árvore. Seeds: `cat_mp`, `cat_emb`, `cat_mat`, `cat_coloracao`, `cat_apoio`.

### `suppliers`
Fornecedores (`name` UNIQUE).

### `items`
Insumos ERP: `code` PK, `description`, `unit`, `category_id`, `line`, `type`, `notes`, `is_ignored`, `manual_category`.

### `stock_imports` / `stock_snapshots`
Importações CSV e snapshot de estoque por item.

### `consumption`
Consumo anual (`UNIQUE(item_code, year)`), `monthly_avg`.

### `invoices`
NFs importadas (média histórica / spending). Sem `UNIQUE(invoice_number, item_code)` no hub atual — dedupe é na importação.

### `nf_import_control`
Último período importado (`last_period_end`).

### `quotations`
Status: `draft` → `pending_demand_approval` → `quoting` → `quoted` → `pending_final_approval` → `approved` → `ordered`.
- `target_days` DEFAULT 90
- `director_demand_notes`, `director_final_notes`
- `demand_approved_at`, `final_approved_at`, `ordered_at`

### `quotation_items`
Itens da cotação. FK só para `quotations` (migration removeu FK para `items`, para coloração/apoio).

### `quotation_prices`
Preço por fornecedor; `is_selected`, `payment_terms`, `min_qty`.

### `config`
Config JSON de Compras (dias-alvo, regras de subcategoria). Distinto de `settings`.

---

## 3. Microbiologia (`initialize_hub_db`)

### `products` (lab)
Cadastro laboratorial — **não** é `produtos` de estoque.
- `code` PK, `name`, `packaging`, `validity`

### `reports`
Laudos: `id`, `reportId`, `reportRawNum`, `productCode`, `productName`, `batch`, `collectionDate`, `technician`, `createdAt`.

---

## 4. Físico-química (`initialize_hub_db`)

### `fisco_quimica_patterns`
Faixas por `product_code`: pH, viscosidade, densidade, volume de embalagem.

### `fisco_quimica_corrective_agents`
Agentes corretivos de viscosidade.

### `fisco_quimica_product_agents`
N:N produto ↔ agente.

### `fisco_quimica_analyses`
Medições de lote + campos de ajuste (trial, qty/litro, batch_size).

---

## 5. Feedback e compras online (`initialize_hub_db`)

### `feedbacks`
- `id`, `type`, `description`, `page`, `logs`, `screenshot`
- `status` DEFAULT `'open'`
- `createdAt`, `resolvedAt`

### `online_orders`
Pedidos web: loja, URL, preços, tracking, `status` (`preparing` / `shipped` / `delivered` / `cancelled`), `receipt_path`, campos de devolução (`is_return`, `return_deadline`, `return_status`, `return_notes`), `item_code` → `items`.

### `online_stores`
Lojas (seeds Mercado Livre, Shopee, Amazon).

---

## 6. Onde cada tabela nasce

| Origem | Tabelas |
|--------|---------|
| `schema.sql` + `db.rs` | `config_linhas`, `produtos`, `estoque_atual`, `historico_faturamento`, `overrides_produtos`, `kit_composicao`, `historico_producao`, `historico_importacoes`, `formulations`, `stock_movements`, `purchase_orders`, `purchase_order_items`, `sales_orders`, `sales_order_items`, `similar_items`, `lote_error_resolutions`, `kit_assembly_orders`, `lote_custom_status`, `settings` |
| `db.rs` only | `vira_composicao`, `vira_ordens` |
| `initialize_hub_db` | `categories`, `suppliers`, `items`, `stock_imports`, `stock_snapshots`, `consumption`, `invoices`, `nf_import_control`, `quotations`, `quotation_items`, `quotation_prices`, `config`, `feedbacks`, `online_orders`, `online_stores`, `products`, `reports`, `fisco_quimica_*` (+ espelho de várias tabelas de produção para DB só-hub) |

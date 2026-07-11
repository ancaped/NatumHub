# Esquema e Arquitetura do Banco de Dados SQLite (`data.db`)

Este blueprint detalha a estrutura do banco de dados relacional compartilhado, localizado em **`c:\api\Saves\data.db`**.

---

## 1. Tabelas de Controle de Estoque (Módulo Produção)

### `config_linhas`
Configurações de prazos de estoque de segurança por linha de produto (multiplicadores de vendas mensais).
- `linha_prefix` TEXT PRIMARY KEY (ex: "1", "2", "DEFAULT")
- `nome_linha` TEXT NOT NULL
- `estoque_ideal_mult` REAL NOT NULL DEFAULT 3.2 (Estoque ideal em meses de venda)
- `abrir_ordem_mult` REAL NOT NULL DEFAULT 1.6 (Limiar de faturamento acumulado em meses para abrir ordem)
- `abrir_prod_mult` REAL NOT NULL DEFAULT 1.2 (Limiar mínimo para começar produção)
- `fator_seguranca_z` REAL NOT NULL DEFAULT 0.0
- `visivel` INTEGER NOT NULL DEFAULT 1 (0 = Inativo, 1 = Ativo)

### `produtos`
Cadastro de produtos acabados.
- `codigo` TEXT PRIMARY KEY (Código de barras/referência)
- `descricao` TEXT NOT NULL
- `linha_prefix` TEXT NOT NULL (Chave estrangeira -> `config_linhas`)
- `base` TEXT
- `media_levantamento` REAL NOT NULL DEFAULT 0.0

### `estoque_atual`
Armazena a posição de estoque e produção atualizada pelo watcher de planilhas.
- `codigo` TEXT PRIMARY KEY (Chave estrangeira -> `produtos`)
- `estoque` INTEGER NOT NULL DEFAULT 0
- `producao` INTEGER NOT NULL DEFAULT 0 (Quantidade em fabricação)
- `pedidos_aberto` INTEGER NOT NULL DEFAULT 0
- `fase` TEXT

### `overrides_produtos`
Ajustes manuais que sobrescrevem os cálculos do algoritmo automático de alertas.
- `codigo` TEXT PRIMARY KEY (Chave estrangeira -> `produtos`)
- `estoque_ideal_manual` INTEGER (Overrides estoque ideal recomendado)
- `pedidos_manual` INTEGER
- `media_manual` REAL
- `is_lancamento_manual` INTEGER (0 = Não, 1 = Sim)
- `visivel` INTEGER DEFAULT 1 (0 = Ocultar da tela de estoque, 1 = Mostrar)
- `observacao` TEXT (Ex: "Apenas sob encomenda")
- `linha_prefix_manual` TEXT

### `historico_producao`
Logs de ordens de fabricação emitidas no sistema.
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `data_producao` TEXT NOT NULL (Formato: `YYYY-MM-DD`)
- `codigo` TEXT NOT NULL (Chave estrangeira -> `produtos`)
- `quantidade` INTEGER NOT NULL
- `observacoes` TEXT
- `criado_em` TEXT DEFAULT CURRENT_TIMESTAMP
- `snap_*` (Campos que salvam a posição do estoque, vendas e status no momento exato em que a ordem foi criada para auditoria de decisões).

---

## 2. Tabelas de Insumos e Fornecedores (Módulo Compras)

### `items`
Cadastro de matérias-primas e embalagens de compras.
- `code` TEXT PRIMARY KEY (Código de referência do insumo)
- `description` TEXT NOT NULL
- `unit` TEXT NOT NULL
- `category_id` TEXT (Chave estrangeira -> `categories`)
- `line` TEXT
- `type_code` TEXT
- `notes` TEXT
- `is_ignored` INTEGER NOT NULL DEFAULT 0 (1 = Oculta o item da tela de sugestão de demandas)

### `categories`
Categorias hierárquicas de insumos.
- `id` TEXT PRIMARY KEY
- `name` TEXT NOT NULL
- `parent_id` TEXT (Chave estrangeira auto-referencial -> `categories`)

### `suppliers`
Fornecedores de insumos.
- `id` TEXT PRIMARY KEY
- `name` TEXT NOT NULL
- `contact` TEXT
- `email` TEXT
- `notes` TEXT

### `invoices`
Registros de Notas Fiscais importadas de compras, usadas para calcular consumo real e médias mensais.
- `id` TEXT PRIMARY KEY
- `invoice_number` TEXT NOT NULL
- `item_code` TEXT NOT NULL (Chave estrangeira -> `items`)
- `description` TEXT
- `unit` TEXT
- `quantity` REAL NOT NULL
- `unit_price` REAL NOT NULL
- `total_value` REAL NOT NULL
- `supplier_name` TEXT
- `supplier_id` TEXT (Chave estrangeira -> `suppliers`)
- `invoice_date` TEXT

### `quotations`
Cotações criadas e seu progresso.
- `id` TEXT PRIMARY KEY
- `title` TEXT NOT NULL
- `status` TEXT NOT NULL (Valores: `draft`, `pending_demand_approval`, `quoting`, `quoted`, `pending_final_approval`, `approved`, `ordered`)
- `target_days` INTEGER NOT NULL DEFAULT 90
- `notes` TEXT
- `director_demand_notes` TEXT
- `director_final_notes` TEXT
- `created_at` TEXT DEFAULT CURRENT_TIMESTAMP

### `quotation_items`
Itens vinculados a uma cotação.
- `id` TEXT PRIMARY KEY
- `quotation_id` TEXT NOT NULL (Chave estrangeira -> `quotations` ON DELETE CASCADE)
- `item_code` TEXT NOT NULL (Chave estrangeira -> `items`)
- `recommended_qty` REAL NOT NULL
- `approved_qty` REAL
- `final_qty` REAL
- `notes` TEXT

### `quotation_prices`
Valores cotados por fornecedor para cada item.
- `id` TEXT PRIMARY KEY
- `quotation_item_id` TEXT NOT NULL (Chave estrangeira -> `quotation_items` ON DELETE CASCADE)
- `supplier_id` TEXT NOT NULL (Chave estrangeira -> `suppliers`)
- `unit_price` REAL NOT NULL
- `delivery_days` INTEGER
- `min_qty` REAL
- `payment_terms` TEXT
- `notes` TEXT
- `is_selected` INTEGER DEFAULT 0 (1 = Fornecedor vencedor da cotação)

---

## 3. Controle de Qualidade (Módulo Microbiologia)

### `reports`
Armazena laudos microbiológicos gerados no laboratório.
- `id` TEXT PRIMARY KEY
- `reportId` TEXT (Código legível do laudo, ex: "001/26")
- `reportRawNum` INTEGER (Contador numérico puro para ordenação e auto-incremento)
- `productCode` TEXT
- `productName` TEXT
- `batch` TEXT (Lote fabricado)
- `collectionDate` TEXT
- `technician` TEXT (Operador responsável)
- `createdAt` TEXT DEFAULT CURRENT_TIMESTAMP

---

## 4. Auditoria de Feedbacks e Configurações

### `feedbacks`
Logs e reports flutuantes enviados pelo aplicativo.
- `id` TEXT PRIMARY KEY
- `type` TEXT (bug / feedback)
- `description` TEXT NOT NULL
- `page` TEXT (Rota onde ocorreu)
- `logs` TEXT (Dump do console de depuração do frontend)
- `screenshot` TEXT (Imagem em string base64)
- `status` TEXT DEFAULT 'pending' (pending / resolved)
- `createdAt` TEXT DEFAULT CURRENT_TIMESTAMP
- `resolvedAt` TEXT

### `settings`
Pares chave-valor de configurações do sistema (incluindo o caminho da pasta monitorada).
- `key` TEXT PRIMARY KEY
- `value` TEXT

---

## 5. Físico-Química (Módulo FiscoQuimica)

### `fisco_quimica_patterns`
Padrões de especificação (faixas aceitáveis) para cada produto acabado.
- `product_code` TEXT PRIMARY KEY (Chave estrangeira → `products`)
- `ph_min` REAL NOT NULL
- `ph_max` REAL NOT NULL
- `viscosity_min` REAL NOT NULL
- `viscosity_max` REAL NOT NULL
- `density_target` REAL NOT NULL
- `density_tolerance` REAL DEFAULT 0.02
- `package_volume` REAL DEFAULT 1000
- `package_unit` TEXT DEFAULT 'mL'

### `fisco_quimica_corrective_agents`
Cadastro de agentes corretivos de viscosidade.
- `id` TEXT PRIMARY KEY
- `name` TEXT NOT NULL
- `created_at` TEXT DEFAULT CURRENT_TIMESTAMP

### `fisco_quimica_product_agents`
Vínculo N:N entre produtos e agentes corretivos permitidos.
- `product_code` TEXT NOT NULL (PK composta com agent_id)
- `agent_id` TEXT NOT NULL (PK composta com product_code, FK → `fisco_quimica_corrective_agents`)

### `fisco_quimica_analyses`
Registros de análises físico-químicas realizadas em lotes.
- `id` TEXT PRIMARY KEY
- `product_code` TEXT NOT NULL
- `product_name` TEXT NOT NULL
- `batch` TEXT NOT NULL (Lote)
- `analysis_date` TEXT NOT NULL
- `technician` TEXT NOT NULL
- `ph_measured` REAL NOT NULL
- `viscosity_measured` REAL NOT NULL
- `density_measured` REAL NOT NULL
- `fraction_weight` REAL NOT NULL
- `envase_target_weight` REAL NOT NULL
- `envase_target_unit` TEXT DEFAULT 'g'
- `has_adjustment` INTEGER DEFAULT 0 (1 = Ajuste de viscosidade aplicado)
- `corrective_agent_id` TEXT (FK → `fisco_quimica_corrective_agents`)
- `initial_viscosity` REAL
- `trial_agent_qty` REAL
- `trial_viscosity` REAL
- `agent_qty_per_liter` REAL
- `batch_size` REAL
- `total_agent_required` REAL
- `notes` TEXT
- `created_at` TEXT DEFAULT CURRENT_TIMESTAMP

---

## 6. Compras Online (Módulo ComprasOnline)

### `online_orders`
Pedidos de compras online rastreados.
- `id` TEXT PRIMARY KEY
- `description` TEXT NOT NULL
- `store_name` TEXT
- `purchase_url` TEXT
- `purchase_date` TEXT NOT NULL
- `unit_price` REAL DEFAULT 0
- `quantity` INTEGER DEFAULT 1
- `shipping_cost` REAL DEFAULT 0
- `total_price` REAL DEFAULT 0
- `tracking_code` TEXT
- `tracking_url` TEXT
- `status` TEXT DEFAULT 'preparing' (preparing / shipped / delivered / cancelled)
- `estimated_delivery` TEXT
- `notes` TEXT
- `item_code` TEXT (Código do insumo vinculado, FK → `items`)
- `payment_method` TEXT
- `receipt_path` TEXT (Caminho do comprovante)
- `created_at` TEXT DEFAULT CURRENT_TIMESTAMP

---

## 8. Hub — auth, notificações, settings

### `hub_operators` / `hub_operator_modules` / `hub_sessions` / `hub_audit_log`
Auth operador local. Ver `Backend/src/modules/geral/auth/store.rs` (`init_auth_tables`).

### `hub_notifications`
- `id` TEXT PK · `module_key` TEXT · `kind` TEXT (`info|success|warning|error`)
- `title`, `message` TEXT · `created_at` TEXT · `metadata` TEXT (JSON opcional)

### `hub_notification_reads`
- `(notification_id, operator_id)` PK — leitura por operador

### `settings`
Chave-valor: `sql_*`, `erp_sync_*`, `hub_principal_device_id`, `hub_principal_device_label`, `firebase_*`, etc.

Init notificações: `geral/notifications/store.rs`.


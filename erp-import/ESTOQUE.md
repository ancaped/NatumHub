# Estoque ERP → Nexus (regra canônica)

Erros de quantidade em Compras (Matéria-Prima, Embalagens, Coloração, Material de Apoio) **não podem** inventar fórmulas alternativas. Use sempre estes campos.

## Fonte da verdade

| Tipo de item | Tabela ERP | Campo estoque (tela) | Reserva | Destino Postgres | Módulos |
|--------------|------------|----------------------|---------|------------------|---------|
| Insumos (MP / embalagens) | `Insumos` | **`nQtdeEstoque`** (“Estoque atual” / tela do ERP) | `nqtdeReserva` | `stock_snapshots` (passo D1) | Compras MP/Emb, Estoque |
| Materiais | `Materiais` | `nQtdeEstoque` (sem coluna A) | `0` | `stock_snapshots` (passo D2) | Compras |
| Produtos (Coloração `1.34.*`, Apoio `1.30.*`, acabados) | `Produtos` | `nQtdeEstoque` | — | `estoque_atual.estoque` (passo A) | Compras Coloração/Apoio, Produção |

Mapeamento complementar (insumos) — espelho da tela/planilha ERP:

| ERP | Hub | Uso na UI |
|-----|-----|-----------|
| `nQtdeEstoque` | `stock_snapshots.stock_qty` | Coluna **Estoque** (igual à tela de pesquisa do ERP, aceitando saldos negativos reais) |
| `nqtdeReserva` | `stock_snapshots.reserved_qty` | Subtítulo **−R** (informativo visual do ERP) |
| `nQtdePedidos` | `stock_snapshots.in_orders` | Espelho do cadastro ERP (auditoria). **+P / Prev. Futura em Compras** usam pedidos de compra abertos (`purchase_order_items`, status ≠ `T`) |
| `nQtdeProducao` | `stock_snapshots.in_production` | Importado; **não** entra na Prev. Futura de Compras |
| `nQtdeEstoqueA` | `stock_qty_a` (só auditoria) | Campo interno do ERP; **não** é o estoque da tela |

Produtos (passo A): `nQtdeProducao` → `producao`; `nPedidos` → `pedidos_aberto` (espelho ERP).

**Produção — não confundir colunas:**

| UI | Fonte | Comparar com ERP? |
|----|-------|-------------------|
| **Est** | `estoque_atual.estoque` ← `Produtos.nQtdeEstoque` | Sim — deve bater com o cadastro |
| **Prod** | `max(nQtdeProducao, Σ Unidades lotes abertos Hub)` | Parcial — se ERP atrasar vs OPs PG, Hub usa as Unidades |
| **Ped** | residual M/N (`PP/LB/EX/CF/AL`, janela `sales_faltas_days_limit`) | **Não** é `nPedidos` do cadastro |
| **EFP** | `Est + Prod − Ped` | **Não** — projeção Hub |

Excel de levantamento e contagem física **não** são fonte canônica: sync A / `resync-produtos` sobrescreve `estoque`/`producao`/`pedidos_aberto`.

**Vendas / faltas / Compras:** mesma setting e `d_pedido::date` (coluna é `text` no Postgres).

**Importante:** o Hub espelha fielmente o da **tela do ERP** (`nQtdeEstoque`). **Não** inventar fórmulas alternativas nem usar `nQtdeEstoqueA`.

## Regras

1. **Estoque exibido (insumos)** = `nQtdeEstoque` do ERP, **sem truncar** (FLOAT/REAL) — mesmo valor da pesquisa “Estoque atual” do ERP (mesmo que negativo).
2. **Reserva exibida** em Compras = `nqtdeReserva` (ou fallback de lotes só para exibição) — informativa visual.
3. **Previsão futura** (planejamento Compras MP/Emb):
   - `pedidos` = `SUM(n_qtde − n_chegou)` em pedidos de compra com `c_status <> 'T'` (não o `nQtdePedidos` do cadastro).
   - `sim_producao` = consumo de insumos se produzir produtos em **Produzir Urgente** / **Abrir Ordem** (`producao_recomendada` × formulação).
   - `Prev. Futura = estoque + pedidos + entradas_manuais_OPEN − saídas_manuais_OPEN − sim_producao`.
   - Ordens Manuais (`manual_stock_orders` status `OPEN`) ajustam a previsão até marcar **Lançado no ERP** (`POSTED`); não alteram `stock_snapshots`.
   - **Sem** `− nqtdeReserva`, **sem** `− remaining_reserved` de lotes, **sem** `+ in_production`.
4. Sync **substitui** `stock_snapshots` dos códigos sincronizados.
5. D1/D2 são **reconsultados imediatamente antes** do INSERT dos snapshots.
6. Queries espelho: `erp-import/sql/A-produtos.sql`, `D1-estoque-insumos.sql`, `D2-estoque-materiais.sql` + `legacy_db.rs`.
7. Tabela real no Postgres: **`stock_snapshots`**.

## Auditoria (supervisor)

Algoritmo: `|Hub − ERP| > 0,01` em **estoque, reserva, produção e pedidos** (produtos: estoque/produção/pedidos em `estoque_atual`). Fonte de tela = **`nQtdeEstoque`**. Insumos ganha de Materiais no mesmo código.

| Método | Rota | Uso |
|--------|------|-----|
| GET | `/api/admin/audit/stock/:code` | Compara Hub × ERP ao vivo (multi-campo; `match*` + `warnings`) |
| POST | `/api/admin/audit/stock/:code/refresh` | Re-lê pontual e grava |
| POST | `/api/admin/audit/stock/verify-all` | Stream NDJSON: progresso + correção **Insumos + Materiais + Produtos** |
| POST | `/api/admin/audit/stock/verify-insumos` | Alias sem stream (mesmo núcleo I+M+P) |
| POST | `/api/admin/audit/stock/resync-insumos` | Regrava todos os insumos com `nQtdeEstoque` |
| POST | `/api/admin/audit/stock/resync-produtos` | Regrava `estoque_atual` com `Produtos.nQtdeEstoque` |

**Stream `verify-all`:** linhas `{ "type":"progress", processed, total, repaired, phase, currentCode }` e final `{ "type":"done", checked, repaired, samples, bySource }`. `samples` lista até **200** códigos corrigidos (hub→erp). `repaired === 0` = zero divergências de estoque.

**Pós-sync automático:** após cada sync ERP bem-sucedido o Hub roda `verify_and_repair_all_stocks` (I+M+P, leitura limpa). Se corrigir algum código, notifica no sino. Botão em Configurações → Sync ERP (com barra de progresso). Atalho: ícone de sync na top bar (supervisor).

**Compras −R:** preferir `stock_snapshots.reserved_qty` (= `nqtdeReserva`); só usar soma de lotes se o espelho ERP ≈ 0. Formatar estoque com até 4 casas (ex.: `-3,5180`).

Caso de teste: `9.15.034` — Hub `stock_qty` = ERP `nQtdeEstoque` (`-3,5180` kg na tela do ERP); −R = `nqtdeReserva` (`501,945`).

## Checklist ao alterar importação de estoque

- [ ] Alterou Rust → atualizou o `.sql` correspondente
- [ ] Passo A usa `CAST(... AS FLOAT)` para estoque/produção/pedidos
- [ ] D1 grava `stock_qty` a partir de `nQtdeEstoque`
- [ ] UI de Compras mostra estoque + −R/+P (sem “Disponível”)
- [ ] Prev. Futura = estoque + pedidos
- [ ] `cargo check` após mudança

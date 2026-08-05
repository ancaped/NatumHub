# Estoque ERP → NatumHub (regra canônica)

Erros de quantidade em Compras (Matéria-Prima, Embalagens, Coloração, Material de Apoio) **não podem** inventar fórmulas alternativas. Use sempre estes campos.

## Fonte da verdade

| Tipo de item | Tabela ERP | Campo estoque (tela) | Reserva | Destino Postgres | Módulos |
|--------------|------------|----------------------|---------|------------------|---------|
| Insumos (MP / embalagens) | `Insumos` | **`nQtdeEstoque`** (“Estoque atual”) | `nqtdeReserva` | `stock_snapshots` (passo D1) | Compras MP/Emb, Estoque |
| Materiais | `Materiais` | `nQtdeEstoque` (sem coluna A) | `0` | `stock_snapshots` (passo D2) | Compras |
| Produtos (Coloração `1.34.*`, Apoio `1.30.*`, acabados) | `Produtos` | `nQtdeEstoque` | — | `estoque_atual.estoque` (passo A) | Compras Coloração/Apoio, Produção |

Mapeamento complementar (insumos) — espelho da planilha ERP:

| ERP | Hub | Uso na UI |
|-----|-----|-----------|
| `nQtdeEstoque` | `stock_snapshots.stock_qty` | Coluna **Estoque** (igual à pesquisa do ERP) |
| `nqtdeReserva` | `stock_snapshots.reserved_qty` | Subtítulo **−R** (informativo; não descontar de novo) |
| `nQtdePedidos` | `stock_snapshots.in_orders` | Espelho do cadastro ERP (auditoria). **+P / Prev. Futura em Compras** usam pedidos de compra abertos (`purchase_order_items`, status ≠ `T`) |
| `nQtdeProducao` | `stock_snapshots.in_production` | Importado; **não** entra na Prev. Futura de Compras |
| `nQtdeEstoqueA` | (só auditoria) | Campo interno do ERP; **não** é o estoque da tela |

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

**Importante:** em centenas de insumos `nQtdeEstoque ≠ nQtdeEstoqueA`. O Hub espelha o da **tela** (`nQtdeEstoque`). **Não** inventar coluna “Disponível”.

## Regras

1. **Estoque exibido (insumos)** = `nQtdeEstoque` do ERP, **sem truncar** (FLOAT/REAL) — mesmo valor da pesquisa “Estoque atual”.
2. **Reserva exibida** em Compras = `nqtdeReserva` (ou fallback de lotes só para exibição) — informativa; **não** subtrair de novo do estoque nem da Prev. Futura.
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

| Método | Rota | Uso |
|--------|------|-----|
| GET | `/api/admin/audit/stock/:code` | Compara Hub × ERP ao vivo (`stockQty` = tela; `stockQtyA` = diagnóstico) |
| POST | `/api/admin/audit/stock/:code/refresh` | Re-lê pontual e grava |
| POST | `/api/admin/audit/stock/verify-insumos` | Confere todos os insumos Hub × tela; **corrige** divergências (`|Δ| > 0,01`) |
| POST | `/api/admin/audit/stock/resync-insumos` | Regrava todos os insumos com `nQtdeEstoque` |
| POST | `/api/admin/audit/stock/resync-produtos` | Regrava `estoque_atual` com `Produtos.nQtdeEstoque` |

**Pós-sync automático:** após cada sync ERP bem-sucedido o Hub roda `verify-insumos` (leitura limpa, sem `NOLOCK`). Se corrigir algum código, notifica no sino (Configurações + Compras MP). Botão manual em Configurações → Sync ERP.

Caso de teste: `9.15.019` — Hub `stock_qty` ≈ ERP tela `nQtdeEstoque` (~−530 kg); `nQtdeEstoqueA` (~−85) só aparece em auditoria.

## Checklist ao alterar importação de estoque

- [ ] Alterou Rust → atualizou o `.sql` correspondente
- [ ] Passo A usa `CAST(... AS FLOAT)` para estoque/produção/pedidos
- [ ] D1 grava `stock_qty` a partir de `nQtdeEstoque`
- [ ] UI de Compras mostra estoque + −R/+P (sem “Disponível”)
- [ ] Prev. Futura = estoque + pedidos
- [ ] `cargo check` após mudança

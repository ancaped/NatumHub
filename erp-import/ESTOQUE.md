# Estoque ERP → NatumHub (regra canônica)

Erros de quantidade em Compras (Matéria-Prima, Embalagens, Coloração, Material de Apoio) **não podem** inventar fórmulas alternativas. Use sempre estes campos.

## Fonte da verdade

| Tipo de item | Tabela ERP | Campo estoque (tela) | Reserva | Destino Postgres | Módulos |
|--------------|------------|----------------------|---------|------------------|---------|
| Insumos (MP / embalagens) | `Insumos` | **`nQtdeEstoqueA`** (fallback `nQtdeEstoque` se A for NULL) | `nqtdeReserva` | `stock_snapshots` (passo D1) | Compras MP/Emb, Estoque |
| Materiais | `Materiais` | `nQtdeEstoque` (sem coluna A) | `0` | `stock_snapshots` (passo D2) | Compras |
| Produtos (Coloração `1.34.*`, Apoio `1.30.*`, acabados) | `Produtos` | `nQtdeEstoque` | — | `estoque_atual.estoque` (passo A) | Compras Coloração/Apoio, Produção |

Mapeamento complementar (insumos) — espelho da planilha ERP:

| ERP | Hub | Uso na UI |
|-----|-----|-----------|
| `nQtdeEstoqueA` | `stock_snapshots.stock_qty` | Coluna **Estoque** (já líquido da reserva operacional) |
| `nqtdeReserva` | `stock_snapshots.reserved_qty` | Subtítulo **−R** (informativo; não descontar de novo) |
| `nQtdePedidos` | `stock_snapshots.in_orders` | Subtítulo **+P** e entra na Prev. Futura |
| `nQtdeProducao` | `stock_snapshots.in_production` | Importado; **não** entra na Prev. Futura de Compras |

Produtos (passo A): `nQtdeProducao` → `producao`; `nPedidos` → `pedidos_aberto` (espelho ERP).

**Produção — Ped na UI:** residual de pedidos de venda abertos (`sales_order_items`, status ≠ FT/CA), filtrado pela setting **`sales_faltas_days_limit`** (Configurações → Janela de pedidos de venda). `0` = sem limite de data. EFP = `estoque + producao - pedidos` (com essa janela). Overrides manuais (`pedidos_manual`) permanecem.

**Vendas / faltas / Compras:** mesma setting e `d_pedido::date` (coluna é `text` no Postgres).

**Importante:** em centenas de insumos `nQtdeEstoque ≠ nQtdeEstoqueA`. O Hub espelha **A**. **Não** inventar coluna “Disponível”.

## Regras

1. **Estoque exibido (insumos)** = `nQtdeEstoqueA` do ERP, **sem truncar** (FLOAT/REAL). Esse valor **já desconta** a reserva operacional no ERP.
2. **Reserva exibida** em Compras = `nqtdeReserva` (ou fallback de lotes só para exibição) — informativa; **não** subtrair de novo do estoque nem da Prev. Futura.
3. **Previsão futura** (planejamento Compras):
   - `Prev. Futura = estoque + pedidos` (`current_stock + in_orders`).
   - **Sem** `− nqtdeReserva`, **sem** `− remaining_reserved` de lotes, **sem** `+ in_production`.
4. Sync **substitui** `stock_snapshots` dos códigos sincronizados.
5. D1/D2 são **reconsultados imediatamente antes** do INSERT dos snapshots.
6. Queries espelho: `erp-import/sql/A-produtos.sql`, `D1-estoque-insumos.sql`, `D2-estoque-materiais.sql` + `legacy_db.rs`.
7. Tabela real no Postgres: **`stock_snapshots`**.

## Auditoria (supervisor)

| Método | Rota | Uso |
|--------|------|-----|
| GET | `/api/admin/audit/stock/:code` | Compara Hub × ERP ao vivo |
| POST | `/api/admin/audit/stock/:code/refresh` | Re-lê pontual e grava |
| POST | `/api/admin/audit/stock/resync-insumos` | Regrava todos os insumos com `nQtdeEstoqueA` |

Caso de teste: `9.15.065` — Estoque ≈ 98,8; R ≈ 7,3; Prev. Futura ≈ 98,8 + P (não 91,5).

## Checklist ao alterar importação de estoque

- [ ] Alterou Rust → atualizou o `.sql` correspondente
- [ ] Passo A usa `CAST(... AS FLOAT)` para estoque/produção/pedidos
- [ ] D1 grava `stock_qty` a partir de `COALESCE(nQtdeEstoqueA, nQtdeEstoque)`
- [ ] UI de Compras mostra estoque + −R/+P (sem “Disponível”)
- [ ] Prev. Futura = estoque + pedidos
- [ ] `cargo check` após mudança

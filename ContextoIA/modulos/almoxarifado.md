# Almoxarifado (módulo central)

Hub top-level **`almoxarifado_hub`** (irmão de Estoque/Compras), com sidebar AppLayout:

| Key | Papel |
|-----|--------|
| `estoque_itens` | Catálogo unificado (somente monitorados) |
| `estoque_almoxarifado` | Consumíveis — **vínculo ERP** (qualquer `items`) |
| `estoque_supermercado` | Famílias locais — **sem ERP**; compras com marca/embalagem |
| `estoque_pecas` | Peças + vida útil — vínculo ERP |
| `estoque_equipamentos` | Parque de máquinas |
| `estoque_manutencoes` | Ordens de manutenção |

`compras_almoxarifado` permanece em Compras (demandas).

## Cadastro

- **ERP** (`POST /api/almox/items/link`): código imutável + `erp_description`; Hub edita `description`/`unit`/mín/ideal.
- **Local** (`POST /api/almox/items/local`): **somente** `section=supermercado` → `APP_*`, unidade padrão da família.
- Entrada supermercado: `packCount` × `contentPerPack` → qty na unidade padrão; `totalPaid` → `unit_cost` (R$/unidade).

## SQL

`002_almoxarifado.sql` · `003_estoque_ops.sql` · `004_almox_erp_super.sql`

## Frontend

`Frontend/src/modules/estoque/ops/EstoqueOpsView.tsx`

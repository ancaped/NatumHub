# Almoxarifado (módulo central)

Hub top-level **`almoxarifado_hub`** (irmão de Estoque/Compras), com sidebar AppLayout:

| Key | Papel |
|-----|--------|
| `estoque_itens` | Catálogo unificado (somente monitorados) |
| `estoque_almoxarifado` | Consumíveis — **vínculo ERP** (qualquer `items`) |
| `estoque_supermercado` | Famílias locais — **sem ERP**; compras com marca/embalagem |
| `estoque_pecas` | Catálogo de peças de reposição + estoque + vida útil — vínculo ERP |
| `estoque_equipamentos` | Parque: ficha da máquina (foto, marca, modelo, ano), histórico/agenda de OS, peças associadas e gastos |
| `estoque_manutencoes` | Alias de permissão — abre o mesmo parque na aba Agenda |

`compras_almoxarifado` permanece em Compras (demandas).

## Equipamentos (parque)

Uma ficha por máquina: foto, código, marca, modelo, ano, série, setor e status. Ao abrir:

- **Manutenções** — histórico, OS programadas/pendentes, custo e peças trocadas ou só inspecionadas
- **Peças** — catálogo associado à máquina, estoque, vezes trocada e tempo médio de uso
- **Ficha** — edição dos dados e fotos

Agenda do parque lista OS abertas e o histórico recente. Peças continuam com cadastro próprio em `estoque_pecas` (estoque/ERP) e são vinculadas à máquina.

SQL: `002`–`004` · `038_equipamentos_parque.sql` (`brand`/`model`/`manufacture_year`/`serial_number`, `estoque_manutencao_pecas`, `scheduled_at`).

## Cadastro

- **ERP** (`POST /api/almox/items/link`): código imutável + `erp_description`; Hub edita `description`/`unit`/mín/ideal.
- **Local** (`POST /api/almox/items/local`): **somente** `section=supermercado` → `APP_*`, unidade padrão da família.
- Entrada supermercado: `packCount` × `contentPerPack` → qty na unidade padrão; `totalPaid` → `unit_cost` (R$/unidade).

## SQL

`002_almoxarifado.sql` · `003_estoque_ops.sql` · `004_almox_erp_super.sql` · `038_equipamentos_parque.sql`

## Frontend

`Frontend/src/modules/estoque/ops/EstoqueOpsView.tsx` · `Frontend/src/modules/estoque/equipamentos/EquipamentosView.tsx`

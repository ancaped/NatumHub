# Almoxarifado / Estoque ops

Hub `almoxarifado_hub`. SQL: `002`–`004`.

| Método | Path | Notas |
|--------|------|--------|
| GET | `/api/almox/items` | `?section=&onlyActive=` |
| GET | `/api/almox/items/search` | qualquer `items` ERP |
| POST | `/api/almox/items/link` | ERP → seção (não supermercado) |
| POST | `/api/almox/items/local` | só `section=supermercado` |
| GET/PUT | `/api/almox/items/:code` / `…/config` | description/unit Hub |
| GET/POST | `/api/almox/movements` | entrada Super: pack*/totalPaid |
| GET | `/api/almox/items/:code/stats` | + `avgUnitCost30` |
| GET/POST/PUT | `/api/almox/equipments` | |
| GET/POST/PUT | `/api/almox/maintenances` | |
| * | `/api/almox/demands*` | compras |

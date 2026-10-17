# Movimentos de estoque de insumos (ERP → Hub)

Documenta o que o Nexus **já importa**, o que ainda falta, e como descobrir no SQL Server os tipos extras (acertos, inventário, etc.).

## Já sincronizado hoje

| Origem ERP | Passo | `stock_movements` | Label no extrato |
|------------|-------|-------------------|------------------|
| `COMPRAS1`/`COMPRAS2` (NF) | E | `entrada` · item insumo/material | Entrada NF |
| `Lotes_Baixas` | I | `saida` · insumo | Saída OP |
| `Lotes` | H | `entrada` · **produto** | (não é insumo) |
| `VENDAS*` | J | `saida` · **produto** | (não é insumo) |

Saldos de insumos: passo **D1** → `stock_snapshots.stock_qty` = `nQtdeEstoque` (tela “Estoque atual”).

## Exemplos citados pelo negócio (ainda não mapeados)

Textos como `(saida - acerto de estoque)` e `(entrada - Acerto Manual)` **não aparecem** no código Hub. São candidatos a kardex/tipos de documento no legado — descoberta via [`sql/O-discover-movimentos-insumos.sql`](sql/O-discover-movimentos-insumos.sql).

Outros tipos prováveis: inventário, transferência, devolução, ajuste manual.

## Classificação no Hub (extrato Divergências)

O módulo **Estoque → Insumos → Divergências** classifica linhas assim:

| `movement_type` / heurística | Rótulo |
|------------------------------|--------|
| `entrada` (+ NF) | Entrada NF |
| `saida` (+ OP em details) | Saída OP |
| `acerto_entrada` / details com “acerto” + entrada | Acerto (entrada) |
| `acerto_saida` / details com “acerto” + saída | Acerto (saída) |
| `inventario_*` | Inventário |
| demais | Outros |

Heurística Fase 1: se `details`/`cjustificativa` contém `acerto`, `ajuste` ou `invent`, marca `MOV_EXTRA` / tipifica no extrato **mesmo antes** do passo O importar tabela dedicada.

## Passo O (fase 2)

1. Rodar discovery no master → preencher tabela “encontramos” abaixo.
2. Ajustar [`sql/O-movimentos-insumos.sql`](sql/O-movimentos-insumos.sql) com a query real.
3. Ativar import em `legacy_db.rs` (sync). Destino: `stock_movements` com `movement_type` discriminado.

### Encontramos (preencher após discovery)

| Tabela ERP | Colunas chave | Tipos/valores | Status |
|------------|---------------|---------------|--------|
| _a preencher_ | | | pendente |

## API relacionada

- `GET /api/estoque/insumos/divergencias`
- `GET /api/estoque/insumos/:code/divergencias`
- `POST|DELETE /api/estoque/insumos/:code/divergencias/resolver`

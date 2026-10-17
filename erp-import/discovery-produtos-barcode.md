# Discovery — código de barras em Produtos

## Decisão

Usar **`Produtos.cCodBarras`** (nvarchar 20) → Postgres `produtos.codigo_barras`.

- `cCodBarrasCX` / `cCodBarrasCX2` = códigos de caixa (fora do escopo do relatório unitário).
- Discovery: `cargo run --bin discover_produtos_barcode` → este arquivo.

## Colunas candidatas (Produtos)

| Coluna | Tipo | Len | Uso |
|--------|------|-----|-----|
| cCodBarras | nvarchar | 20 | **Sync passo A** (EAN unitário) |
| cCodBarrasCX | nvarchar | 20 | Caixa — ignorado |
| cCodBarrasCX2 | nvarchar | 20 | Caixa 2 — ignorado |

## Amostras (cCodBarras)

| Codigo | Valor |
|--------|-------|
| 03.11.001 | 7898553231803 |
| 03.11.002 | 7898553232350 |
| 03.11.003 | 7898553233647 |
| 03.11.004 | 7898553233913 |
| 03.11.006 | 7898553235788 |

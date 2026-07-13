# Importação ERP — guia para IAs

Sync **SQL Server → PostgreSQL (Supabase)**. Doc operacional: [`../../erp-import/`](../../erp-import/).

## Popular dados

| O quê | Como |
|-------|------|
| Hub (operadores/settings) | `Saves/seed_hub_from_sqlite.sql` no SQL Editor **ou** setup do app |
| Cadastros / estoque / pedidos | `cargo run --bin run_sync` ou `POST /api/import/sync` |

**Não** dump massivo do `data.db` via pooler.

## Código

| Item | Caminho |
|------|---------|
| Sync | `Backend/src/core/legacy_db.rs` |
| HTTP | `POST /api/import/sync` |
| CLI | `Backend/src/bin/run_sync.rs` |
| Lock | `sync_status` |

## Docs

[`PASSOS.md`](../../erp-import/PASSOS.md) · [`DESTINO-POSTGRES.md`](../../erp-import/DESTINO-POSTGRES.md) · [`sql/`](../../erp-import/sql/)

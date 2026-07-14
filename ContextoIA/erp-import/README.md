# Importação ERP — guia para IAs

Sync **SQL Server → PostgreSQL** no PC Principal. Doc operacional: [`../../erp-import/`](../../erp-import/).

## Popular dados

| O quê | Como |
|-------|------|
| Hub (supervisor / operadores) | Setup do app na 1ª abertura |
| Cadastros / estoque / pedidos | `cargo run --bin run_sync` ou `POST /api/import/sync` |

## Código

| Item | Caminho |
|------|---------|
| Sync | `Backend/src/core/legacy_db.rs` |
| HTTP | `POST /api/import/sync` |
| CLI | `Backend/src/bin/run_sync.rs` |
| Lock | `sync_status` |

## Docs

[`PASSOS.md`](../../erp-import/PASSOS.md) · [`DESTINO-POSTGRES.md`](../../erp-import/DESTINO-POSTGRES.md) · [`sql/`](../../erp-import/sql/)

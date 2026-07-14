# Módulo Core

PostgreSQL (`pg_db` / `db`) + sync ERP SQL Server (`legacy_db`).

| Arquivo | Função |
|---------|--------|
| `pg_db.rs` | Pool, `DATABASE_URL` (`postgres.env`) |
| `db.rs` | Facade / helpers sobre o pool |
| `legacy_db.rs` | Sync ERP — docs: `erp-import/` |
| `app_config.rs` | `appMode` master/client |
| `pg_row.rs` | Decode tolerante INT4/INT8 |

Sync só no **PC Principal**. Doc: [`ContextoIA/arquitetura/multi_usuario.md`](../../../../ContextoIA/arquitetura/multi_usuario.md)

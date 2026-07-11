# Módulo Core

SQLite + integração ERP SQL Server.

| Arquivo | Função |
|---------|--------|
| `db.rs` | SQLite, migrações |
| `legacy_db.rs` | Sync ERP — **docs:** `erp-import/` |
| `db_backup.rs` | Backup pré-sync |
| `app_config.rs` | `appMode` master/client |

Sync só no **PC Principal**. Doc IA: [`../../../../ContextoIA/arquitetura/multi_usuario.md`](../../../../ContextoIA/arquitetura/multi_usuario.md)

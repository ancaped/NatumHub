# Configurações — Backend

| Área | Código |
|------|--------|
| Settings KV | `handlers.rs` → `/api/settings/:key` |
| Watch planilhas | `/api/import/watch-config` |
| Agenda sync ERP | `/api/import/erp-sync-schedule` + `erp_sync_scheduler.rs` |
| Backup Postgres local | `/api/admin/pg-backup*` + `pg_backup.rs` (retenção horário/diário/semanal/mensal) |
| PC principal | `hub/handlers.rs` → `claim-principal` |

Doc IA: [`../../../../ContextoIA/arquitetura/multi_usuario.md`](../../../../ContextoIA/arquitetura/multi_usuario.md)

# Importação ERP — guia para IAs

Sincronização **SQL Server (ERP NATUM) → SQLite (`Saves/data.db`)**.  
Documentação operacional completa fica em **[`../../erp-import/`](../../erp-import/)** — não duplicar queries aqui.

## Onde está o código

| Item | Caminho |
|------|---------|
| Implementação | `Backend/src/core/legacy_db.rs` — `sync_from_sql_server` |
| Trigger HTTP | `POST /api/import/sync` → `handlers/imports.rs` |
| CLI dev | `Backend/src/bin/run_sync.rs` |
| Scheduler auto | `modules/geral/configuracoes/erp_sync_scheduler.rs` |
| Backup pré-sync | `Backend/src/core/db_backup.rs` |

## Documentação canônica (repo)

| Arquivo | Conteúdo |
|---------|----------|
| [`../../erp-import/README.md`](../../erp-import/README.md) | Visão geral, diagrama, como executar |
| [`../../erp-import/PASSOS.md`](../../erp-import/PASSOS.md) | Passos A–N e módulos consumidores |
| [`../../erp-import/DESTINO-SQLITE.md`](../../erp-import/DESTINO-SQLITE.md) | Tabelas destino no `data.db` |
| [`../../erp-import/sql/*.sql`](../../erp-import/sql/) | Queries SQL Server (espelho do Rust) |

## Regras para agentes

1. **Sync só no PC Principal** (`appMode: master`).
2. Ao alterar query no Rust, **atualizar o `.sql` correspondente** em `erp-import/sql/`.
3. **Não ler** `legacy_db.rs` inteiro — usar PASSOS + SQL + DESTINO-SQLITE.
4. Settings SQL: `sql_host`, `sql_port`, `sql_user`, `sql_password`, `sql_database`.
5. Sync manual/auto emite notificação (`hub_settings`).

## Como executar

- **UI:** Configurações → Sincronização ERP (principal, admin).
- **API:** `POST /api/import/sync` (Bearer admin + principal).
- **CLI:** `cd Backend && cargo run --bin run_sync`

Agenda automática: [`../arquitetura/multi_usuario.md`](../arquitetura/multi_usuario.md) § Sync ERP automático.

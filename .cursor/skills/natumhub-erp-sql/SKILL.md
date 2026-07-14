---
name: natumhub-erp-sql
description: >-
  Integração ERP NatumHub: sync SQL Server → PostgreSQL, legacy_db, queries em
  erp-import/sql, PASSOS, DESTINO-POSTGRES, scheduler e settings sql_*.
  Use quando o usuário pedir sync ERP, importação SQL, legacy_db, query ERP,
  passo A-N, tabelas destino Postgres, agenda de sync ou conexão SQL Server.
---

# NatumHub — Skill: Integração ERP / SQL

## Quando usar

Alterar sync ERP, queries SQL Server, mapeamento para PostgreSQL, ou agenda automática.

## Ler primeiro

1. `ContextoIA/erp-import/README.md`
2. `erp-import/PASSOS.md`
3. `erp-import/DESTINO-POSTGRES.md`
4. `erp-import/sql/<passo>.sql`
5. Trecho de `Backend/src/core/legacy_db.rs` — **nunca o arquivo inteiro**

## Código

| Item | Caminho |
|------|---------|
| Sync | `legacy_db.rs` → `sync_from_sql_server` |
| HTTP | `POST /api/import/sync` |
| CLI | `Backend/src/bin/run_sync.rs` |
| Scheduler | `erp_sync_scheduler.rs` |
| Lock | tabela `sync_status` |

## Regras

1. Sync só no **PC Principal** (`appMode: master`).
2. Alterou Rust → atualizar `erp-import/sql/*.sql`.
3. Settings: `sql_host`, `sql_port`, `sql_user`, `sql_password`, `sql_database`.
4. DB: `Saves/postgres.env` (`DATABASE_URL`). Postgres **obrigatório** no master (não SQLite).

## Executar

| Canal | Como |
|-------|------|
| UI | Configurações → Sync ERP |
| API | `POST /api/import/sync` |
| CLI | `cargo run --bin run_sync` |

## Checklist alteração

- [ ] Passo A–N em PASSOS.md
- [ ] Tabela destino em DESTINO-POSTGRES.md
- [ ] Rust + .sql espelhados
- [ ] `cargo check`

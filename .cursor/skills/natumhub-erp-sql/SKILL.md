---
name: natumhub-erp-sql
description: >-
  Integração ERP NatumHub: sync SQL Server → SQLite, legacy_db, queries em
  erp-import/sql, PASSOS, DESTINO-SQLITE, scheduler e settings sql_*.
  Use quando o usuário pedir sync ERP, importação SQL, legacy_db, query ERP,
  passo A-N, tabelas destino SQLite, agenda de sync ou conexão SQL Server.
---

# NatumHub — Skill: Integração ERP / SQL

## Quando usar

Alterar sync ERP, queries SQL Server, mapeamento para SQLite, ou agenda automática.

## Ler primeiro (nesta ordem)

1. `ContextoIA/erp-import/README.md`
2. `erp-import/PASSOS.md` — passos A–N
3. `erp-import/DESTINO-SQLITE.md` — tabelas destino
4. `erp-import/sql/<passo>.sql` — query específica
5. Trecho relevante de `Backend/src/core/legacy_db.rs` — **nunca o arquivo inteiro**

## Onde está o código

| Item | Caminho |
|------|---------|
| Sync principal | `Backend/src/core/legacy_db.rs` → `sync_from_sql_server` |
| HTTP trigger | `POST /api/import/sync` → `handlers/imports.rs` |
| CLI dev | `Backend/src/bin/run_sync.rs` |
| Scheduler | `modules/geral/configuracoes/erp_sync_scheduler.rs` |
| Backup pré-sync | `Backend/src/core/db_backup.rs` |

## Regras críticas

1. **Sync só no PC Principal** (`appMode: master` em `Saves/client_config.json`).
2. Alterou query no Rust → **atualizar** `erp-import/sql/*.sql` correspondente.
3. Settings: `sql_host`, `sql_port`, `sql_user`, `sql_password`, `sql_database`.
4. Sync emite notificação (`hub_settings`) — manter se alterar fluxo.
5. Backup automático antes de sync — não desabilitar sem motivo.

## Executar sync

| Canal | Como |
|-------|------|
| UI | Configurações → Sincronização ERP (admin, principal) |
| API | `POST /api/import/sync` (Bearer admin) |
| CLI | `cd Backend && cargo run --bin run_sync` |

Agenda: settings `erp_sync_auto_ativo`, `erp_sync_horarios` — ver `ContextoIA/arquitetura/multi_usuario.md`.

## Workflow de alteração

```
- [ ] Identificar passo (A–N) em PASSOS.md
- [ ] Ler .sql + trecho legacy_db.rs do passo
- [ ] Confirmar tabela destino em DESTINO-SQLITE.md
- [ ] Editar Rust + espelhar .sql
- [ ] cargo check
- [ ] Testar sync (CLI ou API) se possível
- [ ] Atualizar PASSOS/DESTINO se contrato mudou
```

## Módulos consumidores

Consultar `PASSOS.md` — cada passo lista quais módulos FE/BE usam os dados importados. Só ler docs desses módulos se necessário.

## Regras gerais

- Secundários (`client`) **não** rodam import — consomem API do master.
- Respostas em **pt-BR**; SQL/Rust identifiers em inglês/snake_case do projeto.

# Auth, rede e notificações

## Modelo atual

Todos os PCs usam **API local (Axum :3001)** + **PostgreSQL central** (hoje Supabase; preparado para local — ver [migracao_postgres.md](../banco-dados/migracao_postgres.md)).

Não há mais escolha “PC Principal vs Terminal” no setup. Concorrência de sync ERP: tabela `sync_status`.

| | Comportamento |
|--|----------------|
| API Axum | Sobe em todo app (master local) |
| Banco | PostgreSQL (`Saves/postgres.env`; legado `supabase.env`) |
| Cadastro de usuários | **Somente supervisor** |
| Sync ERP / SQL / backup | Painel supervisor |

`deviceId` / `deviceLabel` identificam a instalação (`DispositivosPanel`).

## Auth operador

Tabelas: `hub_operators`, `hub_operator_modules`, `hub_sessions`, `hub_audit_log`.

| Rota | Auth |
|------|------|
| `GET /api/health`, `/api/auth/login`, `/api/auth/operators`, `/api/auth/session`, `/api/auth/setup-status`, `/api/auth/setup-supervisor` | Pública / setup |
| Demais `/api/*` | Bearer |

Supervisor-only (POST/PUT/DELETE): `/api/auth/operators/manage/*`, devices, sync ERP, dump, erp-sync-schedule, `admin/db-reset`.

## Fluxo 1ª execução

1. Wizard: nome do dispositivo → API local.
2. Se não há supervisor com senha → `SetupSupervisorView`.
3. Login; supervisor cadastra demais operadores em Configurações.

## Notificações

`hub_notifications` / `hub_notification_reads`. UI: `NotificationsPanel`. Filtradas por `module_key` ∩ permissões.

## Sync ERP automático

Settings `erp_sync_auto_ativo`, `erp_sync_horarios`. Scheduler em qualquer PC; lock `sync_status` evita corrida.

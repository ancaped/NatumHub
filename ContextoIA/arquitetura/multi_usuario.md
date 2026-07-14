# Auth, rede e notificações

## Modelo de produção

```
Terminais (client) ──HTTP──► PC Principal Axum :3001 ──► PostgreSQL local
                                      └── sync ERP / backups / manifests
```

| Papel | Comportamento |
|-------|----------------|
| **PC Principal** (`appMode: master`) | Sobe Axum `:3001`, exige `Saves/postgres.env`, sync ERP, backups, serve updater |
| **Terminal** (`appMode: client`) | Só UI; `apiOrigin` aponta para o master; **sem** Postgres local |
| Banco | PostgreSQL no master |
| Cadastro de usuários | **Somente supervisor** |
| Login | Nome digitado + senha (sem listar operadores) |

Instalação: [`../devops/`](../devops/README.md). Tailscale opcional: [`../devops/tailscale.md`](../devops/tailscale.md).

`deviceId` / `deviceLabel` identificam a instalação (`DispositivosPanel`).

## Auth operador

Tabelas: `hub_operators`, `hub_operator_modules`, `hub_sessions`, `hub_audit_log`.

| Rota | Auth |
|------|------|
| `GET /api/health`, `/api/auth/login`, `/api/auth/setup-status`, `/api/auth/setup-supervisor` | Pública / setup |
| `GET /api/auth/operators` | Pública (legado; login **não** usa) |
| Demais `/api/*` | Bearer |

Supervisor-only: `GET/POST/PUT/DELETE /api/auth/operators/manage`, devices, sync ERP, dump, backups.

## Fluxo 1ª execução

1. Wizard: **PC Principal** ou **Terminal** (+ URL da API se terminal).
2. Master: se não há supervisor com senha → `SetupSupervisorView`.
3. Login com nome + senha; supervisor gerencia operadores (criar / desativar / **excluir**).

## Notificações

`hub_notifications` / `hub_notification_reads`. UI: `NotificationsPanel`. Filtradas por `module_key` ∩ permissões.

## Sync ERP automático

Só no master. Agenda em settings + `erp_sync_scheduler`.

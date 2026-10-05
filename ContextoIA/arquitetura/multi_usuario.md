# Auth, rede e notificações

## Modelo de produção

```
Navegadores (clientes) ──HTTP──► PC Principal / nexus-server :3001 ──► PostgreSQL
   http://nexus.local:3001            └── SPA (Frontend/dist) + sync ERP / backups
```

| Papel | Comportamento |
|-------|----------------|
| **PC Principal** (`appMode: master`) | `nexus-server` em `:3001`, Postgres (`Saves/postgres.env`), sync ERP, backups, serve a SPA |
| **Terminal / cliente** | **Só navegador**. Abre `http://nexus.local:3001` (hosts/DNS → IP do master) |
| Banco | PostgreSQL no master. O database se chama `natumhub` |
| Cadastro de usuários | **Somente supervisor** |
| Login | Nome digitado + senha (sem listar operadores) |
| Atualização | No master: `git pull` em `main` + `npm run build` (Frontend) + reiniciar `nexus-server`. Clientes pegam a UI nova no próximo reload |

Instalação: [`../devops/instalacao_via_repositorio.md`](../devops/instalacao_via_repositorio.md) · headless: [`../devops/instalacao_servidor.md`](../devops/instalacao_servidor.md). Tailscale: [`../devops/tailscale.md`](../devops/tailscale.md).

`deviceId` / `deviceLabel` identificam o dispositivo no login (`localStorage` no navegador).

## Auth operador

Tabelas: `hub_operators`, `hub_operator_modules`, `hub_sessions`, `hub_audit_log`, `hub_audit_events`.

| Rota | Auth |
|------|------|
| `GET /api/health`, `/api/auth/login`, `/api/auth/setup-status`, `/api/auth/setup-supervisor` | Pública / setup |
| `GET /`, assets do SPA, `/login`, `/mapa` | Pública (UI) |
| `GET /api/auth/operators` | Pública (legado; login **não** usa) |
| Demais `/api/*` | Bearer |

Supervisor-only: `GET/POST/PUT/DELETE /api/auth/operators/manage`, devices, sync ERP, dump, backups.

## Fluxo 1ª execução

1. **Master:** wizard PC Principal + Postgres + supervisor.
2. **Clientes:** no PC de cada terminal, hosts com `nexus.local` → IP do master; abrir o navegador na URL acima e fazer login.
3. Login com nome + senha; supervisor gerencia operadores.

## Notificações

`hub_notifications` / `hub_notification_reads`. UI: `NotificationsPanel`. Filtradas por `module_key` ∩ permissões.

## Sync ERP automático

Só no master. Agenda em settings + `erp_sync_scheduler`.

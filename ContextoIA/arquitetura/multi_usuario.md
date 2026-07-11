# Multi-usuário, auth, rede e notificações

## PC Principal vs Secundário

| | Principal (`master`) | Secundário (`client`) |
|--|----------------------|------------------------|
| Axum local | Sim (`0.0.0.0:3001`) | Não |
| `data.db` | Sim | Não — lê via API |
| Sync ERP | Sim (manual + agenda) | Não |
| Config SQL / Firebase backup | Sim (UI admin) | Oculto |
| Quem define tipo | **Admin only** | — |

- `isSyncMaster` é **derivado** (`master` ⇒ true). Não expor checkbox separado.
- `setupLocked`: secundário bloqueado para operadores; admin pode mudar.
- `deviceId` em `client_config.json` — UUID por instalação.
- Registro único: settings `hub_principal_device_id`, `hub_principal_device_label`, `hub_principal_claimed_at`.
- Admin salva como Principal ⇒ `claimPrincipalDevice()` após `saveConfigToTauri`.

**Migrar principal:** novo PC → admin → Principal → Salvar → reiniciar. PC antigo → Secundário ou botão “Tornar secundário”.

## Auth operador

Tabelas: `hub_operators`, `hub_operator_modules`, `hub_sessions`, `hub_audit_log`.

| Rota | Auth |
|------|------|
| `GET /api/health`, `/api/auth/login`, `/api/auth/operators`, `/api/auth/session`, `/login` | Pública |
| `GET /api/hub/client-config` | Pública |
| Demais `/api/*` | Bearer 30d |

Admin-only (POST/PUT/DELETE): `/api/import/sync`, `/api/import/dump`, `/api/import/erp-sync-schedule`, `/api/hub/claim-principal`, `/api/auth/operators/manage/*`.

FE: `auth.ts`, `permissions.ts` (`canAccessView`), guard em `App.tsx`.

## Cliente HTTP

`Frontend/src/modules/geral/lib/connectionConfig.ts` — `getApiOrigin()`, `isPrincipalPc()`, `isClientMode()`.

Modo client: Axum **não** sobe (`lib.rs` `start_axum_server`).

## Notificações

**Tabelas:** `hub_notifications`, `hub_notification_reads` (por operador).

| Rota | Descrição |
|------|-----------|
| `GET /api/notifications` | Lista (filtra `module_key` ∈ modules do user; admin = todos) |
| `GET /api/notifications/unread-count` | Contador |
| `POST /api/notifications/:id/read` | Marca lida |
| `POST /api/notifications/read-all` | Marca todas |

**UI:** status Online/Offline do servidor fica **no painel do sino**, não no header.

**Estender:** chamar `notify(state, MODULE_X, kind, title, message)` após evento do módulo. `kind`: `info|success|warning|error`.

Chaves de módulo: ver `modules_registry.rs` / `MODULE_KEYS` (ex.: `hub_settings` para config/sync ERP).

## Sync ERP automático

- Settings: `erp_sync_auto_ativo`, `erp_sync_horarios` (JSON `["HH:MM",...]`).
- Scheduler: `geral/configuracoes/erp_sync_scheduler.rs` (30s tick, só principal).
- API: `GET|POST /api/import/erp-sync-schedule` (POST admin).
- Manual/auto: `execute_erp_sync()` em `handlers/imports.rs`.

## Firebase / Google Drive

Somente backup `data.db` no **PC Principal**. Login Google ≠ login operador.

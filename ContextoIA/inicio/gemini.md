# NatumHub — Playbook IA (compacto)

> Índice completo: [`../INDEX.md`](../INDEX.md)

## Stack

Tauri 2 + React 19 + TS + Vite + Tailwind · Rust Axum :3001 · SQLite `Saves/data.db` · ERP via SQL Server (`legacy_db`)

## Onde codar

| Camada | Pasta |
|--------|--------|
| UI módulo X | `Frontend/src/modules/<area>/<sub>/` |
| API REST | `Backend/src/handlers/` + `Backend/src/modules/*/router` |
| Domínio espelhado | `Backend/src/modules/` (mesma árvore do FE) |
| Sync ERP | `Backend/src/core/legacy_db.rs` + docs `erp-import/` |
| Geral (auth, config, notif) | `Backend/src/modules/geral/` |

## HTTP no frontend

**Sempre** `apiFetch` / `apiJson` de `geral/lib/http.ts` (injeta Bearer). Nunca `fetch` cru para `/api/*`.

Settings: `getSetting` / `setSettings`. Hub modules: `hubJson('/microbio/...')`.

## Auth

- Login operador local (`/api/auth/login`) — **não** confundir com Firebase (só backup nuvem no principal).
- Rotas protegidas: middleware em `geral/auth/middleware.rs`.
- Permissões: `modules[]` por operador; registry FE `lib/modules/registry.rs` = BE `modules_registry.rs`.
- Admin: `role === 'admin'`.

## Rede multi-usuário

- **PC Principal:** `appMode: master` — Axum + SQLite + sync ERP.
- **PC Secundário:** `appMode: client` — só UI; HTTP → principal.
- Config: `Saves/client_config.json` + `connectionConfig.ts`.
- **Só admin** altera tipo de PC; operadores veem somente leitura.
- Um principal por rede: `POST /api/hub/claim-principal` (admin) + `deviceId` local.
- Detalhes: [`../arquitetura/multi_usuario.md`](../arquitetura/multi_usuario.md).

## Notificações

- UI: `NotificationsPanel.tsx` (sino no Header).
- BE: `geral/notifications/` — filtradas por `module_key` ∩ `modules[]` do operador.
- Criar: `notifications::notify_config(state, kind, title, msg)` ou `notify(..., module_key, ...)`.
- Sync ERP já emite notificação (módulo `hub_settings`).

## Feedbacks

- Envio: widget flutuante (qualquer operador) — registra **solicitante**, data/hora, logs, screenshot.
- Triagem: **Perfil → Gestão de Feedbacks** (somente **admin**). Status: `pending` | `queued` | `in_progress` | `wont_fix` | `resolved`. Prioridade: menor número = mais urgente.
- Arquivos: `Feedbacks/feedback.md` (índice) + `Feedbacks/feedback_<id>/` (`feedback.json`, `triagem.md`, `logs.txt`, `screenshot.png`, `resolucao.md`).
- API: `POST /api/hub/feedbacks`, `GET /api/hub/feedbacks/manage`, `PUT /api/hub/feedbacks/:id`, `POST /api/hub/feedbacks/reorder`.

## Checklist antes de entregar

- [ ] Escopo mínimo (sem refactor não pedido)
- [ ] `cargo check` + `npm run build`
- [ ] Imports/convenções do módulo vizinho
- [ ] Atualizar doc do módulo **só se** mudança de contrato/API

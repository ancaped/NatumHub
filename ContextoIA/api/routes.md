# API REST Axum — referência compacta

Servidor: **`:3001`** · Auth: `Authorization: Bearer <token>` (exceto rotas públicas abaixo).

Implementação: `Backend/src/lib.rs` + `modules/*/router`. Detalhes multi-usuário: [`../arquitetura/multi_usuario.md`](../arquitetura/multi_usuario.md).

## Rotas públicas

`/api/health` · `/api/auth/login` · `/api/auth/operators` · `/api/auth/session` · `/login` · `GET /api/hub/client-config` · `/api/google/callback`

## Auth operador

| Método | Rota | Notas |
|--------|------|-------|
| POST | `/api/auth/login` | `{ displayName }` → token + modules |
| POST | `/api/auth/logout` | Revoga token |
| GET | `/api/auth/me` | Usuário + modules |
| GET | `/api/auth/modules/registry` | Árvore módulos |
| GET/POST | `/api/auth/operators/manage` | Admin |
| PUT/DELETE | `/api/auth/operators/manage/:id` | Admin |

## Hub / rede

| Método | Rota | Notas |
|--------|------|-------|
| GET | `/api/hub/status` | Status + db conectado |
| GET/POST | `/api/hub/client-config` | Config local do dispositivo |

## Notificações

| Método | Rota |
|--------|------|
| GET | `/api/notifications` |
| GET | `/api/notifications/unread-count` |
| POST | `/api/notifications/:id/read` |
| POST | `/api/notifications/read-all` |

Filtradas por `module_key` ∩ permissões do operador.

## Feedbacks

| Método | Rota | Notas |
|--------|------|-------|
| POST | `/api/hub/feedbacks` | Envio (autenticado) |
| GET | `/api/hub/feedbacks/manage` | Admin — triagem |
| GET | `/api/hub/feedbacks/:id` | Admin — detalhe + histórico de notas |
| PUT | `/api/hub/feedbacks/:id` | Admin — status/prioridade/reabrir |
| POST | `/api/hub/feedbacks/:id/notes` | Admin — nova nota |
| POST | `/api/hub/feedbacks/reorder` | Admin — reordenar fila |

Doc: [`../feedbacks/README.md`](../feedbacks/README.md) — fila e resolução via PostgreSQL (sem pastas por ID).

## Settings / config ERP

| Método | Rota | Notas |
|--------|------|-------|
| GET/POST | `/api/settings/:key` | sql_*, firebase_*, etc. |
| GET/POST | `/api/import/watch-config` | Pasta planilhas |
| GET/POST | `/api/import/erp-sync-schedule` | POST admin — horários sync auto |

## Import / sync

| Método | Rota | Notas |
|--------|------|-------|
| POST | `/api/import/sync` | Admin + **PC principal** — ERP→Postgres |
| POST | `/api/import/dump` | Admin — resumo ERP |
| POST | `/api/admin/db-reset` | Admin — reset operacional |
| POST | `/api/import/faturamento` | Multipart Excel |
| POST | `/api/import/levantamento` | Multipart Excel |
| POST | `/api/import/kits` | Multipart Excel |
| GET | `/api/import/history` | |
| GET | `/api/import/status` | Watcher planilhas |

Sync ERP: [`../erp-import/README.md`](../erp-import/README.md) · `legacy_db::sync_from_sql_server` · lock `sync_status`.

## Produção / estoque (amostra — ver `lib.rs` para lista completa)

| Método | Rota |
|--------|------|
| GET | `/api/products`, `/api/kits`, `/api/kits/composicao`, `/api/kits/component-candidates` |
| GET/PUT | `/api/configs`, `/api/configs/:prefix` |
| GET/POST | `/api/overrides`, `/api/overrides/bulk` |
| GET/POST/DELETE | `/api/historico`, `/api/historico/:id` |
| GET | `/api/producao/lotes`, `/api/producao/lotes/:n`, `/api/producao/lotes/:n/detalhes` |
| GET | `/api/vendas/pedidos`, `/api/vendas/faltas` |

## Almoxarifado / Estoque ops

Hub `almoxarifado_hub`. Doc: [`../modulos/almoxarifado.md`](../modulos/almoxarifado.md)

| Método | Rota | Notas |
|--------|------|-------|
| GET | `/api/almox/items` | `?section=&onlyActive=` |
| GET | `/api/almox/items/search` | qualquer item ERP |
| POST | `/api/almox/items/link` | vínculo ERP (não supermercado) |
| POST | `/api/almox/items/local` | só supermercado (`APP_*`) |
| GET/PUT | `/api/almox/items/:code` / `…/config` | |
| GET/POST | `/api/almox/movements` | pack/totalPaid no Super |
| GET/POST/PUT | `/api/almox/equipments` | |
| GET/POST/PUT | `/api/almox/maintenances` | |
| GET/POST | `/api/almox/demands` | compras |

## Admin / auditoria (supervisor)

| Método | Rota | Notas |
|--------|------|-------|
| GET | `/api/admin/db-usage` | Uso do banco |
| GET | `/api/admin/pg-backup` | Status/config backup Postgres local |
| POST | `/api/admin/pg-backup/config` | Salvar retenção / pasta (supervisor) |
| POST | `/api/admin/pg-backup/run?tier=` | Backup manual (`hourly`/`daily`/`weekly`/`monthly`) |
| POST | `/api/admin/db-reset` | Reset operacional |
| GET | `/api/admin/audit/stock/:code` | Hub × ERP ao vivo (estoque/reserva/prod/pedidos) |
| POST | `/api/admin/audit/stock/:code/refresh` | Re-lê D1/D2/A pontual e grava |
| POST | `/api/admin/audit/stock/resync-insumos` | Regrava todos os insumos com `nQtdeEstoqueA` |

Regra canônica: [`../../erp-import/ESTOQUE.md`](../../erp-import/ESTOQUE.md).

## Google backup (principal)

| Método | Rota |
|--------|------|
| GET | `/api/google/status`, `/api/google/auth-url` |
| POST | `/api/google/config`, `/api/google/sync` |

## Módulos via `/api/hub/*`

Routers: `hub_api` (microbio, fisco), `compras`, `financeiro` — prefixo `/api/hub/...` ou `/api/financeiro/...`.

## Frontend

Sempre `apiFetch`/`apiJson` (`geral/lib/http.ts`). Não usar `fetch` direto em módulos.

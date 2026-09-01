# API REST Axum — referência compacta

Servidor: **`:3001`** (API + SPA do Hub) · Clientes: `http://nexus.local:3001` · Auth: `Authorization: Bearer <token>` (exceto rotas públicas abaixo).

Implementação: `Backend/src/lib.rs` + `modules/*/router`. Detalhes multi-usuário: [`../arquitetura/multi_usuario.md`](../arquitetura/multi_usuario.md).

## Rotas públicas

`/` (SPA) · assets estáticos · `/login` · `/mapa` · `/api/health` · `/api/auth/login` · `/api/auth/operators` · `/api/auth/session` · `/api/auth/setup-status` · `/api/auth/setup-supervisor` · `GET /api/hub/client-config` · `GET /api/hub/public-config`

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
| GET | `/api/hub/public-config` | Hint de URL (`nexus.local`) |

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
| GET/POST | `/api/settings/:key` | sql_*, erp_*, etc. |
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
| GET | `/api/vendas/pedidos`, `/api/vendas/pedidos/detalhe`, `/api/vendas/faltas`, `/api/vendas/clientes`, `/api/vendas/clientes/:codigo/pedidos` |

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

## Estoque — Ordens Manuais

| Método | Rota | Notas |
|--------|------|-------|
| GET/POST | `/api/estoque/ordens-manuais` | Lista / cria (`OPEN`) |
| GET/PUT/DELETE | `/api/estoque/ordens-manuais/:id` | Detalhe; edita/exclui só `OPEN` |
| POST | `/api/estoque/ordens-manuais/:id/postar` | Marca `POSTED` (lançado no ERP) |
| POST | `/api/estoque/ordens-manuais/:id/reabrir` | Volta a `OPEN` |
| GET | `/api/estoque/ordens-manuais/itens/busca` | Autocomplete `items` MP/Emb |
| GET | `/api/estoque/ordens-manuais/pendencias/por-item` | Agregado OPEN (Prev. Futura) |
| GET/POST | `/api/estoque/ordens-manuais/tipos` | Tipos de registro (Venda, Uso/Interno…) |
| DELETE | `/api/estoque/ordens-manuais/tipos/:id` | Remove tipo do cadastro |

## Qualidade — Documentação / POPs

| Método | Rota | Notas |
|--------|------|-------|
| * | `/api/qualidade/documentacao/...` | Famílias, tipos, docs, PDF, alertas |
| GET/POST | `/api/qualidade/pops/sectors` | Setores |
| GET/POST | `/api/qualidade/pops/documents` | Lista / cria (draft) |
| GET/PUT | `/api/qualidade/pops/documents/:id` | Detalhe / edita draft |
| POST | `/api/qualidade/pops/documents/:id/publish` | Publica (initial ou content) |
| POST | `/api/qualidade/pops/documents/:id/revalidate` | Nova revisão sem mudar seções |
| GET | `/api/qualidade/pops/documents/:id/versions` | Histórico |
| GET | `/api/qualidade/pops/documents/:id/versions/:vid` | Snapshot |
| GET/PUT | `/api/qualidade/pops/settings` | Logo (PUT multipart) |
| GET | `/api/qualidade/pops/settings/logo` | Bytes do logo |
| POST | `/api/qualidade/pops/seed-inventory` | Importa 31 POPs draft |
| POST | `/api/qualidade/pops/check-alerts` | Vencidos / 30-15-7 |

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
| POST | `/api/admin/audit/stock/verify-insumos` | Confere Hub × ERP e corrige divergências de insumos (`nQtdeEstoque`) |
| POST | `/api/admin/audit/stock/resync-insumos` | Regrava todos os insumos com `nQtdeEstoque` |
| POST | `/api/admin/audit/stock/resync-produtos` | Regrava `estoque_atual` com `Produtos.nQtdeEstoque` |

## Mapa operacional (supervisor)

| Método | Rota | Notas |
|--------|------|-------|
| GET | `/api/mapa/snapshot` | groups+modules+edges+routes+tasks+activity |
| PUT | `/api/mapa/layout` | posições em lote (drag) |
| PUT | `/api/mapa/modules/:key` | purpose/detail/hints |
| POST | `/api/mapa/modules` | módulo planned + task |
| POST | `/api/mapa/edges` | conexão |
| GET/POST | `/api/mapa/tasks` | fila |
| PATCH | `/api/mapa/tasks/:id` | status done |
| GET | `/api/mapa/tasks/export.md` | export task.md |
| GET/POST | `/api/mapa/activity` | registro |
| POST | `/api/mapa/resync-scan` | reimporta rotas do `mapa-app.json` |

Tabelas: `018_mapa_hub.sql`. UI Hub: view `mapa_arquitetura`. Browser: **`http://127.0.0.1:3001/mapa`** (login igual ao Hub).

Regra canônica: [`../../erp-import/ESTOQUE.md`](../../erp-import/ESTOQUE.md).

## Backup

Backup operacional = **PostgreSQL local** (`/api/admin/pg-backup*`). Sem Firebase/Google Drive.

## Módulos via `/api/hub/*`

Routers: `hub_api` (microbio, fisco), `compras`, `financeiro` — prefixo `/api/hub/...` ou `/api/financeiro/...`.

## Frontend

Sempre `apiFetch`/`apiJson` (`geral/lib/http.ts`). Não usar `fetch` direto em módulos.

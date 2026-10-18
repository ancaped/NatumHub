---
name: natumhub-api
description: >-
  Adiciona ou altera rotas REST Axum e cliente HTTP do Nexus: lib.rs,
  handlers, hub_api, apiFetch/apiJson/hubJson e auth middleware.
  Use quando o usuário pedir nova rota API, endpoint REST, hubJson, middleware
  auth, CORS ou erro 401/403 em chamadas HTTP.
---

# Nexus — Skill: API REST

## Quando usar

Nova rota, alteração de handler, cliente HTTP frontend, ou debug de auth em API.

## Ler primeiro no ai-memory (`memory_read_page`)

1. `concepts/api-routes.md` (catálogo de rotas da API)
2. `concepts/multi-usuario-auth.md` (rotas públicas vs admin)
3. `Backend/src/lib.rs` (router merge)
4. `Frontend/src/modules/geral/lib/http.ts`

## Padrões

### Backend

- Handlers em `Backend/src/handlers/` (legado) ou `Backend/src/modules/*/handlers.rs`
- Hub modules: prefixo `/api/hub/...` via `hub_api/mod.rs`
- State: `Arc<AppState>` com `Db(PgPool)` — sqlx async
- Auth: `Extension<AuthContext>` — admin via `ctx.role.is_admin()`

### Frontend

```typescript
import { apiJson, hubJson } from '../lib/http';

// Rotas /api/*
await apiJson('/notifications');

// Rotas /api/hub/*
await hubJson('feedbacks/manage');
```

**Proibido:** `fetch('/api/...')` direto em módulos — sem Bearer.

## Rotas públicas

`/api/health`, `/api/auth/login`, `/api/auth/operators`, `/api/auth/session`, `/login`, `GET /api/hub/client-config`

Demais exigem `Authorization: Bearer <token>`.

## Checklist nova rota

- [ ] Handler + registro no router correto
- [ ] Auth/admin conforme sensibilidade
- [ ] Cliente FE com `apiJson`/`hubJson`
- [ ] Atualizar catálogo no ai-memory (`concepts/api-routes.md`) se rota estável
- [ ] `cargo check --bin nexus-server --no-default-features` + `npm run build`

## Regras

- Cliente HTTP só via `apiJson` / `hubJson`
- Clientes finos dependem 100% da API — sem banco local
- Respostas em **pt-BR**

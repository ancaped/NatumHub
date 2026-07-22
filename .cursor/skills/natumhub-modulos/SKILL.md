---
name: natumhub-modulos
description: >-
  Cria ou estende módulos do NatumHub com espelhamento Frontend/Backend:
  registry, permissões, App.tsx, rotas Axum e notificações.
  Use quando o usuário pedir novo módulo, submódulo, tela no hub, module_key,
  permissão de operador, registrar view, adicionar área ao NatumHub,
  colar um SPEC JSON do mapa (kind: natumhub-module-spec),
  ou uma task module_spec em task.md.
---

# NatumHub — Skill: Criação de Módulos

## Quando usar

Novo submódulo, nova view no hub, rotas REST de domínio, chave em permissões,
**ou SPEC exportado do mapa** (`mapa-app.html` → Propor módulo).

## Contexto preferencial (IA)

1. [`ContextoIA/arquitetura/mapa-app.json`](../../ContextoIA/arquitetura/mapa-app.json) — inventário vivo (módulos, rotas, edges)
2. [`ContextoIA/arquitetura/mapa-app.html`](../../ContextoIA/arquitetura/mapa-app.html) — explorer visual
3. [`ContextoIA/modulos/criacao.md`](../../ContextoIA/modulos/criacao.md) — checklist

Regenerar mapa após mudanças estruturais: `npm run map:arch`.

## Se o usuário colar um SPEC (`kind: natumhub-module-spec`)

1. Validar: `module.key` snake_case único vs `mapa-app.json` → `modules`
2. Grupo existente (ou criar grupo no registry se o SPEC pedir)
3. Implementar checklist abaixo usando os campos do SPEC:
   - `frontend.path` / `backend.path` / `backend.routerPrefix`
   - `routes[]`, `data.tables`, `connectsTo`, `permissions`, `aiHints`
4. Não inventar escopo além do SPEC + `aiHints`
5. Ao terminar: `npm run map:arch` e mencionar status `planned` → `live` (atualizar `mapa-curated.json` se houver purpose/conexões novas)

## Doc canônica

`ContextoIA/modulos/criacao.md` — seguir checklist na ordem.

## Checklist resumido

### 1. Chave e registry (espelhar FE + BE)

| Arquivo | Ação |
|---------|------|
| `Frontend/src/modules/geral/lib/modules/registry.ts` | `MODULE_KEYS`, `moduleRegistry()` |
| `Backend/src/modules/geral/auth/modules_registry.rs` | `MODULE_*`, `ALL_MODULE_KEYS`, `default_modules_for_role` |

### 2. Frontend

```
Frontend/src/modules/<area>/<sub>/
└── <Nome>View.tsx
```

- Import em `App.tsx` → tipo `HubView`
- Render com `<ErrorBoundary>` + `canAccessView(currentUser, view)`
- Card no hub pai
- API: **`apiJson` / `hubJson`** — nunca `fetch` cru

### 3. Backend

```
Backend/src/modules/<area>/<sub>/
├── mod.rs, handlers.rs [, models.rs, commands.rs]
```

- Export em `modules/<area>/mod.rs`
- Router em `lib.rs` ou `hub_api/mod.rs`
- Middleware auth já global — rotas admin explícitas no handler
- **Não** criar `docs/` por módulo — só `ContextoIA/` se contrato mudar

### 4. Banco (se necessário)

- Migration em `Backend/supabase/` + bootstrap em `postgres_bootstrap`
- Documentar em `ContextoIA/banco-dados/database_blueprint.md`

### 5. Notificações (opcional)

```rust
notifications::notify(state, "module_key", "success", "Título", "Msg").await;
```

### 6. Validar

```bash
cd Backend && cargo check --lib
cd Frontend && npm run build
npm run map:arch
```

- Operador **sem** módulo não vê view nem acessa URL

## Exemplos de referência

| Módulo | FE | BE |
|--------|----|----|
| Microbiologia | `producao/microbiologia/` | + `hub_api/microbio.rs` |
| Documentação | `qualidade/documentacao/` | `qualidade/documentacao/` |
| Financeiro | `financeiro/` | `modules/financeiro/` |

## Regras

- Árvore FE espelha BE: `modules/<area>/<sub>/`
- Hubs (`compras_hub`, etc.) visíveis se operador tem **qualquer** filho
- Admin vê tudo — não duplicar lógica de bypass desnecessária
- UI: `ContextoIA/ui/style_and_ux_guide.md` se mexer em layout
- Escopo mínimo; respostas em **pt-BR**

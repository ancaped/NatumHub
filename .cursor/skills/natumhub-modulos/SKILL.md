---
name: natumhub-modulos
description: >-
  Cria ou estende módulos do NatumHub com espelhamento Frontend/Backend:
  registry, permissões, App.tsx, rotas Axum, docs e notificações.
  Use quando o usuário pedir novo módulo, submódulo, tela no hub, module_key,
  permissão de operador, registrar view ou adicionar área ao NatumHub.
---

# NatumHub — Skill: Criação de Módulos

## Quando usar

Novo submódulo, nova view no hub, rotas REST de domínio, ou chave em permissões.

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
└── docs/README.md
```

- Export em `modules/<area>/mod.rs`
- Router em `lib.rs` ou `hub_api/mod.rs`
- Middleware auth já global — rotas admin explícitas no handler

### 4. Banco (se necessário)

- Migration em `Backend/src/lib.rs`
- Documentar em `ContextoIA/banco-dados/database_blueprint.md`

### 5. Notificações (opcional)

```rust
notifications::notify(state, "module_key", "success", "Título", "Msg").await;
```

### 6. Validar

```bash
cd Backend && cargo check
cd Frontend && npm run build
```

- Operador **sem** módulo não vê view nem acessa URL

## Exemplos de referência

| Módulo | FE | BE |
|--------|----|----|
| Microbiologia | `producao/microbiologia/` | + `hub_api/microbio.rs` |
| Financeiro | `financeiro/` | `modules/financeiro/` |
| Notificações | `NotificationsPanel.tsx` | `geral/notifications/` |

## Regras

- Árvore FE espelha BE: `modules/<area>/<sub>/`
- Hubs (`compras_hub`, etc.) visíveis se operador tem **qualquer** filho
- Admin vê tudo — não duplicar lógica de bypass desnecessária
- UI: `ContextoIA/ui/style_and_ux_guide.md` se mexer em layout
- Escopo mínimo; respostas em **pt-BR**

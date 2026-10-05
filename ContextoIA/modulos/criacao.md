# Módulos — criação e extensão

Checklist para adicionar um **submódulo** ao Nexus (espelhamento FE + BE).

**Atalho IA:** em [`../arquitetura/mapa-app.html`](../arquitetura/mapa-app.html) use **Propor módulo** → baixe/copie o SPEC (`kind: natumhub-module-spec`) e peça ao agente com a skill `natumhub-modulos`. Consulte o inventário em [`mapa-app.json`](../arquitetura/mapa-app.json).

## 1. Definir chave e view

Escolha uma `module_key` única (snake_case, ex.: `compras_novo`).

Registre em **dois lugares** (devem espelhar):

| Arquivo | O que fazer |
|---------|-------------|
| `Frontend/src/modules/geral/lib/modules/registry.ts` | `MODULE_KEYS`, `moduleRegistry()` |
| `Backend/src/modules/geral/auth/modules_registry.rs` | `MODULE_*`, `ALL_MODULE_KEYS`, `module_registry()`, `default_modules_for_role` |

Se for view folha, adicione em `view_to_module_key` / `viewToModuleKey` quando necessário.

## 2. Frontend

```
Frontend/src/modules/<area>/<sub>/
├── <Nome>View.tsx
└── lib/                    # (opcional)
```

1. Criar pasta espelhando o backend (`compras/planejamento`, `producao/microbiologia`, etc.).
2. Importar view em `App.tsx` e adicionar ao tipo `HubView`.
3. Renderizar dentro de `<ErrorBoundary>` com guard `canAccessView(currentUser, view)`.
4. Adicionar card/rota no hub pai (`DashboardView` ou hub intermediário).
5. Chamadas API: **`apiJson` / `hubJson`** de `geral/lib/http.ts` — nunca `fetch` cru.

## 3. Backend

```
Backend/src/modules/<area>/<sub>/
├── mod.rs
├── models.rs               # (opcional)
├── handlers.rs             # Rotas Axum
└── commands.rs             # (opcional)
```

1. Criar módulo Rust e exportar em `Backend/src/modules/<area>/mod.rs`.
2. Registrar router em `lib.rs` ou `hub_api/mod.rs` (prefixo `/api/...` ou `/api/hub/...`).
3. Rotas protegidas passam pelo middleware em `geral/auth/middleware.rs`.
4. Se precisar de tabelas novas: migration em `Backend/supabase/` + anotar em `banco-dados/database_blueprint.md`.
5. **Não** criar `docs/` por módulo.

## 4. Permissões e operadores

- Admin vê tudo; demais roles recebem subset via `default_modules_for_role`.
- Gestão de operadores: UI em configurações — persiste em `hub_operator_modules`.
- Hubs (`compras_hub`, `producao_hub`) visíveis se operador tiver **qualquer** filho do grupo.

## 5. Notificações (opcional)

Após eventos relevantes:

```rust
notifications::notify(state, "module_key", "success", "Título", "Mensagem").await;
```

`module_key` deve existir no registry para filtragem correta.

## 6. Validar

```bash
cd Backend && cargo check
cd Frontend && npm run build
```

Testar login com operador **sem** o módulo — view não deve aparecer nem ser acessível.

## Exemplos existentes

| Módulo | FE | BE |
|--------|----|----|
| Microbiologia | `modules/producao/microbiologia/` | `modules/producao/microbiologia/` + `hub_api/microbio.rs` |
| Financeiro | `modules/financeiro/` | `modules/financeiro/` |
| Notificações | `components/layout/NotificationsPanel.tsx` | `modules/geral/notifications/` |

Índice geral: [`../INDEX.md`](../INDEX.md)

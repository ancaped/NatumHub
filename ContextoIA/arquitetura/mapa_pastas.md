# Mapa de pastas do repositório

**Não varrer o repo.** Use este mapa + [`../INDEX.md`](../INDEX.md).

## Raiz

| Caminho | Conteúdo |
|---------|----------|
| `Frontend/` | UI React (Vite, Tailwind) |
| `Backend/` | Rust — Axum, Tauri, domínio |
| `ContextoIA/` | Documentação para IAs (esta árvore) |
| `erp-import/` | Queries SQL sync ERP + PASSOS |
| `Feedbacks/` | Índice e pastas de feedback (`feedback.md`) |
| `Saves/` | `data.db`, `client_config.json` |
| `ARCHITECTURE.md` | Guia humano (legado) — preferir `ContextoIA/arquitetura/` |
| `AGENTS.md` | Entrada rápida para agentes |

## Frontend

```
Frontend/src/
├── App.tsx                    # Hub, views, guards de permissão
└── modules/
    ├── geral/                 # Auth, config, layout, http, dashboard
    │   ├── lib/http.ts        # apiFetch, apiJson, hubJson
    │   ├── lib/auth.ts
    │   ├── lib/connectionConfig.ts
    │   └── lib/modules/registry.ts
    ├── producao/<sub>/        # gerenciamento, microbiologia, fisco_quimica, kits
    ├── compras/<sub>/         # planejamento, pedidos, notas, online
    ├── estoque/<sub>/
    ├── vendas/<sub>/
    └── financeiro/
```

Cada submódulo pode ter `docs/README.md` — ler **só o afetado**.

## Backend

```
Backend/src/
├── lib.rs                     # Router Axum, setup Tauri, migrations
├── handlers/                  # Rotas legadas (produção, estoque, import)
├── core/
│   ├── legacy_db.rs           # sync_from_sql_server (não ler inteiro)
│   └── docs/
└── modules/
    ├── geral/                 # auth, config, notifications, feedbacks, backup
    ├── compras/
    ├── producao/
    ├── estoque/
    ├── vendas/
    ├── financeiro/
    └── hub_api/               # Routers /api/hub/* (microbio, fisco, compras)
```

## Convenção espelhada

Frontend e Backend usam a **mesma árvore** `modules/<area>/<sub>/`. Novo módulo: ver [`../modulos/criacao.md`](../modulos/criacao.md).

# Visão geral — NatumHub

ERP desktop Nátum Cosméticos: **Tauri 2 + React + Axum + PostgreSQL (Supabase)**.

## Módulos

| Área | Função |
|------|--------|
| Produção | Estoque, ordens, kits, microbiologia, físico-química |
| Compras | Demandas, cotações, NFs, compras online |
| Estoque / Vendas / Financeiro | Cache ERP + dashboards |
| Geral | Auth, config, notificações, feedbacks |

## Diagrama

```
React (FE) ──Bearer──► Axum :3001 ──► Supabase PostgreSQL
                           ▲
SQL Server ERP ──sync──────┘
Terminais (client) ──HTTP──► PC Principal
```

Detalhes rede: [multi_usuario.md](multi_usuario.md).

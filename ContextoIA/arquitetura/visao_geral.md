# Visão geral — Nexus

Sistema web da Nátum Cosméticos: **Rust Axum (headless) + React + PostgreSQL**.

## Módulos

| Área | Função |
|------|--------|
| Produção | Estoque de produção, ordens, kits, microbiologia, físico-química |
| Compras | Demandas, cotações, NFs, compras online |
| Estoque / Vendas / Financeiro | Cache ERP + dashboards |
| Qualidade | POPs, documentação, recebimento, devoluções |
| Geral | Auth, config, notificações, feedbacks, mapa |

## Diagrama

```
React (navegador) ──Bearer──► nexus-server :3001 ──► PostgreSQL
                                    ▲
SQL Server ERP ──sync───────────────┘
Terminais ──HTTP──► http://nexus.local:3001
```

- Dados do Nexus: **PostgreSQL** (`Saves/postgres.env`). O database se chama `natumhub`.
- Sync ERP só no master.
- Detalhes de rede: [multi_usuario.md](multi_usuario.md) · instalação: [../devops/instalacao_via_repositorio.md](../devops/instalacao_via_repositorio.md).

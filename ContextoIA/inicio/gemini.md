# Playbook IA (compacto)

Índice: [../INDEX.md](../INDEX.md)

## Stack

**Nexus:** servidor headless Rust Axum `:3001` + React (Vite) + **PostgreSQL** via `Saves/postgres.env`.

O binário é `nexus-server`. Clientes abrem o navegador em `http://nexus.local:3001`.

Sync ERP: SQL Server → Postgres (`legacy_db.rs`) — **somente no PC Principal**.

O database PostgreSQL continua com o identificador `natumhub`. O repositório GitHub continua `ancaped/NatumHub`.

## Papéis de máquina

| Papel | Precisa de |
|-------|------------|
| **PC Principal** (`master`) | PostgreSQL + `postgres.env` + `nexus-server` + acesso SQL Server para sync |
| **Terminal** (`client`) | Navegador apontando para o master (`http://nexus.local:3001`) |

## Onde codar

| Camada | Pasta |
|--------|-------|
| UI | `Frontend/src/modules/<area>/<sub>/` |
| REST | `Backend/src/server.rs` + `Backend/src/modules/*/router` |
| Domínio | `Backend/src/modules/` (espelha FE) |
| Auth/config | `Backend/src/modules/geral/` |

## HTTP frontend

Sempre `apiJson` / `hubJson` de `geral/lib/http.ts`. Nunca `fetch` cru para `/api/*`.

## Rede / auth

- Wizard: **PC Principal** ou **Terminal**.
- Master exige Postgres (`DATABASE_URL` em `postgres.env`).
- 1ª vez no master: setup supervisor (única conta que cadastra usuários).
- Config: `Saves/client_config.json` + `connectionConfig.ts`.
- Instalação: [`../devops/instalacao_via_repositorio.md`](../devops/instalacao_via_repositorio.md).

## Checklist entrega

- [ ] Escopo mínimo
- [ ] `cargo check --bin nexus-server --no-default-features` + `npm run build`
- [ ] Atualizar doc **só se** contrato API/schema mudou
- [ ] Nome do produto nos textos: **Nexus**

# Playbook IA (compacto)

Índice: [../INDEX.md](../INDEX.md)

## Stack

Tauri 2 + React + Axum `:3001` + **PostgreSQL** via `Saves/postgres.env`.

Sync ERP: SQL Server → Postgres (`legacy_db.rs`) — **somente no PC Principal**.

## Papéis de máquina

| Papel | Precisa de |
|-------|------------|
| **PC Principal** (`master`) | PostgreSQL + `postgres.env` + app (API) + acesso SQL Server p/ sync |
| **Terminal** (`client`) | Só o app apontando `apiOrigin` → master |

**Errado:** dizer que o app “usa só SQLite (`data.db`)”. Isso é legado e **não** é o runtime atual.

## Onde codar

| Camada | Pasta |
|--------|--------|
| UI | `Frontend/src/modules/<area>/<sub>/` |
| REST | `Backend/src/handlers/` + `Backend/src/modules/*/router` |
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
- [ ] `cargo check --lib` + `npm run build`
- [ ] Atualizar doc **só se** contrato API/schema mudou
- [ ] Não reintroduzir SQLite / `data.db` / `rusqlite`

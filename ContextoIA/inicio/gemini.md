# Playbook IA (compacto)

Índice: [../INDEX.md](../INDEX.md)

## Stack

Tauri 2 + React + Axum :3001 + **PostgreSQL** via `Saves/postgres.env` (hoje costuma ser Supabase; preparado para local — ver [banco-dados/migracao_postgres.md](../banco-dados/migracao_postgres.md)). Sync ERP: SQL Server → Postgres (`legacy_db.rs`).

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

- Todos os PCs: API local + Supabase. Sem escolha Principal/Terminal.
- 1ª vez: setup supervisor (única conta que cadastra usuários).
- Config: `Saves/client_config.json` + `connectionConfig.ts`.

## Checklist entrega

- [ ] Escopo mínimo
- [ ] `cargo check` + `npm run build`
- [ ] Atualizar doc **só se** contrato API/schema mudou

# Importação ERP NATUM → NatumHub

Guia IA: [`ContextoIA/erp-import/README.md`](../ContextoIA/erp-import/README.md)

Sync **SQL Server (ERP)** → **PostgreSQL (Supabase)**. Esta é a forma canônica de popular dados operacionais.

## Código

| Item | Caminho |
|------|---------|
| Rust | `Backend/src/core/legacy_db.rs` — `sync_from_sql_server` |
| HTTP | `POST /api/import/sync` |
| CLI | `cargo run --bin run_sync` |
| SQL creds | Settings `sql_host`, `sql_port`, `sql_user`, `sql_password`, `sql_database` |

## Arquitetura

```
SQL Server ERP → PC Master (Axum) → Supabase PostgreSQL
Terminais (client) → HTTP → PC Master
```

- Sync **somente** no PC Principal (`appMode: master`).
- Lock diário: tabela `sync_status`.
- Conexão DB: `Saves/postgres.env` (legado `supabase.env`).

## Bootstrap (primeira vez)

1. Schema já no Supabase (`001_natumhub_schema.sql`).
2. Seed hub (login/settings): cole `Saves/seed_hub_from_sqlite.sql` no SQL Editor — **ou** crie o supervisor pelo setup do app.
3. `cargo run --bin run_sync` no master (com SQL Server acessível).

**Não** migrar `data.db` inteiro pelo pooler.

## Documentação

| Arquivo | Conteúdo |
|---------|----------|
| [`PASSOS.md`](PASSOS.md) | Passos A–N |
| [`DESTINO-POSTGRES.md`](DESTINO-POSTGRES.md) | Tabelas destino |
| [`ESTOQUE.md`](ESTOQUE.md) | Regras de estoque |
| [`sql/`](sql/) | Queries SQL Server |

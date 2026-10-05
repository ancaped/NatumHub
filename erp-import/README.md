# Importação ERP NATUM → Nexus

Sync **SQL Server (ERP)** → **PostgreSQL** (no PC Principal). Forma canônica de popular dados operacionais.

## Código

| Item | Caminho |
|------|---------|
| Rust | `Backend/src/core/legacy_db.rs` — `sync_from_sql_server` |
| HTTP | `POST /api/import/sync` |
| CLI | `cargo run --bin run_sync` |
| SQL creds | Settings `sql_host`, `sql_port`, `sql_user`, `sql_password`, `sql_database` |

## Arquitetura

```
SQL Server ERP → PC Principal (Axum) → PostgreSQL (Saves/postgres.env)
Terminais (client) → HTTP → PC Principal
```

- Sync **somente** no PC Principal (`appMode: master`).
- Lock diário: tabela `sync_status`.
- Conexão DB: `Saves/postgres.env` (legado `supabase.env`).

## Bootstrap (primeira vez)

1. Schema no Postgres do master (`Backend/supabase/001_*.sql` …).
2. Criar supervisor pelo setup do app (1ª abertura).
3. `cargo run --bin run_sync` no master (com SQL Server acessível) **ou** sync pelo painel.

## Documentação

| Arquivo | Conteúdo |
|---------|----------|
| [`PASSOS.md`](PASSOS.md) | Passos A–N |
| [`DESTINO-POSTGRES.md`](DESTINO-POSTGRES.md) | Tabelas destino |
| [`ESTOQUE.md`](ESTOQUE.md) | Regras de estoque |
| [`sql/`](sql/) | Queries SQL Server |

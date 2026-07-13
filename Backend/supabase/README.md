# Schema PostgreSQL — NatumHub

DDL canônico: `001_natumhub_schema.sql` (Postgres puro; funciona em Supabase ou servidor local).

## Configuração

Preferido: `Saves/postgres.env` (não commitar). Exemplo: `Saves/postgres.env.example`.

Legado ainda aceito: `Saves/supabase.env`.

```
# Session (5432)
DATABASE_URL=postgresql://usuario:SENHA@HOST:5432/natumhub
```

Pooler Supabase **sa-east-1**: host `aws-1-sa-east-1.pooler.supabase.com` (não `aws-0`). Porta **5432** (Session), não 6543.

Migração Supabase → local: `ContextoIA/banco-dados/migracao_postgres.md`.

## Como popular o banco

**Não** use dump massivo do `data.db` pelo pooler — é lento e esgota conexões.

| Fonte | Como |
|-------|------|
| Operadores, settings, config, categorias | `Saves/seed_hub_from_sqlite.sql` → SQL Editor / `psql` |
| Itens, produtos, estoque, pedidos, NFs, etc. | Sync ERP: `cd Backend && cargo run --bin run_sync` ou `POST /api/import/sync` |

`stock_movements` e histórico grande vêm do sync ERP, não do SQLite legado.

## sqlx

`pg_db.rs` usa `statement_cache_capacity(0)` (compatível com PgBouncer).

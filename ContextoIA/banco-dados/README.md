# Banco de dados — PostgreSQL

| Arquivo | Uso |
|---------|-----|
| [`database_blueprint.md`](database_blueprint.md) | Visão do schema (espelha `Backend/supabase/`) |
| [`migracao_postgres.md`](migracao_postgres.md) | Cutover / dump-restore Postgres |

## Regras

- Banco operacional: **PostgreSQL** no **PC Principal**, URL em `Saves/postgres.env` (legado: `supabase.env`).
- Terminais **não** têm banco local — só API HTTP do master (`:3001`).
- Sync ERP (SQL Server → Postgres): [`../erp-import/README.md`](../erp-import/README.md) · [`../../erp-import/DESTINO-POSTGRES.md`](../../erp-import/DESTINO-POSTGRES.md).
- DDL: `Backend/supabase/001_*.sql` … (aplicar no Postgres do master).
- **Não** usar SQLite / `data.db` — legado removido do runtime.

Instalação: [`../devops/instalacao_postgres_master.md`](../devops/instalacao_postgres_master.md).

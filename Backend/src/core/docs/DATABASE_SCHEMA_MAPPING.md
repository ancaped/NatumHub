# Mapeamento ERP (SQL Server) → NatumHub

O destino operacional é **PostgreSQL**, não SQLite.

Documentação canônica:

| Doc | Conteúdo |
|-----|----------|
| [`erp-import/DESTINO-POSTGRES.md`](../../../../erp-import/DESTINO-POSTGRES.md) | Tabelas destino |
| [`erp-import/PASSOS.md`](../../../../erp-import/PASSOS.md) | Passos A–N |
| [`erp-import/sql/`](../../../../erp-import/sql/) | Queries no SQL Server |
| `Backend/supabase/` | DDL PostgreSQL |

Código: `Backend/src/core/legacy_db.rs`.

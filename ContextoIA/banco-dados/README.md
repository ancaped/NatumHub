# Banco de dados SQLite

| Arquivo | Uso |
|---------|-----|
| [`database_blueprint.md`](database_blueprint.md) | Schema completo de `Saves/data.db` |

## Regras

- Banco master: **`Saves/data.db`** (fora do build Tauri).
- Secundários **não** têm SQLite local — só API do principal.
- Sync ERP popula tabelas — ver [`../erp-import/README.md`](../erp-import/README.md).
- Mapeamento ERP→SQLite detalhado: [`../../erp-import/DESTINO-SQLITE.md`](../../erp-import/DESTINO-SQLITE.md).

Migrations novas: `Backend/src/lib.rs` (setup) + migrações incrementais nos módulos (`ALTER TABLE` / `PRAGMA table_info`).

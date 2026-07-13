# Resolução — Feedback 36b20514

**Data:** 2026-07-12
**Causa:** Queries SQL usavam colunas camelCase (`reportId`, etc.) sem aspas; o Postgres normalizava para `reportid` e a coluna real `"reportId"` não era encontrada (500 ao listar/salvar lotes).
**Correção:** SELECT/INSERT/UPDATE em `get_reports_query` / `save_reports_query` com identificadores quoted; decode tolerante de `reportRawNum` via `pg_i64`.
**Arquivos:** `Backend/src/tauri_commands.rs`
**Validação:** cargo check (pendente no lote final)

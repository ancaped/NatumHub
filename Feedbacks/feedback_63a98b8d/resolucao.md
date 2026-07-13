# Resolução — Feedback 63a98b8d

**Data:** 2026-07-12 02:40
**Causa:** Sync ERP executava `SET session_replication_role = replica`, parâmetro negado ao role `natum_app` no Supabase → HTTP 500.
**Correção:** Removidos os `SET session_replication_role` (replica/DEFAULT) do caminho de escrita em `legacy_db.rs`. Upserts com `ON CONFLICT` continuam suficientes.
**Arquivos:** `Backend/src/core/legacy_db.rs`
**Validação:** cargo check ✓ · npm run build ✓

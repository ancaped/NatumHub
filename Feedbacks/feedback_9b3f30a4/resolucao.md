# Resolução — Feedback 9b3f30a4

**Data:** 2026-07-12 03:30
**Causa:** O submódulo `compras` (Planejamento Geral, `mode="all"`) agregava MP/Emb/Coloração/Apoio numa única view e ainda aparecia na navegação e nas permissões.
**Correção:** Removido o leaf `compras` / “Planejamento Geral” do registry FE/BE, da navegação, de `App.tsx` e dos defaults do role `compras`. Mantidos MP, Embalagens, Coloração, Apoio, Cotações, Online, Pedidos e Notas. Role de operador `"compras"` em `store.rs` permanece (é o perfil, não a view).
**Arquivos:** `Frontend/src/modules/geral/lib/modules/registry.ts`, `Frontend/src/modules/geral/lib/nav/navRegistry.ts`, `Frontend/src/App.tsx`, `Frontend/src/modules/geral/lib/viewLabels.ts`, `Frontend/src/modules/compras/planejamento/ComprasView.tsx`, `Backend/src/modules/geral/auth/modules_registry.rs`
**Validação:** npm run build ✓ · cargo check — falha pré-existente em `tauri_commands.rs` (pg_i64 → i32), fora do escopo deste feedback.

# Resolução — Feedback 44c9d6b0

**Data:** 2026-07-12 02:40
**Causa:** Painel supervisor ainda mostrava “Este dispositivo”, Releases, dispositivos, Google Cloud e canal de update único — legado da era SQLite/PC principal.
**Correção:** Status Supabase com medidor de qualidade (latência `SELECT 1`); removidos Releases, Dispositivos e sync Google; atualizações Principal/Dev com Dev só para supervisor; sync ERP manual restrito a supervisor + agenda automática.
**Arquivos:** `ConfiguracoesView.tsx`, `ConexaoServidorPanel.tsx`, `CanaisAtualizacaoPanel.tsx`, `updateChannel.ts`, `App.tsx`, `hub/handlers.rs` (health), `updater/commands.rs`, `updater_manifest.rs`
**Validação:** cargo check ✓ · npm run build ✓

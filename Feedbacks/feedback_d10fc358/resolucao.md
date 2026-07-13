# Resolução — Feedback d10fc358

**Data:** 2026-07-12 03:00
**Causa:** Dashboard de Produção ainda usava título “Painel Geral”, badge de backup Google e toasts “servidor local” (legado PC principal).
**Correção:** Título “Produção”; removidos badge Configurar Backup e linha Google no dashboard; mensagens de erro passam a citar a API/Supabase.
**Arquivos:** `DashboardTab.tsx`, `ProducaoView.tsx`, `HistoryTab.tsx`, `AprovacaoTab.tsx`, `http.ts`
**Validação:** cargo check ✓ · npm run build ✓

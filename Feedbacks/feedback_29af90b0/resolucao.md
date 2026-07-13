# Resolução — Feedback 29af90b0

**Data:** 2026-07-12 03:25
**Causa:** Cada aba de Gerenciamento de Produção (e Lotes/Suspensos) repetia um `h2.view-title` no conteúdo central, duplicando o nome já exibido na sidebar/aba.
**Correção:** Removidos os blocos `view-header` / `view-title` das abas; toolbars, filtros, KPIs e tabelas permanecem.
**Arquivos:**
- `Frontend/src/modules/producao/gerenciamento/components/LotesTab.tsx`
- `Frontend/src/modules/producao/gerenciamento/components/DashboardTab.tsx`
- `Frontend/src/modules/producao/gerenciamento/components/InventoryTab.tsx`
- `Frontend/src/modules/producao/gerenciamento/components/HistoryTab.tsx`
- `Frontend/src/modules/producao/gerenciamento/components/BasesTab.tsx`
- `Frontend/src/modules/producao/gerenciamento/components/AprovacaoTab.tsx`
- `Frontend/src/modules/producao/gerenciamento/components/KitsTab.tsx`
- `Frontend/src/modules/producao/gerenciamento/components/SettingsTab.tsx`
- `Frontend/src/modules/producao/gerenciamento/ProducaoView.tsx` (Produtos Suspensos)
**Validação:** npm run build ✓ · `ProducaoLotesView` reutiliza `ProducaoView`/`LotesTab` (sem título extra).

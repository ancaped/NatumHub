# Resolução — Feedback a1c0a024

**Data:** 2026-07-11 14:00 (fase 1) · 2026-07-11 15:00 (fase 2)  
**Causa:** Módulo Produção acumulava abas com textos descritivos longos; bases/lotes ficavam embutidos no gerenciamento; Microbiologia e Físico-Química ainda dependiam de biblioteca manual de produtos (legado web) e não seguiam o padrão visual NatumHub (`view-container`, `toolbar-section`, `table-card`).

**Correção (fase 1):**
- Removidos parágrafos `view-subtitle` das abas de Produção.
- **Gestão de Bases** e **Lotes de Produção** viraram submódulos (`producao_bases`, `producao_lotes`) no hub, registry FE/BE e permissões.
- Microbiologia: removida aba Biblioteca; laudos gerados pelo nº do lote ERP.
- Físico-Química: formulário com lote primeiro; produto preenchido automaticamente.

**Correção (fase 2 — integração visual e dados):**
- Microbiologia (`ReportCreationFlow`, `ReportHistory`, `SettingsTab`): layout alinhado ao NatumHub (`view-container`, `view-title`, `toolbar-section`, `table-card`, `panel-card`, `btn-primary`/`btn-secondary`).
- Físico-Química: catálogo de produtos passa a vir de `/products` (ERP/SQLite) em vez da biblioteca microbio; medições liberadas após lookup de lote (produto sintético quando não está no catálogo); abas Histórico, Padrões e Agentes com mesmo padrão visual.
- Removido polling de 10s na Microbiologia; refresh manual ou ao trocar aba.

**Arquivos:** `ProducaoView.tsx`, tabs gerenciamento, `ProducaoBasesView.tsx`, `ProducaoLotesView.tsx`, `registry.ts`, `modules_registry.rs`, `App.tsx`, `DashboardView.tsx`, `MicrobiologiaView.tsx`, `ReportCreationFlow.tsx`, `ReportHistory.tsx`, `SettingsTab.tsx`, `FiscoQuimicaView.tsx`, `viewLabels.ts`

**Validação:** cargo check ✓ · npm run build ✓

**Nota operadores:** conceder `producao_bases` e `producao_lotes` em Gestão de Operadores se o role não for `producao`/`admin`.

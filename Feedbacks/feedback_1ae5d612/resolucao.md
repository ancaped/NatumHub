# Resolução — Feedback 1ae5d612

**Data:** 2026-07-11 13:55
**Causa:** Telas administrativas (`hub_feedbacks`, `hub_settings`, `hub_supervisor`) ocultam a barra de módulos e o `AppLayout` esconde “Voltar ao Hub” quando a navegação global está ativa — usuário ficava preso na Gestão de Feedbacks.
**Correção:** Botão **Início** na `AppTopBar` quando `showModules=false`, voltando ao hub principal.
**Arquivos:** `Frontend/src/modules/geral/components/layout/AppTopBar.tsx`
**Validação:** npm run build ✓

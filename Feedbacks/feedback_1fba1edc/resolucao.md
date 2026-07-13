# Resolução — Feedback 1fba1edc

**Data:** 2026-07-12 02:40
**Causa:** Seção de print sempre visível no widget, incentivando captura em todo envio.
**Correção:** Checkbox “Anexar captura de tela (opcional)” desmarcado por padrão; botões de captura/upload só aparecem se o usuário marcar; envio sem print quando desmarcado.
**Arquivos:** `Frontend/src/modules/geral/components/FeedbackWidget.tsx`
**Validação:** cargo check ✓ · npm run build ✓

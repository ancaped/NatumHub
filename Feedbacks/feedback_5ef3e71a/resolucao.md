# Resolução — Feedback 5ef3e71a

**Data:** 2026-07-11 13:50
**Causa:** Navegação exigia Hub → módulo → submódulo (3+ cliques) sem atalhos nem barra global.
**Correção:** Barra horizontal única (`AppTopBar`) com mega-menu de submódulos por permissão; recentes por operador (`useNavRecents`); módulos compactos (ícone + nome); perfil/notificações na mesma linha. Dropdown via portal (`createPortal`) para não ser cortado por overflow.
**Arquivos:**
- `Frontend/src/modules/geral/components/layout/AppTopBar.tsx`
- `Frontend/src/modules/geral/components/layout/AppShell.tsx`
- `Frontend/src/modules/geral/lib/nav/navRegistry.ts`
- `Frontend/src/modules/geral/lib/nav/useNavRecents.ts`
- `Frontend/src/modules/geral/components/layout/NavShellContext.tsx`
- `Frontend/src/App.tsx`
**Validação:** npm run build ✓
**Conferência:** validar hover/clique no mega-menu e ordem “mais usados” por operador.

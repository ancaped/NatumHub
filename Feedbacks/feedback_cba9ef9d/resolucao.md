# Resolução — Feedback cba9ef9d

**Data:** 2026-07-10 23:52
**Solicitante:** EdsonFerrari
**Página:** Geral > feedbacks

## Pedido

1. Abrir gestão de feedbacks em **aba dedicada** (não modal flutuante).
2. **Reabrir** feedbacks e adicionar **múltiplas notas** com histórico.
3. *(Nota admin)* Sidebar com lista estava estreita — feedbacks devem ficar na **janela principal**; sidebar só para **mudança de abas** (padrão `AppLayout` do projeto).

## Correção

### Backend

- Tabela `feedback_notes` + rotas `GET/POST .../:id` e `POST .../:id/notes`.
- Sincronização gera `notas_historico.md` na pasta do feedback.

### Frontend

- View `hub_feedbacks` com `AppLayout`:
  - **Sidebar:** abas de filtro (Fila, Triagem, Todos, Não resolver, Resolvidos).
  - **Área principal:** lista de feedbacks (painel esquerdo) + detalhe/triagem/notas (painel direito).
- Busca e atualizar na área principal; mobile alterna lista ↔ detalhe.
- Botão **Reabrir na fila**; histórico de notas admin.

## Arquivos alterados

- `Backend/src/modules/geral/feedbacks/{models,commands,handlers}.rs`
- `Frontend/src/modules/geral/feedbacks/FeedbacksAdminView.tsx`
- `Frontend/src/App.tsx`, `Frontend/src/modules/geral/components/layout/Header.tsx`
- `Frontend/src/modules/geral/lib/{api,types}.ts`

## Validação

- `cargo check` ✓
- `npm run build` ✓

## Comportamento esperado

- Perfil → Gestão de Feedbacks abre módulo no padrão visual dos demais (ex.: Compras).
- Lista ampla na área central; sidebar só troca o filtro/aba.
- Notas e reabertura funcionam; arquivos sincronizados em `Feedbacks/feedback_<id>/`.

# Plano — Feedback 5ef3e71a (navegação mais fluida)

**Tipo:** sugestão · **Status:** queued · **Não implementar nesta rodada**

## Problema

Hoje: Hub → módulo → submódulo → tela. Muitos cliques para tarefas diárias (ex.: Compras → Matéria-Prima).

## Objetivo

Chegar na tela útil em **≤ 2 ações**, sem perder a organização por módulo.

## Opções (recomendadas)

### A — Favoritos / atalhos (menor risco)
- Barra “Recentes” + “Fixados” no Hub e no header.
- Persistência local (`localStorage` / settings por operador).
- Clique único no atalho abre a view (`setView(...)`).

### B — Hub com submódulos expandidos (médio)
- Cards de módulo mostram links diretos aos submódulos (ex.: Compras: MP | Emb | Coloração | …).
- Mantém hub como ponto de partida; remove o passo “abrir módulo vazio”.

### C — Command palette (maior ganho a médio prazo)
- `Ctrl+K` busca módulos/submódulos por nome e abre direto.
- Bom para power users; complementa A/B.

## Recomendação

1. **Fase 1:** A + B no Hub (expansão de cards + recentes/fixados).
2. **Fase 2:** C se ainda faltar velocidade.

## Escopo técnico (quando executar)

| Área | Arquivos prováveis |
|------|-------------------|
| Hub UI | `Frontend/src/App.tsx`, componentes de hub (compras/produção/estoque) |
| Registry | mapa `HubView` ↔ labels em registry FE |
| Persistência | `localStorage` chave `hub_nav_recents` / `hub_nav_pins` por `operatorId` |

## Critérios de sucesso

- Operador chega em Matéria-Prima / Coloração / Lotes em 1–2 cliques.
- Sem regressão de permissões (`module_key`).
- Mobile/janela estreita: atalhos não quebram layout.

## Fora de escopo

- Redesign visual completo do design system.
- Alterar backend/auth.

# Resolução — Feedback c1ee3740

**Data:** 2026-07-10 23:35
**Solicitante:** EdsonFerrari
**Página:** Geral > Coloração

## Causa

Todas as tentativas de salvar **Regras de Reposição Personalizadas** falhavam com HTTP **422**:

```
missing field `row` at line 1 column ...
```

O backend (`hub_api/compras.rs`) espera `{ "row": { ... } }`, mas o frontend enviava o objeto da configuração diretamente em `api.saveCustomPurchaseConfig()`.

Por isso disparo/objetivo por subcategoria/categoria e regras por item **nunca persistiam** no SQLite (`compras_config_personalizado`), embora a UI parecesse salvar.

## Correção

- `Frontend/src/modules/geral/lib/api.ts`: envolver payload em `{ row }` no POST `/api/hub/compras/custom-configs`.

A hierarquia de prioridade já estava implementada no backend e no frontend:

1. **Item** (`level: item`)
2. **Subcategoria** (`level: subcategoria`, `targetId` = id da categoria)
3. **Categoria pai** (fallback via `parentId`, ex.: `cat_coloracao`)

## Arquivos alterados

- `Frontend/src/modules/geral/lib/api.ts`

## Validação

- `npm run build` ✓

## Comportamento esperado

- Alterar disparo/objetivo na ab Coloração (ou MP/Embalagens) persiste após recarregar.
- Regras personalizadas no drawer do item (Configurações) persistem e afetam sugestão de compra.
- `getDemands` e `ProdutosCompraTab` leem configs salvas do banco.

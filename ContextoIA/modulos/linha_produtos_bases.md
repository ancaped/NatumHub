# Linha de Produtos + Gestão de Bases — plano unificado

Módulo **pai do catálogo**: define linhas comerciais, ciclo de vida, categorias de roteamento (Compras/Estoque/Produção) e vínculos base→acabado.

## Posição no hub

| Antes | Depois |
|-------|--------|
| Estoque > Linha de Produtos (`estoque_ativos`) | **Administrativo > Linha de Produtos** (`admin_linha_produtos`) |
| Estoque > Insumos / Produtos | **Estoque > MP · Emb · Color · Apoio** (espelha Compras) |
| `status_produto = bases` | `categoria_produto = cat_base` |
| Resolução de lote só texto | Base escolhida + baixa local + substituições JSON |

Aliases temporários: `estoque_ativos`, `linha_produtos`, `estoque_insumos`, `estoque_produtos` → permissões novas.

## Dois eixos de classificação

### Ciclo de vida (`status_produto`)

`ativo` · `lancamento` · `saindo_de_linha` · `descontinuado` · `terceirizado`

Controla produção recomendada, visibilidade e suspensão de insumos. **Não** inclui bases/coloração/apoio.

### Categoria de roteamento (`categoria_produto`)

| Root | Uso |
|------|-----|
| `cat_base` | Produto base → Gestão de Bases |
| `cat_coloracao` | Compras + Estoque > Coloração |
| `cat_apoio` | Compras + Estoque > Material de Apoio |
| MP / Emb (insumos) | Compras + Estoque > Matéria-Prima / Embalagens |

Subcategorias compartilhadas via tabela `categories` (criadas em Linha de Produtos).

API: preferir `?categoria=cat_coloracao` em vez de `?status=coloracao|apoio|bases`.

## Fluxo base → acabado (ERP legado)

1. Produz **base** (lote próprio) no ERP.
2. Produz **acabado** pesando só fragrância — ERP acusa erro de pesagem.
3. No Nexus: resolver lote → escolher base + quantidade (sugestão: `produtos.base_codigo`).
4. Hub gera **baixa local** (`stock_movements` + `estoque_atual`).
5. Operador repassa baixa ao ERP manualmente (fila futura `pending_erp_baixas`).

## Tabelas

- `overrides_produtos.status_produto` / `categoria_produto` / `terceirizado_modo`
- `produtos.base` (texto ERP) + `produtos.base_codigo` (FK opcional)
- `lote_error_resolutions`: `base_code`, `base_quantity`, `substitutions_json`, `baixa_generated`

## Fases de implementação

| Fase | Conteúdo | Status |
|------|----------|--------|
| 1 | Registry + hub Administrativo + move Linha de Produtos | ✅ |
| 2 | `cat_base`, migrações, colunas lote | ✅ |
| 3 | Backend bases + baixa na resolução | ✅ |
| 4 | UI Linha: status vs categoria, `base_codigo`, `terceirizado_modo` | ✅ |
| 5 | UI Lotes: picker base + substituições | ✅ |
| 6 | Estoque espelhando Compras (MP/Emb/Color/Apoio) | ✅ |
| 7 | Export baixas ERP (`pending_erp_baixas`) | ⏳ futuro |
| 8 | Integração Gestão de Bases ↔ estoque insumos fórmula | ⏳ futuro |

## Integrações

| Consumidor | Lê |
|------------|-----|
| Produção | status, linha, visibilidade, `base_codigo` sugerido em lotes |
| Gestão de Bases | `categoria = cat_base` |
| Compras / Estoque Color/Apoio | `categoria_produto` ou `?categoria=` |
| Lotes | resolução + `similar_items` |
| Vendas | visibilidade |

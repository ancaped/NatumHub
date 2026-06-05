# Guia de Estilo, Interface (UI) e Regras de Robustez

Este guia estabelece os padrões visuais baseados na estética **HSL Zinc** (design minimalista e premium), bem como as diretrizes de código que impedem crashes de renderização e garantem alta estabilidade no frontend React.

---

## 1. Sistema de Cores HSL Zinc

O aplicativo utiliza variáveis de cores baseadas em HSL (Hue, Saturation, Lightness). As cores principais definidas no arquivo **[`src/index.css`](file:///c:/Users/Edson/antigravity/Natum/Frontend/src/index.css)** são:

*   **Background (Fundo)**: `hsl(240, 5%, 96%)` — Um cinza quase branco sutil.
*   **Card (Painéis e Cards)**: `hsl(0, 0%, 100%)` — Branco puro para destacar elementos suspensos.
*   **Border (Bordas)**: `hsl(240, 5.9%, 90%)` — Cinza suave para grades discretas.
*   **Text Primary (Texto Principal)**: `hsl(240, 10%, 3.9%)` — Quase preto, excelente legibilidade.
*   **Text Secondary (Texto de Apoio)**: `hsl(240, 3.8%, 46.1%)` — Cinza médio de apoio.
*   **Primary Active (Ação Destaque)**: `hsl(240, 5.9%, 10%)` — Cinza chumbo/preto para botões.

### Alertas Visuais (Módulo Estoque e Laudos)
Use sempre variações suaves com bordas e texto de alto contraste:
*   🔴 **Crítico/Perigo**:
    *   Fundo: `bg-red-50`
    *   Borda: `border-red-200`
    *   Texto: `text-red-600`
*   🟡 **Atenção/Aviso**:
    *   Fundo: `bg-amber-50`
    *   Borda: `border-amber-200`
    *   Texto: `text-amber-700`
*   🟢 **Saudável/Sucesso**:
    *   Fundo: `bg-emerald-50`
    *   Borda: `border-emerald-200`
    *   Texto: `text-emerald-600`

---

## 2. Padrão CSS e Especificidade (Tailwind CSS v4)

No Tailwind v4, as classes são geradas dentro do seletor `:where()`. Isso faz com que as classes utilitárias do Tailwind tenham **especificidade zero**.
*   **Regra de Ouro**: **NÃO** insira resets de seletores universais (como `* { margin: 0; padding: 0 }`) no arquivo `index.css`. Qualquer regra global escrita após os `@import` do Tailwind anulará os espaçamentos utilitários (ex: `space-y-4` ou `p-6`) aplicados no JSX, quebrando o design.
*   Se precisar resetar elementos, faça-o de forma explícita nas tags base: `html, body, p, h1 { margin: 0; padding: 0; }`.

---

## 3. Prevenção de Telas em Branco (Null Safety)

Se o React tentar renderizar ou tratar um campo que seja `null` (comum em bancos SQLite flexíveis), a tela inteira falhará e ficará branca.
*   **Mecanismo 1: Fallback nas Cadeias de Texto**:
    Antes de chamar métodos de string (como `.toLowerCase()`, `.split()` ou `.includes()`), assegure-se de injetar uma string vazia como fallback:
    ```typescript
    // Incorreto
    r.productName.toLowerCase();
    
    // Correto
    (r.productName || '').toLowerCase();
    ```
*   **Mecanismo 2: Optional Chaining no Mapeamento de Arrays**:
    Sempre use `?.` ao percorrer listas vindas do backend que possam não estar presentes em um estado inicial:
    ```typescript
    {item.prices?.map(price => ( ... ))}
    ```
*   **Mecanismo 3: Validação de Datas**:
    Datas em formato ISO ou strings de coleta vazias geram `Invalid Date` no JavaScript. Trate-as de forma segura:
    ```typescript
    const formatDate = (isoString?: string | null) => {
      if (!isoString) return '-';
      try {
        return new Intl.DateTimeFormat('pt-BR').format(new Date(isoString));
      } catch {
        return '-';
      }
    };
    ```

---

## 4. Tratamento de Exceções de Render (ErrorBoundary)

Todos os três módulos principais do hub estão protegidos por um componente **`ErrorBoundary`** em [`src/App.tsx`](file:///c:/Users/Edson/antigravity/Natum/Frontend/src/App.tsx).
*   Se um erro passar pelas travas de segurança do código, a tela de erro será mostrada localmente. O usuário verá o rastreamento do erro e poderá clicar em "Voltar ao Início" para reiniciar o estado do menu inicial, evitando que o app precise ser fechado à força pelo gerenciador de tarefas do Windows.

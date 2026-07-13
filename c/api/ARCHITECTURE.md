# NatumHub - Guia do Desenvolvedor e Arquitetura

Bem-vindo ao **NatumHub**, o painel unificado e integrado para gerenciamento das operações da Nátum Cosméticos. Este documento reúne todas as especificações técnicas, layout de pastas, esquema do banco de dados compartilhado, e boas práticas para guiar futuras implementações de maneira limpa, eficiente e com baixo consumo de tokens.

---

## 1. Visão Geral do Sistema

O NatumHub unifica três aplicativos legados em um único ecossistema integrado:
1. **Produção**: Controle de estoque, faturamento, histórico de fabricação e alertas de reposição.
2. **Compras**: Planejamento de demandas por média histórica, cotações com múltiplos fornecedores e controle de Notas Fiscais (NFs).
3. **Análise Microbiológica**: Controle de qualidade laboratorial, registros de testes microbianos e emissão de laudos de lote.

```mermaid
graph TD
    subgraph Frontend [NatumHub Frontend (React + TS + Vite)]
        App[App.tsx - Router/Hub]
        Prod[ProducaoView.jsx - Estoque]
        Micro[MicrobiologiaView.tsx - Laboratório]
        Comp[ComprasView.tsx - Compras]
        FQ[FiscoQuimicaView.tsx - Físico-Química]
        CO[ComprasOnlineView.tsx - Compras Online]
    end

    subgraph Backend [Tauri Window & Rust Backend]
        Axum[Axum REST Server (Port 3001)]
        TauriCmd[Tauri Commands]
        Watcher[Background File Watcher]
    end

    subgraph Data [Storage Layer]
        DB[(data.db - SQLite Shared)]
        FMD[feedback.md - Auto-Synced]
    end

    App --> Prod & Micro & Comp & FQ & CO
    Prod --> Axum
    Comp & Micro --> TauriCmd
    Watcher --> DB
    TauriCmd & Axum --> DB
    TauriCmd -->|Auto-writes| FMD
```

---

## 2. Mapa do Projeto (Estrutura de Diretórios)

Para otimizar o consumo de tokens das IAs de codificação, evite ler todos os arquivos. Consulte apenas os caminhos específicos indicados abaixo:

*   **`c/api/Frontend/`**: Frontend do aplicativo unificado.
    *   **`src/App.tsx`**: Entrada do aplicativo, controle de visualização do Hub e Error Boundaries.
    *   **`src/types.ts`**: Definições de tipos e interfaces TypeScript de todos os módulos.
    *   **`src/modules/`**: Visões principais de cada módulo.
        *   `ProducaoView.jsx`: Tela de Estoque legada, com controle de overrides e alertas de produção.
        *   `MicrobiologiaView.tsx`: Fluxo do Laboratório e login dos operadores microbiológicos.
        *   `ComprasView.tsx`: Estrutura de abas do fluxo de Compras.
        *   `FiscoQuimicaView.tsx`: Registro de pH, Viscosidade, Densidade e Calculadora de Correções.
        *   `ComprasOnlineView.tsx`: Interface de compras online integrada.
    *   **`src/components/`**: Componentes reutilizáveis (Demandas, Cotações, Cadastro de Itens, Relatórios, etc.).
    *   **`src/index.css`**: Estilos globais e tokens de design (Zinc Aesthetic).
*   **`c/api/Backend/NatumHub/`**: Backend em Rust e infraestrutura Tauri.
    *   **`src/lib.rs`**: Manipuladores Tauri, configurações do servidor Axum integrado, rotas e exportação automática de feedbacks para Markdown.
    *   **`src/db.rs`**: Funções de manipulação e migrações automáticas do banco SQLite.
    *   **`src/watcher.rs`**: Watcher automático de planilhas Excel (Faturamento/Levantamento) integradas na pasta de trabalho.
    *   **`schema.sql`**: Definições de esquema do banco de dados SQLite.
    *   **`tauri.conf.json`**: Configuração de build do Tauri Desktop.

---

## 3. Banco de Dados Compartilhado (`data.db`)

Para evitar reiniciar a compilação do Tauri continuamente durante o desenvolvimento, o arquivo **`data.db`** é mantido na pasta **`c/api/Backend/data.db`** (fora do diretório de compilação do Tauri).

### Tabelas Principais e Relações

#### Cadastro e Integração de Estoques
*   `produtos` (código, descrição, linha_prefix, base, media_levantamento): Cadastro compartilhado de todos os produtos acabados e insumos da produção.
*   `config_linhas` (linha_prefix, nome_linha, estoque_ideal_mult, abrir_ordem_mult, abrir_prod_mult, fator_seguranca_z, visivel): Multiplicadores de meses de estoque recomendados para calcular alertas (Crítico, Alerta, Saudável).
*   `estoque_atual` (codigo, estoque, producao, pedidos_aberto, fase): Armazena os números atuais sincronizados pelo importador de planilhas.
*   `overrides_produtos` (codigo, estoque_ideal_manual, pedidos_manual, media_manual, is_lancamento_manual, visivel, observacao, linha_prefix_manual): Permite forçar dados no algoritmo de alertas se necessário.

#### Fluxo de Compras (Insumos e Pedidos)
*   `items`: Cadastro detalhado de insumos de compras.
*   `categories`: Árvore de categorias de produtos e matérias-primas.
*   `suppliers`: Fornecedores de insumos.
*   `invoices`: Detalhamento de notas fiscais importadas (usado para calcular médias de consumo histórico por ano).
*   `quotations` & `quotation_items` & `quotation_prices`: Armazenamento de cotações com múltiplos fornecedores e o resultado final selecionado para pedido.

#### Fluxo Laboratorial (Microbiologia)
*   `reports`: Resultados microbiológicos emitidos e assinados para controle de lotes.

#### Feedback & Diagnósticos
*   `feedbacks` (id, type, description, page, logs, screenshot, status, createdAt, resolvedAt): Registro de bugs e melhorias.

---

## 4. Diretrizes de Codificação e Boas Práticas

Ao implementar novas features ou correções, siga rigorosamente estas diretrizes para manter a estabilidade do app e reduzir bugs na interface:

### 1. Prevenção de Telas em Branco (Null Safety)
Telas em branco ocorrem quase exclusivamente devido a exceções de tipo não capturadas no ciclo de renderização do React ao acessar propriedades nulas oriundas do banco de dados (ex: `null.toLowerCase()`).
*   **Sempre** trate campos opcionais ou strings do banco de dados com fallbacks antes de aplicar manipulações de string:
    ```typescript
    // Incorreto (Pode quebrar se description for nulo)
    const matches = item.description.toLowerCase().includes(query);

    // Correto (Null-safe)
    const matches = (item.description || '').toLowerCase().includes(query);
    ```
*   **Utilize Optional Chaining** (`?.`) ao lidar com vetores ou propriedades aninhadas que podem não ser populadas:
    ```typescript
    {item.prices?.map(price => ( ... ))}
    ```

### 2. Tratamento de Erros e Recuperação (Error Boundaries)
Todas as visualizações de módulo principal no arquivo [`App.tsx`](file:///c:/Users/Edson/antigravity/Natum/Frontend/src/App.tsx) estão envolvidas por uma classe [`ErrorBoundary`](file:///c:/Users/Edson/antigravity/Natum/Frontend/src/components/ErrorBoundary.tsx).
*   Se ocorrer uma exceção de renderização em algum componente, o erro será isolado a este módulo. A tela exibirá um diagnóstico detalhado com a pilha de chamadas e um botão para o usuário "Voltar ao Hub", evitando o travamento completo do app.

### 3. Especificidade de Estilo (Tailwind v4 CSS)
O NatumHub utiliza **Tailwind CSS v4**. Nesta versão, as classes utilitárias são injetadas com a pseudo-classe `:where()`, o que dá especificidade zero a elas.
*   **Nunca** defina regras de reset globais com o seletor universal `*` (como `* { margin: 0; padding: 0 }`) no seu arquivo CSS principal, pois isso irá anular todas as classes de espaçamento (`space-y-4`, `p-6`, `m-2`) do Tailwind.
*   Mantenha a estética Zinc (tons suaves de cinza, bordas sutis e botões em preto/zinc-900).

---

## 5. Ciclo de Feedback e Sincronização Dinâmica

Para facilitar o diagnóstico imediato de bugs diretamente pelo modelo de IA, o aplicativo conta com o **FeedbackWidget** (ícone de inseto flutuante no canto inferior direito).

1.  **Captura automática**: O widget captura a página atual, a descrição do usuário, os logs do console de depuração e, opcionalmente, um print de tela por imagem.
2.  **Escrita Automática em Markdown**: Sempre que um feedback é criado ou resolvido, o backend em Rust gera e escreve a lista de pendências nos arquivos:
    *   **[`c:\Users\Edson\antigravity\Natum\feedback.md`](file:///c:/Users/Edson/antigravity/Natum/feedback.md)** (Raiz)
    *   **[`c:\Users\Edson\antigravity\Natum\Producao\feedback.md`](file:///c:/Users/Edson/antigravity/Natum/Producao/feedback.md)** (Pasta da Tarefa)
3.  **Acesso Rápido**: Em conversas de manutenção, você pode apenas ler o arquivo `feedback.md` para ver a lista de bugs pendentes, quais páginas falharam e os logs exatos do console capturados no momento do erro.

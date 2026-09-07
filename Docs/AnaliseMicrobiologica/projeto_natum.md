> [!WARNING]
> **HISTÓRICO / legado (pré-unificação)**  
> Este texto mistura o ecossistema Natum com o app isolado `Natum/AnaliseMicrobiologica` + `Natum/Backend/AnaliseMicrobiologica`.  
> Hoje o laboratório é o módulo `Frontend/src/modules/MicrobiologiaView.tsx` no NatumHub (Tauri invoke: `get_reports`, `save_product`, etc.).  
> Padrões Zinc, FeedbackWidget e lições Electron→Tauri **continuam válidos**. Não recrie pastas de app separado; não trate Firebase como descontinuado no Hub (o Hub ainda usa Firebase opcional para backup).

# DOCUMENTAÇÃO TÉCNICA - ECOSSISTEMA NATUM

## Projetos e Módulos do Ecossistema
1. **Produção**: Controle de estoque, faturamento, histórico de fabricação e alertas de reposição.
2. **Compras (Matéria-Prima + Embalagens)**: Gestão de demandas, cotações, NFs e compras online.
   - [Documentação Detalhada de Compras](../Compras/implementation_plan.md)
3. **Análise Microbiológica**: Controle de qualidade laboratorial e emissão de laudos de contaminação.
   - [Documentação Detalhada de Microbiologia](./projeto_natum.md) (este documento)
4. **Análise Físico-Química**: Registro de pH, Viscosidade, Densidade e Calculadora de Correções.
   - [Documentação Detalhada de Físico-Química](../FiscoQuimica/fisco_quimica.md)

---

## Projeto: AnaliseMicrobiologica
O aplicativo voltados para análises laboratoriais de contaminação microbiológica, agora migrado e integrado ao **NatumHub (Tauri: Rust + React)**.

### 1. Arquitetura Geral e Estrutura de Pastas
- **Frontend (Web App)**: `Natum/AnaliseMicrobiologica` - Código React + Vite + TailwindCSS, mantido de forma enxuta e separado de executáveis pesados.
- **Backend (Desktop Tauri)**: `Natum/Backend/AnaliseMicrobiologica` - Contém a base Rust (Tauri), arquivos de build e configuração do executável. Essa separação mantém as pastas de desenvolvimento web mais limpas e isola as etapas de compilação de software.
- **Banco de Dados**: SQLite local (`data.db`).
- **Comunicação**: Tauri `invoke` (IPC - Inter-Process Communication).

### 2. Padrões Estabelecidos (Blueprints para novos Apps)
- **Cores e Estética**: Paleta minimalista baseada em tons de cinza (`Zinc`) e pretos claros. Todos os futuros aplicativos devem seguir estritamente o visual, componentes e padrão do projeto **AnaliseMicrobiologica** para garantir consistência total no ecossistema Natum.
- **Componentes**: Focados na usabilidade mobile e desktop (responsividade nativa).
- **Persistência**: SQLite nativo gerenciado via Rust para máximo desempenho.
- **Distribuição**: Instaladores leves gerados via Tauri Bundler.

### 3. Histórico de Migração (Electron -> Tauri)
- Remoção do servidor Express (Node.js).
- Migração de SQL queries do JavaScript para comandos Rust (`src-tauri/src/lib.rs`).
- Implementação de segurança via IPC (bloqueio de comandos externos).
- Limpeza de dependências legadas:
    - [x] Remoção de Electron/Builder.
    - [x] Remoção de Firebase (descontinuado em favor de SQLite local).
    - [x] Remoção de arquivos de script de migração de cor legados.
    - [x] Exclusão das pastas de build do servidor (`dist-server`, `server`).

### 4. Roadmap Tecnológico para Próximos Apps
- **Estrutura de Pastas Obrigatória**: Todo novo projeto da Natum será composto por duas pastas distintas:
    1. `Natum/NomeDoApp`: Conterá apenas o frontend (React/Vite) para manter a leveza.
    2. `Natum/Backend/NomeDoApp`: Conterá toda a base Desktop/Backend (Tauri/Rust/SQLite).
- **Identidade Visual**: É mandatório seguir o mesmo visual do aplicativo *AnaliseMicrobiologica*. Não crie novos padrões visuais.
- **Módulo de Feedback Integrado**:
    - **Padrão Visual**: Todos os apps devem conter o `FeedbackWidget` flutuante no canto inferior direito da tela. O design da janela deve seguir a estética minimalista (branco/cinza, sem transparências complexas).
    - **Captura Automática**: O componente deve permitir que o usuário tire print da tela com um clique (usando bibliotecas como `html2canvas`), ou envie imagens via upload/Ctrl+V.
    - **Metadados**: O reporte envia obrigatoriamente para o banco de dados (SQLite) os últimos 50 logs de console interceptados e a rota atual em que o usuário estava navegando.
    - **Instruções IA**: Todo app deve ter um arquivo `feedback.md` instruindo a IA sobre como ser a Especialista em Resolução de Problemas daquele domínio específico ao ser invocada com `@feedback`.

---

## Projeto: Compras (Matéria Prima + Embalagens)
App de gestão de compras, substituindo fluxo de Google Sheets por solução local com histórico.

### Documentação Completa
- [Plano de Implementação](../Compras/implementation_plan.md)
- [Blueprint de Referência](../Compras/reference_blueprint.md) — Configs, fórmulas, padrões a copiar
- [Schema & Backend](../Compras/schema_and_backend.md) — SQLite, tipos, API, Rust commands

### Resumo da Arquitetura
- **Frontend**: `Natum/Compras/` (React + Vite + TailwindCSS v4, porta 5174)
- **Backend**: `Natum/Backend/Compras/` (Tauri + Rust + SQLite)
- **Módulos**: Importação CSV, Demandas, Cotações (2 aprovações), Fornecedores, Relatórios PDF
- **Segue identidade visual do AnaliseMicrobiologica** (zinc palette, Inter/JetBrains Mono)

---
*Última atualização: 12/05/2026*

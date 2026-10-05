# POPs — Procedimentos Operacionais Padrão (Qualidade)

## Estudo da pasta fonte (jul/2026)

Fonte: `C:\Users\thiag\OneDrive\Área de Trabalho\POP'S` — **31** arquivos `.docx`.

| Pasta | Qtd | Prefixo típico |
|-------|-----|----------------|
| PRODUÇÃO | 16 | `POP-PRD-NNN` |
| ADMINISTRAÇÃO | 6 | `POP-ADM-NNN` |
| EXPEDIÇÃO | 5 | `POP-EXP-NNN` |
| ATENDIMENTO | 2 | `POP-ATD-NNN` |
| ELABORAÇÃO DE POPS | 2 | POP 001 / 002 (meta) |
| ALMOXERIFADO | 0 | setor existe, sem arquivo |

### Modelo de documento (cabeçalho + corpo)

- Cabeçalho: “Procedimento Operacional Padrão”, **código**, **revisão**, título, **data**, página
- Seções: Objetivo, Condições necessárias, Responsabilidades, Procedimento/Atividades, Formas de controle, Observações/Anormalidades, **Registros**, Referência
- Rodapé: Elaborado / Revisado / Aprovado + datas

### Inventário (código sugerido Hub ← arquivo)

| Setor | Código | Título (do nome do arquivo) |
|-------|--------|-----------------------------|
| administração | POP-ADM-025 | Admissão de Funcionários |
| administração | POP-ADM-036 | Qualificação de fornecedor |
| administração | POP-ADM-041 | Produtos Terceirizados |
| administração | POP-ADM-049 | Utilização dos Extintores de Incêndio |
| administração | POP-ADM-051 | Saúde dos funcionários |
| administração | POP-ADM-079 | Visitas de Terceiros |
| atendimento | POP-ATD-011 | Atendimento ao Público |
| atendimento | POP-ATD-059 | Reclamação de clientes |
| elaboracao | POP-001 | Elaboração do POP |
| elaboracao | POP-002 | Revalidação do POP |
| expedição | POP-EXP-027 | Dispensação de produtos |
| expedição | POP-EXP-040 | Recolhimento de Produtos |
| expedição | POP-EXP-043 | Rastreabilidade da Produção |
| expedição | POP-EXP-050 | Rastreabilidade de Lote |
| expedição | POP-EXP-056 | Liberação de pedidos pronto |
| produção | POP-PRD-004 | Laboratório de Pesagens e Medidas |
| produção | POP-PRD-007 | Lavagem e sanitização de pisos e paredes |
| produção | POP-PRD-009 | Paramentação para acesso às áreas de produção |
| produção | POP-PRD-021 | Lavagem e sanitização de material de uso nos processos |
| produção | POP-PRD-026 | Conferência das embalagens para envase |
| produção | POP-PRD-028 | Limpeza da Máquina Envasadora |
| produção | POP-PRD-030 | Produção |
| produção | POP-PRD-034 | Envase |
| produção | POP-PRD-039 | Impressão de dados |
| produção | POP-PRD-043 | Rastreabilidade da Produção |
| produção | POP-PRD-047 | Utilização do Tanque |
| produção | POP-PRD-053 | Planejamento de Produção |
| produção | POP-PRD-057 | Sala de Máquinas |
| produção | POP-PRD-058 | Processo de transferência de produtos |
| produção | POP-PRD-065 | Procedimento de codificação |
| produção | POP-PRD-072 | Quarentena de produtos acabados |

## Regras v1 (Hub)

- Conteúdo e impressão: **HTML no Hub** (`window.print` / PDF do browser), template de **3 barras** (cabeçalho / corpo contínuo / rodapé) + **logo** configurável (`Saves/pops/`).
- Corpo = texto contínuo (`content_json.body`); seções do Word ficam dentro do corpo.
- Import: `node scripts/extract-pop-bodies.mjs` gera `seed_bodies.json`; na UI, «Importar inventário» / «Reimportar corpos (force)».
- Fonte dos .docx: pasta `POP'S` no Desktop/OneDrive, ou `Saves/pops/source/`.
- Organização por **setor**.
- Validade **anual** (`next_review_date = effective_date + 1 ano`).
- Dois caminhos de renovação: **revalidar** (mesmo corpo, sobe revisão) ou **publicar revisão** (corpo alterado).
- Histórico em `pop_versions`.
- Alertas 30/15/7 dias (`module_key` `qualidade_pops`).
- `module_key`: `qualidade_pops`.

## Fase 2 (não implementar agora)

Registros acompanhantes preenchidos manualmente / futuro scan:

- tipos de registro ligados ao POP
- **código de lote do registro** + arquivo original em `Saves/pops/registros/{lote}/`
- rastreio físico ↔ digital (sem OCR/ERP na v1)

## Tabelas

`023_qualidade_pops.sql`: `pop_sectors`, `pop_documents`, `pop_versions` (+ logo em settings / `Saves/pops/logo.*`).

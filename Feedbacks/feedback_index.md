# Feedback e Relatórios — NatumHub

> Espelho opcional do PostgreSQL. **Playbook da IA:** `Feedbacks/feedback.md`. Fonte de verdade = banco.

## 📋 Fila (agentes IA)

Status `queued` ou `in_progress`, ordenados por prioridade.

_Fila vazia._

## 🟡 Triagem

_Nenhum item em triagem._

## 🔵 Em aberto (conferência supervisor)

| Prio | ID | Solicitante | Data/Hora | Tipo | Página | Status | Descrição | Notas admin |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| 112 | `17dec008` | Edson | 2026-07-12 06:48:21.035987+00 | 🔴 Bug | Compras > Coloração > Lista | awaiting_review | relatorio nao esta puxando exato a ultima nf, e sim apenas o nome do fornecedor, assim como nao esta puxando o ultimo pedido, e sim o nome do fornecedor no ultimo pedido, favor corrigir isso e verificar se nos outros modulos precisar corrigir tbm  | [2026-07-14 04:58:18.183274+00] IA: Resolução — 2026-07-14 Causa: 1. A coluna de última NF e último pedido exibia o fornecedor por causa de dados legados ou importados incorretamente em caches locais, que haviam salvado o fornecedor nas colunas invoice_number e n_pedido. Correção: 1. No backend (demands.rs), as queries estão corretas mapeando invoice_number e po.n_pedido. 2. Implementada uma rotina automática e auto-reparável no startup do backend (lib.rs) chamada repair_corrupted_data_if_needed. Ela detecta se a tabela invoices possui nomes de fornecedores em invoice_number. Caso sim, limpa invoices, purchase_orders, purchase_order_items e nf_import_control. Isso força o próximo Sync ERP a ser um sync COMPLETO e limpo, atualizando todas as notas e pedidos dos últimos 48 meses com os números corretos. 3. Verificado o correto funcionamento nos outros módulos que compartilham da mesma infraestrutura de demandas. Arquivos: lib.rs Validação: cargo check ✓ · npm run build ✓  [2026-07-14 05:13:10.570615+00] EdsonFerrari: aperto para clicar em detalhe da nf e automaticamente fecha sem abrir nada, verificar por favor |
| 113 | `f6fb0462` | Edson | 2026-07-12 06:50:09.055818+00 | 🔵 Sugestão | Compras > Coloração > Lista | awaiting_review | condensar as informacoes de Disparo dias e Objetivos dias para que ocupe o menor espaco possivel por item no relatório quando for selecionando para aparecer, fazer isso nos outros modulos tbm  | - |
| 114 | `4a8fc03c` | EdsonFerrari | 2026-07-14 03:32:54.667265+00 | 🔴 Bug | Compras > Matéria-Prima/ficha tecnica e consumo | awaiting_review | estou fazendo uma serie de feedbacks de pequenos refinos e ajustes visuais  Grafico de consumo mensal detalhado aparece apenas se passar o mouse por cima, corrigir para sempre aparecer.    | - |
| 115 | `907ceca7` | EdsonFerrari | 2026-07-14 03:37:15.367825+00 | 🔴 Bug | Compras > Matéria-Prima/ficha tecnica e consumo | awaiting_review | estou fazendo uma serie de feedbacks de pequenos refinos e ajustes visuais  medias de consumo ano a ano nao mostra todos os anos, apenas os ultimos 3, mostrar pelo menos os ultimos 6 anos se o insumo tiver dados para isso   remover aba historico de cotacao, colocar historico de pedidos de compra, fazer isso em todos os modulos de compras por favor   configuracoes/ subcategoria/grupo  mostrar apenas subcategorias do modulo atual, se estamos no modulo materia prima, mostrar apenas subcategorias do modulo materia prima, e assim nos outros modulos tbm  | - |
| 116 | `7d4e979c` | EdsonFerrari | 2026-07-14 03:39:43.632022+00 | 🔴 Bug | Compras > Matéria-Prima | awaiting_review | estou fazendo uma serie de feedbacks de pequenos refinos e ajustes visuais  ficha tecnica e consumo, mudar esse nome e colocar apenas detalhes do insumo,   Aba configuracoes, deixar apenas o ícone     | - |
| 117 | `66a37077` | EdsonFerrari | 2026-07-14 03:41:47.509152+00 | 🔴 Bug | Compras > Matéria-Prima | awaiting_review | quanto eu adicionar um insumo semelhente ao insumo, trazer dados desses insumo semelhante, como previsao de estoque futuro, previsao de estoque dos dois juntos, medias juntos e etc  fazer uma aba separada para eles, apenas quando tiver configurado que tenha semelhantes, quanto nao tiver, nao precisa mostrar a aba , e a aba vai mostrar apenas um icone , fazer isso em todos os modulos de compras  | - |
| 118 | `37fc9de9` | EdsonFerrari | 2026-07-14 03:43:51.404761+00 | 🔴 Bug | Compras > Matéria-Prima > Configurações | awaiting_review | Regras de Subcategoria Automática (Por Prefixo) esta mostrando de todos os modulos de compra, deixar apenas dos modulos respectivos, exemplo, estamos em materia prima, mostrar regras automaticas apenas de materia prima  adicionar mais opcoes de classificacao automatica, por exemplo, classificar por fornecedor, fazer isso em todos os modulos de compra  | - |
| 119 | `ddde1f93` | EdsonFerrari | 2026-07-14 03:50:43.346463+00 | 🔴 Bug | Compras > Módulo de Compras > Notas Fiscais | awaiting_review | ok, modulo de compras me parece incompleto, siderbar inutilizada, nao consigo ver detalhes de frete, mostra apenas a data da emisao e nao a data da entrada no item, tem muitos outros detalhes no meu erp que nao consigo visualizar aqui  codigo da nf impostos detalhados por item dados de frete como havia mencionado  cnpj fornecedor contas a pagar da nf se tiver cfop  enfim, varios detalhes  | - |
| 120 | `dcee019d` | EdsonFerrari | 2026-07-14 03:51:54.836842+00 | 🔴 Bug | Compras > Pedidos > Módulo de Compras > Controle de Pedidos | awaiting_review | remove aba cancelados  | - |
| 121 | `81864e2a` | EdsonFerrari | 2026-07-14 03:52:26.997235+00 | 🔴 Bug | Compras > Pedidos > Módulo de Compras > Controle de Pedidos | awaiting_review | remover essa descricao e titulo : Controle de Pedidos de Compra Acompanhe pedidos enviados aos fornecedores, status de entregas e quantidades recebidas. | - |
| 122 | `76e50470` | EdsonFerrari | 2026-07-14 03:54:05.611418+00 | 🔴 Bug | Compras > Notas Fiscais > Módulo de Compras > Notas Fiscais | awaiting_review | remover esse titulo e descricao : Histórico de Notas Fiscais de Compra Consulte lançamentos fiscais, itens faturados, fornecedores e valores unitários praticados. | - |
| 123 | `d0f3ea60` | EdsonFerrari | 2026-07-14 03:54:24.297934+00 | 🔴 Bug | Produção > Montagem de Kits > Módulo de Compras > Notas Fiscais | awaiting_review | remover esse titulo e descricao :Ordens de Montagem de Kits Gerencie e acompanhe a montagem de kits comerciais. | - |
| 124 | `1aa1aa7b` | EdsonFerrari | 2026-07-14 03:55:22.491393+00 | 🔴 Bug | Produção > Montagem de Kits > Módulo de Compras > Notas Fiscais | awaiting_review | remover esse titulo e descricao :  Componentes e Alertas de Estoque Verifique a disponibilidade de componentes individuais para montagem.  Composição de Kits Comerciais Gerencie a relação de componentes que compõem cada kit comercial.  Ordens de Conversão de Produto Gerencie a conversão, reetiquetagem e reenvase de produtos acabados.  Composição de Conversões de Produto Vincule a relação de produtos origem/destino para ordens de conversão.  | - |

## ⛔ Reprovados

_Nenhum._

## 🟢 Finalizados

| Prio | ID | Solicitante | Data/Hora | Tipo | Página | Resolvido em |
| ---: | --- | --- | --- | --- | --- | --- |
| 100 | `ac4a1814` | Edson | 2026-07-12 05:51:57.830951+00 | 🔴 Bug | Produção > Físico-Química > Registrar Físico-Química | 2026-07-12 06:51:28.269447+00 |
| 100 | `d10fc358` | Edson | 2026-07-12 02:43:55.716352+00 | 🔵 Sugestão | Produção > Gerenciamento > Dashboard | 2026-07-12 06:16:21.812127+00 |
| 100 | `44c9d6b0` | Edson | 2026-07-12 02:18:51.130905+00 | 🔵 Sugestão | Painel Supervisor > painel supervisor | 2026-07-12 06:17:02.953069+00 |
| 101 | `1fba1edc` | Edson | 2026-07-12 02:19:17.801942+00 | 🔴 Bug | Painel Supervisor > painel supervisor | 2026-07-12 06:16:41.980851+00 |
| 101 | `36b20514` | Edson | 2026-07-12 05:53:18.928864+00 | 🔴 Bug | Produção > Microbiologia > Gerar Lote | 2026-07-12 06:51:51.252605+00 |
| 102 | `63a98b8d` | Edson | 2026-07-12 02:19:33.378904+00 | 🔴 Bug | Painel Supervisor > painel supervisor | 2026-07-12 06:16:50.757758+00 |
| 102 | `29af90b0` | Edson | 2026-07-12 05:54:20.714315+00 | 🔵 Sugestão | Produção > Lotes de Produção > lotes | 2026-07-12 06:52:04.390692+00 |
| 103 | `3758fa2a` | Edson | 2026-07-12 05:56:09.468186+00 | 🔴 Bug | Produção > Lotes de Produção > lotes | 2026-07-12 06:52:17.17112+00 |
| 104 | `11783b03` | Edson | 2026-07-12 05:57:06.434423+00 | 🔵 Sugestão | Produção > Lotes de Produção > lotes | 2026-07-12 06:52:25.145768+00 |
| 105 | `0c8c10dc` | Edson | 2026-07-12 05:58:39.405061+00 | 🔴 Bug | Administrativo > Linha de Produtos | 2026-07-12 06:52:33.378031+00 |
| 106 | `245c8e35` | Edson | 2026-07-12 05:59:48.873891+00 | 🔵 Sugestão | Administrativo > Linha de Produtos | 2026-07-12 06:52:43.31825+00 |
| 107 | `d8db210d` | Edson | 2026-07-12 06:01:49.824312+00 | 🔴 Bug | Administrativo > Administrativo/linhas de produtos, configuracoes | 2026-07-12 06:53:02.328226+00 |
| 108 | `921baaad` | Edson | 2026-07-12 06:04:37.802434+00 | 🔵 Sugestão | Compras > Coloração > Configurações | 2026-07-12 06:53:32.091518+00 |
| 109 | `9b3f30a4` | Edson | 2026-07-12 06:05:11.756697+00 | 🔵 Sugestão | Compras > Planejamento > Demandas | 2026-07-12 06:54:05.675105+00 |
| 110 | `6dec73ff` | Edson | 2026-07-12 06:08:02.499216+00 | 🔵 Sugestão | Compras > Cotações | 2026-07-12 06:53:50.127089+00 |
| 111 | `0a1b4d5f` | Edson | 2026-07-12 06:45:52.68973+00 | 🔵 Sugestão | Compras > coloracao/materiaprima/embalagens/materialdeapapoio | 2026-07-14 04:00:06.457087+00 |
| 125 | `6444b519` | EdsonFerrari | 2026-07-14 03:58:15.25632+00 | 🔴 Bug | Administrativo > Linha de Produtos | 2026-07-14 04:58:36.609395+00 |


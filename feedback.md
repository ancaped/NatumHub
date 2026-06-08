# Feedback e Relatórios de Bugs - NatumHub

Este arquivo é gerado automaticamente pelo aplicativo NatumHub a partir dos feedbacks enviados pelo painel flutuante. Ele serve para que desenvolvedores e IAs possam analisar e corrigir problemas rapidamente.

## 🔴 Bugs Pendentes

*Nenhum bug pendente.*

## 🔵 Sugestões / Feedbacks Pendentes

| ID | Data | Página | Descrição |
| --- | --- | --- | --- |
| `6d7f64c5` | 2026-06-08 14:19:51 | `Geral > Compras Online` | adicionar opção de devolução, as vezes acontece da mercadoria vir errada, daí tenho que cadastrar o prazo para devolver e acompanhar. Adicionar também o cadastrado de lojas, para termos relatórios de evolução de preços e etc. |
| `fb1237f8` | 2026-06-08 14:07:30 | `Compras > Demandas` | estou achando esse modulo um pouco destoante dos demais modulos, precisamos melhorar. crie um aba separada onde veremos todos o insumos/materias primas. |
| `bc322ad4` | 2026-06-08 13:36:26 | `Geral > Módulo de compras` | adicionar modulo de notas fiscais |
| `5dce017a` | 2026-06-08 13:35:50 | `Geral > Módulo de Estoque > Insumos` | poder clicar na nota fiscal e ver detalhes dela |
| `2ea01569` | 2026-06-08 13:34:57 | `Produção > Gerenciamento de Produção` | adicionar uma opção no side bar de ver itens com erro de estoque, exemplo para produção |
| `40c4a292` | 2026-06-08 13:28:22 | `Produção > gerenciamento de producao` | ver e produzir em conjunto itens semelhantes |
| `fd705a07` | 2026-06-08 13:26:54 | `Produção > gerenciamento de producao` | controle de base no estoque e opção de consumir base ao abrir ordem |

## 🟢 Resolvidos

| ID | Data | Tipo | Página | Descrição | Resolvido Em |
| --- | --- | --- | --- | --- | --- |
| `28365535` | 2026-06-08 14:04:03 | 🔴 Bug | `Geral > Módulo de Compras > Controle de Pedidos` | classificação dos pedidos (Aberto, Parcial, Concluído, Cancelado) e chaves duplicadas no React | 2026-06-08 18:38:00 |
| `7da77575` | 2026-06-08 13:23:03 | 🔴 Bug | `Geral > Módulo de Compras > Controle de Pedidos` | não puxando dados de pedidos do SQL (resolvido vinculação de FK e chaves únicas) | 2026-06-08 18:38:00 |
| `62f463e9` | 2026-06-08 13:21:42 | 🔴 Bug | `Geral > Módulo de Estoque > Insumos` | erro na consulta de notas fiscais e pedidos pendentes no SQL (aumentado range de busca de notas/pedidos) | 2026-06-08 18:38:00 |
| `584a6953` | 2026-06-08 17:38:01 | 🔴 Bug | `Produção > Gerenciamento de Produção` | em Produtos com Formulação Semelhante so mostrar itens com formulação 100% idêntica e mesma proporção | 2026-06-08 18:30:00 |
| `7aace088` | 2026-06-08 17:33:35 | 🔴 Bug | `Compras > Insumos & MP` | data irreal (como 2708) em último uso | 2026-06-08 18:30:00 |
| `ed71f5e1` | 2026-06-08 17:31:42 | 🔴 Bug | `Compras > Insumos & MP` | captura de tela lenta no floating widget | 2026-06-08 18:30:00 |
| `f687a121` | 2026-06-08 17:31:16 | 🔴 Bug | `Compras > Insumos & MP` | ácido cítrico YoY mostrando apenas 2026 (corrigido para puxar consumo de Lotes_Baixas) | 2026-06-08 18:30:00 |
| `3d283bad` | 2026-06-08 14:21:35 | 🔴 Bug | `Compras > Insumos & MP` | insumos monthly and YoY consumption (aumentado range de sync do ERP de 12 meses para desde 2024-01-01) | 2026-06-08 18:35:00 |
| `058d4953` | 2026-06-08 17:40:05 | 🔵 Sugestão | `Produção > Gerenciamento de Produção` | aba de lotes de produção com detalhes industriais | 2026-06-08 18:30:00 |
| `91ae6037` | 2026-06-08 17:39:44 | 🔵 Sugestão | `Produção > Gerenciamento de Produção` | abrir detalhes do produto ao clicar no nome (composição, estoque de insumos, YoY, mensal) | 2026-06-08 18:30:00 |
| `dde23032` | 2026-06-08 18:25:56 | 🔵 Sugestão | `Geral > Módulo de Estoque > Insumos` | em detalhes do insumo adicionar em quais produtos ele é usado | 2026-06-08 18:35:00 |
| `2c93862a` | 2026-06-08 17:48:29 | 🔵 Sugestão | `Compras > Demandas` | melhorar visualização da página demandas (adicionado bloco de cartões KPI e coesão visual) | 2026-06-08 18:35:00 |
| `c8bac031` | 2026-06-05 18:40:27 | 🔵 Sugestão | `Geral > Módulo de compras` | adicionar modulo de pedidos, existe no servidor ou no erp que eu usava um modulo de controle de pedidos, gostaria de fazer um aqui tambem com os dados que tenho do servidor  | 2026-06-08 13:22:33 |
| `17870b4c` | 2026-06-05 18:39:31 | 🔵 Sugestão | `Geral > Módulo de Estoque` | esse liste no side bar, eram para modulos separados dentro de estoque, com informações e assossiançoes de dados unicos para cada modulo | 2026-06-08 13:22:13 |
| `5b7106b5` | 2026-06-05 18:18:55 | 🔴 Bug | `Compras > Configurações` | retirar essa opção de apagar todos os dados, vai tornar inutilizada agora, visto que não há mais importacao de dados de planilhas e sim apenas consultar direto ao banco de dados  | 2026-06-05 18:40:33 |
| `a3d7a6ec` | 2026-06-05 18:17:13 | 🔵 Sugestão | `Geral > Módulo de Estoque` | retirar esse copia do sql server, todas as configurações de consultar do sqp estao na pagina inicial do hub agora, tudo centralizado, retirar tambem esse botao sincronizar erp do canto inferior esquerdo  | 2026-06-05 18:40:35 |

## 📋 Logs de Erros

### bug-log-28365535

**Página:** `Geral > Módulo de Compras > Controle de Pedidos`  
**Descrição:** classificação dos pedidos, em aberto, pacial, concluidos, cancelados, parece não esta acontecendo   

```json
[2026-06-08T14:02:56.013Z] [ERROR] Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 1485-1026
[2026-06-08T14:02:56.475Z] [ERROR] Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 1485-1026
[2026-06-08T14:02:56.651Z] [ERROR] Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 1485-1026
[2026-06-08T14:03:28.411Z] [ERROR] Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 1136
```

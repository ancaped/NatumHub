# Guia de Mapeamento do Banco de Dados e Regras de Negócio (NATUM ERP -> NatumHub)

Este documento descreve a estrutura de tabelas do banco de dados SQL Server do ERP legado da **Natum Cosméticos** e como esses dados são mapeados, interpretados e tratados no banco SQLite local (`data.db`) do **NatumHub**. 

O objetivo deste guia é servir de referência técnica para evitar bugs de interpretação física dos campos (ex: confundir peso bruto em Kg com contagem de unidades, perder registros duplicados devido a restrições de chaves, ou ignorar regras de codificação do driver SQL Server).

---

## 1. Banco de Dados SQL Server (ERP Legado)

O banco de dados do ERP possui tabelas principais que registram os metadados de ordens de produção (OPs), pesagens e receitas. As strings textuais no SQL Server utilizam codificação com collations específicas que necessitam de tratamento na query.

> [!IMPORTANT]
> **Regra de Collation (Tiberius/Rust)**: 
> Toda consulta a campos de texto (`VARCHAR`/`CHAR`/`TEXT`) no SQL Server deve incluir a cláusula `COLLATE Latin1_General_CI_AS` (ex: `l.cStatus COLLATE Latin1_General_CI_AS as cStatus`). Caso contrário, o driver Rust Tiberius falhará com erro de codificação de caracteres não suportado (`Encoding unsupported (LCID: 0x409, sort ID: 44)`).

### A. Tabela `Lotes` (Cabeçalho de OPs e Conferência)
Representa a Ordem de Produção (OP) de produto acabado e seu fechamento físico.

| Campo SQL Server | Tipo | Descrição / Regra de Negócio | Mapeamento no Hub |
| :--- | :--- | :--- | :--- |
| `nLote` | `INT` | Número único identificador da OP (Número do Lote). | `document_number` no SQLite |
| `cCodProd` | `VARCHAR` | Código do produto acabado principal (SKU). | `item_code` (`produto`) |
| `nQtde` | `FLOAT` | **Massa Bruta Total** fabricada do lote (Kg). | `quantity` (usado para rendimento) |
| `dLote` | `DATETIME` | Data de criação/abertura da OP. | `date` |
| `cStatus` | `VARCHAR` | Status atual da OP (`EA`: Estoque Atualizado, `CF`: Conferido, `PG`: Em Pesagem, `EN`: Em Envase). | `status` (traduzido para rótulo legível) |
| `cFabricadopor` | `VARCHAR` | Nome do operador que pesou/fabricou a massa do lote. | `fabricated_by` em metadados |
| `cAutorizadopor`| `VARCHAR` | Nome do supervisor que liberou a OP. | `authorized_by` em metadados |
| `nUnidades` | `FLOAT` | **Quantidade Física Real** de unidades lançadas no estoque (Conferido). | Salvo no campo `details` do SQLite como `Unidades: X` |
| `nUnCompletas` | `FLOAT` | Quantidade total de unidades envasadas na linha de produção. | Utilizado para auditoria de envase |

#### ⚠️ Pitfall Crítico: Massa Bruta (`nQtde`) vs Unidades de Estoque (`nUnidades`)
* **`nQtde`**: É a massa total de granel produzida (ex: `100.0 Kg` de máscara). 
* **`nUnidades`**: É o número de frascos/potes colocados no estoque físico após o envase (ex: `47` potes de 2,1 Kg).
* **Cálculo de Fallback**: Caso o lote seja antigo ou esteja em andamento (onde `nUnidades` é 0 ou nulo), o Hub estima as unidades dividindo a massa pelo peso unitário do produto extraído da descrição (`quantity / unit_weight`). Se `nUnidades` existir no banco e for maior que 0, **use sempre `nUnidades`** diretamente para evitar discrepâncias de arredondamento.

---

### B. Tabela `Lotes_Baixas` (Baixas de Estoque / Pesagem)
Registra cada movimentação de saída de matérias-primas e embalagens destinadas a uma OP.

| Campo SQL Server | Tipo | Descrição / Regra de Negócio | Mapeamento no Hub |
| :--- | :--- | :--- | :--- |
| `Registro` | `INT` | Identificador sequencial da baixa no ERP. | - |
| `nLote` | `INT` | Lote de produção de destino (relaciona-se com `Lotes.nLote`). | `document_number` |
| `cReferencia` | `VARCHAR` | Código do insumo baixado (ex: `9.15.064` para matéria-prima ou `9.08.021` para embalagem). | `item_code` (`insumo`) |
| `nQtde` | `FLOAT` | Quantidade física baixada do estoque para o lote. | `quantity` (`saida`) |
| `dLog` | `DATETIME` | Data em que a baixa de estoque foi registrada. | `date` |
| `cUsuario` | `VARCHAR` | Operador que realizou a pesagem/baixa no estoque. | Salvo nos detalhes da movimentação |

---

### C. Tabela `Composicao` (Formulação / Receitas)
Define a estrutura de insumos (matérias-primas e embalagens) necessária para fabricar 1 unidade de produto acabado.

| Campo SQL Server | Tipo | Descrição / Regra de Negócio | Mapeamento no Hub |
| :--- | :--- | :--- | :--- |
| `cCodProd` | `VARCHAR` | Código do produto acabado (SKU). | `product_code` no SQLite |
| `cReferencia` | `VARCHAR` | Código do ingrediente ou embalagem. | `ingredient_code` no SQLite |
| `cDescricao` | `VARCHAR` | Descrição nominal do insumo (ex: ÁGUA DESMINERALIZADA). | `description` |
| `nQuantidade` | `FLOAT` | Quantidade padrão consumida por unidade de produto (Kg para matérias-primas, unidades decimais para embalagens). | `quantity` |
| `NPERCENTUAL` | `FLOAT` | Porcentagem teórica da matéria-prima na receita de massa (ex: 61.1%). | `percentage` |

#### ⚠️ Pitfall Crítico: Ingredientes Duplicados (Múltiplas Fases)
* Uma receita pode utilizar o **mesmo insumo em fases distintas** (ex: Água adicionada na Fase A e novamente na Fase C). No SQL Server, isso gera duas linhas na tabela `Composicao` com o mesmo `cCodProd` e `cReferencia`, mas com quantidades/porcentagens diferentes.
* **Mapeamento local**: A tabela `formulations` local no SQLite **não deve** possuir chave primária composta nos campos `(product_code, ingredient_code)`. Em vez disso, utiliza uma chave autoincrementável `id INTEGER PRIMARY KEY AUTOINCREMENT`.
* **Regra de Consolidação**: Ao realizar auditorias ou mostrar dados de receitas unificados para o usuário, **sempre agrupe os itens da formulação** por código do insumo somando suas quantidades e percentuais (ex: `SELECT SUM(quantity) ...` ou agrupamento em memória Rust). Do contrário, apenas uma das fases será considerada nas comparações.

---

## 2. Banco de Dados SQLite Local (`data.db`)

O NatumHub consolida os dados do ERP em um esquema simplificado e otimizado para o desktop.

### Tabela `stock_movements` (Movimentações Consolidadas)
Substitui a complexidade de múltiplas tabelas de notas fiscais, vendas e baixas por uma estrutura unificada indexada.

* **Fórmula de Índices**: Possui o índice crítico `idx_movements_doc` na coluna `document_number` para evitar *Full Table Scans* ao carregar os detalhes de OPs.
* **Detalhes Codificados (`details`)**: 
  - Para entradas de produto acabado (`movement_type = 'entrada'`), a coluna `details` armazena informações concatenadas usando o caractere pipe `|` como separador:
    ```text
    Status: EA | Fab: RAFAEL MARINHO | Aut: RAFAEL MARINHO | Unidades: 47.0
    ```
  - **Função de Leitura**: O backend Rust lê esse campo e extrai valores dinamicamente no parser de detalhes do lote.

---

## 3. Regras de Ouro para Desenvolvimento de Código

1. **Sempre consolidar ingredientes da receita antes de auditar discrepâncias**:
   No backend (`handlers.rs`), antes de comparar as pesagens reais do lote (`stock_movements.saida`) com o previsto na receita, agrupe a receita por `ingredient_code`. O operador pode ter feito uma única pesagem somando ambas as fases previstas.
2. **Priorizar `nUnidades` (conferido) sobre o peso bruto**:
   Na conferência física do lote, a contagem de unidades finalizada deve vir do campo `Unidades` parseado dos detalhes. A divisão `quantity / main_unit_weight` é apenas um cálculo aproximado teológico para lotes sem fechamento físico registrado.
3. **Sempre usar `COLLATE Latin1_General_CI_AS` em queries SQL Server**:
   Qualquer nova integração com tabelas do ERP antigo deve forçar a collation nos campos string para prevenir panics no driver Tiberius.
4. **Verificar se a sincronização foi executada**:
   Se as pesagens exibirem matérias-primas zeradas ou não sincronizadas, verifique se a tabela `formulations` possui registros. Uma migração estrutural apaga a tabela temporariamente até que o usuário clique em **Sincronizar** no painel do Hub.

# Módulo Físico-Química (FiscoQuimica) - Documentação Técnica

O módulo de **Análise Físico-Química** foi integrado ao **NatumHub** para gerenciar o controle de qualidade laboratorial da produção, registrando parâmetros de pH, viscosidade e densidade, além de prover ferramentas para o cálculo de envase e correção de viscosidade de lotes.

---

## 1. Regras de Negócio e Fórmulas

### 1.1. Cálculo de Densidade
* A medição é feita utilizando um copo padrão metálico calibrado com o volume constante de **`51.645 mL`** (constante `DENSITY_CUP_VOLUME`).
* A densidade do lote é calculada dividindo o peso medido da fração ($g$) pelo volume do copo calibrador:
  $$\text{Densidade (g/mL)} = \frac{\text{Peso da Fração (g)}}{51.645}$$

### 1.2. Envase por Densidade (Visual e Sem Correção)
* **Equivalência Nominal**: O sistema assume a premissa de que $1\text{ g} = 1\text{ mL}$ (e $1\text{ kg} = 1\text{ L}$) na pesagem nominal do produto.
* **Peso Alvo (Balança)**: Permanece fixo de acordo com a capacidade nominal da embalagem configurada no padrão do produto (ex: um produto de `500 mL` sempre exigirá um peso alvo de **`500,0 g`** na balança; um de `1 L` exigirá **`1,0 kg`**). O teste de densidade não altera este alvo.
* **Volume Equivalente (Informativo)**: Mostra visualmente o volume em mL (ou L) que o produto ocupará no recipiente com base na densidade real:
  $$\text{Volume Equivalente} = \text{Capacidade Nominal} \times \text{Densidade}$$
  * *Exemplo*: Um item de `500 mL` com densidade de `1.123 g/mL` (peso de fração de `58.000 g`) gera um Volume Equivalente de **`561,5 mL`**, informando ao operador o espaço que o lote ocupará no frasco.

---

## 2. Experiência de Usuário (UX) e Digitação Inteligente

### 2.1. Formatação Inteligente em Tempo Real e no Blur
* **Fração e Teclado**: Todos os campos decimais utilizam `type="text"` com `inputMode="decimal"` para otimizar teclados móveis e aceitam vírgulas (`,`), convertendo-as em pontos (`.`) dinamicamente no `onChange`.
* **Auto-formatação de pH no Blur**:
  * Inteiros > 14 com 2 dígitos (ex: `55`) viram `5.5`.
  * Inteiros > 14 com 3 ou mais dígitos (ex: `625`) viram `6.25`.
  * Valores <= 14 permanecem intocados.
* **Formatação de Padrões**: Os campos do modal de Cadastro/Edição de Padrões (`patPhMin`, `patPhMax`, `patDensityTarget`, `patDensityTolerance`) possuem os mesmos manipuladores `onBlur` para garantir a consistência das especificações.
* **Preenchimento Automático de Capacidade**: Ao cadastrar a especificação de um produto novo, o sistema analisa o nome do produto via Regex (ex: `'SHAMPOO CACHOS 500 ML...'` ou `'MASCARA 1 KG...'`) e preenche automaticamente o campo de volume e seleciona a unidade (`mL`, `L`, `g`, `kg`).

### 2.2. Pesquisa de Códigos sem Pontuação (Pesquisa Fluida)
* **Autocompletes (Datalists)**: Os campos de entrada de produtos e matérias-primas corretivas exibem opções contendo tanto a versão formatada quanto a versão sem pontos no texto da opção (ex: `511011 - SHAMPOO...` para o código `5.11.011`). Isso permite que o navegador faça o autocomplete mesmo se o usuário digitar sem pontos.
* **Filtros e Consultas**: As barras de pesquisa do Histórico de Laudos e da listagem de Padrões normalizam os termos comparados limpando os pontos (`.`) de ambos os lados, possibilitando buscas por códigos inteiros ou parciais sem pontuação (ex: buscar `5110` ou `511011` encontra `5.11.011`).

---

## 3. Estrutura de Tabelas no Banco de Dados SQLite (`data.db`)

O módulo físico-químico utiliza as seguintes tabelas estruturadas em SQLite:

### 3.1. Tabela: `fisco_quimica_patterns`
Define as especificações e limites toleráveis para cada produto acabado.
```sql
CREATE TABLE fisco_quimica_patterns (
    product_code TEXT PRIMARY KEY,       -- Código do produto (ex: '5.11.011')
    ph_min REAL NOT NULL,                -- pH mínimo tolerável
    ph_max REAL NOT NULL,                -- pH máximo tolerável
    viscosity_min REAL NOT NULL,         -- Viscosidade mínima (cps)
    viscosity_max REAL NOT NULL,         -- Viscosidade máxima (cps)
    density_target REAL NOT NULL,        -- Densidade teórica alvo (g/mL)
    density_tolerance REAL NOT NULL,     -- Tolerância aceitável (±)
    package_volume REAL NOT NULL,        -- Volume nominal da embalagem
    package_unit TEXT NOT NULL,          -- Unidade ('mL', 'L', 'g', 'kg')
    allowed_agents TEXT                  -- JSON array de IDs de MP corretiva permitida
);
```

### 3.2. Tabela: `fisco_quimica_agents`
Matérias-primas cadastradas no ERP que foram liberadas para atuação como agentes de ajuste de viscosidade (ex: Cloreto de Sódio, Lauril).
```sql
CREATE TABLE fisco_quimica_agents (
    id TEXT PRIMARY KEY,                 -- Código interno da Matéria-Prima
    name TEXT NOT NULL,                  -- Descrição da MP
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3.3. Tabela: `fisco_quimica_analyses`
Laudos de análises físicas e químicas realizadas em cada lote produzido.
```sql
CREATE TABLE fisco_quimica_analyses (
    id TEXT PRIMARY KEY,                 -- UUID da análise
    product_code TEXT NOT NULL,          -- Código do produto analisado
    product_name TEXT NOT NULL,          -- Nome/descrição do produto
    batch TEXT NOT NULL,                 -- Lote analisado (ex: 'L2026-A')
    analysis_date TEXT NOT NULL,         -- Data da medição (YYYY-MM-DD)
    technician TEXT NOT NULL,            -- Nome do técnico analista
    ph_measured REAL NOT NULL,           -- pH medido
    viscosity_measured REAL NOT NULL,    -- Viscosidade medida (cps)
    density_measured REAL NOT NULL,      -- Densidade calculada
    fraction_weight REAL NOT NULL,       -- Peso da fração medido (g)
    envase_target_weight REAL NOT NULL,  -- Peso nominal do envase salvo
    envase_target_unit TEXT NOT NULL,    -- Unidade do peso nominal ('g' ou 'kg')
    has_adjustment INTEGER NOT NULL,     -- 1 se houve ajuste de viscosidade, 0 caso contrário
    corrective_agent_id TEXT,            -- ID da MP corretiva (se houve ajuste)
    initial_viscosity REAL,              -- Viscosidade antes do corretivo
    trial_agent_qty REAL,                -- Dosagem de teste em 1L (g)
    trial_viscosity REAL,                -- Viscosidade após a dosagem de teste
    agent_qty_per_liter REAL,            -- Concentração prática final adotada (g/L)
    batch_size REAL,                     -- Tamanho total do lote (L ou kg)
    total_agent_required REAL,           -- Total de corretivo estimado para o lote
    notes TEXT,                          -- Observações gerais do laudo
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

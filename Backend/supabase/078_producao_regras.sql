-- 078_producao_regras.sql
-- Regras e anotações do planejamento da produção: o que o agente de IA (e o operador) precisa saber antes de planejar.
-- Escopo: geral, linha (prefixo), base (código da base) ou produto (código). Tipo: regra (deve seguir) ou anotação (contexto).
-- Nada é apagado: arquivar = ativo = false. Aditiva e idempotente.
CREATE TABLE IF NOT EXISTS producao_regras (
    id BIGSERIAL PRIMARY KEY,
    escopo TEXT NOT NULL CHECK (escopo IN ('geral', 'produto', 'linha', 'base')),
    alvo TEXT,
    tipo TEXT NOT NULL CHECK (tipo IN ('regra', 'anotacao')),
    texto TEXT NOT NULL CHECK (btrim(texto) <> ''),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_por TEXT NOT NULL DEFAULT 'sistema',
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_por TEXT NOT NULL DEFAULT 'sistema',
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((escopo = 'geral' AND alvo IS NULL) OR (escopo <> 'geral' AND alvo IS NOT NULL AND btrim(alvo) <> ''))
);

CREATE INDEX IF NOT EXISTS idx_producao_regras_escopo_alvo ON producao_regras (escopo, alvo);

-- Regras gerais já decididas pelo Edson. Semeia uma única vez (só com a tabela vazia).
INSERT INTO producao_regras (escopo, alvo, tipo, texto, criado_por, atualizado_por)
SELECT 'geral', NULL, 'regra', v.texto, 'sistema', 'sistema'
FROM (VALUES
    (1, 'Ordem da fila: vem antes o produto que acaba antes (EFP crescente), a mesma ordem da Demanda de Produção.'),
    (2, 'Item colocado à mão na fila manda sobre o automático (quantidade e prioridade dele). Limpar a fila apaga só os itens colocados à mão; os automáticos voltam enquanto forem necessários. Limpar exige motivo e fica na auditoria.'),
    (3, 'Máscaras e cremes quentes podem ir na bombona com vapor da caldeira até 150 kg.'),
    (4, 'Um reator pode ter várias produções diferentes no mesmo dia; a capacidade do reator limita só o tamanho de cada batelada.'),
    (5, 'Água desmineralizada fica como «sem controle» (não acusa falta) até o estoque dela ser corrigido no ERP.'),
    (6, 'Só programar no dia o que tem 100% dos insumos e embalagens cobertos, contando o que já está no quadro da semana.')
) AS v(n, texto)
WHERE NOT EXISTS (SELECT 1 FROM producao_regras)
ORDER BY v.n;

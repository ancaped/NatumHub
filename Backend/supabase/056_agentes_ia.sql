-- 056_agentes_ia.sql
-- Identidade de agente de IA: um operador do tipo 'agente' que entra só com token próprio (nxa_...), nunca com senha.
-- As permissões por módulo são as mesmas dos operadores (hub_operator_modules, ver/editar).
-- Idempotente: roda em todo boot (SCHEMA_FILES).

ALTER TABLE hub_operators ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'humano';

CREATE TABLE IF NOT EXISTS hub_agent_tokens (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL REFERENCES hub_operators(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    prefixo TEXT NOT NULL,
    criado_por TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ultimo_uso TIMESTAMPTZ,
    revogado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_hub_agent_tokens_operator ON hub_agent_tokens (operator_id);

-- Auditoria geral: de onde veio cada ação ('tela', 'agente' ou 'sistema').
ALTER TABLE hub_audit_events ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'tela';

-- Ficha técnica (Central de Desenvolvimento)
UPDATE mapa_modules
SET detail = COALESCE(detail, '{}'::jsonb) || jsonb_build_object(
        'agentes_ia', jsonb_build_object(
            'rotas', jsonb_build_array(
                'GET /api/agentes/eu (quem sou e o que posso: módulos ver/editar)',
                'GET /api/admin/agentes (supervisor)',
                'POST /api/admin/agentes {nome, modulos:{chave:"ver"|"editar"}, confirmar}',
                'POST /api/admin/agentes/:id/token?confirmar=true (troca o token)',
                'POST /api/admin/agentes/:id/revogar?confirmar=true'
            ),
            'regras', jsonb_build_array(
                'Agente = hub_operators.kind=agente; entra só com Bearer nxa_... (hash SHA-256 em hub_agent_tokens), nunca por senha',
                'Nunca é supervisor e não herda módulos padrão do papel: só os marcados em hub_operator_modules',
                'Lê e grava só rotas dos seus módulos (auth::store::modulos_da_rota); rota sem módulo mapeado é negada ao agente',
                'Escritas em 2 passos (core::acao::executar_em_2_passos) e erro padrão {erro:{codigo,mensagem,detalhes}}',
                'Auditoria geral hub_audit_events.origem = tela | agente | sistema'
            ),
            'arquivos', jsonb_build_array(
                'Backend/src/modules/geral/agentes/mod.rs',
                'Backend/src/core/acao.rs'
            )
        )
    ),
    updated_at = NOW()
WHERE module_key = 'hub_operadores';

-- 052_producao_auditoria.sql
-- Quem fez o quê nas ações do Gerenciamento de Produção (telas e, no futuro, agentes de IA via MCP).
-- Idempotente: roda em todo boot (SCHEMA_FILES).

CREATE TABLE IF NOT EXISTS producao_auditoria (
    id BIGSERIAL PRIMARY KEY,
    quando TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    usuario TEXT NOT NULL,
    acao TEXT NOT NULL,
    alvo TEXT NOT NULL DEFAULT '',
    detalhe JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_producao_auditoria_quando ON producao_auditoria (quando DESC);

UPDATE mapa_modules
SET detail = COALESCE(detail, '{}'::jsonb) || jsonb_build_object(
        'auditoria', jsonb_build_object(
            'rotas', jsonb_build_array('GET /api/producao/auditoria?limite=50'),
            'regras', jsonb_build_array(
                'Toda ação que grava (decisões, trocas, origem da base) registra usuário, ação, alvo e detalhe',
                'Escritas em 2 passos: sem confirmar=true a rota só devolve a prévia; com confirmar=true grava'
            ),
            'arquivos', jsonb_build_array('Backend/src/modules/producao/auditoria.rs')
        )
    ),
    updated_at = NOW()
WHERE module_key = 'planejamento_producao';

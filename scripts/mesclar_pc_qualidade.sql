-- Mescla no banco do ZimaOS (natumhub) o que foi digitado no PC Qualidade depois da separação (~20/10/2026).
-- Rodado por scripts/mesclar_pc_qualidade.sh, que copia as tabelas do dump do PC para o esquema :esq.
-- Decisões do Edson (2026-11-03): D1 em conflito vale o alterado por último (updated_at), nada é apagado;
-- D2 os logins de setor do PC não entram; D3 sobras da W43 que só existem no ZimaOS saem dos quadros (quadros_ocultos), sem apagar.
-- Tudo numa transação: com confirmar=0 mostra o resumo e desfaz; com confirmar=1 grava. Pode rodar de novo sem duplicar.
\set ON_ERROR_STOP on
BEGIN;
\o /dev/null
SELECT set_config('mescla.esq', :'esq', true);

CREATE TEMP TABLE resumo (ordem SERIAL, tabela TEXT, acao TEXT, n BIGINT) ON COMMIT DROP;

-- Colunas que existem nos dois lados (o ZimaOS tem colunas novas: ficam com o padrão).
CREATE FUNCTION pg_temp.colunas(t TEXT) RETURNS TEXT[] LANGUAGE sql AS $$
    SELECT COALESCE(array_agg(d.column_name::text ORDER BY d.ordinal_position), '{}')
    FROM information_schema.columns d
    JOIN information_schema.columns s
      ON s.table_schema = current_setting('mescla.esq') AND s.table_name = d.table_name AND s.column_name = d.column_name
    WHERE d.table_schema = 'public' AND d.table_name = t AND d.is_generated = 'NEVER'
$$;

CREATE FUNCTION pg_temp.lista(cols TEXT[], prefixo TEXT DEFAULT '') RETURNS TEXT LANGUAGE sql AS $$
    SELECT string_agg(prefixo || quote_ident(c), ', ') FROM unnest(cols) c
$$;

CREATE FUNCTION pg_temp.igual(cols TEXT[]) RETURNS TEXT LANGUAGE sql AS $$
    SELECT string_agg(format('d.%1$I IS NOT DISTINCT FROM s.%1$I', c), ' AND ') FROM unnest(cols) c
$$;

CREATE FUNCTION pg_temp.anotar(t TEXT, acao TEXT, n BIGINT) RETURNS VOID LANGUAGE sql AS $$
    INSERT INTO resumo (tabela, acao, n) VALUES (t, acao, n)
$$;

-- Acrescenta as linhas do PC cuja chave não existe no ZimaOS (chave de texto: não há colisão de numeração).
CREATE FUNCTION pg_temp.inserir_faltantes(t TEXT, chave TEXT[], filtro TEXT DEFAULT 'true') RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE cols TEXT[] := pg_temp.colunas(t); n BIGINT; total BIGINT;
BEGIN
    EXECUTE format('SELECT count(*) FROM %I.%I s WHERE NOT EXISTS (SELECT 1 FROM public.%I d WHERE %s) AND (%s)',
        current_setting('mescla.esq'), t, t, pg_temp.igual(chave), filtro) INTO total;
    EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM %I.%I s WHERE NOT EXISTS (SELECT 1 FROM public.%I d WHERE %s) AND (%s) ON CONFLICT DO NOTHING',
        t, pg_temp.lista(cols), pg_temp.lista(cols, 's.'), current_setting('mescla.esq'), t, t, pg_temp.igual(chave), filtro);
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_temp.anotar(t, 'acrescentados', n);
    IF total > n THEN PERFORM pg_temp.anotar(t, 'pulados (valor único já usado no ZimaOS)', total - n); END IF;
END $$;

-- D1: mesma chave, vale a versão alterada por último. `ident` (opcional) confirma que é o mesmo registro nas tabelas numeradas.
CREATE FUNCTION pg_temp.atualizar_mais_novos(t TEXT, chave TEXT[], ts TEXT, ident TEXT DEFAULT NULL) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE cols TEXT[] := pg_temp.colunas(t); resto TEXT[]; n BIGINT; cond TEXT;
BEGIN
    resto := ARRAY(SELECT c FROM unnest(cols) c WHERE c <> ALL (chave));
    cond := pg_temp.igual(chave) || CASE WHEN ident IS NULL THEN '' ELSE format(' AND d.%1$I IS NOT DISTINCT FROM s.%1$I', ident) END;
    EXECUTE format('UPDATE public.%I d SET (%s) = ROW(%s) FROM %I.%I s WHERE %s AND s.%I > d.%I AND NOT (%s)',
        t, pg_temp.lista(resto), pg_temp.lista(resto, 's.'), current_setting('mescla.esq'), t, cond, ts, ts, pg_temp.igual(resto));
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_temp.anotar(t, 'atualizados (PC mais novo)', n);
END $$;

-- Tabelas com id sequencial: depois da separação os dois bancos deram o mesmo número a registros diferentes.
-- Mesmo id e mesmo `ident` (data de criação) = mesmo registro. Id livre = entra com o mesmo id.
-- Id já usado por outro registro = entra com id novo (novo_id) ou fica de fora e é contado (tabelas com filhas).
CREATE FUNCTION pg_temp.inserir_sequencial(t TEXT, ident TEXT, novo_id BOOLEAN) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE cols TEXT[] := pg_temp.colunas(t); sem_id TEXT[]; n BIGINT; total BIGINT; seq TEXT;
BEGIN
    sem_id := ARRAY(SELECT c FROM unnest(cols) c WHERE c <> 'id');
    EXECUTE format('SELECT count(*) FROM %I.%I s WHERE NOT EXISTS (SELECT 1 FROM public.%I d WHERE d.id = s.id)',
        current_setting('mescla.esq'), t, t) INTO total;
    EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM %I.%I s WHERE NOT EXISTS (SELECT 1 FROM public.%I d WHERE d.id = s.id) ON CONFLICT DO NOTHING',
        t, pg_temp.lista(cols), pg_temp.lista(cols, 's.'), current_setting('mescla.esq'), t, t);
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_temp.anotar(t, 'acrescentados', n);
    IF total > n THEN PERFORM pg_temp.anotar(t, 'pulados (valor único já usado no ZimaOS)', total - n); END IF;

    seq := pg_get_serial_sequence('public.' || quote_ident(t), 'id');
    IF seq IS NOT NULL THEN
        EXECUTE format('SELECT setval(%L, GREATEST((SELECT COALESCE(max(id), 0) FROM public.%I), (SELECT last_value FROM %s)))', seq, t, seq);
    END IF;

    -- Colisões: id igual, registro diferente, e o conteúdo ainda não está no ZimaOS (rodar de novo não duplica).
    EXECUTE format('SELECT count(*) FROM %1$I.%2$I s JOIN public.%2$I x ON x.id = s.id AND x.%3$I IS DISTINCT FROM s.%3$I
                    WHERE NOT EXISTS (SELECT 1 FROM public.%2$I d WHERE %4$s)',
        current_setting('mescla.esq'), t, ident, pg_temp.igual(sem_id)) INTO total;
    IF total = 0 THEN RETURN; END IF;
    IF NOT novo_id THEN
        PERFORM pg_temp.anotar(t, 'NÃO mesclados (número já usado por outro registro; conferir à mão)', total);
        RETURN;
    END IF;
    EXECUTE format('INSERT INTO public.%1$I (%5$s) SELECT %6$s FROM %2$I.%1$I s JOIN public.%1$I x ON x.id = s.id AND x.%3$I IS DISTINCT FROM s.%3$I
                    WHERE NOT EXISTS (SELECT 1 FROM public.%1$I d WHERE %4$s) ON CONFLICT DO NOTHING',
        t, current_setting('mescla.esq'), ident, pg_temp.igual(sem_id), pg_temp.lista(sem_id), pg_temp.lista(sem_id, 's.'));
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_temp.anotar(t, 'acrescentados com número novo (colisão)', n);
END $$;

-- Quadros e lotes
SELECT pg_temp.inserir_faltantes('lote_custom_status', ARRAY['lote_number']);
SELECT pg_temp.atualizar_mais_novos('lote_custom_status', ARRAY['lote_number'], 'updated_at');
SELECT pg_temp.inserir_sequencial('lote_status_history', 'changed_at', true);
SELECT pg_temp.inserir_faltantes('producao_planejamento_semanal', ARRAY['id']);
SELECT pg_temp.atualizar_mais_novos('producao_planejamento_semanal', ARRAY['id'], 'updated_at');
SELECT pg_temp.inserir_sequencial('programacao_envase', 'created_at', true);
SELECT pg_temp.atualizar_mais_novos('programacao_envase', ARRAY['id'], 'updated_at', 'created_at');
SELECT pg_temp.inserir_sequencial('programacao_rotulagem', 'created_at', true);
SELECT pg_temp.atualizar_mais_novos('programacao_rotulagem', ARRAY['id'], 'updated_at', 'created_at');

-- Kits: sem data de alteração; vale a conclusão (PC concluído e ZimaOS ainda pendente).
SELECT pg_temp.inserir_sequencial('kit_assembly_orders', 'created_at', true);
DO $$
DECLARE n BIGINT; cols TEXT[] := ARRAY(SELECT c FROM unnest(pg_temp.colunas('kit_assembly_orders')) c WHERE c <> 'id');
BEGIN
    EXECUTE format('UPDATE public.kit_assembly_orders d SET (%s) = ROW(%s) FROM %I.kit_assembly_orders s
                    WHERE d.id = s.id AND d.created_at IS NOT DISTINCT FROM s.created_at AND s.status = ''COMPLETED'' AND d.status <> ''COMPLETED''',
        pg_temp.lista(cols), pg_temp.lista(cols, 's.'), current_setting('mescla.esq'));
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_temp.anotar('kit_assembly_orders', 'atualizados (concluído no PC)', n);
END $$;

-- Qualidade
SELECT pg_temp.inserir_faltantes('fisco_quimica_analyses', ARRAY['id']);
SELECT pg_temp.inserir_sequencial('recebimento_mp_laudos', 'created_at', true);
SELECT pg_temp.atualizar_mais_novos('recebimento_mp_laudos', ARRAY['id'], 'updated_at', 'created_at');
SELECT pg_temp.inserir_sequencial('qualidade_devolucoes', 'created_at', false);
SELECT pg_temp.atualizar_mais_novos('qualidade_devolucoes', ARRAY['id'], 'updated_at', 'created_at');
SELECT pg_temp.inserir_sequencial('qualidade_devolucao_itens', 'devolucao_id', false);
SELECT pg_temp.inserir_sequencial('qualidade_devolucao_controles', 'created_at', false);
SELECT pg_temp.inserir_faltantes('qualidade_devolucao_controle_itens', ARRAY['controle_id', 'devolucao_id']);
SELECT pg_temp.inserir_faltantes('reports', ARRAY['id']);

-- Compras e estoque
SELECT pg_temp.inserir_faltantes('purchase_request_batches', ARRAY['id']);
SELECT pg_temp.atualizar_mais_novos('purchase_request_batches', ARRAY['id'], 'updated_at');
SELECT pg_temp.inserir_faltantes('purchase_request_items', ARRAY['id']);
SELECT pg_temp.inserir_faltantes('similar_items', ARRAY['item_code_a', 'item_code_b'],
    'EXISTS (SELECT 1 FROM public.items i WHERE i.code = s.item_code_a) AND EXISTS (SELECT 1 FROM public.items i WHERE i.code = s.item_code_b)');
SELECT pg_temp.inserir_faltantes('item_similar_links', ARRAY['id']);
SELECT pg_temp.inserir_sequencial('manual_stock_orders', 'created_at', false);
SELECT pg_temp.inserir_sequencial('manual_stock_order_items', 'order_id', false);
SELECT pg_temp.inserir_sequencial('terceirizados_solicitacoes', 'created_at', false);

-- Avisos e auditoria (D2: só de operadores que existem no ZimaOS)
SELECT pg_temp.inserir_faltantes('hub_notifications', ARRAY['id']);
SELECT pg_temp.inserir_faltantes('hub_notification_reads', ARRAY['operator_id', 'notification_id'],
    'EXISTS (SELECT 1 FROM public.hub_operators o WHERE o.id = s.operator_id) AND EXISTS (SELECT 1 FROM public.hub_notifications n WHERE n.id = s.notification_id)');
SELECT pg_temp.inserir_faltantes('hub_audit_events', ARRAY['id']);
SELECT pg_temp.inserir_sequencial('hub_audit_log', 'created_at', true);

-- D3: lotes da W43 (feitos no ZimaOS de 19 a 22/10) que o PC não tem saem dos quadros, sem apagar.
DO $$
DECLARE n BIGINT;
BEGIN
    EXECUTE format($q$
        UPDATE public.lote_custom_status d
        SET quadros_ocultos = '["pesagem", "producao", "envase", "rotulagem"]'::jsonb,
            updated_by = 'mesclagem_pc_qualidade', updated_at = NOW()
        WHERE d.updated_at < '2026-10-23'
          AND NOT EXISTS (SELECT 1 FROM %I.lote_custom_status s WHERE s.lote_number = d.lote_number)
          AND d.quadros_ocultos IS DISTINCT FROM '["pesagem", "producao", "envase", "rotulagem"]'::jsonb
          AND d.updated_by IS DISTINCT FROM 'mesclagem_pc_qualidade'$q$, current_setting('mescla.esq'));
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_temp.anotar('lote_custom_status', 'ocultados dos quadros (só no ZimaOS, W43)', n);
END $$;

-- Registro da mesclagem na auditoria
INSERT INTO hub_audit_events (id, created_at, actor_id, actor_name, module_key, action, entity_type, entity_id, summary, after_json, origem)
SELECT gen_random_uuid()::text, NOW(), 'sistema', 'mesclagem_pc_qualidade', 'geral', 'mesclar_pc_qualidade', 'banco', :'esq',
       'Mesclagem dos dados do PC Qualidade (' || CASE WHEN :'confirmar' = '1' THEN 'gravada' ELSE 'prévia' END || ')',
       (SELECT jsonb_agg(jsonb_build_object('tabela', tabela, 'acao', acao, 'n', n) ORDER BY ordem) FROM resumo WHERE n > 0),
       'sistema';

\o
\pset footer off
SELECT tabela AS "Tabela", acao AS "O que acontece", n AS "Registros" FROM resumo WHERE n > 0 ORDER BY ordem;

SELECT CASE WHEN :'confirmar' = '1' THEN 'COMMIT' ELSE 'ROLLBACK' END AS fim \gset
:fim;
\echo
\if :confirmar
\echo 'Gravado.'
\else
\echo 'Prévia: nada foi gravado. Para gravar, rode de novo com --confirmar.'
\endif

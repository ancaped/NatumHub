-- 049_cobertura_insumos_ficha.sql
-- Ficha técnica da cobertura de insumo por dia (Planejamento de Produção).
-- Idempotente: este arquivo roda em todo boot (SCHEMA_FILES); a chave "cobertura" é substituída inteira.

UPDATE mapa_modules
SET detail = COALESCE(detail, '{}'::jsonb) || jsonb_build_object(
        'cobertura', jsonb_build_object(
            'rotas', jsonb_build_array(
                'GET /api/producao/cobertura?week=YYYY-Www',
                'POST /api/producao/cobertura/simular',
                'GET /api/producao/cobertura/validacao?limite=30',
                'GET /api/producao/cobertura/faltas-por-linha?week=YYYY-Www'
            ),
            'regras', jsonb_build_array(
                'Livre = estoque - reserva (calibração manual > último snapshot). Só avisa, nunca bloqueia',
                'Só consomem as ordens sem lote_erp; lote aberto (reservado) ou fechado (baixado) no ERP não consome de novo',
                'Lote aberto no ERP sem vínculo: casamento provável conta uma vez só; ambíguo usa a maior das duas; sempre com aviso para vincular',
                'Pedido vencido continua na conta e vai para revisão; pedido sem previsão fica fora da linha do tempo',
                'NF já lançada abate o pedido por fornecedor + insumo (alocação FIFO, sem abater duas vezes); sem certeza vira aviso',
                'Base é explodida em matérias-primas como o ERP; base também planejada em outra ordem gera aviso',
                'Backtest em /validacao compara a fórmula com a baixa real dos lotes fechados',
                'Relatório de faltas por linha (Administrativo > Relatórios): só agrupa o resultado da cobertura por linha > produto > embalagem/matéria-prima; ordens da semana e fila separadas'
            ),
            'arquivos', jsonb_build_array(
                'Backend/src/modules/producao/cobertura/calc.rs (regras puras, testadas)',
                'Backend/src/modules/producao/cobertura/store.rs (leitura do banco)',
                'Backend/src/modules/producao/cobertura/faltas.rs (relatório de faltas por linha)',
                'Backend/src/modules/producao/cobertura/mod.rs (rotas)'
            )
        )
    ),
    updated_at = NOW()
WHERE module_key = 'planejamento_producao';

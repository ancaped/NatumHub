import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupCellItems, getWeekKey, getMondayOfWeek, formatDateStr, candidatoDaFila, validarAlocacao, infoDoReator, isPastEndOfDay,
  type PlanejamentoItem, type ReatorConfig,
} from '../../src/modules/producao/gerenciamento/components/planejamento/lib/planejamentoSemanal';

const item = (id: string, extra: Partial<PlanejamentoItem> = {}): PlanejamentoItem => ({
  id, week_key: '2026-W46', data_planejada: '2026-11-09', reator_id: 'R_500', codigo_produto: '1.01.001',
  descricao: 'SHAMPOO CACHOS 300ML', quantidade_planejada: 60, ...extra,
});

const reatores: ReatorConfig[] = [
  { id: 'R_100', nome: 'Reator 100kg (Resistência)', capacidade_kg: 100, tipo: 'resistencia', ordem: 1, ativo: true },
  { id: 'R_500', nome: 'Reator 500kg', capacidade_kg: 500, tipo: 'caldeira', ordem: 2, ativo: true },
  { id: 'BOM_50', nome: 'Bombona 50kg', capacidade_kg: 50, tipo: 'bombona', ordem: 3, ativo: true },
];

test('groupCellItems: itens soltos viram um grupo cada, na ordem de chegada', () => {
  const g = groupCellItems([item('a'), item('b', { quantidade_planejada: 40 })]);
  assert.deepEqual(g.map(x => x.key), ['ITEM_a', 'ITEM_b']);
  assert.equal(g[0].isMulti, false);
  assert.equal(g[1].totalKg, 40);
  assert.equal(g[0].primaryItem.id, 'a');
});

test('groupCellItems: batelada por batch_id soma kg e unidades e é multi', () => {
  const g = groupCellItems([
    item('a', { batch_id: 'B1', quantidade_planejada: 150 }),
    item('b', { batch_id: 'B1', quantidade_planejada: 100 }),
    item('c'),
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].key, 'BATCH_B1');
  assert.equal(g[0].isMulti, true);
  assert.equal(g[0].totalKg, 250);
  assert.equal(g[0].totalUnits, 833); // 150/0,3 = 500 + 100/0,3 = 333
  assert.equal(g[1].key, 'ITEM_c');
});

test('groupCellItems: lote ERP real agrupa; PLAN_/PL- não agrupam', () => {
  const g = groupCellItems([
    item('a', { lote_erp: '12345' }),
    item('b', { lote_erp: ' 12345 ' }),
    item('c', { lote_erp: 'PLAN_9' }),
    item('d', { lote_erp: 'pl-7' }),
  ]);
  assert.deepEqual(g.map(x => x.key), ['LOTE_12345', 'ITEM_c', 'ITEM_d']);
  assert.equal(g[0].items.length, 2);
});

test('groupCellItems: tag [batch:] nas observações e "Batelada conjunta" sem tag', () => {
  const g = groupCellItems([
    item('a', { observacoes: 'x [batch:77]' }),
    item('b', { observacoes: 'y [batch:77]' }),
    item('lote_1730000000000_9_0', { observacoes: 'Batelada conjunta' }),
    item('sem_numero', { observacoes: 'Batelada conjunta', reator_id: 'R_500', data_planejada: '2026-11-10' }),
  ]);
  assert.deepEqual(g.map(x => x.key), ['BATCH_77', 'BATCH_9', 'CONJUNTA_R_500_2026-11-10']);
  assert.equal(g[0].items.length, 2);
});

test('groupCellItems: status e processo térmico do grupo', () => {
  const [aprovado] = groupCellItems([item('a', { batch_id: 'B', ordem_status: 'aprovado' }), item('b', { batch_id: 'B', ordem_status: 'aprovado' })]);
  assert.equal(aprovado.isAprovado, true);
  const [meio] = groupCellItems([item('a', { batch_id: 'B', ordem_status: 'aprovado' }), item('b', { batch_id: 'B', ordem_status: 'planejado' })]);
  assert.equal(meio.isAprovado, false);
  const [criado] = groupCellItems([item('a', { ordem_status: 'lote_criado' })]);
  assert.equal(criado.isLoteCriado, true);
  assert.equal(criado.loteErp, undefined);
  const [comLote] = groupCellItems([item('a', { lote_erp: ' 777 ' })]);
  assert.equal(comLote.loteErp, '777');
  assert.equal(comLote.isLoteCriado, true);
  assert.equal(groupCellItems([item('a', { processo_termico: 'resistencia' })])[0].isQuente, true);
  assert.equal(groupCellItems([item('a', { observacoes: 'usa Caldeira' })])[0].isQuente, true);
  assert.equal(groupCellItems([item('a', { reator_id: 'R_40' })])[0].isQuente, true);
  assert.equal(groupCellItems([item('a')])[0].isQuente, false);
});

test('groupCellItems: base conta 1 kg por unidade; sem medida na descrição não soma unidades', () => {
  const [base] = groupCellItems([item('a', { codigo_produto: '1.36.001', descricao: 'BASE CREME', quantidade_planejada: 50 })]);
  assert.equal(base.totalUnits, 50);
  const [sem] = groupCellItems([item('a', { descricao: 'PRODUTO SEM MEDIDA', quantidade_planejada: 50 })]);
  assert.equal(sem.totalUnits, 0);
});

test('getMondayOfWeek: de segunda a domingo cai na mesma segunda, à meia-noite', () => {
  for (let d = 9; d <= 15; d++) {
    const m = getMondayOfWeek(new Date(2026, 10, d, 15, 30));
    assert.equal(formatDateStr(m), '2026-11-09');
    assert.equal(m.getHours(), 0);
  }
  assert.equal(formatDateStr(getMondayOfWeek(new Date(2026, 10, 16))), '2026-11-16');
});

test('formatDateStr completa mês e dia com zero', () => {
  assert.equal(formatDateStr(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(formatDateStr(new Date(2026, 11, 31)), '2026-12-31');
});

test('getWeekKey: semana ISO, inclusive na virada de ano', () => {
  assert.equal(getWeekKey(new Date(2026, 10, 9)), '2026-W46');
  assert.equal(getWeekKey(new Date(2026, 10, 15)), '2026-W46');
  assert.equal(getWeekKey(new Date(2026, 0, 1)), '2026-W01');
  assert.equal(getWeekKey(new Date(2025, 11, 29)), '2026-W01');
  assert.equal(getWeekKey(new Date(2024, 11, 30)), '2025-W01');
  assert.equal(getWeekKey(new Date(2027, 0, 1)), '2026-W53');
});

test('candidatoDaFila: junta fila e produto, lê camelCase ou snake_case e a tag de batelada', () => {
  const c = candidatoDaFila(
    { id: 'f1', codigoProduto: '1.01.001', descricao: 'X', quantidade: 400, quantidadeKg: 120, origemDemanda: 'manual', baseCodigo: 'B1', baseNome: 'Base 1', observacoes: 'a [batch:Z9]', origem: 'automatica', situacao: 'aguardando_insumos', falta: [{ codigo: 'MP' }], motivoSituacao: 'm' },
    { estoque: 10, codigo: 'ignorado' },
  );
  assert.equal(c.estoque, 10);
  assert.equal(c.codigo, '1.01.001');
  assert.equal(c._filaId, 'f1');
  assert.equal(c._batchGroupId, 'Z9');
  assert.equal(c._automatica, true);
  assert.equal(c._situacao, 'aguardando_insumos');
  assert.equal(c.quantidade_kg, 120);
  assert.equal(c.unidade, 'un');
  assert.equal(c.base, 'Base 1');
  assert.equal(c._motivoSituacao, 'm');
  const s = candidatoDaFila({ id: 'f2', codigo_produto: '2', quantidade_kg: 5, unidade: 'kg' }, {});
  assert.equal(s.codigo, '2');
  assert.equal(s.quantidade_kg, 5);
  assert.equal(s._batchGroupId, null);
  assert.equal(s._automatica, false);
  assert.equal(s._situacao, 'disponivel');
  assert.deepEqual(s._falta, []);
  assert.equal(s._motivoSituacao, null);
});

test('validarAlocacao: só a capacidade limita; sem limite de ordens por dia (R-100 aceita várias)', () => {
  const base = { dateStr: '2026-11-09', reatores, plannedItems: [item('a', { reator_id: 'R_100' }), item('b', { reator_id: 'R_100' })] };
  assert.equal(validarAlocacao({ ...base, reatorId: 'R_100', kg: 100 }), null);
  assert.equal(validarAlocacao({ ...base, reatorId: 'R_100', kg: 100.05 }), null);
  assert.equal(validarAlocacao({ ...base, reatorId: 'R_100', kg: 100.06 }), 'A massa de 100.06 kg passa da capacidade de 100 kg deste reator.');
  assert.equal(validarAlocacao({ ...base, reatorId: 'R_500', kg: 800 }), 'A massa de 800 kg passa da capacidade de 500 kg deste reator.');
  assert.equal(validarAlocacao({ ...base, reatorId: 'INEXISTENTE', kg: 99999 }), null);
});

test('validarAlocacao: mensagem própria para bombona', () => {
  const msg = validarAlocacao({ reatorId: 'BOM_50', dateStr: '2026-11-09T00:00:00', kg: 80, reatores, plannedItems: [] });
  assert.equal(msg, 'Bombona 50kg comporta até 50 kg. Esta ordem tem 80 kg.');
});

test('infoDoReator: tipo configurado, id antigo e padrão caldeira', () => {
  assert.equal(infoDoReator({ id: 'x', tipo: 'resistencia' }).rotulo, 'Resistência');
  assert.equal(infoDoReator({ id: 'x', tipo: 'bombona' }).tipo, 'bombona');
  assert.equal(infoDoReator({ id: 'BOMBONAS', tipo: 'qualquer' }).tipo, 'bombona');
  assert.equal(infoDoReator({ id: 'R_100', tipo: '' }).tipo, 'resistencia');
  assert.equal(infoDoReator({ id: 'R_40', tipo: '' }).rotulo, 'Quente');
  assert.equal(infoDoReator({ id: 'R_1000', tipo: '' }).tipo, 'caldeira_shampoo');
  assert.equal(infoDoReator({ id: 'novo', tipo: 'desconhecido' }).tipo, 'caldeira');
  assert.equal(infoDoReator({ id: 'novo', tipo: 'resistencia' }).badge, 'bg-amber-50 text-amber-800 border-amber-200');
  assert.equal(typeof infoDoReator({ id: 'x', tipo: 'frio' }).Icone, 'object');
});

test('isPastEndOfDay: dia anterior vale; hoje só a partir das 18h; futuro e vazio não', () => {
  mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 9, 17, 59) });
  try {
    assert.equal(isPastEndOfDay(undefined), false);
    assert.equal(isPastEndOfDay(null), false);
    assert.equal(isPastEndOfDay('2026-11-08'), true);
    assert.equal(isPastEndOfDay('2026-11-09'), false);
    assert.equal(isPastEndOfDay('2026-11-10T00:00:00'), false);
    mock.timers.reset();
    mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 9, 18, 0) });
    assert.equal(isPastEndOfDay('2026-11-09T12:00:00'), true);
    assert.equal(isPastEndOfDay('2026-11-10'), false);
  } finally {
    mock.timers.reset();
  }
});

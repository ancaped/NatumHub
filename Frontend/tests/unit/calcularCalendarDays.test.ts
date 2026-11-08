import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularCalendarDays } from '../../src/modules/administrativo/acompanhamento_producao/calculos/calendarDays';

const lote = (n: string) => ({ loteNumber: n } as any);

test('calcularCalendarDays: novembro/2026 começa no domingo, marca hoje, fim de semana, feriado e lotes do dia', () => {
  const lotesByDate = new Map([['2026-11-09', [lote('L1'), lote('L2')]]]);
  const dias = calcularCalendarDays({ currentMonth: 10, currentYear: 2026, lotesByDate, today: new Date(2026, 10, 9) });
  const doMes = dias.filter(d => d.isCurrentMonth);
  assert.equal(doMes.length, 30);
  assert.equal(doMes[0].dateIso, '2026-11-01');
  assert.equal(dias.length % 7, 0);
  assert.equal(dias.indexOf(doMes[0]), 0); // 01/11/2026 é domingo: sem dias do mês anterior antes
  assert.equal(doMes[0].isWeekend, true);
  const hoje = doMes.find(d => d.dayNum === 9)!;
  assert.equal(hoje.isToday, true);
  assert.deepEqual(hoje.items.map(i => i.loteNumber), ['L1', 'L2']);
  assert.equal(doMes.filter(d => d.isToday).length, 1);
  assert.ok(doMes.find(d => d.dayNum === 15)!.holiday, '15/11 é feriado');
  assert.equal(doMes.find(d => d.dayNum === 10)!.items.length, 0);
});

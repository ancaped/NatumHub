import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordenarReatoresPorCaber, diasPermitidos, planejarSemana, dividirEmBateladas, reatoresDoPerfil } from '../../src/modules/producao/lib/heuristicaPlanejamento';

const r = (id: string, capacidade_kg: number) => ({ id, capacidade_kg });
const ids = (l: { id: string }[]) => l.map(x => x.id);

test('ordenarReatoresPorCaber: cabem do menor ao maior, depois os que não cabem do maior ao menor', () => {
  const lista = [r('a', 1000), r('b', 40), r('c', 200), r('d', 500), r('e', 100)];
  assert.deepEqual(ids(ordenarReatoresPorCaber(lista, 150)), ['c', 'd', 'a', 'e', 'b']);
});

test('ordenarReatoresPorCaber: capacidade igual à massa conta como cabe', () => {
  const lista = [r('a', 500), r('b', 200)];
  assert.deepEqual(ids(ordenarReatoresPorCaber(lista, 200)), ['b', 'a']);
});

test('ordenarReatoresPorCaber: empate mantém a ordem original', () => {
  const lista = [r('x', 200), r('y', 200), r('z', 200)];
  assert.deepEqual(ids(ordenarReatoresPorCaber(lista, 100)), ['x', 'y', 'z']);
});

test('ordenarReatoresPorCaber: nenhum cabe, do maior ao menor', () => {
  const lista = [r('a', 40), r('b', 200), r('c', 100)];
  assert.deepEqual(ids(ordenarReatoresPorCaber(lista, 5000)), ['b', 'c', 'a']);
});

test('ordenarReatoresPorCaber: lista vazia', () => {
  assert.deepEqual(ordenarReatoresPorCaber([], 100), []);
});

const dias = [{ dateStr: '2026-10-26' }, { dateStr: '2026-10-27' }, { dateStr: '2026-10-28' }];

test('diasPermitidos: produto comum só evita dia exclusivo', () => {
  const out = diasPermitidos(dias, false, new Set(['2026-10-26']), new Set(['2026-10-27']));
  assert.deepEqual(out.map(d => d.dateStr), ['2026-10-26', '2026-10-28']);
});

test('diasPermitidos: produto exclusivo só entra em dia livre', () => {
  const out = diasPermitidos(dias, true, new Set(['2026-10-26']), new Set(['2026-10-27']));
  assert.deepEqual(out.map(d => d.dateStr), ['2026-10-28']);
});

test('diasPermitidos: ninguém entra em dia exclusivo', () => {
  const todos = new Set(dias.map(d => d.dateStr));
  assert.deepEqual(diasPermitidos(dias, false, new Set(), todos), []);
  assert.deepEqual(diasPermitidos(dias, true, new Set(), todos), []);
});

// ---- planejarSemana: sem limite diário por reator, capacidade só por batelada ----
const reat = (id: string, capacidade_kg: number, tipo: string, ordem: number) => ({ id, capacidade_kg, tipo, ordem, ativo: true });
const fabrica = [
  reat('R_1000_SHAMPOO', 1000, 'caldeira_shampoo', 1),
  reat('R_1000_MISTO', 1000, 'caldeira', 2),
  reat('R_500', 500, 'caldeira', 3),
  reat('R_200', 200, 'caldeira', 4),
  reat('R_100', 100, 'resistencia', 5),
  reat('R_40', 40, 'quente', 6),
  reat('BOMBONAS', 200, 'bombona', 7),
];
const semana = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'].map(dateStr => ({ dateStr }));
const perfil = (codigo: string, kg: number, extra: Partial<{ isQuente: boolean; isShampoo: boolean; canBombona: boolean; exclusivo: boolean }> = {}) =>
  ({ codigo, kg, isQuente: false, isShampoo: false, canBombona: false, exclusivo: false, ...extra });

test('planejarSemana: vários produtos no mesmo reator e dia, sem limite (Reator 100kg e Bombonas)', () => {
  const perfis = Array.from({ length: 12 }, (_, i) => perfil(`P${i}`, 90));
  const { bateladas, semLugar } = planejarSemana({ perfis, reatores: fabrica, dias: [semana[0]] });
  assert.equal(semLugar.length, 0);
  assert.equal(bateladas.length, 12);
  assert.ok(bateladas.every(b => b.reatorId === 'R_100' && b.dateStr === '2026-10-26'));

  const bomb = Array.from({ length: 9 }, (_, i) => perfil(`B${i}`, 40, { canBombona: true }));
  const r2 = planejarSemana({ perfis: bomb, reatores: fabrica, dias: [semana[0]] });
  assert.equal(r2.bateladas.length, 9);
  assert.ok(r2.bateladas.every(b => b.reatorId === 'BOMBONAS'));
});

test('planejarSemana: cada batelada respeita a capacidade do reator', () => {
  const perfis = [perfil('A', 80), perfil('B', 150), perfil('C', 450), perfil('D', 900, { isShampoo: true })];
  const { bateladas } = planejarSemana({ perfis, reatores: fabrica, dias: semana });
  for (const b of bateladas) {
    const cap = fabrica.find(r => r.id === b.reatorId)!.capacidade_kg;
    assert.ok(b.kg <= cap, `${b.codigo}: ${b.kg} > ${cap}`);
  }
  assert.equal(bateladas.find(b => b.codigo === 'A')!.reatorId, 'R_100');
  assert.equal(bateladas.find(b => b.codigo === 'B')!.reatorId, 'R_200');
  assert.equal(bateladas.find(b => b.codigo === 'C')!.reatorId, 'R_500');
  assert.equal(bateladas.find(b => b.codigo === 'D')!.reatorId, 'R_1000_SHAMPOO');
});

test('planejarSemana: divide em bateladas quando passa da maior capacidade compatível', () => {
  const { bateladas } = planejarSemana({ perfis: [perfil('G', 2500)], reatores: fabrica, dias: semana });
  assert.equal(bateladas.length, 3);
  assert.ok(bateladas.every(b => b.kg <= 1000 && b.partes === 3));
  assert.deepEqual(bateladas.map(b => b.parte), [1, 2, 3]);
  assert.ok(Math.abs(bateladas.reduce((a, b) => a + b.kg, 0) - 2500) < 0.01);
});

test('planejarSemana: mais urgente (primeiro da lista) fica com o dia mais cedo; carga é espalhada', () => {
  const perfis = [perfil('U1', 90), perfil('U2', 90), perfil('U3', 90)];
  const { bateladas } = planejarSemana({ perfis, reatores: fabrica, dias: semana });
  assert.deepEqual(bateladas.map(b => b.codigo), ['U1', 'U2', 'U3']);
  assert.deepEqual(bateladas.map(b => b.dateStr), ['2026-10-26', '2026-10-27', '2026-10-28']);
});

test('planejarSemana: carga existente empurra para o dia mais vazio; exclusivo só em dia sem ordem', () => {
  const r = planejarSemana({
    perfis: [perfil('E', 90, { exclusivo: true })],
    reatores: fabrica,
    dias: semana,
    cargaKgPorDia: { '2026-10-26': 500, '2026-10-27': 10 },
    diasOcupados: new Set(['2026-10-26', '2026-10-27']),
  });
  assert.equal(r.bateladas[0].dateStr, '2026-10-28');
});

test('planejarSemana: sem reator compatível ou sem dia vai para semLugar', () => {
  const so40 = [reat('R_40', 40, 'quente', 1)];
  const r = planejarSemana({ perfis: [perfil('X', 300)], reatores: so40, dias: semana });
  assert.deepEqual(r.semLugar, ['X']);
  const r2 = planejarSemana({ perfis: [perfil('Y', 90)], reatores: fabrica, dias: [] });
  assert.deepEqual(r2.semLugar, ['Y']);
});

test('dividirEmBateladas: partes iguais, soma exata, nenhuma passa da capacidade', () => {
  assert.deepEqual(dividirEmBateladas(100, 100), [100]);
  assert.deepEqual(dividirEmBateladas(250, 100), [83.3, 83.3, 83.4]);
  assert.deepEqual(dividirEmBateladas(0, 100), []);
});

test('reatoresDoPerfil: tipos (shampoo grande, quente pequeno, bombona, fixos)', () => {
  const ids2 = (p: Parameters<typeof reatoresDoPerfil>[1]) => reatoresDoPerfil(fabrica, p).candidatos.map(c => c.id);
  assert.deepEqual(ids2({ kg: 600, isQuente: false, isShampoo: true, canBombona: false }), ['R_1000_SHAMPOO']);
  assert.deepEqual(ids2({ kg: 30, isQuente: true, isShampoo: false, canBombona: true }), ['R_40']);
  assert.deepEqual(ids2({ kg: 150, isQuente: false, isShampoo: false, canBombona: true }), ['BOMBONAS']);
  assert.deepEqual(ids2({ kg: 150, isQuente: false, isShampoo: false, canBombona: false }), ['R_1000_MISTO', 'R_500', 'R_200', 'R_100']);
});

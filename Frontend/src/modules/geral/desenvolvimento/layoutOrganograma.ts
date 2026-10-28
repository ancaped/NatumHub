import type { MapaGroup, MapaModule } from './types';

const COLUNA = 248;
const LINHA = 78;
const FOLGA_X = 28;
const TOPO = 36;
const POR_LINHA = 6;

/** Organograma em colunas: um grupo por coluna, módulos empilhados na ordem da ficha. */
export function layoutOrganograma(
  modules: MapaModule[],
  groups: MapaGroup[],
): Record<string, { x: number; y: number }> {
  const ordem = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  const porGrupo = new Map<string, MapaModule[]>();
  for (const m of modules) {
    const lista = porGrupo.get(m.groupKey) || [];
    lista.push(m);
    porGrupo.set(m.groupKey, lista);
  }
  for (const lista of porGrupo.values()) {
    lista.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'pt-BR'));
  }

  const chaves = ordem.map((g) => g.key);
  for (const key of porGrupo.keys()) {
    if (!chaves.includes(key)) chaves.push(key);
  }

  const pos: Record<string, { x: number; y: number }> = {};
  let yBase = TOPO;
  for (let i = 0; i < chaves.length; i += POR_LINHA) {
    const faixa = chaves.slice(i, i + POR_LINHA);
    let altura = 0;
    faixa.forEach((key, coluna) => {
      const lista = porGrupo.get(key) || [];
      altura = Math.max(altura, lista.length);
      lista.forEach((m, linha) => {
        pos[m.moduleKey] = {
          x: FOLGA_X + coluna * COLUNA,
          y: yBase + linha * LINHA,
        };
      });
    });
    yBase += altura * LINHA + 48;
  }
  return pos;
}

import * as XLSX from 'xlsx';
import type { ImportarMapaItemInput } from './types';

export interface ParsePlanilhaResultado {
  formato: 'mapas_0309' | 'nexus_dim' | 'desconhecido';
  abaUsada: string | null;
  itens: ImportarMapaItemInput[];
  produtosUnicos: number;
  ignoradas: string[];
}

const POS_RE = /^([A-Z]{1,2})(\d{1,2})$/;
const PROD_RE = /^\d+\.\d+(?:\.\d+)+$/;

function parseFormatoMapas(rows: unknown[][]): { itens: ImportarMapaItemInput[]; produtosUnicos: number } {
  const headers: Array<{ pos: string; r: number; c: number }> = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] ?? '').trim().toUpperCase();
      if (POS_RE.test(v)) headers.push({ pos: v, r, c });
    }
  }
  if (headers.length === 0) return { itens: [], produtosUnicos: 0 };

  const byCol = new Map<number, Array<{ pos: string; r: number; c: number }>>();
  for (const h of headers) {
    const arr = byCol.get(h.c) ?? [];
    arr.push(h);
    byCol.set(h.c, arr);
  }

  const posMap = new Map<string, Map<string, number>>();
  const uniqueProds = new Set<string>();

  for (const h of headers) {
    const colHeaders = byCol.get(h.c) ?? [];
    const nextInCol = colHeaders.find((x) => x.r > h.r);
    const endR = nextInCol ? nextInCol.r - 1 : Math.min(h.r + 9, rows.length - 1);

    let items = posMap.get(h.pos);
    if (!items) {
      items = new Map<string, number>();
      posMap.set(h.pos, items);
    }

    // Detecta deslocamento de 1 coluna à esquerda (ex.: linha 61 D2..A1 na Expedição_0309)
    let usarColEsquerda = false;
    if (h.c > 0) {
      let countDir = 0;
      let countEsq = 0;
      for (let r = h.r + 1; r <= endR; r++) {
        const row = rows[r] ?? [];
        if (PROD_RE.test(String(row[h.c] ?? '').trim())) countDir++;
        if (PROD_RE.test(String(row[h.c - 1] ?? '').trim())) countEsq++;
      }
      const headerColEsq = headers.some((x) => x.c === h.c - 1 && Math.abs(x.r - h.r) <= 10);
      if (countDir === 0 && countEsq > 0 && !headerColEsq) {
        usarColEsquerda = true;
      }
    }

    const colPrincipal = usarColEsquerda ? h.c - 1 : h.c;
    const adjColLivre = !headers.some((x) => x.c === colPrincipal + 1 && Math.abs(x.r - h.r) <= 2);

    for (let r = h.r + 1; r <= endR; r++) {
      const row = rows[r] ?? [];
      const code1 = String(row[colPrincipal] ?? '').trim();
      if (PROD_RE.test(code1)) {
        items.set(code1, (items.get(code1) ?? 0) + 1);
        uniqueProds.add(code1);
      }
      if (adjColLivre) {
        const code2 = String(row[colPrincipal + 1] ?? '').trim();
        if (PROD_RE.test(code2)) {
          items.set(code2, (items.get(code2) ?? 0) + 1);
          uniqueProds.add(code2);
        }
      }
    }
  }

  const itens: ImportarMapaItemInput[] = [];
  for (const [pos, mapProd] of posMap.entries()) {
    for (const [prod, fil] of mapProd.entries()) {
      itens.push({
        posicaoCodigo: pos,
        produtoCodigo: prod,
        fileirasLargura: fil,
        fixado: true,
      });
    }
  }
  return { itens, produtosUnicos: uniqueProds.size };
}

function parseFormatoNexusDim(rows: unknown[][]): {
  itens: ImportarMapaItemInput[];
  produtosUnicos: number;
  ignoradas: string[];
} {
  if (rows.length < 2) return { itens: [], produtosUnicos: 0, ignoradas: [] };
  const cab = (rows[0] ?? []).map((x) => String(x ?? '').trim().toLowerCase());
  const idxCod = cab.indexOf('código');
  const idxPick = cab.indexOf('local picking');
  const idxPulm = cab.indexOf('local pulmão');
  if (idxCod < 0 || (idxPick < 0 && idxPulm < 0)) {
    return { itens: [], produtosUnicos: 0, ignoradas: [] };
  }

  const mesclados = new Map<string, ImportarMapaItemInput>();
  const uniqueProds = new Set<string>();
  const ignoradas: string[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const prodCod = String(row[idxCod] ?? '').trim();
    if (!prodCod) continue;

    const rawLocs = [
      idxPick >= 0 ? String(row[idxPick] ?? '') : '',
      idxPulm >= 0 ? String(row[idxPulm] ?? '') : '',
    ]
      .join(',')
      .split(/[,;/]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s !== '' && s !== '—' && s !== '-');

    for (const posCod of rawLocs) {
      if (!POS_RE.test(posCod)) {
        if (ignoradas.length < 15) {
          ignoradas.push(`Linha ${r + 1}: posição '${posCod}' inválida para ${prodCod}`);
        }
        continue;
      }
      const key = `${posCod}::${prodCod}`;
      if (!mesclados.has(key)) {
        mesclados.set(key, {
          posicaoCodigo: posCod,
          produtoCodigo: prodCod,
          fileirasLargura: 1,
          fixado: true,
        });
        uniqueProds.add(prodCod);
      }
    }
  }

  return {
    itens: Array.from(mesclados.values()),
    produtosUnicos: uniqueProds.size,
    ignoradas,
  };
}

export function parsearPlanilhaMapa(wb: XLSX.WorkBook): ParsePlanilhaResultado {
  // 1) Verifica se é exportação do próprio Nexus (aba Dimensionamento ABC)
  const dimSheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'dimensionamento abc');
  if (dimSheetName) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[dimSheetName], {
      header: 1,
      defval: '',
    });
    const res = parseFormatoNexusDim(rows);
    if (res.itens.length > 0) {
      return {
        formato: 'nexus_dim',
        abaUsada: dimSheetName,
        itens: res.itens,
        produtosUnicos: res.produtosUnicos,
        ignoradas: res.ignoradas,
      };
    }
  }

  // 2) Tenta formato grade visual (Mapas_0309 primeiro, ou primeira aba compatível)
  const ordenadas = [
    ...wb.SheetNames.filter((n) => n.toLowerCase().includes('0309') || n.toLowerCase().includes('mapa')),
    ...wb.SheetNames.filter((n) => !n.toLowerCase().includes('0309') && !n.toLowerCase().includes('mapa')),
  ];
  for (const sheetName of ordenadas) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      defval: '',
    });
    const res = parseFormatoMapas(rows);
    if (res.itens.length > 0) {
      return {
        formato: 'mapas_0309',
        abaUsada: sheetName,
        itens: res.itens,
        produtosUnicos: res.produtosUnicos,
        ignoradas: [],
      };
    }
  }

  return {
    formato: 'desconhecido',
    abaUsada: null,
    itens: [],
    produtosUnicos: 0,
    ignoradas: [],
  };
}

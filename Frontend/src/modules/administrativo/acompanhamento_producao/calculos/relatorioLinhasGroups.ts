import React from 'react';

export interface calcularRelatorioLinhasGroupsCtx {
  relatorioEnvaseItems: { id: string | number; loteNumber: string; productCode: string; productDescription: string; dataProgramada: string; dataProgramadaFmt: string; diaSemana: string; linha: string; ordem: number; quantity: number; quantityKg: number; categoriaEnvase: string; cor: string; statusEnvase: string; observacoes: string; origem: 'programado' | 'liberado'; }[];
  relatorioLinhaFilter: 'TODAS' | 'Linha 1' | 'Linha 2' | 'Linha 3';
}

export function calcularRelatorioLinhasGroups({ relatorioEnvaseItems, relatorioLinhaFilter }: calcularRelatorioLinhasGroupsCtx) {
    const l1 = relatorioEnvaseItems.filter(it => it.linha === 'Linha 1');
    const l2 = relatorioEnvaseItems.filter(it => it.linha === 'Linha 2');
    const l3 = relatorioEnvaseItems.filter(it => it.linha.includes('Linha 3'));
    const lib = relatorioEnvaseItems.filter(it => it.origem === 'liberado');

    const sortFn = (a: typeof relatorioEnvaseItems[0], b: typeof relatorioEnvaseItems[0]) => {
      if (a.dataProgramada !== b.dataProgramada) return a.dataProgramada.localeCompare(b.dataProgramada);
      return (a.ordem || 0) - (b.ordem || 0);
    };

    const groups: Array<{
      id: string;
      title: string;
      shortTitle: string;
      color: string;
      items: typeof relatorioEnvaseItems;
      totalUn: number;
      totalKg: number;
    }> = [];

    if (relatorioLinhaFilter === 'TODAS' || relatorioLinhaFilter === 'Linha 1') {
      groups.push({
        id: 'linha_1',
        title: 'Linha 1 de Envase',
        shortTitle: 'Linha 1',
        color: '#2563eb',
        items: [...l1].sort(sortFn),
        totalUn: l1.reduce((acc, it) => acc + it.quantity, 0),
        totalKg: l1.reduce((acc, it) => acc + it.quantityKg, 0),
      });
    }

    if (relatorioLinhaFilter === 'TODAS' || relatorioLinhaFilter === 'Linha 2') {
      groups.push({
        id: 'linha_2',
        title: 'Linha 2 de Envase',
        shortTitle: 'Linha 2',
        color: '#4f46e5',
        items: [...l2].sort(sortFn),
        totalUn: l2.reduce((acc, it) => acc + it.quantity, 0),
        totalKg: l2.reduce((acc, it) => acc + it.quantityKg, 0),
      });
    }

    if (relatorioLinhaFilter === 'TODAS' || relatorioLinhaFilter === 'Linha 3') {
      groups.push({
        id: 'linha_3',
        title: 'Linha 3 (Óleos)',
        shortTitle: 'Linha 3',
        color: '#d97706',
        items: [...l3].sort(sortFn),
        totalUn: l3.reduce((acc, it) => acc + it.quantity, 0),
        totalKg: l3.reduce((acc, it) => acc + it.quantityKg, 0),
      });
    }

    return {
      groups,
      liberados: {
        id: 'liberados',
        title: 'Lotes Liberados Aguardando Linha',
        shortTitle: 'Liberados',
        color: '#0891b2',
        items: [...lib].sort((a, b) => a.dataProgramada.localeCompare(b.dataProgramada)),
        totalUn: lib.reduce((acc, it) => acc + it.quantity, 0),
        totalKg: lib.reduce((acc, it) => acc + it.quantityKg, 0),
      }
    };
  }

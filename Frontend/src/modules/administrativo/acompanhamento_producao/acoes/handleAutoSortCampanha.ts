import React from 'react';
import { parseLoteDateToIso } from '../lib/datas';
import { ORDEM_CORES_FABRICA } from '../lib/constantes';
import { apiJson } from '../../../geral/lib/http';
import type { ProgramacaoEnvaseItem } from '../lib/tipos';

export interface handleAutoSortCampanhaAcaoCtx {
  envaseSelectedDate: string;
  fetchProgramacaoEnvase: (dateStr: string) => Promise<void>;
  programacaoEnvase: ProgramacaoEnvaseItem[];
  setProgramacaoEnvase: React.Dispatch<React.SetStateAction<ProgramacaoEnvaseItem[]>>;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export async function handleAutoSortCampanhaAcao({ envaseSelectedDate, fetchProgramacaoEnvase, programacaoEnvase, setProgramacaoEnvase, showToast }: handleAutoSortCampanhaAcaoCtx, linha: string) {
    // Só o dia selecionado: a lista em memória pode trazer outras datas, que não devem ser reordenadas.
    const lineItems = programacaoEnvase.filter(it =>
      it.linha === linha && (it.dataProgramada ? parseLoteDateToIso(it.dataProgramada) === envaseSelectedDate : true)
    );
    if (lineItems.length <= 1) {
      showToast(`Linha ${linha} possui poucos itens para reorganização.`);
      return;
    }

    const catOrder: Record<string, number> = {
      'Shampoo': 1,
      'Condicionador': 2,
      'Máscaras': 3,
      'Óleos': 4,
      'AOX': 5,
      'Outros': 6,
    };

    const sorted = [...lineItems].sort((a, b) => {
      const orderCatA = catOrder[a.categoriaEnvase] ?? 99;
      const orderCatB = catOrder[b.categoriaEnvase] ?? 99;
      if (orderCatA !== orderCatB) return orderCatA - orderCatB;

      // Se mesma categoria: Branco primeiro (0), depois coloridos (1)
      const isColA = a.isColorido ? 1 : 0;
      const isColB = b.isColorido ? 1 : 0;
      if (isColA !== isColB) return isColA - isColB;

      // Sequência cromática
      const corOrderA = ORDEM_CORES_FABRICA[a.cor || ''] ?? 99;
      const corOrderB = ORDEM_CORES_FABRICA[b.cor || ''] ?? 99;
      return corOrderA - corOrderB;
    });

    const reorderPayload = sorted.map((it, idx) => ({
      id: it.id,
      linha,
      ordem: idx + 1,
    }));

    setProgramacaoEnvase(prev => prev.map(it => {
      const found = reorderPayload.find(r => r.id === it.id);
      return found ? { ...it, ordem: found.ordem } : it;
    }));

    try {
      await apiJson('/api/administrativo/envase/programacao/reorder', {
        method: 'POST',
        body: JSON.stringify({ items: reorderPayload })
      });
      showToast(`Campanha da ${linha} organizada por Categorias e Sequência de Cores!`);
      fetchProgramacaoEnvase(envaseSelectedDate);
    } catch (e: any) {
      showToast("Erro ao organizar campanha: " + (e?.message || e), "error");
      fetchProgramacaoEnvase(envaseSelectedDate);
    }
  }

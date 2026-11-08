import React from 'react';
import type { AcompanhamentoLote } from '../lib/tipos';

export interface calcularFilteredLotesCtx {
  baseTabLotes: AcompanhamentoLote[];
  deferredSearch: string;
  getLoteColumnValue: (lote: AcompanhamentoLote, colKey: string) => string;
  lotesColumnFilters: Record<string, Set<string>>;
  selectedInsumoFaltanteFilter: string;
}

export function calcularFilteredLotes({ baseTabLotes, deferredSearch, getLoteColumnValue, lotesColumnFilters, selectedInsumoFaltanteFilter }: calcularFilteredLotesCtx) {
    const rawQ = deferredSearch.trim().toLowerCase();
    let result = baseTabLotes;

    // 1. Busca rápida inteligente (precisão de lote x busca textual)
    if (rawQ) {
      const cleanQ = rawQ.replace(/^#/, '').trim();
      const isLoteNumberSearch = rawQ.startsWith('#') || /^\d+$/.test(cleanQ);

      if (isLoteNumberSearch) {
        // Busca orientada a número de LOTE:
        // Pesquisa exclusivamente no número do lote para evitar trazer centenas de produtos com volumes numéricos na descrição (ex: 250ml, 500g)
        const noLeadingZero = cleanQ.replace(/^0+/, '');

        // 1. Correspondência exata (com ou sem zeros à esquerda)
        const exactMatches = baseTabLotes.filter(l => {
          const lNum = (l.loteNumber || '').trim().toLowerCase();
          return lNum === cleanQ || (noLeadingZero !== '' && lNum.replace(/^0+/, '') === noLeadingZero);
        });

        if (exactMatches.length > 0) {
          result = exactMatches;
        } else {
          // 2. Prefixo estrito no número de lote (startsWith)
          result = baseTabLotes.filter(l => {
            const lNum = (l.loteNumber || '').trim().toLowerCase().replace(/^#/, '');
            return lNum.startsWith(cleanQ) || (noLeadingZero !== '' && lNum.replace(/^0+/, '').startsWith(noLeadingZero));
          });
        }
      } else {
        // Busca textual geral (descrição, código SKU, responsável, motivo, insumo)
        result = baseTabLotes.filter(lote => {
          const matchLote = (lote.loteNumber || '').toLowerCase().includes(cleanQ);
          const matchCode = (lote.productCode || '').toLowerCase().includes(cleanQ);
          const matchDesc = (lote.productDescription || '').toLowerCase().includes(cleanQ);
          const matchResp = (lote.updatedBy || '').toLowerCase().includes(cleanQ);
          const matchMotivo = (lote.motivoEspera || '').toLowerCase().includes(cleanQ);
          const matchInsumo = (lote.insumoFaltanteCodigo || '').toLowerCase().includes(cleanQ) || (lote.insumoFaltanteDescricao || '').toLowerCase().includes(cleanQ);
          return matchLote || matchCode || matchDesc || matchResp || matchMotivo || matchInsumo;
        });
      }
    }

    // 2. Filtro de Insumo Faltante
    if (selectedInsumoFaltanteFilter !== 'TODOS') {
      result = result.filter(l => (l.insumoFaltanteCodigo || (l as any).insumo_faltante_codigo) === selectedInsumoFaltanteFilter);
    }

    // 3. Filtros de Coluna
    if (Object.keys(lotesColumnFilters).length > 0) {
      result = result.filter(lote => {
        for (const [colKey, selectedValues] of Object.entries(lotesColumnFilters)) {
          if (selectedValues === undefined) continue;
          const val = getLoteColumnValue(lote, colKey) || '(Vazio)';
          if (!selectedValues.has(val)) return false;
        }
        return true;
      });
    }

    return result;
  }

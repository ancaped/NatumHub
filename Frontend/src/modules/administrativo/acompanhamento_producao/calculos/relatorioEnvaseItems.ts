import React from 'react';
import { isLoteConcluido, isLoteOcultoNoQuadro, getLoteScheduleDateIso, inferCategoriaEnvase, inferCorProduto } from '../lib/lotes';
import { parseLoteDateToIso, formatDateOnly, formatShortWeekday } from '../lib/datas';
import type { AcompanhamentoLote, ProgramacaoEnvaseItem } from '../lib/tipos';

export interface calcularRelatorioEnvaseItemsCtx {
  baseLotesParaEncaixe: { isAlreadyScheduled: boolean; scheduledItem: any; loteNumber: string; productCode: string; productDescription: string; quantity: number; quantityKg: number; date: string; details?: string | null; erpStatus: string; erpStatusLabel: string; customStatus?: string | null; category?: string | null; updatedBy?: string | null; updatedAt?: string | null; notes?: string | null; dataPesagem?: string | null; dataProducao?: string | null; dataLiberadoEnvase?: string | null; liberadoEnvaseLaudo?: boolean; dataEnvase?: string | null; dataRotulagem?: string | null; dataFinalizada?: string | null; dataEmEspera?: string | null; dataPrevisao?: string | null; motivoEspera?: string | null; isTerceirizado: boolean; fornecedorTerceirizado?: string | null; fornecedor_terceirizado?: string | null; fichaOrdem?: any | null; ficha_ordem?: any | null; quantidadeEnvasadaParcial?: number | null; quantidade_envasada_parcial?: number | null; insumoFaltanteCodigo?: string | null; insumo_faltante_codigo?: string | null; insumoFaltanteDescricao?: string | null; insumo_faltante_descricao?: string | null; quadrosOcultos?: string[] | null; quadros_ocultos?: string[] | null; historicoReagendamentos?: any[] | null; historico_reagendamentos?: any[] | null; etapasStatus?: Record<string, { status?: string | null; motivoEspera?: string | null; insumoFaltanteCodigo?: string | null; insumoFaltanteDescricao?: string | null; updatedBy?: string | null; updatedAt?: string | null; }> | null; etapas_status?: any | null; etapasEfetivas?: Partial<Record<'pesagem' | 'producao' | 'rotulagem' | 'envase', { status: string; isEspera: boolean; isConcluido: boolean; }>> | null; pesoDesconhecido?: boolean; planningOrdem?: number | null; planning_ordem?: number | null; reatorId?: string | null; planningId?: string | null; reator_id?: string | null; }[];
  getRealLote: (loteNumber?: string | null, productCode?: string | null) => AcompanhamentoLote | undefined;
  programacaoEnvase: ProgramacaoEnvaseItem[];
  relatorioDataFim: string;
  relatorioDataInicio: string;
  relatorioIncluirLiberados: boolean;
  relatorioLinhaFilter: 'TODAS' | 'Linha 1' | 'Linha 2' | 'Linha 3';
  relatorioSearch: string;
  relatorioStatusFilter: 'TODOS' | 'PROGRAMADO' | 'EM_ENVASE' | 'EM_ESPERA' | 'CONCLUIDO';
}

export function calcularRelatorioEnvaseItems({ baseLotesParaEncaixe, getRealLote, programacaoEnvase, relatorioDataFim, relatorioDataInicio, relatorioIncluirLiberados, relatorioLinhaFilter, relatorioSearch, relatorioStatusFilter }: calcularRelatorioEnvaseItemsCtx) {
    const list: Array<{
      id: string | number;
      loteNumber: string;
      productCode: string;
      productDescription: string;
      dataProgramada: string;
      dataProgramadaFmt: string;
      diaSemana: string;
      linha: string;
      ordem: number;
      quantity: number;
      quantityKg: number;
      categoriaEnvase: string;
      cor: string;
      statusEnvase: string;
      observacoes: string;
      origem: 'programado' | 'liberado';
    }> = [];

    const minDate = relatorioDataInicio <= relatorioDataFim ? relatorioDataInicio : relatorioDataFim;
    const maxDate = relatorioDataInicio <= relatorioDataFim ? relatorioDataFim : relatorioDataInicio;
    const query = relatorioSearch.trim().toLowerCase();

    const seenProgKeys = new Set<string>();
    for (const it of programacaoEnvase) {
      const realLote = getRealLote(it.loteNumber, it.productCode);
      if (realLote && (isLoteConcluido(realLote) || isLoteOcultoNoQuadro(realLote, 'envase'))) {
        if (relatorioStatusFilter !== 'CONCLUIDO') {
          continue;
        }
      }

      const itDate = it.dataProgramada
        ? parseLoteDateToIso(it.dataProgramada)
        : (it.createdAt ? parseLoteDateToIso(it.createdAt) : null);
      if (!itDate) continue;

      if (itDate < minDate || itDate > maxDate) continue;

      if (relatorioLinhaFilter !== 'TODAS') {
        if (relatorioLinhaFilter === 'Linha 3') {
          if (!it.linha.includes('Linha 3')) continue;
        } else if (it.linha !== relatorioLinhaFilter) {
          continue;
        }
      }

      if (relatorioStatusFilter !== 'TODOS') {
        if (it.statusEnvase !== relatorioStatusFilter) continue;
      }

      if (query) {
        const m1 = (it.loteNumber || '').toLowerCase().includes(query);
        const m2 = (it.productCode || '').toLowerCase().includes(query);
        const m3 = (it.productDescription || '').toLowerCase().includes(query);
        const m4 = (it.linha || '').toLowerCase().includes(query);
        const m5 = (it.categoriaEnvase || '').toLowerCase().includes(query);
        if (!m1 && !m2 && !m3 && !m4 && !m5) continue;
      }

      // Deduplicação estrita: o mesmo lote + SKU agendado só aparece uma vez no relatório (evita duplicar linhas e somar quantidades)
      const progKey = `${itDate}__${it.linha}__${(it.loteNumber || '').trim().toLowerCase()}__${(it.productCode || '').trim().toLowerCase()}`;
      if (seenProgKeys.has(progKey)) {
        continue;
      }
      seenProgKeys.add(progKey);

      list.push({
        id: it.id || `prog_${it.loteNumber}_${it.linha}_${it.ordem}`,
        loteNumber: it.loteNumber,
        productCode: it.productCode,
        productDescription: it.productDescription,
        dataProgramada: itDate,
        dataProgramadaFmt: formatDateOnly(itDate),
        diaSemana: formatShortWeekday(itDate),
        linha: it.linha || 'Linha 1',
        ordem: it.ordem || 1,
        quantity: Number(it.quantity) || 0,
        quantityKg: Number(it.quantityKg) || 0,
        categoriaEnvase: it.categoriaEnvase || 'Outros',
        cor: it.cor || (it.isColorido ? 'Colorido' : 'Branco'),
        statusEnvase: it.statusEnvase || 'PROGRAMADO',
        observacoes: it.observacoes || '',
        origem: 'programado',
      });
    }

    if (relatorioIncluirLiberados) {
      const scheduledLotes = new Set(list.map(i => `${i.loteNumber.trim().toUpperCase()}__${(i.productCode || '').trim().toUpperCase()}`));
      const seenLiberados = new Set<string>();
      for (const l of baseLotesParaEncaixe) {
        const lNum = (l.loteNumber || '').trim().toUpperCase();
        const lCode = (l.productCode || '').trim().toUpperCase();
        const lKey = `${lNum}__${lCode}`;
        if (scheduledLotes.has(lKey) || seenLiberados.has(lKey)) continue;
        seenLiberados.add(lKey);

        const sched = getLoteScheduleDateIso(l, 'envase') || parseLoteDateToIso(l.dataPrevisao || '') || parseLoteDateToIso(l.date || '');
        if (!sched) continue;
        if (sched < minDate || sched > maxDate) continue;

        if (query) {
          const m1 = (l.loteNumber || '').toLowerCase().includes(query);
          const m2 = (l.productCode || '').toLowerCase().includes(query);
          const m3 = (l.productDescription || '').toLowerCase().includes(query);
          if (!m1 && !m2 && !m3) continue;
        }

        const cat = inferCategoriaEnvase(l.productDescription);
        const corInfo = inferCorProduto(l.productDescription);

        list.push({
          id: `lib_${l.loteNumber}`,
          loteNumber: l.loteNumber,
          productCode: l.productCode,
          productDescription: l.productDescription,
          dataProgramada: sched,
          dataProgramadaFmt: formatDateOnly(sched),
          diaSemana: formatShortWeekday(sched),
          linha: 'Liberado p/ Envase',
          ordem: 999,
          quantity: Number(l.quantity) || 0,
          quantityKg: Number(l.quantityKg) || 0,
          categoriaEnvase: cat,
          cor: corInfo.cor || (corInfo.isColorido ? 'Colorido' : 'Branco'),
          statusEnvase: 'LIBERADO',
          observacoes: l.notes || l.motivoEspera || '',
          origem: 'liberado',
        });
      }
    }

    return list.sort((a, b) => {
      if (a.dataProgramada !== b.dataProgramada) return a.dataProgramada.localeCompare(b.dataProgramada);
      if (a.linha !== b.linha) return a.linha.localeCompare(b.linha);
      return a.ordem - b.ordem;
    });
  }

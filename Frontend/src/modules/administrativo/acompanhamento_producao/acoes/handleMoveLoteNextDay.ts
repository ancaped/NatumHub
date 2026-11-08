import React from 'react';
import type { AcompanhamentoLote, LoteAdiadoRegistro, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem, TabType } from '../lib/tipos';
import { getLoteScheduleDateIso } from '../lib/lotes';
import { parseLoteDateToIso, formatDateOnly } from '../lib/datas';
import { apiJson } from '../../../geral/lib/http';
import type { AuthUser } from '/home/edson/Documentos/api/.claude/worktrees/producao-refator-acompanhamento-04ae88/Frontend/src/modules/geral/lib/auth';

export interface handleMoveLoteNextDayAcaoCtx {
  currentTab: TabType;
  currentUser: AuthUser;
  fetchLotes: () => Promise<void>;
  fetchProgramacaoEnvase: (dateStr: string) => Promise<void>;
  fetchProgramacaoRotulagem: (dateStr?: string) => Promise<void>;
  getCurrentBoardDate: () => string;
  handleOpenAdiarModalForLote: (lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'envase' | 'rotulagem' | 'ordens') => void;
  programacaoEnvase: ProgramacaoEnvaseItem[];
  programacaoRotulagem: ProgramacaoRotulagemItem[];
  setLotes: React.Dispatch<React.SetStateAction<AcompanhamentoLote[]>>;
  setLotesAdiadosHistorico: (u: LoteAdiadoRegistro[] | ((prev: LoteAdiadoRegistro[]) => LoteAdiadoRegistro[])) => void;
  setProgramacaoEnvase: React.Dispatch<React.SetStateAction<ProgramacaoEnvaseItem[]>>;
  setProgramacaoRotulagem: React.Dispatch<React.SetStateAction<ProgramacaoRotulagemItem[]>>;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export async function handleMoveLoteNextDayAcao({ currentTab, currentUser, fetchLotes, fetchProgramacaoEnvase, fetchProgramacaoRotulagem, getCurrentBoardDate, handleOpenAdiarModalForLote, programacaoEnvase, programacaoRotulagem, setLotes, setLotesAdiadosHistorico, setProgramacaoEnvase, setProgramacaoRotulagem, showToast }: handleMoveLoteNextDayAcaoCtx, lote: AcompanhamentoLote, targetDateOverride?: string) {
    if (!targetDateOverride) {
      handleOpenAdiarModalForLote(lote);
      return;
    }
    const currentBoardDate = getCurrentBoardDate();
    const currentEtapa = (() => {
      if (currentTab === 'quadro_pesagem') return 'pesagem';
      if (currentTab === 'quadro_producao') return 'producao';
      if (currentTab === 'quadro_envase') return 'envase';
      if (currentTab === 'quadro_rotulagem') return 'rotulagem';
      if (currentTab === 'quadro_ordens') return 'ordens';
      return undefined;
    })();
    const loteSched = getLoteScheduleDateIso(lote, currentEtapa) || parseLoteDateToIso(lote.dataPrevisao || '') || parseLoteDateToIso(lote.date || '');
    const baseDateStr = (loteSched && loteSched >= currentBoardDate) ? loteSched : currentBoardDate;

    let nextDayStr = targetDateOverride;
    if (!nextDayStr) {
      const [y, m, d] = (baseDateStr || currentBoardDate).split('-').map(Number);
      const nextDate = new Date(y, m - 1, d + 1);
      const pad = (n: number) => n.toString().padStart(2, '0');
      nextDayStr = `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}-${pad(nextDate.getDate())}`;
    }

    const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';

    const envaseItems = programacaoEnvase.filter(it => (it.loteNumber || '').trim() === (lote.loteNumber || '').trim());
    if (envaseItems.length > 0) {
      for (const it of envaseItems) {
        try {
          await apiJson('/api/administrativo/envase/programacao', {
            method: 'POST',
            body: JSON.stringify({
              id: it.id && it.id > 0 ? it.id : undefined,
              dataProgramada: nextDayStr,
              linha: it.linha,
              ordem: it.ordem,
              loteNumber: it.loteNumber,
              productCode: it.productCode,
              productDescription: it.productDescription,
              quantity: Number(it.quantity) || 0,
              quantityKg: Number(it.quantityKg) || 0,
              categoriaEnvase: it.categoriaEnvase || 'Outros',
              isColorido: Boolean(it.isColorido),
              cor: it.cor || null,
              statusEnvase: it.statusEnvase || 'PROGRAMADO',
              observacoes: it.observacoes || null,
              createdBy: it.createdBy || responsibleName,
            })
          });
        } catch (e) {
          console.error("Erro ao atualizar data em programacaoEnvase:", e);
        }
      }
      setProgramacaoEnvase(prev => prev.map(it => (it.loteNumber || '').trim() === (lote.loteNumber || '').trim() ? { ...it, dataProgramada: nextDayStr! } : it));
      await fetchProgramacaoEnvase('TODOS');
    }

    const rotulagemItemsToPostpone = programacaoRotulagem.filter(it => (it.loteNumber || '').trim() === (lote.loteNumber || '').trim());
    if (rotulagemItemsToPostpone.length > 0) {
      const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || (typeof currentUser === 'string' ? currentUser : 'Operador');
      for (const item of rotulagemItemsToPostpone) {
        try {
          const numQty = Number(item.quantity);
          const numKg = Number(item.quantityKg);
          await apiJson('/api/administrativo/rotulagem/programacao', {
            method: 'POST',
            body: JSON.stringify({
              id: typeof item.id === 'number' ? item.id : undefined,
              dataProgramada: nextDayStr,
              tipo: item.tipo,
              ordem: item.ordem,
              loteNumber: String(item.loteNumber || '').trim(),
              productCode: String(item.productCode || '').trim(),
              productDescription: String(item.productDescription || '').trim(),
              quantity: (!isNaN(numQty) && numQty > 0) ? numQty : 0,
              quantityKg: (!isNaN(numKg) && numKg > 0) ? numKg : 0,
              statusRotulagem: item.statusRotulagem || 'PROGRAMADO',
              observacoes: item.observacoes || null,
              createdBy: typeof item.createdBy === 'string' ? item.createdBy : responsibleName,
            })
          });
        } catch (e) {
          console.error("Erro ao adiar data em programacaoRotulagem:", e);
        }
      }
      setProgramacaoRotulagem(prev => prev.map(it => (it.loteNumber || '').trim() === (lote.loteNumber || '').trim() ? { ...it, dataProgramada: nextDayStr! } : it));
      await fetchProgramacaoRotulagem('TODOS');
    }

    try {
      setLotes(prev => prev.map(l => (l.loteNumber || '').trim() === (lote.loteNumber || '').trim() ? { ...l, dataPrevisao: nextDayStr! } : l));

      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(lote.loteNumber)}/previsao`, {
        method: 'POST',
        body: JSON.stringify({
          dataPrevisao: nextDayStr,
          updatedBy: responsibleName,
          fornecedorTerceirizado: lote.fornecedorTerceirizado || null
        })
      });

      // Salvar registro de adiamento no histórico reativo
      const dataOrig = (baseDateStr || getCurrentBoardDate() || '').split('T')[0].split(' ')[0];
      const dataPara = nextDayStr.split('T')[0].split(' ')[0];
      if (dataOrig && dataPara && dataPara > dataOrig) {
        const newReg: LoteAdiadoRegistro = {
          id: `${lote.loteNumber}_${dataPara}_${Date.now()}`,
          loteNumber: lote.loteNumber,
          productCode: lote.productCode,
          productDescription: lote.productDescription || '',
          quantity: Number(lote.quantity) || 0,
          quantityKg: Number(lote.quantityKg) || 0,
          dataOriginal: dataOrig,
          dataAdiadoPara: dataPara,
          dataAcao: new Date().toISOString(),
          responsavel: responsibleName,
          etapa: currentEtapa,
        };
        setLotesAdiadosHistorico(prev => {
          const next = [newReg, ...prev.filter(x => !(x.loteNumber === lote.loteNumber && (x.dataAdiadoPara === dataPara || x.dataOriginal === dataOrig)))];
          return next;
        });
      } else if (dataOrig && dataPara && dataPara <= dataOrig) {
        setLotesAdiadosHistorico(prev => {
          const next = prev.filter(x => !(x.loteNumber === lote.loteNumber && x.dataOriginal === dataOrig));
          return next;
        });
      }

      await fetchLotes();
      showToast(`📅 Lote #${lote.loteNumber} adiado para ${formatDateOnly(nextDayStr)}!`);
    } catch (err: any) {
      console.error('Erro ao adiar lote para o dia seguinte:', err);
      showToast(`Falha ao adiar lote #${lote.loteNumber}: ${err?.message || err}`, 'error');
      await fetchLotes();
    }
  }

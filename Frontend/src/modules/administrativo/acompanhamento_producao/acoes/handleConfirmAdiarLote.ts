import React from 'react';
import { apiJson } from '../../../geral/lib/http';
import { parseLoteDateToIso, formatDateOnly } from '../lib/datas';
import type { LoteAdiadoRegistro, AdiarModalItem, AcompanhamentoLote, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem } from '../lib/tipos';
import type { AuthUser } from '../../../geral/lib/auth';

export interface handleConfirmAdiarLoteAcaoCtx {
  adiarModalItem: AdiarModalItem;
  currentUser: AuthUser;
  fetchLotes: () => Promise<void>;
  fetchProgramacaoEnvase: (dateStr: string) => Promise<void>;
  fetchProgramacaoRotulagem: (dateStr?: string) => Promise<void>;
  getCurrentBoardDate: () => string;
  programacaoEnvase: ProgramacaoEnvaseItem[];
  programacaoRotulagem: ProgramacaoRotulagemItem[];
  setAdiarModalItem: React.Dispatch<React.SetStateAction<AdiarModalItem>>;
  setLotes: React.Dispatch<React.SetStateAction<AcompanhamentoLote[]>>;
  setLotesAdiadosHistorico: (u: LoteAdiadoRegistro[] | ((prev: LoteAdiadoRegistro[]) => LoteAdiadoRegistro[])) => void;
  setProgramacaoEnvase: React.Dispatch<React.SetStateAction<ProgramacaoEnvaseItem[]>>;
  setProgramacaoRotulagem: React.Dispatch<React.SetStateAction<ProgramacaoRotulagemItem[]>>;
  setSavingAdiarLote: React.Dispatch<React.SetStateAction<boolean>>;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export async function handleConfirmAdiarLoteAcao({ adiarModalItem, currentUser, fetchLotes, fetchProgramacaoEnvase, fetchProgramacaoRotulagem, getCurrentBoardDate, programacaoEnvase, programacaoRotulagem, setAdiarModalItem, setLotes, setLotesAdiadosHistorico, setProgramacaoEnvase, setProgramacaoRotulagem, setSavingAdiarLote, showToast }: handleConfirmAdiarLoteAcaoCtx, targetDate: string) {
    if (!adiarModalItem || !targetDate) return;
    setSavingAdiarLote(true);
    const { loteNumber, productCode, realLote, envaseItem } = adiarModalItem;
    const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';

    try {
      // 1. Se houver agendamento em programacaoEnvase, atualizar no backend
      const envaseMatches = programacaoEnvase.filter(it => (it.loteNumber || '').trim() === loteNumber.trim());
      if (envaseMatches.length === 0 && envaseItem) {
        envaseMatches.push(envaseItem);
      }

      if (envaseMatches.length > 0) {
        for (const it of envaseMatches) {
          try {
            await apiJson('/api/administrativo/envase/programacao', {
              method: 'POST',
              body: JSON.stringify({
                id: it.id && it.id > 0 ? it.id : undefined,
                dataProgramada: targetDate,
                linha: it.linha || 'Linha 1',
                ordem: it.ordem || 1,
                loteNumber: it.loteNumber || loteNumber,
                productCode: it.productCode || productCode,
                productDescription: it.productDescription || realLote?.productDescription || '',
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
        setProgramacaoEnvase(prev => prev.map(it => (it.loteNumber || '').trim() === loteNumber.trim() ? { ...it, dataProgramada: targetDate } : it));
        await fetchProgramacaoEnvase('TODOS');
      }

      // 2. Se estiver em rotulagem, atualizar dataProgramada em programacaoRotulagem
      const rotulagemItemsToUpdate = programacaoRotulagem.filter(it => (it.loteNumber || '').trim() === loteNumber.trim());
      if (rotulagemItemsToUpdate.length > 0) {
        for (const item of rotulagemItemsToUpdate) {
          try {
            const numQty = Number(item.quantity);
            const numKg = Number(item.quantityKg);
            await apiJson('/api/administrativo/rotulagem/programacao', {
              method: 'POST',
              body: JSON.stringify({
                id: typeof item.id === 'number' ? item.id : undefined,
                dataProgramada: targetDate,
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
            console.error("Erro ao atualizar data em programacaoRotulagem:", e);
          }
        }
        setProgramacaoRotulagem(prev => prev.map(it => (it.loteNumber || '').trim() === loteNumber.trim() ? { ...it, dataProgramada: targetDate } : it));
        await fetchProgramacaoRotulagem('TODOS');
      }

      // 3. Atualizar data_previsao no backend (lote_custom_status)
      setLotes(prev => prev.map(l => (l.loteNumber || '').trim() === loteNumber.trim() ? { ...l, dataPrevisao: targetDate } : l));

      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/previsao`, {
        method: 'POST',
        body: JSON.stringify({
          dataPrevisao: targetDate,
          updatedBy: responsibleName,
          fornecedorTerceirizado: realLote?.fornecedorTerceirizado || null
        })
      });

      // Salvar registro de adiamento no histórico reativo
      const dataOrig = (adiarModalItem.currentDate || getCurrentBoardDate() || parseLoteDateToIso(realLote?.date || '') || '').split('T')[0].split(' ')[0];
      const dataPara = targetDate.split('T')[0].split(' ')[0];
      if (dataOrig && dataPara && dataPara > dataOrig) {
        const newReg: LoteAdiadoRegistro = {
          id: `${loteNumber}_${dataPara}_${Date.now()}`,
          loteNumber,
          productCode: productCode || realLote?.productCode,
          productDescription: realLote?.productDescription || '',
          quantity: Number(realLote?.quantity) || 0,
          quantityKg: Number(realLote?.quantityKg) || 0,
          dataOriginal: dataOrig,
          dataAdiadoPara: dataPara,
          dataAcao: new Date().toISOString(),
          responsavel: responsibleName,
          etapa: adiarModalItem.origem,
        };
        setLotesAdiadosHistorico(prev => {
          const next = [newReg, ...prev.filter(x => !(x.loteNumber === loteNumber && (x.dataAdiadoPara === dataPara || x.dataOriginal === dataOrig)))];
          return next;
        });
      } else if (dataOrig && dataPara && dataPara <= dataOrig) {
        setLotesAdiadosHistorico(prev => {
          const next = prev.filter(x => !(x.loteNumber === loteNumber && x.dataOriginal === dataOrig));
          return next;
        });
      }

      await fetchLotes();
      showToast(`📅 Lote #${loteNumber} adiado para ${formatDateOnly(targetDate)} com sucesso!`);
      setAdiarModalItem(null);
    } catch (err: any) {
      console.error('Erro ao adiar lote:', err);
      showToast(`Falha ao adiar lote #${loteNumber}: ${err?.message || err}`, 'error');
    } finally {
      setSavingAdiarLote(false);
    }
  }

import React from 'react';
import { apiJson } from '../../../geral/lib/http';
import { formatDateOnly } from '../lib/datas';
import type { AdiarModalItem, AcompanhamentoLote, LoteAdiadoRegistro, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem } from '../lib/tipos';
import type { AuthUser } from '../../../geral/lib/auth';

export interface handleCancelAdiarLoteAcaoCtx {
  adiarModalItem: AdiarModalItem;
  currentUser: AuthUser;
  fetchLotes: () => Promise<void>;
  fetchProgramacaoEnvase: (dateStr: string) => Promise<void>;
  fetchProgramacaoRotulagem: (dateStr?: string) => Promise<void>;
  lotesAdiadosHistorico: LoteAdiadoRegistro[];
  programacaoEnvase: ProgramacaoEnvaseItem[];
  programacaoRotulagem: ProgramacaoRotulagemItem[];
  setAdiarModalItem: React.Dispatch<React.SetStateAction<AdiarModalItem>>;
  setLotes: React.Dispatch<React.SetStateAction<AcompanhamentoLote[]>>;
  setLotesAdiadosHistorico: (u: LoteAdiadoRegistro[] | ((prev: LoteAdiadoRegistro[]) => LoteAdiadoRegistro[])) => void;
  setProgramacaoEnvase: React.Dispatch<React.SetStateAction<ProgramacaoEnvaseItem[]>>;
  setProgramacaoRotulagem: React.Dispatch<React.SetStateAction<ProgramacaoRotulagemItem[]>>;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export async function handleCancelAdiarLoteAcao({ adiarModalItem, currentUser, fetchLotes, fetchProgramacaoEnvase, fetchProgramacaoRotulagem, lotesAdiadosHistorico, programacaoEnvase, programacaoRotulagem, setAdiarModalItem, setLotes, setLotesAdiadosHistorico, setProgramacaoEnvase, setProgramacaoRotulagem, showToast }: handleCancelAdiarLoteAcaoCtx, loteNumber: string, targetDateToRestore?: string, etapa?: string, productCode?: string) {
    if (!loteNumber) return;

    let restoreDate = targetDateToRestore;
    if (!restoreDate) {
      const reg = lotesAdiadosHistorico.find(r => r.loteNumber === loteNumber);
      if (reg?.dataOriginal) {
        restoreDate = reg.dataOriginal;
      }
    }
    if (!restoreDate) {
      showToast('Não foi possível identificar a data original para restauração.', 'error');
      return;
    }

    const cleanDate = restoreDate.split('T')[0].split(' ')[0];
    const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';

    try {
      // 1. Se estiver em programacaoEnvase, restaurar data no backend
      const envaseMatches = programacaoEnvase.filter(it => (it.loteNumber || '').trim() === loteNumber.trim());
      if (envaseMatches.length > 0) {
        for (const it of envaseMatches) {
          try {
            await apiJson('/api/administrativo/envase/programacao', {
              method: 'POST',
              body: JSON.stringify({
                id: it.id && it.id > 0 ? it.id : undefined,
                dataProgramada: cleanDate,
                linha: it.linha || 'Linha 1',
                ordem: it.ordem || 1,
                loteNumber: it.loteNumber || loteNumber,
                productCode: it.productCode || productCode,
                productDescription: it.productDescription || '',
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
            console.error("Erro ao restaurar data em programacaoEnvase:", e);
          }
        }
        setProgramacaoEnvase(prev => prev.map(it => (it.loteNumber || '').trim() === loteNumber.trim() ? { ...it, dataProgramada: cleanDate } : it));
        await fetchProgramacaoEnvase('TODOS');
      }

      // 2. Se estiver em rotulagem, restaurar dataProgramada
      const rotulagemItemsToRestore = programacaoRotulagem.filter(it => (it.loteNumber || '').trim() === loteNumber.trim());
      if (rotulagemItemsToRestore.length > 0) {
        for (const item of rotulagemItemsToRestore) {
          try {
            const numQty = Number(item.quantity);
            const numKg = Number(item.quantityKg);
            await apiJson('/api/administrativo/rotulagem/programacao', {
              method: 'POST',
              body: JSON.stringify({
                id: typeof item.id === 'number' ? item.id : undefined,
                dataProgramada: cleanDate,
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
            console.error("Erro ao restaurar data em programacaoRotulagem:", e);
          }
        }
        setProgramacaoRotulagem(prev => prev.map(it => (it.loteNumber || '').trim() === loteNumber.trim() ? { ...it, dataProgramada: cleanDate } : it));
        await fetchProgramacaoRotulagem('TODOS');
      }

      // 3. Atualizar data_previsao e data da etapa no backend (lote_custom_status)
      setLotes(prev => prev.map(l => (l.loteNumber || '').trim() === loteNumber.trim() ? { ...l, dataPrevisao: cleanDate } : l));
      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/previsao`, {
        method: 'POST',
        body: JSON.stringify({
          dataPrevisao: cleanDate,
          updatedBy: responsibleName
        })
      });

      if (etapa === 'producao') {
        await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/timestamps`, {
          method: 'POST',
          body: JSON.stringify({
            dataProducao: new Date(`${cleanDate}T08:00:00Z`).toISOString()
          })
        }).catch((e: any) => showToast(`Não foi possível salvar a data da produção: ${e?.message || e}`, 'error'));
      } else if (etapa === 'pesagem') {
        await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/timestamps`, {
          method: 'POST',
          body: JSON.stringify({
            dataPesagem: new Date(`${cleanDate}T08:00:00Z`).toISOString()
          })
        }).catch((e: any) => showToast(`Não foi possível salvar a data da pesagem: ${e?.message || e}`, 'error'));
      }

      // 4. Remover registro de adiamento do histórico reativo
      setLotesAdiadosHistorico(prev => {
        const next = prev.filter(x => x.loteNumber !== loteNumber);
        return next;
      });

      if (adiarModalItem) {
        setAdiarModalItem(null);
      }

      await fetchLotes();
      showToast(`↩️ Adiamento do Lote #${loteNumber} cancelado! Retornado para ${formatDateOnly(cleanDate)}.`);
    } catch (err: any) {
      console.error('Erro ao cancelar adiamento:', err);
      showToast(`Falha ao cancelar adiamento: ${err?.message || err}`, 'error');
    }
  }

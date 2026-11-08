import React from 'react';
import { apiJson } from '../../../geral/lib/http';
import type { AcompanhamentoLote } from '../lib/tipos';

export interface handleRemoveApontamentoAcaoCtx {
  parcialModalLote: AcompanhamentoLote;
  setLotes: React.Dispatch<React.SetStateAction<AcompanhamentoLote[]>>;
  setParcialModalLote: React.Dispatch<React.SetStateAction<AcompanhamentoLote>>;
  setSavingParcial: React.Dispatch<React.SetStateAction<boolean>>;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export async function handleRemoveApontamentoAcao({ parcialModalLote, setLotes, setParcialModalLote, setSavingParcial, showToast }: handleRemoveApontamentoAcaoCtx, apId: string) {
    if (!parcialModalLote) return;
    const existingList = Array.isArray(parcialModalLote.ficha_ordem?.apontamentosParciais)
      ? parcialModalLote.ficha_ordem.apontamentosParciais
      : Array.isArray(parcialModalLote.fichaOrdem?.apontamentosParciais)
      ? parcialModalLote.fichaOrdem.apontamentosParciais
      : [];

    const updatedList = existingList.filter((a: any) => a.id !== apId);
    const totalEnvasado = updatedList.reduce((acc, a) => acc + (Number(a.quantidade) || 0), 0);
    const newStatus = totalEnvasado > 0 ? 'Ordem Parcial' : parcialModalLote.customStatus;

    setSavingParcial(true);
    try {
      const fichaObj = {
        ...(parcialModalLote.ficha_ordem || parcialModalLote.fichaOrdem || {}),
        apontamentosParciais: updatedList,
      };

      await apiJson('/api/administrativo/lote-ficha', {
        method: 'POST',
        body: JSON.stringify({
          loteNumber: parcialModalLote.loteNumber,
          fichaOrdem: fichaObj,
          quantidadeEnvasadaParcial: totalEnvasado,
          customStatus: newStatus,
        })
      });

      const updated = {
        ...parcialModalLote,
        ficha_ordem: fichaObj,
        fichaOrdem: fichaObj,
        quantidade_envasada_parcial: totalEnvasado,
        quantidadeEnvasadaParcial: totalEnvasado,
        customStatus: newStatus,
      };

      setParcialModalLote(updated);
      setLotes(prev => prev.map(l => l.loteNumber === parcialModalLote.loteNumber ? updated : l));
      showToast("Apontamento removido.");
    } catch (e) {
      console.error("Erro ao remover apontamento:", e);
      showToast("Falha ao remover apontamento.", "error");
    } finally {
      setSavingParcial(false);
    }
  }

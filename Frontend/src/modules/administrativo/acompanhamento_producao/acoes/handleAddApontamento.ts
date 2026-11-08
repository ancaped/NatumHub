import React from 'react';
import { apiJson } from '../../../geral/lib/http';
import type { AcompanhamentoLote } from '../lib/tipos';
import type { AuthUser } from '/home/edson/Documentos/api/.claude/worktrees/producao-refator-acompanhamento-04ae88/Frontend/src/modules/geral/lib/auth';

export interface handleAddApontamentoAcaoCtx {
  currentUser: AuthUser;
  novoApontamento: { data: string; quantidade: string; observacao: string; };
  parcialModalLote: AcompanhamentoLote;
  setLotes: React.Dispatch<React.SetStateAction<AcompanhamentoLote[]>>;
  setNovoApontamento: React.Dispatch<React.SetStateAction<{ data: string; quantidade: string; observacao: string; }>>;
  setParcialModalLote: React.Dispatch<React.SetStateAction<AcompanhamentoLote>>;
  setSavingParcial: React.Dispatch<React.SetStateAction<boolean>>;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export async function handleAddApontamentoAcao({ currentUser, novoApontamento, parcialModalLote, setLotes, setNovoApontamento, setParcialModalLote, setSavingParcial, showToast }: handleAddApontamentoAcaoCtx) {
    if (!parcialModalLote) return;
    const qtd = parseFloat(String(novoApontamento.quantidade).replace(',', '.'));
    if (!qtd || isNaN(qtd) || qtd <= 0) {
      showToast("Informe uma quantidade válida envasada.", "error");
      return;
    }

    const existingList = Array.isArray(parcialModalLote.ficha_ordem?.apontamentosParciais)
      ? parcialModalLote.ficha_ordem.apontamentosParciais
      : Array.isArray(parcialModalLote.fichaOrdem?.apontamentosParciais)
      ? parcialModalLote.fichaOrdem.apontamentosParciais
      : [];

    const dateFormatted = novoApontamento.data
      ? novoApontamento.data.split('-').reverse().join('/')
      : new Date().toLocaleDateString('pt-BR');

    const novoItem = {
      id: String(Date.now()),
      data: dateFormatted,
      quantidade: qtd,
      observacao: novoApontamento.observacao.trim(),
      operador: (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador',
    };

    const updatedList = [...existingList, novoItem];
    const totalEnvasado = updatedList.reduce((acc, a) => acc + (Number(a.quantidade) || 0), 0);
    const shouldFinish = totalEnvasado >= (parcialModalLote.quantity || 0);
    const newStatus = shouldFinish ? 'Ordem Finalizada' : 'Ordem Parcial';

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
      setNovoApontamento(prev => ({ ...prev, quantidade: '', observacao: '' }));
      showToast(`Apontamento de ${qtd.toLocaleString('pt-BR')} un salvo!`);
    } catch (e) {
      console.error("Erro ao salvar apontamento parcial:", e);
      showToast("Não foi possível salvar o apontamento.", "error");
    } finally {
      setSavingParcial(false);
    }
  }

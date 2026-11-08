import React from 'react';
import { apiJson } from '../../../geral/lib/http';
import type { AcompanhamentoLote, ProgramacaoEnvaseItem } from '../lib/tipos';

export interface handleOcultarLoteDoQuadroAcaoCtx {
  fetchLotes: () => Promise<void>;
  fetchProgramacaoEnvase: (dateStr: string) => Promise<void>;
  fetchProgramacaoRotulagem: (dateStr?: string) => Promise<void>;
  setLotes: React.Dispatch<React.SetStateAction<AcompanhamentoLote[]>>;
  setManualLiberadosEnvase: (u: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  setProgramacaoEnvase: React.Dispatch<React.SetStateAction<ProgramacaoEnvaseItem[]>>;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export async function handleOcultarLoteDoQuadroAcao({ fetchLotes, fetchProgramacaoEnvase, fetchProgramacaoRotulagem, setLotes, setManualLiberadosEnvase, setProgramacaoEnvase, showToast }: handleOcultarLoteDoQuadroAcaoCtx, loteNumber: string, quadro: 'pesagem' | 'producao' | 'rotulagem' | 'envase') {
    try {
      // Atualização otimista imediata no estado local
      setLotes(prev => prev.map(l => {
        if (l.loteNumber === loteNumber) {
          const currentOcultos = Array.isArray(l.quadrosOcultos) ? [...l.quadrosOcultos] : [];
          if (!currentOcultos.some(q => q.toLowerCase() === quadro.toLowerCase())) {
            currentOcultos.push(quadro);
          }
          const nextLote = {
            ...l,
            quadrosOcultos: currentOcultos,
            quadros_ocultos: currentOcultos
          };
          if (quadro === 'envase') {
            if (nextLote.customStatus === 'Liberado para Envase') {
              nextLote.customStatus = 'Produzido';
            }
            nextLote.dataLiberadoEnvase = undefined;
          }
          return nextLote;
        }
        return l;
      }));

      // Se for do envase, limpar localmente de programacaoEnvase e de inclusões manuais
      if (quadro === 'envase') {
        setManualLiberadosEnvase(prev => {
          const next = new Set(prev);
          next.delete((loteNumber || '').trim().toLowerCase());
          next.delete(loteNumber);
          return next;
        });
        setProgramacaoEnvase(prev => prev.filter(p => p.loteNumber !== loteNumber));
      }

      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/ocultar-quadro`, {
        method: 'POST',
        body: JSON.stringify({ quadro })
      });

      const quadroNomeMap: Record<string, string> = {
        pesagem: 'Pesagem',
        producao: 'Produção',
        rotulagem: 'Rotulagem',
        envase: 'Envase'
      };
      showToast(`Lote #${loteNumber} removido do quadro de ${quadroNomeMap[quadro] || quadro}. (Permanece integralmente no Quadro de Ordens)`, 'success');
      await fetchLotes();
      if (quadro === 'envase') {
        await fetchProgramacaoEnvase('TODOS');
      } else if (quadro === 'rotulagem') {
        await fetchProgramacaoRotulagem('TODOS');
      }
    } catch (err: any) {
      console.error('Erro ao ocultar lote do quadro:', err);
      showToast(`Erro ao remover lote #${loteNumber}: ${err?.message || err}`, 'error');
      await fetchLotes();
    }
  }

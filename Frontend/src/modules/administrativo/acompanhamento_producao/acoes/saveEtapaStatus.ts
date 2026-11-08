import React from 'react';
import { apiJson } from '../../../geral/lib/http';
import type { AcompanhamentoLote } from '../lib/tipos';
import type { AuthUser } from '/home/edson/Documentos/api/.claude/worktrees/producao-refator-acompanhamento-04ae88/Frontend/src/modules/geral/lib/auth';

export interface saveEtapaStatusAcaoCtx {
  currentUser: AuthUser;
  setLotes: React.Dispatch<React.SetStateAction<AcompanhamentoLote[]>>;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export async function saveEtapaStatusAcao({ currentUser, setLotes, showToast }: saveEtapaStatusAcaoCtx, loteNumber: string, etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase', status: string, motivoEspera?: string | null, insumoFaltanteCodigo?: string | null, insumoFaltanteDescricao?: string | null, updatedBy?: string, dataAgendada?: string | null) {
    const responsible = updatedBy || (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
    const nowIso = new Date().toISOString();

    // 1. Atualização otimista na lista de lotes em memória
    setLotes(prev => prev.map(l => {
      if (l.loteNumber !== loteNumber) return l;
      const currentEtapas = l.etapasStatus || (l as any).etapas_status || {};
      const updatedLote = {
        ...l,
        etapasStatus: {
          ...currentEtapas,
          [etapa]: {
            status,
            motivoEspera: motivoEspera || null,
            insumoFaltanteCodigo: insumoFaltanteCodigo || null,
            insumoFaltanteDescricao: insumoFaltanteDescricao || null,
            updatedBy: responsible,
            updatedAt: nowIso,
          }
        }
      };

      if (dataAgendada) {
        const cleanDt = dataAgendada.trim();
        const isoSchedule = cleanDt.includes('T') ? cleanDt : `${cleanDt}T08:00:00Z`;
        if (etapa === 'pesagem') updatedLote.dataPesagem = isoSchedule;
        else if (etapa === 'producao') updatedLote.dataProducao = isoSchedule;
        else if (etapa === 'rotulagem') updatedLote.dataRotulagem = isoSchedule;
        else if (etapa === 'envase') updatedLote.dataEnvase = isoSchedule;
      }

      // Se ativando, concluindo ou colocando na fila a etapa, remove de quadrosOcultos caso estivesse oculta
      if (status === 'ativo' || status === 'concluido' || status === 'fila') {
        const ocl = updatedLote.quadrosOcultos || (updatedLote as any).quadros_ocultos;
        if (Array.isArray(ocl)) {
          const nextOcl = ocl.filter(q => q.toLowerCase() !== etapa.toLowerCase());
          updatedLote.quadrosOcultos = nextOcl;
          (updatedLote as any).quadros_ocultos = nextOcl;
        }
      }

      return updatedLote;
    }));

    // 2. Persistência no backend (Postgres via rota dedicada de etapa)
    try {
      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/etapa-status`, {
        method: 'POST',
        body: JSON.stringify({
          etapa,
          status,
          motivoEspera: motivoEspera || null,
          insumoFaltanteCodigo: insumoFaltanteCodigo || null,
          insumoFaltanteDescricao: insumoFaltanteDescricao || null,
          updatedBy: responsible,
          dataAgendada: dataAgendada || null,
        })
      });
    } catch (err: any) {
      console.error(`Erro ao persistir etapa ${etapa} do lote #${loteNumber}:`, err);
      showToast(`Não foi possível salvar a etapa ${etapa} do lote #${loteNumber}: ${err?.message || err}`, 'error');
    }
  }

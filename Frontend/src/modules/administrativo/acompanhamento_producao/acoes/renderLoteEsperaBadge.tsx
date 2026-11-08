import React from 'react';
import type { AcompanhamentoLote, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem } from '../lib/tipos';
import { getLoteEsperaDetails } from '../lib/lotes';
import { cn } from '../../../geral/lib/utils';
import { PauseCircle, Play } from 'lucide-react';

export interface renderLoteEsperaBadgeAcaoCtx {
  handleOpenPauseModal: (lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => void;
  handleResumeLote: (lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => Promise<void>;
  programacaoEnvase: ProgramacaoEnvaseItem[];
  programacaoRotulagem: ProgramacaoRotulagemItem[];
}

export function renderLoteEsperaBadgeAcao({ handleOpenPauseModal, handleResumeLote, programacaoEnvase, programacaoRotulagem }: renderLoteEsperaBadgeAcaoCtx, lote: AcompanhamentoLote) {
    const espera = getLoteEsperaDetails(lote, programacaoEnvase, programacaoRotulagem);
    if (!espera.isEmEspera) return null;

    return (
      <div
        onClick={() => handleOpenPauseModal(lote, espera.etapa || undefined)}
        className={cn(
          "p-2 rounded-lg text-[11px] font-semibold flex flex-col gap-1 cursor-pointer transition-all shadow-2xs border",
          espera.badgeBg,
          espera.badgeText,
          espera.badgeBorder
        )}
        title="Clique para editar o motivo da espera ou insumo faltante"
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 font-bold truncate">
            <PauseCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              ⏸️ Em Espera: <span className="font-extrabold underline decoration-current">{espera.etapaLabel}</span>
            </span>
          </div>
          <span className="text-[11px] md:text-[10px] opacity-75 underline font-normal shrink-0 hover:opacity-100">
            Editar
          </span>
        </div>

        {espera.insumoCodigo ? (
          <div className="text-[11px] md:text-[10px] font-mono bg-red-100/70 border border-red-200 px-2 py-0.5 rounded text-red-900 font-semibold truncate">
            🚨 Faltante: [{espera.insumoCodigo}] {espera.insumoDescricao || ''}
          </div>
        ) : null}

        {espera.motivo && espera.motivo !== 'Falta de Insumo / Matéria-Prima' && (
          <div className="text-[11px] md:text-[10px] italic truncate pl-5">
            Motivo: {espera.motivo}
          </div>
        )}

        <div className="pt-1 border-t border-current/15 flex items-center justify-between text-[11px] md:text-[10px]">
          <span className="opacity-75 font-normal">Fluxo pausado ({espera.etapaLabel})</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleResumeLote(lote, espera.etapa || undefined);
            }}
            className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-bold transition-colors cursor-pointer flex items-center gap-0.5 shadow-2xs"
            title="Liberar lote e retomar para a fila"
          >
            <Play className="h-2.5 w-2.5 fill-current" />
            <span>Retomar</span>
          </button>
        </div>
      </div>
    );
  }

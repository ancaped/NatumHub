import React from 'react';
import type { AcompanhamentoLote, ProgramacaoEnvaseItem } from '../lib/tipos';
import { getLoteEtapaStatus, getEffectiveStatus } from '../lib/lotes';
import { cn } from '../../../geral/lib/utils';
import { AlertTriangle, PauseCircle, Play } from 'lucide-react';

export interface renderLoteProblemaBannerAcaoCtx {
  handleOpenPauseModal: (lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => void;
  handleResumeLote: (lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => Promise<void>;
  hasLoteProblemaOuPausa: (lote: AcompanhamentoLote | null | undefined, itemEnvase?: ProgramacaoEnvaseItem | null, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => boolean;
}

export function renderLoteProblemaBannerAcao({ handleOpenPauseModal, handleResumeLote, hasLoteProblemaOuPausa }: renderLoteProblemaBannerAcaoCtx, lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') {
    if (!hasLoteProblemaOuPausa(lote, null, etapa)) return null;

    let cod: string | null | undefined;
    let desc: string | null | undefined;
    let motivo: string | null | undefined;
    let isEspera: boolean;

    if (etapa) {
      const etapaInfo = getLoteEtapaStatus(lote, etapa);
      cod = etapaInfo.insumoFaltanteCodigo;
      desc = etapaInfo.insumoFaltanteDescricao;
      motivo = etapaInfo.motivoEspera;
      isEspera = etapaInfo.isEspera;
    } else {
      cod = lote.insumoFaltanteCodigo || (lote as any).insumo_faltante_codigo;
      desc = lote.insumoFaltanteDescricao || (lote as any).insumo_faltante_descricao;
      motivo = lote.motivoEspera;
      const eff = getEffectiveStatus(lote);
      isEspera = eff === 'Em Espera' || lote.customStatus === 'Em Espera' || Boolean(lote.dataEmEspera);
    }

    return (
      <div
        onClick={() => handleOpenPauseModal(lote, etapa)}
        className={cn(
          "p-2 rounded-lg text-[11px] font-semibold flex flex-col gap-1 cursor-pointer transition-all shadow-2xs border",
          cod 
            ? "bg-red-50/90 border-red-200 text-red-950 hover:bg-red-100" 
            : "bg-amber-50/90 border-amber-200 text-amber-950 hover:bg-amber-100"
        )}
        title="Clique para editar o motivo da pausa ou insumo faltante"
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 font-bold truncate">
            {cod ? (
              <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
            ) : (
              <PauseCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            )}
            <span className="truncate">
              {cod ? 'Falta de Insumo / Material' : (motivo || 'Lote em Espera')}
            </span>
          </div>
          <span className="text-[11px] md:text-[10px] text-zinc-500 underline font-normal shrink-0 hover:text-zinc-800">
            Editar
          </span>
        </div>

        {cod && (
          <div className="text-[11px] md:text-[10px] font-mono bg-red-100/70 border border-red-200 px-2 py-0.5 rounded text-red-900 font-semibold truncate">
            🚨 Faltante: [{cod}] {desc || ''}
          </div>
        )}

        {motivo && motivo !== 'Falta de Insumo / Matéria-Prima' && (
          <div className="text-[11px] md:text-[10px] text-amber-900/90 italic truncate">
            Motivo: {motivo}
          </div>
        )}

        {isEspera && (
          <div className="pt-1 border-t border-zinc-200/50 flex items-center justify-between text-[11px] md:text-[10px]">
            <span className="text-zinc-500 font-normal">Fluxo pausado</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleResumeLote(lote, etapa);
              }}
              className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold transition-colors cursor-pointer flex items-center gap-0.5 shadow-2xs"
              title="Liberar lote e retomar para a fila"
            >
              <Play className="h-2.5 w-2.5 fill-current" />
              <span>Retomar</span>
            </button>
          </div>
        )}
      </div>
    );
  }

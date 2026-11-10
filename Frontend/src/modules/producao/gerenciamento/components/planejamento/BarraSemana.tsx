import React, { useEffect, useRef, useState } from 'react';
import { CalendarClock, RefreshCw, ChevronLeft, ChevronRight, Package, Plus, Sparkles, ShieldCheck, Printer, Settings, Trash2, MoreHorizontal, LayoutGrid, List } from 'lucide-react';
import type { ReatorConfig, PlanejamentoItem } from './lib/planejamentoSemanal';
import type { DiaSemana } from './tiposDrawers';

export interface SemanaBarra {
  currentWeekKey: string;
  weekDays: DiaSemana[];
  loadingPlan: boolean;
  plannedItems: PlanejamentoItem[];
  filaTodos: unknown[];
}

export interface AcoesBarra {
  handlePrevWeek: () => void;
  handleToday: () => void;
  handleNextWeek: () => void;
  fetchPlanejamento: () => void;
  fetchFila: () => void;
  handleOpenScheduleModal: (product: any | null, targetDate?: string, targetReator?: string) => void;
  handleRunHeuristic: () => void;
  handlePrintWeeklyPlan: () => void;
  handleClearWeek: () => void;
  setCoberturaAberta: (v: boolean) => void;
  setReatoresModalOpen: (v: boolean) => void;
  setDemandBankOpen: (v: boolean) => void;
}

interface BarraSemanaProps {
  semana: SemanaBarra;
  acoes: AcoesBarra;
  podeEditar: boolean;
  demandBankOpen: boolean;
  sugerindo: boolean;
  reatores: ReatorConfig[];
  visao: 'grade' | 'lista';
  setVisao: (v: 'grade' | 'lista') => void;
}

const BTN = 'max-md:min-h-11 max-md:min-w-11 max-md:justify-center px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-300';

/** Barra superior: navegação da semana e as quatro ações do dia a dia; o resto fica no menu "Mais". */
export function BarraSemana({ semana, acoes, podeEditar, demandBankOpen, sugerindo, reatores, visao, setVisao }: BarraSemanaProps) {
  const { currentWeekKey, weekDays, loadingPlan, plannedItems, filaTodos } = semana;
  const {
    handlePrevWeek, handleToday, handleNextWeek, fetchPlanejamento, fetchFila, handleOpenScheduleModal, handleRunHeuristic,
    handlePrintWeeklyPlan, handleClearWeek, setCoberturaAberta, setReatoresModalOpen, setDemandBankOpen,
  } = acoes;
  const [maisAberto, setMaisAberto] = useState(false);
  const maisRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!maisAberto) return;
    const fora = (e: MouseEvent | TouchEvent) => { if (!maisRef.current?.contains(e.target as Node)) setMaisAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMaisAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('touchstart', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('touchstart', fora); document.removeEventListener('keydown', esc); };
  }, [maisAberto]);

  const itemMenu = 'w-full min-h-11 px-3 flex items-center gap-2.5 text-left text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer disabled:text-zinc-300 disabled:cursor-not-allowed';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-zinc-200 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center bg-zinc-100 p-1 rounded-lg border border-zinc-200">
          <button onClick={handlePrevWeek} className="p-1.5 max-md:min-h-11 max-md:min-w-11 max-md:flex max-md:items-center max-md:justify-center hover:bg-white rounded-md text-zinc-600 hover:text-zinc-900 transition-colors" title="Semana anterior">
            <ChevronLeft size={16} />
          </button>
          <button onClick={handleToday} className="px-2.5 py-1 max-md:min-h-11 text-xs font-semibold text-zinc-700 hover:bg-white rounded-md transition-colors">
            Semana atual
          </button>
          <button onClick={handleNextWeek} className="p-1.5 max-md:min-h-11 max-md:min-w-11 max-md:flex max-md:items-center max-md:justify-center hover:bg-white rounded-md text-zinc-600 hover:text-zinc-900 transition-colors" title="Próxima semana">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 border border-zinc-200 rounded-lg text-zinc-900 font-mono font-bold text-xs">
          <CalendarClock size={14} className="text-zinc-600" />
          <span>Semana {currentWeekKey.split('-W')[1]} ({weekDays[0].dateStr.split('-').slice(1).reverse().join('/')} a {weekDays[4].dateStr.split('-').slice(1).reverse().join('/')})</span>
        </div>

        <div className="flex items-center bg-zinc-100 p-1 rounded-lg border border-zinc-200" role="group" aria-label="Visão da semana">
          {([['grade', 'Grade', LayoutGrid], ['lista', 'Lista', List]] as const).map(([v, rot, Ic]) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisao(v)}
              aria-pressed={visao === v}
              className={`px-2.5 py-1 max-md:min-h-11 text-xs font-semibold rounded-md flex items-center gap-1.5 cursor-pointer transition-colors ${visao === v ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-800'}`}
            >
              <Ic size={13} /> {rot}
            </button>
          ))}
        </div>

        <button
          onClick={() => { fetchPlanejamento(); fetchFila(); }}
          className="p-1.5 max-md:min-h-11 max-md:min-w-11 max-md:flex max-md:items-center max-md:justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
          title="Atualizar planejamento"
        >
          <RefreshCw size={15} className={loadingPlan ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {!podeEditar && (
          <span className="px-2 py-1 rounded-md border border-zinc-200 bg-zinc-100 text-zinc-600 text-[11px] md:text-[10px] font-bold">Somente leitura</span>
        )}
        <button
          onClick={() => setDemandBankOpen(!demandBankOpen)}
          className={`${BTN} ${demandBankOpen ? '!bg-zinc-900 !text-white !border-zinc-900 hover:!bg-zinc-800' : ''}`}
          title="Fila de demandas do PCP"
        >
          <Package size={14} />
          <span>Fila</span>
          <span className={`font-mono px-1.5 rounded text-[11px] md:text-[10px] ${demandBankOpen ? 'bg-white/15 text-white' : 'bg-zinc-100 text-zinc-800'}`}>{filaTodos.length}</span>
        </button>

        {podeEditar && (
          <>
            <button onClick={() => handleOpenScheduleModal(null, weekDays[0]?.dateStr, reatores[0]?.id || 'R_500')} className={BTN} title="Agendar nova batelada ou ordem conjunta">
              <Plus size={14} className="text-zinc-600" />
              <span>Agendar</span>
            </button>
            <button onClick={handleRunHeuristic} disabled={sugerindo} className={BTN} title="Sugerir a semana a partir da lista Tudo p/ Produzir Hoje, por urgência">
              <Sparkles size={14} className="text-zinc-500" />
              <span>{sugerindo ? 'Montando…' : 'Sugerir'}</span>
            </button>
          </>
        )}

        <button onClick={() => setCoberturaAberta(true)} className={BTN} title="Insumos da semana: o que falta, o que chega e o que precisa de decisão">
          <ShieldCheck size={14} className="text-zinc-500" />
          <span>Insumos</span>
        </button>

        <div className="relative" ref={maisRef}>
          <button onClick={() => setMaisAberto(v => !v)} className={BTN} aria-haspopup="menu" aria-expanded={maisAberto} title="Mais ações">
            <MoreHorizontal size={15} />
            <span>Mais</span>
          </button>
          {maisAberto && (
            <div role="menu" className="absolute right-0 top-full mt-1 z-30 w-56 bg-white border border-zinc-200 rounded-lg shadow-lg overflow-hidden">
              <button role="menuitem" className={itemMenu} onClick={() => { setMaisAberto(false); handlePrintWeeklyPlan(); }}>
                <Printer size={15} className="text-zinc-500" /> Imprimir a semana (A4)
              </button>
              {podeEditar && (
                <>
                  <button role="menuitem" className={itemMenu} onClick={() => { setMaisAberto(false); setReatoresModalOpen(true); }}>
                    <Settings size={15} className="text-zinc-500" /> Reatores e capacidades
                  </button>
                  <button role="menuitem" className={`${itemMenu} !text-red-600 hover:!bg-red-50 disabled:!text-zinc-300`} disabled={plannedItems.length === 0} onClick={() => { setMaisAberto(false); handleClearWeek(); }}>
                    <Trash2 size={15} /> Limpar semana
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

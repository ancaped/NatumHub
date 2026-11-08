import React from 'react';
import { CalendarClock, RefreshCw, ChevronLeft, ChevronRight, Package, Plus, Sparkles, ShieldCheck, Printer, Settings, Trash2 } from 'lucide-react';
import type { ReatorConfig, PlanejamentoItem } from './lib/planejamentoSemanal';
import type { DiaSemana } from './tiposDrawers';

export interface SemanaBarra {
  currentWeekKey: string;
  weekDays: DiaSemana[];
  weekStats: { totalKg: number; totalBatches: number; caldeiraItems: number };
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
}

/** Barra superior de comandos: navegação de semana, métricas e ações do Planejamento. */
export function BarraSemana({ semana, acoes, podeEditar, demandBankOpen, sugerindo, reatores }: BarraSemanaProps) {
  const { currentWeekKey, weekDays, weekStats, loadingPlan, plannedItems, filaTodos } = semana;
  const {
    handlePrevWeek, handleToday, handleNextWeek, fetchPlanejamento, fetchFila, handleOpenScheduleModal, handleRunHeuristic,
    handlePrintWeeklyPlan, handleClearWeek, setCoberturaAberta, setReatoresModalOpen, setDemandBankOpen,
  } = acoes;

  return (

    <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-zinc-200 shadow-xs">
      {/* Navegação Semanal */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center bg-zinc-100 p-1 rounded-lg border border-zinc-200">
          <button
            onClick={handlePrevWeek}
            className="p-1.5 max-md:min-h-11 max-md:min-w-11 max-md:flex max-md:items-center max-md:justify-center hover:bg-white rounded-md text-zinc-650 hover:text-zinc-900 transition-colors"
            title="Semana Anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={handleToday}
            className="px-2.5 py-1 max-md:min-h-11 text-xs font-semibold text-zinc-700 hover:bg-white rounded-md transition-colors"
          >
            Semana Atual
          </button>
          <button
            onClick={handleNextWeek}
            className="p-1.5 max-md:min-h-11 max-md:min-w-11 max-md:flex max-md:items-center max-md:justify-center hover:bg-white rounded-md text-zinc-650 hover:text-zinc-900 transition-colors"
            title="Próxima Semana"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 border border-zinc-200 rounded-lg text-zinc-900 font-mono font-bold text-xs">
          <CalendarClock size={14} className="text-zinc-600" />
          <span>Semana {currentWeekKey.split('-W')[1]} ({weekDays[0].dateStr.split('-').slice(1).reverse().join('/')} a {weekDays[4].dateStr.split('-').slice(1).reverse().join('/')})</span>
        </div>

        <button
          onClick={() => { fetchPlanejamento(); fetchFila(); }}
          className="p-1.5 max-md:min-h-11 max-md:min-w-11 max-md:flex max-md:items-center max-md:justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
          title="Atualizar Planejamento"
        >
          <RefreshCw size={15} className={loadingPlan ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Métricas Compactas da Semana (font-mono) */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
        <div className="px-2.5 py-1 bg-zinc-50 border border-zinc-200 rounded-md flex items-center gap-1.5">
          <span className="text-zinc-500 font-sans">Ordens:</span>
          <strong className="text-zinc-900 font-bold">{weekStats.totalBatches}</strong>
        </div>
        <div className="px-2.5 py-1 bg-zinc-50 border border-zinc-200 rounded-md flex items-center gap-1.5">
          <span className="text-zinc-500 font-sans">Massa:</span>
          <strong className="text-zinc-900 font-bold">{weekStats.totalKg.toLocaleString('pt-BR')} kg</strong>
        </div>
        <div className="px-2.5 py-1 bg-zinc-50 border border-zinc-200 rounded-md flex items-center gap-1.5">
          <span className="text-zinc-500 font-sans">Caldeira:</span>
          <strong className="text-zinc-800 font-bold">{weekStats.caldeiraItems}</strong>
        </div>
      </div>

      {/* Hierarquia de Ações (HSL Zinc) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {!podeEditar && (
          <span className="px-2 py-1 rounded-md border border-zinc-200 bg-zinc-100 text-zinc-600 text-[11px] md:text-[10px] font-bold">Somente leitura</span>
        )}
        <button
          onClick={() => setDemandBankOpen(!demandBankOpen)}
          className={`max-md:min-h-11 max-md:min-w-11 max-md:justify-center px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
            demandBankOpen
              ? 'bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-900 shadow-2xs'
              : 'bg-white hover:bg-zinc-50 text-zinc-900 border border-zinc-300 shadow-2xs'
          }`}
        >
          <Package size={14} />
          <span>Banco de Demandas / Na Fila</span>
          <span className={`font-mono px-1.5 py-0.2 rounded text-[11px] md:text-[10px] ${
            demandBankOpen ? 'bg-white/15 text-white' : 'bg-zinc-100 text-zinc-800'
          }`}>
            {filaTodos.length}
          </span>
        </button>

{podeEditar && (
        <>
        <button
          onClick={() => handleOpenScheduleModal(null, weekDays[0]?.dateStr, reatores[0]?.id || 'R_500')}
          className="max-md:min-h-11 max-md:min-w-11 max-md:justify-center bg-white hover:bg-zinc-50 text-zinc-900 border border-zinc-300 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          title="Agendar nova batelada ou ordem conjunta"
        >
          <Plus size={14} className="text-zinc-600" />
          <span>+ Agendar / Ordem Conjunta</span>
        </button>

        <button
          onClick={handleRunHeuristic}
          disabled={sugerindo}
          className="max-md:min-h-11 max-md:min-w-11 max-md:justify-center bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          title="Sugerir a semana a partir da lista Tudo p/ Produzir Hoje do Gerenciamento, por urgência"
        >
          <Sparkles size={14} className="text-zinc-500" />
          <span>{sugerindo ? 'Montando…' : 'Sugerir Sequência'}</span>
        </button>

        </>
        )}

                  <button
          onClick={() => setCoberturaAberta(true)}
          className="max-md:min-h-11 max-md:min-w-11 max-md:justify-center bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          title="Insumos da semana: o que falta, o que chega e o que precisa de decisão (reserva do ERP, pedidos, notas e ordens manuais)"
        >
          <ShieldCheck size={14} className="text-zinc-500" />
          <span>Insumos da Semana</span>
        </button>

        <button
          onClick={handlePrintWeeklyPlan}
          className="max-md:min-h-11 max-md:min-w-11 max-md:justify-center max-md:flex max-md:items-center p-1.5 bg-white hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900 border border-zinc-200 rounded-lg transition-colors cursor-pointer"
          title="Imprimir Programação Semanal de Produção em formato A4"
        >
          <Printer size={15} />
        </button>

        {podeEditar && (
        <>
        <button
          onClick={() => setReatoresModalOpen(true)}
          className="max-md:min-h-11 max-md:min-w-11 max-md:justify-center max-md:flex max-md:items-center p-1.5 bg-white hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900 border border-zinc-200 rounded-lg transition-colors cursor-pointer"
          title="Configurar Reatores e Capacidades"
        >
          <Settings size={15} />
        </button>

        <button
          onClick={handleClearWeek}
          disabled={plannedItems.length === 0}
          className={`max-md:min-h-11 max-md:min-w-11 max-md:justify-center max-md:flex max-md:items-center p-1.5 rounded-lg border transition-colors ${
            plannedItems.length > 0 
              ? 'bg-white border-zinc-200 text-zinc-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 cursor-pointer' 
              : 'bg-zinc-50 text-zinc-300 border-zinc-200 cursor-not-allowed'
          }`}
          title="Limpar todas as ordens de produção agendadas para esta semana"
        >
          <Trash2 size={15} />
        </button>
        </>
        )}
      </div>
    </div>
  );
}

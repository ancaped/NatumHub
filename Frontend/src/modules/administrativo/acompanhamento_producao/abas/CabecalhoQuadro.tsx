import React from 'react';
import type { UnifiedQuadroHeaderProps } from '../lib/tipos';
import { cn } from '../../../geral/lib/utils';
import { Calendar, Layers, ChevronLeft, ChevronRight, Search, RefreshCw } from 'lucide-react';

export interface renderCabecalhoQuadroCtx {
  setLocalizarDataSearch: React.Dispatch<React.SetStateAction<string>>;
  setShowLocalizarDataModal: React.Dispatch<React.SetStateAction<boolean>>;
}

export function renderCabecalhoQuadro({ setLocalizarDataSearch, setShowLocalizarDataModal }: renderCabecalhoQuadroCtx, {
    title,
    subtitle,
    icon,
    selectedDate,
    setSelectedDate,
    showAllDates,
    setShowAllDates,
    badgeCount,
    badgeCountLabel = 'lote(s)',
    badgeKg,
    badgeUn,
    badgeExtra,
    operationalMetrics,
    actionButtons,
    onRefresh,
    isRefreshing = false,
  }: UnifiedQuadroHeaderProps) {
    const handlePrevDay = () => {
      const parts = selectedDate.split('-').map(Number);
      const d = new Date(parts[0], parts[1] - 1, parts[2] - 1);
      const pad = (n: number) => n.toString().padStart(2, '0');
      setSelectedDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setShowAllDates(false);
    };

    const handleNextDay = () => {
      const parts = selectedDate.split('-').map(Number);
      const d = new Date(parts[0], parts[1] - 1, parts[2] + 1);
      const pad = (n: number) => n.toString().padStart(2, '0');
      setSelectedDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setShowAllDates(false);
    };

    const handleToday = () => {
      const d = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      setSelectedDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setShowAllDates(false);
    };

    const todayStr = (() => {
      const d = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    })();

    const isTodaySelected = selectedDate === todayStr;
    const dateParts = selectedDate.split('-');
    const displayDateFormatted = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : selectedDate;

    return (
      <div className="bg-white rounded-xl p-3.5 border border-zinc-200 shadow-2xs space-y-3">
        {/* Linha Superior: Identificação do Quadro + Controles de Planejamento Diário */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-zinc-900 text-white rounded-xl shadow-2xs shrink-0">
              {icon}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-extrabold text-zinc-900 tracking-tight">{title}</h2>
                {badgeCount !== undefined && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-zinc-100 text-zinc-900 border border-zinc-200">
                    {badgeCount} {badgeCountLabel}
                  </span>
                )}
                {badgeKg !== undefined && badgeKg > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {Number(badgeKg).toLocaleString('pt-BR')} kg
                  </span>
                )}
                {badgeUn !== undefined && badgeUn > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-zinc-100 text-zinc-800 border border-zinc-200">
                    {Number(badgeUn).toLocaleString('pt-BR')} un
                  </span>
                )}
                {badgeExtra}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                {subtitle}
                <span className="text-zinc-300 mx-1.5">•</span>
                <span className={showAllDates ? "text-zinc-600 font-semibold" : "text-zinc-900 font-semibold"}>
                  {showAllDates ? "Exibindo todos os lotes pendentes" : `Planejamento focado no dia ${displayDateFormatted}`}
                </span>
              </p>
            </div>
          </div>

          {/* Controles de Data e Modo */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Toggle Modo: Deste Dia vs Todos */}
            <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setShowAllDates(false)}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                  !showAllDates ? "bg-white text-zinc-900 shadow-2xs font-extrabold" : "text-zinc-500 hover:text-zinc-900"
                )}
                title="Ver apenas lotes programados para o dia selecionado"
              >
                <Calendar className="h-3.5 w-3.5 text-zinc-700" />
                <span>Deste Dia</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAllDates(true)}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                  showAllDates ? "bg-white text-zinc-900 shadow-2xs font-extrabold" : "text-zinc-500 hover:text-zinc-900"
                )}
                title="Ver todos os lotes pendentes nesta etapa (visão geral)"
              >
                <Layers className="h-3.5 w-3.5 text-zinc-600" />
                <span>Todos Pendentes</span>
              </button>
            </div>

            {/* Navegador Diário */}
            <div className="flex items-center gap-1 bg-zinc-50 border border-zinc-200 rounded-lg p-1">
              <button
                type="button"
                onClick={handlePrevDay}
                className="p-1 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 rounded cursor-pointer transition-colors"
                title="Dia anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={handleToday}
                className={cn(
                  "px-2 py-0.5 rounded text-xs font-bold transition-all cursor-pointer",
                  isTodaySelected ? "bg-zinc-900 text-white shadow-2xs" : "text-zinc-700 hover:bg-zinc-200"
                )}
                title="Ir para o dia de hoje"
              >
                Hoje
              </button>

              <div className="relative flex items-center">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => {
                    if (e.target.value) {
                      setSelectedDate(e.target.value);
                      setShowAllDates(false);
                    }
                  }}
                  className="text-xs font-mono font-bold bg-white border border-zinc-200 rounded px-2 py-0.5 text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer"
                />
              </div>

              <button
                type="button"
                onClick={handleNextDay}
                className="p-1 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 rounded cursor-pointer transition-colors"
                title="Próximo dia"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Botão de Localização Facilitada de Lote em Qualquer Data */}
            <button
              type="button"
              onClick={() => {
                setShowLocalizarDataModal(true);
                setLocalizarDataSearch('');
              }}
              className="px-2.5 py-1.5 bg-white hover:bg-zinc-50 active:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs shrink-0"
              title="Pesquisar em qual data qualquer lote está agendado (Envase, Rotulagem, Produção, Pesagem)"
            >
              <Search className="h-3.5 w-3.5 text-zinc-500" />
              <span>Localizar Data do Lote</span>
            </button>

            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="p-2 border border-zinc-200 hover:bg-zinc-50 text-zinc-650 hover:text-zinc-900 rounded-lg transition-colors cursor-pointer"
                title="Atualizar dados"
              >
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </button>
            )}
          </div>
        </div>

        {/* Linha Inferior: Indicadores Operacionais e Ações Contextuais */}
        {(operationalMetrics || actionButtons) && (
          <div className="pt-2.5 border-t border-zinc-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {operationalMetrics}
            </div>
            {actionButtons && (
              <div className="flex flex-wrap items-center gap-2 text-xs shrink-0">
                {actionButtons}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

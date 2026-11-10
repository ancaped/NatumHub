import React, { useState } from 'react';
import { Plus, AlertCircle, ChevronRight, ChevronDown, Flame } from 'lucide-react';
import { getShortReatorName } from '../../../lib/processoProduto';
import { groupCellItems, infoDoReator, formatDateStr, validarAlocacao, type PlanejamentoItem, type ReatorConfig } from './lib/planejamentoSemanal';
import { CartaoOrdem, type PropsCompartilhadasCartao, type ArrasteTela } from './CartaoOrdem';
import type { DiaSemana } from './tiposDrawers';

interface GradeSemanalProps {
  weekDays: DiaSemana[];
  reatores: ReatorConfig[];
  matrixItemsMap: Record<string, PlanejamentoItem[]>;
  plannedItems: PlanejamentoItem[];
  podeEditar: boolean;
  arraste: ArrasteTela;
  cartao: PropsCompartilhadasCartao;
  moverOrdens: (itens: PlanejamentoItem[], reatorId: string, dateStr: string) => Promise<boolean>;
  handleOpenScheduleModal: (product: any | null, targetDate?: string, targetReator?: string) => void;
}

const kgDe = (itens: PlanejamentoItem[]) => itens.reduce((a, i) => a + (Number(i.quantidade_planejada) || 0), 0);

/** Grade (desktop): reatores nas linhas, segunda a sexta nas colunas; recebe o arraste de ordens e de itens da fila. */
export function GradeSemanal({ weekDays, reatores, matrixItemsMap, plannedItems, podeEditar, arraste, cartao, moverOrdens, handleOpenScheduleModal }: GradeSemanalProps) {
  const {
    dragOverCell, setDragOverCell, draggedBatch, setDraggedBatch, draggedItem, setDraggedItem, draggedDrawerProduct, setDraggedDrawerProduct,
  } = arraste;
  const [semOrdensAberto, setSemOrdensAberto] = useState(false);
  const [diasAbertos, setDiasAbertos] = useState<Set<string>>(new Set());

  const hoje = formatDateStr(new Date());
  const semanaAtual = weekDays.some(d => d.dateStr === hoje);
  const arrastando = !!(draggedBatch?.length || draggedItem || draggedDrawerProduct);
  // massa do que se arrasta (ordens do quadro); item da fila não tem kg definido até o agendamento
  const itensArrastados = draggedBatch?.length ? draggedBatch : draggedItem ? [draggedItem] : null;
  const kgArrastado = itensArrastados ? kgDe(itensArrastados) : null;

  const ativos = reatores.filter(r => r.ativo);
  const itensDoReator = (r: ReatorConfig) => weekDays.flatMap(d => matrixItemsMap[`${r.id}_${d.dateStr}`] || []);
  const comOrdens = ativos.filter(r => itensDoReator(r).length > 0);
  const semOrdens = ativos.filter(r => itensDoReator(r).length === 0);
  const semOrdensVisivel = semOrdensAberto || (arrastando && semOrdens.length > 0);

  const itensDoDia = (d: DiaSemana) => ativos.flatMap(r => matrixItemsMap[`${r.id}_${d.dateStr}`] || []);
  const totalSemanaKg = weekDays.reduce((a, d) => a + kgDe(itensDoDia(d)), 0);
  const totalSemanaOrdens = weekDays.reduce((a, d) => a + itensDoDia(d).length, 0);
  const quentesDoDia = (d: DiaSemana) => groupCellItems(itensDoDia(d)).filter(b => b.isQuente).length;

  const diaEstreito = (d: DiaSemana) => semanaAtual && d.dateStr < hoje && !diasAbertos.has(d.dateStr);
  const abrirDia = (d: DiaSemana) => setDiasAbertos(prev => new Set(prev).add(d.dateStr));

  const renderLinha = (reator: ReatorConfig) => {
    const info = infoDoReator(reator);
    const Icone = info.Icone;
    let motivoMostrado = false; // o motivo do bloqueio aparece uma vez por linha; as demais células só ficam tingidas
    return (
      <tr key={reator.id} className="hover:bg-zinc-50/40 transition-colors">
        <td className="px-2 py-1.5 border-r border-zinc-200 bg-zinc-50/50 align-top w-44 max-w-44">
          <div className="flex items-center gap-1.5 min-w-0" title={`${reator.nome} · ${info.rotulo}`}>
            <Icone size={14} className="text-zinc-500 shrink-0" />
            <span className="font-bold text-zinc-900 text-xs truncate min-w-0">{getShortReatorName(reator.id, undefined, reatores)}</span>
            {info.tipo !== 'bombona' && <span className="text-[10px] text-zinc-500 shrink-0 font-mono">{reator.capacidade_kg} kg</span>}
          </div>
        </td>

        {weekDays.map(day => {
          const cellItems = matrixItemsMap[`${reator.id}_${day.dateStr}`] || [];
          const isHoliday = !!day.holiday;
          const estreito = diaEstreito(day);
          const sobre = dragOverCell?.reatorId === reator.id && dragOverCell?.dateStr === day.dateStr;
          const mesmoLugar = !!itensArrastados && itensArrastados.every(i => i.reator_id === reator.id && i.data_planejada === day.dateStr);
          const motivo = arrastando && !isHoliday && !mesmoLugar && kgArrastado !== null
            ? validarAlocacao({ reatorId: reator.id, dateStr: day.dateStr, kg: kgArrastado, reatores, plannedItems, ignoreIds: new Set(itensArrastados!.map(i => i.id)) })
            : null;
          const mostrarMotivo = !!motivo && !motivoMostrado && !estreito;
          if (mostrarMotivo) motivoMostrado = true;
          const aceita = arrastando && !isHoliday && !mesmoLugar && !motivo;

          return (
            <td
              key={day.dateStr}
              onClick={estreito ? () => abrirDia(day) : undefined}
              onDragOver={(e) => {
                if (isHoliday) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverCell?.reatorId !== reator.id || dragOverCell?.dateStr !== day.dateStr) {
                  setDragOverCell({ reatorId: reator.id, dateStr: day.dateStr });
                }
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                if (sobre) setDragOverCell(null);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                setDragOverCell(null);
                if (isHoliday) return;

                // 1. Arrastando uma ordem do quadro (conjunta ou individual)
                const itens = draggedBatch?.length ? draggedBatch : draggedItem ? [draggedItem] : null;
                if (itens) {
                  setDraggedBatch(null);
                  setDraggedItem(null);
                  await moverOrdens(itens, reator.id, day.dateStr);
                  return;
                }

                // 2. Arrastando item novo da Fila
                if (draggedDrawerProduct) {
                  handleOpenScheduleModal(draggedDrawerProduct, day.dateStr, reator.id);
                  setDraggedDrawerProduct(null);
                }
              }}
              className={`border-r border-zinc-200 align-top transition-colors relative ${estreito ? 'px-1 py-1.5 w-14 min-w-14 max-w-14 cursor-pointer hover:bg-zinc-100' : 'p-1.5'} ${isHoliday ? 'bg-amber-50/30' : ''} ${
                sobre && aceita ? 'bg-emerald-100/70 ring-2 ring-emerald-500 ring-inset' :
                sobre && motivo ? 'bg-red-100/60 ring-2 ring-red-400 ring-inset' :
                aceita ? 'bg-emerald-50/60 ring-1 ring-emerald-300 ring-inset' :
                motivo ? 'bg-red-50/50' : ''
              }`}
            >
              {isHoliday ? (
                <div className="py-1 text-center text-amber-700 text-[10px] flex items-center justify-center gap-1" title={day.holiday?.name}>
                  <AlertCircle size={11} className="text-amber-500" /> Feriado
                </div>
              ) : estreito ? (
                <div className="text-center font-mono text-[11px] text-zinc-600">{cellItems.length ? kgDe(cellItems).toLocaleString('pt-BR') : '·'}</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {groupCellItems(cellItems).map(batch => <CartaoOrdem key={batch.key} batch={batch} {...cartao} />)}
                  {mostrarMotivo && <p className="text-[10px] leading-tight text-red-700">{motivo}</p>}
                  {cellItems.length === 0 && podeEditar && !motivo && (
                    <button
                      onClick={() => handleOpenScheduleModal(null, day.dateStr, reator.id)}
                      className="w-full h-7 flex items-center justify-center rounded-md text-zinc-300 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                      title="Agendar neste dia e reator"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>
              )}
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <div className={`hidden md:block flex-1 min-w-0 bg-white rounded-xl border border-zinc-200 shadow-xs overflow-hidden ${podeEditar ? '' : 'pointer-events-none'}`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-zinc-900 text-white border-b border-zinc-800">
              <th className="px-2 py-2 w-44 font-bold text-zinc-200 border-r border-zinc-800 text-[11px]">Reator</th>
              {weekDays.map(day => {
                const isToday = day.dateStr === hoje;
                const estreito = diaEstreito(day);
                return (
                  <th
                    key={day.dateStr}
                    onClick={estreito ? () => abrirDia(day) : undefined}
                    title={estreito ? 'Dia já passado: clique para abrir' : undefined}
                    className={`px-2 py-2 font-bold border-r border-zinc-800 ${estreito ? 'w-14 min-w-14 cursor-pointer hover:bg-zinc-800 text-zinc-400' : 'min-w-[150px]'} ${
                      day.holiday ? 'bg-amber-950/60 text-amber-200' : isToday ? 'bg-zinc-800 border-b-2 border-b-emerald-400 text-white' : 'text-zinc-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>{day.label} ({day.dayNumber})</span>
                      {day.holiday && !estreito && (
                        <span className="text-[10px] bg-amber-200/80 text-amber-950 px-1.5 rounded font-normal truncate" title={day.holiday.name}>Feriado</span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {comOrdens.map(renderLinha)}
            {semOrdens.length > 0 && (
              <>
                {semOrdensVisivel && semOrdens.map(renderLinha)}
                <tr>
                  <td colSpan={weekDays.length + 1} className="p-0">
                    <button
                      type="button"
                      onClick={() => setSemOrdensAberto(v => !v)}
                      className="w-full px-2 py-1.5 flex items-center gap-1.5 text-left text-[11px] text-zinc-500 hover:bg-zinc-50 cursor-pointer"
                    >
                      {semOrdensVisivel ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      <span>Sem ordens na semana: <span className="text-zinc-700">{semOrdens.map(r => getShortReatorName(r.id, undefined, reatores)).join(', ')}</span></span>
                    </button>
                  </td>
                </tr>
              </>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-zinc-50 border-t border-zinc-300 text-[11px] font-mono">
              <td className="px-2 py-1.5 border-r border-zinc-200 font-sans font-semibold text-zinc-700">
                Semana: {totalSemanaKg.toLocaleString('pt-BR')} kg · {totalSemanaOrdens} {totalSemanaOrdens === 1 ? 'ordem' : 'ordens'}
              </td>
              {weekDays.map(day => {
                const kg = kgDe(itensDoDia(day));
                const q = quentesDoDia(day);
                return (
                  <td key={day.dateStr} className="px-2 py-1.5 border-r border-zinc-200 text-zinc-700">
                    <div className="flex items-center justify-between gap-1">
                      <strong>{kg > 0 ? `${kg.toLocaleString('pt-BR')} kg` : '—'}</strong>
                      {q > 0 && !diaEstreito(day) && <span className="flex items-center gap-0.5 text-amber-700" title={`${q} processo(s) quente(s)`}><Flame size={11} />{q}</span>}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

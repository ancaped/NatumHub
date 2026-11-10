import React, { useMemo, useState } from 'react';
import { Search, Flame, Snowflake } from 'lucide-react';
import { SeloCobertura, piorResultado, type ResultadoOrdem } from '../cobertura';
import { getShortReatorName } from '../../../lib/processoProduto';
import { groupCellItems, situacaoOrdem, type CellBatchGroup, type PlanejamentoItem, type ReatorConfig } from './lib/planejamentoSemanal';
import type { DiaSemana } from './tiposDrawers';

interface Props {
  weekDays: DiaSemana[];
  reatores: ReatorConfig[];
  matrixItemsMap: Record<string, PlanejamentoItem[]>;
  coberturaPorOrdem: Record<string, ResultadoOrdem>;
  podeEditar: boolean;
  abrirOrdem: (batch: CellBatchGroup) => void;
  setCoberturaAberta: (v: boolean) => void;
}

/** Visão em lista: uma linha por ordem/batelada da semana, com busca. Tocar na linha abre o painel da ordem. */
export function ListaSemana({ weekDays, reatores, matrixItemsMap, coberturaPorOrdem, podeEditar, abrirOrdem, setCoberturaAberta }: Props) {
  const [busca, setBusca] = useState('');
  const linhas = useMemo(() => {
    const out: { batch: CellBatchGroup; dia: DiaSemana; reator: ReatorConfig; nome: string }[] = [];
    for (const dia of weekDays) {
      for (const reator of reatores) {
        for (const batch of groupCellItems(matrixItemsMap[`${reator.id}_${dia.dateStr}`] || [])) {
          const nome = batch.isMulti ? batch.items.map(i => i.descricao || i.codigo_produto).join(' + ') : (batch.primaryItem.descricao || batch.primaryItem.codigo_produto);
          out.push({ batch, dia, reator, nome });
        }
      }
    }
    return out;
  }, [weekDays, reatores, matrixItemsMap]);

  const q = busca.trim().toLowerCase();
  const visiveis = q
    ? linhas.filter(l => `${l.nome} ${l.batch.items.map(i => i.codigo_produto).join(' ')} ${l.batch.loteErp ?? ''} ${getShortReatorName(l.reator.id, undefined, reatores)}`.toLowerCase().includes(q))
    : linhas;

  return (
    <div className={`w-full min-w-0 bg-white rounded-xl border border-zinc-200 shadow-xs overflow-hidden ${podeEditar ? '' : 'pointer-events-none'}`}>
      <div className="p-2.5 border-b border-zinc-200 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar produto, código, reator ou lote…"
            className="w-full min-h-11 md:min-h-9 pl-8 pr-2 rounded-lg border border-zinc-300 text-xs focus:outline-none focus:ring-2 focus:ring-zinc-300"
          />
        </div>
        <span className="text-[11px] text-zinc-500 font-mono shrink-0">{visiveis.length} {visiveis.length === 1 ? 'ordem' : 'ordens'}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-zinc-50 text-zinc-500 text-[11px] border-b border-zinc-200">
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Dia</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap max-md:hidden">Reator</th>
              <th className="px-3 py-2 font-semibold">Produto</th>
              <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">kg</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap max-md:hidden">Situação</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap max-md:hidden">Insumos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visiveis.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-zinc-400">{linhas.length === 0 ? 'Nenhuma ordem nesta semana.' : 'Nada encontrado.'}</td></tr>
            )}
            {visiveis.map(({ batch, dia, reator, nome }) => {
              const sit = situacaoOrdem(batch);
              return (
                <tr key={batch.key} onClick={() => abrirOrdem(batch)} className="hover:bg-zinc-50 cursor-pointer max-md:min-h-11">
                  <td className="px-3 py-2 whitespace-nowrap font-semibold text-zinc-800">{dia.label.slice(0, 3)} {dia.dayNumber}<div className="md:hidden text-[11px] font-normal text-zinc-500">{getShortReatorName(reator.id, undefined, reatores)}</div></td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-600 max-md:hidden">{getShortReatorName(reator.id, undefined, reatores)}</td>
                  <td className="px-3 py-2 md:min-w-[180px]">
                    <span className="flex items-center gap-1.5">
                      {batch.isQuente ? <Flame size={12} className="text-amber-500 shrink-0" /> : <Snowflake size={12} className="text-zinc-400 shrink-0" />}
                      <span className="font-medium text-zinc-900 line-clamp-2">{nome}</span>
                    </span>
                    <span className="md:hidden mt-1 flex flex-wrap items-center gap-1" onClick={e => e.stopPropagation()}>
                      <span className={`px-1.5 rounded border text-[11px] font-semibold ${sit.classe}`}>{sit.rotulo}</span>
                      <SeloCobertura resultado={piorResultado(batch.items.map(it => coberturaPorOrdem[it.id]))} onClick={() => setCoberturaAberta(true)} compacto />
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-zinc-900 whitespace-nowrap">{batch.totalKg.toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-2 whitespace-nowrap max-md:hidden"><span className={`px-1.5 rounded border text-[11px] font-semibold ${sit.classe}`}>{sit.rotulo}</span></td>
                  <td className="px-3 py-2 whitespace-nowrap max-md:hidden" onClick={e => e.stopPropagation()}>
                    <SeloCobertura resultado={piorResultado(batch.items.map(it => coberturaPorOrdem[it.id]))} onClick={() => setCoberturaAberta(true)} compacto />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import React from 'react';
import { Check } from 'lucide-react';
import Drawer from '../../../../geral/components/ui/Drawer';
import type { ReatorConfig, PlanejamentoItem } from '../PlanejamentoSemanalTab';
import type { HeuristicStats } from './tiposDrawers';

interface SugestaoDrawerProps {
  heuristicProposal: PlanejamentoItem[];
  heuristicStats: HeuristicStats;
  reatores: ReatorConfig[];
  setHeuristicModalOpen: (aberto: boolean) => void;
  handleApplyHeuristic: () => Promise<void>;
}

export function SugestaoDrawer({
  heuristicProposal,
  heuristicStats,
  reatores,
  setHeuristicModalOpen,
  handleApplyHeuristic,
}: SugestaoDrawerProps) {
  return (
    <Drawer isOpen onClose={() => setHeuristicModalOpen(false)} title="Proposta de Otimização Semanal (Heurística)" size="xl"
      footer={
        <>
          <button
            onClick={() => setHeuristicModalOpen(false)}
            className="px-3.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg border border-zinc-200 cursor-pointer"
          >
            Descartar
          </button>
          <button
            onClick={handleApplyHeuristic}
            className="px-4 py-1.5 text-xs font-semibold bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Check size={14} />
            <span>Aplicar no Quadro Semanal</span>
          </button>
        </>
      }
    >

        {/* Resumo da Otimização */}
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-blue-700 text-[11px] block">Bateladas</span>
            <strong className="text-blue-950 font-bold text-sm">{heuristicStats.totalBatches}</strong>
          </div>
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
            <span className="text-emerald-700 text-[11px] block">Massa Total</span>
            <strong className="text-emerald-950 font-bold text-sm">{heuristicStats.totalKg.toLocaleString('pt-BR')} kg</strong>
          </div>
          <div className="p-2.5 bg-orange-50 border border-orange-200 rounded-lg">
            <span className="text-orange-700 text-[11px] block">Dias de Caldeira</span>
            <strong className="text-orange-950 font-bold text-sm">{heuristicStats.caldeiraDays} dias</strong>
          </div>
          <div className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg">
            <span className="text-zinc-600 text-[11px] block">Bases Agrupadas</span>
            <strong className="text-zinc-900 font-mono font-bold text-sm">{heuristicStats.groupedBases}</strong>
          </div>
        </div>

        <p className="text-xs text-zinc-500">
          Parte da lista "Tudo p/ Produzir Hoje" do Gerenciamento, do mais urgente ao menos. Cada batelada vai para um reator compatível com capacidade suficiente (o produto é dividido se passar da maior capacidade); não há limite de ordens por dia no mesmo reator nem limite de envase.
        </p>

        {/* Tabela com a lista de bateladas sugeridas */}
        <div className="flex-1 overflow-y-auto border border-zinc-200 rounded-lg">
          <table className="w-full text-left text-xs divide-y divide-zinc-200">
            <thead className="bg-zinc-50 font-bold text-zinc-700 sticky top-0">
              <tr>
                <th className="p-2.5">Dia</th>
                <th className="p-2.5">Reator</th>
                <th className="p-2.5">Produto</th>
                <th className="p-2.5">Volume</th>
                <th className="p-2.5">Processo</th>
                <th className="p-2.5">Envase</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {heuristicProposal.map((item, idx) => {
                const r = reatores.find(x => x.id === item.reator_id);
                return (
                  <tr key={idx} className="hover:bg-zinc-50/60">
                    <td className="p-2.5 font-semibold text-zinc-800">
                      {item.data_planejada.split('-').slice(1).reverse().join('/')}
                    </td>
                    <td className="p-2.5 text-zinc-700 font-semibold">
                      {item.reator_id === 'BOMBONAS' && item.recipiente_detalhe ? item.recipiente_detalhe : (r ? r.nome : item.reator_id)}
                    </td>
                    <td className="p-2.5 font-bold text-zinc-900 truncate max-w-[200px]" title={item.descricao}>
                      {item.descricao}
                    </td>
                    <td className="p-2.5 font-mono text-zinc-800 font-bold">
                      {item.quantidade_planejada} kg
                    </td>
                    <td className="p-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        (item.observacoes || '').includes('Caldeira') 
                          ? 'bg-zinc-100 text-zinc-800 border border-zinc-200' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {(item.observacoes || '').includes('Caldeira') ? 'Caldeira' : 'A Frio'}
                      </span>
                    </td>
                    <td className="p-2.5">
                      <span className="px-1.5 py-0.5 bg-zinc-100 text-zinc-700 border border-zinc-200 rounded text-[10px] font-semibold">
                        {item.linha_envase}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
    </Drawer>
  );
}

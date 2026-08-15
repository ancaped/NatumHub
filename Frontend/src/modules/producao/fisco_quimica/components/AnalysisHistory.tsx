import React, { useState, useMemo } from 'react';
import {
  FiscoQuimicaAnalysis,
  FiscoQuimicaPattern,
  FiscoQuimicaAgent,
  Product,
  FiscoTemplateConfig
} from '../../../geral/lib/types';
import {
  Search,
  Printer,
  Trash2,
  Eye,
  CheckCircle,
  AlertTriangle,
  Activity,
  SlidersHorizontal,
  Info,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';
import { cn } from '../../../geral/lib/utils';
import { checkAnalysisCompliance, printFiscoReports } from '../lib/fiscoUtils';
import { FiscoReportTemplate } from './FiscoReportTemplate';
import Modal from '../../../geral/components/ui/Modal';

interface AnalysisHistoryProps {
  analyses: FiscoQuimicaAnalysis[];
  patterns: FiscoQuimicaPattern[];
  products: Product[];
  agents: FiscoQuimicaAgent[];
  config?: FiscoTemplateConfig;
  selectedIds: Set<string>;
  onToggleSelection: (id: string, isShift?: boolean, isCtrl?: boolean) => void;
  onSelectAll: (ids: string[]) => void;
  onClearSelection: () => void;
  onDeleteAnalysis: (id: string, batch: string) => void;
  onRefresh: () => void;
}

export function AnalysisHistory({
  analyses,
  patterns,
  products,
  agents,
  config,
  selectedIds,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  onDeleteAnalysis,
  onRefresh,
}: AnalysisHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'conforme' | 'ajustado' | 'fora'>('all');
  const [selectedForDetail, setSelectedForDetail] = useState<FiscoQuimicaAnalysis | null>(null);

  const normalizeCode = (code: string) => code.replace(/\./g, '').trim().toLowerCase();

  // Filtragem e busca
  const filteredAnalyses = useMemo(() => {
    let list = analyses;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const qNorm = q.replace(/\./g, '');
      list = list.filter((a) => {
        const codeNorm = a.productCode.toLowerCase().replace(/\./g, '');
        return (
          codeNorm.includes(qNorm) ||
          a.productName.toLowerCase().includes(q) ||
          a.batch.toLowerCase().includes(q) ||
          a.technician.toLowerCase().includes(q) ||
          (a.notes || '').toLowerCase().includes(q)
        );
      });
    }

    if (statusFilter !== 'all') {
      list = list.filter((a) => {
        const pat = patterns.find((p) => normalizeCode(p.productCode) === normalizeCode(a.productCode)) || null;
        const comp = checkAnalysisCompliance(a, pat);
        if (statusFilter === 'conforme') return comp.overallStatus === 'CONFORME';
        if (statusFilter === 'ajustado') return a.hasAdjustment;
        if (statusFilter === 'fora') return comp.overallStatus === 'FORA_PADRAO';
        return true;
      });
    }

    return list;
  }, [analyses, patterns, searchQuery, statusFilter]);

  // Impressão em lote dos selecionados
  const handlePrintBatch = () => {
    const selectedList = analyses.filter((a) => selectedIds.has(a.id));
    if (selectedList.length === 0) return;
    printFiscoReports(selectedList, patterns, products, agents, config);
  };

  // Impressão individual de uma linha
  const handlePrintSingle = (analysis: FiscoQuimicaAnalysis) => {
    printFiscoReports(analysis, patterns, products, agents, config);
  };

  // Toggle selecionar todos os visíveis
  const allVisibleSelected =
    filteredAnalyses.length > 0 && filteredAnalyses.every((a) => selectedIds.has(a.id));

  const handleToggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      onClearSelection();
    } else {
      onSelectAll(filteredAnalyses.map((a) => a.id));
    }
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto animate-in fade-in duration-200">
      
      {/* Barra de Ações e Filtros */}
      <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        
        {/* Campo de Busca */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por lote, produto, analista, observações..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-zinc-300 rounded-xl text-sm bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </div>

        {/* Filtros de Status */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              statusFilter === 'all'
                ? "bg-zinc-950 text-white shadow-sm"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            )}
          >
            Todos ({analyses.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('conforme')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              statusFilter === 'conforme'
                ? "bg-emerald-700 text-white shadow-sm"
                : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            )}
          >
            Conformes
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ajustado')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              statusFilter === 'ajustado'
                ? "bg-amber-700 text-white shadow-sm"
                : "bg-amber-50 text-amber-900 hover:bg-amber-100"
            )}
          >
            Com Ajuste
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('fora')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              statusFilter === 'fora'
                ? "bg-rose-700 text-white shadow-sm"
                : "bg-rose-50 text-rose-900 hover:bg-rose-100"
            )}
          >
            Fora de Padrão
          </button>
        </div>

        {/* Botão de Impressão em Lote se houver selecionados */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrintBatch}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl transition-all shadow cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Imprimir Selecionados ({selectedIds.size})
            </button>
            <button
              type="button"
              onClick={onClearSelection}
              className="px-3 py-2 border border-zinc-300 hover:bg-zinc-50 text-zinc-600 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Limpar
            </button>
          </div>
        )}
      </div>

      {/* Tabela de Histórico */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto min-h-[350px]">
          {filteredAnalyses.length === 0 ? (
            <div className="py-20 text-center text-zinc-400 text-sm">
              Nenhum laudo físico-químico localizado.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50/80 border-b border-zinc-200 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  <th className="px-4 py-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={handleToggleSelectAllVisible}
                      className="w-4 h-4 text-zinc-950 focus:ring-zinc-900 accent-zinc-950 rounded cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3">Lote / Data</th>
                  <th className="px-4 py-3">Produto Acabado</th>
                  <th className="px-4 py-3 text-center">pH (25°C)</th>
                  <th className="px-4 py-3 text-center">Viscosidade</th>
                  <th className="px-4 py-3 text-center">Densidade</th>
                  <th className="px-4 py-3 text-center">Envase Alvo</th>
                  <th className="px-4 py-3 text-center">Conformidade</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {filteredAnalyses.map((a) => {
                  const isSelected = selectedIds.has(a.id);
                  const pat = patterns.find((p) => normalizeCode(p.productCode) === normalizeCode(a.productCode)) || null;
                  const compliance = checkAnalysisCompliance(a, pat);
                  const agent = agents.find((ag) => ag.id === a.correctiveAgentId);

                  const dateStr = a.analysisDate.includes('-')
                    ? a.analysisDate.split('-').reverse().join('/')
                    : a.analysisDate;

                  return (
                    <tr
                      key={a.id}
                      className={cn(
                        "transition-colors hover:bg-zinc-50/70",
                        isSelected && "bg-zinc-100/60"
                      )}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => onToggleSelection(a.id, e.nativeEvent.shiftKey, e.nativeEvent.ctrlKey)}
                          className="w-4 h-4 text-zinc-950 focus:ring-zinc-900 accent-zinc-950 rounded cursor-pointer"
                        />
                      </td>

                      {/* Lote / Data */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-bold text-zinc-900 text-sm">{a.batch}</span>
                          <span className="text-[10px] text-zinc-400 font-medium">{dateStr}</span>
                        </div>
                      </td>

                      {/* Produto */}
                      <td className="px-4 py-3.5">
                        <div className="max-w-[240px]">
                          <span className="font-bold text-zinc-900 block truncate" title={a.productName}>
                            {a.productName}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400 font-medium">{a.productCode}</span>
                        </div>
                      </td>

                      {/* pH */}
                      <td className="px-4 py-3.5 text-center font-mono font-bold">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded",
                          compliance.phOk ? "text-zinc-900" : "bg-rose-100 text-rose-800"
                        )}>
                          {a.phMeasured.toFixed(2)}
                        </span>
                      </td>

                      {/* Viscosidade */}
                      <td className="px-4 py-3.5 text-center font-mono font-bold">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded",
                          compliance.viscOk ? "text-zinc-900" : "bg-rose-100 text-rose-800"
                        )}>
                          {a.viscosityMeasured.toLocaleString('pt-BR')}{' '}
                          <span className="text-[9px] font-normal text-zinc-400">cps</span>
                        </span>
                      </td>

                      {/* Densidade */}
                      <td className="px-4 py-3.5 text-center font-mono font-bold">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded",
                          compliance.densityOk ? "text-zinc-900" : "bg-rose-100 text-rose-800"
                        )}>
                          {a.densityMeasured.toFixed(3)}{' '}
                          <span className="text-[9px] font-normal text-zinc-400">g/mL</span>
                        </span>
                      </td>

                      {/* Envase Alvo */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-zinc-900 text-white rounded font-mono font-bold text-[11px]">
                          {a.envaseTargetWeight} {a.envaseTargetUnit}
                        </span>
                      </td>

                      {/* Conformidade */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {compliance.overallStatus === 'CONFORME' ? (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full font-bold text-[10px]">
                            Conforme
                          </span>
                        ) : a.hasAdjustment ? (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-full font-bold text-[10px]" title={agent ? `Ajustado com ${agent.name}` : 'Ajustado'}>
                            Ajustado
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-rose-50 text-rose-900 border border-rose-200 rounded-full font-bold text-[10px]">
                            Fora Padrão
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handlePrintSingle(a)}
                            className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                            title="Imprimir Laudo Oficial A4"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedForDetail(a)}
                            className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                            title="Ver Detalhes"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onDeleteAnalysis(a.id, a.batch)}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Excluir Registro"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal de Detalhes e Preview do Laudo */}
      <Modal
        isOpen={Boolean(selectedForDetail)}
        onClose={() => setSelectedForDetail(null)}
        title={selectedForDetail ? `Laudo Físico-Químico · Lote ${selectedForDetail.batch}` : ''}
        subtitle={selectedForDetail ? `Análise realizada por ${selectedForDetail.technician}` : ''}
        size="lg"
      >
        {selectedForDetail && (
          <div className="space-y-4">
            <div className="flex justify-end gap-2 border-b border-zinc-200 pb-3">
              <button
                type="button"
                onClick={() => handlePrintSingle(selectedForDetail)}
                className="flex items-center gap-1.5 px-4 py-2 bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Imprimir Laudo Oficial A4
              </button>
            </div>

            {/* Renderização do template dentro do modal com scroll suave */}
            <div className="bg-zinc-100 p-4 rounded-2xl max-h-[65vh] overflow-y-auto border border-zinc-200">
              <div className="shadow-md mx-auto">
                <FiscoReportTemplate
                  analysis={selectedForDetail}
                  pattern={patterns.find((p) => normalizeCode(p.productCode) === normalizeCode(selectedForDetail.productCode)) || null}
                  product={products.find((p) => normalizeCode(p.code) === normalizeCode(selectedForDetail.productCode))}
                  agent={agents.find((ag) => ag.id === selectedForDetail.correctiveAgentId) || null}
                  config={config}
                />
              </div>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}

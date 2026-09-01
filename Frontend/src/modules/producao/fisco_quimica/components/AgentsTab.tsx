import React, { useState, useMemo } from 'react';
import { api } from '../../../geral/lib/api';
import { FiscoQuimicaAgent, Item, FiscoQuimicaAnalysis } from '../../../geral/lib/types';
import {
  Plus,
  Trash2,
  Search,
  Layers,
  Sparkles,
  CheckCircle2,
  FlaskConical,
  Activity,
  History,
  Tag
} from 'lucide-react';
import { cn } from '../../../geral/lib/utils';

interface AgentsTabProps {
  agents: FiscoQuimicaAgent[];
  items: Item[];
  analyses: FiscoQuimicaAnalysis[];
  onRefresh: () => void;
}

export function AgentsTab({ agents, items, analyses, onRefresh }: AgentsTabProps) {
  const [itemCodeInput, setItemCodeInput] = useState('');
  const [categoryInput, setCategoryInput] = useState<'VISCOSIDADE' | 'PH' | 'OUTROS'>('VISCOSIDADE');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<'ALL' | 'VISCOSIDADE' | 'PH' | 'OUTROS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'catalog' | 'history'>('catalog');
  const [saving, setSaving] = useState(false);

  const normalizeCode = (code: string) => code.replace(/\./g, '').trim().toLowerCase();

  const activeItem = useMemo(() => {
    if (!itemCodeInput) return null;
    const norm = normalizeCode(itemCodeInput);
    return items.find((i) => normalizeCode(i.code) === norm) || null;
  }, [itemCodeInput, items]);

  const filteredAgents = useMemo(() => {
    return agents.filter((a) => {
      const matchCat =
        selectedCategoryFilter === 'ALL' ||
        (a.category || 'VISCOSIDADE').toUpperCase() === selectedCategoryFilter;

      if (!matchCat) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        (a.category || '').toLowerCase().includes(q)
      );
    });
  }, [agents, selectedCategoryFilter, searchQuery]);

  // Histórico de uso de agentes nas análises físico-químicas
  const usageHistory = useMemo(() => {
    const list: {
      analysisId: string;
      batch: string;
      productCode: string;
      productName: string;
      agentId: string;
      agentName: string;
      category: string;
      analysisDate: string;
      technician: string;
      initialViscosity?: number | null;
      trialViscosity?: number | null;
      agentQtyPerLiter?: number | null;
      batchSize?: number | null;
      totalAgentRequired?: number | null;
      notes?: string | null;
    }[] = [];

    for (const a of analyses) {
      if (a.hasAdjustment) {
        let agName = 'Agente Corretivo';
        let agCat = 'VISCOSIDADE';
        let agId = a.correctiveAgentId || '';

        if (agId) {
          const matchedAg = agents.find((ag) => ag.id === agId);
          if (matchedAg) {
            agName = matchedAg.name;
            agCat = matchedAg.category || 'VISCOSIDADE';
          }
        }

        if (a.notes && a.notes.includes('[Ajuste de pH:')) {
          agCat = 'PH';
        }

        list.push({
          analysisId: a.id,
          batch: a.batch,
          productCode: a.productCode,
          productName: a.productName,
          agentId: agId || 'Ajuste',
          agentName: agName,
          category: agCat,
          analysisDate: a.analysisDate,
          technician: a.technician,
          initialViscosity: a.initialViscosity,
          trialViscosity: a.trialViscosity,
          agentQtyPerLiter: a.agentQtyPerLiter,
          batchSize: a.batchSize,
          totalAgentRequired: a.totalAgentRequired,
          notes: a.notes,
        });
      }
    }

    if (!historySearch.trim()) return list;
    const q = historySearch.toLowerCase().trim();
    return list.filter(
      (h) =>
        h.batch.toLowerCase().includes(q) ||
        h.productName.toLowerCase().includes(q) ||
        h.agentName.toLowerCase().includes(q) ||
        h.agentId.toLowerCase().includes(q)
    );
  }, [analyses, agents, historySearch]);

  const handleLinkAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) {
      alert('Selecione uma matéria-prima válida.');
      return;
    }

    if (agents.some((a) => a.id === activeItem.code)) {
      alert('Esta matéria-prima já está vinculada como agente corretivo.');
      return;
    }

    setSaving(true);
    try {
      await api.saveFiscoQuimicaAgent({
        id: activeItem.code,
        name: activeItem.description,
        category: categoryInput,
      });
      setItemCodeInput('');
      onRefresh();
    } catch (err) {
      console.error(err);
      alert('Erro ao vincular matéria-prima.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAgent = async (id: string, name: string) => {
    if (!confirm(`Remover agente corretivo "${name}"?`)) return;
    try {
      await api.deleteFiscoQuimicaAgent(id);
      onRefresh();
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir agente corretivo.');
    }
  };

  return (
    <div className="view-container animate-in fade-in duration-200">
      
      {/* Barra de Sub-Navegação & Cabeçalho */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-200 pb-4">
        <div>
          <h2 className="text-xl font-black text-zinc-900 flex items-center gap-2">
            <Layers className="w-6 h-6 text-zinc-800" />
            Agentes Corretivos de Produção
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Gestão de matérias-primas categorizadas para correção de pH e viscosidade, e histórico de aplicações.
          </p>
        </div>

        <div className="flex items-center bg-zinc-100 p-1 rounded-xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('catalog')}
            className={cn(
              "flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
              activeSubTab === 'catalog'
                ? "bg-white text-zinc-950 shadow-xs"
                : "text-zinc-500 hover:text-zinc-900"
            )}
          >
            <Tag className="w-3.5 h-3.5" /> Catálogo de Agentes ({agents.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('history')}
            className={cn(
              "flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
              activeSubTab === 'history'
                ? "bg-white text-zinc-950 shadow-xs"
                : "text-zinc-500 hover:text-zinc-900"
            )}
          >
            <History className="w-3.5 h-3.5" /> Histórico de Aplicações ({usageHistory.length})
          </button>
        </div>
      </div>

      {activeSubTab === 'catalog' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Painel de Cadastro e Vínculo */}
          <div className="bg-white rounded-2xl p-6 border border-zinc-200 shadow-sm space-y-4 h-fit">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Vincular Matéria-Prima
            </h3>

            <form onSubmit={handleLinkAgent} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                  Matéria-Prima (Código ou Nome) *
                </label>
                <input
                  type="text"
                  list="raw-material-items-list"
                  value={itemCodeInput}
                  onChange={(e) => setItemCodeInput(e.target.value)}
                  required
                  placeholder="Ex: 9.15.025..."
                  className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-mono font-bold bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
                <datalist id="raw-material-items-list">
                  {items.map((i) => (
                    <option key={i.code} value={i.code}>
                      {i.code.replace(/\./g, '')} — {i.description} ({i.unit})
                    </option>
                  ))}
                </datalist>

                {activeItem ? (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="truncate">
                      <span className="font-bold">{activeItem.description}</span>
                      <span className="block text-[10px] text-emerald-700 font-mono">Unidade: {activeItem.unit}</span>
                    </div>
                  </div>
                ) : itemCodeInput ? (
                  <span className="text-[10px] text-zinc-400">Pressione a opção da lista ou digite o código completo</span>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                  Categoria da Correção *
                </label>
                <select
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value as any)}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                >
                  <option value="VISCOSIDADE">Correção de Viscosidade (Espessante / Sal)</option>
                  <option value="PH">Correção de pH (Ácido / Base)</option>
                  <option value="OUTROS">Outros Corretivos (Cor / Odor / Aditivo)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={saving || !activeItem}
                className="w-full bg-zinc-950 hover:bg-zinc-800 disabled:opacity-50 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow cursor-pointer flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {saving ? 'Vinculando...' : 'Vincular Agente Corretivo'}
              </button>
            </form>
          </div>

          {/* Lista de Agentes Cadastrados */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 space-y-4 md:col-span-2">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
              
              {/* Filtros por categoria */}
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryFilter('ALL')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    selectedCategoryFilter === 'ALL'
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  )}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCategoryFilter('VISCOSIDADE')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    selectedCategoryFilter === 'VISCOSIDADE'
                      ? "bg-blue-600 text-white"
                      : "bg-blue-50 text-blue-800 hover:bg-blue-100"
                  )}
                >
                  Viscosidade
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCategoryFilter('PH')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    selectedCategoryFilter === 'PH'
                      ? "bg-purple-600 text-white"
                      : "bg-purple-50 text-purple-800 hover:bg-purple-100"
                  )}
                >
                  pH
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCategoryFilter('OUTROS')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    selectedCategoryFilter === 'OUTROS'
                      ? "bg-zinc-700 text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  )}
                >
                  Outros
                </button>
              </div>

              <div className="relative w-full sm:w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Buscar agente..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 border border-zinc-200 rounded-xl text-xs bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>
            </div>

            {filteredAgents.length === 0 ? (
              <div className="text-center py-12 text-zinc-400 text-xs">
                Nenhum agente corretivo encontrado.
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 max-h-[500px] overflow-y-auto">
                {filteredAgents.map((ag) => {
                  const cat = (ag.category || 'VISCOSIDADE').toUpperCase();
                  const badgeColor =
                    cat === 'PH'
                      ? 'bg-purple-50 text-purple-800 border-purple-200'
                      : cat === 'OUTROS'
                      ? 'bg-zinc-100 text-zinc-700 border-zinc-300'
                      : 'bg-blue-50 text-blue-800 border-blue-200';

                  return (
                    <div
                      key={ag.id}
                      className="py-3 px-2 flex items-center justify-between hover:bg-zinc-50 rounded-xl transition-colors group"
                    >
                      <div className="space-y-1 pr-4 truncate">
                        <div className="flex items-center gap-2">
                          <strong className="text-sm text-zinc-900 block truncate">{ag.name}</strong>
                          <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold border shrink-0", badgeColor)}>
                            {cat === 'PH' ? 'Correção de pH' : cat === 'OUTROS' ? 'Outros' : 'Viscosidade'}
                          </span>
                        </div>
                        <span className="font-mono text-xs text-zinc-500 font-bold block">
                          Cód. MP: {ag.id}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteAgent(ag.id, ag.name)}
                        className="p-2 text-zinc-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors opacity-80 group-hover:opacity-100 cursor-pointer"
                        title="Excluir vínculo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {activeSubTab === 'history' && (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <History className="w-4 h-4 text-zinc-500" /> Histórico de Aplicações de Agentes Corretivos
            </h3>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar por lote, produto ou agente..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-zinc-200 rounded-xl text-xs bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
          </div>

          {usageHistory.length === 0 ? (
            <div className="text-center py-12 text-zinc-400 text-xs">
              Nenhuma aplicação de agente corretivo registrada no histórico.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/50 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Data / Lote</th>
                    <th className="py-2.5 px-3">Produto</th>
                    <th className="py-2.5 px-3">Agente Corretivo</th>
                    <th className="py-2.5 px-3 text-center">Categoria</th>
                    <th className="py-2.5 px-3 text-right">Dose / L</th>
                    <th className="py-2.5 px-3 text-right">Total Tanque</th>
                    <th className="py-2.5 px-3 text-right">Analista</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {usageHistory.map((h) => (
                    <tr key={h.analysisId} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="py-3 px-3">
                        <strong className="text-zinc-900 block">Lote {h.batch}</strong>
                        <span className="text-[10px] text-zinc-400 font-mono">{h.analysisDate}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-bold text-zinc-800 block truncate max-w-xs">{h.productName}</span>
                        <span className="text-[10px] font-mono text-zinc-400">{h.productCode}</span>
                      </td>
                      <td className="py-3 px-3">
                        <strong className="text-zinc-900 block">{h.agentName}</strong>
                        {h.agentId && <span className="text-[10px] font-mono text-zinc-400">Cód: {h.agentId}</span>}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] font-bold border",
                          h.category === 'PH'
                            ? "bg-purple-50 text-purple-800 border-purple-200"
                            : "bg-blue-50 text-blue-800 border-blue-200"
                        )}>
                          {h.category === 'PH' ? 'pH' : 'Viscosidade'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-zinc-700">
                        {h.agentQtyPerLiter ? `${h.agentQtyPerLiter} g/L` : '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-amber-900">
                        {h.totalAgentRequired ? `${(h.totalAgentRequired / 1000).toFixed(3)} kg` : '—'}
                      </td>
                      <td className="py-3 px-3 text-right text-zinc-500 font-medium">
                        {h.technician}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}

    </div>
  );
}

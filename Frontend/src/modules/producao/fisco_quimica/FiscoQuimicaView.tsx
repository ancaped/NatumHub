/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { api } from '../../geral/lib/api';
import { apiFetch } from '../../geral/lib/http';
import { getAuthUser } from '../../geral/lib/auth';
import {
  FiscoQuimicaPattern,
  FiscoQuimicaAgent,
  FiscoQuimicaAnalysis,
  Product,
  Item,
  FiscoAppConfig
} from '../../geral/lib/types';
import {
  FlaskConical,
  Activity,
  Calendar as CalendarIcon,
  SlidersHorizontal,
  Layers,
  Settings,
  Database,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AppLayout from '../../geral/components/layout/AppLayout';
import Modal from '../../geral/components/ui/Modal';
import { DEFAULT_FISCO_TEMPLATE } from './lib/fiscoUtils';

// Subcomponentes modulares
import { AnalysisCreationFlow } from './components/AnalysisCreationFlow';
import { CalendarTab } from './components/CalendarTab';
import { AnalysisHistory } from './components/AnalysisHistory';
import { CorrectiveBatchesTab } from './components/CorrectiveBatchesTab';
import { PatternsTab } from './components/PatternsTab';
import { AgentsTab } from './components/AgentsTab';
import { SettingsTab } from './components/SettingsTab';
import { ErpLotesTab } from './components/ErpLotesTab';

interface FiscoQuimicaViewProps {
  onBackToHub: () => void;
}

export default function FiscoQuimicaView({ onBackToHub }: FiscoQuimicaViewProps) {
  const [activeTab, setActiveTab] = useState<'new' | 'calendar' | 'history' | 'erp_lotes' | 'correctives' | 'patterns' | 'agents' | 'settings'>('new');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [selectedLoteForNew, setSelectedLoteForNew] = useState<{ productCode?: string; batch?: string } | null>(null);

  // Dados centrais
  const [products, setProducts] = useState<Product[]>([]);
  const [patterns, setPatterns] = useState<FiscoQuimicaPattern[]>([]);
  const [agents, setAgents] = useState<FiscoQuimicaAgent[]>([]);
  const [analyses, setAnalyses] = useState<FiscoQuimicaAnalysis[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [config, setConfig] = useState<FiscoAppConfig | null>(null);
  const [editingAnalysis, setEditingAnalysis] = useState<FiscoQuimicaAnalysis | null>(null);

  // Seleção no histórico para impressão
  const [selectedReportIds, setSelectedReportIds] = useState<Set<string>>(new Set());

  // Analista padrão
  const [technicianName, setTechnicianName] = useState(() => {
    return localStorage.getItem('natum_hub_fq_technician') || '';
  });

  const handleTechnicianChange = (val: string) => {
    setTechnicianName(val);
    try {
      localStorage.setItem('natum_hub_fq_technician', val);
    } catch (_) {}
  };

  // Modal de cadastro rápido de padrão a partir do fluxo de análise
  const [quickAddPatternProd, setQuickAddPatternProd] = useState<{ code: string; name: string } | null>(null);
  const [quickPatPhMin, setQuickPatPhMin] = useState('5.50');
  const [quickPatPhMax, setQuickPatPhMax] = useState('7.00');
  const [quickPatViscMin, setQuickPatViscMin] = useState('8000');
  const [quickPatViscMax, setQuickPatViscMax] = useState('12000');
  const [quickPatDensityTarget, setQuickPatDensityTarget] = useState('1.000');
  const [quickPatDensityTol, setQuickPatDensityTol] = useState('0.020');
  const [quickPatVol, setQuickPatVol] = useState('1000');
  const [quickPatUnit, setQuickPatUnit] = useState<'mL' | 'L' | 'g' | 'kg'>('mL');
  const [quickPatAllowedAgents, setQuickPatAllowedAgents] = useState<string[]>([]);
  const [quickSaving, setQuickSaving] = useState(false);

  // Rótulos de página
  useEffect(() => {
    const tabLabels: Record<string, string> = {
      new: 'Registrar Físico-Química',
      calendar: 'Calendário de Produção',
      history: 'Histórico de Laudos',
      erp_lotes: 'Lotes e Laudos ERP',
      correctives: 'Baixas de Corretivos',
      patterns: 'Padrões por Produto',
      agents: 'Agentes Corretivos',
      settings: 'Configurações'
    };
    (window as any).__current_page__ = tabLabels[activeTab] || activeTab;
  }, [activeTab]);

  useEffect(() => {
    const u = getAuthUser();
    setUser(u);
    if (!technicianName && u?.displayName) {
      handleTechnicianChange(u.displayName);
    }
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [prodsRes, pats, ags, anals, allItems, conf] = await Promise.all([
        apiFetch('/products?limit=5000'),
        api.getFiscoQuimicaPatterns().catch(() => []),
        api.getFiscoQuimicaAgents().catch(() => []),
        api.getFiscoQuimicaAnalyses().catch(() => []),
        api.getItems().catch(() => []),
        api.getFiscoConfig().catch(() => null)
      ]);

      let catalogProducts: Product[] = [];
      try {
        const fiscoProdsRes = await apiFetch('/api/hub/fisco/products');
        if (fiscoProdsRes.ok) {
          const list = await fiscoProdsRes.json();
          catalogProducts = (list || []).map((p: { codigo: string; descricao?: string }) => ({
            code: p.codigo,
            name: p.descricao || p.codigo,
            packaging: 'Pote',
            validity: '3 anos',
          }));
        }
      } catch (_) {}

      if (!catalogProducts.length && prodsRes.ok) {
        const data = await prodsRes.json();
        catalogProducts = (data.items || []).map((p: { codigo: string; descricao?: string }) => ({
          code: p.codigo,
          name: p.descricao || p.codigo,
          packaging: 'Pote',
          validity: '3 anos',
        }));
      }

      setProducts(catalogProducts);
      setPatterns(pats || []);
      setAgents(ags || []);
      setAnalyses(anals || []);
      setItems(allItems || []);

      if (conf) {
        setConfig(conf);
        if (!technicianName && conf.template?.defaultTechnician) {
          handleTechnicianChange(conf.template.defaultTechnician);
        }
      } else {
        const initialCfg: FiscoAppConfig = {
          template: DEFAULT_FISCO_TEMPLATE,
        };
        await api.saveFiscoConfig(initialCfg);
        setConfig(initialCfg);
      }
    } catch (err) {
      console.error('Falha ao carregar dados do Físico-Químico:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Seleção múltipla para histórico
  const toggleReportSelection = (id: string, isShift: boolean = false, isCtrl: boolean = false) => {
    const next = new Set(selectedReportIds);
    if (isCtrl) {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    } else if (isShift && analyses.length > 0) {
      const lastId = Array.from(selectedReportIds).pop();
      if (lastId) {
        const lastIdx = analyses.findIndex((r) => r.id === lastId);
        const currentIdx = analyses.findIndex((r) => r.id === id);
        if (lastIdx !== -1 && currentIdx !== -1) {
          const start = Math.min(lastIdx, currentIdx);
          const end = Math.max(lastIdx, currentIdx);
          for (let i = start; i <= end; i++) {
            next.add(analyses[i].id);
          }
        }
      } else {
        next.add(id);
      }
    } else {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
    setSelectedReportIds(next);
  };

  const handleSelectAll = (ids: string[]) => {
    const next = new Set(selectedReportIds);
    ids.forEach((id) => next.add(id));
    setSelectedReportIds(next);
  };

  const handleClearSelection = () => {
    setSelectedReportIds(new Set());
  };

  const handleDeleteAnalysis = async (id: string, batch: string) => {
    if (!confirm(`Excluir permanentemente o laudo físico-químico do lote ${batch}?`)) return;
    try {
      await api.deleteFiscoQuimicaAnalysis(id);
      setSelectedReportIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir laudo.');
    }
  };

  const handleOpenAddPatternQuick = (productCode: string, productName: string) => {
    setQuickAddPatternProd({ code: productCode, name: productName });
    setQuickPatPhMin('5.50');
    setQuickPatPhMax('7.00');
    setQuickPatViscMin('8000');
    setQuickPatViscMax('12000');
    setQuickPatDensityTarget('1.000');
    setQuickPatDensityTol('0.020');

    const match = productName.match(/(\d+(?:[.,]\d+)?)\s*(ML|L|G|KG)\b/i);
    if (match) {
      setQuickPatVol(match[1].replace(',', '.'));
      const u = match[2].toUpperCase();
      if (u === 'ML') setQuickPatUnit('mL');
      else if (u === 'L') setQuickPatUnit('L');
      else if (u === 'G') setQuickPatUnit('g');
      else if (u === 'KG') setQuickPatUnit('kg');
    } else {
      setQuickPatVol('1000');
      setQuickPatUnit('mL');
    }

    setQuickPatAllowedAgents([]);
  };

  const handleSaveQuickPattern = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddPatternProd) return;

    const phMin = parseFloat(quickPatPhMin.toString().replace(',', '.'));
    const phMax = parseFloat(quickPatPhMax.toString().replace(',', '.'));
    const viscMin = parseFloat(quickPatViscMin.toString().replace(',', '.'));
    const viscMax = parseFloat(quickPatViscMax.toString().replace(',', '.'));
    const densTarget = parseFloat(quickPatDensityTarget.toString().replace(',', '.'));
    const densTol = parseFloat(quickPatDensityTol.toString().replace(',', '.'));
    const vol = parseFloat(quickPatVol.toString().replace(',', '.'));

    if (
      isNaN(phMin) || isNaN(phMax) ||
      isNaN(viscMin) || isNaN(viscMax) ||
      isNaN(densTarget) || isNaN(densTol) ||
      isNaN(vol)
    ) {
      alert('Preencha os valores numéricos corretamente.');
      return;
    }

    setQuickSaving(true);
    try {
      await api.saveFiscoQuimicaPattern({
        productCode: quickAddPatternProd.code,
        phMin,
        phMax,
        viscosityMin: viscMin,
        viscosityMax: viscMax,
        densityTarget: densTarget,
        densityTolerance: densTol,
        packageVolume: vol,
        packageUnit: quickPatUnit,
        allowedAgents: quickPatAllowedAgents,
      });
      setQuickAddPatternProd(null);
      await fetchData();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar especificações.');
    } finally {
      setQuickSaving(false);
    }
  };

  if (loading && !products.length && !analyses.length) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-800" />
      </div>
    );
  }

  const sidebarItems = [
    { id: 'new', label: 'Registrar Análise', icon: FlaskConical },
    { id: 'calendar', label: 'Calendário', icon: CalendarIcon },
    { id: 'history', label: 'Histórico de Laudos', icon: Activity },
    { id: 'erp_lotes', label: 'Lotes e Laudos ERP', icon: Database },
    { id: 'correctives', label: 'Baixas de Corretivos', icon: SlidersHorizontal },
    { id: 'patterns', label: 'Padrões por Produto', icon: Layers },
    { id: 'agents', label: 'Agentes Corretivos', icon: SlidersHorizontal },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  const headerActions = (
    <div className="flex items-center gap-4 shrink-0">
      <div className="flex flex-col items-end">
        <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">Laudos Registrados</span>
        <span className="text-xs font-black text-zinc-900">{analyses.length}</span>
      </div>
    </div>
  );

  return (
    <AppLayout
      moduleTitle="Controle Físico-Químico"
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={activeTab}
      onTabChange={(id: any) => setActiveTab(id)}
      headerActions={headerActions}
    >
      <AnimatePresence mode="wait">
        {activeTab === 'new' && (
          <motion.div key="new" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <AnalysisCreationFlow
              products={products}
              patterns={patterns}
              agents={agents}
              analyses={analyses}
              technicianName={technicianName}
              setTechnicianName={handleTechnicianChange}
              config={config?.template}
              initialBatch={selectedLoteForNew?.batch}
              initialProductCode={selectedLoteForNew?.productCode}
              editingAnalysis={editingAnalysis}
              onCancelEdit={() => setEditingAnalysis(null)}
              onSaved={() => {
                setEditingAnalysis(null);
                fetchData();
                setActiveTab('history');
              }}
              onOpenAddPattern={handleOpenAddPatternQuick}
            />
          </motion.div>
        )}

        {activeTab === 'calendar' && (
          <motion.div key="calendar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <CalendarTab
              analyses={analyses}
              patterns={patterns}
              products={products}
              agents={agents}
              config={config?.template}
            />
          </motion.div>
        )}

        {activeTab === 'history' && (
          <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <AnalysisHistory
              analyses={analyses}
              patterns={patterns}
              products={products}
              agents={agents}
              config={config?.template}
              selectedIds={selectedReportIds}
              onToggleSelection={toggleReportSelection}
              onSelectAll={handleSelectAll}
              onClearSelection={handleClearSelection}
              onDeleteAnalysis={handleDeleteAnalysis}
              onRefresh={fetchData}
              onEditAnalysis={(a) => {
                setEditingAnalysis(a);
                setActiveTab('new');
              }}
            />
          </motion.div>
        )}

        {activeTab === 'erp_lotes' && (
          <motion.div key="erp_lotes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <ErpLotesTab
              onStartAnalysisWithLote={(code, batch) => {
                setSelectedLoteForNew({ productCode: code, batch });
                setActiveTab('new');
              }}
              patterns={patterns}
              products={products}
            />
          </motion.div>
        )}

        {activeTab === 'correctives' && (
          <motion.div key="correctives" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <CorrectiveBatchesTab
              agents={agents}
              onRefreshHistory={fetchData}
            />
          </motion.div>
        )}

        {activeTab === 'patterns' && (
          <motion.div key="patterns" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <PatternsTab
              products={products}
              patterns={patterns}
              agents={agents}
              onRefresh={fetchData}
            />
          </motion.div>
        )}

        {activeTab === 'agents' && (
          <motion.div key="agents" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <AgentsTab
              agents={agents}
              items={items}
              analyses={analyses}
              onRefresh={fetchData}
            />
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <SettingsTab
              config={config}
              onRefresh={fetchData}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de cadastro rápido de padrão disparado pela aba 'new' */}
      <Modal
        isOpen={Boolean(quickAddPatternProd)}
        onClose={() => setQuickAddPatternProd(null)}
        title="Cadastrar Especificações do Produto"
        subtitle="Defina os limites aceitáveis para pH, viscosidade e densidade"
        size="md"
      >
        {quickAddPatternProd && (
          <form onSubmit={handleSaveQuickPattern} className="space-y-4">
            <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-200 space-y-1">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Produto</span>
              <strong className="text-sm text-zinc-900 block truncate">{quickAddPatternProd.name}</strong>
              <span className="font-mono text-xs text-zinc-500 font-bold block">{quickAddPatternProd.code}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">pH Mínimo *</label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={quickPatPhMin}
                  onChange={(e) => setQuickPatPhMin(e.target.value.replace(',', '.'))}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">pH Máximo *</label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={quickPatPhMax}
                  onChange={(e) => setQuickPatPhMax(e.target.value.replace(',', '.'))}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">Viscosidade Mín. (cps) *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={quickPatViscMin}
                  onChange={(e) => setQuickPatViscMin(e.target.value.replace(',', '.'))}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">Viscosidade Máx. (cps) *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={quickPatViscMax}
                  onChange={(e) => setQuickPatViscMax(e.target.value.replace(',', '.'))}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">Densidade Alvo (g/mL) *</label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={quickPatDensityTarget}
                  onChange={(e) => setQuickPatDensityTarget(e.target.value.replace(',', '.'))}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">Tolerância (± g/mL) *</label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={quickPatDensityTol}
                  onChange={(e) => setQuickPatDensityTol(e.target.value.replace(',', '.'))}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">Capacidade Embalagem *</label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={quickPatVol}
                  onChange={(e) => setQuickPatVol(e.target.value.replace(',', '.'))}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">Unidade da Embalagem *</label>
                <select
                  value={quickPatUnit}
                  onChange={(e) => setQuickPatUnit(e.target.value as any)}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                >
                  <option value="mL">mL</option>
                  <option value="L">L</option>
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setQuickAddPatternProd(null)}
                className="px-4 py-2 border border-zinc-300 text-zinc-600 text-xs font-bold rounded-xl hover:bg-zinc-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={quickSaving}
                className="px-5 py-2 bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition-all"
              >
                {quickSaving ? 'Salvando...' : 'Gravar Especificações'}
              </button>
            </div>
          </form>
        )}
      </Modal>

    </AppLayout>
  );
}

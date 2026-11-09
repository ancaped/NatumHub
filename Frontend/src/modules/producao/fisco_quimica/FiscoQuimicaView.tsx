/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
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
import { useMotivoExclusao } from '../lib/useMotivoExclusao';

interface FiscoQuimicaViewProps {
  onBackToHub: () => void;
}

/** A tela abre só com os laudos dos últimos dias; o resto vem do servidor sob demanda (busca, calendário, "carregar anteriores"). */
const DIAS_CARREGADOS = 120;

function isoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function somaDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDia(new Date(y, m - 1, d + dias));
}

/** Data da análise como AAAA-MM-DD (aceita DD/MM/AAAA); '' quando não dá para entender. */
function dataIsoDaAnalise(s?: string | null): string {
  const t = String(s || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function ordenarAnalises(a: FiscoQuimicaAnalysis, b: FiscoQuimicaAnalysis): number {
  return (b.analysisDate || '').localeCompare(a.analysisDate || '') || (b.createdAt || '').localeCompare(a.createdAt || '');
}

export default function FiscoQuimicaView({ onBackToHub }: FiscoQuimicaViewProps) {
  const { pedirMotivo, elemento: motivoElemento } = useMotivoExclusao();
  const [activeTab, setActiveTab] = useState<'new' | 'calendar' | 'history' | 'erp_lotes' | 'correctives' | 'patterns' | 'settings'>('new');
  const [correctiveSection, setCorrectiveSection] = useState<'baixas' | 'catalogo'>('baixas');
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
  const desdeInicial = useRef(somaDias(isoDia(new Date()), -DIAS_CARREGADOS)).current;
  // Laudos de antes dessa data já foram pedidos ao servidor (por "carregar anteriores").
  const [desdeCarregado, setDesdeCarregado] = useState(desdeInicial);
  const desdeCarregadoRef = useRef(desdeInicial);
  const mesesBuscados = useRef(new Set<string>());
  const [erroAnalises, setErroAnalises] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Insere/substitui por id, na ordem do histórico (data da análise, depois criação).
  const mesclarAnalises = (novas: FiscoQuimicaAnalysis[]) =>
    setAnalyses((prev) => {
      const porId = new Map(prev.map((a) => [a.id, a] as const));
      for (const a of novas) porId.set(a.id, a);
      return Array.from(porId.values()).sort(ordenarAnalises);
    });

  const buscarNoServidor = async (params: { busca?: string; desde?: string; ate?: string }): Promise<number> => {
    const lista = await api.getFiscoQuimicaAnalyses({ limite: 5000, ...params });
    mesclarAnalises(lista);
    return lista.length;
  };

  const carregarMaisAntigos = async () => {
    const fim = somaDias(desdeCarregadoRef.current, -1);
    const ini = somaDias(fim, -364);
    await buscarNoServidor({ desde: ini, ate: fim });
    desdeCarregadoRef.current = ini;
    setDesdeCarregado(ini);
  };

  // Calendário: ao abrir um mês anterior ao carregado, busca aquele mês.
  const garantirMes = (ano: number, mes0: number) => {
    const ini = `${ano}-${String(mes0 + 1).padStart(2, '0')}-01`;
    if (ini >= desdeCarregadoRef.current) return;
    const chave = ini.slice(0, 7);
    if (mesesBuscados.current.has(chave)) return;
    mesesBuscados.current.add(chave);
    buscarNoServidor({ desde: ini, ate: isoDia(new Date(ano, mes0 + 1, 0)) }).catch(() => {
      mesesBuscados.current.delete(chave);
    });
  };

  // Editar um laudo só vale enquanto a tela de registro está aberta: ao sair, o laudo em edição é solto
  // (senão o próximo laudo "novo" reaproveitaria o id dele e o sobrescreveria).
  useEffect(() => {
    if (activeTab !== 'new') setEditingAnalysis(null);
  }, [activeTab]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

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
      correctives: 'Corretivos',
      patterns: 'Padrões por Produto',
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
        api.getFiscoQuimicaAnalyses({ desde: desdeInicial, limite: 5000 })
          .then((v) => { setErroAnalises(null); return v; })
          .catch((err) => { setErroAnalises(err instanceof Error ? err.message : String(err)); return null; }),
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
      if (anals) mesclarAnalises(anals);
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

  // Seleção para impressão no histórico
  const toggleReportSelection = (id: string) => {
    const next = new Set(selectedReportIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
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

  const handleDeleteAnalysis = (id: string, batch: string) => {
    pedirMotivo({
      titulo: 'Excluir laudo físico-químico',
      alvo: `Laudo do lote ${batch}`,
      detalhe: 'Exclusão definitiva',
      executar: async (motivo) => {
        await api.deleteFiscoQuimicaAnalysis(id, motivo);
        setSelectedReportIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setAnalyses((prev) => prev.filter((a) => a.id !== id));
      },
    });
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
    { id: 'correctives', label: 'Corretivos', icon: SlidersHorizontal },
    { id: 'patterns', label: 'Padrões por Produto', icon: Layers },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  const headerActions = (
    <div className="flex items-center gap-4 shrink-0">
      <div className="flex flex-col items-end">
        <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">Laudos · últimos {DIAS_CARREGADOS} dias</span>
        <span className="text-xs font-black text-zinc-900">
          {analyses.filter((a) => dataIsoDaAnalise(a.analysisDate) >= desdeInicial).length}
        </span>
        {erroAnalises && (
          <span className="text-[9px] font-bold text-red-600" title={erroAnalises}>Falha ao carregar laudos</span>
        )}
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
      {motivoElemento}
      {aviso && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white shadow-lg">
          {aviso}
        </div>
      )}
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
              onSaved={(salvos, completo) => {
                mesclarAnalises(salvos);
                if (!completo) return;
                setEditingAnalysis(null);
                const lote = salvos[0]?.batch;
                setAviso(salvos.length > 1 ? `${salvos.length} laudos do lote ${lote} salvos` : `Laudo do lote ${lote} salvo`);
                setActiveTab('history');
              }}
              onAgentsChanged={fetchData}
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
              onBuscarServidor={(busca) => buscarNoServidor({ busca: busca })}
              onMesVisivel={garantirMes}
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
              desdeCarregado={desdeCarregado}
              onCarregarMaisAntigos={carregarMaisAntigos}
              onBuscarServidor={(busca) => buscarNoServidor({ busca: busca })}
              onEditAnalysis={(a) => {
                setEditingAnalysis(a);
                setActiveTab('new');
              }}
            />
          </motion.div>
        )}

        {activeTab === 'erp_lotes' && (
          <motion.div key="erp_lotes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
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
          <motion.div key="correctives" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCorrectiveSection('baixas')}
                className={`min-h-11 px-4 rounded-xl text-sm font-bold border ${correctiveSection === 'baixas' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-800 border-zinc-200'}`}
              >
                Baixas
              </button>
              <button
                type="button"
                onClick={() => setCorrectiveSection('catalogo')}
                className={`min-h-11 px-4 rounded-xl text-sm font-bold border ${correctiveSection === 'catalogo' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-800 border-zinc-200'}`}
              >
                Catálogo
              </button>
            </div>
            {correctiveSection === 'baixas' ? (
              <CorrectiveBatchesTab
                agents={agents}
                onRefreshHistory={fetchData}
              />
            ) : (
              <AgentsTab
                agents={agents}
                items={items}
                analyses={analyses}
                onRefresh={fetchData}
              />
            )}
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

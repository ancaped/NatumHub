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
import { ReportTabs } from '../../geral/components/ui/ReportKit';
import { DEFAULT_FISCO_TEMPLATE } from './lib/fiscoUtils';

// Subcomponentes modulares
import { AnalysisCreationFlow } from './components/AnalysisCreationFlow';
import { CalendarTab } from './components/CalendarTab';
import { AnalysisHistory } from './components/AnalysisHistory';
import { CorrectiveBatchesTab } from './components/CorrectiveBatchesTab';
import { PatternsTab } from './components/PatternsTab';
import { PatternEditor } from './components/PatternEditor';
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

  // Definir padrão do produto a partir do fluxo de análise (mesmo editor da aba Padrões)
  const [padraoDoProduto, setPadraoDoProduto] = useState<{ code: string; name: string } | null>(null);

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

  if (loading && !products.length && !analyses.length) {
    return (
      <div className="flex h-dvh items-center justify-center bg-zinc-50">
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
              onOpenAddPattern={(code, name) => setPadraoDoProduto({ code, name })}
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
            <ReportTabs
              abas={[{ id: 'baixas', label: 'Baixas da semana' }, { id: 'catalogo', label: 'Catálogo de corretivos' }]}
              ativa={correctiveSection}
              onChange={(id) => setCorrectiveSection(id as 'baixas' | 'catalogo')}
            />
            {correctiveSection === 'baixas' ? (
              <CorrectiveBatchesTab
                agents={agents}
                onRefreshHistory={fetchData}
              />
            ) : (
              <AgentsTab
                agents={agents}
                items={items}
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

      {padraoDoProduto && (
        <PatternEditor
          key={padraoDoProduto.code}
          produto={padraoDoProduto}
          padrao={null}
          agents={agents}
          onClose={() => setPadraoDoProduto(null)}
          onSaved={() => { setPadraoDoProduto(null); fetchData(); }}
        />
      )}
    </AppLayout>
  );
}

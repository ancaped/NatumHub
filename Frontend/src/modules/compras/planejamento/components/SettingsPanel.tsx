import { apiFetch } from '../../../geral/lib/http';
import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../../geral/lib/api';
import { Category, ComprasAppConfig, Item, Supplier, CustomPurchaseConfigRow } from '../../../geral/lib/types';
import {
  Settings,
  FolderTree,
  Plus,
  Trash2,
  X,
  Save,
  Package,
  Search,
  Link,
  Unlink,
  Layers,
  Building2,
  RotateCcw,
  Check,
  CheckSquare,
  Square,
  Sliders,
  ShieldCheck,
  Eye,
  Tag,
  HelpCircle,
  Pin,
  ChevronDown,
  ChevronRight,
  Info,
  CheckCircle2
} from 'lucide-react';
import { cn, randomId } from '../../../geral/lib/utils';
import { getAuthUser, isSupervisor } from '../../../geral/lib/auth';

export function SettingsPanel({ mode = 'all', active = false }: { mode?: string; active?: boolean }) {
  const canConfig = isSupervisor(getAuthUser());
  const [config, setConfig] = useState<ComprasAppConfig>({ targetDays: 90, itemOverrides: {} });
  const [activeSettingTab, setActiveSettingTab] = useState<'geral' | 'categorias' | 'regras'>('geral');
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customConfigs, setCustomConfigs] = useState<CustomPurchaseConfigRow[]>([]);
  const [selectedSubcategory, setSelectedSubcategory] = useState<Category | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalSelectedItems, setModalSelectedItems] = useState<Set<string>>(new Set());
  const [subSelectedItems, setSubSelectedItems] = useState<Set<string>>(new Set());

  // Expanded supplier family cards in rules list
  const [expandedSupplierRules, setExpandedSupplierRules] = useState<Set<string>>(new Set());

  // Form states for adding category
  const [newCatName, setNewCatName] = useState('');
  const [newCatParent, setNewCatParent] = useState<string | null>(
    mode === 'materia_prima' ? 'cat_mp' : 
    mode === 'coloracao' ? 'cat_coloracao' : 
    mode === 'embalagens' ? 'cat_emb' : 
    mode === 'apoio' ? 'cat_apoio' : null
  );

  // Pinned subcategories state
  const [pinnedSubs, setPinnedSubs] = useState<string[]>([]);

  // Automatic subcategories rules state
  const [newRuleSubcategoryId, setNewRuleSubcategoryId] = useState('');
  const [newRulePrefix, setNewRulePrefix] = useState('');
  const [newRuleType, setNewRuleType] = useState<'description' | 'supplier'>('description');

  // Local draft states for editing Disparo and Objetivo in the matrix
  const [draftConfigs, setDraftConfigs] = useState<Record<string, Partial<CustomPurchaseConfigRow>>>({});
  const [savingTargetId, setSavingTargetId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (mode === 'materia_prima') {
      setNewCatParent('cat_mp');
    } else if (mode === 'coloracao') {
      setNewCatParent('cat_coloracao');
    } else if (mode === 'embalagens') {
      setNewCatParent('cat_emb');
    } else if (mode === 'apoio') {
      setNewCatParent('cat_apoio');
    } else {
      setNewCatParent(null);
    }
  }, [mode]);

  useEffect(() => {
    if (!active) return;
    loadAllData();

    const handleConfigUpdate = () => {
      loadAllData();
    };
    window.addEventListener('compras_config_updated', handleConfigUpdate);
    return () => window.removeEventListener('compras_config_updated', handleConfigUpdate);
  }, [active, mode]);

  const loadAllData = async () => {
    await Promise.all([
      loadConfig(),
      loadCategories(),
      loadItems(),
      loadCustomConfigs(),
      loadSuppliers(),
      loadPinnedSubcategories()
    ]);
  };

  const loadConfig = async () => {
    try {
      const configKey = mode === 'coloracao' ? 'compras_coloracao' : mode === 'apoio' ? 'compras_apoio' : 'compras_main';
      const c = await api.getComprasConfig(configKey);
      if (c) setConfig(c);
    } catch (e) { console.error(e); }
  };

  const loadCategories = async () => {
    try { setCategories(await api.getCategories()); }
    catch (e) { console.error(e); }
  };

  const loadCustomConfigs = async () => {
    try {
      const list = await api.getCustomPurchaseConfigs();
      setCustomConfigs(list);
    } catch (e) { console.error(e); }
  };

  const loadSuppliers = async () => {
    try {
      const s = await api.getSuppliers(mode);
      setSuppliers(s);
    } catch (e) { console.error(e); }
  };

  const loadPinnedSubcategories = async () => {
    try {
      const ids = await api.getPinnedSubcategories();
      setPinnedSubs(ids);
    } catch (e) {
      console.error(e);
      setPinnedSubs([]);
    }
  };

  const loadItems = async () => {
    try {
      if (mode === 'coloracao' || mode === 'apoio') {
        const res = await apiFetch(`/products?limit=5000&status=${mode}&show_hidden=true`);
        if (res.ok) {
          const data = await res.json();
          const mapped = (data.items || []).map((p: any) => ({
            code: p.codigo,
            description: p.descricao,
            unit: 'UN',
            categoryId: p.categoria_produto || null,
            isIgnored: p.visivel === 0
          }));
          setItems(mapped);
        }
      } else {
        setItems(await api.getItems());
      }
    } catch (e) { console.error(e); }
  };

  const togglePinSubcategory = async (catId: string) => {
    if (!canConfig) return;
    let updated: string[];
    if (pinnedSubs.includes(catId)) {
      updated = pinnedSubs.filter(id => id !== catId);
    } else {
      updated = [...pinnedSubs, catId];
    }
    setPinnedSubs(updated);
    try {
      await api.savePinnedSubcategories(updated);
      window.dispatchEvent(new CustomEvent('compras_config_updated'));
    } catch (e) {
      console.error(e);
    }
  };

  const subcategoriesOnly = useMemo(() => {
    return categories.filter(c => {
      if (c.parentId === null) return false;
      if (mode === 'materia_prima') return c.parentId === 'cat_mp';
      if (mode === 'coloracao') return c.parentId === 'cat_coloracao';
      if (mode === 'embalagens') return c.parentId === 'cat_emb' || c.parentId === 'cat_mat';
      if (mode === 'apoio') return c.parentId === 'cat_apoio';
      return true;
    });
  }, [categories, mode]);

  const rootCats = useMemo(() => {
    return categories.filter(c => !c.parentId && (
      mode === 'materia_prima' ? c.id === 'cat_mp' : 
      mode === 'coloracao' ? c.id === 'cat_coloracao' : 
      mode === 'embalagens' ? (c.id === 'cat_emb' || c.id === 'cat_mat') : 
      mode === 'apoio' ? c.id === 'cat_apoio' : true
    ));
  }, [categories, mode]);

  const getChildren = (parentId: string) => categories.filter(c => c.parentId === parentId);

  const getSubcategoryItemsCount = (subId: string) => {
    return items.filter(i => i.categoryId === subId).length;
  };

  const getActiveConfigForCategory = (catId: string, parentId?: string | null) => {
    const direct = customConfigs.find(c => c.level === 'subcategoria' && c.targetId === catId);
    if (direct) {
      return { config: direct, isInherited: false };
    }
    if (parentId) {
      const parent = customConfigs.find(c => c.level === 'subcategoria' && c.targetId === parentId);
      if (parent) {
        return { config: parent, isInherited: true };
      }
    }
    // Fallback default
    return {
      config: {
        level: 'subcategoria',
        targetId: catId,
        diasStart: 90,
        diasTarget: 90,
        useLeadTime: 0,
        safetyDays: 0,
        objetivoTipo: 'padrao',
        objetivoValor: 0,
        periodoMedia: null
      } as CustomPurchaseConfigRow,
      isInherited: true
    };
  };

  const handleSaveCategoryConfig = async (catId: string, parentId?: string | null, catName?: string) => {
    if (!canConfig) return;
    setSavingTargetId(catId);
    try {
      const draft = draftConfigs[catId] || {};
      const { config: currentCfg } = getActiveConfigForCategory(catId, parentId);

      const rowToSave: CustomPurchaseConfigRow = {
        level: 'subcategoria',
        targetId: catId,
        targetName: catName || currentCfg.targetName,
        diasStart: draft.diasStart !== undefined ? draft.diasStart : (currentCfg.diasStart ?? 90),
        diasTarget: draft.diasTarget !== undefined ? draft.diasTarget : (currentCfg.diasTarget ?? 90),
        useLeadTime: draft.useLeadTime !== undefined ? draft.useLeadTime : (currentCfg.useLeadTime ?? 0),
        safetyDays: draft.safetyDays !== undefined ? draft.safetyDays : (currentCfg.safetyDays ?? 0),
        objetivoTipo: (draft.objetivoTipo || currentCfg.objetivoTipo || 'padrao') as any,
        objetivoValor: draft.objetivoValor !== undefined ? draft.objetivoValor : (currentCfg.objetivoValor ?? 0),
        periodoMedia: draft.periodoMedia !== undefined ? draft.periodoMedia : currentCfg.periodoMedia
      };

      await api.saveCustomPurchaseConfig(rowToSave);
      await loadCustomConfigs();
      window.dispatchEvent(new CustomEvent('compras_config_updated'));
      
      setDraftConfigs(prev => {
        const next = { ...prev };
        delete next[catId];
        return next;
      });
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar parâmetros da categoria');
    } finally {
      setSavingTargetId(null);
    }
  };

  const handleResetCategoryConfig = async (catId: string, catName?: string) => {
    if (!canConfig) return;
    if (!confirm(`Deseja remover as configurações personalizadas de "${catName || catId}" e restaurar os parâmetros herdados da categoria pai?`)) {
      return;
    }
    setSavingTargetId(catId);
    try {
      await api.deleteCustomPurchaseConfig('subcategoria', catId);
      await loadCustomConfigs();
      window.dispatchEvent(new CustomEvent('compras_config_updated'));
      setDraftConfigs(prev => {
        const next = { ...prev };
        delete next[catId];
        return next;
      });
    } catch (e) {
      console.error(e);
      alert('Erro ao restaurar herança da categoria');
    } finally {
      setSavingTargetId(null);
    }
  };

  const saveConfig = async () => {
    if (!canConfig) return;
    setSaving(true);
    try {
      const configKey = mode === 'coloracao' ? 'compras_coloracao' : mode === 'apoio' ? 'compras_apoio' : 'compras_main';
      await api.saveComprasConfig(config, configKey);
      setSaved(true);
      window.dispatchEvent(new CustomEvent('compras_config_updated'));
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar configurações gerais');
    } finally {
      setSaving(false);
    }
  };

  const handleAddAutoRule = async () => {
    if (!canConfig) return;
    if (!newRuleSubcategoryId || !newRulePrefix.trim()) return;
    const rules = config.autoSubcategories || [];
    const prefixClean = newRulePrefix.trim();
    if (rules.some(r => r.prefix.toLowerCase() === prefixClean.toLowerCase() && (r.type || 'description') === newRuleType)) {
      alert('Já existe uma regra ativa com este valor para esse mesmo tipo!');
      return;
    }
    const updatedRules = [...rules, { subcategoryId: newRuleSubcategoryId, prefix: prefixClean, type: newRuleType }];
    const next = { ...config, autoSubcategories: updatedRules };
    setConfig(next);
    setNewRulePrefix('');
    try {
      const configKey = mode === 'coloracao' ? 'compras_coloracao' : mode === 'apoio' ? 'compras_apoio' : 'compras_main';
      await api.saveComprasConfig(next, configKey);
      window.dispatchEvent(new CustomEvent('compras_config_updated'));
      await loadItems();
    } catch (e) {
      console.error(e);
      alert('Regra adicionada na tela, mas falhou ao salvar no servidor.');
    }
  };

  const handleRemoveAutoRule = async (prefixToRemove: string, typeToRemove: string) => {
    if (!canConfig) return;
    const rules = config.autoSubcategories || [];
    const updatedRules = rules.filter(r => !(r.prefix === prefixToRemove && (r.type || 'description') === typeToRemove));
    const next = { ...config, autoSubcategories: updatedRules };
    setConfig(next);
    try {
      const configKey = mode === 'coloracao' ? 'compras_coloracao' : mode === 'apoio' ? 'compras_apoio' : 'compras_main';
      await api.saveComprasConfig(next, configKey);
      window.dispatchEvent(new CustomEvent('compras_config_updated'));
      await loadItems();
    } catch (e) {
      console.error(e);
      alert('Falha ao remover regra no servidor.');
    }
  };

  const handleAddCategory = async () => {
    if (!canConfig) return;
    if (!newCatName.trim()) return;
    try {
      const defaultParent = 
        mode === 'materia_prima' ? 'cat_mp' :
        mode === 'coloracao' ? 'cat_coloracao' :
        mode === 'embalagens' ? 'cat_emb' :
        mode === 'apoio' ? 'cat_apoio' :
        null;
      const parentId = newCatParent !== undefined ? newCatParent : defaultParent;
      await api.saveCategory({ id: randomId(), name: newCatName.trim(), parentId: parentId || null });
      setNewCatName('');
      setNewCatParent(defaultParent);
      await loadCategories();
      window.dispatchEvent(new CustomEvent('compras_config_updated'));
    } catch (e: any) { 
      console.error(e); 
      alert(e?.message ? `Erro ao criar categoria: ${e.message}` : 'Erro ao criar categoria'); 
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!canConfig) return;
    if (!confirm('Excluir esta categoria? Os itens serão movidos para "Sem Categoria".')) return;
    try {
      await api.deleteCategory(id);
      if (selectedSubcategory?.id === id) {
        setSelectedSubcategory(null);
      }
      await loadCategories();
      await loadItems();
      window.dispatchEvent(new CustomEvent('compras_config_updated'));
    } catch (e) {
      console.error(e);
      alert('Erro ao excluir categoria');
    }
  };

  const handleBatchRemoveFromCategory = async () => {
    if (!canConfig) return;
    if (subSelectedItems.size === 0 || !selectedSubcategory) return;
    if (!confirm(`Desassociar os ${subSelectedItems.size} insumos selecionados de "${selectedSubcategory.name}"?`)) return;
    
    try {
      await api.updateItemsCategory(Array.from(subSelectedItems), null);
      setSubSelectedItems(new Set());
      await loadItems();
      window.dispatchEvent(new CustomEvent('compras_config_updated'));
    } catch (e) {
      console.error(e);
      alert('Erro ao desassociar insumos');
    }
  };

  const handleBatchAssignToCategory = async () => {
    if (!canConfig) return;
    if (modalSelectedItems.size === 0 || !selectedSubcategory) return;
    
    try {
      await api.updateItemsCategory(Array.from(modalSelectedItems), selectedSubcategory.id);
      setShowAssignModal(false);
      setModalSelectedItems(new Set());
      await loadItems();
      window.dispatchEvent(new CustomEvent('compras_config_updated'));
    } catch (e) {
      console.error(e);
      alert('Erro ao associar insumos');
    }
  };

  const isExcludedItem = (item: Item) => {
    if (item.categoryId) {
      let currentId = item.categoryId;
      let visited = new Set<string>();
      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const cat = categories.find(c => c.id === currentId);
        if (!cat) break;
        if (mode === 'materia_prima') {
          if (cat.id === 'cat_emb' || cat.id === 'cat_mat' || cat.id === 'cat_coloracao' || cat.id === 'cat_apoio') return true;
        } else if (mode === 'coloracao') {
          if (cat.id === 'cat_mp' || cat.id === 'cat_emb' || cat.id === 'cat_mat' || cat.id === 'cat_apoio') return true;
        } else if (mode === 'embalagens') {
          if (cat.id === 'cat_mp' || cat.id === 'cat_coloracao' || cat.id === 'cat_apoio') return true;
        } else if (mode === 'apoio') {
          if (cat.id === 'cat_mp' || cat.id === 'cat_emb' || cat.id === 'cat_mat' || cat.id === 'cat_coloracao') return true;
        }
        currentId = cat.parentId || '';
      }
    }
    return false;
  };

  // Selected supplier in new rule creation form (for live CNPJ preview)
  const currentSelectedSupplierForNewRule = useMemo(() => {
    if (newRuleType !== 'supplier' || !newRulePrefix.trim()) return null;
    return suppliers.find(
      s => s.name.toLowerCase() === newRulePrefix.trim().toLowerCase() || s.id === newRulePrefix.trim()
    );
  }, [newRuleType, newRulePrefix, suppliers]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Tabs */}
      <div className="flex items-center justify-between border-b border-zinc-200 pb-4 flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-black text-zinc-900 tracking-tight flex items-center gap-2">
            <Settings className="h-6 w-6 text-zinc-800" />
            Configurações de Compras
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Gerenciamento centralizado de Metas (Objetivo), Pontos de Disparo, Categorias e Regras automáticas no PostgreSQL.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl shadow-inner">
          {([
            { id: 'geral', label: 'Metas & Disparos (Matriz)', icon: Sliders },
            { id: 'categorias', label: 'Categorias & Subcategorias', icon: FolderTree },
            { id: 'regras', label: 'Regras Automáticas', icon: Link },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSettingTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer",
                activeSettingTab === tab.id
                  ? "bg-white text-zinc-900 shadow-sm font-black"
                  : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/60"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ABA 1: MATRIZ DE METAS & DISPAROS DE CATEGORIAS */}
      {activeSettingTab === 'geral' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="font-black text-zinc-900 flex items-center gap-2 text-base">
                  <Sliders className="h-5 w-5 text-blue-600" />
                  Parâmetros de Estoque por Categoria e Subcategoria
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Defina os dias de <strong>Disparo</strong> e <strong>Objetivo (Meta)</strong>. Os parâmetros são sincronizados no PostgreSQL para todos os usuários.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs text-zinc-700 bg-white border border-zinc-200 px-3 py-1.5 rounded-xl shadow-2xs">
                  <span className="font-bold">Histórico de Média Geral:</span>
                  <select
                    value={config.averagePeriodMonths || 12}
                    onChange={e => setConfig({ ...config, averagePeriodMonths: Number(e.target.value) })}
                    disabled={!canConfig}
                    className="border border-zinc-300 rounded-lg px-2 py-0.5 bg-white font-extrabold text-zinc-900 focus:outline-none cursor-pointer text-xs"
                  >
                    <option value={3}>3 meses</option>
                    <option value={6}>6 meses</option>
                    <option value={12}>12 meses</option>
                    <option value={24}>24 meses</option>
                  </select>
                  {canConfig && (
                    <button
                      onClick={saveConfig}
                      disabled={saving}
                      className="text-xs bg-zinc-900 text-white px-3 py-1 rounded-lg font-bold hover:bg-zinc-800 cursor-pointer ml-1 shadow-2xs"
                    >
                      {saving ? '...' : 'Salvar Média'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-100/70 border-b border-zinc-200 text-zinc-600 uppercase font-bold text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Categoria / Subcategoria</th>
                    <th className="py-3.5 px-3 w-32 text-center">Disparo (Dias)</th>
                    <th className="py-3.5 px-3 w-32 text-center">Objetivo (Dias)</th>
                    <th className="py-3.5 px-3 w-40">Tipo de Meta</th>
                    <th className="py-3.5 px-3 w-32">Histórico Média</th>
                    <th className="py-3.5 px-3 w-28 text-center">Atalho Menu</th>
                    <th className="py-3.5 px-4 text-right w-44">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-150">
                  {rootCats.map(root => {
                    const children = getChildren(root.id);
                    const { config: rootCfg } = getActiveConfigForCategory(root.id, null);
                    const rootDraft = draftConfigs[root.id] || {};
                    const rootDisparo = rootDraft.diasStart !== undefined ? rootDraft.diasStart : (rootCfg.diasStart ?? 90);
                    const rootObjetivo = rootDraft.diasTarget !== undefined ? rootDraft.diasTarget : (rootCfg.diasTarget ?? 90);
                    const isRootSaving = savingTargetId === root.id;

                    return (
                      <React.Fragment key={root.id}>
                        {/* Linha da Categoria Pai / Raiz */}
                        <tr className="bg-zinc-100/80 font-bold text-zinc-900 border-t-2 border-zinc-200">
                          <td className="py-3.5 px-4 flex items-center gap-2.5">
                            <span className="p-1.5 rounded-lg bg-zinc-200 text-zinc-800 shadow-2xs"><FolderTree className="h-4 w-4" /></span>
                            <span className="font-black text-sm text-zinc-950">{root.name}</span>
                            <span className="text-[10px] text-zinc-500 font-mono bg-white px-2 py-0.5 rounded-full border border-zinc-200 font-bold">
                              Padrão do Módulo
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="number"
                              value={rootDisparo ?? ''}
                              disabled={!canConfig}
                              onChange={e => {
                                const val = e.target.value === '' ? null : Number(e.target.value);
                                setDraftConfigs(prev => ({
                                  ...prev,
                                  [root.id]: { ...prev[root.id], diasStart: val }
                                }));
                              }}
                              className="w-20 text-center font-bold border border-zinc-300 rounded-lg py-1.5 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none shadow-2xs"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="number"
                              value={rootObjetivo ?? ''}
                              disabled={!canConfig}
                              onChange={e => {
                                const val = e.target.value === '' ? null : Number(e.target.value);
                                setDraftConfigs(prev => ({
                                  ...prev,
                                  [root.id]: { ...prev[root.id], diasTarget: val }
                                }));
                              }}
                              className="w-20 text-center font-bold border border-zinc-300 rounded-lg py-1.5 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none shadow-2xs"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-zinc-500 text-[11px]">
                            Padrão (dias × média)
                          </td>
                          <td className="py-2.5 px-3 text-zinc-500 text-[11px]">
                            {config.averagePeriodMonths || 12} meses
                          </td>
                          <td className="py-2.5 px-3 text-center text-zinc-400 text-[11px]">
                            —
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            {canConfig && (
                              <button
                                onClick={() => handleSaveCategoryConfig(root.id, null, root.name)}
                                disabled={isRootSaving}
                                className="text-xs bg-zinc-900 text-white px-3.5 py-1.5 rounded-lg font-bold hover:bg-zinc-800 cursor-pointer shadow-xs transition-all"
                              >
                                {isRootSaving ? 'Salvando...' : 'Salvar Padrão'}
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Linhas das Subcategorias vinculadas */}
                        {children.map(sub => {
                          const { config: subCfg, isInherited } = getActiveConfigForCategory(sub.id, root.id);
                          const subDraft = draftConfigs[sub.id] || {};
                          const subDisparo = subDraft.diasStart !== undefined ? subDraft.diasStart : (subCfg.diasStart ?? rootDisparo);
                          const subObjetivo = subDraft.diasTarget !== undefined ? subDraft.diasTarget : (subCfg.diasTarget ?? rootObjetivo);
                          const subTipo = subDraft.objetivoTipo || subCfg.objetivoTipo || 'padrao';
                          const subMedia = subDraft.periodoMedia !== undefined ? subDraft.periodoMedia : subCfg.periodoMedia;
                          const isPinned = pinnedSubs.includes(sub.id);
                          const isSubSaving = savingTargetId === sub.id;
                          const itemsCount = getSubcategoryItemsCount(sub.id);

                          return (
                            <tr key={sub.id} className="hover:bg-zinc-50/80 transition-colors">
                              <td className="py-3 px-4 pl-10">
                                <div className="flex items-center gap-2">
                                  <span className="text-zinc-400 font-mono">↳</span>
                                  <span className="font-bold text-zinc-900 text-xs">{sub.name}</span>
                                  <span className="text-[10px] text-zinc-500 font-mono bg-zinc-100 px-2 py-0.5 rounded-full border border-zinc-200">
                                    {itemsCount} insumos
                                  </span>
                                  {isInherited ? (
                                    <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 font-bold">
                                      Herdado ({rootDisparo}d / {rootObjetivo}d)
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 font-black">
                                      Personalizado
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="py-2.5 px-3 text-center">
                                <input
                                  type="number"
                                  value={subDisparo ?? ''}
                                  disabled={!canConfig}
                                  onChange={e => {
                                    const val = e.target.value === '' ? null : Number(e.target.value);
                                    setDraftConfigs(prev => ({
                                      ...prev,
                                      [sub.id]: { ...prev[sub.id], diasStart: val }
                                    }));
                                  }}
                                  className={cn(
                                    "w-20 text-center font-bold border rounded-lg py-1.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none shadow-2xs",
                                    isInherited ? "border-amber-200 bg-amber-50/40 text-zinc-700" : "border-zinc-300 bg-white text-zinc-900"
                                  )}
                                />
                              </td>

                              <td className="py-2.5 px-3 text-center">
                                <input
                                  type="number"
                                  value={subObjetivo ?? ''}
                                  disabled={!canConfig}
                                  onChange={e => {
                                    const val = e.target.value === '' ? null : Number(e.target.value);
                                    setDraftConfigs(prev => ({
                                      ...prev,
                                      [sub.id]: { ...prev[sub.id], diasTarget: val }
                                    }));
                                  }}
                                  className={cn(
                                    "w-20 text-center font-bold border rounded-lg py-1.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none shadow-2xs",
                                    isInherited ? "border-amber-200 bg-amber-50/40 text-zinc-700" : "border-zinc-300 bg-white text-zinc-900"
                                  )}
                                />
                              </td>

                              <td className="py-2.5 px-3">
                                <select
                                  value={subTipo}
                                  disabled={!canConfig}
                                  onChange={e => {
                                    setDraftConfigs(prev => ({
                                      ...prev,
                                      [sub.id]: { ...prev[sub.id], objetivoTipo: e.target.value as any }
                                    }));
                                  }}
                                  className="w-full text-xs border border-zinc-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none cursor-pointer"
                                >
                                  <option value="padrao">Padrão (Dias)</option>
                                  <option value="porcentagem">Margem Seg. (%)</option>
                                  <option value="desvio_padrao">Desvio Padrão (+1σ)</option>
                                  <option value="multiplicador">Multiplicador Desvio</option>
                                </select>
                              </td>

                              <td className="py-2.5 px-3">
                                <select
                                  value={subMedia ?? ''}
                                  disabled={!canConfig}
                                  onChange={e => {
                                    const val = e.target.value ? Number(e.target.value) : null;
                                    setDraftConfigs(prev => ({
                                      ...prev,
                                      [sub.id]: { ...prev[sub.id], periodoMedia: val }
                                    }));
                                  }}
                                  className="w-full text-xs border border-zinc-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none cursor-pointer"
                                >
                                  <option value="">Padrão ({config.averagePeriodMonths || 12}m)</option>
                                  <option value={3}>3 meses</option>
                                  <option value={6}>6 meses</option>
                                  <option value={12}>12 meses</option>
                                  <option value={24}>24 meses</option>
                                </select>
                              </td>

                              <td className="py-2.5 px-3 text-center">
                                <button
                                  onClick={() => togglePinSubcategory(sub.id)}
                                  disabled={!canConfig}
                                  className={cn(
                                    "p-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1 shadow-2xs",
                                    isPinned
                                      ? "bg-zinc-900 text-white border-zinc-900"
                                      : "bg-zinc-100 text-zinc-500 border-zinc-200 hover:bg-zinc-200"
                                  )}
                                  title={isPinned ? "Fixada no menu lateral (clique para desafixar)" : "Não fixada no menu (clique para fixar)"}
                                >
                                  <Pin className="h-3 w-3" />
                                  <span>{isPinned ? 'Fixada' : 'Oculta'}</span>
                                </button>
                              </td>

                              <td className="py-2.5 px-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {canConfig && (
                                    <button
                                      onClick={() => handleSaveCategoryConfig(sub.id, root.id, sub.name)}
                                      disabled={isSubSaving}
                                      className="text-xs bg-zinc-900 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-zinc-800 cursor-pointer shadow-xs transition-colors"
                                      title="Salvar alterações no PostgreSQL"
                                    >
                                      {isSubSaving ? '...' : 'Salvar'}
                                    </button>
                                  )}

                                  {!isInherited && canConfig && (
                                    <button
                                      onClick={() => handleResetCategoryConfig(sub.id, sub.name)}
                                      disabled={isSubSaving}
                                      className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1.5 rounded-lg font-medium hover:bg-amber-100 cursor-pointer"
                                      title="Restaurar herança do pai"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    </button>
                                  )}

                                  {canConfig && (
                                    <button
                                      onClick={() => handleDeleteCategory(sub.id)}
                                      className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                      title="Excluir subcategoria"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {children.length === 0 && (
                          <tr>
                            <td colSpan={7} className="py-4 px-4 pl-10 text-xs text-zinc-400 italic">
                              Nenhuma subcategoria cadastrada para {root.name}.
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Criar Nova Subcategoria */}
            {canConfig && (
              <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex items-end gap-3 flex-wrap">
                <div className="flex-1 min-w-[240px]">
                  <label className="text-xs font-bold text-zinc-700 mb-1 block">
                    Adicionar Nova Subcategoria
                  </label>
                  <input
                    type="text"
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    placeholder="Nome da nova subcategoria..."
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newCatName.trim()) {
                        e.preventDefault();
                        handleAddCategory();
                      }
                    }}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-700 mb-1 block">Categoria Pai</label>
                  <select
                    value={newCatParent || ''}
                    onChange={e => setNewCatParent(e.target.value || null)}
                    className="border border-zinc-300 rounded-xl px-3 py-2 text-xs bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none min-w-[160px]"
                  >
                    <option value="">Raiz (sem pai)</option>
                    {rootCats.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleAddCategory}
                  disabled={!newCatName.trim()}
                  className="text-xs bg-blue-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors h-[36px]"
                >
                  <Plus className="h-4 w-4" /> Criar Subcategoria
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA 2: ORGANIZAR CATEGORIAS & INSUMOS EM LOTE */}
      {activeSettingTab === 'categorias' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in duration-200">
          {/* Lista de Categorias */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden lg:col-span-6 w-full">
            <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50">
              <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
                <FolderTree className="h-5 w-5 text-zinc-600" />
                Estrutura de Categorias & Subcategorias
              </h3>
              <p className="text-xs text-zinc-500 mt-1 font-normal">
                Selecione uma subcategoria abaixo para gerenciar e associar insumos em lote no painel lateral.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                {rootCats.map(cat => (
                  <div key={cat.id} className="border border-zinc-200 rounded-xl p-3 bg-zinc-50/60 space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between py-2 px-3 bg-zinc-100 rounded-lg">
                      <span className="font-extrabold text-sm text-zinc-900">{cat.name}</span>
                      {cat.id !== 'cat_mp' && cat.id !== 'cat_emb' && cat.id !== 'cat_coloracao' && cat.id !== 'cat_apoio' && cat.id !== 'cat_mat' && canConfig && (
                        <button
                          onClick={() => handleDeleteCategory(cat.id)}
                          className="text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-1 pl-2">
                      {getChildren(cat.id).map(sub => (
                        <div
                          key={sub.id}
                          className={cn(
                            "flex items-center justify-between py-2 px-3 pl-4 text-xs hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer",
                            selectedSubcategory?.id === sub.id && "bg-blue-50 border border-blue-200 font-bold shadow-2xs"
                          )}
                          onClick={() => {
                            setSelectedSubcategory(sub);
                            setSubSelectedItems(new Set());
                          }}
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-zinc-400 font-mono">↳</span>
                            <span className="text-zinc-800 font-semibold">{sub.name}</span>
                            <span className="text-[10px] text-zinc-500 font-mono font-normal bg-zinc-200/70 px-2 py-0.5 rounded-full">
                              {getSubcategoryItemsCount(sub.id)} insumos
                            </span>
                          </div>
                          {canConfig && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCategory(sub.id);
                              }}
                              className="text-zinc-400 hover:text-red-500 transition-colors cursor-pointer p-1"
                              title="Excluir subcategoria"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      {getChildren(cat.id).length === 0 && (
                        <p className="text-xs text-zinc-400 italic pl-4 py-1.5">Nenhuma subcategoria cadastrada.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Gerenciador de Insumos da Subcategoria Selecionada */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden lg:col-span-6 w-full min-h-[480px] flex flex-col justify-between">
            <div>
              <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-zinc-900 text-sm flex items-center gap-2">
                    <Package className="h-4 w-4 text-zinc-600" />
                    {selectedSubcategory ? `Insumos em: ${selectedSubcategory.name}` : 'Gerenciador de Insumos'}
                  </h3>
                  {selectedSubcategory && (
                    <p className="text-[11px] text-zinc-500">
                      {getSubcategoryItemsCount(selectedSubcategory.id)} insumos vinculados
                    </p>
                  )}
                </div>
                {selectedSubcategory && (
                  <button onClick={() => setSelectedSubcategory(null)} className="text-zinc-400 hover:text-zinc-600 cursor-pointer p-1">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              <div className="p-6">
                {!selectedSubcategory ? (
                  <div className="text-center py-24 text-zinc-400 flex flex-col items-center gap-3">
                    <FolderTree size={48} className="opacity-25" />
                    <p className="text-sm font-bold text-zinc-600">Selecione uma Subcategoria</p>
                    <p className="text-xs max-w-xs mx-auto text-zinc-400">
                      Clique em qualquer subcategoria à esquerda para visualizar, desassociar ou adicionar insumos em lote.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500 font-medium">Insumos associados:</span>
                      <button 
                        onClick={() => {
                          const subItems = items.filter(i => i.categoryId === selectedSubcategory.id);
                          if (subSelectedItems.size === subItems.length) {
                            setSubSelectedItems(new Set());
                          } else {
                            setSubSelectedItems(new Set(subItems.map(i => i.code)));
                          }
                        }}
                        className="text-zinc-700 hover:text-zinc-950 font-bold cursor-pointer"
                      >
                        {subSelectedItems.size === items.filter(i => i.categoryId === selectedSubcategory.id).length && items.filter(i => i.categoryId === selectedSubcategory.id).length > 0 
                          ? 'Desmarcar Todos' 
                          : 'Selecionar Todos'}
                      </button>
                    </div>

                    <div className="max-h-[320px] overflow-y-auto divide-y divide-zinc-100 border border-zinc-200 rounded-xl">
                      {items.filter(i => i.categoryId === selectedSubcategory.id).length === 0 ? (
                        <p className="text-center py-12 text-xs text-zinc-400">Nenhum insumo associado a esta subcategoria.</p>
                      ) : (
                        items.filter(i => i.categoryId === selectedSubcategory.id).map(item => (
                          <div 
                            key={item.code} 
                            onClick={() => {
                              const newSel = new Set(subSelectedItems);
                              if (newSel.has(item.code)) newSel.delete(item.code);
                              else newSel.add(item.code);
                              setSubSelectedItems(newSel);
                            }}
                            className={cn(
                              "flex items-center gap-3 p-3 hover:bg-zinc-50 cursor-pointer transition-colors text-xs",
                              subSelectedItems.has(item.code) && "bg-blue-50/60"
                            )}
                          >
                            <input 
                              type="checkbox" 
                              checked={subSelectedItems.has(item.code)}
                              onChange={() => {}}
                              className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 w-3.5 h-3.5 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-mono text-xs text-zinc-500 font-bold">{item.code}</div>
                              <div className="text-xs font-semibold text-zinc-900 truncate" title={item.description}>{item.description}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {selectedSubcategory && (
              <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex justify-between gap-3 shrink-0">
                <button 
                  onClick={handleBatchRemoveFromCategory}
                  disabled={subSelectedItems.size === 0 || !canConfig}
                  className="text-xs text-red-600 hover:text-red-800 disabled:opacity-40 disabled:cursor-not-allowed font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Unlink className="w-4 h-4" /> Desassociar Selecionados ({subSelectedItems.size})
                </button>
                {canConfig && (
                  <button 
                    onClick={() => {
                      setModalSearch('');
                      setModalSelectedItems(new Set());
                      setShowAssignModal(true);
                    }}
                    className="text-xs bg-zinc-900 text-white px-4 py-2 rounded-xl font-bold hover:bg-zinc-800 flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    <Link className="w-4 h-4" /> + Associar Novos Insumos
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA 3: REGRAS AUTOMÁTICAS DE SUBCATEGORIA COM CNPJS DA FAMÍLIA DO FORNECEDOR */}
      {activeSettingTab === 'regras' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 space-y-6">
            <div>
              <h3 className="font-black text-zinc-900 text-base flex items-center gap-2">
                <Link className="h-5 w-5 text-blue-600" />
                Regras de Subcategorias Automáticas
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                Classifique insumos automaticamente por prefixo do nome ou por <strong>Fornecedor Unificado (com toda a sua família de CNPJs)</strong>. Ao salvar, as regras são aplicadas imediatamente a todos os módulos.
              </p>
            </div>

            {/* Formulário de Criação de Regra */}
            {canConfig && (
              <div className="bg-zinc-50/80 p-5 rounded-2xl border border-zinc-200 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-xs font-bold text-zinc-700">Subcategoria Destino</label>
                    <select
                      value={newRuleSubcategoryId}
                      onChange={e => setNewRuleSubcategoryId(e.target.value)}
                      className="text-xs border border-zinc-300 rounded-xl px-3 py-2 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                    >
                      <option value="">Selecione uma subcategoria...</option>
                      {subcategoriesOnly.map(sub => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-xs font-bold text-zinc-700">Classificar por</label>
                    <select
                      value={newRuleType}
                      onChange={e => setNewRuleType(e.target.value as any)}
                      className="text-xs border border-zinc-300 rounded-xl px-3 py-2 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                    >
                      <option value="description">Prefixo da Descrição</option>
                      <option value="supplier">Fornecedor (Empresa / Família de CNPJs)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-xs font-bold text-zinc-700">
                      {newRuleType === 'supplier' ? 'Selecionar / Digitar Fornecedor' : 'Prefixo do Insumo (Inicia com)'}
                    </label>
                    {newRuleType === 'supplier' ? (
                      <div className="flex flex-col gap-1.5">
                        <select
                          value={suppliers.some(s => s.name.toLowerCase() === newRulePrefix.toLowerCase()) ? newRulePrefix : ''}
                          onChange={e => {
                            if (e.target.value) {
                              setNewRulePrefix(e.target.value);
                            }
                          }}
                          className="text-xs border border-zinc-300 rounded-xl px-3 py-2 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                        >
                          <option value="">-- Escolher da lista de fornecedores --</option>
                          {suppliers
                            .filter(s => !s.parentId)
                            .map(s => {
                              const count = s.linkedSuppliers?.length || s.linkedCount || 0;
                              return (
                                <option key={s.id} value={s.name}>
                                  {s.name} {s.cnpj ? `(CNPJ: ${s.cnpj})` : ''} {count > 0 ? `[🔗 ${count} CNPJs]` : ''}
                                </option>
                              );
                            })}
                        </select>
                        <input
                          type="text"
                          value={newRulePrefix}
                          onChange={e => setNewRulePrefix(e.target.value)}
                          placeholder="Ou digite o nome / termo..."
                          className="text-xs border border-zinc-300 rounded-xl px-3 py-1.5 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none placeholder:text-zinc-400"
                        />
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={newRulePrefix}
                        onChange={e => setNewRulePrefix(e.target.value)}
                        placeholder="Ex: Bouquet, Essência, Frasco, Caixa..."
                        className="text-xs border border-zinc-300 rounded-xl px-3 py-2 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                      />
                    )}
                  </div>

                  <button
                    onClick={handleAddAutoRule}
                    disabled={!newRuleSubcategoryId || !newRulePrefix.trim()}
                    className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 h-[36px] shadow-xs"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar Regra
                  </button>
                </div>

                {/* Pré-visualização da Família de CNPJs do Fornecedor Selecionado */}
                {newRuleType === 'supplier' && currentSelectedSupplierForNewRule && (
                  <div className="bg-white border border-blue-200 rounded-xl p-3.5 text-xs text-zinc-800 space-y-2 shadow-2xs animate-in fade-in duration-150">
                    <div className="flex items-center gap-2 text-blue-900 font-bold">
                      <Building2 className="h-4 w-4 text-blue-600" />
                      <span>Grupo do Fornecedor: <strong>{currentSelectedSupplierForNewRule.name}</strong></span>
                      {currentSelectedSupplierForNewRule.cnpj && (
                        <span className="font-mono text-[11px] bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                          CNPJ Principal: {currentSelectedSupplierForNewRule.cnpj}
                        </span>
                      )}
                    </div>
                    {currentSelectedSupplierForNewRule.linkedSuppliers && currentSelectedSupplierForNewRule.linkedSuppliers.length > 0 ? (
                      <div>
                        <span className="text-[11px] text-zinc-500 font-semibold block mb-1.5">
                          {currentSelectedSupplierForNewRule.linkedSuppliers.length} Filiais e CNPJs vinculados que também serão abrangidos por esta regra:
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {currentSelectedSupplierForNewRule.linkedSuppliers.map((child, cIdx) => (
                            <span key={cIdx} className="inline-flex items-center gap-1.5 bg-blue-50/80 border border-blue-200 text-blue-900 px-2.5 py-1 rounded-lg text-xs font-medium">
                              <span className="font-bold">{child.name}</span>
                              {child.cnpj && <span className="font-mono text-[10px] text-blue-700 bg-white px-1.5 py-0.5 rounded border border-blue-100">{child.cnpj}</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-zinc-500 italic">
                        Este fornecedor ainda não possui filiais ou outros CNPJs vinculados na família.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* List of active rules with expandable family cards */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-zinc-900 uppercase tracking-wider text-left flex items-center justify-between">
                <span>Regras Ativas deste Módulo</span>
                <span className="text-[11px] font-normal text-zinc-500 lowercase">
                  {(config.autoSubcategories || []).filter(rule => subcategoriesOnly.some(sub => sub.id === rule.subcategoryId)).length} regras
                </span>
              </h4>

              {(() => {
                const filteredRules = (config.autoSubcategories || []).filter(rule => 
                  subcategoriesOnly.some(sub => sub.id === rule.subcategoryId)
                );

                if (filteredRules.length === 0) {
                  return (
                    <div className="border border-dashed border-zinc-200 rounded-2xl p-8 text-center text-zinc-400 text-xs">
                      Nenhuma regra de categorização automática ativa neste módulo.
                    </div>
                  );
                }

                return (
                  <div className="space-y-2.5">
                    {filteredRules.map((rule, idx) => {
                      const sub = categories.find(c => c.id === rule.subcategoryId);
                      const rType = rule.type || 'description';
                      const ruleKey = `${rule.prefix}_${rType}`;
                      const isExpanded = expandedSupplierRules.has(ruleKey);

                      const matchedSupplier = rType === 'supplier'
                        ? suppliers.find(
                            s =>
                              s.name.toLowerCase() === rule.prefix.toLowerCase() ||
                              s.id === rule.prefix ||
                              (s.name.toLowerCase().includes(rule.prefix.toLowerCase()) && !s.parentId)
                          )
                        : null;
                      
                      const linkedChildren = matchedSupplier?.linkedSuppliers || [];
                      const linkedCount = linkedChildren.length || matchedSupplier?.linkedCount || 0;

                      return (
                        <div
                          key={idx}
                          className="bg-white border border-zinc-200 rounded-xl p-3.5 shadow-2xs hover:border-zinc-300 transition-all space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              {rType === 'supplier' ? (
                                <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-900 border border-blue-200 px-2.5 py-1 rounded-lg text-xs font-bold">
                                  <Building2 className="h-3.5 w-3.5 text-blue-600" />
                                  Fornecedor: <strong>"{rule.prefix}"</strong>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 bg-zinc-100 text-zinc-900 border border-zinc-200 px-2.5 py-1 rounded-lg text-xs font-bold">
                                  <Tag className="h-3.5 w-3.5 text-zinc-500" />
                                  Itens iniciando com: <strong className="font-mono">"{rule.prefix}"</strong>
                                </span>
                              )}

                              <span className="text-xs text-zinc-500 font-medium">
                                → mover para:{' '}
                                <strong className="text-zinc-950 font-bold bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                                  {sub ? sub.name : rule.subcategoryId}
                                </strong>
                              </span>

                              {rType === 'supplier' && linkedCount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedSupplierRules(prev => {
                                      const next = new Set(prev);
                                      if (next.has(ruleKey)) next.delete(ruleKey);
                                      else next.add(ruleKey);
                                      return next;
                                    });
                                  }}
                                  className="text-[11px] font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg border border-indigo-200 hover:bg-indigo-100 flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <Layers className="h-3 w-3 text-indigo-600" />
                                  {linkedCount} CNPJs vinculados
                                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                </button>
                              )}
                            </div>

                            {canConfig && (
                              <button
                                onClick={() => handleRemoveAutoRule(rule.prefix, rType)}
                                className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="Remover regra"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>

                          {/* Seção Expansível com todos os CNPJs e Filiais da Família do Fornecedor */}
                          {rType === 'supplier' && isExpanded && matchedSupplier && (
                            <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-xs space-y-2 animate-in fade-in duration-150">
                              <div className="font-bold text-zinc-800 text-[11px] flex items-center gap-1.5">
                                <Building2 className="h-3.5 w-3.5 text-zinc-600" />
                                <span>Família de CNPJs cadastrados para este grupo:</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                <div className="bg-white border border-zinc-200 p-2 rounded-lg text-[11px]">
                                  <span className="text-[10px] text-zinc-400 uppercase font-bold block">Matriz</span>
                                  <strong className="text-zinc-900 block truncate">{matchedSupplier.name}</strong>
                                  <span className="font-mono text-zinc-500 text-[10px] block">{matchedSupplier.cnpj || 'CNPJ não informado'}</span>
                                </div>
                                {linkedChildren.map((child, cIdx) => (
                                  <div key={cIdx} className="bg-white border border-zinc-200 p-2 rounded-lg text-[11px]">
                                    <span className="text-[10px] text-blue-600 uppercase font-bold block">Filial Vinculada</span>
                                    <strong className="text-zinc-900 block truncate">{child.name}</strong>
                                    <span className="font-mono text-zinc-500 text-[10px] block">{child.cnpj || 'CNPJ não informado'}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Associação em Lote de Insumos */}
      {showAssignModal && selectedSubcategory && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50 shrink-0">
              <div>
                <h3 className="font-black text-zinc-900 text-base">Associar Insumos a: {selectedSubcategory.name}</h3>
                <p className="text-xs text-zinc-500 font-medium">Selecione os insumos para vincular a esta subcategoria</p>
              </div>
              <button onClick={() => setShowAssignModal(false)} className="text-zinc-400 hover:text-zinc-600 cursor-pointer p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search and Filters */}
            <div className="px-6 py-3 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between gap-4 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input 
                  type="text"
                  placeholder="Buscar insumos por código ou descrição..."
                  value={modalSearch}
                  onChange={e => setModalSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 bg-white border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs"
                />
              </div>
              <button 
                onClick={() => {
                  const filtered = items.filter(item => {
                    if (item.categoryId === selectedSubcategory.id) return false;
                    if (isExcludedItem(item)) return false;
                    const matchesSearch = !modalSearch.trim() || 
                      (item.code || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
                      (item.description || '').toLowerCase().includes(modalSearch.toLowerCase());
                    return matchesSearch;
                  });
                  if (modalSelectedItems.size === filtered.length) {
                    setModalSelectedItems(new Set());
                  } else {
                    setModalSelectedItems(new Set(filtered.map(i => i.code)));
                  }
                }}
                className="text-xs text-zinc-700 hover:text-zinc-950 font-bold cursor-pointer shrink-0"
              >
                {modalSelectedItems.size === items.filter(item => {
                  if (item.categoryId === selectedSubcategory.id) return false;
                  if (isExcludedItem(item)) return false;
                  return !modalSearch.trim() || 
                    (item.code || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
                    (item.description || '').toLowerCase().includes(modalSearch.toLowerCase());
                }).length ? 'Desmarcar Todos' : 'Selecionar Todos'}
              </button>
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto p-6 divide-y divide-zinc-100">
              {(() => {
                const filtered = items.filter(item => {
                  if (item.categoryId === selectedSubcategory.id) return false;
                  if (isExcludedItem(item)) return false;
                  return !modalSearch.trim() || 
                    (item.code || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
                    (item.description || '').toLowerCase().includes(modalSearch.toLowerCase());
                });

                if (filtered.length === 0) {
                  return <p className="text-center py-12 text-zinc-400 text-xs font-medium">Nenhum insumo disponível encontrado para associar.</p>;
                }

                return filtered.map(item => {
                  const currentCat = categories.find(c => c.id === item.categoryId);
                  const parentCat = currentCat ? categories.find(c => c.id === currentCat.parentId) : null;
                  const catLabel = currentCat 
                    ? `${parentCat ? parentCat.name + ' > ' : ''}${currentCat.name}`
                    : 'Sem Categoria';

                  return (
                    <div 
                      key={item.code} 
                      onClick={() => {
                        const newSel = new Set(modalSelectedItems);
                        if (newSel.has(item.code)) newSel.delete(item.code);
                        else newSel.add(item.code);
                        setModalSelectedItems(newSel);
                      }}
                      className={cn(
                        "flex items-center gap-3 py-2.5 px-2 hover:bg-zinc-50 cursor-pointer rounded-lg transition-colors",
                        modalSelectedItems.has(item.code) && "bg-blue-50/60"
                      )}
                    >
                      <input 
                        type="checkbox" 
                        checked={modalSelectedItems.has(item.code)}
                        onChange={() => {}}
                        className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 w-4 h-4 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="font-mono text-xs text-zinc-400 font-bold">{item.code}</span>
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                            item.categoryId ? "bg-zinc-100 text-zinc-650" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          )}>
                            {catLabel}
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-zinc-900 truncate" title={item.description}>
                          {item.description}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex justify-end gap-3 shrink-0">
              <button 
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 text-xs font-bold text-zinc-500 hover:text-zinc-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                onClick={handleBatchAssignToCategory}
                disabled={modalSelectedItems.size === 0 || !canConfig}
                className="flex items-center gap-2 bg-zinc-900 text-white px-5 py-2 rounded-xl font-bold hover:bg-zinc-800 disabled:opacity-50 transition-all shadow-md cursor-pointer text-xs"
              >
                <Save className="w-4 h-4" />
                Confirmar Associação ({modalSelectedItems.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

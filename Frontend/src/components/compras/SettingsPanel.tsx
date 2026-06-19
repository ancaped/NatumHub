import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api';
import { Category, ComprasAppConfig, Item } from '../../types';
import { Settings, FolderTree, Plus, Trash2, X, Save, Package, Search, CheckSquare, Square, Link, Unlink } from 'lucide-react';
import { cn } from '../../lib/utils';
import obsData from '../../lib/obs_data.json';

export function SettingsPanel({ mode = 'all' }: { mode?: string }) {
  const [config, setConfig] = useState<ComprasAppConfig>({ targetDays: 90, itemOverrides: {} });
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedSubcategory, setSelectedSubcategory] = useState<Category | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalSelectedItems, setModalSelectedItems] = useState<Set<string>>(new Set());
  const [subSelectedItems, setSubSelectedItems] = useState<Set<string>>(new Set());

  const [newCatName, setNewCatName] = useState('');
  const [newCatParent, setNewCatParent] = useState<string | null>(mode === 'materia_prima' ? 'cat_mp' : null);

  // Pinned subcategories state
  const [pinnedSubs, setPinnedSubs] = useState<string[]>([]);

  useEffect(() => {
    if (mode === 'materia_prima') {
      setNewCatParent('cat_mp');
    } else {
      setNewCatParent(null);
    }
  }, [mode]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadConfig();
    loadCategories();
    loadItems();

    const stored = localStorage.getItem('natum_hub_pinned_subcategories');
    if (stored) {
      try { setPinnedSubs(JSON.parse(stored)); } catch (e) { console.error(e); }
    }
  }, []);

  const togglePinSubcategory = (catId: string) => {
    let updated: string[];
    if (pinnedSubs.includes(catId)) {
      updated = pinnedSubs.filter(id => id !== catId);
    } else {
      updated = [...pinnedSubs, catId];
    }
    setPinnedSubs(updated);
    localStorage.setItem('natum_hub_pinned_subcategories', JSON.stringify(updated));
    window.dispatchEvent(new Event('storage'));
  };

  const subcategoriesOnly = useMemo(() => {
    return categories.filter(c => c.parentId !== null && (mode !== 'materia_prima' || c.parentId === 'cat_mp'));
  }, [categories, mode]);

  const loadConfig = async () => {
    try {
      const c = await api.getComprasConfig();
      if (c) setConfig(c);
    } catch (e) { console.error(e); }
  };

  const loadCategories = async () => {
    try { setCategories(await api.getCategories()); }
    catch (e) { console.error(e); }
  };

  const loadItems = async () => {
    try { setItems(await api.getItems()); }
    catch (e) { console.error(e); }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await api.saveComprasConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); alert('Erro ao salvar configurações'); }
    finally { setSaving(false); }
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await api.saveCategory({ id: crypto.randomUUID(), name: newCatName.trim(), parentId: mode === 'materia_prima' ? 'cat_mp' : newCatParent });
      setNewCatName('');
      setNewCatParent(mode === 'materia_prima' ? 'cat_mp' : null);
      loadCategories();
    } catch (e) { console.error(e); alert('Erro ao criar categoria'); }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Excluir esta categoria? Os itens serão movidos para "Sem Categoria".')) return;
    try {
      await api.deleteCategory(id);
      if (selectedSubcategory?.id === id) {
        setSelectedSubcategory(null);
      }
      loadCategories();
      loadItems();
    } catch (e) { console.error(e); alert('Erro ao excluir categoria'); }
  };

  const getSubcategoryItemsCount = (subId: string) => {
    return items.filter(i => i.categoryId === subId).length;
  };

  const handleBatchRemoveFromCategory = async () => {
    if (subSelectedItems.size === 0 || !selectedSubcategory) return;
    if (!confirm(`Desassociar os ${subSelectedItems.size} insumos selecionados de "${selectedSubcategory.name}"?`)) return;
    
    try {
      await api.updateItemsCategory(Array.from(subSelectedItems), null);
      setSubSelectedItems(new Set());
      await loadItems();
    } catch (e) {
      console.error(e);
      alert('Erro ao desassociar insumos');
    }
  };

  const handleBatchAssignToCategory = async () => {
    if (modalSelectedItems.size === 0 || !selectedSubcategory) return;
    
    try {
      await api.updateItemsCategory(Array.from(modalSelectedItems), selectedSubcategory.id);
      setShowAssignModal(false);
      setModalSelectedItems(new Set());
      await loadItems();
    } catch (e) {
      console.error(e);
      alert('Erro ao associar insumos');
    }
  };

  const rootCats = categories.filter(c => !c.parentId && (mode !== 'materia_prima' || c.id === 'cat_mp'));
  const getChildren = (parentId: string) => categories.filter(c => c.parentId === parentId);

  const isExcludedItem = (item: Item) => {
    if (mode !== 'materia_prima') return false;
    if (!item.categoryId) return false;
    let currentId = item.categoryId;
    let visited = new Set<string>();
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const cat = categories.find(c => c.id === currentId);
      if (!cat) break;
      if (cat.id === 'cat_emb' || cat.id === 'cat_mat') {
        return true;
      }
      if (!cat.parentId) break;
      currentId = cat.parentId;
    }
    return false;
  };

  return (
    <div className="space-y-6 w-full pb-10">
      {/* Meta de Estoque */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50">
          <h3 className="font-semibold flex items-center gap-2">
            <Settings className="h-5 w-5 text-zinc-500" />
            Meta de Estoque Global
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-zinc-700 w-48">Dias-alvo de estoque:</label>
            <input type="number" value={config.targetDays}
              onChange={e => setConfig({ ...config, targetDays: Number(e.target.value) })}
              className="w-24 border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-900 focus:outline-none" />
            <span className="text-sm text-zinc-500">dias</span>
          </div>
          <p className="text-xs text-zinc-500">
            Define quantos dias de consumo futuro o estoque deve cobrir. O motor de demandas usa este valor para calcular a "Quantidade Recomendada".
          </p>
          <div className="flex items-center gap-3">
            <button onClick={saveConfig} disabled={saving}
              className="text-sm bg-zinc-900 text-white px-4 py-2 rounded-md font-medium hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-2 cursor-pointer">
              <Save className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar'}
            </button>
            {saved && <span className="text-sm text-emerald-600 font-medium">✓ Salvo!</span>}
          </div>
        </div>
      </div>

      {/* Abas no Menu Lateral */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50">
          <h3 className="font-semibold flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-zinc-500" />
            Atalhos no Menu Lateral (Abas de Subcategoria)
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-xs text-zinc-500">
            Selecione quais subcategorias de insumos você deseja fixar como atalhos diretos no menu lateral de Compras para acesso rápido:
          </p>
          {subcategoriesOnly.length === 0 ? (
            <div className="text-xs text-zinc-400 italic">Nenhuma subcategoria criada ainda. Crie abaixo primeiro.</div>
          ) : ( 
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {subcategoriesOnly.map(sub => {
                const isPinned = pinnedSubs.includes(sub.id);
                return (
                  <button
                    key={sub.id}
                    onClick={() => togglePinSubcategory(sub.id)}
                    className={cn(
                      "flex items-center gap-2.5 p-3 rounded-xl border text-left cursor-pointer transition-all text-xs font-bold shadow-xs",
                      isPinned 
                        ? "bg-zinc-900 border-zinc-900 text-white font-extrabold" 
                        : "bg-white border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 rounded flex items-center justify-center border",
                      isPinned ? "border-white bg-white text-zinc-900" : "border-zinc-300"
                    )}>
                      {isPinned && <span className="text-[10px] leading-none">✓</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{sub.name}</p>
                      <span className={cn("text-[9px] block font-mono font-medium", isPinned ? "text-zinc-300" : "text-zinc-400")}>
                        Pai: {sub.parentId === 'cat_mp' ? 'Matéria Prima' : sub.parentId === 'cat_emb' ? 'Embalagem' : 'Outro'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Categorias */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Lista de Categorias */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden lg:col-span-6 w-full">
          <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50">
            <h3 className="font-semibold flex items-center gap-2">
              <FolderTree className="h-5 w-5 text-zinc-500" />
              Categorias e Subcategorias
            </h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {rootCats.map(cat => (
                <div key={cat.id} className="border border-zinc-100 rounded-lg p-2 bg-zinc-50/30 space-y-1">
                  <div className="flex items-center justify-between py-1.5 px-3 bg-zinc-100/50 rounded-md">
                    <span className="font-bold text-sm text-zinc-800">{cat.name}</span>
                    {cat.id !== 'cat_mp' && cat.id !== 'cat_emb' && (
                      <button onClick={() => handleDeleteCategory(cat.id)}
                        className="text-zinc-400 hover:text-red-500 transition-colors cursor-pointer">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {getChildren(cat.id).map(sub => (
                    <div key={sub.id} className={cn(
                      "flex items-center justify-between py-1.5 px-3 pl-8 text-sm hover:bg-zinc-50 rounded-md transition-colors",
                      selectedSubcategory?.id === sub.id && "bg-zinc-200/50"
                    )}>
                      <button 
                        onClick={() => {
                          setSelectedSubcategory(sub);
                          setSubSelectedItems(new Set());
                        }}
                        className="text-zinc-700 hover:text-zinc-900 font-semibold cursor-pointer text-left flex-1"
                      >
                        ↳ {sub.name} <span className="text-xs text-zinc-400 ml-1 font-mono">({getSubcategoryItemsCount(sub.id)} itens)</span>
                      </button>
                      <button onClick={() => handleDeleteCategory(sub.id)}
                        className="text-zinc-400 hover:text-red-500 transition-colors cursor-pointer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {getChildren(cat.id).length === 0 && (
                    <p className="text-xs text-zinc-400 italic pl-8 py-1">Nenhuma subcategoria.</p>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-end gap-3 pt-4 border-t border-zinc-200">
              <div className="flex-1">
                <label className="text-xs font-medium text-zinc-600 mb-1 block">Nova Categoria / Subcategoria</label>
                <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)}
                  placeholder="Ex: Fragrâncias, Corantes..."
                  className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white" />
              </div>
              {mode !== 'materia_prima' && (
                <div>
                  <label className="text-xs font-medium text-zinc-600 mb-1 block">Pai (opcional)</label>
                  <select value={newCatParent || ''} onChange={e => setNewCatParent(e.target.value || null)}
                    className="border border-zinc-300 rounded-md px-2 py-2 text-sm focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white min-w-[120px]">
                    <option value="">Raiz</option>
                    {rootCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <button onClick={handleAddCategory} disabled={!newCatName.trim()}
                className="text-sm bg-zinc-900 text-white px-4 py-2 rounded-md font-medium hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-2 cursor-pointer shrink-0">
                <Plus className="h-4 w-4" /> Adicionar
              </button>
            </div>
          </div>
        </div>

        {/* Gerenciador de Itens de Subcategoria */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden lg:col-span-6 w-full min-h-[465px] flex flex-col justify-between">
          <div>
            <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50 flex justify-between items-center">
              <h3 className="font-semibold flex items-center gap-2">
                <Package className="h-5 w-5 text-zinc-500" />
                {selectedSubcategory ? `Insumos: ${selectedSubcategory.name}` : 'Gerenciador de Insumos'}
              </h3>
              {selectedSubcategory && (
                <button onClick={() => setSelectedSubcategory(null)} className="text-zinc-400 hover:text-zinc-600 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            
            <div className="p-6">
              {!selectedSubcategory ? (
                <div className="text-center py-20 text-zinc-400 flex flex-col items-center gap-2">
                  <FolderTree size={48} className="opacity-30" />
                  <p className="text-sm font-semibold">Gerenciador de Insumos</p>
                  <p className="text-xs max-w-xs mx-auto">Selecione uma subcategoria à esquerda para gerenciar e associar insumos em lote.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">
                      {getSubcategoryItemsCount(selectedSubcategory.id)} insumos associados
                    </span>
                    {items.filter(i => i.categoryId === selectedSubcategory.id).length > 0 && (
                      <button 
                        onClick={() => {
                          const currentSubItems = items.filter(i => i.categoryId === selectedSubcategory.id);
                          if (subSelectedItems.size === currentSubItems.length) {
                            setSubSelectedItems(new Set());
                          } else {
                            setSubSelectedItems(new Set(currentSubItems.map(i => i.code)));
                          }
                        }}
                        className="text-xs text-zinc-500 hover:text-zinc-800 font-bold cursor-pointer"
                      >
                        {subSelectedItems.size === items.filter(i => i.categoryId === selectedSubcategory.id).length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                      </button>
                    )}
                  </div>

                  <div className="border border-zinc-150 rounded-lg max-h-[250px] overflow-y-auto divide-y divide-zinc-100 bg-zinc-50/20 pr-1">
                    {items.filter(i => i.categoryId === selectedSubcategory.id).length === 0 ? (
                      <div className="text-center py-12 text-zinc-400 flex flex-col items-center justify-center gap-1.5">
                        <Package size={28} className="opacity-30" />
                        <p className="text-xs italic font-medium">Nenhum insumo associado a esta subcategoria.</p>
                        <p className="text-[10px]">Clique em "Associar Insumos" abaixo para começar.</p>
                      </div>
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
                            "flex items-center gap-3 py-2.5 px-3 hover:bg-zinc-50 cursor-pointer transition-colors",
                            subSelectedItems.has(item.code) && "bg-zinc-50"
                          )}
                        >
                          <input 
                            type="checkbox" 
                            checked={subSelectedItems.has(item.code)}
                            onChange={() => {}} // handled by click
                            className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 w-3.5 h-3.5 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-xs text-zinc-400 font-bold">{item.code}</div>
                            <div className="text-sm font-semibold text-zinc-850 truncate" title={item.description}>{item.description}</div>
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
                disabled={subSelectedItems.size === 0}
                className="text-sm text-red-650 hover:text-red-800 disabled:opacity-40 disabled:cursor-not-allowed font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Unlink className="w-4 h-4" /> Desassociar ({subSelectedItems.size})
              </button>
              <button 
                onClick={() => {
                  setModalSearch('');
                  setModalSelectedItems(new Set());
                  setShowAssignModal(true);
                }}
                className="text-sm bg-zinc-900 text-white px-4 py-2 rounded-lg font-bold hover:bg-zinc-800 flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
              >
                <Link className="w-4 h-4" /> Associar Insumos
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lista Negra de Insumos */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50">
          <h3 className="font-semibold flex items-center gap-2">
            <Package className="h-5 w-5 text-zinc-500" />
            Lista Negra de Insumos
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-zinc-500 leading-relaxed">
            Sincronize a lista negra de matérias-primas a partir de uma planilha Excel configurada localmente.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={async () => {
                try {
                  const rawData = obsData as any[];
                  const formatted = rawData.map((row: any) => ({
                    code: String(row['CÓDIGO'] || '').trim(),
                    notes: String(row['OBS'] || row['OBSERVAÇÃO'] || '').trim()
                  })).filter((r: any) => r.code);
                  
                  await api.importItemObservations(formatted);
                  alert('Lista negra sincronizada com sucesso!');
                  loadItems();
                } catch (e) {
                  console.error(e);
                  alert('Erro ao sincronizar lista negra. Verifique o console.');
                }
              }}
              className="flex items-center gap-2 px-6 py-2.5 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition-all shadow-sm cursor-pointer text-sm"
            >
              <Package className="w-4 h-4" />
              Sincronizar Lista Negra (XLSX)
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Associação em Lote */}
      {showAssignModal && selectedSubcategory && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50 shrink-0">
              <div>
                <h3 className="font-bold text-zinc-900 text-base">Associar Insumos a: {selectedSubcategory.name}</h3>
                <p className="text-xs text-zinc-500 font-medium">Selecione os insumos para adicionar a esta subcategoria</p>
              </div>
              <button onClick={() => setShowAssignModal(false)} className="text-zinc-400 hover:text-zinc-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search and Filters */}
            <div className="px-6 py-3 border-b border-zinc-100 bg-zinc-50/30 flex items-center justify-between gap-4 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input 
                  type="text"
                  placeholder="Buscar insumos por código ou descrição..."
                  value={modalSearch}
                  onChange={e => setModalSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-sm"
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
                className="text-xs text-zinc-600 hover:text-zinc-900 font-semibold cursor-pointer shrink-0"
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
                  // Don't show items already in this subcategory
                  if (item.categoryId === selectedSubcategory.id) return false;
                  if (isExcludedItem(item)) return false;
                  
                  const matchesSearch = !modalSearch.trim() || 
                    (item.code || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
                    (item.description || '').toLowerCase().includes(modalSearch.toLowerCase());
                  
                  return matchesSearch;
                });

                if (filtered.length === 0) {
                  return <p className="text-center py-12 text-zinc-400 text-sm font-medium">Nenhum insumo encontrado para associar.</p>;
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
                        modalSelectedItems.has(item.code) && "bg-zinc-50"
                      )}
                    >
                      <input 
                        type="checkbox" 
                        checked={modalSelectedItems.has(item.code)}
                        onChange={() => {}} // handled by row click
                        className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 w-4 h-4 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="font-mono text-xs text-zinc-400 font-bold">{item.code}</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                            item.categoryId ? "bg-zinc-100 text-zinc-650" : "bg-emerald-50 text-emerald-600"
                          )}>
                            {catLabel}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-zinc-800 truncate" title={item.description}>
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
                className="px-4 py-2 text-sm font-bold text-zinc-500 hover:text-zinc-700 cursor-pointer">
                Cancelar
              </button>
              <button 
                onClick={handleBatchAssignToCategory}
                disabled={modalSelectedItems.size === 0}
                className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-zinc-800 disabled:opacity-50 transition-all shadow-md cursor-pointer text-sm">
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

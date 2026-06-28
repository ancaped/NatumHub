import React, { useState, useEffect, useMemo } from 'react';
import { Search, Trash2, Edit2, Plus, Package, EyeOff, Save, X, ArrowUpDown, ArrowUp, ArrowDown, Info, Calendar, Layers, ClipboardList, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Item, Category } from '../../types';

const API_BASE = 'http://127.0.0.1:3001/api';

interface ItemRegistryProps {
  mode?: string;
  active?: boolean;
  showIgnoredOnly?: boolean;
}

export default function ItemRegistry({ mode = 'all', active = false, showIgnoredOnly = false }: ItemRegistryProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sortKey, setSortKey] = useState<'code' | 'description' | 'unit' | 'isIgnored'>('code');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  
  // Details Modal States
  const [detailsItem, setDetailsItem] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsActiveTab, setDetailsActiveTab] = useState<'geral' | 'produtos' | 'compras'>('geral');

  const handleShowDetails = async (code: string) => {
    setDetailsActiveTab('geral');
    setDetailsLoading(true);
    setDetailsOpen(true);
    setDetailsItem(null);
    try {
      const res = await fetch(`${API_BASE}/compras/insumos/${code}/detalhes`);
      if (res.ok) {
        const data = await res.json();
        setDetailsItem(data);
      } else {
        alert("Erro ao buscar detalhes do insumo");
      }
    } catch (e) {
      console.error(e);
      alert("Falha de conexão com o servidor local");
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    if (active) {
      loadData();
    }
  }, [active]);

  const loadData = async () => {
    setLoading(true);
    try {
      let itemsData: Item[];
      if (mode === 'coloracao' || mode === 'apoio') {
        const res = await fetch(`${API_BASE}/products?limit=5000&status=${mode}&show_hidden=true`);
        if (res.ok) {
          const data = await res.json();
          itemsData = (data.items || []).map((p: any) => ({
            code: p.codigo,
            description: p.descricao,
            unit: 'UN',
            categoryId: p.categoria_produto || null,
            isIgnored: p.visivel === 0,
            notes: p.observacao || '',
            // Additional product override fields
            estoque_ideal_manual: p.estoque_ideal_manual,
            pedidos_manual: p.pedidos_manual,
            media_manual: p.media_manual,
            is_lancamento_manual: p.is_lancamento_manual,
            linha_prefix_manual: p.linha_prefix_manual,
            status_produto: p.status_produto,
            categoria_produto: p.categoria_produto,
            produzir_apenas_kit: p.produzir_apenas_kit,
            isProduct: true
          }));
        } else {
          itemsData = [];
        }
      } else {
        itemsData = await api.getItems();
      }
      const catsData = await api.getCategories();
      setItems(itemsData);
      setCategories(catsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateItem = async () => {
    if (!editingItem) return;
    setIsSaving(true);
    try {
      if ((editingItem as any).isProduct) {
        const p = editingItem as any;
        const res = await fetch(`${API_BASE}/overrides`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            codigo: p.code,
            estoque_ideal_manual: p.estoque_ideal_manual ?? null,
            pedidos_manual: p.pedidos_manual ?? null,
            media_manual: p.media_manual ?? null,
            is_lancamento_manual: p.is_lancamento_manual ?? null,
            visivel: p.isIgnored ? 0 : 1,
            observacao: p.notes?.trim() || null,
            linha_prefix_manual: p.linha_prefix_manual ?? null,
            status_produto: p.status_produto ?? null,
            categoria_produto: p.categoria_produto ?? null,
            produzir_apenas_kit: p.produzir_apenas_kit ?? null
          })
        });
        if (!res.ok) {
          throw new Error("Erro ao salvar overrides do produto");
        }
      } else {
        await api.updateItemDetails(editingItem.code, editingItem.notes, editingItem.isIgnored);
      }
      await loadData();
      setEditingItem(null);
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar item');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSort = (key: 'code' | 'description' | 'unit' | 'isIgnored') => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: 'code' | 'description' | 'unit' | 'isIgnored' }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 text-zinc-300" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 text-zinc-700" />
      : <ArrowDown className="h-3 w-3 text-zinc-700" />;
  };

  const filteredAndSortedItems = useMemo(() => {
    let result = items;
    if (showIgnoredOnly) {
      result = result.filter(i => i.isIgnored);
    }
    if (mode === 'materia_prima') {
      result = result.filter(i => {
        const cat = categories.find(c => c.id === i.categoryId);
        return i.categoryId === 'cat_mp' || (cat && cat.parentId === 'cat_mp');
      });
    } else if (mode === 'embalagens') {
      result = result.filter(i => {
        const cat = categories.find(c => c.id === i.categoryId);
        return i.categoryId === 'cat_emb' || (cat && cat.parentId === 'cat_emb');
      });
    }

    const filtered = result.filter(i => 
      (i.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (i.code || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return [...filtered].sort((a, b) => {
      if (sortKey === 'isIgnored') {
        const aNum = a.isIgnored ? 1 : 0;
        const bNum = b.isIgnored ? 1 : 0;
        return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
      }
      const aVal = a[sortKey] || '';
      const bVal = b[sortKey] || '';
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [items, categories, searchTerm, sortKey, sortDir, mode, showIgnoredOnly]);

  if (loading) return <div className="p-8 text-center text-zinc-500 font-medium">Carregando cadastro...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">
            {showIgnoredOnly ? 'Itens Suspensos' : 'Cadastro de Insumos'}
          </h2>
          <p className="text-sm text-zinc-500 font-medium">
            {filteredAndSortedItems.length} {showIgnoredOnly ? 'itens suspensos/desconsiderados' : 'itens cadastrados'}
          </p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar por código ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-all text-sm"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50/80 text-zinc-500 border-b border-zinc-200">
              <tr>
                <th className="px-6 py-4 font-semibold cursor-pointer hover:text-zinc-900" onClick={() => toggleSort('code')}>
                  <span className="flex items-center gap-1">Código <SortIcon col="code" /></span>
                </th>
                <th className="px-6 py-4 font-semibold cursor-pointer hover:text-zinc-900" onClick={() => toggleSort('description')}>
                  <span className="flex items-center gap-1">Descrição <SortIcon col="description" /></span>
                </th>
                <th className="px-6 py-4 font-semibold cursor-pointer hover:text-zinc-900" onClick={() => toggleSort('unit')}>
                  <span className="flex items-center gap-1">Unidade <SortIcon col="unit" /></span>
                </th>
                <th className="px-6 py-4 font-semibold cursor-pointer hover:text-zinc-900" onClick={() => toggleSort('isIgnored')}>
                  <span className="flex items-center gap-1">Status <SortIcon col="isIgnored" /></span>
                </th>
                <th className="px-6 py-4 font-semibold">Observação</th>
                <th className="px-6 py-4 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredAndSortedItems.map((item) => (
                <tr 
                  key={item.code} 
                  className={`hover:bg-zinc-50/50 transition-colors group cursor-pointer ${item.isIgnored ? 'bg-zinc-50/50' : ''}`}
                >
                  <td 
                    onClick={() => handleShowDetails(item.code)} 
                    className="px-6 py-4 font-mono text-zinc-650 font-bold hover:underline"
                  >
                    {item.code}
                  </td>
                  <td 
                    onClick={() => handleShowDetails(item.code)} 
                    className="px-6 py-4 font-semibold text-zinc-800 hover:underline"
                  >
                    <div className="flex items-center gap-2">
                      <span>{item.description}</span>
                      {item.isIgnored && <span title="Ignorado nas demandas"><EyeOff className="w-3 h-3 text-zinc-400" /></span>}
                    </div>
                  </td>
                  <td 
                    onClick={() => handleShowDetails(item.code)} 
                    className="px-6 py-4 text-zinc-500"
                  >
                    {item.unit}
                  </td>
                  <td 
                    onClick={() => handleShowDetails(item.code)} 
                    className="px-6 py-4"
                  >
                    {item.isIgnored ? (
                      item.isAutoIgnored ? (
                        <span title={item.ignoredReason || 'Ignorado automaticamente'} className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded text-[10px] font-bold uppercase cursor-help">
                          Suspenso (Auto)
                        </span>
                      ) : (
                        <span title="Ignorado manualmente" className="px-2 py-0.5 bg-zinc-100 text-zinc-500 rounded text-[10px] font-bold uppercase">
                          Ignorado
                        </span>
                      )
                    ) : (
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[10px] font-bold uppercase">Ativo</span>
                    )}
                  </td>
                  <td 
                    onClick={() => handleShowDetails(item.code)} 
                    className="px-6 py-4 text-zinc-500 max-w-xs truncate" 
                    title={item.notes || item.ignoredReason || ''}
                  >
                    {item.notes || item.ignoredReason || '-'}
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditingItem(item); }}
                      className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-650 transition-colors cursor-pointer" 
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
              <h3 className="font-bold text-zinc-900">Editar Detalhes do Item</h3>
              <button onClick={() => setEditingItem(null)} className="text-zinc-400 hover:text-zinc-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Item</p>
                <p className="font-bold text-zinc-900">{editingItem.code} - {editingItem.description}</p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-700 block">Observações / Notas</label>
                <textarea 
                  value={editingItem.notes || ''}
                  onChange={e => setEditingItem({...editingItem, notes: e.target.value})}
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-zinc-900 focus:outline-none min-h-[100px] resize-none"
                  placeholder="Ex: Item terceirizado, produzido internamente, etc..."
                />
              </div>

              {editingItem.isAutoIgnored && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <EyeOff className="w-3.5 h-3.5" /> Item Suspenso por Linha/Produto
                  </div>
                  <p>Este insumo foi suspenso automaticamente pois todos os produtos vinculados a ele estão em status ignorado (ex: Sair de Linha ou Terceirizado).</p>
                  <p className="font-mono text-[10px] text-amber-900/80 leading-tight bg-white/50 p-2 rounded border border-amber-100/50 break-words">{editingItem.ignoredReason}</p>
                </div>
              )}

              <div className="flex items-center gap-3 p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                <input 
                  type="checkbox" 
                  id="ignore_check"
                  checked={editingItem.isIgnored}
                  onChange={e => setEditingItem({...editingItem, isIgnored: e.target.checked})}
                  disabled={editingItem.isAutoIgnored}
                  className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 disabled:opacity-50"
                />
                <label htmlFor="ignore_check" className={`text-sm font-medium text-zinc-700 cursor-pointer ${editingItem.isAutoIgnored ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  Ignorar este item nas demandas de compra {editingItem.isAutoIgnored && '(Forçado por Auto)'}
                </label>
              </div>
            </div>
            <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex justify-end gap-3">
              <button 
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 text-sm font-bold text-zinc-500 hover:text-zinc-700">
                Cancelar
              </button>
              <button 
                onClick={handleUpdateItem}
                disabled={isSaving}
                className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-2 rounded-xl font-bold hover:bg-zinc-800 disabled:opacity-50 transition-all shadow-md">
                <Save className="w-4 h-4" />
                {isSaving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Drawer */}
      {detailsOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end">
          <div className="absolute inset-0 cursor-pointer" onClick={() => setDetailsOpen(false)} />
          <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 z-10 text-left">
            <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50 shrink-0">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Ficha de Insumo Suspenso</span>
                <h3 className="font-bold text-zinc-900 text-lg mt-0.5">
                  {detailsLoading ? 'Carregando detalhes...' : (detailsItem?.description || 'Detalhes do Insumo')}
                </h3>
                <p className="text-xs text-zinc-500 font-mono mt-0.5">REF: {detailsLoading ? '...' : detailsItem?.code}</p>
              </div>
              <button onClick={() => setDetailsOpen(false)} className="text-zinc-400 hover:text-zinc-650 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-zinc-150 bg-zinc-50/50 px-6 shrink-0">
              <button
                onClick={() => setDetailsActiveTab('geral')}
                className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer focus:outline-none ${
                  detailsActiveTab === 'geral' 
                    ? 'border-zinc-900 text-zinc-900 font-extrabold' 
                    : 'border-transparent text-zinc-450 hover:text-zinc-650'
                }`}
              >
                Geral
              </button>
              <button
                onClick={() => setDetailsActiveTab('produtos')}
                className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer focus:outline-none ${
                  detailsActiveTab === 'produtos' 
                    ? 'border-zinc-900 text-zinc-900 font-extrabold' 
                    : 'border-transparent text-zinc-450 hover:text-zinc-650'
                }`}
              >
                Produtos Vinculados
              </button>
              <button
                onClick={() => setDetailsActiveTab('compras')}
                className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer focus:outline-none ${
                  detailsActiveTab === 'compras' 
                    ? 'border-zinc-900 text-zinc-900 font-extrabold' 
                    : 'border-transparent text-zinc-450 hover:text-zinc-650'
                }`}
              >
                Histórico de Compras
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {detailsLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-450">
                  <RefreshCw className="h-8 w-8 animate-spin text-zinc-550" />
                  <span className="font-semibold text-sm">Carregando dados e histórico...</span>
                </div>
              ) : detailsItem ? (
                <>
                  {/* TAB CONTENT: GERAL */}
                  {detailsActiveTab === 'geral' && (
                    <div className="space-y-6">
                      {/* Top Overview Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-zinc-50 border border-zinc-100 p-4 rounded-xl shadow-sm text-left">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase block">Estoque Atual</span>
                          <p className="text-lg font-extrabold text-zinc-900 mt-1">
                            {(detailsItem.currentStock ?? 0).toLocaleString('pt-BR')}{' '}
                            <span className="text-xs font-semibold text-zinc-550">{detailsItem.unit}</span>
                          </p>
                        </div>
                        <div className="bg-zinc-50 border border-zinc-100 p-4 rounded-xl shadow-sm text-left">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase block">Categoria</span>
                          <p className="text-base font-extrabold text-zinc-900 mt-1.5 truncate">
                            {detailsItem.categoryName || '-'}
                          </p>
                        </div>
                        <div className="bg-zinc-50 border border-zinc-100 p-4 rounded-xl shadow-sm text-left">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase block">Status Interno</span>
                          <p className="mt-1.5">
                            <span className="inline-flex px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded text-[10px] font-bold uppercase">
                              Suspenso
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* Usage and Last Used Dates */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border border-zinc-150 rounded-xl p-4 space-y-2 text-left bg-zinc-50/20">
                          <div className="flex items-center gap-1.5 text-zinc-700 font-bold text-xs">
                            <Calendar className="w-4 h-4 text-zinc-500" />
                            <span>Último Uso na Produção</span>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-zinc-800">
                              Data: {detailsItem.lastUsedDate ? new Date(detailsItem.lastUsedDate).toLocaleDateString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Nunca utilizado na produção'}
                            </p>
                            {detailsItem.lastUsedLote && (
                              <p className="text-xs text-zinc-550 font-mono">
                                Lote de Produção: {detailsItem.lastUsedLote}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="border border-zinc-150 rounded-xl p-4 space-y-2 text-left bg-zinc-50/20">
                          <div className="flex items-center gap-1.5 text-zinc-700 font-bold text-xs">
                            <ClipboardList className="w-4 h-4 text-zinc-500" />
                            <span>Último Recebimento (NF)</span>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-zinc-800">
                              Data: {detailsItem.lastReceivedDate ? new Date(detailsItem.lastReceivedDate).toLocaleDateString('pt-BR') : 'Nenhuma nota registrada'}
                            </p>
                            {detailsItem.lastReceivedDoc && (
                              <p className="text-xs text-zinc-550">
                                Documento/NF: {detailsItem.lastReceivedDoc}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Manual Observations */}
                      {detailsItem.notes && (
                        <div className="p-4 bg-zinc-50/55 border border-zinc-150 rounded-xl text-xs space-y-1.5 text-left">
                          <div className="font-bold text-zinc-700">Observações de Suspensão:</div>
                          <p className="text-zinc-600 whitespace-pre-wrap">{detailsItem.notes}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB CONTENT: PRODUTOS VINCULADOS */}
                  {detailsActiveTab === 'produtos' && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
                        <Layers className="h-4 w-4 text-zinc-650" />
                        <h4 className="font-extrabold text-sm text-zinc-900">Produtos Vinculados</h4>
                      </div>
                      {(!detailsItem.productsUsedIn || detailsItem.productsUsedIn.length === 0) ? (
                        <p className="text-xs text-zinc-450 bg-zinc-50 p-4 rounded-xl text-center border border-zinc-100">Este insumo não está vinculado a nenhuma fórmula de produto.</p>
                      ) : (
                        <div className="bg-white border border-zinc-150 rounded-xl overflow-hidden shadow-sm">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-zinc-50 font-bold text-zinc-555 border-b border-zinc-150">
                              <tr>
                                <th className="px-4 py-3">Código</th>
                                <th className="px-4 py-3">Produto Descrição</th>
                                <th className="px-4 py-3 text-right">Proporção por Unidade</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 font-medium">
                              {detailsItem.productsUsedIn.map((p: any) => (
                                <tr key={p.productCode} className="hover:bg-zinc-50/50 transition-colors">
                                  <td className="px-4 py-2.5 font-mono text-zinc-650">{p.productCode}</td>
                                  <td className="px-4 py-2.5 font-semibold text-zinc-800">{p.description}</td>
                                  <td className="px-4 py-2.5 text-right font-mono text-zinc-650">
                                    {p.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 5 })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB CONTENT: COMPRAS / NOTAS FISCAIS */}
                  {detailsActiveTab === 'compras' && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
                        <ClipboardList className="h-4 w-4 text-zinc-650" />
                        <h4 className="font-extrabold text-sm text-zinc-900">Histórico de Compras (Notas Fiscais)</h4>
                      </div>
                      {(!detailsItem.recentInvoices || detailsItem.recentInvoices.length === 0) ? (
                        <p className="text-xs text-zinc-450 bg-zinc-50 p-4 rounded-xl text-center border border-zinc-100">Nenhuma nota fiscal de compra recente registrada para este insumo.</p>
                      ) : (
                        <div className="bg-white border border-zinc-150 rounded-xl overflow-hidden shadow-sm">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-zinc-50 font-bold text-zinc-555 border-b border-zinc-150">
                              <tr>
                                <th className="px-4 py-3">Número NF</th>
                                <th className="px-4 py-3">Fornecedor</th>
                                <th className="px-4 py-3">Data Emissão</th>
                                <th className="px-4 py-3 text-right">Qtd Comprada</th>
                                <th className="px-4 py-3 text-right">Preço Unitário</th>
                                <th className="px-4 py-3 text-right">Valor Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 font-medium">
                              {detailsItem.recentInvoices.map((inv: any, idx: number) => (
                                <tr key={idx} className="hover:bg-zinc-50/50 transition-colors">
                                  <td className="px-4 py-2.5 font-mono text-zinc-650">{inv.invoiceNumber}</td>
                                  <td className="px-4 py-2.5 font-semibold text-zinc-800 max-w-[150px] truncate" title={inv.supplierName}>{inv.supplierName}</td>
                                  <td className="px-4 py-2.5 text-zinc-600">
                                    {new Date(inv.invoiceDate).toLocaleDateString('pt-BR')}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono text-zinc-650">
                                    {inv.quantity.toLocaleString('pt-BR')}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono text-zinc-650">
                                    {inv.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono font-bold text-zinc-900">
                                    {inv.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center text-zinc-450 py-12">Não foi possível carregar os detalhes.</div>
              )}
            </div>

            <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex justify-end shrink-0">
              <button 
                onClick={() => setDetailsOpen(false)}
                className="px-6 py-2 text-sm font-bold bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 shadow transition-colors cursor-pointer">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

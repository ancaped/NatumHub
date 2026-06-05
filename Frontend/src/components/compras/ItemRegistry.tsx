import React, { useState, useEffect, useMemo } from 'react';
import { Search, Trash2, Edit2, Plus, Package, EyeOff, Save, X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { api } from '../../lib/api';
import { Item, Category } from '../../types';

export default function ItemRegistry() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sortKey, setSortKey] = useState<'code' | 'description' | 'unit' | 'isIgnored'>('code');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [itemsData, catsData] = await Promise.all([
        api.getItems(),
        api.getCategories()
      ]);
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
      await api.updateItemDetails(editingItem.code, editingItem.notes, editingItem.isIgnored);
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
    const filtered = items.filter(i => 
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
  }, [items, searchTerm, sortKey, sortDir]);

  if (loading) return <div className="p-8 text-center text-zinc-500 font-medium">Carregando cadastro...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Cadastro de Insumos</h2>
          <p className="text-sm text-zinc-500 font-medium">{items.length} itens cadastrados</p>
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
                <tr key={item.code} className={`hover:bg-zinc-50/50 transition-colors group ${item.isIgnored ? 'bg-zinc-50/50' : ''}`}>
                  <td className="px-6 py-4 font-mono text-zinc-600 font-medium">{item.code}</td>
                  <td className="px-6 py-4 font-semibold text-zinc-800">
                    <div className="flex items-center gap-2">
                      {item.description}
                      {item.isIgnored && <EyeOff className="w-3 h-3 text-zinc-400" title="Ignorado nas demandas" />}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-zinc-500">{item.unit}</td>
                  <td className="px-6 py-4">
                    {item.isIgnored ? (
                      <span className="px-2 py-0.5 bg-zinc-100 text-zinc-500 rounded text-[10px] font-bold uppercase">Ignorado</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[10px] font-bold uppercase">Ativo</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-zinc-500 max-w-xs truncate">{item.notes || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => setEditingItem(item)}
                      className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-600 transition-colors" title="Editar">
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

              <div className="flex items-center gap-3 p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                <input 
                  type="checkbox" 
                  id="ignore_check"
                  checked={editingItem.isIgnored}
                  onChange={e => setEditingItem({...editingItem, isIgnored: e.target.checked})}
                  className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <label htmlFor="ignore_check" className="text-sm font-medium text-zinc-700 cursor-pointer">
                  Ignorar este item nas demandas de compra
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
    </div>
  );
}

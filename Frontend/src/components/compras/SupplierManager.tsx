import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api';
import { Supplier, Invoice, PricePoint } from '../../types';
import { Users, Plus, Search, ArrowLeft, Phone, Mail, FileText, TrendingUp, X, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export function SupplierManager({ mode = 'all' }: { mode?: 'materia_prima' | 'embalagens' | 'all' }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [history, setHistory] = useState<{ invoices: Invoice[]; pricePoints: PricePoint[] } | null>(null);
  const [sortKey, setSortKey] = useState<'name' | 'email'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => { loadSuppliers(); }, [mode]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const data = await api.getSuppliers(mode);
      setSuppliers(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!editing) return;
    try {
      await api.saveSupplier(editing);
      setEditing(null);
      loadSuppliers();
    } catch (e) { console.error(e); alert('Erro ao salvar fornecedor'); }
  };

  const openDetail = async (id: string) => {
    setDetailId(id);
    try {
      const data = await api.getSupplierHistory(id);
      setHistory(data);
    } catch (e) { console.error(e); }
  };

  const filtered = suppliers.filter(s =>
    (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.contact || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const sortedSuppliers = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey] || '';
      const bVal = b[sortKey] || '';
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [filtered, sortKey, sortDir]);

  const formatCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  const formatDate = (d: string) => {
    if (!d) return '-';
    try { return new Intl.DateTimeFormat('pt-BR').format(new Date(d)); }
    catch { return d; }
  };

  // === DETAIL VIEW ===
  if (detailId) {
    const supplier = suppliers.find(s => s.id === detailId);
    if (!supplier) return null;

    return (
      <div className="space-y-6">
        <button onClick={() => { setDetailId(null); setHistory(null); }}
          className="flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Voltar para lista
        </button>

        <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-zinc-900">{supplier.name}</h2>
              <div className="flex items-center gap-4 mt-2 text-sm text-zinc-500">
                {supplier.contact && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{supplier.contact}</span>}
                {supplier.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{supplier.email}</span>}
              </div>
            </div>
            {mode === 'all' && (
              <button onClick={() => setEditing(supplier)}
                className="text-sm px-3 py-1.5 border border-zinc-300 rounded-md hover:bg-zinc-50">
                Editar
              </button>
            )}
          </div>

          {supplier.notes && (
            <p className="text-sm text-zinc-600 bg-zinc-50 p-3 rounded-lg border border-zinc-100">{supplier.notes}</p>
          )}
        </div>

        {/* Invoice History */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50">
            <h3 className="font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-zinc-500" />
              Últimas Notas Fiscais ({history?.invoices?.length || 0})
            </h3>
          </div>
          <div className="max-h-96 overflow-auto">
            {history?.invoices && history.invoices.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-zinc-600">NF</th>
                    <th className="px-4 py-2 text-left font-medium text-zinc-600">Item</th>
                    <th className="px-4 py-2 text-left font-medium text-zinc-600">Descrição</th>
                    <th className="px-4 py-2 text-right font-medium text-zinc-600">Qtd</th>
                    <th className="px-4 py-2 text-right font-medium text-zinc-600">Vlr Unit.</th>
                    <th className="px-4 py-2 text-right font-medium text-zinc-600">Total</th>
                    <th className="px-4 py-2 text-right font-medium text-zinc-600">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {history.invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-2 font-mono text-xs">{inv.invoiceNumber}</td>
                      <td className="px-4 py-2 font-mono text-xs">{inv.itemCode}</td>
                      <td className="px-4 py-2 truncate max-w-48">{inv.description}</td>
                      <td className="px-4 py-2 text-right">{inv.quantity.toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(inv.unitPrice)}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatCurrency(inv.totalValue)}</td>
                      <td className="px-4 py-2 text-right text-zinc-500">{formatDate(inv.invoiceDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="p-6 text-center text-zinc-500">Nenhuma NF encontrada para este fornecedor.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // === LIST VIEW ===
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            type="text" placeholder="Buscar fornecedor..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 text-sm border-none bg-transparent focus:outline-none placeholder:text-zinc-400"
          />
        </div>
        <div className="flex items-center gap-2 border-l border-zinc-200 pl-4 ml-4">
          <span className="text-xs text-zinc-500 font-semibold uppercase">Ordenar:</span>
          <select 
            value={sortKey} 
            onChange={e => setSortKey(e.target.value as 'name' | 'email')}
            className="text-xs border border-zinc-300 rounded px-2 py-1 bg-white focus:outline-none"
          >
            <option value="name">Nome</option>
            <option value="email">Email</option>
          </select>
          <button 
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            className="p-1 hover:bg-zinc-100 rounded text-zinc-500"
            title={sortDir === 'asc' ? 'Crescente' : 'Decrescente'}
          >
            {sortDir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          </button>
        </div>
        {mode === 'all' && (
          <button onClick={() => setEditing({ id: crypto.randomUUID(), name: '', contact: '', email: '', notes: '' })}
            className="text-sm bg-zinc-900 text-white px-4 py-2 rounded-md font-medium hover:bg-zinc-800 flex items-center gap-2 ml-auto">
            <Plus className="h-4 w-4" /> Novo Fornecedor
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedSuppliers.map(s => (
          <div key={s.id} onClick={() => openDetail(s.id)}
            className="bg-white border border-zinc-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group">
            <h3 className="font-semibold text-zinc-900 group-hover:text-blue-600 transition-colors truncate">{s.name}</h3>
            <div className="mt-3 space-y-1.5 text-sm text-zinc-500">
              {s.contact && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-zinc-400" />{s.contact}</p>}
              {s.email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-zinc-400" />{s.email}</p>}
              {!s.contact && !s.email && <p className="text-zinc-400 italic">Sem contato cadastrado</p>}
            </div>
          </div>
        ))}
      </div>

      {sortedSuppliers.length === 0 && !loading && (
        <div className="text-center py-16 text-zinc-500 flex flex-col items-center gap-2">
          <Users className="h-10 w-10 text-zinc-300" />
          <p>Nenhum fornecedor encontrado.</p>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
              <h3 className="font-bold text-lg">{editing.name ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h3>
              <button onClick={() => setEditing(null)}><X className="h-5 w-5 text-zinc-400 hover:text-zinc-900" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-zinc-700 mb-1 block">Nome *</label>
                <input type="text" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
                  className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-900 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-zinc-700 mb-1 block">Contato</label>
                  <input type="text" value={editing.contact || ''} onChange={e => setEditing({ ...editing, contact: e.target.value })}
                    placeholder="(xx) xxxxx-xxxx"
                    className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-900 focus:outline-none" />
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-700 mb-1 block">Email</label>
                  <input type="email" value={editing.email || ''} onChange={e => setEditing({ ...editing, email: e.target.value })}
                    className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-900 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700 mb-1 block">Observações</label>
                <textarea value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} rows={3}
                  className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-900 focus:outline-none resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-200 bg-zinc-50 rounded-b-xl">
              <button onClick={() => setEditing(null)} className="text-sm px-4 py-2 border border-zinc-300 rounded-md hover:bg-zinc-100">Cancelar</button>
              <button onClick={handleSave} disabled={!editing.name.trim()}
                className="text-sm bg-zinc-900 text-white px-4 py-2 rounded-md font-medium hover:bg-zinc-800 disabled:opacity-50">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

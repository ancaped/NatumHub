import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, Search, FileText, RefreshCw, Calendar, Package,
  User, FileSpreadsheet, ChevronRight, Hash, Truck, DollarSign, Info, X, Receipt
} from 'lucide-react';
import { cn, API_BASE, apiFetch } from '../lib/utils';


interface NotasFiscaisViewProps {
  onBackToHub: () => void;
}

interface InvoiceHeader {
  invoiceNumber: string;
  invoiceDate: string | null;
  supplierId: string | null;
  supplierName: string | null;
  totalValue: number;
  itemsCount: number;
}

interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  itemCode: string;
  description: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  supplierName: string | null;
  supplierId: string | null;
  invoiceDate: string | null;
}

interface InvoiceDetail {
  invoiceNumber: string;
  invoiceDate: string | null;
  supplierId: string | null;
  supplierName: string | null;
  totalValue: number;
  items: InvoiceItem[];
}

export default function NotasFiscaisView({ onBackToHub }: NotasFiscaisViewProps) {
  const [invoices, setInvoices] = useState<InvoiceHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Detail drawer
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      const res = await apiFetch(`${API_BASE}/compras/notas?${params.toString()}`);
      if (res.ok) {
        setInvoices(await res.json());
      }
    } catch (e) {
      console.error("Erro ao carregar notas fiscais:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
    (window as any).__current_page__ = "Módulo de Compras > Notas Fiscais";
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => { loadInvoices(); }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const handleOpenDetail = async (invoiceNumber: string, supplierId: string | null) => {
    setDrawerLoading(true);
    setSelectedInvoice(null);
    try {
      const params = new URLSearchParams();
      if (supplierId) params.set('supplier_id', supplierId);
      const res = await apiFetch(`${API_BASE}/compras/notas/${invoiceNumber}?${params.toString()}`);
      if (res.ok) {
        setSelectedInvoice(await res.json());
      }
    } catch (e) {
      console.error("Erro ao carregar detalhes da nota fiscal:", e);
    } finally {
      setDrawerLoading(false);
    }
  };

  const formatCurrency = (val: number) =>
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    try {
      const date = new Date(d);
      return date.toLocaleDateString('pt-BR');
    } catch {
      return d;
    }
  };

  // Summary stats
  const stats = useMemo(() => {
    const totalInvoices = invoices.length;
    const totalValue = invoices.reduce((acc, inv) => acc + (inv.totalValue || 0), 0);
    const uniqueSuppliers = new Set(invoices.map(inv => inv.supplierId).filter(Boolean)).size;
    const totalItems = invoices.reduce((acc, inv) => acc + (inv.itemsCount || 0), 0);
    return { totalInvoices, totalValue, uniqueSuppliers, totalItems };
  }, [invoices]);

  return (
    <div className="flex h-screen bg-zinc-50 font-sans text-zinc-900 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-zinc-200 flex flex-col shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-zinc-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-zinc-900 text-white p-2 rounded-xl shadow-sm">
              <FileText className="h-5 w-5" />
            </div>
            <h1 className="font-bold text-base tracking-tight text-zinc-800 uppercase">Notas Fiscais</h1>
          </div>
        </div>

        {/* Back Button */}
        <div className="p-3 border-b border-zinc-100">
          <button
            onClick={onBackToHub}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-all cursor-pointer border border-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4 text-zinc-400" />
            Voltar ao Hub de Compras
          </button>
        </div>

        {/* Info panel */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200/50 space-y-4">
            <div className="flex items-center gap-2 text-zinc-600">
              <Info size={14} className="text-zinc-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Histórico Local</span>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Exibindo registros de compras importados diretamente do servidor SQL local correspondentes aos últimos 48 meses.
            </p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="p-4 border-t border-zinc-200 bg-zinc-50/50 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-zinc-400 font-bold uppercase">Total Notas</span>
            <span className="text-sm font-extrabold text-zinc-900">{stats.totalInvoices}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-zinc-400 font-bold uppercase">Valor Comprado</span>
            <span className="text-xs font-bold text-zinc-700">{formatCurrency(stats.totalValue)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-zinc-400 font-bold uppercase">Fornecedores</span>
            <span className="text-xs font-bold text-zinc-700">{stats.uniqueSuppliers}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-zinc-400 font-bold uppercase">Qtd de Itens</span>
            <span className="text-xs font-bold text-zinc-700">{stats.totalItems}</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-8 shrink-0">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-900">Histórico de Notas Fiscais de Compra</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Consulte lançamentos fiscais, itens faturados, fornecedores e valores unitários praticados.
            </p>
          </div>
          <button
            onClick={loadInvoices}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-xs font-bold text-zinc-700 transition-all cursor-pointer border border-zinc-200"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Search bar */}
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Buscar por nº nota ou razão social..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-all text-sm shadow-sm"
                />
              </div>
              <div className="text-xs font-semibold text-zinc-500 bg-zinc-100 px-3 py-1.5 rounded-lg">
                {invoices.length} notas fiscais
              </div>
            </div>

            {/* Invoices Table */}
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                {loading ? (
                  <div className="p-12 text-center text-zinc-400 font-semibold flex items-center justify-center gap-3">
                    <RefreshCw className="h-5 w-5 animate-spin text-zinc-500" />
                    Carregando notas fiscais...
                  </div>
                ) : invoices.length === 0 ? (
                  <div className="p-12 text-center text-zinc-400">Nenhuma nota fiscal encontrada.</div>
                ) : (
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-semibold">
                      <tr>
                        <th className="px-6 py-4">Nº Nota</th>
                        <th className="px-6 py-4">Data Emissão</th>
                        <th className="px-6 py-4">Fornecedor</th>
                        <th className="px-6 py-4 text-center">Itens Faturados</th>
                        <th className="px-6 py-4 text-right">Valor Nota</th>
                        <th className="px-6 py-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {invoices.map((inv) => (
                        <tr key={`${inv.invoiceNumber}-${inv.supplierId}`} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-4 font-mono text-xs font-bold text-zinc-800">
                            #{inv.invoiceNumber}
                          </td>
                          <td className="px-6 py-4 text-zinc-500 text-xs">{formatDate(inv.invoiceDate)}</td>
                          <td className="px-6 py-4 font-bold text-zinc-800 max-w-[300px] truncate">
                            {inv.supplierName || 'Não informado'}
                          </td>
                          <td className="px-6 py-4 text-center font-semibold text-zinc-700">{inv.itemsCount}</td>
                          <td className="px-6 py-4 text-right font-semibold text-zinc-900">
                            {formatCurrency(inv.totalValue)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleOpenDetail(inv.invoiceNumber, inv.supplierId)}
                              className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-900 hover:text-white rounded-lg text-xs font-bold text-zinc-700 transition-all cursor-pointer shadow-sm border border-zinc-200"
                            >
                              Detalhar Itens
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Detail Drawer */}
      {(selectedInvoice || drawerLoading) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end">
          <div className="absolute inset-0 cursor-pointer" onClick={() => { setSelectedInvoice(null); }} />

          <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-350 z-10">
            {drawerLoading ? (
              <div className="flex-1 flex items-center justify-center text-zinc-400 font-semibold gap-2">
                <RefreshCw className="h-5 w-5 animate-spin" />
                Carregando detalhes da nota fiscal...
              </div>
            ) : selectedInvoice ? (
              <>
                {/* Drawer Header */}
                <div className="px-6 py-5 border-b border-zinc-200 bg-zinc-50/50 flex justify-between items-start shrink-0">
                  <div>
                    <span className="px-2 py-0.5 bg-zinc-900 text-white rounded text-[9px] font-bold uppercase tracking-wider">
                      Nota Fiscal de Compra
                    </span>
                    <h3 className="font-bold text-zinc-900 text-lg mt-1">NF #{selectedInvoice.invoiceNumber}</h3>
                    <p className="text-xs text-zinc-500 font-mono mt-0.5">
                      {selectedInvoice.supplierName || 'Fornecedor não informado'} | {formatDate(selectedInvoice.invoiceDate)}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedInvoice(null)}
                    className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-700 transition-all cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Info Header */}
                <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/30 grid grid-cols-2 md:grid-cols-3 gap-4 shrink-0">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Valor Total Faturado</span>
                    <p className="text-sm font-extrabold text-zinc-900">{formatCurrency(selectedInvoice.totalValue)}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Cód. Fornecedor</span>
                    <p className="text-xs font-mono font-bold text-zinc-700">{selectedInvoice.supplierId || '-'}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Data Emissão</span>
                    <p className="text-xs font-semibold text-zinc-700">{formatDate(selectedInvoice.invoiceDate)}</p>
                  </div>
                </div>

                {/* Items list */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-zinc-900">Itens Faturados</h4>
                    <span className="text-xs font-semibold text-zinc-500 bg-zinc-100 px-2 py-1 rounded-lg">
                      {selectedInvoice.items.length} itens
                    </span>
                  </div>

                  <div className="space-y-3">
                    {selectedInvoice.items.map((item, index) => (
                      <div key={item.id || index} className="bg-white border border-zinc-100 rounded-xl p-4 shadow-sm space-y-2 hover:border-zinc-300 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-zinc-800 text-sm truncate">
                              {item.description || 'Produto Sem Descrição'}
                            </p>
                            <p className="text-[10px] font-mono text-zinc-400 mt-0.5">
                              Cód. Item: {item.itemCode}
                            </p>
                          </div>
                        </div>

                        {/* Quantities/Price row */}
                        <div className="grid grid-cols-3 gap-4 text-xs pt-1">
                          <div>
                            <span className="text-zinc-400 font-medium">Quantidade</span>
                            <p className="font-bold text-zinc-900">{item.quantity.toLocaleString('pt-BR')} {item.unit || 'UN'}</p>
                          </div>
                          <div>
                            <span className="text-zinc-400 font-medium">Preço Unitário</span>
                            <p className="font-semibold text-zinc-800">{formatCurrency(item.unitPrice)}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-zinc-400 font-medium">Valor Total</span>
                            <p className="font-extrabold text-zinc-900">{formatCurrency(item.totalValue)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Drawer Footer */}
                <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50/50 flex justify-end shrink-0">
                  <button
                    onClick={() => setSelectedInvoice(null)}
                    className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-all"
                  >
                    Fechar Detalhes
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

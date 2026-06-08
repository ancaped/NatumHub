import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, Search, ClipboardList, RefreshCw, Calendar, Package,
  User, FileText, ChevronRight, CheckCircle2, Clock, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Truck, DollarSign, Hash, Mail, Info, X
} from 'lucide-react';
import { cn } from '../lib/utils';

const API_BASE = 'http://127.0.0.1:3001/api';

interface PedidosViewProps {
  onBackToHub: () => void;
}

interface PurchaseOrder {
  nPedido: number;
  dPedido: string | null;
  nCodFornec: number | null;
  cNomeF: string | null;
  cUsuario: string | null;
  cStatus: string | null;
  cPrazoPgto: string | null;
  cPrevEntrega: string | null;
  nValor: number;
  dPrevisao: string | null;
  cEmail: string | null;
  mObservac: string | null;
}

interface PurchaseOrderItem {
  id: number;
  nPedido: number;
  cReferencia: string;
  nQtde: number;
  nPreco: number;
  nChegou: number;
  cDescricao: string | null;
  cUnidade: string | null;
  nValorTotal: number;
  nRegistro: number;
  cChegada: string | null;
}

interface PurchaseOrderDetail extends PurchaseOrder {
  items: PurchaseOrderItem[];
}

type StatusFilter = 'ALL' | 'ABERTO' | 'PARCIAL' | 'FECHADO' | 'CANCELADO';

export default function PedidosView({ onBackToHub }: PedidosViewProps) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  // Detail drawer
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrderDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`${API_BASE}/compras/pedidos?${params.toString()}`);
      if (res.ok) {
        setOrders(await res.json());
      }
    } catch (e) {
      console.error("Erro ao carregar pedidos:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
    (window as any).__current_page__ = "Módulo de Compras > Controle de Pedidos";
  }, [statusFilter]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => { loadOrders(); }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const handleOpenDetail = async (nPedido: number) => {
    setDrawerLoading(true);
    setSelectedOrder(null);
    try {
      const res = await fetch(`${API_BASE}/compras/pedidos/${nPedido}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedOrder(data);
      }
    } catch (e) {
      console.error("Erro ao carregar detalhe do pedido:", e);
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

  const getStatusBadge = (status: string | null) => {
    const s = (status || '').toUpperCase().trim();
    if (s === 'ABERTO' || s === 'A' || s.includes('ABERT')) {
      return { label: 'Aberto', className: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock };
    }
    if (s === 'PARCIAL' || s === 'P' || s.includes('PARCI')) {
      return { label: 'Parcial', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle };
    }
    if (s === 'FECHADO' || s === 'F' || s === 'T' || s.includes('FECH') || s.includes('CONCLU') || s.includes('TOTAL')) {
      return { label: 'Fechado', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 };
    }
    if (s === 'CANCELADO' || s === 'C' || s === '!' || s.includes('CANCEL')) {
      return { label: 'Cancelado', className: 'bg-rose-50 text-rose-700 border-rose-200', icon: X };
    }
    return { label: status || 'Indefinido', className: 'bg-zinc-50 text-zinc-600 border-zinc-200', icon: Info };
  };

  // Summary stats
  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const totalValue = orders.reduce((acc, o) => acc + (o.nValor || 0), 0);
    const abertos = orders.filter(o => {
      const s = (o.cStatus || '').toUpperCase();
      return s === 'ABERTO' || s === 'A' || s.includes('ABERT');
    }).length;
    const parciais = orders.filter(o => {
      const s = (o.cStatus || '').toUpperCase();
      return s === 'PARCIAL' || s === 'P' || s.includes('PARCI');
    }).length;
    return { totalOrders, totalValue, abertos, parciais };
  }, [orders]);

  return (
    <div className="flex h-screen bg-zinc-50 font-sans text-zinc-900 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-zinc-200 flex flex-col shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-zinc-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-zinc-900 text-white p-2 rounded-xl shadow-sm">
              <ClipboardList className="h-5 w-5" />
            </div>
            <h1 className="font-bold text-base tracking-tight text-zinc-800 uppercase">Pedidos</h1>
          </div>
        </div>

        {/* Back Button */}
        <div className="p-3 border-b border-zinc-100">
          <button
            onClick={onBackToHub}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900 transition-all cursor-pointer border border-zinc-250/50"
          >
            <ArrowLeft className="h-4 w-4 text-zinc-400" />
            Voltar ao Hub
          </button>
        </div>

        {/* Status Filters */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider px-3 mb-2">Filtrar por Status</p>
          {([
            { id: 'ALL' as StatusFilter, label: 'Todos os Pedidos', icon: ClipboardList },
            { id: 'ABERTO' as StatusFilter, label: 'Em Aberto', icon: Clock },
            { id: 'PARCIAL' as StatusFilter, label: 'Parcial', icon: AlertTriangle },
            { id: 'FECHADO' as StatusFilter, label: 'Concluídos', icon: CheckCircle2 },
            { id: 'CANCELADO' as StatusFilter, label: 'Cancelados', icon: X },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left cursor-pointer",
                statusFilter === tab.id
                  ? "bg-zinc-900 text-white shadow-md"
                  : "text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900"
              )}
            >
              <tab.icon className={cn("h-4 w-4 shrink-0", statusFilter === tab.id ? "text-white" : "text-zinc-400")} />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Summary Stats */}
        <div className="p-4 border-t border-zinc-200 bg-zinc-50/50 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-zinc-400 font-bold uppercase">Total Pedidos</span>
            <span className="text-sm font-extrabold text-zinc-900">{stats.totalOrders}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-zinc-400 font-bold uppercase">Valor Total</span>
            <span className="text-xs font-bold text-zinc-700">{formatCurrency(stats.totalValue)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-zinc-400 font-bold uppercase">Pendentes</span>
            <span className="text-xs font-bold text-amber-600">{stats.abertos + stats.parciais}</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-8 shrink-0">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-900">Controle de Pedidos de Compra</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Acompanhe pedidos enviados aos fornecedores, status de entregas e quantidades recebidas.
            </p>
          </div>
          <button
            onClick={loadOrders}
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
                  placeholder="Buscar por nº pedido ou fornecedor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-all text-sm shadow-sm"
                />
              </div>
              <div className="text-xs font-semibold text-zinc-500 bg-zinc-100 px-3 py-1.5 rounded-lg">
                {orders.length} pedidos
              </div>
            </div>

            {/* Orders Table */}
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                {loading ? (
                  <div className="p-12 text-center text-zinc-400 font-semibold flex items-center justify-center gap-3">
                    <RefreshCw className="h-5 w-5 animate-spin text-zinc-500" />
                    Carregando pedidos de compra...
                  </div>
                ) : orders.length === 0 ? (
                  <div className="p-12 text-center text-zinc-400">Nenhum pedido encontrado.</div>
                ) : (
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-semibold">
                      <tr>
                        <th className="px-6 py-4">Nº Pedido</th>
                        <th className="px-6 py-4">Data</th>
                        <th className="px-6 py-4">Fornecedor</th>
                        <th className="px-6 py-4">Usuário</th>
                        <th className="px-6 py-4 text-right">Valor Total</th>
                        <th className="px-6 py-4 text-center">Status</th>
                        <th className="px-6 py-4">Previsão Entrega</th>
                        <th className="px-6 py-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {orders.map((order, index) => {
                        const badge = getStatusBadge(order.cStatus);
                        return (
                          <tr key={`${order.nPedido}-${index}`} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-6 py-4 font-mono text-xs font-bold text-zinc-800">
                              #{order.nPedido}
                            </td>
                            <td className="px-6 py-4 text-zinc-500 text-xs">{formatDate(order.dPedido)}</td>
                            <td className="px-6 py-4 font-bold text-zinc-800 max-w-[250px] truncate">
                              {order.cNomeF || 'Não informado'}
                            </td>
                            <td className="px-6 py-4 text-zinc-500 text-xs">{order.cUsuario || '-'}</td>
                            <td className="px-6 py-4 text-right font-semibold text-zinc-900">
                              {formatCurrency(order.nValor)}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={cn(
                                "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide border",
                                badge.className
                              )}>
                                <badge.icon className="h-3 w-3" />
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-zinc-500 text-xs">
                              {order.cPrevEntrega || formatDate(order.dPrevisao) || '-'}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => handleOpenDetail(order.nPedido)}
                                className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-900 hover:text-white rounded-lg text-xs font-bold text-zinc-700 transition-all cursor-pointer shadow-sm border border-zinc-200"
                              >
                                Ver Itens
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Detail Drawer */}
      {(selectedOrder || drawerLoading) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end">
          <div className="absolute inset-0 cursor-pointer" onClick={() => { setSelectedOrder(null); }} />

          <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-350 z-10">
            {drawerLoading ? (
              <div className="flex-1 flex items-center justify-center text-zinc-400 font-semibold gap-2">
                <RefreshCw className="h-5 w-5 animate-spin" />
                Carregando detalhes do pedido...
              </div>
            ) : selectedOrder ? (
              <>
                {/* Drawer Header */}
                <div className="px-6 py-5 border-b border-zinc-200 bg-zinc-50/50 flex justify-between items-start shrink-0">
                  <div>
                    <span className="px-2 py-0.5 bg-zinc-900 text-white rounded text-[9px] font-bold uppercase tracking-wider">
                      Pedido de Compra
                    </span>
                    <h3 className="font-bold text-zinc-900 text-lg mt-1">Pedido #{selectedOrder.nPedido}</h3>
                    <p className="text-xs text-zinc-500 font-mono mt-0.5">
                      {selectedOrder.cNomeF || 'Fornecedor não informado'} | {formatDate(selectedOrder.dPedido)}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedOrder(null)}
                    className="p-1.5 hover:bg-zinc-150 rounded-lg text-zinc-400 hover:text-zinc-700 transition-all cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Order Header Info Grid */}
                <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/30 grid grid-cols-2 md:grid-cols-3 gap-4 shrink-0">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Valor Total</span>
                    <p className="text-sm font-extrabold text-zinc-900">{formatCurrency(selectedOrder.nValor)}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Status</span>
                    <p className="text-sm font-bold">
                      {(() => {
                        const badge = getStatusBadge(selectedOrder.cStatus);
                        return (
                          <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border", badge.className)}>
                            <badge.icon className="h-3 w-3" />
                            {badge.label}
                          </span>
                        );
                      })()}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Prazo Pgto</span>
                    <p className="text-xs font-semibold text-zinc-700">{selectedOrder.cPrazoPgto || '-'}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Previsão Entrega</span>
                    <p className="text-xs font-semibold text-zinc-700">{selectedOrder.cPrevEntrega || formatDate(selectedOrder.dPrevisao) || '-'}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Usuário</span>
                    <p className="text-xs font-semibold text-zinc-700">{selectedOrder.cUsuario || '-'}</p>
                  </div>
                  {selectedOrder.cEmail && (
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase">E-mail</span>
                      <p className="text-xs font-medium text-zinc-600 truncate">{selectedOrder.cEmail}</p>
                    </div>
                  )}
                </div>

                {/* Observations if any */}
                {selectedOrder.mObservac && (
                  <div className="px-6 py-3 border-b border-zinc-100 bg-amber-50/30 shrink-0">
                    <p className="text-[10px] text-zinc-400 font-bold uppercase mb-1">Observações</p>
                    <p className="text-xs text-zinc-600 whitespace-pre-wrap">{selectedOrder.mObservac}</p>
                  </div>
                )}

                {/* Items list */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-zinc-900">Itens do Pedido</h4>
                    <span className="text-xs font-semibold text-zinc-500 bg-zinc-100 px-2 py-1 rounded-lg">
                      {selectedOrder.items.length} itens
                    </span>
                  </div>

                  {selectedOrder.items.length === 0 ? (
                    <div className="text-center py-12 text-zinc-400 text-sm">Nenhum item registrado neste pedido.</div>
                  ) : (
                    <div className="space-y-3">
                      {selectedOrder.items.map((item, idx) => {
                        const percent = item.nQtde > 0 ? (item.nChegou / item.nQtde) * 100 : 0;
                        const isComplete = item.nChegou >= item.nQtde;
                        return (
                          <div key={`${item.id}-${idx}`} className="bg-white border border-zinc-150 rounded-xl p-4 shadow-sm space-y-3 hover:border-zinc-300 transition-colors">
                            {/* Item header row */}
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-zinc-800 text-sm truncate">
                                  {item.cDescricao || item.cReferencia}
                                </p>
                                <p className="text-[10px] font-mono text-zinc-400 mt-0.5">
                                  Ref: {item.cReferencia} {item.cUnidade ? `| ${item.cUnidade}` : ''}
                                </p>
                              </div>
                              <span className={cn(
                                "px-2 py-0.5 text-[9px] font-bold uppercase rounded-full border shrink-0",
                                isComplete
                                  ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                  : item.nChegou > 0
                                    ? "bg-amber-50 text-amber-600 border-amber-200"
                                    : "bg-blue-50 text-blue-600 border-blue-200"
                              )}>
                                {isComplete ? 'Recebido' : item.nChegou > 0 ? 'Parcial' : 'Pendente'}
                              </span>
                            </div>

                            {/* Quantities row */}
                            <div className="grid grid-cols-3 gap-4 text-xs">
                              <div>
                                <span className="text-zinc-400 font-medium">Solicitado</span>
                                <p className="font-bold text-zinc-900">{item.nQtde.toLocaleString('pt-BR')} {item.cUnidade || ''}</p>
                              </div>
                              <div>
                                <span className="text-zinc-400 font-medium">Recebido</span>
                                <p className={cn("font-bold", isComplete ? "text-emerald-600" : "text-amber-600")}>
                                  {item.nChegou.toLocaleString('pt-BR')} {item.cUnidade || ''}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="text-zinc-400 font-medium">Preço Unit.</span>
                                <p className="font-semibold text-zinc-800">{formatCurrency(item.nPreco)}</p>
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] text-zinc-400">
                                <span>Progresso de Recebimento</span>
                                <span className="font-bold">{percent.toFixed(0)}%</span>
                              </div>
                              <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all duration-500",
                                    isComplete ? "bg-emerald-500" : percent > 0 ? "bg-amber-500" : "bg-zinc-200"
                                  )}
                                  style={{ width: `${Math.min(percent, 100)}%` }}
                                />
                              </div>
                            </div>

                            {/* Value row */}
                            <div className="flex justify-between items-center pt-1 border-t border-zinc-100">
                              <span className="text-[10px] text-zinc-400 font-medium">Valor Total do Item</span>
                              <span className="text-sm font-extrabold text-zinc-900">{formatCurrency(item.nValorTotal)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Drawer Footer */}
                <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50/50 flex justify-end shrink-0">
                  <button
                    onClick={() => setSelectedOrder(null)}
                    className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-all"
                  >
                    Fechar Painel
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

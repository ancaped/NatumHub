import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api';
import { OnlineOrder, Item } from '../../types';
import { 
  Plus, Search, Calendar, DollarSign, ExternalLink, Paperclip, 
  Trash2, Edit3, CheckCircle, Truck, AlertCircle, Eye, FileText, 
  X, ShoppingBag, Clock, ShieldAlert, CreditCard
} from 'lucide-react';
import { cn } from '../../lib/utils';

export function OnlineOrdersManager() {
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'preparing' | 'shipped' | 'delivered' | 'cancelled' | 'delayed'>('all');
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OnlineOrder | null>(null);
  
  // Form states
  const [description, setDescription] = useState('');
  const [itemCode, setItemCode] = useState<string | null>(null);
  const [storeName, setStoreName] = useState('');
  const [purchaseUrl, setPurchaseUrl] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(1);
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('Pix');
  const [trackingCode, setTrackingCode] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [status, setStatus] = useState<'preparing' | 'shipped' | 'delivered' | 'cancelled'>('preparing');
  const [estimatedDelivery, setEstimatedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  
  // Attachment states
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  useEffect(() => {
    loadOrders();
    loadItems();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await api.getOnlineOrders();
      setOrders(data);
    } catch (e) {
      console.error(e);
      alert('Erro ao carregar compras online.');
    } finally {
      setLoading(false);
    }
  };

  const loadItems = async () => {
    try {
      const data = await api.getItems();
      setItems(data);
    } catch (e) {
      console.error(e);
    }
  };

  // Auto-calculate total price
  const totalPrice = useMemo(() => {
    return (quantity * unitPrice) + shippingCost;
  }, [quantity, unitPrice, shippingCost]);

  const handleOpenAddModal = () => {
    setEditingOrder(null);
    setDescription('');
    setItemCode(null);
    setStoreName('');
    setPurchaseUrl('');
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setUnitPrice(0);
    setQuantity(1);
    setShippingCost(0);
    setPaymentMethod('Pix');
    setTrackingCode('');
    setTrackingUrl('');
    setStatus('preparing');
    setEstimatedDelivery('');
    setNotes('');
    setReceiptFile(null);
    setReceiptPath(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (order: OnlineOrder) => {
    setEditingOrder(order);
    setDescription(order.description);
    setItemCode(order.itemCode);
    setStoreName(order.storeName || '');
    setPurchaseUrl(order.purchaseUrl || '');
    setPurchaseDate(order.purchaseDate);
    setUnitPrice(order.unitPrice || 0);
    setQuantity(order.quantity || 1);
    setShippingCost(order.shippingCost || 0);
    setPaymentMethod(order.paymentMethod || 'Pix');
    setTrackingCode(order.trackingCode || '');
    setTrackingUrl(order.trackingUrl || '');
    setStatus(order.status);
    setEstimatedDelivery(order.estimatedDelivery || '');
    setNotes(order.notes || '');
    setReceiptFile(null);
    setReceiptPath(order.receiptPath);
    setShowModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setReceiptFile(e.target.files[0]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      alert('Por favor, insira uma descrição.');
      return;
    }

    const orderId = editingOrder ? editingOrder.id : crypto.randomUUID();
    let currentReceiptPath = receiptPath;

    if (receiptFile) {
      setUploadingReceipt(true);
      try {
        const buffer = await receiptFile.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buffer));
        currentReceiptPath = await api.uploadOrderReceipt(orderId, receiptFile.name, bytes);
      } catch (err) {
        console.error(err);
        alert('Erro ao fazer upload do comprovante.');
        setUploadingReceipt(false);
        return;
      }
      setUploadingReceipt(false);
    }

    const payload: OnlineOrder = {
      id: orderId,
      description: description.trim(),
      itemCode,
      storeName: storeName.trim() || null,
      purchaseUrl: purchaseUrl.trim() || null,
      purchaseDate,
      unitPrice,
      quantity,
      shippingCost,
      totalPrice,
      paymentMethod,
      trackingCode: trackingCode.trim() || null,
      trackingUrl: trackingUrl.trim() || null,
      status,
      estimatedDelivery: estimatedDelivery || null,
      receiptPath: currentReceiptPath,
      notes: notes.trim() || null
    };

    try {
      await api.saveOnlineOrder(payload);
      setShowModal(false);
      loadOrders();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar compra online.');
    }
  };

  const handleDelete = async (id: string, desc: string) => {
    if (!confirm(`Deseja realmente excluir a compra "${desc}"?`)) return;
    try {
      await api.deleteOnlineOrder(id);
      loadOrders();
    } catch (e) {
      console.error(e);
      alert('Erro ao excluir registro.');
    }
  };

  const handleOpenReceipt = async (path: string) => {
    try {
      await api.openReceiptFile(path);
    } catch (e) {
      console.error(e);
      alert('Erro ao abrir comprovante. Verifique se o arquivo ainda existe localmente.');
    }
  };

  const handleQuickStatusUpdate = async (order: OnlineOrder, newStatus: 'preparing' | 'shipped' | 'delivered' | 'cancelled') => {
    try {
      const updated = { ...order, status: newStatus };
      await api.saveOnlineOrder(updated);
      loadOrders();
    } catch (e) {
      console.error(e);
      alert('Erro ao atualizar status.');
    }
  };

  // Helper check for delayed orders
  const isOrderDelayed = (order: OnlineOrder) => {
    if (order.status === 'delivered' || order.status === 'cancelled') return false;
    if (!order.estimatedDelivery) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const estDate = new Date(order.estimatedDelivery + 'T00:00:00');
    return estDate < today;
  };

  // Filter & Search Logic
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // Search matches
      const matchesSearch = 
        o.description.toLowerCase().includes(search.toLowerCase()) ||
        (o.storeName || '').toLowerCase().includes(search.toLowerCase()) ||
        (o.trackingCode || '').toLowerCase().includes(search.toLowerCase());
      
      if (!matchesSearch) return false;

      // Status filters
      if (activeFilter === 'all') return true;
      if (activeFilter === 'delayed') return isOrderDelayed(o);
      return o.status === activeFilter;
    });
  }, [orders, search, activeFilter]);

  // Statistics Computations
  const stats = useMemo(() => {
    const active = orders.filter(o => o.status === 'preparing' || o.status === 'shipped');
    const delivered = orders.filter(o => o.status === 'delivered');
    const delayed = orders.filter(o => isOrderDelayed(o));
    
    // Sum of delivered & active orders cost for current month
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    const totalSpentThisMonth = orders
      .filter(o => o.purchaseDate.startsWith(currentMonth) && o.status !== 'cancelled')
      .reduce((sum, o) => sum + (o.totalPrice || 0), 0);

    return {
      activeCount: active.length,
      deliveredCount: delivered.length,
      delayedCount: delayed.length,
      totalSpentThisMonth
    };
  }, [orders]);

  const getStatusBadge = (status: string, isDelayed: boolean) => {
    if (isDelayed) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-100">
          <ShieldAlert className="w-3.5 h-3.5" />
          Atrasada
        </span>
      );
    }

    switch (status) {
      case 'preparing':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100">
            <Clock className="w-3.5 h-3.5 animate-pulse" />
            Em Preparação
          </span>
        );
      case 'shipped':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
            <Truck className="w-3.5 h-3.5" />
            Em Trânsito
          </span>
        );
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
            <CheckCircle className="w-3.5 h-3.5" />
            Entregue
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-zinc-100 text-zinc-650 border border-zinc-200">
            <X className="w-3.5 h-3.5" />
            Cancelado
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 w-full pb-10">
      {/* Top Banner KPI Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Compras Ativas</p>
            <h4 className="text-2xl font-black text-zinc-800 mt-1">{stats.activeCount}</h4>
          </div>
          <div className="p-3 bg-zinc-100 text-zinc-650 rounded-xl">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Entregas Concluídas</p>
            <h4 className="text-2xl font-black text-zinc-800 mt-1">{stats.deliveredCount}</h4>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>

        <div className={cn(
          "bg-white p-5 rounded-2xl border shadow-sm flex items-center justify-between transition-all",
          stats.delayedCount > 0 ? "border-red-200 bg-red-50/20" : "border-zinc-200"
        )}>
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Encomendas Atrasadas</p>
            <h4 className={cn("text-2xl font-black mt-1", stats.delayedCount > 0 ? "text-red-650" : "text-zinc-800")}>
              {stats.delayedCount}
            </h4>
          </div>
          <div className={cn("p-3 rounded-xl", stats.delayedCount > 0 ? "bg-red-50 text-red-500" : "bg-zinc-100 text-zinc-650")}>
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Gasto Total Mês Atual</p>
            <h4 className="text-2xl font-black text-zinc-800 mt-1">
              R$ {stats.totalSpentThisMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h4>
          </div>
          <div className="p-3 bg-zinc-950 text-white rounded-xl">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col">
        {/* Toolbar Header */}
        <div className="p-5 border-b border-zinc-200 bg-zinc-50 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input 
              type="text"
              placeholder="Buscar por descrição, loja ou rastreio..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 text-sm shadow-sm transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={() => setActiveFilter('all')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer",
                activeFilter === 'all' 
                  ? "bg-zinc-900 border-zinc-900 text-white shadow-sm" 
                  : "bg-white border-zinc-200 hover:bg-zinc-50 text-zinc-650"
              )}
            >
              Todos
            </button>
            <button 
              onClick={() => setActiveFilter('preparing')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer",
                activeFilter === 'preparing' 
                  ? "bg-amber-550 border-amber-600 bg-amber-500 text-white shadow-sm" 
                  : "bg-white border-zinc-200 hover:bg-zinc-50 text-zinc-650"
              )}
            >
              Preparando
            </button>
            <button 
              onClick={() => setActiveFilter('shipped')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer",
                activeFilter === 'shipped' 
                  ? "bg-blue-600 border-blue-600 text-white shadow-sm" 
                  : "bg-white border-zinc-200 hover:bg-zinc-50 text-zinc-650"
              )}
            >
              Em Trânsito
            </button>
            <button 
              onClick={() => setActiveFilter('delivered')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer",
                activeFilter === 'delivered' 
                  ? "bg-emerald-600 border-emerald-600 text-white shadow-sm" 
                  : "bg-white border-zinc-200 hover:bg-zinc-50 text-zinc-650"
              )}
            >
              Entregue
            </button>
            <button 
              onClick={() => setActiveFilter('delayed')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer",
                activeFilter === 'delayed' 
                  ? "bg-red-650 border-red-650 text-white shadow-sm" 
                  : "bg-white border-zinc-200 hover:bg-zinc-50 text-zinc-650"
              )}
            >
              Atrasadas
            </button>
            
            <button 
              onClick={handleOpenAddModal}
              className="flex items-center gap-1.5 bg-zinc-950 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-zinc-800 cursor-pointer shadow-sm ml-2 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova Compra
            </button>
          </div>
        </div>

        {/* Content Table */}
        <div className="overflow-x-auto min-h-[300px]">
          {loading ? (
            <div className="py-20 text-center text-zinc-400">Carregando compras...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-20 text-center text-zinc-400 flex flex-col items-center justify-center gap-2">
              <ShoppingBag size={40} className="opacity-30" />
              <p className="text-sm font-semibold">Nenhuma compra online encontrada</p>
              <p className="text-xs max-w-xs mx-auto">Cadastre suprimentos, etiquetas ou compras do escritório para iniciar o acompanhamento.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  <th className="px-6 py-4">Status / Data</th>
                  <th className="px-6 py-4">Descrição / Insumo</th>
                  <th className="px-6 py-4">Loja</th>
                  <th className="px-6 py-4">Valores (Qtd)</th>
                  <th className="px-6 py-4">Pagamento</th>
                  <th className="px-6 py-4">Entrega Estimada</th>
                  <th className="px-6 py-4">Rastreio / Anexo</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {filteredOrders.map(order => {
                  const isDelayed = isOrderDelayed(order);
                  const pDate = new Date(order.purchaseDate + 'T00:00:00').toLocaleDateString('pt-BR');
                  const estDate = order.estimatedDelivery 
                    ? new Date(order.estimatedDelivery + 'T00:00:00').toLocaleDateString('pt-BR') 
                    : '-';
                  
                  // Find associated item description if available
                  const linkedItem = items.find(i => i.code === order.itemCode);

                  return (
                    <tr key={order.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <div>{getStatusBadge(order.status, isDelayed)}</div>
                          <span className="text-[10px] font-mono font-bold text-zinc-400">{pDate}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="max-w-[240px]">
                          <div className="font-bold text-zinc-850 truncate" title={order.description}>{order.description}</div>
                          {linkedItem && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 bg-zinc-100 rounded text-[9px] font-bold text-zinc-500 font-mono">
                              Vínculo: {linkedItem.code}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {order.purchaseUrl ? (
                          <a 
                            href={order.purchaseUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-zinc-850 hover:underline hover:text-zinc-950"
                          >
                            {order.storeName || 'Ver Site'}
                            <ExternalLink className="w-3 h-3 text-zinc-400" />
                          </a>
                        ) : (
                          <span className="font-semibold text-zinc-850">{order.storeName || '-'}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-bold text-zinc-850">
                            R$ {(order.totalPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-medium">
                            {order.quantity} x R$ {(order.unitPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (Frete: R$ {order.shippingCost || 0})
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-zinc-650 font-medium">
                        <div className="flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5 text-zinc-400" />
                          {order.paymentMethod || 'Pix'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={cn(
                          "font-mono text-xs font-semibold",
                          isDelayed ? "text-red-650 font-bold" : "text-zinc-650"
                        )}>
                          {estDate}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          {order.trackingCode ? (
                            order.trackingUrl ? (
                              <a 
                                href={order.trackingUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-650 hover:underline hover:text-blue-800"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                {order.trackingCode}
                              </a>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-zinc-650 font-mono">
                                <Truck className="w-3.5 h-3.5 text-zinc-400" />
                                {order.trackingCode}
                              </span>
                            )
                          ) : (
                            <span className="text-zinc-400 text-xs italic">-</span>
                          )}
                          {order.receiptPath && (
                            <button 
                              onClick={() => handleOpenReceipt(order.receiptPath!)}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-650 hover:underline hover:text-emerald-800 cursor-pointer self-start"
                            >
                              <Paperclip className="w-3 h-3" />
                              Ver Comprovante
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                        <div className="flex items-center justify-end gap-2">
                          {order.status === 'preparing' && (
                            <button 
                              onClick={() => handleQuickStatusUpdate(order, 'shipped')}
                              className="px-2 py-1 rounded bg-zinc-100 hover:bg-blue-50 text-zinc-650 hover:text-blue-750 transition-colors font-bold text-[10px] cursor-pointer"
                              title="Marcar como Enviado"
                            >
                              Marcar Enviado
                            </button>
                          )}
                          {order.status === 'shipped' && (
                            <button 
                              onClick={() => handleQuickStatusUpdate(order, 'delivered')}
                              className="px-2 py-1 rounded bg-zinc-100 hover:bg-emerald-50 text-zinc-650 hover:text-emerald-750 transition-colors font-bold text-[10px] cursor-pointer"
                              title="Confirmar Entrega"
                            >
                              Confirmar Entrega
                            </button>
                          )}
                          
                          <button 
                            onClick={() => handleOpenEditModal(order)}
                            className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors cursor-pointer"
                            title="Editar"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(order.id, order.description)}
                            className="p-1 text-zinc-400 hover:text-red-650 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal Form Overlay */}
      {showModal && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form 
            onSubmit={handleSave}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200 text-left"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-zinc-200 flex justify-between items-center bg-zinc-50 shrink-0">
              <div>
                <h3 className="font-bold text-zinc-900 text-base">
                  {editingOrder ? 'Editar Registro de Compra' : 'Registrar Compra Online'}
                </h3>
                <p className="text-xs text-zinc-500 font-medium">Acompanhe mercadorias, preços, frete e comprovantes</p>
              </div>
              <button 
                type="button" 
                onClick={() => setShowModal(false)} 
                className="text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Fields */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Description Input */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block">Descrição do Item *</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: Caixa de Etiqueta Térmica 40x40"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 text-zinc-850 bg-white"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Linked Item Code */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block">Vincular Insumo (Opcional)</label>
                  <select 
                    value={itemCode || ''}
                    onChange={e => setItemCode(e.target.value || null)}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 text-zinc-850 bg-white"
                  >
                    <option value="">Nenhum vínculo (Descrição Livre)</option>
                    {items.map(i => (
                      <option key={i.code} value={i.code}>{i.code} - {i.description}</option>
                    ))}
                  </select>
                </div>

                {/* Store Name */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block">Loja / Site</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Mercado Livre, Amazon, Shopee"
                    value={storeName}
                    onChange={e => setStoreName(e.target.value)}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 text-zinc-850 bg-white"
                  />
                </div>
              </div>

              {/* Purchase URL */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block">Link do Produto</label>
                <input 
                  type="url" 
                  placeholder="https://exemplo.com/produto"
                  value={purchaseUrl}
                  onChange={e => setPurchaseUrl(e.target.value)}
                  className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 text-zinc-850 bg-white"
                />
              </div>

              {/* Pricing Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {/* Quantity */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block">Quantidade</label>
                  <input 
                    type="number" 
                    min="1"
                    value={quantity}
                    onChange={e => setQuantity(Number(e.target.value))}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 text-zinc-850 bg-white"
                  />
                </div>

                {/* Unit Price */}
                <div className="space-y-1 col-span-1 md:col-span-2">
                  <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block">Preço Unitário (R$)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={unitPrice || ''}
                    onChange={e => setUnitPrice(Number(e.target.value))}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 text-zinc-850 bg-white"
                  />
                </div>

                {/* Shipping */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block">Frete (R$)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={shippingCost || ''}
                    onChange={e => setShippingCost(Number(e.target.value))}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 text-zinc-850 bg-white"
                  />
                </div>
              </div>

              {/* Total display & payment */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                <div className="text-left col-span-1 md:col-span-1">
                  <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Total Geral</span>
                  <strong className="text-lg font-black text-zinc-800">
                    R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </strong>
                </div>

                {/* Payment Method */}
                <div className="col-span-1 md:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block">Forma de Pagamento</label>
                  <select 
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 text-zinc-850 bg-white"
                  >
                    <option value="Pix">Pix</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Boleto Bancário">Boleto Bancário</option>
                    <option value="Faturamento / Fatura">Faturamento / Fatura</option>
                  </select>
                </div>
              </div>

              {/* Dates Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Purchase Date */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block">Data da Compra *</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input 
                      type="date" 
                      required
                      value={purchaseDate}
                      onChange={e => setPurchaseDate(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 text-zinc-850 bg-white"
                    />
                  </div>
                </div>

                {/* Estimated Delivery Date */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block">Estimativa de Entrega</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input 
                      type="date" 
                      value={estimatedDelivery}
                      onChange={e => setEstimatedDelivery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 text-zinc-850 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Tracking Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tracking Code */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block">Código de Rastreamento</label>
                  <input 
                    type="text" 
                    placeholder="Ex: QI123456789BR"
                    value={trackingCode}
                    onChange={e => setTrackingCode(e.target.value)}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 text-zinc-850 bg-white"
                  />
                </div>

                {/* Tracking Link */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block">Link do Rastreio</label>
                  <input 
                    type="url" 
                    placeholder="https://link-de-rastreio.com"
                    value={trackingUrl}
                    onChange={e => setTrackingUrl(e.target.value)}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 text-zinc-850 bg-white"
                  />
                </div>
              </div>

              {/* Attachment upload */}
              <div className="space-y-1.5 p-4 rounded-xl border border-zinc-200 bg-zinc-50/50">
                <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block">Comprovante de Compra (Anexo)</label>
                <div className="flex flex-col sm:flex-row gap-3 items-center">
                  <input 
                    type="file" 
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleFileChange}
                    className="text-xs border border-zinc-300 rounded-lg p-1 bg-white flex-1 w-full"
                  />
                  {receiptPath && (
                    <button 
                      type="button"
                      onClick={() => handleOpenReceipt(receiptPath)}
                      className="px-4 py-2 border border-zinc-300 rounded-lg text-xs font-bold hover:bg-white transition-colors cursor-pointer bg-zinc-100 text-zinc-800 flex items-center gap-1 shadow-sm shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5 text-zinc-500" /> Ver Atual
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-zinc-450 italic mt-1 block">Tamanho recomendado: PDF ou imagem até 5MB.</p>
              </div>

              {/* Order Status */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block">Status Atual *</label>
                <select 
                  required
                  value={status}
                  onChange={e => setStatus(e.target.value as any)}
                  className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 text-zinc-850 bg-white"
                >
                  <option value="preparing">Em Preparação / Aguardando Envio</option>
                  <option value="shipped">Em Trânsito / Enviado</option>
                  <option value="delivered">Entregue</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block">Observações / Detalhes</label>
                <textarea 
                  placeholder="Escreva detalhes do pedido, faturas ou observações de entrega..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 text-zinc-850 bg-white resize-none"
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex justify-end gap-3 shrink-0">
              <button 
                type="button" 
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs font-bold text-zinc-500 hover:text-zinc-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                disabled={uploadingReceipt}
                className="flex items-center gap-1.5 bg-zinc-950 text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-zinc-800 disabled:opacity-50 transition-all cursor-pointer shadow-md"
              >
                {uploadingReceipt ? 'Salvando...' : editingOrder ? 'Salvar Alterações' : 'Salvar Registro'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

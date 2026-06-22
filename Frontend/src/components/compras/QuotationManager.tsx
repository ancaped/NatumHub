import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { Quotation } from '../../types';
import { QuotationDetail } from './QuotationDetail';
import { Search, Plus, Filter, Clock, FileText, CheckCircle2, ShoppingCart, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const STATUS_MAP: Record<string, { label: string, color: string }> = {
  draft: { label: 'Rascunho', color: 'bg-zinc-100 text-zinc-800 border-zinc-200' },
  pending_demand_approval: { label: 'Aguard. Aprovação Inicial', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  quoting: { label: 'Em Cotação', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  quoted: { label: 'Cotada', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  pending_final_approval: { label: 'Aguard. Aprovação Final', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved: { label: 'Aprovada', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  ordered: { label: 'Pedido Feito', color: 'bg-zinc-800 text-zinc-100 border-zinc-900' },
};

export function QuotationManager({ active = false }: { active?: boolean }) {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    if (!selectedId && active) {
      loadQuotations();
    }
  }, [selectedId, statusFilter, active]);

  const loadQuotations = async () => {
    setLoading(true);
    try {
      const data = await api.getQuotations(statusFilter || undefined);
      setQuotations(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('pt-BR', { 
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(date);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Tem certeza que deseja excluir este rascunho de cotação?')) {
      try {
        await api.deleteQuotation(id);
        loadQuotations();
      } catch (err) {
        console.error(err);
        alert('Erro ao excluir cotação');
      }
    }
  };

  if (selectedId) {
    return <QuotationDetail id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden flex flex-col h-[calc(100vh-6.25rem)]">
      {/* Header & Filters */}
      <div className="p-4 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-zinc-500" />
            <select 
              value={statusFilter} 
              onChange={e => setStatusFilter(e.target.value)}
              className="text-sm border border-zinc-300 rounded-md px-2 py-1.5 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none"
            >
              <option value="">Todos os Status</option>
              {Object.entries(STATUS_MAP).map(([key, info]) => (
                <option key={key} value={key}>{info.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-6 bg-zinc-50/50">
        {loading ? (
          <div className="flex items-center justify-center h-full text-zinc-500 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Carregando cotações...</span>
          </div>
        ) : quotations.length === 0 ? (
          <div className="flex items-center justify-center h-full text-zinc-500 flex-col gap-3">
            <ShoppingCart className="h-10 w-10 text-zinc-300" />
            <p>Nenhuma cotação encontrada.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quotations.map(q => {
              const statusInfo = STATUS_MAP[q.status] || { label: q.status, color: 'bg-zinc-100 text-zinc-800' };
              
              return (
                <div 
                  key={q.id}
                  onClick={() => setSelectedId(q.id)}
                  className="bg-white border border-zinc-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col gap-4 group"
                >
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="font-semibold text-zinc-900 line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors">
                      {q.title}
                    </h3>
                    <span className={cn("text-xs font-medium px-2 py-1 rounded-full border whitespace-nowrap", statusInfo.color)}>
                      {statusInfo.label}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex flex-col">
                      <span className="text-zinc-500 text-xs">Itens</span>
                      <span className="font-medium text-zinc-900">{q.itemCount || 0}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-zinc-500 text-xs">Valor Estimado</span>
                      <span className="font-medium text-zinc-900">
                        {q.totalValue ? `R$ ${q.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                      </span>
                    </div>
                    <div className="flex flex-col col-span-2">
                      <span className="text-zinc-500 text-xs flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Criado em
                      </span>
                      <span className="text-zinc-700">{formatDate(q.createdAt)}</span>
                    </div>
                  </div>

                  {q.status === 'draft' && (
                    <div className="mt-auto pt-4 border-t border-zinc-100 flex justify-end">
                      <button 
                        onClick={(e) => handleDelete(q.id, e)}
                        className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                      >
                        Excluir
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

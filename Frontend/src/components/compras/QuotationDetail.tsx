import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api';
import { Quotation, QuotationItem, Supplier, QuotationPrice, DemandResult } from '../../types';
import { QuotationReport } from './QuotationReport';
import { ArrowLeft, Plus, Check, CheckCircle2, AlertCircle, FileText, ShoppingCart, Loader2, Printer } from 'lucide-react';
import { cn } from '../../lib/utils';

interface QuotationDetailProps {
  id: string;
  onBack: () => void;
}

export function QuotationDetail({ id, onBack }: QuotationDetailProps) {
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [demands, setDemands] = useState<DemandResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReport, setShowReport] = useState(false);

  // Modal / Add Price State
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [addingPrice, setAddingPrice] = useState(false);
  const [priceForm, setPriceForm] = useState({
    supplierId: '',
    unitPrice: '',
    deliveryDays: '',
    minQty: '',
    paymentTerms: '',
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [detailRes, suppRes, demandsRes] = await Promise.all([
        api.getQuotationDetail(id),
        api.getSuppliers(),
        api.getDemands()
      ]);
      setQuotation(detailRes.quotation);
      setItems(detailRes.items);
      setSuppliers(suppRes);
      setDemands(demandsRes);
    } catch (e) {
      console.error(e);
      alert('Erro ao carregar detalhes da cotação');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateItemQty = async (itemId: string, val: number | null, field: 'approved' | 'final') => {
    if (val === null) return;
    try {
      await api.updateQuotationItemQty(itemId, field, val);
      setItems(prev => prev.map(item => {
        if (item.id === itemId) {
          return {
            ...item,
            approvedQty: field === 'approved' ? val : item.approvedQty,
            finalQty: field === 'final' ? val : item.finalQty,
          };
        }
        return item;
      }));
    } catch (e) {
      console.error(e);
      alert('Erro ao atualizar quantidade do item.');
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    let notes = undefined;
    if (newStatus === 'pending_demand_approval' || newStatus === 'pending_final_approval') {
      notes = prompt('Adicionar notas para a aprovação (opcional):') || undefined;
    }
    
    try {
      await api.updateQuotationStatus(id, newStatus, notes);
      loadData();
    } catch (e) {
      console.error(e);
      alert('Erro ao atualizar status');
    }
  };

  const handleAddPriceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId || !priceForm.supplierId || !priceForm.unitPrice) return;

    try {
      await api.addQuotationPrice({
        quotationItemId: selectedItemId,
        supplierId: priceForm.supplierId,
        unitPrice: parseFloat(priceForm.unitPrice.replace(',', '.')),
        deliveryDays: priceForm.deliveryDays ? parseInt(priceForm.deliveryDays) : undefined,
        minQty: priceForm.minQty ? parseFloat(priceForm.minQty.replace(',', '.')) : undefined,
        paymentTerms: priceForm.paymentTerms || undefined,
        notes: priceForm.notes || undefined,
      });
      
      setAddingPrice(false);
      setPriceForm({ supplierId: '', unitPrice: '', deliveryDays: '', minQty: '', paymentTerms: '', notes: '' });
      loadData();
    } catch (err) {
      console.error(err);
      alert('Erro ao adicionar preço');
    }
  };

  const handleSelectSupplier = async (itemId: string, priceId: string) => {
    try {
      await api.selectSupplier(itemId, priceId);
      loadData();
    } catch (e) {
      console.error(e);
      alert('Erro ao selecionar fornecedor');
    }
  };

  if (loading || !quotation) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 gap-2 bg-white rounded-xl shadow-sm border border-zinc-200">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando detalhes...</span>
      </div>
    );
  }

  // Workflows actions based on status
  const renderActions = () => {
    switch (quotation.status) {
      case 'draft':
        return (
          <button onClick={() => handleUpdateStatus('pending_demand_approval')} className="bg-amber-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-amber-700">
            Solicitar Aprovação Demanda
          </button>
        );
      case 'pending_demand_approval':
        return (
          <div className="flex gap-2">
            <button onClick={() => handleUpdateStatus('draft')} className="bg-zinc-200 text-zinc-800 px-4 py-2 rounded-md text-sm font-medium hover:bg-zinc-300">
              Rejeitar
            </button>
            <button onClick={() => handleUpdateStatus('quoting')} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
              Aprovar Demanda (Iniciar Cotação)
            </button>
          </div>
        );
      case 'quoting':
        return (
          <button onClick={() => handleUpdateStatus('quoted')} className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700">
            Concluir Cotação
          </button>
        );
      case 'quoted':
        return (
          <div className="flex gap-2">
            <button onClick={() => handleUpdateStatus('quoting')} className="bg-zinc-200 text-zinc-800 px-4 py-2 rounded-md text-sm font-medium hover:bg-zinc-300">
              Continuar Cotando
            </button>
            <button onClick={() => handleUpdateStatus('pending_final_approval')} className="bg-amber-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-amber-700">
              Solicitar Aprovação Final
            </button>
          </div>
        );
      case 'pending_final_approval':
        return (
          <div className="flex gap-2">
            <button onClick={() => handleUpdateStatus('quoting')} className="bg-zinc-200 text-zinc-800 px-4 py-2 rounded-md text-sm font-medium hover:bg-zinc-300">
              Devolver (Renegociar)
            </button>
            <button onClick={() => handleUpdateStatus('approved')} className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-700">
              Aprovar Compra
            </button>
          </div>
        );
      case 'approved':
        return (
          <button onClick={() => handleUpdateStatus('ordered')} className="bg-zinc-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-zinc-800">
            Marcar como Pedido Feito
          </button>
        );
      default:
        return null;
    }
  };

  const groupedItems = useMemo(() => {
    const groups: Record<string, QuotationItem[]> = {};
    items.forEach(item => {
      const demand = demands.find(d => d.itemCode === item.itemCode);
      const catName = demand?.categoryName || 'Insumos Gerais';
      if (!groups[catName]) groups[catName] = [];
      groups[catName].push(item);
    });
    return groups;
  }, [items, demands]);

  const STAGES = [
    { key: 'draft', label: 'Rascunho' },
    { key: 'pending_demand_approval', label: 'Aprov. Demanda' },
    { key: 'quoting', label: 'Cotação' },
    { key: 'quoted', label: 'Finalizada' },
    { key: 'pending_final_approval', label: 'Aprov. Financeira' },
    { key: 'approved', label: 'Aprovada' },
    { key: 'ordered', label: 'Pedido' }
  ];

  const renderProgressTracker = () => {
    const currentIdx = STAGES.findIndex(s => s.key === quotation.status);
    return (
      <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-3 flex items-center justify-between gap-2 overflow-x-auto shrink-0">
        {STAGES.map((stage, idx) => {
          const isDone = idx < currentIdx;
          const isCurrent = stage.key === quotation.status;
          return (
            <React.Fragment key={stage.key}>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-colors",
                  isDone && "bg-emerald-500 border-emerald-500 text-white",
                  isCurrent && "bg-zinc-950 border-zinc-950 text-white font-extrabold shadow-sm animate-pulse",
                  !isDone && !isCurrent && "bg-white border-zinc-300 text-zinc-400"
                )}>
                  {isDone ? '✓' : idx + 1}
                </span>
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-wider",
                  isCurrent ? "text-zinc-950" : isDone ? "text-emerald-600" : "text-zinc-400"
                )}>
                  {stage.label}
                </span>
              </div>
              {idx < STAGES.length - 1 && (
                <div className={cn(
                  "flex-1 h-[2px] min-w-[20px] max-w-[80px] transition-colors shrink-0",
                  idx < currentIdx ? "bg-emerald-500" : "bg-zinc-200"
                )} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const renderDecisionAssistant = (item: QuotationItem) => {
    const demand = demands.find(d => d.itemCode === item.itemCode);
    if (!demand || !item.prices || item.prices.length === 0) return null;

    const monthlyAvg = demand.overallAvg || 0;
    const sortedPrices = [...item.prices].sort((a, b) => a.minQty - b.minQty);
    const baseline = sortedPrices[0]; // lowest qty offered

    return (
      <div className="mt-4 bg-zinc-50 rounded-xl p-4 border border-zinc-200 space-y-3">
        <h4 className="text-xs font-extrabold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
          📊 Assistente de Decisão de Compras
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedPrices.map(price => {
            const qty = price.minQty || item.recommendedQty || 1.0;
            const daysDuration = monthlyAvg > 0 ? Math.round((qty / monthlyAvg) * 30) : 9999;
            const totalCost = qty * price.unitPrice;
            
            // Calculate savings vs baseline
            let discountPercent = 0;
            if (baseline && baseline.id !== price.id && baseline.unitPrice > price.unitPrice) {
              discountPercent = ((baseline.unitPrice - price.unitPrice) / baseline.unitPrice) * 100;
            }

            // Recommendation text
            let recommendation = "ℹ️ Padrão: Reposição padrão.";
            let colorClass = "text-zinc-650 bg-zinc-100 rounded-lg p-2";
            if (daysDuration > 360) {
              recommendation = `⚠️ Risco Alto: Estoque para ${Math.round(daysDuration/30)} meses. Alto risco de obsolescência ou vencimento.`;
              colorClass = "text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2";
            } else if (daysDuration > 180 && discountPercent > 15) {
              recommendation = `💡 Ótimo Retorno: Desconto de ${discountPercent.toFixed(1)}% compensa estoque para ${Math.round(daysDuration/30)} meses.`;
              colorClass = "text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2";
            } else if (daysDuration > 90 && discountPercent > 8) {
              recommendation = `💡 Recomendado: Desconto de ${discountPercent.toFixed(1)}% com estoque para ${Math.round(daysDuration/30)} meses.`;
              colorClass = "text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2";
            } else if (daysDuration < 45) {
              recommendation = "ℹ️ Operacional: Baixa cobertura de estoque. Indicado para giro rápido.";
              colorClass = "text-blue-700 bg-blue-50 border border-blue-100 rounded-lg p-2";
            } else {
              recommendation = `Duração de estoque: ${daysDuration === 9999 ? 'indefinida' : `${daysDuration} dias`}.`;
              colorClass = "text-zinc-650 bg-zinc-100 rounded-lg p-2";
            }

            return (
              <div key={price.id} className="bg-white border border-zinc-200 rounded-lg p-3 space-y-2 text-xs flex flex-col justify-between shadow-sm">
                <div>
                  <div className="flex justify-between items-center font-bold text-zinc-800">
                    <span className="truncate max-w-[120px]">{price.supplierName}</span>
                    <span className="text-zinc-500 font-mono">{qty.toLocaleString('pt-BR')} {item.unit}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    Unitário: R$ {price.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Total: R$ {totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  {discountPercent > 0 && (
                    <div className="text-[10px] text-emerald-600 font-extrabold mt-1">
                      🏷️ Economia de {discountPercent.toFixed(1)}% vs menor lote
                    </div>
                  )}
                </div>
                <div className={cn("text-[10px] font-semibold mt-2", colorClass)}>
                  {recommendation}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden flex flex-col h-[calc(100vh-6.25rem)] relative">
      {/* Header */}
      <div className="p-4 border-b border-zinc-200 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-500">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-3">
              {quotation.title}
              <span className="text-sm font-medium px-2 py-0.5 rounded-full border bg-zinc-100 text-zinc-700">
                {quotation.status}
              </span>
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Criado em {new Date(quotation.createdAt || '').toLocaleDateString('pt-BR')} • {items.length} itens
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowReport(true)}
            className="flex items-center gap-2 text-sm px-3 py-2 border border-zinc-300 rounded-md hover:bg-zinc-50 transition-colors">
            <Printer className="h-4 w-4" /> Relatório
          </button>
          {renderActions()}
        </div>
      </div>

      {renderProgressTracker()}

      {showReport && (
        <div className="absolute inset-0 z-50 bg-white overflow-auto">
          <QuotationReport id={id} onBack={() => setShowReport(false)} />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-zinc-50/30 p-6">
        <div className="space-y-6">
          
          {/* Notes Panels */}
          {(quotation.directorDemandNotes || quotation.directorFinalNotes || quotation.notes) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {quotation.directorDemandNotes && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
                  <h4 className="font-semibold text-amber-800 flex items-center gap-2 mb-1">
                    <AlertCircle className="h-4 w-4" /> Notas de Aprovação Demanda
                  </h4>
                  <p className="text-amber-900">{quotation.directorDemandNotes}</p>
                </div>
              )}
              {quotation.directorFinalNotes && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm">
                  <h4 className="font-semibold text-emerald-800 flex items-center gap-2 mb-1">
                    <CheckCircle2 className="h-4 w-4" /> Exigências/Notas Finais
                  </h4>
                  <p className="text-emerald-900">{quotation.directorFinalNotes}</p>
                </div>
              )}
            </div>
          )}

          {/* Items List Grouped by Subcategory */}
          <div className="space-y-8">
            {Object.entries(groupedItems).map(([categoryName, groupItems]) => (
              <div key={categoryName} className="space-y-4">
                <h3 className="text-sm font-extrabold text-zinc-800 border-b border-zinc-200 pb-2 flex items-center justify-between">
                  <span>📁 {categoryName}</span>
                  <span className="text-[10px] text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full">{groupItems.length} {groupItems.length === 1 ? 'item' : 'itens'}</span>
                </h3>
                
                <div className="space-y-4">
                  {groupItems.map(item => (
                    <div key={item.id} className="bg-white border border-zinc-200 rounded-lg shadow-sm overflow-hidden">
                      <div className="p-4 bg-zinc-50 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div>
                          <div className="font-mono text-xs text-zinc-500">{item.itemCode}</div>
                          <div className="font-bold text-zinc-900 text-lg">{item.description}</div>
                        </div>
                        <div className="flex items-start gap-4 text-right self-end sm:self-auto">
                          <div>
                            <div className="text-[10px] text-zinc-400 font-bold uppercase">Recomendado</div>
                            <div className="font-bold text-zinc-700 text-sm">{item.recommendedQty.toLocaleString('pt-BR')} {item.unit}</div>
                            {(() => {
                              const demand = demands.find(d => d.itemCode === item.itemCode);
                              if (!demand) return null;
                              return (
                                <div className="text-[10px] text-zinc-400 font-medium">
                                  Atual: {demand.estimatedDurationDays === 9999 ? '∞' : `${demand.estimatedDurationDays}d`}
                                </div>
                              );
                            })()}
                          </div>
                          <div className="flex flex-col items-end">
                            <div className="text-[10px] text-zinc-400 font-bold uppercase">Qtd Aprovada</div>
                            <input
                              type="number"
                              disabled={!['draft', 'quoting', 'quoted', 'pending_demand_approval'].includes(quotation.status)}
                              value={item.approvedQty !== null && item.approvedQty !== undefined ? item.approvedQty : item.recommendedQty}
                              onChange={(e) => {
                                const val = e.target.value === '' ? null : Number(e.target.value);
                                handleUpdateItemQty(item.id, val, 'approved');
                              }}
                              className="w-24 text-right text-xs border border-zinc-300 focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 rounded px-2 py-1 font-bold text-zinc-850 bg-white"
                            />
                            {(() => {
                              const demand = demands.find(d => d.itemCode === item.itemCode);
                              if (!demand) return null;
                              const daily = demand.overallAvg / 30.0;
                              const futureStock = demand.futureStockForecast || 0;
                              const approvedVal = item.approvedQty !== null && item.approvedQty !== undefined ? item.approvedQty : item.recommendedQty;
                              const postStock = Math.max(0, futureStock + approvedVal);
                              const duration = daily > 0 ? Math.round(postStock / daily) : 9999;
                              return (
                                <div className={cn(
                                  "text-[9px] font-bold mt-0.5 text-right whitespace-nowrap",
                                  duration < 60 ? "text-red-700" : duration < 90 ? "text-amber-700" : "text-emerald-700"
                                )}>
                                  Pós: {duration === 9999 ? '∞' : `${duration}d (${Math.round(duration / 30)}m)`}
                                </div>
                              );
                            })()}
                          </div>
                          <div className="flex flex-col items-end">
                            <div className="text-[10px] text-zinc-400 font-bold uppercase">Qtd Final</div>
                            <input
                              type="number"
                              disabled={!['approved', 'pending_final_approval'].includes(quotation.status)}
                              value={item.finalQty !== null && item.finalQty !== undefined ? item.finalQty : (item.approvedQty !== null && item.approvedQty !== undefined ? item.approvedQty : item.recommendedQty)}
                              onChange={(e) => {
                                const val = e.target.value === '' ? null : Number(e.target.value);
                                handleUpdateItemQty(item.id, val, 'final');
                              }}
                              className="w-24 text-right text-xs border border-zinc-300 focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 rounded px-2 py-1 font-bold text-zinc-850 bg-white"
                            />
                            {(() => {
                              const demand = demands.find(d => d.itemCode === item.itemCode);
                              if (!demand) return null;
                              const daily = demand.overallAvg / 30.0;
                              const futureStock = demand.futureStockForecast || 0;
                              const approvedVal = item.approvedQty !== null && item.approvedQty !== undefined ? item.approvedQty : item.recommendedQty;
                              const finalVal = item.finalQty !== null && item.finalQty !== undefined ? item.finalQty : approvedVal;
                              const postStock = Math.max(0, futureStock + finalVal);
                              const duration = daily > 0 ? Math.round(postStock / daily) : 9999;
                              return (
                                <div className={cn(
                                  "text-[9px] font-bold mt-0.5 text-right whitespace-nowrap",
                                  duration < 60 ? "text-red-700" : duration < 90 ? "text-amber-700" : "text-emerald-700"
                                )}>
                                  Pós: {duration === 9999 ? '∞' : `${duration}d (${Math.round(duration / 30)}m)`}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>

                      <div className="p-4">
                        {item.prices && item.prices.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                              <thead className="bg-zinc-50/50">
                                <tr>
                                  <th className="px-4 py-2 font-semibold text-zinc-650 text-xs">Fornecedor</th>
                                  <th className="px-4 py-2 font-semibold text-zinc-650 text-xs text-right">Qtd Ofertada</th>
                                  <th className="px-4 py-2 font-semibold text-zinc-650 text-xs text-right">Preço Unit.</th>
                                  <th className="px-4 py-2 font-semibold text-zinc-650 text-xs text-right">Prazo (Dias)</th>
                                  <th className="px-4 py-2 font-semibold text-zinc-650 text-xs text-right">Condição Pag.</th>
                                  <th className="px-4 py-2 font-semibold text-zinc-650 text-xs text-center">Ação</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-100">
                                {item.prices.map(price => (
                                  <tr key={price.id} className={cn("hover:bg-zinc-50 transition-colors", price.isSelected && "bg-emerald-50/50 hover:bg-emerald-50/80")}>
                                    <td className="px-4 py-3 font-medium text-zinc-950 text-xs">{price.supplierName}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-zinc-700 text-xs">{price.minQty ? price.minQty.toLocaleString('pt-BR') : '-'}</td>
                                    <td className="px-4 py-3 text-right font-bold text-zinc-800 text-xs">
                                      R$ {price.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs">{price.deliveryDays || '-'}</td>
                                    <td className="px-4 py-3 text-right text-xs">{price.paymentTerms || '-'}</td>
                                    <td className="px-4 py-3 text-center">
                                      {price.isSelected ? (
                                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[10px] font-bold">
                                          <Check className="h-3 w-3" /> Vencedor
                                        </span>
                                      ) : (
                                        <button 
                                          onClick={() => handleSelectSupplier(item.id, price.id)}
                                          disabled={!['quoting', 'quoted'].includes(quotation.status)}
                                          className="text-[10px] text-blue-600 hover:text-blue-800 font-bold px-2 py-0.5 rounded hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          Selecionar
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="text-xs text-zinc-500 py-4 text-center border border-dashed border-zinc-200 rounded-lg">
                            Nenhum preço cotado ainda para este item.
                          </div>
                        )}

                        {/* Decision Assistant Panel */}
                        {renderDecisionAssistant(item)}

                        {['quoting', 'quoted'].includes(quotation.status) && (
                          <div className="mt-4 flex justify-end">
                            <button 
                              onClick={() => { setSelectedItemId(item.id); setAddingPrice(true); }}
                              className="flex items-center gap-2 text-xs text-zinc-650 hover:text-zinc-950 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded font-bold transition-colors cursor-pointer"
                            >
                              <Plus className="h-4 w-4" /> Adicionar Preço
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* Add Price Modal */}
      {addingPrice && (
        <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-zinc-200 bg-zinc-50">
              <h3 className="font-bold text-lg text-zinc-900">Adicionar Preço do Fornecedor</h3>
            </div>
            <form onSubmit={handleAddPriceSubmit} className="p-6 space-y-4">
              
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Fornecedor</label>
                <select 
                  required
                  value={priceForm.supplierId}
                  onChange={e => setPriceForm({...priceForm, supplierId: e.target.value})}
                  className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900 focus:outline-none"
                >
                  <option value="">Selecione um fornecedor...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Preço Unitário (R$)</label>
                  <input 
                    required type="text" placeholder="0,00"
                    value={priceForm.unitPrice}
                    onChange={e => setPriceForm({...priceForm, unitPrice: e.target.value})}
                    className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Prazo (Dias)</label>
                  <input 
                    type="number" placeholder="Ex: 15"
                    value={priceForm.deliveryDays}
                    onChange={e => setPriceForm({...priceForm, deliveryDays: e.target.value})}
                    className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Condição Pagamento</label>
                  <input 
                    type="text" placeholder="Ex: 30/60/90"
                    value={priceForm.paymentTerms}
                    onChange={e => setPriceForm({...priceForm, paymentTerms: e.target.value})}
                    className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Qtd Mínima</label>
                  <input 
                    type="text" placeholder="Opcional"
                    value={priceForm.minQty}
                    onChange={e => setPriceForm({...priceForm, minQty: e.target.value})}
                    className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Notas Opcionais</label>
                <textarea 
                  value={priceForm.notes}
                  onChange={e => setPriceForm({...priceForm, notes: e.target.value})}
                  className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900 focus:outline-none h-20 resize-none"
                  placeholder="Observações adicionais..."
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setAddingPrice(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 rounded-md hover:bg-zinc-800 transition-colors"
                >
                  Salvar Preço
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

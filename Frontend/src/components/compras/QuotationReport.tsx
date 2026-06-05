import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { Quotation, QuotationItem } from '../../types';
import { Printer, ArrowLeft, CheckCircle2, DollarSign } from 'lucide-react';
import { cn, COMPANY_INFO, APP_NAME } from '../../lib/utils';

interface QuotationReportProps {
  id: string;
  onBack: () => void;
}

export function QuotationReport({ id, onBack }: QuotationReportProps) {
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const detail = await api.getQuotationDetail(id);
      setQuotation(detail.quotation);
      setItems(detail.items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => window.print();

  const fmt = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  const formatDate = (d?: string | null) => {
    if (!d) return '-';
    try { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d)); }
    catch { return d; }
  };

  if (loading || !quotation) {
    return <div className="flex items-center justify-center h-64 text-zinc-500">Carregando relatório...</div>;
  }

  // Compute all unique suppliers across items
  const allSuppliers = new Map<string, string>();
  items.forEach(item => {
    item.prices?.forEach(p => {
      if (p.supplierId && p.supplierName) allSuppliers.set(p.supplierId, p.supplierName);
    });
  });
  const supplierList = Array.from(allSuppliers.entries()); // [[id, name], ...]

  // Totals per supplier
  const supplierTotals = new Map<string, number>();
  let selectedTotal = 0;
  items.forEach(item => {
    const qty = item.finalQty ?? item.approvedQty ?? item.recommendedQty;
    item.prices?.forEach(p => {
      const lineTotal = p.unitPrice * qty;
      supplierTotals.set(p.supplierId, (supplierTotals.get(p.supplierId) || 0) + lineTotal);
      if (p.isSelected) selectedTotal += lineTotal;
    });
  });

  // Find most expensive total
  const maxSupplierTotal = Math.max(...Array.from(supplierTotals.values()), 0);
  const savings = maxSupplierTotal > 0 ? maxSupplierTotal - selectedTotal : 0;

  return (
    <div>
      {/* Screen-only toolbar */}
      <div className="no-print flex items-center justify-between mb-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <button onClick={handlePrint}
          className="flex items-center gap-2 text-sm bg-zinc-900 text-white px-4 py-2 rounded-md font-medium hover:bg-zinc-800">
          <Printer className="h-4 w-4" /> Imprimir / Salvar PDF
        </button>
      </div>

      {/* Printable Report */}
      <div className="bg-white border border-zinc-200 rounded-xl shadow-sm print:shadow-none print:border-none print:rounded-none">
        {/* Header */}
        <div className="p-6 border-b border-zinc-200 print:p-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 print:text-xl">{quotation.title}</h1>
              <p className="text-sm text-zinc-500 mt-1">
                Criado em {formatDate(quotation.createdAt)} • {items.length} itens
              </p>
            </div>
            <div className="text-right text-xs text-zinc-500 leading-relaxed">
              <div className="font-bold text-sm text-zinc-900">{COMPANY_INFO.name}</div>
              <div>{COMPANY_INFO.address}</div>
              <div>{COMPANY_INFO.contact} • {COMPANY_INFO.email}</div>
            </div>
          </div>

          {/* Director Notes */}
          {(quotation.directorDemandNotes || quotation.directorFinalNotes) && (
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              {quotation.directorDemandNotes && (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 print:border print:border-amber-300">
                  <strong className="text-amber-800">Notas Aprovação Demanda:</strong>
                  <p className="text-amber-900 mt-1">{quotation.directorDemandNotes}</p>
                </div>
              )}
              {quotation.directorFinalNotes && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 print:border print:border-emerald-300">
                  <strong className="text-emerald-800">Exigências Finais:</strong>
                  <p className="text-emerald-900 mt-1">{quotation.directorFinalNotes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Comparative Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm print:text-xs">
            <thead className="bg-zinc-100 print:bg-zinc-200">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-zinc-700 border-b border-zinc-200">Ref</th>
                <th className="px-3 py-2 text-left font-semibold text-zinc-700 border-b border-zinc-200">Descrição</th>
                <th className="px-3 py-2 text-center font-semibold text-zinc-700 border-b border-zinc-200">Un</th>
                <th className="px-3 py-2 text-right font-semibold text-zinc-700 border-b border-zinc-200">Qtd</th>
                {supplierList.map(([sid, sname]) => (
                  <th key={sid} className="px-3 py-2 text-right font-semibold text-zinc-700 border-b border-zinc-200 min-w-24">
                    {sname}
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-semibold text-zinc-900 border-b border-zinc-200 bg-emerald-50">Vencedor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {items.map(item => {
                const qty = item.finalQty ?? item.approvedQty ?? item.recommendedQty;
                const selectedPrice = item.prices?.find(p => p.isSelected);
                const minPrice = item.prices && item.prices.length > 0
                  ? Math.min(...item.prices.map(p => p.unitPrice))
                  : null;

                return (
                  <tr key={item.id} className="hover:bg-zinc-50 print:hover:bg-transparent">
                    <td className="px-3 py-2 font-mono text-xs text-zinc-600">{item.itemCode}</td>
                    <td className="px-3 py-2 text-zinc-900 max-w-48 truncate">{item.description}</td>
                    <td className="px-3 py-2 text-center text-zinc-500">{item.unit}</td>
                    <td className="px-3 py-2 text-right font-medium">{qty.toLocaleString('pt-BR')}</td>
                    {supplierList.map(([sid]) => {
                      const price = item.prices?.find(p => p.supplierId === sid);
                      if (!price) return <td key={sid} className="px-3 py-2 text-right text-zinc-300">-</td>;
                      const isMin = minPrice !== null && price.unitPrice === minPrice;
                      const isSelected = price.isSelected;
                      return (
                        <td key={sid} className={cn(
                          "px-3 py-2 text-right",
                          isSelected && "font-bold text-emerald-700",
                          isMin && !isSelected && "text-blue-600"
                        )}>
                          {fmt(price.unitPrice)}
                          {price.paymentTerms && (
                            <div className="text-[10px] text-zinc-400">{price.paymentTerms}</div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center bg-emerald-50/50">
                      {selectedPrice ? (
                        <div>
                          <div className="font-bold text-emerald-700 flex items-center justify-center gap-1">
                            <CheckCircle2 className="h-3 w-3 print:hidden" /> {selectedPrice.supplierName}
                          </div>
                          <div className="text-xs font-semibold text-emerald-600">{fmt(selectedPrice.unitPrice * qty)}</div>
                        </div>
                      ) : (
                        <span className="text-zinc-400 text-xs">Pendente</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Summary Footer */}
        <div className="p-6 border-t border-zinc-200 bg-zinc-50 print:bg-zinc-100">
          <div className="grid grid-cols-3 gap-6">
            {/* Totals per Supplier */}
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase mb-2">Total por Fornecedor</h4>
              <div className="space-y-1">
                {supplierList.map(([sid, sname]) => {
                  const total = supplierTotals.get(sid) || 0;
                  return (
                    <div key={sid} className="flex justify-between text-sm">
                      <span className="text-zinc-700 truncate max-w-32">{sname}</span>
                      <span className="font-medium">{fmt(total)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Total */}
            <div className="flex flex-col items-center justify-center">
              <div className="text-xs font-semibold text-zinc-500 uppercase mb-1">Total Selecionado</div>
              <div className="text-3xl font-bold text-zinc-900">{fmt(selectedTotal)}</div>
            </div>

            {/* Savings */}
            <div className="flex flex-col items-center justify-center">
              <div className="text-xs font-semibold text-zinc-500 uppercase mb-1">Economia vs Mais Caro</div>
              <div className={cn("text-2xl font-bold", savings > 0 ? "text-emerald-600" : "text-zinc-400")}>
                {savings > 0 ? `- ${fmt(savings)}` : '-'}
              </div>
              {savings > 0 && maxSupplierTotal > 0 && (
                <div className="text-xs text-emerald-600 font-medium">
                  ({((savings / maxSupplierTotal) * 100).toFixed(1)}% de economia)
                </div>
              )}
            </div>
          </div>

          {/* Approval section */}
          <div className="mt-6 pt-4 border-t border-zinc-300 grid grid-cols-2 gap-8 print:mt-8">
            <div className="text-center">
              <div className="border-t border-zinc-400 mt-12 pt-2 mx-8">
                <div className="text-sm font-medium text-zinc-700">Comprador</div>
                <div className="text-xs text-zinc-500">Data: ___/___/______</div>
              </div>
            </div>
            <div className="text-center">
              <div className="border-t border-zinc-400 mt-12 pt-2 mx-8">
                <div className="text-sm font-medium text-zinc-700">Diretor</div>
                <div className="text-xs text-zinc-500">Data: ___/___/______</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { 
  X, CheckCircle2, AlertTriangle, Package, FlaskConical, 
  RefreshCw, Plus, Clock, Truck, ChevronRight 
} from 'lucide-react';
import { apiFetch } from '../../../geral/lib/http';
import { parseProductUnitWeightKg, formatUnitsToKg } from '../../lib/unitConversion';

interface BatchOpportunityModalProps {
  product: any;
  onClose: () => void;
  onEnqueueBatch: (items: any[]) => Promise<void>;
}

export function BatchOpportunityModal({
  product,
  onClose,
  onEnqueueBatch,
}: BatchOpportunityModalProps) {
  const [loading, setLoading] = useState(true);
  const [insumosStatus, setInsumosStatus] = useState<any>(null);
  const [siblings, setSiblings] = useState<any[]>([]);
  const [selectedSiblings, setSelectedSiblings] = useState<Record<string, { selected: boolean; qty: number }>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const [resInsumos, resSiblings] = await Promise.all([
          apiFetch(`/producao/insumos-status/${product.codigo}?qty=${product.producao_recomendada > 0 ? product.producao_recomendada : 100}`),
          apiFetch(`/producao/produtos-mesma-formulacao/${product.codigo}`)
        ]);

        if (isMounted) {
          if (resInsumos.ok) {
            const dataInsumos = await resInsumos.json();
            setInsumosStatus(dataInsumos);
          }
          if (resSiblings.ok) {
            const dataSiblings = await resSiblings.json();
            // Exclude the current product from siblings list
            const filtered = (Array.isArray(dataSiblings) ? dataSiblings : []).filter(
              (p: any) => p.codigo !== product.codigo
            );
            setSiblings(filtered);
            const initialSel: Record<string, { selected: boolean; qty: number }> = {};
            filtered.forEach((p: any) => {
              initialSel[p.codigo] = {
                selected: false,
                qty: p.producao_recomendada > 0 ? p.producao_recomendada : 100
              };
            });
            setSelectedSiblings(initialSel);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar dados de oportunidade de batelada:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [product.codigo, product.producao_recomendada]);

  // Calculations for batch mass
  const primaryWeight = parseProductUnitWeightKg(product.descricao);
  const primaryQty = product.producao_recomendada > 0 ? product.producao_recomendada : 100;
  const primaryKg = primaryQty * primaryWeight;

  let totalSelectedKg = primaryKg;
  let totalSelectedUnits = primaryQty;

  siblings.forEach((s) => {
    const sel = selectedSiblings[s.codigo];
    if (sel?.selected) {
      const w = parseProductUnitWeightKg(s.descricao);
      totalSelectedKg += sel.qty * w;
      totalSelectedUnits += sel.qty;
    }
  });

  const handleToggleSibling = (code: string) => {
    setSelectedSiblings(prev => ({
      ...prev,
      [code]: {
        ...prev[code],
        selected: !prev[code]?.selected
      }
    }));
  };

  const handleQtyChange = (code: string, newQty: number) => {
    setSelectedSiblings(prev => ({
      ...prev,
      [code]: {
        ...prev[code],
        qty: Math.max(1, newQty)
      }
    }));
  };

  const handleConfirmEnqueue = async () => {
    setSubmitting(true);
    try {
      const hasSelectedSiblings = siblings.some((s) => selectedSiblings[s.codigo]?.selected);
      const batchGroupTag = hasSelectedSiblings ? `[batch:BAT_${Date.now()}]` : undefined;

      const itemsToEnqueue: any[] = [
        {
          codigoProduto: product.codigo,
          descricao: product.descricao,
          quantidade: primaryQty,
          unidade: 'un',
          quantidadeKg: Math.round(primaryKg * 10) / 10,
          origemDemanda: product.is_producao_programada === 1 ? 'programada' : (product.is_lancamento ? 'fixa' : 'sugestao_estoque'),
          baseCodigo: product.base_codigo,
          baseNome: product.base,
          observacoes: batchGroupTag
        }
      ];

      siblings.forEach((s) => {
        const sel = selectedSiblings[s.codigo];
        if (sel?.selected) {
          const w = parseProductUnitWeightKg(s.descricao);
          const sKg = Math.round(sel.qty * w * 10) / 10;
          itemsToEnqueue.push({
            codigoProduto: s.codigo,
            descricao: s.descricao,
            quantidade: sel.qty,
            unidade: 'un',
            quantidadeKg: sKg,
            origemDemanda: 'aproveitamento_batelada',
            baseCodigo: s.base_codigo || product.base_codigo,
            baseNome: s.base || product.base,
            observacoes: batchGroupTag
          });
        }
      });

      await onEnqueueBatch(itemsToEnqueue);
      onClose();
    } catch (err) {
      console.error('Erro ao enviar batelada para a fila:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-zinc-200 shadow-xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden text-zinc-900 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-zinc-100 rounded-lg text-zinc-700">
              <FlaskConical size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                Aproveitamento de Batelada & Suprimentos
              </h3>
              <p className="text-xs text-zinc-500 font-mono">
                {product.codigo} — {product.descricao}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400">
              <RefreshCw className="animate-spin" size={24} />
              <span>Verificando estoque de insumos e formulação...</span>
            </div>
          ) : (
            <>
              {/* Seção 1: Semáforo de Suprimentos */}
              <div className="rounded-lg border border-zinc-200 p-3 bg-zinc-50/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-zinc-800 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                    <Package size={14} />
                    Disponibilidade de Insumos da Receita
                  </span>
                  {insumosStatus?.all_in_stock ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 size={12} />
                      Todos em Estoque
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      <AlertTriangle size={12} />
                      Falta {insumosStatus?.missing_count || 0} Insumo(s)
                    </span>
                  )}
                </div>

                {insumosStatus?.ingredients && insumosStatus.ingredients.length > 0 ? (
                  <div className="space-y-1.5 mt-2">
                    {insumosStatus.ingredients
                      .filter((ing: any) => ing.is_missing)
                      .slice(0, 5)
                      .map((ing: any) => (
                        <div key={ing.code} className="flex items-center justify-between p-2 rounded bg-white border border-zinc-200">
                          <div>
                            <span className="font-mono text-zinc-600 font-bold mr-1.5">{ing.code}</span>
                            <span className="text-zinc-800">{ing.description}</span>
                            <div className="text-[10px] text-zinc-500 mt-0.5">
                              Estoque: <span className="font-mono">{ing.current_stock.toFixed(1)}</span> {ing.unit} | 
                              Necessário: <span className="font-mono">{ing.required_qty.toFixed(1)}</span> {ing.unit}
                            </div>
                          </div>
                          {ing.next_delivery_date ? (
                            <div className="text-right text-[10px] text-blue-700 font-semibold flex items-center gap-1">
                              <Truck size={12} />
                              <span>Chegada prev.: {ing.next_delivery_date}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-rose-600 font-medium">Sem pedido em trânsito</span>
                          )}
                        </div>
                      ))}
                    {insumosStatus.ingredients.filter((ing: any) => ing.is_missing).length === 0 && (
                      <p className="text-zinc-500 text-[11px]">Matérias-primas e embalagens suficientes para produzir {primaryQty} unidades ({Math.round(primaryKg)} kg).</p>
                    )}
                  </div>
                ) : (
                  <p className="text-zinc-500">Sem formulação cadastrada no sistema.</p>
                )}
              </div>

              {/* Seção 2: Produtos de Mesma Formulação (Aproveitamento) */}
              <div className="rounded-lg border border-zinc-200 p-3 bg-white">
                <div className="mb-2">
                  <h4 className="font-bold text-zinc-900 text-[11px] uppercase tracking-wider">
                    Aproveitamento de Batelada (Mesma Receita Química)
                  </h4>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Produza junto com outros frascos/versões que usam a mesma massa no reator para otimizar tempo e capacidade.
                  </p>
                </div>

                {/* Produto principal */}
                <div className="p-2.5 rounded-lg bg-zinc-100 border border-zinc-300 flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded bg-zinc-900 text-white flex items-center justify-center text-[10px] font-bold">✓</span>
                    <div>
                      <span className="font-mono font-bold text-zinc-900 mr-2">{product.codigo}</span>
                      <span className="font-medium text-zinc-800">{product.descricao}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-zinc-900">{primaryQty} un</span>
                    <span className="text-zinc-500 ml-1.5 font-mono">(~{Math.round(primaryKg)} kg)</span>
                  </div>
                </div>

                {/* Siblings list */}
                {siblings.length === 0 ? (
                  <p className="text-zinc-400 py-3 text-center">Nenhum outro produto compartilha exatamente esta mesma formulação.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {siblings.map((sib) => {
                      const sel = selectedSiblings[sib.codigo];
                      const isSelected = Boolean(sel?.selected);
                      const w = parseProductUnitWeightKg(sib.descricao);
                      const sibKg = (sel?.qty || 100) * w;

                      return (
                        <div 
                          key={sib.codigo}
                          onClick={() => handleToggleSibling(sib.codigo)}
                          className={`p-2 rounded-lg border transition-all flex items-center justify-between cursor-pointer ${
                            isSelected 
                              ? 'bg-zinc-50 border-zinc-900 shadow-xs' 
                              : 'bg-white border-zinc-200 hover:border-zinc-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={() => {}} 
                              className="rounded border-zinc-300 text-zinc-900 focus:ring-0 cursor-pointer"
                            />
                            <div>
                              <div className="font-mono font-bold text-zinc-900 text-xs">
                                {sib.codigo}
                                <span className="ml-2 font-normal text-zinc-700">{sib.descricao}</span>
                              </div>
                              {sib.base && (
                                <span className="text-[10px] text-zinc-500">Base: {sib.base}</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="number"
                              min="1"
                              value={sel?.qty || 100}
                              onChange={(e) => handleQtyChange(sib.codigo, parseInt(e.target.value) || 0)}
                              className="w-16 px-1.5 py-1 text-right text-xs font-mono font-bold border border-zinc-200 rounded bg-white text-zinc-900"
                            />
                            <span className="text-zinc-500 font-mono text-[11px]">un</span>
                            <span className="text-zinc-400 font-mono text-[10px] w-14 text-right">
                              (~{Math.round(sibKg)} kg)
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Totalizador de Batelada */}
              <div className="p-3 bg-zinc-900 text-white rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
                    Volume Total da Batelada Planejada
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-lg font-bold font-mono">{Math.round(totalSelectedKg)} kg</span>
                    <span className="text-xs text-zinc-400 font-mono">({totalSelectedUnits} unidades)</span>
                  </div>
                </div>

                <div className="text-right text-[11px] text-zinc-300">
                  <span>Reator sugerido: </span>
                  <span className="font-bold text-white">
                    {totalSelectedKg <= 40 ? 'R-40 / Bombona' : totalSelectedKg <= 200 ? 'R-200' : totalSelectedKg <= 500 ? 'R-500' : 'R-1000'}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-zinc-200 bg-zinc-50/50 flex items-center justify-between">
          <button 
            type="button" 
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-zinc-300 text-zinc-700 font-semibold hover:bg-zinc-100 transition-colors"
          >
            Cancelar
          </button>

          <button 
            type="button" 
            disabled={submitting || loading}
            onClick={handleConfirmEnqueue}
            className="px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {submitting ? (
              <RefreshCw className="animate-spin" size={14} />
            ) : (
              <Plus size={14} />
            )}
            <span>Adicionar Batelada à Fila de Demandas</span>
          </button>
        </div>
      </div>
    </div>
  );
}

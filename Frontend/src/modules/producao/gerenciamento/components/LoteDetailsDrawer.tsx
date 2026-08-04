import React, { useState, useEffect } from 'react';
import {
  AlertTriangle, CheckCircle2, X, RefreshCw, LayoutDashboard, Scale, Package, FileText,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../../../geral/lib/http';
import { api } from '../../../geral/lib/api';
import { cn } from '../../../geral/lib/utils';

interface LoteDetailsDrawerProps {
  open: boolean;
  loteNumber: string | null;
  onClose: () => void;
  /** Oculta justificativa/resolução de desvios (ex.: visualização em Compras). */
  readOnly?: boolean;
  /** Destaca o insumo na aba Pesagem (código do item em Compras). */
  highlightInsumoCode?: string | null;
  onToast?: (message: string, type?: 'success' | 'error') => void;
  onResolved?: () => void;
}

export function LoteDetailsDrawer({
  open,
  loteNumber,
  onClose,
  readOnly = false,
  highlightInsumoCode = null,
  onToast,
  onResolved,
}: LoteDetailsDrawerProps) {
  const [selectedLoteDetails, setSelectedLoteDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('inicio');
  const [resolutionObs, setResolutionObs] = useState('');
  const [resolveLoading, setResolveLoading] = useState(false);
  const [associateSwapSimilar, setAssociateSwapSimilar] = useState(true);
  const [selectedExpectedCode, setSelectedExpectedCode] = useState('');
  const [selectedActualCode, setSelectedActualCode] = useState('');
  const [mappedSwaps, setMappedSwaps] = useState<Array<{
    expectedCode: string;
    expectedDesc: string;
    actualCode: string;
    actualDesc: string;
  }>>([]);
  const [resolveBaseCode, setResolveBaseCode] = useState('');
  const [resolveBaseQty, setResolveBaseQty] = useState('');
  const [baseProductOptions, setBaseProductOptions] = useState<any[]>([]);

  const toast = (message: string, type: 'success' | 'error' = 'success') => {
    onToast?.(message, type);
  };

  const loadDetails = async (number: string) => {
    setActiveSubTab('inicio');
    setLoading(true);
    setSelectedLoteDetails(null);
    setResolutionObs('');
    setAssociateSwapSimilar(true);
    setMappedSwaps([]);
    try {
      const res = await apiFetch(`/producao/lotes/${number}/detalhes`);
      if (res.ok) {
        setSelectedLoteDetails(await res.json());
      } else {
        toast('Erro ao buscar detalhes do lote', 'error');
      }
    } catch (e) {
      console.error('Error fetching lote details:', e);
      toast('Falha ao carregar detalhes do lote', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && loteNumber) {
      loadDetails(loteNumber);
    } else if (!open) {
      setSelectedLoteDetails(null);
    }
  }, [open, loteNumber]);

  useEffect(() => {
    if (!open || readOnly) return;
    apiFetch('/products?limit=5000&status=base')
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => setBaseProductOptions(data.items || []))
      .catch(() => setBaseProductOptions([]));
  }, [open, readOnly]);

  useEffect(() => {
    if (selectedLoteDetails?.pesagem_items) {
      const missing = selectedLoteDetails.pesagem_items.filter((item: any) => item.status === 'MISSING');
      const unplanned = selectedLoteDetails.pesagem_items.filter((item: any) => item.status === 'UNPLANNED');
      setSelectedExpectedCode(missing.length > 0 ? missing[0].ingredient_code : '');
      setSelectedActualCode(unplanned.length > 0 ? unplanned[0].ingredient_code : '');
    } else {
      setSelectedExpectedCode('');
      setSelectedActualCode('');
    }
  }, [selectedLoteDetails]);

  useEffect(() => {
    if (selectedLoteDetails) {
      setResolutionObs(selectedLoteDetails.resolutionObs || selectedLoteDetails.resolution_obs || '');
      setResolveBaseCode(
        selectedLoteDetails.resolvedBaseCode ||
        selectedLoteDetails.resolved_base_code ||
        selectedLoteDetails.base_codigo ||
        selectedLoteDetails.baseCodigo ||
        ''
      );
      const qty = selectedLoteDetails.resolvedBaseQuantity ?? selectedLoteDetails.resolved_base_quantity;
      setResolveBaseQty(qty != null && qty > 0 ? String(qty) : '');
    }
  }, [selectedLoteDetails]);

  const handleResolve = async () => {
    if (!loteNumber || !resolutionObs.trim()) {
      toast('Por favor, preencha a justificativa / observação.', 'error');
      return;
    }
    setResolveLoading(true);
    try {
      const res = await apiFetch(`/producao/lotes/${loteNumber}/resolver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          observations: resolutionObs,
          resolved_by: 'Administrador',
          base_code: resolveBaseCode.trim() || null,
          base_quantity: resolveBaseQty.trim() ? parseFloat(resolveBaseQty) : null,
          substitutions: mappedSwaps.map((swap) => ({
            expected_code: swap.expectedCode,
            actual_code: swap.actualCode,
          })),
        }),
      });

      if (res.ok) {
        toast('Desvios do lote justificados com sucesso!', 'success');
        if (associateSwapSimilar && mappedSwaps.length > 0) {
          for (const swap of mappedSwaps) {
            try {
              await api.addSimilarItem(swap.expectedCode, swap.actualCode);
            } catch (err) {
              console.error(`Erro ao associar semelhantes:`, err);
            }
          }
          toast(`${mappedSwaps.length} substituição(ões) salva(s) no cadastro de semelhantes!`, 'success');
        }
        await loadDetails(loteNumber);
        onResolved?.();
      } else {
        toast('Erro ao justificar desvios do lote', 'error');
      }
    } catch (e) {
      console.error('Error resolving lote:', e);
      toast('Falha ao justificar desvios', 'error');
    } finally {
      setResolveLoading(false);
    }
  };

  const handleUndoResolve = async () => {
    if (!loteNumber || !window.confirm('Deseja reabrir os desvios deste lote e remover a justificativa?')) return;
    setResolveLoading(true);
    try {
      const res = await apiFetch(`/producao/lotes/${loteNumber}/resolver`, { method: 'DELETE' });
      if (res.ok) {
        toast('Resolução estornada com sucesso!', 'success');
        await loadDetails(loteNumber);
        onResolved?.();
      } else {
        toast('Erro ao estornar resolução', 'error');
      }
    } catch (e) {
      console.error('Error undoing resolve:', e);
      toast('Falha ao estornar resolução', 'error');
    } finally {
      setResolveLoading(false);
    }
  };

  const subTabs = [
    { id: 'inicio', label: 'Início', icon: LayoutDashboard },
    { id: 'pesagem', label: 'Pesagem', icon: Scale },
    { id: 'envase', label: 'Envase', icon: Package },
    { id: 'conferencia', label: 'Conferência', icon: FileText },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop bg-black/60 backdrop-blur-sm"
            style={{ zIndex: 60 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-screen w-full max-w-3xl bg-white border-l border-zinc-200 shadow-2xl flex flex-col text-left text-zinc-800 font-sans"
            style={{ zIndex: 70 }}
          >
            <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between shrink-0">
              <div className="min-w-0 flex-1 pr-4">
                <h3 className="font-extrabold text-zinc-900 text-base tracking-tight truncate">
                  Lote #{selectedLoteDetails?.lote_number || loteNumber || '...'}
                </h3>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5 truncate">
                  Análise Detalhada de Lote
                </p>
                {selectedLoteDetails && (
                  <p className="text-xs text-zinc-500 mt-1.5 flex items-center gap-1.5 min-w-0">
                    <span className="font-mono font-bold text-zinc-700 bg-white px-2 py-0.5 rounded-lg border border-zinc-200 shrink-0">
                      {selectedLoteDetails.product_code}
                    </span>
                    <span className="text-zinc-300">·</span>
                    <span className="truncate text-zinc-600">{selectedLoteDetails.product_description}</span>
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-3 bg-white border-b border-zinc-200 flex flex-wrap gap-1.5 shrink-0">
              {subTabs.map((t) => {
                const Icon = t.icon;
                const isActive = activeSubTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveSubTab(t.id)}
                    className={cn(
                      'flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer',
                      isActive
                        ? 'bg-zinc-900 text-white'
                        : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 border border-transparent'
                    )}
                  >
                    <Icon size={14} />
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-zinc-50/40">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-400">
                  <RefreshCw className="h-8 w-8 animate-spin text-zinc-500" />
                  <span className="font-medium text-sm text-zinc-500">Analisando registros de estoque do lote...</span>
                </div>
              ) : selectedLoteDetails ? (
                <>
                  {activeSubTab === 'inicio' && (
                    <LoteInicioTab
                      details={selectedLoteDetails}
                      readOnly={readOnly}
                      resolutionObs={resolutionObs}
                      setResolutionObs={setResolutionObs}
                      resolveBaseCode={resolveBaseCode}
                      setResolveBaseCode={setResolveBaseCode}
                      resolveBaseQty={resolveBaseQty}
                      setResolveBaseQty={setResolveBaseQty}
                      baseProductOptions={baseProductOptions}
                      mappedSwaps={mappedSwaps}
                      setMappedSwaps={setMappedSwaps}
                      selectedExpectedCode={selectedExpectedCode}
                      setSelectedExpectedCode={setSelectedExpectedCode}
                      selectedActualCode={selectedActualCode}
                      setSelectedActualCode={setSelectedActualCode}
                      associateSwapSimilar={associateSwapSimilar}
                      setAssociateSwapSimilar={setAssociateSwapSimilar}
                      resolveLoading={resolveLoading}
                      onResolve={handleResolve}
                      onUndoResolve={handleUndoResolve}
                    />
                  )}
                  {activeSubTab === 'pesagem' && (
                    <LotePesagemTab details={selectedLoteDetails} highlightInsumoCode={highlightInsumoCode} />
                  )}
                  {activeSubTab === 'envase' && <LoteEnvaseTab details={selectedLoteDetails} />}
                  {activeSubTab === 'conferencia' && <LoteConferenciaTab details={selectedLoteDetails} />}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-zinc-500">
                  Ocorreu um erro ao carregar os dados analíticos do lote.
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function LoteInicioTab({
  details,
  readOnly,
  resolutionObs,
  setResolutionObs,
  resolveBaseCode,
  setResolveBaseCode,
  resolveBaseQty,
  setResolveBaseQty,
  baseProductOptions,
  mappedSwaps,
  setMappedSwaps,
  selectedExpectedCode,
  setSelectedExpectedCode,
  selectedActualCode,
  setSelectedActualCode,
  associateSwapSimilar,
  setAssociateSwapSimilar,
  resolveLoading,
  onResolve,
  onUndoResolve,
}: any) {
  const hasYieldError = details.bulk_yield_percentage < 90.0;
  const hasPesagemError = details.pesagem_items.some((item: any) => item.status !== 'OK');
  const hasEnvaseError = details.envase_products.some((p: any) =>
    p.packaging_items.some((item: any) => item.status !== 'OK')
  );
  const hasConfError = details.conferencia_items.some((item: any) => item.status !== 'OK');
  const hasErrors = hasYieldError || hasPesagemError || hasEnvaseError || hasConfError;
  const missingIngredients = details.pesagem_items.filter((item: any) => item.status === 'MISSING');
  const unplannedIngredients = details.pesagem_items.filter((item: any) => item.status === 'UNPLANNED');

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-200">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-zinc-200 p-4 rounded-2xl shadow-sm text-left">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Status do Lote</span>
          <div className="mt-2">
            <span className={cn(
              'px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border',
              details.status.toUpperCase() === 'EA'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                : details.status.toUpperCase() === 'CA'
                ? 'bg-rose-50 text-rose-700 border-rose-100'
                : 'bg-amber-50 text-amber-700 border-amber-100'
            )}>
              {details.status_label}
            </span>
          </div>
        </div>
        <div className="bg-white border border-zinc-200 p-4 rounded-2xl shadow-sm text-left">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Data de Abertura</span>
          <p className="text-sm font-bold text-zinc-800 mt-2">
            {new Date(details.date.replace(' ', 'T')).toLocaleDateString('pt-BR')}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 p-4 rounded-2xl shadow-sm text-left">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Operador (Pesagem/Prod)</span>
          <p className="text-sm font-bold text-zinc-800 mt-2">{details.fabricated_by || 'Não registrado'}</p>
        </div>
        <div className="bg-white border border-zinc-200 p-4 rounded-2xl shadow-sm text-left">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Autorização (Liberação)</span>
          <p className="text-sm font-bold text-zinc-800 mt-2">{details.authorized_by || 'Não registrado'}</p>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 p-5 rounded-2xl space-y-4 shadow-sm">
        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-100 pb-2">Rendimento Geral do Lote</h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-left">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Massa Teórica (Pesada)</span>
            <p className="text-lg font-extrabold text-zinc-900 mt-1">
              {(details.pesagem_total_actual ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} Kg
            </p>
          </div>
          <div className="text-left">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Massa Envasada (SKUs)</span>
            <p className="text-lg font-extrabold text-zinc-900 mt-1">
              {(details.total_packaged_weight_kg ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} Kg
            </p>
          </div>
          <div className="text-left">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Aproveitamento de Massa</span>
            <p className={cn(
              'text-lg font-extrabold mt-1',
              details.bulk_yield_percentage >= 90.0 ? 'text-emerald-600' : 'text-amber-600'
            )}>
              {details.bulk_yield_percentage.toFixed(2)}%
            </p>
          </div>
        </div>
        <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-100 text-xs text-zinc-500">
          O lote registrou uma perda de <strong className="text-zinc-800 font-bold">{details.bulk_loss_kg.toFixed(3)} Kg</strong> de massa entre a pesagem de matérias-primas e a conferência final de envase.
        </div>
      </div>

      {!readOnly && (() => {
        if (details.is_resolved) {
          return (
            <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-3 text-left shadow-sm">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Desvios Justificados e Aprovados</span>
              </div>
              <div className="text-xs text-zinc-700 font-medium space-y-1.5 bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Justificativa</p>
                <p className="text-zinc-800 leading-relaxed">&quot;{details.resolution_obs}&quot;</p>
              </div>
              <button
                disabled={resolveLoading}
                onClick={onUndoResolve}
                className="text-xs text-rose-600 hover:text-rose-700 font-bold hover:underline cursor-pointer disabled:opacity-50"
              >
                Estornar Justificativa (Reabrir Desvios)
              </button>
            </div>
          );
        }
        if (!hasErrors) {
          return (
            <div className="bg-white border border-zinc-200 rounded-2xl p-4 flex items-center gap-3 text-left shadow-sm">
              <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex-shrink-0 border border-emerald-100">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-zinc-900">Lote sem desvios críticos</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">Todos os parâmetros de pesagem, envase e rendimento estão dentro da tolerância esperada.</p>
              </div>
            </div>
          );
        }
        const availableMissing = missingIngredients.filter((item: any) =>
          !mappedSwaps.some((swap: any) => swap.expectedCode === item.ingredient_code)
        );
        const availableUnplanned = unplannedIngredients.filter((item: any) =>
          !mappedSwaps.some((swap: any) => swap.actualCode === item.ingredient_code)
        );
        const handleAddSwap = () => {
          if (!selectedExpectedCode || !selectedActualCode) return;
          const expectedItem = missingIngredients.find((item: any) => item.ingredient_code === selectedExpectedCode);
          const actualItem = unplannedIngredients.find((item: any) => item.ingredient_code === selectedActualCode);
          if (expectedItem && actualItem) {
            setMappedSwaps([...mappedSwaps, {
              expectedCode: selectedExpectedCode,
              expectedDesc: expectedItem.description,
              actualCode: selectedActualCode,
              actualDesc: actualItem.description,
            }]);
            setSelectedExpectedCode('');
            setSelectedActualCode('');
          }
        };
        return (
          <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4 text-left shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 shrink-0">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-extrabold text-sm text-zinc-900 tracking-tight">Justificar Desvios do Lote</h4>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Informe a base utilizada (se aplicável) e registre a justificativa dos desvios.</p>
                </div>
              </div>
            </div>
            <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-3">
              <div>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Base de produção consumida</p>
                <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                  Quando o ERP pesou só fragrância/aditivos, selecione a base pré-produzida. O NatumHub gera a baixa local de estoque.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Produto base</label>
                  <select
                    value={resolveBaseCode}
                    onChange={(e) => setResolveBaseCode(e.target.value)}
                    className="w-full text-xs border border-zinc-200 rounded-xl p-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  >
                    <option value="">— Não aplicável —</option>
                    {baseProductOptions.map((p: any) => (
                      <option key={p.codigo} value={p.codigo}>{p.descricao} ({p.codigo})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Quantidade (kg/un)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={resolveBaseQty}
                    onChange={(e) => setResolveBaseQty(e.target.value)}
                    className="w-full text-xs border border-zinc-200 rounded-xl p-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    placeholder="Ex: 65"
                  />
                </div>
              </div>
            </div>
            {missingIngredients.length > 0 && unplannedIngredients.length > 0 && (
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-3">
                <div>
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Mapear Substituições de Insumos</p>
                  <p className="text-[11px] text-zinc-500 mt-1">Selecione um insumo planejado ausente e o respectivo substituto para vinculá-los.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Insumo Planejado (Ausente)</label>
                    <select
                      value={selectedExpectedCode}
                      onChange={(e) => setSelectedExpectedCode(e.target.value)}
                      className="w-full text-xs border border-zinc-200 rounded-xl p-2.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white font-medium"
                    >
                      <option value="">-- Selecione o Insumo --</option>
                      {availableMissing.map((item: any) => (
                        <option key={item.ingredient_code} value={item.ingredient_code}>
                          {item.description} ({item.ingredient_code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Insumo Utilizado (Substituto)</label>
                    <select
                      value={selectedActualCode}
                      onChange={(e) => setSelectedActualCode(e.target.value)}
                      className="w-full text-xs border border-zinc-200 rounded-xl p-2.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white font-medium"
                    >
                      <option value="">-- Selecione o Insumo --</option>
                      {availableUnplanned.map((item: any) => (
                        <option key={item.ingredient_code} value={item.ingredient_code}>
                          {item.description} ({item.ingredient_code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!selectedExpectedCode || !selectedActualCode}
                  onClick={handleAddSwap}
                  className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer transition-colors"
                >
                  + Vincular Substituição
                </button>
                {mappedSwaps.length > 0 && (
                  <div className="space-y-1.5 bg-white rounded-xl border border-zinc-200 p-3">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Substituições vinculadas</span>
                    <div className="space-y-1.5 mt-1.5">
                      {mappedSwaps.map((swap: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center bg-zinc-50 border border-zinc-100 rounded-lg px-2.5 py-2 text-[11px]">
                          <div className="font-medium text-zinc-700 flex items-center gap-1.5 flex-1 truncate">
                            <span className="font-bold text-zinc-900 truncate max-w-[100px]" title={swap.expectedDesc}>{swap.expectedDesc}</span>
                            <span className="text-zinc-400">→</span>
                            <span className="font-bold text-zinc-900 truncate max-w-[100px]" title={swap.actualDesc}>{swap.actualDesc}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setMappedSwaps(mappedSwaps.filter((_: any, i: number) => i !== idx))}
                            className="text-rose-600 hover:text-rose-700 font-bold ml-2 cursor-pointer shrink-0"
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <label className="flex items-start gap-2.5 bg-white border border-zinc-200 rounded-xl p-3 cursor-pointer text-[11px] font-medium text-zinc-700 select-none">
                  <input
                    type="checkbox"
                    checked={associateSwapSimilar}
                    onChange={(e) => setAssociateSwapSimilar(e.target.checked)}
                    className="mt-0.5 accent-zinc-900 rounded"
                  />
                  <span>Cadastrar substituições vinculadas como insumos semelhantes (não alertar nas próximas produções)</span>
                </label>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Justificativa / Observação</label>
              <textarea
                value={resolutionObs}
                onChange={(e) => setResolutionObs(e.target.value)}
                placeholder="Digite a justificativa dos desvios observados..."
                rows={3}
                className="w-full text-xs border border-zinc-200 rounded-xl p-3 focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white font-medium"
              />
            </div>
            <button
              onClick={onResolve}
              disabled={resolveLoading || !resolutionObs.trim()}
              className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {resolveLoading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Processando...
                </>
              ) : (
                'Resolver Desvios e Aprovar Lote'
              )}
            </button>
          </div>
        );
      })()}
    </div>
  );
}

function LotePesagemTab({ details, highlightInsumoCode }: { details: any; highlightInsumoCode?: string | null }) {
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
      <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
        <div>
          <h4 className="font-extrabold text-sm text-zinc-900">Ficha de Pesagem de Matérias-Primas</h4>
          <p className="text-[10px] text-zinc-500 mt-0.5">Comparativo do previsto em formulação vs o real lançado pelas baixas no lote.</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-zinc-400 font-bold uppercase">Total Pesado</span>
          <p className="text-sm font-extrabold text-zinc-900">
            {(details.pesagem_total_actual ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} Kg
          </p>
        </div>
      </div>
      <div className="bg-white border border-zinc-150 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150">
            <tr>
              <th className="px-4 py-3">Insumo</th>
              <th className="px-4 py-3 text-right">Previsto</th>
              <th className="px-4 py-3 text-right">Pesado</th>
              <th className="px-4 py-3 text-right">Desvio</th>
              <th className="px-4 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {details.pesagem_items.map((item: any) => (
              <tr
                key={item.ingredient_code}
                className={cn(
                  'hover:bg-zinc-50/50 transition-colors',
                  highlightInsumoCode && item.ingredient_code === highlightInsumoCode && 'bg-indigo-50 ring-1 ring-inset ring-indigo-200'
                )}
              >
                <td className="px-4 py-3">
                  <div className="font-bold text-zinc-800">{item.description}</div>
                  <div className="text-[9px] text-zinc-400 font-mono mt-0.5">{item.ingredient_code}</div>
                </td>
                <td className="px-4 py-3 text-right font-medium text-zinc-500 font-mono">
                  {(item.expected_qty ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} Kg
                </td>
                <td className="px-4 py-3 text-right font-bold text-zinc-900 font-mono">
                  {(item.actual_qty ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} Kg
                </td>
                <td className={cn(
                  'px-4 py-3 text-right font-bold font-mono',
                  Math.abs(item.difference ?? 0) < 0.0001 ? 'text-zinc-500' :
                  (item.difference ?? 0) > 0.0 ? 'text-emerald-600' : 'text-rose-600'
                )}>
                  {(item.difference ?? 0) > 0.0 ? '+' : ''}{(item.difference ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} Kg
                  {item.expected_qty > 0.0 && (
                    <span className="text-[9px] font-normal block opacity-80 mt-0.5">
                      ({item.percentage_diff > 0.0 ? '+' : ''}{item.percentage_diff.toFixed(1)}%)
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={cn(
                    'px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border',
                    item.status === 'OK' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' :
                    item.status === 'MISSING' ? 'bg-rose-50 text-rose-700 border-rose-200/50' :
                    item.status === 'EXTRA' ? 'bg-blue-50 text-blue-700 border-blue-200/50' :
                    'bg-amber-50 text-amber-700 border-amber-200/50'
                  )}>
                    {item.status === 'OK' ? 'OK' :
                     item.status === 'MISSING' ? 'Faltando' :
                     item.status === 'EXTRA' ? 'Extra' : 'Desvio'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LoteEnvaseTab({ details }: { details: any }) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-200">
      {details.envase_products.map((prod: any) => (
        <div key={prod.product_code} className="space-y-3 bg-zinc-50/50 border border-zinc-150 p-4 rounded-xl shadow-sm">
          <div className="flex justify-between items-center border-b border-zinc-150 pb-2">
            <div>
              <h4 className="font-extrabold text-sm text-zinc-850">{prod.description}</h4>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                Código: {prod.product_code} | Embalagem Unitária: {prod.unit_weight_kg * 1000}g
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-zinc-400 font-bold uppercase">Unidades Envasadas</span>
              <p className="text-sm font-extrabold text-zinc-900">{(prod.actual_units_envasadas ?? 0).toLocaleString('pt-BR')} un</p>
            </div>
          </div>
          {!prod.has_packaging_formula ? (
            <div className="flex items-center gap-3 bg-blue-50/80 border border-blue-200/60 rounded-xl px-4 py-3.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100/80 text-blue-600 flex-shrink-0">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-blue-800">Nenhuma embalagem cadastrada</p>
                <p className="text-[10px] text-blue-600 mt-0.5">Este produto não possui embalagens registradas na formulação.</p>
              </div>
            </div>
          ) : prod.packaging_items.length === 0 ? (
            <div className="flex items-center gap-3 bg-amber-50/80 border border-amber-200/60 rounded-xl px-4 py-3.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100/80 text-amber-600 flex-shrink-0">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-amber-800">Sem movimentação de embalagens</p>
                <p className="text-[10px] text-amber-600 mt-0.5">Nenhuma saída de embalagem foi registrada neste lote.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-zinc-150 bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150">
                  <tr>
                    <th className="px-4 py-2.5">Insumo Embalagem</th>
                    <th className="px-4 py-2.5 text-right">Previsto</th>
                    <th className="px-4 py-2.5 text-right">Consumido</th>
                    <th className="px-4 py-2.5 text-right">Diferença</th>
                    <th className="px-4 py-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {prod.packaging_items.map((item: any) => (
                    <tr key={item.packaging_code} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="font-bold text-zinc-800">{item.description}</div>
                        <div className="text-[9px] text-zinc-400 font-mono mt-0.5">{item.packaging_code}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-zinc-500 font-mono">
                        {(item.expected_qty ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-zinc-900 font-mono">
                        {(item.actual_qty ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                      </td>
                      <td className={cn(
                        'px-4 py-2.5 text-right font-bold font-mono',
                        Math.abs(item.difference ?? 0) < 0.01 ? 'text-zinc-500' :
                        (item.difference ?? 0) > 0.0 ? 'text-emerald-600' : 'text-rose-600'
                      )}>
                        {(item.difference ?? 0) > 0.0 ? '+' : ''}{(item.difference ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={cn(
                          'px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border',
                          item.status === 'OK' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' :
                          item.status === 'MISSING' ? 'bg-rose-50 text-rose-700 border-rose-200/50' :
                          'bg-amber-50 text-amber-700 border-amber-200/50'
                        )}>
                          {item.status === 'OK' ? 'OK' : item.status === 'MISSING' ? 'Ausente' : 'Desvio'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LoteConferenciaTab({ details }: { details: any }) {
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
      <div className="border-b border-zinc-200 pb-3">
        <h4 className="font-extrabold text-sm text-zinc-900">Conferência de Finalização do Lote</h4>
        <p className="text-[10px] text-zinc-500 mt-0.5">Validação das unidades envasadas versus o saldo lançado em Estoque Atualizado (EA).</p>
      </div>
      {details.status.toUpperCase() !== 'EA' && (
        <div className="flex items-center gap-3 bg-blue-50/80 border border-blue-200/60 rounded-xl px-4 py-3.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100/80 text-blue-600 flex-shrink-0">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-blue-800">Lote em aberto — Status: {details.status_label}</p>
            <p className="text-[10px] text-blue-600 mt-0.5">A conferência de estoque só é possível após a finalização do lote (status EA).</p>
          </div>
        </div>
      )}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150">
            <tr>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3 text-right">Envasados (Frascos)</th>
              <th className="px-4 py-3 text-right">Previsto Final (F-1)</th>
              {details.status.toUpperCase() === 'EA' && (
                <>
                  <th className="px-4 py-3 text-right">Lançado no Estoque</th>
                  <th className="px-4 py-3 text-right">Discrepância</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {details.conferencia_items.map((item: any) => (
              <tr key={item.product_code} className="hover:bg-zinc-50/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-bold text-zinc-800">{item.description}</div>
                  <div className="text-[9px] text-zinc-400 font-mono mt-0.5">{item.product_code}</div>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-zinc-550 font-mono">
                  {(item.actual_units_envasadas ?? 0).toLocaleString('pt-BR')} un
                </td>
                <td className="px-4 py-3 text-right font-bold text-zinc-900 font-mono">
                  {(item.expected_finalized_units ?? 0).toLocaleString('pt-BR')} un
                </td>
                {details.status.toUpperCase() === 'EA' && (
                  <>
                    <td className="px-4 py-3 text-right font-bold text-zinc-900 font-mono">
                      {(item.registered_units_stock ?? 0).toLocaleString('pt-BR')} un
                    </td>
                    <td className={cn(
                      'px-4 py-3 text-right font-bold font-mono',
                      (item.discrepancy ?? 0) == 0.0 ? 'text-zinc-500' : 'text-rose-600'
                    )}>
                      {(item.discrepancy ?? 0) > 0.0 ? '+' : ''}{(item.discrepancy ?? 0).toLocaleString('pt-BR')} un
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        'px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border',
                        item.status === 'OK' ? 'bg-emerald-50 text-emerald-700 border-emerald-250/50' :
                        'bg-rose-50 text-rose-700 border-rose-250/50'
                      )}>
                        {item.status === 'OK' ? 'Aprovado' : 'Discrepante'}
                      </span>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

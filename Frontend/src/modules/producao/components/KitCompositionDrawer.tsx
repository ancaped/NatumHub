import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  X, PlusCircle, Trash2, Layers, Box, AlertCircle, CheckCircle2, 
  Calculator, Search, Info
} from 'lucide-react';
import { apiFetch } from '../../geral/lib/http';

export interface KitComposicaoRow {
  kit_codigo: string;
  kit_descricao: string;
  componente_codigo: string;
  componente_descricao: string;
  quantidade: number;
  fator_proporcao_qtd?: number | null;
  fator_proporcao_kits?: number | null;
  /** `erp` (sync Passo P) ou `manual` (CRUD/Excel) */
  origem?: string;
}

export interface ProductOption {
  codigo: string;
  descricao: string;
  fonte?: string;
}

export interface KitCompositionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  kitCodigo: string;
  kitDescricao?: string;
  onCompositionUpdated?: () => void;
}

export default function KitCompositionDrawer({
  isOpen,
  onClose,
  kitCodigo,
  kitDescricao,
  onCompositionUpdated
}: KitCompositionDrawerProps) {
  const [items, setItems] = useState<KitComposicaoRow[]>([]);
  const [overridesMap, setOverridesMap] = useState<Record<string, any>>({});
  const [togglingComp, setTogglingComp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  
  // Add component form states
  const [searchComp, setSearchComp] = useState('');
  const [selectedCompCode, setSelectedCompCode] = useState('');
  const [selectedComp, setSelectedComp] = useState<ProductOption | null>(null);
  const [mode, setMode] = useState<'direct' | 'proportional'>('direct');
  
  // Direct quantity state
  const [directQty, setDirectQty] = useState<number | string>(1);
  
  // Proportional quantity state
  const [propQtd, setPropQtd] = useState<number | string>(1);
  const [propKits, setPropKits] = useState<number | string>(6);
  
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchKitItems = useCallback(async () => {
    if (!kitCodigo) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const [resKits, resOvr] = await Promise.all([
        apiFetch(`/kits/composicao`),
        apiFetch(`/overrides`)
      ]);
      if (resKits.ok) {
        const data: KitComposicaoRow[] = await resKits.json();
        const filtered = (Array.isArray(data) ? data : []).filter(
          row => (row.kit_codigo || '').replace(/['"]/g, '').trim().toLowerCase() === 
                 kitCodigo.replace(/['"]/g, '').trim().toLowerCase()
        );
        setItems(filtered);
      } else {
        setErrorMsg('Falha ao carregar itens da composição.');
      }
      if (resOvr.ok) {
        const ovrList = await resOvr.json();
        const map: Record<string, any> = {};
        (Array.isArray(ovrList) ? ovrList : []).forEach((o: any) => {
          if (o.codigo) map[o.codigo] = o;
        });
        setOverridesMap(map);
      }
    } catch (e) {
      console.error('Erro ao buscar composição no Drawer:', e);
      setErrorMsg('Erro de conexão ao carregar itens.');
    } finally {
      setLoading(false);
    }
  }, [kitCodigo]);

  const handleToggleApenasKit = async (compCode: string, newValue: number) => {
    setTogglingComp(compCode);
    try {
      const existing = overridesMap[compCode] || {};
      const payload = {
        ...existing,
        codigo: compCode,
        produzir_apenas_kit: newValue
      };
      const res = await apiFetch(`/overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setOverridesMap(prev => ({
          ...prev,
          [compCode]: { ...(prev[compCode] || {}), produzir_apenas_kit: newValue }
        }));
        onCompositionUpdated?.();
      }
    } catch (e) {
      console.error('Erro ao alternar modo do componente:', e);
    } finally {
      setTogglingComp(null);
    }
  };

  useEffect(() => {
    if (isOpen && kitCodigo) {
      fetchKitItems();
    } else {
      setItems([]);
      setProducts([]);
      setSelectedCompCode('');
      setSelectedComp(null);
      setSearchComp('');
      setErrorMsg(null);
    }
  }, [isOpen, kitCodigo, fetchKitItems]);

  // Busca produtos + embalagens/insumos (items) no servidor
  useEffect(() => {
    if (!isOpen || selectedComp) return;
    const q = searchComp.trim();
    if (q.length < 1) {
      setProducts([]);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await apiFetch(
          `/kits/component-candidates?q=${encodeURIComponent(q)}&limit=20`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const list = Array.isArray(data?.items) ? data.items : [];
        if (!cancelled) {
          setProducts(
            list.map((p: any) => ({
              codigo: p.codigo || '',
              descricao: p.descricao || '',
              fonte: p.fonte || undefined,
            }))
          );
        }
      } catch (e) {
        console.error('Erro ao buscar candidatos a componente:', e);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, searchComp, selectedComp]);

  const filteredProducts = products;

  const selectedCompObj = selectedComp;

  const calculatedProportionalQty = useMemo(() => {
    const q = Number(propQtd) || 0;
    const k = Number(propKits) || 1;
    if (k <= 0) return 0;
    return q / k;
  }, [propQtd, propKits]);

  const handleAddRelation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kitCodigo || !selectedCompCode) {
      setErrorMsg('Selecione um componente válido.');
      return;
    }

    let quantidadeFinal = 1.0;
    let fatQtd: number | null = null;
    let fatKits: number | null = null;

    if (mode === 'direct') {
      quantidadeFinal = Number(directQty);
      if (isNaN(quantidadeFinal) || quantidadeFinal <= 0) {
        setErrorMsg('A quantidade direta deve ser um número positivo.');
        return;
      }
    } else {
      const q = Number(propQtd);
      const k = Number(propKits);
      if (isNaN(q) || q <= 0 || isNaN(k) || k <= 0) {
        setErrorMsg('Os fatores de proporção devem ser números positivos maiores que zero.');
        return;
      }
      quantidadeFinal = Number((q / k).toFixed(4));
      fatQtd = q;
      fatKits = Math.round(k);
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const payload = {
        kit_codigo: kitCodigo.trim(),
        componente_codigo: selectedCompCode.trim(),
        quantidade: quantidadeFinal,
        fator_proporcao_qtd: fatQtd,
        fator_proporcao_kits: fatKits
      };

      const res = await apiFetch(`/kits/composicao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setSelectedCompCode('');
        setSelectedComp(null);
        setSearchComp('');
        setProducts([]);
        if (mode === 'direct') setDirectQty(1);
        if (mode === 'proportional') { setPropQtd(1); setPropKits(6); }
        await fetchKitItems();
        onCompositionUpdated?.();
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err.error || 'Erro ao vincular componente.');
      }
    } catch (e) {
      console.error(e);
      setErrorMsg('Erro de conexão com o servidor.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteItem = async (compCode: string, origem?: string) => {
    if ((origem || 'manual') === 'erp') {
      alert('Componente sincronizado do ERP não pode ser removido aqui. Altere no ERP e rode o sync.');
      return;
    }
    if (!window.confirm(`Deseja realmente desvincular o componente ${compCode} deste kit?`)) return;
    try {
      const res = await apiFetch(`/kits/composicao/${encodeURIComponent(kitCodigo.trim())}/${encodeURIComponent(compCode.trim())}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setItems(prev => prev.filter(item => item.componente_codigo !== compCode));
        onCompositionUpdated?.();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Erro ao desvincular componente.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro de rede ao remover.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="relative w-full max-w-xl bg-white text-zinc-800 shadow-2xl flex flex-col h-full z-10 border-l border-zinc-200 animate-in slide-in-from-right duration-350">
        {/* Header */}
        <div className="px-6 py-5 bg-zinc-50 border-b border-zinc-150 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600 border border-emerald-100 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-zinc-900 truncate">
                  Composição de Kit
                </span>
                <span className="px-2.5 py-0.5 bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono text-xs rounded-md font-extrabold">
                  {kitCodigo}
                </span>
              </div>
              <p className="text-xs text-zinc-500 truncate mt-0.5 font-medium">
                {kitDescricao || 'Mestre de Estrutura do Kit'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-zinc-200"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Strip */}
        <div className="px-6 py-3 bg-zinc-50/50 border-b border-zinc-150 flex items-center justify-between text-xs text-zinc-500 gap-3">
          <div className="flex items-center gap-2 font-semibold min-w-0">
            <span>Componentes Ativos:</span>
            <span className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] border ${
              items.length > 0 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-250' 
                : 'bg-amber-50 text-amber-700 border-amber-250'
            }`}>
              {items.length} {items.length === 1 ? 'item' : 'itens'}
            </span>
          </div>
          <span className="text-[10px] text-zinc-400 font-medium text-right shrink-0 max-w-[55%] leading-snug">
            Composição do ERP via sync; extras manuais são preservados.
          </span>
        </div>

        {/* Body content (Scrollable list of current components) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-450">
              Insumos & Embalagens Vinculados
            </h3>
            {loading && <span className="text-xs text-zinc-500 animate-pulse font-medium">Carregando...</span>}
          </div>

          {loading && items.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-6 h-6 border-2 border-zinc-650 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-zinc-500 font-medium">Lendo estrutura do kit...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-zinc-200 rounded-2xl text-center space-y-3 bg-zinc-50/50">
              <Box className="w-8 h-8 text-zinc-400 mx-auto" />
              <p className="text-xs font-bold text-zinc-700">Este kit ainda não possui componentes.</p>
              <p className="text-[11px] text-zinc-500 max-w-xs mx-auto leading-relaxed">
                Use o formulário abaixo para vincular caixas, frascos, rótulos ou líquidos que compõem este kit comercial.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const hasProportion = item.fator_proporcao_kits != null && item.fator_proporcao_kits > 1;
                const isErp = (item.origem || 'manual') === 'erp';
                return (
                  <div 
                    key={`${item.kit_codigo}-${item.componente_codigo}`}
                    className="p-4 bg-zinc-50 border border-zinc-200 hover:border-zinc-350 hover:bg-zinc-50/50 rounded-2xl transition-all duration-200 shadow-xs flex items-center justify-between gap-4 group"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-zinc-700 bg-white border border-zinc-250 px-2 py-0.5 rounded-lg shrink-0">
                          {item.componente_codigo}
                        </span>
                        <span className="text-xs font-bold text-zinc-900 truncate group-hover:text-zinc-950 transition-colors">
                          {item.componente_descricao || 'Sem descrição'}
                        </span>
                        <span
                          className={`text-[10px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${
                            isErp
                              ? 'bg-sky-50 text-sky-800 border-sky-200'
                              : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                          }`}
                          title={isErp ? 'Sincronizado do ERP (Passo P)' : 'Cadastro manual ou Excel'}
                        >
                          {isErp ? 'ERP' : 'Manual'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap text-[11px] pt-0.5">
                        {hasProportion ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded-md border border-indigo-150">
                            <Calculator className="w-3.5 h-3.5 text-indigo-500" />
                            Proporcional: {item.fator_proporcao_qtd || 1} {Number(item.fator_proporcao_qtd || 1) === 1 ? 'unid.' : 'unids.'} para {item.fator_proporcao_kits} {Number(item.fator_proporcao_kits) === 1 ? 'kit' : 'kits'} ({Number(item.quantidade).toFixed(4)}/kit)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-150 font-bold rounded-md">
                            Qtd por Kit: <strong className="text-emerald-800 font-extrabold">{Number(item.quantidade)}</strong> {Number(item.quantidade) === 1 ? 'unidade' : 'unidades'}
                          </span>
                        )}

                        <button
                          type="button"
                          disabled={togglingComp === item.componente_codigo}
                          onClick={() => {
                            const compOvr = overridesMap[item.componente_codigo];
                            const isOnlyKit = compOvr?.produzir_apenas_kit === 1;
                            handleToggleApenasKit(item.componente_codigo, isOnlyKit ? 0 : 1);
                          }}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                            overridesMap[item.componente_codigo]?.produzir_apenas_kit === 1
                              ? 'bg-purple-50 text-purple-700 border-purple-250 hover:bg-purple-100'
                              : 'bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200'
                          }`}
                          title={
                            overridesMap[item.componente_codigo]?.produzir_apenas_kit === 1
                              ? 'Produzido apenas para kits (demanda vem dos kits). Clique para mudar para Vendido Individual.'
                              : 'Vendido individualmente também. Clique para mudar para Produzir Apenas para Kit.'
                          }
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            overridesMap[item.componente_codigo]?.produzir_apenas_kit === 1 ? 'bg-purple-600' : 'bg-zinc-400'
                          }`} />
                          {togglingComp === item.componente_codigo
                            ? 'Salvando...'
                            : overridesMap[item.componente_codigo]?.produzir_apenas_kit === 1
                            ? 'Apenas Kit'
                            : 'Vendido Avulso'}
                        </button>
                      </div>
                    </div>

                    {isErp ? (
                      <span
                        className="p-2 text-zinc-300 rounded-lg border border-transparent shrink-0"
                        title="Linha do ERP — remova no ERP e sincronize"
                      >
                        <Trash2 className="w-4 h-4" />
                      </span>
                    ) : (
                      <button
                        onClick={() => handleDeleteItem(item.componente_codigo, item.origem)}
                        className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg border border-rose-150 transition-colors opacity-70 group-hover:opacity-100 cursor-pointer shrink-0"
                        title="Desvincular componente"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer / Add Component Section */}
        <div className="p-6 bg-zinc-50 border-t border-zinc-150 shrink-0 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-600 flex items-center gap-1.5">
              <PlusCircle className="w-4 h-4 text-emerald-600" />
              Adicionar Componente ao Kit
            </h3>
          </div>

          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-150 rounded-xl text-xs text-rose-700 font-bold flex items-center gap-2 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleAddRelation} className="space-y-4">
            {/* Component Selector / Search Autocomplete */}
            <div className="space-y-1.5 relative">
              <label className="text-[11px] font-bold text-zinc-500">
                Buscar produto, embalagem ou insumo (código ou nome)
              </label>
              {selectedCompObj ? (
                <div className="flex items-center justify-between p-3 bg-white border border-emerald-600 rounded-xl shadow-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-250 px-2 py-0.5 rounded-lg">
                      {selectedCompObj.codigo}
                    </span>
                    <span className="text-xs font-bold text-zinc-900 truncate">
                      {selectedCompObj.descricao}
                    </span>
                    {selectedCompObj.fonte === 'item' && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded shrink-0">
                        embalagem/insumo
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedCompCode(''); setSelectedComp(null); setSearchComp(''); setProducts([]); }}
                    className="text-zinc-400 hover:text-zinc-600 p-1.5 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchComp}
                    onChange={(e) => setSearchComp(e.target.value)}
                    placeholder="Ex.: 9.04.064 ou CAIXA KIT…"
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-950/10 focus:border-zinc-900 text-xs font-semibold text-zinc-900 transition-all placeholder:text-zinc-400"
                  />
                  
                  {searchLoading && (
                    <p className="absolute left-0 right-0 bottom-full mb-1.5 px-3 py-2 bg-white border border-zinc-200 rounded-xl shadow text-[11px] text-zinc-500 font-medium z-30">
                      Buscando…
                    </p>
                  )}
                  {!searchLoading && searchComp.trim() && filteredProducts.length === 0 && (
                    <p className="absolute left-0 right-0 bottom-full mb-1.5 px-3 py-2 bg-white border border-zinc-200 rounded-xl shadow text-[11px] text-zinc-500 font-medium z-30">
                      Nenhum produto ou embalagem/insumo encontrado.
                    </p>
                  )}
                  {filteredProducts.length > 0 && (
                    <div className="absolute left-0 right-0 bottom-full mb-1.5 bg-white border border-zinc-200 rounded-xl shadow-2xl max-h-52 overflow-y-auto z-30 divide-y divide-zinc-150">
                      {filteredProducts.map(p => (
                        <button
                          key={`${p.fonte || 'x'}-${p.codigo}`}
                          type="button"
                          onClick={() => {
                            setSelectedCompCode(p.codigo);
                            setSelectedComp(p);
                            setSearchComp('');
                            setProducts([]);
                          }}
                          className="w-full text-left p-2.5 hover:bg-zinc-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <span className="font-mono text-xs font-bold bg-zinc-50 text-zinc-700 border border-zinc-200 px-2 py-0.5 rounded-lg shrink-0">
                            {p.codigo}
                          </span>
                          <span className="text-xs font-bold text-zinc-800 truncate hover:text-zinc-950 flex-1 min-w-0">
                            {p.descricao}
                          </span>
                          {p.fonte === 'item' ? (
                            <span className="text-[9px] font-bold uppercase text-amber-700 shrink-0">item</span>
                          ) : (
                            <span className="text-[9px] font-bold uppercase text-zinc-400 shrink-0">produto</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mode Selection Toggle (Direct vs Proportional) */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-zinc-550 block">
                Tipo de Consumo / Quantidade
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 border border-zinc-200 rounded-xl">
                <button
                  type="button"
                  onClick={() => setMode('direct')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                    mode === 'direct'
                      ? 'bg-white text-zinc-900 shadow-sm border-zinc-200'
                      : 'text-zinc-500 hover:text-zinc-800 border-transparent'
                  }`}
                >
                  <Box className="w-3.5 h-3.5" />
                  Quantidade Direta
                </button>
                <button
                  type="button"
                  onClick={() => setMode('proportional')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                    mode === 'proportional'
                      ? 'bg-white text-zinc-900 shadow-sm border-zinc-200'
                      : 'text-zinc-500 hover:text-zinc-800 border-transparent'
                  }`}
                >
                  <Calculator className="w-3.5 h-3.5" />
                  Proporcional (Fracionário)
                </button>
              </div>
            </div>

            {/* Inputs based on Mode */}
            {mode === 'direct' ? (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-550">
                  Quantidade consumida por cada Kit:
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  value={directQty}
                  onChange={(e) => setDirectQty(e.target.value)}
                  placeholder="Ex: 1 ou 2.5 ou 0.1667"
                  className="w-full px-4 py-2.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-950/10 focus:border-zinc-900 text-xs font-bold text-zinc-900"
                  required
                />
                <p className="text-[10px] text-zinc-500 font-semibold">
                  Ideal para itens com relação inteira (ex: 1 frasco por kit) ou decimais simples (ex: 0.5 litro/kit).
                </p>
              </div>
            ) : (
              <div className="p-4 bg-indigo-50/20 border border-indigo-100 rounded-xl space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-indigo-700">
                      Insumo / Embalagem (Qtd):
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.0001"
                      value={propQtd}
                      onChange={(e) => setPropQtd(e.target.value)}
                      placeholder="Ex: 1"
                      className="w-full px-3 py-2 bg-white border border-zinc-250 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 text-xs font-bold text-zinc-900"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-indigo-700">
                      Serve para quantos Kits?
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={propKits}
                      onChange={(e) => setPropKits(e.target.value)}
                      placeholder="Ex: 6"
                      className="w-full px-3 py-2 bg-white border border-zinc-250 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 text-xs font-bold text-zinc-900"
                      required
                    />
                  </div>
                </div>

                <div className="p-2.5 bg-white rounded-lg border border-indigo-100 flex items-center justify-between text-xs font-bold text-indigo-700">
                  <span className="flex items-center gap-1.5 text-[11px]">
                    <Info className="w-3.5 h-3.5 text-indigo-500" />
                    Consumo efetivo por kit:
                  </span>
                  <span className="font-mono font-extrabold text-indigo-800">
                    {calculatedProportionalQty.toFixed(4)} unid/kit
                  </span>
                </div>
                <p className="text-[10px] text-indigo-600 leading-relaxed font-semibold">
                  Exemplo: 1 caixa mestre (ou pallet) serve para embalar 6 kits comerciais ({`1/6 = 0.1667`}).
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !selectedCompCode}
              className={`w-full py-3 px-4 rounded-xl font-extrabold text-xs shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                submitting || !selectedCompCode
                  ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed border-zinc-200'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-white border-transparent hover:shadow-md'
              }`}
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-zinc-550 border-t-transparent rounded-full animate-spin" />
                  Vinculando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-zinc-350 animate-pulse" />
                  Vincular Componente ao Kit
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

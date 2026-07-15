import React, { useEffect, useState, useMemo } from 'react';
import { 
  ArrowLeft, Search, Loader2, Printer, Calendar, 
  Database, Boxes, Layers, TrendingUp, AlertTriangle, AlertCircle, Clock
} from 'lucide-react';
import { apiFetch } from '../../geral/lib/http';

interface DemandItem {
  itemCode: string;
  description: string;
  unit: string;
  categoryId: string | null;
  categoryName: string;
  currentStock: number;
  overallAvg: number;
  notes: string | null;
}

export default function PrevisaoUsoView({ onBackToHub }: { onBackToHub: () => void }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<DemandItem[]>([]);
  
  // Segmented filters
  const [period, setPeriod] = useState<'3' | '6' | '12'>('6');
  const [category, setCategory] = useState<'all' | 'mp' | 'emb'>('all');
  const [search, setSearch] = useState('');

  const loadForecast = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/compras/demands?targetDays=90&overridePeriod=${period}`);
      if (res.ok) {
        setItems(await res.json());
      }
    } catch (e) {
      console.error('Erro ao carregar dados de previsão de uso:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForecast();
  }, [period]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // 1. Categoria filter
      const isMp = item.itemCode.startsWith('9.15.') || item.categoryId === 'cat_mp';
      const isEmb = item.itemCode.startsWith('08.') || item.itemCode.startsWith('9.') && !item.itemCode.startsWith('9.15.') || item.categoryId === 'cat_emb';
      
      if (category === 'mp' && !isMp) return false;
      if (category === 'emb' && !isEmb) return false;

      // 2. Search text filter
      const q = search.trim().toLowerCase();
      if (q) {
        return (
          item.itemCode.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          (item.categoryName || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, category, search]);

  // KPIs
  const kpis = useMemo(() => {
    const total = filteredItems.length;
    let critical = 0; // estoque < média mensal
    let totalStockValue = 0;
    let sumCoverageDays = 0;
    let itemsWithConsumption = 0;

    filteredItems.forEach(item => {
      if (item.overallAvg > 0) {
        itemsWithConsumption++;
        const coverageDays = (item.currentStock / (item.overallAvg / 30));
        sumCoverageDays += coverageDays;
        if (item.currentStock < item.overallAvg) {
          critical++;
        }
      }
    });

    const avgCoverage = itemsWithConsumption > 0 ? Math.round(sumCoverageDays / itemsWithConsumption) : 0;

    return { total, critical, avgCoverage };
  }, [filteredItems]);

  const consolidated = useMemo(() => {
    let mp30 = 0;
    let emb30 = 0;
    filteredItems.forEach(item => {
      const isMp = item.itemCode.startsWith('9.15.') || item.categoryId === 'cat_mp';
      if (isMp) {
        mp30 += item.overallAvg;
      } else {
        emb30 += item.overallAvg;
      }
    });
    return {
      p30Mp: mp30,
      p60Mp: mp30 * 2,
      p90Mp: mp30 * 3,
      p30Emb: emb30,
      p60Emb: emb30 * 2,
      p90Emb: emb30 * 3,
    };
  }, [filteredItems]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-50 font-sans text-zinc-900 overflow-hidden w-full print:bg-white print:overflow-visible">
      {/* Top Header (Ocultado na Impressão) */}
      <div className="p-4 bg-white border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBackToHub}
            className="bg-white border border-zinc-200 hover:bg-zinc-150 p-2 rounded-xl text-zinc-650 hover:text-zinc-900 transition-all cursor-pointer shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="font-bold text-lg tracking-tight">Previsão de Uso</h1>
            <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Estudo de Cobertura e Consumo Futuro de Insumos</p>
          </div>
        </div>

        <button
          onClick={handlePrint}
          className="text-xs font-bold px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl shadow-xs cursor-pointer flex items-center gap-2"
        >
          <Printer className="h-4 w-4" />
          Imprimir Relatório
        </button>
      </div>

      {/* Control Panel (Ocultado na Impressão) */}
      <div className="p-6 bg-white border-b border-zinc-200 space-y-4 shrink-0 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Média Móvel Selection */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Média Móvel de Consumo</label>
            <div className="grid grid-cols-3 bg-zinc-100 p-1 rounded-xl border border-zinc-200">
              {(['3', '6', '12'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    period === p 
                      ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/50' 
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  {p} meses
                </button>
              ))}
            </div>
          </div>

          {/* 2. Categoria Selection */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Categoria</label>
            <div className="grid grid-cols-3 bg-zinc-100 p-1 rounded-xl border border-zinc-200">
              {([
                { id: 'all', label: 'Todas' },
                { id: 'mp', label: 'MP' },
                { id: 'emb', label: 'Emb' }
              ] as const).map(c => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    category === c.id 
                      ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/50' 
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Search */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Pesquisa</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar código ou descrição..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-200 text-xs bg-zinc-50 focus:bg-white transition-all"
              />
            </div>
          </div>
        </div>

        {/* Dynamic KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* General Stock Health */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Métricas de Cobertura</label>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-[9px] font-bold text-zinc-400 uppercase">Itens</span>
                <span className="text-base font-extrabold text-zinc-900 mt-1">{kpis.total}</span>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-[9px] font-bold text-zinc-400 uppercase">Abaixo de 30d</span>
                <span className="text-base font-extrabold text-rose-700 mt-1">{kpis.critical}</span>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-[9px] font-bold text-zinc-400 uppercase">Garantia Méd.</span>
                <span className="text-base font-extrabold text-zinc-900 mt-1">{kpis.avgCoverage > 0 ? `${kpis.avgCoverage}d` : '—'}</span>
              </div>
            </div>
          </div>

          {/* Consolidated Usage Projections */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Consumo Consolidado Projetado</label>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-[9px] font-bold text-zinc-400 uppercase">Soma 30 Dias</span>
                <div className="mt-1 space-y-0.5 text-[10px]">
                  {(category === 'all' || category === 'mp') && (
                    <div className="flex justify-between font-bold text-zinc-800">
                      <span>MP:</span>
                      <span>{Math.round(consolidated.p30Mp).toLocaleString('pt-BR')} kg</span>
                    </div>
                  )}
                  {(category === 'all' || category === 'emb') && (
                    <div className="flex justify-between font-bold text-zinc-800">
                      <span>Emb:</span>
                      <span>{Math.round(consolidated.p30Emb).toLocaleString('pt-BR')} un</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-[9px] font-bold text-zinc-400 uppercase">Soma 60 Dias</span>
                <div className="mt-1 space-y-0.5 text-[10px]">
                  {(category === 'all' || category === 'mp') && (
                    <div className="flex justify-between font-bold text-zinc-800">
                      <span>MP:</span>
                      <span>{Math.round(consolidated.p60Mp).toLocaleString('pt-BR')} kg</span>
                    </div>
                  )}
                  {(category === 'all' || category === 'emb') && (
                    <div className="flex justify-between font-bold text-zinc-800">
                      <span>Emb:</span>
                      <span>{Math.round(consolidated.p60Emb).toLocaleString('pt-BR')} un</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-[9px] font-bold text-zinc-400 uppercase">Soma 90 Dias</span>
                <div className="mt-1 space-y-0.5 text-[10px]">
                  {(category === 'all' || category === 'mp') && (
                    <div className="flex justify-between font-bold text-zinc-800">
                      <span>MP:</span>
                      <span>{Math.round(consolidated.p90Mp).toLocaleString('pt-BR')} kg</span>
                    </div>
                  )}
                  {(category === 'all' || category === 'emb') && (
                    <div className="flex justify-between font-bold text-zinc-800">
                      <span>Emb:</span>
                      <span>{Math.round(consolidated.p90Emb).toLocaleString('pt-BR')} un</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Printable Report Header */}
      <div className="hidden print:block p-8 border-b border-zinc-200 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-zinc-950">Previsão de Uso de Insumos</h1>
            <p className="text-xs text-zinc-500 font-semibold uppercase mt-1 tracking-wider">
              NÁTUM BIO COSMÉTICOS · RELATÓRIO DE COBERTURA E FORECASTING
            </p>
          </div>
          <div className="text-right text-xs text-zinc-450 font-mono space-y-0.5">
            <div>Data: {new Date().toLocaleDateString('pt-BR')}</div>
            <div>Média Base: {period} meses</div>
            <div>Categoria: {category === 'mp' ? 'Matéria-Prima' : category === 'emb' ? 'Embalagens' : 'Todos os Insumos'}</div>
          </div>
        </div>

        <div className="grid grid-cols-6 border border-zinc-200 rounded-xl divide-x divide-zinc-200 bg-zinc-50/50 p-4 text-center">
          <div>
            <div className="text-[9px] font-bold text-zinc-400 uppercase">Itens</div>
            <div className="text-sm font-bold text-zinc-955 mt-1">{kpis.total}</div>
          </div>
          <div>
            <div className="text-[9px] font-bold text-zinc-400 uppercase">Abaixo 30d</div>
            <div className="text-sm font-bold text-rose-700 mt-1">{kpis.critical}</div>
          </div>
          <div>
            <div className="text-[9px] font-bold text-zinc-400 uppercase">Garantia Méd</div>
            <div className="text-sm font-bold text-zinc-955 mt-1">{kpis.avgCoverage > 0 ? `${kpis.avgCoverage}d` : '—'}</div>
          </div>
          <div>
            <div className="text-[9px] font-bold text-zinc-400 uppercase">Soma 30d</div>
            <div className="text-[10px] font-bold text-zinc-955 mt-1">
              {category !== 'emb' && `${Math.round(consolidated.p30Mp).toLocaleString('pt-BR')} kg`}
              {category === 'all' && ' / '}
              {category !== 'mp' && `${Math.round(consolidated.p30Emb).toLocaleString('pt-BR')} un`}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-bold text-zinc-400 uppercase">Soma 60d</div>
            <div className="text-[10px] font-bold text-zinc-955 mt-1">
              {category !== 'emb' && `${Math.round(consolidated.p60Mp).toLocaleString('pt-BR')} kg`}
              {category === 'all' && ' / '}
              {category !== 'mp' && `${Math.round(consolidated.p60Emb).toLocaleString('pt-BR')} un`}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-bold text-zinc-400 uppercase">Soma 90d</div>
            <div className="text-[10px] font-bold text-zinc-955 mt-1">
              {category !== 'emb' && `${Math.round(consolidated.p90Mp).toLocaleString('pt-BR')} kg`}
              {category === 'all' && ' / '}
              {category !== 'mp' && `${Math.round(consolidated.p90Emb).toLocaleString('pt-BR')} un`}
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0 print:p-8 print:overflow-visible flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-zinc-400 text-sm py-32">
            <Loader2 className="h-5 w-5 animate-spin" />
            Recalculando médias de consumo e previsões...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm py-32 border border-dashed border-zinc-200 rounded-2xl bg-white">
            Nenhum insumo mapeado nos filtros selecionados.
          </div>
        ) : (
          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm flex flex-col print:border-none print:shadow-none">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold uppercase text-zinc-400 tracking-wider print:bg-zinc-100 print:text-zinc-700">
                  <th className="px-6 py-4">Código</th>
                  <th className="px-6 py-4">Descrição</th>
                  <th className="px-6 py-4 text-right">Físico</th>
                  <th className="px-6 py-4 text-right">Consumo Mês</th>
                  <th className="px-6 py-4 text-right">Cobertura</th>
                  <th className="px-6 py-4 text-right">Projeção 30d</th>
                  <th className="px-6 py-4 text-right">Projeção 60d</th>
                  <th className="px-6 py-4 text-right">Projeção 90d</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-150 print:divide-zinc-200">
                {filteredItems.map(item => {
                  const dailyAvg = item.overallAvg / 30.0;
                  const hasUsage = item.overallAvg > 0;
                  const coverageDays = hasUsage ? Math.round(item.currentStock / dailyAvg) : 9999;
                  
                  let coverageLabel = '—';
                  let coverageClass = 'text-zinc-900';
                  
                  if (hasUsage) {
                    if (coverageDays < 30) {
                      coverageLabel = `${coverageDays} dias`;
                      coverageClass = 'text-rose-700 font-extrabold bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full';
                    } else if (coverageDays < 90) {
                      coverageLabel = `${Math.round(coverageDays / 30)} meses`;
                      coverageClass = 'text-amber-700 font-extrabold bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full';
                    } else {
                      const months = Math.round(coverageDays / 30);
                      coverageLabel = months > 12 ? '> 12 meses' : `${months} meses`;
                      coverageClass = 'text-emerald-700 font-extrabold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full';
                    }
                  } else if (item.currentStock > 0) {
                    coverageLabel = 'Sem Consumo';
                    coverageClass = 'text-zinc-400 italic';
                  }

                  const p30 = item.overallAvg;
                  const p60 = item.overallAvg * 2;
                  const p90 = item.overallAvg * 3;

                  return (
                    <tr key={item.itemCode} className="hover:bg-zinc-50/50 transition-colors print:hover:bg-transparent">
                      <td className="px-6 py-3.5 font-mono font-bold text-zinc-450">{item.itemCode}</td>
                      <td className="px-6 py-3.5 font-semibold text-zinc-900 max-w-xs truncate">{item.description}</td>
                      <td className="px-6 py-3.5 text-right font-bold text-zinc-900 tabular-nums">
                        {item.currentStock.toLocaleString('pt-BR')} {item.unit}
                      </td>
                      <td className="px-6 py-3.5 text-right font-medium text-zinc-650 tabular-nums">
                        {hasUsage ? `${item.overallAvg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${item.unit}` : '—'}
                      </td>
                      <td className="px-6 py-3.5 text-right text-[11px] tabular-nums">
                        <span className={coverageClass}>{coverageLabel}</span>
                      </td>
                      <td className="px-6 py-3.5 text-right text-zinc-500 font-medium tabular-nums">
                        {hasUsage ? `${Math.round(p30).toLocaleString('pt-BR')} ${item.unit}` : '—'}
                      </td>
                      <td className="px-6 py-3.5 text-right text-zinc-500 font-medium tabular-nums">
                        {hasUsage ? `${Math.round(p60).toLocaleString('pt-BR')} ${item.unit}` : '—'}
                      </td>
                      <td className="px-6 py-3.5 text-right text-zinc-500 font-medium tabular-nums">
                        {hasUsage ? `${Math.round(p90).toLocaleString('pt-BR')} ${item.unit}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Signature & Disclaimer (Somente Impressão) */}
      <div className="hidden print:block p-8 pt-12 text-center text-[10px] text-zinc-400 space-y-6">
        <p className="leading-relaxed">
          * A previsão de consumo futuro é uma simulação matemática estimada baseada no consumo médio dos últimos {period} meses, podendo variar dependendo da agenda de produção efetiva, saídas anômalas e cotações locais.
        </p>
        <div className="grid grid-cols-2 gap-12 pt-8">
          <div className="border-t border-zinc-300 pt-3">
            <div className="font-bold text-zinc-650">Responsável pelo Inventário</div>
            <div className="text-[9px] text-zinc-400 mt-0.5">Assinatura / Visto</div>
          </div>
          <div className="border-t border-zinc-300 pt-3">
            <div className="font-bold text-zinc-650">Diretoria / Operações</div>
            <div className="text-[9px] text-zinc-400 mt-0.5">Assinatura / Visto</div>
          </div>
        </div>
      </div>
    </div>
  );
}

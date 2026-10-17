import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../../geral/lib/api';
import { CorrectiveWeekSummary, FiscoQuimicaAgent } from '../../../geral/lib/types';
import {
  Sliders,
  CheckCircle2,
  Clock,
  Search,
  RefreshCw,
  Printer,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  FlaskConical,
  Scale
} from 'lucide-react';
import { cn } from '../../../geral/lib/utils';
import { localAuth } from '../../../geral/lib/api';

interface CorrectiveBatchesTabProps {
  agents: FiscoQuimicaAgent[];
  onRefreshHistory?: () => void;
}

export function CorrectiveBatchesTab({ agents, onRefreshHistory }: CorrectiveBatchesTabProps) {
  const [weeks, setWeeks] = useState<CorrectiveWeekSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDENTE' | 'BAIXADO'>('ALL');
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const currentUser = localAuth.getUser();

  const fetchWeeks = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getFiscoCorrectiveBatches();
      setWeeks(data || []);
      // Expandir a primeira semana por padrão se houver
      if (data && data.length > 0) {
        setExpandedWeeks(new Set([data[0].week_key]));
      }
    } catch (err: any) {
      console.error('Erro ao buscar baixas de corretivos:', err);
      setError(err.message || 'Erro ao carregar dados de corretivos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeeks();
  }, []);

  const toggleExpand = (weekKey: string) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekKey)) {
        next.delete(weekKey);
      } else {
        next.add(weekKey);
      }
      return next;
    });
  };

  const handleToggleBaixa = async (week: CorrectiveWeekSummary) => {
    const nextStatus = !week.is_baixa_realizada;
    const confirmMsg = nextStatus
      ? `Confirmar que as baixas manuais dos agentes corretivos da semana "${week.label}" foram realizadas no ERP?`
      : `Deseja desfazer e reabrir a baixa da semana "${week.label}"?`;

    if (!confirm(confirmMsg)) return;

    setActionLoading(week.week_key);
    try {
      await api.toggleFiscoCorrectiveBaixa({
        week_key: week.week_key,
        is_baixa: nextStatus,
        usuario: currentUser?.display_name || 'Operador CQ',
        observacoes: nextStatus ? 'Baixa manual consolidada no ERP' : undefined,
      });
      await fetchWeeks();
      if (onRefreshHistory) onRefreshHistory();
    } catch (err: any) {
      console.error('Erro ao alternar status de baixa:', err);
      alert(`Erro: ${err.message || err}`);
    } finally {
      setActionLoading(null);
    }
  };

  const printWeeklyReport = (week: CorrectiveWeekSummary) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Permita popups para imprimir o relatório de baixas.');
      return;
    }

    const rowsHtml = week.items
      .map(
        (it) => `
      <tr>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e4e4e7; font-family: monospace; font-weight: bold;">${it.batch}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e4e4e7;">${it.analysis_date}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e4e4e7;"><strong>${it.product_code}</strong> - ${it.product_name}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e4e4e7;">${it.agent_name}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e4e4e7; text-align: right;">${it.trial_qty_g_per_l ? `${it.trial_qty_g_per_l} g/L` : '—'}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e4e4e7; text-align: right;">${it.batch_size_kg ? `${it.batch_size_kg.toLocaleString('pt-BR')} kg` : '—'}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e4e4e7; text-align: right; font-weight: bold; font-family: monospace;">${it.total_agent_kg.toFixed(3)} kg</td>
      </tr>
    `
      )
      .join('');

    const totalsHtml = Object.entries(week.agent_totals)
      .map(
        ([name, kg]) => `
      <div style="display: flex; justify-content: space-between; padding: 6px 12px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; margin-bottom: 6px;">
        <span style="font-weight: 600; color: #0f172a;">${name}</span>
        <span style="font-weight: 700; font-family: monospace; color: #0284c7;">${kg.toFixed(3)} kg</span>
      </div>
    `
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Baixa Semanal de Corretivos - ${week.label}</title>
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; line-height: 1.4; margin: 0; padding: 20px; }
          h1 { font-size: 16px; margin: 0 0 4px 0; color: #0f172a; text-transform: uppercase; }
          .header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end; }
          .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 10px; text-transform: uppercase; }
          .badge-ok { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
          .badge-pending { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #f1f5f9; padding: 8px; text-align: left; font-size: 10px; text-transform: uppercase; border-bottom: 2px solid #cbd5e1; color: #475569; }
          .totals-box { margin-top: 20px; padding: 15px; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; }
          .signature-box { margin-top: 40px; display: flex; justify-content: space-between; gap: 30px; }
          .sign-line { flex: 1; border-top: 1px solid #475569; text-align: center; padding-top: 5px; font-size: 10px; color: #475569; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>Controle de Baixa Semanal de Insumos Corretivos</h1>
            <div style="font-size: 12px; color: #64748b; font-weight: bold; margin-top: 3px;">
              ${week.label} · NatumHub Físico-Químico
            </div>
          </div>
          <div>
            <span class="badge ${week.is_baixa_realizada ? 'badge-ok' : 'badge-pending'}">
              ${week.is_baixa_realizada ? 'Baixa Realizada no ERP' : 'Baixa Pendente no ERP'}
            </span>
          </div>
        </div>

        <div style="margin-bottom: 15px;">
          <h2 style="font-size: 12px; text-transform: uppercase; margin-bottom: 8px; color: #334155;">1. Resumo Total de Insumos para Baixa Manual no ERP</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px;">
            ${totalsHtml}
          </div>
        </div>

        <h2 style="font-size: 12px; text-transform: uppercase; margin-top: 20px; margin-bottom: 8px; color: #334155;">2. Relação de Lotes Corrigidos na Semana</h2>
        <table>
          <thead>
            <tr>
              <th>Lote</th>
              <th>Data</th>
              <th>Produto</th>
              <th>Agente Corretivo</th>
              <th style="text-align: right;">Dose (g/L)</th>
              <th style="text-align: right;">Tanque (kg)</th>
              <th style="text-align: right;">Consumo (kg)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="signature-box">
          <div class="sign-line">
            <strong>Responsável CQ / Laboratório</strong><br/>
            Data: ____/____/________
          </div>
          <div class="sign-line">
            <strong>Operador Almoxarifado / ERP</strong><br/>
            ${week.baixa_usuario ? `Baixado por: ${week.baixa_usuario}` : 'Data da Baixa: ____/____/________'}
          </div>
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Filtragem
  const filteredWeeks = useMemo(() => {
    return weeks.filter((w) => {
      if (filterStatus === 'PENDENTE' && w.is_baixa_realizada) return false;
      if (filterStatus === 'BAIXADO' && !w.is_baixa_realizada) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesWeek = w.label.toLowerCase().includes(q) || w.week_key.toLowerCase().includes(q);
        const matchesItems = w.items.some(
          (it) =>
            it.batch.toLowerCase().includes(q) ||
            it.product_code.toLowerCase().includes(q) ||
            it.product_name.toLowerCase().includes(q) ||
            it.agent_name.toLowerCase().includes(q)
        );
        return matchesWeek || matchesItems;
      }
      return true;
    });
  }, [weeks, filterStatus, search]);

  const totalKgGeral = useMemo(() => {
    return weeks.reduce((sum, w) => sum + w.total_agents_kg, 0);
  }, [weeks]);

  const totalSemanasPendentes = useMemo(() => {
    return weeks.filter((w) => !w.is_baixa_realizada).length;
  }, [weeks]);

  return (
    <div className="view-container animate-in fade-in duration-150 pb-12">
      {/* Banner Superior */}
      <div className="bg-gradient-to-r from-amber-900 via-amber-800 to-zinc-900 text-white rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-white/10 backdrop-blur-md">
              <Sliders size={22} className="text-amber-300" />
            </span>
            <h2 className="text-lg font-bold tracking-tight">
              Baixas Semanais de Agentes Corretivos
            </h2>
          </div>
          <p className="text-xs text-amber-150/90 max-w-2xl mt-1.5 text-zinc-300">
            Consolidação semanal dos insumos usados em ajustes de viscosidade e pH (cloreto de sódio, lauril, ácido cítrico, etc.) para realização de baixa manual única no ERP.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchWeeks}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-bold flex items-center gap-1.5 cursor-pointer backdrop-blur-sm transition-all"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-amber-50 text-amber-700">
            <Scale size={22} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Total Consumido</div>
            <div className="text-xl font-bold text-zinc-900 font-mono">
              {totalKgGeral.toFixed(2)} <span className="text-xs font-normal text-zinc-500">kg</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-rose-50 text-rose-700">
            <Clock size={22} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Semanas Pendentes</div>
            <div className="text-xl font-bold text-rose-600 font-mono">
              {totalSemanasPendentes} <span className="text-xs font-normal text-zinc-500">semanas</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Semanas Baixadas</div>
            <div className="text-xl font-bold text-emerald-600 font-mono">
              {weeks.length - totalSemanasPendentes} <span className="text-xs font-normal text-zinc-500">semanas</span>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por semana, lote, produto ou insumo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-zinc-300 rounded-xl text-xs bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterStatus('ALL')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
              filterStatus === 'ALL'
                ? "bg-zinc-950 text-white shadow-sm"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            )}
          >
            Todas ({weeks.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('PENDENTE')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
              filterStatus === 'PENDENTE'
                ? "bg-rose-700 text-white shadow-sm"
                : "bg-rose-50 text-rose-800 hover:bg-rose-100"
            )}
          >
            Pendentes ({totalSemanasPendentes})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('BAIXADO')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
              filterStatus === 'BAIXADO'
                ? "bg-emerald-700 text-white shadow-sm"
                : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            )}
          >
            Baixadas ({weeks.length - totalSemanasPendentes})
          </button>
        </div>
      </div>

      {/* Lista de Semanas */}
      {loading ? (
        <div className="py-20 text-center text-zinc-400 text-xs flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-zinc-400" />
          <span>Carregando dados de correções e consumos...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      ) : filteredWeeks.length === 0 ? (
        <div className="py-20 text-center text-zinc-400 text-xs bg-white rounded-2xl border border-zinc-200 flex flex-col items-center gap-2">
          <FlaskConical className="w-8 h-8 text-zinc-300" />
          <span>Nenhum ajuste de bancada registrado ou correspondente aos filtros.</span>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredWeeks.map((w) => {
            const isExpanded = expandedWeeks.has(w.week_key);
            const isBusy = actionLoading === w.week_key;

            return (
              <div
                key={w.week_key}
                className={cn(
                  "bg-white rounded-2xl border transition-all shadow-sm overflow-hidden",
                  w.is_baixa_realizada ? "border-zinc-200" : "border-amber-300 ring-1 ring-amber-200"
                )}
              >
                {/* Cabeçalho da Semana */}
                <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-zinc-50/50">
                  <div className="flex items-start sm:items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleExpand(w.week_key)}
                      className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/60 rounded-lg transition-colors cursor-pointer shrink-0 mt-0.5 sm:mt-0"
                    >
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-zinc-900">{w.label}</span>
                        <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-zinc-200/70 text-zinc-700 font-semibold">
                          {w.week_key}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border",
                            w.is_baixa_realizada
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : "bg-amber-50 text-amber-800 border-amber-200"
                          )}
                        >
                          {w.is_baixa_realizada ? (
                            <>
                              <CheckCircle2 size={12} className="text-emerald-600" />
                              Baixa Realizada no ERP
                            </>
                          ) : (
                            <>
                              <Clock size={12} className="text-amber-600" />
                              Pendente de Baixa Manual
                            </>
                          )}
                        </span>
                      </div>

                      <div className="text-[11px] text-zinc-500 mt-1 flex items-center gap-3 flex-wrap">
                        <span>
                          <strong>{w.items.length}</strong> lote(s) corrigido(s)
                        </span>
                        <span>•</span>
                        <span>
                          Consumo total:{' '}
                          <strong className="font-mono text-zinc-900 font-bold">{w.total_agents_kg.toFixed(3)} kg</strong>
                        </span>
                        {w.is_baixa_realizada && w.baixa_data && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-700">
                              Baixado por <strong>{w.baixa_usuario || 'Operador'}</strong> em{' '}
                              {new Date(w.baixa_data).toLocaleDateString('pt-BR')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ações da Semana */}
                  <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
                    <button
                      type="button"
                      onClick={() => printWeeklyReport(w)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-300 hover:border-zinc-400 bg-white hover:bg-zinc-50 text-zinc-800 text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                      title="Imprimir relatório para anexar ao controle de estoque"
                    >
                      <Printer size={13} className="text-zinc-600" />
                      <span>Imprimir</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleBaixa(w)}
                      disabled={isBusy}
                      className={cn(
                        "flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer",
                        w.is_baixa_realizada
                          ? "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200"
                          : "bg-amber-600 hover:bg-amber-700 text-white"
                      )}
                    >
                      {w.is_baixa_realizada ? (
                        <>
                          <Clock size={13} />
                          <span>Reabrir Baixa</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={13} />
                          <span>Marcar Baixa Realizada</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Bloco de Totais de Insumos da Semana */}
                <div className="px-5 py-3.5 bg-zinc-100/50 border-t border-b border-zinc-200/80">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                    Totais Consolidados para Baixa no Estoque (ERP)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {Object.entries(w.agent_totals).map(([agentName, totalKg]) => (
                      <div
                        key={agentName}
                        className="bg-white rounded-xl border border-zinc-200 p-2.5 flex items-center justify-between shadow-2xs"
                      >
                        <span className="text-xs font-semibold text-zinc-800 truncate" title={agentName}>
                          {agentName}
                        </span>
                        <span className="text-xs font-bold font-mono text-blue-700 shrink-0 ml-2">
                          {totalKg.toFixed(3)} kg
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Detalhes dos Lotes (Expansível) */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                          <th className="px-4 py-2.5">Lote / Data</th>
                          <th className="px-4 py-2.5">Produto Acabado</th>
                          <th className="px-4 py-2.5">Agente Corretivo</th>
                          <th className="px-4 py-2.5 text-right">Dose Bancada</th>
                          <th className="px-4 py-2.5 text-right">Volume Tanque</th>
                          <th className="px-4 py-2.5 text-right">Total Aplicado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 text-zinc-700">
                        {w.items.map((it) => (
                          <tr key={it.analysis_id} className="hover:bg-zinc-50/60 transition-colors">
                            <td className="px-4 py-2.5 font-mono">
                              <span className="font-bold text-zinc-900">{it.batch}</span>
                              <span className="text-[10px] text-zinc-400 ml-2">{it.analysis_date}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="max-w-[280px] truncate">
                                <span className="font-semibold text-zinc-900 block truncate">{it.product_name}</span>
                                <span className="text-[10px] font-mono text-zinc-400">{it.product_code}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 font-medium text-zinc-800">
                              {it.agent_name}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-zinc-600">
                              {it.trial_qty_g_per_l ? `${it.trial_qty_g_per_l} g/L` : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-zinc-600">
                              {it.batch_size_kg ? `${it.batch_size_kg.toLocaleString('pt-BR')} kg` : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-blue-700">
                              {it.total_agent_kg.toFixed(3)} kg
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

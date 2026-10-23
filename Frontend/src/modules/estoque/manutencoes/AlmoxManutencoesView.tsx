import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Cog,
  DollarSign,
  Factory,
  FlaskConical,
  Laptop,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Truck,
  Wrench,
  Zap,
} from 'lucide-react';
import { apiJson } from '../../geral/lib/http';
import AppLayout from '../../geral/components/layout/AppLayout';
import type { AlmoxOpsItem, Equipment, Maintenance } from '../ops/types';
import { detectEquipmentFamily, EQUIPMENT_FAMILIES } from '../equipamentos/EquipamentosView';

interface Props {
  onBackToHub: () => void;
  initialEquipmentId?: string | null;
  focusTicket?: number;
  onOpenEquipment?: (equipmentId: string) => void;
}

const KINDS = [
  { id: 'preventiva', label: 'Preventiva' },
  { id: 'corretiva', label: 'Corretiva' },
  { id: 'avulsa', label: 'Avulsa' },
  { id: 'calibracao', label: 'Calibração' },
  { id: 'inspecao', label: 'Inspeção' },
  { id: 'preditiva', label: 'Preditiva' },
];

const STATUS = [
  { id: 'pendente', label: 'Pendente' },
  { id: 'em_andamento', label: 'Em Andamento' },
  { id: 'concluida', label: 'Concluída' },
];

type AgendaFaixa = 'atrasada' | 'esta_semana' | 'programada';
type Aba = 'registro' | 'atrasadas' | 'esta_semana' | 'programadas' | 'concluidas';

function kindLabel(kind?: string) {
  const k = (kind || '').toLowerCase();
  if (k === 'avulsa') return 'Manutenção Avulsa';
  return KINDS.find((item) => item.id === k)?.label || 'Preventiva';
}

function kindClass(kind?: string) {
  const k = (kind || '').toLowerCase();
  if (k === 'corretiva') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (k === 'avulsa') return 'bg-amber-50 text-amber-800 border-amber-300 font-bold';
  if (k === 'calibracao' || k === 'calibração') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (k === 'inspecao' || k === 'inspeção') return 'bg-zinc-100 text-zinc-700 border-zinc-200';
  if (k === 'preditiva') return 'bg-purple-50 text-purple-700 border-purple-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

function statusLabel(status?: string) {
  const s = (status || '').toLowerCase();
  if (s === 'concluida') return 'Concluída';
  if (s === 'em_andamento') return 'Em Andamento';
  return 'Pendente';
}

function statusClass(status?: string) {
  const s = (status || '').toLowerCase();
  if (s === 'concluida') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'em_andamento') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-zinc-100 text-zinc-700 border-zinc-200';
}

function formatMoney(v?: number | null) {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataBr(iso?: string | null) {
  if (!iso) return '—';
  const clean = iso.slice(0, 10);
  const [y, m, d] = clean.split('-');
  if (!y || !m || !d) return clean;
  return `${d}/${m}/${y}`;
}

function faixaAgenda(m: Maintenance): AgendaFaixa {
  const raw = (m.scheduledAt || m.occurredAt || '').slice(0, 10);
  if (!raw) return 'programada';
  const dia = new Date(`${raw}T12:00:00`);
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);
  const semana = new Date(hoje);
  semana.setDate(semana.getDate() + 7);
  if (dia < hoje && m.status !== 'concluida') return 'atrasada';
  if (dia <= semana && m.status !== 'concluida') return 'esta_semana';
  return 'programada';
}

function faixaLabel(faixa: AgendaFaixa) {
  if (faixa === 'atrasada') return 'Atrasada';
  if (faixa === 'esta_semana') return 'Esta Semana';
  return 'Programada';
}

export default function AlmoxManutencoesView({ onBackToHub, initialEquipmentId, focusTicket = 0, onOpenEquipment }: Props) {
  const [aba, setAba] = useState<Aba>('registro');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [filtroFamilia, setFiltroFamilia] = useState<string>('todas');
  const [q, setQ] = useState('');
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [rows, setRows] = useState<Maintenance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [open, setOpen] = useState(Boolean(initialEquipmentId));
  const [presetEq, setPresetEq] = useState(initialEquipmentId || '');
  const [pecas, setPecas] = useState<AlmoxOpsItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eq, mt, parts] = await Promise.all([
        apiJson<{ equipments: Equipment[] }>('/almox/equipments'),
        apiJson<{ maintenances: Maintenance[] }>('/almox/maintenances'),
        apiJson<{ items: AlmoxOpsItem[] }>('/almox/items?section=pecas').catch(() => ({ items: [] as AlmoxOpsItem[] })),
      ]);
      setEquipments(eq.equipments ?? []);
      setRows(mt.maintenances ?? []);
      setPecas(parts.items ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as manutenções.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!initialEquipmentId) return;
    setPresetEq(initialEquipmentId);
    setOpen(true);
    setAba('registro');
  }, [initialEquipmentId, focusTicket]);

  const eqMap = useMemo(() => {
    const map = new Map<string, Equipment>();
    for (const eq of equipments) {
      map.set(eq.id, eq);
    }
    return map;
  }, [equipments]);

  const abertas = useMemo(
    () => rows.filter((m) => m.status !== 'concluida'),
    [rows],
  );

  const concluidas = useMemo(
    () => rows.filter((m) => m.status === 'concluida'),
    [rows],
  );

  const contagem = useMemo(() => {
    const base = { atrasada: 0, esta_semana: 0, programada: 0 };
    for (const m of abertas) {
      base[faixaAgenda(m)] += 1;
    }
    return base;
  }, [abertas]);

  const stats = useMemo(() => {
    const total = rows.length;
    const atrasadas = contagem.atrasada;
    const estaSemana = contagem.esta_semana;
    const concluidasQtd = concluidas.length;
    const custoTotal = rows.reduce((acc, m) => acc + (m.cost || 0), 0);
    return { total, atrasadas, estaSemana, concluidasQtd, custoTotal };
  }, [rows, contagem, concluidas]);

  const visiveis = useMemo(() => {
    const term = q.trim().toLowerCase();

    return rows.filter((m) => {
      // Filtro de aba
      if (aba === 'atrasadas' && (m.status === 'concluida' || faixaAgenda(m) !== 'atrasada')) return false;
      if (aba === 'esta_semana' && (m.status === 'concluida' || faixaAgenda(m) !== 'esta_semana')) return false;
      if (aba === 'programadas' && (m.status === 'concluida' || faixaAgenda(m) !== 'programada')) return false;
      if (aba === 'concluidas' && m.status !== 'concluida') return false;

      // Filtro de tipo
      if (filtroTipo !== 'todos' && (m.kind || '').toLowerCase() !== filtroTipo) return false;

      // Filtro de família
      if (filtroFamilia !== 'todas') {
        const eq = eqMap.get(m.equipmentId);
        if (eq) {
          const fam = detectEquipmentFamily(eq);
          if (fam !== filtroFamilia) return false;
        }
      }

      // Busca
      if (!term) return true;
      const eq = eqMap.get(m.equipmentId);
      return [
        m.equipmentName,
        m.equipmentCode,
        m.technician,
        m.notes,
        m.routine,
        eq?.name,
        eq?.code,
        eq?.sector,
      ]
        .map((v) => (v || '').toLowerCase())
        .some((v) => v.includes(term));
    });
  }, [rows, aba, filtroTipo, filtroFamilia, q, eqMap]);

  const concluir = async (m: Maintenance) => {
    setBusy(true);
    setError(null);
    setAviso(null);
    try {
      await apiJson(`/almox/maintenances/${encodeURIComponent(m.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'concluida' }),
      });
      if (m.recurrenceDays && m.recurrenceDays > 0) {
        setAviso('Ordem concluída com sucesso! Próxima data recorrente agendada automaticamente.');
      } else {
        setAviso('Ordem de manutenção marcada como concluída.');
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir a ordem de manutenção.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppLayout
      moduleTitle="Manutenções & O.S."
      onBackToHub={onBackToHub}
      sidebarItems={[
        { id: 'registro', label: 'Todas as O.S.', icon: ClipboardList, badge: rows.length || undefined },
        { id: 'atrasadas', label: 'Atrasadas', icon: AlertTriangle, badge: contagem.atrasada ? `${contagem.atrasada}` : undefined },
        { id: 'esta_semana', label: 'Esta Semana', icon: CalendarClock, badge: contagem.esta_semana || undefined },
        { id: 'programadas', label: 'Programadas', icon: Calendar, badge: contagem.programada || undefined },
        { id: 'concluidas', label: 'Concluídas', icon: CheckCircle2, badge: concluidas.length || undefined },
      ]}
      activeTab={aba}
      onTabChange={(id) => {
        setAba(id as Aba);
        setAviso(null);
      }}
      headerActions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setPresetEq('');
              setOpen(true);
            }}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white cursor-pointer shadow-xs"
          >
            <Plus className="h-4 w-4" />
            Nova Manutenção
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 cursor-pointer shadow-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold p-3.5 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {aviso && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold p-3.5 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{aviso}</span>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200 shadow-xs space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Total de O.S.</span>
            <span className="text-xl sm:text-2xl font-black text-zinc-900">{stats.total}</span>
          </div>
          <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200 shadow-xs space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">O.S. Atrasadas</span>
            <span className={`text-xl sm:text-2xl font-black ${stats.atrasadas > 0 ? 'text-rose-600' : 'text-zinc-900'}`}>
              {stats.atrasadas}
            </span>
          </div>
          <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200 shadow-xs space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Programadas p/ Semana</span>
            <span className="text-xl sm:text-2xl font-black text-blue-600">{stats.estaSemana}</span>
          </div>
          <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200 shadow-xs space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Investimento Total</span>
            <span className="text-xl sm:text-2xl font-black text-zinc-900">{formatMoney(stats.custoTotal)}</span>
          </div>
        </div>

        {/* Filtros e Busca */}
        <div className="bg-white rounded-2xl p-3 border border-zinc-200 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro por Tipo */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
              <button
                type="button"
                onClick={() => setFiltroTipo('todos')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shrink-0 ${
                  filtroTipo === 'todos' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                Todos os Tipos
              </button>
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setFiltroTipo(k.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shrink-0 ${
                    filtroTipo === k.id ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>

            {/* Filtro por Família do Equipamento */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
              <select
                value={filtroFamilia}
                onChange={(e) => setFiltroFamilia(e.target.value)}
                className="rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-700 bg-zinc-50/50 hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              >
                <option value="todas">Todas as Famílias de Máquinas</option>
                <option value="envase_producao">🏭 Máquinas e Envase</option>
                <option value="ti_computadores">💻 TI e Computadores</option>
                <option value="laboratorio">🧪 Laboratório e CQ</option>
                <option value="utilidades_infra">⚡ Utilidades e Infra</option>
                <option value="logistica">🚚 Logística</option>
                <option value="predial_geral">🔧 Predial e Geral</option>
              </select>
            </div>

            {/* Campo de Busca */}
            <div className="relative flex-1 min-w-[14rem]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por equipamento, código, técnico ou serviço..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-200 text-sm bg-zinc-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 bg-white border border-zinc-200 rounded-2xl">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-700" />
            <span className="text-xs font-semibold text-zinc-500">Carregando ordens de manutenção...</span>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Mobile View: High-ergonomics Cards */}
            <div className="block md:hidden space-y-3">
              {visiveis.map((m) => {
                const eq = eqMap.get(m.equipmentId);
                const fam = eq ? detectEquipmentFamily(eq) : 'envase_producao';
                const famObj = EQUIPMENT_FAMILIES.find((f) => f.id === fam);
                const FamIcon = famObj?.icon || Wrench;
                const faixa = m.status === 'concluida' ? null : faixaAgenda(m);
                const partsTxt = (m.parts || [])
                  .map((p) => `${p.description || p.itemCode} × ${p.quantity}`)
                  .join(', ');

                return (
                  <div
                    key={m.id}
                    className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs space-y-3 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusClass(m.status)}`}>
                          {statusLabel(m.status)}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${kindClass(m.kind)}`}>
                          {kindLabel(m.kind)}
                        </span>
                        {faixa && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                              faixa === 'atrasada'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            {faixaLabel(faixa)}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono font-bold text-zinc-500">
                        {dataBr(m.scheduledAt || m.occurredAt)}
                      </span>
                    </div>

                    <div>
                      {m.equipmentId ? (
                        <button
                          type="button"
                          onClick={() => onOpenEquipment?.(m.equipmentId!)}
                          className="font-bold text-base text-zinc-900 text-left hover:underline block leading-snug cursor-pointer"
                        >
                          {m.equipmentName || eq?.name || 'Equipamento'}
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 font-bold text-base text-zinc-900 leading-snug">
                          <span className="p-1 rounded-md bg-amber-100 text-amber-800">
                            <Zap className="h-4 w-4" />
                          </span>
                          <span>{m.equipmentName || m.avulsaTipo || 'Manutenção Avulsa'}</span>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-zinc-500">
                        <span className="font-mono text-zinc-400">
                          {m.equipmentCode || eq?.code || (m.storeName ? `Loja: ${m.storeName}` : 'Avulsa')}
                        </span>
                        {eq?.sector && <span>· Setor: {eq.sector}</span>}
                        {m.storeName && !eq && (
                          <span className="text-amber-800 font-semibold bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded text-[10px]">
                            Loja: {m.storeName}
                          </span>
                        )}
                        {m.equipmentId ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-zinc-100 px-2 py-0.2 rounded-md">
                            <FamIcon className="h-3 w-3" /> {famObj?.label}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-100 text-amber-800 px-2 py-0.2 rounded-md">
                            ⚡ {m.avulsaTipo || 'Avulsa'}
                          </span>
                        )}
                      </div>
                    </div>

                    {m.notes && (
                      <p className="text-xs text-zinc-700 leading-relaxed bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                        {m.notes}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-100 text-zinc-500">
                      <div>
                        {m.technician && <p>Técnico: <strong className="text-zinc-800">{m.technician}</strong></p>}
                        {m.cost != null && m.cost > 0 && <p>Custo: <strong className="text-zinc-900">{formatMoney(m.cost)}</strong></p>}
                      </div>

                      {m.status !== 'concluida' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void concluir(m)}
                          className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs cursor-pointer shadow-xs disabled:opacity-50"
                        >
                          Concluir O.S.
                        </button>
                      )}
                    </div>

                    {partsTxt && (
                      <div className="text-[11px] text-zinc-500 bg-zinc-50 px-2.5 py-1.5 rounded-xl border border-zinc-100">
                        <strong>Peças aplicadas:</strong> {partsTxt}
                      </div>
                    )}
                  </div>
                );
              })}

              {visiveis.length === 0 && (
                <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center text-zinc-400 text-sm">
                  Nenhuma ordem de manutenção encontrada para este filtro.
                </div>
              )}
            </div>

            {/* Desktop View: Clean Table */}
            <div className="hidden md:block bg-white border border-zinc-200 rounded-2xl shadow-xs overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 text-left border-b border-zinc-100 bg-zinc-50/50">
                    <th className="px-4 py-3">Data / Prazo</th>
                    <th className="px-4 py-3">Equipamento</th>
                    <th className="px-4 py-3">Tipo & Status</th>
                    <th className="px-4 py-3">Responsável</th>
                    <th className="px-4 py-3 text-right">Custo</th>
                    <th className="px-4 py-3">Descrição do Serviço</th>
                    <th className="px-4 py-3">Peças Trocadas</th>
                    <th className="px-4 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {visiveis.map((m) => {
                    const eq = eqMap.get(m.equipmentId);
                    const fam = eq ? detectEquipmentFamily(eq) : 'envase_producao';
                    const famObj = EQUIPMENT_FAMILIES.find((f) => f.id === fam);
                    const faixa = m.status === 'concluida' ? null : faixaAgenda(m);
                    const partsTxt = (m.parts || [])
                      .map((p) => `${p.description || p.itemCode} (${p.quantity})`)
                      .join(', ');

                    return (
                      <tr key={m.id} className="hover:bg-zinc-50/70 transition-colors align-top">
                        <td className="px-4 py-3 font-mono text-xs text-zinc-600 whitespace-nowrap">
                          <p className="font-bold text-zinc-900">{dataBr(m.scheduledAt || m.occurredAt)}</p>
                          {faixa && (
                            <span
                              className={`inline-block mt-1 px-2 py-0.2 rounded-full text-[10px] font-bold uppercase border ${
                                faixa === 'atrasada'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-blue-50 text-blue-700 border-blue-200'
                              }`}
                            >
                              {faixaLabel(faixa)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {m.equipmentId ? (
                            <button
                              type="button"
                              onClick={() => onOpenEquipment?.(m.equipmentId!)}
                              className="font-bold text-zinc-900 text-left hover:underline cursor-pointer block"
                            >
                              {m.equipmentName || eq?.name || 'Equipamento'}
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5 font-bold text-zinc-900">
                              <span className="p-1 rounded-md bg-amber-100 text-amber-800">
                                <Zap className="h-3.5 w-3.5" />
                              </span>
                              <span>{m.equipmentName || m.avulsaTipo || 'Manutenção Avulsa'}</span>
                            </div>
                          )}
                          <p className="font-mono text-[11px] text-zinc-400">
                            {m.equipmentCode || eq?.code || (m.storeName ? `Loja: ${m.storeName}` : 'Avulsa')}
                          </p>
                          <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-100 px-1.5 py-0.2 rounded mt-0.5 inline-block">
                            {m.equipmentId ? famObj?.label : (m.avulsaTipo || 'Avulsa')}
                          </span>
                        </td>
                        <td className="px-4 py-3 space-y-1">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${kindClass(m.kind)}`}>
                            {kindLabel(m.kind)}
                          </span>
                          <div>
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusClass(m.status)}`}>
                              {statusLabel(m.status)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-700 text-xs">{m.technician || '—'}</td>
                        <td className="px-4 py-3 text-right font-bold text-zinc-900 whitespace-nowrap">
                          {formatMoney(m.cost)}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 text-xs max-w-xs">{m.notes || '—'}</td>
                        <td className="px-4 py-3 text-zinc-500 text-xs max-w-[14rem]">{partsTxt || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          {m.status !== 'concluida' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void concluir(m)}
                              className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs cursor-pointer shadow-xs disabled:opacity-50"
                            >
                              Concluir
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {visiveis.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-zinc-400 text-sm">
                        Nenhuma ordem de manutenção encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {open && (
          <MaintForm
            equipments={equipments}
            pecas={pecas}
            presetId={presetEq}
            onClose={() => setOpen(false)}
            onSaved={(mensagem) => {
              setOpen(false);
              setAviso(mensagem);
              void load();
            }}
          />
        )}
      </div>
    </AppLayout>
  );
}

function MaintForm({
  equipments,
  pecas,
  presetId,
  onClose,
  onSaved,
}: {
  equipments: Equipment[];
  pecas: AlmoxOpsItem[];
  presetId: string;
  onClose: () => void;
  onSaved: (mensagem: string) => void;
}) {
  const [isAvulsa, setIsAvulsa] = useState(!presetId && equipments.length === 0);
  const [avulsaTipo, setAvulsaTipo] = useState('Manutenção Elétrica');
  const [storeName, setStoreName] = useState('');
  const [equipmentId, setEquipmentId] = useState(presetId || equipments[0]?.id || '');
  const [kind, setKind] = useState('preventiva');
  const [status, setStatus] = useState('pendente');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [scheduledAt, setScheduledAt] = useState('');
  const [recurrenceDays, setRecurrenceDays] = useState('');
  const [technician, setTechnician] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [partCode, setPartCode] = useState('');
  const [partQty, setPartQty] = useState('1');
  const [parts, setParts] = useState<{ itemCode: string; description: string; quantity: string }[]>([]);
  const [consume, setConsume] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const addPart = () => {
    const code = partCode.trim();
    if (!code) return;
    const hit = pecas.find((p) => p.code === code || p.description.toLowerCase() === code.toLowerCase());
    const itemCode = hit?.code || code;
    setParts((atual) => {
      const ja = atual.find((p) => p.itemCode === itemCode);
      if (ja) {
        return atual.map((p) => (p.itemCode === itemCode ? { ...p, quantity: partQty || '1' } : p));
      }
      return [...atual, { itemCode, description: hit?.description || itemCode, quantity: partQty || '1' }];
    });
    setPartCode('');
    setPartQty('1');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAvulsa && !equipmentId) {
      setError('Selecione um equipamento válido.');
      return;
    }
    if (isAvulsa && !avulsaTipo.trim()) {
      setError('Informe o tipo de manutenção avulsa.');
      return;
    }
    setBusy(true);
    setError(null);
    const dias = recurrenceDays ? Number(recurrenceDays) : null;
    try {
      await apiJson('/almox/maintenances', {
        method: 'POST',
        body: JSON.stringify({
          equipmentId: isAvulsa ? null : equipmentId,
          avulsaTipo: isAvulsa ? avulsaTipo.trim() : null,
          storeName: isAvulsa ? storeName.trim() || null : null,
          kind: isAvulsa ? 'avulsa' : kind,
          status,
          occurredAt: status === 'pendente' ? null : occurredAt,
          scheduledAt: scheduledAt || null,
          recurrenceDays: dias,
          technician: technician.trim() || null,
          cost: cost ? Number(cost) : null,
          notes: notes.trim() || null,
          consumeStock: consume && parts.length > 0,
          parts: parts.map((p) => ({
            itemCode: p.itemCode,
            quantity: Number(p.quantity) || 1,
            replaced: true,
          })),
        }),
      });
      const mensagem =
        status === 'concluida' && dias && dias > 0
          ? 'Ordem de manutenção concluída! O próximo ciclo foi agendado automaticamente.'
          : 'Ordem de manutenção registrada com sucesso.';
      onSaved(mensagem);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a ordem de manutenção.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <form
        onSubmit={(e) => void save(e)}
        className="bg-white border border-zinc-200 rounded-2xl shadow-xl w-full max-w-lg p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <h3 className="font-black text-base text-zinc-900 tracking-tight">
            Registrar Ordem de Manutenção
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700">
            ✕
          </button>
        </div>

        {/* Alternador Máquina vs Avulsa */}
        <div className="flex items-center gap-2 bg-zinc-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setIsAvulsa(false)}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              !isAvulsa ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            Máquina de Catálogo
          </button>
          <button
            type="button"
            onClick={() => setIsAvulsa(true)}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              isAvulsa ? 'bg-amber-500 text-white shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            ⚡ Manutenção Avulsa
          </button>
        </div>

        {!isAvulsa ? (
          <label className="block space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Equipamento / Máquina *
            </span>
            <select
              required
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white font-bold text-zinc-900 min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >
              <option value="">Selecione o equipamento...</option>
              {equipments.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.code} — {eq.name} {eq.sector ? `(${eq.sector})` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="space-y-3 p-3 bg-amber-50/60 rounded-xl border border-amber-200">
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
                Tipo da Manutenção Avulsa *
              </span>
              <select
                value={avulsaTipo}
                onChange={(e) => setAvulsaTipo(e.target.value)}
                className="w-full rounded-xl border border-amber-300 px-3 py-2 text-sm bg-white font-bold text-zinc-900 min-h-11 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="Manutenção Elétrica">⚡ Manutenção Elétrica</option>
                <option value="Manutenção Predial / Civil">🏢 Manutenção Predial / Civil</option>
                <option value="Manutenção Hidráulica">💧 Manutenção Hidráulica</option>
                <option value="Climatização / Ar-Condicionado">❄️ Climatização / Ar-Condicionado</option>
                <option value="TI, Redes & Automação">🌐 TI, Redes & Automação</option>
                <option value="Pintura & Estrutural">🎨 Pintura & Estrutural</option>
                <option value="Mecânica Geral">🔧 Mecânica Geral</option>
                <option value="Outra Manutenção Avulsa">Outra Manutenção Avulsa</option>
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
                Loja / Fornecedor dos Materiais (Opcional)
              </span>
              <input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Ex: Elétrica Rocha, Casa da Borracha, Leroy Merlin..."
                className="w-full rounded-xl border border-amber-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Tipo de Intervenção</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-semibold"
            >
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>{k.label}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Status Inicial</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-semibold"
            >
              {STATUS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Data de Execução</span>
            <input
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Custo Total (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Próxima Revisão Programada</span>
            <input
              type="date"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Repetir a cada (dias)</span>
            <input
              type="number"
              min="0"
              value={recurrenceDays}
              onChange={(e) => setRecurrenceDays(e.target.value)}
              placeholder="Ex: 30, 90, 180"
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </label>
        </div>

        <label className="space-y-1 block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Técnico / Responsável</span>
          <input
            value={technician}
            onChange={(e) => setTechnician(e.target.value)}
            placeholder="Nome do técnico ou empresa terceirizada"
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </label>

        <label className="space-y-1 block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Descrição do Serviço Realizado</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Detalhes da intervenção, causa-raiz, anomalias encontradas, ajustes efetuados..."
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </label>

        {/* Peças e Componentes Substituídos */}
        <div className="space-y-2 bg-zinc-50 p-3.5 rounded-xl border border-zinc-200">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
            Peças do Almoxarifado Utilizadas
          </span>
          <div className="grid grid-cols-[1fr_5rem_auto] gap-2 items-end">
            <div className="space-y-1">
              <input
                list="pecas-almox"
                value={partCode}
                onChange={(e) => setPartCode(e.target.value)}
                placeholder="Código ou nome da peça..."
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs bg-white min-h-10 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              <datalist id="pecas-almox">
                {pecas.map((p) => (
                  <option key={p.code} value={p.code}>{p.description} (Saldo: {p.qtyOnHand})</option>
                ))}
              </datalist>
            </div>
            <input
              type="number"
              min="0.01"
              step="any"
              value={partQty}
              onChange={(e) => setPartQty(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-2 py-2 text-xs text-center font-bold bg-white min-h-10"
            />
            <button
              type="button"
              onClick={addPart}
              className="px-3.5 py-2 text-xs font-bold rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white cursor-pointer min-h-10"
            >
              Adicionar
            </button>
          </div>

          {parts.length > 0 && (
            <ul className="space-y-1.5 pt-1">
              {parts.map((p) => (
                <li key={p.itemCode} className="flex items-center justify-between gap-2 text-xs bg-white border border-zinc-200 rounded-xl px-3 py-2">
                  <span className="font-semibold text-zinc-800">{p.description} · <span className="text-zinc-500 font-bold">{p.quantity} un</span></span>
                  <button
                    type="button"
                    onClick={() => setParts((atual) => atual.filter((item) => item.itemCode !== p.itemCode))}
                    className="font-bold text-rose-600 hover:text-rose-800 cursor-pointer text-xs"
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={consume}
              onChange={(e) => setConsume(e.target.checked)}
              className="rounded border-zinc-300"
            />
            <span>Dar baixa automática no saldo do estoque para as peças utilizadas</span>
          </label>
        </div>

        {error && <p className="text-xs font-bold text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200">{error}</p>}

        <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold rounded-xl border border-zinc-200 hover:bg-zinc-50 cursor-pointer min-h-11"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || !equipmentId}
            className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 min-h-11 shadow-xs"
          >
            Salvar Ordem
          </button>
        </div>
      </form>
    </div>
  );
}

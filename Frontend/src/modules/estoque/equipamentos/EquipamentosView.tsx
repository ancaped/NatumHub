import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Camera,
  ClipboardList,
  Cog,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wrench,
} from 'lucide-react';
import { apiJson } from '../../geral/lib/http';
import AppLayout from '../../geral/components/layout/AppLayout';
import Modal from '../../geral/components/ui/Modal';
import type { AlmoxOpsItem, Equipment, EquipmentPecaStat, Maintenance, MaintenancePart } from '../ops/types';

interface Props {
  onBackToHub: () => void;
  initialTab?: 'parque' | 'agenda';
}

type DetailTab = 'dados' | 'manutencoes' | 'pecas';

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR').format(new Date(iso));
  } catch {
    return '—';
  }
}

function formatMoney(v?: number | null) {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function statusMeta(status?: string) {
  const s = (status || '').toLowerCase();
  if (s === 'em_operacao' || s === 'ativo') {
    return { label: 'Em operação', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (s === 'em_manutencao' || s === 'manutencao') {
    return { label: 'Em manutenção', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  }
  return { label: 'Parado', cls: 'bg-red-50 text-red-600 border-red-200' };
}

function maintStatusMeta(status?: string, scheduledAt?: string | null) {
  const s = (status || '').toLowerCase();
  if (s === 'concluida') {
    return { label: 'Concluída', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (s === 'em_andamento') {
    return { label: 'Em andamento', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  }
  if (scheduledAt) {
    return { label: 'Programada', cls: 'bg-zinc-100 text-zinc-700 border-zinc-200' };
  }
  return { label: 'Pendente', cls: 'bg-zinc-100 text-zinc-700 border-zinc-200' };
}

function kindMeta(kind?: string) {
  const k = (kind || '').toLowerCase();
  if (k === 'corretiva') return { label: 'Corretiva', cls: 'bg-red-50 text-red-600 border-red-100' };
  if (k === 'preditiva') return { label: 'Preditiva', cls: 'bg-zinc-100 text-zinc-700 border-zinc-200' };
  return { label: 'Preventiva', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
}

function emptyEqForm() {
  return {
    code: '',
    name: '',
    brand: '',
    model: '',
    manufactureYear: '',
    serialNumber: '',
    sector: '',
    status: 'em_operacao',
    maintenanceIntervalDays: '',
    nextMaintenanceAt: '',
    notes: '',
    pecaCodes: [] as string[],
  };
}

export default function EquipamentosView({ onBackToHub, initialTab = 'parque' }: Props) {
  const [tab, setTab] = useState<'parque' | 'agenda'>(initialTab);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [pecasCatalog, setPecasCatalog] = useState<AlmoxOpsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Equipment | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('manutencoes');
  const [detailLoading, setDetailLoading] = useState(false);
  const [fotos, setFotos] = useState<{ id: string; photoData: string; notes?: string | null }[]>([]);

  const [eqModal, setEqModal] = useState(false);
  const [eqForm, setEqForm] = useState(emptyEqForm());
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);

  const [mtModal, setMtModal] = useState(false);
  const [mtForm, setMtForm] = useState({
    equipmentId: '',
    kind: 'preventiva',
    status: 'pendente',
    routine: '',
    technician: '',
    cost: '',
    notes: '',
    scheduledAt: '',
    consumeStock: false,
  });
  const [mtParts, setMtParts] = useState<{ itemCode: string; quantity: string; replaced: boolean }[]>([]);

  const loadPark = useCallback(async () => {
    const [eq, mt, pecas] = await Promise.all([
      apiJson<{ equipments: Equipment[] }>('/almox/equipments'),
      apiJson<{ maintenances: Maintenance[] }>('/almox/maintenances'),
      apiJson<{ items: AlmoxOpsItem[] }>('/almox/items?section=pecas&onlyActive=false').catch(() => ({ items: [] })),
    ]);
    setEquipments(eq.equipments ?? []);
    setMaintenances(mt.maintenances ?? []);
    setPecasCatalog(pecas.items ?? []);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadPark();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar o parque');
    } finally {
      setLoading(false);
    }
  }, [loadPark]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailTab('manutencoes');
    setDetailLoading(true);
    setError(null);
    try {
      const [eqRes, fotoRes] = await Promise.all([
        apiJson<{ equipment: Equipment }>(`/almox/equipments/${encodeURIComponent(id)}`),
        apiJson<{ fotos: { id: string; photoData: string; notes?: string | null }[] }>(
          `/almox/fotos/equipment/${encodeURIComponent(id)}`
        ).catch(() => ({ fotos: [] })),
      ]);
      setDetail(eqRes.equipment);
      setFotos(fotoRes.fotos ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao abrir equipamento');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = () => {
    setSelectedId(null);
    setDetail(null);
    setFotos([]);
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return equipments;
    return equipments.filter((e) =>
      [e.name, e.code, e.brand, e.model, e.sector, e.serialNumber]
        .map((v) => (v || '').toLowerCase())
        .some((v) => v.includes(term))
    );
  }, [equipments, q]);

  const stats = useMemo(() => {
    const total = equipments.length;
    const operating = equipments.filter((e) => e.status === 'em_operacao' || e.status === 'ativo').length;
    const inMaint = equipments.filter((e) => e.status === 'em_manutencao').length;
    const spent = equipments.reduce((acc, e) => acc + (e.totalSpent || 0), 0);
    const open = maintenances.filter((m) => m.status === 'pendente' || m.status === 'em_andamento').length;
    return { total, operating, inMaint, spent, open };
  }, [equipments, maintenances]);

  const agenda = useMemo(() => {
    const open = maintenances.filter((m) => m.status !== 'concluida');
    const done = maintenances.filter((m) => m.status === 'concluida').slice(0, 20);
    return { open, done };
  }, [maintenances]);

  const eqMaints = useMemo(
    () => maintenances.filter((m) => m.equipmentId === selectedId),
    [maintenances, selectedId]
  );

  const saveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      code: eqForm.code.trim(),
      name: eqForm.name.trim(),
      brand: eqForm.brand.trim() || null,
      model: eqForm.model.trim() || null,
      manufactureYear: eqForm.manufactureYear ? Number(eqForm.manufactureYear) : null,
      serialNumber: eqForm.serialNumber.trim() || null,
      sector: eqForm.sector.trim() || null,
      status: eqForm.status,
      maintenanceIntervalDays: eqForm.maintenanceIntervalDays
        ? Number(eqForm.maintenanceIntervalDays)
        : null,
      nextMaintenanceAt: eqForm.nextMaintenanceAt || null,
      notes: eqForm.notes.trim() || null,
      pecaCodes: eqForm.pecaCodes,
    };
    try {
      const res = await apiJson<{ equipment: Equipment }>('/almox/equipments', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const saved = res.equipment;
      if (pendingPhoto && saved?.id) {
        await apiJson(`/almox/fotos/equipment/${encodeURIComponent(saved.id)}`, {
          method: 'POST',
          body: JSON.stringify({ photoData: pendingPhoto, notes: 'Foto principal' }),
        });
      }
      setEqModal(false);
      setPendingPhoto(null);
      setEqForm(emptyEqForm());
      await loadPark();
      if (saved?.id) await openDetail(saved.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar equipamento');
    } finally {
      setBusy(false);
    }
  };

  const saveFromDetail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/almox/equipments/${encodeURIComponent(selectedId)}`, {
        method: 'PUT',
        body: JSON.stringify({
          code: eqForm.code.trim(),
          name: eqForm.name.trim(),
          brand: eqForm.brand.trim() || null,
          model: eqForm.model.trim() || null,
          manufactureYear: eqForm.manufactureYear ? Number(eqForm.manufactureYear) : null,
          serialNumber: eqForm.serialNumber.trim() || null,
          sector: eqForm.sector.trim() || null,
          status: eqForm.status,
          maintenanceIntervalDays: eqForm.maintenanceIntervalDays
            ? Number(eqForm.maintenanceIntervalDays)
            : null,
          nextMaintenanceAt: eqForm.nextMaintenanceAt || null,
          notes: eqForm.notes.trim() || null,
          pecaCodes: eqForm.pecaCodes,
        }),
      });
      await loadPark();
      await openDetail(selectedId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar ficha');
    } finally {
      setBusy(false);
    }
  };

  const openNewEq = () => {
    setEqForm(emptyEqForm());
    setPendingPhoto(null);
    setEqModal(true);
  };

  const fillFormFromDetail = (eq: Equipment) => {
    setEqForm({
      code: eq.code || '',
      name: eq.name || '',
      brand: eq.brand || '',
      model: eq.model || '',
      manufactureYear: eq.manufactureYear != null ? String(eq.manufactureYear) : '',
      serialNumber: eq.serialNumber || '',
      sector: eq.sector || '',
      status: eq.status === 'ativo' ? 'em_operacao' : eq.status || 'em_operacao',
      maintenanceIntervalDays:
        eq.maintenanceIntervalDays != null ? String(eq.maintenanceIntervalDays) : '',
      nextMaintenanceAt: eq.nextMaintenanceAt ? eq.nextMaintenanceAt.slice(0, 10) : '',
      notes: eq.notes || '',
      pecaCodes: eq.pecaCodes || [],
    });
  };

  useEffect(() => {
    if (detail) fillFormFromDetail(detail);
  }, [detail]);

  const openMt = (equipmentId?: string) => {
    setMtForm({
      equipmentId: equipmentId || selectedId || '',
      kind: 'preventiva',
      status: 'pendente',
      routine: '',
      technician: '',
      cost: '',
      notes: '',
      scheduledAt: '',
      consumeStock: false,
    });
    const associated = (detail?.pecaCodes || []).map((code) => ({
      itemCode: code,
      quantity: '1',
      replaced: false,
    }));
    setMtParts(associated.length ? associated : []);
    setMtModal(true);
  };

  const saveMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiJson('/almox/maintenances', {
        method: 'POST',
        body: JSON.stringify({
          equipmentId: mtForm.equipmentId,
          kind: mtForm.kind,
          status: mtForm.status,
          routine: mtForm.routine.trim() || null,
          technician: mtForm.technician.trim() || null,
          cost: mtForm.cost ? Number(mtForm.cost) : null,
          notes: mtForm.notes.trim() || null,
          scheduledAt: mtForm.scheduledAt || null,
          consumeStock: mtForm.consumeStock,
          parts: mtParts
            .filter((p) => p.itemCode)
            .map((p) => ({
              itemCode: p.itemCode,
              quantity: Number(p.quantity) || 1,
              replaced: p.replaced,
            })),
        }),
      });
      setMtModal(false);
      await loadPark();
      if (selectedId) await openDetail(selectedId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar manutenção');
    } finally {
      setBusy(false);
    }
  };

  const updateMaintStatus = async (id: string, status: string) => {
    setBusy(true);
    try {
      await apiJson(`/almox/maintenances/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          status,
          completedAt: status === 'concluida' ? new Date().toISOString() : null,
        }),
      });
      await loadPark();
      if (selectedId) await openDetail(selectedId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar manutenção');
    } finally {
      setBusy(false);
    }
  };

  const handlePhotoFile = (file: File, afterCreate = false) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      if (!base64) return;
      if (afterCreate && selectedId) {
        try {
          await apiJson(`/almox/fotos/equipment/${encodeURIComponent(selectedId)}`, {
            method: 'POST',
            body: JSON.stringify({ photoData: base64 }),
          });
          await openDetail(selectedId);
          await loadPark();
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'Erro ao enviar foto');
        }
      } else {
        setPendingPhoto(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const deleteFoto = async (id: string) => {
    try {
      await apiJson(`/almox/fotos/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setFotos((prev) => prev.filter((f) => f.id !== id));
      if (selectedId) {
        await loadPark();
        await openDetail(selectedId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir foto');
    }
  };

  const togglePecaAssoc = (code: string) => {
    setEqForm((f) => ({
      ...f,
      pecaCodes: f.pecaCodes.includes(code)
        ? f.pecaCodes.filter((c) => c !== code)
        : [...f.pecaCodes, code],
    }));
  };

  const sidebarItems = [
    { id: 'parque', label: 'Parque', icon: Wrench, badge: stats.total || undefined },
    { id: 'agenda', label: 'Agenda', icon: ClipboardList, badge: stats.open || undefined },
  ];

  return (
    <AppLayout
      moduleTitle="Equipamentos"
      moduleSubtitle={selectedId ? detail?.name || 'Ficha da máquina' : tab === 'agenda' ? 'Manutenções' : 'Parque de máquinas'}
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={tab}
      onTabChange={(id) => {
        closeDetail();
        setTab(id as 'parque' | 'agenda');
      }}
      headerActions={
        <div className="flex gap-2">
          {selectedId && (
            <button
              type="button"
              onClick={() => openMt(selectedId)}
              className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova OS
            </button>
          )}
          <button
            type="button"
            onClick={openNewEq}
            className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-zinc-900 text-white cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo equipamento
          </button>
          <button
            type="button"
            onClick={() => refresh()}
            className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      }
    >
      <div className="w-full max-w-none space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm px-4 py-3">
            {error}
          </div>
        )}

        {selectedId ? (
          <EquipmentDetail
            detail={detail}
            loading={detailLoading}
            busy={busy}
            fotos={fotos}
            eqForm={eqForm}
            setEqForm={setEqForm}
            pecasCatalog={pecasCatalog}
            maintenances={eqMaints}
            detailTab={detailTab}
            setDetailTab={setDetailTab}
            onBack={closeDetail}
            onSaveFicha={saveFromDetail}
            onPhoto={(file) => handlePhotoFile(file, true)}
            onDeleteFoto={deleteFoto}
            onTogglePeca={togglePecaAssoc}
            onNewOs={() => openMt(selectedId)}
            onUpdateMaint={updateMaintStatus}
          />
        ) : tab === 'parque' ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Máquinas" value={String(stats.total)} />
              <StatCard label="Em operação" value={String(stats.operating)} tone="ok" />
              <StatCard label="OS em aberto" value={String(stats.open)} tone={stats.open > 0 ? 'warn' : undefined} />
              <StatCard label="Gastos registrados" value={formatMoney(stats.spent)} />
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nome, código, marca, modelo ou setor…"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white"
              />
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-zinc-400 text-sm bg-white border border-zinc-200 rounded-2xl">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando parque…
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white border border-zinc-200 rounded-2xl py-12 text-center">
                <Wrench className="h-8 w-8 text-zinc-300 mx-auto mb-3" />
                <p className="text-sm text-zinc-400">Nenhum equipamento cadastrado.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((eq) => {
                  const st = statusMeta(eq.status);
                  return (
                    <button
                      key={eq.id}
                      type="button"
                      onClick={() => openDetail(eq.id)}
                      className="text-left bg-white border border-zinc-200 hover:border-zinc-400 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer"
                    >
                      <div className="aspect-[16/10] bg-zinc-100 relative">
                        {eq.coverPhoto ? (
                          <img src={eq.coverPhoto} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Wrench className="h-8 w-8 text-zinc-300" />
                          </div>
                        )}
                        <span className={`absolute top-3 left-3 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${st.cls}`}>
                          {st.label}
                        </span>
                      </div>
                      <div className="p-4 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-sm text-zinc-900 leading-snug">{eq.name}</h3>
                          <span className="text-[10px] font-mono font-bold text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded border border-zinc-200 shrink-0">
                            {eq.code}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 font-semibold">
                          {[eq.brand, eq.model, eq.manufactureYear].filter(Boolean).join(' · ') || 'Sem marca/modelo'}
                        </p>
                        {eq.sector && <p className="text-[11px] text-zinc-400">Setor: {eq.sector}</p>}
                        <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-[11px] font-semibold text-zinc-500">
                          <span>
                            {eq.nextMaintenanceAt
                              ? `Próx. ${formatDate(eq.nextMaintenanceAt)}`
                              : 'Sem preventiva'}
                          </span>
                          <span>{formatMoney(eq.totalSpent || 0)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <AgendaList
            loading={loading}
            open={agenda.open}
            done={agenda.done}
            busy={busy}
            onOpenEq={(id) => {
              setTab('parque');
              void openDetail(id);
            }}
            onComplete={(id) => updateMaintStatus(id, 'concluida')}
            onNew={() => openMt()}
          />
        )}
      </div>

      {eqModal && (
        <Modal
          onClose={() => setEqModal(false)}
          title="Novo equipamento"
          subtitle="Ficha do parque"
          size="lg"
        >
          <form onSubmit={saveEquipment} className="space-y-4">
            <PhotoPicker preview={pendingPhoto} onFile={(f) => handlePhotoFile(f)} />
            <EqFields form={eqForm} setForm={setEqForm} pecasCatalog={pecasCatalog} onTogglePeca={togglePecaAssoc} />
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'Salvando…' : 'Cadastrar'}
            </button>
          </form>
        </Modal>
      )}

      {mtModal && (
        <Modal
          onClose={() => setMtModal(false)}
          title="Nova manutenção"
          subtitle="OS preventiva, corretiva ou programada"
          size="lg"
        >
          <form onSubmit={saveMaintenance} className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase text-zinc-400">Equipamento</span>
              <select
                required
                value={mtForm.equipmentId}
                onChange={(e) => setMtForm((f) => ({ ...f, equipmentId: e.target.value }))}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              >
                <option value="">Selecione…</option>
                {equipments.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.code} — {eq.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">Tipo</span>
                <select
                  value={mtForm.kind}
                  onChange={(e) => setMtForm((f) => ({ ...f, kind: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                >
                  <option value="preventiva">Preventiva</option>
                  <option value="corretiva">Corretiva</option>
                  <option value="preditiva">Preditiva</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">Status</span>
                <select
                  value={mtForm.status}
                  onChange={(e) => setMtForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                >
                  <option value="pendente">Pendente / programada</option>
                  <option value="em_andamento">Em andamento</option>
                  <option value="concluida">Concluída</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">Data programada</span>
                <input
                  type="date"
                  value={mtForm.scheduledAt}
                  onChange={(e) => setMtForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">Rotina</span>
                <select
                  value={mtForm.routine}
                  onChange={(e) => setMtForm((f) => ({ ...f, routine: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                >
                  <option value="">Nenhuma / outra</option>
                  <option value="calibragem">Calibração</option>
                  <option value="limpeza">Limpeza</option>
                  <option value="lubrificacao">Lubrificação</option>
                  <option value="inspecao">Inspeção</option>
                </select>
              </label>
            </div>
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase text-zinc-400">Peças nesta OS</span>
              <p className="text-[11px] text-zinc-500">Marque as que foram trocadas. As demais ficam só como inspeção.</p>
              <div className="border border-zinc-200 rounded-xl max-h-40 overflow-y-auto bg-zinc-50/50 divide-y divide-zinc-100">
                {pecasCatalog.length === 0 ? (
                  <p className="text-xs text-zinc-400 p-3 italic">Cadastre peças no catálogo de reposição.</p>
                ) : (
                  pecasCatalog.map((p) => {
                    const row = mtParts.find((x) => x.itemCode === p.code);
                    return (
                      <div key={p.code} className="flex items-center gap-2 px-3 py-2 text-xs">
                        <input
                          type="checkbox"
                          checked={!!row}
                          onChange={() => {
                            setMtParts((prev) =>
                              row
                                ? prev.filter((x) => x.itemCode !== p.code)
                                : [...prev, { itemCode: p.code, quantity: '1', replaced: true }]
                            );
                          }}
                          className="rounded border-zinc-300"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-zinc-900 truncate">{p.description}</p>
                          <p className="font-mono text-[10px] text-zinc-400">{p.code}</p>
                        </div>
                        {row && (
                          <>
                            <label className="flex items-center gap-1 text-[10px] font-bold text-zinc-600 shrink-0">
                              <input
                                type="checkbox"
                                checked={row.replaced}
                                onChange={() =>
                                  setMtParts((prev) =>
                                    prev.map((x) =>
                                      x.itemCode === p.code ? { ...x, replaced: !x.replaced } : x
                                    )
                                  )
                                }
                              />
                              Trocada
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.quantity}
                              onChange={(e) =>
                                setMtParts((prev) =>
                                  prev.map((x) =>
                                    x.itemCode === p.code ? { ...x, quantity: e.target.value } : x
                                  )
                                )
                              }
                              className="w-16 rounded-lg border border-zinc-200 px-1.5 py-1 text-xs"
                            />
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                <input
                  type="checkbox"
                  checked={mtForm.consumeStock}
                  onChange={(e) => setMtForm((f) => ({ ...f, consumeStock: e.target.checked }))}
                  className="rounded border-zinc-300"
                />
                Baixar estoque das peças trocadas
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">Técnico</span>
                <input
                  value={mtForm.technician}
                  onChange={(e) => setMtForm((f) => ({ ...f, technician: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">Custo total</span>
                <input
                  type="number"
                  step="0.01"
                  value={mtForm.cost}
                  onChange={(e) => setMtForm((f) => ({ ...f, cost: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase text-zinc-400">Notas</span>
              <textarea
                value={mtForm.notes}
                onChange={(e) => setMtForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              Registrar manutenção
            </button>
          </form>
        </Modal>
      )}
    </AppLayout>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs">
      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</p>
      <p
        className={`text-xl font-extrabold mt-1 ${
          tone === 'ok' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-700' : 'text-zinc-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function PhotoPicker({
  preview,
  onFile,
}: {
  preview?: string | null;
  onFile: (file: File) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-3 cursor-pointer hover:bg-zinc-100">
      {preview ? (
        <img src={preview} alt="" className="h-14 w-20 rounded-lg object-cover border border-zinc-200" />
      ) : (
        <div className="h-14 w-20 rounded-lg bg-zinc-200/70 flex items-center justify-center">
          <Camera className="h-5 w-5 text-zinc-400" />
        </div>
      )}
      <div>
        <p className="text-xs font-bold text-zinc-800">Foto do equipamento</p>
        <p className="text-[11px] text-zinc-400">JPG ou PNG — vira a capa no parque</p>
      </div>
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </label>
  );
}

function EqFields({
  form,
  setForm,
  pecasCatalog,
  onTogglePeca,
}: {
  form: ReturnType<typeof emptyEqForm>;
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof emptyEqForm>>>;
  pecasCatalog: AlmoxOpsItem[];
  onTogglePeca: (code: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-zinc-400">Código</span>
          <input
            required
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-zinc-400">Status</span>
          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          >
            <option value="em_operacao">Em operação</option>
            <option value="em_manutencao">Em manutenção</option>
            <option value="parado">Parado</option>
          </select>
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-[10px] font-bold uppercase text-zinc-400">Nome</span>
        <input
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
        />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-zinc-400">Marca</span>
          <input
            value={form.brand}
            onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-zinc-400">Modelo</span>
          <input
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-zinc-400">Ano</span>
          <input
            type="number"
            value={form.manufactureYear}
            onChange={(e) => setForm((f) => ({ ...f, manufactureYear: e.target.value }))}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-zinc-400">Nº de série</span>
          <input
            value={form.serialNumber}
            onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-zinc-400">Setor</span>
          <input
            value={form.sector}
            onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-zinc-400">Intervalo preventiva (dias)</span>
          <input
            type="number"
            value={form.maintenanceIntervalDays}
            onChange={(e) => setForm((f) => ({ ...f, maintenanceIntervalDays: e.target.value }))}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-zinc-400">Próx. preventiva</span>
          <input
            type="date"
            value={form.nextMaintenanceAt}
            onChange={(e) => setForm((f) => ({ ...f, nextMaintenanceAt: e.target.value }))}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="space-y-1">
        <span className="text-[10px] font-bold uppercase text-zinc-400">Peças associadas à máquina</span>
        {pecasCatalog.length === 0 ? (
          <p className="text-xs text-zinc-400 italic">Nenhuma peça no catálogo de reposição.</p>
        ) : (
          <div className="border border-zinc-200 rounded-xl p-3 max-h-36 overflow-y-auto space-y-1.5 bg-zinc-50/50">
            {pecasCatalog.map((p) => (
              <label key={p.code} className="flex items-start gap-2 text-xs font-semibold text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.pecaCodes.includes(p.code)}
                  onChange={() => onTogglePeca(p.code)}
                  className="rounded border-zinc-300 mt-0.5"
                />
                <span>
                  <span className="font-bold text-zinc-900">{p.description}</span>
                  <span className="text-[10px] text-zinc-400 font-mono ml-1.5">({p.code})</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
      <label className="block space-y-1">
        <span className="text-[10px] font-bold uppercase text-zinc-400">Notas</span>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={2}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
        />
      </label>
    </>
  );
}

function EquipmentDetail({
  detail,
  loading,
  busy,
  fotos,
  eqForm,
  setEqForm,
  pecasCatalog,
  maintenances,
  detailTab,
  setDetailTab,
  onBack,
  onSaveFicha,
  onPhoto,
  onDeleteFoto,
  onTogglePeca,
  onNewOs,
  onUpdateMaint,
}: {
  detail: Equipment | null;
  loading: boolean;
  busy: boolean;
  fotos: { id: string; photoData: string; notes?: string | null }[];
  eqForm: ReturnType<typeof emptyEqForm>;
  setEqForm: React.Dispatch<React.SetStateAction<ReturnType<typeof emptyEqForm>>>;
  pecasCatalog: AlmoxOpsItem[];
  maintenances: Maintenance[];
  detailTab: DetailTab;
  setDetailTab: (t: DetailTab) => void;
  onBack: () => void;
  onSaveFicha: (e: React.FormEvent) => void;
  onPhoto: (file: File) => void;
  onDeleteFoto: (id: string) => void;
  onTogglePeca: (code: string) => void;
  onNewOs: () => void;
  onUpdateMaint: (id: string, status: string) => void;
}) {
  const st = statusMeta(detail?.status);
  const spent = maintenances.reduce((acc, m) => acc + (m.cost || 0), 0);
  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'manutencoes', label: 'Manutenções' },
    { id: 'pecas', label: 'Peças' },
    { id: 'dados', label: 'Ficha' },
  ];

  if (loading && !detail) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-zinc-400 text-sm bg-white border border-zinc-200 rounded-2xl">
        <Loader2 className="h-4 w-4 animate-spin" />
        Abrindo ficha…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-900 cursor-pointer"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar ao parque
      </button>

      <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="grid md:grid-cols-[280px_1fr]">
          <div className="bg-zinc-100 min-h-[180px] relative">
            {fotos[0]?.photoData || detail?.coverPhoto ? (
              <img
                src={fotos[0]?.photoData || detail?.coverPhoto || ''}
                alt=""
                className="w-full h-full object-cover min-h-[180px] max-h-64 md:max-h-none md:absolute inset-0"
              />
            ) : (
              <div className="h-full min-h-[180px] flex items-center justify-center">
                <Wrench className="h-10 w-10 text-zinc-300" />
              </div>
            )}
          </div>
          <div className="p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${st.cls}`}>
                {st.label}
              </span>
              <span className="text-[10px] font-mono font-bold text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded border border-zinc-200">
                {detail?.code}
              </span>
            </div>
            <h2 className="text-xl font-extrabold text-zinc-900 tracking-tight">{detail?.name}</h2>
            <p className="text-sm text-zinc-500 font-semibold">
              {[detail?.brand, detail?.model, detail?.manufactureYear].filter(Boolean).join(' · ') ||
                'Marca, modelo e ano ainda não informados'}
            </p>
            <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
              {detail?.serialNumber && <span>Série {detail.serialNumber}</span>}
              {detail?.sector && <span>Setor {detail.sector}</span>}
              <span>Gastos {formatMoney(spent || detail?.totalSpent || 0)}</span>
              {detail?.nextMaintenanceAt && (
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Próx. {formatDate(detail.nextMaintenanceAt)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="px-5 border-t border-zinc-100 flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setDetailTab(t.id)}
              className={`px-3 py-3 text-xs font-bold border-b-2 cursor-pointer ${
                detailTab === t.id
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-transparent text-zinc-400 hover:text-zinc-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {detailTab === 'manutencoes' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onNewOs}
              className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-zinc-900 text-white cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova OS
            </button>
          </div>
          {maintenances.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-2xl py-10 text-center text-sm text-zinc-400">
              Nenhuma manutenção nesta máquina.
            </div>
          ) : (
            <div className="space-y-3">
              {maintenances.map((m) => {
                const ms = maintStatusMeta(m.status, m.scheduledAt);
                const km = kindMeta(m.kind);
                const parts = m.parts?.length
                  ? m.parts
                  : m.itemCode
                    ? [{ itemCode: m.itemCode, description: m.itemDescription, quantity: m.quantity, replaced: true } as MaintenancePart]
                    : [];
                return (
                  <div key={m.id} className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${ms.cls}`}>
                          {ms.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${km.cls}`}>
                          {km.label}
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-400 font-semibold">
                        {formatDate(m.scheduledAt || m.occurredAt)}
                      </span>
                    </div>
                    {m.routine && (
                      <p className="text-xs font-bold text-zinc-700 uppercase tracking-wide mb-1">{m.routine}</p>
                    )}
                    {m.technician && <p className="text-xs text-zinc-500">Técnico: {m.technician}</p>}
                    {m.cost != null && m.cost > 0 && (
                      <p className="text-sm font-extrabold text-zinc-900 mt-1">{formatMoney(m.cost)}</p>
                    )}
                    {parts.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {parts.map((p) => (
                          <li key={p.itemCode} className="text-xs text-zinc-600 flex items-center gap-2">
                            <Cog className="h-3 w-3 text-zinc-400" />
                            <span className="font-semibold">{p.description || p.itemCode}</span>
                            <span className="text-zinc-400">× {p.quantity}</span>
                            <span
                              className={`text-[10px] font-bold uppercase ${
                                p.replaced ? 'text-amber-700' : 'text-zinc-400'
                              }`}
                            >
                              {p.replaced ? 'Trocada' : 'Não trocada'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {m.notes && <p className="text-xs text-zinc-400 mt-2 italic">{m.notes}</p>}
                    {m.status !== 'concluida' && (
                      <div className="mt-3 pt-3 border-t border-zinc-100 flex justify-end">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onUpdateMaint(m.id, 'concluida')}
                          className="text-xs font-bold px-3 py-1.5 rounded-xl bg-zinc-900 text-white cursor-pointer disabled:opacity-50"
                        >
                          Concluir
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {detailTab === 'pecas' && (
        <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
          {(detail?.pecas || []).length === 0 ? (
            <p className="text-sm text-zinc-400 px-4 py-10 text-center">
              Nenhuma peça associada. Vincule no cadastro da ficha.
            </p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {(detail?.pecas || []).map((p: EquipmentPecaStat) => (
                <div key={p.itemCode} className="px-4 py-3.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-zinc-900">{p.description || p.itemCode}</p>
                    <p className="text-[11px] font-mono text-zinc-400">{p.itemCode}</p>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      {p.timesReplaced} troca(s)
                      {p.avgUsageDays != null ? ` · uso médio ${Math.round(p.avgUsageDays)} dias` : ''}
                      {p.lastReplacedAt ? ` · última ${formatDate(p.lastReplacedAt)}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-extrabold text-zinc-900">
                      {p.qtyOnHand.toLocaleString('pt-BR')}
                    </p>
                    <p className="text-[10px] text-zinc-400">em estoque</p>
                    {p.exchangeStatus === 'overdue' && (
                      <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-red-50 text-red-600 border-red-200">
                        <AlertTriangle className="h-3 w-3" /> Vencida
                      </span>
                    )}
                    {p.exchangeStatus === 'due_soon' && (
                      <span className="inline-flex mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-amber-50 text-amber-700 border-amber-200">
                        Troca próxima
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {detailTab === 'dados' && (
        <form onSubmit={onSaveFicha} className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {fotos.map((f) => (
              <div key={f.id} className="relative w-24 h-16 rounded-xl overflow-hidden border border-zinc-200 group">
                <img src={f.photoData} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => onDeleteFoto(f.id)}
                  className="absolute top-1 right-1 p-1 rounded-md bg-white/90 text-red-500 opacity-0 group-hover:opacity-100 cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            <label className="w-24 h-16 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 flex items-center justify-center cursor-pointer hover:bg-zinc-100">
              <Camera className="h-4 w-4 text-zinc-400" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPhoto(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <EqFields form={eqForm} setForm={setEqForm} pecasCatalog={pecasCatalog} onTogglePeca={onTogglePeca} />
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
          >
            Salvar ficha
          </button>
        </form>
      )}
    </div>
  );
}

function AgendaList({
  loading,
  open,
  done,
  busy,
  onOpenEq,
  onComplete,
  onNew,
}: {
  loading: boolean;
  open: Maintenance[];
  done: Maintenance[];
  busy: boolean;
  onOpenEq: (id: string) => void;
  onComplete: (id: string) => void;
  onNew: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-zinc-400 text-sm bg-white border border-zinc-200 rounded-2xl">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando agenda…
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNew}
          className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-zinc-900 text-white cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova OS
        </button>
      </div>
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Abertas e programadas</h3>
      {open.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-2xl py-8 text-center text-sm text-zinc-400">
          Nenhuma OS em aberto.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {open.map((m) => {
            const ms = maintStatusMeta(m.status, m.scheduledAt);
            return (
              <div key={m.id} className="bg-white border border-zinc-200 rounded-2xl p-4">
                <div className="flex justify-between gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${ms.cls}`}>
                    {ms.label}
                  </span>
                  <span className="text-[11px] text-zinc-400">{formatDate(m.scheduledAt || m.occurredAt)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenEq(m.equipmentId)}
                  className="font-bold text-sm text-zinc-900 hover:underline cursor-pointer text-left"
                >
                  {m.equipmentName || m.equipmentCode}
                </button>
                <p className="text-xs text-zinc-500 mt-0.5 capitalize">{m.kind}{m.routine ? ` · ${m.routine}` : ''}</p>
                {m.cost != null && m.cost > 0 && (
                  <p className="text-xs font-extrabold mt-1">{formatMoney(m.cost)}</p>
                )}
                {m.status !== 'concluida' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onComplete(m.id)}
                    className="mt-3 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-zinc-900 text-white cursor-pointer disabled:opacity-50"
                  >
                    Concluir
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 pt-2">Histórico recente</h3>
      <div className="bg-white border border-zinc-200 rounded-2xl divide-y divide-zinc-100">
        {done.length === 0 ? (
          <p className="text-sm text-zinc-400 px-4 py-8 text-center">Sem OS concluídas ainda.</p>
        ) : (
          done.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onOpenEq(m.equipmentId)}
              className="w-full text-left px-4 py-3 hover:bg-zinc-50 cursor-pointer flex justify-between gap-3"
            >
              <div>
                <p className="text-sm font-bold text-zinc-900">{m.equipmentName || m.equipmentCode}</p>
                <p className="text-[11px] text-zinc-500 capitalize">
                  {m.kind}
                  {m.technician ? ` · ${m.technician}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-extrabold">{formatMoney(m.cost)}</p>
                <p className="text-[11px] text-zinc-400">{formatDate(m.completedAt || m.occurredAt)}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

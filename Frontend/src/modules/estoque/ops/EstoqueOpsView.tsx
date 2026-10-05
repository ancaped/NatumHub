import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  Cog,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Store,
  Warehouse,
  Wrench,
  X,
  Camera,
  Trash2,
} from 'lucide-react';
import { apiJson } from '../../geral/lib/http';
import AppLayout from '../../geral/components/layout/AppLayout';
import ItemDrawer, {
  type ItemConfigPayload,
  type MovementPayload,
} from './components/ItemDrawer';
import {
  MODE_TO_VIEW,
  SECTION_LABELS,
  sectionForMode,
  type AlmoxMovement,
  type AlmoxOpsItem,
  type CatalogHit,
  type Equipment,
  type EstoqueOpsMode,
  type Maintenance,
} from './types';

interface Props {
  onBackToHub: () => void;
  mode: EstoqueOpsMode;
  setView: (v: string) => void;
}

function exchangeBadge(status?: string | null) {
  if (!status || status === 'none' || status === 'ok') {
    if (status === 'ok') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-emerald-50 text-emerald-700 border-emerald-200">
          Ok
        </span>
      );
    }
    return null;
  }
  if (status === 'due_soon') {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-amber-50 text-amber-700 border-amber-200">
        Troca próxima
      </span>
    );
  }
  if (status === 'overdue') {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-red-50 text-red-600 border-red-200">
        Vencida
      </span>
    );
  }
  return null;
}

export default function EstoqueOpsView({ onBackToHub, mode, setView }: Props) {
  const [submodule] = useState<EstoqueOpsMode>(mode);
  const [activeTab, setActiveTab] = useState<string>(mode);
  const [items, setItems] = useState<AlmoxOpsItem[]>([]);
  const [movements, setMovements] = useState<AlmoxMovement[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<AlmoxOpsItem | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [erpQ, setErpQ] = useState('');
  const [erpHits, setErpHits] = useState<CatalogHit[]>([]);
  const [erpSearching, setErpSearching] = useState(false);
  const [localDesc, setLocalDesc] = useState('');
  const [localUnit, setLocalUnit] = useState('UN');
  const [localMin, setLocalMin] = useState('0');
  const [localIdeal, setLocalIdeal] = useState('0');

  const [eqModal, setEqModal] = useState<Equipment | null | 'new'>(null);
  const [eqForm, setEqForm] = useState({
    code: '',
    name: '',
    sector: '',
    status: 'ativo',
    maintenanceIntervalDays: '',
    nextMaintenanceAt: '',
    notes: '',
    pecaCodes: '',
  });

  const [todasPecas, setTodasPecas] = useState<AlmoxOpsItem[]>([]);
  const loadTodasPecas = async () => {
    try {
      const res = await apiJson<{ items: AlmoxOpsItem[] }>(`/almox/items?section=pecas`);
      setTodasPecas(res.items ?? []);
    } catch (e) {
      console.error("Erro ao carregar peças para seleção:", e);
    }
  };

  useEffect(() => {
    if (eqModal) {
      void loadTodasPecas();
    }
  }, [eqModal]);

  const [eqFotoDrawer, setEqFotoDrawer] = useState<Equipment | null>(null);
  const [eqFotos, setEqFotos] = useState<{ id: string; photoData: string; notes?: string | null; createdAt: string }[]>([]);
  const [eqFotosLoading, setEqFotosLoading] = useState(false);
  const [newEqFotoNotes, setNewEqFotoNotes] = useState('');

  useEffect(() => {
    if (eqFotoDrawer) {
      setEqFotosLoading(true);
      apiJson<{ fotos: any[] }>(`/almox/fotos/equipment/${encodeURIComponent(eqFotoDrawer.id)}`)
        .then((res) => {
          setEqFotos(res.fotos ?? []);
        })
        .catch((e) => {
          console.error("Erro ao carregar fotos do equipamento:", e);
        })
        .finally(() => {
          setEqFotosLoading(false);
        });
    } else {
      setEqFotos([]);
    }
  }, [eqFotoDrawer]);

  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [batchResult, setBatchResult] = useState<string | null>(null);

  const [mtModal, setMtModal] = useState(false);
  const [mtForm, setMtForm] = useState({
    equipmentId: '',
    kind: 'preventiva',
    status: 'aberta',
    routine: '',
    itemCode: '',
    quantity: '1',
    technician: '',
    cost: '',
    notes: '',
    consumeStock: false,
  });

  const section = sectionForMode(submodule);
  const isMov = activeTab === 'movimentacoes';
  const isItemsMode = (activeTab === 'itens' || activeTab === 'almoxarifado' || activeTab === 'supermercado' || activeTab === 'pecas') && !isMov;
  const isEquip = activeTab === 'equipamentos';
  const isMaint = activeTab === 'manutencoes';
  const isSupermercado = section === 'supermercado';
  /** Almoxarifado / Peças (e catálogo de seções ERP): só vínculo ERP */
  const canLinkErp = !!section && !isSupermercado;
  /** Supermercado: só família local APP_* */
  const canCreateLocal = isSupermercado;

  const loadItems = useCallback(async () => {
    const params = new URLSearchParams();
    if (section) params.set('section', section);
    params.set('onlyActive', 'false');
    const res = await apiJson<{ items: AlmoxOpsItem[] }>(`/almox/items?${params}`);
    setItems(res.items ?? []);
  }, [section]);

  const loadMovements = useCallback(async () => {
    const res = await apiJson<{ movements: AlmoxMovement[] }>('/almox/movements?limit=200');
    setMovements(res.movements ?? []);
  }, []);

  const loadEquipments = useCallback(async () => {
    const res = await apiJson<{ equipments: Equipment[] }>('/almox/equipments');
    setEquipments(res.equipments ?? []);
  }, []);

  const loadMaintenances = useCallback(async () => {
    const res = await apiJson<{ maintenances: Maintenance[] }>('/almox/maintenances');
    setMaintenances(res.maintenances ?? []);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isEquip) {
        await loadEquipments();
      } else if (isMaint) {
        await Promise.all([loadMaintenances(), loadEquipments()]);
      } else {
        await Promise.all([loadItems(), loadMovements()]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [isEquip, isMaint, loadEquipments, loadItems, loadMaintenances, loadMovements]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setSelected(null);
    setQ('');
    setShowAdd(false);
  }, [activeTab]);

  const filteredItems = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (i) =>
        i.code.toLowerCase().includes(term) ||
        (i.description || '').toLowerCase().includes(term) ||
        (i.location || '').toLowerCase().includes(term) ||
        (i.section || '').toLowerCase().includes(term)
    );
  }, [items, q]);

  const localStats = useMemo(() => {
    const total = filteredItems.length;
    const belowMin = filteredItems.filter(i => i.belowMin).length;
    const inactive = filteredItems.filter(i => !i.active).length;
    const totalQty = filteredItems.reduce((acc, i) => acc + i.qtyOnHand, 0);
    return { total, belowMin, inactive, totalQty };
  }, [filteredItems]);

  const searchErp = async () => {
    if (!erpQ.trim()) return;
    setErpSearching(true);
    setError(null);
    try {
      const res = await apiJson<{ items: CatalogHit[] }>(
        `/almox/items/search?q=${encodeURIComponent(erpQ.trim())}`
      );
      setErpHits(res.items ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro na busca ERP');
    } finally {
      setErpSearching(false);
    }
  };

  const linkErp = async (hit: CatalogHit) => {
    if (!canLinkErp || !section) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson('/almox/items/link', {
        method: 'POST',
        body: JSON.stringify({
          itemCode: hit.code,
          section,
          active: true,
          minQty: 0,
          idealQty: 0,
        }),
      });
      setShowAdd(false);
      setErpHits([]);
      setErpQ('');
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao vincular');
    } finally {
      setBusy(false);
    }
  };

  const createLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateLocal) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson('/almox/items/local', {
        method: 'POST',
        body: JSON.stringify({
          description: localDesc.trim(),
          unit: localUnit.trim() || 'UN',
          section: 'supermercado',
          minQty: Number(localMin) || 0,
          idealQty: Number(localIdeal) || 0,
        }),
      });
      setShowAdd(false);
      setLocalDesc('');
      setLocalUnit('UN');
      setLocalMin('0');
      setLocalIdeal('0');
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar item');
    } finally {
      setBusy(false);
    }
  };

  const saveConfig = async (payload: ItemConfigPayload) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiJson<{ item: AlmoxOpsItem }>(
        `/almox/items/${encodeURIComponent(selected.code)}/config`,
        { method: 'PUT', body: JSON.stringify(payload) }
      );
      setSelected(res.item);
      await loadItems();
    } finally {
      setBusy(false);
    }
  };

  const submitMovement = async (payload: MovementPayload) => {
    setBusy(true);
    setError(null);
    try {
      await apiJson('/almox/movements', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await Promise.all([loadItems(), loadMovements()]);
      if (selected) {
        const updated = (
          await apiJson<{ item: AlmoxOpsItem }>(
            `/almox/items/${encodeURIComponent(selected.code)}`
          )
        ).item;
        setSelected(updated);
      }
    } finally {
      setBusy(false);
    }
  };

  const openEqNew = () => {
    setEqForm({
      code: '',
      name: '',
      sector: '',
      status: 'ativo',
      maintenanceIntervalDays: '',
      nextMaintenanceAt: '',
      notes: '',
      pecaCodes: '',
    });
    setEqModal('new');
  };

  const openEqEdit = (eq: Equipment) => {
    setEqForm({
      code: eq.code,
      name: eq.name,
      sector: eq.sector || '',
      status: eq.status || 'ativo',
      maintenanceIntervalDays:
        eq.maintenanceIntervalDays != null ? String(eq.maintenanceIntervalDays) : '',
      nextMaintenanceAt: eq.nextMaintenanceAt ? eq.nextMaintenanceAt.slice(0, 10) : '',
      notes: eq.notes || '',
      pecaCodes: (eq.pecaCodes || []).join(', '),
    });
    setEqModal(eq);
  };

  const saveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      code: eqForm.code.trim(),
      name: eqForm.name.trim(),
      sector: eqForm.sector.trim() || null,
      status: eqForm.status,
      maintenanceIntervalDays: eqForm.maintenanceIntervalDays
        ? Number(eqForm.maintenanceIntervalDays)
        : null,
      nextMaintenanceAt: eqForm.nextMaintenanceAt || null,
      notes: eqForm.notes.trim() || null,
      pecaCodes: eqForm.pecaCodes
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
    try {
      if (eqModal === 'new') {
        await apiJson('/almox/equipments', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      } else if (eqModal && typeof eqModal === 'object') {
        await apiJson(`/almox/equipments/${encodeURIComponent(eqModal.id)}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      }
      setEqModal(null);
      await loadEquipments();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar equipamento');
    } finally {
      setBusy(false);
    }
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
          itemCode: mtForm.itemCode.trim() || null,
          quantity: mtForm.itemCode ? Number(mtForm.quantity) || 1 : null,
          technician: mtForm.technician.trim() || null,
          cost: mtForm.cost ? Number(mtForm.cost) : null,
          notes: mtForm.notes.trim() || null,
          consumeStock: mtForm.consumeStock,
        }),
      });
      setMtModal(false);
      setMtForm({
        equipmentId: '',
        kind: 'preventiva',
        status: 'aberta',
        routine: '',
        itemCode: '',
        quantity: '1',
        technician: '',
        cost: '',
        notes: '',
        consumeStock: false,
      });
      await loadMaintenances();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar manutenção');
    } finally {
      setBusy(false);
    }
  };

  const handleAddEqFoto = (file: File) => {
    if (!eqFotoDrawer) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      if (!base64) return;
      setError(null);
      try {
        const res = await apiJson<{ foto: any }>(`/almox/fotos/equipment/${encodeURIComponent(eqFotoDrawer.id)}`, {
          method: 'POST',
          body: JSON.stringify({
            photoData: base64,
            notes: newEqFotoNotes.trim() || null,
          }),
        });
        setEqFotos((prev) => [res.foto, ...prev]);
        setNewEqFotoNotes('');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar foto do equipamento');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteEqFoto = async (id: string) => {
    setError(null);
    try {
      await apiJson(`/almox/fotos/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      setEqFotos((prev) => prev.filter((f) => f.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir foto');
    }
  };

  const handleBatchImport = async () => {
    if (!batchText.trim()) return;
    setBusy(true);
    setBatchResult('Processando importação...');
    setError(null);
    const lines = batchText.split('\n');
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(/\t|,|;/).map((p) => p.trim());
      if (parts.length < 3) {
        failCount++;
        errors.push(`Linha ${i + 1}: colunas insuficientes (esperado itemCode, tipo, quantidade)`);
        continue;
      }

      const itemCode = parts[0];
      const movementTypeRaw = parts[1].toLowerCase();
      const movementType = movementTypeRaw.includes('ent') || movementTypeRaw.includes('in') ? 'entrada' : 'saida';
      const quantity = Number(parts[2].replace(',', '.'));
      const unitCost = parts[3] ? Number(parts[3].replace(',', '.')) : null;
      const reason = parts[4] || 'Importação em lote';

      if (!itemCode || isNaN(quantity) || quantity <= 0) {
        failCount++;
        errors.push(`Linha ${i + 1}: dados inválidos para código de item ou quantidade.`);
        continue;
      }

      try {
        await apiJson('/almox/movements', {
          method: 'POST',
          body: JSON.stringify({
            itemCode,
            movementType,
            quantity,
            unitCost,
            reason,
          }),
        });
        successCount++;
      } catch (err: any) {
        failCount++;
        errors.push(`Linha ${i + 1} (${itemCode}): ${err.message || 'Erro de API'}`);
      }
    }

    setBatchResult(
      `Sucesso: ${successCount} movimentação(ões). Falhas: ${failCount}.\n` +
      (errors.length > 0 ? `Detalhes dos erros:\n${errors.join('\n')}` : '')
    );
    setBusy(false);
    await loadMovements();
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
      await loadMaintenances();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar');
    } finally {
      setBusy(false);
    }
  };

  const sidebarItems = useMemo(() => {
    if (submodule === 'almoxarifado') {
      return [
        { id: 'almoxarifado', label: 'Itens', icon: Warehouse },
        { id: 'movimentacoes', label: 'Movimentações', icon: History },
      ];
    }
    if (submodule === 'supermercado') {
      return [
        { id: 'supermercado', label: 'Itens', icon: Store },
        { id: 'movimentacoes', label: 'Movimentações', icon: History },
      ];
    }
    if (submodule === 'pecas') {
      return [
        { id: 'pecas', label: 'Peças de Reposição', icon: Cog },
        { id: 'movimentacoes', label: 'Movimentações', icon: History },
      ];
    }
    if (submodule === 'equipamentos' || submodule === 'manutencoes') {
      return [
        { id: 'equipamentos', label: 'Equipamentos', icon: Wrench },
        { id: 'manutencoes', label: 'Manutenções', icon: ClipboardList },
      ];
    }
    return [
      { id: 'itens', label: 'Todos os Itens', icon: Boxes },
      { id: 'movimentacoes', label: 'Todas as Movimentações', icon: History },
    ];
  }, [submodule]);

  const titleByTab: Record<string, string> = {
    itens: 'Catálogo operacional',
    almoxarifado: 'Almoxarifado',
    supermercado: 'Supermercado',
    pecas: 'Peças de reposição',
    equipamentos: 'Equipamentos',
    manutencoes: 'Manutenções',
    movimentacoes: 'Histórico de movimentações',
  };

  return (
    <AppLayout
      moduleTitle="Almoxarifado & Ops"
      moduleSubtitle={titleByTab[activeTab] || 'Histórico'}
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id)}
      headerActions={
        <div className="flex gap-2">
          {(canLinkErp || canCreateLocal) && (
            <button
              type="button"
              onClick={() => {
                setShowAdd(true);
                setErpHits([]);
                setErpQ('');
              }}
              className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-zinc-900 text-white cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              {canCreateLocal ? 'Nova família' : 'Adicionar'}
            </button>
          )}
          {isEquip && (
            <button
              type="button"
              onClick={openEqNew}
              className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-zinc-900 text-white cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo equipamento
            </button>
          )}
          {isMaint && (
            <button
              type="button"
              onClick={() => setMtModal(true)}
              className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-zinc-900 text-white cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova manutenção
            </button>
          )}
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

        {isItemsMode && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Itens catalogados</p>
                <p className="text-xl font-extrabold text-zinc-900 mt-1">{localStats.total}</p>
              </div>
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Abaixo do mínimo</p>
                <p className={`text-xl font-extrabold mt-1 ${localStats.belowMin > 0 ? 'text-red-650' : 'text-emerald-600'}`}>{localStats.belowMin}</p>
              </div>
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Saldo total físico</p>
                <p className="text-xl font-extrabold text-zinc-900 mt-1">{localStats.totalQty.toLocaleString('pt-BR')}</p>
              </div>
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Itens inativos</p>
                <p className="text-xl font-extrabold text-zinc-950 mt-1">{localStats.inactive}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por código, descrição ou localização…"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white"
                />
              </div>
              <p className="text-xs text-zinc-500 font-semibold whitespace-nowrap">
                {filteredItems.length} item(ns)
              </p>
            </div>

            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-zinc-400 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando…
                </div>
              ) : filteredItems.length === 0 ? (
                <p className="text-sm text-zinc-400 px-4 py-10 text-center">
                  Nenhum item configurado nesta seção.
                </p>
              ) : (
                <div className="divide-y divide-zinc-100">
                  {filteredItems.map((it) => (
                    <button
                      key={it.code}
                      type="button"
                      onClick={() => setSelected(it)}
                      className="w-full text-left px-4 py-3.5 hover:bg-zinc-50 transition-colors cursor-pointer flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          {mode === 'itens' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-zinc-100 text-zinc-700 border-zinc-200">
                              {SECTION_LABELS[it.section] || it.section}
                            </span>
                          )}
                          {it.belowMin && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-amber-50 text-amber-700 border-amber-200">
                              <AlertTriangle className="h-3 w-3" />
                              Abaixo do mín.
                            </span>
                          )}
                          {mode === 'pecas' && exchangeBadge(it.exchangeStatus)}
                          {!it.active && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-zinc-50 text-zinc-400 border-zinc-200">
                              Inativo
                            </span>
                          )}
                        </div>
                        <p className="font-bold text-sm text-zinc-900 truncate">
                          {it.description}
                        </p>
                        <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                          {it.code} · {it.unit}
                          {it.location ? ` · ${it.location}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-extrabold text-zinc-900">
                          {it.qtyOnHand.toLocaleString('pt-BR')}
                          <span className="text-[10px] font-semibold text-zinc-400 ml-1">
                            {it.unit}
                          </span>
                        </p>
                        {mode === 'supermercado' && it.avgUnitCost > 0 ? (
                          <p className="text-[10px] text-zinc-500 font-semibold">
                            méd.{' '}
                            {it.avgUnitCost.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                            /{it.unit}
                          </p>
                        ) : (
                          <p className="text-[10px] text-zinc-400 font-semibold">
                            mín. {it.minQty.toLocaleString('pt-BR')}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {isEquip && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {loading ? (
              <div className="col-span-full flex items-center justify-center gap-2 py-16 text-zinc-400 text-sm bg-white border border-zinc-200 rounded-2xl">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando…
              </div>
            ) : equipments.length === 0 ? (
              <div className="col-span-full bg-white border border-zinc-200 rounded-2xl py-10 text-center">
                <p className="text-sm text-zinc-400">Nenhum equipamento cadastrado.</p>
              </div>
            ) : (
              equipments.map((eq) => {
                const statusColor = 
                  eq.status === 'em_operacao' || eq.status === 'ativo'
                    ? 'border-emerald-250 bg-emerald-50 text-emerald-700'
                    : eq.status === 'em_manutencao'
                      ? 'border-amber-250 bg-amber-50 text-amber-700'
                      : 'border-red-250 bg-red-50 text-red-650';

                const statusLabel = 
                  eq.status === 'em_operacao' || eq.status === 'ativo'
                    ? 'Em operação'
                    : eq.status === 'em_manutencao'
                      ? 'Em manutenção'
                      : 'Parado';

                return (
                  <div
                    key={eq.id}
                    className="bg-white border border-zinc-200 rounded-2xl p-5 hover:border-zinc-400 hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusColor}`}>
                          {statusLabel}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded border border-zinc-150">
                          {eq.code}
                        </span>
                      </div>
                      
                      <h3 className="font-bold text-base text-zinc-900">
                        {eq.name}
                      </h3>
                      
                      {eq.sector && (
                        <p className="text-xs text-zinc-500 font-semibold mt-1">
                          Setor: {eq.sector}
                        </p>
                      )}
                      
                      {eq.notes && (
                        <p className="text-xs text-zinc-400 mt-2 italic bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                          {eq.notes}
                        </p>
                      )}

                      {eq.maintenanceIntervalDays && (
                        <p className="text-xs text-zinc-650 mt-3 font-semibold">
                          Preventiva a cada: {eq.maintenanceIntervalDays} dias
                        </p>
                      )}
                      
                      {eq.nextMaintenanceAt && (
                        <p className="text-[11px] text-zinc-500 mt-1 font-semibold">
                          Próxima preventiva: {new Date(eq.nextMaintenanceAt).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                    
                    <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between">
                      <span className="text-[11px] text-zinc-400 font-semibold">
                        {(eq.pecaCodes || []).length} peça(s) associada(s)
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEqFotoDrawer(eq)}
                          className="text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Camera className="h-3.5 w-3.5 text-zinc-450" />
                          Fotos
                        </button>
                        <button
                          type="button"
                          onClick={() => openEqEdit(eq)}
                          className="text-[11px] font-bold px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 cursor-pointer"
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {isMaint && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading ? (
              <div className="col-span-full flex items-center justify-center gap-2 py-16 text-zinc-400 text-sm bg-white border border-zinc-200 rounded-2xl">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando…
              </div>
            ) : maintenances.length === 0 ? (
              <div className="col-span-full bg-white border border-zinc-200 rounded-2xl py-10 text-center">
                <p className="text-sm text-zinc-400">Nenhuma manutenção registrada.</p>
              </div>
            ) : (
              maintenances.map((m) => {
                const statusColor = 
                  m.status === 'concluida'
                    ? 'border-emerald-250 bg-emerald-50 text-emerald-700'
                    : m.status === 'em_andamento'
                      ? 'border-amber-250 bg-amber-50 text-amber-700'
                      : 'border-zinc-200 bg-zinc-100 text-zinc-700';

                const statusLabel = 
                  m.status === 'concluida'
                    ? 'Concluída'
                    : m.status === 'em_andamento'
                      ? 'Em andamento'
                      : 'Pendente';

                const kindColor =
                  m.kind === 'corretiva'
                    ? 'bg-red-50 text-red-650 border-red-100'
                    : m.kind === 'preventiva'
                      ? 'bg-blue-50 text-blue-700 border-blue-100'
                      : 'bg-purple-50 text-purple-700 border-purple-100';

                return (
                  <div
                    key={m.id}
                    className="bg-white border border-zinc-200 rounded-2xl p-5 hover:border-zinc-300 transition-all flex flex-col justify-between shadow-xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusColor}`}>
                            {statusLabel}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${kindColor}`}>
                            {m.kind}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-400 font-semibold">
                          {new Date(m.occurredAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>

                      <h3 className="font-bold text-base text-zinc-950 flex items-center justify-between">
                        <span>{m.equipmentName || m.equipmentCode || 'Máquina não identificada'}</span>
                        {m.routine && (
                          <span className="px-2 py-0.5 bg-zinc-150 border border-zinc-200 rounded-lg text-[9px] font-extrabold uppercase text-zinc-700 tracking-wider">
                            {m.routine}
                          </span>
                        )}
                      </h3>
                      
                      {m.technician && (
                        <p className="text-xs text-zinc-650 font-semibold mt-1">
                          Técnico: <span className="text-zinc-900 font-bold">{m.technician}</span>
                        </p>
                      )}

                      {m.itemCode && (
                        <p className="text-xs text-zinc-650 font-semibold mt-1">
                          Peça Utilizada:{' '}
                          <span className="text-zinc-900 font-bold">
                            {m.itemDescription || m.itemCode} ({m.quantity} un)
                          </span>
                        </p>
                      )}

                      {m.cost != null && m.cost > 0 && (
                        <p className="text-xs text-zinc-950 font-extrabold mt-2">
                          Custo:{' '}
                          {m.cost.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </p>
                      )}

                      {m.notes && (
                        <p className="text-xs text-zinc-400 mt-2 bg-zinc-50 p-2.5 rounded-xl border border-zinc-100 italic">
                          {m.notes}
                        </p>
                      )}
                    </div>

                    {m.status !== 'concluida' && (
                      <div className="mt-4 pt-3 border-t border-zinc-100 flex justify-end">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => updateMaintStatus(m.id, 'concluida')}
                          className="text-xs font-bold px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                        >
                          Concluir Manutenção
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {isMov && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por código, descrição, motivo ou documento…"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setBatchText('');
                  setBatchResult(null);
                  setShowBatchModal(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-bold shadow-sm hover:bg-zinc-800 transition-all cursor-pointer inline-flex items-center gap-1.5 shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                Lançamento em Lote (CSV/Planilha)
              </button>
            </div>

            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-zinc-400 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando…
                </div>
              ) : movements.length === 0 ? (
                <p className="text-sm text-zinc-400 px-4 py-10 text-center">
                  Nenhum movimento registrado.
                </p>
              ) : (
                <div className="divide-y divide-zinc-150">
                  {movements
                    .filter((m) => {
                      if (submodule !== 'itens' && submodule !== 'movimentacoes') {
                        const itemExists = items.some((it) => it.code === m.itemCode);
                        if (!itemExists) return false;
                      }
                      const term = q.trim().toLowerCase();
                      if (!term) return true;
                      return (
                        m.itemCode.toLowerCase().includes(term) ||
                        (m.itemDescription || '').toLowerCase().includes(term) ||
                        (m.reason || '').toLowerCase().includes(term) ||
                        (m.documentRef || '').toLowerCase().includes(term)
                      );
                    })
                    .map((m) => {
                      const isEntrada = m.movementType === 'entrada';
                      const isSaida = m.movementType === 'saida';
                      const badgeColor = isEntrada
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : isSaida
                          ? 'border-red-200 bg-red-50 text-red-650'
                          : 'border-zinc-200 bg-zinc-150 text-zinc-700';

                      return (
                        <div
                          key={m.id}
                          className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-zinc-50/50 transition-colors"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${badgeColor}`}>
                                {m.movementType}
                              </span>
                              <span className="text-xs font-bold text-zinc-900 truncate">
                                {m.itemDescription || m.itemCode}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-50 px-1.5 py-0.5 rounded border border-zinc-100">
                                {m.itemCode}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                              <span>{new Date(m.occurredAt).toLocaleString('pt-BR')}</span>
                              {m.sector && (
                                <>
                                  <span>·</span>
                                  <span>Setor: {m.sector}</span>
                                </>
                              )}
                              {m.reason && (
                                <>
                                  <span>·</span>
                                  <span className="italic text-zinc-650">Motivo: {m.reason}</span>
                                </>
                              )}
                              {m.documentRef && (
                                <>
                                  <span>·</span>
                                  <span className="font-mono text-[10px] text-zinc-400">Doc: {m.documentRef}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-4 shrink-0 sm:text-right sm:flex-col sm:gap-1">
                            <span className={`text-sm font-extrabold ${isEntrada ? 'text-emerald-700' : isSaida ? 'text-red-650' : 'text-zinc-900'}`}>
                              {isEntrada ? '+' : isSaida ? '-' : ''}
                              {m.quantity.toLocaleString('pt-BR')}
                            </span>
                            {m.unitCost != null && m.unitCost > 0 && (
                              <span className="text-[10px] text-zinc-400 font-semibold">
                                Custo: {m.unitCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                            )}
                            {m.totalPaid != null && m.totalPaid > 0 && (
                              <span className="text-[10px] text-zinc-500 font-bold">
                                Total: {m.totalPaid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {selected && (
        <ItemDrawer
          item={selected}
          movements={movements}
          onClose={() => setSelected(null)}
          onSaveConfig={saveConfig}
          onSubmitMovement={submitMovement}
          busy={busy}
        />
      )}

      {showAdd && section && (canLinkErp || canCreateLocal) && (
        <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-zinc-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="font-bold text-zinc-900">
                {canCreateLocal
                  ? 'Nova família · Supermercado'
                  : `Vincular ERP · ${SECTION_LABELS[section]}`}
              </h3>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {canLinkErp ? (
                <>
                  <p className="text-xs text-zinc-500">
                    Busque no catálogo ERP e vincule o item a esta seção. Cadastro local não é
                    permitido aqui.
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={erpQ}
                      onChange={(e) => setErpQ(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && searchErp()}
                      placeholder="Código ou descrição…"
                      className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={searchErp}
                      disabled={erpSearching}
                      className="px-3 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      {erpSearching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {erpHits.map((h) => (
                      <div
                        key={h.code}
                        className="flex items-center justify-between gap-2 rounded-xl border border-zinc-100 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-zinc-900 truncate">
                            {h.description}
                          </p>
                          <p className="text-[10px] font-mono text-zinc-400">
                            {h.code} · {h.unit}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy || h.alreadyLinked}
                          onClick={() => linkErp(h)}
                          className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-zinc-900 text-white disabled:opacity-40 cursor-pointer shrink-0"
                        >
                          {h.alreadyLinked ? 'Já vinculado' : 'Vincular'}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <form onSubmit={createLocal} className="space-y-3">
                  <p className="text-xs text-zinc-500">
                    Famílias do supermercado são cadastradas só no Hub (código APP_*). Não há
                    vínculo ERP.
                  </p>
                  <label className="block space-y-1">
                    <span className="text-[10px] font-bold uppercase text-zinc-400">
                      Nome da família
                    </span>
                    <input
                      required
                      value={localDesc}
                      onChange={(e) => setLocalDesc(e.target.value)}
                      placeholder="Ex: Detergente"
                      className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="space-y-1">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">Unidade</span>
                      <input
                        value={localUnit}
                        onChange={(e) => setLocalUnit(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">Mín.</span>
                      <input
                        type="number"
                        value={localMin}
                        onChange={(e) => setLocalMin(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">Ideal</span>
                      <input
                        type="number"
                        value={localIdeal}
                        onChange={(e) => setLocalIdeal(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                  >
                    Criar família
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {eqModal && (
        <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={saveEquipment}
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-zinc-200 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="font-bold text-zinc-900">
                {eqModal === 'new' ? 'Novo equipamento' : 'Editar equipamento'}
              </h3>
              <button
                type="button"
                onClick={() => setEqModal(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">Código</span>
                  <input
                    required
                    value={eqForm.code}
                    onChange={(e) => setEqForm((f) => ({ ...f, code: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">Status</span>
                  <select
                    value={eqForm.status}
                    onChange={(e) => setEqForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                    <option value="manutencao">Em manutenção</option>
                  </select>
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">Nome</span>
                <input
                  required
                  value={eqForm.name}
                  onChange={(e) => setEqForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">Setor</span>
                <input
                  value={eqForm.sector}
                  onChange={(e) => setEqForm((f) => ({ ...f, sector: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">
                    Intervalo (dias)
                  </span>
                  <input
                    type="number"
                    value={eqForm.maintenanceIntervalDays}
                    onChange={(e) =>
                      setEqForm((f) => ({ ...f, maintenanceIntervalDays: e.target.value }))
                    }
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">
                    Próx. manutenção
                  </span>
                  <input
                    type="date"
                    value={eqForm.nextMaintenanceAt}
                    onChange={(e) =>
                      setEqForm((f) => ({ ...f, nextMaintenanceAt: e.target.value }))
                    }
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">
                  Vincular peças de reposição (Opcional)
                </span>
                {todasPecas.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">Nenhuma peça cadastrada no módulo de Peças.</p>
                ) : (
                  <div className="border border-zinc-200 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1.5 bg-zinc-50/50">
                    {todasPecas.map((p) => {
                      const currentCodes = eqForm.pecaCodes
                        .split(',')
                        .map((c) => c.trim())
                        .filter(Boolean);
                      const isChecked = currentCodes.includes(p.code);

                      const togglePeca = (code: string) => {
                        let newCodes;
                        if (isChecked) {
                          newCodes = currentCodes.filter((c) => c !== code);
                        } else {
                          newCodes = [...currentCodes, code];
                        }
                        setEqForm((f) => ({ ...f, pecaCodes: newCodes.join(', ') }));
                      };

                      return (
                        <label key={p.code} className="flex items-start gap-2 text-xs font-semibold text-zinc-700 hover:text-zinc-950 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePeca(p.code)}
                            className="rounded border-zinc-300 mt-0.5"
                          />
                          <div className="min-w-0">
                            <span className="font-bold text-zinc-900">{p.description}</span>
                            <span className="text-[10px] text-zinc-400 font-mono ml-1.5">({p.code})</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
                <input
                  value={eqForm.pecaCodes}
                  onChange={(e) => setEqForm((f) => ({ ...f, pecaCodes: e.target.value }))}
                  placeholder="Ou digite códigos separados por vírgula. Ex: P001, P002"
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm mt-1.5"
                />
              </div>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">Notas</span>
                <textarea
                  value={eqForm.notes}
                  onChange={(e) => setEqForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {mtModal && (
        <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={saveMaintenance}
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-zinc-200 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="font-bold text-zinc-900">Nova manutenção</h3>
              <button
                type="button"
                onClick={() => setMtModal(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
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
                    <option value="troca_peca">Troca de peça</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">Status</span>
                  <select
                    value={mtForm.status}
                    onChange={(e) => setMtForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  >
                    <option value="aberta">Aberta</option>
                    <option value="em_andamento">Em andamento</option>
                    <option value="concluida">Concluída</option>
                  </select>
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">
                  Rotina Específica (Opcional)
                </span>
                <select
                  value={mtForm.routine}
                  onChange={(e) => setMtForm((f) => ({ ...f, routine: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                >
                  <option value="">Nenhuma / Outra</option>
                  <option value="calibragem">Calibração / Calibragem</option>
                  <option value="limpeza">Limpeza</option>
                  <option value="lubrificacao">Lubrificação</option>
                  <option value="inspecao">Inspeção Geral</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">
                    Peça (opc.)
                  </span>
                  <input
                    value={mtForm.itemCode}
                    onChange={(e) => setMtForm((f) => ({ ...f, itemCode: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">Qtd</span>
                  <input
                    type="number"
                    value={mtForm.quantity}
                    onChange={(e) => setMtForm((f) => ({ ...f, quantity: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                <input
                  type="checkbox"
                  checked={mtForm.consumeStock}
                  onChange={(e) =>
                    setMtForm((f) => ({ ...f, consumeStock: e.target.checked }))
                  }
                  className="rounded border-zinc-300"
                />
                Consumir estoque da peça
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">Técnico</span>
                <input
                  value={mtForm.technician}
                  onChange={(e) => setMtForm((f) => ({ ...f, technician: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">Custo</span>
                <input
                  type="number"
                  value={mtForm.cost}
                  onChange={(e) => setMtForm((f) => ({ ...f, cost: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
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
                Criar manutenção
              </button>
            </div>
          </form>
        </div>
      )}

      {eqFotoDrawer && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end">
          <div className="absolute inset-0 cursor-pointer" onClick={() => setEqFotoDrawer(null)} />
          <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col z-10 p-6 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-150 pb-3">
              <div>
                <h3 className="font-bold text-zinc-900 text-lg">Fotos do Equipamento</h3>
                <p className="text-xs text-zinc-500 font-mono mt-0.5">{eqFotoDrawer.name} ({eqFotoDrawer.code})</p>
              </div>
              <button
                type="button"
                onClick={() => setEqFotoDrawer(null)}
                className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-700 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-zinc-50 border border-dashed border-zinc-250 rounded-2xl p-4 flex flex-col items-center justify-center space-y-3">
              <input
                type="text"
                placeholder="Legenda para a foto do equipamento (opcional)"
                value={newEqFotoNotes}
                onChange={(e) => setNewEqFotoNotes(e.target.value)}
                className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 shadow-sm focus:border-zinc-400 focus:outline-none"
              />
              
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold shadow-md cursor-pointer hover:bg-zinc-800 transition-all">
                <Camera className="h-4 w-4" />
                Adicionar foto do equipamento
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAddEqFoto(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            {eqFotosLoading ? (
              <div className="flex items-center justify-center py-10 text-zinc-400 text-xs">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando fotos...
              </div>
            ) : eqFotos.length === 0 ? (
              <p className="text-center py-10 text-xs text-zinc-400">Nenhuma foto adicionada para este equipamento.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {eqFotos.map((f) => (
                  <div key={f.id} className="relative rounded-2xl border border-zinc-150 overflow-hidden bg-zinc-50 shadow-sm flex flex-col group">
                    <div className="relative aspect-video w-full overflow-hidden bg-zinc-900 flex items-center justify-center">
                      <img
                        src={f.photoData}
                        alt={f.notes || "Foto do equipamento"}
                        className="w-full h-full object-cover group-hover:scale-102 transition-all duration-300"
                      />
                    </div>
                    <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                      {f.notes ? (
                        <p className="text-xs text-zinc-700 font-medium">{f.notes}</p>
                      ) : (
                        <p className="text-[10px] text-zinc-400 italic">Sem legenda</p>
                      )}
                      <div className="flex justify-between items-center text-[10px] text-zinc-400 font-bold border-t border-zinc-100 pt-2 shrink-0">
                        <span>Adicionada em: {f.createdAt ? f.createdAt.slice(0, 10).split('-').reverse().join('/') : ''}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteEqFoto(f.id)}
                          className="text-red-500 hover:text-red-700 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showBatchModal && (
        <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl border border-zinc-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-zinc-900">Lançamento em Lote</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Cole os dados formatados em planilha (TSV/CSV) ou digite linha a linha.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="p-5 space-y-4 flex-1 overflow-y-auto flex flex-col">
              <p className="text-xs text-zinc-655 bg-zinc-50 border border-zinc-150 rounded-xl p-3">
                <span className="font-bold text-zinc-950">Instruções de Formato:</span>
                <br />
                Cada linha deve conter: <code className="font-mono bg-zinc-200 px-1 py-0.5 rounded text-[10.5px]">Código_Item [TAB ou vírgula] Tipo(entrada/saida) [TAB ou vírgula] Quantidade [TAB ou vírgula] Custo_Unitário (opcional) [TAB ou vírgula] Motivo (opcional)</code>.
                <br />
                <span className="font-bold text-zinc-950 mt-1.5 block">Exemplo TSV:</span>
                <code className="block font-mono bg-zinc-200/60 p-2 rounded text-[10px] whitespace-pre mt-1">
                  APP_MARGARINA500G{"\t"}entrada{"\t"}10{"\t"}6.50{"\t"}Compra Semanal{"\n"}
                  APP_DETERGENTE{"\t"}saida{"\t"}2{"\t"}{"\t"}Uso na cozinha
                </code>
              </p>

              <textarea
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                placeholder="Cole as colunas de sua planilha aqui..."
                rows={10}
                className="w-full flex-1 rounded-xl border border-zinc-250 p-3 text-xs font-mono focus:border-zinc-400 focus:outline-none bg-zinc-50/50"
              />

              {batchResult && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-100 p-3 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto text-zinc-800">
                  {batchResult}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-zinc-100 bg-zinc-50/80 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="px-4 py-2 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
              <button
                type="button"
                disabled={busy || !batchText.trim()}
                onClick={handleBatchImport}
                className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Importar movimentações
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

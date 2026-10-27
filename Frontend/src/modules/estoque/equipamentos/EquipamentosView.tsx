import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Cog,
  Cpu,
  ExternalLink,
  Factory,
  FileText,
  FlaskConical,
  HardDrive,
  Info,
  Laptop,
  Layers,
  Loader2,
  Monitor,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShoppingCart,
  Trash2,
  Truck,
  Wrench,
  Zap,
} from 'lucide-react';
import { apiJson } from '../../geral/lib/http';
import AppLayout from '../../geral/components/layout/AppLayout';
import { ReportTabs } from '../../geral/components/ui/ReportKit';
import Modal from '../../geral/components/ui/Modal';
import type { AlmoxOpsItem, Demand, Equipment, EquipmentPecaStat, Maintenance, MaintenancePart } from '../ops/types';

interface Props {
  onBackToHub: () => void;
  initialTab?: 'parque' | 'agenda';
  initialEquipmentId?: string | null;
  focusTicket?: number;
  onOpenMaintenance?: (equipmentId: string) => void;
}

type DetailTab = 'dados' | 'manutencoes' | 'pecas' | 'fotos';

export const EQUIPMENT_FAMILIES = [
  { id: 'todas', label: 'Todas as Famílias', icon: Layers },
  { id: 'envase_producao', label: 'Máquinas e Envase', icon: Factory, color: 'text-blue-700 bg-blue-50 border-blue-200' },
  { id: 'ti_computadores', label: 'TI e Computadores', icon: Laptop, color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  { id: 'laboratorio', label: 'Laboratório e CQ', icon: FlaskConical, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  { id: 'utilidades_infra', label: 'Utilidades e Infra', icon: Zap, color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { id: 'logistica', label: 'Logística e Carga', icon: Truck, color: 'text-purple-700 bg-purple-50 border-purple-200' },
  { id: 'predial_geral', label: 'Geral e Predial', icon: Wrench, color: 'text-zinc-700 bg-zinc-100 border-zinc-200' },
] as const;

export const FAMILY_LABEL_MAP: Record<string, string> = {
  envase_producao: 'Máquinas e Envase',
  ti_computadores: 'TI e Computadores',
  laboratorio: 'Laboratório e CQ',
  utilidades_infra: 'Utilidades e Infra',
  logistica: 'Logística e Carga',
  predial_geral: 'Geral e Predial',
};

const SUGGESTED_SUBTYPES: Record<string, string[]> = {
  envase_producao: [
    'Envasadora Automática',
    'Envasadora Semi-automática',
    'Rotuladora Automática',
    'Rotuladora Manual',
    'Datador Inkjet / Laser',
    'Seladora Contínua / Indução',
    'Misturador Planetário',
    'Reator / Tanque Homogeneizador',
    'Bomba Dosadora',
    'Esteira Transportadora',
  ],
  ti_computadores: [
    'Computador Desktop',
    'Notebook / Laptop',
    'Impressora Térmica Zebra',
    'Impressora Laser / Tanque',
    'Leitor de Código de Barras / Coletor',
    'Terminal Touch de Produção',
    'Servidor Local / NAS',
    'Switch / Roteador / Access Point',
    'Nobreak de TI',
  ],
  laboratorio: [
    'Viscosímetro Rotacional',
    'Medidor de pH (pHmetro)',
    'Picnômetro Metálico',
    'Balança Analítica / Precisão',
    'Agitador Magnético / Mecânico',
    'Banho Maria',
    'Termo-higrômetro',
    'Refratômetro',
  ],
  utilidades_infra: [
    'Compressor de Ar Comprimido',
    'Secador de Ar',
    'Caldeira / Gerador de Vapor',
    'Sistema de Tratamento de Água (Osmose)',
    'Ar Condicionado / Climatizador',
    'Gerador de Energia',
    'Exaustor Industrial',
  ],
  logistica: [
    'Paleteira Manual',
    'Paleteira Elétrica',
    'Empilhadeira Manual / Elétrica',
    'Carrinho Plataforma',
    'Mesa Elevatória',
  ],
  predial_geral: [
    'Bancada Industrial',
    'Ferramenta Elétrica',
    'Escada Industrial',
    'Luminária de Emergência',
    'Extintor / Segurança',
  ],
};

export function detectEquipmentFamily(eq: Partial<Equipment>): string {
  const t = (eq.equipType || '').toLowerCase().trim();
  if (t === 'envase_producao' || t === 'envase' || t.includes('envas')) return 'envase_producao';
  if (t === 'ti_computadores' || t === 'computador' || t === 'ti' || t.includes('comput') || t.includes('inform')) return 'ti_computadores';
  if (t === 'laboratorio' || t.includes('lab') || t.includes('qualidade')) return 'laboratorio';
  if (t === 'utilidades_infra' || t === 'utilidade' || t.includes('compress') || t.includes('ar comp')) return 'utilidades_infra';
  if (t === 'logistica' || t.includes('palete') || t.includes('empilh')) return 'logistica';
  if (t === 'predial_geral' || t.includes('predial')) return 'predial_geral';

  // Auto-detecção pelo nome ou notas se o tipo estiver em branco
  const text = `${eq.name || ''} ${eq.notes || ''} ${eq.sector || ''}`.toLowerCase();
  if (/envase|rotulad|dosador|reator|misturad|selad|datador|esteira/.test(text)) return 'envase_producao';
  if (/computador|desktop|notebook|laptop|zebra|impressora|leitor|terminal|servidor|wifi|switch/.test(text)) return 'ti_computadores';
  if (/viscos|phmetro|picnom|balan[cç]a|laborat|densid|agitador/.test(text)) return 'laboratorio';
  if (/compressor|caldeira|osmose|secador|climatiz|gerador|exaust/.test(text)) return 'utilidades_infra';
  if (/paleteira|empilhadeira|carrinho|elevat/.test(text)) return 'logistica';

  return 'envase_producao';
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    const clean = iso.slice(0, 10);
    const [y, m, d] = clean.split('-');
    if (y && m && d) return `${d}/${m}/${y}`;
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
    return { label: 'Operacional', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (s === 'em_manutencao' || s === 'manutencao') {
    return { label: 'Em Manutenção', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  }
  return { label: 'Baixado / Inativo', cls: 'bg-rose-50 text-rose-700 border-rose-200' };
}

function maintStatusMeta(status?: string, scheduledAt?: string | null) {
  const s = (status || '').toLowerCase();
  if (s === 'concluida') {
    return { label: 'Concluída', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (s === 'em_andamento') {
    return { label: 'Em Andamento', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  }
  if (scheduledAt) {
    return { label: 'Programada', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
  }
  return { label: 'Pendente', cls: 'bg-zinc-100 text-zinc-700 border-zinc-200' };
}

function kindMeta(kind?: string) {
  const k = (kind || '').toLowerCase();
  if (k === 'corretiva') return { label: 'Corretiva', cls: 'bg-rose-50 text-rose-700 border-rose-200' };
  if (k === 'calibracao' || k === 'calibração') return { label: 'Calibração', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
  if (k === 'inspecao' || k === 'inspeção') return { label: 'Inspeção', cls: 'bg-zinc-100 text-zinc-700 border-zinc-200' };
  if (k === 'preditiva') return { label: 'Preditiva', cls: 'bg-purple-50 text-purple-700 border-purple-200' };
  return { label: 'Preventiva', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
}

interface TechnicalSpecs {
  // TI
  hostname?: string;
  ipAddress?: string;
  macAddress?: string;
  cpu?: string;
  ram?: string;
  storage?: string;
  os?: string;
  assignedUser?: string;
  // Máquinas / Envase
  capacity?: string;
  voltage?: string;
  pressure?: string;
  power?: string;
  nozzles?: string;
  // Laboratório
  measuringRange?: string;
  resolution?: string;
  calibrationCert?: string;
  calibrationValidUntil?: string;
  // Patrimônio & Geral
  patrimonioTag?: string;
  invoiceNumber?: string;
  criticality?: 'alta' | 'media' | 'baixa';
  warrantyUntil?: string;
}

function parseTechSpecs(notes?: string | null): TechnicalSpecs {
  if (!notes) return {};
  try {
    const match = notes.match(/\[SPECS_JSON:(.+?)\]/s);
    if (match && match[1]) {
      return JSON.parse(match[1]);
    }
  } catch (_) {}
  return {};
}

function stringifyTechSpecs(cleanNotes: string, specs: TechnicalSpecs): string {
  const stripped = cleanNotes.replace(/\[SPECS_JSON:(.+?)\]/s, '').trim();
  const jsonStr = JSON.stringify(specs);
  return stripped ? `${stripped}\n\n[SPECS_JSON:${jsonStr}]` : `[SPECS_JSON:${jsonStr}]`;
}

function emptyEqForm() {
  return {
    code: '',
    name: '',
    brand: '',
    model: '',
    manufactureYear: '',
    serialNumber: '',
    equipFamily: 'envase_producao',
    subType: '',
    location: '',
    supplier: '',
    acquiredAt: '',
    purchaseValue: '',
    sector: '',
    status: 'em_operacao',
    maintenanceIntervalDays: '',
    nextMaintenanceAt: '',
    notes: '',
    pecaCodes: [] as string[],
    // Specs
    specs: {
      criticality: 'media' as const,
    } as TechnicalSpecs,
  };
}

export default function EquipamentosView({
  onBackToHub,
  initialEquipmentId,
  focusTicket = 0,
  onOpenMaintenance,
}: Props) {
  const [statusFiltro, setStatusFiltro] = useState<'todos' | 'ativos' | 'manutencao' | 'baixados'>('todos');
  const [selectedFamily, setSelectedFamily] = useState<string>('todas');
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [pecasCatalog, setPecasCatalog] = useState<AlmoxOpsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Equipment | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('dados');
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

  const [eqDemands, setEqDemands] = useState<Demand[]>([]);
  const [pecaDemandModal, setPecaDemandModal] = useState<{
    open: boolean;
    itemCode?: string;
    description?: string;
  } | null>(null);
  const [pecaDemandForm, setPecaDemandForm] = useState({
    itemCode: '',
    description: '',
    qty: '1',
    urgency: 'normal',
    requestedBy: '',
    notes: '',
  });

  const loadDemandsForEq = useCallback(async (eqId: string, eqCode?: string) => {
    try {
      const res = await apiJson<{ demands: Demand[] }>('/almox/demands');
      const filtered = (res.demands ?? []).filter(
        (d) => d.equipmentId === eqId || (eqCode && d.equipmentName && d.equipmentName.includes(eqCode))
      );
      setEqDemands(filtered);
    } catch {
      setEqDemands([]);
    }
  }, []);

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
      setError(e instanceof Error ? e.message : 'Não foi possível carregar os equipamentos.');
    } finally {
      setLoading(false);
    }
  }, [loadPark]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailTab('dados');
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
      void loadDemandsForEq(id, eqRes.equipment.code);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao abrir o equipamento');
    } finally {
      setDetailLoading(false);
    }
  }, [loadDemandsForEq]);

  const openPecaDemand = (itemCode?: string, description?: string) => {
    setPecaDemandForm({
      itemCode: itemCode || '',
      description: description || '',
      qty: '1',
      urgency: 'normal',
      requestedBy: '',
      notes: '',
    });
    setPecaDemandModal({ open: true, itemCode, description });
  };

  const submitPecaDemand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    if (!pecaDemandForm.description.trim()) {
      setError('Informe o item ou peça a ser solicitada.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        title: pecaDemandForm.description.trim(),
        qty: Number(pecaDemandForm.qty) || 1,
        requestedBy: pecaDemandForm.requestedBy.trim() || 'Manutenção',
        notes: pecaDemandForm.notes ? `[Equipamento: ${detail.code} - ${detail.name}] ${pecaDemandForm.notes}` : `[Equipamento: ${detail.code} - ${detail.name}]`,
        origin: 'manutencao',
        urgency: pecaDemandForm.urgency,
        sector: detail.sector || null,
        equipmentId: detail.id,
        equipmentName: `${detail.code} - ${detail.name}`,
        items: pecaDemandForm.itemCode
          ? [{
              itemCode: pecaDemandForm.itemCode,
              description: pecaDemandForm.description.trim(),
              qtyRequested: Number(pecaDemandForm.qty) || 1,
            }]
          : [],
      };
      await apiJson('/almox/demands', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setPecaDemandModal(null);
      await loadDemandsForEq(detail.id, detail.code);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao solicitar compra de peça');
    } finally {
      setBusy(false);
    }
  };

  const closeDetail = () => {
    setSelectedId(null);
    setDetail(null);
    setFotos([]);
    setEqDemands([]);
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return equipments.filter((e) => {
      // Filtro de status
      if (statusFiltro === 'ativos' && e.status !== 'em_operacao' && e.status !== 'ativo') return false;
      if (statusFiltro === 'manutencao' && e.status !== 'em_manutencao') return false;
      if (statusFiltro === 'baixados' && e.status !== 'parado' && e.status !== 'baixado' && e.status !== 'inativo') return false;

      // Filtro de família
      if (selectedFamily !== 'todas') {
        const fam = detectEquipmentFamily(e);
        if (fam !== selectedFamily) return false;
      }

      if (!term) return true;
      return [e.name, e.code, e.brand, e.model, e.sector, e.serialNumber, e.equipType, e.location, e.notes]
        .map((v) => (v || '').toLowerCase())
        .some((v) => v.includes(term));
    });
  }, [equipments, q, statusFiltro, selectedFamily]);

  const stats = useMemo(() => {
    const total = equipments.length;
    const operating = equipments.filter((e) => e.status === 'em_operacao' || e.status === 'ativo').length;
    const inMaint = equipments.filter((e) => e.status === 'em_manutencao').length;
    const spent = equipments.reduce((acc, e) => acc + (e.totalSpent || 0), 0);
    const open = maintenances.filter((m) => m.status === 'pendente' || m.status === 'em_andamento').length;

    // Contagem por família
    const byFamily: Record<string, number> = {};
    for (const eq of equipments) {
      const fam = detectEquipmentFamily(eq);
      byFamily[fam] = (byFamily[fam] || 0) + 1;
    }

    return { total, operating, inMaint, spent, open, byFamily };
  }, [equipments, maintenances]);

  useEffect(() => {
    if (initialEquipmentId) void openDetail(initialEquipmentId);
  }, [initialEquipmentId, focusTicket, openDetail]);

  const eqMaints = useMemo(
    () => maintenances.filter((m) => m.equipmentId === selectedId),
    [maintenances, selectedId]
  );

  const saveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const fullNotes = stringifyTechSpecs(eqForm.notes, eqForm.specs);
    const equipTypeCombined = eqForm.subType
      ? `${eqForm.equipFamily}:${eqForm.subType}`
      : eqForm.equipFamily;

    const body = {
      code: eqForm.code.trim(),
      name: eqForm.name.trim(),
      brand: eqForm.brand.trim() || null,
      model: eqForm.model.trim() || null,
      manufactureYear: eqForm.manufactureYear ? Number(eqForm.manufactureYear) : null,
      serialNumber: eqForm.serialNumber.trim() || null,
      equipType: equipTypeCombined,
      location: eqForm.location.trim() || null,
      supplier: eqForm.supplier.trim() || null,
      acquiredAt: eqForm.acquiredAt || null,
      purchaseValue: eqForm.purchaseValue ? Number(eqForm.purchaseValue) : null,
      sector: eqForm.sector.trim() || null,
      status: eqForm.status,
      maintenanceIntervalDays: eqForm.maintenanceIntervalDays
        ? Number(eqForm.maintenanceIntervalDays)
        : null,
      nextMaintenanceAt: eqForm.nextMaintenanceAt || null,
      notes: fullNotes,
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
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar o equipamento.');
    } finally {
      setBusy(false);
    }
  };

  const saveFromDetail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    setError(null);

    const fullNotes = stringifyTechSpecs(eqForm.notes, eqForm.specs);
    const equipTypeCombined = eqForm.subType
      ? `${eqForm.equipFamily}:${eqForm.subType}`
      : eqForm.equipFamily;

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
          equipType: equipTypeCombined,
          location: eqForm.location.trim() || null,
          supplier: eqForm.supplier.trim() || null,
          acquiredAt: eqForm.acquiredAt || null,
          purchaseValue: eqForm.purchaseValue ? Number(eqForm.purchaseValue) : null,
          sector: eqForm.sector.trim() || null,
          status: eqForm.status,
          maintenanceIntervalDays: eqForm.maintenanceIntervalDays
            ? Number(eqForm.maintenanceIntervalDays)
            : null,
          nextMaintenanceAt: eqForm.nextMaintenanceAt || null,
          notes: fullNotes,
          pecaCodes: eqForm.pecaCodes,
        }),
      });
      await loadPark();
      await openDetail(selectedId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar a ficha do equipamento.');
    } finally {
      setBusy(false);
    }
  };

  const openNewEq = () => {
    const f = emptyEqForm();
    if (selectedFamily !== 'todas') {
      f.equipFamily = selectedFamily;
    }
    setEqForm(f);
    setPendingPhoto(null);
    setEqModal(true);
  };

  const fillFormFromDetail = (eq: Equipment) => {
    const fam = detectEquipmentFamily(eq);
    const sub = (eq.equipType || '').includes(':') ? eq.equipType!.split(':')[1] : '';
    const cleanNotes = (eq.notes || '').replace(/\[SPECS_JSON:(.+?)\]/s, '').trim();
    const parsedSpecs = parseTechSpecs(eq.notes);

    setEqForm({
      code: eq.code || '',
      name: eq.name || '',
      brand: eq.brand || '',
      model: eq.model || '',
      manufactureYear: eq.manufactureYear != null ? String(eq.manufactureYear) : '',
      serialNumber: eq.serialNumber || '',
      equipFamily: fam,
      subType: sub,
      location: eq.location || '',
      supplier: eq.supplier || '',
      acquiredAt: eq.acquiredAt ? eq.acquiredAt.slice(0, 10) : '',
      purchaseValue: eq.purchaseValue != null ? String(eq.purchaseValue) : '',
      sector: eq.sector || '',
      status: eq.status === 'ativo' ? 'em_operacao' : eq.status || 'em_operacao',
      maintenanceIntervalDays:
        eq.maintenanceIntervalDays != null ? String(eq.maintenanceIntervalDays) : '',
      nextMaintenanceAt: eq.nextMaintenanceAt ? eq.nextMaintenanceAt.slice(0, 10) : '',
      notes: cleanNotes,
      pecaCodes: eq.pecaCodes || [],
      specs: parsedSpecs,
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
      scheduledAt: new Date().toISOString().slice(0, 10),
      consumeStock: false,
    });
    setMtParts([]);
    setMtModal(true);
  };

  const saveMt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mtForm.equipmentId) return;
    setBusy(true);
    setError(null);
    try {
      const partsPayload = mtParts.map((p) => {
        const item = pecasCatalog.find((x) => x.code === p.itemCode);
        return {
          itemCode: p.itemCode,
          description: item?.description || p.itemCode,
          quantity: Number(p.quantity) || 1,
          replaced: p.replaced,
        };
      });
      await apiJson('/almox/maintenances', {
        method: 'POST',
        body: JSON.stringify({
          equipmentId: mtForm.equipmentId,
          kind: mtForm.kind,
          status: mtForm.status,
          routine: mtForm.routine || null,
          technician: mtForm.technician || null,
          cost: mtForm.cost ? Number(mtForm.cost) : null,
          notes: mtForm.notes || null,
          scheduledAt: mtForm.scheduledAt || null,
          consumeStock: mtForm.consumeStock,
          parts: partsPayload,
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

  const updateMaintStatus = async (maintId: string, status: string) => {
    setBusy(true);
    try {
      await apiJson(`/almox/maintenances/${encodeURIComponent(maintId)}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      await loadPark();
      if (selectedId) await openDetail(selectedId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar manutenção');
    } finally {
      setBusy(false);
    }
  };

  const handlePhotoFile = (file: File, forDetail: boolean) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = reader.result as string;
      if (forDetail && selectedId) {
        try {
          await apiJson(`/almox/fotos/equipment/${encodeURIComponent(selectedId)}`, {
            method: 'POST',
            body: JSON.stringify({ photoData: b64, notes: file.name }),
          });
          await openDetail(selectedId);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'Erro ao enviar foto');
        }
      } else {
        setPendingPhoto(b64);
      }
    };
    reader.readAsDataURL(file);
  };

  const deleteFoto = async (fotoId: string) => {
    try {
      await apiJson(`/almox/fotos/${encodeURIComponent(fotoId)}`, { method: 'DELETE' });
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

  const abrirManutencao = (equipmentId: string) => {
    if (onOpenMaintenance) {
      onOpenMaintenance(equipmentId);
      return;
    }
    openMt(equipmentId);
  };

  const sidebarItems = [
    { id: 'todos', label: 'Todos os Equipamentos', icon: Wrench, badge: stats.total || undefined },
    { id: 'ativos', label: 'Operacionais', icon: CheckCircle2, badge: stats.operating || undefined },
    { id: 'manutencao', label: 'Em Manutenção', icon: ClipboardList, badge: stats.inMaint || undefined },
    { id: 'baixados', label: 'Baixados / Inativos', icon: AlertTriangle },
  ];

  return (
    <AppLayout
      moduleTitle="Parque de Equipamentos"
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={statusFiltro}
      onTabChange={(id) => {
        closeDetail();
        setStatusFiltro(id as 'todos' | 'ativos' | 'manutencao' | 'baixados');
      }}
      headerActions={
        <div className="flex items-center gap-2">
          {selectedId && (
            <button
              type="button"
              onClick={() => abrirManutencao(selectedId)}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 cursor-pointer shadow-xs"
            >
              <Wrench className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nova Manutenção</span>
            </button>
          )}
          <button
            type="button"
            onClick={openNewEq}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white cursor-pointer shadow-xs"
          >
            <Plus className="h-4 w-4" />
            Novo Equipamento
          </button>
          <button
            type="button"
            onClick={() => refresh()}
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
          <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold px-4 py-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
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
            eqDemands={eqDemands}
            detailTab={detailTab}
            setDetailTab={setDetailTab}
            onBack={closeDetail}
            onSaveFicha={saveFromDetail}
            onPhoto={(file) => handlePhotoFile(file, true)}
            onDeleteFoto={deleteFoto}
            onTogglePeca={togglePecaAssoc}
            onNewOs={() => abrirManutencao(selectedId)}
            onUpdateMaint={updateMaintStatus}
            onOpenPecaDemand={openPecaDemand}
          />
        ) : (
          <>
            {/* Navegação e Filtro por Família (Scroll horizontal no mobile) */}
            <div className="bg-white rounded-2xl p-3 border border-zinc-200 shadow-xs space-y-3">
              <ReportTabs
                abas={EQUIPMENT_FAMILIES.map((fam) => {
                  const Icon = fam.icon;
                  return {
                    id: fam.id,
                    label: fam.label,
                    icone: <Icon size={14} />,
                    contagem: fam.id === 'todas' ? stats.total : stats.byFamily[fam.id] || 0,
                  };
                })}
                ativa={selectedFamily}
                onChange={(id) => setSelectedFamily(id as typeof selectedFamily)}
              />

              {/* Busca Rápida */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar equipamento por nome, código, marca, modelo, setor ou IP..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 text-sm bg-zinc-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11"
                />
              </div>
            </div>

            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3 bg-white border border-zinc-200 rounded-2xl">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-700" />
                <span className="text-xs font-semibold text-zinc-500">Carregando catálogo de equipamentos...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center text-zinc-400 space-y-2">
                <Wrench className="h-8 w-8 mx-auto text-zinc-300" />
                <p className="text-sm font-semibold">Nenhum equipamento encontrado para os filtros selecionados.</p>
                <p className="text-xs text-zinc-400">Tente alterar a família ou o termo de busca.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((eq) => {
                  const st = statusMeta(eq.status);
                  const famKey = detectEquipmentFamily(eq);
                  const famMeta = EQUIPMENT_FAMILIES.find((f) => f.id === famKey);
                  const FamIcon = famMeta?.icon || Wrench;
                  const specs = parseTechSpecs(eq.notes);

                  // Verificação de manutenção preventiva
                  const nextMaint = eq.nextMaintenanceAt ? new Date(eq.nextMaintenanceAt) : null;
                  const isMaintLate = nextMaint && nextMaint < new Date();

                  return (
                    <div
                      key={eq.id}
                      onClick={() => openDetail(eq.id)}
                      className="bg-white border border-zinc-200 hover:border-zinc-400 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                    >
                      <div>
                        {/* Imagem de Capa ou Placeholder Temático */}
                        <div className="aspect-[16/9] bg-zinc-100 relative overflow-hidden flex items-center justify-center">
                          {eq.coverPhoto ? (
                            <img src={eq.coverPhoto} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="flex flex-col items-center justify-center text-zinc-400 gap-1.5 p-4">
                              <FamIcon className="h-10 w-10 text-zinc-300" />
                              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                                {famMeta?.label || 'Equipamento'}
                              </span>
                            </div>
                          )}

                          {/* Status Badge */}
                          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border shadow-xs ${st.cls}`}>
                              {st.label}
                            </span>
                          </div>

                          {/* Tag de Família */}
                          <div className="absolute top-2.5 right-2.5">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/60 text-white backdrop-blur-xs">
                              {famMeta?.label || 'Equipamento'}
                            </span>
                          </div>
                        </div>

                        {/* Conteúdo do Card */}
                        <div className="p-4 space-y-2.5">
                          <div>
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono text-xs font-bold text-zinc-400">{eq.code}</span>
                              {eq.sector && (
                                <span className="text-[11px] font-semibold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-md">
                                  {eq.sector}
                                </span>
                              )}
                            </div>
                            <h3 className="font-bold text-base text-zinc-900 leading-snug mt-0.5 line-clamp-1">{eq.name}</h3>
                            <p className="text-xs text-zinc-500 truncate">
                              {[eq.brand, eq.model].filter(Boolean).join(' · ') || 'Sem marca/modelo'}
                            </p>
                          </div>

                          {/* Tags Específicas da Família */}
                          <div className="flex flex-wrap gap-1.5 text-[11px]">
                            {famKey === 'ti_computadores' && specs.ipAddress && (
                              <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-mono font-semibold">
                                IP: {specs.ipAddress}
                              </span>
                            )}
                            {famKey === 'ti_computadores' && specs.hostname && (
                              <span className="bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded font-mono">
                                {specs.hostname}
                              </span>
                            )}
                            {famKey === 'envase_producao' && specs.voltage && (
                              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold">
                                ⚡ {specs.voltage}
                              </span>
                            )}
                            {famKey === 'envase_producao' && specs.capacity && (
                              <span className="bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded">
                                Cap: {specs.capacity}
                              </span>
                            )}
                            {specs.criticality === 'alta' && (
                              <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded font-bold border border-rose-200">
                                Criticidade Alta
                              </span>
                            )}
                          </div>

                          {/* Alerta de Manutenção */}
                          {eq.nextMaintenanceAt && (
                            <div
                              className={`text-[11px] font-bold px-2.5 py-1.5 rounded-xl border flex items-center justify-between ${
                                isMaintLate
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-zinc-50 text-zinc-600 border-zinc-200'
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                                {isMaintLate ? 'Preventiva Vencida:' : 'Próx. Preventiva:'}
                              </span>
                              <span>{formatDate(eq.nextMaintenanceAt)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Footer do Card */}
                      <div className="px-4 py-2.5 bg-zinc-50/70 border-t border-zinc-100 flex items-center justify-between text-xs">
                        <span className="text-zinc-500 font-medium">
                          Gasto: <strong className="text-zinc-800">{formatMoney(eq.totalSpent || 0)}</strong>
                        </span>
                        <span className="font-bold text-zinc-900 flex items-center gap-0.5">
                          Ver Ficha <ChevronRight className="h-4 w-4 text-zinc-400" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Modal de Cadastro de Novo Equipamento */}
        {eqModal && (
          <Modal
            isOpen={eqModal}
            onClose={() => setEqModal(false)}
            title="Cadastrar Novo Equipamento"
          >
            <form onSubmit={saveEquipment} className="space-y-4">
              <PhotoPicker
                preview={pendingPhoto}
                onFile={(file) => handlePhotoFile(file, false)}
              />

              <EqFields
                form={eqForm}
                setForm={setEqForm}
                pecasCatalog={pecasCatalog}
                onTogglePeca={togglePecaAssoc}
              />

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setEqModal(false)}
                  className="px-4 py-2.5 text-xs font-bold rounded-xl border border-zinc-200 hover:bg-zinc-50 cursor-pointer min-h-11"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy || !eqForm.name.trim() || !eqForm.code.trim()}
                  className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 min-h-11 shadow-xs"
                >
                  Salvar Equipamento
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Modal de Registro de Ordem de Manutenção */}
        {mtModal && (
          <Modal
            isOpen={mtModal}
            onClose={() => setMtModal(false)}
            title="Registrar Manutenção"
          >
            <form onSubmit={saveMt} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Tipo de Manutenção</span>
                  <select
                    value={mtForm.kind}
                    onChange={(e) => setMtForm((f) => ({ ...f, kind: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  >
                    <option value="preventiva">Preventiva</option>
                    <option value="corretiva">Corretiva</option>
                    <option value="calibracao">Calibração</option>
                    <option value="inspecao">Inspeção</option>
                    <option value="preditiva">Preditiva</option>
                  </select>
                </label>
                <label className="space-y-1 block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Status</span>
                  <select
                    value={mtForm.status}
                    onChange={(e) => setMtForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  >
                    <option value="pendente">Pendente</option>
                    <option value="em_andamento">Em Andamento</option>
                    <option value="concluida">Concluída</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Data Realizada / Prevista</span>
                  <input
                    type="date"
                    value={mtForm.scheduledAt}
                    onChange={(e) => setMtForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Rotina / Plano</span>
                  <select
                    value={mtForm.routine}
                    onChange={(e) => setMtForm((f) => ({ ...f, routine: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  >
                    <option value="">Rotina Avulsa</option>
                    <option value="calibragem">Calibração Periódica</option>
                    <option value="limpeza">Higienização e Limpeza</option>
                    <option value="lubrificacao">Lubrificação Geral</option>
                    <option value="inspecao">Inspeção Mecânica/Elétrica</option>
                  </select>
                </label>
              </div>

              {/* Peças e Sobressalentes */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Peças Utilizadas nesta O.S.</span>
                <div className="border border-zinc-200 rounded-xl max-h-44 overflow-y-auto bg-zinc-50/50 divide-y divide-zinc-100">
                  {pecasCatalog.length === 0 ? (
                    <p className="text-xs text-zinc-400 p-3 italic">Nenhuma peça cadastrada no catálogo de peças.</p>
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
                            <p className="font-mono text-[10px] text-zinc-400">{p.code} · Saldo: {p.qtyOnHand} {p.unit}</p>
                          </div>
                          {row && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <label className="flex items-center gap-1 text-[10px] font-bold text-zinc-600">
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
                                min="0.01"
                                step="any"
                                value={row.quantity}
                                onChange={(e) =>
                                  setMtParts((prev) =>
                                    prev.map((x) =>
                                      x.itemCode === p.code ? { ...x, quantity: e.target.value } : x
                                    )
                                  )
                                }
                                className="w-16 rounded-lg border border-zinc-200 px-2 py-1 text-xs text-center font-bold"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={mtForm.consumeStock}
                    onChange={(e) => setMtForm((f) => ({ ...f, consumeStock: e.target.checked }))}
                    className="rounded border-zinc-300"
                  />
                  <span>Dar baixa automática no saldo do almoxarifado para as peças trocadas</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Técnico / Responsável</span>
                  <input
                    value={mtForm.technician}
                    onChange={(e) => setMtForm((f) => ({ ...f, technician: e.target.value }))}
                    placeholder="Nome do operador ou empresa"
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Custo Total (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={mtForm.cost}
                    onChange={(e) => setMtForm((f) => ({ ...f, cost: e.target.value }))}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </label>
              </div>

              <label className="space-y-1 block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Descrição do Serviço / Ocorrência</span>
                <textarea
                  value={mtForm.notes}
                  onChange={(e) => setMtForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  placeholder="Descreva o que foi inspecionado, peças ajustadas, anomalias encontradas..."
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setMtModal(false)}
                  className="px-4 py-2.5 text-xs font-bold rounded-xl border border-zinc-200 hover:bg-zinc-50 cursor-pointer min-h-11"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 min-h-11 shadow-xs"
                >
                  Salvar Ordem de Manutenção
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Modal de Solicitação de Peça para Compras */}
        {pecaDemandModal?.open && detail && (
          <Modal
            isOpen={pecaDemandModal.open}
            onClose={() => setPecaDemandModal(null)}
            title="Solicitar Peça de Reposição para Compras"
          >
            <form onSubmit={(e) => void submitPecaDemand(e)} className="space-y-4">
              <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Equipamento de Destino</span>
                <p className="font-bold text-sm text-zinc-900">{detail.code} — {detail.name}</p>
                {detail.sector && <p className="text-xs text-zinc-500">Setor: {detail.sector}</p>}
              </div>

              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Item / Peça de Reposição *
                </span>
                <input
                  required
                  value={pecaDemandForm.description}
                  onChange={(e) => setPecaDemandForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Ex: Rolamento 6204 DDU, Mangueira PU 8mm, Sensor Óptico..."
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-semibold"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Quantidade *</span>
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    required
                    value={pecaDemandForm.qty}
                    onChange={(e) => setPecaDemandForm((f) => ({ ...f, qty: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-bold"
                  />
                </label>

                <label className="space-y-1 block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Urgência</span>
                  <select
                    value={pecaDemandForm.urgency}
                    onChange={(e) => setPecaDemandForm((f) => ({ ...f, urgency: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-semibold"
                  >
                    <option value="baixa">🟢 Baixa (Estoque)</option>
                    <option value="normal">🟡 Normal (Reposição)</option>
                    <option value="alta">🟠 Alta (Máquina em risco)</option>
                    <option value="critica">🔴 Crítica (MÁQUINA PARADA)</option>
                  </select>
                </label>
              </div>

              <label className="space-y-1 block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Solicitante *</span>
                <input
                  required
                  value={pecaDemandForm.requestedBy}
                  onChange={(e) => setPecaDemandForm((f) => ({ ...f, requestedBy: e.target.value }))}
                  placeholder="Nome do técnico ou operador solicitante"
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Motivo / Justificativa / Especificações
                </span>
                <textarea
                  value={pecaDemandForm.notes}
                  onChange={(e) => setPecaDemandForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Descreva por que a peça é necessária, se quebrou ou é preventiva..."
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setPecaDemandModal(null)}
                  className="px-4 py-2.5 text-xs font-bold rounded-xl border border-zinc-200 hover:bg-zinc-50 cursor-pointer min-h-11"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 min-h-11 shadow-xs"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Enviar para a Fila de Compras
                </button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </AppLayout>
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
  const currentFamily = form.equipFamily;
  const subtypes = SUGGESTED_SUBTYPES[currentFamily] || [];

  const updateSpec = (key: keyof TechnicalSpecs, val: any) => {
    setForm((f) => ({
      ...f,
      specs: {
        ...f.specs,
        [key]: val,
      },
    }));
  };

  return (
    <div className="space-y-4">
      {/* 1. Classificação e Família */}
      <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200/80 space-y-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block flex items-center gap-1.5">
          <Factory className="h-4 w-4 text-zinc-500" /> 1. Classificação e Família
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Família / Categoria *</span>
            <select
              value={form.equipFamily}
              onChange={(e) => setForm((f) => ({ ...f, equipFamily: e.target.value, subType: '' }))}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white font-bold text-zinc-900 min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >
              <option value="envase_producao">🏭 Máquinas e Envase</option>
              <option value="ti_computadores">💻 TI e Computadores</option>
              <option value="laboratorio">🧪 Laboratório e CQ</option>
              <option value="utilidades_infra">⚡ Utilidades e Infraestrutura</option>
              <option value="logistica">🚚 Logística e Carga</option>
              <option value="predial_geral">🔧 Geral e Predial</option>
            </select>
          </label>

          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Subtipo / Classificação</span>
            <input
              list="subtypes-list"
              value={form.subType}
              onChange={(e) => setForm((f) => ({ ...f, subType: e.target.value }))}
              placeholder="Ex: Envasadora Automática..."
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
            <datalist id="subtypes-list">
              {subtypes.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
        </div>
      </div>

      {/* 2. Identificação Principal */}
      <div className="bg-white p-4 rounded-2xl border border-zinc-200 space-y-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block flex items-center gap-1.5">
          <Info className="h-4 w-4 text-zinc-500" /> 2. Identificação Principal
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Código de Controle *</span>
            <input
              required
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="Ex: ENV-01, TI-PC-04"
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm font-bold bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </label>

          <label className="space-y-1 block sm:col-span-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Nome do Equipamento *</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Envasadora Linear 4 Bicos"
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Status</span>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-semibold"
            >
              <option value="em_operacao">Operacional</option>
              <option value="em_manutencao">Em Manutenção</option>
              <option value="parado">Baixado / Parado</option>
            </select>
          </label>

          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Criticidade</span>
            <select
              value={form.specs.criticality || 'media'}
              onChange={(e) => updateSpec('criticality', e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-semibold"
            >
              <option value="alta">🔴 Alta (Linha Para)</option>
              <option value="media">🟡 Média</option>
              <option value="baixa">🟢 Baixa</option>
            </select>
          </label>

          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Setor</span>
            <input
              value={form.sector}
              onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
              placeholder="Ex: Produção, Lab"
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Localização Física</span>
            <input
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="Ex: Linha 1, Sala TI"
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Marca / Fabricante</span>
            <input
              value={form.brand}
              onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
              placeholder="Ex: Dell, Zebra, DosaPack"
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Modelo</span>
            <input
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              placeholder="Ex: OptiPlex 7080, ZT411"
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Nº de Série / Patrimônio</span>
            <input
              value={form.serialNumber}
              onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
              placeholder="Ex: SN-9823471"
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono"
            />
          </label>
        </div>
      </div>

      {/* 3. Especificações Técnicas Especializadas por Família */}
      {currentFamily === 'ti_computadores' && (
        <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-200/80 space-y-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-800 block flex items-center gap-1.5">
            <Laptop className="h-4 w-4 text-indigo-700" /> 3. Especificações de Informática / TI
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Hostname / Nome de Rede</span>
              <input
                value={form.specs.hostname || ''}
                onChange={(e) => updateSpec('hostname', e.target.value)}
                placeholder="Ex: PRODUCAO-PC01"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Endereço IP</span>
              <input
                value={form.specs.ipAddress || ''}
                onChange={(e) => updateSpec('ipAddress', e.target.value)}
                placeholder="Ex: 192.168.1.150"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Usuário / Operador Atribuído</span>
              <input
                value={form.specs.assignedUser || ''}
                onChange={(e) => updateSpec('assignedUser', e.target.value)}
                placeholder="Ex: Operador Envase 01"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Processador (CPU)</span>
              <input
                value={form.specs.cpu || ''}
                onChange={(e) => updateSpec('cpu', e.target.value)}
                placeholder="Ex: Core i5 10ª Ger"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Memória RAM</span>
              <input
                value={form.specs.ram || ''}
                onChange={(e) => updateSpec('ram', e.target.value)}
                placeholder="Ex: 16 GB DDR4"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Armazenamento</span>
              <input
                value={form.specs.storage || ''}
                onChange={(e) => updateSpec('storage', e.target.value)}
                placeholder="Ex: 512 GB SSD NVMe"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Sistema Operacional</span>
              <input
                value={form.specs.os || ''}
                onChange={(e) => updateSpec('os', e.target.value)}
                placeholder="Ex: Windows 11 Pro"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </label>
          </div>
        </div>
      )}

      {currentFamily === 'envase_producao' && (
        <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-200/80 space-y-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 block flex items-center gap-1.5">
            <Factory className="h-4 w-4 text-blue-700" /> 3. Especificações de Máquinas e Envase
          </span>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Capacidade Nominal</span>
              <input
                value={form.specs.capacity || ''}
                onChange={(e) => updateSpec('capacity', e.target.value)}
                placeholder="Ex: 2.000 frascos/h"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Tensão / Alimentação</span>
              <input
                value={form.specs.voltage || ''}
                onChange={(e) => updateSpec('voltage', e.target.value)}
                placeholder="Ex: 220V Trifásico, 380V"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Pressão de Ar</span>
              <input
                value={form.specs.pressure || ''}
                onChange={(e) => updateSpec('pressure', e.target.value)}
                placeholder="Ex: 6 bar / 90 psi"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Potência (kW / CV)</span>
              <input
                value={form.specs.power || ''}
                onChange={(e) => updateSpec('power', e.target.value)}
                placeholder="Ex: 4.5 kW"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </label>
          </div>
        </div>
      )}

      {currentFamily === 'laboratorio' && (
        <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200/80 space-y-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block flex items-center gap-1.5">
            <FlaskConical className="h-4 w-4 text-emerald-700" /> 3. Especificações e Calibração de Laboratório
          </span>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Faixa de Medição</span>
              <input
                value={form.specs.measuringRange || ''}
                onChange={(e) => updateSpec('measuringRange', e.target.value)}
                placeholder="Ex: 0 a 14 pH, 10-200000 cP"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Resolução / Precisão</span>
              <input
                value={form.specs.resolution || ''}
                onChange={(e) => updateSpec('resolution', e.target.value)}
                placeholder="Ex: 0.01 pH, 0.001g"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Nº Certificado RBC</span>
              <input
                value={form.specs.calibrationCert || ''}
                onChange={(e) => updateSpec('calibrationCert', e.target.value)}
                placeholder="Ex: CERT-2026/8912"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Validade da Calibração</span>
              <input
                type="date"
                value={form.specs.calibrationValidUntil || ''}
                onChange={(e) => updateSpec('calibrationValidUntil', e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </label>
          </div>
        </div>
      )}

      {/* 4. Plano de Manutenção Preventiva */}
      <div className="bg-white p-4 rounded-2xl border border-zinc-200 space-y-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block flex items-center gap-1.5">
          <CalendarClock className="h-4 w-4 text-zinc-500" /> 4. Plano de Manutenção Preventiva
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Intervalo de Revisão (Dias)</span>
            <input
              type="number"
              value={form.maintenanceIntervalDays}
              onChange={(e) => setForm((f) => ({ ...f, maintenanceIntervalDays: e.target.value }))}
              placeholder="Ex: 30, 90, 180..."
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Próxima Manutenção Preventiva</span>
            <input
              type="date"
              value={form.nextMaintenanceAt}
              onChange={(e) => setForm((f) => ({ ...f, nextMaintenanceAt: e.target.value }))}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </label>
        </div>
      </div>

      {/* 5. Dados Patrimoniais e Aquisição */}
      <div className="bg-white p-4 rounded-2xl border border-zinc-200 space-y-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block flex items-center gap-1.5">
          <Package className="h-4 w-4 text-zinc-500" /> 5. Aquisição e Garantia
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Data de Aquisição</span>
            <input
              type="date"
              value={form.acquiredAt}
              onChange={(e) => setForm((f) => ({ ...f, acquiredAt: e.target.value }))}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Valor de Compra (R$)</span>
            <input
              type="number"
              step="0.01"
              value={form.purchaseValue}
              onChange={(e) => setForm((f) => ({ ...f, purchaseValue: e.target.value }))}
              placeholder="0.00"
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Fornecedor / Revendedor</span>
            <input
              value={form.supplier}
              onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
              placeholder="Ex: Nome do distribuidor"
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </label>
        </div>
      </div>

      {/* 6. Peças de Reposição Vinculadas */}
      <div className="bg-white p-4 rounded-2xl border border-zinc-200 space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block flex items-center gap-1.5">
          <Cog className="h-4 w-4 text-zinc-500" /> 6. Peças e Consumíveis Vinculados
        </span>
        <p className="text-xs text-zinc-500">Marque as peças do almoxarifado utilizadas para reposição deste equipamento.</p>

        {pecasCatalog.length === 0 ? (
          <p className="text-xs text-zinc-400 italic py-2">Nenhuma peça cadastrada no almoxarifado.</p>
        ) : (
          <div className="border border-zinc-200 rounded-xl p-3 max-h-44 overflow-y-auto space-y-1.5 bg-zinc-50/50">
            {pecasCatalog.map((p) => (
              <label key={p.code} className="flex items-start gap-2.5 text-xs font-semibold text-zinc-700 cursor-pointer hover:bg-zinc-100/60 p-1 rounded-lg">
                <input
                  type="checkbox"
                  checked={form.pecaCodes.includes(p.code)}
                  onChange={() => onTogglePeca(p.code)}
                  className="rounded border-zinc-300 mt-0.5"
                />
                <span className="flex-1">
                  <span className="font-bold text-zinc-900">{p.description}</span>
                  <span className="text-[11px] text-zinc-400 font-mono ml-2">({p.code})</span>
                  <span className="text-[11px] text-zinc-500 ml-2 font-normal">· Saldo: {p.qtyOnHand} {p.unit}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* 7. Observações Gerais */}
      <label className="block space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Observações Técnicas e Histórico</span>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={3}
          placeholder="Anotações gerais, orientações de uso, dados de garantia..."
          className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
      </label>
    </div>
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
  eqDemands,
  detailTab,
  setDetailTab,
  onBack,
  onSaveFicha,
  onPhoto,
  onDeleteFoto,
  onTogglePeca,
  onNewOs,
  onUpdateMaint,
  onOpenPecaDemand,
}: {
  detail: Equipment | null;
  loading: boolean;
  busy: boolean;
  fotos: { id: string; photoData: string; notes?: string | null }[];
  eqForm: ReturnType<typeof emptyEqForm>;
  setEqForm: React.Dispatch<React.SetStateAction<ReturnType<typeof emptyEqForm>>>;
  pecasCatalog: AlmoxOpsItem[];
  maintenances: Maintenance[];
  eqDemands: Demand[];
  detailTab: DetailTab;
  setDetailTab: (t: DetailTab) => void;
  onBack: () => void;
  onSaveFicha: (e: React.FormEvent) => void;
  onPhoto: (file: File) => void;
  onDeleteFoto: (id: string) => void;
  onTogglePeca: (code: string) => void;
  onNewOs: () => void;
  onUpdateMaint: (id: string, status: string) => void;
  onOpenPecaDemand: (itemCode?: string, description?: string) => void;
}) {
  const st = statusMeta(detail?.status);
  const famKey = detail ? detectEquipmentFamily(detail) : 'envase_producao';
  const famMeta = EQUIPMENT_FAMILIES.find((f) => f.id === famKey);
  const FamIcon = famMeta?.icon || Wrench;
  const spent = maintenances.reduce((acc, m) => acc + (m.cost || 0), 0);

  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'dados', label: 'Ficha Técnica' },
    { id: 'manutencoes', label: `Manutenções (${maintenances.length})` },
    { id: 'pecas', label: `Peças (${(detail?.pecas || []).length || detail?.pecaCodes?.length || 0})` },
    { id: 'fotos', label: `Fotos (${fotos.length})` },
  ];

  if (loading && !detail) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-zinc-500 text-sm bg-white border border-zinc-200 rounded-2xl">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-700" />
        Carregando ficha do equipamento...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-600 hover:text-zinc-900 bg-white border border-zinc-200 hover:bg-zinc-50 px-3 py-2 rounded-xl cursor-pointer shadow-xs"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para o Parque
        </button>

        <button
          type="button"
          onClick={onNewOs}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white cursor-pointer shadow-xs"
        >
          <Wrench className="h-3.5 w-3.5" />
          Registrar Manutenção
        </button>
      </div>

      {/* Header Card do Equipamento */}
      <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="grid md:grid-cols-[280px_1fr]">
          <div className="bg-zinc-100 min-h-[180px] relative flex items-center justify-center">
            {fotos[0]?.photoData || detail?.coverPhoto ? (
              <img
                src={fotos[0]?.photoData || detail?.coverPhoto || ''}
                alt=""
                className="w-full h-full object-cover min-h-[180px] max-h-64 md:max-h-none md:absolute inset-0"
              />
            ) : (
              <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-zinc-300 gap-2">
                <FamIcon className="h-12 w-12" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  {famMeta?.label}
                </span>
              </div>
            )}
          </div>

          <div className="p-5 sm:p-6 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${st.cls}`}>
                {st.label}
              </span>
              <span className="text-xs font-mono font-bold text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded-lg border border-zinc-200">
                {detail?.code}
              </span>
              <span className="text-xs font-bold text-zinc-600 bg-zinc-50 px-2.5 py-0.5 rounded-full border border-zinc-200">
                {famMeta?.label}
              </span>
            </div>

            <h2 className="text-2xl font-black text-zinc-900 tracking-tight">{detail?.name}</h2>
            <p className="text-sm text-zinc-600 font-semibold">
              {[detail?.brand, detail?.model, detail?.manufactureYear].filter(Boolean).join(' · ') ||
                'Marca e modelo não informados'}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs border-t border-zinc-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Setor / Local</span>
                <span className="font-bold text-zinc-800">{detail?.sector || detail?.location || '—'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Nº de Série</span>
                <span className="font-mono font-bold text-zinc-800">{detail?.serialNumber || '—'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Total Gasto em O.S.</span>
                <span className="font-bold text-zinc-900">{formatMoney(spent || detail?.totalSpent || 0)}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Próx. Preventiva</span>
                <span className="font-bold text-zinc-800">{formatDate(detail?.nextMaintenanceAt)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Abas de Navegação da Ficha */}
        <div className="px-5 border-t border-zinc-100 flex gap-2 overflow-x-auto bg-zinc-50/50">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setDetailTab(t.id)}
              className={`px-4 py-3 text-xs font-bold border-b-2 cursor-pointer transition-colors shrink-0 ${
                detailTab === t.id
                  ? 'border-zinc-900 text-zinc-900 bg-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo da Aba Selecionada */}
      {detailTab === 'dados' && (
        <form onSubmit={onSaveFicha} className="bg-white border border-zinc-200 rounded-2xl p-5 sm:p-6 space-y-4">
          <EqFields
            form={eqForm}
            setForm={setEqForm}
            pecasCatalog={pecasCatalog}
            onTogglePeca={onTogglePeca}
          />

          <div className="flex justify-end pt-3 border-t border-zinc-100">
            <button
              type="submit"
              disabled={busy}
              className="px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 min-h-11 shadow-xs"
            >
              Salvar Alterações da Ficha
            </button>
          </div>
        </form>
      )}

      {detailTab === 'manutencoes' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-zinc-200">
            <div>
              <h4 className="font-bold text-sm text-zinc-900">Histórico de Ordens de Serviço</h4>
              <p className="text-xs text-zinc-500">Todas as intervenções, calibrações e preventivas registradas para este equipamento.</p>
            </div>
            <button
              type="button"
              onClick={onNewOs}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white cursor-pointer shadow-xs shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova Manutenção
            </button>
          </div>

          {maintenances.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-2xl py-12 text-center text-sm text-zinc-400">
              Nenhuma ordem de serviço registrada para este equipamento.
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
                  <div key={m.id} className="bg-white border border-zinc-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${ms.cls}`}>
                          {ms.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${km.cls}`}>
                          {km.label}
                        </span>
                        {m.routine && (
                          <span className="text-xs font-bold text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded">
                            {m.routine}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono font-bold text-zinc-500">
                        {formatDate(m.scheduledAt || m.occurredAt)}
                      </span>
                    </div>

                    {m.notes && <p className="text-sm text-zinc-700 leading-relaxed">{m.notes}</p>}

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-zinc-100">
                      <div className="flex items-center gap-4 text-zinc-500">
                        {m.technician && <span>Técnico: <strong className="text-zinc-800">{m.technician}</strong></span>}
                        {m.cost != null && m.cost > 0 && <span>Custo: <strong className="text-zinc-900">{formatMoney(m.cost)}</strong></span>}
                      </div>

                      {m.status !== 'concluida' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onUpdateMaint(m.id, 'concluida')}
                          className="text-xs font-bold px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white cursor-pointer disabled:opacity-50"
                        >
                          Concluir Manutenção
                        </button>
                      )}
                    </div>

                    {parts.length > 0 && (
                      <div className="bg-zinc-50 rounded-xl p-3 space-y-1 text-xs">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Peças Aplicadas</span>
                        <div className="flex flex-wrap gap-2">
                          {parts.map((p) => (
                            <span key={p.itemCode} className="inline-flex items-center gap-1 bg-white border border-zinc-200 px-2 py-1 rounded-lg text-zinc-800 font-medium">
                              <Cog className="h-3 w-3 text-zinc-400" />
                              {p.description || p.itemCode} × {p.quantity} {p.replaced ? '(Trocada)' : ''}
                            </span>
                          ))}
                        </div>
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
        <div className="space-y-4">
          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-3 bg-zinc-50/50">
              <div>
                <h4 className="font-bold text-sm text-zinc-900">Peças de Reposição e Consumíveis Vinculados</h4>
                <p className="text-xs text-zinc-500">Saldo em tempo real no almoxarifado para reposições desta máquina.</p>
              </div>
              <button
                type="button"
                onClick={() => onOpenPecaDemand()}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white cursor-pointer shadow-xs shrink-0"
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                + Solicitar Peça para Compras
              </button>
            </div>

            {(detail?.pecas || []).length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-sm text-zinc-500">Nenhuma peça vinculada previamente a este equipamento.</p>
                <p className="text-xs text-zinc-400">Você pode solicitar peças novas pelo botão acima ou vinculá-las na aba "Ficha Técnica".</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {(detail?.pecas || []).map((p: EquipmentPecaStat) => (
                  <div key={p.itemCode} className="px-4 py-3.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-zinc-50/60">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-zinc-900">{p.description || p.itemCode}</p>
                      <p className="text-xs font-mono text-zinc-400">{p.itemCode}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {p.timesReplaced} troca(s) realizada(s)
                        {p.avgUsageDays != null ? ` · Ciclo médio de uso: ${Math.round(p.avgUsageDays)} dias` : ''}
                        {p.lastReplacedAt ? ` · Última troca: ${formatDate(p.lastReplacedAt)}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-base font-black text-zinc-900">
                          {p.qtyOnHand.toLocaleString('pt-BR')}
                        </p>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">em estoque</p>
                        {p.exchangeStatus === 'overdue' && (
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-rose-50 text-rose-700 border-rose-200">
                            <AlertTriangle className="h-3 w-3" /> Troca Vencida
                          </span>
                        )}
                        {p.exchangeStatus === 'due_soon' && (
                          <span className="inline-flex mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-amber-50 text-amber-700 border-amber-200">
                            Troca Próxima
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenPecaDemand(p.itemCode, p.description || p.itemCode)}
                        className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-800 cursor-pointer shadow-xs"
                        title="Pedir reposição desta peça para compras"
                      >
                        <ShoppingCart className="h-3.5 w-3.5 text-zinc-500" />
                        Pedir Peça
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fila de Compras e Reposições Solicitadas para esta Máquina */}
          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-zinc-900 flex items-center gap-1.5">
                  <ShoppingCart className="h-4 w-4 text-zinc-700" /> Fila de Compras desta Máquina ({eqDemands.length})
                </h4>
                <p className="text-xs text-zinc-500">Rastreabilidade de pedidos de peças e suprimentos para este equipamento.</p>
              </div>
            </div>

            {eqDemands.length === 0 ? (
              <p className="text-sm text-zinc-400 p-8 text-center italic">
                Nenhuma solicitação de compra aberta ou registrada para esta máquina.
              </p>
            ) : (
              <div className="divide-y divide-zinc-100">
                {eqDemands.map((d) => (
                  <div key={d.id} className="p-4 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-zinc-50/50">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-zinc-700 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded">
                          {d.trackingCode || 'SOL'}
                        </span>
                        <h5 className="font-bold text-sm text-zinc-900 truncate">{d.title}</h5>
                        <span className="text-xs font-bold text-zinc-500 bg-zinc-50 px-2 py-0.5 rounded border border-zinc-200">
                          Qtd: {d.qty ?? 1}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500">
                        Solicitado por <strong className="text-zinc-700">{d.requestedBy || 'Operador'}</strong> em {formatDate(d.createdAt)}
                        {d.urgency && d.urgency !== 'normal' && (
                          <span className={`ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            d.urgency === 'critica' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            Urgência {d.urgency}
                          </span>
                        )}
                      </p>
                      {d.notes && <p className="text-xs text-zinc-500 italic mt-0.5">Obs: {d.notes}</p>}
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border ${
                        d.status === 'recebida'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : d.status === 'comprada'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {d.status === 'recebida' ? '✓ Recebido no Almox.' : d.status === 'comprada' ? '🛒 Comprado (Trânsito)' : '⏳ Pendente de Compra'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {detailTab === 'fotos' && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-bold text-sm text-zinc-900">Fotos e Documentos Visuais</h4>
              <p className="text-xs text-zinc-500">Fotografe placas patrimoniais, componentes ou registros de avaria.</p>
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white cursor-pointer shadow-xs">
              <Camera className="h-3.5 w-3.5" />
              Adicionar Foto
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            {fotos.map((f) => (
              <div key={f.id} className="relative aspect-video rounded-xl overflow-hidden border border-zinc-200 group bg-zinc-100">
                <img src={f.photoData} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => onDeleteFoto(f.id)}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-rose-600 transition-colors cursor-pointer"
                  title="Excluir Foto"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                {f.notes && (
                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-2 py-1 truncate">
                    {f.notes}
                  </span>
                )}
              </div>
            ))}
            {fotos.length === 0 && (
              <div className="col-span-full py-12 text-center text-zinc-400 text-sm">
                Nenhuma foto cadastrada para este equipamento.
              </div>
            )}
          </div>
        </div>
      )}
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
    <label className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50/70 p-4 cursor-pointer hover:bg-zinc-100 transition-colors">
      {preview ? (
        <img src={preview} alt="" className="h-16 w-24 rounded-xl object-cover border border-zinc-200 shadow-xs" />
      ) : (
        <div className="h-16 w-24 rounded-xl bg-zinc-200/80 flex items-center justify-center">
          <Camera className="h-6 w-6 text-zinc-400" />
        </div>
      )}
      <div>
        <p className="text-xs font-bold text-zinc-900">Foto Principal do Equipamento</p>
        <p className="text-[11px] text-zinc-500">Clique para capturar pela câmera ou escolher da galeria.</p>
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

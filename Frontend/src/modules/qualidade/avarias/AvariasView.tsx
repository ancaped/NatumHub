import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, ClipboardCheck, ClipboardList, Files, Plus, RefreshCw, Search, X, Check, Filter } from 'lucide-react';
import AppLayout from '../../geral/components/layout/AppLayout';
import { getAuthUser } from '../../geral/lib/auth';
import { apiFetch, apiJson } from '../../geral/lib/http';
import { canEditView } from '../../geral/lib/modules/permissions';
import { cn } from '../../geral/lib/utils';
import AvariasFolhas from './AvariasFolhas';
import AvariasFicha from './AvariasFicha';

type Status = 'em_analise' | 'retorno_estoque' | 'reparo' | 'embalagem' | 'descarte' | 'outro';
type TabId = 'lista' | 'cadastro' | 'retorno' | 'controles';
type Filtro = Status | 'all';
type FiltroControle = 'all' | 'sem_controle' | 'com_controle';

type Avaria = {
  id: number;
  registerNumber: string;
  itemCode: string;
  description: string;
  lote: string;
  qty: number;
  location: string;
  status: Status;
  notes?: string | null;
  fotoPath?: string | null;
  createdBy?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  sheetNumber?: string | null;
  sheetStatus?: string | null;
  repairType?: string | null;
  problema?: string | null;
  encaminhamento?: string | null;
  fqNecessaria?: boolean;
  fqResultado?: string | null;
  fqObservacao?: string | null;
};

type ItemHit = {
  lote: string;
  productCode: string;
  description: string;
};

const STATUSES: { id: Status; label: string; short: string; subtitle: string; badge: string; tone: 'amber' | 'emerald' | 'blue' | 'rose' | 'zinc' }[] = [
  { id: 'em_analise', label: 'Em análise', short: 'Em análise', subtitle: 'Pendente CQ / Investigar', badge: 'aguardando', tone: 'amber' },
  { id: 'retorno_estoque', label: 'Retorno ao estoque', short: 'Retorno estoque', subtitle: 'Liberar / Troca de lote', badge: 'saudavel', tone: 'emerald' },
  { id: 'reparo', label: 'Reparo de embalagem', short: 'Reparo', subtitle: 'Troca de frasco / rótulo', badge: 'ordem', tone: 'blue' },
  { id: 'descarte', label: 'Descarte', short: 'Descarte', subtitle: 'Inutilização / Perda', badge: 'critico', tone: 'rose' },
];

const COLETA: { id: Status; label: string; short: string; hint: string }[] = [
  { id: 'retorno_estoque', label: 'Retorno ao estoque', short: 'Retorno / Troca', hint: 'Troca de lote ou liberar para expedição' },
  { id: 'reparo', label: 'Reparo de embalagem', short: 'Reparo', hint: 'Produto bom, trocar frasco ou rótulo' },
  { id: 'em_analise', label: 'Em análise CQ', short: 'Em análise', hint: 'Pendente de análise técnica ou decisão' },
  { id: 'descarte', label: 'Descarte', short: 'Descarte', hint: 'Inutilização física / Baixa de estoque' },
];

const LOCATIONS_CATALOG_KEY = 'avarias_catalog_locations';
const MOTIVOS_CATALOG_KEY = 'avarias_catalog_motivos';

const DEFAULT_LOCATIONS = [
  'Corredor da produção',
  'Doca expedição',
  'Bancada CQ',
  'Quarentena',
  'Armazém geral',
  'Triagem devolução',
  'Estoque produtos acabados',
];

const DEFAULT_MOTIVOS = [
  'Troca de lote',
  'Remarcar lote',
  'Troca de embalagem / frasco',
  'Troca de tampa / lacre',
  'Rótulo danificado',
  'Vazamento',
  'Devolução de cliente',
  'Pendente de análise CQ',
  'Produto vencido / validade',
  'Sobra de processo',
];

function loadCatalogList(key: string, defaults: string[]): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaults;
    const set = new Set<string>();
    const out: string[] = [];
    for (const item of [...defaults, ...parsed]) {
      const clean = String(item || '').trim();
      if (!clean) continue;
      const lower = clean.toLowerCase();
      if (!set.has(lower)) {
        set.add(lower);
        out.push(clean);
      }
    }
    return out;
  } catch {
    return defaults;
  }
}

function saveCatalogList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function CatalogSelect({
  label,
  value,
  options,
  onChange,
  onCreate,
  placeholder,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  onCreate: (raw: string) => void;
  placeholder: string;
  disabled?: boolean;
  hint?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    const raw = draft.trim();
    if (!raw) return;
    onCreate(raw);
    setDraft('');
    setOpen(false);
  };

  return (
    <div className="space-y-1">
      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{label}</span>
      <div className="flex gap-2">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 min-h-11 md:min-h-9 rounded-xl md:rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-900 outline-none focus:border-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-500"
        >
          <option value="">Selecionar {label.toLowerCase()}...</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          className="min-h-11 md:min-h-9 min-w-11 md:min-w-9 shrink-0 rounded-xl md:rounded-lg bg-zinc-900 hover:bg-black text-white text-lg font-bold flex items-center justify-center transition-colors disabled:opacity-50"
          title={`Adicionar novo(a) ${label}`}
          aria-label={`Adicionar ${label}`}
        >
          +
        </button>
      </div>
      {open && (
        <div className="flex gap-2 pt-1 animate-fadeIn">
          <input
            autoFocus
            type="text"
            value={draft}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                setOpen(false);
                setDraft('');
              }
            }}
            placeholder={placeholder}
            className="min-w-0 flex-1 min-h-11 md:min-h-9 rounded-xl md:rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-500"
          />
          <button
            type="button"
            disabled={disabled || !draft.trim()}
            onClick={commit}
            className="min-h-11 md:min-h-9 px-3 rounded-xl md:rounded-lg border border-zinc-200 bg-zinc-900 text-white text-xs font-bold hover:bg-black transition-colors disabled:opacity-40"
          >
            Ok
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setDraft('');
            }}
            className="min-h-11 md:min-h-9 px-2.5 rounded-xl md:rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 text-xs font-medium hover:bg-zinc-100 transition-colors"
          >
            Cancelar
          </button>
        </div>
      )}
      {hint}
    </div>
  );
}

function statusMeta(s: string) {
  if (s === 'embalagem') return STATUSES.find((x) => x.id === 'reparo') ?? STATUSES[0];
  return STATUSES.find((x) => x.id === s) ?? STATUSES[0];
}

async function shrinkPhoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.82);
    });
    if (!blob || blob.size === 0) return file;
    return new File([blob], 'foto.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

function fmtWhen(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const inputCls = 'w-full h-11 md:h-9 px-3 rounded-xl md:rounded-lg border border-zinc-200 bg-white text-base md:text-sm text-zinc-900 outline-none focus:border-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-500';

export default function AvariasView({ onBackToHub }: { onBackToHub: () => void }) {
  const canEdit = canEditView(getAuthUser(), 'qualidade_avarias');
  const [tab, setTab] = useState<TabId>('lista');
  const [rows, setRows] = useState<Avaria[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const itemQueryRef = useRef<HTMLInputElement>(null);
  const [filtro, setFiltro] = useState<Filtro>('all');
  const [filtroControle, setFiltroControle] = useState<FiltroControle>('all');
  const [filtroLocal, setFiltroLocal] = useState<string>('all');
  const [busca, setBusca] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [registerNumber, setRegisterNumber] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [description, setDescription] = useState('');
  const [lote, setLote] = useState('');
  const [qty, setQty] = useState('1');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState<Status>('retorno_estoque');
  const [notes, setNotes] = useState('');
  const [motivoRapido, setMotivoRapido] = useState('');
  const [locationsCatalog, setLocationsCatalog] = useState<string[]>(() => loadCatalogList(LOCATIONS_CATALOG_KEY, DEFAULT_LOCATIONS));
  const [motivosCatalog, setMotivosCatalog] = useState<string[]>(() => loadCatalogList(MOTIVOS_CATALOG_KEY, DEFAULT_MOTIVOS));
  const [hasPhoto, setHasPhoto] = useState(false);
  const [createdBy, setCreatedBy] = useState('');
  const [decidedBy, setDecidedBy] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const [itemHits, setItemHits] = useState<ItemHit[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [ficha, setFicha] = useState<Avaria | null>(null);
  const [sessao, setSessao] = useState<Avaria[]>([]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiJson<Avaria[]>('/qualidade/avarias');
      setRows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar avarias');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    const q = itemQuery.trim();
    if (q.length < 2) {
      setItemHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const hits = await apiJson<ItemHit[]>(`/qualidade/avarias/lookup-item?q=${encodeURIComponent(q)}`);
        setItemHits(Array.isArray(hits) ? hits : []);
      } catch {
        setItemHits([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [itemQuery]);

  useEffect(() => {
    if (photoFile) {
      const url = URL.createObjectURL(photoFile);
      setPhotoPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    if (!editingId || !hasPhoto) {
      setPhotoPreview('');
      return;
    }
    let cancel = false;
    let created = '';
    void (async () => {
      try {
        const res = await apiFetch(`/qualidade/avarias/${editingId}/foto`);
        if (!res.ok || cancel) return;
        const url = URL.createObjectURL(await res.blob());
        if (cancel) {
          URL.revokeObjectURL(url);
          return;
        }
        created = url;
        setPhotoPreview(url);
      } catch {
        /* foto opcional */
      }
    })();
    return () => {
      cancel = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [photoFile, editingId, hasPhoto]);

  const clearDraft = (keptLocation = '') => {
    setEditingId(null);
    setRegisterNumber('');
    setItemCode('');
    setDescription('');
    setLote('');
    setQty('1');
    setLocation(keptLocation);
    setStatus('retorno_estoque');
    setNotes('');
    setMotivoRapido('');
    setHasPhoto(false);
    setCreatedBy('');
    setDecidedBy('');
    setItemQuery('');
    setItemHits([]);
    setPhotoFile(null);
    setError('');
  };

  const handleCreateLocation = (raw: string) => {
    const clean = raw.trim();
    if (!clean) return;
    setLocation(clean);
    setLocationsCatalog((prev) => {
      const exists = prev.some((x) => x.toLowerCase() === clean.toLowerCase());
      if (exists) return prev;
      const next = [...prev, clean];
      saveCatalogList(LOCATIONS_CATALOG_KEY, next);
      return next;
    });
  };

  const locationOptions = useMemo(() => {
    const list = [...locationsCatalog];
    if (location.trim() && !list.some((x) => x.toLowerCase() === location.trim().toLowerCase())) {
      list.push(location.trim());
    }
    return list.map((l) => ({ value: l, label: l }));
  }, [locationsCatalog, location]);

  const handleSelectMotivo = (val: string) => {
    setMotivoRapido(val);
    if (!val) return;
    setNotes((prev) => {
      const cleanVal = val.trim();
      if (!prev.trim()) return cleanVal;
      if (prev.toLowerCase().includes(cleanVal.toLowerCase())) return prev;
      return `${cleanVal}. ${prev}`.trim();
    });
  };

  const handleCreateMotivo = (raw: string) => {
    const clean = raw.trim();
    if (!clean) return;
    setMotivoRapido(clean);
    setNotes((prev) => {
      if (!prev.trim()) return clean;
      if (prev.toLowerCase().includes(clean.toLowerCase())) return prev;
      return `${clean}. ${prev}`.trim();
    });
    setMotivosCatalog((prev) => {
      const exists = prev.some((x) => x.toLowerCase() === clean.toLowerCase());
      if (exists) return prev;
      const next = [...prev, clean];
      saveCatalogList(MOTIVOS_CATALOG_KEY, next);
      return next;
    });
  };

  const motivoOptions = useMemo(() => {
    const list = [...motivosCatalog];
    if (motivoRapido.trim() && !list.some((x) => x.toLowerCase() === motivoRapido.trim().toLowerCase())) {
      list.push(motivoRapido.trim());
    }
    return list.map((m) => ({ value: m, label: m }));
  }, [motivosCatalog, motivoRapido]);

  const openCreate = () => {
    clearDraft('');
    setNotice('');
    setTab('cadastro');
  };

  const gruposIguais = useMemo(() => {
    const map = new Map<string, Avaria[]>();
    for (const row of sessao) {
      const status = row.status === 'embalagem' ? 'reparo' : row.status;
      const key = `${row.itemCode.trim().toLowerCase()}|${(row.lote || '').trim().toLowerCase()}|${status}`;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.values()].filter((group) => group.length > 1);
  }, [sessao]);

  const openFicha = async (row: Avaria) => {
    setBusy(true);
    setError('');
    try {
      setFicha(await apiJson<Avaria>(`/qualidade/avarias/${row.id}`));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao abrir');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const body = {
      itemCode: itemCode.trim(),
      description: description.trim(),
      lote: lote.trim(),
      qty: Number(qty.replace(',', '.')),
      location: location.trim(),
      status,
      notes: notes.trim() || null,
      repairType: status === 'reparo' ? 'embalagem' : null,
    };
    if (!body.itemCode || !body.description) {
      setError('Selecione o item pelo lote, código ou descrição');
      return;
    }
    if (!Number.isFinite(body.qty) || body.qty <= 0) {
      setError('Informe uma quantidade maior que zero');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = editingId
        ? await apiJson<Avaria>(`/qualidade/avarias/${editingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await apiJson<Avaria>('/qualidade/avarias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
      let current = saved;
      if (photoFile) {
        const prepared = await shrinkPhoto(photoFile);
        if (prepared.size > 8 * 1024 * 1024) {
          setError('A foto continua grande demais. Tente outra imagem.');
          setBusy(false);
          return;
        }
        const fd = new FormData();
        fd.append('file', prepared);
        current = await apiJson<Avaria>(`/qualidade/avarias/${saved.id}/foto`, {
          method: 'POST',
          body: fd,
        });
      }
      await loadList();
      const verb = editingId ? 'atualizado' : 'registrado';
      const keptLocation = location.trim();
      if (!editingId) {
        setSessao((prev) => [current, ...prev.filter((row) => row.id !== current.id)]);
      }
      clearDraft(editingId ? '' : keptLocation);
      setNotice(`${current.registerNumber} ${verb}. Lance o próximo.`);
      window.setTimeout(() => {
        itemQueryRef.current?.focus();
        itemQueryRef.current?.scrollIntoView({ block: 'center' });
      }, 50);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  };

  const juntarIguais = async () => {
    if (gruposIguais.length === 0) return;
    setBusy(true);
    setError('');
    try {
      let next = sessao;
      for (const group of gruposIguais) {
        const kept = await apiJson<Avaria>('/qualidade/avarias/juntar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: group.map((row) => row.id) }),
        });
        const ids = new Set(group.map((row) => row.id));
        next = [kept, ...next.filter((row) => !ids.has(row.id))];
      }
      setSessao(next);
      setNotice('Registros iguais juntados. A quantidade foi somada no mais antigo.');
      await loadList();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao juntar');
    } finally {
      setBusy(false);
    }
  };

  const marcarSessao = async (row: Avaria, nextStatus: Status) => {
    if (!canEdit || row.status === nextStatus) return;
    setBusy(true);
    setError('');
    try {
      const saved = await apiJson<Avaria>(`/qualidade/avarias/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemCode: row.itemCode,
          description: row.description,
          lote: row.lote,
          qty: row.qty,
          location: row.location,
          status: nextStatus,
          notes: row.notes ?? null,
          repairType: nextStatus === 'reparo' ? 'embalagem' : null,
          problema: row.problema ?? null,
          encaminhamento: row.encaminhamento ?? null,
          fqNecessaria: row.fqNecessaria ?? false,
          fqResultado: row.fqResultado ?? null,
          fqObservacao: row.fqObservacao ?? null,
        }),
      });
      setSessao((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
      await loadList();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao marcar');
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    const base = Object.fromEntries(STATUSES.map((s) => [s.id, 0])) as Record<Status, number>;
    for (const row of rows) {
      const key = row.status === 'embalagem' ? 'reparo' : row.status;
      if (base[key] != null) base[key] += 1;
    }
    return base;
  }, [rows]);

  const countsControle = useMemo(() => {
    let semControle = 0;
    let comControle = 0;
    for (const r of rows) {
      if (r.sheetNumber && r.sheetNumber.trim()) {
        comControle += 1;
      } else {
        semControle += 1;
      }
    }
    return { semControle, comControle };
  }, [rows]);

  const distinctLocais = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const loc = (row.location || '').trim();
      if (loc) set.add(loc);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const hasActiveFilters = filtro !== 'all' || filtroControle !== 'all' || filtroLocal !== 'all' || !!busca.trim();

  const clearAllFilters = () => {
    setFiltro('all');
    setFiltroControle('all');
    setFiltroLocal('all');
    setBusca('');
  };

  const visible = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return rows.filter((row) => {
      const statusOk = filtro === 'all'
        || (filtro === 'reparo' ? row.status === 'reparo' || row.status === 'embalagem' : row.status === filtro);
      if (!statusOk) return false;

      if (filtroControle === 'sem_controle' && row.sheetNumber && row.sheetNumber.trim()) return false;
      if (filtroControle === 'com_controle' && (!row.sheetNumber || !row.sheetNumber.trim())) return false;

      if (filtroLocal !== 'all' && (row.location || '').trim().toLowerCase() !== filtroLocal.toLowerCase()) {
        return false;
      }

      if (!termo) return true;
      return [row.registerNumber, row.itemCode, row.description, row.lote, row.location, row.notes || '', row.sheetNumber || '']
        .join(' ')
        .toLowerCase()
        .includes(termo);
    });
  }, [rows, filtro, filtroControle, filtroLocal, busca]);

  const headerActions = (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {tab === 'lista' && (
        <button type="button" className="btn-secondary !px-2.5 sm:!px-4" onClick={() => void loadList()} title="Atualizar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">Atualizar</span>
        </button>
      )}
      {canEdit && tab === 'lista' && (
        <button type="button" className="btn-primary !px-2.5 sm:!px-4" onClick={openCreate}>
          <Plus size={16} />
          <span className="hidden sm:inline">Nova</span>
        </button>
      )}
      {tab === 'cadastro' && canEdit && (
        <div className="hidden md:flex items-center gap-2">
          {editingId ? null : (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
            Salvar
          </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <AppLayout
      moduleTitle="Avarias"
      onBackToHub={onBackToHub}
      sidebarItems={[
        { id: 'lista', label: 'Registros', icon: ClipboardList, badge: rows.length || undefined },
        { id: 'cadastro', label: 'Cadastro', icon: AlertTriangle },
        { id: 'retorno', label: 'Controle de Retorno', icon: ClipboardCheck },
        { id: 'controles', label: 'Controles emitidos', icon: Files },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as TabId)}
      headerActions={headerActions}
    >
      <div className="view-container h-full min-h-0">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}
        {notice && !error && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>
        )}

        {tab === 'retorno' && <AvariasFolhas canEdit={canEdit} screen="retorno" />}
        {tab === 'controles' && <AvariasFolhas canEdit={canEdit} screen="controles" />}

        {ficha && (
          <AvariasFicha
            row={ficha}
            canEdit={canEdit}
            onClose={() => setFicha(null)}
            onSaved={(saved) => {
              setFicha(saved as Avaria);
              void loadList();
            }}
          />
        )}

        {tab === 'lista' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <button
                type="button"
                onClick={() => setFiltro('all')}
                className={cn(
                  'bg-white rounded-xl border p-3.5 shadow-sm text-left cursor-pointer transition-all hover:shadow-md',
                  filtro === 'all'
                    ? 'ring-2 ring-zinc-900 border-transparent bg-zinc-50/70 shadow-sm'
                    : 'border-zinc-200 hover:border-zinc-300',
                )}
              >
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Todos</div>
                <div className="text-xl font-bold text-zinc-900 mt-0.5">{rows.length}</div>
                <div className="text-[10px] text-zinc-400 mt-1 truncate">Total de registros</div>
              </button>

              {STATUSES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setFiltro(filtro === s.id ? 'all' : s.id)}
                  className={cn(
                    'bg-white rounded-xl border p-3.5 shadow-sm text-left cursor-pointer transition-all hover:shadow-md',
                    filtro === s.id ? 'ring-2 border-transparent' : 'border-zinc-200',
                    s.tone === 'amber' && (filtro === s.id ? 'ring-amber-500 bg-amber-50/20' : 'hover:border-amber-300'),
                    s.tone === 'emerald' && (filtro === s.id ? 'ring-emerald-500 bg-emerald-50/20' : 'hover:border-emerald-300'),
                    s.tone === 'blue' && (filtro === s.id ? 'ring-blue-500 bg-blue-50/20' : 'hover:border-blue-300'),
                    s.tone === 'rose' && (filtro === s.id ? 'ring-rose-500 bg-rose-50/20' : 'hover:border-rose-300'),
                  )}
                >
                  <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{s.label}</div>
                  <div className={cn(
                    'text-xl font-bold mt-0.5',
                    s.tone === 'amber' && 'text-amber-600',
                    s.tone === 'emerald' && 'text-emerald-600',
                    s.tone === 'blue' && 'text-blue-600',
                    s.tone === 'rose' && 'text-rose-600',
                  )}>{counts[s.id]}</div>
                  <div className="text-[10px] text-zinc-400 mt-1 truncate">{s.subtitle}</div>
                </button>
              ))}
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-zinc-200 shadow-sm">
              <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="search-input-wrapper flex-1">
                  <Search size={16} />
                  <input
                    className="search-input"
                    placeholder="Buscar registro, código, lote, local ou controle"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                  {busca && (
                    <button
                      type="button"
                      onClick={() => setBusca('')}
                      className="text-zinc-400 hover:text-zinc-600 p-1"
                      title="Limpar busca"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl text-xs font-semibold shrink-0 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setFiltroControle('all')}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg transition-all shrink-0',
                      filtroControle === 'all'
                        ? 'bg-white text-zinc-900 shadow-sm'
                        : 'text-zinc-600 hover:text-zinc-900',
                    )}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroControle('sem_controle')}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0',
                      filtroControle === 'sem_controle'
                        ? 'bg-white text-amber-700 shadow-sm'
                        : 'text-zinc-600 hover:text-zinc-900',
                    )}
                    title="Itens ainda não vinculados a uma folha de controle de retorno"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                    <span>Sem controle ({countsControle.semControle})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroControle('com_controle')}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0',
                      filtroControle === 'com_controle'
                        ? 'bg-white text-emerald-700 shadow-sm'
                        : 'text-zinc-600 hover:text-zinc-900',
                    )}
                    title="Itens já vinculados a um controle emitido"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    <span>Com controle ({countsControle.comControle})</span>
                  </button>
                </div>

                {distinctLocais.length > 0 && (
                  <select
                    value={filtroLocal}
                    onChange={(e) => setFiltroLocal(e.target.value)}
                    className="h-10 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 outline-none focus:border-zinc-400 shrink-0"
                  >
                    <option value="all">Todos os locais</option>
                    {distinctLocais.map((loc) => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center justify-between md:justify-end gap-2.5 text-xs text-zinc-500">
                <span>
                  Exibindo <strong className="text-zinc-900 font-bold">{visible.length}</strong> de {rows.length}
                </span>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 font-semibold text-xs transition-colors"
                    title="Resetar todos os filtros"
                  >
                    <X size={12} /> Limpar
                  </button>
                )}
              </div>
            </div>

            <div className="hidden md:block bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden min-h-0">
              <div className="overflow-auto">
                {loading ? (
                  <div className="py-16 text-center text-sm text-zinc-500">Carregando…</div>
                ) : visible.length === 0 ? (
                  <div className="py-16 text-center text-sm text-zinc-500">Nenhum registro neste filtro.</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-zinc-50 text-zinc-500 uppercase tracking-wider text-[10px] sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2.5 font-bold">Registro</th>
                        <th className="text-left px-3 py-2.5 font-bold">Código</th>
                        <th className="text-left px-3 py-2.5 font-bold">Descrição</th>
                        <th className="text-left px-3 py-2.5 font-bold">Lote</th>
                        <th className="text-right px-3 py-2.5 font-bold">Qtd</th>
                        <th className="text-left px-3 py-2.5 font-bold">Local</th>
                        <th className="text-left px-3 py-2.5 font-bold">Controle</th>
                        <th className="text-left px-3 py-2.5 font-bold">Situação</th>
                        <th className="text-center px-3 py-2.5 font-bold">Foto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((row) => {
                        const meta = statusMeta(row.status);
                        return (
                          <tr
                            key={row.id}
                            className="border-t border-zinc-100 hover:bg-zinc-50/80 cursor-pointer"
                            onClick={() => void openFicha(row)}
                          >
                            <td className="px-3 py-2.5 font-mono font-bold text-zinc-900">{row.registerNumber}</td>
                            <td className="px-3 py-2.5 font-mono text-zinc-700">{row.itemCode}</td>
                            <td className="px-3 py-2.5 text-zinc-800">{row.description}</td>
                            <td className="px-3 py-2.5 font-mono">{row.lote || '—'}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{row.qty}</td>
                            <td className="px-3 py-2.5 text-zinc-600">{row.location || '—'}</td>
                            <td className="px-3 py-2.5 font-mono">
                              {row.sheetNumber ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-800 font-bold text-[11px]">
                                  {row.sheetNumber}
                                </span>
                              ) : (
                                <span className="text-zinc-400 italic text-[11px]">Pendente</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={cn('status-badge', meta.badge)}>{meta.label}</span>
                            </td>
                            <td className="px-3 py-2.5 text-center text-zinc-400">
                              {row.fotoPath ? <Camera className="h-4 w-4 inline text-zinc-700" /> : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="md:hidden space-y-2">
              {loading ? (
                <div className="py-10 text-center text-sm text-zinc-500">Carregando…</div>
              ) : visible.length === 0 ? (
                <div className="py-10 text-center text-sm text-zinc-500">Nenhum registro neste filtro.</div>
              ) : visible.map((row) => {
                const meta = statusMeta(row.status);
                return (
                  <button
                    key={row.id}
                    type="button"
                    className="w-full text-left bg-white border border-zinc-200 rounded-2xl shadow-sm p-3 space-y-2"
                    onClick={() => void openFicha(row)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-sm font-bold">{row.registerNumber}</div>
                        <div className="text-sm text-zinc-800 line-clamp-2">{row.description}</div>
                      </div>
                      <span className={cn('status-badge shrink-0', meta.badge)}>{meta.short}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[11px] text-zinc-500 font-mono">
                      <span>{row.itemCode}</span>
                      <span>Lote {row.lote || '—'}</span>
                      <span>Qtd {row.qty}</span>
                      <span>{row.sheetNumber ? `Controle ${row.sheetNumber}` : 'Sem controle'} · {row.location || 'Sem local'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {tab === 'cadastro' && (
          <div className="space-y-4 pb-24 md:pb-0">
          {sessao.length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm">
              <div className="px-4 py-3 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-zinc-900">Nesta coleta · {sessao.length}</span>
                <div className="flex gap-2">
                  {gruposIguais.length > 0 && (
                    <button type="button" className="btn-primary" disabled={busy} onClick={() => void juntarIguais()}>
                      Juntar iguais
                    </button>
                  )}
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => setSessao([])}>
                    Encerrar
                  </button>
                </div>
              </div>
              {gruposIguais.length > 0 && (
                <p className="px-4 pt-3 text-[11px] text-zinc-500">
                  Há registros com o mesmo código, o mesmo lote e a mesma decisão. Juntar soma a quantidade no mais antigo.
                </p>
              )}
              <div className="p-3 space-y-2">
                {sessao.map((row) => {
                  const atual = row.status === 'embalagem' ? 'reparo' : row.status;
                  return (
                    <div key={row.id} className="rounded-xl border border-zinc-200 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-mono text-sm font-bold text-zinc-900">{row.registerNumber}</div>
                          <div className="font-mono text-xs text-zinc-700">
                            {row.itemCode} · {row.lote || 'sem lote'} · {row.qty}
                          </div>
                          <div className="text-xs text-zinc-600 truncate">{row.description}</div>
                        </div>
                        <span className={cn('status-badge shrink-0', statusMeta(atual).badge)}>{statusMeta(atual).short}</span>
                      </div>
                      {canEdit && (
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                          {COLETA.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              disabled={busy}
                              onClick={() => void marcarSessao(row, item.id)}
                              className={cn(
                                'min-h-9 rounded-lg px-2 text-[11px] font-bold transition-colors',
                                atual === item.id ? 'bg-zinc-900 text-white' : 'bg-zinc-50 text-zinc-700 border border-zinc-200 hover:bg-zinc-100',
                              )}
                            >
                              {item.short}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4">
            <div className="order-2 xl:order-1 bg-white border border-zinc-200 rounded-2xl shadow-sm">
              <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-3">
                <span className="font-mono text-sm font-bold text-zinc-900">
                  {registerNumber || 'Novo registro'}
                </span>
                <span className={cn('status-badge shrink-0', statusMeta(status).badge)}>
                  {statusMeta(status).label}
                </span>
              </div>
              <div className="p-4 space-y-4">

              <label className="space-y-1 relative block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Código, nome ou lote</span>
                <input
                  ref={itemQueryRef}
                  className={inputCls}
                  placeholder="Digite ao menos 2 caracteres e selecione"
                  value={itemQuery}
                  disabled={!canEdit}
                  onChange={(e) => {
                    setNotice('');
                    setItemQuery(e.target.value);
                  }}
                />
                {itemHits.length > 0 && (
                  <div className="absolute z-40 left-0 right-0 top-full mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg max-h-[40vh] overflow-auto">
                    {itemHits.map((h, i) => (
                      <button
                        key={`${h.productCode}-${h.lote}-${i}`}
                        type="button"
                        className="w-full text-left px-3 py-3 min-h-11 text-sm hover:bg-zinc-50 active:bg-zinc-100 cursor-pointer"
                        onClick={() => {
                          setItemCode(h.productCode);
                          setDescription(h.description);
                          setLote(h.lote || '');
                          setItemHits([]);
                          setItemQuery('');
                        }}
                      >
                        <span className="font-mono font-semibold">{h.lote || 'sem lote'}</span>
                        <span className="mx-1 text-zinc-300">·</span>
                        <span className="font-mono">{h.productCode}</span>
                        <span className="mt-0.5 block text-zinc-600">{h.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Código</span>
                  <input className={cn(inputCls, 'font-mono')} value={itemCode} disabled={!canEdit} onChange={(e) => setItemCode(e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Lote</span>
                  <input className={cn(inputCls, 'font-mono')} value={lote} disabled={!canEdit} onChange={(e) => setLote(e.target.value)} />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Descrição</span>
                  <input className={inputCls} value={description} disabled={!canEdit} onChange={(e) => setDescription(e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Quantidade</span>
                  <input className={cn(inputCls, 'font-mono text-right')} inputMode="decimal" value={qty} disabled={!canEdit} onChange={(e) => setQty(e.target.value)} />
                </label>
                <CatalogSelect
                  label="Local"
                  value={location}
                  options={locationOptions}
                  onChange={setLocation}
                  onCreate={handleCreateLocation}
                  placeholder="Novo local (ex.: Quarentena, Doca 2)"
                  disabled={!canEdit}
                />
                <div className="space-y-2 md:col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Decisão inicial</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {COLETA.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => setStatus(item.id)}
                        className={cn(
                          'min-h-11 rounded-xl border px-3 py-2 text-left transition-all',
                          status === item.id ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm' : 'bg-white border-zinc-200 text-zinc-800 hover:border-zinc-300',
                        )}
                      >
                        <div className="text-xs font-bold">{item.label}</div>
                        <div className={cn('text-[10px] mt-0.5', status === item.id ? 'text-zinc-300' : 'text-zinc-500')}>{item.hint}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2 space-y-3">
                  <CatalogSelect
                    label="Motivo / Ocorrência rápida"
                    value={motivoRapido}
                    options={motivoOptions}
                    onChange={handleSelectMotivo}
                    onCreate={handleCreateMotivo}
                    placeholder="Novo motivo (ex.: Embalagem amassada no transporte)"
                    disabled={!canEdit}
                  />
                  <label className="space-y-1 block">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Observações adicionais</span>
                    <textarea
                      className={cn(inputCls, 'h-20 py-2 resize-none')}
                      value={notes}
                      disabled={!canEdit}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={status === 'retorno_estoque' ? 'O que a expedição precisa ajustar. Ex.: trocar lote ou remarcar.' : status === 'reparo' ? 'O que trocar na embalagem.' : status === 'descarte' ? 'Motivo do descarte.' : 'Observações adicionais para análise técnica do CQ.'}
                    />
                  </label>
                </div>
              </div>
              {(createdBy || decidedBy) && (
                <p className="text-xs text-zinc-500">
                  {createdBy && <span>Registrado por {createdBy}. </span>}
                  {decidedBy && <span>Definido por {decidedBy}.</span>}
                </p>
              )}
              </div>
            </div>

            <div className="order-1 xl:order-2 bg-white border border-zinc-200 rounded-2xl shadow-sm p-4 space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Foto do item ou lote</div>
              <div className="h-48 xl:aspect-square xl:h-auto rounded-xl border border-dashed border-zinc-200 bg-zinc-50 overflow-hidden flex items-center justify-center">
                {photoPreview ? (
                  <img src={photoPreview} alt="Foto da avaria" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center text-zinc-400 px-4">
                    <Camera className="h-6 w-6 mx-auto mb-2" />
                    <p className="text-xs">Nenhuma foto ainda</p>
                  </div>
                )}
              </div>
              {canEdit && (
                <div className="grid grid-cols-1 gap-2">
                  <label className="btn-primary inline-flex w-full items-center justify-center gap-2 cursor-pointer min-h-11">
                    <Camera size={16} /> Tirar foto
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setPhotoFile(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <label className="btn-secondary w-full justify-center cursor-pointer min-h-11">
                    Escolher da galeria
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setPhotoFile(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              )}
              <p className="text-[11px] text-zinc-500">JPG, PNG ou WEBP, até 8 MB. A foto é salva junto com o registro.</p>
            </div>

            {canEdit && (
              <div className="md:hidden fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-zinc-200 bg-white px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
                <button type="button" className="btn-primary flex-1 justify-center min-h-11" disabled={busy} onClick={() => void save()}>
                  Salvar
                </button>
              </div>
            )}
          </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

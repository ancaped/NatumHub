import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Edit2,
  Image as ImageIcon,
  Layers,
  Loader2,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Save,
  ShoppingCart,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Warehouse,
  X,
} from 'lucide-react';
import { apiJson } from '../../../geral/lib/http';
import type { AlmoxFamilia, AlmoxMovement, AlmoxOpsItem } from '../types';
import { SECTION_LABELS } from '../types';

export interface ItemConfigPayload {
  active: boolean;
  minQty: number;
  idealQty: number;
  location: string | null;
  notes: string | null;
  section?: string;
  description?: string;
  unit?: string;
  lifespanDays?: number | null;
  nextExchangeAt?: string | null;
  expiresAt?: string | null;
  defaultPackQty?: number | null;
  defaultPackName?: string | null;
  photoData?: string | null;
  photoDate?: string | null;
}

export interface MovementPayload {
  itemCode: string;
  movementType: 'entrada' | 'saida';
  quantity: number;
  unitCost?: number | null;
  reason?: string | null;
  documentRef?: string | null;
  sector?: string | null;
  variantLabel?: string | null;
  packLabel?: string | null;
  packCount?: number | null;
  contentPerPack?: number | null;
  totalPaid?: number | null;
}

interface Props {
  item: AlmoxOpsItem;
  movements: AlmoxMovement[];
  familias?: AlmoxFamilia[];
  onClose: () => void;
  onSaveConfig: (payload: ItemConfigPayload) => Promise<void>;
  onSubmitMovement?: (payload: MovementPayload) => Promise<void>;
  onDeleteItem?: (code: string) => Promise<void>;
  onCountSaved?: () => Promise<void>;
  onRequestBuy?: (item: AlmoxOpsItem) => Promise<void>;
  onMoveCategory?: (code: string, newSection: string) => Promise<void>;
  busy?: boolean;
}

type DrawerTab = 'visao' | 'contar' | 'historico' | 'fotos' | 'config';

function formatPhotoAge(photoDate?: string | null): { text: string; isOld: boolean; fullDate: string } {
  if (!photoDate) return { text: 'Sem data', isOld: false, fullDate: '—' };
  try {
    const d = new Date(photoDate);
    if (isNaN(d.getTime())) return { text: photoDate, isOld: false, fullDate: photoDate };

    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const fullDate = d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    let text = '';
    if (diffDays <= 0) {
      text = 'Registrada hoje';
    } else if (diffDays === 1) {
      text = 'Registrada ontem';
    } else if (diffDays < 30) {
      text = `Registrada há ${diffDays} dias`;
    } else if (diffDays < 365) {
      const meses = Math.floor(diffDays / 30);
      text = meses === 1 ? 'Registrada há 1 mês' : `Registrada há ${meses} meses`;
    } else {
      const anos = Math.floor(diffDays / 365);
      text = anos === 1 ? 'Registrada há 1 ano' : `Registrada há ${anos} anos`;
    }

    const isOld = diffDays >= 180;
    return { text, isOld, fullDate };
  } catch {
    return { text: photoDate, isOld: false, fullDate: photoDate };
  }
}

async function compressImageFile(file: File, maxDim = 800, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function dataBr(iso?: string | null) {
  if (!iso) return '—';
  const clean = iso.slice(0, 10);
  const [y, m, d] = clean.split('-');
  if (!y || !m || !d) return clean;
  return `${d}/${m}/${y}`;
}

export default function ItemDrawer({
  item,
  movements,
  familias = [],
  onClose,
  onSaveConfig,
  onDeleteItem,
  onCountSaved,
  onRequestBuy,
  onMoveCategory,
  busy = false,
}: Props) {
  const [tab, setTab] = useState<DrawerTab>('visao');
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);
  const [savingAction, setSavingAction] = useState(false);

  // Edit config states
  const [description, setDescription] = useState(item.description || '');
  const [unit, setUnit] = useState(item.unit || 'UN');
  const [section, setSection] = useState(item.section || 'supermercado');
  const [minQty, setMinQty] = useState(String(item.minQty ?? 0));
  const [idealQty, setIdealQty] = useState(String(item.idealQty ?? 0));
  const [location, setLocation] = useState(item.location || '');
  const [notes, setNotes] = useState(item.notes || '');
  const [defaultPackQty, setDefaultPackQty] = useState(
    item.defaultPackQty != null ? String(item.defaultPackQty) : ''
  );
  const [defaultPackName, setDefaultPackName] = useState(item.defaultPackName || '');
  const [photoData, setPhotoData] = useState<string | null>(item.photoData || null);
  const [photoDate, setPhotoDate] = useState<string | null>(item.photoDate || null);

  // Quick spot count states
  const initialPackFactor = item.lastPackQty || item.defaultPackQty || 12;
  const initialPackName = item.lastPackName || item.defaultPackName || 'Fardo';
  const [countMode, setCountMode] = useState<'pack' | 'direct'>(
    item.defaultPackQty && item.defaultPackQty > 1 ? 'pack' : 'direct'
  );
  const [packFactor, setPackFactor] = useState(initialPackFactor);
  const [packName, setPackName] = useState(initialPackName);
  const [packCount, setPackCount] = useState(0);
  const [looseCount, setLooseCount] = useState(item.qtyOnHand);
  const [directCountInput, setDirectCountInput] = useState(String(item.qtyOnHand));

  // Gallery fotos states
  const [fotos, setFotos] = useState<{ id: string; photoData: string; notes?: string | null; createdAt: string }[]>([]);
  const [fotosLoading, setFotosLoading] = useState(false);
  const [newFotoNotes, setNewFotoNotes] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setDescription(item.description || '');
    setUnit(item.unit || 'UN');
    setSection(item.section || 'supermercado');
    setMinQty(String(item.minQty ?? 0));
    setIdealQty(String(item.idealQty ?? 0));
    setLocation(item.location || '');
    setNotes(item.notes || '');
    setDefaultPackQty(item.defaultPackQty != null ? String(item.defaultPackQty) : '');
    setDefaultPackName(item.defaultPackName || '');
    setPhotoData(item.photoData || null);
    setPhotoDate(item.photoDate || null);

    const pFact = item.lastPackQty || item.defaultPackQty || 12;
    const pName = item.lastPackName || item.defaultPackName || 'Fardo';
    setPackFactor(pFact);
    setPackName(pName);
    setPackCount(0);
    setLooseCount(item.qtyOnHand);
    setDirectCountInput(String(item.qtyOnHand));
    setCountMode(item.defaultPackQty && item.defaultPackQty > 1 ? 'pack' : 'direct');

    setTab('visao');
    setLocalError(null);
    setLocalSuccess(null);
    setConfirmDelete(false);
  }, [item]);

  // Load photos when on photos tab
  useEffect(() => {
    if (tab === 'fotos' && item.code && fotos.length === 0 && !fotosLoading) {
      setFotosLoading(true);
      apiJson<{ fotos: any[] }>(`/almox/fotos/item/${encodeURIComponent(item.code)}`)
        .then((res) => {
          setFotos(res.fotos || []);
        })
        .catch(() => {})
        .finally(() => setFotosLoading(false));
    }
  }, [tab, item.code, fotos.length, fotosLoading]);

  // Calculated count total
  const calculatedCountQty = useMemo(() => {
    if (countMode === 'direct') {
      const v = parseFloat(directCountInput.replace(',', '.'));
      return isNaN(v) ? 0 : Math.max(0, v);
    }
    const factor = Math.max(1, Number(packFactor) || 1);
    const p = Math.max(0, Number(packCount) || 0);
    const l = Math.max(0, Number(looseCount) || 0);
    return p * factor + l;
  }, [countMode, directCountInput, packFactor, packCount, looseCount]);

  const countDiff = calculatedCountQty - item.qtyOnHand;
  const photoAge = formatPhotoAge(photoDate);

  // Handle saving spot count for this single item
  const handleSaveSpotCount = async () => {
    setSavingAction(true);
    setLocalError(null);
    setLocalSuccess(null);
    try {
      const countedAt = new Date().toISOString().slice(0, 10);
      await apiJson('/almox/counts', {
        method: 'POST',
        body: JSON.stringify({
          countedAt,
          lines: [
            {
              itemCode: item.code,
              countedQty: calculatedCountQty,
              packQty: countMode === 'pack' ? packFactor : null,
              packName: countMode === 'pack' ? packName : null,
            },
          ],
        }),
      });

      setLocalSuccess(
        countDiff < 0
          ? `Contagem salva! Consumo de ${Math.abs(countDiff).toLocaleString('pt-BR')} ${item.unit} apurado com sucesso.`
          : countDiff > 0
          ? `Contagem salva! Saldo ajustado com entrada de ${countDiff.toLocaleString('pt-BR')} ${item.unit}.`
          : 'Contagem salva! Saldo conferido e confirmado como estável.'
      );

      if (onCountSaved) {
        await onCountSaved();
      }
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : 'Erro ao registrar contagem do item.');
    } finally {
      setSavingAction(false);
    }
  };

  // Handle quick move category
  const handleQuickMoveCategory = async (newSec: string) => {
    if (!newSec || newSec === item.section) return;
    setSavingAction(true);
    setLocalError(null);
    setLocalSuccess(null);
    try {
      if (onMoveCategory) {
        await onMoveCategory(item.code, newSec);
      } else {
        await onSaveConfig({
          active: item.active,
          minQty: item.minQty,
          idealQty: item.idealQty,
          location: item.location || null,
          notes: item.notes || null,
          section: newSec,
        });
      }
      setSection(newSec);
      setLocalSuccess(`Item movido com sucesso para a categoria '${SECTION_LABELS[newSec] || newSec}'.`);
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : 'Erro ao mover categoria do item.');
    } finally {
      setSavingAction(false);
    }
  };

  // Handle save full config
  const handleSaveFullConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAction(true);
    setLocalError(null);
    setLocalSuccess(null);
    try {
      await onSaveConfig({
        active: item.active,
        description: description.trim() || undefined,
        unit: unit.trim() || undefined,
        section: section.trim() || undefined,
        minQty: Number(minQty) || 0,
        idealQty: Number(idealQty) || 0,
        location: location.trim() || null,
        notes: notes.trim() || null,
        defaultPackQty: defaultPackQty ? Number(defaultPackQty) : null,
        defaultPackName: defaultPackName.trim() || null,
        photoData: photoData || null,
        photoDate: photoDate || null,
      });
      setLocalSuccess('Dados do item atualizados com sucesso!');
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : 'Erro ao salvar alterações.');
    } finally {
      setSavingAction(false);
    }
  };

  // Handle delete item
  const handleDeleteItem = async () => {
    if (!onDeleteItem) return;
    setSavingAction(true);
    setLocalError(null);
    try {
      await onDeleteItem(item.code);
      onClose();
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : 'Não foi possível excluir o item.');
      setSavingAction(false);
    }
  };

  // Handle uploading main photo
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSavingAction(true);
    setLocalError(null);
    try {
      const base64 = await compressImageFile(file, 800, 0.75);
      const newDate = new Date().toISOString();
      await onSaveConfig({
        active: item.active,
        minQty: item.minQty,
        idealQty: item.idealQty,
        location: item.location || null,
        notes: item.notes || null,
        photoData: base64,
        photoDate: newDate,
      });
      setPhotoData(base64);
      setPhotoDate(newDate);
      setLocalSuccess('Foto do item atualizada com a data de hoje!');
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : 'Erro ao salvar foto.');
    } finally {
      setSavingAction(false);
    }
  };

  // Add photo to secondary gallery
  const handleAddGalleryPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSavingAction(true);
    setLocalError(null);
    try {
      const base64 = await compressImageFile(file, 800, 0.75);
      const res = await apiJson<{ foto: any }>(`/almox/fotos/item/${encodeURIComponent(item.code)}`, {
        method: 'POST',
        body: JSON.stringify({
          photoData: base64,
          notes: newFotoNotes.trim() || null,
        }),
      });
      setFotos((prev) => [res.foto, ...prev]);
      setNewFotoNotes('');
      setLocalSuccess('Nova foto adicionada ao histórico!');
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : 'Erro ao adicionar foto ao histórico.');
    } finally {
      setSavingAction(false);
    }
  };

  // Delete photo from secondary gallery
  const handleDeleteGalleryPhoto = async (id: string) => {
    setSavingAction(true);
    setLocalError(null);
    try {
      await apiJson(`/almox/fotos/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setFotos((prev) => prev.filter((f) => f.id !== id));
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : 'Erro ao excluir foto.');
    } finally {
      setSavingAction(false);
    }
  };

  // Item movements that represent past counts
  const countMovements = useMemo(() => {
    return movements
      .filter((m) => m.itemCode === item.code)
      .slice(0, 50);
  }, [movements, item.code]);

  // Family label helper
  const currentFamilyLabel = SECTION_LABELS[section] || familias.find((f) => f.id === section)?.label || section;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex justify-end">
      <div className="absolute inset-0 cursor-pointer" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 z-10">
        {/* Header Hero */}
        <div className="px-6 py-5 border-b border-zinc-200 bg-zinc-50/70 flex justify-between items-start shrink-0">
          <div className="flex items-start gap-4 min-w-0">
            {/* Main Photo Thumbnail with Freshness Badge */}
            <div className="relative group shrink-0">
              {photoData ? (
                <div
                  className="w-16 h-16 rounded-2xl border border-zinc-200 overflow-hidden bg-zinc-100 shrink-0 cursor-pointer shadow-xs relative"
                  onClick={() => photoInputRef.current?.click()}
                  title="Clique para trocar a foto"
                >
                  <img src={photoData} alt={description} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="w-16 h-16 rounded-2xl border border-dashed border-zinc-300 bg-white flex flex-col items-center justify-center shrink-0 text-zinc-400 hover:text-zinc-700 hover:border-zinc-500 transition-all cursor-pointer shadow-xs"
                  title="Adicionar foto do item"
                >
                  <Camera className="w-5 h-5 text-zinc-500" />
                  <span className="text-[9px] font-bold mt-0.5 text-zinc-600">+ Foto</span>
                </button>
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => void handlePhotoUpload(e)}
                className="hidden"
              />
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 bg-zinc-900 text-white rounded-lg text-[10px] font-black uppercase tracking-wider">
                  {currentFamilyLabel}
                </span>

                {item.belowMin ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border bg-amber-50 text-amber-700 border-amber-200">
                    <AlertTriangle className="h-3 w-3" />
                    Abaixo do Mínimo
                  </span>
                ) : item.qtyOnHand <= 0 ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border bg-rose-50 text-rose-700 border-rose-200">
                    Zerado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border bg-emerald-50 text-emerald-700 border-emerald-200">
                    <CheckCircle2 className="h-3 w-3" />
                    Estoque OK
                  </span>
                )}
              </div>

              <h3 className="font-extrabold text-zinc-900 text-lg sm:text-xl leading-tight truncate">
                {description}
              </h3>

              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 font-mono">
                <span>{item.code}</span>
                <span>·</span>
                <span>{unit}</span>
                {photoData && (
                  <>
                    <span>·</span>
                    <span className={`font-sans font-medium text-[11px] ${photoAge.isOld ? 'text-amber-600 font-bold' : 'text-zinc-500'}`}>
                      📷 {photoAge.text}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-zinc-200/60 rounded-xl text-zinc-400 hover:text-zinc-700 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-zinc-200 flex gap-2 shrink-0 bg-white overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setTab('visao')}
            className={`px-3 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              tab === 'visao' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-700'
            }`}
          >
            Visão Geral
          </button>
          <button
            type="button"
            onClick={() => setTab('contar')}
            className={`px-3 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              tab === 'contar' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-700'
            }`}
          >
            <ClipboardCheck className="h-3.5 w-3.5 text-zinc-700" />
            Contar Item
          </button>
          <button
            type="button"
            onClick={() => setTab('historico')}
            className={`px-3 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              tab === 'historico' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-700'
            }`}
          >
            Histórico & Consumo
          </button>
          <button
            type="button"
            onClick={() => setTab('fotos')}
            className={`px-3 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              tab === 'fotos' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-700'
            }`}
          >
            Fotos
          </button>
          <button
            type="button"
            onClick={() => setTab('config')}
            className={`px-3 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              tab === 'config' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-700'
            }`}
          >
            Editar & Ações
          </button>
        </div>

        {/* Global Feedback Banners */}
        {localError && (
          <div className="mx-6 mt-4 p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{localError}</span>
          </div>
        )}
        {localSuccess && (
          <div className="mx-6 mt-4 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" />
            <span>{localSuccess}</span>
          </div>
        )}

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {tab === 'visao' && (
            <>
              {/* Primary Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Saldo em Estoque</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className={`text-2xl font-black ${item.qtyOnHand <= 0 ? 'text-rose-600' : 'text-zinc-900'}`}>
                      {item.qtyOnHand.toLocaleString('pt-BR')}
                    </span>
                    <span className="text-xs font-semibold text-zinc-500">{unit}</span>
                  </div>
                </div>

                <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Mínimo de Segurança</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-2xl font-black text-zinc-800">{item.minQty.toLocaleString('pt-BR')}</span>
                    <span className="text-xs font-semibold text-zinc-400">{unit}</span>
                  </div>
                </div>

                <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Meta Ideal</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-2xl font-black text-zinc-800">{item.idealQty.toLocaleString('pt-BR')}</span>
                    <span className="text-xs font-semibold text-zinc-400">{unit}</span>
                  </div>
                </div>

                <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Embalagem de Contagem</span>
                  <p className="text-sm font-bold text-zinc-900 mt-1 truncate">
                    {item.defaultPackQty && item.defaultPackQty > 1
                      ? `${item.defaultPackName || 'Embalagem'} c/ ${item.defaultPackQty} ${unit}`
                      : 'Contagem direta (solto)'}
                  </p>
                </div>

                <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Localização / Gaveta</span>
                  <p className="text-sm font-semibold text-zinc-800 mt-1 truncate">{location || 'Não definida'}</p>
                </div>

                <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Categoria / Família</span>
                  <p className="text-sm font-bold text-zinc-900 mt-1 truncate">{currentFamilyLabel}</p>
                </div>
              </div>

              {/* Stock Health Progress Bar */}
              {(() => {
                const percent =
                  item.idealQty > 0 ? Math.min(100, Math.max(0, (item.qtyOnHand / item.idealQty) * 100)) : 0;
                const isBelowMin = item.minQty > 0 && item.qtyOnHand < item.minQty;
                const barColor = isBelowMin ? 'bg-rose-500' : percent < 75 ? 'bg-amber-500' : 'bg-emerald-500';
                return (
                  <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-zinc-600">
                      <span className="uppercase tracking-wider">Capacidade & Saúde do Estoque</span>
                      <span>{percent.toFixed(0)}% da meta ideal</span>
                    </div>
                    <div className="w-full h-3 bg-zinc-200 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} transition-all duration-500`} style={{ width: `${percent}%` }} />
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-zinc-400 font-bold uppercase tracking-wider pt-0.5">
                      <span>Mínimo ({item.minQty.toLocaleString('pt-BR')} {unit})</span>
                      <span>Meta Ideal ({item.idealQty.toLocaleString('pt-BR')} {unit})</span>
                    </div>
                  </div>
                );
              })()}

              {/* Quick Actions Panel */}
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3 shadow-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                  Ações Rápidas no Item
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setTab('contar')}
                    className="inline-flex items-center justify-center gap-2 p-3 rounded-xl bg-zinc-900 text-white font-bold text-xs hover:bg-zinc-800 transition-all cursor-pointer shadow-xs"
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    Contar Este Item
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (onRequestBuy) void onRequestBuy(item);
                    }}
                    disabled={busy || savingAction}
                    className="inline-flex items-center justify-center gap-2 p-3 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-800 font-bold text-xs transition-all cursor-pointer"
                  >
                    <ShoppingCart className="h-4 w-4 text-zinc-600" />
                    Solicitar Compra
                  </button>

                  <button
                    type="button"
                    onClick={() => setTab('config')}
                    className="inline-flex items-center justify-center gap-2 p-3 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 font-bold text-xs transition-all cursor-pointer"
                  >
                    <Edit2 className="h-4 w-4 text-zinc-500" />
                    Editar Cadastro
                  </button>
                </div>
              </div>

              {/* Quick Category Move Dropdown */}
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-zinc-900">Mover para Outra Categoria</p>
                  <p className="text-[11px] text-zinc-500">Troque a família deste item sem precisar recadastrá-lo.</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    value={section}
                    onChange={(e) => void handleQuickMoveCategory(e.target.value)}
                    disabled={savingAction}
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-10"
                  >
                    {familias.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {notes && (
                <div className="rounded-2xl border border-zinc-200 bg-amber-50/40 p-4 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Observações & Anotações</p>
                  <p className="text-xs text-zinc-700 whitespace-pre-wrap">{notes}</p>
                </div>
              )}
            </>
          )}

          {tab === 'contar' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 space-y-1">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-zinc-800" />
                  <h4 className="font-bold text-sm text-zinc-900">Contagem Física Pontual</h4>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Conte as unidades físicas deste item. O sistema calcula automaticamente o consumo/saída decorrido desde
                  a última apuração e atualiza o saldo real no almoxarifado.
                </p>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center justify-between bg-zinc-100 p-1.5 rounded-xl">
                <button
                  type="button"
                  onClick={() => setCountMode('pack')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    countMode === 'pack' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Embalagem Fechada + Solto
                </button>
                <button
                  type="button"
                  onClick={() => setCountMode('direct')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    countMode === 'direct' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Modo Direto (Unidades)
                </button>
              </div>

              {/* Counting Steppers / Inputs */}
              {countMode === 'pack' ? (
                <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4 shadow-xs">
                  {/* Pack Factor Customizer */}
                  <div className="flex items-center justify-between text-xs pb-3 border-b border-zinc-100">
                    <span className="font-bold text-zinc-700">Embalagem Configurada:</span>
                    <div className="flex items-center gap-2">
                      <input
                        value={packName}
                        onChange={(e) => setPackName(e.target.value)}
                        placeholder="Fardo / Caixa"
                        className="w-24 px-2 py-1 text-xs border border-zinc-200 rounded-lg text-right font-bold"
                      />
                      <span className="text-zinc-400">c/</span>
                      <input
                        type="number"
                        min="1"
                        value={packFactor}
                        onChange={(e) => setPackFactor(Math.max(1, Number(e.target.value) || 1))}
                        className="w-14 px-2 py-1 text-xs border border-zinc-200 rounded-lg text-center font-bold"
                      />
                      <span className="text-zinc-500 font-semibold">{unit}</span>
                    </div>
                  </div>

                  {/* Pack Counter */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm text-zinc-900">{packName}s Fechados</p>
                      <p className="text-[11px] text-zinc-400">
                        {packCount} {packName}(s) × {packFactor} = {packCount * packFactor} {unit}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPackCount((c) => Math.max(0, c - 1))}
                        className="w-10 h-10 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 flex items-center justify-center font-bold cursor-pointer"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={packCount}
                        onChange={(e) => setPackCount(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-16 h-10 text-center font-black text-base border border-zinc-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                      />
                      <button
                        type="button"
                        onClick={() => setPackCount((c) => c + 1)}
                        className="w-10 h-10 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white flex items-center justify-center font-bold cursor-pointer"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Loose Units Counter */}
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                    <div>
                      <p className="font-bold text-sm text-zinc-900">Unidades Soltas / Fracionadas</p>
                      <p className="text-[11px] text-zinc-400">Itens fora da embalagem fechada</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setLooseCount((c) => Math.max(0, c - 1))}
                        className="w-10 h-10 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 flex items-center justify-center font-bold cursor-pointer"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={looseCount}
                        onChange={(e) => setLooseCount(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-16 h-10 text-center font-black text-base border border-zinc-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                      />
                      <button
                        type="button"
                        onClick={() => setLooseCount((c) => c + 1)}
                        className="w-10 h-10 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white flex items-center justify-center font-bold cursor-pointer"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-3 shadow-xs">
                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-zinc-700">Quantidade Total Contada ({unit}):</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={directCountInput}
                      onChange={(e) => setDirectCountInput(e.target.value)}
                      placeholder="0"
                      className="w-full text-xl font-black text-zinc-900 border border-zinc-200 rounded-xl p-3 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                  </label>
                </div>
              )}

              {/* Dynamic Comparison & Consumption Calculation */}
              <div
                className={`rounded-2xl border p-4.5 space-y-2 ${
                  countDiff < 0
                    ? 'border-amber-200 bg-amber-50/70 text-amber-950'
                    : countDiff > 0
                    ? 'border-blue-200 bg-blue-50/70 text-blue-950'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-800'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>Saldo Anterior: {item.qtyOnHand} {unit}</span>
                  <span>Nova Contagem: {calculatedCountQty} {unit}</span>
                </div>

                <div className="pt-2 border-t border-zinc-200/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider block opacity-70">
                      Apuração de Saída / Consumo
                    </span>
                    <p className="font-extrabold text-sm sm:text-base mt-0.5">
                      {countDiff < 0 ? (
                        <span className="text-amber-800 flex items-center gap-1.5">
                          <TrendingDown className="h-4 w-4" />
                          Saída de {Math.abs(countDiff).toLocaleString('pt-BR')} {unit} apurada
                        </span>
                      ) : countDiff > 0 ? (
                        <span className="text-blue-800 flex items-center gap-1.5">
                          <TrendingUp className="h-4 w-4" />
                          Ajuste / Entrada de {countDiff.toLocaleString('pt-BR')} {unit}
                        </span>
                      ) : (
                        <span className="text-zinc-600 flex items-center gap-1.5">
                          <Check className="h-4 w-4" />
                          Saldo estável (nenhuma saída registrada)
                        </span>
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleSaveSpotCount()}
                    disabled={savingAction}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {savingAction ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar Contagem
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'historico' && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-1">
                <h4 className="font-bold text-sm text-zinc-900">Histórico de Contagens & Apurações</h4>
                <p className="text-xs text-zinc-500">
                  Registros de saídas e reposições computadas através das contagens periódicas.
                </p>
              </div>

              {countMovements.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 text-xs border border-zinc-200 rounded-2xl bg-zinc-50/50">
                  Nenhuma contagem ou movimentação recente registrada para este item.
                </div>
              ) : (
                <div className="space-y-2">
                  {countMovements.map((m) => {
                    const isSaida = m.movementType === 'saida';
                    return (
                      <div
                        key={m.id}
                        className="bg-white border border-zinc-200 rounded-xl p-3 flex items-center justify-between text-xs shadow-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                                isSaida
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              {isSaida ? 'Consumo Apurado' : 'Entrada'}
                            </span>
                            <span className="font-bold text-zinc-800">{m.reason || 'Contagem semanal'}</span>
                          </div>
                          <p className="text-[11px] text-zinc-400 font-mono">{dataBr(m.occurredAt)}</p>
                        </div>

                        <div className="text-right">
                          <span
                            className={`font-black text-sm ${
                              isSaida ? 'text-amber-700' : 'text-emerald-700'
                            }`}
                          >
                            {isSaida ? '-' : '+'}
                            {m.quantity.toLocaleString('pt-BR')} {unit}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'fotos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-zinc-50 p-4 rounded-2xl border border-zinc-200">
                <div className="space-y-0.5">
                  <h4 className="font-bold text-sm text-zinc-900">Galeria de Fotos do Item</h4>
                  <p className="text-xs text-zinc-500">
                    Histórico visual com data do registro para conferência de estado e rótulo.
                  </p>
                </div>
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handleAddGalleryPhoto(e)}
                    className="hidden"
                    id="drawer-gallery-photo-input"
                  />
                  <label
                    htmlFor="drawer-gallery-photo-input"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 text-white font-bold text-xs hover:bg-zinc-800 cursor-pointer shadow-xs"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    + Adicionar Foto
                  </label>
                </div>
              </div>

              {fotosLoading ? (
                <div className="py-12 flex justify-center text-zinc-400">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : fotos.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 text-xs border border-zinc-200 rounded-2xl bg-zinc-50/50">
                  Nenhuma foto secundária registrada. Use o botão acima ou a foto principal no topo.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {fotos.map((f) => {
                    const fAge = formatPhotoAge(f.createdAt);
                    return (
                      <div key={f.id} className="relative rounded-2xl border border-zinc-200 overflow-hidden bg-zinc-100 group shadow-xs">
                        <img src={f.photoData} alt="Item" className="w-full h-36 object-cover" />
                        <div className="p-2.5 bg-white space-y-1">
                          <p className="text-[10px] font-bold text-zinc-700">📷 {fAge.text}</p>
                          <p className="text-[9px] text-zinc-400 font-mono">{fAge.fullDate}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteGalleryPhoto(f.id)}
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-rose-600 transition-colors cursor-pointer"
                          title="Excluir foto"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'config' && (
            <form onSubmit={(e) => void handleSaveFullConfig(e)} className="space-y-4">
              <div className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Descrição do Item *
                  </span>
                  <input
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11 font-medium"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Família / Categoria
                    </span>
                    <select
                      value={section}
                      onChange={(e) => setSection(e.target.value)}
                      className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11 font-medium"
                    >
                      {familias.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Unidade de Medida
                    </span>
                    <input
                      required
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="UN, CX, KG, L, PCT, ROLO"
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11 font-mono font-medium"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Estoque Mínimo
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={minQty}
                      onChange={(e) => setMinQty(e.target.value)}
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11 font-medium"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Estoque Ideal
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={idealQty}
                      onChange={(e) => setIdealQty(e.target.value)}
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11 font-medium"
                    />
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Localização Física / Armário
                  </span>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Ex: Prateleira B2, Gaveta 4"
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11 font-medium"
                  />
                </label>

                {/* Default Pack Configuration */}
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
                  <p className="text-xs font-bold text-zinc-800">Padrão de Embalagem para Contagem</p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        Nome do Fardo / Caixa
                      </span>
                      <input
                        value={defaultPackName}
                        onChange={(e) => setDefaultPackName(e.target.value)}
                        placeholder="Ex: Fardo, Pacote, Caixa"
                        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11 font-medium"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        Unidades por Embalagem
                      </span>
                      <input
                        type="number"
                        min="1"
                        value={defaultPackQty}
                        onChange={(e) => setDefaultPackQty(e.target.value)}
                        placeholder="Ex: 12"
                        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11 font-medium"
                      />
                    </label>
                  </div>
                </div>

                <label className="block space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Anotações / Especificações
                  </span>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Observações úteis..."
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 font-medium"
                  />
                </label>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={savingAction}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {savingAction ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar Alterações
                  </button>
                </div>
              </div>

              {/* Danger Zone: Delete Item */}
              <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50/50 p-4.5 space-y-3">
                <div className="space-y-0.5">
                  <h4 className="font-bold text-sm text-rose-900 flex items-center gap-1.5">
                    <Trash2 className="h-4 w-4 text-rose-600" />
                    Excluir Este Item
                  </h4>
                  <p className="text-xs text-rose-700 leading-relaxed">
                    Esta ação removerá o item do almoxarifado e seu histórico de contagens. Não poderá ser desfeito.
                  </p>
                </div>

                {confirmDelete ? (
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => void handleDeleteItem()}
                      disabled={savingAction}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {savingAction ? 'Excluindo...' : 'Sim, confirmar e excluir agora'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-3 py-2 rounded-xl border border-zinc-300 bg-white text-zinc-700 font-bold text-xs cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="px-4 py-2 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 font-bold text-xs cursor-pointer transition-colors"
                  >
                    Excluir Item do Almoxarifado
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

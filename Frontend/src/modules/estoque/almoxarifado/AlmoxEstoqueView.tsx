import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Maximize2,
  Minus,
  Package,
  PackagePlus,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Warehouse,
  X,
} from 'lucide-react';
import { apiJson } from '../../geral/lib/http';
import type { TipoAviso } from '../../geral/components/ui/Aviso';
import { usePreviaServidor } from '../../producao/lib/usePreviaServidor';
import AppLayout from '../../geral/components/layout/AppLayout';
import { ReportTabs } from '../../geral/components/ui/ReportKit';
import ItemDrawer, {
  type ItemConfigPayload,
  type MovementPayload,
} from '../ops/components/ItemDrawer';
import type { AlmoxFamilia, AlmoxMovement, AlmoxOpsItem, Equipment } from '../ops/types';

export const DEFAULT_FAMILIES: AlmoxFamilia[] = [
  { id: 'supermercado', label: 'Supermercado', icon: 'Store', color: 'emerald', sortOrder: 1 },
  { id: 'escritorio', label: 'Escritório', icon: 'Warehouse', color: 'blue', sortOrder: 2 },
  { id: 'limpeza', label: 'Limpeza', icon: 'Warehouse', color: 'amber', sortOrder: 3 },
  { id: 'pecas', label: 'Peças & Manutenção', icon: 'Warehouse', color: 'purple', sortOrder: 4 },
  { id: 'outros', label: 'Outros Consumíveis', icon: 'Warehouse', color: 'zinc', sortOrder: 5 },
];

interface CountStatus {
  lastCountedAt?: string | null;
  nextCountedAt: string;
  due: boolean;
}

interface Props {
  onBackToHub: () => void;
  initialFamily?: string;
}

const TIPO_MOVIMENTO: Record<string, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Ajuste de Inventário',
};

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

export function formatPhotoAge(photoDate?: string | null): { text: string; isOld: boolean; fullDate: string } {
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

export async function compressImageFile(file: File, maxDim = 800, quality = 0.75): Promise<string> {
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

export default function AlmoxEstoqueView({ onBackToHub, initialFamily = 'todas' }: Props) {
  const start = initialFamily === 'movimentos' || initialFamily === 'movimentacoes' ? 'todas' : initialFamily || 'todas';
  const [tab, setTab] = useState(start);
  const [painel, setPainel] = useState<'itens' | 'movimentos'>(initialFamily === 'movimentos' || initialFamily === 'movimentacoes' ? 'movimentos' : 'itens');
  const [filtroEstoque, setFiltroEstoque] = useState<'todos' | 'abaixo' | 'zerados' | 'ok'>('todos');
  const [items, setItems] = useState<AlmoxOpsItem[]>([]);
  const [moves, setMoves] = useState<AlmoxMovement[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [familias, setFamilias] = useState<AlmoxFamilia[]>(DEFAULT_FAMILIES);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Escritas que mudam o saldo: a prévia vem do servidor (sem `confirmar`) e só grava no OK.
  const avisarPrevia = useCallback((m: string, tipo?: TipoAviso) => (tipo === 'erro' ? setError(m) : setAviso(m)), []);
  const { pedir: pedirPrevia, elemento: previaElemento } = usePreviaServidor(avisarPrevia);
  const [addOpen, setAddOpen] = useState(false);
  const [familiasModalOpen, setFamiliasModalOpen] = useState(false);
  const [photoModalItem, setPhotoModalItem] = useState<AlmoxOpsItem | null>(null);
  const [selected, setSelected] = useState<AlmoxOpsItem | null>(null);
  const [countStatus, setCountStatus] = useState<CountStatus | null>(null);
  const [countDate, setCountDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Count item states: handles pack vs loose units per item
  const [countEntries, setCountEntries] = useState<
    Record<
      string,
      {
        mode: 'pack' | 'direct';
        packFactor: number;
        packName: string;
        packs: number;
        loose: number;
        directQty: string;
        totalQty: number;
      }
    >
  >({});

  const isCount = tab === 'contagem';
  const section = isCount || tab === 'todas' ? '' : tab;

  // Load families dynamically from backend
  const loadFamilias = useCallback(async () => {
    try {
      const res = await apiJson<{ familias: AlmoxFamilia[] }>('/almox/familias');
      if (res.familias && res.familias.length > 0) {
        setFamilias(res.familias);
      }
    } catch {
      // Keep default families if endpoint fails
    }
  }, []);

  const familyLabelMap = useMemo(() => {
    const map: Record<string, string> = { almoxarifado: 'Outros Consumíveis' };
    for (const f of familias) {
      map[f.id] = f.label;
    }
    return map;
  }, [familias]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = section ? `?section=${encodeURIComponent(section)}` : '';
      const [list, mov, eq, count] = await Promise.all([
        apiJson<{ items: AlmoxOpsItem[] }>(`/almox/items${query}`),
        apiJson<{ movements: AlmoxMovement[] }>('/almox/movements?limit=200'),
        section === 'pecas'
          ? apiJson<{ equipments: Equipment[] }>('/almox/equipments').catch(() => ({ equipments: [] as Equipment[] }))
          : Promise.resolve({ equipments: [] as Equipment[] }),
        apiJson<CountStatus>('/almox/counts/latest').catch(() => null),
      ]);
      setItems(list.items ?? []);
      setMoves(mov.movements ?? []);
      setEquipments(eq.equipments ?? []);
      if (count) setCountStatus(count);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar o estoque');
    } finally {
      setLoading(false);
    }
  }, [section]);

  useEffect(() => {
    void loadFamilias();
  }, [loadFamilias]);

  useEffect(() => {
    void load();
  }, [load]);

  // Synchronize count entries whenever items or count mode opens
  useEffect(() => {
    if (!isCount) return;
    setCountEntries((prev) => {
      const next = { ...prev };
      let updated = false;

      for (const it of items) {
        if (!next[it.code]) {
          // Initialize pack factor from item config, last count, or fallback
          const factor = it.lastPackQty || it.defaultPackQty || 12;
          const packName = it.lastPackName || it.defaultPackName || 'Embalagem';
          const isPackMode = (it.lastPackQty != null && it.lastPackQty > 1) || (it.defaultPackQty != null && it.defaultPackQty > 1);

          const packs = factor > 1 ? Math.floor(it.qtyOnHand / factor) : 0;
          const loose = factor > 1 ? Number((it.qtyOnHand % factor).toFixed(3)) : it.qtyOnHand;

          next[it.code] = {
            mode: isPackMode ? 'pack' : 'direct',
            packFactor: factor,
            packName,
            packs,
            loose,
            directQty: String(it.qtyOnHand),
            totalQty: it.qtyOnHand,
          };
          updated = true;
        }
      }
      return updated ? next : prev;
    });
  }, [isCount, items]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return items.filter((it) => {
      if (filtroEstoque === 'abaixo' && !it.belowMin) return false;
      if (filtroEstoque === 'zerados' && it.qtyOnHand > 0) return false;
      if (filtroEstoque === 'ok' && (it.belowMin || it.qtyOnHand === 0)) return false;
      if (!n) return true;
      return it.code.toLowerCase().includes(n) || (it.description || '').toLowerCase().includes(n) || (it.location || '').toLowerCase().includes(n);
    });
  }, [items, q, filtroEstoque]);

  const familyCodes = useMemo(() => new Set(items.map((it) => it.code)), [items]);
  const familyMoves = useMemo(
    () =>
      moves
        .filter((m) => familyCodes.has(m.itemCode))
        .sort((a, b) => (b.occurredAt || '').localeCompare(a.occurredAt || '')),
    [moves, familyCodes],
  );

  const ultimaEntrada = (code: string) =>
    familyMoves.find((m) => m.itemCode === code && (m.movementType || '').toLowerCase() === 'entrada');

  const ultimoSetor = (code: string) => familyMoves.find((m) => m.itemCode === code && m.sector)?.sector;

  const maquinasDaPeca = (code: string) =>
    equipments.filter((eq) => (eq.pecaCodes || []).includes(code)).map((eq) => eq.name);

  const stats = useMemo(() => {
    const totalItens = items.length;
    const abaixoMin = items.filter((it) => it.belowMin).length;
    const zerados = items.filter((it) => it.qtyOnHand <= 0).length;
    const ok = items.filter((it) => !it.belowMin && it.qtyOnHand !== 0).length;
    const totalSaldo = items.reduce((acc, it) => acc + (it.qtyOnHand || 0), 0);
    return { totalItens, abaixoMin, zerados, ok, totalSaldo };
  }, [items]);

  const saveConfig = async (payload: ItemConfigPayload) => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await apiJson<{ item: AlmoxOpsItem }>(
        `/almox/items/${encodeURIComponent(selected.code)}/config?confirmar=true`,
        { method: 'PUT', body: JSON.stringify(payload) },
      );
      setSelected(res.item);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const submitMovement = async (payload: MovementPayload) => {
    const tipo = payload.movementType;
    const rotulo = tipo === 'entrada' ? 'Entrada' : tipo === 'saida' ? 'Saída' : 'Ajuste';
    setBusy(true);
    try {
      await pedirPrevia({
        url: '/almox/movements',
        init: { method: 'POST', body: JSON.stringify(payload) },
        titulo: `${rotulo} de estoque`,
        confirmarRotulo: 'OK, lançar',
        linhas: (d) => {
          const m = d?.movement ?? {};
          return [{
            titulo: `${m.itemDescription || m.itemCode || ''}`.trim() || 'Item',
            detalhe: `${rotulo} de ${Number(m.quantity ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}`,
          }];
        },
        erroPadrao: 'Não foi possível lançar o movimento.',
        aoConcluir: () => load(),
      });
    } finally {
      setBusy(false);
    }
  };

  const askBuy = async (it: AlmoxOpsItem) => {
    const qty = Math.max(it.idealQty - it.qtyOnHand, 1);
    setBusy(true);
    setError(null);
    setAviso(null);
    try {
      await apiJson('/almox/demands?confirmar=true', {
        method: 'POST',
        body: JSON.stringify({
          title: it.description || it.code,
          origin: 'minimo',
          qty,
          items: [{ itemCode: it.code, qtyRequested: qty }],
        }),
      });
      setAviso(`Solicitação de compra gerada para "${it.description || it.code}".`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Não foi possível solicitar a compra.');
    } finally {
      setBusy(false);
    }
  };

  const fromMin = async () => {
    setBusy(true);
    setError(null);
    setAviso(null);
    try {
      await apiJson('/almox/demands/from-min?confirmar=true', { method: 'POST', body: '{}' });
      setAviso('Solicitações de compra geradas para todos os itens abaixo do estoque mínimo.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Nenhum item abaixo do mínimo no momento.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteItem = async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/almox/items/${encodeURIComponent(code)}?confirmar=true`, { method: 'DELETE' });
      setAviso(`Item "${code}" foi excluído com sucesso do almoxarifado.`);
      setSelected(null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir o item.');
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const handleMoveCategory = async (code: string, newSection: string) => {
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/almox/items/${encodeURIComponent(code)}/config?confirmar=true`, {
        method: 'PUT',
        body: JSON.stringify({ section: newSection }),
      });
      setAviso('Categoria do item atualizada com sucesso.');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Não foi possível mover a categoria do item.');
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const saveCount = async () => {
    setBusy(true);
    setError(null);
    setAviso(null);
    try {
      await pedirPrevia({
        url: '/almox/counts',
        init: {
          method: 'POST',
          body: JSON.stringify({
            countedAt: countDate,
            lines: items.map((it) => {
              const entry = countEntries[it.code];
              const countedQty = entry ? entry.totalQty : it.qtyOnHand;
              return {
                itemCode: it.code,
                countedQty: Number.isFinite(countedQty) ? countedQty : it.qtyOnHand,
                packQty: entry && entry.mode === 'pack' ? entry.packFactor : undefined,
                packName: entry && entry.mode === 'pack' ? entry.packName : undefined,
              };
            }),
          }),
        },
        titulo: 'Concluir contagem programada',
        confirmarRotulo: 'OK, aplicar contagem',
        linhas: (d) => [
          { titulo: 'Itens contados', detalhe: String(items.length) },
          { titulo: 'Saídas apuradas (saldo menor que o do sistema)', detalhe: String(d?.saidas ?? 0) },
          { titulo: 'Entradas/devoluções (saldo maior que o do sistema)', detalhe: String(d?.entradas ?? 0) },
        ],
        avisos: () => ['O saldo físico do almoxarifado será ajustado para as quantidades contadas.'],
        erroPadrao: 'Não foi possível salvar a contagem programada.',
        aoConcluir: async (res) => {
          const saidas = Number(res?.saidas ?? 0);
          const entradas = Number(res?.entradas ?? 0);
          const partes: string[] = [];
          if (saidas > 0) partes.push(saidas === 1 ? '1 item com saída apurada' : `${saidas} itens com saídas apuradas`);
          if (entradas > 0) partes.push(entradas === 1 ? '1 item com devolução/entrada' : `${entradas} itens com devolução/entrada`);
          setAviso(
            partes.length
              ? `Contagem programada concluída com sucesso! ${partes.join(' e ')}. O saldo físico foi atualizado no almoxarifado.`
              : 'Contagem programada concluída! Nenhum consumo ou saída registrado no período.',
          );
          setCountEntries({});
          await load();
        },
      });
    } finally {
      setBusy(false);
    }
  };

  // Helper to update a count entry
  const updateCountEntry = (
    code: string,
    updater: (prev: {
      mode: 'pack' | 'direct';
      packFactor: number;
      packName: string;
      packs: number;
      loose: number;
      directQty: string;
      totalQty: number;
    }) => {
      mode: 'pack' | 'direct';
      packFactor: number;
      packName: string;
      packs: number;
      loose: number;
      directQty: string;
      totalQty: number;
    },
  ) => {
    setCountEntries((prev) => {
      const cur = prev[code] || {
        mode: 'direct',
        packFactor: 12,
        packName: 'Embalagem',
        packs: 0,
        loose: 0,
        directQty: '0',
        totalQty: 0,
      };
      return { ...prev, [code]: updater(cur) };
    });
  };

  return (
    <>
    {previaElemento}
    <AppLayout
      moduleTitle="Estoque e Almoxarifado"
      onBackToHub={onBackToHub}
      sidebarItems={[
        { id: 'todas', label: 'Todas as Famílias', icon: Layers },
        ...familias.map((f) => ({
          id: f.id,
          label: f.label,
          icon: f.id === 'supermercado' ? Store : Warehouse,
          badge: f.id === tab && stats.abaixoMin > 0 ? stats.abaixoMin : undefined,
        })),
        { id: 'contagem', label: 'Contagem Programada', icon: ClipboardCheck, badge: countStatus?.due ? 'Pendente' : undefined },
      ]}
      activeTab={tab}
      onTabChange={(id) => {
        setTab(id);
        setPainel('itens');
        setFiltroEstoque('todos');
        setAviso(null);
        setSelected(null);
        setQ('');
      }}
      headerActions={
        <div className="flex items-center gap-2">
          {isCount ? (
            <button
              type="button"
              onClick={() => void saveCount()}
              disabled={busy || loading}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-zinc-900 text-white cursor-pointer hover:bg-zinc-800 disabled:opacity-50 shadow-xs"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Lançar Saídas e Atualizar Saldo
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTab('contagem');
                setPainel('itens');
                setSelected(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-zinc-900 text-white cursor-pointer hover:bg-zinc-800 shadow-xs"
              title="Iniciar rotina de contagem semanal do estoque"
            >
              <ClipboardCheck className="h-4 w-4 text-emerald-400" />
              Iniciar Contagem Semanal
            </button>
          )}
          {stats.abaixoMin > 0 && !isCount && (
            <button
              type="button"
              onClick={() => void fromMin()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 cursor-pointer disabled:opacity-40"
              title="Gerar ordens de compra para itens abaixo do mínimo"
            >
              <ShoppingCart className="h-3.5 w-3.5 text-amber-700" />
              Repor Mínimos ({stats.abaixoMin})
            </button>
          )}

          <button
            type="button"
            onClick={() => setFamiliasModalOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 cursor-pointer shadow-xs"
            title="Gerenciar e adicionar famílias de produtos"
          >
            <Tag className="h-3.5 w-3.5 text-zinc-500" />
            <span className="hidden sm:inline">Famílias</span>
          </button>

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white cursor-pointer shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            {isCount ? 'Item Não Listado' : 'Novo Item'}
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
          <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {aviso && (
          <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" />
            <span>{aviso}</span>
          </div>
        )}

        {isCount ? (
          <WeeklyCount
            items={items}
            familias={familias}
            loading={loading}
            q={q}
            onQ={setQ}
            countDate={countDate}
            onDate={setCountDate}
            countEntries={countEntries}
            onUpdateEntry={updateCountEntry}
            status={countStatus}
            onAddNewItem={() => setAddOpen(true)}
            onOpenPhoto={(it) => setPhotoModalItem(it)}
            familyLabelMap={familyLabelMap}
          />
        ) : (
          <>
            {/* Filter and View Toggles */}
            <div className="bg-white rounded-2xl p-3 border border-zinc-200 shadow-xs space-y-3">
              <ReportTabs
                abas={[
                  { id: 'itens', label: 'Itens e Saldos', contagem: stats.totalItens },
                  { id: 'movimentos', label: 'Histórico de Movimentos', contagem: familyMoves.length },
                ]}
                ativa={painel}
                onChange={(id) => setPainel(id as typeof painel)}
              />
              {painel === 'itens' && (
                <ReportTabs
                  abas={[
                    { id: 'todos', label: 'Todos', contagem: stats.totalItens },
                    { id: 'abaixo', label: 'Abaixo do Mínimo', contagem: stats.abaixoMin },
                    { id: 'zerados', label: 'Zerados', contagem: stats.zerados },
                    { id: 'ok', label: 'Estoque OK', contagem: stats.ok },
                  ]}
                  ativa={filtroEstoque}
                  onChange={(id) => setFiltroEstoque(id as typeof filtroEstoque)}
                />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[14rem]">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar código, descrição ou localização..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-200 text-sm bg-zinc-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11"
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3 bg-white border border-zinc-200 rounded-2xl">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-700" />
                <span className="text-xs font-semibold text-zinc-500">Carregando itens do estoque...</span>
              </div>
            ) : painel === 'movimentos' ? (
              <div className="space-y-3">
                {/* Mobile View: Cards */}
                <div className="block md:hidden space-y-2.5">
                  {familyMoves
                    .filter((m) => {
                      const n = q.trim().toLowerCase();
                      if (!n) return true;
                      return (m.itemCode || '').toLowerCase().includes(n) || (m.itemDescription || '').toLowerCase().includes(n);
                    })
                    .slice(0, 100)
                    .map((m) => {
                      const isEntrada = (m.movementType || '').toLowerCase() === 'entrada';
                      return (
                        <div key={m.id} className="bg-white border border-zinc-200 rounded-2xl p-3.5 shadow-xs space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-bold text-sm text-zinc-900 leading-snug">{m.itemDescription || m.itemCode}</p>
                              <p className="font-mono text-[11px] text-zinc-400">{m.itemCode}</p>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border shrink-0 ${
                                isEntrada
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}
                            >
                              {TIPO_MOVIMENTO[(m.movementType || '').toLowerCase()] || m.movementType}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-100">
                            <span className="font-bold text-zinc-800">
                              Quantidade: {m.quantity}
                            </span>
                            <span className="text-zinc-500 font-mono">{dataBr(m.occurredAt)}</span>
                          </div>
                          {(m.sector || m.variantLabel || m.totalPaid != null) && (
                            <div className="text-[11px] text-zinc-500 bg-zinc-50 rounded-xl px-2.5 py-1.5 flex flex-wrap gap-2">
                              {m.sector && <span>Setor: <strong>{m.sector}</strong></span>}
                              {m.variantLabel && <span>Var: {m.variantLabel}</span>}
                              {m.totalPaid != null && <span>Total: {formatMoney(m.totalPaid)}</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  {familyMoves.length === 0 && (
                    <div className="bg-white border border-zinc-200 rounded-2xl p-10 text-center text-zinc-500 text-sm">
                      Nenhuma movimentação registrada nesta família.
                    </div>
                  )}
                </div>

                {/* Desktop View: Table */}
                <div className="hidden md:block bg-white border border-zinc-200 rounded-2xl shadow-xs overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 text-left border-b border-zinc-100 bg-zinc-50/50">
                        <th className="px-4 py-3">Data</th>
                        <th className="px-4 py-3">Item / Código</th>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3 text-right">Quantidade</th>
                        <th className="px-4 py-3">Setor / Destino</th>
                        <th className="px-4 py-3">Detalhes / Valores</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {familyMoves
                        .filter((m) => {
                          const n = q.trim().toLowerCase();
                          if (!n) return true;
                          return (m.itemCode || '').toLowerCase().includes(n) || (m.itemDescription || '').toLowerCase().includes(n);
                        })
                        .slice(0, 150)
                        .map((m) => {
                          const isEntrada = (m.movementType || '').toLowerCase() === 'entrada';
                          const detalhe = [
                            m.variantLabel,
                            m.packLabel,
                            m.packCount ? `${m.packCount} pacotes` : null,
                            m.totalPaid != null ? formatMoney(m.totalPaid) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ');
                          return (
                            <tr key={m.id} className="hover:bg-zinc-50/70 transition-colors">
                              <td className="px-4 py-3 font-mono text-xs text-zinc-600">{dataBr(m.occurredAt)}</td>
                              <td className="px-4 py-3">
                                <p className="font-bold text-zinc-900">{m.itemDescription || m.itemCode}</p>
                                <p className="font-mono text-[11px] text-zinc-400">{m.itemCode}</p>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                    isEntrada
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-rose-50 text-rose-700 border-rose-200'
                                  }`}
                                >
                                  {TIPO_MOVIMENTO[(m.movementType || '').toLowerCase()] || m.movementType}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-black text-zinc-900">{m.quantity}</td>
                              <td className="px-4 py-3 text-zinc-600">{m.sector || '—'}</td>
                              <td className="px-4 py-3 text-zinc-500 text-xs">{detalhe || '—'}</td>
                            </tr>
                          );
                        })}
                      {familyMoves.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center text-zinc-400 text-sm">
                            Nenhuma movimentação registrada nesta categoria.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Mobile View: Touch-Friendly Cards */}
                <div className="block md:hidden space-y-2.5">
                  {filtered.map((it) => {
                    const entrada = section === 'supermercado' ? ultimaEntrada(it.code) : null;
                    const pacote = entrada
                      ? [entrada.variantLabel, entrada.packLabel, entrada.totalPaid != null ? formatMoney(entrada.totalPaid) : null]
                          .filter(Boolean)
                          .join(' · ')
                      : '';
                    const isZero = it.qtyOnHand <= 0;
                    const photoAge = formatPhotoAge(it.photoDate);

                    return (
                      <div
                        key={it.code}
                        onClick={() => setSelected(it)}
                        className="bg-white border border-zinc-200 hover:border-zinc-400 rounded-2xl p-4 shadow-xs space-y-3 transition-all cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-3">
                          {/* Photo Thumbnail */}
                          {it.photoData ? (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setPhotoModalItem(it);
                              }}
                              className="w-14 h-14 rounded-2xl border border-zinc-200 overflow-hidden bg-zinc-100 shrink-0 cursor-pointer shadow-xs relative group"
                              title="Ver foto ampliada e data de registro"
                            >
                              <img src={it.photoData} alt={it.description} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Maximize2 className="w-4 h-4 text-white" />
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPhotoModalItem(it);
                              }}
                              className="w-14 h-14 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 flex flex-col items-center justify-center shrink-0 text-zinc-400 hover:text-zinc-600 hover:border-zinc-400 transition-colors cursor-pointer"
                              title="Adicionar foto do item"
                            >
                              <Camera className="w-4 h-4" />
                              <span className="text-[9px] font-bold mt-0.5">+ Foto</span>
                            </button>
                          )}

                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-sm text-zinc-900 leading-snug truncate">{it.description}</h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-xs text-zinc-400">{it.code}</span>
                              {it.defaultPackQty && it.defaultPackQty > 1 ? (
                                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-md">
                                  {it.defaultPackName || 'Fardo'} c/ {it.defaultPackQty}
                                </span>
                              ) : null}
                            </div>
                            {it.photoData && (
                              <p className={`text-[10px] font-medium mt-1 ${photoAge.isOld ? 'text-amber-600' : 'text-zinc-400'}`}>
                                📷 {photoAge.text}
                              </p>
                            )}
                          </div>

                          <div className="shrink-0">
                            {it.belowMin ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-amber-50 text-amber-700 border-amber-200">
                                Abaixo Mín.
                              </span>
                            ) : isZero ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-rose-50 text-rose-700 border-rose-200">
                                Zerado
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-emerald-50 text-emerald-700 border-emerald-200">
                                OK
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 bg-zinc-50 rounded-xl p-2.5 text-xs">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Saldo em Estoque</span>
                            <span className={`text-base font-black ${isZero ? 'text-rose-600' : 'text-zinc-900'}`}>
                              {it.qtyOnHand} <span className="text-xs font-semibold text-zinc-500">{it.unit}</span>
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Metas (Mín / Ideal)</span>
                            <span className="text-sm font-bold text-zinc-700">
                              {it.minQty} / {it.idealQty} {it.unit}
                            </span>
                          </div>
                        </div>

                        {(it.location || ultimoSetor(it.code) || pacote) && (
                          <div className="text-[11px] text-zinc-500 space-y-0.5">
                            {it.location && <p>Localização: <strong>{it.location}</strong></p>}
                            {ultimoSetor(it.code) && <p>Último setor: <strong>{ultimoSetor(it.code)}</strong></p>}
                            {pacote && <p>Última compra: {pacote}</p>}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(it);
                              }}
                              className="inline-flex items-center gap-1 text-xs font-bold text-zinc-800 bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1.5 rounded-lg cursor-pointer"
                              title="Apurar contagem deste item"
                            >
                              <ClipboardCheck className="h-3.5 w-3.5 text-zinc-600" />
                              Contar
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void askBuy(it);
                              }}
                              disabled={busy}
                              className="inline-flex items-center gap-1 text-xs font-bold text-zinc-700 hover:text-zinc-900 px-2.5 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 cursor-pointer"
                            >
                              <ShoppingCart className="h-3.5 w-3.5 text-zinc-500" />
                              Comprar
                            </button>
                          </div>
                          <span className="text-xs font-bold text-zinc-900 flex items-center gap-1">
                            Ficha <ChevronRight className="h-4 w-4 text-zinc-400" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {filtered.length === 0 && (
                    <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center text-zinc-400 text-sm">
                      Nenhum item localizado com os filtros selecionados.
                    </div>
                  )}
                </div>

                {/* Desktop View: High-density Table */}
                <div className="hidden md:block bg-white border border-zinc-200 rounded-2xl shadow-xs overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 text-left border-b border-zinc-100 bg-zinc-50/50">
                        <th className="px-4 py-3">Item / Código</th>
                        <th className="px-4 py-3">Localização</th>
                        <th className="px-4 py-3">Último Setor</th>
                        <th className="px-4 py-3 text-right">Saldo Atual</th>
                        <th className="px-4 py-3 text-right">Objetivo (Mín / Ideal)</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {filtered.map((it) => {
                        const entrada = section === 'supermercado' ? ultimaEntrada(it.code) : null;
                        const maquinas = section === 'pecas' ? maquinasDaPeca(it.code) : [];
                        const pacote = entrada
                          ? [entrada.variantLabel, entrada.packLabel, entrada.totalPaid != null ? formatMoney(entrada.totalPaid) : null]
                              .filter(Boolean)
                              .join(' · ')
                          : '';
                        const photoAge = formatPhotoAge(it.photoDate);

                        return (
                          <tr
                            key={it.code}
                            onClick={() => setSelected(it)}
                            className="hover:bg-zinc-50/80 transition-colors cursor-pointer"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {it.photoData ? (
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPhotoModalItem(it);
                                    }}
                                    className="w-11 h-11 rounded-xl border border-zinc-200 overflow-hidden bg-zinc-100 shrink-0 cursor-pointer shadow-xs relative group"
                                    title="Ver foto ampliada e data"
                                  >
                                    <img src={it.photoData} alt={it.description} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                      <Maximize2 className="w-3.5 h-3.5 text-white" />
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPhotoModalItem(it);
                                    }}
                                    className="w-11 h-11 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 flex items-center justify-center shrink-0 text-zinc-400 hover:text-zinc-600 hover:border-zinc-400 transition-colors cursor-pointer"
                                    title="Adicionar foto do item"
                                  >
                                    <Camera className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-bold text-zinc-900">{it.description}</p>
                                    {it.defaultPackQty && it.defaultPackQty > 1 ? (
                                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-md">
                                        {it.defaultPackName || 'Fardo'} c/ {it.defaultPackQty}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <p className="font-mono text-[11px] text-zinc-400">{it.code}</p>
                                    {it.photoData && (
                                      <span className={`text-[10px] ${photoAge.isOld ? 'text-amber-600 font-bold' : 'text-zinc-400'}`}>
                                        · 📷 {photoAge.text}
                                      </span>
                                    )}
                                  </div>
                                  {pacote && <p className="text-[11px] text-zinc-500 mt-0.5">Última compra: {pacote}</p>}
                                  {maquinas.length > 0 && <p className="text-[11px] text-zinc-500 mt-0.5">Máquinas: {maquinas.join(', ')}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-zinc-600 text-xs">{it.location || '—'}</td>
                            <td className="px-4 py-3 text-zinc-600 text-xs">{ultimoSetor(it.code) || '—'}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`font-black text-base ${it.qtyOnHand <= 0 ? 'text-rose-600' : 'text-zinc-900'}`}>
                                {it.qtyOnHand}
                              </span>{' '}
                              <span className="text-xs font-semibold text-zinc-400">{it.unit}</span>
                            </td>
                            <td className="px-4 py-3 text-right text-xs">
                              <span className="font-bold text-zinc-700">{it.minQty}</span>{' '}
                              <span className="text-zinc-400">/</span>{' '}
                              <span className="font-bold text-zinc-900">{it.idealQty}</span>
                            </td>
                            <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-2">
                                {it.belowMin && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-amber-50 text-amber-700 border-amber-200">
                                    Abaixo do Mínimo
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setSelected(it)}
                                  className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-800 cursor-pointer shadow-2xs"
                                  title="Apurar contagem deste item"
                                >
                                  <ClipboardCheck className="h-3 w-3 text-zinc-600" />
                                  Contar
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void askBuy(it)}
                                  className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 cursor-pointer"
                                >
                                  <ShoppingCart className="h-3 w-3" />
                                  Solicitar Compra
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center text-zinc-400 text-sm">
                            Nenhum item cadastrado nesta categoria.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {selected && (
          <ItemDrawer
            item={selected}
            movements={moves.filter((m) => m.itemCode === selected.code)}
            familias={familias}
            onClose={() => setSelected(null)}
            onSaveConfig={saveConfig}
            onDeleteItem={handleDeleteItem}
            onMoveCategory={handleMoveCategory}
            onCountSaved={async () => { await load(); }}
            onRequestBuy={askBuy}
            busy={busy}
          />
        )}

        {addOpen && (
          <AddItem
            familias={familias}
            defaultSection={section || 'supermercado'}
            onClose={() => setAddOpen(false)}
            onSaved={() => {
              setAddOpen(false);
              void load();
            }}
            onItemCreated={(newItem) => {
              setAddOpen(false);
              setItems((prev) => [newItem, ...prev]);
              // Also add to countEntries if counting
              const factor = newItem.defaultPackQty || 12;
              setCountEntries((prev) => ({
                ...prev,
                [newItem.code]: {
                  mode: newItem.defaultPackQty && newItem.defaultPackQty > 1 ? 'pack' : 'direct',
                  packFactor: factor,
                  packName: newItem.defaultPackName || 'Embalagem',
                  packs: factor > 1 ? Math.floor(newItem.qtyOnHand / factor) : 0,
                  loose: factor > 1 ? newItem.qtyOnHand % factor : newItem.qtyOnHand,
                  directQty: String(newItem.qtyOnHand),
                  totalQty: newItem.qtyOnHand,
                },
              }));
            }}
          />
        )}

        {familiasModalOpen && (
          <GerenciarFamiliasModal
            familias={familias}
            onClose={() => setFamiliasModalOpen(false)}
            onUpdated={async () => {
              await loadFamilias();
              await load();
            }}
          />
        )}

        {photoModalItem && (
          <PhotoLightboxModal
            item={photoModalItem}
            onClose={() => setPhotoModalItem(null)}
            onPhotoUpdated={(updatedItem) => {
              setPhotoModalItem(updatedItem);
              setItems((prev) => prev.map((it) => (it.code === updatedItem.code ? updatedItem : it)));
              if (selected && selected.code === updatedItem.code) {
                setSelected(updatedItem);
              }
            }}
          />
        )}
      </div>
    </AppLayout>
    </>
  );
}

function WeeklyCount({
  items,
  familias = [],
  loading,
  q,
  onQ,
  countDate,
  onDate,
  countEntries,
  onUpdateEntry,
  status,
  onAddNewItem,
  onOpenPhoto,
  familyLabelMap,
}: {
  items: AlmoxOpsItem[];
  familias?: AlmoxFamilia[];
  loading: boolean;
  q: string;
  onQ: (value: string) => void;
  countDate: string;
  onDate: (value: string) => void;
  countEntries: Record<
    string,
    {
      mode: 'pack' | 'direct';
      packFactor: number;
      packName: string;
      packs: number;
      loose: number;
      directQty: string;
      totalQty: number;
    }
  >;
  onUpdateEntry: (
    code: string,
    updater: (prev: {
      mode: 'pack' | 'direct';
      packFactor: number;
      packName: string;
      packs: number;
      loose: number;
      directQty: string;
      totalQty: number;
    }) => {
      mode: 'pack' | 'direct';
      packFactor: number;
      packName: string;
      packs: number;
      loose: number;
      directQty: string;
      totalQty: number;
    },
  ) => void;
  status: CountStatus | null;
  onAddNewItem: () => void;
  onOpenPhoto: (it: AlmoxOpsItem) => void;
  familyLabelMap: Record<string, string>;
}) {
  const [filterMode, setFilterMode] = useState<'todos' | 'com_saida' | 'abaixo_min' | 'sem_saida' | 'conferidos'>('todos');
  const [filterFamily, setFilterFamily] = useState<string>('todas');
  const [editingFactorItem, setEditingFactorItem] = useState<string | null>(null);
  const [customFactorVal, setCustomFactorVal] = useState<string>('12');

  const termo = q.trim().toLowerCase();
  const listaFiltradaBusca = items.filter((it) => {
    if (filterFamily !== 'todas' && it.section !== filterFamily) return false;
    if (!termo) return true;
    return (
      it.code.toLowerCase().includes(termo) ||
      (it.description || '').toLowerCase().includes(termo) ||
      (it.location || '').toLowerCase().includes(termo)
    );
  });

  // KPI Calculations
  const totalItens = items.length;
  let conferidos = 0;
  let itensComSaida = 0;
  let itensSemSaida = 0;
  let totalUnidadesSaidas = 0;
  let totalUnidadesEntradas = 0;
  let itensAbaixoMinimo = 0;
  let totalSugeridoRepor = 0;

  for (const it of items) {
    const entry = countEntries[it.code];
    const valFinal = entry ? entry.totalQty : it.qtyOnHand;

    if (entry != null) {
      conferidos += 1;
    }

    const saidas = it.qtyOnHand - valFinal;

    if (saidas > 0.0001) {
      itensComSaida += 1;
      totalUnidadesSaidas += saidas;
    } else if (saidas < -0.0001) {
      totalUnidadesEntradas += Math.abs(saidas);
    } else {
      itensSemSaida += 1;
    }

    if (it.minQty > 0 && valFinal < it.minQty) {
      itensAbaixoMinimo += 1;
      totalSugeridoRepor += Math.max(0, it.idealQty - valFinal);
    }
  }

  const progresso = totalItens > 0 ? Math.round((conferidos / totalItens) * 100) : 0;
  const mediaSaidaPorItem = itensComSaida > 0 ? (totalUnidadesSaidas / itensComSaida).toFixed(1) : '0';
  const percentualConsumo = totalItens > 0 ? Math.round((itensComSaida / totalItens) * 100) : 0;

  const lista = listaFiltradaBusca.filter((it) => {
    const entry = countEntries[it.code];
    const valFinal = entry ? entry.totalQty : it.qtyOnHand;
    const saidas = it.qtyOnHand - valFinal;

    if (filterMode === 'com_saida') return saidas > 0.0001;
    if (filterMode === 'abaixo_min') return it.minQty > 0 && valFinal < it.minQty;
    if (filterMode === 'sem_saida') return Math.abs(saidas) <= 0.0001;
    if (filterMode === 'conferidos') return entry != null;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Banner Explicativo da Rotina de Contagem Programada */}
      <div
        className={`rounded-2xl border p-4 text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs ${
          status?.due ? 'border-amber-300 bg-amber-50/80 text-amber-900' : 'border-zinc-200 bg-white text-zinc-700'
        }`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ClipboardCheck className={`h-4 w-4 ${status?.due ? 'text-amber-700' : 'text-emerald-600'}`} />
            <h4 className="font-bold text-sm">Contagem Programada (Apuração de Saídas e Consumo Real)</h4>
            {status?.due ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-200 text-amber-900">
                Pendente
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                Em Dia
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-600 leading-relaxed max-w-3xl">
            Como não há registros de saídas diárias manuais para estes itens, a contagem física apura exatamente{' '}
            <strong>quantas unidades saíram (consumo)</strong>. Você pode contar por <strong>embalagem fechada + solto</strong> ou direto em unidades.
          </p>
          {status?.lastCountedAt && (
            <p className="text-[11px] text-zinc-400">Última contagem realizada em {dataBr(status.lastCountedAt)}.</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="text-xs font-bold text-zinc-600 flex items-center gap-2">
            <span>Data da Contagem:</span>
            <input
              type="date"
              value={countDate}
              onChange={(e) => onDate(e.target.value)}
              className="rounded-xl border border-zinc-200 px-3 py-1.5 text-xs text-zinc-900 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </label>
        </div>
      </div>

      {/* Painel de Indicadores de Consumo, Médias e Saúde do Estoque */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Progresso */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            <span>Progresso da Contagem</span>
            <span>{progresso}%</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-black text-zinc-900">
              {conferidos} <span className="text-xs text-zinc-400 font-semibold">/ {totalItens}</span>
            </span>
            <span className="text-xs text-zinc-500 font-bold">itens apurados</span>
          </div>
          <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
            <div className="bg-zinc-900 h-full rounded-full transition-all duration-300" style={{ width: `${progresso}%` }} />
          </div>
        </div>

        {/* Total de Saídas / Consumo */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200 shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Saídas Apuradas (Consumo)</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-amber-700">
              {totalUnidadesSaidas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
            </span>
            <span className="text-xs text-zinc-500 font-bold">unidades saíram</span>
          </div>
          <p className="text-[11px] text-zinc-500 font-medium">
            {itensComSaida} itens consumidos ({percentualConsumo}% do almoxarifado)
          </p>
        </div>

        {/* Ritmo Médio de Consumo */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200 shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Média de Saída</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-zinc-900">~{mediaSaidaPorItem}</span>
            <span className="text-xs text-zinc-500 font-bold">un / item ativo</span>
          </div>
          <p className="text-[11px] text-zinc-500">{itensSemSaida} itens estáveis sem consumo</p>
        </div>

        {/* Situação do Estoque / Reposição */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200 shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Abaixo do Estoque Mínimo</span>
          <span className={`text-xl sm:text-2xl font-black ${itensAbaixoMinimo > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
            {itensAbaixoMinimo} {itensAbaixoMinimo === 1 ? 'item' : 'itens'}
          </span>
          <p className="text-[11px] text-zinc-500">
            {itensAbaixoMinimo > 0 ? `Repor ~${totalSugeridoRepor.toLocaleString('pt-BR')} un para meta ideal` : 'Estoque seguro para operação'}
          </p>
        </div>
      </div>

      {/* Barra de Filtros e Busca de Contagem */}
      <div className="bg-white rounded-2xl p-3 border border-zinc-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
            <button
              type="button"
              onClick={() => setFilterMode('todos')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shrink-0 ${
                filterMode === 'todos' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              Todos ({totalItens})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('com_saida')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shrink-0 ${
                filterMode === 'com_saida'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
              }`}
            >
              Com Saídas ({itensComSaida})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('abaixo_min')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shrink-0 ${
                filterMode === 'abaixo_min'
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
              }`}
            >
              Abaixo do Mínimo ({itensAbaixoMinimo})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('sem_saida')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shrink-0 ${
                filterMode === 'sem_saida'
                  ? 'bg-zinc-700 text-white border-zinc-700'
                  : 'bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200'
              }`}
            >
              Sem Saídas ({itensSemSaida})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('conferidos')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shrink-0 ${
                filterMode === 'conferidos'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              Já Conferidos ({conferidos})
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <select
              value={filterFamily}
              onChange={(e) => setFilterFamily(e.target.value)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11 cursor-pointer shadow-2xs"
            >
              <option value="todas">Todas as Famílias ({items.length})</option>
              {familias.map((f) => {
                const countInFam = items.filter((it) => it.section === f.id).length;
                return (
                  <option key={f.id} value={f.id}>
                    {f.label} ({countInFam})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="relative flex-1 min-w-[14rem]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              value={q}
              onChange={(e) => onQ(e.target.value)}
              placeholder="Buscar item pelo código, nome ou localização..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-200 text-sm bg-zinc-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11"
            />
          </div>

          <button
            type="button"
            onClick={onAddNewItem}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 cursor-pointer shrink-0"
          >
            <PackagePlus className="h-4 w-4" />
            Registrar Item Não Listado
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 bg-white border border-zinc-200 rounded-2xl">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-700" />
          <span className="text-xs font-semibold text-zinc-500">Carregando itens para contagem programada...</span>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Mobile View: Cards táteis com steppers de Embalagem + Solto */}
          <div className="block md:hidden space-y-3">
            {lista.map((it) => {
              const entry = countEntries[it.code] || {
                mode: 'direct',
                packFactor: it.lastPackQty || it.defaultPackQty || 12,
                packName: it.lastPackName || it.defaultPackName || 'Embalagem',
                packs: 0,
                loose: it.qtyOnHand,
                directQty: String(it.qtyOnHand),
                totalQty: it.qtyOnHand,
              };

              const n = entry.totalQty;
              const saidas = it.qtyOnHand - n;
              const belowMin = it.minQty > 0 && n < it.minQty;
              const isZero = n <= 0;
              const faltaParaIdeal = Math.max(0, it.idealQty - n);
              const photoAge = formatPhotoAge(it.photoDate);

              // Mode toggler
              const toggleMode = () => {
                onUpdateEntry(it.code, (cur) => {
                  const nextMode = cur.mode === 'pack' ? 'direct' : 'pack';
                  const factor = cur.packFactor > 1 ? cur.packFactor : 12;
                  if (nextMode === 'pack') {
                    const p = Math.floor(cur.totalQty / factor);
                    const l = Number((cur.totalQty % factor).toFixed(3));
                    return { ...cur, mode: 'pack', packFactor: factor, packs: p, loose: l };
                  } else {
                    return { ...cur, mode: 'direct', directQty: String(cur.totalQty) };
                  }
                });
              };

              // Stepper for packs
              const stepPacks = (delta: number) => {
                onUpdateEntry(it.code, (cur) => {
                  const nextP = Math.max(0, cur.packs + delta);
                  const total = nextP * cur.packFactor + cur.loose;
                  return { ...cur, packs: nextP, totalQty: total, directQty: String(total) };
                });
              };

              // Stepper for loose units
              const stepLoose = (delta: number) => {
                onUpdateEntry(it.code, (cur) => {
                  const nextL = Math.max(0, Number((cur.loose + delta).toFixed(3)));
                  const total = cur.packs * cur.packFactor + nextL;
                  return { ...cur, loose: nextL, totalQty: total, directQty: String(total) };
                });
              };

              // Direct stepper
              const stepDirect = (delta: number) => {
                onUpdateEntry(it.code, (cur) => {
                  const nextVal = Math.max(0, Number((cur.totalQty + delta).toFixed(3)));
                  return { ...cur, totalQty: nextVal, directQty: String(nextVal) };
                });
              };

              // Quick action: Sem Saída (mantém saldo anterior)
              const applySemSaida = () => {
                onUpdateEntry(it.code, (cur) => {
                  const factor = cur.packFactor > 1 ? cur.packFactor : 12;
                  const p = Math.floor(it.qtyOnHand / factor);
                  const l = Number((it.qtyOnHand % factor).toFixed(3));
                  return {
                    ...cur,
                    packs: p,
                    loose: l,
                    totalQty: it.qtyOnHand,
                    directQty: String(it.qtyOnHand),
                  };
                });
              };

              return (
                <div
                  key={it.code}
                  className={`bg-white border rounded-2xl p-4 shadow-xs space-y-3 transition-all ${
                    belowMin
                      ? 'border-rose-300 ring-1 ring-rose-200/50'
                      : saidas > 0
                      ? 'border-amber-200'
                      : 'border-zinc-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Item Thumbnail / Photo */}
                    {it.photoData ? (
                      <div
                        onClick={() => onOpenPhoto(it)}
                        className="w-13 h-13 rounded-2xl border border-zinc-200 overflow-hidden bg-zinc-100 shrink-0 cursor-pointer shadow-xs relative group"
                        title="Ver foto ampliada e data de registro"
                      >
                        <img src={it.photoData} alt={it.description} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Maximize2 className="w-3.5 h-3.5 text-white" />
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenPhoto(it)}
                        className="w-13 h-13 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 flex flex-col items-center justify-center shrink-0 text-zinc-400 hover:text-zinc-600 hover:border-zinc-400 transition-colors cursor-pointer"
                        title="Adicionar foto do item"
                      >
                        <Camera className="w-4 h-4" />
                        <span className="text-[9px] font-bold mt-0.5">+ Foto</span>
                      </button>
                    )}

                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm text-zinc-900 leading-snug truncate">{it.description}</h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-xs text-zinc-400">{it.code}</span>
                        <span className="text-[10px] font-bold text-zinc-500 px-2 py-0.5 rounded-md bg-zinc-100">
                          {familyLabelMap[it.section] || it.section}
                        </span>
                        {it.location && <span className="text-[11px] text-zinc-500">📍 {it.location}</span>}
                      </div>
                      {it.photoData && (
                        <p className={`text-[10px] font-medium mt-1 ${photoAge.isOld ? 'text-amber-600 font-bold' : 'text-zinc-400'}`}>
                          📷 {photoAge.text}
                        </p>
                      )}
                    </div>

                    {/* Consumo apurado no período */}
                    {saidas > 0 ? (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold border shrink-0 bg-amber-50 text-amber-800 border-amber-300 inline-flex items-center gap-1">
                        <TrendingDown className="h-3 w-3 text-amber-700" />
                        Saíram {saidas} {it.unit}
                      </span>
                    ) : saidas < 0 ? (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold border shrink-0 bg-blue-50 text-blue-700 border-blue-200 inline-flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-blue-600" />
                        +{Math.abs(saidas)} {it.unit} (Entrada)
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold border shrink-0 bg-zinc-50 text-zinc-500 border-zinc-200">
                        Sem saídas
                      </span>
                    )}
                  </div>

                  {/* Informações de Saldo Anterior e Metas */}
                  <div className="grid grid-cols-2 gap-2 bg-zinc-50 rounded-xl p-2.5 text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Saldo Anterior</span>
                      <span className="text-sm font-bold text-zinc-800">
                        {it.qtyOnHand} <span className="text-zinc-500 font-normal">{it.unit}</span>
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Objetivo (Mín / Ideal)</span>
                      <span className="text-sm font-bold text-zinc-800">
                        {it.minQty} / {it.idealQty} <span className="text-zinc-500 font-normal">{it.unit}</span>
                      </span>
                    </div>
                  </div>

                  {/* Diagnóstico da Saúde do Estoque */}
                  {isZero ? (
                    <div className="text-[11px] font-bold text-rose-800 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                        Estoque zerado após as saídas!
                      </span>
                      <span>Comprar {it.idealQty} {it.unit}</span>
                    </div>
                  ) : belowMin ? (
                    <div className="text-[11px] font-bold text-amber-900 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-300 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                        Abaixo do mínimo ({it.minQty} {it.unit})
                      </span>
                      <span className="text-amber-800 font-extrabold">Repor +{faltaParaIdeal} {it.unit}</span>
                    </div>
                  ) : null}

                  {/* Toggle do Modo de Contagem */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Como deseja contar este item?
                    </span>
                    <button
                      type="button"
                      onClick={toggleMode}
                      className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 cursor-pointer"
                    >
                      {entry.mode === 'pack' ? (
                        <>
                          <Boxes className="h-3 w-3 text-indigo-600" />
                          <span>Embalagem + Fracionado</span>
                        </>
                      ) : (
                        <>
                          <Package className="h-3 w-3 text-zinc-600" />
                          <span>Direto em Unidades</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Painel Tátil no Modo Embalagem + Fracionado */}
                  {entry.mode === 'pack' ? (
                    <div className="space-y-2.5 bg-indigo-50/40 border border-indigo-100 rounded-xl p-3">
                      {/* Embalagens Fechadas */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-indigo-950 flex items-center gap-1">
                            <Boxes className="h-3.5 w-3.5 text-indigo-600" />
                            Embalagens Fechadas ({entry.packName})
                          </span>

                          {/* Pack Factor Pill with Quick Edit */}
                          {editingFactorItem === it.code ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-zinc-500">c/</span>
                              <input
                                type="number"
                                min="1"
                                value={customFactorVal}
                                onChange={(e) => setCustomFactorVal(e.target.value)}
                                className="w-12 text-center text-xs font-bold border border-indigo-300 rounded px-1 py-0.5 bg-white"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const f = Math.max(1, Number(customFactorVal) || 12);
                                  onUpdateEntry(it.code, (cur) => ({
                                    ...cur,
                                    packFactor: f,
                                    totalQty: cur.packs * f + cur.loose,
                                  }));
                                  setEditingFactorItem(null);
                                }}
                                className="text-[10px] font-bold px-1.5 py-0.5 bg-indigo-600 text-white rounded"
                              >
                                OK
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setCustomFactorVal(String(entry.packFactor));
                                setEditingFactorItem(it.code);
                              }}
                              className="text-[10px] font-bold text-indigo-700 bg-white border border-indigo-200 px-2 py-0.5 rounded-md hover:bg-indigo-50 cursor-pointer flex items-center gap-1"
                              title="Alterar quantas unidades vêm em cada embalagem fechada"
                            >
                              <span>c/ {entry.packFactor} {it.unit}</span>
                              <Edit2 className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => stepPacks(-1)}
                            className="h-10 w-10 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-900 font-bold flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-transform"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={entry.packs}
                            onChange={(e) => {
                              const p = Math.max(0, Number(e.target.value) || 0);
                              onUpdateEntry(it.code, (cur) => ({
                                ...cur,
                                packs: p,
                                totalQty: p * cur.packFactor + cur.loose,
                              }));
                            }}
                            className="flex-1 h-10 text-center font-bold text-base text-zinc-900 border border-indigo-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => stepPacks(1)}
                            className="h-10 w-10 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-900 font-bold flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-transform"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Unidades Soltas / Fracionadas */}
                      <div className="space-y-1">
                        <span className="text-[11px] font-bold text-zinc-700 block">
                          + Unidades Soltas / Fracionadas
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => stepLoose(-1)}
                            className="h-10 w-10 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-900 font-bold flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-transform"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={entry.loose}
                            onChange={(e) => {
                              const l = Math.max(0, Number(e.target.value) || 0);
                              onUpdateEntry(it.code, (cur) => ({
                                ...cur,
                                loose: l,
                                totalQty: cur.packs * cur.packFactor + l,
                              }));
                            }}
                            className="flex-1 h-10 text-center font-bold text-base text-zinc-900 border border-zinc-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                          />
                          <button
                            type="button"
                            onClick={() => stepLoose(1)}
                            className="h-10 w-10 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-900 font-bold flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-transform"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Fórmula de Cálculo em Tempo Real e Botão Sem Saída */}
                      <div className="flex items-center justify-between pt-1 border-t border-indigo-100">
                        <div className="text-xs font-bold text-indigo-950">
                          {entry.packs} {entry.packName}s × {entry.packFactor} + {entry.loose} ={' '}
                          <span className="text-sm font-black text-indigo-700">{entry.totalQty} {it.unit}</span>
                        </div>
                        <button
                          type="button"
                          onClick={applySemSaida}
                          className="px-2.5 py-1 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-900 text-xs font-bold cursor-pointer"
                          title="Preencher com o saldo anterior"
                        >
                          Sem Saída ({it.qtyOnHand})
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Painel Tátil no Modo Direto */
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                          Saldo Físico Atual (Contado em {it.unit}) *
                        </label>
                        <span className="text-[10px] font-bold text-emerald-700">✓ Contado</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => stepDirect(-1)}
                          className="h-11 w-11 rounded-xl border border-zinc-300 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-transform"
                        >
                          <Minus className="h-4 w-4" />
                        </button>

                        <div className="relative flex-1">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            inputMode="decimal"
                            value={entry.directQty}
                            onChange={(e) => {
                              const val = e.target.value;
                              const num = Math.max(0, Number(val) || 0);
                              onUpdateEntry(it.code, (cur) => ({
                                ...cur,
                                directQty: val,
                                totalQty: num,
                              }));
                            }}
                            className="w-full h-11 text-center font-bold text-lg text-zinc-900 border border-zinc-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-400 pointer-events-none">
                            {it.unit}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => stepDirect(1)}
                          className="h-11 w-11 rounded-xl border border-zinc-300 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-transform"
                        >
                          <Plus className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={applySemSaida}
                          className="h-11 px-3 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 text-xs font-bold shrink-0 cursor-pointer"
                          title="Confirmar que não houve saídas no período"
                        >
                          Sem Saída ({it.qtyOnHand})
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {lista.length === 0 && (
              <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center text-zinc-400 text-sm">
                Nenhum item para conferir com os filtros ativos.
              </div>
            )}
          </div>

          {/* Desktop View: Rich Table */}
          <div className="hidden md:block bg-white border border-zinc-200 rounded-2xl shadow-xs overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 text-left border-b border-zinc-100 bg-zinc-50/50">
                  <th className="px-4 py-3">Item / Código</th>
                  <th className="px-4 py-3">Família</th>
                  <th className="px-4 py-3 text-right">Saldo Anterior</th>
                  <th className="px-4 py-3 text-right">Metas (Mín / Ideal)</th>
                  <th className="px-4 py-3 text-center w-72">Saldo Físico Atual</th>
                  <th className="px-4 py-3 text-right">Saídas / Consumo</th>
                  <th className="px-4 py-3 text-right">Status de Reposição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {lista.map((it) => {
                  const entry = countEntries[it.code] || {
                    mode: 'direct',
                    packFactor: it.lastPackQty || it.defaultPackQty || 12,
                    packName: it.lastPackName || it.defaultPackName || 'Embalagem',
                    packs: 0,
                    loose: it.qtyOnHand,
                    directQty: String(it.qtyOnHand),
                    totalQty: it.qtyOnHand,
                  };

                  const n = entry.totalQty;
                  const saidas = it.qtyOnHand - n;
                  const belowMin = it.minQty > 0 && n < it.minQty;
                  const isZero = n <= 0;
                  const faltaParaIdeal = Math.max(0, it.idealQty - n);
                  const photoAge = formatPhotoAge(it.photoDate);

                  const toggleMode = () => {
                    onUpdateEntry(it.code, (cur) => {
                      const nextMode = cur.mode === 'pack' ? 'direct' : 'pack';
                      const factor = cur.packFactor > 1 ? cur.packFactor : 12;
                      if (nextMode === 'pack') {
                        const p = Math.floor(cur.totalQty / factor);
                        const l = Number((cur.totalQty % factor).toFixed(3));
                        return { ...cur, mode: 'pack', packFactor: factor, packs: p, loose: l };
                      } else {
                        return { ...cur, mode: 'direct', directQty: String(cur.totalQty) };
                      }
                    });
                  };

                  return (
                    <tr key={it.code} className="hover:bg-zinc-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {it.photoData ? (
                            <div
                              onClick={() => onOpenPhoto(it)}
                              className="w-10 h-10 rounded-xl border border-zinc-200 overflow-hidden bg-zinc-100 shrink-0 cursor-pointer shadow-xs relative group"
                              title="Ver foto ampliada e data de registro"
                            >
                              <img src={it.photoData} alt={it.description} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Maximize2 className="w-3.5 h-3.5 text-white" />
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpenPhoto(it)}
                              className="w-10 h-10 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 flex items-center justify-center shrink-0 text-zinc-400 hover:text-zinc-600 hover:border-zinc-400 transition-colors cursor-pointer"
                              title="Adicionar foto do item"
                            >
                              <Camera className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <div>
                            <p className="font-bold text-zinc-900">{it.description}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-[11px] text-zinc-400">{it.code}</span>
                              {it.location && <span className="text-[11px] text-zinc-500">📍 {it.location}</span>}
                              {it.photoData && (
                                <span className={`text-[10px] ${photoAge.isOld ? 'text-amber-600 font-bold' : 'text-zinc-400'}`}>
                                  · 📷 {photoAge.text}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 text-xs">
                        {familyLabelMap[it.section] || it.section}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-zinc-700">
                        {it.qtyOnHand} <span className="text-xs font-normal text-zinc-400">{it.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        <span className="font-bold text-zinc-700">{it.minQty}</span>{' '}
                        <span className="text-zinc-400">/</span>{' '}
                        <span className="font-bold text-zinc-900">{it.idealQty}</span>
                      </td>
                      <td className="px-4 py-2">
                        {entry.mode === 'pack' ? (
                          <div className="flex flex-col items-center gap-1.5 bg-indigo-50/50 p-2 rounded-xl border border-indigo-100">
                            <div className="flex items-center gap-1.5 text-xs">
                              <input
                                type="number"
                                min="0"
                                value={entry.packs}
                                onChange={(e) => {
                                  const p = Math.max(0, Number(e.target.value) || 0);
                                  onUpdateEntry(it.code, (cur) => ({
                                    ...cur,
                                    packs: p,
                                    totalQty: p * cur.packFactor + cur.loose,
                                  }));
                                }}
                                className="w-14 text-center font-bold text-xs rounded-lg border border-indigo-200 px-1 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                                placeholder="Pcts"
                              />
                              <span className="text-[11px] text-indigo-900 font-bold">× {entry.packFactor} +</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={entry.loose}
                                onChange={(e) => {
                                  const l = Math.max(0, Number(e.target.value) || 0);
                                  onUpdateEntry(it.code, (cur) => ({
                                    ...cur,
                                    loose: l,
                                    totalQty: cur.packs * cur.packFactor + l,
                                  }));
                                }}
                                className="w-14 text-center font-bold text-xs rounded-lg border border-indigo-200 px-1 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                                placeholder="Solto"
                              />
                              <span className="text-[11px] text-indigo-900 font-black">= {entry.totalQty}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  const factor = entry.packFactor > 1 ? entry.packFactor : 12;
                                  const p = Math.floor(it.qtyOnHand / factor);
                                  const l = Number((it.qtyOnHand % factor).toFixed(3));
                                  onUpdateEntry(it.code, (cur) => ({
                                    ...cur,
                                    packs: p,
                                    loose: l,
                                    totalQty: it.qtyOnHand,
                                    directQty: String(it.qtyOnHand),
                                  }));
                                }}
                                className="text-[10px] font-bold text-indigo-800 bg-white border border-indigo-200 px-2 py-0.5 rounded hover:bg-indigo-50 cursor-pointer"
                              >
                                Sem Saída
                              </button>
                              <button
                                type="button"
                                onClick={toggleMode}
                                className="text-[10px] font-bold text-zinc-500 hover:text-zinc-800 cursor-pointer"
                                title="Mudar para contagem direta de unidades"
                              >
                                Modo Direto
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={entry.directQty}
                              onChange={(e) => {
                                const val = e.target.value;
                                const num = Math.max(0, Number(val) || 0);
                                onUpdateEntry(it.code, (cur) => ({
                                  ...cur,
                                  directQty: val,
                                  totalQty: num,
                                }));
                              }}
                              className="w-24 text-center font-bold text-sm rounded-xl border border-zinc-200 px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateEntry(it.code, (cur) => ({
                                  ...cur,
                                  directQty: String(it.qtyOnHand),
                                  totalQty: it.qtyOnHand,
                                }));
                              }}
                              className="px-2 py-1.5 rounded-lg border border-zinc-200 text-[11px] font-bold text-zinc-600 hover:bg-zinc-100 cursor-pointer"
                              title="Sem saídas (manter saldo anterior)"
                            >
                              =
                            </button>
                            <button
                              type="button"
                              onClick={toggleMode}
                              className="p-1 rounded-lg border border-zinc-200 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                              title="Contar por fardo / embalagem fechada"
                            >
                              <Boxes className="h-3.5 w-3.5 text-indigo-600" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {saidas > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-amber-50 text-amber-800 border-amber-300">
                            <TrendingDown className="h-3 w-3 text-amber-700" />
                            Saíram {saidas} {it.unit}
                          </span>
                        ) : saidas < 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-blue-50 text-blue-700 border-blue-200">
                            <TrendingUp className="h-3 w-3 text-blue-600" />
                            +{Math.abs(saidas)} {it.unit}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-zinc-400">Sem saídas</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isZero ? (
                          <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                            Zerado! Repor {it.idealQty}
                          </span>
                        ) : belowMin ? (
                          <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-300">
                            Abaixo Mín! Repor {faltaParaIdeal}
                          </span>
                        ) : n >= it.idealQty ? (
                          <span className="text-[11px] font-semibold text-emerald-700">Abastecido</span>
                        ) : (
                          <span className="text-[11px] text-zinc-500">Estável</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-zinc-400 text-sm">
                      Nenhum item para conferir com os filtros ativos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function AddItem({
  familias,
  defaultSection,
  onClose,
  onSaved,
  onItemCreated,
}: {
  familias: AlmoxFamilia[];
  defaultSection: string;
  onClose: () => void;
  onSaved: () => void;
  onItemCreated?: (newItem: AlmoxOpsItem) => void;
}) {
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [family, setFamily] = useState(defaultSection || (familias[0]?.id ?? 'supermercado'));
  const [unit, setUnit] = useState('UN');
  const [minQty, setMinQty] = useState('0');
  const [idealQty, setIdealQty] = useState('0');
  const [location, setLocation] = useState('');
  const [hasPack, setHasPack] = useState(false);
  const [defaultPackName, setDefaultPackName] = useState('Fardo');
  const [defaultPackQty, setDefaultPackQty] = useState('12');
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [photoDate, setPhotoDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await compressImageFile(file, 800, 0.75);
      setPhotoData(base64);
      setPhotoDate(new Date().toISOString());
    } catch {
      setError('Erro ao processar imagem.');
    }
  };

  const saveLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiJson<{ item: AlmoxOpsItem }>('/almox/items/local?confirmar=true', {
        method: 'POST',
        body: JSON.stringify({
          code: code.trim() || undefined,
          description: description.trim(),
          unit: unit.trim().toUpperCase() || 'UN',
          section: family,
          minQty: Number(minQty) || 0,
          idealQty: Number(idealQty) || 0,
          location: location.trim() || null,
          defaultPackQty: hasPack && Number(defaultPackQty) > 0 ? Number(defaultPackQty) : null,
          defaultPackName: hasPack && defaultPackName.trim() ? defaultPackName.trim() : null,
          photoData: photoData || null,
          photoDate: photoDate || null,
        }),
      });
      if (onItemCreated && res.item) {
        onItemCreated(res.item);
      } else {
        onSaved();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar o item no estoque.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <form
        onSubmit={(e) => void saveLocal(e)}
        className="bg-white border border-zinc-200 rounded-2xl shadow-xl w-full max-w-lg p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div>
            <h3 className="font-black text-base text-zinc-900 tracking-tight">Cadastrar Item no Estoque</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Gestão autônoma no aplicativo (independente de ERP)</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700">
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {/* Código Opcional */}
          <label className="block space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Código do Item (Ref. ERP / Código Interno)
            </span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Opcional. Deixe em branco para auto-gerar (ex: APP_0012)"
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11 font-mono"
            />
          </label>

          {/* Descrição Obrigatória */}
          <label className="block space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Descrição do Item *
            </span>
            <input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Papel Toalha Interfolha 1000fls"
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11"
            />
          </label>

          {/* Família e Unidade */}
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Família / Categoria
              </span>
              <select
                value={family}
                onChange={(e) => setFamily(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11"
              >
                {familias.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Unidade
              </span>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="UN, CX, KG, L, PCT, ROLO"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11"
              />
            </label>
          </div>

          {/* Metas Mínimo e Ideal */}
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Estoque Mínimo
              </span>
              <input
                type="number"
                step="any"
                value={minQty}
                onChange={(e) => setMinQty(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Estoque Ideal
              </span>
              <input
                type="number"
                step="any"
                value={idealQty}
                onChange={(e) => setIdealQty(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11"
              />
            </label>
          </div>

          {/* Localização */}
          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Localização / Prateleira
            </span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ex: Prateleira B3, Armário da Cozinha..."
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11"
            />
          </label>

          {/* Embalagem Fechada (Opcional) */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasPack}
                onChange={(e) => setHasPack(e.target.checked)}
                className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
              />
              <span className="text-xs font-bold text-zinc-800">
                Contar por embalagem fechada? (ex: fardo, caixa, pacote)
              </span>
            </label>

            {hasPack && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <label className="space-y-1 block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Nome da Embalagem
                  </span>
                  <input
                    value={defaultPackName}
                    onChange={(e) => setDefaultPackName(e.target.value)}
                    placeholder="Ex: Fardo, Caixa, Pacote"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Unidades por Embalagem (Fator)
                  </span>
                  <input
                    type="number"
                    min="1"
                    value={defaultPackQty}
                    onChange={(e) => setDefaultPackQty(e.target.value)}
                    placeholder="Ex: 12"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Foto do Item (Opcional) */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-zinc-500" />
                Foto do Item (Opcional)
              </span>
              {photoData && (
                <button
                  type="button"
                  onClick={() => {
                    setPhotoData(null);
                    setPhotoDate(null);
                  }}
                  className="text-[10px] font-bold text-rose-600 hover:text-rose-800"
                >
                  Remover
                </button>
              )}
            </div>

            {photoData ? (
              <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-zinc-200">
                <img src={photoData} alt="Preview" className="w-14 h-14 rounded-lg object-cover border border-zinc-150" />
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-zinc-900">Foto carregada</p>
                  <p className="text-[11px] text-zinc-500">{formatPhotoAge(photoDate).text}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handlePhotoUpload(e)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-100 text-xs font-bold text-zinc-700 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5 text-zinc-600" />
                  Tirar Foto ou Carregar Arquivo
                </button>
                <span className="text-[11px] text-zinc-400">Salva com a data atual</span>
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-xs font-bold text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200">{error}</p>}

        <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-xl border border-zinc-200 hover:bg-zinc-50 cursor-pointer min-h-11"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || !description.trim()}
            className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 min-h-11 shadow-xs"
          >
            {busy ? 'Salvando...' : 'Salvar Item'}
          </button>
        </div>
      </form>
    </div>
  );
}

function GerenciarFamiliasModal({
  familias,
  onClose,
  onUpdated,
}: {
  familias: AlmoxFamilia[];
  onClose: () => void;
  onUpdated: () => Promise<void>;
}) {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('blue');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colors = [
    { id: 'emerald', label: 'Verde', bg: 'bg-emerald-500' },
    { id: 'blue', label: 'Azul', bg: 'bg-blue-500' },
    { id: 'amber', label: 'Âmbar', bg: 'bg-amber-500' },
    { id: 'purple', label: 'Roxo', bg: 'bg-purple-500' },
    { id: 'rose', label: 'Rosa', bg: 'bg-rose-500' },
    { id: 'zinc', label: 'Cinza', bg: 'bg-zinc-500' },
  ];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson('/almox/familias?confirmar=true', {
        method: 'POST',
        body: JSON.stringify({
          label: label.trim(),
          color,
          sortOrder: familias.length + 1,
        }),
      });
      setLabel('');
      await onUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar família.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover esta família? Os itens cadastrados nela manterão seus dados.')) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/almox/familias/${encodeURIComponent(id)}?confirmar=true`, { method: 'DELETE' });
      await onUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir família.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-xl w-full max-w-md p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-zinc-700" />
            <h3 className="font-black text-base text-zinc-900 tracking-tight">Famílias de Produtos</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Lista de Famílias Atuais */}
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {familias.map((f) => {
            const isProtected = ['supermercado', 'escritorio', 'limpeza'].includes(f.id);
            return (
              <div
                key={f.id}
                className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-150 bg-zinc-50"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-3 h-3 rounded-full ${colors.find((c) => c.id === f.color)?.bg || 'bg-zinc-400'}`} />
                  <div>
                    <p className="text-xs font-bold text-zinc-900">{f.label}</p>
                    <p className="text-[10px] font-mono text-zinc-400">{f.id}</p>
                  </div>
                </div>

                {!isProtected && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(f.id)}
                    disabled={busy}
                    className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Excluir família personalizada"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Form para Adicionar Nova Família */}
        <form onSubmit={(e) => void handleCreate(e)} className="border-t border-zinc-100 pt-3 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Adicionar Nova Família</p>
          <div className="space-y-2">
            <input
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex: Uniformes & EPIs, Embalagens..."
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-10"
            />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-zinc-400">Cor:</span>
              <div className="flex items-center gap-1.5">
                {colors.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setColor(c.id)}
                    className={`w-6 h-6 rounded-full ${c.bg} transition-transform cursor-pointer ${
                      color === c.id ? 'ring-2 ring-zinc-900 ring-offset-2 scale-110' : 'opacity-70 hover:opacity-100'
                    }`}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          </div>

          {error && <p className="text-xs font-bold text-rose-700 bg-rose-50 p-2 rounded-xl">{error}</p>}

          <button
            type="submit"
            disabled={busy || !label.trim()}
            className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50 transition-colors"
          >
            {busy ? 'Salvando...' : 'Adicionar Família'}
          </button>
        </form>

        <div className="pt-2 border-t border-zinc-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-xl border border-zinc-200 hover:bg-zinc-50 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function PhotoLightboxModal({
  item,
  onClose,
  onPhotoUpdated,
}: {
  item: AlmoxOpsItem;
  onClose: () => void;
  onPhotoUpdated: (item: AlmoxOpsItem) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoAge = formatPhotoAge(item.photoDate);

  const handleUploadNew = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const base64 = await compressImageFile(file, 800, 0.75);
      const newDate = new Date().toISOString();
      const res = await apiJson<{ item: AlmoxOpsItem }>(`/almox/items/${encodeURIComponent(item.code)}/config?confirmar=true`, {
        method: 'PUT',
        body: JSON.stringify({
          photoData: base64,
          photoDate: newDate,
        }),
      });
      onPhotoUpdated(res.item);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar foto.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!confirm('Deseja realmente remover a foto deste item?')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiJson<{ item: AlmoxOpsItem }>(`/almox/items/${encodeURIComponent(item.code)}/config?confirmar=true`, {
        method: 'PUT',
        body: JSON.stringify({
          photoData: null,
          photoDate: null,
        }),
      });
      onPhotoUpdated(res.item);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao remover foto.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between border-b border-zinc-100 pb-3">
          <div>
            <h3 className="font-bold text-base text-zinc-900 leading-snug">{item.description}</h3>
            <p className="font-mono text-xs text-zinc-400 mt-0.5">{item.code}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Imagem Ampliada */}
        <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-zinc-900 flex items-center justify-center border border-zinc-200">
          {item.photoData ? (
            <img src={item.photoData} alt={item.description} className="w-full h-full object-contain" />
          ) : (
            <div className="flex flex-col items-center justify-center text-zinc-400 space-y-2">
              <Camera className="w-12 h-12 stroke-[1.5]" />
              <span className="text-xs font-semibold">Nenhuma foto cadastrada para este item</span>
            </div>
          )}
        </div>

        {/* Metadados de Idade e Data do Registro */}
        {item.photoData && (
          <div className="bg-zinc-50 border border-zinc-150 rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-700">
              <span>Data do Registro:</span>
              <span className="font-mono">{photoAge.fullDate}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Idade da Foto:</span>
              <span className={`font-bold ${photoAge.isOld ? 'text-amber-700' : 'text-zinc-900'}`}>
                {photoAge.text}
              </span>
            </div>
            {photoAge.isOld && (
              <p className="text-[11px] text-amber-700 font-medium bg-amber-50 p-2 rounded-lg border border-amber-200 mt-2">
                ⚠️ Atenção: Esta foto foi registrada há mais de 6 meses. Se a embalagem, tamanho ou apresentação do produto mudou, recomendamos tirar uma nova foto.
              </p>
            )}
          </div>
        )}

        {error && <p className="text-xs font-bold text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200">{error}</p>}

        {/* Ações */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => void handleUploadNew(e)}
            className="hidden"
          />

          {item.photoData ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRemovePhoto()}
              className="text-xs font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remover Foto
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Camera className="w-3.5 h-3.5" />
              {item.photoData ? 'Substituir Foto' : 'Tirar / Carregar Foto'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold rounded-xl border border-zinc-200 hover:bg-zinc-50 cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

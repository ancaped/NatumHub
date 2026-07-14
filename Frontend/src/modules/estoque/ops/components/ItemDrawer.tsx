import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  Save,
  X,
} from 'lucide-react';
import type { AlmoxMovement, AlmoxOpsItem } from '../types';
import { SECTION_LABELS } from '../types';

type DrawerTab = 'visao' | 'movimentos' | 'config';

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
}

export interface MovementPayload {
  itemCode: string;
  movementType: 'entrada' | 'saida';
  quantity: number;
  unitCost?: number | null;
  reason?: string | null;
  documentRef?: string | null;
  variantLabel?: string | null;
  packLabel?: string | null;
  packCount?: number | null;
  contentPerPack?: number | null;
  totalPaid?: number | null;
}

interface Props {
  item: AlmoxOpsItem;
  movements: AlmoxMovement[];
  onClose: () => void;
  onSaveConfig: (payload: ItemConfigPayload) => Promise<void>;
  onSubmitMovement: (payload: MovementPayload) => Promise<void>;
  busy?: boolean;
}

function exchangeBadge(status?: string | null) {
  if (!status || status === 'none') return null;
  if (status === 'ok') {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-emerald-50 text-emerald-700 border-emerald-200">
        Troca ok
      </span>
    );
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
        Troca vencida
      </span>
    );
  }
  return null;
}

function money(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function ItemDrawer({
  item,
  movements,
  onClose,
  onSaveConfig,
  onSubmitMovement,
  busy = false,
}: Props) {
  const isSupermercado = item.section === 'supermercado';
  const isErp = item.source !== 'local';

  const [tab, setTab] = useState<DrawerTab>('visao');
  const [active, setActive] = useState(item.active);
  const [description, setDescription] = useState(item.description || '');
  const [unit, setUnit] = useState(item.unit || 'UN');
  const [minQty, setMinQty] = useState(String(item.minQty ?? 0));
  const [idealQty, setIdealQty] = useState(String(item.idealQty ?? 0));
  const [location, setLocation] = useState(item.location || '');
  const [notes, setNotes] = useState(item.notes || '');
  const [lifespanDays, setLifespanDays] = useState(
    item.lifespanDays != null ? String(item.lifespanDays) : ''
  );
  const [nextExchangeAt, setNextExchangeAt] = useState(
    item.nextExchangeAt ? item.nextExchangeAt.slice(0, 10) : ''
  );
  const [expiresAt, setExpiresAt] = useState(
    item.expiresAt ? item.expiresAt.slice(0, 10) : ''
  );

  const [mvType, setMvType] = useState<'entrada' | 'saida'>('entrada');
  const [mvQty, setMvQty] = useState('');
  const [mvCost, setMvCost] = useState('');
  const [mvReason, setMvReason] = useState('');
  const [mvDoc, setMvDoc] = useState('');
  const [mvVariant, setMvVariant] = useState('');
  const [mvPackLabel, setMvPackLabel] = useState('');
  const [mvPackCount, setMvPackCount] = useState('');
  const [mvContentPerPack, setMvContentPerPack] = useState('');
  const [mvTotalPaid, setMvTotalPaid] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const showPackEntrada = isSupermercado && mvType === 'entrada';

  const packPreview = useMemo(() => {
    if (!showPackEntrada) return null;
    const pc = Number(mvPackCount);
    const cpp = Number(mvContentPerPack);
    const total = Number(mvTotalPaid);
    const qty = pc > 0 && cpp > 0 ? pc * cpp : 0;
    const unitCost = qty > 0 && total > 0 ? total / qty : null;
    return { qty, unitCost };
  }, [showPackEntrada, mvPackCount, mvContentPerPack, mvTotalPaid]);

  useEffect(() => {
    setActive(item.active);
    setDescription(item.description || '');
    setUnit(item.unit || 'UN');
    setMinQty(String(item.minQty ?? 0));
    setIdealQty(String(item.idealQty ?? 0));
    setLocation(item.location || '');
    setNotes(item.notes || '');
    setLifespanDays(item.lifespanDays != null ? String(item.lifespanDays) : '');
    setNextExchangeAt(item.nextExchangeAt ? item.nextExchangeAt.slice(0, 10) : '');
    setExpiresAt(item.expiresAt ? item.expiresAt.slice(0, 10) : '');
    setTab('visao');
    setLocalError(null);
    setMvType('entrada');
    setMvQty('');
    setMvCost('');
    setMvReason('');
    setMvDoc('');
    setMvVariant('');
    setMvPackLabel('');
    setMvPackCount('');
    setMvContentPerPack('');
    setMvTotalPaid('');
  }, [item]);

  const saveConfig = async () => {
    setLocalError(null);
    try {
      await onSaveConfig({
        active,
        minQty: Number(minQty) || 0,
        idealQty: Number(idealQty) || 0,
        location: location || null,
        notes: notes || null,
        section: item.section,
        description: description.trim() || undefined,
        unit: unit.trim() || undefined,
        lifespanDays: lifespanDays ? Number(lifespanDays) : null,
        nextExchangeAt: nextExchangeAt || null,
        expiresAt: expiresAt || null,
      });
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  };

  const submitMv = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (showPackEntrada) {
      const packCount = Number(mvPackCount);
      const contentPerPack = Number(mvContentPerPack);
      const totalPaid = Number(mvTotalPaid);
      const quantity = packCount > 0 && contentPerPack > 0 ? packCount * contentPerPack : 0;
      if (quantity <= 0) {
        setLocalError('Informe qtd. de embalagens e conteúdo por embalagem.');
        return;
      }
      if (!totalPaid || totalPaid <= 0) {
        setLocalError('Informe o total pago.');
        return;
      }
      try {
        await onSubmitMovement({
          itemCode: item.code,
          movementType: 'entrada',
          quantity,
          packCount,
          contentPerPack,
          totalPaid,
          variantLabel: mvVariant.trim() || null,
          packLabel: mvPackLabel.trim() || null,
          documentRef: mvDoc.trim() || null,
          reason: mvReason.trim() || null,
        });
        setMvQty('');
        setMvCost('');
        setMvReason('');
        setMvDoc('');
        setMvVariant('');
        setMvPackLabel('');
        setMvPackCount('');
        setMvContentPerPack('');
        setMvTotalPaid('');
        setTab('movimentos');
      } catch (err: unknown) {
        setLocalError(err instanceof Error ? err.message : 'Erro no movimento');
      }
      return;
    }

    const quantity = Number(mvQty);
    if (!quantity || quantity <= 0) {
      setLocalError('Informe uma quantidade válida.');
      return;
    }
    try {
      await onSubmitMovement({
        itemCode: item.code,
        movementType: mvType,
        quantity,
        unitCost: mvCost ? Number(mvCost) : null,
        reason: mvReason || null,
        documentRef: mvDoc || null,
      });
      setMvQty('');
      setMvCost('');
      setMvReason('');
      setMvDoc('');
      setTab('movimentos');
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : 'Erro no movimento');
    }
  };

  const tabs: { id: DrawerTab; label: string }[] = [
    { id: 'visao', label: 'Visão geral' },
    { id: 'movimentos', label: 'Movimentos' },
    { id: 'config', label: 'Config' },
  ];

  const itemMovements = movements.filter((m) => m.itemCode === item.code);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end">
      <div className="absolute inset-0 cursor-pointer" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-350 z-10">
        <div className="px-6 py-5 border-b border-zinc-200 bg-zinc-50/50 flex justify-between items-start shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-zinc-900 text-white rounded text-[9px] font-bold uppercase tracking-wider">
                {SECTION_LABELS[item.section] || item.section}
              </span>
              {item.belowMin && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-amber-50 text-amber-700 border-amber-200">
                  <AlertTriangle className="h-3 w-3" />
                  Abaixo do mín.
                </span>
              )}
              {exchangeBadge(item.exchangeStatus)}
            </div>
            <h3 className="font-bold text-zinc-900 text-lg truncate">{item.description}</h3>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">
              {item.code} · {item.unit} · {item.source === 'local' ? 'Local' : 'ERP'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-150 rounded-lg text-zinc-400 hover:text-zinc-700 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 border-b border-zinc-100 flex gap-1 shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                tab === t.id
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-transparent text-zinc-400 hover:text-zinc-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {localError && (
          <div className="mx-6 mt-3 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm px-4 py-2">
            {localError}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {tab === 'visao' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">Saldo</p>
                  <p className="text-xl font-extrabold text-zinc-900 mt-1">
                    {item.qtyOnHand.toLocaleString('pt-BR')} {item.unit}
                  </p>
                </div>
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">Mínimo</p>
                  <p className="text-xl font-extrabold text-zinc-900 mt-1">
                    {item.minQty.toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">Ideal</p>
                  <p className="text-xl font-extrabold text-zinc-900 mt-1">
                    {item.idealQty.toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">Custo médio</p>
                  <p className="text-sm font-bold text-zinc-900 mt-1">
                    {money(item.avgUnitCost)}
                  </p>
                </div>
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">Localização</p>
                  <p className="text-sm font-semibold text-zinc-800 mt-1">
                    {item.location || '—'}
                  </p>
                </div>
                {item.erpQty != null && (
                  <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">Saldo ERP</p>
                    <p className="text-sm font-bold text-zinc-900 mt-1">
                      {item.erpQty.toLocaleString('pt-BR')}
                    </p>
                  </div>
                )}
              </div>

              {item.notes && (
                <div className="rounded-2xl border border-zinc-100 bg-amber-50/40 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase text-zinc-400 mb-1">Notas</p>
                  <p className="text-sm text-zinc-700 whitespace-pre-wrap">{item.notes}</p>
                </div>
              )}

              <form onSubmit={submitMv} className="rounded-2xl border border-zinc-200 p-4 space-y-3">
                <h4 className="text-sm font-bold text-zinc-900">Entrada / Saída rápida</h4>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMvType('entrada')}
                    className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                      mvType === 'entrada'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-zinc-600 border-zinc-200'
                    }`}
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5" />
                    Entrada
                  </button>
                  <button
                    type="button"
                    onClick={() => setMvType('saida')}
                    className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                      mvType === 'saida'
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-white text-zinc-600 border-zinc-200'
                    }`}
                  >
                    <ArrowUpFromLine className="h-3.5 w-3.5" />
                    Saída
                  </button>
                </div>

                {showPackEntrada ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-zinc-400">
                          Marca / variante
                        </span>
                        <input
                          value={mvVariant}
                          onChange={(e) => setMvVariant(e.target.value)}
                          placeholder="Ex: Ypê"
                          className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-zinc-400">
                          Embalagem
                        </span>
                        <input
                          value={mvPackLabel}
                          onChange={(e) => setMvPackLabel(e.target.value)}
                          placeholder="Ex: fardo 6×500ml"
                          className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-zinc-400">
                          Qtd. embalagens
                        </span>
                        <input
                          value={mvPackCount}
                          onChange={(e) => setMvPackCount(e.target.value)}
                          type="number"
                          min="0"
                          step="any"
                          required
                          className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-zinc-400">
                          Conteúdo / emb.
                        </span>
                        <input
                          value={mvContentPerPack}
                          onChange={(e) => setMvContentPerPack(e.target.value)}
                          type="number"
                          min="0"
                          step="any"
                          required
                          className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-zinc-400">
                          Total pago (R$)
                        </span>
                        <input
                          value={mvTotalPaid}
                          onChange={(e) => setMvTotalPaid(e.target.value)}
                          type="number"
                          min="0"
                          step="any"
                          required
                          className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-zinc-400">
                          Documento
                        </span>
                        <input
                          value={mvDoc}
                          onChange={(e) => setMvDoc(e.target.value)}
                          className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                    {packPreview && packPreview.qty > 0 && (
                      <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-3 py-2 text-xs text-zinc-600">
                        <span className="font-bold text-zinc-900">
                          {packPreview.qty.toLocaleString('pt-BR')} {item.unit}
                        </span>
                        {packPreview.unitCost != null && (
                          <>
                            {' '}
                            · {money(packPreview.unitCost)}/{item.unit}
                          </>
                        )}
                      </div>
                    )}
                    <label className="block space-y-1">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">
                        Motivo (opc.)
                      </span>
                      <input
                        value={mvReason}
                        onChange={(e) => setMvReason(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-zinc-400">Qtd</span>
                        <input
                          value={mvQty}
                          onChange={(e) => setMvQty(e.target.value)}
                          type="number"
                          min="0"
                          step="any"
                          className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                          required
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-zinc-400">
                          Custo unit. (opc.)
                        </span>
                        <input
                          value={mvCost}
                          onChange={(e) => setMvCost(e.target.value)}
                          type="number"
                          min="0"
                          step="any"
                          className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                    <label className="block space-y-1">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">Motivo</span>
                      <input
                        value={mvReason}
                        onChange={(e) => setMvReason(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">
                        Documento
                      </span>
                      <input
                        value={mvDoc}
                        onChange={(e) => setMvDoc(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                      />
                    </label>
                  </>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Lançar movimento
                </button>
              </form>
            </>
          )}

          {tab === 'movimentos' && (
            <div className="space-y-3">
              {itemMovements.length === 0 ? (
                <p className="text-sm text-zinc-400 text-center py-10">
                  Nenhum movimento para este item.
                </p>
              ) : (
                itemMovements.map((m) => {
                  const isEntrada = m.movementType === 'entrada';
                  const hasExtras =
                    isEntrada &&
                    (m.variantLabel || m.packLabel || m.totalPaid != null || m.unitCost != null);
                  return (
                    <div
                      key={m.id}
                      className="rounded-2xl border border-zinc-150 bg-white p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-zinc-900 capitalize">
                            {m.movementType} · {m.quantity.toLocaleString('pt-BR')} {item.unit}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {new Date(m.occurredAt).toLocaleString('pt-BR')}
                            {m.reason ? ` · ${m.reason}` : ''}
                          </p>
                        </div>
                        {m.documentRef && (
                          <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                            {m.documentRef}
                          </span>
                        )}
                      </div>
                      {hasExtras && (
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-600 pt-1 border-t border-zinc-100">
                          {m.variantLabel && (
                            <p>
                              <span className="font-bold text-zinc-400 uppercase tracking-wide">
                                Marca
                              </span>
                              <br />
                              {m.variantLabel}
                            </p>
                          )}
                          {m.packLabel && (
                            <p>
                              <span className="font-bold text-zinc-400 uppercase tracking-wide">
                                Embalagem
                              </span>
                              <br />
                              {m.packLabel}
                              {m.packCount != null
                                ? ` · ${m.packCount.toLocaleString('pt-BR')}×`
                                : ''}
                              {m.contentPerPack != null
                                ? `${m.contentPerPack.toLocaleString('pt-BR')}`
                                : ''}
                            </p>
                          )}
                          {m.totalPaid != null && (
                            <p>
                              <span className="font-bold text-zinc-400 uppercase tracking-wide">
                                Total pago
                              </span>
                              <br />
                              {money(m.totalPaid)}
                            </p>
                          )}
                          {m.unitCost != null && (
                            <p>
                              <span className="font-bold text-zinc-400 uppercase tracking-wide">
                                Custo unit.
                              </span>
                              <br />
                              {money(m.unitCost)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === 'config' && (
            <div className="space-y-3">
              {(isErp || item.erpDescription) && (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">ERP</p>
                  <div className="grid grid-cols-1 gap-3">
                    <label className="space-y-1">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">
                        Código (imutável)
                      </span>
                      <input
                        value={item.code}
                        readOnly
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm font-mono text-zinc-600"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">
                        Descrição ERP
                      </span>
                      <input
                        value={item.erpDescription || '—'}
                        readOnly
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-600"
                      />
                    </label>
                  </div>
                </div>
              )}

              {!isErp && (
                <label className="block space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">
                    Código (imutável)
                  </span>
                  <input
                    value={item.code}
                    readOnly
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm font-mono text-zinc-600"
                  />
                </label>
              )}

              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">
                  Descrição Hub
                </span>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">Unidade</span>
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>

              <label className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="rounded border-zinc-300"
                />
                Item ativo
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">Mínimo</span>
                  <input
                    value={minQty}
                    onChange={(e) => setMinQty(e.target.value)}
                    type="number"
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">Ideal</span>
                  <input
                    value={idealQty}
                    onChange={(e) => setIdealQty(e.target.value)}
                    type="number"
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">Localização</span>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">Notas</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              {item.section === 'pecas' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-zinc-100">
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-zinc-400">
                      Vida útil (dias)
                    </span>
                    <input
                      value={lifespanDays}
                      onChange={(e) => setLifespanDays(e.target.value)}
                      type="number"
                      className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-zinc-400">
                      Próx. troca
                    </span>
                    <input
                      value={nextExchangeAt}
                      onChange={(e) => setNextExchangeAt(e.target.value)}
                      type="date"
                      className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-zinc-400">Validade</span>
                    <input
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      type="date"
                      className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={saveConfig}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Salvar configuração
              </button>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50/50 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-all"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

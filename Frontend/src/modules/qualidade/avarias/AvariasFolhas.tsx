import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer, RefreshCw, Search } from 'lucide-react';
import PrintModal from '../../ferramentas/etiquetas/components/PrintModal';
import type { LabelElement, LabelTemplate } from '../../ferramentas/etiquetas/lib/types';
import Modal from '../../geral/components/ui/Modal';
import { apiJson } from '../../geral/lib/http';
import { cn } from '../../geral/lib/utils';
import {
  fmtReportDate,
  printLaudoDocument,
  reportCellLine,
  reportSignatures,
  reportTableStyle,
} from '../devolucoes/printHelpers';

type Destination = 'expedicao' | 'embalagem' | 'reparo';

type PendingItem = {
  id: number;
  registerNumber: string;
  itemCode: string;
  description: string;
  lote: string;
  qty: number;
  notes?: string | null;
};

type FolhaItem = {
  avariaId: number;
  registerNumber: string;
  itemCode: string;
  description: string;
  lote: string;
  qty: number;
  location: string;
  notes?: string | null;
};

type Folha = {
  id: number;
  sheetNumber: string;
  destination: Destination;
  status: 'aberta' | 'devolvida' | 'cancelada';
  createdBy?: string | null;
  returnedBy?: string | null;
  returnedAt?: string | null;
  createdAt: string;
  itemCount: number;
  boxCount: number;
  items: FolhaItem[];
};

function destLabel(id: string) {
  if (id === 'expedicao') return 'Retorno ao estoque';
  if (id === 'embalagem' || id === 'reparo') return 'Reparo de embalagem';
  return id;
}

function controleStatus(status: string) {
  if (status === 'devolvida') return { label: 'Conferida', badge: 'saudavel' };
  if (status === 'cancelada') return { label: 'Cancelada', badge: 'descontinuado' };
  return { label: 'Aguardando conferência', badge: 'ordem' };
}

function fmtWhen(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtQty(n: number) {
  if (!Number.isFinite(n)) return '';
  return Number.isInteger(n) ? String(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textEl(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  fontSize: number,
  align: 'left' | 'center' | 'right' = 'left',
): LabelElement {
  return {
    id,
    type: 'text',
    x_mm: x,
    y_mm: y,
    width_mm: w,
    height_mm: h,
    zIndex: 2,
    props: {
      text,
      fontSize,
      fontWeight: 'bold',
      fontFamily: 'Inter',
      textAlign: align,
      color: '#000000',
    },
  };
}

function sheetLabel(sheet: Folha): LabelTemplate {
  const dest = destLabel(sheet.destination);
  const boxes = Math.max(1, sheet.boxCount || 1);
  const elements: LabelElement[] = [
    textEl('brand', 3, 2, 40, 4, 'NATUM', 8),
    textEl('kind', 44, 2, 53, 4, 'AVARIAS', 8, 'right'),
    textEl('number', 3, 8, 94, 12, sheet.sheetNumber, 22, 'center'),
    textEl('dest', 3, 22, 94, 5, dest, 9, 'center'),
    textEl('boxes', 3, 28, 94, 6, boxes === 1 ? '1 CAIXA' : `${boxes} CAIXAS`, 14, 'center'),
    {
      id: 'bar',
      type: 'barcode',
      x_mm: 18,
      y_mm: 35,
      width_mm: 64,
      height_mm: 12,
      zIndex: 2,
      props: { value: sheet.sheetNumber, format: 'code128', showText: false },
    },
  ];
  return {
    id: `folha_${sheet.id}`,
    name: sheet.sheetNumber,
    category: 'custom',
    width_mm: 100,
    height_mm: 50,
    orientation: 'landscape',
    elements_json: elements,
  };
}

async function printFolha(sheet: Folha) {
  const boxes = Math.max(1, sheet.boxCount || 1);
  const cell = reportCellLine;
  const rows = sheet.items
    .map(
      (item) => `<tr style="break-inside:avoid;">
        <td style="${cell}font-family:ui-monospace,monospace;">${esc(item.registerNumber)}</td>
        <td style="${cell}font-family:ui-monospace,monospace;">${esc(item.itemCode)}</td>
        <td style="${cell}">${esc(item.description)}</td>
        <td style="${cell}font-family:ui-monospace,monospace;">${esc(item.lote || '—')}</td>
        <td style="${cell}text-align:right;font-family:ui-monospace,monospace;">${esc(fmtQty(item.qty))}</td>
        <td style="${cell}">${esc(item.notes || '')}</td>
      </tr>`,
    )
    .join('');
  const body = `
<div style="display:flex;gap:18px;font-size:8.5pt;margin-bottom:8px;">
  <div><strong>CAIXAS:</strong> ${boxes}</div>
  <div><strong>ITENS:</strong> ${sheet.items.length}</div>
  <div><strong>EMITIDA POR:</strong> ${esc(sheet.createdBy || '—')}</div>
</div>
<table style="${reportTableStyle}">
  <thead>
    <tr>
      <th style="${cell}text-align:left;">REGISTRO</th>
      <th style="${cell}text-align:left;">CÓDIGO</th>
      <th style="${cell}text-align:left;">DESCRIÇÃO</th>
      <th style="${cell}text-align:left;">LOTE</th>
      <th style="${cell}text-align:right;">QTD</th>
      <th style="${cell}text-align:left;">OBSERVAÇÃO</th>
    </tr>
  </thead>
  <tbody>${rows || `<tr><td colspan="6" style="${cell}">Nenhum item</td></tr>`}</tbody>
</table>
${reportSignatures(['Controle de Qualidade', 'Conferência na Expedição', 'Entrada no estoque'])}`;
  await printLaudoDocument(
    `Controle ${sheet.sheetNumber}`,
    'FOLHA DE CONTROLE — AVARIAS',
    sheet.sheetNumber,
    fmtReportDate(sheet.createdAt),
    body,
    'Identifique cada caixa com o número deste controle. A entrada no estoque é lançada no ERP.',
  );
}

export default function AvariasFolhas({ canEdit, screen }: { canEdit: boolean; screen: 'retorno' | 'controles' }) {
  const destination: Destination = 'expedicao';
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [sheets, setSheets] = useState<Folha[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [open, setOpen] = useState<Folha | null>(null);
  const [boxes, setBoxes] = useState('1');
  const [labelSheet, setLabelSheet] = useState<Folha | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'all' | 'aberta' | 'devolvida' | 'cancelada'>('all');

  const load = useCallback(async (dest: Destination) => {
    setLoading(true);
    setError('');
    try {
      const [items, list] = await Promise.all([
        apiJson<PendingItem[]>(`/qualidade/avarias/folhas/pendentes?destination=${dest}`),
        apiJson<Folha[]>('/qualidade/avarias/folhas'),
      ]);
      setPending(items);
      setSheets(list);
      setPicked((prev) => prev.filter((id) => items.some((item) => item.id === id)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(destination);
  }, [destination, load]);

  useEffect(() => {
    if (open) setBoxes(String(open.boxCount || 1));
  }, [open]);

  const selectedCount = picked.length;

  const counts = useMemo(() => {
    const base = { aberta: 0, devolvida: 0, cancelada: 0 };
    for (const sheet of sheets) {
      if (sheet.status === 'aberta' || sheet.status === 'devolvida' || sheet.status === 'cancelada') {
        base[sheet.status] += 1;
      }
    }
    return base;
  }, [sheets]);

  const termo = busca.trim().toLowerCase();
  const pendentesVisiveis = pending.filter((item) => {
    if (!termo) return true;
    return [item.registerNumber, item.itemCode, item.description, item.lote, item.notes || '']
      .join(' ')
      .toLowerCase()
      .includes(termo);
  });
  const controlesVisiveis = sheets.filter((sheet) => {
    if (filtro !== 'all' && sheet.status !== filtro) return false;
    if (!termo) return true;
    return [sheet.sheetNumber, destLabel(sheet.destination), sheet.createdBy || '']
      .join(' ')
      .toLowerCase()
      .includes(termo);
  });

  const toggle = (id: number) => {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const generate = async () => {
    if (!picked.length) {
      setError('Selecione os itens deste controle.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await apiJson<Folha>('/qualidade/avarias/folhas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination, avariaIds: picked }),
      });
      setPicked([]);
      setOpen(created);
      await load(destination);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar o controle');
    } finally {
      setBusy(false);
    }
  };

  const persistBoxes = async (sheet: Folha) => {
    const n = Math.max(1, Math.min(99, parseInt(boxes, 10) || 1));
    setBusy(true);
    setError('');
    try {
      const saved = await apiJson<Folha>(`/qualidade/avarias/folhas/${sheet.id}/caixas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boxCount: n }),
      });
      setOpen(saved);
      setSheets((prev) => prev.map((row) => (row.id === saved.id ? { ...row, boxCount: saved.boxCount } : row)));
      return saved;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar a quantidade de caixas');
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const refreshOpen = async (id: number) => {
    const detail = await apiJson<Folha>(`/qualidade/avarias/folhas/${id}`);
    setOpen(detail);
    await load(destination);
  };

  const mark = async (path: 'devolver' | 'cancelar') => {
    if (!open) return;
    const question = path === 'devolver'
      ? `Registrar a conferência de ${open.sheetNumber}?`
      : `Cancelar ${open.sheetNumber}? Os itens voltam para um novo controle.`;
    if (!window.confirm(question)) return;
    setBusy(true);
    setError('');
    try {
      await apiJson(`/qualidade/avarias/folhas/${open.id}/${path}`, { method: 'POST' });
      await refreshOpen(open.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao atualizar o controle');
    } finally {
      setBusy(false);
    }
  };

  const openSheet = async (id: number) => {
    setBusy(true);
    setError('');
    try {
      setOpen(await apiJson<Folha>(`/qualidade/avarias/folhas/${id}`));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao abrir o controle');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {screen === 'retorno' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-sm">
              <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Aguardando controle</div>
              <div className="text-xl font-bold text-amber-600">{pending.length}</div>
            </div>
            <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-sm">
              <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Selecionados</div>
              <div className="text-xl font-bold text-zinc-900">{selectedCount}</div>
            </div>
          </div>
          <div className="toolbar-section">
            <div className="search-input-wrapper">
              <Search size={16} />
              <input
                className="search-input"
                placeholder="Buscar registro, código, lote ou observação"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <button type="button" className="btn-secondary !px-2.5" onClick={() => void load(destination)} title="Atualizar">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            {canEdit && (
              <button type="button" className="btn-primary" disabled={busy || selectedCount === 0} onClick={() => void generate()}>
                Gerar controle{selectedCount ? ` (${selectedCount})` : ''}
              </button>
            )}
          </div>

          <div className="hidden md:block bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden min-h-0">
            <div className="overflow-auto">
              {loading ? (
                <div className="py-16 text-center text-sm text-zinc-500">Carregando…</div>
              ) : pendentesVisiveis.length === 0 ? (
                <div className="py-16 text-center text-sm text-zinc-500">Nenhum item de retorno aguardando controle.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 text-zinc-500 uppercase tracking-wider text-[10px] sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2.5 font-bold w-10">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-zinc-900"
                          checked={pendentesVisiveis.length > 0 && pendentesVisiveis.every((item) => picked.includes(item.id))}
                          disabled={!canEdit}
                          onChange={() => {
                            const ids = pendentesVisiveis.map((item) => item.id);
                            const allOn = ids.every((id) => picked.includes(id));
                            setPicked(allOn
                              ? picked.filter((id) => !ids.includes(id))
                              : [...new Set([...picked, ...ids])]);
                          }}
                        />
                      </th>
                      <th className="text-left px-3 py-2.5 font-bold">Registro</th>
                      <th className="text-left px-3 py-2.5 font-bold">Código</th>
                      <th className="text-left px-3 py-2.5 font-bold">Descrição</th>
                      <th className="text-left px-3 py-2.5 font-bold">Lote</th>
                      <th className="text-right px-3 py-2.5 font-bold">Qtd</th>
                      <th className="text-left px-3 py-2.5 font-bold">Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendentesVisiveis.map((item) => (
                      <tr key={item.id} className="border-t border-zinc-100 hover:bg-zinc-50/80">
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-zinc-900"
                            checked={picked.includes(item.id)}
                            disabled={!canEdit}
                            onChange={() => toggle(item.id)}
                          />
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-zinc-900">{item.registerNumber}</td>
                        <td className="px-3 py-2.5 font-mono text-zinc-700">{item.itemCode}</td>
                        <td className="px-3 py-2.5 text-zinc-800">{item.description}</td>
                        <td className="px-3 py-2.5 font-mono">{item.lote || '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{fmtQty(item.qty)}</td>
                        <td className="px-3 py-2.5 text-zinc-600">{item.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="md:hidden space-y-2">
            {loading ? (
              <div className="py-10 text-center text-sm text-zinc-500">Carregando…</div>
            ) : pendentesVisiveis.length === 0 ? (
              <div className="py-10 text-center text-sm text-zinc-500">Nenhum item de retorno aguardando controle.</div>
            ) : pendentesVisiveis.map((item) => (
              <label key={item.id} className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-3 flex gap-3 min-h-11">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-zinc-900"
                  checked={picked.includes(item.id)}
                  disabled={!canEdit}
                  onChange={() => toggle(item.id)}
                />
                <span className="min-w-0">
                  <span className="font-mono text-sm font-bold">{item.registerNumber}</span>
                  <span className="block text-sm text-zinc-800">{item.description}</span>
                  <span className="block text-[11px] text-zinc-500 font-mono mt-1">
                    {item.itemCode} · Lote {item.lote || '—'} · Qtd {fmtQty(item.qty)}
                  </span>
                  {item.notes && <span className="block text-xs text-zinc-600 mt-1">{item.notes}</span>}
                </span>
              </label>
            ))}
          </div>
        </>
      )}

      {screen === 'controles' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {([
              ['aberta', 'Aguardando conferência', counts.aberta, 'amber'],
              ['devolvida', 'Conferidas', counts.devolvida, 'emerald'],
              ['cancelada', 'Canceladas', counts.cancelada, 'rose'],
            ] as const).map(([id, label, value, tone]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFiltro(filtro === id ? 'all' : id)}
                className={cn(
                  'bg-white rounded-xl border p-3.5 shadow-sm text-left cursor-pointer transition-all hover:shadow-md',
                  filtro === id ? 'ring-2 border-transparent' : 'border-zinc-200',
                  tone === 'amber' && (filtro === id ? 'ring-amber-500' : 'hover:border-amber-300'),
                  tone === 'emerald' && (filtro === id ? 'ring-emerald-500' : 'hover:border-emerald-300'),
                  tone === 'rose' && (filtro === id ? 'ring-rose-500' : 'hover:border-rose-300'),
                )}
              >
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</div>
                <div className={cn(
                  'text-xl font-bold',
                  tone === 'amber' && 'text-amber-600',
                  tone === 'emerald' && 'text-emerald-600',
                  tone === 'rose' && 'text-rose-600',
                )}>{value}</div>
              </button>
            ))}
          </div>

          <div className="toolbar-section">
            <div className="search-input-wrapper">
              <Search size={16} />
              <input
                className="search-input"
                placeholder="Buscar número ou quem emitiu"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <button type="button" className="btn-secondary !px-2.5" onClick={() => void load(destination)} title="Atualizar">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="hidden md:block bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden min-h-0">
            <div className="overflow-auto">
              {loading ? (
                <div className="py-16 text-center text-sm text-zinc-500">Carregando…</div>
              ) : controlesVisiveis.length === 0 ? (
                <div className="py-16 text-center text-sm text-zinc-500">Nenhum controle emitido.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 text-zinc-500 uppercase tracking-wider text-[10px] sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2.5 font-bold">Nº</th>
                      <th className="text-left px-3 py-2.5 font-bold">Tipo</th>
                      <th className="text-left px-3 py-2.5 font-bold">Data</th>
                      <th className="text-right px-3 py-2.5 font-bold">Caixas</th>
                      <th className="text-right px-3 py-2.5 font-bold">Itens</th>
                      <th className="text-left px-3 py-2.5 font-bold">Emitido por</th>
                      <th className="text-left px-3 py-2.5 font-bold">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {controlesVisiveis.map((sheet) => {
                      const status = controleStatus(sheet.status);
                      return (
                        <tr
                          key={sheet.id}
                          className="border-t border-zinc-100 hover:bg-zinc-50/80 cursor-pointer"
                          onClick={() => void openSheet(sheet.id)}
                        >
                          <td className="px-3 py-2.5 font-mono font-bold text-zinc-900">{sheet.sheetNumber}</td>
                          <td className="px-3 py-2.5 text-zinc-700">{destLabel(sheet.destination)}</td>
                          <td className="px-3 py-2.5 text-zinc-600">{fmtWhen(sheet.createdAt)}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{sheet.boxCount || 1}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{sheet.itemCount}</td>
                          <td className="px-3 py-2.5 text-zinc-600">{sheet.createdBy || '—'}</td>
                          <td className="px-3 py-2.5">
                            <span className={cn('status-badge', status.badge)}>{status.label}</span>
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
            ) : controlesVisiveis.length === 0 ? (
              <div className="py-10 text-center text-sm text-zinc-500">Nenhum controle emitido.</div>
            ) : controlesVisiveis.map((sheet) => {
              const status = controleStatus(sheet.status);
              return (
                <button
                  key={sheet.id}
                  type="button"
                  className="w-full text-left bg-white border border-zinc-200 rounded-2xl shadow-sm p-3 space-y-2"
                  onClick={() => void openSheet(sheet.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-mono text-sm font-bold">{sheet.sheetNumber}</div>
                    <span className={cn('status-badge shrink-0', status.badge)}>{status.label}</span>
                  </div>
                  <div className="text-sm text-zinc-700">{destLabel(sheet.destination)}</div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-zinc-500">
                    <span>{fmtWhen(sheet.createdAt)}</span>
                    <span>{sheet.boxCount || 1} caixas · {sheet.itemCount} itens</span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
      {open && (
        <Modal
          title={open.sheetNumber}
          subtitle={controleStatus(open.status).label}
          size="xl"
          onClose={() => setOpen(null)}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
              <label className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Caixas</span>
                <input
                  className="mt-1 w-full h-11 bg-transparent font-mono text-2xl font-bold text-zinc-900 outline-none"
                  inputMode="numeric"
                  value={boxes}
                  disabled={!canEdit || open.status === 'cancelada'}
                  onChange={(e) => setBoxes(e.target.value.replace(/\D/g, '').slice(0, 2))}
                />
              </label>
              <p className="text-sm text-zinc-600 leading-relaxed">
                A etiqueta 100×50 leva o número <span className="font-mono font-semibold text-zinc-900">{open.sheetNumber}</span>. A quantidade de caixas entra no relatório e sai uma etiqueta igual em cada caixa.
              </p>
            </div>
            <div className="overflow-x-auto border border-zinc-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 text-zinc-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2">Registro</th>
                    <th className="text-left font-semibold px-3 py-2">Código</th>
                    <th className="text-left font-semibold px-3 py-2">Descrição</th>
                    <th className="text-left font-semibold px-3 py-2">Lote</th>
                    <th className="text-right font-semibold px-3 py-2">Qtd</th>
                    <th className="text-left font-semibold px-3 py-2">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {open.items.map((item) => (
                    <tr key={item.avariaId} className="border-t border-zinc-100">
                      <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap">{item.registerNumber}</td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">{item.itemCode}</td>
                      <td className="px-3 py-2">{item.description}</td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">{item.lote || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtQty(item.qty)}</td>
                      <td className="px-3 py-2 text-zinc-700">{item.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {open.status === 'devolvida' && (
              <p className="text-xs text-emerald-800">
                Conferida {fmtWhen(open.returnedAt)}{open.returnedBy ? ` por ${open.returnedBy}` : ''}.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => {
                  void persistBoxes(open).then((saved) => printFolha(saved)).catch(() => undefined);
                }}
              >
                <Printer size={14} /> Imprimir controle
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => {
                  void persistBoxes(open).then((saved) => setLabelSheet(saved)).catch(() => undefined);
                }}
              >
                Etiquetas 100×50
              </button>
              {canEdit && open.status === 'aberta' && (
                <>
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => void mark('devolver')}>
                    Conferência feita
                  </button>
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => void mark('cancelar')}>
                    Cancelar
                  </button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}

      {labelSheet && (
        <PrintModal
          template={sheetLabel(labelSheet)}
          isOpen
          initialCopies={Math.max(1, labelSheet.boxCount || 1)}
          onClose={() => setLabelSheet(null)}
          history={{ product_name: labelSheet.sheetNumber, product_code: labelSheet.sheetNumber }}
        />
      )}
    </>
  );
}

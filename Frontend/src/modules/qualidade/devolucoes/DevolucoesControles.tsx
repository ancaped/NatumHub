import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Printer, RefreshCw, Search } from 'lucide-react';
import PrintModal from '../../ferramentas/etiquetas/components/PrintModal';
import type { LabelElement, LabelTemplate } from '../../ferramentas/etiquetas/lib/types';
import Modal from '../../geral/components/ui/Modal';
import { apiJson } from '../../geral/lib/http';
import { cn } from '../../geral/lib/utils';
import { disposicaoLabel, printControleDevolucao, type PrintControle } from './printHelpers';

type Item = {
  id?: number;
  itemCode: string;
  description: string;
  qty: number;
  lotes: string;
  caixaFechada?: boolean;
  unidadesPorCaixa?: number | null;
  disposicao?: string | null;
  disposicaoObs?: string | null;
  erpStatus?: string | null;
};

type Pendente = {
  id: number;
  registerNumber: string;
  clientCode: string;
  clientName: string;
  returnDate: string;
  nfNumber: string;
  carrierName: string;
  receiverName: string;
  notes?: string | null;
  volumeCount: number;
  itemCount: number;
  items: Item[];
};

type Controle = PrintControle & {
  id: number;
  status: 'aberta' | 'devolvida' | 'cancelada';
  returnedBy?: string | null;
  returnedAt?: string | null;
  devolucaoCount: number;
};

type FonteRetorno = {
  devolucaoId: number;
  itemId: number;
  feito: boolean;
  registerNumber: string;
};

type GrupoControle = {
  itemCode: string;
  description: string;
  qty: number;
  lotes: string[];
  disposicao: string;
  obs: string[];
  fontes: FonteRetorno[];
};

const DESTINO_ORDEM = ['retornar_estoque', 'trocar_embalagem', 'trocar_rotulo', 'analise_fq', 'quarentena', 'outro', 'descartar'];

function lotesDe(texto: string) {
  return texto.split(/[,;/]/).map((parte) => parte.trim()).filter(Boolean);
}

function gruposDoControle(devolucoes: Controle['devolucoes']): GrupoControle[] {
  const map = new Map<string, GrupoControle>();
  for (const dev of devolucoes || []) {
    for (const item of dev.items || []) {
      const code = (item.itemCode || '').trim();
      const destino = item.disposicao || '';
      const key = `${code.toLowerCase()}|${destino}`;
      const atual = map.get(key);
      const fonte = item.id && dev.id
        ? { devolucaoId: dev.id, itemId: item.id, feito: item.erpStatus === 'lancado', registerNumber: dev.registerNumber }
        : null;
      if (!atual) {
        map.set(key, {
          itemCode: code || '—',
          description: item.description,
          qty: Number(item.qty) || 0,
          lotes: lotesDe(item.lotes || ''),
          disposicao: destino,
          obs: item.disposicaoObs?.trim() ? [item.disposicaoObs.trim()] : [],
          fontes: fonte ? [fonte] : [],
        });
        continue;
      }
      atual.qty += Number(item.qty) || 0;
      for (const lote of lotesDe(item.lotes || '')) {
        if (!atual.lotes.includes(lote)) atual.lotes.push(lote);
      }
      const obs = item.disposicaoObs?.trim();
      if (obs && !atual.obs.includes(obs)) atual.obs.push(obs);
      if (fonte) atual.fontes.push(fonte);
    }
  }
  return [...map.values()].sort((a, b) => {
    const ia = DESTINO_ORDEM.indexOf(a.disposicao);
    const ib = DESTINO_ORDEM.indexOf(b.disposicao);
    const oa = ia === -1 ? DESTINO_ORDEM.length : ia;
    const ob = ib === -1 ? DESTINO_ORDEM.length : ib;
    if (oa !== ob) return oa - ob;
    return a.itemCode.localeCompare(b.itemCode, 'pt-BR');
  });
}

function controleStatus(status: string) {
  if (status === 'devolvida') return { label: 'Conferido', badge: 'saudavel' };
  if (status === 'cancelada') return { label: 'Cancelado', badge: 'descontinuado' };
  return { label: 'Aguardando conferência', badge: 'ordem' };
}

function fmtWhen(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function textEl(
  id: string, x: number, y: number, w: number, h: number, text: string, fontSize: number, align: 'left' | 'center' | 'right' = 'left',
): LabelElement {
  return {
    id, type: 'text', x_mm: x, y_mm: y, width_mm: w, height_mm: h, zIndex: 2,
    props: { text, fontSize, fontWeight: 'bold', fontFamily: 'Inter', textAlign: align, color: '#000000' },
  };
}

function sheetLabel(sheet: Controle): LabelTemplate {
  const boxes = Math.max(1, sheet.volumeCount || 1);
  return {
    id: `dev_ctrl_${sheet.id}`,
    name: sheet.sheetNumber,
    category: 'custom',
    width_mm: 100,
    height_mm: 50,
    orientation: 'landscape',
    elements_json: [
      textEl('brand', 3, 2, 40, 4, 'NATUM', 8),
      textEl('kind', 44, 2, 53, 4, 'DEVOLUÇÃO', 8, 'right'),
      textEl('number', 3, 8, 94, 12, sheet.sheetNumber, 22, 'center'),
      textEl('boxes', 3, 24, 94, 6, boxes === 1 ? '1 VOLUME' : `${boxes} VOLUMES`, 14, 'center'),
      {
        id: 'bar', type: 'barcode', x_mm: 18, y_mm: 35, width_mm: 64, height_mm: 12, zIndex: 2,
        props: { value: sheet.sheetNumber, format: 'code128', showText: false },
      },
    ],
  };
}

export default function DevolucoesControles({ canEdit, screen }: { canEdit: boolean; screen: 'retorno' | 'controles' }) {
  const [pending, setPending] = useState<Pendente[]>([]);
  const [sheets, setSheets] = useState<Controle[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [open, setOpen] = useState<Controle | null>(null);
  const [volumes, setVolumes] = useState('1');
  const [labelSheet, setLabelSheet] = useState<Controle | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'all' | 'aberta' | 'devolvida' | 'cancelada'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [items, list] = await Promise.all([
        apiJson<Pendente[]>('/qualidade/devolucoes/controles/pendentes'),
        apiJson<Controle[]>('/qualidade/devolucoes/controles'),
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

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (open) setVolumes(String(open.volumeCount || 1)); }, [open]);

  const selectedCount = picked.length;
  const termo = busca.trim().toLowerCase();
  const pendentesVisiveis = pending.filter((item) => {
    if (!termo) return true;
    return [item.registerNumber, item.clientName, item.nfNumber, item.carrierName, item.receiverName, item.notes || '']
      .join(' ').toLowerCase().includes(termo);
  });
  const counts = useMemo(() => {
    const base = { aberta: 0, devolvida: 0, cancelada: 0 };
    for (const sheet of sheets) {
      if (sheet.status === 'aberta' || sheet.status === 'devolvida' || sheet.status === 'cancelada') base[sheet.status] += 1;
    }
    return base;
  }, [sheets]);
  const controlesVisiveis = sheets.filter((sheet) => {
    if (filtro !== 'all' && sheet.status !== filtro) return false;
    if (!termo) return true;
    return [sheet.sheetNumber, sheet.createdBy || ''].join(' ').toLowerCase().includes(termo);
  });

  const toggle = (id: number) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const generate = async () => {
    if (!picked.length) {
      setError('Selecione as devoluções deste controle.');
      return;
    }
    const volumeCount = picked.reduce((sum, id) => sum + (pending.find((item) => item.id === id)?.volumeCount || 1), 0);
    setBusy(true);
    setError('');
    try {
      const created = await apiJson<Controle>('/qualidade/devolucoes/controles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devolucaoIds: picked, volumeCount }),
      });
      setPicked([]);
      setOpen(created);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar o controle');
    } finally {
      setBusy(false);
    }
  };

  const persistVolumes = async (sheet: Controle) => {
    const n = Math.max(1, Math.min(99, parseInt(volumes, 10) || 1));
    const saved = await apiJson<Controle>(`/qualidade/devolucoes/controles/${sheet.id}/volumes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volumeCount: n }),
    });
    setOpen(saved);
    setSheets((prev) => prev.map((row) => (row.id === saved.id ? { ...row, volumeCount: saved.volumeCount } : row)));
    return saved;
  };

  const mark = async (path: 'devolver' | 'cancelar') => {
    if (!open) return;
    const question = path === 'devolver'
      ? `Registrar a conferência de ${open.sheetNumber}?`
      : `Cancelar ${open.sheetNumber}? As devoluções voltam para um novo controle.`;
    if (!window.confirm(question)) return;
    setBusy(true);
    setError('');
    try {
      setOpen(await apiJson<Controle>(`/qualidade/devolucoes/controles/${open.id}/${path}`, { method: 'POST' }));
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao atualizar o controle');
    } finally {
      setBusy(false);
    }
  };

  const marcarGrupo = async (grupo: GrupoControle, desfazer: boolean) => {
    if (!open) return;
    const alvos = grupo.fontes.filter((fonte) => (desfazer ? fonte.feito : !fonte.feito));
    if (alvos.length === 0) return;
    setBusy(true);
    setError('');
    try {
      for (const fonte of alvos) {
        await apiJson(`/qualidade/devolucoes/${fonte.devolucaoId}/itens/${fonte.itemId}/erp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: desfazer ? 'em_processo' : 'lancado' }),
        });
      }
      setOpen(await apiJson<Controle>(`/qualidade/devolucoes/controles/${open.id}`));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao marcar o retorno');
      setOpen(await apiJson<Controle>(`/qualidade/devolucoes/controles/${open.id}`).catch(() => open));
    } finally {
      setBusy(false);
    }
  };

  const openSheet = async (id: number) => {
    setBusy(true);
    setError('');
    try {
      setOpen(await apiJson<Controle>(`/qualidade/devolucoes/controles/${id}`));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao abrir o controle');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      {screen === 'retorno' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-sm">
              <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Aguardando controle</div>
              <div className="text-xl font-bold text-amber-600">{pending.length}</div>
            </div>
            <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-sm">
              <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Selecionadas</div>
              <div className="text-xl font-bold text-zinc-900">{selectedCount}</div>
            </div>
          </div>
          <div className="toolbar-section">
            <div className="search-input-wrapper">
              <Search size={16} />
              <input className="search-input" placeholder="Buscar registro, cliente, NF ou recebedor" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <button type="button" className="btn-secondary !px-2.5" onClick={() => void load()} title="Atualizar">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            {canEdit && (
              <button type="button" className="btn-primary" disabled={busy || selectedCount === 0} onClick={() => void generate()}>
                Gerar controle{selectedCount ? ` (${selectedCount})` : ''}
              </button>
            )}
          </div>
          <div className="hidden md:block bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="overflow-auto">
              {loading ? <div className="py-16 text-center text-sm text-zinc-500">Carregando…</div>
                : pendentesVisiveis.length === 0 ? <div className="py-16 text-center text-sm text-zinc-500">Nenhuma devolução aguardando controle.</div>
                  : (
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-50 text-zinc-500 uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="px-3 py-2.5 w-10" />
                          <th className="text-left px-3 py-2.5 font-bold">Registro</th>
                          <th className="text-left px-3 py-2.5 font-bold">Cliente</th>
                          <th className="text-left px-3 py-2.5 font-bold">NF</th>
                          <th className="text-left px-3 py-2.5 font-bold">Data</th>
                          <th className="text-right px-3 py-2.5 font-bold">Volumes</th>
                          <th className="text-right px-3 py-2.5 font-bold">Itens</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendentesVisiveis.map((item) => (
                          <tr key={item.id} className="border-t border-zinc-100 hover:bg-zinc-50/80">
                            <td className="px-3 py-2.5">
                              <input type="checkbox" className="h-4 w-4 accent-zinc-900" checked={picked.includes(item.id)} disabled={!canEdit} onChange={() => toggle(item.id)} />
                            </td>
                            <td className="px-3 py-2.5 font-mono font-bold">{item.registerNumber}</td>
                            <td className="px-3 py-2.5">{item.clientName || '—'}</td>
                            <td className="px-3 py-2.5 font-mono">{item.nfNumber || '—'}</td>
                            <td className="px-3 py-2.5">{fmtWhen(item.returnDate)}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{item.volumeCount || 1}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{item.itemCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
            </div>
          </div>
          <div className="md:hidden space-y-2">
            {pendentesVisiveis.map((item) => (
              <label key={item.id} className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-3 flex gap-3">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-zinc-900" checked={picked.includes(item.id)} disabled={!canEdit} onChange={() => toggle(item.id)} />
                <span>
                  <span className="font-mono text-sm font-bold">{item.registerNumber}</span>
                  <span className="block text-sm">{item.clientName || 'Sem cliente'}</span>
                  <span className="block text-[11px] text-zinc-500 mt-1">{item.nfNumber || 'Sem NF'} · {item.volumeCount || 1} vol. · {item.itemCount} itens</span>
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
              ['devolvida', 'Conferidos', counts.devolvida, 'emerald'],
              ['cancelada', 'Cancelados', counts.cancelada, 'rose'],
            ] as const).map(([id, label, value, tone]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFiltro(filtro === id ? 'all' : id)}
                className={cn(
                  'bg-white rounded-xl border p-3.5 shadow-sm text-left',
                  filtro === id ? 'ring-2 border-transparent' : 'border-zinc-200',
                  tone === 'amber' && (filtro === id ? 'ring-amber-500' : ''),
                  tone === 'emerald' && (filtro === id ? 'ring-emerald-500' : ''),
                  tone === 'rose' && (filtro === id ? 'ring-rose-500' : ''),
                )}
              >
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</div>
                <div className={cn('text-xl font-bold', tone === 'amber' && 'text-amber-600', tone === 'emerald' && 'text-emerald-600', tone === 'rose' && 'text-rose-600')}>{value}</div>
              </button>
            ))}
          </div>
          <div className="toolbar-section">
            <div className="search-input-wrapper">
              <Search size={16} />
              <input className="search-input" placeholder="Buscar número do controle" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <button type="button" className="btn-secondary !px-2.5" onClick={() => void load()} title="Atualizar">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="hidden md:block bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 text-zinc-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="text-left px-3 py-2.5 font-bold">Nº</th>
                  <th className="text-left px-3 py-2.5 font-bold">Data</th>
                  <th className="text-right px-3 py-2.5 font-bold">Volumes</th>
                  <th className="text-right px-3 py-2.5 font-bold">Devoluções</th>
                  <th className="text-left px-3 py-2.5 font-bold">Emitido por</th>
                  <th className="text-left px-3 py-2.5 font-bold">Situação</th>
                </tr>
              </thead>
              <tbody>
                {controlesVisiveis.map((sheet) => {
                  const status = controleStatus(sheet.status);
                  return (
                    <tr key={sheet.id} className="border-t border-zinc-100 hover:bg-zinc-50/80 cursor-pointer" onClick={() => void openSheet(sheet.id)}>
                      <td className="px-3 py-2.5 font-mono font-bold">{sheet.sheetNumber}</td>
                      <td className="px-3 py-2.5">{fmtWhen(sheet.createdAt)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{sheet.volumeCount || 1}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{sheet.devolucaoCount}</td>
                      <td className="px-3 py-2.5">{sheet.createdBy || '—'}</td>
                      <td className="px-3 py-2.5"><span className={cn('status-badge', status.badge)}>{status.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {open && (
        <Modal title={open.sheetNumber} subtitle={controleStatus(open.status).label} size="xl" onClose={() => setOpen(null)}>
          <div className="space-y-4">
            <label className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 block max-w-[180px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Volumes</span>
              <input
                className="mt-1 w-full h-11 bg-transparent font-mono text-2xl font-bold outline-none"
                inputMode="numeric"
                value={volumes}
                disabled={!canEdit || open.status === 'cancelada'}
                onChange={(e) => setVolumes(e.target.value.replace(/\D/g, '').slice(0, 2))}
              />
            </label>
            <p className="text-sm text-zinc-600">A etiqueta 100×50 leva o número {open.sheetNumber}. Sai uma igual em cada volume.</p>
            {(() => {
              const grupos = gruposDoControle(open.devolucoes);
              const retorno = grupos.filter((grupo) => grupo.disposicao === 'retornar_estoque');
              const feitos = retorno.filter((grupo) => grupo.fontes.length > 0 && grupo.fontes.every((fonte) => fonte.feito)).length;
              return (
                <>
                  {retorno.length > 0 && (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
                      Retorno ao estoque: <span className="font-mono font-bold">{feitos}</span> de <span className="font-mono font-bold">{retorno.length}</span> feito{retorno.length === 1 ? '' : 's'} no sistema
                    </div>
                  )}
                  <div className="border border-zinc-200 rounded-xl overflow-hidden divide-y divide-zinc-100">
                    {grupos.map((grupo) => {
                      const estoque = grupo.disposicao === 'retornar_estoque';
                      const feito = grupo.fontes.length > 0 && grupo.fontes.every((fonte) => fonte.feito);
                      const parcial = !feito && grupo.fontes.some((fonte) => fonte.feito);
                      const registros = [...new Set(grupo.fontes.map((fonte) => fonte.registerNumber))];
                      const qty = Math.round(grupo.qty * 1000) / 1000;
                      return (
                        <div key={`${grupo.itemCode}-${grupo.disposicao}`} className="px-3 py-2.5 bg-white">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-mono text-sm font-bold text-zinc-900">{grupo.itemCode}</div>
                              <div className="text-xs text-zinc-700">{grupo.description}</div>
                              <div className="mt-1 font-mono text-[11px] text-zinc-500">
                                {qty} · lote {grupo.lotes.length ? grupo.lotes.join(', ') : '—'}
                              </div>
                              {registros.length > 0 && (
                                <div className="mt-1 text-[11px] text-zinc-500">{registros.join(' · ')}</div>
                              )}
                              {grupo.obs.map((obs) => (
                                <div key={obs} className="mt-1 text-[11px] text-zinc-500">{obs}</div>
                              ))}
                            </div>
                            <span className={cn('status-badge shrink-0', estoque ? 'saudavel' : 'ordem')}>
                              {grupo.disposicao ? disposicaoLabel(grupo.disposicao) : '—'}
                            </span>
                          </div>
                          {estoque && open.status !== 'cancelada' && (
                            canEdit && grupo.fontes.length > 0 ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void marcarGrupo(grupo, feito)}
                                className={cn(
                                  'mt-2 inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg border text-xs font-bold',
                                  feito
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-amber-50 text-amber-800 border-amber-200',
                                )}
                              >
                                <CheckCircle2 size={14} />
                                {feito ? 'Retorno feito' : parcial ? 'Marcar o restante' : 'Marcar retorno feito'}
                              </button>
                            ) : (
                              <div className={cn('mt-2 text-xs font-bold', feito ? 'text-emerald-700' : 'text-amber-700')}>
                                {feito ? 'Retorno feito' : 'Retorno pendente'}
                              </div>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" disabled={busy} onClick={() => { void persistVolumes(open).then((saved) => printControleDevolucao(saved)).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Falha ao imprimir')); }}>
                <Printer size={14} /> Imprimir relatório
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => { void persistVolumes(open).then((saved) => setLabelSheet(saved)).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Falha ao salvar os volumes')); }}>
                Etiquetas 100×50
              </button>
              {canEdit && open.status === 'aberta' && (
                <>
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => void mark('devolver')}>Conferência feita</button>
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => void mark('cancelar')}>Cancelar</button>
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
          initialCopies={Math.max(1, labelSheet.volumeCount || 1)}
          onClose={() => setLabelSheet(null)}
          history={{ product_name: labelSheet.sheetNumber, product_code: labelSheet.sheetNumber }}
        />
      )}
    </>
  );
}

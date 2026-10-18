import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Camera, Check, CheckCircle2, ClipboardCheck, ClipboardList, Files, Package, PackageX, Plus, Printer,
  RefreshCw, Search, Trash2,
} from 'lucide-react';
import AppLayout from '../../geral/components/layout/AppLayout';
import Modal from '../../geral/components/ui/Modal';
import { getAuthUser } from '../../geral/lib/auth';
import { apiFetch, apiJson } from '../../geral/lib/http';
import { canEditView } from '../../geral/lib/modules/permissions';
import { cn } from '../../geral/lib/utils';
import {
  cleanupPrintIframes,
  disposicaoLabel,
  printDevolucaoFicha,
  printErpPending,
} from './printHelpers';
import DevolucoesControles from './DevolucoesControles';

type Status =
  | 'rascunho'
  | 'recebido'
  | 'em_conferencia'
  | 'disposto'
  | 'parcialmente_lancado'
  | 'finalizado';

type Disposicao =
  | 'retornar_estoque'
  | 'trocar_embalagem'
  | 'trocar_rotulo'
  | 'descartar'
  | 'quarentena'
  | 'analise_fq'
  | 'outro'
  | '';

type Filtro = 'abertas' | 'em_conferencia' | 'dispostas' | 'finalizadas' | 'all';
type TabId = 'lista' | 'editor' | 'conferencia' | 'retorno' | 'controles';

type DevolucaoItem = {
  id?: number;
  itemCode: string;
  description: string;
  qty: number;
  lotes: string;
  caixaFechada?: boolean;
  unidadesPorCaixa?: number | null;
  qtyConferida?: number | null;
  analiseObs?: string | null;
  disposicao?: string | null;
  disposicaoObs?: string | null;
  erpStatus: string;
  erpBy?: string | null;
  erpAt?: string | null;
  sortOrder?: number;
  fqPhOriginal?: number | null;
  fqViscosidadeOriginal?: number | null;
  fqDensidadeOriginal?: number | null;
  fqPhMedido?: number | null;
  fqViscosidadeMedido?: number | null;
  fqDensidadeMedido?: number | null;
  fqResultado?: string | null;
  fqResponsavel?: string | null;
  fqObservacao?: string | null;
  fotoPath?: string | null;
};

type Devolucao = {
  id: number;
  registerNumber: string;
  status: Status;
  clientCode: string;
  clientName: string;
  returnDate: string;
  nfNumber: string;
  receiverName: string;
  carrierName: string;
  notes?: string | null;
  volumeCount?: number;
  receivedBy?: string | null;
  receivedAt?: string | null;
  cqBy?: string | null;
  cqAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  items: DevolucaoItem[];
};

type ClientHit = { n_codigo: number; c_nome?: string | null };

type ItemHit = {
  lote: string;
  productCode: string;
  description: string;
  ph?: number | null;
  viscosidade?: number | null;
  densidade?: number | null;
  unidadesPorCaixa?: number | null;
};

type LoteSpecs = {
  ph?: number | null;
  viscosidade?: number | null;
  densidade?: number | null;
};

type DraftLine = {
  itemCode: string;
  description: string;
  qty: string;
  lotes: string;
  caixaFechada: boolean;
  unidadesPorCaixa: string;
  qtyConferida: string;
  analiseObs: string;
  disposicao: Disposicao;
  disposicaoObs: string;
};

const DISPOSICOES: { value: Disposicao; label: string }[] = [
  { value: 'retornar_estoque', label: 'Retornar ao estoque' },
  { value: 'trocar_embalagem', label: 'Trocar embalagem' },
  { value: 'trocar_rotulo', label: 'Trocar rótulo' },
  { value: 'descartar', label: 'Descarte / Avaria' },
  { value: 'quarentena', label: 'Quarentena' },
  { value: 'analise_fq', label: 'Análise físico-química (FQ)' },
  { value: 'outro', label: 'Outro' },
];

function fmtMeasure(n?: number | null, suffix = '') {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}${suffix}`;
}

function deltaLabel(original: number | null | undefined, measuredRaw: string, percent: boolean) {
  const measured = measuredRaw.trim() ? Number(measuredRaw) : NaN;
  if (original == null || Number.isNaN(measured)) return '';
  const abs = Math.abs(measured - original);
  if (!percent) return `Δ ${abs.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}`;
  if (!original) return '';
  const pct = (abs / Math.abs(original)) * 100;
  return `Δ ${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function linesFromItems(items: DevolucaoItem[]): DraftLine[] {
  return items.map((it) => ({
    itemCode: it.itemCode,
    description: it.description,
    qty: String(it.qty),
    lotes: it.lotes || '',
    caixaFechada: !!it.caixaFechada,
    unidadesPorCaixa: it.unidadesPorCaixa != null ? String(it.unidadesPorCaixa) : '',
    qtyConferida: it.qtyConferida != null ? String(it.qtyConferida) : '',
    analiseObs: it.analiseObs || '',
    disposicao: (it.disposicao as Disposicao) || '',
    disposicaoObs: it.disposicaoObs || '',
  }));
}

function emptyLine(): DraftLine {
  return {
    itemCode: '',
    description: '',
    qty: '',
    lotes: '',
    caixaFechada: false,
    unidadesPorCaixa: '',
    qtyConferida: '',
    analiseObs: '',
    disposicao: '',
    disposicaoObs: '',
  };
}

function statusLabel(s: Status) {
  const map: Record<Status, string> = {
    rascunho: 'Rascunho',
    recebido: 'Recebido',
    em_conferencia: 'Em conferência',
    disposto: 'Conferido',
    parcialmente_lancado: 'Retorno parcial',
    finalizado: 'Concluído',
  };
  return map[s] || s;
}

function statusBadge(s: Status) {
  if (s === 'finalizado') return 'saudavel';
  if (s === 'rascunho') return 'descontinuado';
  if (s === 'em_conferencia') return 'ordem';
  if (s === 'recebido') return 'aguardando';
  if (s === 'disposto' || s === 'parcialmente_lancado') return 'abundante';
  return 'descontinuado';
}

function disposicaoBadge(d: string) {
  if (d === 'retornar_estoque') return 'saudavel';
  if (d === 'descartar') return 'critico';
  if (d === 'analise_fq') return 'ordem';
  if (d === 'quarentena') return 'aguardando';
  if (d === 'trocar_embalagem' || d === 'trocar_rotulo') return 'montar';
  return 'descontinuado';
}

export default function DevolucoesView({ onBackToHub }: { onBackToHub: () => void }) {
  const canEdit = canEditView(getAuthUser(), 'qualidade_devolucoes');
  const [activeTab, setActiveTab] = useState<TabId>('lista');
  const [filtro, setFiltro] = useState<Filtro>('abertas');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Devolucao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [current, setCurrent] = useState<Devolucao | null>(null);
  const [clientCode, setClientCode] = useState('');
  const [clientName, setClientName] = useState('');
  const [returnDate, setReturnDate] = useState(todayIso());
  const [nfNumber, setNfNumber] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [notes, setNotes] = useState('');
  const [volumes, setVolumes] = useState('1');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  const [clientQuery, setClientQuery] = useState('');
  const [clientHits, setClientHits] = useState<ClientHit[]>([]);
  const [confRows, setConfRows] = useState<Devolucao[]>([]);
  const [itemQuery, setItemQuery] = useState('');
  const [itemHits, setItemHits] = useState<ItemHit[]>([]);
  const [pendingItem, setPendingItem] = useState<ItemHit | null>(null);
  const [pendingQty, setPendingQty] = useState('');
  const [pendingCaixaFechada, setPendingCaixaFechada] = useState(false);
  const [pendingUnidadesPorCaixa, setPendingUnidadesPorCaixa] = useState('');
  const [pendingNumCaixas, setPendingNumCaixas] = useState('');
  const [pendingDisposicao, setPendingDisposicao] = useState<Disposicao>('retornar_estoque');
  const [pendingDisposicaoObs, setPendingDisposicaoObs] = useState('');
  const [conferirNaColeta, setConferirNaColeta] = useState(false);
  const [openExtra, setOpenExtra] = useState<number | null>(null);
  const [editingUpcIdx, setEditingUpcIdx] = useState<number | null>(null);
  const [tempUpc, setTempUpc] = useState('');
  const [fqItem, setFqItem] = useState<DevolucaoItem | null>(null);
  const [fqSpecs, setFqSpecs] = useState<LoteSpecs | null>(null);
  const [fqPh, setFqPh] = useState('');
  const [fqVisc, setFqVisc] = useState('');
  const [fqDens, setFqDens] = useState('');
  const [fqObs, setFqObs] = useState('');
  const [fqAp, setFqAp] = useState<'retornar_estoque' | 'trocar_embalagem'>('retornar_estoque');
  const [confCurrent, setConfCurrent] = useState<Devolucao | null>(null);
  const [confLines, setConfLines] = useState<DraftLine[]>([]);
  const [fotos, setFotos] = useState<Record<number, string>>({});
  const [splitQty, setSplitQty] = useState<Record<number, string>>({});

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ filtro: 'all' });
      if (search.trim()) params.set('q', search.trim());
      const data = await apiJson<Devolucao[]>(`/qualidade/devolucoes?${params}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    cleanupPrintIframes();
  }, []);

  useEffect(() => {
    if (activeTab === 'lista' || activeTab === 'editor') void loadList();
  }, [activeTab, loadList]);

  useEffect(() => {
    (window as unknown as { __current_page__?: string }).__current_page__ =
      activeTab === 'lista' ? 'Lista' : activeTab === 'conferencia' ? 'Conferência' : editingId ? 'Editar' : 'Nova';
  }, [activeTab, editingId]);

  useEffect(() => {
    if (!clientQuery.trim() || clientQuery.trim().length < 2) {
      setClientHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const hits = await apiJson<ClientHit[]>(
          `/vendas/clientes?search=${encodeURIComponent(clientQuery.trim())}&days=3650`,
        );
        setClientHits(Array.isArray(hits) ? hits : []);
      } catch {
        setClientHits([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [clientQuery]);

  useEffect(() => {
    if (activeTab !== 'conferencia') return;
    let cancel = false;
    void (async () => {
      try {
        const data = await apiJson<Devolucao[]>('/qualidade/devolucoes?filtro=em_conferencia');
        if (!cancel) setConfRows(Array.isArray(data) ? data : []);
      } catch {
        if (!cancel) setConfRows([]);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [activeTab, confCurrent?.status, confCurrent?.updatedAt]);

  useEffect(() => {
    if (!confCurrent) {
      setFotos({});
      return;
    }
    let cancel = false;
    const created: string[] = [];
    void (async () => {
      const next: Record<number, string> = {};
      for (const it of confCurrent.items || []) {
        if (!it.id || !it.fotoPath) continue;
        try {
          const res = await apiFetch(`/qualidade/devolucoes/${confCurrent.id}/itens/${it.id}/foto`);
          if (!res.ok) continue;
          const url = URL.createObjectURL(await res.blob());
          created.push(url);
          next[it.id] = url;
        } catch {
          /* foto opcional */
        }
      }
      if (!cancel) setFotos(next);
    })();
    return () => {
      cancel = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [confCurrent]);

  useEffect(() => {
    const draft = !current || current.status === 'rascunho';
    const q = itemQuery.trim();
    if (!draft || q.length < 2) {
      setItemHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const hits = await apiJson<ItemHit[]>(
          `/qualidade/devolucoes/lookup-item?q=${encodeURIComponent(q)}`,
        );
        setItemHits(Array.isArray(hits) ? hits : []);
      } catch {
        setItemHits([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [itemQuery, current]);

  const openCreate = () => {
    setEditingId(null);
    setCurrent(null);
    setClientCode('');
    setClientName('');
    setReturnDate(todayIso());
    setNfNumber('');
    setReceiverName('');
    setCarrierName('');
    setNotes('');
    setVolumes('1');
    setLines([emptyLine()]);
  };

  const openEdit = async (d: Devolucao) => {
    setBusy(true);
    setError('');
    try {
      const full = await apiJson<Devolucao>(`/qualidade/devolucoes/${d.id}`);
      if (!full || typeof full !== 'object' || !full.id) {
        throw new Error('Resposta inválida ao abrir devolução');
      }
      const items = Array.isArray(full.items) ? full.items : [];
      setEditingId(full.id);
      setCurrent({ ...full, items });
      setClientCode(full.clientCode || '');
      setClientName(full.clientName || '');
      setReturnDate(full.returnDate || todayIso());
      setNfNumber(full.nfNumber || '');
      setReceiverName(full.receiverName || '');
      setCarrierName(full.carrierName || '');
      setNotes(full.notes || '');
      setVolumes(String(full.volumeCount || 1));
      setLines(items.length ? linesFromItems(items) : [emptyLine()]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao abrir');
    } finally {
      setBusy(false);
    }
  };

  const isDraft = !current || current.status === 'rascunho';
  const canErp =
    current &&
    ['disposto', 'parcialmente_lancado', 'finalizado'].includes(current.status);

  const buildPayloadItems = (concluirDireto = false) =>
    lines
      .filter((l) => l.itemCode.trim() && Number(l.qty) > 0)
      .map((l) => {
        const qtyNum = Number(l.qty);
        const upcNum = l.unidadesPorCaixa ? Number(l.unidadesPorCaixa) : null;
        const disp = concluirDireto ? (l.disposicao || 'retornar_estoque') : (l.disposicao || null);
        const dispObs = l.disposicaoObs?.trim() || null;
        const qtyConf = concluirDireto
          ? (Number(l.qtyConferida) > 0 ? Number(l.qtyConferida) : qtyNum)
          : (l.qtyConferida ? Number(l.qtyConferida) : (conferirNaColeta && disp ? qtyNum : null));
        return {
          itemCode: l.itemCode.trim(),
          description: l.description.trim(),
          qty: qtyNum,
          lotes: l.lotes.trim(),
          caixaFechada: l.caixaFechada,
          unidadesPorCaixa: upcNum,
          disposicao: disp,
          disposicaoObs: dispObs,
          qtyConferida: qtyConf,
        };
      });

  const saveDraft = async () => {
    const items = buildPayloadItems(false);
    if (items.length === 0) {
      setError('Informe ao menos um item');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = {
        clientCode: clientCode.trim(),
        clientName: clientName.trim(),
        returnDate,
        nfNumber: nfNumber.trim(),
        receiverName: receiverName.trim(),
        carrierName: carrierName.trim(),
        notes: notes.trim() || null,
        volumeCount: Math.max(1, Math.min(99, parseInt(volumes, 10) || 1)),
        items,
      };
      const saved = editingId
        ? await apiJson<Devolucao>(`/qualidade/devolucoes/${editingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await apiJson<Devolucao>('/qualidade/devolucoes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
      setEditingId(saved.id);
      setCurrent(saved);
      await openEdit(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  };

  const receber = async () => {
    const items = buildPayloadItems(false);
    if (items.length === 0) {
      setError('Informe ao menos um item');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = {
        clientCode: clientCode.trim(),
        clientName: clientName.trim(),
        returnDate,
        nfNumber: nfNumber.trim(),
        receiverName: receiverName.trim(),
        carrierName: carrierName.trim(),
        notes: notes.trim() || null,
        volumeCount: Math.max(1, Math.min(99, parseInt(volumes, 10) || 1)),
        items,
      };
      let id = editingId;
      if (!id || !current || current.status === 'rascunho') {
        const saved = id
          ? await apiJson<Devolucao>(`/qualidade/devolucoes/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
          : await apiJson<Devolucao>('/qualidade/devolucoes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
        id = saved.id;
        setEditingId(id);
      }
      const received = await apiJson<Devolucao>(`/qualidade/devolucoes/${id}/receber`, {
        method: 'POST',
      });
      await openEdit(received);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao receber');
    } finally {
      setBusy(false);
    }
  };

  const receberEConcluir = async () => {
    const items = buildPayloadItems(true);
    if (items.length === 0) {
      setError('Informe ao menos um item');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = {
        clientCode: clientCode.trim(),
        clientName: clientName.trim(),
        returnDate,
        nfNumber: nfNumber.trim(),
        receiverName: receiverName.trim(),
        carrierName: carrierName.trim(),
        notes: notes.trim() || null,
        volumeCount: Math.max(1, Math.min(99, parseInt(volumes, 10) || 1)),
        items,
      };
      let id = editingId;
      if (!id || !current || current.status === 'rascunho') {
        const saved = id
          ? await apiJson<Devolucao>(`/qualidade/devolucoes/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
          : await apiJson<Devolucao>('/qualidade/devolucoes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
        id = saved.id;
        setEditingId(id);
      }
      await apiJson<Devolucao>(`/qualidade/devolucoes/${id}/receber`, { method: 'POST' });
      const final = await apiJson<Devolucao>(`/qualidade/devolucoes/${id}/fechar-cq`, { method: 'POST' });
      await openEdit(final);
      await loadList();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao receber e concluir conferência');
    } finally {
      setBusy(false);
    }
  };

  const applyConf = (saved: Devolucao) => {
    const items = Array.isArray(saved.items) ? saved.items : [];
    setConfCurrent({ ...saved, items });
    setConfLines(linesFromItems(items));
  };

  const conferirLinha = async (idx: number) => {
    if (!confCurrent?.items[idx]?.id) return;
    const line = confLines[idx];
    const itemId = confCurrent.items[idx].id!;
    setBusy(true);
    setError('');
    try {
      const saved = await apiJson<Devolucao>(
        `/qualidade/devolucoes/${confCurrent.id}/itens/${itemId}/conferir`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            qtyConferida: line.qtyConferida ? Number(line.qtyConferida) : null,
            analiseObs: line.analiseObs || null,
            disposicao: line.disposicao || null,
            disposicaoObs: line.disposicaoObs || null,
            lotes: line.lotes.trim() || null,
            caixaFechada: line.caixaFechada,
            unidadesPorCaixa: line.unidadesPorCaixa ? Number(line.unidadesPorCaixa) : null,
          }),
        },
      );
      applyConf(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao conferir item');
    } finally {
      setBusy(false);
    }
  };

  const fecharCq = async () => {
    if (!confCurrent) return;
    setBusy(true);
    try {
      for (let i = 0; i < confLines.length; i++) {
        if (confCurrent.items[i]?.id && confLines[i].disposicao) {
          await apiJson(`/qualidade/devolucoes/${confCurrent.id}/itens/${confCurrent.items[i].id}/conferir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              qtyConferida: confLines[i].qtyConferida ? Number(confLines[i].qtyConferida) : null,
              analiseObs: confLines[i].analiseObs || null,
              disposicao: confLines[i].disposicao || null,
              disposicaoObs: confLines[i].disposicaoObs || null,
              lotes: confLines[i].lotes.trim() || null,
              caixaFechada: confLines[i].caixaFechada,
              unidadesPorCaixa: confLines[i].unidadesPorCaixa ? Number(confLines[i].unidadesPorCaixa) : null,
            }),
          });
        }
      }
      const saved = await apiJson<Devolucao>(`/qualidade/devolucoes/${confCurrent.id}/fechar-cq`, {
        method: 'POST',
      });
      applyConf(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao fechar CQ');
    } finally {
      setBusy(false);
    }
  };

  const separarLinha = async (idx: number) => {
    if (!confCurrent?.items[idx]?.id) return;
    const itemId = confCurrent.items[idx].id!;
    const qty = Number((splitQty[itemId] || '').replace(',', '.'));
    if (!(qty > 0)) {
      setError('Informe quantas unidades ficam com o outro destino');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const line = confLines[idx];
      if (line) {
        await apiJson(
          `/qualidade/devolucoes/${confCurrent.id}/itens/${itemId}/conferir`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              qtyConferida: line.qtyConferida ? Number(line.qtyConferida) : null,
              analiseObs: line.analiseObs || null,
              disposicao: line.disposicao || null,
              disposicaoObs: line.disposicaoObs || null,
              lotes: line.lotes.trim() || null,
              caixaFechada: line.caixaFechada,
            }),
          },
        );
      }
      const saved = await apiJson<Devolucao>(
        `/qualidade/devolucoes/${confCurrent.id}/itens/${itemId}/dividir`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qty }),
        },
      );
      setSplitQty((prev) => ({ ...prev, [itemId]: '' }));
      applyConf(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao separar a quantidade');
    } finally {
      setBusy(false);
    }
  };

  const toggleErp = async (idx: number) => {
    if (!current?.items[idx]?.id) return;
    const item = current.items[idx];
    const next = item.erpStatus === 'lancado' ? 'em_processo' : 'lancado';
    setBusy(true);
    try {
      const saved = await apiJson<Devolucao>(
        `/qualidade/devolucoes/${current.id}/itens/${item.id}/erp`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next }),
        },
      );
      await openEdit(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao marcar o retorno');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: Devolucao) => {
    if (!window.confirm(`Excluir a devolução ${d.registerNumber}?`)) return;
    try {
      await apiJson(`/qualidade/devolucoes/${d.id}`, { method: 'DELETE' });
      if (editingId === d.id) {
        setEditingId(null);
        setCurrent(null);
        setLines([emptyLine()]);
      }
      if (confCurrent?.id === d.id) {
        setConfCurrent(null);
        setConfLines([]);
      }
      await loadList();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao excluir');
    }
  };

  const selectItem = (h: ItemHit) => {
    setPendingItem(h);
    setItemHits([]);
    setItemQuery('');
    if (h.unidadesPorCaixa && h.unidadesPorCaixa > 0) {
      setPendingUnidadesPorCaixa(String(h.unidadesPorCaixa));
      setPendingCaixaFechada(true);
      setPendingNumCaixas('1');
      setPendingQty(String(h.unidadesPorCaixa));
    } else {
      setPendingUnidadesPorCaixa('');
      setPendingCaixaFechada(false);
      setPendingNumCaixas('');
      setPendingQty('');
    }
  };

  const addPendingItem = () => {
    let item = pendingItem;
    let qtyVal = pendingQty;
    let cxFechada = pendingCaixaFechada;
    let upcVal = pendingUnidadesPorCaixa;

    if (!item && itemHits.length > 0) {
      item = itemHits[0];
      if (item.unidadesPorCaixa && item.unidadesPorCaixa > 0) {
        upcVal = String(item.unidadesPorCaixa);
        cxFechada = true;
        if (!qtyVal || Number(qtyVal) <= 0) {
          qtyVal = String(item.unidadesPorCaixa);
        }
      }
    }

    if (!item) {
      setError('Selecione um item (busque por código, descrição ou lote)');
      return;
    }
    const finalQty = Number(qtyVal);
    if (!(finalQty > 0)) {
      setError('Informe uma quantidade válida');
      return;
    }

    const finalUpc = cxFechada && Number(upcVal) > 0 ? Number(upcVal) : null;
    const line: DraftLine = {
      ...emptyLine(),
      itemCode: item.productCode,
      description: item.description,
      lotes: item.lote || '',
      qty: String(finalQty),
      caixaFechada: cxFechada,
      unidadesPorCaixa: finalUpc ? String(finalUpc) : '',
      disposicao: conferirNaColeta ? pendingDisposicao : '',
      disposicaoObs: conferirNaColeta ? pendingDisposicaoObs.trim() : '',
      qtyConferida: conferirNaColeta ? String(finalQty) : '',
    };
    setLines((prev) => {
      const filled = prev.filter((l) => l.itemCode.trim() || l.description.trim());
      return [...filled, line];
    });
    setPendingItem(null);
    setPendingQty('');
    setPendingCaixaFechada(false);
    setPendingUnidadesPorCaixa('');
    setPendingNumCaixas('');
    setPendingDisposicao('retornar_estoque');
    setPendingDisposicaoObs('');
    setItemQuery('');
    setItemHits([]);
    setError('');
  };

  const openConference = async (d: Devolucao) => {
    setBusy(true);
    setError('');
    try {
      const full = await apiJson<Devolucao>(`/qualidade/devolucoes/${d.id}`);
      applyConf(full);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao abrir conferência');
    } finally {
      setBusy(false);
    }
  };

  const uploadFoto = async (itemId: number, file: File) => {
    if (!confCurrent) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch(`/qualidade/devolucoes/${confCurrent.id}/itens/${itemId}/foto`, {
        method: 'POST',
        body: fd,
      });
      const saved = (await res.json()) as Devolucao;
      if (!res.ok) {
        const msg = saved && typeof saved === 'object' && 'error' in saved ? String((saved as { error?: string }).error) : 'Falha ao enviar a foto';
        throw new Error(msg);
      }
      applyConf(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao enviar a foto');
    } finally {
      setBusy(false);
    }
  };

  const iniciarConferencia = async () => {
    if (!confCurrent) return;
    setBusy(true);
    setError('');
    try {
      const saved = await apiJson<Devolucao>(`/qualidade/devolucoes/${confCurrent.id}/iniciar-conferencia`, {
        method: 'POST',
      });
      applyConf(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao iniciar conferência');
    } finally {
      setBusy(false);
    }
  };

  const openFq = async (item: DevolucaoItem) => {
    setFqItem(item);
    setFqPh(item.fqPhMedido != null ? String(item.fqPhMedido) : '');
    setFqVisc(item.fqViscosidadeMedido != null ? String(item.fqViscosidadeMedido) : '');
    setFqDens(item.fqDensidadeMedido != null ? String(item.fqDensidadeMedido) : '');
    setFqObs(item.fqObservacao || '');
    setFqAp('retornar_estoque');
    setFqSpecs(null);
    try {
      const specs = await apiJson<LoteSpecs>(
        `/qualidade/devolucoes/lote-specs?lote=${encodeURIComponent(item.lotes || '')}&code=${encodeURIComponent(item.itemCode || '')}`,
      );
      setFqSpecs(specs);
    } catch {
      setFqSpecs({ ph: null, viscosidade: null, densidade: null });
    }
  };

  const confirmarFq = async (resultado: 'AP' | 'RP') => {
    if (!confCurrent || !fqItem?.id) return;
    setBusy(true);
    setError('');
    try {
      const saved = await apiJson<Devolucao>(
        `/qualidade/devolucoes/${confCurrent.id}/itens/${fqItem.id}/analise-fq`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phMedido: fqPh.trim() ? Number(fqPh) : null,
            viscosidadeMedido: fqVisc.trim() ? Number(fqVisc) : null,
            densidadeMedido: fqDens.trim() ? Number(fqDens) : null,
            resultado,
            observacao: fqObs.trim() || null,
            disposicaoAp: resultado === 'AP' ? fqAp : null,
          }),
        },
      );
      applyConf(saved);
      setFqItem(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar análise FQ');
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => ({
    abertas: rows.filter((d) => d.status !== 'finalizado').length,
    conferencia: rows.filter((d) => d.status === 'em_conferencia').length,
    dispostas: rows.filter((d) => d.status === 'disposto' || d.status === 'parcialmente_lancado').length,
    finalizadas: rows.filter((d) => d.status === 'finalizado').length,
  }), [rows]);

  const visibleRows = useMemo(() => rows.filter((d) => {
    if (filtro === 'finalizadas') return d.status === 'finalizado';
    if (filtro === 'em_conferencia') return d.status === 'em_conferencia';
    if (filtro === 'dispostas') return d.status === 'disposto' || d.status === 'parcialmente_lancado';
    if (filtro === 'all') return true;
    return d.status !== 'finalizado';
  }), [rows, filtro]);

  const itensPreenchidos = lines.filter((l) => l.itemCode.trim() && Number(l.qty) > 0);
  const suggestedVolumes = useMemo(() => {
    if (itensPreenchidos.length === 0) return 1;
    let cxTotal = 0;
    let hasAvulso = false;
    for (const l of itensPreenchidos) {
      if (l.caixaFechada) {
        const upc = Number(l.unidadesPorCaixa) || 0;
        const q = Number(l.qty) || 0;
        if (upc > 0) {
          cxTotal += Math.ceil(q / upc);
        } else {
          cxTotal += 1;
        }
      } else {
        hasAvulso = true;
      }
    }
    const total = cxTotal + (hasAvulso ? 1 : 0);
    return Math.max(1, total);
  }, [itensPreenchidos]);
  const conferidos = confLines.filter((l) => Number(l.qtyConferida) > 0 && l.disposicao).length;
  const confAtiva = !!confCurrent && (confCurrent.status === 'recebido' || confCurrent.status === 'em_conferencia');

  const sidebarItems = [
    { id: 'lista', label: 'Devoluções', icon: ClipboardList },
    { id: 'editor', label: 'Cadastro', icon: PackageX },
    { id: 'conferencia', label: 'Conferência', icon: ClipboardCheck },
    { id: 'retorno', label: 'Controle de Retorno', icon: Package },
    { id: 'controles', label: 'Controles emitidos', icon: Files },
  ];

  const headerActions = (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      {activeTab === 'lista' && (
        <button type="button" className="btn-secondary" onClick={() => void loadList()} title="Atualizar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      )}
      {activeTab === 'editor' && (
        <>
          <button type="button" className="btn-secondary" onClick={openCreate}>
            <Plus size={14} /> Nova
          </button>
          {isDraft && (
            <>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => void saveDraft()}>Salvar rascunho</button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => void receber()}>Receber</button>
              <button
                type="button"
                className="btn-primary inline-flex items-center gap-1.5"
                disabled={busy}
                onClick={() => void receberEConcluir()}
                title="Recebe a devolução e conclui a conferência em etapa única (operador único)"
              >
                <CheckCircle2 size={14} /> Receber e Concluir
              </button>
            </>
          )}
          {current && !isDraft && (
            <button type="button" className="btn-primary" disabled={busy || !canEdit} onClick={() => void saveDraft()}>Salvar</button>
          )}
          {current && (
            <button type="button" className="btn-secondary" onClick={() => void remove(current)}>
              <Trash2 size={14} /> Excluir
            </button>
          )}
        </>
      )}
      {activeTab === 'conferencia' && confCurrent?.status === 'recebido' && (
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void iniciarConferencia()}>Iniciar conferência</button>
      )}
      {activeTab === 'conferencia' && confAtiva && (
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void fecharCq()}>Concluir conferência</button>
      )}
      {activeTab === 'editor' && current && (
        <button type="button" className="btn-secondary" onClick={() => printDevolucaoFicha(current)}>
          <Printer size={14} /> Ficha
        </button>
      )}
      {activeTab === 'conferencia' && confCurrent && (
        <button type="button" className="btn-secondary" onClick={() => printDevolucaoFicha(confCurrent)}>
          <Printer size={14} /> Ficha
        </button>
      )}
      {canErp && current && activeTab === 'editor' && (
        <button type="button" className="btn-secondary" onClick={() => printErpPending(current)}>
          <Printer size={14} /> Itens do retorno
        </button>
      )}
    </div>
  );

  const inputCls = 'w-full h-9 px-2.5 rounded-lg border border-zinc-200 bg-white text-sm text-zinc-900 outline-none focus:border-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-500';

  return (
    <AppLayout
      moduleTitle="Devoluções"
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as TabId)}
      headerActions={headerActions}
    >
      <div className="view-container h-full min-h-0 pb-20 md:pb-6">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}

        {(activeTab === 'retorno' || activeTab === 'controles') && (
          <DevolucoesControles canEdit={canEdit} screen={activeTab} />
        )}

        {activeTab === 'lista' && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {([
                ['abertas', 'Em aberto', counts.abertas, 'rose'],
                ['em_conferencia', 'Em conferência', counts.conferencia, 'amber'],
                ['dispostas', 'Conferidas', counts.dispostas, 'blue'],
                ['finalizadas', 'Concluídas', counts.finalizadas, 'emerald'],
              ] as const).map(([id, label, value, tone]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFiltro(filtro === id ? 'all' : id)}
                  className={cn(
                    'bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 text-left cursor-pointer transition-all hover:shadow-md',
                    filtro === id ? 'ring-2 border-transparent' : 'border-zinc-200',
                    tone === 'rose' && (filtro === id ? 'ring-rose-500' : 'hover:border-rose-300'),
                    tone === 'amber' && (filtro === id ? 'ring-amber-500' : 'hover:border-amber-300'),
                    tone === 'blue' && (filtro === id ? 'ring-blue-500' : 'hover:border-blue-300'),
                    tone === 'emerald' && (filtro === id ? 'ring-emerald-500' : 'hover:border-emerald-300'),
                  )}
                >
                  <div>
                    <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</div>
                    <div className={cn(
                      'text-xl font-bold',
                      tone === 'rose' && 'text-rose-600',
                      tone === 'amber' && 'text-amber-600',
                      tone === 'blue' && 'text-blue-600',
                      tone === 'emerald' && 'text-emerald-600',
                    )}>{value}</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="toolbar-section">
              <div className="search-input-wrapper">
                <Search size={16} />
                <input
                  className="search-input"
                  placeholder="Buscar nº, origem, NF ou recebedor"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="hidden md:block bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden min-h-0">
              <div className="overflow-auto">
                {loading ? (
                  <div className="py-16 text-center text-sm text-zinc-500">Carregando devoluções…</div>
                ) : visibleRows.length === 0 ? (
                  <div className="py-16 text-center text-sm text-zinc-500">Nenhuma devolução neste filtro.</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-zinc-50 text-zinc-500 uppercase tracking-wider text-[10px] sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2.5 font-bold">Nº</th>
                        <th className="text-left px-3 py-2.5 font-bold">Origem</th>
                        <th className="text-left px-3 py-2.5 font-bold">NF</th>
                        <th className="text-right px-3 py-2.5 font-bold">Volumes</th>
                        <th className="text-left px-3 py-2.5 font-bold">Data</th>
                        <th className="text-left px-3 py-2.5 font-bold">Transportadora</th>
                        <th className="text-left px-3 py-2.5 font-bold">Recebedor</th>
                        <th className="text-left px-3 py-2.5 font-bold">Status</th>
                        <th className="text-right px-3 py-2.5 font-bold">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((d) => (
                        <tr key={d.id} className="border-t border-zinc-100 hover:bg-zinc-50/80 cursor-pointer" onClick={() => { setActiveTab('editor'); void openEdit(d); }}>
                          <td className="px-3 py-2.5 font-mono font-bold text-zinc-900">{d.registerNumber}</td>
                          <td className="px-3 py-2.5">
                            <div className="font-semibold text-zinc-800">{d.clientName || '—'}</div>
                            {d.clientCode && <div className="font-mono text-[10px] text-zinc-400">{d.clientCode}</div>}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-zinc-700">{d.nfNumber || '—'}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{d.volumeCount || 1}</td>
                          <td className="px-3 py-2.5 text-zinc-600">{d.returnDate}</td>
                          <td className="px-3 py-2.5 text-zinc-600">{d.carrierName || '—'}</td>
                          <td className="px-3 py-2.5 text-zinc-600">{d.receiverName || '—'}</td>
                          <td className="px-3 py-2.5">
                            <span className={cn('status-badge', statusBadge(d.status))}>{statusLabel(d.status)}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              <button type="button" className="p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer" title="Imprimir ficha" onClick={() => void apiJson<Devolucao>(`/qualidade/devolucoes/${d.id}`).then((full) => printDevolucaoFicha(full))}>
                                <Printer size={14} />
                              </button>
                              <button type="button" className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 cursor-pointer" title="Excluir" onClick={() => void remove(d)}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <div className="md:hidden space-y-2">
              {loading ? (
                <div className="py-10 text-center text-sm text-zinc-500">Carregando devoluções…</div>
              ) : visibleRows.length === 0 ? (
                <div className="py-10 text-center text-sm text-zinc-500">Nenhuma devolução neste filtro.</div>
              ) : visibleRows.map((d) => (
                <div key={d.id} className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-bold">{d.registerNumber}</div>
                      <div className="text-sm text-zinc-700 truncate">{d.clientName || 'Sem origem'}</div>
                    </div>
                    <span className={cn('status-badge shrink-0', statusBadge(d.status))}>{statusLabel(d.status)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-zinc-500">
                    <span>NF {d.nfNumber || '—'}</span>
                    <span>{d.returnDate}</span>
                    <span className="truncate">{d.carrierName || 'Sem transportadora'}</span>
                    <span className="truncate">{d.receiverName || 'Sem recebedor'}</span>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary flex-1 justify-center" onClick={() => { setActiveTab('editor'); void openEdit(d); }}>
                      Editar
                    </button>
                    <button type="button" className="btn-secondary flex-1 justify-center" onClick={() => void apiJson<Devolucao>(`/qualidade/devolucoes/${d.id}`).then((full) => printDevolucaoFicha(full))}>
                      <Printer size={14} /> Ficha
                    </button>
                    <button type="button" className="btn-secondary flex-1 justify-center text-rose-700" onClick={() => void remove(d)}>
                      <Trash2 size={14} /> Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === 'editor' && (
          <>
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm">
              <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-sm font-bold text-zinc-900 truncate">
                    {current?.registerNumber || 'Nova devolução'}
                  </span>
                  {current && <span className={cn('status-badge', statusBadge(current.status))}>{statusLabel(current.status)}</span>}
                </div>
                <select
                  className="h-9 max-w-[220px] px-2 rounded-lg border border-zinc-200 bg-white text-xs"
                  value={editingId ?? ''}
                  onChange={(e) => {
                    const row = rows.find((r) => r.id === Number(e.target.value));
                    if (row) void openEdit(row);
                    else openCreate();
                  }}
                >
                  <option value="">Nova devolução</option>
                  {rows.map((d) => (
                    <option key={d.id} value={d.id}>{d.registerNumber}</option>
                  ))}
                </select>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <label className="space-y-1 sm:col-span-2 relative">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Origem (cliente / fornecedor)</span>
                  <div className="flex gap-2">
                    <input className={cn(inputCls, 'w-28 font-mono text-xs')} placeholder="Código" value={clientCode} disabled={!canEdit} onChange={(e) => setClientCode(e.target.value)} />
                    <input
                      className={inputCls}
                      placeholder="Opcional"
                      value={clientName}
                      disabled={!canEdit}
                      onChange={(e) => { setClientName(e.target.value); setClientQuery(e.target.value); }}
                    />
                  </div>
                  {isDraft && clientHits.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg max-h-40 overflow-auto">
                      {clientHits.map((h) => (
                        <button
                          key={h.n_codigo}
                          type="button"
                          className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 cursor-pointer"
                          onClick={() => { setClientCode(String(h.n_codigo)); setClientName(h.c_nome || ''); setClientHits([]); setClientQuery(''); }}
                        >
                          <span className="font-mono font-semibold">{h.n_codigo}</span>
                          <span className="ml-2 text-zinc-600">{h.c_nome}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Data</span>
                  <input type="date" className={inputCls} value={returnDate} disabled={!canEdit} onChange={(e) => setReturnDate(e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Nº NF</span>
                  <input className={cn(inputCls, 'font-mono')} placeholder="Ex.: 12450" value={nfNumber} disabled={!canEdit} onChange={(e) => setNfNumber(e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Transportadora</span>
                  <input className={inputCls} value={carrierName} disabled={!canEdit} onChange={(e) => setCarrierName(e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Recebedor</span>
                  <input className={inputCls} value={receiverName} disabled={!canEdit} onChange={(e) => setReceiverName(e.target.value)} />
                </label>
                <label className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Volumes</span>
                    {isDraft && itensPreenchidos.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setVolumes(String(suggestedVolumes))}
                        className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
                        title="Calcular volumes automaticamente: cada caixa fechada conta 1 volume + 1 volume para itens avulsos"
                      >
                        Sugerir ({suggestedVolumes})
                      </button>
                    )}
                  </div>
                  <input className={cn(inputCls, 'font-mono')} inputMode="numeric" placeholder="Ex.: 1" value={volumes} disabled={!canEdit} onChange={(e) => setVolumes(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                </label>
                <label className="space-y-1 sm:col-span-2 lg:col-span-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Observações</span>
                  <input className={inputCls} value={notes} disabled={!canEdit} onChange={(e) => setNotes(e.target.value)} />
                </label>
              </div>
            </div>

            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm">
              <div className="px-4 py-3 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Itens da devolução</span>
                  <span className="text-xs font-mono font-bold text-zinc-600">({itensPreenchidos.length})</span>
                </div>
                {isDraft && (
                  <label className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border border-zinc-200 bg-zinc-50 cursor-pointer hover:bg-zinc-100 transition-all select-none">
                    <input
                      type="checkbox"
                      checked={conferirNaColeta}
                      onChange={(e) => setConferirNaColeta(e.target.checked)}
                      className="rounded text-zinc-900 focus:ring-zinc-900 h-3.5 w-3.5 cursor-pointer"
                    />
                    <span className="text-[11px] font-bold text-zinc-800">
                      ⚡ Conferir durante a coleta (operador único)
                    </span>
                  </label>
                )}
              </div>
              {isDraft && (
                <div className="px-4 py-3 border-b border-zinc-100 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                    <label className="space-y-1 relative">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Código, nome ou lote</span>
                      <input
                        className={inputCls}
                        placeholder="Digite o código, nome ou lote (Enter seleciona)"
                        value={pendingItem ? `${pendingItem.lote ? `${pendingItem.lote} · ` : ''}${pendingItem.productCode} — ${pendingItem.description}` : itemQuery}
                        onChange={(e) => { setPendingItem(null); setItemQuery(e.target.value); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (itemHits.length > 0) {
                              selectItem(itemHits[0]);
                            } else if (pendingItem && Number(pendingQty) > 0) {
                              addPendingItem();
                            }
                          }
                        }}
                      />
                      {itemHits.length > 0 && !pendingItem && (
                        <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg max-h-52 overflow-auto">
                          {itemHits.map((h, i) => (
                            <button
                              key={`${h.productCode}-${h.lote}-${i}`}
                              type="button"
                              className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 cursor-pointer flex items-center justify-between"
                              onClick={() => selectItem(h)}
                            >
                              <div className="min-w-0">
                                <span className="font-mono font-semibold">{h.lote || 'sem lote'}</span>
                                <span className="mx-1 text-zinc-300">·</span>
                                <span className="font-mono">{h.productCode}</span>
                                <span className="ml-2 text-zinc-600 truncate">{h.description}</span>
                              </div>
                              {h.unidadesPorCaixa ? (
                                <span className="ml-2 shrink-0 font-mono text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  {h.unidadesPorCaixa} un/cx
                                </span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      )}
                    </label>

                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Embalagem</span>
                      <div className="flex rounded-lg border border-zinc-200 p-0.5 bg-zinc-50 h-9 w-48">
                        <button
                          type="button"
                          className={cn(
                            'flex-1 text-[11px] font-semibold rounded-md transition-all flex items-center justify-center cursor-pointer',
                            !pendingCaixaFechada ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'
                          )}
                          onClick={() => setPendingCaixaFechada(false)}
                        >
                          Avulso
                        </button>
                        <button
                          type="button"
                          className={cn(
                            'flex-1 text-[11px] font-semibold rounded-md transition-all flex items-center justify-center gap-1 cursor-pointer',
                            pendingCaixaFechada ? 'bg-emerald-600 text-white shadow-xs' : 'text-zinc-500 hover:text-zinc-800'
                          )}
                          onClick={() => {
                            setPendingCaixaFechada(true);
                            const upc = parseInt(pendingUnidadesPorCaixa || String(pendingItem?.unidadesPorCaixa || '0'), 10);
                            const n = parseInt(pendingNumCaixas || '1', 10);
                            if (upc > 0) {
                              setPendingUnidadesPorCaixa(String(upc));
                              setPendingNumCaixas(String(n));
                              setPendingQty(String(n * upc));
                            }
                          }}
                          title="Caixa fechada"
                        >
                          <Package size={12} /> Cx Fechada
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-2 items-end">
                    {pendingCaixaFechada ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="space-y-1 w-24">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Qtd / Caixa</span>
                          <input
                            className={cn(inputCls, 'text-center font-mono')}
                            inputMode="numeric"
                            placeholder="Ex: 12"
                            value={pendingUnidadesPorCaixa}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addPendingItem();
                              }
                            }}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '');
                              setPendingUnidadesPorCaixa(val);
                              const upc = parseInt(val, 10);
                              const n = parseInt(pendingNumCaixas, 10);
                              if (upc > 0 && n > 0) {
                                setPendingQty(String(n * upc));
                              } else if (upc > 0 && Number(pendingQty) > 0) {
                                setPendingNumCaixas(String(Math.ceil(Number(pendingQty) / upc)));
                              }
                            }}
                          />
                        </label>
                        <span className="text-zinc-400 font-bold mb-2">×</span>
                        <label className="space-y-1 w-24">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Nº Caixas</span>
                          <input
                            className={cn(inputCls, 'text-center font-mono')}
                            inputMode="numeric"
                            placeholder="Ex: 2"
                            value={pendingNumCaixas}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addPendingItem();
                              }
                            }}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '');
                              setPendingNumCaixas(val);
                              const n = parseInt(val, 10);
                              const upc = parseInt(pendingUnidadesPorCaixa, 10);
                              if (n > 0 && upc > 0) {
                                setPendingQty(String(n * upc));
                              }
                            }}
                          />
                        </label>
                        <span className="text-zinc-400 font-bold mb-2">=</span>
                        <label className="space-y-1 w-28">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Total Unidades</span>
                          <input
                            className={cn(inputCls, 'text-right font-mono font-bold bg-emerald-50/50 border-emerald-300')}
                            inputMode="decimal"
                            placeholder="0"
                            value={pendingQty}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addPendingItem();
                              }
                            }}
                            onChange={(e) => {
                              setPendingQty(e.target.value);
                              const q = Number(e.target.value);
                              const upc = parseInt(pendingUnidadesPorCaixa, 10);
                              if (q > 0 && upc > 0) {
                                setPendingNumCaixas(String(Math.ceil(q / upc)));
                              }
                            }}
                          />
                        </label>
                      </div>
                    ) : (
                      <label className="space-y-1 w-32">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Quantidade (un)</span>
                        <input
                          className={cn(inputCls, 'text-right font-mono')}
                          inputMode="decimal"
                          placeholder="Ex: 10"
                          value={pendingQty}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addPendingItem();
                            }
                          }}
                          onChange={(e) => setPendingQty(e.target.value)}
                        />
                      </label>
                    )}

                    {conferirNaColeta ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Destino do item</span>
                          <select
                            className={cn(inputCls, 'font-medium')}
                            value={pendingDisposicao}
                            onChange={(e) => setPendingDisposicao(e.target.value as Disposicao)}
                          >
                            {DISPOSICOES.map((d) => (
                              <option key={d.value} value={d.value}>{d.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Obs / Ação (opcional)</span>
                          <input
                            className={inputCls}
                            placeholder="Ex: trocar válvula, avaria..."
                            value={pendingDisposicaoObs}
                            onChange={(e) => setPendingDisposicaoObs(e.target.value)}
                          />
                        </label>
                      </div>
                    ) : (
                      <div />
                    )}

                    <button type="button" className="btn-primary inline-flex items-center justify-center gap-1.5 h-9 px-4 shrink-0" onClick={addPendingItem}>
                      <Plus size={14} /> Adicionar
                    </button>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 text-zinc-500 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="text-left px-3 py-2 font-bold">Código</th>
                      <th className="text-left px-3 py-2 font-bold">Descrição</th>
                      <th className="text-left px-3 py-2 font-bold">Lote</th>
                      <th className="text-right px-3 py-2 font-bold">Qtde (un)</th>
                      <th className="text-center px-3 py-2 font-bold min-w-28">Embalagem</th>
                      {(!isDraft || conferirNaColeta) && <th className="text-left px-3 py-2 font-bold min-w-36">Destino</th>}
                      {canErp && <th className="text-left px-3 py-2 font-bold">Retorno</th>}
                      {isDraft && <th className="px-3 py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => (!isDraft && !line.itemCode.trim()) ? null : (
                      <tr key={`${line.itemCode}-${idx}`} className="border-t border-zinc-100">
                        <td className="px-3 py-2 font-mono font-semibold text-zinc-900">{line.itemCode || '—'}</td>
                        <td className="px-3 py-2 text-zinc-700">{line.description || '—'}</td>
                        <td className="px-3 py-2 font-mono text-zinc-700">{line.lotes || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">{line.qty || '—'}</td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <button
                              type="button"
                              disabled={!isDraft}
                              onClick={() => setLines((p) => p.map((l, i) => i === idx ? { ...l, caixaFechada: !l.caixaFechada } : l))}
                              className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold transition-all',
                                line.caixaFechada
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-zinc-100 text-zinc-600 border border-zinc-200',
                                isDraft ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                              )}
                              title={isDraft ? 'Clique para alternar entre Caixa Fechada e Avulso' : undefined}
                            >
                              {line.caixaFechada ? <><Package size={11} /> Cx Fechada</> : 'Avulso'}
                            </button>

                            {line.caixaFechada && (
                              editingUpcIdx === idx ? (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <input
                                    className="w-14 h-5 px-1 text-center font-mono text-[10px] border border-zinc-300 rounded bg-white"
                                    autoFocus
                                    value={tempUpc}
                                    placeholder="Un/cx"
                                    onChange={(e) => setTempUpc(e.target.value.replace(/\D/g, ''))}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const val = parseInt(tempUpc, 10);
                                        setLines((p) => p.map((l, i) => i === idx ? { ...l, unidadesPorCaixa: val > 0 ? String(val) : '' } : l));
                                        setEditingUpcIdx(null);
                                      } else if (e.key === 'Escape') {
                                        setEditingUpcIdx(null);
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="h-5 px-1 text-[10px] bg-emerald-600 text-white rounded font-bold cursor-pointer"
                                    onClick={() => {
                                      const val = parseInt(tempUpc, 10);
                                      setLines((p) => p.map((l, i) => i === idx ? { ...l, unidadesPorCaixa: val > 0 ? String(val) : '' } : l));
                                      setEditingUpcIdx(null);
                                    }}
                                  >
                                    OK
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={!isDraft}
                                  onClick={() => {
                                    if (isDraft) {
                                      setEditingUpcIdx(idx);
                                      setTempUpc(line.unidadesPorCaixa || '');
                                    }
                                  }}
                                  className={cn(
                                    'text-[10px] text-zinc-500 font-mono flex items-center gap-0.5',
                                    isDraft ? 'underline hover:text-zinc-800 cursor-pointer' : 'cursor-default'
                                  )}
                                  title={isDraft ? 'Clique para editar unidades por caixa' : undefined}
                                >
                                  {line.unidadesPorCaixa
                                    ? `${Math.floor(Number(line.qty) / (Number(line.unidadesPorCaixa) || 1)) || 1} cx (${line.unidadesPorCaixa} un/cx)`
                                    : (isDraft ? 'Definir un/cx' : '—')}
                                </button>
                              )
                            )}
                          </div>
                        </td>
                        {(!isDraft || conferirNaColeta) && (
                          <td className="px-3 py-2">
                            {isDraft && conferirNaColeta ? (
                              <select
                                className="h-7 px-1.5 rounded-lg border border-zinc-200 bg-white text-xs font-medium w-full"
                                value={line.disposicao || 'retornar_estoque'}
                                onChange={(e) => {
                                  const val = e.target.value as Disposicao;
                                  setLines((p) => p.map((l, i) => i === idx ? { ...l, disposicao: val, qtyConferida: l.qty } : l));
                                }}
                              >
                                {DISPOSICOES.map((d) => (
                                  <option key={d.value} value={d.value}>{d.label}</option>
                                ))}
                              </select>
                            ) : line.disposicao ? (
                              <span className={cn('status-badge', disposicaoBadge(line.disposicao))}>
                                {disposicaoLabel(line.disposicao)}
                              </span>
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                          </td>
                        )}
                        {canErp && (
                          <td className="px-3 py-2">
                            {line.disposicao === 'retornar_estoque' ? (
                              <button
                                type="button"
                                className={cn(
                                  'inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold cursor-pointer',
                                  current?.items[idx]?.erpStatus === 'lancado'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-amber-50 text-amber-800 border-amber-200',
                                )}
                                onClick={() => void toggleErp(idx)}
                              >
                                {current?.items[idx]?.erpStatus === 'lancado' ? <><CheckCircle2 size={12} /> Retorno feito</> : 'Marcar retorno'}
                              </button>
                            ) : (
                              <span className="text-zinc-300">—</span>
                            )}
                          </td>
                        )}
                        {isDraft && (
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              className="p-1 text-zinc-400 hover:text-rose-600 cursor-pointer"
                              onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {itensPreenchidos.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-zinc-400">Nenhum item ainda. Busque pelo lote, código ou nome.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Barra de ações para mobile e desktop */}
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-zinc-600 font-medium">
                {itensPreenchidos.length} {itensPreenchidos.length === 1 ? 'item preenchido' : 'itens preenchidos'}
                {suggestedVolumes > 0 && (
                  <span className="ml-2 text-zinc-400">· Volume sugerido: <strong>{suggestedVolumes}</strong></span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                {isDraft ? (
                  <>
                    <button
                      type="button"
                      className="btn-secondary flex-1 sm:flex-none justify-center"
                      disabled={busy}
                      onClick={() => void saveDraft()}
                    >
                      Salvar rascunho
                    </button>
                    <button
                      type="button"
                      className="btn-secondary flex-1 sm:flex-none justify-center"
                      disabled={busy}
                      onClick={() => void receber()}
                    >
                      Receber
                    </button>
                    <button
                      type="button"
                      className="btn-primary flex-1 sm:flex-none justify-center inline-flex items-center gap-1.5"
                      disabled={busy}
                      onClick={() => void receberEConcluir()}
                      title="Recebe a devolução e conclui a conferência em etapa única"
                    >
                      <CheckCircle2 size={14} /> Receber e Concluir
                    </button>
                  </>
                ) : (
                  current && (
                    <button
                      type="button"
                      className="btn-primary flex-1 sm:flex-none justify-center"
                      disabled={busy || !canEdit}
                      onClick={() => void saveDraft()}
                    >
                      Salvar alterações
                    </button>
                  )
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'conferencia' && (
          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {confRows.length === 0 && (
                <div className="text-sm text-zinc-500 py-2">Nenhuma devolução aguardando conferência.</div>
              )}
              {confRows.map((d) => {
                const selected = confCurrent?.id === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => void openConference(d)}
                    className={cn(
                      'shrink-0 text-left px-3 py-2 rounded-xl border cursor-pointer min-w-[140px]',
                      selected ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white border-zinc-200 text-zinc-800',
                    )}
                  >
                    <div className="font-mono text-xs font-bold">{d.registerNumber}</div>
                    <div className={cn('text-[11px] truncate', selected ? 'text-zinc-300' : 'text-zinc-500')}>{d.clientName || 'Sem origem'}</div>
                  </button>
                );
              })}
            </div>

            {!confCurrent && (
              <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm py-16 text-center text-sm text-zinc-500">
                Selecione uma devolução acima.
              </div>
            )}

            {confCurrent && !confAtiva && (
              <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold">{confCurrent.registerNumber}</span>
                  <span className={cn('status-badge', statusBadge(confCurrent.status))}>{statusLabel(confCurrent.status)}</span>
                </div>
                <p className="text-sm text-zinc-600">A conferência desta devolução já foi encerrada.</p>
              </div>
            )}

            {confAtiva && confCurrent && (
              <div className="space-y-3">
                <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold">{confCurrent.registerNumber}</span>
                        <span className={cn('status-badge', statusBadge(confCurrent.status))}>{statusLabel(confCurrent.status)}</span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">
                        {confCurrent.clientName || 'Sem origem'} · NF {confCurrent.nfNumber || '—'} · {confCurrent.returnDate}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Conferido</div>
                      <div className="text-lg font-bold font-mono">{conferidos}/{confLines.length}</div>
                    </div>
                  </div>
                  <div className="h-1 bg-zinc-100 rounded-full mt-3 overflow-hidden">
                    <div className="h-full bg-zinc-900" style={{ width: `${confLines.length ? (conferidos / confLines.length) * 100 : 0}%` }} />
                  </div>
                </div>

                {confLines.map((line, idx) => {
                  const item = confCurrent.items[idx];
                  const prevista = Number(line.qty) || 0;
                  const conferida = line.qtyConferida.trim() ? Number(line.qtyConferida) : null;
                  const diverge = conferida != null && conferida !== prevista;
                  const foto = item?.id ? fotos[item.id] : '';
                  const isExtraOpen = openExtra === idx;
                  const hasExtra = Boolean(line.disposicaoObs?.trim() || (item?.id && splitQty[item.id]) || foto || line.disposicao === 'analise_fq');
                  const upcNum = Number(line.unidadesPorCaixa) || 0;
                  const caixasCalculadas = upcNum > 0 ? Math.floor(prevista / upcNum) : null;

                  return (
                    <div key={item?.id ?? idx} className="bg-white border border-zinc-200 rounded-xl shadow-xs p-3 space-y-2 transition-all">
                      {/* Linha Superior: Código, Descrição e Badge de Embalagem */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs font-bold text-zinc-900 shrink-0">{line.itemCode}</span>
                          <span className="text-xs text-zinc-600 truncate">{line.description}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const nextVal = !line.caixaFechada;
                              setConfLines((p) => p.map((l, i) => i === idx ? { ...l, caixaFechada: nextVal } : l));
                            }}
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition-all',
                              line.caixaFechada
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-zinc-100 text-zinc-600 border border-zinc-200 hover:bg-zinc-200'
                            )}
                            title="Clique para alternar entre Caixa Fechada e Avulso"
                          >
                            {line.caixaFechada ? <><Package size={11} /> Cx Fechada</> : 'Avulso'}
                          </button>
                          {line.caixaFechada && (
                            editingUpcIdx === idx ? (
                              <div className="flex items-center gap-1">
                                <input
                                  className="w-12 h-6 px-1 text-center font-mono text-[10px] border border-zinc-300 rounded bg-white"
                                  autoFocus
                                  value={tempUpc}
                                  placeholder="Un/cx"
                                  onChange={(e) => setTempUpc(e.target.value.replace(/\D/g, ''))}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      const val = parseInt(tempUpc, 10);
                                      setConfLines((p) => p.map((l, i) => i === idx ? { ...l, unidadesPorCaixa: val > 0 ? String(val) : '' } : l));
                                      setEditingUpcIdx(null);
                                    } else if (e.key === 'Escape') {
                                      setEditingUpcIdx(null);
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  className="h-6 px-1.5 text-[10px] bg-emerald-600 text-white rounded font-bold cursor-pointer"
                                  onClick={() => {
                                    const val = parseInt(tempUpc, 10);
                                    setConfLines((p) => p.map((l, i) => i === idx ? { ...l, unidadesPorCaixa: val > 0 ? String(val) : '' } : l));
                                    setEditingUpcIdx(null);
                                  }}
                                >
                                  OK
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingUpcIdx(idx);
                                  setTempUpc(line.unidadesPorCaixa || '');
                                }}
                                className="text-[10px] text-zinc-500 hover:text-zinc-800 font-mono underline cursor-pointer"
                                title="Editar quantidade por caixa"
                              >
                                {upcNum > 0
                                  ? `${caixasCalculadas || 1} cx (${upcNum} un/cx)`
                                  : 'Definir un/cx'}
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      {/* Linha Principal de Ações: Lote | Prevista | Conferida | Select Destino + Botão [+] | Salvar */}
                      <div className="grid grid-cols-1 sm:grid-cols-[130px_65px_75px_1fr_auto] gap-2 items-center">
                        {/* Lote */}
                        <div>
                          <span className="block text-[9px] font-bold uppercase tracking-wider text-zinc-400 sm:hidden">Lote</span>
                          <input
                            className={cn(inputCls, 'h-8 text-xs font-mono')}
                            placeholder="Lote físico"
                            value={line.lotes}
                            onChange={(e) => setConfLines((p) => p.map((l, i) => i === idx ? { ...l, lotes: e.target.value } : l))}
                          />
                        </div>

                        {/* Prevista */}
                        <div>
                          <span className="block text-[9px] font-bold uppercase tracking-wider text-zinc-400 sm:hidden">Prevista</span>
                          <div className="h-8 px-1.5 rounded-lg border border-zinc-200 bg-zinc-50 font-mono text-xs flex items-center justify-center text-zinc-600" title="Quantidade prevista">
                            {prevista} un
                          </div>
                        </div>

                        {/* Conferida */}
                        <div>
                          <span className="block text-[9px] font-bold uppercase tracking-wider text-zinc-400 sm:hidden">Conferida</span>
                          <input
                            className={cn(inputCls, 'h-8 text-xs font-mono text-center', diverge && 'border-amber-300 bg-amber-50')}
                            inputMode="decimal"
                            placeholder={String(prevista)}
                            value={line.qtyConferida}
                            onChange={(e) => setConfLines((p) => p.map((l, i) => i === idx ? { ...l, qtyConferida: e.target.value } : l))}
                          />
                        </div>

                        {/* Destino (Select) + Botão [+] */}
                        <div className="flex items-center gap-1.5">
                          <select
                            className={cn(
                              'h-8 px-2 rounded-lg border text-xs font-medium flex-1 outline-none transition-all',
                              line.disposicao ? 'border-zinc-300 bg-white text-zinc-900 font-semibold' : 'border-dashed border-zinc-300 bg-zinc-50 text-zinc-500'
                            )}
                            value={line.disposicao}
                            onChange={(e) => {
                              const val = e.target.value as Disposicao;
                              setConfLines((p) => p.map((l, i) => i === idx ? {
                                ...l,
                                disposicao: val,
                                qtyConferida: l.qtyConferida || String(prevista),
                              } : l));
                            }}
                          >
                            <option value="">Selecione o destino…</option>
                            {DISPOSICOES.map((d) => (
                              <option key={d.value} value={d.value}>{d.label}</option>
                            ))}
                          </select>

                          {/* Botão [+] para observação, separar destino ou foto */}
                          <button
                            type="button"
                            onClick={() => setOpenExtra(isExtraOpen ? null : idx)}
                            className={cn(
                              'h-8 px-2 rounded-lg border text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-all shrink-0',
                              isExtraOpen
                                ? 'bg-zinc-900 text-white border-zinc-900'
                                : hasExtra
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                            )}
                            title="Adicionar observação, ação específica (trocar válvula, etc.), separar destino ou foto"
                          >
                            <Plus size={13} className={cn('transition-transform', isExtraOpen && 'rotate-45')} />
                            {hasExtra && !isExtraOpen && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                          </button>
                        </div>

                        {/* Salvar item */}
                        <button
                          type="button"
                          disabled={busy}
                          className="h-8 px-3 rounded-lg bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 cursor-pointer disabled:opacity-50 shrink-0 inline-flex items-center justify-center gap-1"
                          onClick={() => void conferirLinha(idx)}
                        >
                          <Check size={13} />
                          <span className="hidden sm:inline">Salvar</span>
                        </button>
                      </div>

                      {/* Painel Retrátil do Botão [+] */}
                      {isExtraOpen && (
                        <div className="pt-2 border-t border-zinc-100 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-zinc-50/70 p-2.5 rounded-lg">
                          <label className="block space-y-1 sm:col-span-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                              Observação / Ação específica (ex.: trocar válvula, tampa quebrada)
                            </span>
                            <input
                              className={cn(inputCls, 'h-8 text-xs')}
                              value={line.disposicaoObs}
                              placeholder="Descreva aqui se precisa trocar válvula, frasco danificado, etc."
                              onChange={(e) => setConfLines((p) => p.map((l, i) => i === idx ? { ...l, disposicaoObs: e.target.value } : l))}
                            />
                          </label>

                          {prevista > 1 && item?.id && (
                            <div className="flex items-center gap-1.5">
                              <input
                                className={cn(inputCls, 'h-8 text-xs font-mono w-24 text-center')}
                                inputMode="decimal"
                                placeholder="Qtd sep."
                                value={splitQty[item.id] || ''}
                                onChange={(e) => {
                                  const id = item.id!;
                                  setSplitQty((prev) => ({ ...prev, [id]: e.target.value.replace(/[^\d,.]/g, '') }));
                                }}
                              />
                              <button
                                type="button"
                                className="btn-secondary h-8 px-2.5 text-xs font-semibold shrink-0"
                                disabled={busy}
                                onClick={() => void separarLinha(idx)}
                                title="Separa essa quantidade criando uma nova linha para outro destino"
                              >
                                Separar destino
                              </button>
                            </div>
                          )}

                          {line.disposicao === 'analise_fq' && item && (
                            <div className="flex items-center">
                              <button
                                type="button"
                                className="text-xs font-bold text-sky-800 hover:text-sky-950 underline cursor-pointer"
                                onClick={() => void openFq({ ...item, lotes: line.lotes })}
                              >
                                Análise FQ {item.fqResultado ? `· ${item.fqResultado}` : '· pendente'}
                              </button>
                            </div>
                          )}

                          <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                            {foto && (
                              <img
                                src={foto}
                                alt={`Lote ${line.lotes || line.itemCode}`}
                                className="w-12 h-12 object-cover rounded-lg border border-zinc-200 bg-white"
                              />
                            )}
                            {item?.id && (
                              <label className="btn-secondary h-8 px-2.5 text-xs cursor-pointer inline-flex items-center gap-1.5">
                                <Camera size={13} />
                                {foto ? 'Trocar foto' : 'Foto do lote'}
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    e.target.value = '';
                                    if (file && item.id) void uploadFoto(item.id, file);
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    ['Itens', confCurrent.items.length],
                    ['Estoque', confCurrent.items.filter((i) => i.disposicao === 'retornar_estoque').length],
                    ['Embalagem / rótulo', confCurrent.items.filter((i) => i.disposicao === 'trocar_embalagem' || i.disposicao === 'trocar_rotulo').length],
                    ['FQ', confCurrent.items.filter((i) => i.disposicao === 'analise_fq').length],
                    ['Descarte', confCurrent.items.filter((i) => i.disposicao === 'descartar').length],
                  ].map(([label, n]) => (
                    <div key={String(label)} className="bg-white border border-zinc-200 rounded-xl px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</div>
                      <div className="text-lg font-bold font-mono text-zinc-900">{n}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <Modal
          isOpen={!!fqItem}
          onClose={() => setFqItem(null)}
          title={`Análise físico-química — lote ${fqItem?.lotes || '—'}`}
          subtitle={fqItem ? `${fqItem.itemCode} · ${fqItem.description}` : undefined}
          size="lg"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="border border-zinc-200 rounded-xl p-3 space-y-2 bg-zinc-50">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Lote original</p>
              <p className="flex justify-between"><span>pH</span><span className="font-mono">{fmtMeasure(fqSpecs?.ph ?? fqItem?.fqPhOriginal)}</span></p>
              <p className="flex justify-between"><span>Viscosidade</span><span className="font-mono">{fmtMeasure(fqSpecs?.viscosidade ?? fqItem?.fqViscosidadeOriginal, ' cP')}</span></p>
              <p className="flex justify-between"><span>Densidade</span><span className="font-mono">{fmtMeasure(fqSpecs?.densidade ?? fqItem?.fqDensidadeOriginal, ' g/cm³')}</span></p>
            </div>
            <div className="border border-zinc-200 rounded-xl p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Amostra devolvida</p>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">pH medido</span>
                <input className={cn(inputCls, 'font-mono')} value={fqPh} onChange={(e) => setFqPh(e.target.value)} />
                <span className="text-[10px] text-zinc-500">{deltaLabel(fqSpecs?.ph ?? fqItem?.fqPhOriginal, fqPh, false)}</span>
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Viscosidade (cP)</span>
                <input className={cn(inputCls, 'font-mono')} value={fqVisc} onChange={(e) => setFqVisc(e.target.value)} />
                <span className="text-[10px] text-zinc-500">{deltaLabel(fqSpecs?.viscosidade ?? fqItem?.fqViscosidadeOriginal, fqVisc, true)}</span>
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Densidade (g/cm³)</span>
                <input className={cn(inputCls, 'font-mono')} value={fqDens} onChange={(e) => setFqDens(e.target.value)} />
                <span className="text-[10px] text-zinc-500">{deltaLabel(fqSpecs?.densidade ?? fqItem?.fqDensidadeOriginal, fqDens, true)}</span>
              </label>
            </div>
          </div>
          <label className="block space-y-1 text-sm mt-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Se aprovar</span>
            <select className={inputCls} value={fqAp} onChange={(e) => setFqAp(e.target.value as 'retornar_estoque' | 'trocar_embalagem')}>
              <option value="retornar_estoque">Retorno de estoque</option>
              <option value="trocar_embalagem">Trocar embalagem</option>
            </select>
          </label>
          <label className="block space-y-1 text-sm mt-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Observações</span>
            <textarea className="w-full border border-zinc-200 rounded-lg px-2.5 py-2 min-h-[72px] text-sm" value={fqObs} onChange={(e) => setFqObs(e.target.value)} />
          </label>
          <p className="text-[11px] text-zinc-500 mt-2">Responsável: {getAuthUser()?.displayName || 'Operador'}</p>
          <div className="flex flex-wrap gap-2 justify-end mt-4">
            <button type="button" disabled={busy} className="px-3 py-2 rounded-xl bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50" onClick={() => void confirmarFq('RP')}>Reprovar (RP)</button>
            <button type="button" disabled={busy} className="btn-primary" onClick={() => void confirmarFq('AP')}>Aprovar (AP)</button>
          </div>
        </Modal>

        {activeTab === 'editor' && (
          <div className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-zinc-200 px-3 py-2.5 flex items-center justify-between gap-2 shadow-lg">
            <button
              type="button"
              className="btn-secondary h-9 px-2.5 text-xs shrink-0"
              onClick={openCreate}
              title="Nova devolução"
            >
              <Plus size={14} /> Nova
            </button>
            <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
              {isDraft ? (
                <>
                  <button
                    type="button"
                    className="btn-secondary h-9 px-2 text-xs font-semibold shrink-0"
                    disabled={busy}
                    onClick={() => void saveDraft()}
                  >
                    Rascunho
                  </button>
                  <button
                    type="button"
                    className="btn-secondary h-9 px-2 text-xs font-semibold shrink-0"
                    disabled={busy}
                    onClick={() => void receber()}
                  >
                    Receber
                  </button>
                  <button
                    type="button"
                    className="btn-primary h-9 px-2.5 text-xs font-semibold shrink-0 inline-flex items-center gap-1"
                    disabled={busy}
                    onClick={() => void receberEConcluir()}
                    title="Receber e concluir conferência direta"
                  >
                    <CheckCircle2 size={13} /> Concluir
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-primary h-9 px-4 text-xs font-semibold w-full justify-center"
                  disabled={busy || !canEdit}
                  onClick={() => void saveDraft()}
                >
                  Salvar alterações
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === 'conferencia' && confCurrent && (
          <div className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-zinc-200 px-3 py-2.5 flex items-center justify-between gap-2 shadow-lg">
            <div className="text-xs font-mono font-bold text-zinc-700 truncate">
              {confCurrent.registerNumber} · {conferidos}/{confLines.length}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {confCurrent.status === 'recebido' && (
                <button
                  type="button"
                  className="btn-secondary h-9 px-3 text-xs font-semibold"
                  disabled={busy}
                  onClick={() => void iniciarConferencia()}
                >
                  Iniciar
                </button>
              )}
              {confAtiva && (
                <button
                  type="button"
                  className="btn-primary h-9 px-3 text-xs font-semibold"
                  disabled={busy}
                  onClick={() => void fecharCq()}
                >
                  Concluir
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

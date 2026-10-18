import React, { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import Modal from '../../geral/components/ui/Modal';
import { apiFetch, apiJson } from '../../geral/lib/http';
import { cn } from '../../geral/lib/utils';

export type AvariaFicha = {
  id: number;
  registerNumber: string;
  itemCode: string;
  description: string;
  lote: string;
  qty: number;
  location: string;
  status: string;
  notes?: string | null;
  fotoPath?: string | null;
  createdBy?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
  createdAt: string;
  sheetNumber?: string | null;
  sheetStatus?: string | null;
  repairType?: string | null;
  problema?: string | null;
  encaminhamento?: string | null;
  fqNecessaria?: boolean;
  fqResultado?: string | null;
  fqObservacao?: string | null;
};

const DESTINOS = [
  { id: 'retorno_estoque', label: 'Retorno ao estoque', tone: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
  { id: 'reparo', label: 'Reparo de embalagem', tone: 'bg-blue-50 border-blue-200 text-blue-800' },
  { id: 'descarte', label: 'Descarte', tone: 'bg-rose-50 border-rose-200 text-rose-800' },
] as const;

function statusLabel(row: AvariaFicha) {
  if (row.status === 'retorno_estoque') return 'Retorno ao estoque';
  if (row.status === 'reparo' || row.status === 'embalagem') return 'Reparo de embalagem';
  if (row.status === 'descarte') return 'Descarte';
  if (row.status === 'em_analise') return 'Em análise';
  return row.status;
}

function statusBadge(status: string) {
  if (status === 'retorno_estoque') return 'saudavel';
  if (status === 'reparo' || status === 'embalagem') return 'ordem';
  if (status === 'descarte') return 'critico';
  return 'aguardando';
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

const fieldCls = 'w-full min-h-11 px-3 py-2 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-900 outline-none focus:border-zinc-400';

export default function AvariasFicha({
  row,
  canEdit,
  onClose,
  onSaved,
}: {
  row: AvariaFicha;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (row: AvariaFicha) => void;
}) {
  const emAnalise = row.status === 'em_analise';
  const [problema, setProblema] = useState(row.problema || '');
  const [encaminhamento, setEncaminhamento] = useState(row.encaminhamento || '');
  const [fqNecessaria, setFqNecessaria] = useState(!!row.fqNecessaria);
  const [fqResultado, setFqResultado] = useState(row.fqResultado || '');
  const [fqObservacao, setFqObservacao] = useState(row.fqObservacao || '');
  const [photo, setPhoto] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!row.fotoPath) return;
    let cancel = false;
    let created = '';
    void (async () => {
      try {
        const res = await apiFetch(`/qualidade/avarias/${row.id}/foto`);
        if (!res.ok || cancel) return;
        const url = URL.createObjectURL(await res.blob());
        if (cancel) {
          URL.revokeObjectURL(url);
          return;
        }
        created = url;
        setPhoto(url);
      } catch {
        /* foto opcional */
      }
    })();
    return () => {
      cancel = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [row.id, row.fotoPath]);

  const save = async (nextStatus?: string) => {
    setBusy(true);
    setError('');
    try {
      const saved = await apiJson<AvariaFicha>(`/qualidade/avarias/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemCode: row.itemCode,
          description: row.description,
          lote: row.lote,
          qty: row.qty,
          location: row.location,
          status: nextStatus || row.status,
          notes: row.notes || '',
          repairType: (nextStatus || row.status) === 'reparo' ? 'embalagem' : row.repairType,
          problema,
          encaminhamento,
          fqNecessaria,
          fqResultado: fqNecessaria ? (fqResultado || 'pendente') : null,
          fqObservacao,
        }),
      });
      onSaved(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar a análise');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={row.registerNumber}
      subtitle={statusLabel(row)}
      size="xl"
      onClose={onClose}
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 overflow-hidden min-h-44 flex items-center justify-center">
            {photo ? (
              <img src={photo} alt="Foto da avaria" className="w-full h-full object-cover max-h-64" />
            ) : (
              <div className="text-center text-zinc-400 px-4 py-8">
                <Camera className="h-5 w-5 mx-auto mb-2" />
                <p className="text-xs">Sem foto</p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 content-start">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Código</div>
              <div className="font-mono text-sm font-semibold mt-1">{row.itemCode}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Lote</div>
              <div className="font-mono text-sm font-semibold mt-1">{row.lote || '—'}</div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Descrição</div>
              <div className="text-sm font-medium mt-1">{row.description}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Quantidade</div>
              <div className="font-mono text-sm mt-1">{fmtQty(row.qty)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Local</div>
              <div className="text-sm mt-1">{row.location || '—'}</div>
            </div>
            <div className="col-span-2 flex flex-wrap items-center gap-2">
              <span className={cn('status-badge', statusBadge(row.status))}>{statusLabel(row)}</span>
              {row.sheetNumber && (
                <span className="text-xs font-mono text-zinc-600">Controle {row.sheetNumber}</span>
              )}
            </div>
            <p className="col-span-2 text-xs text-zinc-500">
              Registrado {fmtWhen(row.createdAt)}{row.createdBy ? ` por ${row.createdBy}` : ''}.
              {row.decidedBy ? ` Definido por ${row.decidedBy}${row.decidedAt ? ` · ${fmtWhen(row.decidedAt)}` : ''}.` : ''}
            </p>
          </div>
        </div>

        {row.notes && (
          <div className="rounded-xl border border-zinc-200 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Observação da coleta</div>
            <p className="text-sm text-zinc-800 mt-1">{row.notes}</p>
          </div>
        )}

        {emAnalise && canEdit ? (
          <div className="rounded-2xl border border-zinc-200 p-4 space-y-3">
            <div>
              <div className="text-sm font-bold text-zinc-900">Análise</div>
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Qual é o problema</span>
              <textarea className={cn(fieldCls, 'min-h-20')} value={problema} onChange={(e) => setProblema(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">O que fazer</span>
              <textarea className={cn(fieldCls, 'min-h-20')} value={encaminhamento} onChange={(e) => setEncaminhamento(e.target.value)} />
            </label>
            <label className="flex items-center gap-2 min-h-11 text-sm text-zinc-800">
              <input
                type="checkbox"
                className="h-4 w-4 accent-zinc-900"
                checked={fqNecessaria}
                onChange={(e) => {
                  setFqNecessaria(e.target.checked);
                  if (e.target.checked && !fqResultado) setFqResultado('pendente');
                }}
              />
              Precisa de análise físico-química
            </label>
            {fqNecessaria && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {[
                    ['pendente', 'Pendente'],
                    ['aprovado', 'Aprovado'],
                    ['reprovado', 'Reprovado'],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFqResultado(id)}
                      className={cn(
                        'min-h-11 px-3 rounded-xl border text-xs font-bold',
                        fqResultado === id ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white border-zinc-200 text-zinc-700',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <textarea
                  className={cn(fieldCls, 'min-h-16')}
                  placeholder="pH, viscosidade, densidade ou o que a análise mostrou"
                  value={fqObservacao}
                  onChange={(e) => setFqObservacao(e.target.value)}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => void save()}>
                Salvar análise
              </button>
            </div>
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Concluir como</div>
              <div className="flex flex-wrap gap-2">
                {DESTINOS.map((dest) => (
                  <button
                    key={dest.id}
                    type="button"
                    className={cn('min-h-11 px-3 rounded-xl border text-xs font-bold', dest.tone)}
                    disabled={busy}
                    onClick={() => void save(dest.id)}
                  >
                    {dest.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {row.problema && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Problema</div>
                <p className="mt-1">{row.problema}</p>
              </div>
            )}
            {row.encaminhamento && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">O que fazer</div>
                <p className="mt-1">{row.encaminhamento}</p>
              </div>
            )}
            {row.fqNecessaria && (
              <div className="md:col-span-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Físico-química</div>
                <p className="mt-1">
                  {row.fqResultado === 'aprovado' ? 'Aprovado' : row.fqResultado === 'reprovado' ? 'Reprovado' : 'Pendente'}
                  {row.fqObservacao ? ` · ${row.fqObservacao}` : ''}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

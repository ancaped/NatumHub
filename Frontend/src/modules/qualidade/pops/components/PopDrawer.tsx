import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Printer, Save, X } from 'lucide-react';
import { apiJson } from '../../../geral/lib/http';
import {
  emptyContent,
  normalizeContent,
  type PopContent,
  type PopDocument,
  type PopSector,
  type PopVersion,
} from '../types';

interface Props {
  open: boolean;
  document: PopDocument | null;
  sectors: PopSector[];
  logoSrc: string | null;
  onClose: () => void;
  onSaved: () => void;
}

type DrawerTab = 'documento' | 'historico';

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function PopDrawer({
  open,
  document,
  sectors,
  logoSrc,
  onClose,
  onSaved,
}: Props) {
  const [tab, setTab] = useState<DrawerTab>('documento');
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [content, setContent] = useState<PopContent>(emptyContent());
  const [elaboratedBy, setElaboratedBy] = useState('');
  const [reviewedBy, setReviewedBy] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [versions, setVersions] = useState<PopVersion[]>([]);
  const [printVersion, setPrintVersion] = useState<PopVersion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNew = !document;
  const isDraft = document?.status === 'draft';
  const isPublished = document?.status === 'published';

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTab('documento');
    setChangeSummary('');
    setPrintVersion(null);
    if (document) {
      setCode(document.code);
      setTitle(document.title);
      setSectorId(document.sectorId);
      setContent(normalizeContent(document.currentVersion?.content));
      setElaboratedBy(document.elaboratedBy ?? '');
      setReviewedBy(document.reviewedBy ?? '');
      setApprovedBy(document.approvedBy ?? '');
      void apiJson<PopVersion[]>(`/qualidade/pops/documents/${document.id}/versions`)
        .then((rows) =>
          setVersions(
            Array.isArray(rows)
              ? rows.map((v) => ({ ...v, content: normalizeContent(v.content) }))
              : [],
          ),
        )
        .catch(() => setVersions([]));
    } else {
      setCode('');
      setTitle('');
      setSectorId(sectors.find((s) => s.active)?.id ?? sectors[0]?.id ?? '');
      setContent(emptyContent());
      setElaboratedBy('Responsável Técnico');
      setReviewedBy('Equipe de Controle de Qualidade');
      setApprovedBy('');
      setVersions([]);
    }
  }, [open, document, sectors]);

  const sectorName = useMemo(
    () => sectors.find((s) => s.id === sectorId)?.name ?? document?.sectorName ?? '',
    [sectors, sectorId, document],
  );

  const revisionLabel = document?.currentRevision ?? 0;
  const effectiveLabel =
    document?.effectiveDate ??
    document?.currentVersion?.effectiveDate ??
    todayIso();

  const payloadContent = (): PopContent => ({
    body: content.body,
    elaboratedAt: content.elaboratedAt || null,
    reviewedAt: content.reviewedAt || null,
    approvedAt: content.approvedAt || null,
  });

  const saveDraft = async () => {
    setBusy(true);
    setError(null);
    try {
      if (isNew) {
        await apiJson('/qualidade/pops/documents', {
          method: 'POST',
          body: JSON.stringify({
            code,
            title,
            sectorId,
            content: payloadContent(),
            elaboratedBy: elaboratedBy || null,
            reviewedBy: reviewedBy || null,
            approvedBy: approvedBy || null,
          }),
        });
      } else if (document) {
        if (isDraft) {
          await apiJson(`/qualidade/pops/documents/${document.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              title,
              sectorId,
              content: payloadContent(),
              elaboratedBy: elaboratedBy || null,
              reviewedBy: reviewedBy || null,
              approvedBy: approvedBy || null,
            }),
          });
        } else {
          await apiJson(`/qualidade/pops/documents/${document.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              title,
              sectorId,
              elaboratedBy: elaboratedBy || null,
              reviewedBy: reviewedBy || null,
              approvedBy: approvedBy || null,
            }),
          });
        }
      }
      onSaved();
      if (isNew) onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!document) return;
    setBusy(true);
    setError(null);
    try {
      if (isDraft) {
        await apiJson(`/qualidade/pops/documents/${document.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            title,
            sectorId,
            content: payloadContent(),
            elaboratedBy: elaboratedBy || null,
            reviewedBy: reviewedBy || null,
            approvedBy: approvedBy || null,
          }),
        });
      }
      await apiJson(`/qualidade/pops/documents/${document.id}/publish`, {
        method: 'POST',
        body: JSON.stringify({
          changeSummary: changeSummary || (isDraft ? 'Publicação inicial' : 'Revisão de conteúdo'),
          content: isPublished ? payloadContent() : undefined,
          elaboratedBy: elaboratedBy || null,
          reviewedBy: reviewedBy || null,
          approvedBy: approvedBy || null,
        }),
      });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao publicar');
    } finally {
      setBusy(false);
    }
  };

  const revalidate = async () => {
    if (!document) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/qualidade/pops/documents/${document.id}/revalidate`, {
        method: 'POST',
        body: JSON.stringify({
          changeSummary: changeSummary || 'Revalidação anual',
        }),
      });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao revalidar');
    } finally {
      setBusy(false);
    }
  };

  const openPrint = (version?: PopVersion | null) => {
    const v =
      version ??
      ({
        revision: document?.currentRevision ?? 0,
        effectiveDate: document?.effectiveDate ?? todayIso(),
        content: payloadContent(),
        elaboratedBy,
        reviewedBy,
        approvedBy,
      } as PopVersion);
    setPrintVersion({
      ...v,
      content: normalizeContent(v.content),
    });
    setTimeout(() => window.print(), 80);
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-3xl bg-zinc-100 shadow-xl flex flex-col border-l border-zinc-200">
        <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-zinc-200 bg-white">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-zinc-500">POP</p>
            <p className="font-semibold text-zinc-900 truncate">
              {isNew ? 'Novo procedimento' : document?.code}
            </p>
            {!isNew && <p className="text-sm text-zinc-600 truncate">{document?.title}</p>}
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-100">
            <X className="w-5 h-5" />
          </button>
        </header>

        {!isNew && (
          <div className="flex gap-1 px-4 pt-3 bg-white">
            {(
              [
                ['documento', 'Documento'],
                ['historico', 'Histórico'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-3 py-1.5 text-sm rounded-lg ${
                  tab === id ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {tab === 'documento' && (
            <>
              {isNew && (
                <div className="grid grid-cols-2 gap-3 bg-white rounded-xl border border-zinc-200 p-3">
                  <label className="block text-sm">
                    <span className="text-zinc-600">Código</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="POP-PRD-030"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-zinc-600">Setor</span>
                    <select
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                      value={sectorId}
                      onChange={(e) => setSectorId(e.target.value)}
                    >
                      {sectors.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {/* Página A4 — 3 barras */}
              <div className="bg-white border border-zinc-300 shadow-sm mx-auto w-full max-w-[210mm]">
                {/* Barra 1 — título */}
                <table className="w-full border-collapse text-[11px]">
                  <tbody>
                    <tr>
                      <td className="w-[22%] border border-zinc-800 p-2 text-center align-middle">
                        {logoSrc ? (
                          <img src={logoSrc} alt="Logo" className="max-h-14 max-w-full mx-auto object-contain" />
                        ) : (
                          <span className="text-zinc-400">LOGO</span>
                        )}
                      </td>
                      <td className="border border-zinc-800 p-2 text-center align-middle">
                        <div className="font-bold text-sm">Procedimento Operacional Padrão</div>
                        <input
                          className="mt-1 w-full text-center text-sm border-0 border-b border-dashed border-zinc-300 focus:outline-none focus:border-zinc-500 bg-transparent"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="Título do POP"
                        />
                      </td>
                      <td className="w-[28%] border border-zinc-800 p-2 align-top space-y-0.5">
                        <div>
                          <strong>Código:</strong> {code || '—'}
                        </div>
                        <div>
                          <strong>Revisão:</strong> {String(revisionLabel).padStart(2, '0')}
                        </div>
                        <div>
                          <strong>Data:</strong> {fmtDate(effectiveLabel)}
                        </div>
                        <div>
                          <strong>Setor:</strong> {sectorName || '—'}
                        </div>
                        {!isNew && (
                          <label className="block pt-1">
                            <span className="text-zinc-500">Setor</span>
                            <select
                              className="mt-0.5 w-full border border-zinc-200 rounded px-1 py-0.5"
                              value={sectorId}
                              onChange={(e) => setSectorId(e.target.value)}
                            >
                              {sectors.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Barra 2 — corpo contínuo */}
                <div className="border-x border-b border-zinc-800 p-3 min-h-[420px]">
                  <textarea
                    className="w-full min-h-[400px] resize-y border-0 focus:outline-none text-[12px] leading-relaxed font-serif bg-transparent"
                    value={content.body}
                    onChange={(e) => setContent((c) => ({ ...c, body: e.target.value }))}
                    placeholder="Corpo do procedimento (Objetivo, condições, responsabilidades, atividades…)"
                  />
                  {isPublished && (
                    <p className="text-[10px] text-amber-700 mt-1">
                      POP publicado: edite o corpo e use «Publicar revisão» para gravar no histórico.
                    </p>
                  )}
                </div>

                {/* Barra 3 — rodapé assinaturas */}
                <table className="w-full border-collapse text-[11px]">
                  <tbody>
                    <tr>
                      <td className="w-1/3 border border-zinc-800 p-2 align-top">
                        <div className="font-semibold mb-1">Elaborado:</div>
                        <input
                          className="w-full border-0 border-b border-zinc-200 focus:outline-none bg-transparent"
                          value={elaboratedBy}
                          onChange={(e) => setElaboratedBy(e.target.value)}
                        />
                        <div className="mt-2 text-zinc-500">Data:</div>
                        <input
                          type="date"
                          className="w-full border border-zinc-200 rounded px-1 py-0.5"
                          value={content.elaboratedAt?.slice(0, 10) || ''}
                          onChange={(e) =>
                            setContent((c) => ({ ...c, elaboratedAt: e.target.value || null }))
                          }
                        />
                      </td>
                      <td className="w-1/3 border border-zinc-800 p-2 align-top">
                        <div className="font-semibold mb-1">Revisado:</div>
                        <input
                          className="w-full border-0 border-b border-zinc-200 focus:outline-none bg-transparent"
                          value={reviewedBy}
                          onChange={(e) => setReviewedBy(e.target.value)}
                        />
                        <div className="mt-2 text-zinc-500">Data:</div>
                        <input
                          type="date"
                          className="w-full border border-zinc-200 rounded px-1 py-0.5"
                          value={content.reviewedAt?.slice(0, 10) || ''}
                          onChange={(e) =>
                            setContent((c) => ({ ...c, reviewedAt: e.target.value || null }))
                          }
                        />
                      </td>
                      <td className="border border-zinc-800 p-2 align-top">
                        <div className="font-semibold mb-1">Aprovado:</div>
                        <input
                          className="w-full border-0 border-b border-zinc-200 focus:outline-none bg-transparent"
                          value={approvedBy}
                          onChange={(e) => setApprovedBy(e.target.value)}
                        />
                        <div className="mt-2 text-zinc-500">Data:</div>
                        <input
                          type="date"
                          className="w-full border border-zinc-200 rounded px-1 py-0.5"
                          value={content.approvedAt?.slice(0, 10) || ''}
                          onChange={(e) =>
                            setContent((c) => ({ ...c, approvedAt: e.target.value || null }))
                          }
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {!isNew && (
                <label className="block text-sm bg-white rounded-xl border border-zinc-200 p-3">
                  <span className="text-zinc-600">Resumo da mudança (publicar / revalidar)</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                    value={changeSummary}
                    onChange={(e) => setChangeSummary(e.target.value)}
                    placeholder="Ex.: Revalidação anual / Ajuste no procedimento"
                  />
                </label>
              )}
            </>
          )}

          {tab === 'historico' && (
            <div className="space-y-2">
              {versions.length === 0 && (
                <p className="text-sm text-zinc-500">Nenhuma versão registrada.</p>
              )}
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 flex items-center justify-between gap-2"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      Rev. {v.revision} · {v.changeKind}
                    </p>
                    <p className="text-xs text-zinc-500">
                      Vigência {fmtDate(v.effectiveDate)} · próxima {fmtDate(v.nextReviewDate)}
                    </p>
                    {v.changeSummary && (
                      <p className="text-xs text-zinc-600 mt-0.5">{v.changeSummary}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded-lg border border-zinc-300 hover:bg-zinc-50"
                    onClick={() => openPrint(v)}
                  >
                    Imprimir
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="border-t border-zinc-200 px-4 py-3 flex flex-wrap gap-2 justify-end bg-white">
          {!isNew && (
            <button
              type="button"
              onClick={() => openPrint(null)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 text-sm"
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </button>
          )}
          <button
            type="button"
            disabled={busy || !title.trim() || (isNew && !code.trim())}
            onClick={() => void saveDraft()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 text-sm disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
          {!isNew && (isDraft || isPublished) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void publish()}
              className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-sm disabled:opacity-50"
            >
              {isDraft ? 'Publicar' : 'Publicar revisão'}
            </button>
          )}
          {isPublished && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void revalidate()}
              className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm disabled:opacity-50"
            >
              Revalidar
            </button>
          )}
        </footer>
      </aside>

      {printVersion && (
        <div className="pop-print-root">
          <style>{`
            @media screen {
              .pop-print-root { display: none; }
            }
            @media print {
              body * { visibility: hidden !important; }
              .pop-print-root, .pop-print-root * { visibility: visible !important; }
              .pop-print-root {
                display: block !important;
                position: absolute;
                left: 0; top: 0; width: 100%;
                padding: 12mm;
                font-family: "Times New Roman", Times, serif;
                color: #000;
                background: #fff;
              }
            }
          `}</style>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}>
            <tbody>
              <tr>
                <td style={{ width: '22%', border: '1px solid #000', padding: 8, textAlign: 'center' }}>
                  {logoSrc ? (
                    <img src={logoSrc} alt="Logo" style={{ maxHeight: 56, maxWidth: '100%' }} />
                  ) : (
                    <span style={{ fontSize: 11 }}>LOGO</span>
                  )}
                </td>
                <td style={{ border: '1px solid #000', padding: 8, textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Procedimento Operacional Padrão</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{title || document?.title}</div>
                </td>
                <td style={{ width: '28%', border: '1px solid #000', padding: 6, fontSize: 11 }}>
                  <div>
                    <strong>Código:</strong> {code || document?.code}
                  </div>
                  <div>
                    <strong>Revisão:</strong> {String(printVersion.revision).padStart(2, '0')}
                  </div>
                  <div>
                    <strong>Data:</strong> {fmtDate(printVersion.effectiveDate)}
                  </div>
                  <div>
                    <strong>Setor:</strong> {sectorName}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div
            style={{
              borderLeft: '1px solid #000',
              borderRight: '1px solid #000',
              borderBottom: '1px solid #000',
              padding: 12,
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              minHeight: 360,
              lineHeight: 1.45,
            }}
          >
            {printVersion.content?.body || '—'}
          </div>

          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              border: '1px solid #000',
              fontSize: 11,
            }}
          >
            <tbody>
              <tr>
                <td style={{ border: '1px solid #000', padding: 8, width: '33%' }}>
                  <div>
                    <strong>Elaborado:</strong>
                  </div>
                  <div>{printVersion.elaboratedBy || elaboratedBy || '—'}</div>
                  <div style={{ marginTop: 6 }}>
                    Data: {fmtDate(printVersion.content?.elaboratedAt || content.elaboratedAt)}
                  </div>
                </td>
                <td style={{ border: '1px solid #000', padding: 8, width: '33%' }}>
                  <div>
                    <strong>Revisado:</strong>
                  </div>
                  <div>{printVersion.reviewedBy || reviewedBy || '—'}</div>
                  <div style={{ marginTop: 6 }}>
                    Data: {fmtDate(printVersion.content?.reviewedAt || content.reviewedAt)}
                  </div>
                </td>
                <td style={{ border: '1px solid #000', padding: 8 }}>
                  <div>
                    <strong>Aprovado:</strong>
                  </div>
                  <div>{printVersion.approvedBy || approvedBy || '—'}</div>
                  <div style={{ marginTop: 6 }}>
                    Data: {fmtDate(printVersion.content?.approvedAt || content.approvedAt)}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
